export const CONTACT_TEMPLATE = 'orion_contacto_soporte_v1';
export const CLOSURE_TEMPLATE = 'orion_cierre_ticket_v1';
export const LANGUAGE = 'es_MX';
export const CONTACT_TEXT = 'Hola, te contactamos de Orion-Biosystems para iniciar comunicación por WhatsApp. Si deseas que te atendamos por este medio, responde a este mensaje.';
export const CONTACT_FOOTER = 'Si no deseas recibir mensajes, responde BAJA.';

export class InputError extends Error {}
export function normalizePhone(value: unknown): string {
  if (typeof value !== 'string' || !/^\+?[\d\s().-]+$/.test(value.trim())) throw new InputError('Escribe un teléfono con código de país, sin extensiones.');
  let phone = value.replace(/\D/g, '');
  // Mexican numbers are stored canonically as +52 and ten digits. Meta may return +521.
  if (/^521\d{10}$/.test(phone)) phone = `52${phone.slice(3)}`;
  if (!/^[1-9]\d{7,14}$/.test(phone) || (phone.startsWith('52') && phone.length !== 12)) throw new InputError('Teléfono inválido. Para México usa +52 y diez dígitos.');
  if (!value.trim().startsWith('+')) throw new InputError('Incluye + y el código de país en cada número.');
  return phone;
}
export interface SendInput { requestId: string; recipient: string; mode: 'text' | 'contact' | 'closure'; text: string; ticketId: string | null }
export function validateInput(raw: Record<string, unknown>): SendInput {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (typeof raw.requestId !== 'string' || !uuid.test(raw.requestId)) throw new InputError('Identificador de envío inválido.');
  if (raw.consent !== true) throw new InputError('Confirma que el destinatario aceptó recibir mensajes.');
  if (!['text', 'contact', 'closure'].includes(String(raw.mode))) throw new InputError('Tipo de mensaje inválido.');
  const mode = raw.mode as SendInput['mode'];
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  if (mode === 'text' && (text.length < 1 || text.length > 4096)) throw new InputError('Escribe entre 1 y 4096 caracteres.');
  if (mode === 'text' && raw.recentInbound !== true) throw new InputError('El texto libre requiere un mensaje del destinatario en las últimas 24 horas.');
  if (mode === 'closure' && (typeof raw.ticketId !== 'string' || !uuid.test(raw.ticketId))) throw new InputError('Selecciona un ticket cerrado.');
  return { requestId: raw.requestId, recipient: normalizePhone(raw.recipient), mode, text: mode === 'text' ? text : '', ticketId: mode === 'closure' ? raw.ticketId as string : null };
}
export interface TicketSummary { id: string; estado: string; numero_caso: string | null; numero_serie_equipo: string | null }
export function closureText(ticket: TicketSummary): string {
  return `Te informamos que el ticket ${ticket.numero_caso || ticket.id} de Orion-Biosystems ha sido cerrado. Equipo: ${ticket.numero_serie_equipo || 'Sin serie registrada'}. Para solicitar seguimiento, responde a este mensaje.`;
}
export function buildMessage(input: SendInput, templateStatus?: string, ticket?: TicketSummary | null) {
  const common = { messaging_product: 'whatsapp', recipient_type: 'individual', to: input.recipient };
  if (input.mode === 'text') return { body: input.text, payload: { ...common, type: 'text', text: { preview_url: false, body: input.text } } };
  if (templateStatus !== 'APPROVED') throw new InputError('Meta todavía no ha aprobado esta plantilla. Actualiza el estado antes de enviar.');
  if (input.mode === 'closure' && (!ticket || ticket.estado !== 'cerrado' || ticket.id !== input.ticketId)) throw new InputError('Solo se puede notificar el cierre de un ticket cerrado.');
  const parameters = ticket ? [ticket.numero_caso || ticket.id, ticket.numero_serie_equipo || 'Sin serie registrada'] : [];
  return {
    body: input.mode === 'contact' ? `${CONTACT_TEXT}\n${CONTACT_FOOTER}` : closureText(ticket!),
    payload: { ...common, type: 'template', template: {
      name: input.mode === 'contact' ? CONTACT_TEMPLATE : CLOSURE_TEMPLATE, language: { code: LANGUAGE },
      ...(input.mode === 'closure' ? { components: [{ type: 'body', parameters: parameters.map(text => ({ type: 'text', text })) }] } : {}),
    } },
  };
}
export function metaErrorMessage(code: number | undefined): string {
  const messages: Record<number, string> = {
    190: 'El token de WhatsApp venció o dejó de ser válido. Administración debe actualizarlo.',
    10: 'El token no tiene permiso para enviar desde esta cuenta.',
    131026: 'WhatsApp no pudo entregar el mensaje. Verifica el número y que tenga WhatsApp.',
    131047: 'La ventana de 24 horas terminó. Usa una plantilla aprobada o pide al destinatario que escriba primero.',
    131042: 'Meta requiere revisar la configuración de pago de la cuenta.',
    131048: 'Meta limitó temporalmente los envíos de esta cuenta.',
    131049: 'Meta no entregó esta plantilla por sus límites de mensajes al destinatario.',
    131058: 'Esta plantilla solo está disponible para números de prueba de Meta.',
    132001: 'La plantilla o su idioma no están disponibles en esta cuenta.',
    133010: 'El número emisor no está registrado.',
  };
  return messages[code || 0] || `Meta rechazó el envío${code ? ` (código ${code})` : ''}. Revisa la cuenta en WhatsApp Manager.`;
}
