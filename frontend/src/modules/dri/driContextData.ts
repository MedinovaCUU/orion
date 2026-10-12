import { supabase } from '../../supabaseClient';
import type { SatReportSummary } from '../sat-report/satReportTypes';
import { loadLatestEquipmentQc } from '../sat-report/satReportData';
import type { CurrentEquipmentErrorStateRow, EquipmentErrorRow } from '../equipment-monitoring/monitoringDerivations';
import type { AdvisoryMetadata } from '../../components/escalatedAdvisoryThread';
import type { DriAdvisoryCase, DriAdvisoryTicket, DriMonitoringContext } from './utils/sourcePatches';

/**
 * Lecturas de contexto para el caso DRI. Ninguna escribe; todas toleran errores de RLS devolviendo
 * resultados vacíos con un aviso, para que la pantalla siga operando con captura manual.
 */

const serialCandidates = (serial: string) => {
  const trimmed = serial.trim();
  const compact = trimmed.replace(/\s+/g, '').toUpperCase();
  return Array.from(new Set([trimmed, compact, compact.toLowerCase()].filter(Boolean)));
};

export interface DriSatLoadResult {
  summary: SatReportSummary | null;
  error: string | null;
}

/** Último reporte SAT importado para una serie concreta (no el último global). */
export const loadLatestSatReportForSerial = async (serial: string): Promise<DriSatLoadResult> => {
  const candidates = serialCandidates(serial);
  if (!candidates.length) return { summary: null, error: null };
  const { data, error } = await supabase
    .from('sat_report_imports')
    .select('normalized_payload, created_at')
    .in('serial_number', candidates)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { summary: null, error: error.message };
  const summary = (data?.normalized_payload as SatReportSummary | undefined) || null;
  if (!summary) return { summary: null, error: null };
  const qcResults = await loadLatestEquipmentQc(summary.serialNumber);
  return { summary: { ...summary, qcResults: qcResults.length ? qcResults : summary.qcResults || [] }, error: null };
};

/** Enriquecimiento del último reporte global con los controles vigentes de su serie. */
export const withLatestQc = async (summary: SatReportSummary): Promise<SatReportSummary> => {
  const qcResults = await loadLatestEquipmentQc(summary.serialNumber);
  return { ...summary, qcResults: qcResults.length ? qcResults : summary.qcResults || [] };
};

interface EquipmentMasterRow {
  id: string;
  numero_serie: string | null;
  modelo: string | null;
  pais: string | null;
  estado: string | null;
  ciudad: string | null;
  municipio: string | null;
  supremo_enabled: boolean | null;
  clientes: { razon_social: string | null } | Array<{ razon_social: string | null }> | null;
}

const clientName = (relation: EquipmentMasterRow['clientes']) => {
  if (!relation) return null;
  const row = Array.isArray(relation) ? relation[0] : relation;
  return row?.razon_social?.trim() || null;
};

const describeLocation = (row: EquipmentMasterRow) =>
  [row.ciudad || row.municipio, row.estado, row.pais].filter(Boolean).join(', ') || null;

/** Identidad, estado vigente y últimos eventos del monitor para una serie. */
export const loadMonitoringContextForSerial = async (serial: string, { recentLimit = 20 } = {}): Promise<DriMonitoringContext> => {
  const candidates = serialCandidates(serial);
  const loadedAt = new Date().toISOString();
  const context: DriMonitoringContext = { serial: serial.trim(), loadedAt, equipment: null, currentState: null, recentErrors: [], warnings: [] };
  if (!candidates.length) return context;

  const [equipmentResponse, stateResponse, errorsResponse] = await Promise.all([
    supabase
      .from('equipos')
      .select('id,numero_serie,modelo,pais,estado,ciudad,municipio,supremo_enabled,clientes(razon_social)')
      .in('numero_serie', candidates)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('estado_errores_equipo_actual')
      .select('numero_serie,modelo,monitor_name,machine_name,estado_actual,tipo_mensaje,codigo_estado,descripcion_estado,errores_activos,error_principal_codigo,error_principal_descripcion,error_principal_seccion,last_event_at,resolved_at,updated_at')
      .in('numero_serie', candidates)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('monitoreo_errores_equipos')
      .select('id,numero_serie,modelo,codigo_error,descripcion_error,seccion_error,tipo_mensaje,detected_at,created_at,monitor_name,machine_name')
      .in('numero_serie', candidates)
      .order('detected_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(recentLimit),
  ]);

  if (equipmentResponse.error) context.warnings.push(`Maestro de equipos no disponible: ${equipmentResponse.error.message}`);
  else if (equipmentResponse.data) {
    const row = equipmentResponse.data as unknown as EquipmentMasterRow;
    context.equipment = {
      id: row.id,
      serial: row.numero_serie || serial.trim(),
      model: row.modelo,
      clientName: clientName(row.clientes),
      location: describeLocation(row),
      supremoEnabled: Boolean(row.supremo_enabled),
    };
  }
  if (stateResponse.error) context.warnings.push(`Estado del monitor no disponible: ${stateResponse.error.message}`);
  else context.currentState = (stateResponse.data as CurrentEquipmentErrorStateRow | null) || null;
  if (errorsResponse.error) context.warnings.push(`Historial de alarmas no disponible: ${errorsResponse.error.message}`);
  else context.recentErrors = (errorsResponse.data || []) as EquipmentErrorRow[];

  return context;
};

interface AdvisoryRow {
  id: string;
  ticket_id: string | null;
  solicitante_nombre_snapshot: string | null;
  plataforma_snapshot: string | null;
  actividad: string | null;
  averia: string | null;
  detalle_averia: string | null;
  area: string;
  estado: string;
  pasos_seguidos: string | null;
  ajustes_realizados: string | null;
  acciones_tomadas: string | null;
  consulta_escalada: string;
  respuesta_trainer: string | null;
  creado_en: string;
  actualizado_en: string;
  metadata: AdvisoryMetadata | null;
}

export interface DriAdvisoryLoadResult {
  cases: DriAdvisoryCase[];
  error: string | null;
}

const chunk = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
};

/** Asesorías recientes con su ticket y, cuando existe, el modelo/cliente del maestro de equipos. */
export const loadAdvisoryCases = async ({ limit = 80 }: { limit?: number } = {}): Promise<DriAdvisoryLoadResult> => {
  const { data, error } = await supabase
    .from('asesorias_escaladas')
    .select(
      'id, ticket_id, solicitante_nombre_snapshot, plataforma_snapshot, actividad, averia, detalle_averia, area, estado, pasos_seguidos, ajustes_realizados, acciones_tomadas, consulta_escalada, respuesta_trainer, creado_en, actualizado_en, metadata',
    )
    .order('creado_en', { ascending: false })
    .limit(limit);
  if (error) return { cases: [], error: error.message };
  const rows = (data || []) as unknown as AdvisoryRow[];

  const ticketIds = Array.from(new Set(rows.map((row) => row.ticket_id).filter((id): id is string => Boolean(id))));
  const ticketById = new Map<string, DriAdvisoryTicket>();
  for (const ids of chunk(ticketIds, 100)) {
    const ticketsResponse = await supabase
      .from('tickets')
      .select('id, asunto, descripcion, estado, creado_en, numero_serie_equipo, nombre_cliente_guest')
      .in('id', ids);
    if (ticketsResponse.error) continue; // RLS puede ocultar tickets: la asesoría sigue siendo utilizable.
    (ticketsResponse.data || []).forEach((ticket) => ticketById.set(String(ticket.id), ticket as DriAdvisoryTicket));
  }

  const serials = Array.from(
    new Set(Array.from(ticketById.values()).map((ticket) => ticket.numero_serie_equipo?.trim()).filter((serial): serial is string => Boolean(serial))),
  );
  const equipmentBySerial = new Map<string, { model: string | null; clientName: string | null }>();
  for (const batch of chunk(serials, 100)) {
    const equipmentResponse = await supabase
      .from('equipos')
      .select('numero_serie, modelo, clientes(razon_social)')
      .in('numero_serie', batch);
    if (equipmentResponse.error) continue;
    (equipmentResponse.data || []).forEach((row) => {
      const typed = row as unknown as EquipmentMasterRow;
      if (typed.numero_serie) equipmentBySerial.set(typed.numero_serie.trim(), { model: typed.modelo, clientName: clientName(typed.clientes) });
    });
  }

  const cases = rows.map<DriAdvisoryCase>((row) => {
    const ticket = row.ticket_id ? ticketById.get(row.ticket_id) || null : null;
    const equipment = ticket?.numero_serie_equipo ? equipmentBySerial.get(ticket.numero_serie_equipo.trim()) || null : null;
    return {
      id: row.id,
      ticketId: row.ticket_id,
      requesterName: row.solicitante_nombre_snapshot || '',
      platform: row.plataforma_snapshot,
      area: row.area,
      status: row.estado,
      activity: row.actividad,
      failure: row.averia,
      failureDetail: row.detalle_averia,
      stepsTaken: row.pasos_seguidos,
      adjustments: row.ajustes_realizados,
      actionsTaken: row.acciones_tomadas,
      escalatedQuery: row.consulta_escalada,
      trainerAnswer: row.respuesta_trainer,
      createdAt: row.creado_en,
      updatedAt: row.actualizado_en,
      metadata: row.metadata,
      ticket,
      equipmentModel: equipment?.model || null,
      clientName: equipment?.clientName || ticket?.nombre_cliente_guest || null,
    };
  });

  return { cases, error: null };
};
