// Presentación de un registro de servicios_historial en la ficha del equipo.
// Los registros importados de Biosisa traen origen, horario y textos del reporte
// (migración 20261012010000); los creados en Orion pueden no traer nada de eso.

export type HistoryOrigin = 'biosisa_servicio' | 'biosisa_capacitacion' | 'biosisa_llamada';

export interface ServiceHistoryRow {
  id: string;
  ticket_id?: string | null;
  id_legacy?: number | null;
  origen?: HistoryOrigin | string | null;
  tipo_servicio?: string | null;
  motivo?: string | null;
  fecha_servicio?: string | null;
  fecha_fin?: string | null;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  duracion_min?: number | null;
  creado_en?: string | null;
  datos_origen?: Record<string, unknown> | null;
}

export type HistoryRecordKind = 'servicio' | 'capacitacion' | 'llamada';

export const historyRecordKind = (row: ServiceHistoryRow): HistoryRecordKind => {
  if (row.origen === 'biosisa_capacitacion') return 'capacitacion';
  if (row.origen === 'biosisa_llamada') return 'llamada';
  return 'servicio';
};

export const historyRecordRef = (row: ServiceHistoryRow): string => {
  if (row.ticket_id) return `TKT-${row.ticket_id.substring(0, 8).toUpperCase()}`;
  if (row.id_legacy != null) {
    const prefix = { capacitacion: 'CAP', llamada: 'TEL', servicio: 'LEG' }[historyRecordKind(row)];
    return `${prefix}-${row.id_legacy}`;
  }
  return 'SRV-IND';
};

const TYPE_LABELS: Record<string, string> = {
  preventivo: 'Mantenimiento preventivo',
  correctivo: 'Mantenimiento correctivo',
  instalacion: 'Instalación',
  visita: 'Visita',
  capacitacion: 'Capacitación',
  recapacitacion: 'Recapacitación',
  reacondicionamiento: 'Reacondicionamiento',
  retiro: 'Retiro',
  otro: 'Otro',
};

export const historyTypeLabel = (row: ServiceHistoryRow): string | null => {
  if (historyRecordKind(row) === 'llamada') return 'Servicio telefónico';
  return row.tipo_servicio ? TYPE_LABELS[row.tipo_servicio] ?? row.tipo_servicio : null;
};

const hhmm = (value?: string | null) => (value ? value.slice(0, 5) : null);

export const formatDuration = (minutes?: number | null): string | null => {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = Math.round(minutes % 60);
  if (days > 0) return `${days} d ${hours} h`;
  return mins ? `${hours} h ${mins} min` : `${hours} h`;
};

export interface ScheduleSummary {
  dates: string;
  hours: string | null;
  duration: string | null;
  multiDay: boolean;
}

export const scheduleSummary = (row: ServiceHistoryRow): ScheduleSummary => {
  const start = row.fecha_servicio || (row.creado_en ? row.creado_en.slice(0, 10) : '');
  const end = row.fecha_fin && row.fecha_fin !== start ? row.fecha_fin : null;
  const from = hhmm(row.hora_inicio);
  const to = hhmm(row.hora_fin);
  return {
    dates: end ? `${start} → ${end}` : start,
    hours: from && to ? `${from}–${to}` : from ? `desde ${from}` : to ? `hasta ${to}` : null,
    duration: formatDuration(row.duracion_min),
    multiDay: Boolean(end),
  };
};

const TOPIC_YES = new Set(['si', 'sí']);
// Orden del formato de capacitación de Biosisa (jsonb no conserva el orden de las llaves).
const TOPIC_ORDER = [
  'Descripción del equipo', 'Pantalla monitor', 'Configuración del analizador', 'Programación de técnicas',
  'Programación de controles', 'Preparación de la sesión de trabajo', 'Programación de perfiles',
  'Posicionamiento de la sesión', 'Procesamiento de las muestras', 'Revisión de los resultados',
  'Control de calidad', 'Alarmas y avisos', 'Cambio de lámpara', 'Mantenimiento', 'Mantenimiento diario',
  'Mantenimiento semanal', 'Mantenimiento mensual',
];
const topicRank = (topic: string) => {
  const index = TOPIC_ORDER.indexOf(topic);
  return index === -1 ? TOPIC_ORDER.length : index;
};

export const trainingTopics = (row: ServiceHistoryRow): { covered: string[]; pending: string[] } | null => {
  const topics = row.datos_origen?.temas;
  if (!topics || typeof topics !== 'object') return null;
  const covered: string[] = [];
  const pending: string[] = [];
  Object.entries(topics as Record<string, unknown>)
    .sort(([a], [b]) => topicRank(a) - topicRank(b))
    .forEach(([topic, answer]) => {
    const value = String(answer ?? '').trim().toLowerCase();
    if (TOPIC_YES.has(value)) covered.push(topic);
    else if (value === 'no') pending.push(topic);
  });
  return covered.length || pending.length ? { covered, pending } : null;
};

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

export const historyFacts = (row: ServiceHistoryRow): Array<{ label: string; value: string }> => {
  const data = row.datos_origen ?? {};
  const facts: Array<{ label: string; value: string | null }> = [];
  const kind = historyRecordKind(row);
  if (kind === 'capacitacion') {
    facts.push({ label: 'Encargado del laboratorio', value: text(data.encargado_laboratorio) });
    facts.push({ label: 'Asistentes', value: text(data.asistentes) });
    facts.push({ label: 'Comentarios del laboratorio', value: text(data.comentarios_laboratorio) });
  }
  if (kind === 'llamada') {
    facts.push({ label: 'Contacto', value: text(data.contacto) });
  }
  facts.push({ label: 'Cliente en Biosisa', value: text(data.cliente_biosisa) });
  facts.push({ label: 'Nota de horario', value: text(data.observacion_horario) });
  return facts.filter((fact): fact is { label: string; value: string } => Boolean(fact.value));
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export const summarizeHistory = (rows: ServiceHistoryRow[]): string => {
  const counts = { servicio: 0, capacitacion: 0, llamada: 0 };
  rows.forEach((row) => {
    counts[historyRecordKind(row)] += 1;
  });
  return [
    counts.servicio ? plural(counts.servicio, 'servicio', 'servicios') : null,
    counts.capacitacion ? plural(counts.capacitacion, 'capacitación', 'capacitaciones') : null,
    counts.llamada ? plural(counts.llamada, 'servicio telefónico', 'servicios telefónicos') : null,
  ].filter(Boolean).join(' · ');
};

// El texto de los PDF trae saltos de renglón del formato a media frase; se unen y se
// conservan los saltos que empiezan una oración, una lista o un párrafo.
export const reflowText = (value: string): string =>
  value.replace(/([^.:;!?\n])\n(?=[a-záéíóúüñ0-9(*"])/g, '$1 ').replace(/[ \t]{2,}/g, ' ').trim();

// A field service inferred to answer one or more tickets (same serial, visit within 15 days).
export interface ServiceTicketLink { ticketId: string; folio: string | null; days: number; confidence: 'segura' | 'probable' }
export const ticketLinkSummary = (links: ServiceTicketLink[] | null | undefined): string | null => {
  if (!links?.length) return null;
  const sorted = [...links].sort((a, b) => a.days - b.days);
  const tickets = sorted.map(link => `${link.folio || 'ticket'} (${link.days === 0 ? 'el mismo día' : `${link.days} ${link.days === 1 ? 'día' : 'días'} después`})`);
  const confidence = sorted.some(link => link.confidence === 'segura') ? 'liga segura' : 'liga probable';
  return `${tickets.length === 1 ? 'Atiende el ticket' : 'Atiende los tickets'} ${tickets.join(', ')} · ${confidence}, estimada por serie y fecha`;
};

