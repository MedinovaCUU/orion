import type { Entry, FileEntry } from '@zip.js/zip.js';
import type {
  SatArchiveEntrySummary,
  SatConsumptionSummary,
  SatDiagnosticEvent,
  SatEventCategory,
  SatLotEvidence,
  SatReportSummary,
  SatRotorSummary,
} from './satReportTypes';

const MAX_ENTRY_COUNT = 1_500;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 1_000_000_000;
const MAX_TEXT_ENTRY_BYTES = 30_000_000;
const MAX_DIAGNOSTIC_EVENTS = 2_000;

const normalize = (value: unknown) => String(value ?? '').replace(/^\uFEFF/, '').trim();

const decodeXml = (value: string) =>
  value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, code: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (code[0] !== '#') return named[code.toLowerCase()] || entity;
    const numeric = code[1].toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
    return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : entity;
  });

const inferModel = (fileName: string, entryNames: string[]): 'BA400' | 'BA200' | 'A15' => {
  const joined = `${fileName} ${entryNames.join(' ')}`.toUpperCase();
  if (/\.A200\b|BA200/.test(joined)) return 'BA200';
  if (/\.A15\b|\bA15\b/.test(joined)) return 'A15';
  return 'BA400';
};

const inferModelFromSerial = (serial: string, fallback: 'BA400' | 'BA200' | 'A15') => {
  if (serial.startsWith('83400')) return 'BA400' as const;
  if (serial.startsWith('83300')) return 'BA200' as const;
  return fallback;
};

const parseReportDate = (fileName: string, entries: Entry[]) => {
  const match = fileName.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2})-(\d{2})/);
  if (match) {
    return new Date(`${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:00`).toISOString();
  }
  const newest = entries
    .map((entry) => entry.lastModDate?.getTime() || 0)
    .filter(Boolean)
    .sort((left, right) => right - left)[0];
  return newest ? new Date(newest).toISOString() : null;
};

const parseCsvLine = (line: string) => {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
};

const toRow = (headers: string[], values: string[]) =>
  Object.fromEntries(headers.map((header, index) => [normalize(header), normalize(values[index])]));

const parseNumber = (value: string) => {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseBoolean = (value: string) => ['1', 'TRUE', 'YES', 'SI', 'SÍ'].includes(value.toUpperCase());

const parseDate = (value: string): string | null => {
  if (!value) return null;
  const direct = Date.parse(value);
  if (Number.isFinite(direct)) return new Date(direct).toISOString();
  const match = value.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  return new Date(
    Number(match[3]),
    Number(match[2]) - 1,
    Number(match[1]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] || 0),
  ).toISOString();
};

const monthFromFile = (name: string) => name.match(/_(\d{6})\.csv$/i)?.[1] || '';
const serialFromFile = (name: string) => name.match(/(?:^|\/)(\d+)_/i)?.[1] || '';

interface MutableConsumption extends SatConsumptionSummary {
  lotKeys: Set<string>;
}

const mergeDate = (left: string | null, right: string | null, mode: 'min' | 'max') => {
  if (!left) return right;
  if (!right) return left;
  return mode === 'min' ? (left < right ? left : right) : left > right ? left : right;
};

const classifyLot = (sampleClass: string, name: string): SatLotEvidence['kind'] => {
  const text = `${sampleClass} ${name}`.toUpperCase();
  if (text.includes('CALIB')) return 'calibrator';
  if (text.includes('CTRL') || text.includes('CONTROL')) return 'control';
  if (text.includes('ISE') || text.includes('ELECTRODE')) return 'ise';
  if (name) return 'reagent';
  return 'unknown';
};

const addLot = (
  lots: Map<string, SatLotEvidence>,
  candidate: Omit<SatLotEvidence, 'tests'> & { testName: string },
) => {
  if (!candidate.lot) return;
  const key = `${candidate.kind}|${candidate.name}|${candidate.lot}`.toUpperCase();
  const current = lots.get(key);
  if (!current) {
    lots.set(key, { ...candidate, tests: candidate.testName ? [candidate.testName] : [] });
    return;
  }
  current.firstSeenAt = mergeDate(current.firstSeenAt, candidate.firstSeenAt, 'min');
  current.lastSeenAt = mergeDate(current.lastSeenAt, candidate.lastSeenAt, 'max');
  if (candidate.testName && !current.tests.includes(candidate.testName)) current.tests.push(candidate.testName);
};

const parseConsumptionCsv = (
  text: string,
  sourceFile: string,
  defaultSerial: string,
  defaultModel: 'BA400' | 'BA200' | 'A15',
  summaries: Map<string, MutableConsumption>,
  lots: Map<string, SatLotEvidence>,
) => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return;
  const headers = parseCsvLine(lines[0]).map(normalize);
  const bucketMonth = monthFromFile(sourceFile);

  for (const line of lines.slice(1)) {
    const row = toRow(headers, parseCsvLine(line));
    const serialNumber = row.AnalyzerSN || serialFromFile(sourceFile) || defaultSerial;
    const equipmentModel = inferModelFromSerial(serialNumber, defaultModel);
    const testName = row.TestName;
    if (!serialNumber || !testName) continue;
    const eventAt = parseDate(row.Date);
    const key = `${bucketMonth}|${serialNumber}|${testName}`;
    let summary = summaries.get(key);
    if (!summary) {
      summary = {
        summaryKey: key,
        bucketMonth,
        serialNumber,
        equipmentModel,
        testName,
        pipettingCount: 0,
        vr1TotalUl: 0,
        vr2TotalUl: 0,
        sampleVolumeTotalUl: 0,
        patientCount: 0,
        blankCount: 0,
        calibrationCount: 0,
        controlCount: 0,
        factoryTestCount: 0,
        nonFactoryTestCount: 0,
        firstEventAt: null,
        lastEventAt: null,
        sourceFile,
        lotKeys: new Set(),
      };
      summaries.set(key, summary);
    }

    summary.pipettingCount += 1;
    summary.vr1TotalUl += parseNumber(row.VR1 || '');
    summary.vr2TotalUl += parseNumber(row.VR2 || '');
    summary.sampleVolumeTotalUl += parseNumber(row.SampleVolume || '');
    const sampleClass = (row.SampleClass || '').toUpperCase();
    if (sampleClass === 'PATIENT') summary.patientCount += 1;
    else if (sampleClass === 'BLANK') summary.blankCount += 1;
    else if (sampleClass === 'CALIB') summary.calibrationCount += 1;
    else if (sampleClass === 'CTRL') summary.controlCount += 1;
    if (parseBoolean(row.IsFactoryTest || '')) summary.factoryTestCount += 1;
    else summary.nonFactoryTestCount += 1;
    summary.firstEventAt = mergeDate(summary.firstEventAt, eventAt, 'min');
    summary.lastEventAt = mergeDate(summary.lastEventAt, eventAt, 'max');

    const controlName = row.CalibControlName || row.ControlName || row.CalibratorName || '';
    const controlLot = row.CalibControlLotNumber || row.ControlLot || row.CalibratorLot || '';
    addLot(lots, {
      kind: classifyLot(sampleClass, controlName),
      name: controlName || testName,
      lot: controlLot,
      firstSeenAt: eventAt,
      lastSeenAt: eventAt,
      sourceFile,
      testName,
    });

    const reagentLot = row.LotNumber || row.ReagentLot || '';
    if (reagentLot) {
      addLot(lots, {
        kind: 'reagent',
        name: testName,
        lot: reagentLot,
        firstSeenAt: eventAt,
        lastSeenAt: eventAt,
        sourceFile,
        testName,
      });
    }
    for (const [name, identifier, kind] of [
      [`${testName} R1`, row.BarcodeR1 || '', 'barcode'],
      [`${testName} R2`, row.BarcodeR2 || '', 'barcode'],
      ['ISE pack', row.PackISE_SN || '', 'ise'],
    ] as const) {
      addLot(lots, {
        kind,
        name,
        lot: identifier,
        firstSeenAt: eventAt,
        lastSeenAt: eventAt,
        sourceFile,
        testName,
      });
    }
  }
};

const parseRotorCsv = (
  text: string,
  sourceFile: string,
  defaultSerial: string,
  defaultModel: 'BA400' | 'BA200' | 'A15',
  rotors: Map<string, SatRotorSummary>,
) => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return;
  const headers = parseCsvLine(lines[0]).map(normalize);
  const bucketMonth = monthFromFile(sourceFile);
  for (const line of lines.slice(1)) {
    const row = toRow(headers, parseCsvLine(line));
    const serialNumber = row.AnalyzerSN || serialFromFile(sourceFile) || defaultSerial;
    const eventAt = parseDate(row.Date);
    if (!serialNumber || !eventAt) continue;
    const key = `${bucketMonth}|${serialNumber}`;
    let summary = rotors.get(key);
    if (!summary) {
      summary = {
        summaryKey: key,
        bucketMonth,
        serialNumber,
        equipmentModel: inferModelFromSerial(serialNumber, defaultModel),
        rotorChangeCount: 0,
        firstChangeAt: null,
        lastChangeAt: null,
        changeTimestamps: [],
        sourceFile,
      };
      rotors.set(key, summary);
    }
    summary.rotorChangeCount += 1;
    summary.changeTimestamps.push(eventAt);
    summary.firstChangeAt = mergeDate(summary.firstChangeAt, eventAt, 'min');
    summary.lastChangeAt = mergeDate(summary.lastChangeAt, eventAt, 'max');
  }
};

const xmlAttributes = (raw: string) => {
  const attributes: Record<string, string> = {};
  for (const match of raw.matchAll(/([A-Za-z_][\w:.-]*)="([^"]*)"/g)) {
    attributes[match[1]] = decodeXml(match[2]);
  }
  return attributes;
};

const classifyMessage = (message: string, logType = ''): SatEventCategory | null => {
  const normalized = `${logType} ${message}`.toUpperCase();
  if (/\bNO EXCEPTION\b/.test(normalized)) return 'operation';
  if (/\b(ERROR|EXCEPTION|FATAL|FAULT)\b|E:\(\d+\)/.test(normalized)) return 'error';
  if (/\b(WARN|WARNING|ALARM)\b/.test(normalized)) return 'warning';
  if (/\b(QC|QUALITY CONTROL|CONTROL)\b/.test(normalized)) return 'qc';
  if (/CALIBRAT|CALIBRACI[OÓ]N|CALIBRADOR/.test(normalized)) return 'calibration';
  if (/RESETWORKSESSION|MAINTENANCE|SERVICE|HISTORIC|BLANK/.test(normalized)) return 'operation';
  return null;
};

const redactClinicalIdentifiers = (message: string) =>
  message.replace(
    /\b(patient|paciente|sample|muestra)(\s+(?:id|name|nombre|code|c[oó]digo))?(\s*[:=]\s*)([^\s,;]+)/gi,
    (_match, entity: string, field: string | undefined, separator: string) =>
      `${entity}${field || ''}${separator}[REDACTED]`,
  );

const diagnosticRawFields = (raw: Record<string, string>) => {
  const allowed = new Set([
    'LogDateTime',
    'DateTime',
    'Timestamp',
    'Date',
    'Time',
    'LogType',
    'Level',
    'ThreadID',
    'Source',
    'Module',
    'Section',
    'Code',
  ]);
  return Object.fromEntries(Object.entries(raw).filter(([key]) => allowed.has(key)));
};

const parseXmlLog = (text: string, sourceFile: string, events: SatDiagnosticEvent[]) => {
  for (const match of text.matchAll(/<row\b([^>]*?)(?:\/>|>)/gi)) {
    if (events.length >= MAX_DIAGNOSTIC_EVENTS) break;
    const raw = xmlAttributes(match[1]);
    const originalMessage = raw.Message || raw.message || raw.Description || raw.Text || '';
    if (!originalMessage) continue;
    const category = classifyMessage(originalMessage, raw.LogType || raw.Level || '');
    if (!category) continue;
    const code = originalMessage.match(/(?:E:\(|\b(?:ERR|ERROR)[\s:_-]*)(\d+)/i)?.[1] || raw.Code || null;
    const message = redactClinicalIdentifiers(originalMessage);
    events.push({
      category,
      occurredAt: parseDate(raw.LogDateTime || raw.DateTime || raw.Timestamp || raw.Date || raw.Time || ''),
      code,
      message: message.slice(0, 1_500),
      sourceFile,
      raw: diagnosticRawFields(raw),
    });
  }
};

const entryPurpose = (name: string) => {
  if (/ConsumptionLogs\/.+\.csv$/i.test(name)) return 'Consumos, pruebas, clases de muestra y evidencia de lotes';
  if (/Ax00Log_.+\.xml$/i.test(name)) return 'Eventos operativos, calibración, QC, advertencias y errores';
  if (/Version\.txt$/i.test(name)) return 'Versión de software';
  if (/AX00PCOSInfo\.txt$/i.test(name)) return 'Sistema operativo y entorno del PC';
  if (/FWAdjustments\.txt$/i.test(name)) return 'Ajustes de firmware';
  if (/\.bak$/i.test(name)) return 'Respaldo profundo de base de datos';
  if (/\.evt$/i.test(name)) return 'Bitácora binaria de Windows/Synapse';
  if (/Previous.+\.zip$/i.test(name)) return 'Histórico adicional anidado';
  return 'Evidencia original preservada';
};

const shouldReadText = (entry: Entry): entry is FileEntry =>
  !entry.directory &&
  /(?:Version\.txt|AX00PCOSInfo\.txt|FWAdjustments\.txt|Ax00Log_.+\.xml|ConsumptionLogs\/.+\.csv)$/i.test(
    entry.filename,
  ) &&
  entry.uncompressedSize <= MAX_TEXT_ENTRY_BYTES;

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const sha1 = (value: string) =>
  crypto.subtle.digest('SHA-1', new TextEncoder().encode(value)).then(toHex);

export class SatPasswordRequiredError extends Error {
  constructor(message = 'El SAT está cifrado. Escribe la contraseña de exportación para procesarlo.') {
    super(message);
    this.name = 'SatPasswordRequiredError';
  }
}

export const parseSatReport = async (
  file: File,
  password: string,
  onProgress?: (message: string, percent: number) => void,
): Promise<SatReportSummary> => {
  onProgress?.('Leyendo estructura protegida del SAT', 4);
  const { BlobReader, TextWriter, ZipReader } = await import('@zip.js/zip.js');
  const zipReader = new ZipReader(new BlobReader(file));
  let entries: Entry[] = [];
  try {
    entries = await zipReader.getEntries();
    if (entries.length > MAX_ENTRY_COUNT) throw new Error('El SAT contiene demasiados archivos para procesarlo de forma segura.');
    const totalUncompressedBytes = entries.reduce((total, entry) => total + (entry.uncompressedSize || 0), 0);
    if (totalUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error('El contenido descomprimido del SAT supera el límite seguro de 1 GB.');
    }
    const encrypted = entries.some((entry) => entry.encrypted);
    if (encrypted && !password) throw new SatPasswordRequiredError();

    const sha256Promise = file.arrayBuffer().then((bytes) => crypto.subtle.digest('SHA-256', bytes)).then(toHex);
    const entryNames = entries.map((entry) => entry.filename);
    const fallbackModel = inferModel(file.name, entryNames);
    const inferredSerial = entryNames.map(serialFromFile).find(Boolean) || '';
    const consumption = new Map<string, MutableConsumption>();
    const rotors = new Map<string, SatRotorSummary>();
    const lots = new Map<string, SatLotEvidence>();
    const events: SatDiagnosticEvent[] = [];
    const archiveEntries: SatArchiveEntrySummary[] = [];
    const firmwareAdjustments: string[] = [];
    let softwareVersion: string | null = null;
    let operatingSystem: string | null = null;
    let processedBytes = 0;
    const readableEntries = entries.filter((entry) => !entry.directory && shouldReadText(entry));
    let completed = 0;

    for (const entry of entries.filter((candidate) => !candidate.directory)) {
      const readable = shouldReadText(entry);
      const isDeferred = /\.bak$|\.evt$|Previous.+\.zip$/i.test(entry.filename);
      archiveEntries.push({
        name: entry.filename,
        compressedSize: entry.compressedSize || 0,
        uncompressedSize: entry.uncompressedSize || 0,
        encrypted: Boolean(entry.encrypted),
        status: readable ? 'processed' : isDeferred ? 'deferred' : 'stored',
        purpose: entryPurpose(entry.filename),
      });
      if (!readable) continue;

      try {
        const text = await entry.getData(new TextWriter(), { password });
        processedBytes += entry.uncompressedSize || 0;
        if (/Version\.txt$/i.test(entry.filename)) {
          softwareVersion = text.split(/\r?\n/).map(normalize).find(Boolean)?.slice(0, 120) || null;
        }
        else if (/AX00PCOSInfo\.txt$/i.test(entry.filename)) {
          operatingSystem = text
            .split(/\r?\n/)
            .map(normalize)
            .find((line) => /Windows|Operating System|OS Name|Nombre del SO/i.test(line)) || normalize(text).slice(0, 500) || null;
        } else if (/FWAdjustments\.txt$/i.test(entry.filename)) {
          firmwareAdjustments.push(...text.split(/\r?\n/).map(normalize).filter(Boolean).slice(0, 200));
        } else if (/\.xml$/i.test(entry.filename)) parseXmlLog(text, entry.filename, events);
        else if (/ReagentConsumption/i.test(entry.filename)) {
          parseConsumptionCsv(text, entry.filename, inferredSerial, fallbackModel, consumption, lots);
        } else if (/RotorConsumption/i.test(entry.filename)) {
          parseRotorCsv(text, entry.filename, inferredSerial, fallbackModel, rotors);
        }
      } catch (error) {
        if (entry.encrypted) {
          throw new SatPasswordRequiredError('No fue posible abrir el SAT. Verifica la contraseña de exportación.');
        }
        throw error;
      }
      completed += 1;
      onProgress?.(
        `Procesando ${entry.filename.split('/').pop()}`,
        8 + Math.round((completed / Math.max(readableEntries.length, 1)) * 82),
      );
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    }

    const consumptionRows = [...consumption.values()].map(({ lotKeys, ...summary }) => {
      void lotKeys;
      return {
        ...summary,
        vr1TotalUl: Number(summary.vr1TotalUl.toFixed(2)),
        vr2TotalUl: Number(summary.vr2TotalUl.toFixed(2)),
        sampleVolumeTotalUl: Number(summary.sampleVolumeTotalUl.toFixed(2)),
      };
    });
    await Promise.all(
      consumptionRows.map(async (row) => {
        row.summaryKey = await sha1(`${row.bucketMonth}|${row.serialNumber}|${row.testName}`);
      }),
    );
    const rotorRows = [...rotors.values()];
    await Promise.all(
      rotorRows.map(async (row) => {
        row.summaryKey = await sha1(`${row.bucketMonth}|${row.serialNumber}`);
      }),
    );
    const serialNumber = consumptionRows[0]?.serialNumber || inferredSerial;
    if (!serialNumber) throw new Error('No fue posible identificar el número de serie dentro del SAT.');
    const equipmentModel = inferModelFromSerial(serialNumber, fallbackModel);
    const allDates = [
      ...consumptionRows.flatMap((row) => [row.firstEventAt, row.lastEventAt]),
      ...events.map((event) => event.occurredAt),
    ].filter((value): value is string => Boolean(value)).sort();
    const databaseEntry = entries.find((entry) => /\.bak$/i.test(entry.filename));
    const sha256 = await sha256Promise;
    onProgress?.('Preparando evidencia normalizada', 96);

    return {
      schemaVersion: 'sat-import-v1',
      fileName: file.name,
      fileSize: file.size,
      sha256,
      encrypted,
      equipmentModel,
      serialNumber,
      reportGeneratedAt: parseReportDate(file.name, entries),
      softwareVersion,
      operatingSystem,
      firmwareAdjustments,
      archiveEntries,
      events,
      lots: [...lots.values()].map((lot) => ({ ...lot, tests: lot.tests.slice(0, 100) })),
      consumption: consumptionRows,
      rotors: rotorRows,
      coverage: {
        processedFiles: archiveEntries.filter((entry) => entry.status === 'processed').length,
        totalFiles: archiveEntries.length,
        processedBytes,
        totalUncompressedBytes: archiveEntries.reduce((total, entry) => total + entry.uncompressedSize, 0),
        hasDatabaseBackup: Boolean(databaseEntry),
        databaseBackupBytes: databaseEntry?.uncompressedSize || 0,
        deferredReasons: [
          ...(databaseEntry ? ['El respaldo .bak se conserva intacto para extracción profunda en un procesador de servidor.'] : []),
          ...(entries.some((entry) => /\.evt$/i.test(entry.filename))
            ? ['La bitácora binaria .evt queda preservada; los eventos XML sí se procesan en esta etapa.']
            : []),
          ...(entries.some((entry) => /Previous.+\.zip$/i.test(entry.filename))
            ? ['Los ZIP históricos anidados quedan disponibles para una segunda etapa sin frenar el diagnóstico actual.']
            : []),
        ],
      },
      findings: {
        errorCount: events.filter((event) => event.category === 'error').length,
        warningCount: events.filter((event) => event.category === 'warning').length,
        qcEventCount:
          events.filter((event) => event.category === 'qc').length +
          consumptionRows.reduce((total, row) => total + row.controlCount, 0),
        calibrationEventCount:
          events.filter((event) => event.category === 'calibration').length +
          consumptionRows.reduce((total, row) => total + row.calibrationCount, 0),
        distinctTests: new Set(consumptionRows.map((row) => row.testName)).size,
        distinctLots: [...lots.values()].filter((lot) => lot.kind !== 'barcode').length,
        distinctBarcodes: [...lots.values()].filter((lot) => lot.kind === 'barcode').length,
        rotorChangeCount: rotorRows.reduce((total, row) => total + row.rotorChangeCount, 0),
        dateFrom: allDates[0] || null,
        dateTo: allDates.at(-1) || null,
      },
    };
  } finally {
    await zipReader.close();
  }
};
