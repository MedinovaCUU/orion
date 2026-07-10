import http from 'node:http';
import https from 'node:https';
import process from 'node:process';
import { chromium } from 'playwright-core';

const PORT = Number(process.env.TRACKING_BROWSER_RELAY_PORT || '8788');
const USER_AGENT =
  process.env.TRACKING_BROWSER_USER_AGENT ||
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';
const EXECUTABLE_CANDIDATES = [
  process.env.TRACKING_BROWSER_EXECUTABLE_PATH,
  process.env.CHROME_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean);
const CHILEXPRESS_SUBSCRIPTION_KEY =
  process.env.CHILEXPRESS_SUBSCRIPTION_KEY || '7b878d2423f349e3b8bbb9b3607d4215';
const CHILEXPRESS_CLIENT_ID =
  process.env.CHILEXPRESS_CLIENT_ID || 'ea970f64-73db-4bdc-91f4-a0d58094b44b';
const CHILEXPRESS_CLIENT_SECRET = process.env.CHILEXPRESS_CLIENT_SECRET || '';
const CHILEXPRESS_SCOPE =
  process.env.CHILEXPRESS_SCOPE || 'api://ea970f64-73db-4bdc-91f4-a0d58094b44b/.default';
const CHILEXPRESS_ORIGIN = 'https://centrodeayuda.chilexpress.cl';
const CHILEXPRESS_TOKEN_URL =
  process.env.CHILEXPRESS_TOKEN_URL ||
  'https://services.wschilexpress.com/centroayuda/api/v1/api/v1/token';
const CHILEXPRESS_TIMELINE_URL =
  process.env.CHILEXPRESS_TIMELINE_URL ||
  'https://services.wschilexpress.com/centroayuda/api/v1/api/v1/TimeLine';
const CHILEXPRESS_LOOKUP_URL =
  process.env.CHILEXPRESS_LOOKUP_URL ||
  'https://services.wschilexpress.com/centroayuda/api/v1/api/sugerencia/bynroot';
const CHIBRA_BASE_URL = 'https://gtschibra.alertran.net';
const CHIBRA_LOGIN_URL = `${CHIBRA_BASE_URL}/gts/login.seam`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'content-type',
};

const BROWSER_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
};

const HTML_ENTITY_MAP = {
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

const compactSpaces = (value = '') => value.replace(/\s+/g, ' ').trim();

const normalizeText = (value = '') =>
  compactSpaces(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const sanitizeTrackingNumber = (value = '') => String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');

const toIsoDate = (value = '') => {
  const raw = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
};

const decodeHtmlEntities = (value = '') =>
  value
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&([A-Za-z]+);/g, (match, code) => HTML_ENTITY_MAP[code] || match)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');

const htmlToText = (html = '') =>
  decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|td|th|section|article|h1|h2|h3|h4|h5|h6|table)>/gi, '\n')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );

const toLines = (value = '') =>
  value
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => compactSpaces(line))
    .filter(Boolean);

const extractAfterLabel = (sourceText, labels) => {
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

const extractBlockAfterLabel = (sourceText, labels, maxLines = 4) => {
  const lines = toLines(sourceText);
  const normalizedLabels = labels.map((label) => normalizeText(label));

  for (let index = 0; index < lines.length; index += 1) {
    const normalizedLine = normalizeText(lines[index]);
    if (!normalizedLabels.some((label) => normalizedLine.includes(label))) {
      continue;
    }

    const block = [];
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

const extractFirstDate = (value = '') => {
  const match = value.match(/\b(\d{4}[-/]\d{2}[-/]\d{2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/);
  return match?.[1] || '';
};

const parseDateToIso = (value = '') => {
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

const SPANISH_MONTHS = {
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

const parseSpanishDateTime = (value = '') => {
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

const parseUsDateTime = (value = '') => {
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

const normalizeStatusFromText = (value = '') => {
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

const buildFulfillmentState = (status) => (status === 'entregado' ? 'entregado' : 'pendiente');

const extractTableRows = (html = '') => {
  const rows = [];
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

const getCookieHeader = (response) => {
  if (!response?.headers) {
    return '';
  }

  const getSetCookie =
    typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie.bind(response.headers) : null;
  const setCookies = getSetCookie ? getSetCookie() : [];
  if (Array.isArray(setCookies) && setCookies.length > 0) {
    return setCookies.map((cookie) => cookie.split(';')[0]).join('; ');
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

const mergeCookieHeaders = (...parts) =>
  Array.from(
    new Set(
      parts
        .join('; ')
        .split(/;\s*(?=[A-Za-z0-9_.-]+=)/)
        .map((item) => compactSpaces(item))
        .filter(Boolean),
    ),
  ).join('; ');

const json = (response, status, payload) => {
  response.writeHead(status, {
    ...corsHeaders,
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
};

const readJsonBody = (request) =>
  new Promise((resolve, reject) => {
    const chunks = [];

    request.on('data', (chunk) => {
      chunks.push(chunk);
    });

    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('El relay recibio un cuerpo JSON invalido.'));
      }
    });

    request.on('error', reject);
  });

const requestInsecureHttpsText = (urlString, { method = 'GET', headers = {}, body = '' } = {}) =>
  new Promise((resolve, reject) => {
    const target = new URL(urlString);
    const request = https.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        method,
        headers,
        rejectUnauthorized: false,
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => {
          chunks.push(chunk);
        });
        response.on('end', () => {
          resolve({
            status: response.statusCode || 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );

    request.on('error', reject);

    if (body) {
      request.write(typeof body === 'string' ? body : body.toString());
    }

    request.end();
  });

const buildSuccessResponse = (carrier, trackingNumber, payload) => ({
  ok: true,
  lookupMode: 'live',
  carrier,
  trackingNumber,
  ...payload,
});

const buildLookupError = (carrier, trackingNumber, error, lookupMode = 'live') => ({
  ok: false,
  lookupMode,
  carrier,
  trackingNumber,
  error:
    error instanceof Error
      ? error.message
      : compactSpaces(String(error || '')) || `No fue posible consultar ${carrier.toUpperCase()} desde el relay local.`,
});

let browserPromise = null;

const getBrowser = async () => {
  if (browserPromise) {
    return browserPromise;
  }

  browserPromise = (async () => {
    let lastError = null;

    for (const executablePath of EXECUTABLE_CANDIDATES) {
      try {
        return await chromium.launch({
          headless: true,
          executablePath,
          args: ['--disable-http2', '--disable-blink-features=AutomationControlled'],
        });
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(
      lastError instanceof Error
        ? `${lastError.message}. Define TRACKING_BROWSER_EXECUTABLE_PATH con la ruta de Chrome.`
        : 'No fue posible abrir Chrome para el relay de tracking.',
    );
  })().catch((error) => {
    browserPromise = null;
    throw error;
  });

  return browserPromise;
};

const closeBrowser = async () => {
  if (!browserPromise) {
    return;
  }

  try {
    const browser = await browserPromise;
    await browser.close();
  } catch {
    // ignore shutdown errors
  } finally {
    browserPromise = null;
  }
};

const normalizeDhlStatus = (description, statusCode) => {
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

const buildDhlTimeline = (events = []) =>
  events
    .map((event) => ({
      label: compactSpaces(event?.description || ''),
      location: compactSpaces(event?.location?.address?.addressLocality || ''),
      timestamp: event?.timestamp || '',
      note: Array.isArray(event?.pieceIds) ? compactSpaces(event.pieceIds.join(', ')) : '',
    }))
    .filter((event) => event.label || event.location || event.timestamp || event.note);

const buildDhlResponse = (trackingNumber, shipment) => {
  const description = compactSpaces(shipment?.status?.description || '');
  const remark = compactSpaces(shipment?.status?.remark || '');
  const nextSteps = compactSpaces(shipment?.status?.nextSteps || '');
  const normalizedStatus = normalizeDhlStatus(
    `${description} ${remark} ${nextSteps}`,
    shipment?.status?.statusCode || '',
  );
  const timeline = buildDhlTimeline(shipment?.events);
  const summary = JSON.stringify(
    {
      id: shipment?.id || trackingNumber,
      service: shipment?.details?.product?.productName || shipment?.service || '',
      status: shipment?.status || {},
      origin: shipment?.origin?.address?.addressLocality || '',
      destination: shipment?.destination?.address?.addressLocality || '',
      pieceIds: shipment?.details?.pieceIds || [],
      events: shipment?.events || [],
    },
    null,
    2,
  ).slice(0, 6000);

  return buildSuccessResponse('dhl', trackingNumber, {
    status: normalizedStatus,
    fulfillmentState: normalizedStatus === 'entregado' ? 'entregado' : 'pendiente',
    portalStatusText: description || remark || 'Sin descripcion disponible en DHL.',
    lastEventLabel: remark || description || 'Sin evento visible',
    lastEventAt: shipment?.status?.timestamp || '',
    estimatedDelivery: toIsoDate(
      shipment?.estimatedTimeOfDelivery ||
        shipment?.estimatedDeliveryDate ||
        shipment?.delivery?.estimated ||
        shipment?.status?.estimatedDelivery,
    ),
    recipient: compactSpaces(shipment?.details?.consignee?.name || ''),
    origin: compactSpaces(shipment?.origin?.address?.addressLocality || ''),
    destination: compactSpaces(shipment?.destination?.address?.addressLocality || ''),
    serviceType: compactSpaces(shipment?.details?.product?.productName || shipment?.service || ''),
    deliveryProofName: compactSpaces(shipment?.details?.proofOfDelivery?.signatory || ''),
    timeline,
    rawSummary: summary,
    note: [remark, nextSteps].filter(Boolean).join(' · '),
  });
};

const resolveDhlTracking = async (trackingNumber) => {
  const browser = await getBrowser();
  const context = await browser.newContext({
    locale: 'es-MX',
    userAgent: USER_AGENT,
  });

  try {
    const page = await context.newPage();
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes('/utapi?') && response.status() === 200,
      { timeout: 45000 },
    );

    await page.goto(
      `https://www.dhl.com/mx-es/home/rastreo.html?tracking-id=${encodeURIComponent(trackingNumber)}&submit=1`,
      { waitUntil: 'load', timeout: 45000 },
    );

    const response = await responsePromise;
    const payload = await response.json().catch(() => null);
    const shipment = payload?.shipments?.[0];

    if (!shipment) {
      throw new Error(`DHL no devolvio un embarque visible para ${trackingNumber}.`);
    }

    return buildDhlResponse(trackingNumber, shipment);
  } finally {
    await context.close();
  }
};

const parseTresguerrasResult = (trackingNumber, html) => {
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
    return buildLookupError(
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

const resolveTresguerrasTracking = async (trackingNumber) => {
  const response = await requestInsecureHttpsText('https://www.tresguerras.com.mx/3G/assets/Ajax/tracking_Ajax.php', {
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

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Tresguerras respondió con ${response.status}.`);
  }

  const html = response.body;
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

  return {
    token: tokenMatch[1],
    cookieHeader: getCookieHeader(response),
  };
};

const parseEstafetaResult = (trackingNumber, html) => {
  const bodyText = htmlToText(html);
  const rawSummary = compactSpaces(bodyText).slice(0, 6000);
  const normalizedBody = normalizeText(bodyText);

  if (
    normalizedBody.includes('no se encontro informacion') ||
    normalizedBody.includes('no hay informacion de este numero de guia') ||
    normalizedBody.includes('no hay informacion de este numero de guia en el sistema')
  ) {
    return buildLookupError(
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
    return buildLookupError(
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

const resolveEstafetaTracking = async (trackingNumber) => {
  const { token, cookieHeader } = await fetchEstafetaToken();
  const headers = {
    ...BROWSER_HEADERS,
    'Content-Type': 'application/x-www-form-urlencoded',
    Referer: 'https://cs.estafeta.com/',
    Origin: 'https://cs.estafeta.com',
  };

  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  const response = await fetch('https://cs.estafeta.com/', {
    method: 'POST',
    headers,
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

const buildChilexpressHeaders = (accessToken, contentType = 'application/json') => {
  const headers = {
    Accept: 'application/json, text/plain, */*',
    'ocp-apim-subscription-key': CHILEXPRESS_SUBSCRIPTION_KEY,
    'ocp-apim-trace': 'true',
    Referer: `${CHILEXPRESS_ORIGIN}/`,
    Origin: CHILEXPRESS_ORIGIN,
    'User-Agent': USER_AGENT,
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
    throw new Error('Chilexpress requiere CHILEXPRESS_CLIENT_SECRET en el relay local para consulta automática.');
  }

  const response = await fetch(CHILEXPRESS_TOKEN_URL, {
    method: 'POST',
    headers: buildChilexpressHeaders(null, 'application/x-www-form-urlencoded'),
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

  const payload = await response.json();
  const accessToken = compactSpaces(String(payload?.access_token || ''));
  if (!accessToken) {
    throw new Error('Chilexpress no devolvió un token de acceso utilizable.');
  }

  return accessToken;
};

const extractChilexpressLocation = (label = '') => {
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

const parseChilexpressResult = (trackingNumber, suggestionPayload, timelinePayload) => {
  const suggestion = suggestionPayload?.data || {};
  const timelineStatusDescription = compactSpaces(String(timelinePayload?.statusDescription || ''));

  if (
    Number(suggestionPayload?.resultado || 0) < 0 ||
    Number(timelinePayload?.statusCode || 0) >= 400 ||
    normalizeText(timelineStatusDescription).includes('ot no existe')
  ) {
    return buildLookupError('chilexpress', trackingNumber, 'Chilexpress no encontró información para esa OT.');
  }

  const rawStages = Array.isArray(timelinePayload?.etapas) ? timelinePayload.etapas[0] : null;
  const stages = rawStages
    ? Object.values(rawStages)
        .filter((stage) => stage && typeof stage === 'object' && 'etapa' in stage)
        .sort((left, right) => Number(left?.etapa || 0) - Number(right?.etapa || 0))
    : [];
  const activeStage = stages.find((stage) => Boolean(stage?.etapaActiva)) || stages[stages.length - 1];
  const timeline = stages
    .flatMap((stage) =>
      Array.isArray(stage?.detalles)
        ? stage.detalles.map((detail) => ({
            label: compactSpaces(detail?.gls_tracking || ''),
            location: extractChilexpressLocation(compactSpaces(detail?.gls_tracking || '')),
            timestamp: parseUsDateTime(compactSpaces(detail?.fec_track || '')),
            note: compactSpaces(stage?.titulo || ''),
          }))
        : [],
    )
    .filter((event) => event.label)
    .sort((left, right) => Date.parse(left.timestamp || '1970-01-01') - Date.parse(right.timestamp || '1970-01-01'));

  const lastEvent = timeline[timeline.length - 1];
  const portalStatusText = compactSpaces(
    String(activeStage?.titulo || lastEvent?.label || suggestion?.glosaEstado || timelineStatusDescription || ''),
  );
  if (!portalStatusText && timeline.length === 0) {
    return buildLookupError(
      'chilexpress',
      trackingNumber,
      'Chilexpress respondió, pero no devolvió un estado reconocible para esa OT.',
    );
  }

  const status = normalizeStatusFromText(`${portalStatusText} ${lastEvent?.label || ''}`);
  const originParts = [suggestion?.nombreRemitente, suggestion?.comunaDevolucion]
    .map((value) => compactSpaces(String(value || '')))
    .filter(Boolean);
  const destinationParts = [
    suggestion?.direccionDestinatario,
    suggestion?.compDireccionDestinatario,
    suggestion?.comunaDestinatario,
  ]
    .map((value) => compactSpaces(String(value || '')))
    .filter(Boolean);
  const rawSummary = JSON.stringify(
    {
      suggestion,
      timeline: timelinePayload?.etapas || [],
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
    estimatedDelivery: toIsoDate(String(suggestion?.fecCompromiso || suggestion?.fecEntrega || '')),
    recipient: compactSpaces(String(suggestion?.nombreDestinatario || '')),
    origin: compactSpaces(originParts.join(' · ')),
    destination: compactSpaces(destinationParts.join(' · ')),
    serviceType: compactSpaces([suggestion?.servicio, suggestion?.descProducto].filter(Boolean).join(' · ')),
    deliveryProofName: compactSpaces(String(suggestion?.nombreReceptor || '')),
    timeline,
    rawSummary,
    note: compactSpaces(String(suggestion?.motivoResolucion || '')),
  });
};

const resolveChilexpressTracking = async (trackingNumber) => {
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

  const suggestionPayload = await suggestionResponse.json();
  const timelinePayload = await timelineResponse.json();
  return parseChilexpressResult(trackingNumber, suggestionPayload, timelinePayload);
};

const resolveChibraCredentials = () => ({
  username: compactSpaces(process.env.CHIBRA_USERNAME || process.env.CHIBRA_USER || ''),
  password: compactSpaces(process.env.CHIBRA_PASSWORD || ''),
});

const extractChibraMetric = (html, labelPattern) => {
  const match = html.match(new RegExp(`<span[^>]*>\\s*${labelPattern}\\s*<\\/span>\\s*<div[^>]*>([\\s\\S]*?)<\\/div>`, 'i'));
  return compactSpaces(htmlToText(match?.[1] || ''));
};

const splitChibraBlock = (value = '') =>
  value
    .split(' · ')
    .map((item) => compactSpaces(item))
    .filter(Boolean);

const extractChibraDeliveryProof = (timeline = []) => {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const current = timeline[index];
    const deliveredMatch =
      current?.label?.match(/A:\s*(.+)$/i) ||
      current?.label?.match(/RECIBE:\s*([^)]+)/i) ||
      current?.note?.match(/RECIBE:\s*([^)]+)/i);
    if (deliveredMatch?.[1]) {
      return compactSpaces(deliveredMatch[1].replace(/\s+-\s+\d+$/, ''));
    }
  }

  return '';
};

const parseChibraResult = (trackingNumber, html) => {
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
    return buildLookupError('chibra', trackingNumber, 'Chibra no devolvió un estado utilizable para esta expedición.');
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

const resolveChibraTracking = async (trackingNumber) => {
  const credentials = resolveChibraCredentials();
  if (!credentials.username || !credentials.password) {
    return buildLookupError(
      'chibra',
      trackingNumber,
      'Faltan CHIBRA_USERNAME y CHIBRA_PASSWORD para consultar Chibra desde el relay local.',
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
      return buildLookupError(
        'chibra',
        trackingNumber,
        'Chibra rechazó las credenciales configuradas en el relay local.',
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
    return buildLookupError('chibra', trackingNumber, 'Chibra no encontró una expedición exacta para ese tracking.');
  }

  if (!resultLocation.includes('/detalle2.seam')) {
    return buildLookupError(
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

const validateTrackingNumber = (carrier, trackingNumber) => {
  if (carrier === 'dhl' && !/^\d{10}$/.test(trackingNumber)) {
    return 'DHL requiere una guía de 10 dígitos.';
  }

  if (carrier === 'estafeta' && !/^(?:\d{10}|\d{22})$/.test(trackingNumber)) {
    return 'Estafeta requiere una guía de 10 dígitos o un código de 22 dígitos.';
  }

  if (carrier === 'tresguerras' && !/^[A-Z]{3}\d{8,12}$/.test(trackingNumber)) {
    return 'Tresguerras requiere un talón alfanumérico tipo GPE00486943.';
  }

  if (carrier === 'chilexpress' && !/^\d{10,12}$/.test(trackingNumber)) {
    return 'Chilexpress requiere una OT de 10 a 12 dígitos.';
  }

  if (carrier === 'chibra' && !/^\d{12}$/.test(trackingNumber)) {
    return 'Chibra requiere una expedición de 12 dígitos.';
  }

  return '';
};

const resolveTracking = async (carrier, trackingNumber) => {
  if (carrier === 'dhl') {
    return resolveDhlTracking(trackingNumber);
  }

  if (carrier === 'tresguerras') {
    return resolveTresguerrasTracking(trackingNumber);
  }

  if (carrier === 'chilexpress') {
    return resolveChilexpressTracking(trackingNumber);
  }

  if (carrier === 'chibra') {
    return resolveChibraTracking(trackingNumber);
  }

  return resolveEstafetaTracking(trackingNumber);
};

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    json(response, 400, { error: 'Solicitud invalida.' });
    return;
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders);
    response.end();
    return;
  }

  if (request.method === 'GET' && request.url === '/health') {
    json(response, 200, {
      ok: true,
      service: 'tracking-browser-relay',
      carriers: ['dhl', 'estafeta', 'tresguerras', 'chilexpress', 'chibra'],
    });
    return;
  }

  if (request.method !== 'POST' || request.url !== '/lookup') {
    json(response, 404, { error: 'Ruta no encontrada.' });
    return;
  }

  let payload;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    json(response, 400, { error: error instanceof Error ? error.message : 'No se pudo leer la solicitud.' });
    return;
  }

  const carrier = compactSpaces(String(payload?.carrier || '')).toLowerCase();
  const trackingNumber = sanitizeTrackingNumber(payload?.trackingNumber || '');

  if (!['dhl', 'estafeta', 'tresguerras', 'chilexpress', 'chibra'].includes(carrier)) {
    json(response, 400, { error: 'La mensajería solicitada no es válida.' });
    return;
  }

  const trackingError = validateTrackingNumber(carrier, trackingNumber);
  if (trackingError) {
    json(response, 400, { error: trackingError });
    return;
  }

  try {
    const result = await resolveTracking(carrier, trackingNumber);
    json(response, 200, result);
  } catch (error) {
    console.error(`[tracking-browser-relay] ${carrier} ${trackingNumber}`, error);
    json(response, 502, buildLookupError(carrier, trackingNumber, error));
  }
});

server.on('error', (error) => {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE') {
    console.log(`tracking-browser-relay reutilizando http://127.0.0.1:${PORT}`);
    process.exit(0);
    return;
  }

  throw error;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`tracking-browser-relay escuchando en http://127.0.0.1:${PORT}`);
});

process.on('SIGINT', async () => {
  await closeBrowser();
  server.close(() => process.exit(0));
});

process.on('SIGTERM', async () => {
  await closeBrowser();
  server.close(() => process.exit(0));
});
