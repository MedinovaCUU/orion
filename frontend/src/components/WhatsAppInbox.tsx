import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { whatsappInboxApi, type WhatsAppInboxApi } from './whatsappInboxApi';
import {
  automaticNotice, conversationPreview, deliveryLabel, formatPhone, formatRemaining, groupByDay, inboundState, initials, kindLabel,
  listTimeLabel, mapsUrl, matchesSearch, replyWindow, ticketStateLabels, timeLabel,
  type InboundStatus, type WhatsAppConversation, type WhatsAppThread, type WhatsAppThreadMessage,
} from './whatsappInboxModel';
import { PanelLoader } from './OrionLoader';
import './WhatsAppInbox.css';

const REFRESH_MS = 30000;

const displayName = (conversation: { display_name: string | null; phone: string }) => conversation.display_name || formatPhone(conversation.phone);

function InboundConnection({ status, busy, error, onConnect }: { status: InboundStatus | null | undefined; busy: boolean; error: string; onConnect: () => void }) {
  if (status === undefined) return null;
  const state = inboundState(status);
  const copy = {
    connected: 'Recepción conectada a Orion',
    'app-default': 'Meta usa la dirección general de su app para este número',
    elsewhere: 'Meta envía los mensajes de este número a otro sistema',
    unsubscribed: 'Meta no está enviando los mensajes de este número',
    unknown: 'No se pudo consultar en Meta a dónde llegan los mensajes',
  }[state];
  const canConnect = state !== 'connected' && state !== 'unknown';
  return (
    <div className={`wa-inbox__connection wa-inbox__connection--${state}`} role="status">
      <span className="wa-inbox__connection-dot" aria-hidden="true" />
      <span>{copy}</span>
      {canConnect && (
        <button type="button" className="button-primary inactive wa-inbox__connect" disabled={busy || !status?.secretConfigured} onClick={onConnect}
          title={status?.secretConfigured ? 'Pedir a Meta que envíe a Orion los mensajes de este número' : 'Primero hay que guardar WHATSAPP_APP_SECRET en Supabase'}>
          {busy ? 'Conectando…' : 'Conectar a Orion'}
        </button>
      )}
      {canConnect && status && !status.secretConfigured && <small>Falta la clave secreta de la app de Meta en Supabase (WHATSAPP_APP_SECRET).</small>}
      {error && <small className="wa-inbox__error">{error}</small>}
    </div>
  );
}

function MediaContent({ message, url }: { message: WhatsAppThreadMessage; url: string | undefined }) {
  const label = kindLabel(message.kind);
  if (!url) {
    return <p className="wa-inbox__media-note">{message.media_error ? `${label} no disponible: ${message.media_error}` : message.media_path ? `${label}: cargando…` : `${label}: descargando de WhatsApp…`}</p>;
  }
  if (message.kind === 'image' || message.kind === 'sticker') {
    return <a className={`wa-inbox__image${message.kind === 'sticker' ? ' is-sticker' : ''}`} href={url} target="_blank" rel="noreferrer"><img src={url} alt={message.body || `${label} enviada por el cliente`} loading="lazy" /></a>;
  }
  if (message.kind === 'audio') return <audio className="wa-inbox__audio" controls preload="none" src={url} />;
  if (message.kind === 'video') return <video className="wa-inbox__video" controls preload="metadata" src={url} />;
  return <a className="wa-inbox__file" href={url} target="_blank" rel="noreferrer"><span aria-hidden="true">📄</span>{message.media_filename || label}</a>;
}

function Bubble({ message, quoted, mediaUrl }: { message: WhatsAppThreadMessage; quoted: WhatsAppThreadMessage | undefined; mediaUrl: string | undefined }) {
  if (message.kind === 'reaction') {
    return <p className="wa-inbox__reaction">{message.body ? `Reaccionó ${message.body}` : 'Quitó su reacción'}{quoted ? ` a «${(quoted.body || automaticNotice(quoted.template, quoted.parameters).title).slice(0, 60)}»` : ''} · {timeLabel(message.at)}</p>;
  }
  const isAuto = message.source === 'auto';
  const notice = isAuto ? automaticNotice(message.template, message.parameters) : null;
  const delivery = message.direction === 'out' ? deliveryLabel(message) : null;
  const hasMedia = ['image', 'sticker', 'audio', 'video', 'document'].includes(message.kind) && message.direction === 'in';
  const link = message.kind === 'location' ? mapsUrl(message.extra) : null;
  return (
    <article className={`wa-inbox__bubble wa-inbox__bubble--${message.direction}${isAuto ? ' is-auto' : ''}`}>
      {quoted && <blockquote>{quoted.body || (quoted.template ? automaticNotice(quoted.template, quoted.parameters).title : kindLabel(quoted.kind))}</blockquote>}
      {notice && <p className="wa-inbox__notice"><strong>Aviso automático · {notice.title}</strong><span>{notice.detail}</span></p>}
      {message.source === 'manual' && message.kind !== 'text' && <p className="wa-inbox__notice"><strong>Plantilla · {kindLabel(message.kind)}</strong></p>}
      {hasMedia && <MediaContent message={message} url={mediaUrl} />}
      {message.kind === 'unsupported' && <p className="wa-inbox__media-note">WhatsApp no pudo mostrar este mensaje (por ejemplo, una encuesta o un mensaje temporal). Pídele al cliente que lo reenvíe como texto.</p>}
      {message.body && !isAuto && <p className="wa-inbox__text">{message.body}</p>}
      {link && <a className="wa-inbox__file" href={link} target="_blank" rel="noreferrer"><span aria-hidden="true">📍</span>Abrir en el mapa</a>}
      <footer>
        {message.author && <span>{message.author}</span>}
        <time dateTime={message.at}>{timeLabel(message.at)}</time>
        {delivery && <span className={`wa-inbox__delivery is-${delivery.tone}`}>{delivery.label}</span>}
      </footer>
      {message.direction === 'out' && delivery?.tone === 'error' && message.error_message && <p className="wa-inbox__bubble-error">{message.error_message}</p>}
    </article>
  );
}

export default function WhatsAppInbox({ api = whatsappInboxApi, onOpenTicket }: { api?: WhatsAppInboxApi; onOpenTicket?: (ticketId: string) => void }) {
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<WhatsAppThread | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState('');
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sendNotice, setSendNotice] = useState<{ tone: 'error' | 'warn'; text: string } | null>(null);
  const [linking, setLinking] = useState(false);
  const [inbound, setInbound] = useState<InboundStatus | null | undefined>(undefined);
  const [inboundBusy, setInboundBusy] = useState(false);
  const [inboundError, setInboundError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const selectedRef = useRef<string | null>(null);
  const mediaRef = useRef<Record<string, string>>({});
  const requestIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const refreshTimer = useRef<number | null>(null);

  const loadList = useCallback(async () => {
    try { setConversations(await api.listConversations()); setListError(''); }
    catch (error) { setListError(error instanceof Error ? error.message : 'No se pudo cargar la bandeja de WhatsApp.'); }
    finally { setLoading(false); }
  }, [api]);

  const loadThread = useCallback(async (id: string, quiet = false) => {
    if (!quiet) { setThreadLoading(true); setThreadError(''); }
    try {
      const next = await api.loadThread(id);
      if (selectedRef.current !== id) return;
      setThread(next);
      setThreadError('');
      const missing = [...new Set(next.messages.map(message => message.media_path).filter((path): path is string => Boolean(path) && !mediaRef.current[path!]))];
      if (missing.length) {
        const urls = await api.mediaUrls(missing);
        mediaRef.current = { ...mediaRef.current, ...urls };
        setMediaUrls(mediaRef.current);
      }
      if (document.visibilityState === 'visible') {
        await api.markRead(id);
        setConversations(list => list.map(item => item.id === id ? { ...item, unread: 0 } : item));
      }
    } catch (error) {
      if (selectedRef.current === id) setThreadError(error instanceof Error ? error.message : 'No se pudo cargar la conversación.');
    } finally {
      if (!quiet && selectedRef.current === id) setThreadLoading(false);
    }
  }, [api]);

  // Realtime fires once per row; batch the bursts of a single incoming message.
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      void loadList();
      if (selectedRef.current) void loadThread(selectedRef.current, true);
    }, 400);
  }, [loadList, loadThread]);

  useEffect(() => {
    void loadList();
    const unsubscribe = api.subscribe(scheduleRefresh);
    const poll = window.setInterval(() => { if (document.visibilityState === 'visible') scheduleRefresh(); }, REFRESH_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 30000);
    // Messages that arrived while the tab was hidden are marked read when the user comes back.
    const onVisible = () => { if (document.visibilityState === 'visible') scheduleRefresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { unsubscribe(); window.clearInterval(poll); window.clearInterval(clock); document.removeEventListener('visibilitychange', onVisible); if (refreshTimer.current) window.clearTimeout(refreshTimer.current); };
  }, [api, loadList, scheduleRefresh]);

  useEffect(() => {
    let alive = true;
    api.inboundStatus().then(status => { if (alive) setInbound(status); }).catch(() => { if (alive) setInbound(null); });
    return () => { alive = false; };
  }, [api]);

  // Follow the newest message (also when photos finish loading) unless the user scrolled up to read.
  const hasThread = Boolean(thread);
  useEffect(() => {
    const element = scrollRef.current;
    const content = element?.firstElementChild;
    if (!element || !content) return;
    const follow = () => { if (stickToBottom.current) element.scrollTop = element.scrollHeight; };
    follow();
    const observer = new ResizeObserver(follow);
    observer.observe(content);
    return () => observer.disconnect();
  }, [selectedId, hasThread]);
  const messages = thread?.messages;

  const select = (id: string) => {
    if (id === selectedRef.current) return;
    selectedRef.current = id;
    requestIdRef.current = null;
    stickToBottom.current = true;
    setSelectedId(id); setThread(null); setSendNotice(null);
    void loadThread(id);
  };
  const back = () => { selectedRef.current = null; setSelectedId(null); setThread(null); };

  const conversation = thread?.conversation;
  const draft = selectedId ? drafts[selectedId] || '' : '';
  const window24 = replyWindow(conversation?.last_inbound_at, now);
  const byProviderId = useMemo(() => new Map((messages || []).filter(message => message.provider_message_id).map(message => [message.provider_message_id!, message])), [messages]);
  const visible = useMemo(() => conversations.filter(item => matchesSearch(item, query)), [conversations, query]);

  const setDraft = (text: string) => {
    if (!selectedId) return;
    requestIdRef.current = null; // an edited message is a new message
    setDrafts(current => ({ ...current, [selectedId]: text }));
  };

  const send = async () => {
    const id = selectedRef.current;
    const text = draft.trim();
    if (!id || !text || sending) return;
    // The same id on a retry returns the stored result instead of sending twice.
    const requestId = requestIdRef.current ||= crypto.randomUUID();
    setSending(true); setSendNotice(null);
    try {
      const result = await api.reply(id, text, requestId);
      requestIdRef.current = null;
      if (result.message.status === 'failed') {
        setSendNotice({ tone: 'error', text: result.message.error_message || 'Meta rechazó el mensaje.' });
      } else {
        setDrafts(current => ({ ...current, [id]: '' }));
        if (result.message.status === 'unknown' || result.warning) setSendNotice({ tone: 'warn', text: result.warning || result.message.error_message || 'Meta no confirmó el envío. Revisa la conversación antes de repetirlo.' });
      }
    } catch (error) {
      setSendNotice({ tone: 'error', text: error instanceof Error && error.message ? error.message : 'No se pudo enviar. Revisa la conversación antes de reenviar.' });
    } finally {
      setSending(false);
      void loadThread(id, true); void loadList();
    }
  };
  const onComposerKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send(); }
  };

  const link = async (ticketId: string) => {
    if (!selectedId) return;
    setLinking(true);
    try { await api.linkTicket(selectedId, ticketId || null); await Promise.all([loadThread(selectedId, true), loadList()]); }
    catch (error) { setThreadError(error instanceof Error ? error.message : 'No se pudo ligar el ticket.'); }
    finally { setLinking(false); }
  };

  const connect = async () => {
    if (!window.confirm('Meta enviará a Orion los mensajes que escriban a este número. Si hoy llegan a otro sistema, dejarán de llegar ahí. ¿Conectar?')) return;
    setInboundBusy(true); setInboundError('');
    try { await api.connectInbound(); setInbound(await api.inboundStatus()); }
    catch (error) { setInboundError(error instanceof Error ? error.message : 'No se pudo conectar.'); }
    finally { setInboundBusy(false); }
  };

  return (
    <section className="wa-inbox" aria-label="WhatsApp de Orion">
      <header className="wa-inbox__header">
        <div>
          <h3>WhatsApp</h3>
          <p>Lo que los clientes escriben al número de Orion. Puedes contestar durante 24 horas después de su último mensaje.</p>
        </div>
        <InboundConnection status={inbound} busy={inboundBusy} error={inboundError} onConnect={() => void connect()} />
      </header>

      <div className="wa-inbox__body" data-pane={selectedId ? 'thread' : 'list'}>
        <aside className="wa-inbox__list" aria-label="Conversaciones">
          <input className="input-field wa-inbox__search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar nombre, teléfono o caso" aria-label="Buscar conversación" />
          {loading ? <PanelLoader title="Cargando conversaciones…" /> : listError ? <p className="wa-inbox__error">{listError}</p> : !conversations.length ? (
            <p className="wa-inbox__empty">Aún no han llegado mensajes. Cuando un cliente escriba al WhatsApp de Orion, aparecerá aquí.</p>
          ) : !visible.length ? <p className="wa-inbox__empty">Ninguna conversación coincide.</p> : (
            <ul>
              {visible.map(item => (
                <li key={item.id}>
                  <button type="button" className={`wa-inbox__item${item.id === selectedId ? ' is-active' : ''}${item.unread ? ' has-unread' : ''}`} onClick={() => select(item.id)} aria-current={item.id === selectedId ? 'true' : undefined}>
                    <span className="wa-inbox__avatar" aria-hidden="true">{initials(item.display_name, item.phone)}</span>
                    <span className="wa-inbox__item-main">
                      <span className="wa-inbox__item-top"><strong>{displayName(item)}</strong><time>{listTimeLabel(item.last_message_at, new Date(now))}</time></span>
                      <span className="wa-inbox__item-preview">{conversationPreview(item)}</span>
                      <span className="wa-inbox__item-tags">
                        {item.numero_caso && <span className="wa-inbox__tag">{item.numero_caso}</span>}
                        {!item.is_ticket_line && <span className="wa-inbox__tag">Otro número</span>}
                        {item.opted_out && <span className="wa-inbox__tag is-warn">BAJA</span>}
                        {item.unread > 0 && <span className="wa-inbox__unread" aria-label={`${item.unread} sin leer`}>{item.unread}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="wa-inbox__thread" aria-label="Conversación">
          {!selectedId ? <p className="wa-inbox__placeholder">Elige una conversación para leerla y contestar.</p> : threadLoading && !thread ? <PanelLoader title="Abriendo conversación…" /> : threadError && !thread ? <p className="wa-inbox__error">{threadError}</p> : thread && conversation ? (
            <>
              <header className="wa-inbox__thread-header">
                <button type="button" className="wa-inbox__back" onClick={back} aria-label="Volver a las conversaciones">‹</button>
                <span className="wa-inbox__avatar" aria-hidden="true">{initials(conversation.display_name, conversation.phone)}</span>
                <div className="wa-inbox__who">
                  <strong>{displayName(conversation)}</strong>
                  <span>{formatPhone(conversation.phone)}{conversation.display_name ? ' · nombre de su perfil de WhatsApp' : ''}</span>
                </div>
                {conversation.is_ticket_line && (
                  <div className="wa-inbox__ticket">
                    <label>
                      <span>Ticket</span>
                      <select className="input-field" value={conversation.ticket_id || ''} disabled={linking} onChange={event => void link(event.target.value)}>
                        <option value="">Sin ticket</option>
                        {thread.tickets.map(ticket => (
                          <option key={ticket.id} value={ticket.id}>{ticket.numero_caso || 'Sin folio'} · {ticketStateLabels[ticket.estado] || ticket.estado}{ticket.asunto ? ` · ${ticket.asunto.slice(0, 48)}` : ''}</option>
                        ))}
                      </select>
                    </label>
                    {conversation.ticket_id && onOpenTicket && <button type="button" className="button-primary inactive" onClick={() => onOpenTicket(conversation.ticket_id!)}>Abrir ticket</button>}
                  </div>
                )}
              </header>
              {conversation.opted_out && (
                <p className="wa-inbox__banner is-warn">Respondió BAJA{conversation.opted_out_at ? ` el ${new Date(conversation.opted_out_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}` : ''}. Ya no recibe avisos automáticos ni plantillas. Si escribe ALTA, se reactivan.</p>
              )}
              {threadError && <p className="wa-inbox__error">{threadError}</p>}
              <div className="wa-inbox__messages" ref={scrollRef} onScroll={event => {
                const element = event.currentTarget;
                stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
              }}>
                <div className="wa-inbox__messages-content">
                {groupByDay(thread.messages, new Date(now)).map(group => (
                  <div key={group.day} className="wa-inbox__day">
                    <p className="wa-inbox__day-label"><span>{group.day}</span></p>
                    {group.items.map(message => (
                      <Bubble key={`${message.source}-${message.id}`} message={message} mediaUrl={message.media_path ? mediaUrls[message.media_path] : undefined}
                        quoted={message.context_message_id ? byProviderId.get(message.context_message_id) : undefined} />
                    ))}
                  </div>
                ))}
                </div>
              </div>
              <footer className="wa-inbox__composer">
                {!conversation.is_ticket_line ? (
                  <p className="wa-inbox__banner">Este mensaje llegó a otro número de WhatsApp de la empresa, no al de tickets. Contéstalo desde ese número.</p>
                ) : window24.open ? (
                  <>
                    <textarea className="input-field" rows={3} maxLength={4096} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={onComposerKey}
                      placeholder="Escribe tu respuesta…" aria-label="Respuesta" disabled={sending} />
                    <div className="wa-inbox__composer-bar">
                      <small>Puedes responder durante {formatRemaining(window24.remainingMs)} más · ⌘/Ctrl + Enter para enviar</small>
                      <button type="button" className="button-primary" disabled={sending || !draft.trim()} onClick={() => void send()}>{sending ? 'Enviando…' : 'Enviar'}</button>
                    </div>
                  </>
                ) : (
                  <p className="wa-inbox__banner">Pasaron más de 24 horas desde su último mensaje{window24.closesAt ? ` (la ventana cerró ${window24.closesAt.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })})` : ''}. WhatsApp solo permite escribirle con una plantilla aprobada; cuando vuelva a escribir, podrás contestar aquí.</p>
                )}
                {sendNotice && <p className={`wa-inbox__send-notice is-${sendNotice.tone}`} role="alert">{sendNotice.text}</p>}
              </footer>
            </>
          ) : null}
        </section>
      </div>
    </section>
  );
}
