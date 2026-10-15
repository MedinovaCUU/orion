// Why tickets closed out of time: one cause per late ticket, so the shares of a cell add up to 100 %.
// Order: the user stopped answering → our first response is missing (Orion tickets only; Biosisa never
// recorded it) → waiting for parts → a visit had to be scheduled → the failure family (catalog code first,
// otherwise the ticket text) → no failure identified.
import type { TicketPoint } from './kpiAnalytics';

export interface LateInfo { ticket_id: string; codes: Array<{ code: string; family: string | null; label: string | null }>; waited_parts: boolean; text: string }
export interface LateCause { key: string; label: string; by: 'cierre' | 'respuesta' | 'piezas' | 'codigo' | 'texto' | 'sin_dato'; detail?: string }

const FAMILY_LABELS: Record<string, string> = {
  Mecánica: 'Falla mecánica', Fluídica: 'Falla de fluídica', Electrónica: 'Falla electrónica', Termo: 'Falla de temperatura', Software: 'Software o computadora',
  Optica: 'Óptica / lámpara', Óptica: 'Óptica / lámpara', Comunicaciones: 'Comunicaciones / LIS', Firmware: 'Software o computadora', Aplicativo: 'Técnicas y resultados',
  'Informacion/Formacion': 'Dudas y capacitación', Otros: 'Otra falla', Agua: 'Agua / ósmosis',
};
const familyLabel = (family: string | null | undefined) => (family && FAMILY_LABELS[family]) || (family ? `Falla: ${family}` : 'Otra falla');

// Approximate reading of free text: first family whose words appear, in this order (water before electronics
// so «sensor de presión del equipo de agua» is water; optics before results so a lamp is a lamp).
const TEXT_RULES: Array<[string, RegExp]> = [
  ['Agua', /\b(osmosis|equipo de agua|presion de agua|suministr\w* agua|desmineraliz\w*)\b/],
  ['Optica', /\b(lampara\w*|fotometr\w*|linea base|filtro optico|lectura optica)\b/],
  ['Termo', /\b(termostat\w*|temperatura\w*|peltier|nevera|refrigera\w*|incubador\w*)\b/],
  ['Software', /\b(software|computadora\w*|cpu|windows|formate\w*|pila cmos|licencia\w*)\b/],
  ['Comunicaciones', /\b(lis|interfaz|interface|comunicacion\w*|codigo de barras|lector\w*|conexion\w*)\b/],
  ['Fluídica', /\b(lavado|valvula\w*|check|canula\w*|aguja\w*|punta\w*|dosifica\w*|jeringa\w*|bomba\w*|manguera\w*|tubo\w*|fuga\w*|hidraul\w*|dispens\w*|cubeta\w*)\b/],
  ['Mecánica', /\b(rotor\w*|brazo\w*|agitador\w*|correa\w*|banda\w*|eje|colision\w*|motor\w*|home|posicion\w*|ruido\w*|engrane\w*|carro)\b/],
  ['Electrónica', /\b(sensor\w*|tarjeta\w*|fuente\w*|voltaje\w*|electric\w*|energia|no enciende|placa\w*)\b/],
  ['Aplicativo', /\b(control|controles|calibra\w*|reactivo\w*|tecnica\w*|resultado\w*|curva\w*|paciente\w*|lote\w*|analito\w*|repetibilidad|sensibilidad|blanco\w*|electrolito\w*|modulo ise|urea|glucosa|creatinina|lipasa|ggt|alt|ast|fosforo|magnesio|hdl|ldl|microalbumina)\b/],
  ['Informacion/Formacion', /\b(asesor\w*|capacita\w*|instru\w*|duda\w*|explica\w*|formula\w*|redaccion)\b/],
];
const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const GENERIC = /^ticket de soporte biosisa \d+$/i;

export function textFamily(text: string | null | undefined) {
  const clean = normalize((text || '').trim());
  if (!clean || GENERIC.test(clean)) return null;
  return TEXT_RULES.find(([, rule]) => rule.test(clean))?.[0] || null;
}

export function lateCause(point: TicketPoint, info?: LateInfo): LateCause {
  if (point.closureReason === 'sin_respuesta') return { key: 'sin_respuesta_usuario', label: 'Sin respuesta del usuario', by: 'cierre' };
  if (!point.folio.startsWith('BIO-') && !point.hasFirstResponse) return { key: 'sin_primera_respuesta', label: 'Sin primera respuesta de soporte', by: 'respuesta' };
  if (info?.waited_parts) return { key: 'espera_piezas', label: 'En espera de piezas', by: 'piezas' };
  if (point.closureReason === 'visita_programada') return { key: 'visita', label: 'Requirió visita en sitio', by: 'cierre' };
  const coded = info?.codes.find(code => code.family) || info?.codes[0];
  if (coded) return { key: `falla:${coded.family || 'Otros'}`, label: familyLabel(coded.family), by: 'codigo', detail: `${coded.code}${coded.label ? ` · ${coded.label}` : ''}` };
  const family = textFamily(info?.text ?? point.subject);
  if (family) return { key: `falla:${family}`, label: familyLabel(family), by: 'texto' };
  return { key: 'sin_falla', label: 'Sin falla identificada', by: 'sin_dato' };
}

export interface CauseRow { key: string; label: string; n: number; share: number; byCode: number; byText: number }
/** Shares of causes among the late tickets of a list (largest first; ties alphabetical). */
export function causeBreakdown(late: TicketPoint[], infos: Map<string, LateInfo>): CauseRow[] {
  const rows = new Map<string, CauseRow>();
  for (const point of late) {
    const cause = lateCause(point, infos.get(point.id));
    const row = rows.get(cause.key) || { key: cause.key, label: cause.label, n: 0, share: 0, byCode: 0, byText: 0 };
    row.n += 1; if (cause.by === 'codigo') row.byCode += 1; if (cause.by === 'texto') row.byText += 1;
    rows.set(cause.key, row);
  }
  return [...rows.values()].map(row => ({ ...row, share: late.length ? row.n / late.length : 0 })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'es'));
}

/** Late = closed in the period, evaluable and out of time (justified delays included, as in the % fuera map). */
export const isLate = (point: TicketPoint) => point.closedInPeriod && point.evaluable && (point.outcome === 'fuera' || point.outcome === 'justificado');
