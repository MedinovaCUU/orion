const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

interface SparePartRequestLine {
  code: string;
  description: string;
  quantity: number;
  equipmentFamily?: string;
  notes?: string;
}

interface SparePartRequestEmailPayload {
  requestId: string;
  engineerName: string;
  employeeNumber: string;
  engineerPhone?: string;
  ticketReference?: string;
  equipmentSerial?: string;
  equipmentModel?: string;
  clientName?: string;
  clientContact?: string;
  clientPhone?: string;
  siteAddress?: string;
  destinationCity?: string;
  destinationState?: string;
  priority?: string;
  neededByDate?: string;
  destinationMode?: string;
  destinationDetail?: string;
  reason?: string;
  observations?: string;
  items: SparePartRequestLine[];
}

const THEME = {
  pageBg:
    'radial-gradient(circle at top right, rgba(188, 17, 43, 0.26) 0%, rgba(188, 17, 43, 0) 28%), linear-gradient(160deg, #050608 0%, #121417 42%, #1d2025 100%)',
  shellBg: 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(245,247,249,0.98) 100%)',
  shellBorder: 'rgba(255,255,255,0.18)',
  heroStart: '#040507',
  heroMid: '#1b1f25',
  heroEnd: '#8f1027',
  cardBg: 'linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(241,244,247,0.78) 100%)',
  cardBorder: 'rgba(183,190,200,0.78)',
  fieldBg: 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(245,247,249,0.9) 100%)',
  fieldBorder: 'rgba(205,212,221,0.95)',
  fieldLabel: '#68707d',
  textPrimary: '#111318',
  textMuted: '#5f6672',
  brandTintBg: 'linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(236,239,243,0.9) 100%)',
  brandTintText: '#8f1027',
  neutralChipBg: 'linear-gradient(180deg, #f7f8fa 0%, #e9edf1 100%)',
  neutralChipText: '#2d3138',
  link: '#a50f2a',
  dangerBg: 'linear-gradient(180deg, #c51331 0%, #8a0a21 100%)',
  dangerText: '#ffffff',
  darkGlassBg: 'linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.08) 100%)',
  darkGlassBorder: 'rgba(255,255,255,0.22)',
  sheen: 'linear-gradient(135deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.08) 42%, rgba(255,255,255,0.02) 100%)',
};

const PRIORITY_STYLES: Record<string, { label: string; accent: string; bg: string }> = {
  baja: { label: 'Baja', accent: '#49515c', bg: 'linear-gradient(180deg, #f5f6f7 0%, #e8ebef 100%)' },
  media: { label: 'Media', accent: '#6f0f1f', bg: 'linear-gradient(180deg, #f9eef1 0%, #f1dde3 100%)' },
  alta: { label: 'Alta', accent: '#8a1024', bg: 'linear-gradient(180deg, #f7e4e8 0%, #edc9d1 100%)' },
  critica: { label: 'Critica', accent: '#ffffff', bg: 'linear-gradient(180deg, #b40f2b 0%, #7f071c 100%)' },
};

const DESTINATION_LABELS: Record<string, string> = {
  sitio: 'Entregar en sitio',
  ingeniero: 'Entregar al ingeniero',
  almacen: 'Entregar en almacén',
};

const jsonRes = (status: number, payload?: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(payload ?? {}), {
    status,
    headers: {
      ...corsHeaders,
      ...(status === 204 ? {} : { 'Content-Type': 'application/json' }),
    },
  });

const normStr = (value: unknown) => String(value ?? '').trim();

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const formatDate = (value: string) => {
  if (!value) return 'Sin definir';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return escapeHtml(value);
  return `${day}/${month}/${year}`;
};

const renderKeyValue = (label: string, value: string) => `
  <div style="padding:12px 14px; border:1px solid ${THEME.fieldBorder}; border-radius:16px; background:${THEME.fieldBg}; box-shadow:inset 0 1px 0 rgba(255,255,255,0.85), 0 10px 22px rgba(17,19,24,0.05);">
    <div style="font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:${THEME.fieldLabel}; margin-bottom:6px;">${escapeHtml(label)}</div>
    <div style="font-size:14px; font-weight:700; color:${THEME.textPrimary};">${escapeHtml(value || 'Sin definir')}</div>
  </div>
`;

const buildItemsTable = (items: SparePartRequestLine[]) => {
  const rows = items
    .map((item, index) => {
      const notes = normStr(item.notes)
        ? `<div style="margin-top:6px; color:${THEME.textMuted}; font-size:12px; line-height:1.5;">${escapeHtml(item.notes || '')}</div>`
        : '';

      return `
        <tr>
          <td style="padding:14px 12px; border-bottom:1px solid rgba(205,212,221,0.7); vertical-align:top; color:${THEME.textPrimary}; font-weight:700;">${index + 1}</td>
          <td style="padding:14px 12px; border-bottom:1px solid rgba(205,212,221,0.7); vertical-align:top;">
            <div style="font-weight:800; color:${THEME.textPrimary};">${escapeHtml(item.code || 'Sin código')}</div>
            <div style="margin-top:4px; color:${THEME.textMuted}; font-size:13px; line-height:1.55;">${escapeHtml(
              item.description || 'Sin descripción',
            )}</div>
            ${notes}
          </td>
          <td style="padding:14px 12px; border-bottom:1px solid rgba(205,212,221,0.7); vertical-align:top; color:${THEME.textPrimary}; font-weight:700;">${escapeHtml(
            String(item.quantity || 0),
          )}</td>
          <td style="padding:14px 12px; border-bottom:1px solid rgba(205,212,221,0.7); vertical-align:top; color:${THEME.textMuted}; font-size:13px;">${escapeHtml(
            normStr(item.equipmentFamily) || 'Compatibilidad no indicada',
          )}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <table style="width:100%; border-collapse:collapse; margin-top:14px; background:${THEME.cardBg}; border:1px solid ${THEME.cardBorder}; border-radius:18px; overflow:hidden;">
      <thead>
        <tr>
          <th style="padding:12px; text-align:left; font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:${THEME.fieldLabel};">#</th>
          <th style="padding:12px; text-align:left; font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:${THEME.fieldLabel};">Refacción solicitada</th>
          <th style="padding:12px; text-align:left; font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:${THEME.fieldLabel};">Cantidad</th>
          <th style="padding:12px; text-align:left; font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:${THEME.fieldLabel};">Equipo / familia</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
};

const buildHtml = (payload: SparePartRequestEmailPayload) => {
  const priorityStyle = PRIORITY_STYLES[normStr(payload.priority).toLowerCase()] || PRIORITY_STYLES.media;
  const totalUnits = payload.items.reduce((acc, item) => acc + Math.max(0, Number(item.quantity) || 0), 0);
  const destinationLabel = DESTINATION_LABELS[normStr(payload.destinationMode).toLowerCase()] || 'Destino por validar';

  return `
  <div style="margin:0; padding:28px; background:${THEME.pageBg}; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;">
    <div style="max-width:920px; margin:0 auto; background:${THEME.shellBg}; border-radius:28px; overflow:hidden; border:1px solid ${THEME.shellBorder}; box-shadow:0 24px 60px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.52);">
      <div style="padding:26px 30px; background:linear-gradient(135deg, ${THEME.heroStart} 0%, ${THEME.heroMid} 48%, ${THEME.heroEnd} 100%); position:relative;">
        <div style="position:absolute; inset:0; background:${THEME.sheen}; pointer-events:none;"></div>
        <div style="display:flex; justify-content:space-between; gap:16px; align-items:flex-start;">
          <div>
            <div style="font-size:12px; letter-spacing:0.16em; text-transform:uppercase; color:rgba(255,255,255,0.76); font-weight:700;">Orion · Biosystems Spare Parts Desk</div>
            <div style="margin-top:10px; font-size:28px; line-height:1.15; font-weight:900; color:#ffffff;">Solicitud formal de refacciones</div>
            <div style="margin-top:8px; font-size:14px; color:rgba(255,255,255,0.78);">
              La solicitud ya viene estructurada con equipo, cliente, prioridad y partidas listas para surtido o seguimiento administrativo.
            </div>
          </div>
          <div style="min-width:180px; padding:14px 16px; border-radius:20px; background:${THEME.darkGlassBg}; border:1px solid ${THEME.darkGlassBorder}; box-shadow:inset 0 1px 0 rgba(255,255,255,0.24), 0 12px 26px rgba(0,0,0,0.18);">
            <div style="font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:rgba(255,255,255,0.72);">Solicitud</div>
            <div style="margin-top:6px; font-size:16px; font-weight:800; color:#ffffff;">${escapeHtml(
              normStr(payload.ticketReference) || normStr(payload.equipmentSerial) || 'Sin referencia',
            )}</div>
            <div style="margin-top:8px; font-size:12px; color:rgba(255,255,255,0.72);">Request ID: ${escapeHtml(
              payload.requestId,
            )}</div>
          </div>
        </div>
      </div>

      <div style="padding:28px 30px 30px;">
        <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:20px;">
          <span style="padding:8px 12px; border-radius:999px; background:${priorityStyle.bg}; color:${priorityStyle.accent}; font-size:12px; font-weight:800; border:1px solid rgba(255,255,255,0.66); box-shadow:inset 0 1px 0 rgba(255,255,255,0.72);">Urgencia ${escapeHtml(
            priorityStyle.label,
          )}</span>
          <span style="padding:8px 12px; border-radius:999px; background:${THEME.brandTintBg}; color:${THEME.brandTintText}; font-size:12px; font-weight:800; border:1px solid rgba(255,255,255,0.7); box-shadow:inset 0 1px 0 rgba(255,255,255,0.72);">${escapeHtml(
            destinationLabel,
          )}</span>
          <span style="padding:8px 12px; border-radius:999px; background:${THEME.neutralChipBg}; color:${THEME.neutralChipText}; font-size:12px; font-weight:800; border:1px solid rgba(255,255,255,0.72); box-shadow:inset 0 1px 0 rgba(255,255,255,0.8);">${escapeHtml(
            `${payload.items.length} partida(s) · ${totalUnits} unidad(es)`,
          )}</span>
        </div>

        <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px;">
          ${renderKeyValue('Ingeniero', `${payload.engineerName} · ${payload.employeeNumber || 'Sin ID'}`)}
          ${renderKeyValue('Contacto del ingeniero', normStr(payload.engineerPhone) || 'Sin teléfono')}
          ${renderKeyValue('Cliente / sitio', normStr(payload.clientName) || 'Sin cliente')}
          ${renderKeyValue('Equipo / serie', `${normStr(payload.equipmentModel) || 'Sin modelo'}${normStr(payload.equipmentSerial) ? ` · ${normStr(payload.equipmentSerial)}` : ''}`)}
          ${renderKeyValue('Ticket / folio', normStr(payload.ticketReference) || 'Sin ticket')}
          ${renderKeyValue('Necesario para', payload.neededByDate ? formatDate(payload.neededByDate) : 'Sin fecha compromiso')}
        </div>

        <div style="margin-top:16px; display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px;">
          ${renderKeyValue('Contacto en sitio', `${normStr(payload.clientContact) || 'Sin contacto'}${normStr(payload.clientPhone) ? ` · ${normStr(payload.clientPhone)}` : ''}`)}
          ${renderKeyValue('Ciudad / estado', `${normStr(payload.destinationCity) || 'Sin ciudad'}${normStr(payload.destinationState) ? `, ${normStr(payload.destinationState)}` : ''}`)}
          ${renderKeyValue('Dirección', normStr(payload.siteAddress) || 'Sin dirección')}
          ${renderKeyValue('Detalle de destino', normStr(payload.destinationDetail) || 'Sin detalle adicional')}
        </div>

        <div style="margin-top:22px;">
          <div style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:${THEME.brandTintText}; font-weight:800;">Partidas solicitadas</div>
          ${buildItemsTable(payload.items)}
        </div>

        <div style="margin-top:22px; padding:18px; border-radius:20px; background:${THEME.cardBg}; border:1px solid ${THEME.cardBorder}; box-shadow:inset 0 1px 0 rgba(255,255,255,0.88), 0 14px 30px rgba(17,19,24,0.06);">
          <div style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:${THEME.fieldLabel}; font-weight:700;">Motivo y notas operativas</div>
          <div style="margin-top:10px; font-size:14px; line-height:1.65; color:${THEME.textPrimary};"><b>Motivo:</b> ${escapeHtml(
            normStr(payload.reason) || 'Sin motivo capturado',
          )}</div>
          <div style="margin-top:10px; font-size:14px; line-height:1.65; color:${THEME.textPrimary};"><b>Observaciones:</b> ${escapeHtml(
            normStr(payload.observations) || 'Sin observaciones adicionales.',
          )}</div>
        </div>

        <div style="margin-top:22px; padding-top:18px; border-top:1px solid ${THEME.cardBorder}; font-size:12px; line-height:1.8; color:${THEME.textMuted};">
          Este correo fue generado automáticamente por Orion para reducir mensajes ambiguos y dejar trazabilidad completa de la solicitud de refacciones.
        </div>
      </div>
    </div>
  </div>`;
};

const sendBrevoEmail = async (opts: {
  apiKey: string;
  senderEmail: string;
  senderName: string;
  toEmail: string;
  toName: string;
  subject: string;
  htmlContent: string;
  sandbox?: boolean;
}) => {
  const payload: Record<string, unknown> = {
    sender: { email: opts.senderEmail, name: opts.senderName },
    to: [{ email: opts.toEmail, name: opts.toName }],
    subject: opts.subject,
    htmlContent: opts.htmlContent,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'api-key': opts.apiKey,
  };

  if (opts.sandbox) {
    headers['X-Sib-Sandbox'] = 'drop';
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data: unknown = null;

  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(`brevo_send_failed: ${response.status} ${text}`);
  }

  return data;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return jsonRes(204);
  }

  if (request.method !== 'POST') {
    return jsonRes(405, { ok: false, error: 'Metodo no permitido.' });
  }

  const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? '';
  const MAIL_FROM_EMAIL = Deno.env.get('MAIL_FROM_EMAIL') ?? '';
  const MAIL_FROM_NAME = Deno.env.get('MAIL_FROM_NAME') ?? 'Orion';
  const SPARE_PARTS_REQUEST_TO_EMAIL =
    Deno.env.get('SPARE_PARTS_REQUEST_TO_EMAIL') ?? Deno.env.get('TRAVEL_REQUEST_TO_EMAIL') ?? 'rmontanez@biosystems.com.mx';
  const SPARE_PARTS_REQUEST_TO_NAME =
    Deno.env.get('SPARE_PARTS_REQUEST_TO_NAME') ?? Deno.env.get('TRAVEL_REQUEST_TO_NAME') ?? 'Sofia Ceballos';
  const BREVO_SANDBOX = (Deno.env.get('BREVO_SANDBOX') ?? 'false').toLowerCase() === 'true';

  if (!BREVO_API_KEY || !MAIL_FROM_EMAIL) {
    return jsonRes(500, {
      ok: false,
      error: 'missing_brevo_env',
      detail: 'BREVO_API_KEY o MAIL_FROM_EMAIL',
    });
  }

  try {
    const body = (await request.json()) as Partial<SparePartRequestEmailPayload>;

    if (!body.requestId || !body.engineerName || !Array.isArray(body.items) || body.items.length === 0) {
      return jsonRes(400, { ok: false, error: 'payload_incompleto' });
    }

    const subject = `Solicitud de refacciones · ${normStr(body.ticketReference || body.equipmentSerial || body.clientName)} · ${normStr(
      body.engineerName,
    )}`;

    const brevo = await sendBrevoEmail({
      apiKey: BREVO_API_KEY,
      senderEmail: MAIL_FROM_EMAIL,
      senderName: MAIL_FROM_NAME,
      toEmail: SPARE_PARTS_REQUEST_TO_EMAIL,
      toName: SPARE_PARTS_REQUEST_TO_NAME,
      subject,
      htmlContent: buildHtml({
        requestId: normStr(body.requestId),
        engineerName: normStr(body.engineerName),
        employeeNumber: normStr(body.employeeNumber),
        engineerPhone: normStr(body.engineerPhone),
        ticketReference: normStr(body.ticketReference),
        equipmentSerial: normStr(body.equipmentSerial),
        equipmentModel: normStr(body.equipmentModel),
        clientName: normStr(body.clientName),
        clientContact: normStr(body.clientContact),
        clientPhone: normStr(body.clientPhone),
        siteAddress: normStr(body.siteAddress),
        destinationCity: normStr(body.destinationCity),
        destinationState: normStr(body.destinationState),
        priority: normStr(body.priority || 'media'),
        neededByDate: normStr(body.neededByDate),
        destinationMode: normStr(body.destinationMode || 'sitio'),
        destinationDetail: normStr(body.destinationDetail),
        reason: normStr(body.reason),
        observations: normStr(body.observations),
        items: body.items
          .map((item) => ({
            code: normStr(item.code),
            description: normStr(item.description),
            quantity: Number(item.quantity) || 1,
            equipmentFamily: normStr(item.equipmentFamily),
            notes: normStr(item.notes),
          }))
          .filter((item) => item.description || item.code),
      }),
      sandbox: BREVO_SANDBOX,
    });

    return jsonRes(200, {
      ok: true,
      to: SPARE_PARTS_REQUEST_TO_EMAIL,
      subject,
      sandbox: BREVO_SANDBOX,
      from: { email: MAIL_FROM_EMAIL, name: MAIL_FROM_NAME },
      brevo,
    });
  } catch (error) {
    return jsonRes(500, { ok: false, error: String(error instanceof Error ? error.message : error) });
  }
});
