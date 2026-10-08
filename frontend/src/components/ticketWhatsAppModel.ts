import { normalizePhone } from '../../../supabase/functions/ticket-whatsapp/core.ts';
export function parseWhatsAppRecipients(raw: string): string[] {
  const values = raw.split(/[\n,;]+/).map(value => value.trim()).filter(Boolean);
  if (!values.length) throw new Error('Agrega al menos un destinatario.');
  const unique = [...new Set(values.map(normalizePhone))];
  if (unique.length > 20) throw new Error('Envía a un máximo de 20 números por grupo.');
  return unique.map(phone => `+${phone}`);
}
export const whatsappStatusLabels = { sending: 'En proceso · no repetir', accepted: 'Aceptado por Meta', failed: 'Rechazado', unknown: 'Sin confirmación · no repetir' };
export const templateStatusLabels: Record<string, string> = { APPROVED: 'Aprobada', PENDING: 'En revisión por Meta', REJECTED: 'Rechazada por Meta', PAUSED: 'Pausada por Meta', DISABLED: 'Deshabilitada por Meta', MISSING: 'No disponible' };
