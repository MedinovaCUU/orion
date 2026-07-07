const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

type TrackingCarrier = 'dhl' | 'estafeta' | 'tresguerras';
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

const tresguerrasHttpClient = Deno.createHttpClient({
  unsafelyIgnoreCertificateErrors: ['www.tresguerras.com.mx'],
});

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

const normalizeStatusFromText = (value: string): TrackingStatus => {
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

  if (!carrier || !['dhl', 'estafeta', 'tresguerras'].includes(carrier)) {
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
