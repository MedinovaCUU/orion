import { alarmTone, resolveBa400Alarm, ba400AlarmAntecedents, ba400AlarmLocationLabel, classifyBa400Alarm } from './ba400AlarmMapping';
import type { MonitoringAlarm } from './ba400AlarmMapping';

/** Historial contextual: no transforma un antecedente en una alarma activa. */
export default function AlarmAntecedents({ alarm, history, compact = false }: { alarm: MonitoringAlarm; history: MonitoringAlarm[]; compact?: boolean }) {
  if (classifyBa400Alarm(alarm)?.scope !== 'consequence') return null;
  const antecedents = ba400AlarmAntecedents(alarm, history);
  return <span className={`alarm-antecedents${compact ? ' alarm-antecedents--compact' : ''}`}>
    <b>{antecedents.length ? 'Último antecedente reportado · causa sin confirmar' : 'Causa no disponible en el historial recibido'}</b>
    {antecedents.map((row, index) => <span key={index} className="alarm-antecedents__entry" data-tone={alarmTone(row)}
      data-antecedent-parts={compact ? resolveBa400Alarm(row)?.partIds.join(' ') : undefined} data-antecedent-index={index}>
      <b className="alarm-antecedents__severity">{alarmTone(row) === 'unknown' ? 'SIN CLASIFICAR' : alarmTone(row).toUpperCase()}</b>
      <strong>{row.descripcion_error || classifyBa400Alarm(row)?.description || 'Evento sin descripción'}</strong>
      {!compact ? <span>{ba400AlarmLocationLabel(row)}</span> : null}
      {!compact ? <time dateTime={row.detected_at || row.created_at || undefined}>{new Date(row.detected_at || row.created_at!).toLocaleString('es-MX')}</time> : null}
    </span>)}
  </span>;
}
