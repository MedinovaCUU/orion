import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { PanelLoader } from './OrionLoader';
import './AlexaPanel.css';

/**
 * Orion · Alexa. Vincula el dispositivo con el código que dicta Alexa, controla los avisos y, sobre todo, convierte
 * en registros reales lo que se dictó por voz: nada de lo que Alexa propone (tickets, refacciones, notas de
 * bitácora) existe hasta que su autor lo aprueba aquí, por el mismo camino que usan los módulos de Orion.
 */

interface AlexaLink {
  alexa_user_id: string;
  linked_at: string;
  last_seen_at: string | null;
  notify: boolean;
  quiet_from: number;
  quiet_to: number;
}
interface PendingAction {
  id: string;
  kind: 'ticket' | 'refaccion' | 'bitacora';
  summary: string;
  payload: Record<string, unknown>;
  status: 'pendiente' | 'aplicada' | 'descartada' | 'error';
  created_at: string;
  result: Record<string, unknown> | null;
}
interface AlexaAlert {
  id: string;
  kind: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  speech: string;
  created_at: string;
  acknowledged_at: string | null;
  ack_via: string | null;
  escalated_at: string | null;
}
interface VoiceCase {
  id: string;
  user_id: string;
  serial: string;
  equipment_model: string | null;
  failed_tests: string[];
  correct_tests: string[];
  hypotheses: Array<{ key: string; title: string; score: number }>;
  top_hypothesis: string | null;
  confirmed_hypothesis: string | null;
  outcome: 'resuelto' | 'no_resuelto' | 'parcial' | null;
  outcome_note: string | null;
  checks: Array<{ title?: string; passed?: boolean }>;
  created_at: string;
}

const KIND_LABEL: Record<PendingAction['kind'], string> = { ticket: 'Ticket', refaccion: 'Refacción', bitacora: 'Nota de bitácora' };
const OUTCOME_LABEL: Record<string, string> = { resuelto: 'Resuelto', no_resuelto: 'No resuelto', parcial: 'Parcial' };
const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const shortDevice = (id: string) => `···${id.slice(-6)}`;
const hours = Array.from({ length: 24 }, (_, hour) => hour);

const CLAIM_MESSAGES: Record<string, string> = {
  ok: 'Listo: este dispositivo Alexa quedó vinculado con tu cuenta. Di «Alexa, abre servicio orion».',
  invalido: 'Código inválido o vencido. Pide uno nuevo diciendo: «Alexa, abre servicio orion».',
  bloqueado: 'Demasiados intentos. Espera unos minutos y pide un código nuevo.',
};

export default function AlexaPanel({ isAdmin }: { isAdmin: boolean }) {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [engineerName, setEngineerName] = useState('');
  const [links, setLinks] = useState<AlexaLink[]>([]);
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [alerts, setAlerts] = useState<AlexaAlert[]>([]);
  const [cases, setCases] = useState<VoiceCase[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;
    setUserId(uid);
    if (!uid) {
      setLoading(false);
      return;
    }
    const [profile, linkRows, actionRows, alertRows, caseRows] = await Promise.all([
      supabase.from('profiles').select('nombre_completo').eq('id', uid).maybeSingle(),
      supabase.from('alexa_links').select('alexa_user_id, linked_at, last_seen_at, notify, quiet_from, quiet_to').order('linked_at', { ascending: false }),
      supabase.from('alexa_pending_actions').select('*').order('created_at', { ascending: false }).limit(40),
      supabase.from('alexa_alerts').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('alexa_voice_cases').select('*').order('created_at', { ascending: false }).limit(isAdmin ? 200 : 20),
    ]);
    setEngineerName(profile.data?.nombre_completo?.trim() || auth.user?.email || '');
    setLinks((linkRows.data || []) as AlexaLink[]);
    setActions((actionRows.data || []) as PendingAction[]);
    setAlerts((alertRows.data || []) as AlexaAlert[]);
    setCases((caseRows.data || []) as VoiceCase[]);
    const firstError = linkRows.error || actionRows.error || alertRows.error || caseRows.error;
    if (firstError) setNotice({ tone: 'error', text: `No se pudo leer todo: ${firstError.message}` });
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (key: string, task: () => Promise<string | void>) => {
    setBusy(key);
    setNotice(null);
    try {
      const message = await task();
      if (message) setNotice({ tone: 'ok', text: message });
      await load();
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  };

  const claim = () =>
    run('claim', async () => {
      const clean = code.replace(/\D/g, '');
      if (clean.length !== 6) throw new Error('El código tiene 6 dígitos.');
      const { data, error } = await supabase.rpc('claim_alexa_code', { p_code: clean });
      if (error) throw error;
      setCode('');
      const status = String(data);
      if (status !== 'ok') throw new Error(CLAIM_MESSAGES[status] || 'No se pudo vincular.');
      return CLAIM_MESSAGES.ok;
    });

  const setNotify = (link: AlexaLink, patch: Partial<Pick<AlexaLink, 'notify' | 'quiet_from' | 'quiet_to'>>) =>
    run(`notify:${link.alexa_user_id}`, async () => {
      const next = { ...link, ...patch };
      const { error } = await supabase.rpc('set_alexa_notify', { p_notify: next.notify, p_quiet_from: next.quiet_from, p_quiet_to: next.quiet_to });
      if (error) throw error;
    });

  const unlink = (link: AlexaLink) =>
    run(`unlink:${link.alexa_user_id}`, async () => {
      if (!window.confirm('¿Desvincular este dispositivo Alexa? Tendrás que pedir un código nuevo para volver a usarlo.')) return;
      const { error } = await supabase.rpc('unlink_alexa', { p_alexa_user_id: link.alexa_user_id });
      if (error) throw error;
      return 'Dispositivo desvinculado.';
    });

  /** Each approval goes through the same path the module uses, as the signed-in person (RLS applies). */
  const apply = async (action: PendingAction): Promise<Record<string, unknown>> => {
    const p = action.payload;
    if (action.kind === 'ticket') {
      const ticketId = crypto.randomUUID();
      const area = p.area === 'quimica' ? 'Químico' : 'Ingeniero';
      const { error } = await supabase.from('tickets').insert({
        id: ticketId,
        user_id: userId,
        asunto: `[Soporte ${area}] ${String(p.motivo || 'Reporte por voz').slice(0, 180)}`,
        descripcion: String(p.descripcion || p.motivo || ''),
        numero_serie_equipo: p.serial ? String(p.serial) : null,
      });
      if (error) throw error;
      const { data: receipt } = await supabase.rpc('get_ticket_creation_receipt', { p_ticket_id: ticketId });
      const row = Array.isArray(receipt) ? receipt[0] : receipt;
      return { ticketId, numeroCaso: row?.numero_caso ?? null };
    }
    if (action.kind === 'refaccion') {
      const quantity = Math.max(1, Number(p.cantidad) || 1);
      const { data, error } = await supabase
        .from('refacciones_solicitudes')
        .insert({
          user_id: userId,
          engineer_name: engineerName,
          nombre_pieza: String(p.pieza || ''),
          cantidad: quantity,
          equipo_serie: p.serial ? String(p.serial) : null,
          equipo_modelo: p.modelo ? String(p.modelo) : null,
          cliente_nombre: p.cliente ? String(p.cliente) : null,
          motivo_solicitud: 'Solicitada por voz con Alexa',
          lineas_solicitud: [{ code: '', description: String(p.pieza || ''), quantity }],
          snapshot_solicitud: { source: 'alexa', actionId: action.id },
        })
        .select('id')
        .single();
      if (error) throw error;
      return { requestId: data?.id ?? null };
    }
    // Movements, state changes, first responses, closures and delay approvals drafted by voice.
    const tipo = String(p.tipo || 'avance');
    const { error } = await supabase.rpc('register_ticket_movement', {
      p_ticket_id: String(p.ticketId),
      p_action: tipo,
      p_detail: String(p.detalle || '').slice(0, 3900),
      p_state: p.estado && !['respuesta', 'cierre', 'justificacion'].includes(tipo) ? String(p.estado) : null,
      p_visible: false,
      p_reason: tipo === 'cierre' ? String(p.motivo || 'solucionado') : null,
    });
    if (error) throw error;
    return { ticketId: p.ticketId };
  };

  const approve = (action: PendingAction) =>
    run(`action:${action.id}`, async () => {
      const tipo = String(action.payload.tipo || '');
      // Same rule as by voice: a closure or a first response messages the client by WhatsApp.
      if (action.kind === 'bitacora' && (tipo === 'cierre' || tipo === 'respuesta')
        && !window.confirm(tipo === 'cierre' ? '¿Cerrar el caso? Si tiene teléfono, el cliente recibe el WhatsApp de cierre y la encuesta.' : '¿Registrar la respuesta al cliente? Si es la primera y el caso tiene teléfono, el cliente recibe un WhatsApp.')) return;
      let result: Record<string, unknown>;
      try {
        result = await apply(action);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await supabase.rpc('decide_alexa_action', { p_action_id: action.id, p_status: 'error', p_result: { message } });
        throw new Error(`No se pudo aplicar: ${message}`);
      }
      const { error } = await supabase.rpc('decide_alexa_action', { p_action_id: action.id, p_status: 'aplicada', p_result: result });
      if (error) throw error;
      if (action.kind === 'ticket') return `Ticket creado${result.numeroCaso ? `: caso ${String(result.numeroCaso)}` : ''}.`;
      if (action.kind === 'refaccion') return 'Solicitud guardada en Refacciones. Envíala por correo desde ese módulo cuando esté completa.';
      if (tipo === 'cierre') return 'Caso cerrado.';
      if (tipo === 'respuesta') return 'Respuesta al cliente registrada.';
      return 'Movimiento agregado a la bitácora del caso.';
    });

  const discard = (action: PendingAction) =>
    run(`action:${action.id}`, async () => {
      const { error } = await supabase.rpc('decide_alexa_action', { p_action_id: action.id, p_status: 'descartada', p_result: null });
      if (error) throw error;
    });

  const ack = (alert: AlexaAlert) =>
    run(`alert:${alert.id}`, async () => {
      const { error } = await supabase.rpc('ack_alexa_alert', { p_alert_id: alert.id });
      if (error) throw error;
    });

  const setOutcome = (vc: VoiceCase, outcome: 'resuelto' | 'no_resuelto' | 'parcial') =>
    run(`case:${vc.id}`, async () => {
      const { error } = await supabase.rpc('set_alexa_case_outcome', { p_case_id: vc.id, p_outcome: outcome, p_note: null, p_confirmed: outcome === 'resuelto' ? vc.top_hypothesis : null });
      if (error) throw error;
    });

  /** Resolved voice cases in the shape of the DRI validation fixtures (to grow the engine's test set). */
  const exportFixtures = () => {
    const fixtures = cases
      .filter((vc) => vc.outcome === 'resuelto' && (vc.confirmed_hypothesis || vc.top_hypothesis))
      .map((vc) => ({
        id: `voz-${vc.id.slice(0, 8)}`,
        source: 'alexa',
        serial: vc.serial,
        equipmentModel: vc.equipment_model || 'BA400',
        failedTests: vc.failed_tests,
        correctTests: vc.correct_tests,
        expectedTopHypothesis: vc.confirmed_hypothesis || vc.top_hypothesis,
        engineTop: vc.top_hypothesis,
        checks: vc.checks,
        note: vc.outcome_note,
        createdAt: vc.created_at,
      }));
    const blob = new Blob([JSON.stringify(fixtures, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `dri-casos-voz-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <PanelLoader title="Cargando Alexa" />;
  const pending = actions.filter((a) => a.status === 'pendiente' || a.status === 'error');
  const decided = actions.filter((a) => a.status === 'aplicada' || a.status === 'descartada').slice(0, 8);
  const myCases = cases.filter((vc) => vc.user_id === userId);
  const resolvedCount = cases.filter((vc) => vc.outcome === 'resuelto').length;

  return (
    <section className="alexa-panel">
      <header className="alexa-panel__header">
        <div>
          <p className="alexa-panel__kicker">Asistente de voz</p>
          <h2>Alexa · Orion</h2>
          <p className="alexa-panel__lead">
            Di <strong>«Alexa, abre servicio orion»</strong>. Alexa responde solo con lo que tu cuenta puede ver en Orion, y lo que dictas
            (tickets, refacciones, notas) espera aquí tu aprobación.
          </p>
        </div>
      </header>

      {notice ? (
        <p className={`alexa-panel__notice alexa-panel__notice--${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </p>
      ) : null}

      <div className="alexa-panel__grid">
        <article className="alexa-panel__card alexa-panel__card--wide">
          <h3>
            Por aprobar <span className="glass-pill glass-pill--brand">{pending.length}</span>
          </h3>
          {pending.length ? (
            <ul className="alexa-panel__actions">
              {pending.map((action) => (
                <li key={action.id} className={action.status === 'error' ? 'is-error' : ''}>
                  <div>
                    <span className="alexa-panel__tag">{KIND_LABEL[action.kind]}</span>
                    <strong>{action.summary}</strong>
                    <small>Dictado {formatDate(action.created_at)}</small>
                    {action.kind === 'ticket' || action.kind === 'bitacora' ? (
                      <pre className="alexa-panel__detail">{String(action.payload.descripcion || action.payload.detalle || '')}</pre>
                    ) : null}
                    {action.status === 'error' && action.result?.message ? <small className="alexa-panel__error">{String(action.result.message)}</small> : null}
                  </div>
                  <div className="alexa-panel__buttons">
                    <button type="button" className="button-primary" disabled={busy !== null} onClick={() => void approve(action)}>
                      {busy === `action:${action.id}` ? 'Aplicando…' : 'Aprobar'}
                    </button>
                    <button type="button" className="button-primary inactive" disabled={busy !== null} onClick={() => void discard(action)}>
                      Descartar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="alexa-panel__muted">Nada pendiente. Dile a Alexa, por ejemplo: «abre un ticket, alarma de temperatura del rotor».</p>
          )}
          {decided.length ? (
            <details className="alexa-panel__history">
              <summary>Últimas decisiones</summary>
              <ul>
                {decided.map((action) => (
                  <li key={action.id}>
                    {action.status === 'aplicada' ? '✓' : '×'} {KIND_LABEL[action.kind]} · {action.summary}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </article>

        <article className="alexa-panel__card">
          <h3>Vincular un dispositivo</h3>
          <p>Abre la skill en tu Echo o en la app de Alexa: te dictará un código de 6 dígitos que vence en 10 minutos.</p>
          <form
            className="alexa-panel__claim"
            onSubmit={(event) => {
              event.preventDefault();
              void claim();
            }}
          >
            <input
              className="input-field alexa-panel__code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              placeholder="000000"
              aria-label="Código de vinculación"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/[^\d ]/g, ''))}
            />
            <button type="submit" className="button-primary" disabled={busy === 'claim'}>
              {busy === 'claim' ? 'Vinculando…' : 'Vincular'}
            </button>
          </form>
          {links.length ? (
            <ul className="alexa-panel__devices">
              {links.map((link) => (
                <li key={link.alexa_user_id}>
                  <div className="alexa-panel__device-head">
                    <strong>Dispositivo {shortDevice(link.alexa_user_id)}</strong>
                    <span className="glass-pill">Último uso: {formatDate(link.last_seen_at)}</span>
                  </div>
                  <label className="alexa-panel__check">
                    <input type="checkbox" checked={link.notify} disabled={busy !== null} onChange={(event) => void setNotify(link, { notify: event.target.checked })} />
                    Avisos de SLA, alarmas fatales, controles rechazados y seguimientos
                  </label>
                  <div className="alexa-panel__quiet">
                    <span>Silencio de</span>
                    <select className="input-field" value={link.quiet_from} disabled={busy !== null || !link.notify} onChange={(event) => void setNotify(link, { quiet_from: Number(event.target.value) })} aria-label="Inicio del silencio">
                      {hours.map((hour) => (
                        <option key={hour} value={hour}>{`${hour}:00`}</option>
                      ))}
                    </select>
                    <span>a</span>
                    <select className="input-field" value={link.quiet_to} disabled={busy !== null || !link.notify} onChange={(event) => void setNotify(link, { quiet_to: Number(event.target.value) })} aria-label="Fin del silencio">
                      {hours.map((hour) => (
                        <option key={hour} value={hour}>{`${hour}:00`}</option>
                      ))}
                    </select>
                    <button type="button" className="button-primary inactive" disabled={busy !== null} onClick={() => void unlink(link)}>
                      Desvincular
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="alexa-panel__muted">Aún no tienes dispositivos vinculados.</p>
          )}
          <p className="alexa-panel__muted">Para que suene el aviso, permite las notificaciones de Orion en la app de Alexa (Skills → Orion → Configuración).</p>
        </article>

        <article className="alexa-panel__card">
          <h3>Avisos</h3>
          {alerts.length ? (
            <ul className="alexa-panel__alerts">
              {alerts.map((alert) => (
                <li key={alert.id} className={`is-${alert.severity}`}>
                  <div>
                    <strong>{alert.title}</strong>
                    <span>{alert.speech}</span>
                    <small>
                      {formatDate(alert.created_at)}
                      {alert.acknowledged_at ? ` · enterado por ${alert.ack_via}` : alert.escalated_at ? ' · sin acuse después de 30 min' : ''}
                    </small>
                  </div>
                  {!alert.acknowledged_at ? (
                    <button type="button" className="button-primary inactive" disabled={busy !== null} onClick={() => void ack(alert)}>
                      Enterado
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="alexa-panel__muted">Sin avisos recientes.</p>
          )}
        </article>

        <article className="alexa-panel__card alexa-panel__card--wide">
          <h3>Diagnósticos por voz</h3>
          <p className="alexa-panel__muted">
            Cada diagnóstico queda con su resultado: así el DRI aprende qué resolvió realmente la falla.
            {isAdmin ? ` ${resolvedCount} casos resueltos en total.` : ''}
          </p>
          {myCases.length ? (
            <ul className="alexa-panel__cases">
              {myCases.map((vc) => (
                <li key={vc.id}>
                  <div>
                    <strong>
                      {vc.equipment_model || 'Equipo'} ···{vc.serial.slice(-4)} · {vc.hypotheses?.[0]?.title || 'sin hipótesis'}
                      {vc.hypotheses?.[0] ? ` (${vc.hypotheses[0].score}%)` : ''}
                    </strong>
                    <small>
                      Fallan: {vc.failed_tests.join(', ') || '—'} · Bien: {vc.correct_tests.join(', ') || '—'} · {formatDate(vc.created_at)}
                    </small>
                  </div>
                  <div className="alexa-panel__buttons">
                    {vc.outcome ? (
                      <span className={`glass-pill ${vc.outcome === 'resuelto' ? '' : 'glass-pill--brand'}`}>{OUTCOME_LABEL[vc.outcome]}</span>
                    ) : (
                      <>
                        <button type="button" className="button-primary chip" disabled={busy !== null} onClick={() => void setOutcome(vc, 'resuelto')}>
                          Resuelto
                        </button>
                        <button type="button" className="button-primary inactive chip" disabled={busy !== null} onClick={() => void setOutcome(vc, 'no_resuelto')}>
                          No resuelto
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="alexa-panel__muted">Prueba: «diagnostica el cero cuatro siete tres, glucosa fuera, colesterol bien».</p>
          )}
          {isAdmin && resolvedCount ? (
            <button type="button" className="button-primary inactive" onClick={exportFixtures}>
              Exportar casos resueltos como fixtures del DRI
            </button>
          ) : null}
        </article>
      </div>
    </section>
  );
}
