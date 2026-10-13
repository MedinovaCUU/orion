// Pure parts of the Meta webhook: signature, payload parsing, media names. No Deno APIs (tested with Node).
export const MEDIA_LIMIT_BYTES = 25 * 1024 * 1024;
export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';
export interface InboundEvent {
  businessPhoneId: string; phone: string; name: string | null; waMessageId: string; kind: string;
  body: string | null; extra: Record<string, unknown> | null; mediaId: string | null; mediaMime: string | null;
  mediaFilename: string | null; contextMessageId: string | null; sentAt: string;
}
export interface StatusEvent { waMessageId: string; status: DeliveryStatus; at: string; error: string | null }

type Json = Record<string, unknown>;
const obj = (value: unknown): Json | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : null;
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const str = (value: unknown, max = 8000): string | null => typeof value === 'string' && value.trim() ? value.slice(0, max) : null;
const MEDIA_KINDS = new Set(['image', 'audio', 'video', 'document', 'sticker']);
const STATUSES = new Set<DeliveryStatus>(['sent', 'delivered', 'read', 'failed']);

/** Meta's wa_id → the canonical digits Orion stores (Mexico: 52 + ten digits, without the old mobile 1). */
export function waIdToPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let digits = value.replace(/\D/g, '');
  if (/^521\d{10}$/.test(digits)) digits = `52${digits.slice(3)}`;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

function timestamp(value: unknown): string {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
}

function messageEvent(raw: Json, businessPhoneId: string, names: Map<string, string>): InboundEvent | null {
  const phone = waIdToPhone(raw.from);
  const waMessageId = str(raw.id, 200);
  if (!phone || !waMessageId) return null;
  const type = typeof raw.type === 'string' ? raw.type.toLowerCase() : '';
  const kind = /^[a-z_]{1,32}$/.test(type) ? type : 'unsupported';
  const event: InboundEvent = {
    businessPhoneId, phone, name: names.get(String(raw.from)) || null, waMessageId, kind, body: null, extra: null,
    mediaId: null, mediaMime: null, mediaFilename: null, contextMessageId: str(obj(raw.context)?.id, 200), sentAt: timestamp(raw.timestamp),
  };
  const part = obj(raw[kind]);
  if (kind === 'text') event.body = str(part?.body);
  else if (MEDIA_KINDS.has(kind)) {
    event.mediaId = str(part?.id, 200);
    event.mediaMime = str(part?.mime_type, 200);
    event.mediaFilename = str(part?.filename, 255);
    event.body = str(part?.caption);
    if (kind === 'audio' && part?.voice === true) event.extra = { voice: true };
  } else if (kind === 'location') {
    const latitude = Number(part?.latitude), longitude = Number(part?.longitude);
    event.extra = { latitude: Number.isFinite(latitude) ? latitude : null, longitude: Number.isFinite(longitude) ? longitude : null, name: str(part?.name, 300), address: str(part?.address, 500) };
    event.body = [str(part?.name, 300), str(part?.address, 500)].filter(Boolean).join(' · ') || null;
  } else if (kind === 'contacts') {
    const contacts = list(raw.contacts).map(obj).filter(Boolean).slice(0, 10).map(contact => ({
      name: str(obj(contact!.name)?.formatted_name, 200),
      phones: list(contact!.phones).map(item => str(obj(item)?.phone, 40)).filter(Boolean),
    }));
    event.extra = { contacts };
    event.body = contacts.map(contact => [contact.name, ...contact.phones].filter(Boolean).join(' ')).join('\n') || null;
  } else if (kind === 'button') {
    event.body = str(part?.text, 1000);
    event.extra = { payload: str(part?.payload, 1000) };
  } else if (kind === 'interactive') {
    const reply = obj(part?.button_reply) || obj(part?.list_reply);
    event.body = str(reply?.title, 1000);
    event.extra = { id: str(reply?.id, 300), description: str(reply?.description, 1000) };
  } else if (kind === 'reaction') {
    // An empty emoji means the customer removed the reaction.
    event.body = str(part?.emoji, 40);
    event.contextMessageId = str(part?.message_id, 200);
  } else if (kind === 'system') event.body = str(part?.body);
  else {
    const errors = list(raw.errors).map(item => str(obj(item)?.title, 300) || str(obj(item)?.message, 300)).filter(Boolean);
    event.kind = kind === 'order' ? 'order' : 'unsupported';
    event.extra = errors.length ? { errors } : null;
  }
  return event;
}

function statusEvent(raw: Json): StatusEvent | null {
  const waMessageId = str(raw.id, 200);
  const status = raw.status as DeliveryStatus;
  if (!waMessageId || !STATUSES.has(status)) return null;
  const error = obj(list(raw.errors)[0]);
  const detail = error ? [error.code, str(error.title, 300), str(obj(error.error_data)?.details, 500)].filter(Boolean).join(' · ') : null;
  return { waMessageId, status, at: timestamp(raw.timestamp), error: detail };
}

export function parseWebhook(payload: unknown): { messages: InboundEvent[]; statuses: StatusEvent[] } {
  const messages: InboundEvent[] = [], statuses: StatusEvent[] = [];
  for (const entry of list(obj(payload)?.entry)) {
    for (const change of list(obj(entry)?.changes)) {
      const value = obj(obj(change)?.value);
      if (obj(change)?.field !== 'messages' || !value) continue;
      const businessPhoneId = String(obj(value.metadata)?.phone_number_id || '');
      if (!/^\d{1,32}$/.test(businessPhoneId)) continue;
      const names = new Map<string, string>();
      for (const contact of list(value.contacts)) {
        const waId = obj(contact)?.wa_id, name = str(obj(obj(contact)?.profile)?.name, 200);
        if (typeof waId === 'string' && name) names.set(waId, name);
      }
      for (const message of list(value.messages)) {
        const event = obj(message) && messageEvent(obj(message)!, businessPhoneId, names);
        if (event) messages.push(event);
      }
      for (const status of list(value.statuses)) {
        const event = obj(status) && statusEvent(obj(status)!);
        if (event) statuses.push(event);
      }
    }
  }
  return { messages, statuses };
}

const hex = (bytes: Uint8Array) => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');

/** X-Hub-Signature-256 = HMAC-SHA256(raw body, App Secret). Several secrets allowed (one per Meta app). */
export async function verifySignature(raw: Uint8Array<ArrayBuffer>, header: string | null, secrets: string[]): Promise<boolean> {
  const match = /^sha256=([0-9a-f]{64})$/i.exec(header?.trim() || '');
  if (!match) return false;
  const expected = match[1].toLowerCase();
  let valid = false;
  for (const secret of secrets) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const actual = hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, raw)));
    let diff = 0;
    for (let index = 0; index < 64; index += 1) diff |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
    valid ||= diff === 0;
  }
  return valid;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'application/pdf': 'pdf', 'text/plain': 'txt',
  'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};
export function mediaExtension(mime: string | null): string {
  return EXTENSIONS[(mime || '').split(';')[0].trim().toLowerCase()] || 'bin';
}
