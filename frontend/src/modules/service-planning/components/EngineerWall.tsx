import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ProfileSummary } from '../../../components/servicesPlanning';
import type { PlannedService } from '../types/servicePlanning.types';

const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
const serviceDate = (s: PlannedService) => s.scheduledDate || s.weekStart || '9999';
export function engineerAgenda(services: PlannedService[], name: string, today: string) {
  const assigned = services.filter(s => s.responsibleEngineers.includes(name) && !s.flags.isCompleted && !s.status.includes('realizado')).sort((a,b) => serviceDate(a).localeCompare(serviceDate(b)) || a.locality.localeCompare(b.locality));
  const current = assigned.filter(s => s.scheduledDate === today || (!s.scheduledDate && s.weekStart <= today && s.weekEnd >= today));
  const overdue = assigned.filter(s => (s.scheduledDate || s.weekEnd) < today);
  const next = assigned.filter(s => serviceDate(s) > today);
  const attention = assigned.filter(s => s.flags.isBlocked || s.flags.requiresPayment || s.flags.isCritical || s.status.some(t => ['pendiente','bloqueado','critico','requiere_pago'].includes(t)));
  const pending = assigned.filter(s => overdue.includes(s) || attention.includes(s) || (!s.scheduledDate && !s.weekStart));
  return { assigned, current, overdue, next, pending };
}
function Activity({ service, label }: { service?: PlannedService; label: string }) {
  return <div className="engineer-wall__activity"><span className="engineer-wall__label">{label}</span>{service ? <><strong>{service.locality}</strong><p>{service.serviceType.replaceAll('_', ' ')} · {service.platform || 'Sin plataforma'}</p><small>{service.scheduledDate ? dateLabel(service.scheduledDate) : `${service.weekLabel} · Día por confirmar`}</small>{service.companions.length > 0 && <small>Con {service.companions.join(', ')}</small>}</> : <strong className="engineer-wall__empty">Sin actividad programada</strong>}</div>;
}
export default function EngineerWall({ services, roster, today, onEdit, profiles }: { profiles: ProfileSummary[]; services: PlannedService[]; roster: string[]; today: string; onEdit: () => void }) {
  const root = useRef<HTMLElement>(null);
  const [screen, setScreen] = useState(false);
  const [page, setPage] = useState(0);
  const [auto, setAuto] = useState(true);
  const [clock, setClock] = useState(new Date());
  const [area, setArea] = useState('all');
  const areaOf = (name: string) => { const p = profiles.find(p => p.nombre_completo === name); const role = `${p?.rol || ''} ${p?.employee_type || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); return /quimic|chemist|aplicativ/i.test(role) ? 'Química / Aplicaciones' : /ingenier|engineer/i.test(role) ? 'Ingeniería' : 'Equipo técnico'; };
  const visibleRoster = roster.filter(name => area === 'all' || areaOf(name) === area);
  const [selected, setSelected] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ columns: 4, rows: 2 });
  useEffect(() => {
    const element = grid.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      const columns = Math.max(1, Math.min(4, Math.floor((width + 12) / 272)));
      const rows = Math.max(1, Math.min(2, Math.floor((height + 12) / 342)));
      setLayout(current => current.columns === columns && current.rows === rows ? current : { columns, rows });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  const pageSize = layout.columns * layout.rows;
  const pages = Math.max(1, Math.ceil(visibleRoster.length / pageSize));
  const activePage = Math.min(page, pages - 1);
  useEffect(() => { const timer = window.setInterval(() => setClock(new Date()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!auto || selected || pages < 2) return; const timer = window.setInterval(() => setPage(p => (p + 1) % pages), 15000); return () => clearInterval(timer); }, [auto, pages, selected]);
  useEffect(() => {
    const change = () => { if (!document.fullscreenElement) setScreen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setScreen(false); setSelected(null); } };
    document.addEventListener('fullscreenchange', change); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('fullscreenchange', change); document.removeEventListener('keydown', escape); };
  }, []);
  const fullscreen = async () => {
    if (screen) { if (document.fullscreenElement) await document.exitFullscreen(); setScreen(false); }
    else { setScreen(true); try { await root.current?.requestFullscreen(); } catch { /* Fixed viewport mode remains available. */ } }
  };
  const all = visibleRoster.map(name => ({ name, ...engineerAgenda(services, name, today) }));
  const unassigned = services.filter(s => !s.responsibleEngineers.length && !s.flags.isCompleted && !s.status.includes('realizado'));
  const detail = selected ? all.find(a => a.name === selected) : null;
  return <section ref={root} className={`engineer-wall ${screen ? 'engineer-wall--screen' : ''}`} aria-label="Monitor de ingenieros y químicos">
    <header className="engineer-wall__header"><div><span className="engineer-wall__eyebrow">ORION / OPERACIONES</span><h2>Ingenieros y químicos</h2><p>Agenda registrada · Hoy, {dateLabel(today)} · Se consulta cada 30 segundos</p></div><div className="engineer-wall__controls"><time>{clock.toLocaleTimeString('es-MX',{ timeZone:'America/Mexico_City',hour:'2-digit',minute:'2-digit',second:'2-digit' })}</time><button onClick={onEdit}>Editar planeación</button><button onClick={() => void fullscreen()}>{screen ? 'Salir de pantalla completa' : 'Pantalla completa'}</button></div></header>
    <div className="engineer-wall__metrics"><select aria-label="Área del equipo" value={area} onChange={e => { setArea(e.target.value); setPage(0); }}><option value="all">Todo el equipo</option><option>Ingeniería</option><option>Química / Aplicaciones</option><option>Equipo técnico</option></select><span><b>{visibleRoster.length}</b> integrantes</span><span><b>{all.filter(a => a.current.length).length}</b> con agenda hoy</span><span><b>{all.reduce((n,a) => n + (a.pending.length ? 1 : 0),0)}</b> con pendientes</span><span className={unassigned.length ? 'warning' : ''}><b>{unassigned.length}</b> servicios sin asignar</span></div>
    <div ref={grid} className="engineer-wall__grid" style={{ '--wall-columns': layout.columns, '--wall-rows': layout.rows } as CSSProperties}>{all.slice(activePage * pageSize, (activePage + 1) * pageSize).map(a => {
      const tone = a.pending.length ? 'warning' : a.current.length ? 'active' : 'idle';
      const status = a.pending.length ? 'Requiere atención' : a.current.some(s => s.scheduledDate === today) ? 'Programado hoy' : a.current.length ? 'Esta semana · confirmar día' : 'Sin agenda hoy';
      return <article key={a.name} className={`engineer-wall__card engineer-wall__card--${tone}`}><div className="engineer-wall__person"><span className="engineer-wall__avatar">{a.name.split(' ').slice(0,2).map(n=>n[0]).join('')}</span><div><small className="engineer-wall__area">{areaOf(a.name)}</small><h3>{a.name}</h3><span className="engineer-wall__status">● {status}</span></div></div><Activity label={`HOY${a.current.length > 1 ? ` · ${a.current.length} actividades` : ''}`} service={a.current[0]} /><Activity label={`LO QUE SIGUE${a.next.length > 1 ? ` · ${a.next.length} programados` : ''}`} service={a.next[0]} /><div className="engineer-wall__pending"><span className="engineer-wall__label">PENDIENTES · {a.pending.length}</span>{a.pending.length ? <><strong>{a.pending[0].locality}</strong><small>{a.overdue.includes(a.pending[0]) ? 'Fecha pasada · confirmar cierre' : a.pending[0].flags.requiresPayment ? 'Requiere pago' : a.pending[0].flags.isBlocked ? 'Servicio bloqueado' : 'Requiere seguimiento'}{a.pending.length > 1 ? ` · +${a.pending.length - 1} más` : ''}</small></> : <small>Sin pendientes de seguimiento</small>}</div><button className="engineer-wall__detail-button" onClick={() => setSelected(a.name)}>Ver agenda · {a.assigned.length} servicios</button></article>;
    })}</div>
    {!visibleRoster.length && <p>No hay integrantes en esta área.</p>}
    <footer className="engineer-wall__footer"><span>El estado se calcula con la planeación; no indica presencia ni ubicación en tiempo real.</span><div><button disabled={pages === 1} onClick={() => setPage((activePage - 1 + pages) % pages)}>Anterior</button><span>Panel {activePage + 1} / {pages}</span><button disabled={pages === 1} onClick={() => setPage((activePage + 1) % pages)}>Siguiente</button><button onClick={() => setAuto(a => !a)}>{auto ? 'Pausar rotación' : 'Rotar cada 15 s'}</button><details><summary aria-label="Recuerdo de Erick">🚀</summary><span>Erick ha salido de órbita. ¡Éxito en tu próxima misión!</span></details></div></footer>
    {detail && <div className="engineer-wall__overlay"><section role="dialog" aria-modal="true" aria-label={`Agenda de ${detail.name}`}><header><div><h2>{detail.name}</h2><p>{detail.assigned.length} servicios abiertos</p></div><button autoFocus onClick={() => setSelected(null)}>Cerrar agenda</button></header>{detail.assigned.map(s => <div key={s.id} className="engineer-wall__detail-row"><Activity service={s} label={detail.current.includes(s) ? 'HOY / ESTA SEMANA' : detail.overdue.includes(s) ? 'CONFIRMAR CIERRE' : 'PRÓXIMA ACTIVIDAD'} /><p>{s.observations || 'Sin observaciones'}{s.serialNumber ? ` · NS ${s.serialNumber}` : ''}</p></div>)}{!detail.assigned.length && <p>Sin servicios abiertos asignados.</p>}</section></div>}
  </section>;
}
