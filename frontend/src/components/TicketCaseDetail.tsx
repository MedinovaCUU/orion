import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import type { EquipmentSummary } from './servicesPlanning';
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

type TimelineEntry = {
  id: string;
  timestamp: string;
  eyebrow: string;
  title: string;
  detail: string;
  meta?: string;
  tone: 'ticket' | 'activity' | 'service';
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
    ] as const;

    const [logResult, ticketResult, serviceResult] = await Promise.all(requests);
    setLogs((logResult.data || []) as CaseLogRow[]);
    setEquipmentTickets((ticketResult.data || []) as CaseTicketRecord[]);
    setServices((serviceResult.data || []) as ServiceHistoryRow[]);
    setLoading(false);
  }, [serial, ticket.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCase(), 0);
    return () => window.clearTimeout(timer);
  }, [loadCase]);

  const timeline = useMemo<TimelineEntry[]>(() => {
    const ticketEntries = equipmentTickets.map((row) => ({
      id: `ticket-${row.id}`,
      timestamp: row.creado_en,
      eyebrow: formatCaseNumber(row),
      title: row.asunto,
      detail: row.descripcion?.trim() || 'Ticket generado sin descripción adicional.',
      meta: `Estado: ${statusLabels[row.estado] || row.estado}`,
      tone: 'ticket' as const,
    }));
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

    return [...ticketEntries, ...logEntries, ...serviceEntries].sort(
      (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
    );
  }, [equipmentTickets, logs, services]);

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
          <span><small>Antecedentes</small><strong>{equipmentTickets.length} tickets · {services.length} servicios</strong></span>
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
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
