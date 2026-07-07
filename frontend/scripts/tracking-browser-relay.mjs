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

const normalizeStatusFromText = (value = '') => {
  const normalized = normalizeText(value);

  if (
    normalized.includes('embarque entregado') ||
    normalized.includes('entregado en sucursal') ||
    normalized.includes('entregado al destinatario') ||
    normalized.includes('entregado a destinatario') ||
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
    normalized.includes('en sucursal para entrega')
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
    normalized.includes('shipment picked up')
  ) {
    return 'en_transito';
  }

  if (
    normalized.includes('etiqueta generada') ||
    normalized.includes('label created') ||
    normalized.includes('guia generada')
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

  return '';
};

const resolveTracking = async (carrier, trackingNumber) => {
  if (carrier === 'dhl') {
    return resolveDhlTracking(trackingNumber);
  }

  if (carrier === 'tresguerras') {
    return resolveTresguerrasTracking(trackingNumber);
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
      carriers: ['dhl', 'estafeta', 'tresguerras'],
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

  if (!['dhl', 'estafeta', 'tresguerras'].includes(carrier)) {
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
