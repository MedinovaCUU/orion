/**
 * Tipos de filas de Supabase y derivaciones puras del módulo de monitoreo: índices por serie,
 * lista de equipos, resumen, orden de prioridad y filtro. Sin React ni red: se prueba en Node.
 */
import type { GlobeEquipmentNode } from './GlobalEquipmentGlobe';
import { isBa400Serial } from './ba400AlarmMapping';
import { BPL_TONE_LABELS, type BplEventRow, type BplSerialSummary } from './bplEvents';
import { indexBplOverview } from './bplEventsData';
import { getNormalizedStateLabel, resolveEquipmentGeoPoint, type EquipmentLocationInput } from './mexicoGeo';
import { CURRENT_REAGENT_BUCKET_MONTH, showMonitoringErrorCodes } from './monitorFormat';

export type EquipmentHealthStatus = 'ok' | 'warning' | 'fatal';
export type EquipmentMarkerTone = EquipmentHealthStatus | 'muted' | 'supremo';
export type NumericLike = number | string | null;

export interface RemoteLaunchFeedback {
  tone: 'success' | 'warning' | 'error';
  message: string;
}

export interface ClientRelation {
  razon_social: string | null;
}

/** Registro maestro del equipo: identidad, cliente, ubicación y configuración de Supremo. */
export interface EquipmentRow {
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
  supremo_id?: string | null;
  supremo_alias?: string | null;
  supremo_enabled?: boolean | null;
}

/** Coordenadas de la vista de geocodificación; se relacionan por ID del registro, no por serie. */
export interface EquipmentMapLocationRow {
  equipment_id: string;
  locality_cache_key: string | null;
  geo_latitude: number | null;
  geo_longitude: number | null;
  geo_boundingbox: unknown;
  geo_precision: string | null;
  geo_display_name: string | null;
}

/** Evento histórico enviado por el monitor; no implica por sí solo que siga activo. */
export interface EquipmentErrorRow {
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

export interface CurrentEquipmentErrorDetail {
  codigo_error: string | null;
  descripcion_error: string | null;
  seccion_error: string | null;
  tipo_mensaje: string | null;
}

/** Estado vigente publicado por el monitor, con lista de errores activos y fecha de transición. */
export interface CurrentEquipmentErrorStateRow {
  numero_serie: string;
  modelo: string | null;
  monitor_name: string | null;
  machine_name: string | null;
  estado_actual: string | null;
  tipo_mensaje: string | null;
  codigo_estado: string | null;
  descripcion_estado: string | null;
  errores_activos: CurrentEquipmentErrorDetail[] | null;
  error_principal_codigo: string | null;
  error_principal_descripcion: string | null;
  error_principal_seccion: string | null;
  last_event_at: string | null;
  resolved_at: string | null;
  updated_at: string | null;
}

/** Último estado de insumos: cartucho ISE, electrodos y marcas de tiempo del monitor de consumos. */
export interface SupplySnapshotRow {
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

/** Conteo mensual de cambios de rotor, no un registro por cada evento de cambio. */
export interface RotorSummaryRow {
  numero_serie: string;
  bucket_month: string;
  rotor_change_count: number;
  last_change_at: string | null;
  updated_at: string;
}

/** Totales por equipo y mes; los importes estimados proceden de las vistas SQL de valoración. */
export interface ReagentConsumptionSummaryRow {
  numero_serie: string;
  bucket_month: string;
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

/** Desglose mensual por técnica con conteos y referencias de catálogo/precio, cuando existen. */
export interface ReagentConsumptionDetailRow {
  numero_serie: string;
  bucket_month: string;
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

/** Corte de las respuestas cargadas en un refresco; no es una transacción única de base de datos. */
export interface MonitoringSnapshot {
  equipments: EquipmentRow[];
  errors: EquipmentErrorRow[];
  currentErrorStates: CurrentEquipmentErrorStateRow[];
  supplies: SupplySnapshotRow[];
  rotors: RotorSummaryRow[];
  reagentSummaries: ReagentConsumptionSummaryRow[];
  /** Eventos BPL sin payload (últimos 90 días) para colorear el catálogo; el detalle se carga por serie. */
  bplRows: BplEventRow[];
  refreshedAt: string;
}

// Índices intermedios por serie para evitar recorrer todo el historial por cada equipo.
export interface IndexedErrorState {
  status: EquipmentHealthStatus;
  currentRows: EquipmentErrorRow[];
  recentRows: EquipmentErrorRow[];
  historyRows: EquipmentErrorRow[];
  lastDetectedAt: string | null;
}

export interface IndexedCurrentErrorState {
  status: EquipmentHealthStatus;
  currentRows: EquipmentErrorRow[];
  lastEventAt: string | null;
  model: string | null;
}

/** Modelo de presentación que reúne registro, errores, insumos, consumos y ubicación. */
export interface MonitoringEquipment {
  id: string;
  serial: string;
  clientName: string;
  model: string;
  status: EquipmentHealthStatus;
  markerTone: EquipmentMarkerTone;
  hasSupremoLink: boolean;
  hasSupabaseSignal: boolean;
  hasMonitoringHeartbeat: boolean;
  geoPoint: { latitude: number; longitude: number } | null;
  country: string | null;
  normalizedState: string | null;
  city: string | null;
  municipality: string | null;
  address: string | null;
  postalCode: string | null;
  serviceEndedAt: string | null;
  geoPrecision: string | null;
  geoDisplayName: string | null;
  currentErrors: EquipmentErrorRow[];
  errorSource: 'current' | 'history' | 'none';
  recentErrors: EquipmentErrorRow[];
  alarmHistory: EquipmentErrorRow[];
  lastErrorAt: string | null;
  telemetry: SupplySnapshotRow | null;
  rotorSummary: RotorSummaryRow | null;
  reagentSummary: ReagentConsumptionSummaryRow | null;
  reagentSummaries: ReagentConsumptionSummaryRow[];
  bpl: BplSerialSummary | null;
  searchText: string;
  /** Precalculados para ordenar y agrupar sin trabajo por comparación. */
  isBa400: boolean;
  lastErrorTs: number;
  priorityRank: number;
  priorityAlarmCount: number;
  monthlyTests: number;
}

/** Hash FNV-1a de 32 bits: barato y suficiente para detectar cambios entre cortes consecutivos. */
export const hashText = (text: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
};

export const maxField = <T,>(rows: T[], read: (row: T) => string | number | null | undefined) =>
  rows.reduce<string>((max, row) => {
    const value = read(row);
    const text = value === null || value === undefined ? '' : String(value);
    return text > max ? text : max;
  }, '');

/** Adapta el equipo al contrato del globo y excluye aquellos sin coordenadas resolubles. */
export const toGlobeEquipmentNode = (equipment: MonitoringEquipment): GlobeEquipmentNode | null => {
  if (!equipment.geoPoint) {
    return null;
  }

  return {
    id: equipment.id,
    serial: equipment.serial,
    clientName: equipment.clientName,
    model: equipment.model,
    status: equipment.status,
    tone: equipment.markerTone,
    heartbeat: equipment.hasMonitoringHeartbeat,
    country: equipment.country,
    city: equipment.city,
    municipality: equipment.municipality,
    state: equipment.normalizedState,
    latitude: equipment.geoPoint.latitude,
    longitude: equipment.geoPoint.longitude,
  };
};

// Ventana de señal reciente: no equivale a un ping ni confirma conectividad en este instante.
export const ACTIVE_TELEMETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

export const STATUS_PRIORITY: Record<EquipmentHealthStatus, number> = {
  ok: 1,
  warning: 2,
  fatal: 3,
};

/** Comprueba la ventana de 24 h; esta regla también acepta fechas futuras si los relojes difieren. */
export const isActiveMonitoringTimestamp = (value?: string | null) => {
  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp <= ACTIVE_TELEMETRY_WINDOW_MS;
};

/** Tolera la relación de Supabase tanto como objeto como arreglo. */
export const normalizeClientName = (relation: EquipmentRow['clientes']) => {
  if (Array.isArray(relation)) {
    return relation[0]?.razon_social || 'Cliente sin registrar';
  }

  return relation?.razon_social || 'Cliente sin registrar';
};

export const getEventTimestamp = (row: EquipmentErrorRow) => row.detected_at || row.created_at || '';

/** Reconoce fatal/warning; cualquier otro valor, incluso ausente, se representa como ok. */
export const coerceStatus = (rawValue?: string | null): EquipmentHealthStatus => {
  if (rawValue === 'fatal') {
    return 'fatal';
  }

  if (rawValue === 'warning') {
    return 'warning';
  }

  return 'ok';
};

/** Clave común del cruce: elimina espacios y diferencias de mayúsculas entre tablas. */
export const normalizeSerial = (value?: string | null) => {
  const normalized = (value || '').trim().toUpperCase().replace(/\s+/g, '');
  return normalized || null;
};

// Solo comprueba que Supremo esté configurado y habilitado; no consulta si está conectado.
export const hasSupremoConnection = (equipment: Pick<EquipmentRow, 'supremo_id' | 'supremo_enabled'>) =>
  Boolean(equipment.supremo_enabled && String(equipment.supremo_id || '').trim());

/** Prioriza alarmas sobre señal reciente, luego Supremo configurado y finalmente gris sin señal. */
export const resolveMarkerTone = (
  hasSupabaseSignal: boolean,
  hasSupremoLink: boolean,
  status: EquipmentHealthStatus,
): EquipmentMarkerTone => {
  if (status === 'fatal' || status === 'warning') {
    return status;
  }

  if (hasSupabaseSignal) {
    return 'ok';
  }

  if (hasSupremoLink) {
    return 'supremo';
  }

  return 'muted';
};

export const getStatusLabel = (equipment: Pick<MonitoringEquipment, 'status' | 'markerTone' | 'hasSupabaseSignal' | 'hasSupremoLink'>) => {
  if (equipment.status === 'fatal') {
    return 'Fatal';
  }

  if (equipment.status === 'warning') {
    return 'Warning';
  }

  if (!equipment.hasSupabaseSignal) {
    return equipment.hasSupremoLink ? 'Supremo listo' : 'Sin señal';
  }

  return 'Operativo';
};

export const compareBucketMonthDesc = (left: string, right: string) => right.localeCompare(left, 'es-MX');

export const compareErrorsDesc = (left: EquipmentErrorRow, right: EquipmentErrorRow) => {
  const timeDiff = new Date(getEventTimestamp(right)).getTime() - new Date(getEventTimestamp(left)).getTime();
  if (timeDiff !== 0) {
    return timeDiff;
  }

  return right.id - left.id;
};

/**
 * Respaldo basado en historial: agrupa por serie, toma la fecha más reciente y
 * conserva la mayor gravedad de esa fecha, además de seis eventos para el detalle.
 */
export const buildErrorIndex = (rows: EquipmentErrorRow[]) => {
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
      historyRows: serialRows,
      lastDetectedAt,
    });
  });

  return indexed;
};

/** Conserva la primera fila por serie; la consulta las entrega por updated_at descendente. */
export const buildRotorIndex = (rows: RotorSummaryRow[]) => {
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

/** Reúne los meses de cada serie y los ordena del más reciente al más antiguo. */
export const buildReagentSummaryIndex = (rows: ReagentConsumptionSummaryRow[]) => {
  const indexed = new Map<string, ReagentConsumptionSummaryRow[]>();

  rows.forEach((row) => {
    const normalizedSerial = normalizeSerial(row.numero_serie);
    if (!normalizedSerial) {
      return;
    }

    const current = indexed.get(normalizedSerial) || [];
    current.push(row);
    indexed.set(normalizedSerial, current);
  });

  indexed.forEach((serialRows) => {
    serialRows.sort((left, right) => {
      const bucketDiff = compareBucketMonthDesc(left.bucket_month || '', right.bucket_month || '');
      if (bucketDiff !== 0) {
        return bucketDiff;
      }

      return new Date(right.last_event_at || 0).getTime() - new Date(left.last_event_at || 0).getTime();
    });
  });

  return indexed;
};

export const isBa400Equipment = (equipment: { model: string | null; serial: string }) =>
  /\bBA[\s-]*400\b/i.test(equipment.model || '') || isBa400Serial(equipment.serial);

/**
 * Adapta el estado vigente al formato de las tarjetas históricas. Si el estado
 * es ok no muestra errores activos; los IDs negativos son solo identificadores de UI.
 */
export const buildCurrentErrorStateIndex = (rows: CurrentEquipmentErrorStateRow[]) => {
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

/**
 * Parte del catálogo de equipos y cruza telemetría por serie normalizada.
 * La telemetría de una serie no registrada no crea automáticamente un equipo.
 * La ubicación procede del registro/geocodificación, nunca del log ni de Supremo.
 */
export const buildEquipmentList = (snapshot: MonitoringSnapshot): MonitoringEquipment[] => {
  const errorIndex = buildErrorIndex(snapshot.errors);
  const currentStateIndex = buildCurrentErrorStateIndex(snapshot.currentErrorStates);
  const supplyIndex = new Map(
    snapshot.supplies
      .map((row) => [normalizeSerial(row.numero_serie), row] as const)
      .filter(([serial]) => Boolean(serial)) as Array<[string, SupplySnapshotRow]>,
  );
  const rotorIndex = buildRotorIndex(snapshot.rotors);
  const reagentSummaryIndex = buildReagentSummaryIndex(snapshot.reagentSummaries);
  const bplIndex = indexBplOverview(snapshot.bplRows);

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
      const geoPoint = resolveEquipmentGeoPoint(locationSeed);
      const clientName = equipment.id.startsWith('orion-demo-')
        ? 'DEMO · Equipo virtual, no instalado' : normalizeClientName(equipment.clientes);
      const errorState = normalizedSerial ? errorIndex.get(normalizedSerial) : undefined;
      const currentState = normalizedSerial ? currentStateIndex.get(normalizedSerial) : undefined;
      // El estado vigente tiene preferencia, incluso si su lista vacía confirma que no hay errores.
      const currentErrors = currentState?.currentRows || errorState?.currentRows || [];
      const recentErrors = errorState?.recentRows || [];
      const telemetry = normalizedSerial ? supplyIndex.get(normalizedSerial) || null : null;
      const rotorSummary = normalizedSerial ? rotorIndex.get(normalizedSerial) || null : null;
      const reagentSummaries = normalizedSerial ? reagentSummaryIndex.get(normalizedSerial) || [] : [];
      const reagentSummary =
        reagentSummaries.find((row) => row.bucket_month === CURRENT_REAGENT_BUCKET_MONTH) || null;
      const bpl = normalizedSerial ? bplIndex.get(normalizedSerial) || null : null;
      const hasSupremoLink = hasSupremoConnection(equipment);
      // Una actualización de insumos también activa el pulso visual; no exige una prueba nueva.
      const hasSupabaseSignal = [currentState?.lastEventAt, telemetry?.updated_at].some(isActiveMonitoringTimestamp);
      const status = currentState?.status || errorState?.status || 'ok';
      // Etiqueta de estado normalizada para búsqueda y ficha; el globo usa la georreferencia.
      const normalizedState =
        geoPoint?.normalizedState ||
        getNormalizedStateLabel(equipment.estado) ||
        getNormalizedStateLabel(equipment.direccion) ||
        getNormalizedStateLabel(equipment.municipio) ||
        getNormalizedStateLabel(equipment.ciudad) ||
        equipment.estado ||
        null;
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
        equipment.pais,
        equipment.ciudad,
        equipment.municipio,
        equipment.direccion,
        ...recentErrors.flatMap((row) => [
          showMonitoringErrorCodes ? row.codigo_error : null,
          row.descripcion_error,
          row.seccion_error,
        ]),
        bpl ? BPL_TONE_LABELS[bpl.tone] : null,
        ...(bpl?.rejectedTests || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return {
        id: equipment.id,
        serial,
        clientName,
        model,
        status,
        markerTone: resolveMarkerTone(hasSupabaseSignal, hasSupremoLink, status),
        hasSupremoLink,
        hasSupabaseSignal,
        hasMonitoringHeartbeat: hasSupabaseSignal,
        geoPoint: geoPoint ? { latitude: geoPoint.latitude, longitude: geoPoint.longitude } : null,
        country: equipment.pais,
        normalizedState,
        city: equipment.ciudad,
        municipality: equipment.municipio,
        address: equipment.direccion,
        postalCode: equipment.codigo_postal,
        serviceEndedAt: equipment.fecha_fin,
        geoPrecision: equipment.geo_precision || null,
        geoDisplayName: equipment.geo_display_name || null,
        currentErrors,
        // Distingue estado vigente de respaldo histórico dentro de la vista espacial.
        errorSource: currentState ? 'current' as const : errorState ? 'history' as const : 'none' as const,
        recentErrors,
        alarmHistory: errorState?.historyRows || [],
        lastErrorAt: currentState?.lastEventAt || errorState?.lastDetectedAt || null,
        telemetry,
        rotorSummary,
        reagentSummary,
        reagentSummaries,
        bpl,
        searchText,
        isBa400: isBa400Equipment({ model, serial }),
        lastErrorTs: Date.parse(currentState?.lastEventAt || errorState?.lastDetectedAt || '') || 0,
        priorityRank: currentState || errorState ? { fatal: 0, warning: 1, ok: 2 }[status] : 3,
        priorityAlarmCount: status === 'ok' ? 0 : currentErrors.filter((error) => error.tipo_mensaje?.toLowerCase() === status).length,
        monthlyTests: reagentSummary?.pruebas_registradas == null || !Number.isFinite(Number(reagentSummary.pruebas_registradas)) ? -1 : Number(reagentSummary.pruebas_registradas),
      };
    });
};


/** Firma barata del corte: las tablas pequeñas se hashean completas; las grandes por conteo y fila más reciente. */
export const buildSnapshotSignature = (snapshot: Omit<MonitoringSnapshot, 'refreshedAt'>) =>
  [
    hashText(JSON.stringify(snapshot.equipments)),
    hashText(JSON.stringify(snapshot.currentErrorStates)),
    hashText(JSON.stringify(snapshot.supplies)),
    hashText(JSON.stringify(snapshot.reagentSummaries)),
    hashText(JSON.stringify(snapshot.rotors)),
    `${snapshot.errors.length}:${snapshot.errors[0]?.id ?? ''}:${maxField(snapshot.errors, (row) => row.detected_at)}`,
    `${snapshot.bplRows.length}:${maxField(snapshot.bplRows, (row) => row.detected_at)}:${maxField(snapshot.bplRows, (row) => row.occurred_at)}`,
  ].join('|');

export interface MonitoringSummary {
  total: number;
  fatal: number;
  warning: number;
  ok: number;
  telemetryLive: number;
  bplRejected: number;
  withSignal: number;
}

/** Indicadores sobre todos los equipos cargados en una sola pasada. */
export const summarizeEquipments = (equipments: MonitoringEquipment[]): MonitoringSummary => {
  const summary: MonitoringSummary = { total: equipments.length, fatal: 0, warning: 0, ok: 0, telemetryLive: 0, bplRejected: 0, withSignal: 0 };
  const now = Date.now();
  equipments.forEach((equipment) => {
    if (equipment.status === 'fatal') summary.fatal += 1;
    else if (equipment.status === 'warning') summary.warning += 1;
    else summary.ok += 1;
    const updatedAt = equipment.telemetry?.updated_at;
    if (updatedAt && now - new Date(updatedAt).getTime() <= ACTIVE_TELEMETRY_WINDOW_MS) summary.telemetryLive += 1;
    if (equipment.bpl?.tone === 'rejected') summary.bplRejected += 1;
    if (equipment.hasSupabaseSignal) summary.withSignal += 1;
  });
  return summary;
};

export type EquipmentFilter = 'all' | 'fatal' | 'warning' | 'ok';

export const EQUIPMENT_FILTER_OPTIONS: Array<{ value: EquipmentFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'fatal', label: 'Fatal' },
  { value: 'warning', label: 'Warning' },
  { value: 'ok', label: 'Sin fatal' },
];

/** Filtra por estado y texto, y ordena por gravedad, fecha y serie. "ok" no exige señal reciente. */
export const filterEquipments = (equipments: MonitoringEquipment[], filter: EquipmentFilter, search: string) => {
  const needle = search.trim().toLowerCase();
  return equipments
    .filter((equipment) => (filter === 'all' ? true : equipment.status === filter))
    .filter((equipment) => (needle ? equipment.searchText.includes(needle) : true))
    .sort((left, right) => {
      const statusDiff = STATUS_PRIORITY[right.status] - STATUS_PRIORITY[left.status];
      if (statusDiff !== 0) return statusDiff;
      const timeDiff = right.lastErrorTs - left.lastErrorTs;
      if (timeDiff !== 0) return timeDiff;
      return left.serial.localeCompare(right.serial, 'es-MX');
    });
};

/** Orden del riel: Fatal → Warning → OK · alarmas del nivel → pruebas del mes → fecha → serie. */
export const sortByPriority = (equipments: MonitoringEquipment[]) =>
  [...equipments].sort((left, right) =>
    left.priorityRank - right.priorityRank
    || right.priorityAlarmCount - left.priorityAlarmCount
    || right.monthlyTests - left.monthlyTests
    || right.lastErrorTs - left.lastErrorTs
    || left.serial.localeCompare(right.serial));
