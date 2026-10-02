import { useEffect, useId, useRef, useState } from 'react';
import { getValidatedUser, supabase } from '../supabaseClient';
import { PERMISSIONS_OWNER_USER_IDS } from '../accessControl';

interface UserOption { id: string; nombre_completo: string }
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

export function TrackingAssignment({ guide }: { guide: string }) {
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const listId = useId();
  const matches = users.filter(user => normalize(user.nombre_completo).includes(normalize(query.trim()))).slice(0, 30);

  useEffect(() => {
    let mounted = true;
    void getValidatedUser().then(user => {
      if (mounted) setAllowed(Boolean(user && PERMISSIONS_OWNER_USER_IDS.some(id => id === user.id)));
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => {
    if (active >= 0 && matches[active]) document.getElementById(`${listId}-${matches[active].id}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId, matches]);

  const show = async () => {
    setOpen(true);
    setQuery('');
    setActive(-1);
    setMessage('');
    setError('');
    setLoading(true);
    try {
      const { data, error: loadError } = await supabase.from('profiles').select('id, nombre_completo').order('nombre_completo');
      if (loadError) throw loadError;
      setUsers((data || []).filter((user): user is UserOption => Boolean(user.nombre_completo?.trim())));
    } catch { setError('No se pudieron cargar los usuarios. Cierra y vuelve a abrir el selector para intentar nuevamente.'); }
    finally { setLoading(false); }
  };

  const assign = async (user: UserOption) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setAssigning(true);
    setError('');
    try {
      const { error: assignError } = await supabase.rpc('assign_dhl_tracking', { target_user_id: user.id, guide });
      if (assignError) throw assignError;
      setMessage(`Envío ${guide} asignado a ${user.nombre_completo}.`);
      setOpen(false);
      trigger.current?.focus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo asignar el envío. Intenta nuevamente.');
    } finally { setAssigning(false); inFlight.current = false; }
  };

  if (!allowed) return null;
  return <div className="mission-assignment">
    <button ref={trigger} type="button" className="mission-assign-trigger" aria-expanded={open} aria-controls={`${listId}-panel`} onClick={() => void show()} disabled={assigning || open}>Asignar envío</button>
    {message && <p role="status" className="mission-assign-success">{message}</p>}
    {open && <div id={`${listId}-panel`} className="mission-assign-panel" aria-busy={assigning || loading}>
      <div className="mission-assign-heading"><label htmlFor={`${listId}-input`}>Asignar a</label><button type="button" aria-label="Cerrar selector de usuarios" disabled={assigning} onClick={() => { setOpen(false); trigger.current?.focus(); }}>Cerrar</button></div>
      <input ref={input} id={`${listId}-input`} type="text" role="combobox" autoComplete="off" placeholder="Escribe el nombre del usuario…" aria-autocomplete="list" aria-expanded="true" aria-controls={listId} aria-activedescendant={active >= 0 && matches[active] ? `${listId}-${matches[active].id}` : undefined} value={query} disabled={assigning} onChange={event => { setQuery(event.target.value); setActive(-1); }} onKeyDown={event => {
        if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
        if (event.key === 'ArrowDown') { event.preventDefault(); setActive(current => Math.min(current + 1, matches.length - 1)); }
        if (event.key === 'ArrowUp') { event.preventDefault(); setActive(current => Math.max(current - 1, 0)); }
        if (event.key === 'Enter' && active >= 0 && matches[active] && !loading) { event.preventDefault(); void assign(matches[active]); }
      }} />
      {loading ? <p role="status">Cargando usuarios…</p> : <ul id={listId} role="listbox" aria-label="Usuarios disponibles">
        {matches.map((user, index) => <li key={user.id} role="option" id={`${listId}-${user.id}`} aria-selected={active === index} onMouseEnter={() => setActive(index)}><button type="button" tabIndex={-1} disabled={assigning} onClick={() => void assign(user)}>{user.nombre_completo}</button></li>)}
      </ul>}
      {!loading && !error && !matches.length && <p>No hay usuarios con ese nombre.</p>}
      {assigning && <p role="status">Asignando envío…</p>}
      {error && <p role="alert" className="mission-warning">{error}</p>}
    </div>}
  </div>;
}
