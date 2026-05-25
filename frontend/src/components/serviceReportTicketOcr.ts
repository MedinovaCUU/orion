import type { ServiceReportFormData, SpecialClientCode } from './serviceReports';

type PartialRemoteReport = Partial<ServiceReportFormData>;

interface TicketSection {
  key: string;
  rawKey: string;
  value: string;
}

interface FindSectionOptions {
  excludeTerms?: string[];
  preferNonEmpty?: boolean;
  exactOnly?: boolean;
}

interface OcrLoggerMessage {
  status?: string;
  progress?: number;
}

export interface ServiceReportTicketOcrResult {
  rawText: string;
  extractedFields: PartialRemoteReport;
  extractedSummary: string[];
}

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const compactSpaces = (value: string) => value.replace(/\s+/g, ' ').trim();

const normalizePhone = (value: string) => compactSpaces(value).replace(/[^\d+()\-\s]/g, '').trim();

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const uniqueNonEmpty = (values: string[]) =>
  values.filter((value, index, collection) => value && collection.indexOf(value) === index);

const looksLikeLabelLine = (value: string) => {
  const compact = compactSpaces(value);
  if (!compact) {
    return false;
  }

  return /^[A-Za-zÁÉÍÓÚÑáéíóúñ0-9 .()/-]{2,48}:$/.test(compact) || /^[A-Za-zÁÉÍÓÚÑáéíóúñ .()/-]{2,48}:\s+/.test(compact);
};

const cleanPersonName = (value: string) =>
  compactSpaces(
    value
      .replace(/^[Qq]\s+/g, '')
      .replace(/^[^A-Za-zÁÉÍÓÚÑáéíóúñ]+/g, '')
      .replace(/\b(?:cel|tel|telefono|teléfono)\b.*$/i, '')
      .replace(/\d{7,}/g, '')
      .replace(/\s{2,}/g, ' '),
  );

const combineUnits = (medicalUnit: string, businessUnit: string) => {
  const uniqueValues = uniqueNonEmpty([compactSpaces(medicalUnit), compactSpaces(businessUnit)]);
  return uniqueValues.join(' · ');
};

const scoreSectionMatch = (sectionKey: string, label: string, exactOnly = false) => {
  if (sectionKey === label) {
    return 120;
  }

  if (sectionKey.startsWith(`${label} `) || sectionKey.startsWith(`${label}.`) || sectionKey.startsWith(`${label}:`)) {
    return 96;
  }

  if (sectionKey.endsWith(` ${label}`)) {
    return exactOnly ? -1 : 82;
  }

  if (` ${sectionKey} `.includes(` ${label} `)) {
    return exactOnly ? -1 : 74;
  }

  if (sectionKey.startsWith(label) || label.startsWith(sectionKey)) {
    return exactOnly ? -1 : 66;
  }

  if (sectionKey.includes(label) || label.includes(sectionKey)) {
    return exactOnly ? -1 : 52;
  }

  return -1;
};

const buildSections = (rawText: string) => {
  const lines = rawText
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => compactSpaces(line))
    .filter(Boolean);

  const sections: TicketSection[] = [];
  const freeLines: string[] = [];
  let current: TicketSection | null = null;

  const flush = () => {
    if (!current) {
      return;
    }

    sections.push({
      ...current,
      value: compactSpaces(current.value),
    });
    current = null;
  };

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    const rawKey = colonIndex > 0 ? compactSpaces(line.slice(0, colonIndex)) : '';
    const value = colonIndex > 0 ? compactSpaces(line.slice(colonIndex + 1)) : '';
    const looksLikeKey =
      colonIndex > 0 &&
      colonIndex < 70 &&
      rawKey.length >= 2 &&
      rawKey.length <= 48 &&
      /[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(rawKey) &&
      !rawKey.includes('@');

    if (looksLikeKey) {
      flush();
      current = {
        rawKey,
        key: normalizeText(rawKey),
        value,
      };
      continue;
    }

    if (current) {
      current.value = compactSpaces([current.value, line].filter(Boolean).join(' '));
      continue;
    }

    freeLines.push(line);
  }

  flush();

  return { sections, freeLines };
};

const findSection = (sections: TicketSection[], labels: string[], options: FindSectionOptions = {}) => {
  const normalizedLabels = labels.map((label) => normalizeText(label));
  const excludedTerms = (options.excludeTerms || []).map((term) => normalizeText(term));

  let bestMatch: TicketSection | undefined;
  let bestScore = -1;

  for (const section of sections) {
    if (excludedTerms.some((term) => term && section.key.includes(term))) {
      continue;
    }

    for (const label of normalizedLabels) {
      const score = scoreSectionMatch(section.key, label, options.exactOnly);
      if (score < 0) {
        continue;
      }

      const boostedScore = score + (options.preferNonEmpty && section.value ? 6 : 0);
      if (boostedScore > bestScore) {
        bestScore = boostedScore;
        bestMatch = section;
      }
    }
  }

  return bestMatch;
};

const extractLabeledValue = (rawText: string, labels: string[]) => {
  for (const label of labels) {
    const regex = new RegExp(`(?:^|\\n)\\s*${escapeRegex(label)}\\s*:?[ \\t]*(?:\\n\\s*)?([^\\n]+)`, 'i');
    const match = rawText.match(regex);

    if (!match) {
      continue;
    }

    const candidate = compactSpaces(match[1] || '');
    if (!candidate || looksLikeLabelLine(candidate)) {
      continue;
    }

    return candidate;
  }

  return '';
};

const extractFirstLongNumber = (value: string) => value.match(/\b(\d{8,14})\b/)?.[1] || '';

const inferUnitFromHeader = (headerLine: string, model: string) => {
  const normalizedHeader = compactSpaces(headerLine);
  if (!normalizedHeader) {
    return '';
  }

  const afterColon = compactSpaces(normalizedHeader.split(':').slice(1).join(':'));
  const withoutReportNumber = compactSpaces(afterColon.replace(/['‘’"]?\d{8,14}['‘’"]?.*$/, ''));
  let candidate = withoutReportNumber;

  if (model) {
    candidate = compactSpaces(candidate.replace(new RegExp(`^${escapeRegex(model)}\\b`, 'i'), ''));
  }

  candidate = compactSpaces(candidate.replace(/^(BIOSYSTEMS)\b/i, ''));
  candidate = compactSpaces(candidate.replace(/^(BA\s*\d+[A-Z0-9-]*)\b/i, ''));

  if (!candidate || /\bcorrectivo\b|\bpreventivo\b|\bservicio\b/i.test(candidate)) {
    return '';
  }

  return candidate;
};

const extractDate = (value: string) => {
  const match = value.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (!match) {
    return '';
  }

  const [, dayText, monthText, yearText] = match;
  const year = yearText.length === 2 ? `20${yearText}` : yearText;
  const month = monthText.padStart(2, '0');
  const day = dayText.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const extractTime = (value: string) => {
  const normalized = value
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
  const meridiem = match[4];

  if (meridiem === 'PM' && hours < 12) {
    hours += 12;
  }

  if (meridiem === 'AM' && hours === 12) {
    hours = 0;
  }

  return `${String(hours).padStart(2, '0')}:${minutes}`;
};

const mapServiceType = (
  value: string,
): ServiceReportFormData['serviceType'] => {
  const normalized = normalizeText(value);

  if (normalized.includes('prevent')) return 'preventivo';
  if (normalized.includes('correct')) return 'correctivo';
  if (normalized.includes('instal')) return 'instalacion';
  if (normalized.includes('capacit')) return 'capacitacion';
  if (normalized.includes('emerg') || normalized.includes('falla critica')) return 'emergencia';

  return 'otro';
};

const mapPriority = (value: string): ServiceReportFormData['priority'] | undefined => {
  const normalized = normalizeText(value);

  if (normalized.includes('critic') || normalized.includes('urgente')) return 'critica';
  if (normalized.includes('alta')) return 'alta';
  if (normalized.includes('baja')) return 'baja';
  if (normalized) return 'media';

  return undefined;
};

const summarizeFailure = (value: string) => {
  const normalized = compactSpaces(value);
  if (!normalized) {
    return '';
  }

  return normalized.length > 180 ? `${normalized.slice(0, 177).trim()}...` : normalized;
};

const cleanIssueText = (value: string) =>
  compactSpaces(
    value
      .replace(/\bContact[oe]\b\s+[A-Za-zÁÉÍÓÚÑáéíóúñQq .'-]+$/i, '')
      .replace(/\bContact[oe]\b.*$/i, '')
      .replace(/\s+,/g, ','),
  );

const inferSpecialClientCode = (normalizedTextBlob: string, sections: TicketSection[]): SpecialClientCode => {
  if (
    findSection(sections, ['no de reporte falcon', 'numero de reporte falcon', 'reporte falcon']) ||
    normalizedTextBlob.includes('falconmx') ||
    normalizedTextBlob.includes(' falcon ')
  ) {
    return 'falcon';
  }

  if (
    findSection(sections, ['ticket zendesk', 'numero de ticket zendesk', 'no de ticket zendesk']) ||
    normalizedTextBlob.includes('zendesk') ||
    normalizedTextBlob.includes('centrum')
  ) {
    return 'centrum';
  }

  if (
    findSection(sections, ['numero de reporte genesis', 'numero de reporte generis']) ||
    normalizedTextBlob.includes('genesis healthcare') ||
    normalizedTextBlob.includes('generis healthcare') ||
    normalizedTextBlob.includes(' genesis ') ||
    normalizedTextBlob.includes(' generis ')
  ) {
    return 'genesis';
  }

  return '';
};

const extractSpecialReferenceValue = (sections: TicketSection[], code: SpecialClientCode) => {
  if (code === 'falcon') {
    return findSection(sections, ['no de reporte falcon', 'numero de reporte falcon', 'reporte falcon'])?.value || '';
  }

  if (code === 'centrum') {
    return findSection(sections, ['ticket zendesk', 'numero de ticket zendesk', 'no de ticket zendesk'])?.value || '';
  }

  if (code === 'genesis') {
    return (
      findSection(sections, ['numero de reporte genesis', 'numero de reporte generis', 'numero de reporte'])?.value || ''
    );
  }

  return '';
};

export const parseServiceReportTicketText = (rawText: string): ServiceReportTicketOcrResult => {
  const { sections, freeLines } = buildSections(rawText);
  const normalizedBlob = ` ${normalizeText(rawText)} `;
  const textLines = rawText
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => compactSpaces(line))
    .filter(Boolean);
  const firstMeaningfulLine = textLines[0] || '';

  const headerSection =
    findSection(sections, ['servicio - correctivo', 'servicio - preventivo', 'servicio', 'reporte']) || null;
  const registrationSection = findSection(sections, ['fecha y hora de registro', 'fecha de registro', 'fecha']);
  const institutionSection = findSection(sections, ['institucion', 'cliente', 'hospital', 'laboratorio']);
  const unitSection = findSection(sections, ['unidad medica', 'unidad médica'], { preferNonEmpty: true });
  const businessSection = findSection(sections, ['unidad de negocio', 'unidad de negoci'], { preferNonEmpty: true });
  const addressSection = findSection(sections, ['direccion', 'dirección']);
  const localitySection = findSection(sections, ['localidad']);
  const stateSection = findSection(sections, ['estado']);
  const contactSection = findSection(sections, ['contacto'], {
    excludeTerms: ['del contacto', 'cel', 'telefono', 'tel', 'quien reporta', 'reporta'],
    preferNonEmpty: true,
    exactOnly: true,
  });
  const institutionPhoneSection = findSection(sections, ['telefono', 'teléfono'], {
    excludeTerms: ['contacto', 'quien reporta', 'reporta'],
    preferNonEmpty: true,
  });
  const contactPhoneSection = findSection(
    sections,
    ['cel. del contacto', 'cel del contacto', 'tel. del contacto', 'telefono del contacto', 'el. del contacto'],
    { preferNonEmpty: true },
  );
  const reporterSection = findSection(sections, ['quien reporta', 'quién reporta'], { preferNonEmpty: true });
  const reporterPhoneSection = findSection(sections, ['cel. de quien reporta', 'cel de quien reporta', 'tel. de quien reporta'], {
    preferNonEmpty: true,
  });
  const serialSection = findSection(sections, ['no. de serie', 'numero de serie', 'n de serie']);
  const brandSection = findSection(sections, ['marca']);
  const modelSection = findSection(sections, ['modelo', 'analizador']);
  const issueSection = findSection(sections, ['situacion o falla reportada', 'situación o falla reportada', 'falla reportada']);
  const ticketTypeSection = findSection(sections, ['tipo de ticket', 'tipo de folio']);
  const userSection = findSection(sections, ['usuario']);
  const directContactValue = extractLabeledValue(rawText, ['Contacto', 'Contacte']);
  const rawMedicalUnit = extractLabeledValue(rawText, ['Unidad médica', 'Unidad medica']);
  const rawBusinessUnit = extractLabeledValue(rawText, ['Unidad de negocio', 'Unidad de negoci']);

  const callDate = extractDate(registrationSection?.value || '');
  const callTime = extractTime(registrationSection?.value || '');
  const cleanedIssueText = cleanIssueText(issueSection?.value || '');
  const issueSummary = summarizeFailure(cleanedIssueText);
  const addressParts = [addressSection?.value || '', localitySection?.value || '', stateSection?.value || '']
    .map((value) => compactSpaces(value))
    .filter(Boolean);
  const mergedAddress = addressParts.join(', ');
  const sitePhone = normalizePhone(
    reporterPhoneSection?.value || contactPhoneSection?.value || institutionPhoneSection?.value || '',
  );
  const serviceTypeText = [headerSection?.rawKey || '', headerSection?.value || '', ticketTypeSection?.value || '']
    .filter(Boolean)
    .join(' ');
  const specialClientCode = inferSpecialClientCode(normalizedBlob, sections);
  const headerReportNumber = extractFirstLongNumber(firstMeaningfulLine);
  const specialReferenceValue = extractSpecialReferenceValue(sections, specialClientCode) || headerReportNumber;
  const clientName = compactSpaces(institutionSection?.value || '');
  const model = compactSpaces(modelSection?.value || '');
  const headerMedicalUnit = inferUnitFromHeader(firstMeaningfulLine, model);
  const medicalUnit = compactSpaces(rawMedicalUnit || unitSection?.value || headerMedicalUnit);
  const businessUnit = compactSpaces(rawBusinessUnit || businessSection?.value || '');
  const businessUnitName = combineUnits(medicalUnit, businessUnit);
  const brand = compactSpaces(brandSection?.value || '');
  const equipmentName = [brand, model].filter(Boolean).join(' ').trim() || model;
  const headerSubject = compactSpaces(headerSection?.value || freeLines[0] || '');
  const reporterName = cleanPersonName(reporterSection?.value || '');
  const contactName = cleanPersonName(directContactValue || contactSection?.value || '');
  const resolvedUserName = cleanPersonName(userSection?.value || reporterName || contactName);
  const resolvedContactName = cleanPersonName(contactName || reporterName || directContactValue);

  const extractedFields: PartialRemoteReport = {
    reportType: 'remoto',
    callDate,
    startedAt: callTime,
    clientName,
    businessUnitName,
    siteAddress: mergedAddress,
    siteContact: resolvedContactName,
    sitePhone,
    specialUserName: resolvedUserName,
    equipmentSerial: compactSpaces(serialSection?.value || ''),
    equipmentName,
    subject: issueSummary || headerSubject,
    comments: cleanedIssueText,
    serviceType: mapServiceType(serviceTypeText),
    priority: mapPriority(serviceTypeText),
    specialClientCode,
    specialReferenceValue,
    isSoftwareCase: /software|firmware|usb|comunicacion|conexion|interface|interfaz/.test(normalizedBlob),
  };
  const filteredFields = Object.fromEntries(
    Object.entries(extractedFields).filter(([, value]) => {
      if (typeof value === 'string') {
        return value.trim().length > 0;
      }

      if (typeof value === 'boolean') {
        return value;
      }

      return value !== undefined && value !== null;
    }),
  ) as PartialRemoteReport;

  const summaryPairs: Array<[keyof PartialRemoteReport, string]> = [
    ['specialReferenceValue', 'referencia externa'],
    ['equipmentSerial', 'numero de serie'],
    ['clientName', 'cliente'],
    ['businessUnitName', 'unidad'],
    ['siteContact', 'contacto'],
    ['sitePhone', 'telefono'],
    ['subject', 'asunto'],
  ];

  const extractedSummary = summaryPairs
    .filter(([field]) => {
      const value = filteredFields[field];
      return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
    })
    .map(([, label]) => label);

  return {
    rawText: rawText.trim(),
    extractedFields: filteredFields,
    extractedSummary,
  };
};

const ensureImageBlob = async (source: Blob) => {
  if (source.type.startsWith('image/')) {
    return source;
  }

  throw new Error('Solo se puede extraer informacion automaticamente desde imagenes. El PDF puede guardarse como evidencia, pero su captura debe llenarse manualmente.');
};

export const extractServiceReportTicketFromImage = async (
  source: Blob,
  onProgress?: (progress: number, status: string) => void,
) => {
  const imageSource = await ensureImageBlob(source);
  const tesseractModule = await import('tesseract.js');
  const api = ('default' in tesseractModule ? tesseractModule.default : tesseractModule) as typeof import('tesseract.js');
  const worker = await api.createWorker('spa+eng', 1, {
    logger: (message: OcrLoggerMessage) => {
      onProgress?.(typeof message.progress === 'number' ? message.progress : 0, message.status || 'Procesando adjunto');
    },
  });

  try {
    await worker.setParameters({
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: api.PSM.SPARSE_TEXT,
      user_defined_dpi: '300',
    });

    const { data } = await worker.recognize(imageSource);
    const rawText = data.text?.trim() || '';

    if (!rawText) {
      throw new Error('La imagen no devolvio texto legible. Intenta con una captura mas nitida o llena el reporte manualmente.');
    }

    return parseServiceReportTicketText(rawText);
  } finally {
    await worker.terminate();
  }
};
