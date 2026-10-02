import { useEffect, useRef, useState, type CSSProperties } from 'react';
import BrandLockup from '../../../components/BrandLockup';
import type { PlannedService, GuardRosterMember } from '../types/servicePlanning.types';

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
function AgendaSlide({ agenda, index, today }: { agenda: ReturnType<typeof engineerAgenda>; index: number; today: string }) {
  const ordered = [...new Map([...agenda.current, ...agenda.next, ...agenda.pending, ...agenda.assigned].map(service => [service.id, service])).values()];
  const service = ordered[index % Math.max(1, ordered.length)];
  if (!service) return <div className="engineer-wall__slide-empty"><strong>Sin servicios abiertos</strong><span>Sin próximas visitas ni pendientes registrados.</span></div>;
  const label = service.scheduledDate === today ? 'HOY' : agenda.current.includes(service) ? 'ESTA SEMANA · CONFIRMAR DÍA' : agenda.overdue.includes(service) ? 'PENDIENTE · CONFIRMAR CIERRE' : agenda.next[0]?.id === service.id ? 'PRÓXIMO SERVICIO' : agenda.next.includes(service) ? 'EN AGENDA' : 'PENDIENTE DE SEGUIMIENTO';
  return <div className="engineer-wall__agenda">
    <div key={service.id} className="engineer-wall__slide">
      <span className="engineer-wall__label">{label}</span>
      <strong className="engineer-wall__destination">{service.locality}</strong>
      <p className="engineer-wall__service-type">{service.serviceType.replaceAll('_', ' ')} · {service.platform || 'Sin plataforma'}</p>
      <div className="engineer-wall__date">{service.scheduledDate ? dateLabel(service.scheduledDate) : service.weekLabel || 'Fecha por confirmar'}</div>
      <dl><div><dt>Serie</dt><dd>{service.serialNumber || 'Sin serie registrada'}</dd></div><div><dt>Acompañantes</dt><dd>{service.companions.join(', ') || 'Sin acompañante'}</dd></div></dl>
      <div className="engineer-wall__observations"><span className="engineer-wall__label">OBSERVACIONES</span><p>{service.observations || service.rawObservations || 'Sin observaciones adicionales.'}</p></div>
    </div>
    <div className="engineer-wall__slide-footer"><span>Agenda {(index % ordered.length) + 1} / {ordered.length}</span><span>{agenda.pending.length} pendientes</span></div>
    <div className="engineer-wall__progress" aria-hidden="true"><span key={index} /></div>
  </div>;
}
export default function EngineerWall({ services, roster, today, onEdit, members }: { members: GuardRosterMember[]; services: PlannedService[]; roster: string[]; today: string; onEdit: () => void }) {
  const root = useRef<HTMLElement>(null);
  const [screen, setScreen] = useState(false);
  const [page, setPage] = useState(0);
  const [auto, setAuto] = useState(true);
  const [clock, setClock] = useState(new Date());
  const [area, setArea] = useState('all');
  const areaOf = (name: string) => members.find(member => member.fullName === name)?.area === 'aplicativo' ? 'Química / Aplicaciones' : 'Ingeniería';
  const visibleRoster = roster.filter(name => area === 'all' || areaOf(name) === area);
  const [slideIndexes, setSlideIndexes] = useState<Record<string, number>>({});
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
  useEffect(() => { if (!auto || pages < 2) return; const timer = window.setInterval(() => setPage(p => (p + 1) % pages), 15000); return () => clearInterval(timer); }, [auto, pages]);
  const visibleNames = visibleRoster.slice(activePage * pageSize, (activePage + 1) * pageSize).join('|');
  useEffect(() => {
    if (!auto) return;
    const timer = window.setInterval(() => setSlideIndexes(current => {
      const next = { ...current };
      for (const name of visibleNames.split('|').filter(Boolean)) next[name] = (next[name] || 0) + 1;
      return next;
    }), 7000);
    return () => clearInterval(timer);
  }, [auto, visibleNames]);
  useEffect(() => {
    const change = () => { if (!document.fullscreenElement) setScreen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setScreen(false); } };
    document.addEventListener('fullscreenchange', change); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('fullscreenchange', change); document.removeEventListener('keydown', escape); };
  }, []);
  const fullscreen = async () => {
    if (screen) { if (document.fullscreenElement) await document.exitFullscreen(); setScreen(false); }
    else { setScreen(true); try { await root.current?.requestFullscreen(); } catch { /* Fixed viewport mode remains available. */ } }
  };
  const all = visibleRoster.map(name => ({ name, ...engineerAgenda(services, name, today) }));
  const unassigned = services.filter(s => !s.responsibleEngineers.length && !s.flags.isCompleted && !s.status.includes('realizado'));
  return <section ref={root} className={`engineer-wall ${screen ? 'engineer-wall--screen' : ''}`} aria-label="Monitor de ingenieros y químicos">
    <header className="engineer-wall__header"><div><BrandLockup variant="header" logo="imagotipo" /><h2>Ingenieros y químicos</h2><p>Agenda registrada · Hoy, {dateLabel(today)} · Se consulta cada 30 segundos</p></div><div className="engineer-wall__controls"><time>{clock.toLocaleTimeString('es-MX',{ timeZone:'America/Mexico_City',hour:'2-digit',minute:'2-digit',second:'2-digit' })}</time><button onClick={onEdit}>Editar planeación</button><button onClick={() => void fullscreen()}>{screen ? 'Salir de pantalla completa' : 'Pantalla completa'}</button></div></header>
    <div className="engineer-wall__metrics"><select aria-label="Área del equipo" value={area} onChange={e => { setArea(e.target.value); setPage(0); }}><option value="all">Todo el equipo</option><option>Ingeniería</option><option>Química / Aplicaciones</option></select><span><b>{visibleRoster.length}</b> integrantes</span><span><b>{all.filter(a => a.current.length).length}</b> con agenda hoy</span><span><b>{all.reduce((n,a) => n + (a.pending.length ? 1 : 0),0)}</b> con pendientes</span><span className={unassigned.length ? 'warning' : ''}><b>{unassigned.length}</b> servicios sin asignar</span></div>
    <div ref={grid} className="engineer-wall__grid" style={{ '--wall-columns': layout.columns, '--wall-rows': layout.rows } as CSSProperties}>{all.slice(activePage * pageSize, (activePage + 1) * pageSize).map(a => {
      const tone = a.pending.length ? 'warning' : a.current.length ? 'active' : 'idle';
      const status = a.pending.length ? 'Requiere atención' : a.current.some(s => s.scheduledDate === today) ? 'Programado hoy' : a.current.length ? 'Esta semana · confirmar día' : a.next.length ? 'Próximo servicio programado' : 'Sin servicios abiertos';
      return <article key={a.name} className={`engineer-wall__card engineer-wall__card--${tone}`}><div className="engineer-wall__person"><span className="engineer-wall__avatar">{a.name.split(' ').slice(0,2).map(n=>n[0]).join('')}</span><div><small className="engineer-wall__area">{areaOf(a.name)}</small><h3>{a.name}</h3><span className="engineer-wall__status">● {status}</span></div></div><AgendaSlide agenda={a} index={slideIndexes[a.name] || 0} today={today} /></article>;
    })}</div>
    {!visibleRoster.length && <p>No hay integrantes en esta área.</p>}
    <footer className="engineer-wall__footer"><span>Agenda automática cada 7 s · Equipo cada 15 s · Estado según planeación.</span><div><button disabled={pages === 1} onClick={() => setPage((activePage - 1 + pages) % pages)}>Anterior</button><span>Panel {activePage + 1} / {pages}</span><button disabled={pages === 1} onClick={() => setPage((activePage + 1) % pages)}>Siguiente</button><button onClick={() => setAuto(a => !a)}>{auto ? 'Pausar rotación' : 'Rotar cada 15 s'}</button><details><summary aria-label="Recuerdo de Erick">🚀</summary><span>Erick ha salido de órbita. ¡Éxito en tu próxima misión!</span></details></div></footer>

  </section>;
}
