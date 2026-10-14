import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import PrivateName from './PrivateName';
import { fetchAudit, insertRow, updateRow, type AuditEntry } from './reliabilityApi';
import { formatDay, isoOfDay, kindLabels, relationLabels, toDay, type CapturedDecision, type Episode, type LabModel } from './reliabilityAnalytics';
import { moneyText } from './reliabilityFormat';

// Structured record of a reconditioning: what was found, recommended, authorized and done; how it was released;
// how later failures relate to those decisions; what it cost. The database stamps authors and keeps the audit trail.
const SCOPES: Array<[string, string]> = [['no_definido', 'No definido'], ['minimo', 'Mínimo (solo imprescindible)'], ['protocolo', 'Protocolo del fabricante'], ['integral', 'Integral (más allá del protocolo)']];
const RELEASES: Array<[string, string]> = [['pendiente', 'Pendiente'], ['liberado', 'Liberado'], ['liberado_con_salvedades', 'Liberado con salvedades'], ['no_liberado', 'No liberado']];
const CONDITIONS: Array<[string, string]> = [['no_inspeccionado', 'No inspeccionado'], ['sin_anomalia', 'Sin anomalía'], ['desgaste', 'Desgaste'], ['fuera_de_especificacion', 'Fuera de especificación'], ['falla', 'Falla']];
const RECOMMENDATIONS: Array<[string, string]> = [['sin_recomendacion', 'Sin recomendación'], ['sustituir', 'Sustituir'], ['reparar', 'Reparar'], ['conservar', 'Conservar']];
const CRITICALITY: Array<[string, string]> = [['no_definida', 'No definida'], ['critica', 'Crítica'], ['mayor', 'Mayor'], ['menor', 'Menor']];
const AUTHORIZATION: Array<[string, string]> = [['pendiente', 'Pendiente'], ['aprobada', 'Aprobada'], ['rechazada', 'Rechazada'], ['pospuesta', 'Pospuesta'], ['no_aplica', 'No aplica']];
const REASONS: Array<[string, string]> = [['', '—'], ['presupuesto', 'Presupuesto'], ['sin_existencia', 'Sin existencia'], ['no_necesario_tecnicamente', 'No necesario técnicamente'], ['decision_comercial', 'Decisión comercial'], ['otro', 'Otro']];
const ACTIONS: Array<[string, string]> = [['pendiente', 'Pendiente'], ['sustituido', 'Sustituido'], ['reparado', 'Reparado'], ['conservado', 'Conservado']];
const RISK: Array<[string, string]> = [['no_evaluado', 'No evaluado'], ['alto', 'Alto'], ['medio', 'Medio'], ['bajo', 'Bajo']];
const RESULTS: Array<[string, string]> = [['pendiente_definicion', 'Pendiente de definición'], ['aprobado', 'Aprobado'], ['no_aprobado', 'No aprobado'], ['no_realizado', 'No realizado']];
const PHASES: Array<[string, string]> = [['reacondicionamiento', 'Reacondicionamiento'], ['instalacion', 'Instalación'], ['correctivo', 'Correctivo'], ['preventivo', 'Preventivo'], ['logistica', 'Logística'], ['otro', 'Otro']];
const CATEGORIES: Array<[string, string]> = [['refacciones', 'Refacciones'], ['mano_obra', 'Mano de obra'], ['traslado', 'Traslado'], ['viaticos', 'Viáticos'], ['paqueteria', 'Paquetería'], ['equipo_sustituto', 'Equipo sustituto'], ['indisponibilidad', 'Indisponibilidad'], ['penalizacion', 'Penalización'], ['compensacion', 'Compensación'], ['otro', 'Otro']];
// Release matrix: criteria only; tolerances must come from current technical documentation (never invented here).
const ACCEPTANCE_CRITERIA = ['Funcionamiento mecánico', 'Sistema fotométrico', 'Sistema fluídico', 'Control térmico', 'Sistema de pipeteo', 'Lavado', 'Repetibilidad', 'Precisión',
  'Exactitud (con material y procedimiento adecuados)', 'Calibración', 'Control de calidad', 'Alarmas', 'Estado de componentes críticos'];

const Select = ({ label, value, options, onChange, disabled }: { label: string; value: string; options: Array<[string, string]>; onChange: (v: string) => void; disabled?: boolean }) =>
  <label>{label}<select value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>{options.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>;
const Field = ({ label, children }: { label: string; children: ReactNode }) => <label>{label}{children}</label>;
const money = (value: string) => (value.trim() === '' ? null : Math.max(0, Number(value)));

export default function ReliabilityCapture({ model, episodeId, onEpisode, onSaved }: { model: LabModel; episodeId: string | null; onEpisode: (id: string | null) => void; onSaved: () => Promise<void> }) {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const episodes = useMemo(() => [...model.episodes].sort((a, b) => b.start - a.start), [model]);
  const shown = episodes.filter(e => !search.trim() || `${e.serial} ${e.serialKey} ${e.platform} ${e.destination || ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  const episode = episodes.find(e => e.id === episodeId) || null;
  return <div className="rel-capture">
    <aside className="rel-capture-list">
      <label className="rel-search">Buscar equipo<input type="search" value={search} placeholder="Serie, modelo o destino…" onChange={e => setSearch(e.target.value)} /></label>
      <button type="button" className="rel-primary" onClick={() => { setCreating(true); onEpisode(null); }}>Nuevo episodio</button>
      <ul>{shown.slice(0, 120).map(e => <li key={e.id}><button type="button" aria-pressed={e.id === episodeId} onClick={() => { setCreating(false); onEpisode(e.id); }}>
        <strong>{e.platform || 'Sin modelo'} · {e.serial}</strong><small>{formatDay(e.start)} · {e.partsQty} piezas{e.delivery !== null ? ' · entregado' : ''}</small>
        {e.captured ? <span className="rel-chip rel-chip--ok">Con registro</span> : <span className="rel-chip">Sin registro</span>}
      </button></li>)}</ul>
    </aside>
    <div className="rel-capture-body">
      {creating ? <NewEpisode onCreated={async id => { await onSaved(); setCreating(false); onEpisode(`cap:${id}`); }} />
        : episode ? <EpisodeWorkspace key={episode.id} episode={episode} model={model} onSaved={onSaved} onEpisode={onEpisode} />
          : <div className="rel-empty"><strong>Elige un episodio</strong><p>Cada reacondicionamiento del historial aparece aquí. Al registrarlo quedan documentadas la condición de cada componente, la recomendación del ingeniero, la decisión de autorización con su motivo, la acción ejecutada, las pruebas de liberación y los costos. Cada cambio queda en una bitácora que no se puede borrar.</p></div>}
    </div>
  </div>;
}

function NewEpisode({ onCreated }: { onCreated: (id: string) => Promise<void> }) {
  const [serial, setSerial] = useState(''); const [platform, setPlatform] = useState('BA400'); const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!serial.trim()) { setError('Escribe la serie del equipo.'); return; }
    setBusy(true); setError('');
    try { const id = await insertRow('refurbishment_episodes', { serial_key: serial.trim(), serial_raw: serial.trim(), platform, started_on: start }); await onCreated(id); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  return <form className="rel-form" onSubmit={submit}><h3>Nuevo episodio de reacondicionamiento</h3>
    <p className="rel-note">Para un reacondicionamiento en curso que aún no tiene reporte en el historial. Cuando el reporte se importe, ambos se unen por serie y fecha.</p>
    <div className="rel-form-grid"><Field label="Serie"><input value={serial} onChange={e => setSerial(e.target.value)} required /></Field>
      <Select label="Modelo" value={platform} onChange={setPlatform} options={['A15', 'A15C', 'A25', 'BA200', 'BA400', 'BTS', 'BTS350', 'IPRO', 'Destilador', 'Ósmosis'].map(p => [p, p])} />
      <Field label="Inicio"><input type="date" value={start} onChange={e => setStart(e.target.value)} required /></Field></div>
    {error && <p role="alert" className="rel-error">{error}</p>}<button type="submit" className="rel-primary" disabled={busy}>{busy ? 'Guardando…' : 'Crear episodio'}</button></form>;
}

function EpisodeWorkspace({ episode, model, onSaved, onEpisode }: { episode: Episode; model: LabModel; onSaved: () => Promise<void>; onEpisode: (id: string | null) => void }) {
  const c = episode.captured;
  const [form, setForm] = useState({ scope: c?.scope || 'no_definido', release_result: c?.release_result || 'pendiente', release_notes: c?.release_notes || '', finished_on: c?.finished_on || isoOfDay(episode.end),
    budget_requested: c?.budget_requested_mxn?.toString() ?? '', budget_approved: c?.budget_approved_mxn?.toString() ?? '', budget_source: c?.budget_source || '', notes: c?.notes || '' });
  const [status, setStatus] = useState<{ error?: string; ok?: string }>({}); const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm(f => ({ ...f, [key]: value }));
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setStatus({});
    const row = { scope: form.scope, release_result: form.release_result, release_notes: form.release_notes || null, finished_on: form.finished_on || null,
      budget_requested_mxn: money(form.budget_requested), budget_approved_mxn: money(form.budget_approved), budget_source: form.budget_source || null, notes: form.notes || null };
    try {
      if (c) await updateRow('refurbishment_episodes', c.id, row);
      else await insertRow('refurbishment_episodes', { ...row, serial_key: episode.serialKey, serial_raw: episode.serial, platform: episode.platform, started_on: isoOfDay(episode.start),
        history_service_ids: episode.records.map(r => r.history_id).filter(Boolean) });
      await onSaved(); onEpisode(episode.id); setStatus({ ok: 'Episodio guardado.' });
    } catch (cause) { setStatus({ error: (cause as Error).message }); } finally { setBusy(false); }
  };
  const savingGap = money(form.budget_requested) !== null && money(form.budget_approved) !== null ? money(form.budget_requested)! - money(form.budget_approved)! : null;
  return <div className="rel-workspace">
    <header><span className="rel-eyebrow">REGISTRO DEL EPISODIO</span><h3>{episode.platform} · {episode.serial}</h3>
      <p>{formatDay(episode.start)}{episode.end !== episode.start ? ` – ${formatDay(episode.end)}` : ''} · {episode.records.length} reportes del historial · {episode.partsQty} piezas registradas{episode.delivery !== null ? ` · entregado ${formatDay(episode.delivery)} a ${episode.destination || 'destino sin registro'}` : ' · sin entrega confirmada'}</p></header>
    <form className="rel-form" onSubmit={save}>
      <h4>1 · Alcance, liberación y presupuesto</h4>
      <div className="rel-form-grid">
        <Select label="Alcance" value={form.scope} onChange={set('scope')} options={SCOPES} />
        <Select label="Resultado de liberación" value={form.release_result} onChange={set('release_result')} options={RELEASES} />
        <Field label="Fin del reacondicionamiento"><input type="date" value={form.finished_on} onChange={e => set('finished_on')(e.target.value)} /></Field>
        <Field label="Presupuesto técnico solicitado (MXN)"><input type="number" min={0} step={100} value={form.budget_requested} onChange={e => set('budget_requested')(e.target.value)} /></Field>
        <Field label="Presupuesto aprobado (MXN)"><input type="number" min={0} step={100} value={form.budget_approved} onChange={e => set('budget_approved')(e.target.value)} /></Field>
        <Field label="Fuente del presupuesto"><input value={form.budget_source} placeholder="Cotización, correo, folio…" onChange={e => set('budget_source')(e.target.value)} /></Field>
      </div>
      {savingGap !== null && <p className="rel-note">Diferencia inicial frente a lo solicitado: <b>{moneyText(savingGap)}</b>. Es un ahorro presupuestario, no un costo evitado.</p>}
      <Field label="Notas de liberación"><textarea rows={2} value={form.release_notes} onChange={e => set('release_notes')(e.target.value)} /></Field>
      <Field label="Notas generales"><textarea rows={2} value={form.notes} onChange={e => set('notes')(e.target.value)} /></Field>
      {status.error && <p role="alert" className="rel-error">{status.error}</p>}{status.ok && <p role="status" className="rel-ok">{status.ok}</p>}
      <button type="submit" className="rel-primary" disabled={busy}>{busy ? 'Guardando…' : c ? 'Guardar cambios' : 'Crear registro del episodio'}</button>
    </form>
    {c ? <>
      <Decisions episode={episode} model={model} onSaved={onSaved} />
      <AcceptanceTests episode={episode} onSaved={onSaved} />
      <FailureLinks episode={episode} model={model} onSaved={onSaved} />
      <Costs episode={episode} model={model} onSaved={onSaved} />
      <AuditTrail episode={episode} />
    </> : <p className="rel-note">Crea el registro del episodio para documentar componentes, pruebas, relaciones de fallas y costos.</p>}
  </div>;
}

function Decisions({ episode, model, onSaved }: { episode: Episode; model: LabModel; onSaved: () => Promise<void> }) {
  const empty = { component_code: '', component_name: '', subsystem: '', criticality: 'no_definida', condition: 'no_inspeccionado', condition_evidence: '', recommendation: 'sin_recomendacion', estimated_cost: '', cost_source: '', action_taken: 'pendiente', residual_risk: 'no_evaluado' };
  const [draft, setDraft] = useState(empty); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const kit = (episode.platform && model.kits.get(episode.platform)) || [];
  const codes = [...new Set([...kit.map(k => k.code), ...episode.parts.map(p => p.code), ...Object.keys(model.catalog)])];
  const set = (key: keyof typeof empty) => (value: string) => setDraft(d => ({ ...d, [key]: value, ...(key === 'component_code' && model.catalog[value] && !d.component_name ? { component_name: model.catalog[value] } : {}) }));
  const add = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await insertRow('refurbishment_component_decisions', { episode_id: episode.captured!.id, component_code: draft.component_code || null, component_name: draft.component_name || draft.component_code,
        subsystem: draft.subsystem || null, criticality: draft.criticality, condition: draft.condition, condition_evidence: draft.condition_evidence || null, recommendation: draft.recommendation,
        estimated_cost_mxn: money(draft.estimated_cost), cost_source: draft.cost_source || null, action_taken: draft.action_taken, residual_risk: draft.residual_risk });
      setDraft(empty); await onSaved();
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  return <section className="rel-form"><h4>2 · Componentes: condición, recomendación, autorización y acción</h4>
    <p className="rel-note">La autorización la registra un administrador con su motivo; el sistema guarda quién y cuándo. El objetivo es medir resultados de decisiones, no señalar personas.</p>
    {episode.decisions.length > 0 && <div className="rel-table-scroll"><table className="rel-table rel-table--compact"><thead><tr><th>Componente</th><th>Condición</th><th>Recomendación</th><th>Autorización</th><th>Acción</th><th>Riesgo residual</th></tr></thead><tbody>
      {episode.decisions.map(d => <DecisionRow key={d.id} decision={d} onSaved={onSaved} />)}
    </tbody></table></div>}
    <form onSubmit={add}><datalist id={`codes-${episode.id}`}>{codes.slice(0, 400).map(code => <option key={code} value={code}>{model.catalog[code] || ''}</option>)}</datalist>
      <div className="rel-form-grid">
        <Field label="Código"><input list={`codes-${episode.id}`} value={draft.component_code} onChange={e => set('component_code')(e.target.value)} /></Field>
        <Field label="Componente"><input value={draft.component_name} required onChange={e => set('component_name')(e.target.value)} /></Field>
        <Field label="Subsistema"><input value={draft.subsystem} placeholder="Fluídico, fotométrico…" onChange={e => set('subsystem')(e.target.value)} /></Field>
        <Select label="Criticidad" value={draft.criticality} onChange={set('criticality')} options={CRITICALITY} />
        <Select label="Condición detectada" value={draft.condition} onChange={set('condition')} options={CONDITIONS} />
        <Select label="Recomendación" value={draft.recommendation} onChange={set('recommendation')} options={RECOMMENDATIONS} />
        <Field label="Costo estimado (MXN)"><input type="number" min={0} step={50} value={draft.estimated_cost} onChange={e => set('estimated_cost')(e.target.value)} /></Field>
        <Field label="Fuente del costo"><input value={draft.cost_source} placeholder="Lista de precios, cotización…" onChange={e => set('cost_source')(e.target.value)} /></Field>
        <Select label="Acción ejecutada" value={draft.action_taken} onChange={set('action_taken')} options={ACTIONS} />
        <Select label="Riesgo residual" value={draft.residual_risk} onChange={set('residual_risk')} options={RISK} />
      </div>
      <Field label="Evidencia técnica de la condición"><textarea rows={2} value={draft.condition_evidence} placeholder="Medición, foto, prueba, síntoma…" onChange={e => set('condition_evidence')(e.target.value)} /></Field>
      {error && <p role="alert" className="rel-error">{error}</p>}<button type="submit" className="rel-primary" disabled={busy}>{busy ? 'Guardando…' : 'Agregar componente'}</button>
    </form></section>;
}
function DecisionRow({ decision, onSaved }: { decision: CapturedDecision; onSaved: () => Promise<void> }) {
  const [auth, setAuth] = useState(decision.authorization_status); const [reason, setReason] = useState(decision.authorization_reason || ''); const [detail, setDetail] = useState(decision.authorization_detail || '');
  const [action, setAction] = useState(decision.action_taken); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const dirty = auth !== decision.authorization_status || reason !== (decision.authorization_reason || '') || detail !== (decision.authorization_detail || '') || action !== decision.action_taken;
  const save = async () => {
    setBusy(true); setError('');
    try {
      const patch: Record<string, unknown> = { action_taken: action };
      if (auth !== decision.authorization_status || reason !== (decision.authorization_reason || '') || detail !== (decision.authorization_detail || '')) Object.assign(patch, { authorization_status: auth, authorization_reason: reason || null, authorization_detail: detail || null });
      await updateRow('refurbishment_component_decisions', decision.id, patch); await onSaved();
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  return <tr><td><b>{decision.component_code || ''}</b> {decision.component_name}{decision.estimated_cost_mxn !== null && <small>{moneyText(decision.estimated_cost_mxn)}{decision.cost_source ? ` · ${decision.cost_source}` : ''}</small>}</td>
    <td>{CONDITIONS.find(([k]) => k === decision.condition)?.[1]}{decision.condition_evidence && <small>{decision.condition_evidence}</small>}</td>
    <td>{RECOMMENDATIONS.find(([k]) => k === decision.recommendation)?.[1]}{decision.recommended_by_name && <small><PrivateName>{decision.recommended_by_name}</PrivateName> · {decision.recommended_on}</small>}</td>
    <td className="rel-inline-form"><select aria-label="Autorización" value={auth} onChange={e => setAuth(e.target.value)}>{AUTHORIZATION.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
      {(auth === 'rechazada' || auth === 'pospuesta') && <select aria-label="Motivo" value={reason} onChange={e => setReason(e.target.value)}>{REASONS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>}
      {auth !== 'pendiente' && <input aria-label="Detalle" value={detail} placeholder="Detalle del motivo" onChange={e => setDetail(e.target.value)} />}
      {decision.authorized_by_name && <small><PrivateName>{decision.authorized_by_name}</PrivateName> · {decision.authorized_on}</small>}</td>
    <td><select aria-label="Acción" value={action} onChange={e => setAction(e.target.value)}>{ACTIONS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></td>
    <td>{RISK.find(([k]) => k === decision.residual_risk)?.[1]}{dirty && <button type="button" className="rel-primary rel-small" disabled={busy} onClick={() => void save()}>{busy ? '…' : 'Guardar'}</button>}{error && <small className="rel-error">{error}</small>}</td></tr>;
}

function AcceptanceTests({ episode, onSaved }: { episode: Episode; onSaved: () => Promise<void> }) {
  const empty = { criterion: ACCEPTANCE_CRITERIA[0], specification: '', spec_source: '', result: 'pendiente_definicion', measured_value: '', tested_on: '', notes: '' };
  const [draft, setDraft] = useState(empty); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof empty) => (value: string) => setDraft(d => ({ ...d, [key]: value }));
  const needsSpec = draft.result === 'aprobado' || draft.result === 'no_aprobado';
  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (needsSpec && (!draft.specification.trim() || !draft.spec_source.trim())) { setError('Para aprobar o reprobar registra el criterio de aceptación y su documento de origen. Sin especificación vigente, déjala «pendiente de definición».'); return; }
    setBusy(true); setError('');
    try { await insertRow('refurbishment_acceptance_tests', { episode_id: episode.captured!.id, criterion: draft.criterion, specification: draft.specification || null, spec_source: draft.spec_source || null,
      result: draft.result, measured_value: draft.measured_value || null, tested_on: draft.tested_on || null, notes: draft.notes || null }); setDraft(empty); await onSaved(); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  const done = new Set(episode.tests.map(t => t.criterion));
  return <section className="rel-form"><h4>3 · Matriz de liberación técnica</h4>
    <p className="rel-note">Las tolerancias se toman de la documentación técnica vigente; Orion no las inventa. Una prueba sin criterio documentado no cuenta como aprobada.</p>
    {episode.tests.length > 0 && <div className="rel-table-scroll"><table className="rel-table rel-table--compact"><thead><tr><th>Criterio</th><th>Especificación</th><th>Fuente</th><th>Resultado</th><th>Medición</th><th>Fecha</th></tr></thead><tbody>
      {episode.tests.map(t => <tr key={t.id}><td>{t.criterion}</td><td>{t.specification || '—'}</td><td>{t.spec_source || '—'}</td><td>{RESULTS.find(([k]) => k === t.result)?.[1]}</td><td>{t.measured_value || '—'}</td><td>{t.tested_on || '—'}</td></tr>)}
    </tbody></table></div>}
    <p className="rel-note">Criterios sin registrar: {ACCEPTANCE_CRITERIA.filter(c => !done.has(c)).join(' · ') || 'ninguno'}.</p>
    <form onSubmit={add}><div className="rel-form-grid">
      <Select label="Criterio" value={draft.criterion} onChange={set('criterion')} options={ACCEPTANCE_CRITERIA.map(c => [c, c])} />
      <Field label="Especificación / tolerancia"><input value={draft.specification} onChange={e => set('specification')(e.target.value)} /></Field>
      <Field label="Documento de origen"><input value={draft.spec_source} placeholder="Manual, PNO, versión…" onChange={e => set('spec_source')(e.target.value)} /></Field>
      <Select label="Resultado" value={draft.result} onChange={set('result')} options={RESULTS} />
      <Field label="Valor medido"><input value={draft.measured_value} onChange={e => set('measured_value')(e.target.value)} /></Field>
      <Field label="Fecha de la prueba"><input type="date" value={draft.tested_on} onChange={e => set('tested_on')(e.target.value)} /></Field>
    </div>{error && <p role="alert" className="rel-error">{error}</p>}<button type="submit" className="rel-primary" disabled={busy}>{busy ? 'Guardando…' : 'Registrar prueba'}</button></form></section>;
}

function FailureLinks({ episode, model, onSaved }: { episode: Episode; model: LabModel; onSaved: () => Promise<void> }) {
  const failures = episode.delivery === null ? [] : (model.bySerial.get(episode.serialKey) || []).filter(s => (s.kind === 'correctivo' || s.kind === 'visita') && toDay(s.day)! >= episode.delivery! && toDay(s.day)! < episode.stop && s.history_id);
  const [error, setError] = useState('');
  if (!failures.length) return <section className="rel-form"><h4>4 · Relación entre fallas posteriores y decisiones</h4><p className="rel-note">{episode.delivery === null ? 'El equipo no tiene entrega confirmada.' : 'Sin correctivos ni visitas después de la entrega.'}</p></section>;
  return <section className="rel-form"><h4>4 · Relación entre fallas posteriores y decisiones</h4>
    <p className="rel-note">La proximidad en el tiempo no basta: afirmar o descartar una relación exige evidencia escrita. Sin ella queda «no determinada».</p>
    {error && <p role="alert" className="rel-error">{error}</p>}
    <div className="rel-links">{failures.map(service => <FailureLinkRow key={service.id} episode={episode} service={service} onError={setError} onSaved={onSaved} model={model} />)}</div></section>;
}
function FailureLinkRow({ episode, service, model, onSaved, onError }: { episode: Episode; service: LabModel['payload']['services'][number]; model: LabModel; onSaved: () => Promise<void>; onError: (m: string) => void }) {
  const existing = episode.links.find(l => l.failure_service_id === service.history_id);
  const [relation, setRelation] = useState(existing?.relation || 'no_determinada'); const [decision, setDecision] = useState(existing?.decision_id || '');
  const [evidence, setEvidence] = useState(existing?.evidence || ''); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); onError('');
    const row = { relation, decision_id: decision || null, evidence: evidence || null, component_code: episode.decisions.find(d => d.id === decision)?.component_code ?? service.parts[0]?.[0] ?? null };
    try { if (existing) await updateRow('reliability_failure_links', existing.id, row); else await insertRow('reliability_failure_links', { ...row, episode_id: episode.captured!.id, failure_service_id: service.history_id }); await onSaved(); }
    catch (cause) { onError((cause as Error).message); } finally { setBusy(false); }
  };
  return <article><header><strong>{kindLabels[service.kind]} · {service.ref}</strong><small>{formatDay(toDay(service.day))} · día {toDay(service.day)! - episode.delivery!}</small></header>
    {service.note && <p>{service.note}</p>}{service.parts.length > 0 && <p className="rel-parts-inline">{service.parts.map(([code, qty]) => `${code}${model.catalog[code] ? ` (${model.catalog[code]})` : ''} × ${qty}`).join(' · ')}</p>}
    <div className="rel-form-grid"><Select label="Relación" value={relation} onChange={setRelation} options={Object.entries(relationLabels)} />
      <Select label="Decisión relacionada" value={decision} onChange={setDecision} options={[['', 'Ninguna'], ...episode.decisions.map(d => [d.id, `${d.component_code || ''} ${d.component_name} (${d.authorization_status})`] as [string, string])]} />
      <Field label="Evidencia"><input value={evidence} onChange={e => setEvidence(e.target.value)} placeholder="Por qué se relaciona o se descarta" /></Field></div>
    <button type="button" className="rel-primary rel-small" disabled={busy} onClick={() => void save()}>{busy ? 'Guardando…' : existing ? 'Actualizar' : 'Guardar evaluación'}</button></article>;
}

function Costs({ episode, model, onSaved }: { episode: Episode; model: LabModel; onSaved: () => Promise<void> }) {
  const empty = { phase: 'reacondicionamiento', category: 'refacciones', amount: '', nature: 'comprobado', source_document: '', occurred_on: new Date().toISOString().slice(0, 10), service_id: '', notes: '' };
  const [draft, setDraft] = useState(empty); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof empty) => (value: string) => setDraft(d => ({ ...d, [key]: value }));
  const services = (model.bySerial.get(episode.serialKey) || []).filter(s => s.history_id && toDay(s.day)! >= episode.start - 30);
  const add = async (event: FormEvent) => {
    event.preventDefault(); const amount = Number(draft.amount); if (!(amount > 0)) { setError('El monto debe ser mayor que cero.'); return; }
    setBusy(true); setError('');
    try { await insertRow('reliability_costs', { serial_key: episode.serialKey, episode_id: episode.captured!.id, service_id: draft.service_id || null, phase: draft.phase, category: draft.category,
      amount_mxn: amount, nature: draft.nature, source_document: draft.source_document || null, occurred_on: draft.occurred_on, notes: draft.notes || null }); setDraft(empty); await onSaved(); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  return <section className="rel-form"><h4>5 · Costos</h4>
    <p className="rel-note">Única fuente del costo total. Cada comprobante se registra una vez por categoría; lo estimado se muestra aparte de lo comprobado.</p>
    {episode.costs.length > 0 && <div className="rel-table-scroll"><table className="rel-table rel-table--compact"><thead><tr><th>Fecha</th><th>Fase</th><th>Categoría</th><th>Monto</th><th>Naturaleza</th><th>Comprobante</th></tr></thead><tbody>
      {episode.costs.map(cost => <tr key={cost.id}><td>{cost.occurred_on}</td><td>{cost.phase}</td><td>{cost.category}</td><td>{moneyText(Number(cost.amount_mxn))}</td><td>{cost.nature}</td><td>{cost.source_document || '—'}</td></tr>)}
    </tbody></table></div>}
    <form onSubmit={add}><div className="rel-form-grid">
      <Select label="Fase" value={draft.phase} onChange={set('phase')} options={PHASES} /><Select label="Categoría" value={draft.category} onChange={set('category')} options={CATEGORIES} />
      <Field label="Monto (MXN)"><input type="number" min={0} step={10} value={draft.amount} onChange={e => set('amount')(e.target.value)} required /></Field>
      <Select label="Naturaleza" value={draft.nature} onChange={set('nature')} options={[['comprobado', 'Comprobado'], ['estimado', 'Estimado']]} />
      <Field label="Comprobante"><input value={draft.source_document} placeholder="Factura, folio de viáticos…" onChange={e => set('source_document')(e.target.value)} /></Field>
      <Field label="Fecha"><input type="date" value={draft.occurred_on} onChange={e => set('occurred_on')(e.target.value)} required /></Field>
      <Select label="Servicio relacionado" value={draft.service_id} onChange={set('service_id')} options={[['', 'Ninguno'], ...services.map(s => [s.history_id!, `${formatDay(toDay(s.day))} · ${kindLabels[s.kind] || s.kind} · ${s.ref}`] as [string, string])]} />
    </div>{error && <p role="alert" className="rel-error">{error}</p>}<button type="submit" className="rel-primary" disabled={busy}>{busy ? 'Guardando…' : 'Agregar costo'}</button></form></section>;
}

function AuditTrail({ episode }: { episode: Episode }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null); const [error, setError] = useState('');
  const ids = [episode.captured!.id, ...episode.decisions.map(d => d.id), ...episode.tests.map(t => t.id), ...episode.links.map(l => l.id), ...episode.costs.map(c => c.id)];
  const load = async () => { setError(''); try { setEntries(await fetchAudit(ids)); } catch (cause) { setError((cause as Error).message); } };
  const changed = (entry: AuditEntry) => entry.action !== 'update' || !entry.old || !entry.new ? '' : Object.keys(entry.new).filter(k => !['updated_at', 'updated_by'].includes(k) && JSON.stringify(entry.new![k]) !== JSON.stringify(entry.old![k])).join(', ');
  return <section className="rel-form"><h4>6 · Bitácora de cambios</h4>
    <p className="rel-note">Cada inserción y modificación queda registrada con su autor y la versión anterior. La bitácora no se puede editar ni borrar desde Orion.</p>
    <button type="button" onClick={() => void load()}>{entries ? 'Actualizar bitácora' : 'Ver bitácora'}</button>{error && <p role="alert" className="rel-error">{error}</p>}
    {entries && <ol className="rel-audit">{entries.map((entry, i) => <li key={i}><time>{new Date(entry.at).toLocaleString('es-MX')}</time> <b>{entry.action === 'insert' ? 'Alta' : entry.action === 'update' ? 'Cambio' : 'Retiro'}</b> en {entry.table.replace(/_/g, ' ')}
      {changed(entry) && <> · {changed(entry)}</>} · <PrivateName>{entry.actor || 'Sistema'}</PrivateName></li>)}</ol>}
  </section>;
}
