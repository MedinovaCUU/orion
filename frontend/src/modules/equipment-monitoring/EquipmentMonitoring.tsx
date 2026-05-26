import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import BrandLockup from '../../components/BrandLockup';
import { getPublicAssetUrl } from '../../components/publicAssetUrl';
import { createSupremoLaunchSession, getSupremoLaunchDisabledMessage, isSupremoLaunchEnabled } from '../../components/supremoApi';
import { supabase } from '../../supabaseClient';
import {
  getNormalizedStateLabel,
  resolveEquipmentMapPoint,
  type EquipmentLocationInput,
} from './mexicoGeo';
import './equipmentMonitoring.css';

type EquipmentHealthStatus = 'ok' | 'warning' | 'fatal';
type EquipmentFilter = 'all' | 'fatal' | 'warning' | 'ok' | 'unmapped';
type NumericLike = number | string | null;

interface EquipmentPointOverride {
  x: number;
  y: number;
}

interface MapPanOffset {
  x: number;
  y: number;
}

interface RemoteLaunchFeedback {
  tone: 'success' | 'warning' | 'error';
  message: string;
}

interface ClientRelation {
  razon_social: string | null;
}

interface EquipmentRow {
  id: string;
  numero_serie: string | null;
  modelo: string | null;
  pais: string | null;
  estado: string | null;
  ciudad: string | null;
  municipio: string | null;
  colonia: string | null;
  direccion: string | null;
  codigo_postal: string | null;
  fecha_fin: string | null;
  clientes: ClientRelation | ClientRelation[] | null;
  geo_locality_cache_key?: string | null;
  geo_latitude?: number | null;
  geo_longitude?: number | null;
  geo_boundingbox?: unknown;
  geo_precision?: string | null;
  geo_display_name?: string | null;
}

interface EquipmentMapLocationRow {
  equipment_id: string;
  locality_cache_key: string | null;
  geo_latitude: number | null;
  geo_longitude: number | null;
  geo_boundingbox: unknown;
  geo_precision: string | null;
  geo_display_name: string | null;
}

interface EquipmentErrorRow {
  id: number;
  numero_serie: string;
  modelo: string | null;
  codigo_error: string | null;
  descripcion_error: string | null;
  seccion_error: string | null;
  tipo_mensaje: string | null;
  detected_at: string | null;
  created_at: string | null;
  monitor_name: string | null;
  machine_name: string | null;
}

interface CurrentEquipmentErrorDetail {
  codigo_error: string | null;
  descripcion_error: string | null;
  seccion_error: string | null;
  tipo_mensaje: string | null;
}

interface CurrentEquipmentErrorStateRow {
  numero_serie: string;
  modelo: string | null;
  monitor_name: string | null;
  machine_name: string | null;
  estado_actual: string | null;
  tipo_mensaje: string | null;
  errores_activos: CurrentEquipmentErrorDetail[] | null;
  error_principal_codigo: string | null;
  error_principal_descripcion: string | null;
  error_principal_seccion: string | null;
  last_event_at: string | null;
  resolved_at: string | null;
  updated_at: string | null;
}

interface SupplySnapshotRow {
  numero_serie: string;
  updated_at: string;
  ultimo_evento_consumo_at: string | null;
  modelo: string | null;
  monitor_name: string | null;
  machine_name: string | null;
  pack_ise_sn: string | null;
  ref_electrode: string | null;
  na_electrode: string | null;
  k_electrode: string | null;
  cl_electrode: string | null;
  li_electrode: string | null;
}

interface RotorSummaryRow {
  numero_serie: string;
  bucket_month: string;
  rotor_change_count: number;
  last_change_at: string | null;
  updated_at: string;
}

interface ReagentConsumptionSummaryRow {
  numero_serie: string;
  modelo: string | null;
  modelo_familia: string | null;
  pruebas_registradas: NumericLike;
  muestras_paciente: NumericLike;
  blancos: NumericLike;
  calibraciones: NumericLike;
  controles: NumericLike;
  pruebas_distintas: NumericLike;
  pruebas_distintas_con_precio: NumericLike;
  pruebas_distintas_sin_precio: NumericLike;
  pruebas_con_precio: NumericLike;
  pruebas_sin_precio: NumericLike;
  valor_estimado_total_sin_iva: NumericLike;
  valor_estimado_total_con_iva: NumericLike;
  valor_estimado_pacientes_sin_iva: NumericLike;
  valor_estimado_pacientes_con_iva: NumericLike;
  valor_estimado_total_sin_iva_min: NumericLike;
  valor_estimado_total_sin_iva_max: NumericLike;
  valor_estimado_total_con_iva_min: NumericLike;
  valor_estimado_total_con_iva_max: NumericLike;
  first_event_at: string | null;
  last_event_at: string | null;
}

interface ReagentConsumptionDetailRow {
  numero_serie: string;
  modelo: string | null;
  modelo_familia: string | null;
  test_name: string;
  test_name_normalizado: string | null;
  descripcion_catalogo_normalizada: string | null;
  reactivo_codigo_referencia: string | null;
  reactivo_descripcion_referencia: string | null;
  presentacion_referencia: string | null;
  rendimiento_referencia: NumericLike;
  rendimiento_total: NumericLike;
  rendimiento_util: NumericLike;
  rendimiento_util_seguro: NumericLike;
  presentaciones_catalogo: NumericLike;
  match_source: string | null;
  tiene_precio: boolean | null;
  pruebas_registradas: NumericLike;
  muestras_paciente: NumericLike;
  blancos: NumericLike;
  calibraciones: NumericLike;
  controles: NumericLike;
  first_event_at: string | null;
  last_event_at: string | null;
  costo_prueba_referencia_con_iva: NumericLike;
  valor_estimado_total_con_iva: NumericLike;
  valor_estimado_pacientes_con_iva: NumericLike;
  valor_estimado_total_con_iva_min: NumericLike;
  valor_estimado_total_con_iva_max: NumericLike;
}

interface MonitoringSnapshot {
  equipments: EquipmentRow[];
  errors: EquipmentErrorRow[];
  currentErrorStates: CurrentEquipmentErrorStateRow[];
  supplies: SupplySnapshotRow[];
  rotors: RotorSummaryRow[];
  reagentSummaries: ReagentConsumptionSummaryRow[];
  mapOverrides: EquipmentMapOverrideRow[];
  refreshedAt: string;
}

interface EquipmentMapOverrideRow {
  equipment_id: string;
  x_percent: number;
  y_percent: number;
  updated_at: string | null;
}

interface IndexedErrorState {
  status: EquipmentHealthStatus;
  currentRows: EquipmentErrorRow[];
  recentRows: EquipmentErrorRow[];
  lastDetectedAt: string | null;
}

interface IndexedCurrentErrorState {
  status: EquipmentHealthStatus;
  currentRows: EquipmentErrorRow[];
  lastEventAt: string | null;
  model: string | null;
}

interface MonitoringEquipment {
  id: string;
  serial: string;
  clientName: string;
  model: string;
  status: EquipmentHealthStatus;
  mapPoint: { x: number; y: number } | null;
  normalizedState: string | null;
  city: string | null;
  municipality: string | null;
  address: string | null;
  postalCode: string | null;
  serviceEndedAt: string | null;
  geoPrecision: string | null;
  geoDisplayName: string | null;
  currentErrors: EquipmentErrorRow[];
  recentErrors: EquipmentErrorRow[];
  lastErrorAt: string | null;
  telemetry: SupplySnapshotRow | null;
  rotorSummary: RotorSummaryRow | null;
  reagentSummary: ReagentConsumptionSummaryRow | null;
  searchText: string;
}

const MAP_URL = getPublicAssetUrl('mexico_map.svg');
const SUPREMO_ICON_URL = getPublicAssetUrl('supremo_icon.png');
const MAP_OVERRIDE_TABLE = 'equipment_map_manual_overrides';
const REFRESH_INTERVAL_MS = 30000;
const ACTIVE_TELEMETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAP_ZOOM_MIN = 1;
const MAP_ZOOM_MAX = 7;
const MAP_ZOOM_STEP = 0.25;
const SUPREMO_LAUNCH_TIMEOUT_MS = 1800;

const STATUS_PRIORITY: Record<EquipmentHealthStatus, number> = {
  ok: 1,
  warning: 2,
  fatal: 3,
};

const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const readNumericValue = (value: NumericLike) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return 'Sin dato';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Sin dato';
  }

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
};

const formatRelativeTime = (value?: string | null) => {
  if (!value) {
    return 'Sin dato';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Sin dato';
  }

  const diffMs = parsed.getTime() - Date.now();
  const formatter = new Intl.RelativeTimeFormat('es-MX', { numeric: 'auto' });
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (Math.abs(diffMs) < hour) {
    return formatter.format(Math.round(diffMs / minute), 'minute');
  }

  if (Math.abs(diffMs) < day) {
    return formatter.format(Math.round(diffMs / hour), 'hour');
  }

  return formatter.format(Math.round(diffMs / day), 'day');
};

const formatInteger = (value: NumericLike) =>
  new Intl.NumberFormat('es-MX', {
    maximumFractionDigits: 0,
  }).format(readNumericValue(value));

const formatCurrency = (value: NumericLike) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(readNumericValue(value));

const normalizeClientName = (relation: EquipmentRow['clientes']) => {
  if (Array.isArray(relation)) {
    return relation[0]?.razon_social || 'Cliente sin registrar';
  }

  return relation?.razon_social || 'Cliente sin registrar';
};

const getEventTimestamp = (row: EquipmentErrorRow) => row.detected_at || row.created_at || '';

const coerceStatus = (rawValue?: string | null): EquipmentHealthStatus => {
  if (rawValue === 'fatal') {
    return 'fatal';
  }

  if (rawValue === 'warning') {
    return 'warning';
  }

  return 'ok';
};

const normalizeSerial = (value?: string | null) => {
  const normalized = (value || '').trim().toUpperCase().replace(/\s+/g, '');
  return normalized || null;
};

const clampPercent = (value: number) => clampValue(value, 0.8, 99.2);

const roundMapPercent = (value: number) => Math.round(value * 1000) / 1000;
const roundZoom = (value: number) => Math.round(value * 100) / 100;

const compareErrorsDesc = (left: EquipmentErrorRow, right: EquipmentErrorRow) => {
  const timeDiff = new Date(getEventTimestamp(right)).getTime() - new Date(getEventTimestamp(left)).getTime();
  if (timeDiff !== 0) {
    return timeDiff;
  }

  return right.id - left.id;
};

const buildErrorIndex = (rows: EquipmentErrorRow[]) => {
  const grouped = new Map<string, EquipmentErrorRow[]>();

  rows.forEach((row) => {
    const normalizedSerial = normalizeSerial(row.numero_serie);
    if (!normalizedSerial) {
      return;
    }

    const current = grouped.get(normalizedSerial) || [];
    current.push(row);
    grouped.set(normalizedSerial, current);
  });

  const indexed = new Map<string, IndexedErrorState>();

  grouped.forEach((serialRows, serial) => {
    serialRows.sort(compareErrorsDesc);
    const lastDetectedAt = getEventTimestamp(serialRows[0]) || null;
    const currentRows = serialRows.filter((row) => getEventTimestamp(row) === lastDetectedAt);
    const status = currentRows.reduce<EquipmentHealthStatus>((currentStatus, row) => {
      const nextStatus = coerceStatus(row.tipo_mensaje);
      return STATUS_PRIORITY[nextStatus] > STATUS_PRIORITY[currentStatus] ? nextStatus : currentStatus;
    }, 'ok');

    indexed.set(serial, {
      status,
      currentRows,
      recentRows: serialRows.slice(0, 6),
      lastDetectedAt,
    });
  });

  return indexed;
};

const buildRotorIndex = (rows: RotorSummaryRow[]) => {
  const indexed = new Map<string, RotorSummaryRow>();

  rows.forEach((row) => {
    const normalizedSerial = normalizeSerial(row.numero_serie);
    if (!normalizedSerial || indexed.has(normalizedSerial)) {
      return;
    }

    indexed.set(normalizedSerial, row);
  });

  return indexed;
};

const buildReagentSummaryIndex = (rows: ReagentConsumptionSummaryRow[]) => {
  const indexed = new Map<string, ReagentConsumptionSummaryRow>();

  rows.forEach((row) => {
    const normalizedSerial = normalizeSerial(row.numero_serie);
    if (!normalizedSerial || indexed.has(normalizedSerial)) {
      return;
    }

    indexed.set(normalizedSerial, row);
  });

  return indexed;
};

const buildCurrentErrorStateIndex = (rows: CurrentEquipmentErrorStateRow[]) => {
  const indexed = new Map<string, IndexedCurrentErrorState>();

  rows.forEach((row, rowIndex) => {
    const normalizedSerial = normalizeSerial(row.numero_serie);
    if (!normalizedSerial) {
      return;
    }

    const status = coerceStatus(row.estado_actual || row.tipo_mensaje);
    const rawErrors = Array.isArray(row.errores_activos) ? row.errores_activos : [];
    const activeErrors =
      rawErrors.length > 0
        ? rawErrors
        : row.error_principal_codigo || row.error_principal_descripcion || row.error_principal_seccion
          ? [
              {
                codigo_error: row.error_principal_codigo,
                descripcion_error: row.error_principal_descripcion,
                seccion_error: row.error_principal_seccion,
                tipo_mensaje: row.tipo_mensaje,
              },
            ]
          : [];

    const currentRows =
      status === 'ok'
        ? []
        : activeErrors.map((errorRow, errorIndex) => ({
            id: -((rowIndex + 1) * 100 + errorIndex + 1),
            numero_serie: row.numero_serie,
            modelo: row.modelo,
            codigo_error: errorRow.codigo_error,
            descripcion_error: errorRow.descripcion_error,
            seccion_error: errorRow.seccion_error,
            tipo_mensaje: errorRow.tipo_mensaje || row.tipo_mensaje,
            detected_at: row.last_event_at,
            created_at: row.updated_at,
            monitor_name: row.monitor_name,
            machine_name: row.machine_name,
          }));

    indexed.set(normalizedSerial, {
      status,
      currentRows,
      lastEventAt: row.last_event_at || row.updated_at || row.resolved_at || null,
      model: row.modelo || null,
    });
  });

  return indexed;
};

const buildEquipmentList = (snapshot: MonitoringSnapshot): MonitoringEquipment[] => {
  const errorIndex = buildErrorIndex(snapshot.errors);
  const currentStateIndex = buildCurrentErrorStateIndex(snapshot.currentErrorStates);
  const supplyIndex = new Map(
    snapshot.supplies
      .map((row) => [normalizeSerial(row.numero_serie), row] as const)
      .filter(([serial]) => Boolean(serial)) as Array<[string, SupplySnapshotRow]>,
  );
  const rotorIndex = buildRotorIndex(snapshot.rotors);
  const reagentSummaryIndex = buildReagentSummaryIndex(snapshot.reagentSummaries);
  const locationCounters = new Map<string, number>();

  return snapshot.equipments
    .filter((equipment) => equipment.numero_serie)
    .sort((left, right) => (left.numero_serie || '').localeCompare(right.numero_serie || '', 'es-MX'))
    .map((equipment) => {
      const serial = equipment.numero_serie?.trim() || '';
      const normalizedSerial = normalizeSerial(serial);
      const locationSeed: EquipmentLocationInput = {
        numeroSerie: serial,
        pais: equipment.pais,
        estado: equipment.estado,
        ciudad: equipment.ciudad,
        municipio: equipment.municipio,
        direccion: equipment.direccion,
        geoLatitude: equipment.geo_latitude,
        geoLongitude: equipment.geo_longitude,
        geoBoundingBox: equipment.geo_boundingbox,
        geoPrecision: equipment.geo_precision,
        geoLocationKey: equipment.geo_locality_cache_key,
      };
      const fallbackStateKey =
        getNormalizedStateLabel(equipment.estado) ||
        getNormalizedStateLabel(equipment.direccion) ||
        getNormalizedStateLabel(equipment.municipio) ||
        getNormalizedStateLabel(equipment.ciudad) ||
        'sin-estado';
      const locationCounterKey = equipment.geo_locality_cache_key || `state:${fallbackStateKey}`;
      const currentIndex = locationCounters.get(locationCounterKey) || 0;
      locationCounters.set(locationCounterKey, currentIndex + 1);

      const mapPoint = resolveEquipmentMapPoint(locationSeed, currentIndex);
      const clientName = normalizeClientName(equipment.clientes);
      const errorState = normalizedSerial ? errorIndex.get(normalizedSerial) : undefined;
      const currentState = normalizedSerial ? currentStateIndex.get(normalizedSerial) : undefined;
      const currentErrors = currentState?.currentRows || errorState?.currentRows || [];
      const recentErrors = errorState?.recentRows || [];
      const telemetry = normalizedSerial ? supplyIndex.get(normalizedSerial) || null : null;
      const rotorSummary = normalizedSerial ? rotorIndex.get(normalizedSerial) || null : null;
      const reagentSummary = normalizedSerial ? reagentSummaryIndex.get(normalizedSerial) || null : null;
      const normalizedState = mapPoint?.normalizedState || equipment.estado || null;
      const model =
        equipment.modelo ||
        telemetry?.modelo ||
        currentState?.model ||
        errorState?.currentRows[0]?.modelo ||
        'Modelo no identificado';
      const searchText = [
        serial,
        clientName,
        model,
        normalizedState,
        equipment.ciudad,
        equipment.municipio,
        equipment.direccion,
        ...recentErrors.flatMap((row) => [row.codigo_error, row.descripcion_error, row.seccion_error]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return {
        id: equipment.id,
        serial,
        clientName,
        model,
        status: currentState?.status || errorState?.status || 'ok',
        mapPoint: mapPoint ? { x: mapPoint.x, y: mapPoint.y } : null,
        normalizedState,
        city: equipment.ciudad,
        municipality: equipment.municipio,
        address: equipment.direccion,
        postalCode: equipment.codigo_postal,
        serviceEndedAt: equipment.fecha_fin,
        geoPrecision: equipment.geo_precision || null,
        geoDisplayName: equipment.geo_display_name || null,
        currentErrors,
        recentErrors,
        lastErrorAt: currentState?.lastEventAt || errorState?.lastDetectedAt || null,
        telemetry,
        rotorSummary,
        reagentSummary,
        searchText,
      };
    });
};

const formatRotorBucket = (bucketMonth?: string | null) => {
  if (!bucketMonth || bucketMonth.length !== 6) {
    return 'Sin dato';
  }

  const year = Number.parseInt(bucketMonth.slice(0, 4), 10);
  const month = Number.parseInt(bucketMonth.slice(4, 6), 10) - 1;
  const date = new Date(year, month, 1);

  if (Number.isNaN(date.getTime())) {
    return 'Sin dato';
  }

  return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(date);
};

const renderElectrodeState = (label: string, value?: string | null) => (
  <span className={`equipment-monitor__tag ${value ? '' : 'equipment-monitor__tag--muted'}`.trim()}>
    {label}: {value || 'N/D'}
  </span>
);

const attemptSupremoClientLaunch = async (launchUrl: string) =>
  new Promise<boolean>((resolve) => {
    let settled = false;
    let timeoutId = 0;

    const finalize = (didOpen: boolean) => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener('blur', handleBlur, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange, true);
      resolve(didOpen);
    };

    const handleBlur = () => finalize(true);
    const handleVisibilityChange = () => {
      if (document.hidden) {
        finalize(true);
      }
    };

    window.addEventListener('blur', handleBlur, true);
    document.addEventListener('visibilitychange', handleVisibilityChange, true);

    try {
      window.location.assign(launchUrl);
    } catch {
      finalize(false);
      return;
    }

    timeoutId = window.setTimeout(() => {
      finalize(document.hidden || !document.hasFocus());
    }, SUPREMO_LAUNCH_TIMEOUT_MS);
  });

export default function EquipmentMonitoring() {
  const mountedRef = useRef(true);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const mapStageRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    equipmentId: string;
    lastPoint: EquipmentPointOverride | null;
  } | null>(null);
  const panStateRef = useRef<{
    startClientX: number;
    startClientY: number;
    startPan: MapPanOffset;
  } | null>(null);
  const gestureStartZoomRef = useRef<number | null>(null);
  const mapZoomRef = useRef(MAP_ZOOM_MIN);
  const mapPanRef = useRef<MapPanOffset>({ x: 0, y: 0 });

  const [snapshot, setSnapshot] = useState<MonitoringSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<EquipmentFilter>('all');
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadNotice, setLoadNotice] = useState<string | null>(null);
  const [lastRealtimeEventAt, setLastRealtimeEventAt] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editorNotice, setEditorNotice] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [localMapOverrides, setLocalMapOverrides] = useState<Record<string, EquipmentPointOverride>>({});
  const [draggingEquipmentId, setDraggingEquipmentId] = useState<string | null>(null);
  const [mapZoom, setMapZoom] = useState(1);
  const [mapPan, setMapPan] = useState<MapPanOffset>({ x: 0, y: 0 });
  const [isPanningMap, setIsPanningMap] = useState(false);
  const [isMapHoverLocked, setIsMapHoverLocked] = useState(false);
  const [launchingSupremo, setLaunchingSupremo] = useState(false);
  const [supremoFeedback, setSupremoFeedback] = useState<RemoteLaunchFeedback | null>(null);
  const [selectedReagentRows, setSelectedReagentRows] = useState<ReagentConsumptionDetailRow[]>([]);
  const [loadingReagentRows, setLoadingReagentRows] = useState(false);
  const [reagentLoadError, setReagentLoadError] = useState<string | null>(null);

  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => {
    mapZoomRef.current = mapZoom;
    mapPanRef.current = mapPan;
  }, [mapPan, mapZoom]);

  useEffect(() => {
    const body = document.body;
    const root = document.documentElement;

    if (!isMapHoverLocked) {
      body.classList.remove('equipment-monitor__body-scroll-lock');
      root.classList.remove('equipment-monitor__body-scroll-lock');
      return;
    }

    body.classList.add('equipment-monitor__body-scroll-lock');
    root.classList.add('equipment-monitor__body-scroll-lock');

    return () => {
      body.classList.remove('equipment-monitor__body-scroll-lock');
      root.classList.remove('equipment-monitor__body-scroll-lock');
    };
  }, [isMapHoverLocked]);

  async function loadMonitoringSnapshot(mode: 'initial' | 'refresh' = 'refresh') {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    if (mode === 'refresh') {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    const task = (async () => {
      const [
        equipmentsResponse,
        locationsResponse,
        overridesResponse,
        currentStateResponse,
        errorsResponse,
        suppliesResponse,
        reagentSummaryResponse,
        rotorsResponse,
      ] = await Promise.all([
        supabase
          .from('equipos')
          .select('id,numero_serie,modelo,pais,estado,ciudad,municipio,colonia,direccion,codigo_postal,fecha_fin,clientes(razon_social)')
          .order('creado_en', { ascending: false }),
        supabase
          .from('v_equipment_map_locations')
          .select('equipment_id,locality_cache_key,geo_latitude,geo_longitude,geo_boundingbox,geo_precision,geo_display_name')
          .range(0, 1999),
        supabase
          .from(MAP_OVERRIDE_TABLE)
          .select('equipment_id,x_percent,y_percent,updated_at')
          .range(0, 1999),
        supabase
          .from('estado_errores_equipo_actual')
          .select(
            'numero_serie,modelo,monitor_name,machine_name,estado_actual,tipo_mensaje,errores_activos,error_principal_codigo,error_principal_descripcion,error_principal_seccion,last_event_at,resolved_at,updated_at',
          )
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
        supabase
          .from('v_equipment_reagent_consumption_summary')
          .select(
            'numero_serie,modelo,modelo_familia,pruebas_registradas,muestras_paciente,blancos,calibraciones,controles,pruebas_distintas,pruebas_distintas_con_precio,pruebas_distintas_sin_precio,pruebas_con_precio,pruebas_sin_precio,valor_estimado_total_sin_iva,valor_estimado_total_con_iva,valor_estimado_pacientes_sin_iva,valor_estimado_pacientes_con_iva,valor_estimado_total_sin_iva_min,valor_estimado_total_sin_iva_max,valor_estimado_total_con_iva_min,valor_estimado_total_con_iva_max,first_event_at,last_event_at',
          )
          .range(0, 1999),
        supabase
          .from('consumo_rotores_mensual')
          .select('numero_serie,bucket_month,rotor_change_count,last_change_at,updated_at')
          .order('updated_at', { ascending: false })
          .range(0, 1999),
      ]);

      if (equipmentsResponse.error) {
        throw new Error(`No fue posible leer equipos: ${equipmentsResponse.error.message}`);
      }

      if (errorsResponse.error) {
        throw new Error(`No fue posible leer monitoreo de errores: ${errorsResponse.error.message}`);
      }

      const notices: string[] = [];
      if (locationsResponse.error) {
        notices.push('La geocodificación precisa no respondió y el mapa cayó al modo estatal de respaldo.');
      }

      if (overridesResponse.error) {
        notices.push('Los ajustes manuales del mapa no respondieron y se omitieron en este corte.');
      }

      if (currentStateResponse.error) {
        notices.push('El estado actual de errores no respondió y se usó el historial como respaldo.');
      }

      if (suppliesResponse.error) {
        notices.push('La telemetría de insumos no respondió y quedó fuera de este corte.');
      }

      if (reagentSummaryResponse.error) {
        notices.push('El resumen de reactivos no respondió y se omitió en este corte.');
      }

      if (rotorsResponse.error) {
        notices.push('El resumen de rotores no respondió y quedó fuera de este corte.');
      }

      if (!mountedRef.current) {
        return;
      }

      const locationIndex = new Map(
        ((locationsResponse.data || []) as EquipmentMapLocationRow[]).map((row) => [row.equipment_id, row] as const),
      );
      const mergedEquipments = ((equipmentsResponse.data || []) as EquipmentRow[]).map((equipment) => {
        const location = locationIndex.get(equipment.id);
        if (!location) {
          return equipment;
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

      setSnapshot({
        equipments: mergedEquipments,
        errors: (errorsResponse.data || []) as EquipmentErrorRow[],
        currentErrorStates: (currentStateResponse.data || []) as CurrentEquipmentErrorStateRow[],
        supplies: ((suppliesResponse.data || []) as SupplySnapshotRow[]).filter((row) => row.numero_serie),
        reagentSummaries: ((reagentSummaryResponse.data || []) as ReagentConsumptionSummaryRow[]).filter(
          (row) => row.numero_serie,
        ),
        rotors: ((rotorsResponse.data || []) as RotorSummaryRow[]).filter((row) => row.numero_serie),
        mapOverrides: (overridesResponse.data || []) as EquipmentMapOverrideRow[],
        refreshedAt: new Date().toISOString(),
      });
      setLoadError(null);
      setLoadNotice(notices.length ? notices.join(' ') : null);
    })()
      .catch((error: unknown) => {
        if (!mountedRef.current) {
          return;
        }

        const message = error instanceof Error ? error.message : 'No fue posible cargar el monitoreo de equipos.';
        setLoadError(message);
      })
      .finally(() => {
        refreshInFlightRef.current = null;

        if (!mountedRef.current) {
          return;
        }

        setRefreshing(false);
        setLoading(false);
      });

    refreshInFlightRef.current = task;
    return task;
  }

  useEffect(() => {
    mountedRef.current = true;
    void loadMonitoringSnapshot('initial');

    const channel = supabase
      .channel('equipment-monitoring-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monitoreo_errores_equipos' }, () => {
        setLastRealtimeEventAt(new Date().toISOString());
        void loadMonitoringSnapshot('refresh');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estado_insumos_equipo_actual' }, () => {
        setLastRealtimeEventAt(new Date().toISOString());
        void loadMonitoringSnapshot('refresh');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'consumo_reactivos_hora' }, () => {
        setLastRealtimeEventAt(new Date().toISOString());
        void loadMonitoringSnapshot('refresh');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'consumo_rotores_mensual' }, () => {
        setLastRealtimeEventAt(new Date().toISOString());
        void loadMonitoringSnapshot('refresh');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipos' }, () => {
        setLastRealtimeEventAt(new Date().toISOString());
        void loadMonitoringSnapshot('refresh');
      })
      .subscribe();

    const timer = window.setInterval(() => {
      void loadMonitoringSnapshot('refresh');
    }, REFRESH_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, []);

  const baseEquipments = useMemo(() => (snapshot ? buildEquipmentList(snapshot) : []), [snapshot]);

  const effectiveOverrideMap = useMemo(() => {
    const overrides = new Map<string, EquipmentPointOverride>();

    (snapshot?.mapOverrides || []).forEach((row) => {
      overrides.set(row.equipment_id, {
        x: row.x_percent,
        y: row.y_percent,
      });
    });

    Object.entries(localMapOverrides).forEach(([equipmentId, point]) => {
      overrides.set(equipmentId, point);
    });

    return overrides;
  }, [localMapOverrides, snapshot?.mapOverrides]);

  const equipments = useMemo(() => {
    return baseEquipments.map((equipment) => {
      const manualOverride = effectiveOverrideMap.get(equipment.id);
      if (!manualOverride) {
        return equipment;
      }

      return {
        ...equipment,
        mapPoint: {
          x: manualOverride.x,
          y: manualOverride.y,
        },
      };
    });
  }, [baseEquipments, effectiveOverrideMap]);

  const equipmentIndex = useMemo(() => {
    return new Map(equipments.map((equipment) => [equipment.id, equipment] as const));
  }, [equipments]);

  const filteredEquipments = useMemo(() => {
    return equipments
      .filter((equipment) => {
        if (filter === 'fatal') {
          return equipment.status === 'fatal';
        }

        if (filter === 'warning') {
          return equipment.status === 'warning';
        }

        if (filter === 'ok') {
          return equipment.status === 'ok';
        }

        if (filter === 'unmapped') {
          return !equipment.mapPoint;
        }

        return true;
      })
      .filter((equipment) => {
        if (!deferredSearch) {
          return true;
        }

        return equipment.searchText.includes(deferredSearch);
      })
      .sort((left, right) => {
        const statusDiff = STATUS_PRIORITY[right.status] - STATUS_PRIORITY[left.status];
        if (statusDiff !== 0) {
          return statusDiff;
        }

        const timeDiff = new Date(right.lastErrorAt || 0).getTime() - new Date(left.lastErrorAt || 0).getTime();
        if (timeDiff !== 0) {
          return timeDiff;
        }

        return left.serial.localeCompare(right.serial, 'es-MX');
      });
  }, [deferredSearch, equipments, filter]);

  useEffect(() => {
    if (!filteredEquipments.length) {
      setSelectedEquipmentId(null);
      return;
    }

    const selectedStillVisible = filteredEquipments.some((equipment) => equipment.id === selectedEquipmentId);
    if (selectedStillVisible) {
      return;
    }

    const preferred =
      filteredEquipments.find((equipment) => equipment.status === 'fatal') ||
      filteredEquipments.find((equipment) => equipment.status === 'warning') ||
      filteredEquipments.find((equipment) => Boolean(equipment.mapPoint)) ||
      filteredEquipments[0];

    setSelectedEquipmentId(preferred.id);
  }, [filteredEquipments, selectedEquipmentId]);

  const selectedEquipment = filteredEquipments.find((equipment) => equipment.id === selectedEquipmentId) || null;
  const mappedEquipments = filteredEquipments.filter((equipment) => equipment.mapPoint);
  const selectedEquipmentHasManualOverride = selectedEquipment ? effectiveOverrideMap.has(selectedEquipment.id) : false;

  useEffect(() => {
    let cancelled = false;

    if (!selectedEquipment?.serial) {
      setSelectedReagentRows([]);
      setLoadingReagentRows(false);
      setReagentLoadError(null);
      return () => {
        cancelled = true;
      };
    }

    setLoadingReagentRows(true);
    setReagentLoadError(null);

    void (async () => {
      const { data, error } = await supabase
        .from('v_equipment_reagent_consumption_detail')
        .select(
          'numero_serie,modelo,modelo_familia,test_name,test_name_normalizado,descripcion_catalogo_normalizada,reactivo_codigo_referencia,reactivo_descripcion_referencia,presentacion_referencia,rendimiento_referencia,rendimiento_total,rendimiento_util,rendimiento_util_seguro,presentaciones_catalogo,match_source,tiene_precio,pruebas_registradas,muestras_paciente,blancos,calibraciones,controles,first_event_at,last_event_at,costo_prueba_referencia_con_iva,valor_estimado_total_con_iva,valor_estimado_pacientes_con_iva,valor_estimado_total_con_iva_min,valor_estimado_total_con_iva_max',
        )
        .eq('numero_serie', selectedEquipment.serial)
        .order('pruebas_registradas', { ascending: false })
        .order('test_name', { ascending: true })
        .range(0, 199);

      if (cancelled) {
        return;
      }

      if (error) {
        setSelectedReagentRows([]);
        setReagentLoadError(`No fue posible leer las pruebas registradas: ${error.message}`);
        setLoadingReagentRows(false);
        return;
      }

      setSelectedReagentRows((data || []) as ReagentConsumptionDetailRow[]);
      setLoadingReagentRows(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedEquipment?.serial, snapshot?.refreshedAt]);

  const summary = useMemo(() => {
    const fatal = equipments.filter((equipment) => equipment.status === 'fatal').length;
    const warning = equipments.filter((equipment) => equipment.status === 'warning').length;
    const mapped = equipments.filter((equipment) => equipment.mapPoint).length;
    const telemetryLive = equipments.filter((equipment) => {
      const updatedAt = equipment.telemetry?.updated_at;
      return updatedAt ? Date.now() - new Date(updatedAt).getTime() <= ACTIVE_TELEMETRY_WINDOW_MS : false;
    }).length;

    return {
      total: equipments.length,
      fatal,
      warning,
      mapped,
      unmapped: Math.max(equipments.length - mapped, 0),
      telemetryLive,
    };
  }, [equipments]);

  const criticalEquipments = useMemo(
    () => equipments.filter((equipment) => equipment.status !== 'ok').slice(0, 8),
    [equipments],
  );

  const unmappedEquipments = useMemo(
    () => equipments.filter((equipment) => !equipment.mapPoint).slice(0, 8),
    [equipments],
  );

  const selectedReagentSummary = selectedEquipment?.reagentSummary || null;

  const selectedReagentRowsSorted = useMemo(() => {
    return [...selectedReagentRows].sort((left, right) => {
      const valueDiff =
        readNumericValue(right.valor_estimado_total_con_iva) - readNumericValue(left.valor_estimado_total_con_iva);
      if (valueDiff !== 0) {
        return valueDiff;
      }

      const countDiff = readNumericValue(right.pruebas_registradas) - readNumericValue(left.pruebas_registradas);
      if (countDiff !== 0) {
        return countDiff;
      }

      return left.test_name.localeCompare(right.test_name, 'es-MX');
    });
  }, [selectedReagentRows]);

  const getStageMetrics = (zoom = mapZoomRef.current, pan = mapPanRef.current) => {
    const rect = mapStageRef.current?.getBoundingClientRect();
    if (!rect) {
      return null;
    }

    const sceneWidth = rect.width * zoom;
    const sceneHeight = rect.height * zoom;
    const baseOffsetX = (rect.width - sceneWidth) / 2;
    const baseOffsetY = (rect.height - sceneHeight) / 2;

    return {
      rect,
      sceneWidth,
      sceneHeight,
      offsetX: baseOffsetX + pan.x,
      offsetY: baseOffsetY + pan.y,
    };
  };

  const clampMapPan = (nextPan: MapPanOffset, zoom = mapZoomRef.current) => {
    const rect = mapStageRef.current?.getBoundingClientRect();
    if (!rect || zoom <= 1) {
      return { x: 0, y: 0 };
    }

    const maxPanX = ((zoom - 1) * rect.width) / 2;
    const maxPanY = ((zoom - 1) * rect.height) / 2;

    return {
      x: clampValue(nextPan.x, -maxPanX, maxPanX),
      y: clampValue(nextPan.y, -maxPanY, maxPanY),
    };
  };

  const updateMapZoom = (nextZoom: number, clientX?: number, clientY?: number) => {
    const currentZoom = mapZoomRef.current;
    const currentPan = mapPanRef.current;
    const boundedZoom = clampValue(roundZoom(nextZoom), MAP_ZOOM_MIN, MAP_ZOOM_MAX);

    if (boundedZoom === MAP_ZOOM_MIN) {
      setMapZoom(MAP_ZOOM_MIN);
      setMapPan({ x: 0, y: 0 });
      return;
    }

    const metrics = getStageMetrics(currentZoom, currentPan);
    if (!metrics) {
      setMapZoom(boundedZoom);
      return;
    }

    const focusClientX = clientX ?? metrics.rect.left + metrics.rect.width / 2;
    const focusClientY = clientY ?? metrics.rect.top + metrics.rect.height / 2;
    const contentRatioX = clampValue((focusClientX - metrics.rect.left - metrics.offsetX) / metrics.sceneWidth, 0, 1);
    const contentRatioY = clampValue((focusClientY - metrics.rect.top - metrics.offsetY) / metrics.sceneHeight, 0, 1);
    const nextSceneWidth = metrics.rect.width * boundedZoom;
    const nextSceneHeight = metrics.rect.height * boundedZoom;
    const nextBaseOffsetX = (metrics.rect.width - nextSceneWidth) / 2;
    const nextBaseOffsetY = (metrics.rect.height - nextSceneHeight) / 2;
    const unclampedPan = {
      x: focusClientX - metrics.rect.left - contentRatioX * nextSceneWidth - nextBaseOffsetX,
      y: focusClientY - metrics.rect.top - contentRatioY * nextSceneHeight - nextBaseOffsetY,
    };

    setMapZoom(boundedZoom);
    setMapPan(clampMapPan(unclampedPan, boundedZoom));
  };

  const readMapPointFromClient = (clientX: number, clientY: number) => {
    const metrics = getStageMetrics();
    if (!metrics || !metrics.rect.width || !metrics.rect.height) {
      return null;
    }

    const logicalX = (clientX - metrics.rect.left - metrics.offsetX) / metrics.sceneWidth;
    const logicalY = (clientY - metrics.rect.top - metrics.offsetY) / metrics.sceneHeight;

    return {
      x: roundMapPercent(clampPercent(logicalX * 100)),
      y: roundMapPercent(clampPercent(logicalY * 100)),
    };
  };

  const persistManualOverride = async (equipmentId: string, point: EquipmentPointOverride) => {
    const targetEquipment = equipmentIndex.get(equipmentId);
    const { error } = await supabase.from(MAP_OVERRIDE_TABLE).upsert(
      {
        equipment_id: equipmentId,
        x_percent: point.x,
        y_percent: point.y,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'equipment_id',
      },
    );

    if (error) {
      throw error;
    }

    setEditorError(null);
    setEditorNotice(
      `Ajuste guardado para ${targetEquipment?.serial || equipmentId}. Puedes seguir moviendo puntos y se irán guardando al soltar.`,
    );
  };

  const resetSelectedManualOverride = async () => {
    if (!selectedEquipment) {
      return;
    }

    setLocalMapOverrides((current) => {
      const next = { ...current };
      delete next[selectedEquipment.id];
      return next;
    });

    const { error } = await supabase.from(MAP_OVERRIDE_TABLE).delete().eq('equipment_id', selectedEquipment.id);

    if (error) {
      setEditorError(`No se pudo restablecer el punto de ${selectedEquipment.serial}: ${error.message}`);
      return;
    }

    setEditorError(null);
    setEditorNotice(`Se restableció el punto de ${selectedEquipment.serial} al cálculo automático.`);
  };

  useEffect(() => {
    if (!isEditMode) {
      dragStateRef.current = null;
      setDraggingEquipmentId(null);
    }
  }, [isEditMode]);

  useEffect(() => {
    setLaunchingSupremo(false);
    setSupremoFeedback(null);
  }, [selectedEquipmentId]);

  useEffect(() => {
    const stage = mapStageRef.current;
    if (!stage) {
      return;
    }

    const handleGestureStart = (event: Event) => {
      gestureStartZoomRef.current = mapZoomRef.current;
      event.preventDefault();
      event.stopPropagation();
    };

    const handleGestureChange = (event: Event) => {
      const gestureEvent = event as Event & { scale?: number; clientX?: number; clientY?: number };
      event.preventDefault();
      event.stopPropagation();

      if (!gestureEvent.scale || Number.isNaN(gestureEvent.scale)) {
        return;
      }

      updateMapZoom(
        (gestureStartZoomRef.current || mapZoomRef.current) * gestureEvent.scale,
        gestureEvent.clientX,
        gestureEvent.clientY,
      );
    };

    const handleGestureEnd = (event: Event) => {
      gestureStartZoomRef.current = null;
      event.preventDefault();
      event.stopPropagation();
    };

    stage.addEventListener('gesturestart', handleGestureStart as EventListener, { passive: false });
    stage.addEventListener('gesturechange', handleGestureChange as EventListener, { passive: false });
    stage.addEventListener('gestureend', handleGestureEnd as EventListener, { passive: false });

    return () => {
      stage.removeEventListener('gesturestart', handleGestureStart as EventListener);
      stage.removeEventListener('gesturechange', handleGestureChange as EventListener);
      stage.removeEventListener('gestureend', handleGestureEnd as EventListener);
    };
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (dragState) {
        const point = readMapPointFromClient(event.clientX, event.clientY);
        if (!point) {
          return;
        }

        dragState.lastPoint = point;
        setLocalMapOverrides((current) => ({
          ...current,
          [dragState.equipmentId]: point,
        }));
        return;
      }

      const panState = panStateRef.current;
      if (!panState) {
        return;
      }

      const nextPan = clampMapPan(
        {
          x: panState.startPan.x + (event.clientX - panState.startClientX),
          y: panState.startPan.y + (event.clientY - panState.startClientY),
        },
        mapZoomRef.current,
      );
      setMapPan(nextPan);
    };

    const finalizeDrag = async () => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        panStateRef.current = null;
        setDraggingEquipmentId(null);
        setIsPanningMap(false);
        return;
      }

      if (!dragState.lastPoint) {
        dragStateRef.current = null;
        setDraggingEquipmentId(null);
        panStateRef.current = null;
        setIsPanningMap(false);
        return;
      }

      dragStateRef.current = null;
      setDraggingEquipmentId(null);

      try {
        await persistManualOverride(dragState.equipmentId, dragState.lastPoint);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo guardar el ajuste manual del mapa.';
        setEditorError(message);
      }
    };

    const finalizePan = () => {
      panStateRef.current = null;
      setIsPanningMap(false);
    };

    const finalizePointer = async () => {
      if (dragStateRef.current) {
        await finalizeDrag();
        return;
      }

      finalizePan();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finalizePointer);
    window.addEventListener('pointercancel', finalizePointer);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finalizePointer);
      window.removeEventListener('pointercancel', finalizePointer);
    };
  }, [equipmentIndex, isEditMode, mapPan, mapZoom]);

  const launchSupremo = async () => {
    if (!selectedEquipment) {
      return;
    }

    if (!isSupremoLaunchEnabled()) {
      setSupremoFeedback({
        tone: 'error',
        message: getSupremoLaunchDisabledMessage(),
      });
      return;
    }

    setLaunchingSupremo(true);
    setSupremoFeedback(null);

    try {
      const launchSession = await createSupremoLaunchSession(selectedEquipment.id);
      const didOpenClient = await attemptSupremoClientLaunch(launchSession.launchUrl || '');

      if (!didOpenClient) {
        setSupremoFeedback({
          tone: 'warning',
          message:
            'Orion intentó abrir Supremo, pero esta computadora no confirmó el cambio de foco. Revisa que Supremo esté instalado y que el sistema permita enlaces supremo://.',
        });
        return;
      }

      setSupremoFeedback({
        tone: 'success',
        message: `Se envió la conexión remota para ${launchSession.equipmentLabel || selectedEquipment.serial}.`,
      });
    } catch (error) {
      setSupremoFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'No fue posible iniciar la conexión remota.',
      });
    } finally {
      setLaunchingSupremo(false);
    }
  };

  if (loading && !snapshot) {
    return (
      <div className="equipment-monitor equipment-monitor--loading">
        <BrandLockup
          variant="loading"
          eyebrow="Monitoreo Orion"
          title="Levantando mapa y telemetría"
          subtitle="Cargando equipos, eventos de error e insumos para dibujar la consola nacional."
        />
      </div>
    );
  }

  return (
    <div className="equipment-monitor">
      <section className="equipment-monitor__hero">
        <div className="equipment-monitor__hero-copy">
          <span className="equipment-monitor__eyebrow">Monitoreo en vivo</span>
          <h2>Mapa operativo nacional de equipos Orion</h2>
          <p>
            Cada punto late sobre el mapa con base en la ubicación registrada del equipo. Verde es operación sana,
            amarillo es advertencia y rojo es evento fatal confirmado por el monitor de errores.
          </p>
        </div>
        <div className="equipment-monitor__hero-meta">
          <span className="equipment-monitor__live-pill">{refreshing ? 'Actualizando' : 'En línea'}</span>
          <span>Último refresco: {formatRelativeTime(snapshot?.refreshedAt)}</span>
          <span>Última señal realtime: {formatRelativeTime(lastRealtimeEventAt)}</span>
        </div>
      </section>

      <section className="equipment-monitor__toolbar">
        <div className="equipment-monitor__search">
          <input
            className="input-field"
            type="text"
            value={search}
            placeholder="Buscar serie, cliente, ciudad, estado o código de error"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="equipment-monitor__filters">
          {[
            ['all', 'Todos'],
            ['fatal', 'Rojos'],
            ['warning', 'Amarillos'],
            ['ok', 'Verdes'],
            ['unmapped', 'Sin ubicar'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`button-primary chip ${filter === value ? '' : 'inactive'}`.trim()}
              onClick={() => setFilter(value as EquipmentFilter)}
            >
              {label}
            </button>
          ))}
          <button type="button" className="button-primary chip" onClick={() => void loadMonitoringSnapshot('refresh')}>
            Actualizar ahora
          </button>
          <button
            type="button"
            className={`button-primary chip ${isEditMode ? '' : 'inactive'}`.trim()}
            onClick={() => {
              setIsEditMode((current) => !current);
              setEditorError(null);
              setEditorNotice(null);
            }}
          >
            {isEditMode ? 'Salir de ajuste' : 'Ajustar puntos'}
          </button>
          {selectedEquipmentHasManualOverride ? (
            <button type="button" className="button-primary chip inactive" onClick={() => void resetSelectedManualOverride()}>
              Restablecer punto
            </button>
          ) : null}
        </div>
      </section>

      <section className="equipment-monitor__summary-grid">
        <article className="equipment-monitor__summary-card equipment-monitor__summary-card--neutral">
          <span className="equipment-monitor__summary-label">Equipos totales</span>
          <strong>{summary.total}</strong>
        </article>
        <article className="equipment-monitor__summary-card equipment-monitor__summary-card--ok">
          <span className="equipment-monitor__summary-label">Ubicados en mapa</span>
          <strong>{summary.mapped}</strong>
        </article>
        <article className="equipment-monitor__summary-card equipment-monitor__summary-card--fatal">
          <span className="equipment-monitor__summary-label">Fatales activos</span>
          <strong>{summary.fatal}</strong>
        </article>
        <article className="equipment-monitor__summary-card equipment-monitor__summary-card--warning">
          <span className="equipment-monitor__summary-label">Warnings activos</span>
          <strong>{summary.warning}</strong>
        </article>
        <article className="equipment-monitor__summary-card equipment-monitor__summary-card--info">
          <span className="equipment-monitor__summary-label">Telemetría viva &lt; 24h</span>
          <strong>{summary.telemetryLive}</strong>
        </article>
        <article className="equipment-monitor__summary-card equipment-monitor__summary-card--muted">
          <span className="equipment-monitor__summary-label">Pendientes de georreferencia</span>
          <strong>{summary.unmapped}</strong>
        </article>
      </section>

      {loadError ? <div className="equipment-monitor__banner equipment-monitor__banner--error">{loadError}</div> : null}
      {loadNotice ? <div className="equipment-monitor__banner">{loadNotice}</div> : null}
      {editorError ? <div className="equipment-monitor__banner equipment-monitor__banner--error">{editorError}</div> : null}
      {isEditMode ? (
        <div className="equipment-monitor__banner equipment-monitor__banner--soft">
          Modo ajuste activo. Arrastra cualquier punto para moverlo y el cambio se guardará en Supabase al soltar.
          {selectedEquipment ? ` Selección actual: ${selectedEquipment.serial}.` : ''}
        </div>
      ) : null}
      {editorNotice ? <div className="equipment-monitor__banner">{editorNotice}</div> : null}
      <div className="equipment-monitor__banner equipment-monitor__banner--soft">
        La posición ahora prioriza coordenadas geocodificadas por ciudad o municipio y estado. Cuando una localidad
        todavía no está en cache, el mapa cae a un punto estatal de respaldo.
      </div>

      <section className="equipment-monitor__main-grid">
        <div className="equipment-monitor__map-panel">
          <div className="equipment-monitor__map-header">
            <div>
              <h3>México operativo</h3>
              <p>{mappedEquipments.length} equipos visibles en el lienzo actual.</p>
            </div>
            <div className="equipment-monitor__map-tools">
              <div className="equipment-monitor__legend">
                <span><i className="equipment-monitor__legend-dot equipment-monitor__legend-dot--ok" /> Verde</span>
                <span><i className="equipment-monitor__legend-dot equipment-monitor__legend-dot--warning" /> Warning</span>
                <span><i className="equipment-monitor__legend-dot equipment-monitor__legend-dot--fatal" /> Fatal</span>
              </div>
              <div className="equipment-monitor__zoom-controls" aria-label="Controles de zoom del mapa">
                <button type="button" className="button-primary chip inactive" onClick={() => updateMapZoom(mapZoom - MAP_ZOOM_STEP)}>
                  -
                </button>
                <button type="button" className="button-primary chip inactive" onClick={() => updateMapZoom(1)}>
                  {Math.round(mapZoom * 100)}%
                </button>
                <button type="button" className="button-primary chip inactive" onClick={() => updateMapZoom(mapZoom + MAP_ZOOM_STEP)}>
                  +
                </button>
              </div>
            </div>
          </div>

          <div
            ref={mapStageRef}
            className={`equipment-monitor__map-stage ${isEditMode ? 'equipment-monitor__map-stage--edit' : ''} ${
              isPanningMap ? 'equipment-monitor__map-stage--panning' : ''
            }`.trim()}
            onPointerEnter={() => setIsMapHoverLocked(true)}
            onPointerLeave={() => setIsMapHoverLocked(false)}
            onWheel={(event) => {
              event.preventDefault();
              event.stopPropagation();

              if (event.ctrlKey || event.metaKey) {
                const pinchFactor = Math.exp(-event.deltaY * 0.01);
                updateMapZoom(mapZoomRef.current * pinchFactor, event.clientX, event.clientY);
                return;
              }

              updateMapZoom(mapZoomRef.current + (event.deltaY < 0 ? MAP_ZOOM_STEP : -MAP_ZOOM_STEP), event.clientX, event.clientY);
            }}
            onPointerDown={(event) => {
              if (dragStateRef.current || mapZoomRef.current <= 1) {
                return;
              }

              const target = event.target as HTMLElement;
              if (target.closest('.equipment-monitor__marker')) {
                return;
              }

              event.preventDefault();
              panStateRef.current = {
                startClientX: event.clientX,
                startClientY: event.clientY,
                startPan: mapPan,
              };
              setIsPanningMap(true);
            }}
          >
            <div
              className="equipment-monitor__map-scene"
              style={{
                width: `${mapZoom * 100}%`,
                height: `${mapZoom * 100}%`,
                left: `calc(${((1 - mapZoom) * 100) / 2}% + ${mapPan.x}px)`,
                top: `calc(${((1 - mapZoom) * 100) / 2}% + ${mapPan.y}px)`,
              }}
            >
              <img src={MAP_URL} alt="Mapa de México" className="equipment-monitor__map-image" draggable={false} />
              <div className="equipment-monitor__map-overlay">
                {mappedEquipments.map((equipment) => (
                  <button
                    key={`${equipment.id}-${equipment.serial}`}
                    type="button"
                    className={`equipment-monitor__marker equipment-monitor__marker--${equipment.status} ${
                      selectedEquipment?.id === equipment.id ? 'equipment-monitor__marker--selected' : ''
                    } ${
                      draggingEquipmentId === equipment.id ? 'equipment-monitor__marker--dragging' : ''
                    }`.trim()}
                    style={{
                      left: `${equipment.mapPoint?.x || 0}%`,
                      top: `${equipment.mapPoint?.y || 0}%`,
                      animationDelay: `-${(equipment.serial.charCodeAt(equipment.serial.length - 1) % 9) * 0.14}s`,
                    }}
                    onPointerDown={(event) => {
                      setSelectedEquipmentId(equipment.id);

                      if (!isEditMode) {
                        return;
                      }

                      event.preventDefault();
                      event.stopPropagation();

                      const point = readMapPointFromClient(event.clientX, event.clientY) || equipment.mapPoint;
                      dragStateRef.current = {
                        equipmentId: equipment.id,
                        lastPoint: point ? { x: point.x, y: point.y } : null,
                      };
                      setDraggingEquipmentId(equipment.id);

                      if (point) {
                        setLocalMapOverrides((current) => ({
                          ...current,
                          [equipment.id]: {
                            x: point.x,
                            y: point.y,
                          },
                        }));
                      }
                    }}
                    onClick={() => setSelectedEquipmentId(equipment.id)}
                    title={
                      isEditMode
                        ? `${equipment.clientName} · ${equipment.serial} · arrastra para ajustar`
                        : `${equipment.clientName} · ${equipment.serial}`
                    }
                  >
                    <span className="equipment-monitor__marker-pulse" />
                    <span className="equipment-monitor__marker-core" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <aside className="equipment-monitor__focus-panel">
          {selectedEquipment ? (
            <>
              <div className={`equipment-monitor__status-pill equipment-monitor__status-pill--${selectedEquipment.status}`}>
                {selectedEquipment.status === 'fatal'
                  ? 'Fatal'
                  : selectedEquipment.status === 'warning'
                    ? 'Warning'
                    : 'Operativo'}
              </div>
              <h3>{selectedEquipment.clientName}</h3>
              <p className="equipment-monitor__focus-subtitle">
                {selectedEquipment.serial} · {selectedEquipment.model}
              </p>
              <div className="equipment-monitor__focus-actions">
                <button
                  type="button"
                  className={`button-primary ${isSupremoLaunchEnabled() ? '' : 'inactive'}`.trim()}
                  onClick={() => void launchSupremo()}
                  disabled={launchingSupremo || !isSupremoLaunchEnabled()}
                >
                  <img src={SUPREMO_ICON_URL} alt="" className="equipment-monitor__focus-action-icon" />
                  {launchingSupremo ? 'Abriendo Supremo...' : 'Conectar con Supremo'}
                </button>
              </div>
              {supremoFeedback ? (
                <p
                  className={`equipment-monitor__focus-feedback equipment-monitor__focus-feedback--${supremoFeedback.tone}`}
                >
                  {supremoFeedback.message}
                </p>
              ) : null}

              <div className="equipment-monitor__focus-meta">
                <div>
                  <span>Estado</span>
                  <strong>{selectedEquipment.normalizedState || 'Sin dato'}</strong>
                </div>
                <div>
                  <span>Ciudad</span>
                  <strong>{selectedEquipment.city || selectedEquipment.municipality || 'Sin dato'}</strong>
                </div>
                <div>
                  <span>Último error</span>
                  <strong>{formatDateTime(selectedEquipment.lastErrorAt)}</strong>
                </div>
                <div>
                  <span>Señal de telemetría</span>
                  <strong>{formatDateTime(selectedEquipment.telemetry?.updated_at)}</strong>
                </div>
              </div>

              <div className="equipment-monitor__focus-section">
                <h4>Ubicación del equipo</h4>
                <p>{selectedEquipment.address || 'Dirección no registrada.'}</p>
                <p className="equipment-monitor__focus-location">
                  {[selectedEquipment.city, selectedEquipment.municipality, selectedEquipment.normalizedState, selectedEquipment.postalCode]
                    .filter(Boolean)
                    .join(' · ') || 'Sin ciudad, estado o código postal.'}
                </p>
                {selectedEquipment.geoDisplayName ? (
                  <p className="equipment-monitor__focus-location">
                    Georreferencia: {selectedEquipment.geoDisplayName}
                    {selectedEquipment.geoPrecision ? ` · ${selectedEquipment.geoPrecision}` : ''}
                  </p>
                ) : null}
                {selectedEquipmentHasManualOverride ? (
                  <p className="equipment-monitor__focus-location">Este punto tiene un ajuste manual activo.</p>
                ) : null}
              </div>

              <div className="equipment-monitor__focus-section">
                <h4>Errores vigentes</h4>
                {selectedEquipment.currentErrors.length ? (
                  <div className="equipment-monitor__event-list">
                    {selectedEquipment.currentErrors.map((row) => (
                      <article key={row.id} className="equipment-monitor__event-card">
                        <div className="equipment-monitor__event-head">
                          <span className={`equipment-monitor__event-level equipment-monitor__event-level--${coerceStatus(row.tipo_mensaje)}`}>
                            {row.tipo_mensaje || 'ok'}
                          </span>
                          <span>{formatDateTime(getEventTimestamp(row))}</span>
                        </div>
                        <strong>{row.codigo_error ? `E${row.codigo_error}` : 'Evento sin código'}</strong>
                        <p>{row.descripcion_error || 'Sin descripción registrada.'}</p>
                        <small>{[row.seccion_error, row.monitor_name, row.machine_name].filter(Boolean).join(' · ')}</small>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="equipment-monitor__empty-state">
                    No hay warnings ni fatales vigentes para esta serie. El equipo aparece verde por default.
                  </div>
                )}
              </div>

              <div className="equipment-monitor__focus-section">
                <h4>Historial reciente</h4>
                {selectedEquipment.recentErrors.length ? (
                  <div className="equipment-monitor__event-list equipment-monitor__event-list--compact">
                    {selectedEquipment.recentErrors.map((row) => (
                      <article key={`history-${row.id}`} className="equipment-monitor__event-card equipment-monitor__event-card--compact">
                        <div className="equipment-monitor__event-head">
                          <strong>{row.codigo_error ? `E${row.codigo_error}` : 'Evento'}</strong>
                          <span>{formatRelativeTime(getEventTimestamp(row))}</span>
                        </div>
                        <p>{row.descripcion_error || 'Sin descripción registrada.'}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="equipment-monitor__empty-state">No existe historial de errores para esta serie.</div>
                )}
              </div>

              <div className="equipment-monitor__focus-section">
                <h4>Pruebas registradas</h4>
                {selectedReagentSummary ? (
                  <>
                    <div className="equipment-monitor__focus-kpis">
                      <div className="equipment-monitor__focus-kpi">
                        <span>Pruebas totales</span>
                        <strong>{formatInteger(selectedReagentSummary.pruebas_registradas)}</strong>
                      </div>
                      <div className="equipment-monitor__focus-kpi">
                        <span>Muestras de paciente</span>
                        <strong>{formatInteger(selectedReagentSummary.muestras_paciente)}</strong>
                      </div>
                      <div className="equipment-monitor__focus-kpi">
                        <span>Valor estimado</span>
                        <strong>{formatCurrency(selectedReagentSummary.valor_estimado_total_con_iva)}</strong>
                      </div>
                      <div className="equipment-monitor__focus-kpi">
                        <span>Último registro</span>
                        <strong>{formatDateTime(selectedReagentSummary.last_event_at)}</strong>
                      </div>
                    </div>
                    <p className="equipment-monitor__focus-location">
                      {formatInteger(selectedReagentSummary.pruebas_distintas_con_precio)} pruebas con precio y{' '}
                      {formatInteger(selectedReagentSummary.pruebas_distintas_sin_precio)} sin precio catalogado.
                    </p>
                    {readNumericValue(selectedReagentSummary.valor_estimado_total_con_iva_min) > 0 &&
                    readNumericValue(selectedReagentSummary.valor_estimado_total_con_iva_max) >
                      readNumericValue(selectedReagentSummary.valor_estimado_total_con_iva_min) ? (
                      <p className="equipment-monitor__focus-location">
                        Rango estimado con IVA: {formatCurrency(selectedReagentSummary.valor_estimado_total_con_iva_min)} a{' '}
                        {formatCurrency(selectedReagentSummary.valor_estimado_total_con_iva_max)}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <div className="equipment-monitor__empty-state">
                    Esta serie todavía no tiene resumen cargado en <code>v_equipment_reagent_consumption_summary</code>.
                  </div>
                )}

                {loadingReagentRows ? (
                  <div className="equipment-monitor__empty-state">Cargando detalle de pruebas...</div>
                ) : reagentLoadError ? (
                  <div className="equipment-monitor__empty-state">{reagentLoadError}</div>
                ) : selectedReagentRowsSorted.length ? (
                  <div className="equipment-monitor__consumption-list">
                    {selectedReagentRowsSorted.map((row) => {
                      const hasPrice = Boolean(row.tiene_precio);
                      return (
                        <article
                          key={`${row.numero_serie}-${row.test_name}`}
                          className={`equipment-monitor__consumption-card ${hasPrice ? '' : 'equipment-monitor__consumption-card--muted'}`.trim()}
                        >
                          <div className="equipment-monitor__event-head">
                            <strong>{row.test_name}</strong>
                            <span>{hasPrice ? formatCurrency(row.valor_estimado_total_con_iva) : 'Sin precio'}</span>
                          </div>
                          <p>
                            {row.reactivo_codigo_referencia
                              ? `${row.reactivo_codigo_referencia} · ${row.reactivo_descripcion_referencia || row.descripcion_catalogo_normalizada || 'Catálogo'}`
                              : 'Sin reactivo/precio catalogado para esta prueba.'}
                          </p>
                          <div className="equipment-monitor__consumption-metrics">
                            <span>{formatInteger(row.pruebas_registradas)} pruebas</span>
                            <span>{formatInteger(row.muestras_paciente)} pacientes</span>
                            <span>{formatInteger(row.calibraciones)} calibraciones</span>
                            <span>{formatInteger(row.controles)} controles</span>
                          </div>
                          <small>
                            {row.presentacion_referencia
                              ? `${row.presentacion_referencia} · rendimiento ${formatInteger(row.rendimiento_referencia)}`
                              : 'Sin presentación de referencia'}
                            {readNumericValue(row.valor_estimado_total_con_iva_min) > 0 &&
                            readNumericValue(row.valor_estimado_total_con_iva_max) >
                              readNumericValue(row.valor_estimado_total_con_iva_min)
                              ? ` · rango ${formatCurrency(row.valor_estimado_total_con_iva_min)} a ${formatCurrency(row.valor_estimado_total_con_iva_max)}`
                              : ''}
                          </small>
                        </article>
                      );
                    })}
                  </div>
                ) : selectedReagentSummary ? (
                  <div className="equipment-monitor__empty-state">
                    No hay filas detalladas para esta serie en <code>v_equipment_reagent_consumption_detail</code>.
                  </div>
                ) : null}
              </div>

              <div className="equipment-monitor__focus-section">
                <h4>Telemetría de insumos</h4>
                {selectedEquipment.telemetry ? (
                  <>
                    <div className="equipment-monitor__tag-list">
                      {renderElectrodeState('Pack ISE', selectedEquipment.telemetry.pack_ise_sn)}
                      {renderElectrodeState('REF', selectedEquipment.telemetry.ref_electrode)}
                      {renderElectrodeState('Na', selectedEquipment.telemetry.na_electrode)}
                      {renderElectrodeState('K', selectedEquipment.telemetry.k_electrode)}
                      {renderElectrodeState('Cl', selectedEquipment.telemetry.cl_electrode)}
                      {renderElectrodeState('Li', selectedEquipment.telemetry.li_electrode)}
                    </div>
                    <p className="equipment-monitor__focus-location">
                      Último evento de consumo: {formatDateTime(selectedEquipment.telemetry.ultimo_evento_consumo_at)}
                    </p>
                  </>
                ) : (
                  <div className="equipment-monitor__empty-state">
                    Esta serie todavía no reporta estado en <code>estado_insumos_equipo_actual</code>.
                  </div>
                )}
              </div>

              <div className="equipment-monitor__focus-section">
                <h4>Consumo de rotores</h4>
                {selectedEquipment.rotorSummary ? (
                  <div className="equipment-monitor__rotor-card">
                    <strong>{selectedEquipment.rotorSummary.rotor_change_count} cambios</strong>
                    <span>{formatRotorBucket(selectedEquipment.rotorSummary.bucket_month)}</span>
                    <small>Último cambio: {formatDateTime(selectedEquipment.rotorSummary.last_change_at)}</small>
                  </div>
                ) : (
                  <div className="equipment-monitor__empty-state">
                    No hay resumen de rotor cargado para esta serie.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="equipment-monitor__empty-state">
              Ajusta los filtros o selecciona un punto del mapa para ver su detalle.
            </div>
          )}
        </aside>
      </section>

      <section className="equipment-monitor__lists-grid">
        <div className="equipment-monitor__list-panel">
          <div className="equipment-monitor__list-header">
            <h3>Alertas activas</h3>
            <span>{criticalEquipments.length} equipos con señal no verde</span>
          </div>
          {criticalEquipments.length ? (
            criticalEquipments.map((equipment) => (
              <button
                key={`critical-${equipment.id}-${equipment.serial}`}
                type="button"
                className="equipment-monitor__list-item"
                onClick={() => setSelectedEquipmentId(equipment.id)}
              >
                <div>
                  <strong>{equipment.clientName}</strong>
                  <p>{equipment.serial} · {equipment.model}</p>
                </div>
                <span className={`equipment-monitor__event-level equipment-monitor__event-level--${equipment.status}`}>
                  {equipment.status}
                </span>
              </button>
            ))
          ) : (
            <div className="equipment-monitor__empty-state">No hay alertas activas en este corte.</div>
          )}
        </div>

        <div className="equipment-monitor__list-panel">
          <div className="equipment-monitor__list-header">
            <h3>Pendientes de georreferencia</h3>
            <span>{unmappedEquipments.length} equipos fuera del lienzo</span>
          </div>
          {unmappedEquipments.length ? (
            unmappedEquipments.map((equipment) => (
              <button
                key={`unmapped-${equipment.id}-${equipment.serial}`}
                type="button"
                className="equipment-monitor__list-item"
                onClick={() => setSelectedEquipmentId(equipment.id)}
              >
                <div>
                  <strong>{equipment.clientName}</strong>
                  <p>{equipment.serial} · {equipment.address || equipment.normalizedState || 'Sin dirección'}</p>
                </div>
                <span className="equipment-monitor__event-level equipment-monitor__event-level--muted">sin mapa</span>
              </button>
            ))
          ) : (
            <div className="equipment-monitor__empty-state">Todos los equipos visibles hoy ya encontraron un punto en el mapa.</div>
          )}
        </div>
      </section>
    </div>
  );
}
