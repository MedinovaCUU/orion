import { useEffect, useMemo, useState } from 'react';
import type { PlannedService, QuickCreateDraft, ServiceDetailUpdate } from '../types/servicePlanning.types';
import type { ProfileSummary } from '../../../components/servicesPlanning';
import october from '../../../../public/service-planning-sync/datasets/october-2026.json';
import './livePlanningBoard.css';
import EngineerWall from './EngineerWall';
import FalconSlaWallAlerts from './FalconSlaWallAlerts';
import { buildFalconWallAlerts, type FalconTrackedTicket } from '../helpers/falconWallAlerts';
import useSecondTicker from '../../../components/useSecondTicker';
import { buildRotationRoster } from '../helpers/weekendGuards';

type Props = { services: PlannedService[]; profiles: ProfileSummary[]; month: string; canEdit: boolean; onCreate: (draft: QuickCreateDraft) => Promise<void>; onUpdate: (service: PlannedService, update: ServiceDetailUpdate) => Promise<void>; falconTickets?: FalconTrackedTicket[] };
const NO_FALCON_TICKETS: FalconTrackedTicket[] = [];
const retired = (name: string) => /\berick\b/i.test(name);
const fields = ['scheduledDate', 'serviceType', 'platform', 'locality', 'serialNumber', 'observations', 'responsibleEngineers', 'companions'] as const;
const labels = ['Fecha', 'Tipo', 'Plataforma', 'Localidad', 'NS', 'Observaciones', 'Ingenieros', 'Acompañantes'];
const types = ['preventivo', 'correctivo', 'capacitacion', 'recapacitacion', 'instalacion', 'ingenieria_soporte'];
function EditableRow({ service, canEdit, onUpdate }: { service: PlannedService; canEdit: boolean; onUpdate: Props['onUpdate'] }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const value = (key: typeof fields[number]) => draft[key] ?? (Array.isArray(service[key]) ? service[key].join(' / ') : service[key] || '');
  const save = async () => {
    setBusy(true); setError('');
    try {
      const update = Object.fromEntries(Object.entries(draft).map(([key, text]) => [key, key === 'responsibleEngineers' || key === 'companions' ? text.split('/').map(s => s.trim()).filter(Boolean) : text])) as ServiceDetailUpdate;
      if (update.responsibleEngineers?.some(retired)) throw new Error('Erick ya no está activo. Selecciona otro ingeniero.');
      if (!value('locality').trim()) throw new Error('Indica una localidad.');
      await onUpdate(service, update); setDraft({});
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setBusy(false); }
  };
  return <tr><td>{service.weekLabel}<small>{service.status.join(' · ')}</small></td>{fields.map((key, index) => <td key={key}>{key === 'serviceType' ? <select aria-label={`${labels[index]} ${service.locality}`} disabled={!canEdit || busy} value={value(key)} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}>{types.map(t => <option key={t}>{t}</option>)}</select> : <input aria-label={`${labels[index]} ${service.locality}`} type={key === 'scheduledDate' ? 'date' : 'text'} disabled={!canEdit || busy} value={value(key)} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter' && Object.keys(draft).length) void save(); if (e.key === 'Escape') setDraft({}); }} />}</td>)}<td>{Object.keys(draft).length > 0 && <><button disabled={busy} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar'}</button><button disabled={busy} onClick={() => setDraft({})}>Deshacer</button></>}{error && <span role="alert">{error}</span>}</td></tr>;
}
export default function LivePlanningBoard({ services, profiles, month, canEdit, onCreate, onUpdate, falconTickets = NO_FALCON_TICKETS }: Props) {
  const [today, setToday] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Ciudad_Juarez' }));
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState('');
  const [engineer, setEngineer] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const blank = (): QuickCreateDraft => ({ weekLabel: '', scheduledDate: `${month}-01`, scheduledDay: '', serviceType: 'preventivo', platform: '', locality: '', serialNumber: '', observations: '', responsibleEngineers: '', companions: '', priority: 'media', source: 'orion' });
  const [draft, setDraft] = useState(blank);
  useEffect(() => { const timer = window.setInterval(() => setToday(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Ciudad_Juarez' })), 30000); return () => clearInterval(timer); }, []);
  const guardMembers = useMemo(() => {
    const guards = buildRotationRoster(profiles);
    return [...guards.ingenieria, ...guards.aplicativo].filter(member => member.active && !retired(member.fullName));
  }, [profiles]);
  const roster = guardMembers.map(member => member.fullName);
  // The editable view has no ticket feed, so the strip shows the alerts without assignee names.
  const nowMs = useSecondTicker(falconTickets.length > 0);
  const falconAlerts = useMemo(() => buildFalconWallAlerts(falconTickets, {}, nowMs), [falconTickets, nowMs]);

  const rows = services.filter(s => s.month === month && (!engineer || s.responsibleEngineers.includes(engineer)) && `${s.locality} ${s.platform} ${s.serialNumber} ${s.responsibleEngineers.join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const create = async () => {
    setBusy(true); setError('');
    try {
      if (!draft.locality.trim() || !draft.scheduledDate) throw new Error('Completa fecha y localidad.');
      if (retired(draft.responsibleEngineers)) throw new Error('Selecciona un ingeniero activo.');
      await onCreate(draft); setAdding(false); setDraft(blank());
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo crear'); } finally { setBusy(false); }
  };
  if (!editing) return <EngineerWall territories={Object.fromEntries(profiles.filter(p=>p.territorio && p.nombre_completo).map(p=>[p.nombre_completo!,p.territorio!]))} members={guardMembers} services={services} roster={roster} today={today} onEdit={() => setEditing(true)} falconTickets={falconTickets} />;
  return <section className="live-planning">
    <button onClick={() => setEditing(false)}>Volver al monitor del equipo</button>
    <FalconSlaWallAlerts rows={falconAlerts} />
    <header><div><span className="planning-eyebrow">CENTRO DE OPERACIONES</span><h2>Equipo en vivo</h2><p>Agenda de hoy · {today} · Actualización cada 30 s</p></div><details><summary aria-label="Recuerdo de Erick">🚀</summary><p>Erick ha salido de órbita. ¡Éxito en tu próxima misión!</p></details></header>
    <div className="live-planning__roster">{roster.map(name => {
      const assigned = services.filter(s => s.responsibleEngineers.includes(name) && !s.flags.isCompleted);
      const exact = assigned.filter(s => s.scheduledDate === today);
      const weekly = assigned.filter(s => !s.scheduledDate && s.weekStart <= today && s.weekEnd >= today);
      return <button key={name} className={engineer === name ? 'selected' : ''} onClick={() => setEngineer(engineer === name ? '' : name)}><strong>{name}</strong><span>{exact.length ? '● Programado hoy' : weekly.length ? '◐ Por confirmar día' : '○ Sin servicio hoy'}</span><small>{exact[0]?.locality || weekly[0]?.locality || 'Sin actividad registrada para hoy'}</small><small>{assigned.filter(s => s.month === month).length} actividades en el mes</small></button>;
    })}</div>
    {month === '2026-10' && <aside className="live-planning__notes"><strong>Notas de octubre</strong>{october.availabilityNotes.map((n, i) => <span key={i}>{n.dateLabel}: {n.person} · {n.type}</span>)}<span>Villanueva, Zac: pendiente de reasignación tras la salida de Erick.</span></aside>}
    <div className="live-planning__tools"><div><h3>Planeación editable</h3><small>{rows.length} filas · Tab para navegar, Enter para guardar, Esc para deshacer la fila.</small></div><input aria-label="Buscar en el tablero" placeholder="Buscar localidad, serie o ingeniero" value={search} onChange={e => setSearch(e.target.value)} />{engineer && <button onClick={() => setEngineer('')}>Ver todo el equipo</button>}{canEdit && <button onClick={() => { setDraft(blank()); setAdding(true); }}>+ Agregar fila</button>}</div>
    <div className="live-planning__scroll"><table><thead><tr><th>Semana / estado</th>{labels.map(l => <th key={l}>{l}</th>)}<th>Guardar</th></tr></thead><tbody>{rows.map(service => <EditableRow key={service.id} service={service} canEdit={canEdit} onUpdate={onUpdate} />)}{!rows.length && <tr><td colSpan={10}>Sin actividades para este mes o filtro. Puedes agregar una fila.</td></tr>}</tbody></table></div>
    {adding && <form className="live-planning__new" onSubmit={e => { e.preventDefault(); void create(); }}><h3>Nueva fila</h3>{fields.map((key, i) => <label key={key}>{labels[i]}{key === 'serviceType' ? <select value={draft.serviceType} onChange={e => setDraft(d => ({ ...d, serviceType: e.target.value as QuickCreateDraft['serviceType'] }))}>{types.map(t => <option key={t}>{t}</option>)}</select> : <input disabled={busy} required={key === 'locality' || key === 'scheduledDate'} type={key === 'scheduledDate' ? 'date' : 'text'} value={draft[key]} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} />}</label>)}<button disabled={busy} type="submit">{busy ? 'Guardando…' : 'Guardar fila'}</button><button disabled={busy} type="button" onClick={() => setAdding(false)}>Cancelar</button>{error && <p role="alert">{error}</p>}</form>}
  </section>;
}
