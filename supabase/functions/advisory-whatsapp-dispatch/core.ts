// Pure parts of the advisory WhatsApp worker: templates, message bodies, phones (tested with Node).
export const LANGUAGE = 'es_MX';
export const NEW_TEMPLATE = 'orion_asesoria_nueva_v1';
export const MESSAGE_TEMPLATE = 'orion_asesoria_mensaje_v1';
export const ORION_URL = 'https://medinovacuu.github.io/orion';
export const advisoryLink = (advisoryId: string) => `${ORION_URL}/dashboard?tab=asesoria&advisory=${encodeURIComponent(advisoryId)}`;

const button = {
  type: 'BUTTONS',
  buttons: [{ type: 'URL', text: 'Abrir en Orion', url: `${ORION_URL}/dashboard?tab=asesoria&advisory={{1}}`, example: [`${ORION_URL}/dashboard?tab=asesoria&advisory=3f2b6c1e-8d4a-4b7e-9c21-5a6d7e8f9a0b`] }],
};
// Meta rejects bodies that start or end with a variable.
export const TEMPLATE_DEFINITIONS = [
  {
    name: NEW_TEMPLATE, language: LANGUAGE, category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: 'Nueva asesoría de {{1}} para {{2}}.\nCaso o equipo: {{3}}\nConsulta: {{4}}\n\nResponde a este mensaje para contestarle; tu respuesta queda registrada en Orion.',
        example: { body_text: [['Alfredo Ramírez', 'Ingeniería', '2J204N61 · 834000123', 'El rotor de muestras no centra después de cambiar la jeringa']] },
      },
      button,
    ],
  },
  {
    name: MESSAGE_TEMPLATE, language: LANGUAGE, category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: 'Mensaje de {{1}} en la asesoría {{2}}:\n\n{{3}}\n\nResponde a este mensaje para contestarle; queda registrado en Orion.',
        example: { body_text: [['Héctor Cortés', '2J204N61 · 834000123', 'Revisa el sello del rotor y vuelve a centrarlo con la herramienta.']] },
      },
      button,
    ],
  },
];

export interface AdvisoryAttachment { kind?: string; fileName?: string; mimeType?: string; size?: number; publicUrl?: string }
export interface AdvisoryJob {
  id: string; asesoria_id: string; event: 'new_advisory' | 'message'; message_id: string; recipient_id: string;
  recipient_name: string | null; recipient_phone: string | null; window_open: boolean; opted_out: boolean;
  area: string | null; requester_name: string | null; label: string | null; consulta: string | null;
  author_name: string | null; body: string | null; attachments: AdvisoryAttachment[] | null;
}

/** auth.users.phone → WhatsApp digits. Ten digits are Mexican; the old mobile «1» is dropped. */
export function staffPhone(value: string | null | undefined): string | null {
  let digits = (value || '').replace(/\D/g, '');
  if (/^\d{10}$/.test(digits)) digits = `52${digits}`;
  if (/^521\d{10}$/.test(digits)) digits = `52${digits.slice(3)}`;
  if (digits.startsWith('52') && digits.length !== 12) return null;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

const areaLabel = (area: string | null) => area === 'quimica' ? 'Química' : 'Ingeniería';
/** Template parameters: no line breaks, tabs or long runs of spaces, never empty. */
export function templateParam(value: string | null | undefined, max: number): string {
  const flat = (value || '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  if (!flat) return '—';
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
const clip = (value: string, max: number, advisoryId: string) => value.length <= max ? value : `${value.slice(0, max).trimEnd()}… (sigue en Orion: ${advisoryLink(advisoryId)})`;

const MEDIA_LIMITS: Record<string, number> = { image: 5 * 1024 * 1024, video: 16 * 1024 * 1024, audio: 16 * 1024 * 1024, document: 100 * 1024 * 1024 };
const IMAGE = /^image\/(jpeg|png)$/i, VIDEO = /^video\/(mp4|3gpp)$/i, AUDIO = /^audio\/(aac|amr|mpeg|mp4|ogg)/i;
function mediaType(attachment: AdvisoryAttachment): 'image' | 'video' | 'audio' | 'document' {
  const mime = attachment.mimeType || '';
  return IMAGE.test(mime) ? 'image' : VIDEO.test(mime) ? 'video' : AUDIO.test(mime) ? 'audio' : 'document';
}

/** Attachments that WhatsApp can fetch by link go as media (max 5); the rest are listed as links. */
export function splitAttachments(attachments: AdvisoryAttachment[] | null | undefined) {
  const media: Array<{ type: 'image' | 'video' | 'audio' | 'document'; attachment: AdvisoryAttachment }> = [];
  const links: AdvisoryAttachment[] = [];
  for (const attachment of attachments || []) {
    if (!attachment.publicUrl || !/^https:\/\//.test(attachment.publicUrl)) continue;
    const type = mediaType(attachment);
    if (media.length < 5 && (attachment.size || 0) <= MEDIA_LIMITS[type]) media.push({ type, attachment });
    else links.push(attachment);
  }
  return { media, links };
}

export function textBody(job: AdvisoryJob): string {
  if (job.event === 'new_advisory') {
    return [
      `*Nueva asesoría de ${job.requester_name || 'un compañero'}* (${areaLabel(job.area)})`,
      `Caso o equipo: ${job.label || 'sin ticket'}`,
      `Consulta: ${clip((job.consulta || '').trim() || '—', 2500, job.asesoria_id)}`,
      '',
      'Responde a este mensaje para contestarle; tu respuesta queda registrada en Orion.',
      advisoryLink(job.asesoria_id),
    ].join('\n');
  }
  const { links } = splitAttachments(job.attachments);
  return [
    `*${job.author_name || 'Orion'}* · asesoría ${job.label || 'sin ticket'}`,
    clip((job.body || '').trim(), 3200, job.asesoria_id),
    ...links.map(item => `📎 ${item.fileName || 'Archivo'}: ${item.publicUrl}`),
  ].join('\n');
}

export function templatePayload(job: AdvisoryJob, to: string) {
  const attachments = (job.attachments || []).length;
  const parameters = job.event === 'new_advisory'
    ? [templateParam(job.requester_name, 80), areaLabel(job.area), templateParam(job.label, 120), templateParam(job.consulta, 500)]
    : [templateParam(job.author_name, 80), templateParam(job.label, 120),
      templateParam(`${job.body || ''}${attachments ? ` (+${attachments} archivo${attachments === 1 ? '' : 's'} en Orion)` : ''}`, 700)];
  return {
    messaging_product: 'whatsapp', to, type: 'template',
    template: {
      name: job.event === 'new_advisory' ? NEW_TEMPLATE : MESSAGE_TEMPLATE, language: { code: LANGUAGE },
      components: [
        { type: 'body', parameters: parameters.map(text => ({ type: 'text', text })) },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: job.asesoria_id }] },
      ],
    },
  };
}

export function textPayloads(job: AdvisoryJob, to: string) {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };
  const media = job.event === 'message' ? splitAttachments(job.attachments).media : [];
  return [
    { ...base, type: 'text', text: { preview_url: false, body: textBody(job) } },
    ...media.map(({ type, attachment }) => ({
      ...base, type,
      [type]: { link: attachment.publicUrl, ...(type === 'document' ? { filename: attachment.fileName || 'archivo' } : {}) },
    })),
  ];
}
