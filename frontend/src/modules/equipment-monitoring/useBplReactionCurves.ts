import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadBplReactionCurveIndex, loadBplReactionCurvePayloads } from './bplEventsData';
import {
  groupReactionReplicates,
  latestReactionGroupByTest,
  mergeReplicatePoints,
  parseReactionCurvePayload,
  prepareReactionReplicates,
  type BplReactionGroup,
  type BplReactionLoadedPayload,
  type BplReactionReplicate,
} from './bplReactionCurves';

interface ReactionIndexState {
  serial: string | null;
  refreshKey: string | null;
  replicates: BplReactionReplicate[];
  error: string | null;
}

/** Puntos descargados de UNA serie: al cambiar de equipo el mapa anterior deja de leerse y se libera. */
interface ReactionPointsState {
  serial: string | null;
  byId: ReadonlyMap<string, BplReactionLoadedPayload>;
  error: string | null;
}

export interface BplReactionCurvesState {
  /** Reacciones (sesión + orden) con sus réplicas, de la más reciente a la más antigua. */
  groups: BplReactionGroup[];
  latestByTest: Map<string, BplReactionGroup>;
  loading: boolean;
  loadingPoints: boolean;
  error: string | null;
  /** Descarga los puntos de una reacción si aún no están en memoria. */
  ensureGroupPoints: (group: BplReactionGroup) => Promise<void>;
}

const EMPTY_STATE: ReactionIndexState = { serial: null, refreshKey: null, replicates: [], error: null };
const EMPTY_POINTS: ReadonlyMap<string, BplReactionLoadedPayload> = new Map();
const EMPTY_POINTS_STATE: ReactionPointsState = { serial: null, byId: EMPTY_POINTS, error: null };
const AUTO_POINTS_GROUP_LIMIT = 16;

/**
 * Índice de curvas por serie con descarga perezosa de puntos. El estado guarda la serie
 * a la que pertenece, así que un cambio de equipo se refleja de inmediato sin vaciar el
 * estado dentro del efecto; el refresco del corte conserva el render anterior. Los puntos
 * y los ids pendientes también van ligados a la serie: cambiar de equipo los reinicia.
 */
export function useBplReactionCurves(serial: string | null, refreshKey: string | null = null): BplReactionCurvesState {
  const [indexState, setIndexState] = useState<ReactionIndexState>(EMPTY_STATE);
  const [pointsState, setPointsState] = useState<ReactionPointsState>(EMPTY_POINTS_STATE);
  const [pendingCount, setPendingCount] = useState(0);
  const pendingRef = useRef<{ serial: string | null; ids: Set<string> }>({ serial: null, ids: new Set() });
  const serialRef = useRef(serial);

  useEffect(() => {
    serialRef.current = serial;
  }, [serial]);

  useEffect(() => {
    if (!serial) return;
    let cancelled = false;
    void loadBplReactionCurveIndex(serial).then((result) => {
      if (cancelled) return;
      // La consulta ya filtra por versión; el cliente repite el filtro y deduplica por si llegan repetidas.
      const replicates: BplReactionReplicate[] = prepareReactionReplicates(result.rows);
      setIndexState({ serial, refreshKey, replicates, error: result.error });
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, serial]);

  const indexMatchesSerial = Boolean(serial) && indexState.serial === serial;
  const pointsMatchSerial = Boolean(serial) && pointsState.serial === serial;
  const pointsById = pointsMatchSerial ? pointsState.byId : EMPTY_POINTS;
  const replicates = useMemo(
    () => (indexMatchesSerial ? mergeReplicatePoints(indexState.replicates, pointsById) : []),
    [indexMatchesSerial, indexState.replicates, pointsById],
  );
  const groups = useMemo(() => groupReactionReplicates(replicates), [replicates]);
  const latestByTest = useMemo(() => latestReactionGroupByTest(groups), [groups]);

  const ensureIds = useCallback(
    async (ids: string[]) => {
      if (!serial) return;
      // Los ids en vuelo pertenecen a una serie: con otra serie se parte de cero y no bloquean la descarga nueva.
      if (pendingRef.current.serial !== serial) pendingRef.current = { serial, ids: new Set() };
      const pending = pendingRef.current.ids;
      const missing = ids.filter((id) => !pending.has(id));
      if (!missing.length) return;
      missing.forEach((id) => pending.add(id));
      setPendingCount((current) => current + missing.length);
      try {
        const result = await loadBplReactionCurvePayloads(missing);
        // La respuesta de una serie que ya no está seleccionada se descarta sin tocar el estado.
        if (serialRef.current !== serial) return;
        if (result.error) {
          // Se liberan los ids para poder reintentar con la siguiente selección.
          missing.forEach((id) => pending.delete(id));
          setPointsState((current) => ({
            serial,
            byId: current.serial === serial ? current.byId : EMPTY_POINTS,
            error: `No fue posible leer los puntos de la curva: ${result.error}`,
          }));
          return;
        }
        const parsed = new Map<string, BplReactionLoadedPayload>();
        result.rows.forEach((row) => {
          const curve = parseReactionCurvePayload(row.payload);
          parsed.set(row.id, { points: curve?.points || [], execution: curve?.execution || null });
        });
        // Una réplica sin payload legible queda con lista vacía para no reintentar en bucle.
        missing.forEach((id) => {
          if (!parsed.has(id)) parsed.set(id, { points: [], execution: null });
        });
        setPointsState((current) => {
          const next = new Map(current.serial === serial ? current.byId : EMPTY_POINTS);
          parsed.forEach((points, id) => next.set(id, points));
          return { serial, byId: next, error: null };
        });
      } finally {
        setPendingCount((current) => Math.max(0, current - missing.length));
      }
    },
    [serial],
  );

  const ensureGroupPoints = useCallback(
    async (group: BplReactionGroup) => {
      await ensureIds(group.replicates.filter((replicate) => replicate.points === null).map((replicate) => replicate.id));
    },
    [ensureIds],
  );

  useEffect(() => {
    // Precarga la última reacción de cada prueba para dibujar las miniaturas en las tarjetas.
    if (!indexMatchesSerial) return;
    const ids = Array.from(latestByTest.values())
      .slice(0, AUTO_POINTS_GROUP_LIMIT)
      .flatMap((group) => group.replicates.filter((replicate) => replicate.points === null).map((replicate) => replicate.id));
    if (!ids.length) return;
    void ensureIds(ids);
  }, [ensureIds, indexMatchesSerial, latestByTest]);

  const loading = Boolean(serial) && !indexMatchesSerial;
  const loadingPoints = pendingCount > 0;
  const error = indexMatchesSerial ? indexState.error || (pointsMatchSerial ? pointsState.error : null) : null;

  // Objeto estable mientras nada cambie: así `React.memo` en la sección BPL evita renders por tick.
  return useMemo(
    () => ({ groups, latestByTest, loading, loadingPoints, error, ensureGroupPoints }),
    [ensureGroupPoints, error, groups, latestByTest, loading, loadingPoints],
  );
}
