import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { BPL_EVENTS_TABLE } from './bplEvents';
import { loadBplOverview } from './bplEventsData';
import { monitorLiveStore } from './monitorLiveStore';
import {
  buildSnapshotSignature,
  type CurrentEquipmentErrorStateRow,
  type EquipmentErrorRow,
  type EquipmentMapLocationRow,
  type EquipmentRow,
  type MonitoringSnapshot,
  type ReagentConsumptionSummaryRow,
  type RotorSummaryRow,
  type SupplySnapshotRow,
} from './monitoringDerivations';

// Refresco del navegador cada 30 s, independiente de los intervalos del agente de Windows.
export const REFRESH_INTERVAL_MS = 30000;
// Los avisos Realtime se agrupan antes de recargar: una ráfaga del monitor produce una sola lectura.
const REALTIME_DEBOUNCE_MS = 1500;
// Conjunto frío (catálogo, geocodificación, consumos mensuales, rotores, BPL): cada 5 min o por su aviso.
const COLD_INTERVAL_MS = 5 * 60 * 1000;
const HOT_TABLES = new Set(['monitoreo_errores_equipos', 'estado_insumos_equipo_actual']);
const REALTIME_TABLES = ['monitoreo_errores_equipos', 'estado_insumos_equipo_actual', 'consumo_reactivos_hora', 'consumo_rotores_mensual', BPL_EVENTS_TABLE, 'equipos'];

interface ColdSlice {
  fetchedAt: number;
  equipments: EquipmentRow[];
  reagentSummaries: ReagentConsumptionSummaryRow[];
  rotors: RotorSummaryRow[];
  bplRows: MonitoringSnapshot['bplRows'];
}

/** Campos geográficos ya cruzados de un corte frío anterior. */
const pickGeo = (row: EquipmentRow) => ({
  geo_locality_cache_key: row.geo_locality_cache_key,
  geo_latitude: row.geo_latitude,
  geo_longitude: row.geo_longitude,
  geo_boundingbox: row.geo_boundingbox,
  geo_precision: row.geo_precision,
  geo_display_name: row.geo_display_name,
});

export interface MonitoringSnapshotState {
  snapshot: MonitoringSnapshot | null;
  loading: boolean;
  loadError: string | null;
  loadNotice: string | null;
  setLoadNotice: (notice: string | null) => void;
  /** Recarga manual: fuerza también el conjunto frío. */
  refresh: () => Promise<void>;
}

/**
 * Carga el corte de monitoreo en dos conjuntos: caliente (estado de errores, insumos, historial)
 * cada 30 s y frío (catálogo, ubicaciones, consumos, rotores, BPL) cada 5 min o cuando llega su aviso.
 * Si nada cambió, el corte anterior se conserva con su identidad: memos, globo y visor no se rehacen.
 */
export function useMonitoringSnapshot(): MonitoringSnapshotState {
  const [snapshot, setSnapshot] = useState<MonitoringSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadNotice, setLoadNotice] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const signatureRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const coldDirtyRef = useRef(true);
  const coldRef = useRef<ColdSlice | null>(null);
  const timerRef = useRef<number | null>(null);
  const scheduleRef = useRef<(delayMs: number, forceCold?: boolean) => void>(() => {});

  const load = useCallback(async (mode: 'initial' | 'refresh', forceCold: boolean) => {
    if (inFlightRef.current) {
      dirtyRef.current = true;
      if (forceCold) coldDirtyRef.current = true;
      return inFlightRef.current;
    }

    // `loading` nace en true: la carga inicial no necesita fijarlo y el refresco solo marca el store.
    monitorLiveStore.publish({ refreshing: mode === 'refresh' });

    const task = (async () => {
      dirtyRef.current = false;
      const now = Date.now();
      const needCold = forceCold || coldDirtyRef.current || !coldRef.current || now - coldRef.current.fetchedAt > COLD_INTERVAL_MS;
      // La bandera se consume al emitir la lectura fría; un aviso que llegue durante el vuelo la vuelve a levantar.
      if (needCold) coldDirtyRef.current = false;

      const hotPromise = Promise.all([
        supabase
          .from('estado_errores_equipo_actual')
          .select('numero_serie,modelo,monitor_name,machine_name,estado_actual,tipo_mensaje,codigo_estado,descripcion_estado,errores_activos,error_principal_codigo,error_principal_descripcion,error_principal_seccion,last_event_at,resolved_at,updated_at')
          .range(0, 1999),
        supabase
          .from('monitoreo_errores_equipos')
          .select('id,numero_serie,modelo,codigo_error,descripcion_error,seccion_error,tipo_mensaje,detected_at,created_at,monitor_name,machine_name')
          .order('detected_at', { ascending: false })
          .order('id', { ascending: false })
          .range(0, 4999),
        supabase
          .from('estado_insumos_equipo_actual')
          .select('numero_serie,updated_at,ultimo_evento_consumo_at,modelo,monitor_name,machine_name,pack_ise_sn,ref_electrode,na_electrode,k_electrode,cl_electrode,li_electrode')
          .order('updated_at', { ascending: false })
          .range(0, 999),
      ]);

      const coldPromise = needCold
        ? Promise.all([
            supabase
              .from('equipos')
              .select('id,numero_serie,modelo,pais,estado,ciudad,municipio,colonia,direccion,codigo_postal,fecha_fin,supremo_id,supremo_alias,supremo_enabled,clientes(razon_social)')
              .order('creado_en', { ascending: false })
              .range(0, 1999),
            supabase
              .from('v_equipment_map_locations')
              .select('equipment_id,locality_cache_key,geo_latitude,geo_longitude,geo_boundingbox,geo_precision,geo_display_name')
              .range(0, 1999),
            supabase
              .from('v_equipment_reagent_consumption_summary')
              .select('numero_serie,bucket_month,modelo,modelo_familia,pruebas_registradas,muestras_paciente,blancos,calibraciones,controles,pruebas_distintas,pruebas_distintas_con_precio,pruebas_distintas_sin_precio,pruebas_con_precio,pruebas_sin_precio,valor_estimado_total_sin_iva,valor_estimado_total_con_iva,valor_estimado_pacientes_sin_iva,valor_estimado_pacientes_con_iva,valor_estimado_total_sin_iva_min,valor_estimado_total_sin_iva_max,valor_estimado_total_con_iva_min,valor_estimado_total_con_iva_max,first_event_at,last_event_at')
              .range(0, 1999),
            supabase
              .from('consumo_rotores_mensual')
              .select('numero_serie,bucket_month,rotor_change_count,last_change_at,updated_at')
              .order('updated_at', { ascending: false })
              .range(0, 1999),
            loadBplOverview(),
          ])
        : null;

      const [currentStateResponse, errorsResponse, suppliesResponse] = await hotPromise;
      const coldResponses = coldPromise ? await coldPromise : null;
      const notices: string[] = [];

      if (errorsResponse.error) {
        throw new Error(`No fue posible leer monitoreo de errores: ${errorsResponse.error.message}`);
      }

      let cold = coldRef.current;
      if (coldResponses) {
        const [equipmentsResponse, locationsResponse, reagentSummaryResponse, rotorsResponse, bplOverviewResponse] = coldResponses;
        if (equipmentsResponse.error) {
          throw new Error(`No fue posible leer equipos: ${equipmentsResponse.error.message}`);
        }
        const coldNotices: string[] = [];
        const previous = coldRef.current;
        if (locationsResponse.error) coldNotices.push('La geocodificación precisa no respondió y el globo cayó al modo estatal de respaldo.');
        if (reagentSummaryResponse.error) coldNotices.push('El resumen de reactivos no respondió y se omitió en este corte.');
        if (rotorsResponse.error) coldNotices.push('El resumen de rotores no respondió y quedó fuera de este corte.');
        if (bplOverviewResponse.error) coldNotices.push('La evidencia BPL (blancos, calibraciones y controles) no respondió y quedó fuera de este corte.');
        const coldDegraded = coldNotices.length > 0;

        // Une la ubicación por ID del catálogo antes del cruce de telemetría por serie. Si la geocodificación
        // falló, se reutiliza la del corte frío anterior para no degradar el globo durante el reintento.
        const previousLocations = new Map((previous?.equipments || []).map((row) => [row.id, row] as const));
        const locationIndex = new Map(((locationsResponse.data || []) as EquipmentMapLocationRow[]).map((row) => [row.equipment_id, row] as const));
        const equipments = ((equipmentsResponse.data || []) as EquipmentRow[]).map((equipment) => {
          const location = locationIndex.get(equipment.id);
          if (!location) {
            const known = locationsResponse.error ? previousLocations.get(equipment.id) : undefined;
            return known?.geo_latitude != null ? { ...equipment, ...pickGeo(known) } : equipment;
          }
          return {
            ...equipment,
            geo_locality_cache_key: location.locality_cache_key,
            geo_latitude: location.geo_latitude,
            geo_longitude: location.geo_longitude,
            geo_boundingbox: location.geo_boundingbox,
            geo_precision: location.geo_precision,
            geo_display_name: location.geo_display_name,
          };
        });
        cold = {
          fetchedAt: now,
          equipments,
          reagentSummaries: reagentSummaryResponse.error
            ? previous?.reagentSummaries || []
            : ((reagentSummaryResponse.data || []) as ReagentConsumptionSummaryRow[]).filter((row) => row.numero_serie),
          rotors: rotorsResponse.error ? previous?.rotors || [] : ((rotorsResponse.data || []) as RotorSummaryRow[]).filter((row) => row.numero_serie),
          bplRows: bplOverviewResponse.error ? previous?.bplRows || [] : bplOverviewResponse.rows,
        };
        coldRef.current = cold;
        // Con una fuente fría caída se reintenta en el siguiente tick en lugar de esperar 5 minutos
        // (sin pisar una bandera levantada por un aviso recibido durante la lectura).
        if (coldDegraded) coldDirtyRef.current = true;
        notices.push(...coldNotices);
      }
      if (!cold) {
        throw new Error('No fue posible leer el catálogo de equipos.');
      }

      if (currentStateResponse.error) notices.push('El estado actual de errores no respondió y se usó el historial como respaldo.');
      if (suppliesResponse.error) notices.push('La telemetría de insumos no respondió y quedó fuera de este corte.');

      if (!mountedRef.current) return;

      const next: Omit<MonitoringSnapshot, 'refreshedAt'> = {
        equipments: cold.equipments,
        errors: (errorsResponse.data || []) as EquipmentErrorRow[],
        currentErrorStates: (currentStateResponse.data || []) as CurrentEquipmentErrorStateRow[],
        supplies: ((suppliesResponse.data || []) as SupplySnapshotRow[]).filter((row) => row.numero_serie),
        reagentSummaries: cold.reagentSummaries,
        rotors: cold.rotors,
        bplRows: cold.bplRows,
      };
      const signature = buildSnapshotSignature(next);
      setLoadError(null);
      if (notices.length) setLoadNotice(notices.join(' '));
      // Fecha de lectura en el navegador, distinta de la fecha del último evento del analizador.
      const refreshedAt = new Date().toISOString();
      monitorLiveStore.publish({ refreshedAt });
      if (mode === 'refresh' && signatureRef.current === signature) {
        // Nada cambió: se conserva el corte anterior y con él la identidad de memos, globo y modelo 3D.
        return;
      }
      signatureRef.current = signature;
      const publish = () => setSnapshot({ ...next, refreshedAt });
      if (mode === 'initial') publish();
      else startTransition(publish);
    })()
      .catch((error: unknown) => {
        if (forceCold) coldDirtyRef.current = true;
        if (!mountedRef.current) return;
        setLoadError(error instanceof Error ? error.message : 'No fue posible cargar el monitoreo de equipos.');
      })
      .finally(() => {
        inFlightRef.current = null;
        if (!mountedRef.current) return;
        monitorLiveStore.publish({ refreshing: false });
        setLoading(false);
        // Un aviso llegado durante la carga no se pierde: se programa una recarga más.
        if (dirtyRef.current) {
          dirtyRef.current = false;
          scheduleRef.current(0);
        }
      });

    inFlightRef.current = task;
    return task;
  }, []);

  /** Agrupa recargas: una sola lectura por ráfaga de avisos y ninguna mientras la pestaña está oculta. */
  const scheduleRefresh = useCallback((delayMs: number, forceCold = false) => {
    if (forceCold) coldDirtyRef.current = true;
    if (typeof document !== 'undefined' && document.hidden) {
      dirtyRef.current = true;
      return;
    }
    if (inFlightRef.current) {
      dirtyRef.current = true;
      return;
    }
    if (timerRef.current !== null) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void load('refresh', false);
    }, delayMs);
  }, [load]);

  // La carga en vuelo lee el planificador por ref para no formar un ciclo entre ambos callbacks.
  useEffect(() => {
    scheduleRef.current = scheduleRefresh;
  }, [scheduleRefresh]);

  useEffect(() => {
    mountedRef.current = true;
    void load('initial', true);

    const onRealtime = (table: string) => () => {
      const live = monitorLiveStore.get();
      monitorLiveStore.publish({
        lastRealtimeEventAt: new Date().toISOString(),
        bplVersion: table === BPL_EVENTS_TABLE ? live.bplVersion + 1 : live.bplVersion,
      });
      scheduleRefresh(REALTIME_DEBOUNCE_MS, !HOT_TABLES.has(table));
    };
    let channel = supabase.channel('equipment-monitoring-live');
    REALTIME_TABLES.forEach((table) => {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, onRealtime(table));
    });
    channel.subscribe();

    const timer = window.setInterval(() => scheduleRefresh(0), REFRESH_INTERVAL_MS);
    // Al volver a la pestaña se recupera lo que se omitió mientras estaba oculta.
    const onVisibility = () => {
      if (!document.hidden && dirtyRef.current) {
        dirtyRef.current = false;
        scheduleRefresh(0);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      document.removeEventListener('visibilitychange', onVisibility);
      void supabase.removeChannel(channel);
    };
  }, [load, scheduleRefresh]);

  const refresh = useCallback(() => load('refresh', true), [load]);

  return { snapshot, loading, loadError, loadNotice, setLoadNotice, refresh };
}
