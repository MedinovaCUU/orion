import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Helper centralizado para altas de equipos desde actas o reportes PDF.
GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface EquipmentDocumentDraft {
  numeroSerie: string;
  modelo: string;
  clientName: string;
  contactName: string;
  phone: string;
  direccion: string;
  colonia: string;
  ciudad: string;
  municipio: string;
  estado: string;
  codigoPostal: string;
  pais: string;
  fechaInicio: string;
  terminoGarantia: string;
  software: string;
  firmware: string;
}

export interface EquipmentDocumentImportResult {
  rawText: string;
  draft: EquipmentDocumentDraft;
  summary: string[];
}

type OcrProgressHandler = (progress: number, status: string) => void;

interface OcrLoggerMessage {
  status?: string;
  progress?: number;
}

const EMPTY_DRAFT: EquipmentDocumentDraft = {
  numeroSerie: '',
  modelo: '',
  clientName: '',
  contactName: '',
  phone: '',
  direccion: '',
  colonia: '',
  ciudad: '',
  municipio: '',
  estado: '',
  codigoPostal: '',
  pais: '',
  fechaInicio: '',
  terminoGarantia: '',
  software: '',
  firmware: '',
};

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const compactSpaces = (value: string) => value.replace(/\s+/g, ' ').trim();

const uniqueNonEmpty = (values: string[]) =>
  values.filter((value, index, collection) => value && collection.indexOf(value) === index);

const sanitizePhone = (value: string) => compactSpaces(value).replace(/[^\d+()\-\s]/g, '').trim();

const EQUIPMENT_MODEL_REGEX = /\b(?:BA\d{3}(?:v[\d.]+)?|A\d{2,3}|Y\d{2,3}|IPRO|ISE)\b/gi;
const MODEL_WITH_VERSION_REGEX = /\b[A-Z]{1,5}\d{1,4}v[\d.]+\b/g;
const SEMVER_REGEX = /\b\d+\.\d+\.\d+\b/g;
const DATE_REGEX = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/g;
const LONG_NUMBER_REGEX = /\b\d{8,14}\b/g;
const FIVE_DIGIT_ZIP_REGEX = /\b\d{5}\b/;
const DATE_LINE_REGEX = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/;
const LONG_NUMBER_LINE_REGEX = /\b\d{8,14}\b/;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const labeledValuePatterns = (labels: string[]) =>
  labels.map((label) => new RegExp(`(?:^|\\n)\\s*${escapeRegex(label)}\\s*:?[ \\t]*(?:\\n\\s*)?([^\\n]+)`, 'i'));

const extractLabeledValue = (rawText: string, labels: string[]) => {
  for (const pattern of labeledValuePatterns(labels)) {
    const match = rawText.match(pattern);
    if (!match) {
      continue;
    }

    const candidate = compactSpaces(match[1] || '');
    if (candidate) {
      return candidate;
    }
  }

  return '';
};

const parseDateToIso = (value: string) => {
  const match = compactSpaces(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  const slashMatch = compactSpaces(value).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!slashMatch) {
    return '';
  }

  const day = slashMatch[1].padStart(2, '0');
  const month = slashMatch[2].padStart(2, '0');
  const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
  return `${year}-${month}-${day}`;
};

const findFirstIsoDate = (rawText: string, labels: string[] = []) => {
  const labeled = labels
    .map((label) => parseDateToIso(extractLabeledValue(rawText, [label])))
    .find(Boolean);

  if (labeled) {
    return labeled;
  }

  const matches = rawText.match(DATE_REGEX) || [];
  for (const match of matches) {
    const candidate = parseDateToIso(match);
    if (candidate) {
      return candidate;
    }
  }

  return '';
};

const normalizeModel = (value: string) => compactSpaces(value.replace(/v[\d.]+$/i, '').toUpperCase());

const extractModel = (rawText: string) => {
  const labeledModel = extractLabeledValue(rawText, ['modelo', 'analizador', 'equipo']);
  const normalizedLabeledModel = normalizeModel(labeledModel);
  if (normalizedLabeledModel) {
    return normalizedLabeledModel;
  }

  const matches = rawText.match(EQUIPMENT_MODEL_REGEX) || [];
  const firstMatch = matches.find((value) => /[A-Z]/i.test(value));
  return firstMatch ? normalizeModel(firstMatch) : '';
};

const looksLikePhoneLine = (line: string) => {
  const digits = line.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 14;
};

const looksLikeStopLine = (line: string) => {
  const normalized = normalizeText(line);
  if (!normalized) {
    return true;
  }

  return (
    normalized.startsWith('se capacita') ||
    normalized.startsWith('se instala') ||
    normalized.startsWith('se deja') ||
    normalized.startsWith('se solicita') ||
    normalized.startsWith('tlc ') ||
    normalized.startsWith('qfb ') ||
    normalized.startsWith('ibt ') ||
    /^ok\b/.test(normalized) ||
    normalized === 'si'
  );
};

const looksLikeAddressBlockLine = (line: string) => {
  const normalized = normalizeText(line);
  if (!normalized || looksLikePhoneLine(line) || looksLikeStopLine(line)) {
    return false;
  }

  if (LONG_NUMBER_LINE_REGEX.test(line) && !FIVE_DIGIT_ZIP_REGEX.test(line)) {
    return false;
  }

  return /[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(line);
};

const extractEmbeddedPdfText = async (file: File, onProgress?: OcrProgressHandler) => {
  const buffer = await file.arrayBuffer();
  const pdfDocument = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];

  for (let pageIndex = 1; pageIndex <= pdfDocument.numPages; pageIndex += 1) {
    const page = await pdfDocument.getPage(pageIndex);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join('\n');

    if (compactSpaces(pageText)) {
      pages.push(pageText);
    }

    onProgress?.(Math.min(0.45, pageIndex / Math.max(1, pdfDocument.numPages) / 2), `Leyendo PDF (${pageIndex}/${pdfDocument.numPages})`);
  }

  return pages.join('\n');
};

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });

const createWorker = async (onProgress?: OcrProgressHandler) => {
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

const ocrImage = async (file: Blob, onProgress?: OcrProgressHandler) => {
  const worker = await createWorker(onProgress);
  try {
    const dataUrl = await toDataUrl(file);
    const { data } = await worker.recognize(dataUrl);
    return data.text?.trim() || '';
  } finally {
    await worker.terminate();
  }
};

const ocrPdfPages = async (file: File, onProgress?: OcrProgressHandler) => {
  const buffer = await file.arrayBuffer();
  const pdfDocument = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const pageLimit = Math.min(pdfDocument.numPages, 3);
  const worker = await createWorker(onProgress);
  const chunks: string[] = [];

  try {
    for (let pageIndex = 1; pageIndex <= pageLimit; pageIndex += 1) {
      const page = await pdfDocument.getPage(pageIndex);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');

      if (!context) {
        continue;
      }

      await page.render({ canvasContext: context, viewport, canvas }).promise;
      const dataUrl = canvas.toDataURL('image/png');
      const { data } = await worker.recognize(dataUrl);

      if (data.text?.trim()) {
        chunks.push(data.text.trim());
      }

      onProgress?.(0.45 + (pageIndex / Math.max(1, pageLimit)) * 0.5, `Aplicando OCR al PDF (${pageIndex}/${pageLimit})`);
    }
  } finally {
    await worker.terminate();
  }

  return chunks.join('\n');
};

const extractRawDocumentText = async (file: File, onProgress?: OcrProgressHandler) => {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    let rawText = await extractEmbeddedPdfText(file, onProgress);

    if (compactSpaces(rawText).length < 120) {
      onProgress?.(0.46, 'PDF con poco texto embebido, aplicando OCR');
      rawText = await ocrPdfPages(file, onProgress);
    }

    onProgress?.(1, 'Importación lista');
    return rawText;
  }

  if (file.type.startsWith('image/')) {
    const rawText = await ocrImage(file, onProgress);
    onProgress?.(1, 'Importación lista');
    return rawText;
  }

  throw new Error('Solo se admiten PDFs o imágenes de actas para prellenar el alta.');
};

const extractSerialFromFileName = (fileName: string) => {
  const match = fileName.match(/(?:serie|noserie|no-serie|ns|sn)?[_-]?(\d{8,14})/i);
  return match?.[1] || '';
};

const extractPhone = (rawText: string, lines: string[]) => {
  const labeledPhone = sanitizePhone(extractLabeledValue(rawText, ['telefono', 'teléfono', 'tel', 'celular', 'cel']));
  if (labeledPhone) {
    return labeledPhone;
  }

  const linePhone = lines.find(looksLikePhoneLine);
  return linePhone ? sanitizePhone(linePhone) : '';
};

const extractAddressBlock = (lines: string[], rawText: string) => {
  const labeledAddress = compactSpaces(extractLabeledValue(rawText, ['direccion', 'dirección', 'domicilio']));
  if (labeledAddress) {
    return [labeledAddress];
  }

  const contactLabelIndex = lines.findIndex((line) =>
    ['encargado', 'responsable', 'contacto', 'usuario'].some((token) => normalizeText(line).includes(token)),
  );

  let startIndex = contactLabelIndex >= 0 ? contactLabelIndex + 1 : -1;
  if (startIndex >= 0 && lines[startIndex] && !looksLikeAddressBlockLine(lines[startIndex])) {
    startIndex += 1;
  }

  if (startIndex < 0) {
    const dateIndex = lines.findIndex((line) => DATE_LINE_REGEX.test(line));
    if (dateIndex >= 0) {
      startIndex = dateIndex + 2;
    }
  }

  if (startIndex < 0) {
    return [];
  }

  const block: string[] = [];
  for (let index = startIndex; index < lines.length && block.length < 4; index += 1) {
    const line = lines[index];
    if (looksLikePhoneLine(line) || looksLikeStopLine(line)) {
      break;
    }

    if (looksLikeAddressBlockLine(line)) {
      block.push(line);
    }
  }

  return block;
};

const extractClientName = (rawText: string, lines: string[]) => {
  const labeledClient = compactSpaces(
    extractLabeledValue(rawText, ['cliente', 'razon social', 'razón social', 'institucion', 'institución', 'hospital', 'laboratorio']),
  );
  if (labeledClient) {
    return labeledClient;
  }

  const dateIndex = lines.findIndex((line) => DATE_LINE_REGEX.test(line));
  if (dateIndex >= 0) {
    for (let index = dateIndex + 1; index <= Math.min(lines.length - 1, dateIndex + 6); index += 1) {
      const line = compactSpaces(lines[index] || '');
      const normalized = normalizeText(line);
      if (!line || looksLikePhoneLine(line) || looksLikeStopLine(line)) {
        continue;
      }

      if (/laboratorio|hospital|clinica|cl[ií]nico|instituto|centro|universidad|banco|diagn[oó]stica/i.test(normalized)) {
        return line;
      }
    }
  }

  return '';
};

const extractContactName = (rawText: string, lines: string[]) => {
  const labeledContact = compactSpaces(
    extractLabeledValue(rawText, [
      'encargado de laboratorio',
      'responsable',
      'contacto',
      'atencion',
      'atención',
      'usuario',
      'nombre del usuario',
    ]),
  );
  if (labeledContact) {
    return labeledContact;
  }

  const contactLabelIndex = lines.findIndex((line) =>
    ['encargado', 'responsable', 'contacto', 'usuario'].some((token) => normalizeText(line).includes(token)),
  );

  if (contactLabelIndex >= 0) {
    const nextLine = compactSpaces(lines[contactLabelIndex + 1] || '');
    if (nextLine && !looksLikePhoneLine(nextLine) && !looksLikeStopLine(nextLine)) {
      return nextLine;
    }
  }

  return '';
};

const inferLocationFields = (rawText: string, lines: string[]) => {
  const addressBlock = extractAddressBlock(lines, rawText);
  const explicitColonia = compactSpaces(extractLabeledValue(rawText, ['colonia']));
  const explicitCiudad = compactSpaces(extractLabeledValue(rawText, ['ciudad', 'localidad']));
  const explicitMunicipio = compactSpaces(extractLabeledValue(rawText, ['municipio']));
  const explicitEstado = compactSpaces(extractLabeledValue(rawText, ['estado']));
  const explicitPostalCode = compactSpaces(extractLabeledValue(rawText, ['codigo postal', 'código postal', 'cp', 'c.p.']));
  const explicitCountry = compactSpaces(extractLabeledValue(rawText, ['pais', 'país']));

  const addressLine = addressBlock.find((line) => /\d/.test(line)) || addressBlock[0] || '';
  const nonAddressLines = addressBlock.filter((line) => line !== addressLine);
  const postalLine = addressBlock.find((line) => FIVE_DIGIT_ZIP_REGEX.test(line)) || '';
  const localityLine = nonAddressLines[0] || '';
  const fallbackPostalCode = postalLine.match(FIVE_DIGIT_ZIP_REGEX)?.[0] || '';
  const stateCandidate = compactSpaces(postalLine.replace(FIVE_DIGIT_ZIP_REGEX, '').replace(/[,-]/g, ' '));

  let colonia = explicitColonia;
  let ciudad = explicitCiudad;
  const municipio = explicitMunicipio;
  let estado = explicitEstado || stateCandidate;

  if (!colonia && localityLine) {
    if (stateCandidate && normalizeText(localityLine).endsWith(normalizeText(stateCandidate))) {
      colonia = compactSpaces(localityLine.slice(0, Math.max(0, localityLine.length - stateCandidate.length)));
    } else {
      colonia = localityLine;
    }
  }

  if (!ciudad && stateCandidate) {
    ciudad = stateCandidate;
  }

  if (!estado && ciudad) {
    estado = ciudad;
  }

  return {
    direccion: addressLine,
    colonia,
    ciudad,
    municipio,
    estado,
    codigoPostal: explicitPostalCode || fallbackPostalCode,
    pais: explicitCountry || (estado || ciudad || fallbackPostalCode ? 'México' : ''),
  };
};

const buildSummary = (draft: EquipmentDocumentDraft) =>
  uniqueNonEmpty([
    draft.numeroSerie ? `Serie: ${draft.numeroSerie}` : '',
    draft.modelo ? `Modelo: ${draft.modelo}` : '',
    draft.clientName ? `Cliente: ${draft.clientName}` : '',
    draft.contactName ? `Contacto: ${draft.contactName}` : '',
    draft.phone ? `Teléfono: ${draft.phone}` : '',
    draft.fechaInicio ? `Instalación: ${draft.fechaInicio}` : '',
    draft.estado ? `Estado: ${draft.estado}` : '',
    draft.codigoPostal ? `CP: ${draft.codigoPostal}` : '',
    draft.software ? `Software: ${draft.software}` : '',
    draft.firmware ? `Firmware: ${draft.firmware}` : '',
  ]);

export const parseEquipmentDocumentText = (rawText: string, fileName = ''): EquipmentDocumentImportResult => {
  const normalizedText = rawText.replace(/\r/g, '\n');
  const lines = normalizedText
    .split('\n')
    .map((line) => compactSpaces(line))
    .filter(Boolean);

  const serialFromText =
    extractLabeledValue(normalizedText, ['no. de serie', 'no de serie', 'numero de serie', 'número de serie', 'serie']) ||
    lines.find((line) => /^\d{8,14}$/.test(line)) ||
    (normalizedText.match(LONG_NUMBER_REGEX) || [])[0] ||
    '';

  const fileNameSerial = extractSerialFromFileName(fileName);
  const modelWithVersion = uniqueNonEmpty(normalizedText.match(MODEL_WITH_VERSION_REGEX) || []);
  const plainVersions = uniqueNonEmpty(normalizedText.match(SEMVER_REGEX) || []);
  const inferredLocation = inferLocationFields(normalizedText, lines);

  const draft: EquipmentDocumentDraft = {
    ...EMPTY_DRAFT,
    numeroSerie: compactSpaces(serialFromText || fileNameSerial),
    modelo: extractModel(normalizedText),
    clientName: extractClientName(normalizedText, lines),
    contactName: extractContactName(normalizedText, lines),
    phone: extractPhone(normalizedText, lines),
    direccion: inferredLocation.direccion,
    colonia: inferredLocation.colonia,
    ciudad: inferredLocation.ciudad,
    municipio: inferredLocation.municipio,
    estado: inferredLocation.estado,
    codigoPostal: inferredLocation.codigoPostal,
    pais: inferredLocation.pais,
    fechaInicio: findFirstIsoDate(normalizedText, ['fecha de instalacion', 'fecha instalación', 'fecha de capacitación', 'fecha']),
    terminoGarantia: findFirstIsoDate(normalizedText, ['termino de garantia', 'término de garantía', 'vigencia']),
    software: compactSpaces(extractLabeledValue(normalizedText, ['software', 'version de software', 'versión de software']) || plainVersions[0] || ''),
    firmware: compactSpaces(
      extractLabeledValue(normalizedText, ['firmware', 'version de firmware', 'versión de firmware']) ||
        modelWithVersion[0] ||
        plainVersions[1] ||
        '',
    ),
  };

  return {
    rawText: normalizedText,
    draft,
    summary: buildSummary(draft),
  };
};

export const importEquipmentDraftFromDocument = async (file: File, onProgress?: OcrProgressHandler) => {
  const rawText = await extractRawDocumentText(file, onProgress);

  if (!compactSpaces(rawText)) {
    throw new Error('No fue posible extraer texto útil del documento.');
  }

  return parseEquipmentDocumentText(rawText, file.name);
};
