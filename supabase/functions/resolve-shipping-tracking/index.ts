const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

type TrackingCarrier = 'dhl' | 'estafeta' | 'tresguerras' | 'chilexpress' | 'chibra';
type TrackingStatus =
  | 'capturado'
  | 'pendiente_consulta'
  | 'etiqueta_generada'
  | 'en_transito'
  | 'en_reparto'
  | 'entregado'
  | 'incidencia';
type FulfillmentState = 'pendiente' | 'entregado';

interface TrackingLookupPayload {
  carrier?: TrackingCarrier;
  trackingNumber?: string;
}

interface TrackingTimelineEvent {
  label: string;
  location: string;
  timestamp: string;
  note: string;
}

interface TrackingLookupResponse {
  ok: boolean;
  lookupMode: 'live' | 'manual_only';
  carrier: TrackingCarrier;
  trackingNumber: string;
  status?: TrackingStatus;
  fulfillmentState?: FulfillmentState;
  portalStatusText?: string;
  lastEventLabel?: string;
  lastEventAt?: string;
  estimatedDelivery?: string;
  recipient?: string;
  origin?: string;
  destination?: string;
  serviceType?: string;
  deliveryProofName?: string;
  timeline?: TrackingTimelineEvent[];
  rawSummary?: string;
  note?: string;
  error?: string;
}

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
};

const DHL_TRACKING_API_URL = Deno.env.get('DHL_TRACKING_API_URL')?.trim() || 'https://api-eu.dhl.com/track/shipments';
const CHILEXPRESS_SUBSCRIPTION_KEY =
  Deno.env.get('CHILEXPRESS_SUBSCRIPTION_KEY')?.trim() || '7b878d2423f349e3b8bbb9b3607d4215';
const CHILEXPRESS_CLIENT_ID =
  Deno.env.get('CHILEXPRESS_CLIENT_ID')?.trim() || 'ea970f64-73db-4bdc-91f4-a0d58094b44b';
const CHILEXPRESS_CLIENT_SECRET = Deno.env.get('CHILEXPRESS_CLIENT_SECRET')?.trim() || '';
const CHILEXPRESS_SCOPE =
  Deno.env.get('CHILEXPRESS_SCOPE')?.trim() || 'api://ea970f64-73db-4bdc-91f4-a0d58094b44b/.default';
const CHILEXPRESS_ORIGIN = 'https://centrodeayuda.chilexpress.cl';
const CHILEXPRESS_TOKEN_URL =
  Deno.env.get('CHILEXPRESS_TOKEN_URL')?.trim() ||
  'https://services.wschilexpress.com/centroayuda/api/v1/api/v1/token';
const CHILEXPRESS_TIMELINE_URL =
  Deno.env.get('CHILEXPRESS_TIMELINE_URL')?.trim() ||
  'https://services.wschilexpress.com/centroayuda/api/v1/api/v1/TimeLine';
const CHILEXPRESS_LOOKUP_URL =
  Deno.env.get('CHILEXPRESS_LOOKUP_URL')?.trim() ||
  'https://services.wschilexpress.com/centroayuda/api/v1/api/sugerencia/bynroot';
const CHIBRA_BASE_URL = 'https://gtschibra.alertran.net';
const CHIBRA_LOGIN_URL = `${CHIBRA_BASE_URL}/gts/login.seam`;
const SECTIGO_PUBLIC_SERVER_AUTHENTICATION_CA_DV_R36_PEM = `-----BEGIN CERTIFICATE-----
MIIGTDCCBDSgAwIBAgIQOXpmzCdWNi4NqofKbqvjsTANBgkqhkiG9w0BAQwFADBf
MQswCQYDVQQGEwJHQjEYMBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTYwNAYDVQQD
Ey1TZWN0aWdvIFB1YmxpYyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gUm9vdCBSNDYw
HhcNMjEwMzIyMDAwMDAwWhcNMzYwMzIxMjM1OTU5WjBgMQswCQYDVQQGEwJHQjEY
MBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTcwNQYDVQQDEy5TZWN0aWdvIFB1Ymxp
YyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gQ0EgRFYgUjM2MIIBojANBgkqhkiG9w0B
AQEFAAOCAY8AMIIBigKCAYEAljZf2HIz7+SPUPQCQObZYcrxLTHYdf1ZtMRe7Yeq
RPSwygz16qJ9cAWtWNTcuICc++p8Dct7zNGxCpqmEtqifO7NvuB5dEVexXn9RFFH
12Hm+NtPRQgXIFjx6MSJcNWuVO3XGE57L1mHlcQYj+g4hny90aFh2SCZCDEVkAja
EMMfYPKuCjHuuF+bzHFb/9gV8P9+ekcHENF2nR1efGWSKwnfG5RawlkaQDpRtZTm
M64TIsv/r7cyFO4nSjs1jLdXYdz5q3a4L0NoabZfbdxVb+CUEHfB0bpulZQtH1Rv
38e/lIdP7OTTIlZh6OYL6NhxP8So0/sht/4J9mqIGxRFc0/pC8suja+wcIUna0HB
pXKfXTKpzgis+zmXDL06ASJf5E4A2/m+Hp6b84sfPAwQ766rI65mh50S0Di9E3Pn
2WcaJc+PILsBmYpgtmgWTR9eV9otfKRUBfzHUHcVgarub/XluEpRlTtZudU5xbFN
xx/DgMrXLUAPaI60fZ6wA+PTAgMBAAGjggGBMIIBfTAfBgNVHSMEGDAWgBRWc1hk
lfmSGrASKgRieaFAFYghSTAdBgNVHQ4EFgQUaMASFhgOr872h6YyV6NGUV3LBycw
DgYDVR0PAQH/BAQDAgGGMBIGA1UdEwEB/wQIMAYBAf8CAQAwHQYDVR0lBBYwFAYI
KwYBBQUHAwEGCCsGAQUFBwMCMBsGA1UdIAQUMBIwBgYEVR0gADAIBgZngQwBAgEw
VAYDVR0fBE0wSzBJoEegRYZDaHR0cDovL2NybC5zZWN0aWdvLmNvbS9TZWN0aWdv
UHVibGljU2VydmVyQXV0aGVudGljYXRpb25Sb290UjQ2LmNybDCBhAYIKwYBBQUH
AQEEeDB2ME8GCCsGAQUFBzAChkNodHRwOi8vY3J0LnNlY3RpZ28uY29tL1NlY3Rp
Z29QdWJsaWNTZXJ2ZXJBdXRoZW50aWNhdGlvblJvb3RSNDYucDdjMCMGCCsGAQUF
BzABhhdodHRwOi8vb2NzcC5zZWN0aWdvLmNvbTANBgkqhkiG9w0BAQwFAAOCAgEA
YtOC9Fy+TqECFw40IospI92kLGgoSZGPOSQXMBqmsGWZUQ7rux7cj1du6d9rD6C8
ze1B2eQjkrGkIL/OF1s7vSmgYVafsRoZd/IHUrkoQvX8FZwUsmPu7amgBfaY3g+d
q1x0jNGKb6I6Bzdl6LgMD9qxp+3i7GQOnd9J8LFSietY6Z4jUBzVoOoz8iAU84OF
h2HhAuiPw1ai0VnY38RTI+8kepGWVfGxfBWzwH9uIjeooIeaosVFvE8cmYUB4TSH
5dUyD0jHct2+8ceKEtIoFU/FfHq/mDaVnvcDCZXtIgitdMFQdMZaVehmObyhRdDD
4NQCs0gaI9AAgFj4L9QtkARzhQLNyRf87Kln+YU0lgCGr9HLg3rGO8q+Y4ppLsOd
unQZ6ZxPNGIfOApbPVf5hCe58EZwiWdHIMn9lPP6+F404y8NNugbQixBber+x536
WrZhFZLjEkhp7fFXf9r32rNPfb74X/U90Bdy4lzp3+X1ukh1BuMxA/EEhDoTOS3l
7ABvc7BYSQubQ2490OcdkIzUh3ZwDrakMVrbaTxUM2p24N6dB+ns2zptWCva6jzW
r8IWKIMxzxLPv5Kt3ePKcUdvkBU/smqujSczTzzSjIoR5QqQA6lN1ZRSnuHIWCvh
JEltkYnTAH41QJ6SAWO66GrrUESwN/cgZzL4JLEqz1Y=
-----END CERTIFICATE-----`;

const tresguerrasHttpClient = Deno.createHttpClient({
  caCerts: [SECTIGO_PUBLIC_SERVER_AUTHENTICATION_CA_DV_R36_PEM],
  unsafelyIgnoreCertificateErrors: ['www.tresguerras.com.mx'],
});

const HTML_ENTITY_MAP: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  uuml: 'ü',
  Uuml: 'Ü',
  ordm: 'º',
  iquest: '¿',
  iexcl: '¡',
};

const jsonRes = (status: number, payload?: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(payload ?? {}), {
    status,
    headers: {
      ...corsHeaders,
      ...(status === 204 ? {} : { 'Content-Type': 'application/json' }),
    },
  });

const compactSpaces = (value: string) => value.replace(/\s+/g, ' ').trim();

const sanitizeTrackingNumber = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&([A-Za-z]+);/g, (match, code) => HTML_ENTITY_MAP[code] ?? match)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');

const htmlToText = (html: string) =>
  decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|td|th|section|article|h1|h2|h3|h4|h5|h6|table)>/gi, '\n')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );

const toLines = (value: string) =>
  value
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => compactSpaces(line))
    .filter(Boolean);

const extractAfterLabel = (sourceText: string, labels: string[]) => {
  const lines = toLines(sourceText);
  const normalizedLabels = labels.map((label) => normalizeText(label));

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const normalizedLine = normalizeText(line);
    const matchedLabel = normalizedLabels.find((label) => normalizedLine.includes(label));
    if (!matchedLabel) {
      continue;
    }

    const inline = compactSpaces(line.replace(/^[^:]*:/, '').replace(/^[-\s]+/, ''));
    if (inline && normalizeText(inline) !== matchedLabel) {
      return inline;
    }

    const nextLine = lines[index + 1];
    if (nextLine) {
      return nextLine;
    }
  }

  return '';
};

const extractBlockAfterLabel = (sourceText: string, labels: string[], maxLines = 4) => {
  const lines = toLines(sourceText);
  const normalizedLabels = labels.map((label) => normalizeText(label));

  for (let index = 0; index < lines.length; index += 1) {
    const normalizedLine = normalizeText(lines[index]);
    if (!normalizedLabels.some((label) => normalizedLine.includes(label))) {
      continue;
    }

    const block: string[] = [];
    for (let lookAhead = 1; lookAhead <= maxLines; lookAhead += 1) {
      const nextLine = lines[index + lookAhead];
      if (!nextLine) {
        break;
      }

      const normalizedNextLine = normalizeText(nextLine);
      if (
        normalizedLabels.some((label) => normalizedNextLine.includes(label)) ||
        normalizedNextLine.startsWith('telefono') ||
        normalizedNextLine.startsWith('tel') ||
        normalizedNextLine.startsWith('contacto')
      ) {
        break;
      }

      block.push(nextLine);
    }

    if (block.length > 0) {
      return compactSpaces(block.join(' · '));
    }
  }

  return '';
};

const extractFirstDate = (value: string) => {
  const match = value.match(/\b(\d{4}[-/]\d{2}[-/]\d{2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/);
  return match?.[1] || '';
};

const parseDateToIso = (value: string) => {
  const raw = compactSpaces(value);
  const isoMatch = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const dayFirstMatch = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (!dayFirstMatch) {
    return '';
  }

  const year = dayFirstMatch[3].length === 2 ? `20${dayFirstMatch[3]}` : dayFirstMatch[3];
  return `${year}-${dayFirstMatch[2].padStart(2, '0')}-${dayFirstMatch[1].padStart(2, '0')}`;
};

const toIsoDate = (value: string) => (/^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : parseDateToIso(value));

const SPANISH_MONTHS: Record<string, string> = {
  enero: '01',
  febrero: '02',
  marzo: '03',
  abril: '04',
  mayo: '05',
  junio: '06',
  julio: '07',
  agosto: '08',
  septiembre: '09',
  setiembre: '09',
  octubre: '10',
  noviembre: '11',
  diciembre: '12',
};

const parseSpanishDateTime = (value: string) => {
  const raw = compactSpaces(value);
  const normalized = normalizeText(raw);
  const match = normalized.match(
    /(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+del?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/i,
  );

  if (!match) {
    const directDate = parseDateToIso(extractFirstDate(raw));
    if (!directDate) {
      return raw;
    }

    const timeMatch = raw.match(/\b(\d{1,2}):(\d{2})\b/);
    if (!timeMatch) {
      return `${directDate}T00:00:00`;
    }

    return `${directDate}T${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}:00`;
  }

  const month = SPANISH_MONTHS[match[2]] || '01';
  const datePart = `${match[3]}-${month}-${match[1].padStart(2, '0')}`;
  if (!match[4] || !match[5]) {
    return `${datePart}T00:00:00`;
  }

  return `${datePart}T${match[4].padStart(2, '0')}:${match[5]}:00`;
};

const parseUsDateTime = (value: string) => {
  const raw = compactSpaces(value);
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM))?$/i);
  if (!match) {
    return raw;
  }

  let hour = Number(match[4] || '0');
  const minute = (match[5] || '00').padStart(2, '0');
  const second = (match[6] || '00').padStart(2, '0');
  const meridiem = (match[7] || '').toUpperCase();
  if (meridiem === 'PM' && hour < 12) {
    hour += 12;
  }
  if (meridiem === 'AM' && hour === 12) {
    hour = 0;
  }

  return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}T${String(hour).padStart(
    2,
    '0',
  )}:${minute}:${second}`;
};

const normalizeStatusFromText = (value: string): TrackingStatus => {
  const normalized = normalizeText(value);

  if (
    normalized.includes('embarque entregado') ||
    normalized.includes('entregado en sucursal') ||
    normalized.includes('entregado al destinatario') ||
    normalized.includes('entregado a destinatario') ||
    normalized.includes('entrega finalizada') ||
    normalized.includes('pieza entregada a destinatario') ||
    normalized.includes('envio entregado por el transportista') ||
    normalized.includes('envio entregado al destinatario') ||
    normalized.includes('delivery completed') ||
    normalized.includes('proof of delivery') ||
    normalized.includes('recibio ')
  ) {
    return 'entregado';
  }

  if (
    normalized.includes('en reparto') ||
    normalized.includes('en ruta de entrega') ||
    normalized.includes('out for delivery') ||
    normalized.includes('cliente de ocurre avisado') ||
    normalized.includes('en sucursal para entrega') ||
    normalized.includes('despacho en reparto') ||
    normalized.includes('repartidor llego al punto de entrega') ||
    normalized.includes('envio en despacho al destinatario') ||
    normalized.includes('en despacho hacia destino') ||
    normalized.includes('disponible en punto')
  ) {
    return 'en_reparto';
  }

  if (
    normalized.includes('incidencia') ||
    normalized.includes('exception') ||
    normalized.includes('problema') ||
    normalized.includes('retenido') ||
    normalized.includes('retraso') ||
    normalized.includes('delay')
  ) {
    return 'incidencia';
  }

  if (
    normalized.includes('en transito') ||
    normalized.includes('in transit') ||
    normalized.includes('transito entre sucursales') ||
    normalized.includes('arribo de viaje') ||
    normalized.includes('reembarcado') ||
    normalized.includes('despachado a sucursal') ||
    normalized.includes('recibido en bodega') ||
    normalized.includes('shipment picked up') ||
    normalized.includes('envio recepcionado por chilexpress') ||
    normalized.includes('recibido por chilexpress') ||
    normalized.includes('envio retirado por chilexpress')
  ) {
    return 'en_transito';
  }

  if (
    normalized.includes('etiqueta generada') ||
    normalized.includes('label created') ||
    normalized.includes('guia generada') ||
    normalized.includes('orden de transporte creada')
  ) {
    return 'etiqueta_generada';
  }

  if (normalized.includes('pendiente')) {
    return 'pendiente_consulta';
  }

  return 'capturado';
};

const buildFulfillmentState = (status: TrackingStatus): FulfillmentState =>
  status === 'entregado' ? 'entregado' : 'pendiente';

const extractTableRows = (html: string) => {
  const rows: string[][] = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;

  for (const rowMatch of html.matchAll(rowRegex)) {
    const cells = Array.from(rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi))
      .map((cellMatch) => compactSpaces(htmlToText(cellMatch[1])))
      .filter(Boolean);

    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  return rows;
};

const getCookieHeader = (response: Response) => {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const getSetCookie = typeof headers.getSetCookie === 'function' ? headers.getSetCookie.bind(headers) : null;
  const setCookies = getSetCookie ? getSetCookie() : [];
  if (Array.isArray(setCookies) && setCookies.length > 0) {
    return setCookies.map((cookie) => cookie.split(';')[0].trim()).filter(Boolean).join('; ');
  }

  const singleCookie = response.headers.get('set-cookie');
  if (!singleCookie) {
    return '';
  }

  return singleCookie
    .split(/,(?=\s*[A-Za-z0-9_.-]+=)/)
    .map((cookie) => cookie.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
};

const mergeCookieHeaders = (...parts: string[]) =>
  Array.from(
    new Set(
      parts
        .join('; ')
        .split(/;\s*(?=[A-Za-z0-9_.-]+=)/)
        .map((item) => compactSpaces(item))
        .filter(Boolean),
    ),
  ).join('; ');

const buildSuccessResponse = (
  carrier: TrackingCarrier,
  trackingNumber: string,
  payload: Omit<TrackingLookupResponse, 'carrier' | 'lookupMode' | 'ok' | 'trackingNumber'>,
): TrackingLookupResponse => ({
  ok: true,
  lookupMode: 'live',
  carrier,
  trackingNumber,
  ...payload,
});

const buildErrorResponse = (
  carrier: TrackingCarrier,
  trackingNumber: string,
  error: string,
  lookupMode: 'live' | 'manual_only' = 'live',
): TrackingLookupResponse => ({
  ok: false,
  lookupMode,
  carrier,
  trackingNumber,
  error,
});

const resolveDhlApiKey = () =>
  Deno.env.get('DHL_API_KEY')?.trim() || Deno.env.get('DHL_TRACKING_API_KEY')?.trim() || '';

const normalizeDhlStatus = (description: string, statusCode: string): TrackingStatus => {
  const normalized = normalizeText(description);
  const normalizedCode = normalizeText(statusCode);

  if (
    normalizedCode === 'delivered' ||
    normalized.includes('entregado') ||
    normalized.includes('proof of delivery') ||
    normalized.includes('firmado')
  ) {
    return 'entregado';
  }

  if (
    normalized.includes('mensajero para su entrega') ||
    normalized.includes('out for delivery') ||
    normalized.includes('disponible para recolectar') ||
    normalized.includes('recolectado por el destinatario')
  ) {
    return 'en_reparto';
  }

  if (
    normalized.includes('exception') ||
    normalized.includes('demora') ||
    normalized.includes('problema') ||
    normalized.includes('retenido') ||
    normalized.includes('incidencia')
  ) {
    return 'incidencia';
  }

  if (
    normalizedCode === 'transit' ||
    normalized.includes('procesado') ||
    normalized.includes('ha salido de una estacion') ||
    normalized.includes('arribado a una estacion') ||
    normalized.includes('retirado/recolectado') ||
    normalized.includes('shipment picked up') ||
    normalized.includes('transito')
  ) {
    return 'en_transito';
  }

  if (normalized.includes('informacion recibida') || normalized.includes('label created')) {
    return 'etiqueta_generada';
  }

  return 'pendiente_consulta';
};

const buildDhlTimeline = (events: unknown[]) =>
  events
    .map((event) => {
      const current = event as {
        description?: string;
        location?: { address?: { addressLocality?: string } };
        timestamp?: string;
        pieceIds?: string[];
      };

      return {
        label: compactSpaces(current.description || ''),
        location: compactSpaces(current.location?.address?.addressLocality || ''),
        timestamp: current.timestamp || '',
        note: Array.isArray(current.pieceIds) ? compactSpaces(current.pieceIds.join(', ')) : '',
      };
    })
    .filter((event) => event.label || event.location || event.timestamp || event.note);

const buildDhlResponse = (trackingNumber: string, shipment: Record<string, unknown>): TrackingLookupResponse => {
  const status = (shipment.status as Record<string, unknown> | undefined) || {};
  const details = (shipment.details as Record<string, unknown> | undefined) || {};
  const origin = (shipment.origin as Record<string, unknown> | undefined) || {};
  const destination = (shipment.destination as Record<string, unknown> | undefined) || {};
  const product = (details.product as Record<string, unknown> | undefined) || {};
  const proofOfDelivery = (details.proofOfDelivery as Record<string, unknown> | undefined) || {};
  const description = compactSpaces(String(status.description || ''));
  const remark = compactSpaces(String(status.remark || ''));
  const nextSteps = compactSpaces(String(status.nextSteps || ''));
  const normalizedStatus = normalizeDhlStatus(`${description} ${remark} ${nextSteps}`, String(status.statusCode || ''));
  const events = Array.isArray(shipment.events) ? shipment.events : [];
  const timeline = buildDhlTimeline(events);
  const rawSummary = JSON.stringify(
    {
      id: shipment.id || trackingNumber,
      service: product.productName || shipment.service || '',
      status,
      origin: ((origin.address as Record<string, unknown> | undefined)?.addressLocality as string | undefined) || '',
      destination:
        ((destination.address as Record<string, unknown> | undefined)?.addressLocality as string | undefined) || '',
      events,
    },
    null,
    2,
  ).slice(0, 6000);

  return buildSuccessResponse('dhl', trackingNumber, {
    status: normalizedStatus,
    fulfillmentState: buildFulfillmentState(normalizedStatus),
    portalStatusText: description || remark || 'Sin descripcion disponible en DHL.',
    lastEventLabel: remark || description || 'Sin evento visible',
    lastEventAt: String(status.timestamp || ''),
    estimatedDelivery: toIsoDate(
      String(
        shipment.estimatedTimeOfDelivery ||
          shipment.estimatedDeliveryDate ||
          (shipment.delivery as Record<string, unknown> | undefined)?.estimated ||
          status.estimatedDelivery ||
          '',
      ),
    ),
    recipient: compactSpaces(String((details.consignee as Record<string, unknown> | undefined)?.name || '')),
    origin: compactSpaces(String((origin.address as Record<string, unknown> | undefined)?.addressLocality || '')),
    destination: compactSpaces(
      String((destination.address as Record<string, unknown> | undefined)?.addressLocality || ''),
    ),
    serviceType: compactSpaces(String(product.productName || shipment.service || '')),
    deliveryProofName: compactSpaces(String(proofOfDelivery.signatory || '')),
    timeline,
    rawSummary,
    note: [remark, nextSteps].filter(Boolean).join(' · '),
  });
};

const parseDhlErrorMessage = async (response: Response) => {
  let detail = '';

  try {
    const payload = (await response.clone().json()) as { title?: string; detail?: string };
    detail = compactSpaces([payload.title, payload.detail].filter(Boolean).join(': '));
  } catch {
    try {
      detail = compactSpaces(await response.clone().text());
    } catch {
      detail = '';
    }
  }

  if (response.status === 401 || response.status === 403) {
    return 'DHL rechazó la llave configurada. Verifica el secreto DHL_API_KEY en Supabase.';
  }

  if (response.status === 404) {
    return 'DHL no encontró información para esa guía.';
  }

  if (response.status === 429) {
    return 'DHL rechazó la consulta por límite de uso. Espera unos segundos e inténtalo otra vez.';
  }

  if (detail) {
    return `DHL respondió ${response.status}: ${detail}`;
  }

  return `DHL respondió con ${response.status}.`;
};

const requestDhlTracking = async (trackingNumber: string, includeServiceHint = true) => {
  const apiKey = resolveDhlApiKey();
  if (!apiKey) {
    return buildErrorResponse(
      'dhl',
      trackingNumber,
      'Falta configurar el secreto DHL_API_KEY en Supabase. La demo-key oficial de DHL solo devuelve datos simulados y no sirve para guías reales.',
      'manual_only',
    );
  }

  if (apiKey === 'demo-key') {
    return buildErrorResponse(
      'dhl',
      trackingNumber,
      'La integración de DHL está usando demo-key. Esa llave oficial solo entrega respuestas simuladas; carga DHL_API_KEY con una llave aprobada para obtener datos reales.',
      'manual_only',
    );
  }

  const params = new URLSearchParams({
    trackingNumber,
    requesterCountryCode: 'MX',
    language: 'es',
  });

  if (includeServiceHint) {
    params.set('service', 'express');
  }

  const response = await fetch(`${DHL_TRACKING_API_URL}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'DHL-API-Key': apiKey,
    },
  });

  if (!response.ok) {
    return buildErrorResponse(
      'dhl',
      trackingNumber,
      await parseDhlErrorMessage(response),
      response.status === 401 || response.status === 403 ? 'manual_only' : 'live',
    );
  }

  const payload = (await response.json()) as { shipments?: Record<string, unknown>[] };
  const shipment = Array.isArray(payload.shipments) ? payload.shipments[0] : null;

  if (!shipment && includeServiceHint) {
    return requestDhlTracking(trackingNumber, false);
  }

  if (!shipment) {
    return buildErrorResponse('dhl', trackingNumber, 'DHL no devolvió un embarque visible para esa guía.');
  }

  return buildDhlResponse(trackingNumber, shipment);
};

const parseTresguerrasResult = (trackingNumber: string, html: string): TrackingLookupResponse => {
  const bodyText = htmlToText(html);
  const rawSummary = compactSpaces(bodyText).slice(0, 6000);
  const portalStatusText = extractAfterLabel(bodyText, ['Estado']) || extractAfterLabel(bodyText, ['Embarque']);
  const estimatedDelivery = parseDateToIso(
    extractAfterLabel(bodyText, ['Fecha de entrega', 'Fecha estimada de entrega']) ||
      extractFirstDate(bodyText.match(/FECHA DE ENTREGA[\s\S]{0,60}/i)?.[0] || ''),
  );
  const serviceType = extractAfterLabel(bodyText, ['Servicio', 'Tipo serv']);
  const deliveryProofName = extractAfterLabel(bodyText, ['Recibió', 'Recibio']);
  const recipient = deliveryProofName || extractAfterLabel(bodyText, ['Destinatario']);
  const origin = extractAfterLabel(bodyText, ['Remitente']);
  const destination = extractAfterLabel(bodyText, ['Destino', 'Locación', 'Locacion']);

  const timeline = extractTableRows(html)
    .filter((cells) => cells.length >= 3)
    .filter((cells) => !normalizeText(cells[0]).includes('estado'))
    .map((cells) => ({
      label: cells[0],
      location: cells[1] || '',
      timestamp: parseSpanishDateTime(cells[2] || ''),
      note: cells.slice(3).join(' · '),
    }))
    .filter((event) => event.label);

  if (!portalStatusText && timeline.length === 0) {
    return buildErrorResponse(
      'tresguerras',
      trackingNumber,
      'Tresguerras no devolvió un estado utilizable para esta guía.',
    );
  }

  const lastEvent = timeline[timeline.length - 1];
  const status = normalizeStatusFromText(portalStatusText || lastEvent?.label || '');

  return buildSuccessResponse('tresguerras', trackingNumber, {
    status,
    fulfillmentState: buildFulfillmentState(status),
    portalStatusText: portalStatusText || lastEvent?.label || 'Sin estatus textual',
    lastEventLabel: lastEvent?.label || portalStatusText || 'Sin evento reciente',
    lastEventAt: lastEvent?.timestamp || '',
    estimatedDelivery,
    recipient,
    origin,
    destination,
    serviceType,
    deliveryProofName,
    timeline,
    rawSummary,
  });
};

const fetchTresguerrasTracking = async (trackingNumber: string) => {
  const response = await fetch('https://www.tresguerras.com.mx/3G/assets/Ajax/tracking_Ajax.php', {
    client: tresguerrasHttpClient,
    method: 'POST',
    headers: {
      ...BROWSER_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: 'https://www.tresguerras.com.mx/3G/tracking.php',
      Origin: 'https://www.tresguerras.com.mx',
    },
    body: new URLSearchParams({
      idTalon: trackingNumber,
      action: 'Talones',
      esKiosko: 'false',
    }),
  });

  if (!response.ok) {
    throw new Error(`Tresguerras respondió con ${response.status}.`);
  }

  const html = await response.text();
  return parseTresguerrasResult(trackingNumber, html);
};

const fetchEstafetaToken = async () => {
  const response = await fetch('https://cs.estafeta.com', {
    headers: {
      ...BROWSER_HEADERS,
      Referer: 'https://www.estafeta.com/rastrear-envio?rastreo=true',
    },
  });

  if (!response.ok) {
    throw new Error(`Estafeta respondió con ${response.status} al solicitar el formulario.`);
  }

  const html = await response.text();
  const tokenMatch = html.match(/name="__RequestVerificationToken"\s+type="hidden"\s+value="([^"]+)"/i);
  if (!tokenMatch?.[1]) {
    throw new Error('Estafeta no entregó el token del formulario de rastreo.');
  }

  return tokenMatch[1];
};

const parseEstafetaResult = (trackingNumber: string, html: string): TrackingLookupResponse => {
  const bodyText = htmlToText(html);
  const rawSummary = compactSpaces(bodyText).slice(0, 6000);
  const normalizedBody = normalizeText(bodyText);

  if (
    normalizedBody.includes('no se encontro informacion') ||
    normalizedBody.includes('no hay informacion de este numero de guia') ||
    normalizedBody.includes('no hay informacion de este numero de guia en el sistema')
  ) {
    return buildErrorResponse(
      'estafeta',
      trackingNumber,
      'Estafeta no encontró información para esa guía o código de rastreo.',
    );
  }

  const portalStatusText = extractAfterLabel(bodyText, ['Estado', 'Estatus', 'Status']);
  const estimatedDelivery = parseDateToIso(
    extractAfterLabel(bodyText, ['Fecha estimada de entrega', 'Entrega estimada', 'Fecha de entrega']) ||
      extractFirstDate(bodyText.match(/entrega[\s\S]{0,60}/i)?.[0] || ''),
  );
  const serviceType = extractAfterLabel(bodyText, ['Servicio', 'Tipo de servicio']);
  const deliveryProofName = extractAfterLabel(bodyText, ['Recibió', 'Recibio', 'Recibe']);
  const recipient = deliveryProofName || extractAfterLabel(bodyText, ['Destinatario']);
  const origin = extractAfterLabel(bodyText, ['Origen', 'Remitente']);
  const destination = extractAfterLabel(bodyText, ['Destino']);

  const timeline = extractTableRows(html)
    .filter((cells) => cells.length >= 2)
    .filter((cells) => !normalizeText(cells[0]).includes('estado'))
    .map((cells) => ({
      label: cells[0],
      location: cells[1] || '',
      timestamp: parseSpanishDateTime(cells[2] || cells[1] || ''),
      note: cells.slice(2).join(' · '),
    }))
    .filter((event) => event.label);

  const lastEvent = timeline[timeline.length - 1];
  const inferredText = portalStatusText || lastEvent?.label || '';
  if (!inferredText && !estimatedDelivery && !recipient && !destination) {
    return buildErrorResponse(
      'estafeta',
      trackingNumber,
      'Estafeta respondió, pero no devolvió un estado reconocible para esa guía.',
    );
  }

  const status = normalizeStatusFromText(inferredText || rawSummary);

  return buildSuccessResponse('estafeta', trackingNumber, {
    status,
    fulfillmentState: buildFulfillmentState(status),
    portalStatusText: inferredText || 'Sin estatus textual',
    lastEventLabel: lastEvent?.label || inferredText || 'Sin evento reciente',
    lastEventAt: lastEvent?.timestamp || '',
    estimatedDelivery,
    recipient,
    origin,
    destination,
    serviceType,
    deliveryProofName,
    timeline,
    rawSummary,
  });
};

const fetchEstafetaTracking = async (trackingNumber: string) => {
  const token = await fetchEstafetaToken();
  const response = await fetch('https://cs.estafeta.com/', {
    method: 'POST',
    headers: {
      ...BROWSER_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: 'https://cs.estafeta.com/',
      Origin: 'https://cs.estafeta.com',
    },
    redirect: 'follow',
    body: new URLSearchParams({
      __RequestVerificationToken: token,
      submitValue: '1',
      GuiaCodigo: trackingNumber,
      Cliente: '',
      Referencia: '',
      RangoReferencia: '',
    }),
  });

  if (!response.ok) {
    throw new Error(`Estafeta respondió con ${response.status}.`);
  }

  const html = await response.text();
  return parseEstafetaResult(trackingNumber, html);
};

const buildChilexpressHeaders = (accessToken?: string, contentType = 'application/json') => {
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    'ocp-apim-subscription-key': CHILEXPRESS_SUBSCRIPTION_KEY,
    'ocp-apim-trace': 'true',
    Referer: `${CHILEXPRESS_ORIGIN}/`,
    Origin: CHILEXPRESS_ORIGIN,
    'User-Agent': BROWSER_HEADERS['User-Agent'],
    'Accept-Language': BROWSER_HEADERS['Accept-Language'],
  };

  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
};

const requestChilexpressAccessToken = async () => {
  if (!CHILEXPRESS_CLIENT_SECRET) {
    throw new Error('Falta configurar CHILEXPRESS_CLIENT_SECRET para habilitar Chilexpress en el backend.');
  }

  const response = await fetch(CHILEXPRESS_TOKEN_URL, {
    method: 'POST',
    headers: buildChilexpressHeaders(undefined, 'application/x-www-form-urlencoded'),
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CHILEXPRESS_CLIENT_ID,
      scope: CHILEXPRESS_SCOPE,
      client_secret: CHILEXPRESS_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    throw new Error(`Chilexpress no autorizó el token de consulta (${response.status}).`);
  }

  const payload = (await response.json()) as { access_token?: string };
  const accessToken = compactSpaces(String(payload.access_token || ''));
  if (!accessToken) {
    throw new Error('Chilexpress no devolvió un token de acceso utilizable.');
  }

  return accessToken;
};

const extractChilexpressLocation = (label: string) => {
  const inPlaceMatch = label.match(/env[ií]o en (.+)$/i);
  if (inPlaceMatch?.[1]) {
    return compactSpaces(inPlaceMatch[1]);
  }

  const towardsMatch = label.match(/hacia (.+)$/i);
  if (towardsMatch?.[1]) {
    return compactSpaces(towardsMatch[1]);
  }

  return '';
};

const parseChilexpressResult = (
  trackingNumber: string,
  suggestionPayload: Record<string, unknown>,
  timelinePayload: Record<string, unknown>,
): TrackingLookupResponse => {
  const suggestion = (suggestionPayload.data as Record<string, unknown> | undefined) || {};
  const timelineStatusDescription = compactSpaces(String(timelinePayload.statusDescription || ''));

  if (
    Number(suggestionPayload.resultado || 0) < 0 ||
    Number(timelinePayload.statusCode || 0) >= 400 ||
    normalizeText(timelineStatusDescription).includes('ot no existe')
  ) {
    return buildErrorResponse(
      'chilexpress',
      trackingNumber,
      'Chilexpress no encontró información para esa OT.',
    );
  }

  const rawStages = Array.isArray(timelinePayload.etapas)
    ? (timelinePayload.etapas[0] as Record<string, unknown> | undefined)
    : undefined;
  const stages = rawStages
    ? Object.values(rawStages)
        .filter((stage) => Boolean(stage) && typeof stage === 'object')
        .map((stage) => stage as Record<string, unknown>)
        .filter((stage) => 'etapa' in stage)
        .sort((left, right) => Number(left.etapa || 0) - Number(right.etapa || 0))
    : [];

  const activeStage = stages.find((stage) => Boolean(stage.etapaActiva)) || stages[stages.length - 1];
  const timeline = stages
    .flatMap((stage) =>
      Array.isArray(stage.detalles)
        ? stage.detalles.map((detail) => ({
            label: compactSpaces(String((detail as Record<string, unknown>).gls_tracking || '')),
            location: extractChilexpressLocation(compactSpaces(String((detail as Record<string, unknown>).gls_tracking || ''))),
            timestamp: parseUsDateTime(compactSpaces(String((detail as Record<string, unknown>).fec_track || ''))),
            note: compactSpaces(String(stage.titulo || '')),
          }))
        : [],
    )
    .filter((event) => event.label)
    .sort((left, right) => Date.parse(left.timestamp || '1970-01-01') - Date.parse(right.timestamp || '1970-01-01'));

  const lastEvent = timeline[timeline.length - 1];
  const portalStatusText = compactSpaces(
    String(activeStage?.titulo || lastEvent?.label || suggestion.glosaEstado || timelineStatusDescription || ''),
  );
  if (!portalStatusText && timeline.length === 0) {
    return buildErrorResponse(
      'chilexpress',
      trackingNumber,
      'Chilexpress respondió, pero no devolvió un estado reconocible para esa OT.',
    );
  }

  const status = normalizeStatusFromText(`${portalStatusText} ${lastEvent?.label || ''}`);
  const originParts = [suggestion.nombreRemitente, suggestion.comunaDevolucion]
    .map((value) => compactSpaces(String(value || '')))
    .filter(Boolean);
  const destinationParts = [
    suggestion.direccionDestinatario,
    suggestion.compDireccionDestinatario,
    suggestion.comunaDestinatario,
  ]
    .map((value) => compactSpaces(String(value || '')))
    .filter(Boolean);
  const rawSummary = JSON.stringify(
    {
      suggestion,
      timeline: timelinePayload.etapas || [],
    },
    null,
    2,
  ).slice(0, 6000);

  return buildSuccessResponse('chilexpress', trackingNumber, {
    status,
    fulfillmentState: buildFulfillmentState(status),
    portalStatusText,
    lastEventLabel: lastEvent?.label || portalStatusText || 'Sin evento reciente',
    lastEventAt: lastEvent?.timestamp || '',
    estimatedDelivery: toIsoDate(String(suggestion.fecCompromiso || suggestion.fecEntrega || '')),
    recipient: compactSpaces(String(suggestion.nombreDestinatario || '')),
    origin: compactSpaces(originParts.join(' · ')),
    destination: compactSpaces(destinationParts.join(' · ')),
    serviceType: compactSpaces(
      [String(suggestion.servicio || ''), String(suggestion.descProducto || '')].filter(Boolean).join(' · '),
    ),
    deliveryProofName: compactSpaces(String(suggestion.nombreReceptor || '')),
    timeline,
    rawSummary,
    note: compactSpaces(String(suggestion.motivoResolucion || '')),
  });
};

const fetchChilexpressTracking = async (trackingNumber: string) => {
  const accessToken = await requestChilexpressAccessToken();
  const headers = buildChilexpressHeaders(accessToken);

  const [suggestionResponse, timelineResponse] = await Promise.all([
    fetch(`${CHILEXPRESS_LOOKUP_URL}?${new URLSearchParams({ nroot: trackingNumber }).toString()}`, { headers }),
    fetch(
      `${CHILEXPRESS_TIMELINE_URL}?${new URLSearchParams({ ot: trackingNumber, indPublico: '0' }).toString()}`,
      { headers },
    ),
  ]);

  if (!suggestionResponse.ok) {
    throw new Error(`Chilexpress respondió ${suggestionResponse.status} al solicitar la OT.`);
  }

  if (!timelineResponse.ok) {
    throw new Error(`Chilexpress respondió ${timelineResponse.status} al solicitar la línea de tiempo.`);
  }

  const suggestionPayload = (await suggestionResponse.json()) as Record<string, unknown>;
  const timelinePayload = (await timelineResponse.json()) as Record<string, unknown>;
  return parseChilexpressResult(trackingNumber, suggestionPayload, timelinePayload);
};

const resolveChibraCredentials = () => ({
  username: Deno.env.get('CHIBRA_USERNAME')?.trim() || Deno.env.get('CHIBRA_USER')?.trim() || '',
  password: Deno.env.get('CHIBRA_PASSWORD')?.trim() || '',
});

const extractChibraMetric = (html: string, labelPattern: string) => {
  const match = html.match(new RegExp(`<span[^>]*>\\s*${labelPattern}\\s*<\\/span>\\s*<div[^>]*>([\\s\\S]*?)<\\/div>`, 'i'));
  return compactSpaces(htmlToText(match?.[1] || ''));
};

const splitChibraBlock = (value: string) =>
  value
    .split(' · ')
    .map((item) => compactSpaces(item))
    .filter(Boolean);

const extractChibraDeliveryProof = (timeline: TrackingTimelineEvent[]) => {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const current = timeline[index];
    const deliveredMatch =
      current.label.match(/A:\s*(.+)$/i) ||
      current.label.match(/RECIBE:\s*([^)]+)/i) ||
      current.note.match(/RECIBE:\s*([^)]+)/i);
    if (deliveredMatch?.[1]) {
      return compactSpaces(deliveredMatch[1].replace(/\s+-\s+\d+$/, ''));
    }
  }

  return '';
};

const parseChibraResult = (trackingNumber: string, html: string): TrackingLookupResponse => {
  const bodyText = htmlToText(html);
  const rawSummary = compactSpaces(bodyText).slice(0, 6000);
  const originBlock = extractBlockAfterLabel(bodyText, ['Remitente'], 4);
  const recipientBlock = extractBlockAfterLabel(bodyText, ['Destinatario'], 4);
  const recipientParts = splitChibraBlock(recipientBlock);
  const portalStatusText = compactSpaces(
    htmlToText(
      html.match(
        /class="col-12 p-0 d-flex d-md-none justify-content-center text-uppercase">\s*<span class="h4">([\s\S]*?)<\/span>/i,
      )?.[1] || '',
    ),
  );
  const timeline = extractTableRows(html)
    .filter((cells) => /^\d{2}\/\d{2}\/\d{4}$/.test(cells[0] || '') && /^\d{2}:\d{2}$/.test(cells[1] || ''))
    .map((cells) => ({
      label: compactSpaces(cells[2] || ''),
      location: compactSpaces(cells[3] || ''),
      timestamp: `${parseDateToIso(cells[0] || '')}T${(cells[1] || '00:00').slice(0, 5)}:00`,
      note: compactSpaces(cells.slice(4).join(' · ')),
    }))
    .filter((event) => event.label);

  if (!portalStatusText && timeline.length === 0) {
    return buildErrorResponse('chibra', trackingNumber, 'Chibra no devolvió un estado utilizable para esta expedición.');
  }

  const lastEvent = timeline[timeline.length - 1];
  const status = normalizeStatusFromText(`${portalStatusText} ${lastEvent?.label || ''}`);

  return buildSuccessResponse('chibra', trackingNumber, {
    status,
    fulfillmentState: buildFulfillmentState(status),
    portalStatusText: portalStatusText || lastEvent?.label || 'Sin estatus textual',
    lastEventLabel: lastEvent?.label || portalStatusText || 'Sin evento reciente',
    lastEventAt: lastEvent?.timestamp || '',
    estimatedDelivery: parseDateToIso(extractChibraMetric(html, 'F\\. entrega') || extractChibraMetric(html, 'F\\. objetivo')),
    recipient: recipientParts[0] || extractAfterLabel(bodyText, ['Destinatario']),
    origin: originBlock || extractAfterLabel(bodyText, ['Remitente']),
    destination: compactSpaces(recipientParts.slice(1).join(' · ')) || recipientParts[0] || '',
    serviceType: extractChibraMetric(html, 'Producto\\s*\\/\\s*Servicio'),
    deliveryProofName: extractChibraDeliveryProof(timeline),
    timeline,
    rawSummary,
    note: compactSpaces(extractAfterLabel(bodyText, ['Incidencias']) || ''),
  });
};

const fetchChibraTracking = async (trackingNumber: string) => {
  const credentials = resolveChibraCredentials();
  if (!credentials.username || !credentials.password) {
    return buildErrorResponse(
      'chibra',
      trackingNumber,
      'Faltan CHIBRA_USERNAME y CHIBRA_PASSWORD en Supabase para consultar Chibra en automático.',
      'manual_only',
    );
  }

  const loginResponse = await fetch(CHIBRA_LOGIN_URL, {
    headers: {
      ...BROWSER_HEADERS,
      Referer: CHIBRA_LOGIN_URL,
    },
  });

  if (!loginResponse.ok) {
    throw new Error(`Chibra respondió con ${loginResponse.status} al solicitar la pantalla de acceso.`);
  }

  const loginHtml = await loginResponse.text();
  const loginAction = loginHtml.match(/<form id="loginForm"[^>]*action="([^"]+)"/i)?.[1];
  const loginViewState = loginHtml.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/i)?.[1];
  if (!loginAction || !loginViewState) {
    throw new Error('Chibra no entregó el formulario de autenticación esperado.');
  }

  const loginCookies = getCookieHeader(loginResponse);
  const authResponse = await fetch(new URL(loginAction, CHIBRA_BASE_URL), {
    method: 'POST',
    headers: {
      ...BROWSER_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: CHIBRA_LOGIN_URL,
      Origin: CHIBRA_BASE_URL,
      Cookie: loginCookies,
    },
    body: new URLSearchParams({
      loginForm: 'loginForm',
      'loginForm:inputLogin': credentials.username,
      'loginForm:inputPassword': credentials.password,
      'loginForm:submit_login': 'Entrar',
      'javax.faces.ViewState': loginViewState,
    }),
    redirect: 'manual',
  });

  const authCookies = mergeCookieHeaders(loginCookies, getCookieHeader(authResponse));
  const homeLocation = authResponse.headers.get('location');
  if (!homeLocation) {
    const authHtml = await authResponse.text();
    if (normalizeText(htmlToText(authHtml)).includes('login')) {
      return buildErrorResponse(
        'chibra',
        trackingNumber,
        'Chibra rechazó las credenciales configuradas en el backend.',
        'manual_only',
      );
    }

    throw new Error('Chibra no abrió la sesión de seguimiento después del login.');
  }

  const homeResponse = await fetch(new URL(homeLocation, CHIBRA_BASE_URL), {
    headers: {
      ...BROWSER_HEADERS,
      Referer: CHIBRA_LOGIN_URL,
      Cookie: authCookies,
    },
  });

  if (!homeResponse.ok) {
    throw new Error(`Chibra respondió con ${homeResponse.status} al abrir el home autenticado.`);
  }

  const homeCookies = mergeCookieHeaders(authCookies, getCookieHeader(homeResponse));
  const homeHtml = await homeResponse.text();
  const homeViewState = homeHtml.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/i)?.[1];
  if (!homeViewState) {
    throw new Error('Chibra no entregó el estado JSF necesario para la búsqueda rápida.');
  }

  const ajaxResponse = await fetch(`${CHIBRA_BASE_URL}/gts/priv/home/inicio.seam`, {
    method: 'POST',
    headers: {
      ...BROWSER_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Faces-Request': 'partial/ajax',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: new URL(homeLocation, CHIBRA_BASE_URL).toString(),
      Origin: CHIBRA_BASE_URL,
      Cookie: homeCookies,
    },
    body: new URLSearchParams({
      AJAXREQUEST: '_viewRoot',
      j_id22: 'j_id22',
      'j_id22:__centro_actual_id__': '0',
      'j_id22:j_id50': trackingNumber,
      'j_id22:j_id104': 'j_id22:j_id104',
      'j_id22:j_id104:printModalPanelOpenedState': '',
      'javax.faces.ViewState': homeViewState,
      'j_id22:j_id23': 'j_id22:j_id23',
    }),
    redirect: 'manual',
  });

  const resultLocation = ajaxResponse.headers.get('location');
  if (!resultLocation) {
    throw new Error('Chibra no devolvió una redirección de resultado utilizable.');
  }

  if (resultLocation.includes('/busqueda.seam')) {
    return buildErrorResponse('chibra', trackingNumber, 'Chibra no encontró una expedición exacta para ese tracking.');
  }

  if (!resultLocation.includes('/detalle2.seam')) {
    return buildErrorResponse(
      'chibra',
      trackingNumber,
      'Chibra devolvió una vista no reconocida para esta consulta.',
    );
  }

  const detailResponse = await fetch(new URL(resultLocation, CHIBRA_BASE_URL), {
    headers: {
      ...BROWSER_HEADERS,
      Referer: new URL(homeLocation, CHIBRA_BASE_URL).toString(),
      Cookie: mergeCookieHeaders(homeCookies, getCookieHeader(ajaxResponse)),
    },
  });

  if (!detailResponse.ok) {
    throw new Error(`Chibra respondió con ${detailResponse.status} al abrir el detalle de la expedición.`);
  }

  const detailHtml = await detailResponse.text();
  return parseChibraResult(trackingNumber, detailHtml);
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return jsonRes(204);
  }

  if (request.method !== 'POST') {
    return jsonRes(405, { ok: false, error: 'Metodo no permitido.' });
  }

  let body: TrackingLookupPayload = {};
  try {
    body = (await request.json()) as TrackingLookupPayload;
  } catch {
    return jsonRes(400, { ok: false, error: 'El cuerpo de la petición no contiene JSON válido.' });
  }

  const carrier = body.carrier;
  const trackingNumber = sanitizeTrackingNumber(body.trackingNumber || '');

  if (!carrier || !['dhl', 'estafeta', 'tresguerras', 'chilexpress', 'chibra'].includes(carrier)) {
    return jsonRes(400, { ok: false, error: 'La mensajería solicitada no es válida.' });
  }

  if (!trackingNumber) {
    return jsonRes(400, { ok: false, error: 'Falta el número de tracking.' });
  }

  try {
    if (carrier === 'dhl') {
      if (!/^\d{10}$/.test(trackingNumber)) {
        return jsonRes(200, buildErrorResponse(carrier, trackingNumber, 'DHL requiere una guía aérea de 10 dígitos.'));
      }

      return jsonRes(200, await requestDhlTracking(trackingNumber));
    }

    if (carrier === 'tresguerras') {
      return jsonRes(200, await fetchTresguerrasTracking(trackingNumber));
    }

    if (carrier === 'chilexpress') {
      if (!/^\d{10,12}$/.test(trackingNumber)) {
        return jsonRes(
          200,
          buildErrorResponse(carrier, trackingNumber, 'Chilexpress requiere una OT de 10 a 12 dígitos.'),
        );
      }

      return jsonRes(200, await fetchChilexpressTracking(trackingNumber));
    }

    if (carrier === 'chibra') {
      if (!/^\d{12}$/.test(trackingNumber)) {
        return jsonRes(
          200,
          buildErrorResponse(carrier, trackingNumber, 'Chibra requiere una expedición de 12 dígitos.'),
        );
      }

      return jsonRes(200, await fetchChibraTracking(trackingNumber));
    }

    return jsonRes(200, await fetchEstafetaTracking(trackingNumber));
  } catch (error) {
    return jsonRes(500, {
      ok: false,
      lookupMode: 'live',
      carrier,
      trackingNumber,
      error: error instanceof Error ? error.message : 'No fue posible resolver el tracking solicitado.',
    });
  }
});
