const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

interface ServiceReportMaterialItem {
  productName?: string;
  kind?: string;
  quantity?: number;
  referenceCode?: string;
  lotNumber?: string;
  expiresOn?: string;
  notes?: string;
}

interface ServiceReportFormData {
  reportType: 'servicio' | 'remoto';
  engineerName: string;
  serviceType: string;
  priority: string;
  serviceReference: string;
  serviceDate: string;
  callDate: string;
  startedAt: string;
  endedAt: string;
  clientName: string;
  businessUnitName: string;
  siteAddress: string;
  siteContact: string;
  sitePhone: string;
  equipmentSerial: string;
  equipmentName: string;
  diagnosticLabel: string;
  subject: string;
  comments: string;
  solution: string;
  softwareVersion: string;
  firmwareVersion: string;
  serviceSoftwareVersion: string;
  specialClientCode: string;
  specialReferenceValue: string;
  materialsUsed: ServiceReportMaterialItem[];
}

interface ServiceReportEmailPayload {
  reportId: string;
  status: 'borrador' | 'registrado' | 'requiere_visita';
  reportReference: string;
  reportTitle: string;
  generatedAt: string;
  generatedByName: string;
  engineerName: string;
  engineerEmail: string;
  form: ServiceReportFormData;
  pdfFileName: string;
  pdfBase64: string;
  pdfPublicUrl?: string;
}

const THEME = {
  pageBg:
    'radial-gradient(circle at top right, rgba(188, 17, 43, 0.26) 0%, rgba(188, 17, 43, 0) 28%), linear-gradient(160deg, #050608 0%, #121417 42%, #1d2025 100%)',
  shellBg: 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(245,247,249,0.98) 100%)',
  shellBorder: 'rgba(255,255,255,0.18)',
  heroStart: '#050608',
  heroMid: '#171b21',
  heroEnd: '#98112a',
  cardBg: 'linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(242,245,248,0.84) 100%)',
  cardBorder: 'rgba(197,204,214,0.88)',
  fieldLabel: '#69717d',
  textPrimary: '#12161b',
  textMuted: '#5f6672',
  accentBg: 'linear-gradient(180deg, #f8ebef 0%, #f0dce2 100%)',
  accentText: '#8d1026',
  neutralBg: 'linear-gradient(180deg, #f7f8fa 0%, #ebeff3 100%)',
  neutralText: '#2f343c',
  darkGlassBg: 'linear-gradient(180deg, rgba(255,255,255,0.17) 0%, rgba(255,255,255,0.08) 100%)',
  darkGlassBorder: 'rgba(255,255,255,0.22)',
};

const STATUS_LABELS: Record<ServiceReportEmailPayload['status'], string> = {
  borrador: 'Borrador',
  registrado: 'Registrado',
  requiere_visita: 'Requiere visita',
};

const SERVICE_TYPE_LABELS: Record<string, string> = {
  preventivo: 'Preventivo',
  correctivo: 'Correctivo',
  instalacion: 'Instalacion',
  capacitacion: 'Capacitacion',
  emergencia: 'Emergencia',
  otro: 'Otro',
};

const PRIORITY_LABELS: Record<string, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Critica',
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
  const raw = normStr(value);
  if (!raw) return 'Sin fecha';
  const [year, month, day] = raw.split('-');
  if (!year || !month || !day) return escapeHtml(raw);
  return `${day}/${month}/${year}`;
};

const formatTime = (value: string) => {
  const raw = normStr(value);
  if (!raw) return 'Sin hora';
  return escapeHtml(raw.slice(0, 5));
};

const valueOrFallback = (value: unknown, fallback = 'Sin definir') => escapeHtml(normStr(value) || fallback);

const renderKeyValue = (label: string, value: string) => `
  <div style="padding:12px 14px; border:1px solid ${THEME.cardBorder}; border-radius:16px; background:${THEME.cardBg}; box-shadow:inset 0 1px 0 rgba(255,255,255,0.88), 0 12px 28px rgba(18,22,27,0.05);">
    <div style="font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:${THEME.fieldLabel}; margin-bottom:6px;">${escapeHtml(label)}</div>
    <div style="font-size:14px; font-weight:700; color:${THEME.textPrimary}; line-height:1.5;">${value}</div>
  </div>
`;

const isMeaningfulMaterial = (item: ServiceReportMaterialItem) =>
  Boolean(
    normStr(item.productName) ||
      normStr(item.referenceCode) ||
      normStr(item.lotNumber) ||
      normStr(item.notes) ||
      Number(item.quantity) > 0,
  );

const buildMaterialsTable = (items: ServiceReportMaterialItem[]) => {
  const meaningfulItems = items.filter(isMeaningfulMaterial);

  if (meaningfulItems.length === 0) {
    return `
      <div style="margin-top:14px; padding:16px 18px; border:1px solid ${THEME.cardBorder}; border-radius:18px; background:${THEME.cardBg}; color:${THEME.textMuted}; font-size:14px;">
        No se registraron materiales utilizados en este reporte.
      </div>
    `;
  }

  const rows = meaningfulItems
    .map((item, index) => {
      const trace = [
        normStr(item.referenceCode) ? `REF ${normStr(item.referenceCode)}` : 'Sin REF',
        normStr(item.lotNumber) ? `Lote ${normStr(item.lotNumber)}` : 'Sin lote',
        normStr(item.expiresOn) ? `Cad. ${formatDate(normStr(item.expiresOn))}` : 'Sin caducidad',
      ].join(' · ');

      return `
        <tr>
          <td style="padding:13px 10px; border-bottom:1px solid rgba(205,212,221,0.7); vertical-align:top; color:${THEME.textPrimary}; font-weight:700;">${index + 1}</td>
          <td style="padding:13px 10px; border-bottom:1px solid rgba(205,212,221,0.7); vertical-align:top;">
            <div style="font-weight:800; color:${THEME.textPrimary};">${valueOrFallback(item.productName, 'Sin producto')}</div>
            <div style="margin-top:4px; color:${THEME.textMuted}; font-size:13px;">${valueOrFallback(item.kind, 'Sin tipo')}</div>
          </td>
          <td style="padding:13px 10px; border-bottom:1px solid rgba(205,212,221,0.7); vertical-align:top; color:${THEME.textMuted}; font-size:13px;">${escapeHtml(
            trace,
          )}</td>
          <td style="padding:13px 10px; border-bottom:1px solid rgba(205,212,221,0.7); vertical-align:top; color:${THEME.textPrimary}; font-weight:700;">${escapeHtml(
            String(Number(item.quantity) || 1),
          )}</td>
          <td style="padding:13px 10px; border-bottom:1px solid rgba(205,212,221,0.7); vertical-align:top; color:${THEME.textMuted}; font-size:13px;">${valueOrFallback(
            item.notes,
            'Sin notas',
          )}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <table style="width:100%; border-collapse:collapse; margin-top:14px; background:${THEME.cardBg}; border:1px solid ${THEME.cardBorder}; border-radius:18px; overflow:hidden;">
      <thead>
        <tr>
          <th style="padding:12px 10px; text-align:left; font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:${THEME.fieldLabel};">#</th>
          <th style="padding:12px 10px; text-align:left; font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:${THEME.fieldLabel};">Producto</th>
          <th style="padding:12px 10px; text-align:left; font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:${THEME.fieldLabel};">Trazabilidad</th>
          <th style="padding:12px 10px; text-align:left; font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:${THEME.fieldLabel};">Cant.</th>
          <th style="padding:12px 10px; text-align:left; font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:${THEME.fieldLabel};">Notas</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
};

const buildHtml = (payload: ServiceReportEmailPayload) => {
  const form = payload.form;
  const serviceDateLabel = form.reportType === 'servicio' ? formatDate(form.serviceDate) : formatDate(form.callDate);
  const serviceTypeLabel = SERVICE_TYPE_LABELS[normStr(form.serviceType).toLowerCase()] || valueOrFallback(form.serviceType);
  const priorityLabel = PRIORITY_LABELS[normStr(form.priority).toLowerCase()] || valueOrFallback(form.priority);
  const narrativeTitle = form.reportType === 'servicio' ? 'Solucion aplicada' : 'Resolucion remota / siguiente accion';
  const referenceLabel = normStr(form.specialClientCode) ? 'Referencia externa' : 'Folio de servicio';
  const referenceValue = normStr(form.specialReferenceValue) || normStr(form.serviceReference) || normStr(payload.reportReference);

  return `
  <div style="margin:0; padding:28px; background:${THEME.pageBg}; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;">
    <div style="max-width:920px; margin:0 auto; background:${THEME.shellBg}; border-radius:28px; overflow:hidden; border:1px solid ${THEME.shellBorder}; box-shadow:0 24px 60px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.52);">
      <div style="padding:26px 30px; background:linear-gradient(135deg, ${THEME.heroStart} 0%, ${THEME.heroMid} 48%, ${THEME.heroEnd} 100%);">
        <div style="display:flex; justify-content:space-between; gap:18px; align-items:flex-start;">
          <div>
            <div style="font-size:12px; letter-spacing:0.16em; text-transform:uppercase; color:rgba(255,255,255,0.76); font-weight:700;">Orion · Service Documentation</div>
            <div style="margin-top:10px; font-size:28px; line-height:1.12; font-weight:900; color:#ffffff;">${escapeHtml(
              payload.reportTitle,
            )}</div>
            <div style="margin-top:8px; font-size:14px; color:rgba(255,255,255,0.8);">
              El PDF formal del reporte va adjunto a este correo para consulta, respaldo y reenvio inmediato.
            </div>
          </div>
          <div style="min-width:210px; padding:14px 16px; border-radius:20px; background:${THEME.darkGlassBg}; border:1px solid ${THEME.darkGlassBorder}; box-shadow:inset 0 1px 0 rgba(255,255,255,0.24), 0 12px 26px rgba(0,0,0,0.18);">
            <div style="font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:rgba(255,255,255,0.72);">Folio</div>
            <div style="margin-top:6px; font-size:16px; font-weight:800; color:#ffffff;">${escapeHtml(payload.reportReference)}</div>
            <div style="margin-top:8px; font-size:12px; color:rgba(255,255,255,0.72);">Estado: ${escapeHtml(
              STATUS_LABELS[payload.status],
            )}</div>
            <div style="margin-top:4px; font-size:12px; color:rgba(255,255,255,0.72);">Emitido: ${escapeHtml(payload.generatedAt)}</div>
          </div>
        </div>
      </div>

      <div style="padding:28px 30px 30px;">
        <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:20px;">
          <span style="padding:8px 12px; border-radius:999px; background:${THEME.accentBg}; color:${THEME.accentText}; font-size:12px; font-weight:800; border:1px solid rgba(255,255,255,0.7);">${escapeHtml(
            STATUS_LABELS[payload.status],
          )}</span>
          <span style="padding:8px 12px; border-radius:999px; background:${THEME.neutralBg}; color:${THEME.neutralText}; font-size:12px; font-weight:800; border:1px solid rgba(255,255,255,0.72);">${escapeHtml(
            serviceTypeLabel,
          )}</span>
          <span style="padding:8px 12px; border-radius:999px; background:${THEME.neutralBg}; color:${THEME.neutralText}; font-size:12px; font-weight:800; border:1px solid rgba(255,255,255,0.72);">${escapeHtml(
            `Prioridad ${priorityLabel}`,
          )}</span>
          <span style="padding:8px 12px; border-radius:999px; background:${THEME.neutralBg}; color:${THEME.neutralText}; font-size:12px; font-weight:800; border:1px solid rgba(255,255,255,0.72);">${escapeHtml(
            form.reportType === 'servicio' ? 'Visita presencial' : 'Soporte remoto',
          )}</span>
        </div>

        <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px;">
          ${renderKeyValue('Ingeniero del reporte', valueOrFallback(form.engineerName || payload.engineerName))}
          ${renderKeyValue('Generado para', valueOrFallback(payload.generatedByName || payload.engineerName))}
          ${renderKeyValue('Cliente / sitio', valueOrFallback(form.clientName))}
          ${renderKeyValue('Equipo / serie', `${valueOrFallback(form.equipmentName)} · ${valueOrFallback(form.equipmentSerial)}`)}
          ${renderKeyValue('Fecha operativa', serviceDateLabel)}
          ${renderKeyValue('Horario', `${formatTime(form.startedAt)} - ${formatTime(form.endedAt)}`)}
        </div>

        <div style="margin-top:16px; display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px;">
          ${renderKeyValue('Contacto en sitio', `${valueOrFallback(form.siteContact)}${normStr(form.sitePhone) ? ` · ${valueOrFallback(form.sitePhone, '')}` : ''}`)}
          ${renderKeyValue(referenceLabel, valueOrFallback(referenceValue))}
          ${renderKeyValue('Unidad / negocio', valueOrFallback(form.businessUnitName, 'Sin unidad capturada'))}
          ${renderKeyValue('Direccion operativa', valueOrFallback(form.siteAddress))}
        </div>

        <div style="margin-top:22px; padding:18px; border-radius:20px; background:${THEME.cardBg}; border:1px solid ${THEME.cardBorder}; box-shadow:inset 0 1px 0 rgba(255,255,255,0.88), 0 14px 30px rgba(17,19,24,0.06);">
          <div style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:${THEME.accentText}; font-weight:800;">Diagnostico</div>
          <div style="margin-top:10px; font-size:14px; line-height:1.65; color:${THEME.textPrimary};">${valueOrFallback(
            form.diagnosticLabel || form.subject,
            'Sin diagnostico capturado',
          )}</div>
        </div>

        <div style="margin-top:16px; padding:18px; border-radius:20px; background:${THEME.cardBg}; border:1px solid ${THEME.cardBorder}; box-shadow:inset 0 1px 0 rgba(255,255,255,0.88), 0 14px 30px rgba(17,19,24,0.06);">
          <div style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:${THEME.fieldLabel}; font-weight:800;">Hallazgos / trabajo realizado</div>
          <div style="margin-top:10px; font-size:14px; line-height:1.65; color:${THEME.textPrimary};">${valueOrFallback(
            form.comments,
            'Sin comentarios capturados.',
          )}</div>
        </div>

        <div style="margin-top:16px; padding:18px; border-radius:20px; background:${THEME.cardBg}; border:1px solid ${THEME.cardBorder}; box-shadow:inset 0 1px 0 rgba(255,255,255,0.88), 0 14px 30px rgba(17,19,24,0.06);">
          <div style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:${THEME.fieldLabel}; font-weight:800;">${escapeHtml(
            narrativeTitle,
          )}</div>
          <div style="margin-top:10px; font-size:14px; line-height:1.65; color:${THEME.textPrimary};">${valueOrFallback(
            form.solution,
            'Sin solucion capturada.',
          )}</div>
        </div>

        <div style="margin-top:22px;">
          <div style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:${THEME.accentText}; font-weight:800;">Materiales utilizados</div>
          ${buildMaterialsTable(form.materialsUsed || [])}
        </div>

        <div style="margin-top:22px; padding:18px; border-radius:20px; background:${THEME.cardBg}; border:1px solid ${THEME.cardBorder}; box-shadow:inset 0 1px 0 rgba(255,255,255,0.88), 0 14px 30px rgba(17,19,24,0.06);">
          <div style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:${THEME.fieldLabel}; font-weight:800;">Versiones capturadas</div>
          <div style="margin-top:10px; font-size:14px; line-height:1.8; color:${THEME.textPrimary};">
            <div><b>Software:</b> ${valueOrFallback(form.softwareVersion, 'Sin dato')}</div>
            <div><b>Firmware:</b> ${valueOrFallback(form.firmwareVersion, 'Sin dato')}</div>
            <div><b>Software de servicio:</b> ${valueOrFallback(form.serviceSoftwareVersion, 'Sin dato')}</div>
          </div>
        </div>

        <div style="margin-top:22px; padding-top:18px; border-top:1px solid ${THEME.cardBorder}; font-size:12px; line-height:1.8; color:${THEME.textMuted};">
          El PDF formal del reporte viene adjunto a este correo como <b>${escapeHtml(payload.pdfFileName)}</b>.
          ${
            normStr(payload.pdfPublicUrl)
              ? ` Si tu cliente de correo bloquea adjuntos, tambien puedes abrirlo desde este enlace: <a href="${escapeHtml(
                  normStr(payload.pdfPublicUrl),
                )}" style="color:${THEME.accentText}; text-decoration:none;">ver PDF</a>.`
              : ''
          }
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
  attachmentName: string;
  attachmentContent: string;
  sandbox?: boolean;
}) => {
  const payload: Record<string, unknown> = {
    sender: { email: opts.senderEmail, name: opts.senderName },
    to: [{ email: opts.toEmail, name: opts.toName }],
    subject: opts.subject,
    htmlContent: opts.htmlContent,
    attachment: [
      {
        name: opts.attachmentName,
        content: opts.attachmentContent,
      },
    ],
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
  const MAIL_FROM_NAME = Deno.env.get('MAIL_FROM_NAME') ?? 'Orion Service Reports';
  const BREVO_SANDBOX = (Deno.env.get('BREVO_SANDBOX') ?? 'false').toLowerCase() === 'true';

  if (!BREVO_API_KEY || !MAIL_FROM_EMAIL) {
    return jsonRes(500, {
      ok: false,
      error: 'missing_brevo_env',
      detail: 'BREVO_API_KEY o MAIL_FROM_EMAIL',
    });
  }

  try {
    const body = (await request.json()) as Partial<ServiceReportEmailPayload>;

    if (!body.reportId || !body.reportReference || !body.pdfBase64 || !body.pdfFileName || !body.engineerEmail || !body.form) {
      return jsonRes(400, { ok: false, error: 'payload_incompleto' });
    }

    const form = body.form as ServiceReportFormData;
    const toEmail = normStr(body.engineerEmail);
    const toName = normStr(body.generatedByName || body.engineerName || form.engineerName || 'Ingeniero Orion');
    const subject = `Reporte de servicio ${normStr(body.reportReference)} · ${normStr(form.clientName || form.equipmentSerial || form.equipmentName)}`;

    const brevo = await sendBrevoEmail({
      apiKey: BREVO_API_KEY,
      senderEmail: MAIL_FROM_EMAIL,
      senderName: MAIL_FROM_NAME,
      toEmail,
      toName,
      subject,
      htmlContent: buildHtml({
        reportId: normStr(body.reportId),
        status: (body.status as ServiceReportEmailPayload['status']) || 'registrado',
        reportReference: normStr(body.reportReference),
        reportTitle: normStr(body.reportTitle || body.reportReference),
        generatedAt: normStr(body.generatedAt),
        generatedByName: normStr(body.generatedByName),
        engineerName: normStr(body.engineerName || form.engineerName),
        engineerEmail: toEmail,
        form,
        pdfFileName: normStr(body.pdfFileName),
        pdfBase64: normStr(body.pdfBase64),
        pdfPublicUrl: normStr(body.pdfPublicUrl),
      }),
      attachmentName: normStr(body.pdfFileName),
      attachmentContent: normStr(body.pdfBase64),
      sandbox: BREVO_SANDBOX,
    });

    return jsonRes(200, {
      ok: true,
      to: toEmail,
      subject,
      sandbox: BREVO_SANDBOX,
      from: { email: MAIL_FROM_EMAIL, name: MAIL_FROM_NAME },
      brevo,
    });
  } catch (error) {
    return jsonRes(500, { ok: false, error: String(error instanceof Error ? error.message : error) });
  }
});
