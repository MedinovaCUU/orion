// Presentation model of the staff KPIs. Every number comes from the get_service_kpi_* RPCs; this
// module only labels, formats and explains them, so cards, tables and exports read the same rows.
export type KpiView = 'general' | 'quimica' | 'ingenieria';
export type Granularity = 'week' | 'month' | 'quarter';
export type KpiDataset = 'tickets' | 'activities' | 'failures' | 'parts' | 'surveys';
export type PeriodPreset = 'mes' | 'mes_anterior' | '4_semanas' | '12_semanas' | 'trimestre' | '6_meses' | '12_meses' | 'anio' | 'personalizado';

export interface KpiFilters {
  preset: PeriodPreset; from: string; to: string; granularity: Granularity;
  person: string; client: string; platform: string; serial: string;
  service_type: string; priority: string; status: string; recurrence_days: string;
}
export interface Ratio { num: number; den: number; pct: number | null }
export type Metrics = Record<string, number | string | Ratio | null>;
export interface SeriesRow { bucket: string; [key: string]: number | string }
export interface KpiPeriod {
  from: string; to: string; previous_from: string; previous_to: string; cut_at: string; cut_is_now: boolean;
  timezone: string; granularity: Granularity; recurrence_days: number; min_sample: number; capture_since: string;
}
export interface StaffRow {
  id: string; name: string; team: string; tickets_relevant: number; tickets_opened: number; tickets_closed: number;
  sla_evaluable: number; sla_late: number; pending_at_cut: number; overdue_at_cut: number;
  pending_by_priority: Record<string, number>; pending_by_type: Record<string, number>; resolution_median: number | null;
  trainings: number; trainings_done: number; visits: number; calls: number; call_minutes: number | null;
  preventive_programmed: number; preventive_done: number; corrective: number; surveys: number; satisfaction_avg: number | null;
  attire?: { num: number; den: number; pct: number | null };
}
export interface SlaPolicy {
  id: string; name: string; channel: string | null; region: string | null; area: string | null; priority: string | null;
  target_hours: number; clock: 'corridas' | 'habiles'; business_start: string; business_end: string; business_days: number[];
  timezone: string; pause_states: string[]; precedence: number; active: boolean; notes: string | null;
}
export interface KpiSummary {
  period: KpiPeriod; current: Metrics; previous: Metrics; series: SeriesRow[];
  breakdowns: Record<string, unknown> & { staff: StaffRow[] }; quality: Record<string, number | string | null>; policies: SlaPolicy[];
}
export interface Drill { dataset: KpiDataset; match: Record<string, unknown>; title: string; definition?: string }
export type KpiRecord = Record<string, unknown>;

export const attireLabels: Record<string, string> = { both: 'Bata y gafete', coat: 'Solo bata', badge: 'Solo gafete', none: 'Ni bata ni gafete', no_visit: 'No hubo visita en sitio' };
export const teamLabels: Record<string, string> = { quimica: 'Químicos', ingenieria: 'Ingenieros', otro: 'Otro personal', sin_clasificar: 'Sin clasificar' };
export const viewLabels: Record<KpiView, string> = { general: 'Resumen general', quimica: 'Químicos', ingenieria: 'Ingenieros' };
export const kindLabels: Record<string, string> = {
  preventivo: 'Preventivo', correctivo: 'Correctivo', capacitacion: 'Capacitación', recapacitacion: 'Recapacitación',
  instalacion: 'Instalación', ingenieria_soporte: 'Ingeniería / soporte', visita: 'Visita', reacondicionamiento: 'Reacondicionamiento',
  retiro: 'Retiro', otro: 'Otro servicio', sin_clasificar: 'Sin tipo registrado', llamada: 'Llamada',
};
export const serviceTypeLabels: Record<string, string> = {
  soporte_quimica: 'Soporte químico', soporte_ingenieria: 'Soporte de ingeniería', soporte_sin_especialidad: 'Soporte sin especialidad', planeacion: 'Planeación',
  ...kindLabels,
};
export const priorityLabels: Record<string, string> = { critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja', sin_prioridad: 'Sin prioridad registrada' };
export const statusLabels: Record<string, string> = {
  abierto: 'Abierto', en_progreso: 'En progreso', pendiente_piezas: 'Pendiente por piezas', en_observacion: 'En observación', cerrado: 'Cerrado',
};
export const planStatusLabels: Record<string, string> = {
  realizado: 'Realizado', pendiente: 'Pendiente', vencido: 'Vencido sin evidencia', cerrado_sin_evidencia: 'Cerrado sin evidencia de ejecución', sin_fecha: 'Sin fecha programada',
};
export const slaResultLabels: Record<string, string> = {
  dentro: 'Dentro del plazo', fuera: 'Fuera del plazo', en_curso: 'En curso', vencido: 'Vencido', sin_plazo: 'Sin plazo definido',
  no_aplica: 'No aplica (enviado a administrativo)', no_evaluable: 'Sin fecha verificable',
};
export const closureLabels: Record<string, string> = {
  solucionado: 'Solucionado', visita_programada: 'Visita programada', sin_respuesta: 'Sin respuesta del cliente',
  cancelado: 'Enviado a administrativo', sin_clasificar: 'Cierre sin clasificar', sin_fecha: 'Cerrado sin fecha verificable',
};
export const activityMotiveLabels: Record<string, string> = {
  falla_equipo: 'Falla del equipo', resultados_qc: 'Resultados / control de calidad', reactivos: 'Reactivos y consumibles',
  operacion: 'Dudas de operación', configuracion: 'Configuración / software', mantenimiento: 'Mantenimiento',
  capacitacion: 'Capacitación', seguimiento: 'Seguimiento del caso', otro: 'Otro motivo',
};
export const activityResultLabels: Record<string, string> = {
  resuelto: 'Resuelto', requiere_visita: 'Requiere visita', requiere_pieza: 'Requiere refacción', escalado: 'Escalado',
  en_seguimiento: 'En seguimiento', sin_solucion: 'Sin solución / sin contacto', pendiente_piezas: 'Pendiente por piezas',
  en_observacion: 'En observación', sin_dato: 'Sin resultado registrado',
};
export const historyServiceTypes: Record<string, string> = {
  correctivo: 'Mantenimiento correctivo', preventivo: 'Mantenimiento preventivo', visita: 'Visita de diagnóstico', instalacion: 'Instalación',
  capacitacion: 'Capacitación', recapacitacion: 'Recapacitación', reacondicionamiento: 'Reacondicionamiento', retiro: 'Retiro', otro: 'Otro servicio',
};
export const ageBuckets = ['0-1 d', '1-3 d', '3-7 d', '7-15 d', '15-30 d', '30+ d'];
export const labelOf = (map: Record<string, string>, value: unknown) =>
  value === null || value === undefined || value === '' ? 'Sin dato' : map[String(value)] || String(value).replaceAll('_', ' ');

// ── Definitions shown in the contextual help of every indicator ────────────────────────────
export interface KpiDefinition { label: string; formula: string; source: string; dateField: string; denominator: string; note?: string }
const TICKETS = 'Tickets de soporte (sin planeación) y eventos de servicio registrados';
export const definitions: Record<string, KpiDefinition> = {
  tickets_opened: { label: 'Tickets abiertos', formula: 'Conteo de tickets de soporte cuya apertura cae dentro del periodo.', source: TICKETS, dateField: 'Apertura (tickets.creado_en, hora local).', denominator: 'No aplica: es un conteo.' },
  tickets_closed: { label: 'Tickets cerrados', formula: 'Conteo de tickets con evento de cierre dentro del periodo. Incluye los enviados a administrativo, que se muestran aparte.', source: TICKETS, dateField: 'Hora del cierre (ticket_service_events, cierre).', denominator: 'No aplica: es un conteo.', note: 'Un cierre histórico sin fecha verificable no pertenece a ningún periodo y se reporta en calidad de datos.' },
  late_rate: { label: 'Cierres fuera del plazo', formula: 'Cierres fuera del plazo ÷ cierres con plazo evaluable × 100.', source: `${TICKETS} y reglas de plazo (ticket_sla_policies).`, dateField: 'Hora del cierre.', denominator: 'Cierres del periodo con regla de plazo activa y fecha verificable. Excluye cancelaciones (cierres administrativos). Los tickets sin plazo definido se cuentan aparte.', note: 'Una demora justificada sigue contando como cierre fuera del plazo; se muestra como subconjunto.' },
  sla_compliance: { label: 'Cumplimiento del plazo (SLA)', formula: 'Cierres dentro del plazo ÷ cierres con plazo evaluable × 100.', source: `${TICKETS} y reglas de plazo.`, dateField: 'Hora del cierre.', denominator: 'Mismo denominador que los cierres fuera del plazo.', note: 'El plazo se mide con la regla vigente del ticket: horas corridas u horas hábiles, zona horaria y estados de pausa configurados.' },
  first_response: { label: 'Primera respuesta', formula: 'Promedio y mediana de horas entre la apertura y el primer contacto registrado (respuesta al cliente, llamada o visita).', source: 'Eventos de respuesta y bitácora del ticket (llamada / visita).', dateField: 'Apertura del ticket.', denominator: 'Tickets abiertos en el periodo con primer contacto registrado. Los que no lo tienen se muestran como “sin dato”.' },
  resolution: { label: 'Tiempo de resolución', formula: 'Promedio, mediana y percentil 90 de horas corridas entre la apertura y el cierre solucionado.', source: TICKETS, dateField: 'Hora del cierre.', denominator: 'Cierres solucionados del periodo con fecha verificable. Cierres administrativos, sin respuesta o sin clasificar no son resoluciones técnicas.' },
  pending: { label: 'Pendientes al corte', formula: 'Tickets abiertos en el instante de corte; vencidos = ya superaron su plazo.', source: TICKETS, dateField: 'Corte: fin del periodo, o el momento de la consulta si el periodo incluye hoy.', denominator: 'Fotografía al corte: no depende de la fecha de apertura.', note: 'Un ticket cerrado sin fecha verificable tiene estado desconocido en cortes pasados.' },
  reopen_rate: { label: 'Reaperturas', formula: 'Tickets cerrados en el periodo con un caso posterior vinculado como reapertura ÷ cierres evaluables × 100.', source: 'Vínculo “Reabre el caso” capturado al abrir el nuevo ticket.', dateField: 'Hora del cierre del ticket original.', denominator: 'Cierres del periodo sin cancelados y posteriores al inicio de la captura del vínculo.', note: 'Un caso cerrado no vuelve a abrirse: la reapertura es un caso nuevo vinculado, por lo que nunca se cuenta dos veces.' },
  ftf_rate: { label: 'Resolución en primera visita', formula: 'Casos solucionados con un solo día de visita ÷ casos solucionados con al menos una visita × 100.', source: 'Visitas ligadas al ticket: bitácora, historial de servicio y reportes.', dateField: 'Hora del cierre.', denominator: 'Casos solucionados en el periodo con visitas registradas.' },
  trainings: { label: 'Capacitaciones y recapacitaciones', formula: 'Servicios programados de capacitación o recapacitación + los ejecutados sin programación.', source: 'Planeación (tickets [PLAN]) y registros de servicio.', dateField: 'Fecha programada (día acordado o fin de la semana planeada).', denominator: 'No aplica: es un conteo.', note: 'Realizada = cierre solucionado, marcada como realizada en la planeación o visita registrada al equipo en el mismo mes.' },
  visits: { label: 'Visitas', formula: 'Registros del mismo equipo y día cuentan como una sola visita.', source: 'Historial de servicio, partes SAP, reportes de servicio y bitácora (visita).', dateField: 'Fecha del servicio.', denominator: 'No aplica: es un conteo.', note: 'Los registros evidentemente de prueba se excluyen y se informan en calidad de datos.' },
  calls: { label: 'Servicios telefónicos', formula: 'Llamadas registradas en la bitácora del ticket + reportes de servicio remoto.', source: 'ticket_bitacora (llamada) y service_reports (remoto).', dateField: 'Fecha de la llamada.', denominator: 'No aplica: es un conteo.' },
  call_duration: { label: 'Duración de las llamadas', formula: 'Promedio de minutos de las llamadas con duración capturada.', source: 'Duración capturada en la llamada o inicio/fin del reporte remoto.', dateField: 'Fecha de la llamada.', denominator: 'Llamadas con duración registrada.' },
  calls_resolved_rate: { label: 'Resuelto sin visita', formula: 'Llamadas con resultado “resuelto” ÷ llamadas con resultado registrado × 100.', source: 'Resultado capturado en la llamada; un reporte remoto que requiere visita no se resolvió por teléfono.', dateField: 'Fecha de la llamada.', denominator: 'Llamadas con resultado capturado; las demás se muestran como “sin dato”.' },
  preventive_compliance: { label: 'Cumplimiento de preventivos', formula: 'Preventivos programados en el periodo que se realizaron ÷ preventivos programados en el periodo × 100.', source: 'Planeación y registros de ejecución (historial, SAP, reportes).', dateField: 'Fecha programada.', denominator: 'Preventivos programados en el periodo, incluidos los pendientes de un periodo en curso.', note: 'Realizado = cierre solucionado, marcado como realizado o mantenimiento preventivo registrado al mismo equipo en el mismo mes. Un cierre administrativo no es evidencia.' },
  preventive_off_schedule: { label: 'Preventivos fuera de programación', formula: 'Visitas con mantenimiento preventivo sin preventivo programado para ese equipo en ese mes.', source: 'Registros de ejecución contra planeación.', dateField: 'Fecha de ejecución.', denominator: 'No aplica: es un conteo y no suma al cumplimiento.' },
  corrective: { label: 'Mantenimientos correctivos', formula: 'Visitas con mantenimiento correctivo (historial, tipo capturado, partes SAP o reportes correctivos/emergencia).', source: 'Registros de ejecución.', dateField: 'Fecha del servicio.', denominator: 'No aplica: es un conteo.' },
  corrective_share: { label: 'Participación correctiva', formula: 'Visitas con correctivo ÷ visitas con mantenimiento preventivo o correctivo × 100.', source: 'Registros de ejecución.', dateField: 'Fecha del servicio.', denominator: 'Visitas con mantenimiento en el periodo (una visita con ambos tipos cuenta una vez en el denominador).' },
  recurrence_rate: { label: 'Reincidencia de averías', formula: 'Eventos de avería repetidos con el mismo código en el mismo equipo dentro de N días ÷ eventos evaluables × 100.', source: 'Códigos de avería del historial, reportes y bitácora.', dateField: 'Fecha del evento de avería.', denominator: 'Eventos cuya ventana de N días ya transcurrió al corte; los recientes quedan en observación.' },
  effectiveness: { label: 'Efectividad de soluciones', formula: 'Por avería y solución: (eventos evaluables − reincidencias) ÷ eventos evaluables × 100.', source: 'Códigos de avería y solución registrados.', dateField: 'Fecha del evento de avería.', denominator: 'Eventos evaluables de esa pareja; se marca la muestra pequeña.' },
  parts: { label: 'Piezas utilizadas', formula: 'Suma de cantidades de refacciones del historial de servicio y de materiales tipo refacción de los reportes.', source: 'servicios_refacciones y service_report_materials.', dateField: 'Fecha del servicio.', denominator: 'No aplica: es una suma.' },
  parts_cost: { label: 'Costo de piezas', formula: 'Σ precio × cantidad, solo en líneas con precio registrado.', source: 'Precio del material en el reporte de servicio.', dateField: 'Fecha del servicio.', denominator: 'Líneas con precio; el resto se muestra como “sin costo registrado”.' },
  csat: { label: 'Satisfacción del cliente', formula: 'Encuestas con calificación 4 o 5 ÷ encuestas respondidas × 100.', source: 'Encuestas de satisfacción respondidas (sin invitaciones de prueba).', dateField: 'Fecha de respuesta.', denominator: 'Encuestas respondidas en el periodo.' },
  attire: { label: 'Bata y gafete en visitas', formula: 'Encuestas en que el cliente vio al personal con bata de laboratorio y gafete ÷ encuestas con visita en sitio que respondieron la pregunta × 100.', source: 'Pregunta de presentación de la encuesta de satisfacción (sin invitaciones de prueba).', dateField: 'Fecha de respuesta.', denominator: 'Respuestas «bata y gafete», «solo bata», «solo gafete» o «ni bata ni gafete».', note: '«No hubo visita en sitio» y las encuestas respondidas antes de existir la pregunta quedan fuera; también se informa por separado el porcentaje con bata y con gafete.' },
  workload: { label: 'Balance de carga', formula: 'Por colaborador: tickets asignados con actividad en el periodo, abiertos y vencidos al corte, cerrados y fuera de plazo, más su mezcla de prioridad y actividades.', source: 'Responsable vigente (ticket_assignments) y participantes de actividades.', dateField: 'Apertura, cierre o corte, según la columna.', denominator: 'No es un ranking: se ordena alfabéticamente y muestra tipo, prioridad y carga.', note: 'Cada ticket se atribuye una vez al responsable vigente; las reasignaciones quedan en el historial. Una actividad con varios participantes cuenta una vez para el equipo y una vez para cada participante.' },
};

// Data-quality counters returned by the summary, with the sentence each one prints.
export const qualityLabels: Array<[string, string]> = [
  ['tickets_without_closure_date', 'Tickets cerrados sin fecha de cierre verificable (históricos): no entran en cierres, plazos ni tiempos.'],
  ['tickets_without_priority', 'Tickets del periodo sin prioridad registrada; la prioridad se captura desde esta versión.'],
  ['tickets_without_responsible', 'Tickets del periodo sin responsable asignado: se atribuyen a la especialidad solicitada.'],
  ['tickets_without_first_response', 'Tickets abiertos en el periodo sin primer contacto registrado.'],
  ['closures_unclassified', 'Cierres del periodo sin resultado clasificado (no cuentan como resoluciones técnicas).'],
  ['planning_without_date', 'Servicios programados sin fecha interpretable (no entran en ningún mes).'],
  ['planning_unmatched_names', 'Nombres en la planeación que no coinciden con un perfil (se muestran como “sin perfil”).'],
  ['activities_team_inferred', 'Actividades del periodo sin participante identificado, asignadas al equipo por su tipo de servicio.'],
  ['history_test_records', 'Registros del historial de servicio identificados como prueba, excluidos de los indicadores.'],
  ['history_unclassified', 'Registros del historial sin tipo de servicio identificable (cuentan como visita, no como preventivo o correctivo).'],
  ['history_invalid_date', 'Registros del historial con fecha inválida (anterior a 2000 o futura), fuera de todo periodo.'],
  ['calls_without_duration', 'Llamadas del periodo sin duración registrada.'],
  ['calls_without_result', 'Llamadas del periodo sin resultado registrado (fuera del % resuelto sin visita).'],
  ['visits_without_result', 'Visitas del periodo sin resultado registrado.'],
];

// ── Formatting ─────────────────────────────────────────────────────────────────────────────
const integer = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
export const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
export const ratioOf = (value: unknown): Ratio => {
  const ratio = (value || {}) as Partial<Ratio>;
  return { num: num(ratio.num) ?? 0, den: num(ratio.den) ?? 0, pct: num(ratio.pct) };
};
export const formatCount = (value: unknown) => integer.format(num(value) ?? 0);
export const formatPct = (value: number | null) => value === null ? 'No aplica' : `${decimal.format(value)} %`;
export const formatHours = (value: unknown) => {
  const hours = num(value);
  if (hours === null) return 'Sin dato';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${decimal.format(hours)} h`;
  return `${decimal.format(hours / 24)} d`;
};
export const formatMinutes = (value: unknown) => num(value) === null ? 'Sin dato' : `${decimal.format(num(value)!)} min`;
export const formatMoney = (value: unknown) => num(value) === null ? 'Sin costo registrado' : money.format(num(value)!);
export const formatDate = (value: unknown) => {
  if (!value) return 'Sin fecha';
  const text = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00`) : new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};
export const formatDateTime = (value: unknown) => {
  if (!value) return 'Sin registro';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
};
export const bucketLabel = (bucket: string, granularity: Granularity) => {
  const date = new Date(`${bucket}T12:00:00`);
  if (Number.isNaN(date.getTime())) return bucket;
  if (granularity === 'week') return `Sem ${date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}`;
  if (granularity === 'quarter') return `T${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
  return date.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' });
};

// A card distinguishes real zero, missing data and not-applicable denominators.
export type CardState = 'ok' | 'zero' | 'missing' | 'na';
export interface CardValue { value: string; detail: string; state: CardState }
export interface CardDelta { text: string; tone: 'good' | 'bad' | 'neutral' }
export interface CardSpec {
  id: string; label: string; definition: string; better: 'up' | 'down' | 'neutral'; tone?: 'good' | 'warn' | 'danger';
  read: (metrics: Metrics) => CardValue; compare: (current: Metrics, previous: Metrics) => CardDelta | null; drill?: Drill;
}
const toneFor = (difference: number, better: CardSpec['better']): CardDelta['tone'] =>
  difference === 0 || better === 'neutral' ? 'neutral' : (difference > 0) === (better === 'up') ? 'good' : 'bad';
const signed = (value: number, format: (value: number) => string) => `${value > 0 ? '+' : value < 0 ? '−' : '±'}${format(Math.abs(value))}`;

export const countCard = (id: string, label: string, definition: string, metric: string, options: {
  better?: CardSpec['better']; tone?: CardSpec['tone']; drill?: Drill; detail?: (metrics: Metrics) => string;
} = {}): CardSpec => ({
  id, label, definition, better: options.better || 'neutral', tone: options.tone, drill: options.drill,
  read: metrics => {
    const value = num(metrics[metric]) ?? 0;
    return { value: formatCount(value), detail: options.detail?.(metrics) || (value === 0 ? 'Sin actividad registrada en el periodo' : ''), state: value === 0 ? 'zero' : 'ok' };
  },
  compare: (current, previous) => {
    const now = num(current[metric]) ?? 0; const before = num(previous[metric]) ?? 0;
    const difference = now - before;
    const pct = before > 0 ? ` (${signed(Math.round(difference / before * 100), value => `${value} %`)})` : '';
    return { text: `${signed(difference, formatCount)}${pct} vs. periodo anterior`, tone: toneFor(difference, options.better || 'neutral') };
  },
});

export const ratioCard = (id: string, label: string, definition: string, metric: string, options: {
  better?: CardSpec['better']; tone?: CardSpec['tone']; drill?: Drill; numLabel: string; denLabel: string; extra?: (metrics: Metrics) => string;
}): CardSpec => ({
  id, label, definition, better: options.better || 'neutral', tone: options.tone, drill: options.drill,
  read: metrics => {
    const ratio = ratioOf(metrics[metric]);
    if (ratio.den === 0 || ratio.pct === null) return { value: 'No aplica', detail: `Sin ${options.denLabel} en el periodo`, state: 'na' };
    // A real 0 % keeps the neutral ink: it is neither an alarm nor an achievement colour.
    return { value: formatPct(ratio.pct), detail: [`${formatCount(ratio.num)} ${options.numLabel} de ${formatCount(ratio.den)} ${options.denLabel}`, options.extra?.(metrics)].filter(Boolean).join(' · '), state: ratio.num === 0 ? 'zero' : 'ok' };
  },
  compare: (current, previous) => {
    const now = ratioOf(current[metric]).pct; const before = ratioOf(previous[metric]).pct;
    if (now === null || before === null) return { text: 'Sin base comparable en el periodo anterior', tone: 'neutral' };
    const difference = Math.round((now - before) * 10) / 10;
    return { text: `${signed(difference, value => `${decimal.format(value)} pp`)} vs. periodo anterior`, tone: toneFor(difference, options.better || 'neutral') };
  },
});

export const hoursCard = (id: string, label: string, definition: string, metrics: {
  main: string; avg?: string; p90?: string; n: string; base?: string; baseLabel: string;
}, options: { drill?: Drill; tone?: CardSpec['tone'] } = {}): CardSpec => ({
  id, label, definition, better: 'down', tone: options.tone, drill: options.drill,
  read: values => {
    const n = num(values[metrics.n]) ?? 0; const base = metrics.base ? num(values[metrics.base]) ?? 0 : n;
    if (base === 0) return { value: 'No aplica', detail: `Sin ${metrics.baseLabel} en el periodo`, state: 'na' };
    if (n === 0 || num(values[metrics.main]) === null) return { value: 'Sin dato', detail: `0 de ${formatCount(base)} ${metrics.baseLabel} con registro`, state: 'missing' };
    const parts = [`Mediana · ${formatCount(n)}${metrics.base ? ` de ${formatCount(base)}` : ''} ${metrics.baseLabel}`];
    if (metrics.avg) parts.push(`promedio ${formatHours(values[metrics.avg])}`);
    if (metrics.p90) parts.push(`P90 ${formatHours(values[metrics.p90])}`);
    return { value: formatHours(values[metrics.main]), detail: parts.join(' · '), state: 'ok' };
  },
  compare: (current, previous) => {
    const now = num(current[metrics.main]); const before = num(previous[metrics.main]);
    if (now === null || before === null) return { text: 'Sin base comparable en el periodo anterior', tone: 'neutral' };
    const difference = now - before;
    return { text: `${signed(difference, formatHours)} en la mediana vs. periodo anterior`, tone: toneFor(difference, 'down') };
  },
});

export const valueCard = (id: string, label: string, definition: string, read: (metrics: Metrics) => CardValue, options: { drill?: Drill; tone?: CardSpec['tone'] } = {}): CardSpec => ({
  id, label, definition, better: 'neutral', tone: options.tone, drill: options.drill, read, compare: () => null,
});

// ── Cards per view ─────────────────────────────────────────────────────────────────────────
const drill = (dataset: KpiDataset, match: Record<string, unknown>, title: string, definition?: string): Drill => ({ dataset, match, title, definition });
const ticketCards = (scope: string): CardSpec[] => [
  countCard('opened', 'Tickets abiertos', 'tickets_opened', 'tickets_opened', { drill: drill('tickets', { opened_in_period: true }, `Tickets abiertos en el periodo${scope}`, 'tickets_opened') }),
  countCard('closed', 'Tickets cerrados', 'tickets_closed', 'tickets_closed', {
    drill: drill('tickets', { closed_in_period: true }, `Tickets cerrados en el periodo${scope}`, 'tickets_closed'),
    detail: m => `${formatCount(m.tickets_cancelled)} enviados a administrativo`,
  }),
  ratioCard('late', 'Cierres fuera del plazo', 'late_rate', 'late_rate', {
    better: 'down', tone: 'danger', numLabel: 'fuera del plazo', denLabel: 'cierres evaluables',
    extra: m => `${formatCount(m.sla_late_justified)} justificados · ${formatCount(m.sla_no_policy)} sin plazo definido`,
    drill: drill('tickets', { closed_in_period: true, sla_result: 'fuera' }, `Cierres fuera del plazo${scope}`, 'late_rate'),
  }),
  ratioCard('sla', 'Cumplimiento del plazo', 'sla_compliance', 'sla_compliance', {
    better: 'up', tone: 'good', numLabel: 'dentro del plazo', denLabel: 'cierres evaluables',
    drill: drill('tickets', { sla_evaluable: true }, `Cierres con plazo evaluable${scope}`, 'sla_compliance'),
  }),
  hoursCard('first_response', 'Primera respuesta', 'first_response', { main: 'first_response_median', avg: 'first_response_avg', n: 'first_response_n', base: 'first_response_base', baseLabel: 'tickets abiertos' }, {
    drill: drill('tickets', { opened_in_period: true }, `Primera respuesta de los tickets abiertos${scope}`, 'first_response'),
  }),
  hoursCard('resolution', 'Tiempo de resolución', 'resolution', { main: 'resolution_median', avg: 'resolution_avg', p90: 'resolution_p90', n: 'resolution_n', baseLabel: 'cierres solucionados' }, {
    drill: drill('tickets', { closed_in_period: true, closure_class: 'solucionado' }, `Cierres solucionados${scope}`, 'resolution'),
  }),
  countCard('pending', 'Pendientes al corte', 'pending', 'pending_at_cut', {
    better: 'down', tone: 'warn', drill: drill('tickets', { pending_at_cut: true }, `Pendientes al corte${scope}`, 'pending'),
    detail: m => `${formatCount(m.overdue_at_cut)} vencidos · ${formatCount(m.unassigned_pending)} sin responsable${num(m.unknown_at_cut) ? ` · ${formatCount(m.unknown_at_cut)} con estado desconocido` : ''}`,
  }),
];
const qualityCards: CardSpec[] = [
  ratioCard('reopen', 'Reaperturas', 'reopen_rate', 'reopen_rate', { better: 'down', numLabel: 'reabiertos', denLabel: 'cierres evaluables', drill: drill('tickets', { reopen_evaluable: true }, 'Cierres evaluables para reapertura', 'reopen_rate') }),
  ratioCard('ftf', 'Resolución en primera visita', 'ftf_rate', 'ftf_rate', { better: 'up', tone: 'good', numLabel: 'en una visita', denLabel: 'casos con visita', drill: drill('tickets', { ftf_eligible: true }, 'Casos solucionados con visita', 'ftf_rate') }),
  ratioCard('recurrence', 'Reincidencia de averías', 'recurrence_rate', 'recurrence_rate', { better: 'down', tone: 'danger', numLabel: 'reincidieron', denLabel: 'eventos evaluables', drill: drill('failures', { in_period: true, recurrence_evaluable: true }, 'Eventos de avería evaluables', 'recurrence_rate') }),
];
const csatCard = ratioCard('csat', 'Satisfacción del cliente', 'csat', 'csat', {
  better: 'up', tone: 'good', numLabel: 'con 4 o 5', denLabel: 'encuestas respondidas', drill: drill('surveys', { in_period: true }, 'Encuestas respondidas', 'csat'),
  extra: m => num(m.satisfaction_avg) === null ? '' : `promedio ${decimal.format(num(m.satisfaction_avg)!)} / 5`,
});
const attireCard = ratioCard('attire', 'Bata y gafete en visitas', 'attire', 'attire', {
  better: 'up', tone: 'good', numLabel: 'con bata y gafete', denLabel: 'visitas evaluadas por el cliente', drill: drill('surveys', { in_period: true }, 'Encuestas respondidas', 'attire'),
  extra: m => ratioOf(m.attire_coat).pct === null ? '' : `con bata ${formatPct(ratioOf(m.attire_coat).pct)} · con gafete ${formatPct(ratioOf(m.attire_badge).pct)}`,
});
// Survey cards stay hidden until a customer has answered at least one survey.
export const surveyCardIds = ['csat', 'attire'];
const trainingCards: CardSpec[] = [
  countCard('trainings', 'Capacitaciones', 'trainings', 'trainings', { drill: drill('activities', { in_period: true, training_kind: 'capacitacion' }, 'Capacitaciones', 'trainings') }),
  countCard('retrainings', 'Recapacitaciones', 'trainings', 'retrainings', { drill: drill('activities', { in_period: true, training_kind: 'recapacitacion' }, 'Recapacitaciones', 'trainings') }),
  countCard('trainings_done', 'Capacitaciones realizadas', 'trainings', 'trainings_done', {
    better: 'up', tone: 'good', drill: drill('activities', { in_period: true, counts_training: true, done: true }, 'Capacitaciones y recapacitaciones realizadas', 'trainings'),
    detail: m => `de ${formatCount(m.trainings_total)} · ${formatCount(m.trainings_pending)} pendientes · ${formatCount(m.trainings_overdue)} vencidas o sin evidencia`,
  }),
];
const visitCards: CardSpec[] = [
  countCard('visits', 'Visitas', 'visits', 'visits', { drill: drill('activities', { in_period: true, is_visit: true }, 'Visitas', 'visits'), detail: m => `${formatCount(m.visits_with_failure)} con código de avería` }),
];
const callCards: CardSpec[] = [
  countCard('calls', 'Servicios telefónicos', 'calls', 'calls', { drill: drill('activities', { in_period: true, is_call: true }, 'Servicios telefónicos', 'calls') }),
  valueCard('call_duration', 'Duración promedio', 'call_duration', m => {
    const calls = num(m.calls) ?? 0; const measured = num(m.calls_with_duration) ?? 0;
    if (calls === 0) return { value: 'No aplica', detail: 'Sin llamadas en el periodo', state: 'na' };
    if (measured === 0) return { value: 'Sin dato', detail: `0 de ${formatCount(calls)} llamadas con duración`, state: 'missing' };
    return { value: formatMinutes(m.call_minutes_avg), detail: `${formatCount(measured)} de ${formatCount(calls)} llamadas con duración`, state: 'ok' };
  }, { drill: drill('activities', { in_period: true, is_call: true, has_duration: true }, 'Llamadas con duración', 'call_duration') }),
  ratioCard('calls_resolved', 'Resuelto sin visita', 'calls_resolved_rate', 'calls_resolved_rate', {
    better: 'up', tone: 'good', numLabel: 'resueltas', denLabel: 'llamadas con resultado',
    drill: drill('activities', { in_period: true, is_call: true, has_result: true }, 'Llamadas con resultado registrado', 'calls_resolved_rate'),
  }),
];
const preventiveCards: CardSpec[] = [
  countCard('preventive_programmed', 'Preventivos programados', 'preventive_compliance', 'preventive_programmed', { drill: drill('activities', { in_period: true, is_planned: true, kind: 'preventivo' }, 'Preventivos programados', 'preventive_compliance') }),
  ratioCard('preventive_compliance', 'Cumplimiento de preventivos', 'preventive_compliance', 'preventive_compliance', {
    better: 'up', tone: 'good', numLabel: 'realizados', denLabel: 'programados',
    extra: m => `${formatCount(m.preventive_pending)} pendientes · ${formatCount(m.preventive_overdue)} vencidos · ${formatCount(m.preventive_no_evidence)} cerrados sin evidencia`,
    drill: drill('activities', { in_period: true, is_planned: true, kind: 'preventivo', plan_status: 'realizado' }, 'Preventivos programados realizados', 'preventive_compliance'),
  }),
  countCard('preventive_overdue', 'Preventivos vencidos', 'preventive_compliance', 'preventive_overdue', { better: 'down', tone: 'danger', drill: drill('activities', { in_period: true, is_planned: true, kind: 'preventivo', plan_status: 'vencido' }, 'Preventivos vencidos sin evidencia', 'preventive_compliance') }),
  countCard('preventive_off_schedule', 'Preventivos fuera de programación', 'preventive_off_schedule', 'preventive_off_schedule', { drill: drill('activities', { in_period: true, preventive_off_schedule: true }, 'Preventivos realizados fuera de programación', 'preventive_off_schedule') }),
];
const correctiveCards: CardSpec[] = [
  countCard('corrective', 'Mantenimientos correctivos', 'corrective', 'corrective', { drill: drill('activities', { in_period: true, is_visit: true, kinds: ['correctivo'] }, 'Mantenimientos correctivos', 'corrective') }),
  ratioCard('corrective_share', 'Participación correctiva', 'corrective_share', 'corrective_share', {
    better: 'down', numLabel: 'correctivos', denLabel: 'visitas con mantenimiento',
    drill: drill('activities', { in_period: true, is_maintenance_visit: true }, 'Visitas con mantenimiento', 'corrective_share'),
  }),
];
const partCards: CardSpec[] = [
  valueCard('parts', 'Piezas utilizadas', 'parts', m => {
    const qty = num(m.parts_qty) ?? 0;
    return { value: formatCount(qty), detail: qty === 0 ? 'Sin piezas registradas en el periodo' : `${formatCount(m.parts_qty_preventive)} en preventivos · ${formatCount(m.parts_qty_corrective)} en correctivos · ${formatCount(m.parts_lines)} líneas`, state: qty === 0 ? 'zero' : 'ok' };
  }, { drill: drill('parts', { in_period: true }, 'Piezas utilizadas', 'parts') }),
  valueCard('parts_cost', 'Costo de piezas', 'parts_cost', m => {
    const lines = num(m.parts_lines) ?? 0; const costed = num(m.parts_cost_lines) ?? 0;
    if (lines === 0) return { value: 'No aplica', detail: 'Sin piezas en el periodo', state: 'na' };
    if (costed === 0) return { value: 'Sin dato', detail: 'Ninguna línea tiene precio registrado', state: 'missing' };
    return { value: formatMoney(m.parts_cost_total), detail: `${formatCount(costed)} de ${formatCount(lines)} líneas con precio`, state: 'ok' };
  }, { drill: drill('parts', { in_period: true, has_cost: true }, 'Piezas con costo registrado', 'parts_cost') }),
];

export interface CardSection { id: string; title: string; subtitle: string; cards: CardSpec[] }
export const sectionsFor = (view: KpiView): CardSection[] => {
  if (view === 'quimica') return [
    { id: 'capacitaciones', title: 'Capacitaciones y recapacitaciones', subtitle: 'Programadas en planeación y ejecutadas', cards: trainingCards },
    { id: 'visitas', title: 'Visitas y servicios telefónicos', subtitle: 'Motivo, avería, solución y resultado', cards: [...visitCards, ...callCards] },
    { id: 'tickets', title: 'Tickets', subtitle: 'Apertura, cierre, tiempos y plazo comprometido', cards: ticketCards(' · químicos') },
    { id: 'calidad', title: 'Calidad del servicio', subtitle: 'Reaperturas, primera visita, reincidencia y satisfacción', cards: [...qualityCards, csatCard, attireCard] },
  ];
  if (view === 'ingenieria') return [
    { id: 'preventivos', title: 'Mantenimientos preventivos', subtitle: 'Programado contra realizado por mes', cards: preventiveCards },
    { id: 'correctivos', title: 'Correctivos y visitas', subtitle: 'Participación en el total mensual de mantenimientos', cards: [...correctiveCards, ...visitCards] },
    { id: 'piezas', title: 'Refacciones', subtitle: 'Uso por tipo de servicio, mes, sector y plataforma', cards: partCards },
    { id: 'telefono', title: 'Servicios telefónicos', subtitle: 'Duración, motivo y resultado', cards: callCards },
    { id: 'tickets', title: 'Tickets', subtitle: 'Apertura, cierre, tiempos y plazo comprometido', cards: ticketCards(' · ingenieros') },
    { id: 'calidad', title: 'Calidad del servicio', subtitle: 'Reaperturas, primera visita, reincidencia y satisfacción', cards: [...qualityCards, csatCard, attireCard] },
  ];
  return [
    { id: 'tickets', title: 'Cumplimiento y tiempos', subtitle: 'Todos los tickets de soporte', cards: ticketCards('') },
    { id: 'calidad', title: 'Calidad del servicio', subtitle: 'Reaperturas, primera visita, reincidencia y satisfacción', cards: [...qualityCards, csatCard, attireCard] },
    { id: 'refacciones', title: 'Refacciones', subtitle: 'Uso por tipo de servicio, mes, sector y plataforma', cards: partCards },
    { id: 'actividad', title: 'Actividad de campo', subtitle: 'Preventivos, correctivos, visitas, llamadas y capacitaciones', cards: [
      preventiveCards[1], correctiveCards[1], ...visitCards, callCards[0], countCard('trainings_total', 'Capacitaciones y recapacitaciones', 'trainings', 'trainings_total', {
        drill: drill('activities', { in_period: true, counts_training: true }, 'Capacitaciones y recapacitaciones', 'trainings'),
      }),
    ] },
  ];
};

// ── Charts (one y-axis each; rates get their own chart) ────────────────────────────────────
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a'];
export const STATUS_DANGER = '#c3545c';
export interface ChartSeries { key: string; label: string; color?: string; drill?: (bucket: string) => Drill }
export interface ChartSpec { id: string; title: string; definition: string; series: ChartSeries[]; rate?: { num: string; den: string; label: string } }
export const chartsFor = (view: KpiView): ChartSpec[] => {
  const tickets: ChartSpec = { id: 'tickets', title: 'Tickets abiertos y cerrados', definition: 'tickets_opened', series: [
    { key: 'opened', label: 'Abiertos', drill: bucket => drill('tickets', { opened_in_period: true, opened_bucket: bucket }, 'Tickets abiertos en el intervalo', 'tickets_opened') },
    { key: 'closed', label: 'Cerrados', drill: bucket => drill('tickets', { closed_in_period: true, closed_bucket: bucket }, 'Tickets cerrados en el intervalo', 'tickets_closed') },
  ] };
  const late: ChartSpec = { id: 'late', title: 'Cierres fuera del plazo', definition: 'late_rate', series: [
    { key: 'closed_late', label: 'Fuera del plazo', color: STATUS_DANGER, drill: bucket => drill('tickets', { closed_in_period: true, sla_result: 'fuera', closed_bucket: bucket }, 'Cierres fuera del plazo en el intervalo', 'late_rate') },
  ], rate: { num: 'closed_late', den: 'sla_evaluable', label: '% fuera del plazo' } };
  const trainings: ChartSpec = { id: 'trainings', title: 'Capacitaciones y recapacitaciones', definition: 'trainings', series: [
    { key: 'trainings', label: 'Capacitaciones', drill: bucket => drill('activities', { in_period: true, training_kind: 'capacitacion', bucket }, 'Capacitaciones en el intervalo', 'trainings') },
    { key: 'retrainings', label: 'Recapacitaciones', drill: bucket => drill('activities', { in_period: true, training_kind: 'recapacitacion', bucket }, 'Recapacitaciones en el intervalo', 'trainings') },
  ] };
  const field: ChartSpec = { id: 'field', title: 'Visitas y llamadas', definition: 'visits', series: [
    { key: 'visits', label: 'Visitas', drill: bucket => drill('activities', { in_period: true, is_visit: true, bucket }, 'Visitas en el intervalo', 'visits') },
    { key: 'calls', label: 'Llamadas', drill: bucket => drill('activities', { in_period: true, is_call: true, bucket }, 'Llamadas en el intervalo', 'calls') },
  ] };
  const preventive: ChartSpec = { id: 'preventive', title: 'Preventivos programados y realizados', definition: 'preventive_compliance', series: [
    { key: 'preventive_programmed', label: 'Programados', drill: bucket => drill('activities', { in_period: true, is_planned: true, kind: 'preventivo', bucket }, 'Preventivos programados en el intervalo', 'preventive_compliance') },
    { key: 'preventive_done', label: 'Realizados de lo programado', drill: bucket => drill('activities', { in_period: true, is_planned: true, kind: 'preventivo', plan_status: 'realizado', bucket }, 'Preventivos programados realizados', 'preventive_compliance') },
    { key: 'preventive_off_schedule', label: 'Fuera de programación', drill: bucket => drill('activities', { in_period: true, preventive_off_schedule: true, bucket }, 'Preventivos fuera de programación', 'preventive_off_schedule') },
  ], rate: { num: 'preventive_done', den: 'preventive_programmed', label: '% cumplimiento' } };
  const maintenance: ChartSpec = { id: 'maintenance', title: 'Preventivo contra correctivo', definition: 'corrective_share', series: [
    { key: 'preventive_executed', label: 'Preventivos realizados', drill: bucket => drill('activities', { in_period: true, is_visit: true, kinds: ['preventivo'], bucket }, 'Preventivos realizados en el intervalo', 'corrective_share') },
    { key: 'corrective', label: 'Correctivos', drill: bucket => drill('activities', { in_period: true, is_visit: true, kinds: ['correctivo'], bucket }, 'Correctivos en el intervalo', 'corrective') },
  ], rate: { num: 'corrective', den: 'maintenance_visits', label: '% correctivo' } };
  if (view === 'quimica') return [trainings, field, tickets, late];
  if (view === 'ingenieria') return [preventive, maintenance, tickets, late];
  return [tickets, late, maintenance, field];
};
export const rateOf = (row: SeriesRow, rate: NonNullable<ChartSpec['rate']>) => {
  const den = num(row[rate.den]) ?? 0;
  return den === 0 ? null : Math.round((num(row[rate.num]) ?? 0) / den * 1000) / 10;
};

// ── Periods ────────────────────────────────────────────────────────────────────────────────
export const presetLabels: Record<PeriodPreset, string> = {
  mes: 'Mes en curso', mes_anterior: 'Mes anterior', '4_semanas': 'Últimas 4 semanas', '12_semanas': 'Últimas 12 semanas',
  trimestre: 'Trimestre en curso', '6_meses': 'Últimos 6 meses', '12_meses': 'Últimos 12 meses', anio: 'Año en curso', personalizado: 'Personalizado',
};
export const isoDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const presetRange = (preset: PeriodPreset, today = new Date()) => {
  const y = today.getFullYear(); const m = today.getMonth(); const d = today.getDate();
  const day = (year: number, month: number, date: number) => isoDay(new Date(year, month, date));
  const to = day(y, m, d);
  switch (preset) {
    case 'mes_anterior': return { from: day(y, m - 1, 1), to: day(y, m, 0) };
    case '4_semanas': return { from: day(y, m, d - 27), to };
    case '12_semanas': return { from: day(y, m, d - 83), to };
    case 'trimestre': return { from: day(y, Math.floor(m / 3) * 3, 1), to };
    case '6_meses': return { from: day(y, m - 5, 1), to };
    case '12_meses': return { from: day(y, m - 11, 1), to };
    case 'anio': return { from: day(y, 0, 1), to };
    default: return { from: day(y, m, 1), to };
  }
};
export const defaultFilters = (view: KpiView, today = new Date()): KpiFilters => {
  const preset: PeriodPreset = view === 'quimica' ? '12_semanas' : view === 'ingenieria' ? '12_meses' : '6_meses';
  return { preset, ...presetRange(preset, today), granularity: view === 'quimica' ? 'week' : 'month',
    person: '', client: '', platform: '', serial: '', service_type: '', priority: '', status: '', recurrence_days: '' };
};
export const toRpcFilters = (view: KpiView, filters: KpiFilters) => {
  const payload: Record<string, string | number> = { from: filters.from, to: filters.to, granularity: filters.granularity };
  if (view !== 'general') payload.team = view;
  for (const key of ['person', 'client', 'platform', 'serial', 'service_type', 'priority', 'status'] as const) if (filters[key].trim()) payload[key] = filters[key].trim();
  if (filters.recurrence_days.trim()) payload.recurrence_days = Number(filters.recurrence_days);
  return payload;
};

// ── Records: columns shared by the table and both exports ─────────────────────────────────
export interface RecordColumn { key: string; label: string; sort?: string; text: (row: KpiRecord) => string; raw?: (row: KpiRecord) => string | number | Date | null; person?: boolean }
const field = (row: KpiRecord, key: string) => row[key];
const text = (row: KpiRecord, key: string, fallback = 'Sin dato') => {
  const value = row[key];
  return value === null || value === undefined || value === '' ? fallback : String(value);
};
const list = (row: KpiRecord, key: string, map: Record<string, string>) => {
  const values = row[key];
  return Array.isArray(values) && values.length ? values.map(value => labelOf(map, value)).join(', ') : 'Sin dato';
};
const numeric = (row: KpiRecord, key: string) => num(row[key]);
const asDate = (row: KpiRecord, key: string) => {
  const value = row[key];
  if (!value) return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00` : String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};
const people = (row: KpiRecord) => [text(row, 'participant_names', ''), row.unmatched_names ? `Sin perfil: ${row.unmatched_names}` : ''].filter(Boolean).join(' · ') || 'Sin participante identificado';
export const recordColumns: Record<KpiDataset, RecordColumn[]> = {
  tickets: [
    { key: 'folio', label: 'Folio', sort: 'folio', text: r => text(r, 'folio') },
    { key: 'opened_at', label: 'Apertura', sort: 'opened_at', text: r => formatDateTime(field(r, 'opened_at')), raw: r => asDate(r, 'opened_at') },
    { key: 'closed_at', label: 'Cierre', sort: 'closed_at', text: r => formatDateTime(field(r, 'closed_at')), raw: r => asDate(r, 'closed_at') },
    { key: 'estado', label: 'Estado', sort: 'estado', text: r => labelOf(statusLabels, r.estado) },
    { key: 'closure_class', label: 'Resultado del cierre', sort: 'closure_class', text: r => r.closure_class ? labelOf(closureLabels, r.closure_class) : 'En atención' },
    { key: 'responsible_name', label: 'Responsable', sort: 'responsible_name', person: true, text: r => text(r, 'responsible_name', 'Sin responsable asignado') },
    { key: 'team', label: 'Equipo', sort: 'team', text: r => labelOf(teamLabels, r.team) },
    { key: 'service_type', label: 'Tipo de servicio', sort: 'service_type', text: r => labelOf(serviceTypeLabels, r.service_type) },
    { key: 'priority', label: 'Prioridad', sort: 'priority', text: r => labelOf(priorityLabels, r.priority) },
    { key: 'client', label: 'Cliente', sort: 'client', text: r => text(r, 'client', 'Sin cliente identificado') },
    { key: 'platform', label: 'Plataforma', sort: 'platform', text: r => text(r, 'platform', 'Sin plataforma') },
    { key: 'serial', label: 'Serie', sort: 'serial', text: r => text(r, 'serial', 'Sin serie') },
    { key: 'first_response_hours', label: 'Primera respuesta', sort: 'first_response_hours', text: r => formatHours(r.first_response_hours), raw: r => numeric(r, 'first_response_hours') },
    { key: 'resolution_hours', label: 'Resolución', sort: 'resolution_hours', text: r => r.resolution_hours === null ? 'No aplica' : formatHours(r.resolution_hours), raw: r => numeric(r, 'resolution_hours') },
    { key: 'sla_policy', label: 'Regla de plazo', sort: 'sla_policy', text: r => r.sla_policy ? `${r.sla_policy} · ${formatCount(r.sla_target_hours)} h ${r.sla_clock === 'habiles' ? 'hábiles' : 'corridas'}` : 'Sin plazo definido' },
    { key: 'sla_hours', label: 'Horas de plazo consumidas', sort: 'sla_hours', text: r => formatHours(r.sla_hours), raw: r => numeric(r, 'sla_hours') },
    { key: 'sla_result', label: 'Plazo', sort: 'sla_result', text: r => `${labelOf(slaResultLabels, r.sla_result)}${r.justified ? ' · justificado' : ''}` },
    { key: 'age_days', label: 'Antigüedad al corte', sort: 'age_days', text: r => r.age_days === null ? 'No aplica' : `${formatCount(Math.floor(num(r.age_days) || 0))} d`, raw: r => numeric(r, 'age_days') },
    { key: 'reopen', label: 'Reapertura', text: r => [r.reopened ? 'Reabierto después' : '', r.reopen_of_folio ? `Reabre ${r.reopen_of_folio}` : ''].filter(Boolean).join(' · ') || 'No' },
    { key: 'visits', label: 'Visitas / llamadas', sort: 'visits', text: r => `${formatCount(r.visits)} / ${formatCount(r.calls)}` },
  ],
  activities: [
    { key: 'activity_date', label: 'Fecha', sort: 'activity_date', text: r => formatDate(r.activity_date), raw: r => asDate(r, 'activity_date') },
    { key: 'category', label: 'Actividad', sort: 'category', text: r => r.category === 'programada' ? 'Programada' : r.category === 'llamada' ? 'Llamada' : 'Visita' },
    { key: 'kind', label: 'Tipo', sort: 'kind', text: r => list(r, 'kinds', kindLabels) },
    { key: 'plan_status', label: 'Estado / evidencia', sort: 'plan_status', text: r => r.plan_status ? `${labelOf(planStatusLabels, r.plan_status)}${r.evidence ? ` · ${r.evidence}` : ''}` : 'Registrada' },
    { key: 'participants', label: 'Participantes', sort: 'participant_names', person: true, text: people },
    { key: 'client', label: 'Cliente', sort: 'client', text: r => text(r, 'client', 'Sin cliente identificado') },
    { key: 'platform', label: 'Plataforma', sort: 'platform', text: r => text(r, 'platform', 'Sin plataforma') },
    { key: 'serial', label: 'Serie', sort: 'serial', text: r => text(r, 'serial', 'Sin serie') },
    { key: 'reason', label: 'Motivo', sort: 'reason', text: r => labelOf(activityMotiveLabels, r.reason) },
    { key: 'failure_labels', label: 'Código de avería', text: r => text(r, 'failure_labels', 'Sin código') },
    { key: 'solution_labels', label: 'Solución aplicada', text: r => text(r, 'solution_labels', 'Sin código') },
    { key: 'result', label: 'Resultado', sort: 'result', text: r => r.result ? labelOf(activityResultLabels, r.result) : r.category === 'programada' ? 'No aplica' : 'Sin dato' },
    { key: 'duration_min', label: 'Duración', sort: 'duration_min', text: r => formatMinutes(r.duration_min), raw: r => numeric(r, 'duration_min') },
    { key: 'source', label: 'Fuente', sort: 'source', text: r => `${text(r, 'source')}${num(r.records) && num(r.records)! > 1 ? ` (${r.records} registros)` : ''}` },
    { key: 'folio', label: 'Ticket', sort: 'folio', text: r => text(r, 'folio', 'Sin ticket') },
  ],
  failures: [
    { key: 'activity_date', label: 'Fecha', sort: 'activity_date', text: r => formatDate(r.activity_date), raw: r => asDate(r, 'activity_date') },
    { key: 'failure_code', label: 'Avería', sort: 'failure_code', text: r => `${text(r, 'failure_code')}${r.failure_label ? ` · ${r.failure_label}` : ''}` },
    { key: 'solution_labels', label: 'Solución aplicada', text: r => text(r, 'solution_labels', 'Sin solución registrada') },
    { key: 'serial', label: 'Serie', sort: 'serial', text: r => text(r, 'serial') },
    { key: 'platform', label: 'Plataforma', sort: 'platform', text: r => text(r, 'platform', 'Sin plataforma') },
    { key: 'client', label: 'Cliente', sort: 'client', text: r => text(r, 'client', 'Sin cliente identificado') },
    { key: 'next_date', label: 'Siguiente misma avería', sort: 'next_date', text: r => r.next_date ? `${formatDate(r.next_date)} (${r.days_to_next} d)` : 'Sin repetición', raw: r => asDate(r, 'next_date') },
    { key: 'recurred', label: 'Reincidencia', sort: 'recurred', text: r => !r.recurrence_evaluable ? 'En observación (ventana incompleta)' : r.recurred ? 'Reincidió' : 'Sin reincidencia' },
    { key: 'participant_names', label: 'Participantes', sort: 'participant_names', person: true, text: r => text(r, 'participant_names', 'Sin participante identificado') },
    { key: 'sources', label: 'Fuente', text: r => text(r, 'sources') },
    { key: 'folio', label: 'Ticket', sort: 'folio', text: r => text(r, 'folio', 'Sin ticket') },
  ],
  parts: [
    { key: 'activity_date', label: 'Fecha', sort: 'activity_date', text: r => formatDate(r.activity_date), raw: r => asDate(r, 'activity_date') },
    { key: 'code', label: 'Código', sort: 'code', text: r => text(r, 'code', 'Sin código') },
    { key: 'description', label: 'Descripción', sort: 'description', text: r => text(r, 'description') },
    { key: 'quantity', label: 'Cantidad', sort: 'quantity', text: r => formatCount(r.quantity), raw: r => numeric(r, 'quantity') },
    { key: 'maintenance_kind', label: 'Mantenimiento', sort: 'maintenance_kind', text: r => labelOf(kindLabels, r.maintenance_kind) },
    { key: 'platform', label: 'Plataforma', sort: 'platform', text: r => text(r, 'platform', 'Sin plataforma') },
    { key: 'serial', label: 'Serie', sort: 'serial', text: r => text(r, 'serial', 'Sin serie') },
    { key: 'client', label: 'Cliente', sort: 'client', text: r => text(r, 'client', 'Sin cliente identificado') },
    { key: 'record_ref', label: 'Mantenimiento asociado', sort: 'record_ref', text: r => text(r, 'record_ref') },
    { key: 'participant_names', label: 'Personal', sort: 'participant_names', person: true, text: r => text(r, 'participant_names', 'Sin participante identificado') },
    { key: 'unit_cost', label: 'Costo unitario', sort: 'unit_cost', text: r => formatMoney(r.unit_cost), raw: r => numeric(r, 'unit_cost') },
    { key: 'line_cost', label: 'Costo total', sort: 'line_cost', text: r => formatMoney(r.line_cost), raw: r => numeric(r, 'line_cost') },
    { key: 'source', label: 'Fuente', sort: 'source', text: r => text(r, 'source') },
    { key: 'folio', label: 'Ticket', sort: 'folio', text: r => text(r, 'folio', 'Sin ticket') },
  ],
  surveys: [
    { key: 'answered_at', label: 'Respuesta', sort: 'answered_at', text: r => formatDateTime(r.answered_at), raw: r => asDate(r, 'answered_at') },
    { key: 'folio', label: 'Ticket', sort: 'folio', text: r => text(r, 'folio') },
    { key: 'specialist_name', label: 'Especialista', sort: 'specialist_name', person: true, text: r => text(r, 'specialist_name', 'Sin especialista asignado') },
    { key: 'satisfaction', label: 'Satisfacción', sort: 'satisfaction', text: r => `${text(r, 'satisfaction')} / 5`, raw: r => numeric(r, 'satisfaction') },
    { key: 'speed', label: 'Rapidez', sort: 'speed', text: r => `${text(r, 'speed')} / 5`, raw: r => numeric(r, 'speed') },
    { key: 'clarity', label: 'Claridad', sort: 'clarity', text: r => r.clarity === null ? 'Sin dato' : `${r.clarity} / 5`, raw: r => numeric(r, 'clarity') },
    { key: 'resolution', label: 'Resolución', sort: 'resolution', text: r => ({ total: 'Total', partial: 'Parcial', unresolved: 'No resuelto' } as Record<string, string>)[String(r.resolution)] || 'Sin dato' },
    { key: 'attire', label: 'Bata y gafete', sort: 'attire', text: r => attireLabels[String(r.attire)] || 'Sin dato' },
    { key: 'comment', label: 'Comentario', text: r => text(r, 'comment', 'Sin comentario') },
  ],
};
export const defaultSort: Record<KpiDataset, string> = { tickets: 'opened_at', activities: 'activity_date', failures: 'activity_date', parts: 'activity_date', surveys: 'answered_at' };

export const csvEscape = (value: unknown) => {
  const textValue = value === null || value === undefined ? '' : value instanceof Date ? value.toISOString() : String(value);
  // A leading formula character would execute in a spreadsheet; prefix it so it stays text.
  const safe = /^[=+\-@\t\r]/.test(textValue) ? `'${textValue}` : textValue;
  return /[",\n\r;]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};
export const toCsv = (columns: RecordColumn[], rows: KpiRecord[]) =>
  `\uFEFF${[columns.map(column => csvEscape(column.label)).join(','), ...rows.map(row => columns.map(column => csvEscape(column.text(row))).join(','))].join('\r\n')}\r\n`;
export const describeFilters = (view: KpiView, filters: KpiFilters, people: Array<{ id: string; name: string }>) => [
  ['Vista', viewLabels[view]], ['Periodo', `${filters.from} a ${filters.to}`], ['Agrupación', { week: 'Semana', month: 'Mes', quarter: 'Trimestre' }[filters.granularity]],
  ['Colaborador', people.find(person => person.id === filters.person)?.name || 'Todos'], ['Cliente', filters.client || 'Todos'], ['Plataforma', filters.platform || 'Todas'],
  ['Serie', filters.serial || 'Todas'], ['Tipo de servicio', filters.service_type ? labelOf(serviceTypeLabels, filters.service_type) : 'Todos'],
  ['Prioridad', filters.priority ? labelOf(priorityLabels, filters.priority) : 'Todas'], ['Estado del ticket', filters.status ? labelOf(statusLabels, filters.status) : 'Todos'],
  ['Ventana de reincidencia', filters.recurrence_days ? `${filters.recurrence_days} días` : 'Configurada (predeterminada)'],
] as Array<[string, string]>;
