import catalog from './ba400AlarmCatalog.json';
import { BA400_PART_BY_ID } from '../dri/model3d/ba400Mapping';

export interface MonitoringAlarm {
  id: number;
  codigo_error?: string | null;
  descripcion_error?: string | null;
  seccion_error?: string | null;
  tipo_mensaje?: string | null;
  detected_at?: string | null;
  created_at?: string | null;
}

export const isBa400Serial = (serial: string) => /^83400\d+$/.test(serial.replace(/\s/g, ''));

/** Complete v2.20 classification. Geometry is BA400 only; never infer a part from prose. */
export const BA400_ALARM_CATALOG = catalog;
export const BA400_ALARM_LOCATIONS = Object.values(catalog)
  .filter(entry => entry.partId !== null)
  .map(entry => ({ codes: [entry.code], partId: entry.partId!, partIds: entry.partIds, label: entry.target }));

export function normalizeBa400AlarmCode(value: string | null | undefined) {
  const raw = String(value ?? '').trim();
  const match = /^(?:E\s*:?\s*)?(?:\((\d+)\)|(\d+))$/i.exec(raw);
  return match ? String(Number(match[1] || match[2])) : null;
}

export function classifyBa400Alarm(alarm: MonitoringAlarm) {
  const code = normalizeBa400AlarmCode(alarm.codigo_error);
  return code ? (catalog as Record<string, (typeof catalog)[keyof typeof catalog]>)[code] ?? null : null;
}

export function resolveBa400Alarm(alarm: MonitoringAlarm) {
  const entry = classifyBa400Alarm(alarm);
  return entry?.partId && entry.partIds.length > 0 && entry.partIds.every(id => BA400_PART_BY_ID.has(id))
    ? { codes: [entry.code], partId: entry.partId, partIds: entry.partIds, label: entry.target } : null;
}

export function ba400AlarmLocationLabel(alarm: MonitoringAlarm) {
  const entry = classifyBa400Alarm(alarm);
  if (!entry) return 'Sin ubicación 3D definida · Código no catalogado';
  if (entry.scope === 'consequence') return 'Analizador completo · Evento derivado · Sin pieza asociada';
  if (entry.scope === 'equipment' || entry.scope === 'status') return 'Analizador completo · Sin pieza asociada';
  return resolveBa400Alarm(alarm) ? `${entry.target} · Ubicación 3D definida`
    : `${entry.target} · Sin ubicación 3D definida`;
}

export function alarmTone(alarm: MonitoringAlarm): 'fatal' | 'warning' | 'unknown' {
  const reported = alarm.tipo_mensaje?.toLowerCase();
  const tone = reported === 'fatal' || reported === 'warning' ? reported : classifyBa400Alarm(alarm)?.severity;
  return tone === 'fatal' || tone === 'warning' ? tone : 'unknown';
}

export function alarmKey(alarm: MonitoringAlarm) {
  // El ID de las filas de estado es sintético y puede cambiar entre refrescos.
  return `${alarm.codigo_error ?? 'sin-codigo'}|${alarm.seccion_error ?? ''}|${alarm.descripcion_error ?? ''}`;
}

/** Antecedentes temporales del mismo equipo, no causalidad inferida.
 * Acepta únicamente filas con fecha y nunca cruza un registro de recuperación.
 * El llamador debe proporcionar el historial de un solo equipo.
 */
export function ba400AlarmAntecedents(alarm: MonitoringAlarm, history: MonitoringAlarm[]) {
  if (classifyBa400Alarm(alarm)?.scope !== 'consequence') return [];
  const time = (row: MonitoringAlarm) => Date.parse(row.detected_at || row.created_at || '');
  const end = time(alarm);
  if (!Number.isFinite(end)) return [];
  const preceding = history.filter(row => Number.isFinite(time(row)) && time(row) <= end);
  const clearAt = Math.max(-Infinity, ...preceding.filter(row =>
    normalizeBa400AlarmCode(row.codigo_error) === '0' || row.tipo_mensaje?.toLowerCase() === 'ok').map(time));
  const candidates = preceding.filter(row => {
    const code = normalizeBa400AlarmCode(row.codigo_error);
    return time(row) > clearAt && code !== '20' && code !== '21' && code !== '99' && code !== '0'
      && (code !== null || !!row.descripcion_error);
  });
  const latest = Math.max(-Infinity, ...candidates.map(time));
  const seen = new Set<string>();
  return candidates.filter(row => {
    const key = alarmKey(row);
    if (time(row) !== latest || seen.has(key)) return false;
    seen.add(key); return true;
  });
}
