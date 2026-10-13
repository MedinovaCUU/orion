import { useEffect, useRef, useState } from 'react';
import {
  fetchSupremoExemptions, fetchSupremoMetric, formatSupremoId, justifySupremoExemption, revokeSupremoExemption, saveSupremoSettings, SUPREMO_VISITS_LIMIT,
  type SupremoExemption, type SupremoMetric, type SupremoOutcome,
} from './supremoMetricApi';
import { formatCount, formatDate, formatDateTime, teamLabels, type KpiView } from './serviceKpiModel';

const outcomeLabels: Record<SupremoOutcome, string> = { positiva: 'Positiva', negativa: 'Negativa', pendiente: 'Pendiente', anulada: 'Anulada', sin_serie: 'Sin serie' };
const outcomeBadge: Record<SupremoOutcome, string> = { positiva: 'dentro', negativa: 'vencido', pendiente: 'por_vencer', anulada: 'justificado', sin_serie: 'sin_dato' };
const pct = (ratio?: { num: number; den: number; pct: number | null }) => ratio?.pct === null || ratio?.pct === undefined ? 'No aplica' : `${ratio.pct} %`;

// "Supremo en visitas presenciales". Loads apart from the main summary so the control center does not
// wait for it; when the metric is switched off only its configuration is shown.
export default function ServiceSupremoMetric({ view, filters, revision, onOpenTicket }: {
  view: KpiView; filters: Record<string, string | number>; revision: number; onOpenTicket: (ticket: { id: string; folio: string }) => void;
}) {
  const [data, setData] = useState<SupremoMetric | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [outcome, setOutcome] = useState<SupremoOutcome | ''>('');
  const [justify, setJustify] = useState<{ serial: string; text: string; fixed: boolean } | null>(null);
  const [exemptions, setExemptions] = useState<SupremoExemption[] | null>(null);
  const [revoking, setRevoking] = useState<{ id: string; text: string } | null>(null);
  const [config, setConfig] = useState<{ active: boolean; effective_from: string; grace_days: number; reason: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const justifyRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    fetchSupremoMetric(filters)
      .then(result => { if (active) setData(result); })
      .catch(cause => { if (active) setError((cause as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, revision, reload]);
  useEffect(() => {
    if (data?.settings) setConfig({ active: data.settings.active, effective_from: data.settings.effective_from, grace_days: data.settings.grace_days, reason: '' });
  }, [data?.settings]);

  const loadExemptions = () => fetchSupremoExemptions().then(setExemptions).catch(cause => setActionError((cause as Error).message));
  const run = async (task: () => Promise<unknown>, done: string) => {
    setBusy(true); setActionError(''); setNotice('');
    try { await task(); setNotice(done); setReload(value => value + 1); if (exemptions) await loadExemptions(); return true; }
    catch (cause) { setActionError((cause as Error).message); return false; }
    finally { setBusy(false); }
  };

  const settings = data?.settings;
  const totals = data?.totals;
  const visits = (data?.visits || []).filter(visit => !outcome || visit.outcome === outcome);
  const people = data?.people || [];
  const turningOff = Boolean(settings?.active && config && !config.active);
  const startJustify = (serial: string, fixed: boolean) => {
    setJustify({ serial, text: '', fixed });
    window.setTimeout(() => justifyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  const justifyForm = justify && <form ref={justifyRef} className="kpi-config-form kpi-supremo-justify" onSubmit={event => {
    event.preventDefault();
    void run(() => justifySupremoExemption(justify.serial, justify.text), `Justificación registrada: la métrica queda anulada para el equipo ${justify.serial}.`).then(saved => { if (saved) setJustify(null); });
  }}>
    <label>Número de serie<input required readOnly={justify.fixed} value={justify.serial} onChange={event => setJustify({ ...justify, serial: event.target.value })} /></label>
    <label className="kpi-config-wide">Justificación por escrito<textarea required minLength={20} maxLength={1000} rows={3} value={justify.text}
      placeholder="Por qué este equipo no lleva Supremo (por ejemplo, política del cliente, sin computadora o sin red)." onChange={event => setJustify({ ...justify, text: event.target.value })} /></label>
    <p className="kpi-config-wide">Mientras esté vigente, todas las visitas de este equipo quedan anuladas: no cuentan como positivas ni como negativas.</p>
    <div className="kpi-config-actions kpi-config-wide">
      <button type="submit" disabled={busy || justify.text.trim().length < 20}>{busy ? 'Guardando…' : 'Anular métrica para este equipo'}</button>
      <button type="button" disabled={busy} onClick={() => setJustify(null)}>Cancelar</button>
    </div>
  </form>;

  const configPanel = settings && config && <details className="kpi-config kpi-supremo-config" open={!settings.active || undefined}>
    <summary>Configuración de la métrica de Supremo <span>{settings.active ? 'Activa' : 'Desactivada'} · solo administradores</span></summary>
    <p>Positiva: el equipo ya tenía Supremo habilitado con un ID de 9 dígitos al llegar, o quedó registrado antes de cerrar el plazo. Negativa: al cerrar el plazo no lo tenía. Cada visita conserva su resultado aunque Supremo cambie después.</p>
    <form className="kpi-config-form" onSubmit={event => {
      event.preventDefault();
      void run(() => saveSupremoSettings(config), config.active ? 'Configuración guardada.' : 'Métrica desactivada. Los registros de Supremo se siguen guardando.');
    }}>
      <label className="kpi-check"><input type="checkbox" checked={config.active} onChange={event => setConfig({ ...config, active: event.target.checked })} />Métrica activa</label>
      <label>Cuenta visitas desde<input type="date" required value={config.effective_from} min={settings.history_since.slice(0, 10)} onChange={event => setConfig({ ...config, effective_from: event.target.value })} /></label>
      <label>Plazo para registrar Supremo (días)<input type="number" required min={0} max={30} value={config.grace_days} onChange={event => setConfig({ ...config, grace_days: Number(event.target.value) })} /></label>
      <label>Historial de Supremo desde<input readOnly value={formatDateTime(settings.history_since)} /></label>
      <label className="kpi-config-wide">{turningOff ? 'Motivo de la desactivación (obligatorio)' : 'Motivo o nota del cambio'}<input required={turningOff} minLength={turningOff ? 10 : undefined} maxLength={500}
        value={config.reason} onChange={event => setConfig({ ...config, reason: event.target.value })} /></label>
      {settings.updated_by_name && <p className="kpi-config-wide">Último cambio: {formatDateTime(settings.updated_at)} por {settings.updated_by_name}{settings.reason ? ` · ${settings.reason}` : ''}</p>}
      <div className="kpi-config-actions kpi-config-wide"><button type="submit" className={turningOff ? 'kpi-danger' : undefined} disabled={busy}>{turningOff ? 'Desactivar métrica' : 'Guardar configuración'}</button></div>
    </form>
  </details>;

  return <section className="kpi-section kpi-supremo" aria-labelledby={`kpi-${view}-supremo`} aria-busy={loading}>
    <header><h3 id={`kpi-${view}-supremo`}>Supremo en visitas presenciales</h3>
      {settings?.active && <span>Visitas desde el {formatDate(settings.effective_from)} · plazo de {settings.grace_days} {settings.grace_days === 1 ? 'día' : 'días'} para registrarlo · mismos filtros del tablero</span>}
      {loading && data && <span className="kpi-refreshing">Actualizando…</span>}</header>
    {error && <div role="alert" className="tc-error">{error} <button type="button" className="tc-text-button" onClick={() => setReload(value => value + 1)}>Reintentar</button></div>}
    {!data && !error && <div className="tc-empty">Calculando la métrica de Supremo…</div>}
    {settings && !settings.active && <div className="kpi-banner"><strong>Métrica desactivada.</strong> {settings.updated_by_name ? `${settings.updated_by_name} la desactivó el ${formatDateTime(settings.updated_at)}` : 'Está desactivada'}{settings.reason ? `: ${settings.reason}` : ''}. No se muestra en ninguna vista ni en los reportes de servicio; el registro de Supremo de los equipos se sigue guardando.</div>}
    {settings?.active && totals && <>
      <div className="kpi-cards">
        {([
          ['', 'Cumplimiento', pct(data?.compliance), `${formatCount(data?.compliance?.num)} positivas de ${formatCount(data?.compliance?.den)} visitas evaluadas`, data?.compliance?.den ? undefined : 'na'],
          ['positiva', 'Positivas', formatCount(totals.positive), `${formatCount(totals.already)} ya tenían Supremo · ${formatCount(totals.installed)} registradas en el plazo`, 'good'],
          ['negativa', 'Negativas', formatCount(totals.negative), 'Sin Supremo válido al cerrar el plazo', 'danger'],
          ['pendiente', 'Pendientes', formatCount(totals.pending), 'Plazo abierto: aún no cuentan', 'warn'],
          ['anulada', 'Anuladas', formatCount(totals.voided), 'Equipos justificados por administración', undefined],
          ...(totals.no_serial ? [['sin_serie', 'Sin número de serie', formatCount(totals.no_serial), 'No se pueden comparar con Supremo', undefined]] : []),
        ] as Array<[SupremoOutcome | '', string, string, string, string | undefined]>).map(([key, label, value, detail, tone]) =>
          <article key={label} className={`kpi-card${tone && tone !== 'na' ? ` kpi-card--${tone}` : ''}`}>
            <button type="button" className="kpi-card-body" aria-pressed={outcome === key} onClick={() => setOutcome(current => current === key ? '' : key)}>
              <small>{label}</small><strong className={`kpi-value ${tone === 'na' ? 'is-na' : 'is-ok'}`}>{value}</strong><span>{detail}</span>
              <i aria-hidden="true">{key ? (outcome === key ? 'Mostrando estas visitas' : 'Ver visitas →') : 'Ver todas las visitas →'}</i>
            </button>
          </article>)}
      </div>
      <div className="kpi-mini-grid kpi-supremo-grid">
        <div className="kpi-mini">
          <h4>Por colaborador</h4>
          <p className="kpi-note">Una visita cuenta para cada participante. Las pendientes y anuladas no entran al cumplimiento.</p>
          {people.length === 0 ? <p className="kpi-mini-empty">Sin visitas atribuidas a colaboradores con este filtro.</p> : <div className="tc-table-scroll"><table className="tc-table kpi-mini-table">
            <thead><tr><th>Colaborador</th>{view === 'general' && <th>Equipo</th>}<th>Positivas</th><th>Negativas</th><th>Pendientes</th><th>Anuladas</th><th>Cumplimiento</th></tr></thead>
            <tbody>{people.map(person => <tr key={person.id}>
              <td><strong>{person.name}</strong></td>{view === 'general' && <td>{teamLabels[person.team || ''] || 'Sin clasificar'}</td>}
              <td>{formatCount(person.positive)}</td><td>{person.negative ? <b className="kpi-supremo-neg">{formatCount(person.negative)}</b> : '0'}</td>
              <td>{formatCount(person.pending)}</td><td>{formatCount(person.voided)}</td>
              <td>{pct(person.compliance)}{person.compliance.den > 0 && <small>{person.compliance.num} de {person.compliance.den}</small>}</td>
            </tr>)}</tbody></table></div>}
        </div>
        <div className="kpi-mini">
          <h4>Equipos sin Supremo</h4>
          <p className="kpi-note">Si un equipo no debe llevar Supremo, justifícalo por escrito: sus visitas quedan anuladas.</p>
          {(() => {
            const pendingEquipment = Array.from(new Map((data?.visits || []).filter(visit => visit.serial && (visit.outcome === 'negativa' || visit.outcome === 'pendiente'))
              .map(visit => [visit.serial_key, visit])).values());
            return pendingEquipment.length === 0 ? <p className="kpi-mini-empty">Todos los equipos visitados tienen Supremo o están justificados.</p> : <div className="tc-table-scroll"><table className="tc-table kpi-mini-table">
              <thead><tr><th>Serie</th><th>Equipo</th><th>Situación</th><th><span className="tc-sr-only">Acciones</span></th></tr></thead>
              <tbody>{pendingEquipment.map(visit => <tr key={visit.serial_key}>
                <td><strong>{visit.serial}</strong></td><td>{visit.platform || 'Sin plataforma'}<small>{visit.client || 'Sin cliente identificado'}</small></td>
                <td>{visit.detail}</td>
                <td><button type="button" className="tc-open" disabled={busy} onClick={() => startJustify(visit.serial || '', true)}>Justificar</button></td>
              </tr>)}</tbody></table></div>;
          })()}
        </div>
      </div>
      {justify?.fixed && justifyForm}
      <div className="kpi-mini kpi-supremo-visits">
        <h4>Visitas evaluadas{outcome ? ` · ${outcomeLabels[outcome]}` : ''}<span className="kpi-supremo-count">{formatCount(visits.length)} de {formatCount(totals.visits)}</span></h4>
        <div className="kpi-supremo-filter" role="group" aria-label="Filtrar por resultado">
          {(['', 'negativa', 'pendiente', 'positiva', 'anulada', 'sin_serie'] as Array<SupremoOutcome | ''>).map(key =>
            <button key={key || 'todas'} type="button" aria-pressed={outcome === key} onClick={() => setOutcome(key)}>{key ? outcomeLabels[key] : 'Todas'}</button>)}
        </div>
        {totals.visits > SUPREMO_VISITS_LIMIT && <p className="kpi-note">Se muestran las primeras {SUPREMO_VISITS_LIMIT} visitas (negativas y pendientes primero); los totales incluyen todas. Acota el periodo para ver el resto.</p>}
        {visits.length === 0 ? <p className="kpi-mini-empty">Sin visitas presenciales con este filtro.</p> : <div className="tc-table-scroll"><table className="tc-table kpi-mini-table">
          <thead><tr><th>Visita</th><th>Equipo</th><th>Colaboradores</th><th>Registro</th><th>Resultado</th><th><span className="tc-sr-only">Acciones</span></th></tr></thead>
          <tbody>{visits.map(visit => <tr key={visit.visit_id}>
            <td>{formatDate(visit.visit_date)}{visit.outcome !== 'sin_serie' && visit.outcome !== 'anulada' && <small>Plazo hasta {formatDate(visit.deadline)}</small>}</td>
            <td><strong>{visit.serial || 'Sin serie'}</strong><small>{[visit.platform, visit.client].filter(Boolean).join(' · ') || (visit.in_catalog ? '' : 'Fuera del catálogo de equipos')}</small></td>
            <td>{visit.participant_names || 'Sin colaborador identificado'}{visit.unmatched_names && <small>Sin perfil: {visit.unmatched_names}</small>}</td>
            <td>{visit.sources}{visit.ticket_id && visit.folio && <small><button type="button" className="tc-text-button" onClick={() => onOpenTicket({ id: visit.ticket_id!, folio: visit.folio! })}>{visit.folio}</button></small>}</td>
            <td><span className={`tc-badge tc-badge--${outcomeBadge[visit.outcome]}`}>{outcomeLabels[visit.outcome]}</span>
              <small>{visit.detail}{visit.supremo_id ? ` · ID ${formatSupremoId(visit.supremo_id)}` : ''}</small>
              {visit.exemption_justification && <small title={visit.exemption_justification}>“{visit.exemption_justification}” — {visit.exemption_by || 'Administración'}, {formatDate(visit.exemption_at)}</small>}</td>
            <td>{visit.serial && (visit.outcome === 'negativa' || visit.outcome === 'pendiente') &&
              <button type="button" className="tc-open" disabled={busy} onClick={() => startJustify(visit.serial || '', true)}>Justificar</button>}</td>
          </tr>)}</tbody></table></div>}
      </div>
      <details className="kpi-config kpi-supremo-exemptions" onToggle={event => { if ((event.target as HTMLDetailsElement).open && !exemptions) void loadExemptions(); }}>
        <summary>Justificaciones de equipos sin Supremo <span>Anulan la métrica del equipo · historial completo</span></summary>
        <p>Una justificación vigente anula todas las visitas del equipo. Al revocarla, las visitas hasta ese día siguen anuladas y las siguientes vuelven a contar.</p>
        {!justify && <button type="button" disabled={busy} onClick={() => startJustify('', false)}>Justificar un equipo</button>}
        {justify && !justify.fixed && justifyForm}
        {!exemptions ? <p>Cargando justificaciones…</p> : exemptions.length === 0 ? <p>Aún no hay justificaciones.</p> : <div className="tc-table-scroll"><table className="tc-table">
          <thead><tr><th>Equipo</th><th>Justificación</th><th>Registró</th><th>Estado</th><th><span className="tc-sr-only">Acciones</span></th></tr></thead>
          <tbody>{exemptions.map(item => <tr key={item.id}>
            <td><strong>{item.serial}</strong><small>{[item.model, item.client].filter(Boolean).join(' · ')}</small></td>
            <td>{item.justification}</td>
            <td>{item.created_by_name || 'Administración'}<small>{formatDateTime(item.created_at)}</small></td>
            <td>{item.revoked_at ? <>Revocada<small>{formatDateTime(item.revoked_at)} · {item.revoked_by_name}: {item.revoke_reason}</small></> : 'Vigente'}</td>
            <td>{!item.revoked_at && (revoking?.id === item.id
              ? <form className="kpi-supremo-revoke" onSubmit={event => { event.preventDefault(); void run(() => revokeSupremoExemption(item.id, revoking.text), `Justificación del equipo ${item.serial} revocada.`).then(saved => { if (saved) setRevoking(null); }); }}>
                <input required minLength={5} maxLength={500} placeholder="Motivo de la revocación" value={revoking.text} onChange={event => setRevoking({ id: item.id, text: event.target.value })} aria-label="Motivo de la revocación" />
                <button type="submit" disabled={busy} className="kpi-danger">Revocar</button><button type="button" disabled={busy} onClick={() => setRevoking(null)}>Cancelar</button>
              </form>
              : <button type="button" className="tc-open" disabled={busy} onClick={() => setRevoking({ id: item.id, text: '' })}>Revocar</button>)}</td>
          </tr>)}</tbody></table></div>}
      </details>
    </>}
    {configPanel}
    {actionError && <p role="alert" className="tc-error">{actionError}</p>}
    {notice && <p role="status" className="kpi-notice">{notice}</p>}
  </section>;
}

