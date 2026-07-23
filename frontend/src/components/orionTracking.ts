export type TrackingCarrier = 'dhl' | 'estafeta' | 'tresguerras' | 'chilexpress' | 'chibra';
export type TrackingCarrierChoice = TrackingCarrier | 'auto';
export type TrackingCaptureSource = 'manual' | 'ocr' | 'camera';
export type TrackingStatus =
  | 'capturado'
  | 'pendiente_consulta'
  | 'etiqueta_generada'
  | 'en_transito'
  | 'en_reparto'
  | 'entregado'
  | 'incidencia';
export type FulfillmentState = 'pendiente' | 'entregado';

export interface TrackingTimelineEvent {
  label: string;
  location: string;
  timestamp: string;
  note: string;
}

export interface TrackingEntry {
  id: string;
  orderReference: string;
  carrier: TrackingCarrier | null;
  trackingNumber: string;
  status: TrackingStatus;
  fulfillmentState: FulfillmentState;
  recipient: string;
  origin: string;
  destination: string;
  estimatedDelivery: string;
  lastEventLabel: string;
  lastEventAt: string;
  portalStatusText: string;
  serviceType: string;
  deliveryProofName: string;
  lookupError: string;
  lastLookupAt: string;
  timeline: TrackingTimelineEvent[];
  notes: string;
  rawEvidenceText: string;
  source: TrackingCaptureSource;
  createdAt: string;
  updatedAt: string;
}

export interface TrackingImportOptions {
  preferredCarrier: TrackingCarrierChoice;
  source: TrackingCaptureSource;
  orderReference?: string;
  recipient?: string;
  notes?: string;
  status?: TrackingStatus | 'auto';
  estimatedDelivery?: string;
}

interface OcrLoggerMessage {
  status?: string;
  progress?: number;
}

const TRACKING_STORAGE_KEY = 'orion-tracking-dashboard/v1';
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_FIRST_DATE_PATTERN = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/;
const MANUAL_TRACKING_PATTERN = /\b(?:[A-Z]{3}\d{8,12}|\d{10,12}|\d{22})\b/g;
const TRACKING_LINE_PATTERN =
  /\b(?:numero\s+de\s+guia\s+aerea|guia\s+aerea|numero\s+de\s+guia|numero\s+de\s+rastreo|codigo\s+de\s+rastreo|tracking|talon|guia\/talon)\b[\s:#-]*([A-Z0-9 -]{8,28})/i;
const SPACED_GPE_PATTERN = /\bG\s*P\s*E\s*((?:\d\s*){8,12})\b/i;
const MAT_REFERENCE_PATTERN = /\bMAT\d{5,12}\b/i;
const TRACKING_GUIDE_HINTS = ['guia', 'rastreo', 'tracking', 'talon', 'aerea', 'awb'];
const IGNORE_TRACKING_LINE_HINTS = ['tel', 'cel', 'ext', 'telefono', 'cp', 'folio', 'certificado', 'sat', 'fecha y hora'];
const STATUS_SIGNAL_HINTS = [
  'estado',
  'estatus',
  'status',
  'entregado',
  'delivery',
  'transito',
  'transit',
  'reparto',
  'incidencia',
  'etiqueta',
  'embarque',
  'ocurre',
  'sucursal',
  'arribo',
  'reembarcado',
  'despachado',
];
const STATUS_PRIORITY: Record<TrackingStatus, number> = {
  capturado: 0,
  pendiente_consulta: 1,
  etiqueta_generada: 2,
  en_transito: 3,
  en_reparto: 4,
  entregado: 5,
  incidencia: 5,
};

export const TRACKING_CARRIER_META: Record<
  TrackingCarrier,
  { label: string; portalUrl: string; hint: string; accentClass: string }
> = {
  dhl: {
    label: 'DHL',
    portalUrl: 'https://www.dhl.com/mx-es/home/rastreo.html',
    hint: 'Guía aérea de 10 dígitos',
    accentClass: 'dhl',
  },
  estafeta: {
    label: 'Estafeta',
    portalUrl: 'https://www.estafeta.com/rastrear-envio?rastreo=true',
    hint: 'Rastreo de 10 dígitos o guía de 22',
    accentClass: 'estafeta',
  },
  tresguerras: {
    label: 'Tresguerras',
    portalUrl: 'https://www.tresguerras.com.mx/3G/tracking.php',
    hint: 'Talón alfanumérico tipo GPE00486943',
    accentClass: 'tresguerras',
  },
  chilexpress: {
    label: 'Chilexpress',
    portalUrl: 'https://www.chilexpress.cl/estado-envio-paquete-courier',
    hint: 'OT de 10 a 12 dígitos',
    accentClass: 'chilexpress',
  },
  chibra: {
    label: 'Chibra',
    portalUrl: 'https://gtschibra.alertran.net/gts/login.seam',
    hint: 'Expedición de 12 dígitos',
    accentClass: 'chibra',
  },
};

export const TRACKING_STATUS_LABELS: Record<TrackingStatus, string> = {
  capturado: 'Capturado',
  pendiente_consulta: 'Pendiente por consultar',
  etiqueta_generada: 'Etiqueta generada',
  en_transito: 'En tránsito',
  en_reparto: 'En reparto',
  entregado: 'Entregado',
  incidencia: 'Incidencia',
};

export const TRACKING_STATUS_ORDER: TrackingStatus[] = [
  'capturado',
  'pendiente_consulta',
  'etiqueta_generada',
  'en_transito',
  'en_reparto',
  'entregado',
  'incidencia',
];

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const compactSpaces = (value: string) => value.replace(/\s+/g, ' ').trim();

const toMultilineLines = (value: string) =>
  value
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => compactSpaces(line))
    .filter(Boolean);

const sanitizeTrackingNumber = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

const inferStrongCarrierFromTrackingNumber = (trackingNumber: string): TrackingCarrier | null => {
  const sanitized = sanitizeTrackingNumber(trackingNumber);

  if (sanitized.startsWith('GPE') || /^[A-Z]{3}\d{8,12}$/.test(sanitized)) {
    return 'tresguerras';
  }

  if (/^9999\d{8}$/.test(sanitized)) {
    return 'chibra';
  }

  if (/^696\d{9}$/.test(sanitized)) {
    return 'chilexpress';
  }

  if (/^\d{22}$/.test(sanitized)) {
    return 'estafeta';
  }

  return null;
};

const isTrackingNumber = (value: string) =>
  /^(?:[A-Z]{3}\d{8,12}|\d{10,12}|\d{22})$/.test(sanitizeTrackingNumber(value));

const buildValidIsoDate = (year: string, first: string, second: string) => {
  let month = Number(first);
  let day = Number(second);

  if (month > 12 && day >= 1 && day <= 12) {
    [month, day] = [day, month];
  }

  const numericYear = Number(year);
  const candidate = new Date(Date.UTC(numericYear, month - 1, day));
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    candidate.getUTCFullYear() !== numericYear ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return '';
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const parseDateToIso = (value: string) => {
  const compact = compactSpaces(value);
  const isoMatch = compact.match(ISO_DATE_PATTERN);
  if (isoMatch) {
    return buildValidIsoDate(isoMatch[1], isoMatch[2], isoMatch[3]);
  }

  const dayFirstMatch = compact.match(DAY_FIRST_DATE_PATTERN);
  if (!dayFirstMatch) {
    return '';
  }

  const year = dayFirstMatch[3].length === 2 ? `20${dayFirstMatch[3]}` : dayFirstMatch[3];
  return buildValidIsoDate(year, dayFirstMatch[2], dayFirstMatch[1]);
};

export const formatTrackingDate = (value: string) => {
  if (!value) {
    return 'Sin fecha';
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

export const formatTrackingDateTime = (value: string) => {
  if (!value) {
    return 'Sin actualización';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const extractValueAfterLabel = (rawText: string, labels: string[]) => {
  const lines = toMultilineLines(rawText);
  const normalizedLabels = labels.map((label) => normalizeText(label));

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const normalizedLine = normalizeText(line);
    const label = normalizedLabels.find((candidate) => normalizedLine.includes(candidate));
    if (!label) {
      continue;
    }

    const inline = compactSpaces(line.replace(new RegExp(label, 'i'), '').replace(/^[:#\-\s]+/, ''));
    if (inline && !normalizeText(inline).startsWith('sin ')) {
      return inline;
    }

    for (let lookAhead = 1; lookAhead <= 3; lookAhead += 1) {
      const nextLine = lines[index + lookAhead];
      if (!nextLine) {
        break;
      }

      const normalizedNextLine = normalizeText(nextLine);
      if (normalizedLabels.some((candidate) => normalizedNextLine.includes(candidate))) {
        break;
      }

      if (nextLine && !IGNORE_TRACKING_LINE_HINTS.some((hint) => normalizedNextLine.includes(hint))) {
        return nextLine;
      }
    }
  }

  return '';
};

const extractBlockAfterLabel = (rawText: string, labels: string[], maxLines = 3) => {
  const lines = toMultilineLines(rawText);
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
        normalizedNextLine.startsWith('tel') ||
        normalizedNextLine.startsWith('cp ') ||
        normalizedNextLine.startsWith('mexico')
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

const inferCarrierFromText = (rawText: string): TrackingCarrier | null => {
  const normalized = normalizeText(rawText);

  if (
    normalized.includes('tresguerras') ||
    normalized.includes('tres guerras') ||
    normalized.includes('guia / talon') ||
    normalized.includes('talon')
  ) {
    return 'tresguerras';
  }

  if (normalized.includes('chilexpress') || normalized.includes('orden de transporte') || normalized.includes('centro de ayuda')) {
    return 'chilexpress';
  }

  if (
    normalized.includes('chibra') ||
    normalized.includes('global tracking system') ||
    normalized.includes('desarrollado por chibra')
  ) {
    return 'chibra';
  }

  if (normalized.includes('dhl') || normalized.includes('guia aerea') || normalized.includes('detalles del envio')) {
    return 'dhl';
  }

  if (normalized.includes('estafeta') || normalized.includes('codigo de rastreo')) {
    return 'estafeta';
  }

  return null;
};

const buildCarrierContextByTrackingNumber = (rawText: string) => {
  const carrierByTrackingNumber = new Map<string, TrackingCarrier>();
  let activeCarrier: TrackingCarrier | null = null;

  toMultilineLines(rawText).forEach((line) => {
    const lineCarrier = inferCarrierFromText(line);
    if (lineCarrier) {
      activeCarrier = lineCarrier;
    }

    const trackingNumbers = extractManualTrackingNumbers(line);
    trackingNumbers.forEach((trackingNumber) => {
      const strongCarrier = inferStrongCarrierFromTrackingNumber(trackingNumber);
      const resolvedCarrier = strongCarrier || lineCarrier || activeCarrier;
      if (resolvedCarrier) {
        carrierByTrackingNumber.set(trackingNumber, resolvedCarrier);
      }
    });
  });

  return carrierByTrackingNumber;
};

const inferCarrier = (
  trackingNumber: string,
  rawText: string,
  preferredCarrier: TrackingCarrierChoice,
  contextualCarrier?: TrackingCarrier,
) => {
  if (preferredCarrier !== 'auto') {
    return preferredCarrier;
  }

  const sanitized = sanitizeTrackingNumber(trackingNumber);
  const strongCarrier = inferStrongCarrierFromTrackingNumber(sanitized);
  if (strongCarrier) {
    return strongCarrier;
  }

  if (contextualCarrier) {
    return contextualCarrier;
  }

  const globalCarrierHints = new Set(
    toMultilineLines(rawText)
      .map((line) => inferCarrierFromText(line))
      .filter((carrier): carrier is TrackingCarrier => Boolean(carrier)),
  );
  if (globalCarrierHints.size === 1) {
    return Array.from(globalCarrierHints)[0];
  }

  if (/^\d{10}$/.test(sanitized)) {
    return 'dhl';
  }

  return null;
};

const normalizeStatusFromText = (value: string): TrackingStatus => {
  const normalized = normalizeText(value);

  if (
    normalized.includes('embarque entregado') ||
    normalized.includes('entregado en sucursal') ||
    normalized.includes('entregado a destinatario') ||
    normalized.includes('entregado al destinatario') ||
    normalized.includes('entrega finalizada') ||
    normalized.includes('pieza entregada a destinatario') ||
    normalized.includes('envio entregado por el transportista') ||
    normalized.includes('envio entregado al destinatario') ||
    normalized.includes('delivered') ||
    normalized.includes('confirmacion de entrega') ||
    normalized.includes('proof of delivery') ||
    normalized.includes('recibio ') ||
    normalized.endsWith('recibio')
  ) {
    return 'entregado';
  }

  if (
    normalized.includes('en reparto') ||
    normalized.includes('en sucursal para entrega') ||
    normalized.includes('cliente de ocurre avisado') ||
    normalized.includes('out for delivery') ||
    normalized.includes('salio a ruta') ||
    normalized.includes('en ruta de entrega') ||
    normalized.includes('despacho en reparto') ||
    normalized.includes('repartidor llego al punto de entrega') ||
    normalized.includes('en despacho hacia destino') ||
    normalized.includes('envio en despacho al destinatario') ||
    normalized.includes('disponible en punto')
  ) {
    return 'en_reparto';
  }

  if (
    normalized.includes('incidencia') ||
    normalized.includes('exception') ||
    normalized.includes('retenido') ||
    normalized.includes('demora') ||
    normalized.includes('delay') ||
    normalized.includes('problema')
  ) {
    return 'incidencia';
  }

  if (
    normalized.includes('en transito') ||
    normalized.includes('in transit') ||
    normalized.includes('transit') ||
    normalized.includes('transito entre sucursales') ||
    normalized.includes('arribo de viaje') ||
    normalized.includes('reembarcado') ||
    normalized.includes('despachado a sucursal') ||
    normalized.includes('bodega de reembarques') ||
    normalized.includes('recibido en bodega embarques') ||
    normalized.includes('recibido en bodega de reparto') ||
    normalized.includes('embarque recolectado') ||
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
    normalized.includes('booking confirmado') ||
    normalized.includes('orden de transporte creada')
  ) {
    return 'etiqueta_generada';
  }

  if (normalized.includes('pendiente')) {
    return 'pendiente_consulta';
  }

  return 'capturado';
};

const hasStatusSignal = (value: string) => {
  const normalized = normalizeText(value);
  return STATUS_SIGNAL_HINTS.some((hint) => normalized.includes(hint));
};

const inferStatusPayload = (
  rawText: string,
  source: TrackingCaptureSource,
  preferredStatus?: TrackingStatus | 'auto',
) => {
  if (preferredStatus && preferredStatus !== 'auto') {
    return {
      status: preferredStatus,
      lastEventLabel: TRACKING_STATUS_LABELS[preferredStatus],
    };
  }

  const explicitStatus = extractValueAfterLabel(rawText, ['estado', 'estatus', 'status']);
  if (explicitStatus) {
    const status = normalizeStatusFromText(explicitStatus);
    return {
      status,
      lastEventLabel: compactSpaces(explicitStatus),
    };
  }

  const fallbackStatus = normalizeStatusFromText(rawText);
  if (source === 'manual' && fallbackStatus === 'capturado' && !hasStatusSignal(rawText)) {
    return {
      status: 'pendiente_consulta' as const,
      lastEventLabel: 'Pendiente por consultar en portal',
    };
  }

  return {
    status: fallbackStatus,
    lastEventLabel: TRACKING_STATUS_LABELS[fallbackStatus],
  };
};

const extractEstimatedDelivery = (rawText: string, preset?: string) => {
  if (preset) {
    return preset;
  }

  const explicit = extractValueAfterLabel(rawText, ['fecha estimada de entrega', 'entrega estimada', 'estimated delivery']);
  const inlineDate = parseDateToIso(explicit);
  if (inlineDate) {
    return inlineDate;
  }

  const dateMatch = rawText.match(/\b(?:fecha estimada de entrega|entrega estimada|estimated delivery)\b[^\d]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{2}[/-]\d{2})/i);
  if (!dateMatch) {
    return '';
  }

  return parseDateToIso(dateMatch[1]);
};

const extractManualTrackingNumbers = (rawText: string) =>
  Array.from(new Set((rawText.toUpperCase().match(MANUAL_TRACKING_PATTERN) || []).map((item) => sanitizeTrackingNumber(item))));

const extractOcrTrackingNumbers = (rawText: string) => {
  const lines = toMultilineLines(rawText);
  const candidates: string[] = [];

  const pushCandidate = (value: string) => {
    const sanitized = sanitizeTrackingNumber(value);
    if (!isTrackingNumber(sanitized) || candidates.includes(sanitized)) {
      return;
    }

    candidates.push(sanitized);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const normalizedLine = normalizeText(line);

    if (IGNORE_TRACKING_LINE_HINTS.some((hint) => normalizedLine.includes(hint))) {
      continue;
    }

    const gpeMatch = line.match(SPACED_GPE_PATTERN);
    if (gpeMatch) {
      pushCandidate(`GPE${gpeMatch[1].replace(/\s+/g, '')}`);
    }

    const inlineGuideMatch = line.match(TRACKING_LINE_PATTERN);
    if (inlineGuideMatch) {
      pushCandidate(inlineGuideMatch[1]);
    }

    if (isTrackingNumber(line)) {
      pushCandidate(line);
      continue;
    }

    const looksLikeGuideLine = TRACKING_GUIDE_HINTS.some((hint) => normalizedLine.includes(hint));
    if (!looksLikeGuideLine) {
      continue;
    }

    const nextLine = lines[index + 1];
    if (nextLine && isTrackingNumber(nextLine)) {
      pushCandidate(nextLine);
    }
  }

  return candidates;
};

const buildFulfillmentState = (status: TrackingStatus): FulfillmentState => (status === 'entregado' ? 'entregado' : 'pendiente');

export const buildTrackingEntriesFromText = (rawText: string, options: TrackingImportOptions): TrackingEntry[] => {
  const sourceText = rawText || '';
  const trackingNumbers = options.source === 'manual' ? extractManualTrackingNumbers(sourceText) : extractOcrTrackingNumbers(sourceText);
  if (trackingNumbers.length === 0) {
    return [];
  }

  const statusPayload = inferStatusPayload(sourceText, options.source, options.status);
  const estimatedDelivery = extractEstimatedDelivery(sourceText, options.estimatedDelivery);
  const recipient =
    compactSpaces(options.recipient || '') ||
    extractBlockAfterLabel(sourceText, ['envie a', 'envio a', 'destinatario', 'consignatario'], 3) ||
    extractValueAfterLabel(sourceText, ['envie a', 'envio a', 'destinatario', 'consignatario']);
  const origin = extractBlockAfterLabel(sourceText, ['enviar desde', 'remitente'], 3) || extractValueAfterLabel(sourceText, ['enviar desde', 'remitente']);
  const destination =
    extractBlockAfterLabel(sourceText, ['destino', 'se entregara en', 'se entregará en'], 2) ||
    extractValueAfterLabel(sourceText, ['destino', 'se entregara en', 'se entregará en']);
  const embeddedOrderReference =
    compactSpaces(options.orderReference || '') ||
    (sourceText.match(MAT_REFERENCE_PATTERN)?.[0] || '') ||
    extractValueAfterLabel(sourceText, ['folio fiscal', 'orden', 'pedido']);
  const now = new Date().toISOString();
  const carrierContextByTrackingNumber = buildCarrierContextByTrackingNumber(sourceText);

  return trackingNumbers.map((trackingNumber) => {
    const carrier = inferCarrier(
      trackingNumber,
      sourceText,
      options.preferredCarrier,
      carrierContextByTrackingNumber.get(trackingNumber),
    );
    return {
      id: crypto.randomUUID(),
      orderReference: embeddedOrderReference,
      carrier,
      trackingNumber,
      status: statusPayload.status,
      fulfillmentState: buildFulfillmentState(statusPayload.status),
      recipient,
      origin,
      destination,
      estimatedDelivery,
      lastEventLabel: statusPayload.lastEventLabel,
      lastEventAt: now,
      portalStatusText: '',
      serviceType: '',
      deliveryProofName: '',
      lookupError: '',
      lastLookupAt: '',
      timeline: [],
      notes: compactSpaces(options.notes || ''),
      rawEvidenceText: compactSpaces(sourceText).slice(0, 6000),
      source: options.source,
      createdAt: now,
      updatedAt: now,
    } satisfies TrackingEntry;
  });
};

const createWorker = async (onProgress?: (progress: number, status: string) => void) => {
  const tesseractModule = await import('tesseract.js');
  const api = ('default' in tesseractModule ? tesseractModule.default : tesseractModule) as typeof import('tesseract.js');
  const worker = await api.createWorker('spa+eng', 1, {
    logger: (message: OcrLoggerMessage) => {
      onProgress?.(typeof message.progress === 'number' ? message.progress : 0, message.status || 'Procesando OCR');
    },
  });

  await worker.setParameters({
    preserve_interword_spaces: '1',
    tessedit_pageseg_mode: api.PSM.SPARSE_TEXT,
    user_defined_dpi: '300',
  });

  return worker;
};

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });

export const runTrackingOcr = async (file: File, onProgress?: (progress: number, status: string) => void) => {
  if ((file.type || '').startsWith('text/')) {
    onProgress?.(0.4, 'Leyendo archivo de texto');
    const rawText = await file.text();
    onProgress?.(1, 'Texto listo');
    return rawText;
  }

  if (!(file.type || '').startsWith('image/')) {
    throw new Error('Formato no compatible. Usa imagen o texto plano para importar tracking sin API.');
  }

  const worker = await createWorker(onProgress);
  try {
    const dataUrl = await toDataUrl(file);
    const { data } = await worker.recognize(dataUrl);
    onProgress?.(1, 'OCR listo');
    return data.text?.trim() || '';
  } finally {
    await worker.terminate();
  }
};

const isTrackingCarrier = (value: unknown): value is TrackingCarrier =>
  value === 'dhl' ||
  value === 'estafeta' ||
  value === 'tresguerras' ||
  value === 'chilexpress' ||
  value === 'chibra';

const isTrackingStatus = (value: unknown): value is TrackingStatus =>
  value === 'capturado' ||
  value === 'pendiente_consulta' ||
  value === 'etiqueta_generada' ||
  value === 'en_transito' ||
  value === 'en_reparto' ||
  value === 'entregado' ||
  value === 'incidencia';

export const coerceTrackingEntry = (value: unknown): TrackingEntry | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<TrackingEntry>;
  const trackingNumber = typeof candidate.trackingNumber === 'string' ? sanitizeTrackingNumber(candidate.trackingNumber) : '';
  if (!trackingNumber || !isTrackingNumber(trackingNumber)) {
    return null;
  }

  const status = isTrackingStatus(candidate.status) ? candidate.status : 'capturado';
  const createdAt = typeof candidate.createdAt === 'string' && candidate.createdAt ? candidate.createdAt : new Date().toISOString();
  const updatedAt = typeof candidate.updatedAt === 'string' && candidate.updatedAt ? candidate.updatedAt : createdAt;

  const strongCarrier = inferStrongCarrierFromTrackingNumber(trackingNumber);

  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : crypto.randomUUID(),
    orderReference: typeof candidate.orderReference === 'string' ? candidate.orderReference : '',
    carrier: strongCarrier || (isTrackingCarrier(candidate.carrier) ? candidate.carrier : null),
    trackingNumber,
    status,
    fulfillmentState: candidate.fulfillmentState === 'entregado' || status === 'entregado' ? 'entregado' : 'pendiente',
    recipient: typeof candidate.recipient === 'string' ? candidate.recipient : '',
    origin: typeof candidate.origin === 'string' ? candidate.origin : '',
    destination: typeof candidate.destination === 'string' ? candidate.destination : '',
    estimatedDelivery: typeof candidate.estimatedDelivery === 'string' ? candidate.estimatedDelivery : '',
    lastEventLabel: typeof candidate.lastEventLabel === 'string' && candidate.lastEventLabel ? candidate.lastEventLabel : TRACKING_STATUS_LABELS[status],
    lastEventAt: typeof candidate.lastEventAt === 'string' && candidate.lastEventAt ? candidate.lastEventAt : updatedAt,
    portalStatusText: typeof candidate.portalStatusText === 'string' ? candidate.portalStatusText : '',
    serviceType: typeof candidate.serviceType === 'string' ? candidate.serviceType : '',
    deliveryProofName: typeof candidate.deliveryProofName === 'string' ? candidate.deliveryProofName : '',
    lookupError: typeof candidate.lookupError === 'string' ? candidate.lookupError : '',
    lastLookupAt: typeof candidate.lastLookupAt === 'string' ? candidate.lastLookupAt : '',
    timeline: Array.isArray(candidate.timeline)
      ? candidate.timeline
          .filter((event) => Boolean(event && typeof event === 'object'))
          .map((event) => ({
            label: typeof event.label === 'string' ? event.label : '',
            location: typeof event.location === 'string' ? event.location : '',
            timestamp: typeof event.timestamp === 'string' ? event.timestamp : '',
            note: typeof event.note === 'string' ? event.note : '',
          }))
          .filter((event) => event.label || event.location || event.timestamp || event.note)
      : [],
    notes: typeof candidate.notes === 'string' ? candidate.notes : '',
    rawEvidenceText: typeof candidate.rawEvidenceText === 'string' ? candidate.rawEvidenceText : '',
    source:
      candidate.source === 'manual' || candidate.source === 'ocr' || candidate.source === 'camera' ? candidate.source : 'manual',
    createdAt,
    updatedAt,
  };
};

export const loadTrackingEntries = (): TrackingEntry[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(TRACKING_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as { entries?: unknown[] } | unknown[];
    const source = Array.isArray(parsed) ? parsed : Array.isArray(parsed.entries) ? parsed.entries : [];
    const entries = source.map(coerceTrackingEntry).filter((entry): entry is TrackingEntry => Boolean(entry));
    return upsertTrackingEntries([], entries);
  } catch {
    return [];
  }
};

export const saveTrackingEntries = (entries: TrackingEntry[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify({ entries }));
};

export const mergeTrackingEntries = (current: TrackingEntry, incoming: TrackingEntry): TrackingEntry => {
  const nextStatus =
    STATUS_PRIORITY[incoming.status] >= STATUS_PRIORITY[current.status] ? incoming.status : current.status;
  const nextFulfillment =
    current.fulfillmentState === 'entregado' || nextStatus === 'entregado' ? 'entregado' : incoming.fulfillmentState;

  return {
    ...current,
    orderReference: incoming.orderReference || current.orderReference,
    carrier: incoming.carrier || current.carrier,
    status: nextStatus,
    fulfillmentState: nextFulfillment,
    recipient: incoming.recipient || current.recipient,
    origin: incoming.origin || current.origin,
    destination: incoming.destination || current.destination,
    estimatedDelivery: incoming.estimatedDelivery || current.estimatedDelivery,
    lastEventLabel:
      incoming.lastEventLabel && incoming.lastEventLabel !== TRACKING_STATUS_LABELS[incoming.status]
        ? incoming.lastEventLabel
        : current.lastEventLabel || TRACKING_STATUS_LABELS[nextStatus],
    lastEventAt: incoming.lastEventAt || current.lastEventAt,
    portalStatusText: incoming.portalStatusText || current.portalStatusText,
    serviceType: incoming.serviceType || current.serviceType,
    deliveryProofName: incoming.deliveryProofName || current.deliveryProofName,
    lookupError: incoming.lookupError || current.lookupError,
    lastLookupAt: incoming.lastLookupAt || current.lastLookupAt,
    timeline: incoming.timeline.length > 0 ? incoming.timeline : current.timeline,
    notes: incoming.notes || current.notes,
    rawEvidenceText: incoming.rawEvidenceText || current.rawEvidenceText,
    source: incoming.source,
    updatedAt: new Date().toISOString(),
  };
};

export interface TrackingPortalSnapshot {
  status: TrackingStatus;
  fulfillmentState: FulfillmentState;
  portalStatusText: string;
  lastEventLabel: string;
  lastEventAt: string;
  estimatedDelivery: string;
  recipient: string;
  origin: string;
  destination: string;
  serviceType: string;
  deliveryProofName: string;
  timeline: TrackingTimelineEvent[];
  rawSummary: string;
  lookupError: string;
  lookedUpAt: string;
}

export const applyTrackingPortalSnapshot = (entry: TrackingEntry, snapshot: TrackingPortalSnapshot): TrackingEntry => {
  const nextStatus = STATUS_PRIORITY[snapshot.status] >= STATUS_PRIORITY[entry.status] ? snapshot.status : entry.status;
  const nextFulfillment =
    entry.fulfillmentState === 'entregado' || snapshot.fulfillmentState === 'entregado' || nextStatus === 'entregado'
      ? 'entregado'
      : 'pendiente';

  return {
    ...entry,
    status: nextStatus,
    fulfillmentState: nextFulfillment,
    recipient: snapshot.recipient || entry.recipient,
    origin: snapshot.origin || entry.origin,
    destination: snapshot.destination || entry.destination,
    estimatedDelivery: snapshot.estimatedDelivery || entry.estimatedDelivery,
    lastEventLabel: snapshot.lastEventLabel || snapshot.portalStatusText || entry.lastEventLabel,
    lastEventAt: snapshot.lastEventAt || entry.lastEventAt,
    portalStatusText: snapshot.portalStatusText || entry.portalStatusText,
    serviceType: snapshot.serviceType || entry.serviceType,
    deliveryProofName: snapshot.deliveryProofName || entry.deliveryProofName,
    lookupError: snapshot.lookupError,
    lastLookupAt: snapshot.lookedUpAt,
    timeline: snapshot.timeline.length > 0 ? snapshot.timeline : entry.timeline,
    rawEvidenceText: snapshot.rawSummary || entry.rawEvidenceText,
    updatedAt: new Date().toISOString(),
  };
};

export const upsertTrackingEntries = (current: TrackingEntry[], incoming: TrackingEntry[]) => {
  const next = [...current];

  incoming.forEach((entry) => {
    const index = next.findIndex((candidate) => {
      if (candidate.trackingNumber !== entry.trackingNumber) {
        return false;
      }

      if (candidate.carrier && entry.carrier) {
        return candidate.carrier === entry.carrier;
      }

      return true;
    });

    if (index === -1) {
      next.unshift(entry);
      return;
    }

    next[index] = mergeTrackingEntries(next[index], entry);
  });

  return next.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
};

export const reconcileTrackingEntries = (localEntries: TrackingEntry[], cloudEntries: TrackingEntry[]) => {
  const reconciled = [...cloudEntries];

  localEntries.forEach((localEntry) => {
    const cloudIndex = reconciled.findIndex((candidate) => candidate.trackingNumber === localEntry.trackingNumber);
    if (cloudIndex === -1) {
      reconciled.push(localEntry);
      return;
    }

    const cloudEntry = reconciled[cloudIndex];
    const localIsNewer = Date.parse(localEntry.updatedAt) > Date.parse(cloudEntry.updatedAt);
    const olderEntry = localIsNewer ? cloudEntry : localEntry;
    const newerEntry = localIsNewer ? localEntry : cloudEntry;
    const mergedEntry = mergeTrackingEntries(olderEntry, newerEntry);

    reconciled[cloudIndex] = {
      ...mergedEntry,
      id: cloudEntry.id,
      createdAt:
        Date.parse(localEntry.createdAt) < Date.parse(cloudEntry.createdAt)
          ? localEntry.createdAt
          : cloudEntry.createdAt,
      updatedAt: newerEntry.updatedAt,
    };
  });

  return reconciled.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
};
