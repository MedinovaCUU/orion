import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { supabase } from '../supabaseClient';
import type { AdvisoryAttachmentAnalysis, AdvisoryAttachmentRecord } from './escalatedAdvisoryThread';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const DOCUMENTOS_BUCKET = 'documentos';

type OcrProgressHandler = (progress: number, status: string) => void;

interface OcrLoggerMessage {
  status?: string;
  progress?: number;
}

const advisoryEvidenceLogger = (scope: string, error: unknown) => {
  const reason = error instanceof Error ? error.message : String(error || 'unknown');
  console.warn(`[AdvisoryEvidence][${scope}] ${reason}`);
};

export const sanitizeAdvisoryFileName = (value: string) => value.replace(/[^a-zA-Z0-9._-]+/g, '-');

export const buildAdvisoryPublicFileUrl = (path: string) =>
  `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${DOCUMENTOS_BUCKET}/${path}`;

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const compactSpaces = (value: string) => value.replace(/\s+/g, ' ').trim();

const unique = <T,>(values: T[]) => values.filter((value, index) => values.indexOf(value) === index);

const evidenceTagPatterns = [
  { tag: 'control', tokens: ['control', 'qc', 'quality control'] },
  { tag: 'calibracion', tokens: ['calibracion', 'calibration', 'calibrador'] },
  { tag: 'blanco', tokens: ['blanco', 'blank'] },
  { tag: 'dilucion', tokens: ['dilucion', 'dilution', 'predilucion', 'factor de dilucion'] },
  { tag: 'fotometria', tokens: ['photometry', 'fotometria', 'fotometria'] },
  { tag: 'temperatura', tokens: ['thermostatting', 'temperatura', 'reaction rotor', 'thermo'] },
  { tag: 'lavado', tokens: ['washing station', 'wash station', 'lavado', 'carryover'] },
  { tag: 'r2', tokens: ['reagent2', 'r2', 'je1_b3', 'je1_ev3'] },
  { tag: 'bombas', tokens: ['pump', 'pumps', 'bombas', 'valvulas', 'valves'] },
  { tag: 'agua', tokens: ['water', 'agua destilada', 'wash solution', 'solucion de lavado'] },
  { tag: 'alarma', tokens: ['error', 'alarma', 'alarm', 'failed', 'reject', 'out of range'] },
  { tag: 'ok', tokens: ['ok', 'normal', 'passed', 'within range', 'sin errores'] },
];

const utilityPatterns = [
  { label: 'Photometry', tokens: ['photometry', 'fotometria'] },
  { label: 'Thermostatting', tokens: ['thermostatting', 'thermo', 'temperatura rotor'] },
  { label: 'Motors, valves and pumps', tokens: ['motors, valves and pumps', 'motors valves pumps', 'bombas', 'valvulas'] },
  { label: 'Level detection', tokens: ['level detection', 'deteccion de nivel'] },
  { label: 'Washing station', tokens: ['washing station', 'wash station', 'estacion de lavado'] },
  { label: 'Conditioning', tokens: ['conditioning', 'prime'] },
  { label: 'Positioning', tokens: ['positioning', 'position adjust', 'posicionamiento'] },
  { label: 'ISE module', tokens: ['ise module', 'ise'] },
];

const noteworthyLinePatterns = [
  'error',
  'alarma',
  'failed',
  'out of range',
  'reject',
  'photometry',
  'thermostatting',
  'pump',
  'washing station',
  'control',
  'calibr',
  'blank',
];

const detectErrorCodes = (rawText: string) =>
  unique(
    (rawText.match(/\b[A-Z]{2,6}[-_ ]?\d{2,5}\b/g) || [])
      .map((value) => value.replace(/\s+/g, ' ').trim())
      .slice(0, 8),
  );

const buildAnalysisFromText = (rawText: string): AdvisoryAttachmentAnalysis => {
  const normalized = normalizeText(rawText);
  const lines = rawText
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => compactSpaces(line))
    .filter(Boolean);

  const tags = unique(
    evidenceTagPatterns
      .filter((pattern) => pattern.tokens.some((token) => normalized.includes(normalizeText(token))))
      .map((pattern) => pattern.tag),
  ).slice(0, 8);

  const utilities = unique(
    utilityPatterns
      .filter((pattern) => pattern.tokens.some((token) => normalized.includes(normalizeText(token))))
      .map((pattern) => pattern.label),
  ).slice(0, 8);

  const noteworthyLines = unique(
    lines.filter((line) => noteworthyLinePatterns.some((token) => normalizeText(line).includes(token))).slice(0, 6),
  );

  const summary = unique([
    ...utilities.map((utility) => `Utilidad detectada: ${utility}`),
    ...tags.map((tag) => `Tema detectado: ${tag}`),
    ...noteworthyLines.slice(0, 4),
  ]).slice(0, 6);

  return {
    summary,
    tags,
    utilities,
    detectedCodes: detectErrorCodes(rawText),
    textExcerpt: compactSpaces(rawText).slice(0, 2200),
    sourceReference: 'OCR asesoría',
  };
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

  return compactSpaces(chunks.join('\n'));
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
      onProgress?.(
        0.45 + (pageIndex / Math.max(1, pageLimit)) * 0.5,
        `Aplicando OCR al PDF (${pageIndex}/${pageLimit})`,
      );
    }
  } finally {
    await worker.terminate();
  }

  return compactSpaces(chunks.join('\n'));
};

const buildFallbackAnalysis = (file: File, reason?: string): AdvisoryAttachmentAnalysis => ({
  summary: [
    `${file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? 'Reporte' : 'Archivo'} adjunto`,
    reason ? 'OCR no disponible en este archivo' : 'Sin texto OCR adicional',
  ],
  tags: [],
  utilities: [],
  detectedCodes: [],
  textExcerpt: reason ? compactSpaces(reason).slice(0, 260) : '',
  sourceReference: reason ? `OCR asesoría · fallback · ${reason}` : 'OCR asesoría · fallback',
});

export const runAdvisoryEvidenceOcr = async (file: File, onProgress?: OcrProgressHandler) => {
  const mimeType = file.type || '';
  let rawText = '';

  try {
    if (mimeType.startsWith('text/')) {
      rawText = await file.text();
      onProgress?.(1, 'Archivo de texto leído');
    } else if (mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      try {
        rawText = await extractTextFromPdf(file, onProgress);
      } catch (error) {
        advisoryEvidenceLogger('extractTextFromPdf', error);
      }

      if (!rawText) {
        try {
          rawText = await ocrPdfPages(file, onProgress);
        } catch (error) {
          advisoryEvidenceLogger('ocrPdfPages', error);
          return buildFallbackAnalysis(
            file,
            error instanceof Error ? error.message : 'No se pudo aplicar OCR al PDF',
          );
        }
      }
    } else if (mimeType.startsWith('image/')) {
      try {
        rawText = await ocrImage(file, onProgress);
      } catch (error) {
        advisoryEvidenceLogger('ocrImage', error);
        return buildFallbackAnalysis(
          file,
          error instanceof Error ? error.message : 'No se pudo aplicar OCR a la imagen',
        );
      }
    }
  } catch (error) {
    advisoryEvidenceLogger('runAdvisoryEvidenceOcr', error);
    return buildFallbackAnalysis(file, error instanceof Error ? error.message : 'OCR no disponible');
  }

  if (!rawText) {
    return buildFallbackAnalysis(file);
  }

  return buildAnalysisFromText(rawText);
};

export const uploadAdvisoryAttachment = async ({
  advisoryId,
  messageId,
  kind,
  file,
  analysis,
}: {
  advisoryId: string;
  messageId: string;
  kind: AdvisoryAttachmentRecord['kind'];
  file: File;
  analysis: AdvisoryAttachmentAnalysis | null;
}): Promise<AdvisoryAttachmentRecord> => {
  const safeName = sanitizeAdvisoryFileName(file.name);
  const path = `advisories/${advisoryId}/${messageId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(DOCUMENTOS_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  });

  if (error) {
    throw error;
  }

  return {
    id: crypto.randomUUID(),
    kind,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    storagePath: path,
    publicUrl: buildAdvisoryPublicFileUrl(path),
    uploadedAt: new Date().toISOString(),
    analysis,
  };
};
