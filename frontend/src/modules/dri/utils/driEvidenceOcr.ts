import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type {
  DriCaseSignals,
  DriEvidenceArtifact,
  DriEvidenceDerivedData,
  DriEvidenceObservedInterferent,
  DriEvidenceDerivedServiceTest,
  DriServiceTestResult,
  DriServiceUtilityId,
} from '../types/dri.types';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type OcrProgressHandler = (progress: number, status: string) => void;

interface OcrLoggerMessage {
  status?: string;
  progress?: number;
}

interface UtilityPatternDefinition {
  utilityId: DriServiceUtilityId;
  label: string;
  tokens: string[];
}

export interface DriEvidenceOcrResult {
  rawText: string;
  summary: string[];
  derivedData: DriEvidenceDerivedData;
  sourceReference: string;
}

const utilityPatterns: UtilityPatternDefinition[] = [
  { utilityId: 'photometry', label: 'Photometry', tokens: ['photometry', 'photometria', 'fotometria'] },
  { utilityId: 'motors_valves_pumps', label: 'Motors, valves and pumps', tokens: ['motors valves pumps', 'motors, valves and pumps', 'bombas', 'valvulas', 'pumps'] },
  { utilityId: 'thermostatting', label: 'Thermostatting', tokens: ['thermostatting', 'thermostat', 'temperatura rotor', 'temperatura reaction rotor'] },
  { utilityId: 'level_detection', label: 'Level detection', tokens: ['level detection', 'deteccion de nivel', 'detec level'] },
  { utilityId: 'washing_station', label: 'Washing station', tokens: ['washing station', 'wash station', 'estacion de lavado', 'lavado'] },
  { utilityId: 'conditioning', label: 'Conditioning', tokens: ['conditioning', 'prime'] },
  { utilityId: 'positioning', label: 'Positioning', tokens: ['positioning', 'position adjust', 'posicionamiento'] },
  { utilityId: 'stress_mode', label: 'Stress mode', tokens: ['stress mode'] },
  { utilityId: 'historical_reports', label: 'Historical reports', tokens: ['historical reports', 'historico', 'historical'] },
  { utilityId: 'software_configuration', label: 'Configuración técnica', tokens: ['software configuration', 'configuration', 'configuracion', 'lis', 'factor de dilucion', 'dilution factor'] },
];

const abnormalTokens = [
  'anormal',
  'abnormal',
  'failed',
  'fail',
  'error',
  'alarma',
  'fuera de rango',
  'out of range',
  'desviado',
  'inestable',
  'incorrect',
  'incorrecto',
  'reject',
  'rechazo',
  'no pasa',
  'failed test',
];

const normalTokens = [
  'ok',
  'normal',
  'passed',
  'pass',
  'correcto',
  'estable',
  'dentro de rango',
  'within range',
  'sin error',
  'sin alarmas',
];

const compactSpaces = (value: string) => value.replace(/\s+/g, ' ').trim();

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const unique = <T,>(values: T[]) => values.filter((value, index) => values.indexOf(value) === index);

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });

const buildServiceNote = (label: string, result: DriServiceTestResult, excerpt: string) =>
  result === 'abnormal'
    ? `${label} marcado como anormal por OCR${excerpt ? `: ${excerpt}` : ''}`
    : `${label} marcado como normal por OCR${excerpt ? `: ${excerpt}` : ''}`;

const findExcerpt = (lines: string[], tokens: string[]) => {
  const normalizedTokens = tokens.map((token) => normalizeText(token));
  const match = lines.find((line) => normalizedTokens.some((token) => normalizeText(line).includes(token)));
  return compactSpaces(match || '').slice(0, 180);
};

const inferUtilityResult = (rawText: string, lines: string[], definition: UtilityPatternDefinition): DriEvidenceDerivedServiceTest | null => {
  const normalized = normalizeText(rawText);
  const hits = definition.tokens.filter((token) => normalized.includes(normalizeText(token)));
  if (!hits.length) {
    return null;
  }

  const excerpt = findExcerpt(lines, definition.tokens);
  const analysisWindow = normalizeText([excerpt, rawText].join(' '));
  const abnormalScore = abnormalTokens.reduce((score, token) => score + Number(analysisWindow.includes(token)), 0);
  const normalScore = normalTokens.reduce((score, token) => score + Number(analysisWindow.includes(token)), 0);

  if (!abnormalScore && !normalScore) {
    return null;
  }

  const result: DriServiceTestResult = abnormalScore >= normalScore ? 'abnormal' : 'normal';
  return {
    utilityId: definition.utilityId,
    label: definition.label,
    result,
    notes: buildServiceNote(definition.label, result, excerpt),
  };
};

const buildSignalPatch = (normalized: string): Partial<DriCaseSignals> => ({
  intermittentPattern: /\bintermitente\b|\bintermittent\b/.test(normalized) || undefined,
  normalCurvesObserved: /\bcurvas? normales?\b|\bnormal curves?\b/.test(normalized) || undefined,
  opticalRejectObserved: /\brechazo optico\b|\boptical reject\b|\breject optical\b|\bcuvette reject\b/.test(normalized) || undefined,
  waterSensitivePattern: /\bagua destilada\b|\bwater quality\b|\bwash solution\b|\bconductividad\b|\bquality water\b/.test(normalized) || undefined,
});

const parseObservedInterferents = (rawText: string): DriEvidenceObservedInterferent[] => {
  const matches: DriEvidenceObservedInterferent[] = [];
  const patterns = [
    {
      interferent: 'bilirubin',
      label: 'Bilirrubina',
      regex: /(?:bilirrubina(?:\s+total)?|bilirubin(?:\s+total)?)\D{0,24}(\d+(?:[.,]\d+)?)\s*(mg\/dl|g\/l|mmol\/l)/gi,
    },
    {
      interferent: 'hemolysis',
      label: 'Hemólisis / hemoglobina',
      regex: /(?:hem[oó]lisis|hemolysis|hemoglobina|hemoglobin)\D{0,24}(\d+(?:[.,]\d+)?)\s*(mg\/dl|g\/l|mmol\/l)/gi,
    },
    {
      interferent: 'lipemia',
      label: 'Lipemia / triglicéridos',
      regex: /(?:lipemia|triglic[eé]ridos|triglycerides)\D{0,24}(\d+(?:[.,]\d+)?)\s*(mg\/dl|g\/l|mmol\/l)/gi,
    },
    {
      interferent: 'ascorbic_acid',
      label: 'Ácido ascórbico',
      regex: /(?:acido\s+ascorbico|ácido\s+ascórbico|ascorbic\s+acid)\D{0,24}(\d+(?:[.,]\d+)?)\s*(mg\/dl|g\/l|mmol\/l)/gi,
    },
  ] as const;

  for (const pattern of patterns) {
    for (const match of rawText.matchAll(pattern.regex)) {
      const value = Number(match[1].replace(',', '.'));
      if (!Number.isFinite(value)) {
        continue;
      }
      matches.push({
        interferent: pattern.interferent,
        label: pattern.label,
        value,
        unit: match[2],
        sourceExcerpt: compactSpaces(match[0]),
      });
    }
  }

  return unique(matches.map((item) => JSON.stringify(item))).map((item) => JSON.parse(item) as DriEvidenceObservedInterferent);
};

const extractObservationLines = (
  serviceTests: DriEvidenceDerivedServiceTest[],
  signalPatch: Partial<DriCaseSignals>,
  observedInterferents: DriEvidenceObservedInterferent[],
  rawText: string,
) => {
  const lines: string[] = [];
  serviceTests.forEach((test) => {
    lines.push(`${test.label}: ${test.result === 'abnormal' ? 'anormal' : 'normal'}.`);
  });
  if (signalPatch.opticalRejectObserved) {
    lines.push('OCR detectó rechazo óptico.');
  }
  if (signalPatch.normalCurvesObserved) {
    lines.push('OCR detectó referencia a curvas normales.');
  }
  if (signalPatch.intermittentPattern) {
    lines.push('OCR detectó comportamiento intermitente.');
  }
  if (signalPatch.waterSensitivePattern) {
    lines.push('OCR detectó referencia a agua/solución de lavado.');
  }
  observedInterferents.forEach((item) => {
    lines.push(`${item.label} ${item.value} ${item.unit}.`);
  });

  const normalized = normalizeText(rawText);
  if (normalized.includes('factor de dilucion') || normalized.includes('dilution factor')) {
    lines.push('OCR detectó referencia a factor de dilución.');
  }
  if (normalized.includes('lis')) {
    lines.push('OCR detectó referencia a LIS/reporte.');
  }

  return unique(lines);
};

const parseOcrText = (rawText: string): DriEvidenceOcrResult => {
  const lines = rawText
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => compactSpaces(line))
    .filter(Boolean);

  const serviceTests = utilityPatterns
    .map((definition) => inferUtilityResult(rawText, lines, definition))
    .filter((item): item is DriEvidenceDerivedServiceTest => Boolean(item));

  const signalPatch = buildSignalPatch(normalizeText(rawText));
  const observedInterferents = parseObservedInterferents(rawText);
  const observationLines = extractObservationLines(serviceTests, signalPatch, observedInterferents, rawText);
  const summary = unique([
    ...serviceTests.map((test) => `${test.label}: ${test.result === 'abnormal' ? 'anormal' : 'normal'}`),
    ...(signalPatch.opticalRejectObserved ? ['Rechazo óptico detectado'] : []),
    ...(signalPatch.intermittentPattern ? ['Patrón intermitente detectado'] : []),
    ...(signalPatch.normalCurvesObserved ? ['Curvas normales detectadas'] : []),
    ...(signalPatch.waterSensitivePattern ? ['Referencia a agua/lavado detectada'] : []),
    ...observedInterferents.map((item) => `${item.label}: ${item.value} ${item.unit}`),
  ]).slice(0, 6);

  return {
    rawText,
    summary,
    derivedData: {
      signalPatch,
      serviceTests,
      observationLines,
      observedInterferents,
    },
    sourceReference: 'OCR DRI',
  };
};

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

const extractTextFromPdf = async (file: File, onProgress?: OcrProgressHandler) => {
  const buffer = await file.arrayBuffer();
  const pdfDocument = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const chunks: string[] = [];

  for (let pageIndex = 1; pageIndex <= pdfDocument.numPages; pageIndex += 1) {
    const page = await pdfDocument.getPage(pageIndex);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim();
    if (pageText) {
      chunks.push(pageText);
    }
    onProgress?.(Math.min(0.45, pageIndex / pdfDocument.numPages / 2), `Leyendo PDF (${pageIndex}/${pdfDocument.numPages})`);
  }

  return compactSpaces(chunks.join('\n')).trim();
};

const ocrPdfPages = async (file: File, onProgress?: OcrProgressHandler) => {
  const buffer = await file.arrayBuffer();
  const pdfDocument = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const worker = await createWorker(onProgress);
  const pageLimit = Math.min(pdfDocument.numPages, 3);
  const chunks: string[] = [];

  try {
    for (let pageIndex = 1; pageIndex <= pageLimit; pageIndex += 1) {
      const page = await pdfDocument.getPage(pageIndex);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = globalThis.document.createElement('canvas');
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('No se pudo crear el contexto de OCR para el PDF.');
      }

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const { data } = await worker.recognize(canvas);
      if (data.text?.trim()) {
        chunks.push(data.text.trim());
      }
      onProgress?.(0.45 + (pageIndex / pageLimit) * 0.45, `OCR PDF (${pageIndex}/${pageLimit})`);
    }
  } finally {
    await worker.terminate();
  }

  return compactSpaces(chunks.join('\n')).trim();
};

export async function runDriEvidenceOcr(file: File, onProgress?: OcrProgressHandler): Promise<DriEvidenceOcrResult> {
  const mimeType = file.type || '';
  let rawText = '';

  if (mimeType.startsWith('image/')) {
    onProgress?.(0.05, 'Leyendo imagen');
    rawText = await ocrImage(file, onProgress);
  } else if (mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    rawText = await extractTextFromPdf(file, onProgress);
    if (rawText.length < 120) {
      onProgress?.(0.46, 'PDF con poco texto embebido, aplicando OCR');
      rawText = await ocrPdfPages(file, onProgress);
    }
  } else if (mimeType.startsWith('text/')) {
    onProgress?.(0.1, 'Leyendo archivo de texto');
    rawText = await file.text();
  } else {
    throw new Error('Formato no compatible para OCR. Usa imagen, PDF o texto.');
  }

  const compacted = rawText.trim();
  if (!compacted) {
    throw new Error('No se obtuvo texto legible del archivo. Intenta con una captura más nítida o un PDF exportado con texto.');
  }

  onProgress?.(1, 'OCR listo');
  return parseOcrText(compacted);
}

export const buildObservationBlockFromEvidence = (item: DriEvidenceArtifact) => {
  const lines = item.derivedData?.observationLines || [];
  if (!lines.length) {
    return '';
  }
  const label = compactSpaces(item.title || item.fileName || item.type).slice(0, 60);
  return `[DRI_OCR:${item.id}] ${label}: ${lines.join(' ')}`;
};
