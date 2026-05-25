const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

type TravelPriority = 'baja' | 'media' | 'alta' | 'critica';
type TravelServiceType =
  | 'preventivo'
  | 'correctivo'
  | 'instalacion'
  | 'capacitacion'
  | 'emergencia'
  | 'otro';
type TravelTripType = 'redondo' | 'solo_ida';

interface TravelFormData {
  engineerName: string;
  employeeNumber: string;
  serviceType: TravelServiceType;
  clientName: string;
  originCity: string;
  destinationCity: string;
  originAirport: string;
  destinationAirport: string;
  departureDate: string;
  returnDate: string;
  priority: TravelPriority;
  justification: string;
  serviceReference: string;
  equipment: string;
  equipmentSerial: string;
  siteAddress: string;
  siteContact: string;
  sitePhone: string;
  checkedBag: boolean;
  specialTools: boolean;
  tripType: TravelTripType;
  serviceStartDate: string;
  serviceStartTime: string;
  serviceEndDate: string;
  serviceEndTime: string;
  adminComments: string;
  requiresFlight: boolean;
  requiresCar: boolean;
  carPickupLocation: string;
  carPickupDate: string;
  carPickupTime: string;
  carDropoffLocation: string;
  carDropoffDate: string;
  carDropoffTime: string;
  carEstimatedKilometers: string;
  carRouteDescription: string;
}

interface FlightBookingOption {
  bookWith: string;
  price: number | null;
  currency: string;
  url: string | null;
}

interface FlightOffer {
  airline: string;
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  departureAt: string;
  arrivalAt: string;
  stops: number;
  durationMinutes: number;
  price: number;
  currency: string;
  fareType: string;
  cabin: string;
  deeplink: string;
  convenienceScore: number;
  policyScore: number;
  recommendation: string;
  riskLevel: string;
  warnings: string[];
  selectedBookingOption?: FlightBookingOption | null;
}

interface TravelSummary {
  routeLabel: string;
  engineerLabel: string;
  serviceLabel: string;
  urgencyLabel: string;
  riskSummary: string;
  outboundPreferred: FlightOffer | null;
  outboundBackup: FlightOffer | null;
  returnPreferred: FlightOffer | null;
  returnBackup: FlightOffer | null;
  compatibilityNotes: string[];
  estimatedTotalCost: number;
  currency: string;
  requiresCar: boolean;
}

interface FlightSelections {
  adminMessage: string;
}

interface TravelEmailPayload {
  travelRequestId: string;
  form: TravelFormData;
  summary: TravelSummary;
  selections: FlightSelections;
}

const SERVICE_LABELS: Record<TravelServiceType, string> = {
  preventivo: 'Mantenimiento preventivo',
  correctivo: 'Mantenimiento correctivo',
  instalacion: 'Instalacion',
  capacitacion: 'Capacitacion',
  emergencia: 'Emergencia',
  otro: 'Otro servicio',
};

const PRIORITY_STYLES: Record<TravelPriority, { label: string; accent: string; bg: string }> = {
  baja: { label: 'Baja', accent: '#49515c', bg: 'linear-gradient(180deg, #f5f6f7 0%, #e8ebef 100%)' },
  media: { label: 'Media', accent: '#6f0f1f', bg: 'linear-gradient(180deg, #f9eef1 0%, #f1dde3 100%)' },
  alta: { label: 'Alta', accent: '#8a1024', bg: 'linear-gradient(180deg, #f7e4e8 0%, #edc9d1 100%)' },
  critica: { label: 'Critica', accent: '#ffffff', bg: 'linear-gradient(180deg, #b40f2b 0%, #7f071c 100%)' },
};

const THEME = {
  pageBg: 'radial-gradient(circle at top right, rgba(188, 17, 43, 0.26) 0%, rgba(188, 17, 43, 0) 28%), linear-gradient(160deg, #050608 0%, #121417 42%, #1d2025 100%)',
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
  successBg: 'linear-gradient(180deg, #edf8f1 0%, #d8ecdf 100%)',
  successText: '#1c6a45',
  amberBg: 'linear-gradient(180deg, #fff6e5 0%, #f2dfb7 100%)',
  amberText: '#8a5c00',
  dangerBg: 'linear-gradient(180deg, #c51331 0%, #8a0a21 100%)',
  dangerText: '#ffffff',
  darkGlassBg: 'linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.08) 100%)',
  darkGlassBorder: 'rgba(255,255,255,0.22)',
  sheen: 'linear-gradient(135deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.08) 42%, rgba(255,255,255,0.02) 100%)',
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

const formatDateTime = (value: string) => {
  if (!value) return 'Sin definir';
  const [date, time = ''] = value.split('T');
  const cleanTime = time.slice(0, 5);
  return `${formatDate(date)} ${cleanTime}`.trim();
};

const getDatePart = (value: string) => {
  if (!value) return '';
  return value.split('T')[0] || '';
};

const formatCurrency = (amount: number, currency: string) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency || 'MXN',
    maximumFractionDigits: 0,
  }).format(amount || 0);

const formatDuration = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h ${remaining}m`;
};

const getRiskStyle = (riskLevel: string) => {
  const normalized = normStr(riskLevel).toLowerCase();

  if (normalized === 'green') {
    return { bg: THEME.successBg, color: THEME.successText, label: 'Green' };
  }

  if (normalized === 'red') {
    return { bg: THEME.dangerBg, color: THEME.dangerText, label: 'Red' };
  }

  if (normalized === 'amber') {
    return { bg: THEME.amberBg, color: THEME.amberText, label: 'Amber' };
  }

  return { bg: THEME.neutralChipBg, color: THEME.neutralChipText, label: riskLevel || 'Sin clasificar' };
};

const buildOfferReferenceUrl = (offer: FlightOffer) => {
  const query = [offer.departureAirport, offer.arrivalAirport, getDatePart(offer.departureAt)]
    .filter(Boolean)
    .join(' ');
  const fallback = `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}`;

  if (!offer.deeplink) {
    return fallback;
  }

  try {
    const parsed = new URL(offer.deeplink);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('google.') && parsed.pathname.includes('/travel/flights')) {
      return fallback;
    }
  } catch {
    return fallback;
  }

  return offer.deeplink;
};

const renderKeyValue = (label: string, value: string) => `
  <div style="padding:12px 14px; border:1px solid ${THEME.fieldBorder}; border-radius:16px; background:${THEME.fieldBg}; box-shadow:inset 0 1px 0 rgba(255,255,255,0.85), 0 10px 22px rgba(17,19,24,0.05);">
    <div style="font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:${THEME.fieldLabel}; margin-bottom:6px;">${escapeHtml(label)}</div>
    <div style="font-size:14px; font-weight:700; color:${THEME.textPrimary};">${escapeHtml(value || 'Sin definir')}</div>
  </div>
`;

const renderOfferBlock = (title: string, offer: FlightOffer | null) => {
  if (!offer) {
    return `
      <div style="border:1px dashed ${THEME.cardBorder}; border-radius:20px; padding:18px; background:${THEME.cardBg}; box-shadow:inset 0 1px 0 rgba(255,255,255,0.9);">
        <div style="font-size:14px; font-weight:800; color:${THEME.textPrimary}; margin-bottom:8px;">${escapeHtml(title)}</div>
        <div style="color:${THEME.textMuted}; font-size:13px;">Sin seleccion.</div>
      </div>
    `;
  }

  const riskStyle = getRiskStyle(offer.riskLevel);
  const itineraryUrl = buildOfferReferenceUrl(offer);

  const warningLines =
    offer.warnings.length > 0
      ? `<div style="margin-top:12px; color:${THEME.dangerText}; font-size:12px;">${offer.warnings
          .map((warning) => `• ${escapeHtml(warning)}`)
          .join('<br/>')}</div>`
      : '';

  const bookingLine = offer.selectedBookingOption
    ? `<div style="margin-top:12px; padding:10px 12px; background:${THEME.brandTintBg}; border:1px solid ${THEME.cardBorder}; border-radius:14px; color:${THEME.brandTintText}; font-size:12px; box-shadow:inset 0 1px 0 rgba(255,255,255,0.8);">
         Reservar con <b>${escapeHtml(offer.selectedBookingOption.bookWith)}</b>${
           offer.selectedBookingOption.price
             ? ` · ${escapeHtml(
                 formatCurrency(offer.selectedBookingOption.price, offer.selectedBookingOption.currency || offer.currency),
               )}`
             : ''
         }${
           offer.selectedBookingOption.url
             ? ` · <a href="${escapeHtml(offer.selectedBookingOption.url)}" style="color:${THEME.brandTintText}; text-decoration:none;">Abrir opcion</a>`
             : ''
         }
       </div>`
    : '';

  return `
    <div style="border:1px solid ${THEME.cardBorder}; border-radius:20px; padding:18px; background:${THEME.cardBg}; box-shadow:inset 0 1px 0 rgba(255,255,255,0.88), 0 14px 30px rgba(17,19,24,0.08);">
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
        <div>
          <div style="font-size:14px; font-weight:800; color:${THEME.textPrimary};">${escapeHtml(title)}</div>
          <div style="margin-top:8px; font-size:18px; font-weight:800; color:${THEME.textPrimary};">${escapeHtml(offer.airline)} ${escapeHtml(offer.flightNumber)}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px; color:${THEME.fieldLabel}; text-transform:uppercase; letter-spacing:0.08em;">Precio visto</div>
          <div style="font-size:18px; font-weight:800; color:${THEME.textPrimary};">${escapeHtml(
            formatCurrency(offer.price, offer.currency),
          )}</div>
        </div>
      </div>

      <div style="margin-top:14px; display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px;">
        ${renderKeyValue('Salida', `${offer.departureAirport} · ${formatDateTime(offer.departureAt)}`)}
        ${renderKeyValue('Llegada', `${offer.arrivalAirport} · ${formatDateTime(offer.arrivalAt)}`)}
        ${renderKeyValue('Trayecto', `${formatDuration(offer.durationMinutes)} · ${offer.stops === 0 ? 'Directo' : `${offer.stops} escala(s)`}`)}
      </div>

      <div style="margin-top:12px; display:flex; flex-wrap:wrap; gap:8px;">
        <span style="padding:6px 10px; border-radius:999px; background:${THEME.neutralChipBg}; color:${THEME.neutralChipText}; font-size:12px; font-weight:700; border:1px solid rgba(255,255,255,0.72);">${escapeHtml(offer.cabin)}</span>
        <span style="padding:6px 10px; border-radius:999px; background:${THEME.neutralChipBg}; color:${THEME.neutralChipText}; font-size:12px; font-weight:700; border:1px solid rgba(255,255,255,0.72);">${escapeHtml(offer.fareType)}</span>
        <span style="padding:6px 10px; border-radius:999px; background:${riskStyle.bg}; color:${riskStyle.color}; font-size:12px; font-weight:700; border:1px solid rgba(255,255,255,0.38);">Riesgo ${escapeHtml(riskStyle.label)}</span>
        <span style="padding:6px 10px; border-radius:999px; background:${THEME.brandTintBg}; color:${THEME.brandTintText}; font-size:12px; font-weight:700; border:1px solid rgba(255,255,255,0.72);">Score ${escapeHtml(String(offer.convenienceScore))}</span>
      </div>

      ${warningLines}
      ${bookingLine}

      <div style="margin-top:12px;">
        <a href="${escapeHtml(itineraryUrl)}" style="color:${THEME.link}; text-decoration:none; font-size:12px; font-weight:700;">Abrir referencia del itinerario</a>
      </div>
    </div>
  `;
};

const renderCarRentalBlock = (form: TravelFormData) => {
  if (!form.requiresCar) {
    return '';
  }

  return `
    <div style="margin-top:22px; padding:18px; border-radius:20px; background:${THEME.cardBg}; border:1px solid ${THEME.cardBorder}; box-shadow:inset 0 1px 0 rgba(255,255,255,0.88), 0 14px 30px rgba(17,19,24,0.06);">
      <div style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:${THEME.brandTintText}; font-weight:800;">Formato de renta automotriz</div>
      <div style="margin-top:14px; display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px;">
        ${renderKeyValue('Recoger auto', `${form.carPickupLocation || 'Sin definir'} · ${formatDate(form.carPickupDate)} ${form.carPickupTime || ''}`.trim())}
        ${renderKeyValue('Entregar auto', `${form.carDropoffLocation || 'Sin definir'} · ${formatDate(form.carDropoffDate)} ${form.carDropoffTime || ''}`.trim())}
        ${renderKeyValue('Kilometraje estimado', form.carEstimatedKilometers || 'Sin definir')}
        ${renderKeyValue('Recorrido', form.carRouteDescription || 'Sin definir')}
      </div>
    </div>
  `;
};

const buildHtml = (payload: TravelEmailPayload) => {
  const { travelRequestId, form, summary, selections } = payload;
  const priority = PRIORITY_STYLES[form.priority];
  const serviceWindow = form.serviceStartDate
    ? `${formatDate(form.serviceStartDate)} ${form.serviceStartTime || ''}${
        form.serviceEndDate ? ` a ${formatDate(form.serviceEndDate)} ${form.serviceEndTime || ''}` : ''
      }`
    : 'Sin definir';

  const compatibilityNotes =
    summary.compatibilityNotes.length > 0
      ? summary.compatibilityNotes.map((note) => `• ${escapeHtml(note)}`).join('<br/>')
      : 'Sin alertas adicionales registradas.';

  return `
  <div style="margin:0; padding:28px; background:${THEME.pageBg}; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;">
    <div style="max-width:920px; margin:0 auto; background:${THEME.shellBg}; border-radius:28px; overflow:hidden; border:1px solid ${THEME.shellBorder}; box-shadow:0 24px 60px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.52);">
      <div style="padding:26px 30px; background:linear-gradient(135deg, ${THEME.heroStart} 0%, ${THEME.heroMid} 48%, ${THEME.heroEnd} 100%); position:relative;">
        <div style="position:absolute; inset:0; background:${THEME.sheen}; pointer-events:none;"></div>
        <div style="display:flex; justify-content:space-between; gap:16px; align-items:flex-start;">
          <div>
            <div style="font-size:12px; letter-spacing:0.16em; text-transform:uppercase; color:rgba(255,255,255,0.76); font-weight:700;">Orion · Biosystems Service Logistics</div>
            <div style="margin-top:10px; font-size:28px; line-height:1.15; font-weight:900; color:#ffffff;">Solicitud formal de logistica de viaje</div>
            <div style="margin-top:8px; font-size:14px; color:rgba(255,255,255,0.78);">
              La solicitud del ingeniero ya fue validada en sistema y esta lista para gestion administrativa.
            </div>
          </div>
          <div style="min-width:180px; padding:14px 16px; border-radius:20px; background:${THEME.darkGlassBg}; border:1px solid ${THEME.darkGlassBorder}; box-shadow:inset 0 1px 0 rgba(255,255,255,0.24), 0 12px 26px rgba(0,0,0,0.18);">
            <div style="font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:rgba(255,255,255,0.72);">Solicitud</div>
            <div style="margin-top:6px; font-size:16px; font-weight:800; color:#ffffff;">${escapeHtml(
              form.serviceReference || summary.serviceLabel,
            )}</div>
            <div style="margin-top:8px; font-size:12px; color:rgba(255,255,255,0.72);">Request ID: ${escapeHtml(
              travelRequestId,
            )}</div>
          </div>
        </div>
      </div>

      <div style="padding:28px 30px 30px;">
        <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:20px;">
          <span style="padding:8px 12px; border-radius:999px; background:${priority.bg}; color:${priority.accent}; font-size:12px; font-weight:800; border:1px solid rgba(255,255,255,0.66); box-shadow:inset 0 1px 0 rgba(255,255,255,0.72);">Urgencia ${escapeHtml(priority.label)}</span>
          <span style="padding:8px 12px; border-radius:999px; background:${THEME.brandTintBg}; color:${THEME.brandTintText}; font-size:12px; font-weight:800; border:1px solid rgba(255,255,255,0.7); box-shadow:inset 0 1px 0 rgba(255,255,255,0.72);">${escapeHtml(
            SERVICE_LABELS[form.serviceType],
          )}</span>
          <span style="padding:8px 12px; border-radius:999px; background:${THEME.neutralChipBg}; color:${THEME.neutralChipText}; font-size:12px; font-weight:800; border:1px solid rgba(255,255,255,0.72); box-shadow:inset 0 1px 0 rgba(255,255,255,0.8);">Ruta ${escapeHtml(
            summary.routeLabel,
          )}</span>
          <span style="padding:8px 12px; border-radius:999px; background:${THEME.neutralChipBg}; color:${THEME.neutralChipText}; font-size:12px; font-weight:800; border:1px solid rgba(255,255,255,0.72); box-shadow:inset 0 1px 0 rgba(255,255,255,0.8);">Estimado ${escapeHtml(
            formatCurrency(summary.estimatedTotalCost, summary.currency),
          )}</span>
        </div>

        <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px;">
          ${renderKeyValue('Ingeniero', `${form.engineerName} · ${form.employeeNumber}`)}
          ${renderKeyValue('Cliente / sitio', form.clientName)}
          ${renderKeyValue('Equipo / serie', `${form.equipment || 'Sin equipo'}${form.equipmentSerial ? ` · ${form.equipmentSerial}` : ''}`)}
          ${renderKeyValue('Ventana del servicio', serviceWindow)}
        </div>

        <div style="margin-top:16px; display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px;">
          ${renderKeyValue('Direccion', form.siteAddress)}
          ${renderKeyValue('Contacto en sitio', `${form.siteContact} · ${form.sitePhone}`)}
        </div>

        <div style="margin-top:18px; padding:18px; border-radius:20px; background:${THEME.cardBg}; border:1px solid ${THEME.cardBorder}; box-shadow:inset 0 1px 0 rgba(255,255,255,0.88), 0 14px 30px rgba(17,19,24,0.06);">
          <div style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:${THEME.fieldLabel}; font-weight:700;">Motivo y lineamientos operativos</div>
          <div style="margin-top:10px; font-size:14px; line-height:1.65; color:${THEME.textPrimary};"><b>Justificacion:</b> ${escapeHtml(
            form.justification,
          )}</div>
          <div style="margin-top:10px; font-size:14px; line-height:1.65; color:${THEME.textPrimary};"><b>Riesgo operativo:</b> ${escapeHtml(
            summary.riskSummary,
          )}</div>
          <div style="margin-top:10px; font-size:13px; line-height:1.7; color:${THEME.textMuted};">${compatibilityNotes}</div>
        </div>

        ${
          form.requiresFlight
            ? `<div style="margin-top:22px; display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px;">
                 ${renderOfferBlock('Ida preferida', summary.outboundPreferred)}
                 ${renderOfferBlock('Ida alternativa', summary.outboundBackup)}
                 ${form.tripType === 'redondo' ? renderOfferBlock('Regreso preferido', summary.returnPreferred) : ''}
                 ${form.tripType === 'redondo' ? renderOfferBlock('Regreso alternativo', summary.returnBackup) : ''}
               </div>`
            : ''
        }

        ${renderCarRentalBlock(form)}

        <div style="margin-top:22px; padding:18px; border-radius:20px; background:${THEME.cardBg}; border:1px solid ${THEME.cardBorder}; box-shadow:inset 0 1px 0 rgba(255,255,255,0.88), 0 14px 30px rgba(17,19,24,0.06);">
          <div style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:${THEME.brandTintText}; font-weight:800;">Indicaciones para reserva</div>
          <div style="margin-top:10px; font-size:14px; line-height:1.65; color:${THEME.textPrimary};">
            <b>Equipaje documentado:</b> ${form.checkedBag ? 'Si' : 'No'} ·
            <b> Herramientas o maletas especiales:</b> ${form.specialTools ? 'Si' : 'No'} ·
            <b> Renta de automovil:</b> ${form.requiresCar ? 'Si' : 'No'}
          </div>
          <div style="margin-top:10px; font-size:14px; line-height:1.65; color:${THEME.textPrimary};">
            <b>Comentarios del ingeniero:</b> ${escapeHtml(selections.adminMessage || 'Sin comentarios adicionales.')}
          </div>
          ${
            normStr(form.adminComments)
              ? `<div style="margin-top:10px; font-size:14px; line-height:1.65; color:${THEME.textPrimary};"><b>Notas para administracion:</b> ${escapeHtml(
                  form.adminComments,
                )}</div>`
              : ''
          }
        </div>

        <div style="margin-top:22px; padding-top:18px; border-top:1px solid ${THEME.cardBorder}; font-size:12px; line-height:1.8; color:${THEME.textMuted};">
          Este correo fue generado automaticamente por Travel Ops Planner para reducir intercambios operativos y dejar trazabilidad completa de la solicitud.
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
  const MAIL_FROM_NAME = Deno.env.get('MAIL_FROM_NAME') ?? 'Biosystems Travel Ops';
  const MAIL_SUPPORT_EMAIL = Deno.env.get('MAIL_SUPPORT_EMAIL') ?? '';
  const TRAVEL_REQUEST_TO_EMAIL = Deno.env.get('TRAVEL_REQUEST_TO_EMAIL') ?? 'rmontanez@biosystems.com.mx';
  const TRAVEL_REQUEST_TO_NAME = Deno.env.get('TRAVEL_REQUEST_TO_NAME') ?? 'Sofia Ceballos';
  const BREVO_SANDBOX = (Deno.env.get('BREVO_SANDBOX') ?? 'false').toLowerCase() === 'true';

  if (!BREVO_API_KEY || !MAIL_FROM_EMAIL) {
    return jsonRes(500, {
      ok: false,
      error: 'missing_brevo_env',
      detail: 'BREVO_API_KEY o MAIL_FROM_EMAIL',
    });
  }

  try {
    const body = (await request.json()) as Partial<TravelEmailPayload>;

    if (!body.travelRequestId || !body.form || !body.summary || !body.selections) {
      return jsonRes(400, { ok: false, error: 'payload_incompleto' });
    }

    const form = body.form;
    const summary = body.summary;
    const travelRequestId = normStr(body.travelRequestId);
    const subject = `Solicitud de logistica de viaje · ${normStr(form.serviceReference || summary.serviceLabel)} · ${normStr(form.engineerName)}`;
    const htmlContent = buildHtml({
      travelRequestId,
      form,
      summary,
      selections: body.selections,
    });

    const brevo = await sendBrevoEmail({
      apiKey: BREVO_API_KEY,
      senderEmail: MAIL_FROM_EMAIL,
      senderName: MAIL_FROM_NAME,
      toEmail: TRAVEL_REQUEST_TO_EMAIL,
      toName: TRAVEL_REQUEST_TO_NAME,
      subject,
      htmlContent,
      sandbox: BREVO_SANDBOX,
    });

    return jsonRes(200, {
      ok: true,
      to: TRAVEL_REQUEST_TO_EMAIL,
      subject,
      sandbox: BREVO_SANDBOX,
      from: { email: MAIL_FROM_EMAIL, name: MAIL_FROM_NAME },
      supportEmail: MAIL_SUPPORT_EMAIL || null,
      brevo,
    });
  } catch (error) {
    return jsonRes(500, { ok: false, error: String(error instanceof Error ? error.message : error) });
  }
});
