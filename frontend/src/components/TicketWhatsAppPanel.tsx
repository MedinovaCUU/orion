import { useEffect, useRef, useState } from 'react';
import { closureText, CONTACT_TEXT, CONTACT_FOOTER, type TicketSummary } from '../../../supabase/functions/ticket-whatsapp/core';
import { ticketWhatsAppRequest, type WhatsAppConfig, type WhatsAppMessage, type WhatsAppMode } from './ticketWhatsAppApi';
import { parseWhatsAppRecipients, templateStatusLabels, whatsappStatusLabels } from './ticketWhatsAppModel';
import './TicketWhatsAppPanel.css';

type TicketOption = { id: string; estado: string; numero_caso?: string | null; numero_serie_equipo?: string | null; asunto: string };
export default function TicketWhatsAppPanel({ tickets, initiallyOpen = false }: { tickets: TicketOption[]; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [activated, setActivated] = useState(initiallyOpen);
  return <section className="tickets-wa">
    <button className="tickets-wa__toggle" type="button" aria-expanded={open} aria-controls="ticket-whatsapp-composer" onClick={() => { setActivated(true); setOpen(value => !value); }}>WhatsApp · Enviar mensajes</button>
    <div id="ticket-whatsapp-composer" hidden={!open}>{activated && <Composer tickets={tickets} />}</div>
  </section>;
}
function Composer({ tickets }: { tickets: TicketOption[] }) {
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [history, setHistory] = useState<WhatsAppMessage[]>([]);
  const [recipients, setRecipients] = useState('');
  const [mode, setMode] = useState<WhatsAppMode>('text');
  const [text, setText] = useState('');
  const [ticketId, setTicketId] = useState('');
  const [consent, setConsent] = useState(false);
  const [recentInbound, setRecentInbound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [results, setResults] = useState<Array<{ recipient: string; status: string }>>([]);
  const sending = useRef(false);
  const modeChosen = useRef(false);
  const refresh = async () => {
    setLoading(true); setError('');
    const [settings, logs] = await Promise.allSettled([
      ticketWhatsAppRequest<WhatsAppConfig>({ action: 'config' }),
      ticketWhatsAppRequest<{ messages: WhatsAppMessage[] }>({ action: 'history' }),
    ]);
    if (settings.status === 'fulfilled') {
      setConfig(settings.value);
      if (!modeChosen.current) {
        setMode(settings.value.templates.contact.status === 'APPROVED' ? 'contact' : 'text');
        modeChosen.current = true;
      }
    }
    else { setConfig(null); setError(settings.reason.message); }
    if (logs.status === 'fulfilled') setHistory(logs.value.messages);
    else setError(previous => previous || logs.reason.message);
    setLoading(false);
  };
  useEffect(() => { void refresh(); }, []);
  const selectedTicket = tickets.find(ticket => ticket.id === ticketId && ticket.estado === 'cerrado');
  const preview = mode === 'text' ? text : mode === 'contact' ? `${CONTACT_TEXT}\n${CONTACT_FOOTER}` : selectedTicket ? closureText({ ...selectedTicket, numero_caso: selectedTicket.numero_caso || null, numero_serie_equipo: selectedTicket.numero_serie_equipo || null } as TicketSummary) : 'Selecciona un ticket cerrado para ver el aviso.';
  const templateState = mode === 'text' ? null : config?.templates[mode].status;
  const approved = mode === 'text' || templateState === 'APPROVED';
  let parsed: string[] = []; let recipientError = '';
  try { parsed = parseWhatsAppRecipients(recipients); } catch (cause) { recipientError = (cause as Error).message; }
  const blockers = [
    ...(!config ? [loading ? 'Consultando la conexión con WhatsApp…' : 'No se pudo cargar la conexión. Pulsa Actualizar estado.'] : []),
    ...(recipientError ? [recipientError] : []),
    ...(!approved && config ? [`No puedes enviar esta plantilla: ${templateStatusLabels[templateState || ''] || templateState || 'no disponible'}. Para una conversación activa, selecciona Texto libre.`] : []),
    ...(mode === 'text' && !text.trim() ? ['Escribe el mensaje.'] : []),
    ...(mode === 'text' && !recentInbound ? ['Confirma que cada destinatario escribió a Orion en las últimas 24 horas. Si todavía no lo hizo, pídele que envíe un WhatsApp al número de Orion primero.'] : []),
    ...(mode === 'closure' && !selectedTicket ? ['Selecciona un ticket cerrado.'] : []),
    ...(!consent ? ['Confirma que los destinatarios aceptaron recibir mensajes.'] : []),
  ];
  const ready = blockers.length === 0;
  const send = async () => {
    if (!ready || sending.current || done) return;
    sending.current = true; setBusy(true); setError(''); setNotice(''); setResults([]);
    // One stable ID per destination. Supabase retries cannot duplicate the message.
    const batch = parsed.map(recipient => ({ recipient, requestId: crypto.randomUUID() }));
    for (const item of batch) {
      try {
        const result = await ticketWhatsAppRequest<{ message: WhatsAppMessage; warning?: string }>({ action: 'send', ...item, mode, text, ticketId, consent, recentInbound });
        setResults(previous => [...previous, { recipient: item.recipient, status: result.message.error_message || whatsappStatusLabels[result.message.status] }]);
        if (result.warning) setNotice(result.warning);
        if (result.message.status === 'unknown' || result.message.status === 'sending') {
          setNotice('Se detuvo el grupo porque un envío quedó sin confirmar. Revisa el historial y consulta al destinatario antes de continuar.');
          break;
        }
      } catch (cause) {
        setResults(previous => [...previous, { recipient: item.recipient, status: (cause as Error).message }]);
        setNotice('Se detuvo el grupo. Los números restantes no se enviaron. Revisa el historial antes de preparar otro mensaje.');
        break;
      }
    }
    setDone(true); setBusy(false); sending.current = false;
    const logs = await ticketWhatsAppRequest<{ messages: WhatsAppMessage[] }>({ action: 'history' }).catch(() => null);
    if (logs) setHistory(logs.messages);
  };
  return <div className="tickets-wa__content">
    <div className="tickets-wa__heading"><div><h3>Mensajes de WhatsApp</h3><p>{config ? `${config.name} · ${config.sender}` : 'Conectando con WhatsApp…'}</p></div><button type="button" className="button-primary inactive" disabled={busy || loading} onClick={() => void refresh()}>Actualizar estado</button></div>
    <p>Envía a los números que indiques, con código de país. Para iniciar una conversación usa una plantilla aprobada; el texto libre requiere que la persona haya escrito en las últimas 24 horas.</p>
    {error && <p role="alert" className="tc-error">{error}</p>}
    <form onSubmit={event => { event.preventDefault(); void send(); }}>
      <fieldset disabled={busy || done || loading}>
        <div className="tickets-wa__grid">
          <div className="tickets-wa__fields">
            <label>Tipo de mensaje<select className="input-field" value={mode} onChange={event => { modeChosen.current = true; setMode(event.target.value as WhatsAppMode); setRecentInbound(false); }}><option value="contact">Iniciar contacto · plantilla</option><option value="text">Texto libre · conversación activa</option><option value="closure">Aviso de cierre de ticket</option></select></label>
            {mode === 'text' && config?.templates.contact.status === 'APPROVED' && <p className="tickets-wa__template">Para iniciar una conversación sin un mensaje reciente del cliente, selecciona «Iniciar contacto · plantilla».</p>}
            {mode !== 'text' && <p className="tickets-wa__template" role="status">Plantilla: {templateStatusLabels[templateState || ''] || templateState || 'Consultando…'}{mode === 'contact' && ' · Meta la clasifica como marketing y puede aplicar cargos o límites de entrega.'}</p>}
            {mode === 'closure' && <label>Ticket cerrado<select className="input-field" value={ticketId} onChange={event => setTicketId(event.target.value)}><option value="">Selecciona un ticket</option>{tickets.filter(ticket => ticket.estado === 'cerrado').map(ticket => <option key={ticket.id} value={ticket.id}>{ticket.numero_caso || ticket.id.slice(0, 8)} · {ticket.asunto}</option>)}</select></label>}
            <label>Números destinatarios<textarea className="input-field" rows={3} value={recipients} onChange={event => setRecipients(event.target.value)} placeholder={'+52 614 177 2897\n+52 …'} /></label>
            <small>Un número por línea, o separados por coma. Máximo 20 por envío; los repetidos se eliminan.</small>
            {recipients.trim() && <p role="status">{recipientError || `${parsed.length} destinatario${parsed.length === 1 ? '' : 's'}: ${parsed.join(', ')}`}</p>}
            {mode === 'text' && <><label>Mensaje<textarea className="input-field" rows={5} maxLength={4096} value={text} onChange={event => setText(event.target.value)} /></label><label className="tickets-wa__check"><input type="checkbox" checked={recentInbound} onChange={event => setRecentInbound(event.target.checked)} />Cada destinatario escribió a Orion en las últimas 24 horas.</label></>}
            <label className="tickets-wa__check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />Los destinatarios aceptaron recibir mensajes de Orion.</label>
          </div>
          <div className="tickets-wa__preview"><small>Vista previa</small><p>{preview || 'Escribe el mensaje para revisarlo antes de enviar.'}</p>{mode === 'closure' && <small>Este envío notifica un cierre ya registrado; no cambia el estado del ticket.</small>}</div>
        </div>
      </fieldset>
      {!done && !busy && blockers.length > 0 && <div id="ticket-whatsapp-requirements" role="status"><strong>Para habilitar Enviar:</strong><ul>{blockers.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}
      <div className="tickets-wa__actions"><button className="button-primary" type="submit" aria-describedby={!ready ? "ticket-whatsapp-requirements" : undefined} disabled={!ready || busy || done || loading}>{busy ? 'Enviando…' : `Enviar${parsed.length ? ` a ${parsed.length} número${parsed.length > 1 ? 's' : ''}` : ''}`}</button>{done && <button type="button" className="button-primary inactive" onClick={() => { setDone(false); setConsent(false); setRecentInbound(false); setResults([]); setNotice(''); }}>Preparar otro mensaje</button>}</div>
    </form>
    {results.length > 0 && <ul className="tickets-wa__results" aria-live="polite">{results.map(result => <li key={result.recipient}><strong>{result.recipient}</strong> · {result.status}</li>)}</ul>}
    {notice && <p role="status">{notice}</p>}
    <h4>Últimos envíos</h4><p className="tickets-wa__muted">“Aceptado por Meta” confirma la solicitud, no la entrega al teléfono. La confirmación de entrega automática aún no está conectada.</p>
    <div className="tickets-wa__history">{history.length ? history.map(message => <article key={message.id}><div><strong>+{message.recipient}</strong><span>{whatsappStatusLabels[message.status]}</span></div><small>{new Date(message.created_at).toLocaleString('es-MX')}</small><p>{message.body}</p>{message.error_message && <p className="tc-error">{message.error_message}</p>}</article>) : <p>Aún no hay envíos registrados desde este panel.</p>}</div>
  </div>;
}
