import type { EquipmentSummary } from './servicesPlanning';
import type { ServiceReportTicketOcrResult } from './serviceReportTicketOcr';

export type TicketSupportType = 'Ingeniero' | 'Químico';
export type TicketChannelCode = '' | 'falcon' | 'centrum' | 'genesis';
export type TicketSlaSeverity = 'healthy' | 'warning' | 'critical' | 'breached';

export interface TicketIntakeDraft {
  asunto: string;
  descripcion: string;
  numeroSerie: string;
  nombreContacto: string;
  telefonoContacto: string;
  tipoSoporte: TicketSupportType;
  specialClientCode: TicketChannelCode;
  reportCreatedAt: string | null;
}

export interface TicketLike {
  asunto: string;
  descripcion?: string | null;
  creado_en: string;
  numero_serie_equipo?: string | null;
  nombre_cliente_guest?: string | null;
  telefono_cliente_guest?: string | null;
}

export interface FalconTicketSla {
  tracked: boolean;
  channel: TicketChannelCode;
  limitHours: 24 | 48;
  isMexicoCity: boolean;
  createdAtMs: number;
  dueAtMs: number;
  elapsedMs: number;
  remainingMs: number;
  severity: TicketSlaSeverity;
  countdownLabel: string;
  statusLabel: string;
  scopeLabel: string;
}

const PRIORITY_LABELS: Record<string, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Crítica',
};

const SERVICE_TYPE_LABELS: Record<string, string> = {
  preventivo: 'Preventivo',
  correctivo: 'Correctivo',
  instalacion: 'Instalación',
  capacitacion: 'Capacitación',
  emergencia: 'Emergencia',
  otro: 'Otro',
};

const normalizeText = (value: string | null | undefined) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const compactSpaces = (value: string) => value.replace(/\s+/g, ' ').trim();

const cleanLine = (value: string | null | undefined) => compactSpaces(value || '');

const uniqueNonEmpty = (values: Array<string | null | undefined>) =>
  values.map((value) => cleanLine(value)).filter((value, index, collection) => value && collection.indexOf(value) === index);

const extractLabeledValue = (rawText: string, labels: string[]) => {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*:?[ \\t]*(?:\\n\\s*)?([^\\n]+)`, 'i');
    const match = rawText.match(regex);
    if (match?.[1]) {
      return cleanLine(match[1]);
    }
  }

  return '';
};

const toSentenceCase = (value: string) => {
  if (!value) {
    return '';
  }

  const lowered = value.toLowerCase();
  return lowered.charAt(0).toUpperCase() + lowered.slice(1);
};

const getChannelLabel = (code: TicketChannelCode) => {
  if (code === 'falcon') return 'FALCON';
  if (code === 'centrum') return 'CENTRUM';
  if (code === 'genesis') return 'GENESIS';
  return '';
};

const getReferenceLabel = (code: TicketChannelCode) => {
  if (code === 'falcon') return 'No. de reporte Falcon';
  if (code === 'centrum') return 'Ticket Zendesk';
  if (code === 'genesis') return 'Número de reporte';
  return 'Referencia externa';
};

const OCR_SOURCE_TIMEZONE_OFFSET = '-06:00';

const normalizeReportDatePart = (value: string) => {
  const normalized = cleanLine(value);
  if (!normalized) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  const match = normalized.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (!match) {
    return '';
  }

  const [, dayText, monthText, yearText] = match;
  const year = yearText.length === 2 ? `20${yearText}` : yearText;
  const month = monthText.padStart(2, '0');
  const day = dayText.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeReportTimePart = (value: string) => {
  const normalized = cleanLine(value)
    .toUpperCase()
    .replace(/A\.\s*M\./g, 'AM')
    .replace(/P\.\s*M\./g, 'PM')
    .replace(/\s+/g, ' ');
  const match = normalized.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/);

  if (!match) {
    return '';
  }

  let hours = Number(match[1]);
  const minutes = match[2];
  const seconds = match[3] || '00';
  const meridiem = match[4];

  if (meridiem === 'PM' && hours < 12) {
    hours += 12;
  }

  if (meridiem === 'AM' && hours === 12) {
    hours = 0;
  }

  return `${String(hours).padStart(2, '0')}:${minutes}:${seconds.padStart(2, '0')}`;
};

const buildReportCreatedAt = (ocr: ServiceReportTicketOcrResult) => {
  const registrationText = extractLabeledValue(ocr.rawText, ['Fecha y hora de registro', 'Fecha de registro']);
  const datePart = normalizeReportDatePart(ocr.extractedFields.callDate || registrationText);
  if (!datePart) {
    return null;
  }

  const timePart = normalizeReportTimePart(registrationText) || normalizeReportTimePart(ocr.extractedFields.startedAt || '') || '00:00:00';
  return `${datePart}T${timePart}${OCR_SOURCE_TIMEZONE_OFFSET}`;
};

const buildTicketSubject = (ocr: ServiceReportTicketOcrResult) => {
  const channelPrefix = ocr.extractedFields.specialClientCode ? `[${getChannelLabel(ocr.extractedFields.specialClientCode)}] ` : '';
  const detail =
    cleanLine(ocr.extractedFields.subject) ||
    uniqueNonEmpty([
      ocr.extractedFields.equipmentName,
      ocr.extractedFields.businessUnitName || ocr.extractedFields.clientName,
      ocr.extractedFields.equipmentSerial,
    ]).join(' · ') ||
    'Ticket remoto recibido';

  return `${channelPrefix}${detail}`.trim();
};

const buildTicketDescription = (ocr: ServiceReportTicketOcrResult) => {
  const lines: string[] = [];
  const channelCode = ocr.extractedFields.specialClientCode || '';
  const locality = extractLabeledValue(ocr.rawText, ['Localidad', 'Ciudad', 'Municipio']);
  const state = extractLabeledValue(ocr.rawText, ['Estado']);
  const institution = cleanLine(ocr.extractedFields.clientName);
  const unit = cleanLine(ocr.extractedFields.businessUnitName);
  const address = cleanLine(ocr.extractedFields.siteAddress);
  const serviceType = cleanLine(ocr.extractedFields.serviceType ? SERVICE_TYPE_LABELS[ocr.extractedFields.serviceType] : '');
  const priority = cleanLine(ocr.extractedFields.priority ? PRIORITY_LABELS[ocr.extractedFields.priority] : '');
  const reference = cleanLine(ocr.extractedFields.specialReferenceValue);
  const equipmentName = cleanLine(ocr.extractedFields.equipmentName);
  const serial = cleanLine(ocr.extractedFields.equipmentSerial);
  const contactName = cleanLine(ocr.extractedFields.siteContact || ocr.extractedFields.specialUserName);
  const phone = cleanLine(ocr.extractedFields.sitePhone);
  const reportDate = uniqueNonEmpty([ocr.extractedFields.callDate, ocr.extractedFields.startedAt]).join(' ');
  const failureText = cleanLine(ocr.extractedFields.comments || ocr.extractedFields.subject);

  if (channelCode) {
    lines.push(`Canal: ${getChannelLabel(channelCode)}`);
  }

  if (reference) {
    lines.push(`${getReferenceLabel(channelCode)}: ${reference}`);
  }

  if (institution) {
    lines.push(`Cliente/Institución: ${institution}`);
  }

  if (unit) {
    lines.push(`Unidad/Laboratorio: ${unit}`);
  }

  if (address) {
    lines.push(`Dirección: ${address}`);
  }

  if (locality) {
    lines.push(`Localidad: ${locality}`);
  }

  if (state) {
    lines.push(`Estado: ${state}`);
  }

  if (equipmentName) {
    lines.push(`Equipo: ${equipmentName}`);
  }

  if (serial) {
    lines.push(`No. de serie: ${serial}`);
  }

  if (contactName) {
    lines.push(`Contacto: ${contactName}`);
  }

  if (phone) {
    lines.push(`Teléfono: ${phone}`);
  }

  if (serviceType) {
    lines.push(`Tipo de servicio: ${serviceType}`);
  }

  if (priority) {
    lines.push(`Prioridad sugerida: ${priority}`);
  }

  if (reportDate) {
    lines.push(`Fecha del reporte: ${reportDate}`);
  }

  if (failureText) {
    lines.push('');
    lines.push(`Falla reportada: ${failureText}`);
  }

  return lines.join('\n').trim();
};

export const buildTicketDraftFromOcr = (ocr: ServiceReportTicketOcrResult): TicketIntakeDraft => ({
  asunto: buildTicketSubject(ocr),
  descripcion: buildTicketDescription(ocr),
  numeroSerie: cleanLine(ocr.extractedFields.equipmentSerial),
  nombreContacto: cleanLine(ocr.extractedFields.siteContact || ocr.extractedFields.specialUserName),
  telefonoContacto: cleanLine(ocr.extractedFields.sitePhone),
  tipoSoporte: 'Ingeniero',
  specialClientCode: ocr.extractedFields.specialClientCode || '',
  reportCreatedAt: buildReportCreatedAt(ocr),
});

const extractChannelFromTicket = (ticket: Pick<TicketLike, 'asunto' | 'descripcion'>): TicketChannelCode => {
  const text = normalizeText(`${ticket.asunto}\n${ticket.descripcion || ''}`);

  if (
    text.includes('[falcon]') ||
    text.includes('canal: falcon') ||
    text.includes('reporte falcon') ||
    text.includes('no. de reporte falcon') ||
    text.includes('numero de reporte falcon')
  ) {
    return 'falcon';
  }

  if (
    text.includes('[centrum]') ||
    text.includes('canal: centrum') ||
    text.includes('ticket zendesk') ||
    text.includes('centrum')
  ) {
    return 'centrum';
  }

  if (
    text.includes('[genesis]') ||
    text.includes('canal: genesis') ||
    text.includes('numero de reporte genesis') ||
    text.includes('genesis healthcare') ||
    text.includes(' genesis ')
  ) {
    return 'genesis';
  }

  return '';
};

const extractChannelFromEquipment = (equipment?: EquipmentSummary | null): TicketChannelCode => {
  const clientText = normalizeText(equipment?.clientes?.razon_social);

  if (!clientText) {
    return '';
  }

  if (clientText.includes('falcon')) {
    return 'falcon';
  }

  if (clientText.includes('centrum promotora internacional') || clientText.includes('centrum')) {
    return 'centrum';
  }

  if (clientText.includes('genesis healthcare') || clientText.includes('genesis') || clientText.includes('generis')) {
    return 'genesis';
  }

  return '';
};

const isMexicoCityText = (value: string | null | undefined) => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return false;
  }

  return [
    'cdmx',
    'ciudad de mexico',
    'distrito federal',
    'mexico city',
    'ciudad mexico',
  ].some((candidate) => normalized.includes(candidate));
};

const extractLocationFromDescription = (description: string | null | undefined) => {
  const raw = description || '';
  return {
    locality:
      extractLabeledValue(raw, ['Localidad', 'Ciudad', 'Municipio', 'Unidad/Laboratorio']) ||
      extractLabeledValue(raw, ['Cliente/Institución']),
    state: extractLabeledValue(raw, ['Estado']),
    address: extractLabeledValue(raw, ['Dirección']),
  };
};

const formatCountdown = (remainingMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const timeChunk = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  if (days > 0) {
    return `${days}d ${timeChunk}`;
  }

  return timeChunk;
};

export const getFalconTicketSla = (
  ticket: TicketLike,
  equipment?: EquipmentSummary | null,
  nowMs = Date.now(),
): FalconTicketSla | null => {
  const channel = extractChannelFromTicket(ticket) || extractChannelFromEquipment(equipment);
  if (channel !== 'falcon') {
    return null;
  }

  const descriptionLocation = extractLocationFromDescription(ticket.descripcion);
  const addressCandidates = uniqueNonEmpty([
    equipment?.ciudad,
    equipment?.municipio,
    equipment?.estado,
    equipment?.direccion,
    descriptionLocation.locality,
    descriptionLocation.state,
    descriptionLocation.address,
  ]);
  const isMexicoCity = addressCandidates.some((candidate) => isMexicoCityText(candidate));
  const limitHours: 24 | 48 = isMexicoCity ? 24 : 48;
  const createdAtMs = Number.isNaN(new Date(ticket.creado_en).getTime()) ? nowMs : new Date(ticket.creado_en).getTime();
  const dueAtMs = createdAtMs + limitHours * 60 * 60 * 1000;
  const elapsedMs = Math.max(0, nowMs - createdAtMs);
  const remainingMs = dueAtMs - nowMs;
  const warningThresholdMs = limitHours === 24 ? 8 * 60 * 60 * 1000 : 16 * 60 * 60 * 1000;
  const criticalThresholdMs = limitHours === 24 ? 3 * 60 * 60 * 1000 : 6 * 60 * 60 * 1000;
  const severity: TicketSlaSeverity =
    remainingMs <= 0 ? 'breached' : remainingMs <= criticalThresholdMs ? 'critical' : remainingMs <= warningThresholdMs ? 'warning' : 'healthy';

  return {
    tracked: true,
    channel,
    limitHours,
    isMexicoCity,
    createdAtMs,
    dueAtMs,
    elapsedMs,
    remainingMs,
    severity,
    countdownLabel: formatCountdown(Math.abs(remainingMs)),
    statusLabel:
      severity === 'breached'
        ? `Incumplido por ${formatCountdown(Math.abs(remainingMs))}`
        : `Restan ${formatCountdown(remainingMs)}`,
    scopeLabel: isMexicoCity ? 'CDMX · SLA 24 h' : 'Foráneo · SLA 48 h',
  };
};

export const getFalconSlaTone = (severity: TicketSlaSeverity) => {
  if (severity === 'breached') {
    return {
      background: 'rgba(127, 29, 29, 0.3)',
      border: 'rgba(248, 113, 113, 0.62)',
      color: '#ffe4e6',
    };
  }

  if (severity === 'critical') {
    return {
      background: 'rgba(225, 29, 72, 0.2)',
      border: 'rgba(244, 63, 94, 0.55)',
      color: '#ffe4ea',
    };
  }

  if (severity === 'warning') {
    return {
      background: 'rgba(250, 204, 21, 0.18)',
      border: 'rgba(250, 204, 21, 0.42)',
      color: '#fff3b0',
    };
  }

  return {
    background: 'rgba(34, 197, 94, 0.12)',
    border: 'rgba(74, 222, 128, 0.3)',
    color: '#d8ffe7',
  };
};

export const formatFalconScopeLabel = (sla: FalconTicketSla) =>
  `${getChannelLabel(sla.channel)} · ${sla.scopeLabel}`;

export const formatLocationLine = (ticket: TicketLike, equipment?: EquipmentSummary | null) => {
  const descriptionLocation = extractLocationFromDescription(ticket.descripcion);
  return uniqueNonEmpty([
    equipment?.municipio || equipment?.ciudad,
    equipment?.estado,
    descriptionLocation.locality,
    descriptionLocation.state,
  ])
    .map((value) => toSentenceCase(value))
    .join(' · ');
};
