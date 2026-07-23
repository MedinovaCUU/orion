import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import {
  extractPlaneacionMeta,
  METADATA_DELIMITER,
  type EquipmentSummary,
} from './servicesPlanning';
import { formatCaseNumber } from './ticketCaseUtils';

export interface CaseTicketRecord {
  id: string;
  asunto: string;
  descripcion: string | null;
  estado: string;
  creado_en: string;
  actualizado_en?: string | null;
  numero_caso?: string | null;
  numero_serie_equipo?: string | null;
}

interface TicketCaseDetailProps {
  ticket: CaseTicketRecord;
  equipment: EquipmentSummary | null;
  canWrite: boolean;
  onChanged: () => void;
}

interface CaseLogRow {
  id: string;
  ticket_id: string;
  tipo: string;
  detalle: string;
  estado_resultante: string | null;
  visible_cliente: boolean;
  creado_en: string;
  profiles?: { nombre_completo?: string | null } | null;
  tickets?: { numero_caso?: string | null } | null;
}

interface ServiceHistoryRow {
  id: string;
  ticket_id?: string | null;
  motivo?: string | null;
  cda?: string | null;
  cds?: string | null;
  fecha_servicio?: string | null;
  creado_en: string;
  profiles?: { nombre_completo?: string | null } | null;
  servicios_refacciones?: Array<{
    cantidad: number;
    refacciones_catalogo?: { codigo_refaccion?: string | null; descripcion?: string | null } | null;
  }>;
}

interface SapServiceReportRow {
  id: string;
  report_number: string;
  activity_folio: string;
  service_kind: 'preventivo' | 'correctivo' | 'otro';
  description?: string | null;
  assistance_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  client_code?: string | null;
  client_name?: string | null;
  client_address?: string | null;
  equipment_model?: string | null;
  equipment_installed_on?: string | null;
  firmware_version?: string | null;
  software_version?: string | null;
  technician_name?: string | null;
  client_signer_name?: string | null;
  technician_signer_name?: string | null;
  total_duration_minutes: number;
  final_observation?: string | null;
  efforts?: Array<{ performed_on?: string | null; technician?: string | null; duration?: string | null }>;
  checklist?: Array<{ item?: string | null; value?: string | null }>;
  materials?: Array<{ code?: string | null; description?: string | null; quantity?: number | null }>;
  latest_storage_path?: string | null;
  last_imported_at: string;
  normalized_payload?: {
    file_name?: string | null;
    extraction_method?: string | null;
    client?: { country?: string | null } | null;
    equipment?: {
      description?: string | null;
      operating_system?: string | null;
    } | null;
  } | null;
}

type TimelineEntry = {
  id: string;
  timestamp: string;
  eyebrow: string;
  title: string;
  detail: string;
  meta?: string;
  tone: 'ticket' | 'activity' | 'service';
  documentPath?: string | null;
  sapReport?: SapServiceReportRow;
};

const activityLabels: Record<string, string> = {
  avance: 'Avance técnico',
  diagnostico: 'Diagnóstico',
  llamada: 'Llamada / contacto',
  visita: 'Visita',
  pieza: 'Pieza / refacción',
  escalamiento: 'Escalamiento',
  nota: 'Nota interna',
};

const statusLabels: Record<string, string> = {
  abierto: 'Abierto',
  en_progreso: 'En progreso',
  pendiente_piezas: 'Pendiente por piezas',
  en_observacion: 'En observación',
  cerrado: 'Cerrado',
};

export default function TicketCaseDetail({ ticket, equipment, canWrite, onChanged }: TicketCaseDetailProps) {
  const [logs, setLogs] = useState<CaseLogRow[]>([]);
  const [equipmentTickets, setEquipmentTickets] = useState<CaseTicketRecord[]>([]);
  const [services, setServices] = useState<ServiceHistoryRow[]>([]);
  const [sapReports, setSapReports] = useState<SapServiceReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [activityType, setActivityType] = useState('avance');
  const [detail, setDetail] = useState('');
  const [nextStatus, setNextStatus] = useState(ticket.estado);
  const [visibleToClient, setVisibleToClient] = useState(true);

  const serial = ticket.numero_serie_equipo?.trim() || '';

  const loadCase = useCallback(async () => {
    setLoading(true);
    const logQuery = supabase
      .from('ticket_bitacora')
      .select('*, profiles(nombre_completo), tickets(numero_caso)')
      .order('creado_en', { ascending: false });
    const requests = [
      serial ? logQuery.eq('numero_serie_equipo', serial) : logQuery.eq('ticket_id', ticket.id),
      serial
        ? supabase
            .from('tickets')
            .select('id, asunto, descripcion, estado, creado_en, actualizado_en, numero_caso, numero_serie_equipo')
            .eq('numero_serie_equipo', serial)
            .order('creado_en', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      serial
        ? supabase
            .from('servicios_historial')
            .select('*, profiles(nombre_completo), servicios_refacciones(cantidad, refacciones_catalogo(codigo_refaccion, descripcion))')
            .eq('no_serie', serial)
            .order('creado_en', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      serial
        ? supabase
            .from('sap_service_reports')
            .select('id, report_number, activity_folio, service_kind, description, assistance_type, start_date, end_date, client_code, client_name, client_address, equipment_model, equipment_installed_on, firmware_version, software_version, technician_name, client_signer_name, technician_signer_name, total_duration_minutes, final_observation, efforts, checklist, materials, latest_storage_path, last_imported_at, normalized_payload')
            .eq('equipment_serial', serial)
            .order('end_date', { ascending: false })
            .order('last_imported_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ] as const;

    const [logResult, ticketResult, serviceResult, sapReportResult] = await Promise.all(requests);
    setLogs((logResult.data || []) as CaseLogRow[]);
    setEquipmentTickets((ticketResult.data || []) as CaseTicketRecord[]);
    setServices((serviceResult.data || []) as ServiceHistoryRow[]);
    setSapReports((sapReportResult.data || []) as SapServiceReportRow[]);
    setLoading(false);
  }, [serial, ticket.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCase(), 0);
    return () => window.clearTimeout(timer);
  }, [loadCase]);

  const timeline = useMemo<TimelineEntry[]>(() => {
    const ticketEntries = equipmentTickets.map((row) => {
      const planning = extractPlaneacionMeta(row.descripcion);
      const cleanDescription = row.descripcion?.includes(METADATA_DELIMITER)
        ? row.descripcion.slice(0, row.descripcion.indexOf(METADATA_DELIMITER)).trim()
        : row.descripcion?.trim();
      const planningMeta = planning
        ? [
            planning.fecha_acordada
              ? `Fecha acordada: ${planning.fecha_acordada}`
              : planning.fecha_tentativa
                ? `Fecha tentativa: ${planning.fecha_tentativa}`
                : '',
            planning.ingeniero_csv ? `Ingeniero: ${planning.ingeniero_csv}` : '',
            planning.service_type ? `Servicio: ${planning.service_type}` : '',
            planning.status_values?.length ? `Condición: ${planning.status_values.join(', ')}` : '',
          ].filter(Boolean)
        : [];

      return {
        id: `ticket-${row.id}`,
        timestamp: row.creado_en,
        eyebrow: `${formatCaseNumber(row)}${planning ? ' · Planeación ORION' : ''}`,
        title: row.asunto,
        detail: cleanDescription || 'Ticket generado sin descripción adicional.',
        meta: [`Estado: ${statusLabels[row.estado] || row.estado}`, ...planningMeta].join(' · '),
        tone: 'ticket' as const,
      };
    });
    const logEntries = logs.map((row) => ({
      id: `log-${row.id}`,
      timestamp: row.creado_en,
      eyebrow: `${activityLabels[row.tipo] || row.tipo}${row.tickets?.numero_caso ? ` · Caso ${row.tickets.numero_caso}` : ''}`,
      title: row.profiles?.nombre_completo || 'Equipo técnico',
      detail: row.detalle,
      meta: `${row.visible_cliente ? 'Visible para cliente' : 'Nota interna'}${row.estado_resultante ? ` · ${statusLabels[row.estado_resultante] || row.estado_resultante}` : ''}`,
      tone: 'activity' as const,
    }));
    const serviceEntries = services.map((row) => {
      const parts = (row.servicios_refacciones || [])
        .map((part) => `${part.refacciones_catalogo?.codigo_refaccion || 'Refacción'} ×${part.cantidad}`)
        .join(', ');
      return {
        id: `service-${row.id}`,
        timestamp: row.creado_en || row.fecha_servicio || '',
        eyebrow: 'Servicio realizado',
        title: row.motivo || 'Intervención registrada',
        detail: [row.cda ? `Avería ${row.cda}` : '', row.cds ? `Solución ${row.cds}` : '', parts].filter(Boolean).join(' · ') || 'Acta de servicio ligada al equipo.',
        meta: row.profiles?.nombre_completo || 'Historial maestro',
        tone: 'service' as const,
      };
    });

    const sapEntries = sapReports.map((row) => {
      const checklist = row.checklist || [];
      const completedCount = checklist.filter((item) => ['sí', 'si'].includes((item.value || '').trim().toLocaleLowerCase('es-MX'))).length;
      const notApplicableCount = checklist.filter((item) => (item.value || '').trim().toLocaleLowerCase('es-MX') === 'no aplica').length;
      const measurements = checklist.filter((item) => /^-?\d+(?:[.,]\d+)?$/.test((item.value || '').trim())).length;
      const materials = (row.materials || [])
        .map((item) => `${item.code || 'Material'} ${item.description || ''} ×${item.quantity || 1}`.trim())
        .join(', ');
      const detail = [
        row.final_observation?.trim() || '',
        `Checklist: ${completedCount} realizados${notApplicableCount ? ` · ${notApplicableCount} no aplican` : ''}${measurements ? ` · ${measurements} mediciones` : ''}`,
        materials ? `Materiales: ${materials}` : '',
      ].filter(Boolean).join(' · ');
      const versions = [
        row.software_version ? `SW ${row.software_version}` : '',
        row.firmware_version ? `FW ${row.firmware_version}` : '',
      ].filter(Boolean).join(' · ');
      const duration = row.total_duration_minutes
        ? `${Math.floor(row.total_duration_minutes / 60)} h ${row.total_duration_minutes % 60} min`
        : 'Duración no registrada';
      return {
        id: `sap-service-${row.id}`,
        timestamp: row.end_date ? `${row.end_date}T12:00:00` : row.last_imported_at,
        eyebrow: `SAP FSM · ${row.service_kind === 'preventivo' ? 'Preventivo' : row.service_kind === 'correctivo' ? 'Correctivo' : 'Servicio'}`,
        title: row.description || row.assistance_type || 'Intervención SAP registrada',
        detail,
        meta: [
          `Informe ${row.report_number}`,
          `Folio ${row.activity_folio}`,
          row.technician_name || '',
          duration,
          versions,
          row.client_signer_name ? `Firma cliente: ${row.client_signer_name}` : '',
        ].filter(Boolean).join(' · '),
        tone: 'service' as const,
        documentPath: row.latest_storage_path,
        sapReport: row,
      };
    });

    return [...ticketEntries, ...logEntries, ...serviceEntries, ...sapEntries].sort(
      (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
    );
  }, [equipmentTickets, logs, sapReports, services]);

  const openSapDocument = async (path: string) => {
    setFeedback('Generando acceso seguro al PDF…');
    const { data, error } = await supabase.storage.from('sap-service-reports').createSignedUrl(path, 60 * 10);
    if (error || !data?.signedUrl) {
      setFeedback(`No se pudo abrir el PDF: ${error?.message || 'enlace no disponible'}`);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    setFeedback('');
  };

  const formatReportDate = (value: string | null | undefined) => {
    if (!value) return 'No registrado';
    const date = new Date(`${value.slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-MX');
  };

  const reportValue = (value: string | number | null | undefined) => {
    if (value === null || value === undefined || String(value).trim() === '') return 'No registrado';
    return String(value);
  };

  const saveActivity = async () => {
    const trimmedDetail = detail.trim();
    if (trimmedDetail.length < 2) {
      setFeedback('Escribe brevemente qué se hizo o en qué quedó el caso.');
      return;
    }
    setSaving(true);
    setFeedback('');
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('ticket_bitacora').insert({
      ticket_id: ticket.id,
      numero_serie_equipo: serial || null,
      tipo: activityType,
      detalle: trimmedDetail,
      estado_resultante: nextStatus,
      visible_cliente: visibleToClient,
      creado_por: user?.id,
    });

    if (error) {
      setFeedback(error.message.includes('ticket_bitacora')
        ? 'Falta aplicar la actualización de base de datos del nuevo módulo de casos.'
        : `No se pudo registrar: ${error.message}`);
    } else {
      setDetail('');
      setFeedback('Avance guardado en la bitácora del caso y del equipo.');
      await loadCase();
      onChanged();
    }
    setSaving(false);
  };

  return (
    <section className="ticket-case">
      <div className="ticket-case__summary">
        <div>
          <span className="ticket-case__eyebrow">Expediente del equipo</span>
          <h4>{formatCaseNumber(ticket)}</h4>
          <p>{equipment?.modelo || 'Modelo no registrado'} · Serie {serial || 'sin identificar'}</p>
        </div>
        <div className="ticket-case__facts">
          <span><small>Cliente</small><strong>{equipment?.clientes?.razon_social || 'No identificado'}</strong></span>
          <span><small>Ubicación</small><strong>{[equipment?.ciudad, equipment?.estado].filter(Boolean).join(', ') || 'No registrada'}</strong></span>
          <span><small>Versión</small><strong>{[equipment?.software && `SW ${equipment.software}`, equipment?.firmware && `FW ${equipment.firmware}`].filter(Boolean).join(' · ') || 'Sin dato'}</strong></span>
          <span><small>Antecedentes</small><strong>{equipmentTickets.length} tickets · {services.length + sapReports.length} servicios</strong></span>
        </div>
      </div>

      {canWrite ? (
        <div className="ticket-case__quick-log">
          <div className="ticket-case__quick-log-heading">
            <div><span>Registro rápido</span><strong>¿Qué hiciste y en qué quedó?</strong></div>
            <label><input type="checkbox" checked={visibleToClient} onChange={(event) => setVisibleToClient(event.target.checked)} /> Visible para cliente</label>
          </div>
          <div className="ticket-case__quick-grid">
            <select className="input-field" value={activityType} onChange={(event) => setActivityType(event.target.value)}>
              {Object.entries(activityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className="input-field" value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <textarea className="input-field" rows={3} value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Ej. Se revisó presión, se ajustó la bomba y quedó operando; validar nuevamente mañana a las 10:00." />
          <div className="ticket-case__quick-actions">
            {feedback ? <span>{feedback}</span> : <span>El avance se suma al historial global del equipo.</span>}
            <button type="button" className="button-primary" disabled={saving} onClick={() => void saveActivity()}>{saving ? 'Guardando…' : 'Guardar avance'}</button>
          </div>
        </div>
      ) : null}

      <div className="ticket-case__timeline-heading">
        <div><span>Bitácora unificada</span><strong>Tickets, avances y servicios del equipo</strong></div>
        <span>{timeline.length} registros</span>
      </div>
      {loading ? <p className="ticket-case__empty">Cargando expediente completo…</p> : timeline.length === 0 ? <p className="ticket-case__empty">Aún no hay antecedentes para este equipo.</p> : (
        <ol className="ticket-case__timeline">
          {timeline.map((entry) => (
            <li key={entry.id} className={`ticket-case__timeline-item ticket-case__timeline-item--${entry.tone}`}>
              <div className="ticket-case__dot" />
              <div className="ticket-case__timeline-card">
                <div><span>{entry.eyebrow}</span><time>{new Date(entry.timestamp).toLocaleString('es-MX')}</time></div>
                <strong>{entry.title}</strong>
                <p>{entry.detail}</p>
                {entry.meta ? <small>{entry.meta}</small> : null}
                {entry.sapReport ? (
                  <details className="ticket-case__sap-details">
                    <summary>Ver toda la información extraída</summary>
                    <div className="ticket-case__sap-sections">
                      <section>
                        <h5>Identificación y clasificación</h5>
                        <dl className="ticket-case__sap-grid">
                          <div><dt>SAP · Informe de servicio</dt><dd>{entry.sapReport.report_number}</dd></div>
                          <div><dt>SAP · Folio de actividad</dt><dd>{entry.sapReport.activity_folio}</dd></div>
                          <div><dt>SAP · Tipo de asistencia</dt><dd>{reportValue(entry.sapReport.assistance_type)}</dd></div>
                          <div><dt>ORION · Tipo de servicio</dt><dd>{entry.sapReport.service_kind}</dd></div>
                          <div><dt>SAP · Descripción</dt><dd>{reportValue(entry.sapReport.description)}</dd></div>
                          <div><dt>Archivo de evidencia</dt><dd>{reportValue(entry.sapReport.normalized_payload?.file_name)}</dd></div>
                        </dl>
                      </section>

                      <section>
                        <h5>Cliente reportado por SAP</h5>
                        <dl className="ticket-case__sap-grid">
                          <div><dt>SAP · Código de cliente</dt><dd>{reportValue(entry.sapReport.client_code)}</dd></div>
                          <div><dt>SAP · Nombre del cliente</dt><dd>{reportValue(entry.sapReport.client_name)}</dd></div>
                          <div className="is-wide"><dt>SAP · Dirección</dt><dd>{reportValue(entry.sapReport.client_address)}</dd></div>
                          <div><dt>SAP · País</dt><dd>{reportValue(entry.sapReport.normalized_payload?.client?.country)}</dd></div>
                          <div><dt>Firma del cliente</dt><dd>{reportValue(entry.sapReport.client_signer_name)}</dd></div>
                        </dl>
                      </section>

                      <section>
                        <h5>Equipo</h5>
                        <dl className="ticket-case__sap-grid">
                          <div><dt>Número de serie</dt><dd>{serial}</dd></div>
                          <div><dt>Modelo</dt><dd>{reportValue(entry.sapReport.equipment_model)}</dd></div>
                          <div className="is-wide"><dt>SAP · Descripción del equipo</dt><dd>{reportValue(entry.sapReport.normalized_payload?.equipment?.description)}</dd></div>
                          <div><dt>SAP · Fecha de instalación</dt><dd>{formatReportDate(entry.sapReport.equipment_installed_on)}</dd></div>
                          <div><dt>Sistema operativo</dt><dd>{reportValue(entry.sapReport.normalized_payload?.equipment?.operating_system)}</dd></div>
                          <div><dt>Firmware reportado</dt><dd>{reportValue(entry.sapReport.firmware_version)}</dd></div>
                          <div><dt>Software reportado</dt><dd>{reportValue(entry.sapReport.software_version)}</dd></div>
                        </dl>
                      </section>

                      <section>
                        <h5>Ejecución del servicio</h5>
                        <dl className="ticket-case__sap-grid">
                          <div><dt>Fecha de inicio</dt><dd>{formatReportDate(entry.sapReport.start_date)}</dd></div>
                          <div><dt>Fecha de término</dt><dd>{formatReportDate(entry.sapReport.end_date)}</dd></div>
                          <div><dt>Técnico</dt><dd>{reportValue(entry.sapReport.technician_name)}</dd></div>
                          <div><dt>Firma del técnico</dt><dd>{reportValue(entry.sapReport.technician_signer_name)}</dd></div>
                          <div><dt>Duración total</dt><dd>{entry.sapReport.total_duration_minutes} min</dd></div>
                          <div><dt>Método de lectura</dt><dd>{entry.sapReport.normalized_payload?.extraction_method === 'ocr' ? 'OCR' : 'Texto digital del PDF'}</dd></div>
                          <div className="is-wide"><dt>Observación final</dt><dd>{reportValue(entry.sapReport.final_observation)}</dd></div>
                        </dl>
                      </section>

                      <section>
                        <h5>Esfuerzos registrados</h5>
                        <div className="ticket-case__sap-table-wrap">
                          <table className="ticket-case__sap-table">
                            <thead><tr><th>Fecha</th><th>Técnico</th><th>Duración</th></tr></thead>
                            <tbody>
                              {(entry.sapReport.efforts || []).map((effort, index) => (
                                <tr key={`${entry.sapReport?.id}-effort-${index}`}>
                                  <td>{formatReportDate(effort.performed_on)}</td>
                                  <td>{reportValue(effort.technician)}</td>
                                  <td>{reportValue(effort.duration)}</td>
                                </tr>
                              ))}
                              {!entry.sapReport.efforts?.length ? <tr><td colSpan={3}>Sin esfuerzos desglosados.</td></tr> : null}
                            </tbody>
                          </table>
                        </div>
                      </section>

                      <section>
                        <h5>Materiales utilizados</h5>
                        <div className="ticket-case__sap-table-wrap">
                          <table className="ticket-case__sap-table">
                            <thead><tr><th>SAP · Código</th><th>Descripción</th><th>Cantidad</th></tr></thead>
                            <tbody>
                              {(entry.sapReport.materials || []).map((material, index) => (
                                <tr key={`${entry.sapReport?.id}-material-${index}`}>
                                  <td>{reportValue(material.code)}</td>
                                  <td>{reportValue(material.description)}</td>
                                  <td>{reportValue(material.quantity)}</td>
                                </tr>
                              ))}
                              {!entry.sapReport.materials?.length ? <tr><td colSpan={3}>El reporte no registra materiales.</td></tr> : null}
                            </tbody>
                          </table>
                        </div>
                      </section>

                      <section>
                        <h5>Checklist completo</h5>
                        <div className="ticket-case__sap-checklist">
                          {(entry.sapReport.checklist || []).map((item, index) => (
                            <div key={`${entry.sapReport?.id}-check-${index}`}>
                              <span>{item.item || `Concepto ${index + 1}`}</span>
                              <strong>{reportValue(item.value)}</strong>
                            </div>
                          ))}
                          {!entry.sapReport.checklist?.length ? <p>El reporte no contiene checklist.</p> : null}
                        </div>
                      </section>
                    </div>
                  </details>
                ) : null}
                {entry.documentPath ? (
                  <button type="button" className="ticket-case__document-link" onClick={() => void openSapDocument(entry.documentPath as string)}>
                    Abrir parte de asistencia PDF
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
