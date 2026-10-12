import { useEffect, useState } from 'react';
import { deleteSlaPolicy, loadKpiSettings, saveKpiSettings, saveSlaPolicy } from './serviceKpiApi';
import { formatDateTime, priorityLabels, statusLabels, type SlaPolicy } from './serviceKpiModel';

const DAYS = [[1, 'L'], [2, 'M'], [3, 'X'], [4, 'J'], [5, 'V'], [6, 'S'], [7, 'D']] as const;
const ZONES = ['America/Chihuahua', 'America/Mexico_City', 'America/Ciudad_Juarez', 'America/Monterrey', 'America/Tijuana', 'America/Cancun'];
const blank: Omit<SlaPolicy, 'id'> = {
  name: '', channel: null, region: null, area: null, priority: null, target_hours: 48, clock: 'corridas', business_start: '09:00', business_end: '18:00',
  business_days: [1, 2, 3, 4, 5], timezone: 'America/Chihuahua', pause_states: [], precedence: 50, active: true, notes: '',
};
const scope = (policy: SlaPolicy) => [
  policy.channel ? `Canal ${policy.channel.toUpperCase()}` : '', policy.region ? (policy.region === 'cdmx' ? 'CDMX' : 'Foráneo') : '',
  policy.area ? (policy.area === 'quimica' ? 'Soporte químico' : 'Soporte de ingeniería') : '', policy.priority ? `Prioridad ${priorityLabels[policy.priority]}` : '',
].filter(Boolean).join(' · ') || 'Todos los tickets de soporte';

// Explicit SLA configuration. Saving only changes the rules; tickets are re-evaluated when the
// indicators are queried, so history is never rewritten.
export default function ServiceSlaPolicies({ policies, onChanged }: { policies: SlaPolicy[]; onChanged: () => void }) {
  const [draft, setDraft] = useState<(Omit<SlaPolicy, 'id'> & { id?: string }) | null>(null);
  const [settings, setSettings] = useState<{ timezone: string; recurrence_days: number; min_sample: number; capture_since: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { loadKpiSettings().then(setSettings).catch(cause => setError((cause as Error).message)); }, []);
  const run = async (task: () => Promise<void>, done: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await task(); setNotice(done); onChanged(); return true; } catch (cause) { setError((cause as Error).message); return false; } finally { setBusy(false); }
  };
  const update = <K extends keyof SlaPolicy>(key: K, value: SlaPolicy[K]) => setDraft(current => current && { ...current, [key]: value });
  const toggle = (key: 'business_days' | 'pause_states', value: never) => setDraft(current => {
    if (!current) return current;
    const values = current[key] as unknown[];
    return { ...current, [key]: values.includes(value) ? values.filter(item => item !== value) : [...values, value].sort() };
  });
  return <details className="kpi-config">
    <summary>Reglas de plazo (SLA) y parámetros <span>Configuración explícita · solo administradores</span></summary>
    <p>Cada ticket de soporte usa la regla activa que coincide con su canal, región, especialidad y prioridad; si varias coinciden, gana la de menor precedencia. Sin regla activa el ticket queda “sin plazo definido”: nunca se supone un plazo.</p>
    <div className="tc-table-scroll"><table className="tc-table"><thead><tr><th>Regla</th><th>Aplica a</th><th>Plazo</th><th>Reloj</th><th>Pausas</th><th>Precedencia</th><th>Estado</th><th><span className="tc-sr-only">Acciones</span></th></tr></thead>
      <tbody>{policies.map(policy => <tr key={policy.id}>
        <td><strong>{policy.name}</strong>{policy.notes && <small>{policy.notes}</small>}</td>
        <td>{scope(policy)}</td>
        <td><strong>{policy.target_hours} h</strong></td>
        <td>{policy.clock === 'habiles' ? `Hábiles ${policy.business_start.slice(0, 5)}–${policy.business_end.slice(0, 5)} · ${DAYS.filter(([day]) => policy.business_days.includes(day)).map(([, label]) => label).join('')}` : 'Corridas'}<small>{policy.timezone}</small></td>
        <td>{policy.pause_states.length ? policy.pause_states.map(state => statusLabels[state]).join(', ') : 'Sin pausas'}</td>
        <td>{policy.precedence}</td>
        <td>{policy.active ? 'Activa' : 'Inactiva'}</td>
        <td><button type="button" className="tc-open" disabled={busy} onClick={() => setDraft({ ...policy, business_start: policy.business_start.slice(0, 5), business_end: policy.business_end.slice(0, 5), notes: policy.notes || '' })}>Editar</button></td>
      </tr>)}</tbody></table></div>
    {!draft && <button type="button" disabled={busy} onClick={() => setDraft({ ...blank })}>Agregar regla de plazo</button>}
    {draft && <form className="kpi-config-form" onSubmit={event => { event.preventDefault(); void run(() => saveSlaPolicy({ ...draft, notes: draft.notes?.trim() || null }), 'Regla guardada. Los indicadores se recalcularon.')
      .then(saved => { if (saved) setDraft(null); }); }}>
      <label>Nombre<input required minLength={3} maxLength={120} value={draft.name} onChange={event => update('name', event.target.value)} /></label>
      <label>Canal<select value={draft.channel || ''} onChange={event => update('channel', event.target.value || null)}><option value="">Cualquiera</option><option value="falcon">Falcon</option><option value="centrum">Centrum</option><option value="genesis">Genesis</option></select></label>
      <label>Región<select value={draft.region || ''} onChange={event => update('region', event.target.value || null)}><option value="">Cualquiera</option><option value="cdmx">Ciudad de México</option><option value="foraneo">Foráneo</option></select></label>
      <label>Especialidad<select value={draft.area || ''} onChange={event => update('area', event.target.value || null)}><option value="">Cualquiera</option><option value="quimica">Soporte químico</option><option value="ingenieria">Soporte de ingeniería</option></select></label>
      <label>Prioridad<select value={draft.priority || ''} onChange={event => update('priority', event.target.value || null)}><option value="">Cualquiera</option>{['critica', 'alta', 'media', 'baja'].map(value => <option key={value} value={value}>{priorityLabels[value]}</option>)}</select></label>
      <label>Plazo (horas)<input type="number" required min={0.5} max={2160} step={0.5} value={draft.target_hours} onChange={event => update('target_hours', Number(event.target.value))} /></label>
      <label>Reloj<select value={draft.clock} onChange={event => update('clock', event.target.value as SlaPolicy['clock'])}><option value="corridas">Horas corridas</option><option value="habiles">Horas hábiles</option></select></label>
      {draft.clock === 'habiles' && <>
        <label>Inicio de jornada<input type="time" required value={draft.business_start} onChange={event => update('business_start', event.target.value)} /></label>
        <label>Fin de jornada<input type="time" required value={draft.business_end} onChange={event => update('business_end', event.target.value)} /></label>
        <fieldset><legend>Días hábiles</legend>{DAYS.map(([day, label]) => <label key={day} className="kpi-check"><input type="checkbox" checked={draft.business_days.includes(day)} onChange={() => toggle('business_days', day as never)} />{label}</label>)}</fieldset>
      </>}
      <label>Zona horaria<input list="kpi-zones" required value={draft.timezone} onChange={event => update('timezone', event.target.value)} /><datalist id="kpi-zones">{ZONES.map(zone => <option key={zone} value={zone} />)}</datalist></label>
      <fieldset><legend>Pausar el reloj en</legend>{['pendiente_piezas', 'en_observacion'].map(state => <label key={state} className="kpi-check"><input type="checkbox" checked={draft.pause_states.includes(state)} onChange={() => toggle('pause_states', state as never)} />{statusLabels[state]}</label>)}</fieldset>
      <label>Precedencia<input type="number" required min={0} max={1000} value={draft.precedence} onChange={event => update('precedence', Number(event.target.value))} /></label>
      <label className="kpi-check"><input type="checkbox" checked={draft.active} onChange={event => update('active', event.target.checked)} />Regla activa</label>
      <label className="kpi-config-wide">Notas<input maxLength={500} value={draft.notes || ''} onChange={event => update('notes', event.target.value)} /></label>
      <p className="kpi-config-wide">Las pausas se descuentan desde que existe el historial de estados ({settings ? formatDateTime(settings.capture_since) : 'inicio de captura'}); antes de esa fecha no hay registro de cuándo estuvo pausado un caso.</p>
      <div className="kpi-config-actions kpi-config-wide">
        <button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar regla'}</button>
        <button type="button" disabled={busy} onClick={() => setDraft(null)}>Cancelar</button>
        {draft.id && <button type="button" className="kpi-danger" disabled={busy} onClick={() => { if (window.confirm(`¿Eliminar la regla “${draft.name}”? Los tickets que la usaban tomarán la siguiente regla que coincida.`)) void run(() => deleteSlaPolicy(draft.id!), 'Regla eliminada.').then(saved => { if (saved) setDraft(null); }); }}>Eliminar regla</button>}
      </div>
    </form>}
    {settings && <form className="kpi-config-form" onSubmit={event => { event.preventDefault(); void run(() => saveKpiSettings({ timezone: settings.timezone, recurrence_days: settings.recurrence_days, min_sample: settings.min_sample }), 'Parámetros guardados.'); }}>
      <label>Zona horaria de los periodos<input list="kpi-zones" required value={settings.timezone} onChange={event => setSettings({ ...settings, timezone: event.target.value })} /></label>
      <label>Ventana de reincidencia (días)<input type="number" required min={1} max={365} value={settings.recurrence_days} onChange={event => setSettings({ ...settings, recurrence_days: Number(event.target.value) })} /></label>
      <label>Muestra mínima para efectividad<input type="number" required min={1} max={100} value={settings.min_sample} onChange={event => setSettings({ ...settings, min_sample: Number(event.target.value) })} /></label>
      <label>Inicio de captura de campos nuevos<input readOnly value={formatDateTime(settings.capture_since)} /></label>
      <div className="kpi-config-actions kpi-config-wide"><button type="submit" disabled={busy}>Guardar parámetros</button></div>
    </form>}
    {error && <p role="alert" className="tc-error">{error}</p>}
    {notice && <p role="status" className="kpi-notice">{notice}</p>}
  </details>;
}
