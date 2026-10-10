import { supabase } from '../../supabaseClient';
import {
  BPL_EVENTS_TABLE,
  BPL_OVERVIEW_COLUMNS,
  buildBplSerialIndex,
  buildBplSerialSummary,
  normalizeBplEvent,
  normalizeBplSerial,
  type BplEvent,
  type BplEventRow,
  type BplSerialSummary,
} from './bplEvents';
import {
  BPL_REACTION_CALCULATION_VERSION,
  BPL_REACTION_CALCULATION_VERSION_PATH,
  BPL_REACTION_CURVE_EVENT_TYPE,
  BPL_REACTION_INDEX_COLUMNS,
  type BplReactionIndexRow,
} from './bplReactionCurves';

const DAY_MS = 24 * 60 * 60 * 1000;

const sinceIso = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

export interface BplOverviewLoadResult {
  rows: BplEventRow[];
  error: string | null;
}

/**
 * Corte global sin payload para colorear el catálogo de equipos.
 * La ventana limita filas, no es paginación completa: un equipo muy activo
 * puede tener más historia de la que cabe aquí, pero su estado vigente sí entra.
 */
export async function loadBplOverview({ sinceDays = 90, limit = 5000 }: { sinceDays?: number; limit?: number } = {}): Promise<BplOverviewLoadResult> {
  const { data, error } = await supabase
    .from(BPL_EVENTS_TABLE)
    .select(BPL_OVERVIEW_COLUMNS)
    .neq('event_type', BPL_REACTION_CURVE_EVENT_TYPE)
    .gte('occurred_at', sinceIso(sinceDays))
    .order('occurred_at', { ascending: false })
    .range(0, Math.max(0, limit - 1));

  if (error) {
    return { rows: [], error: error.message };
  }

  return { rows: (data || []) as unknown as BplEventRow[], error: null };
}

export interface BplSerialLoadResult {
  summary: BplSerialSummary | null;
  events: BplEvent[];
  error: string | null;
}

const serialCandidates = (serial: string) => {
  const trimmed = serial.trim();
  const normalized = normalizeBplSerial(serial);
  return Array.from(new Set([trimmed, normalized, normalized.toLowerCase()].filter(Boolean)));
};

/** Detalle con payload para una sola serie; acepta la serie con o sin espacios. Excluye curvas de reacción. */
export async function loadBplSerialEvents(
  serial: string,
  { sinceDays = 180, limit = 600 }: { sinceDays?: number; limit?: number } = {},
): Promise<BplSerialLoadResult> {
  const normalized = normalizeBplSerial(serial);
  if (!normalized) {
    return { summary: null, events: [], error: null };
  }

  const candidates = serialCandidates(serial);
  const { data, error } = await supabase
    .from(BPL_EVENTS_TABLE)
    .select('*')
    .neq('event_type', BPL_REACTION_CURVE_EVENT_TYPE)
    .in('effective_equipment_serial', candidates)
    .gte('occurred_at', sinceIso(sinceDays))
    .order('occurred_at', { ascending: false })
    .range(0, Math.max(0, limit - 1));

  if (error) {
    return { summary: null, events: [], error: error.message };
  }

  const events = ((data || []) as unknown as BplEventRow[])
    .map(normalizeBplEvent)
    .filter((event): event is BplEvent => Boolean(event));

  return {
    summary: events.length ? buildBplSerialSummary(normalized, events) : null,
    events,
    error: null,
  };
}

export const indexBplOverview = (rows: BplEventRow[]) => buildBplSerialIndex(rows);

export interface BplReactionIndexLoadResult {
  rows: BplReactionIndexRow[];
  error: string | null;
}

/**
 * Índice de curvas de reacción sin puntos: las claves de sesión, orden y réplica se
 * extraen del JSON en la propia consulta para no descargar el payload completo.
 */
export async function loadBplReactionCurveIndex(
  serial: string,
  { sinceDays = 45, limit = 2000 }: { sinceDays?: number; limit?: number } = {},
): Promise<BplReactionIndexLoadResult> {
  const candidates = serialCandidates(serial);
  if (!candidates.length) {
    return { rows: [], error: null };
  }

  const { data, error } = await supabase
    .from(BPL_EVENTS_TABLE)
    .select(BPL_REACTION_INDEX_COLUMNS)
    .eq('event_type', BPL_REACTION_CURVE_EVENT_TYPE)
    // Solo la versión de cálculo vigente; las filas antiguas traían absorbancias mal calculadas.
    .eq(BPL_REACTION_CALCULATION_VERSION_PATH, BPL_REACTION_CALCULATION_VERSION)
    .in('effective_equipment_serial', candidates)
    .gte('occurred_at', sinceIso(sinceDays))
    .order('occurred_at', { ascending: false })
    .range(0, Math.max(0, limit - 1));

  if (error) {
    return { rows: [], error: error.message };
  }

  return { rows: (data || []) as unknown as BplReactionIndexRow[], error: null };
}

export interface BplReactionPayloadLoadResult {
  rows: Array<{ id: string; payload: unknown }>;
  error: string | null;
}

const PAYLOAD_CHUNK_SIZE = 60;

/** Payload completo (puntos y lecturas crudas) solo de las réplicas pedidas, por lotes. */
export async function loadBplReactionCurvePayloads(ids: string[]): Promise<BplReactionPayloadLoadResult> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const rows: Array<{ id: string; payload: unknown }> = [];
  for (let index = 0; index < unique.length; index += PAYLOAD_CHUNK_SIZE) {
    const chunk = unique.slice(index, index + PAYLOAD_CHUNK_SIZE);
    const { data, error } = await supabase.from(BPL_EVENTS_TABLE).select('id,payload').in('id', chunk);
    if (error) {
      return { rows, error: error.message };
    }
    ((data || []) as Array<{ id: number | string; payload: unknown }>).forEach((row) => {
      rows.push({ id: String(row.id), payload: row.payload });
    });
  }
  return { rows, error: null };
}
