#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const args = {
    targetPath: path.resolve('BA400-program data'),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--path' && argv[index + 1]) {
      args.targetPath = path.resolve(argv[index + 1]);
      index += 1;
    }
  }

  return args;
}

function normalizeText(value) {
  return String(value ?? '').replace(/\u0000/g, '').trim();
}

async function safeReadDir(directoryPath) {
  try {
    return await fs.readdir(directoryPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function safeReadText(filePath, encoding = 'utf8') {
  try {
    return await fs.readFile(filePath, encoding);
  } catch {
    return '';
  }
}

async function safeStat(filePath) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

function findFirst(pattern, text) {
  const match = String(text).match(pattern);
  return match?.[1] ? normalizeText(match[1]) : null;
}

function findNumber(pattern, text) {
  const value = findFirst(pattern, text);
  if (!value) {
    return null;
  }
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

async function inspectAdjustments(basePath) {
  const adjustmentsPath = path.join(basePath, 'Adjustments');
  const entries = await safeReadDir(adjustmentsPath);
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();

  const analyzerInfoText = await safeReadText(path.join(adjustmentsPath, 'AnalyzerInfo.txt'));
  const repeatabilityText = await safeReadText(path.join(adjustmentsPath, 'RepeatabilityResults.res'));
  const stabilityText = await safeReadText(path.join(adjustmentsPath, 'StabilityResults.res'));
  const baselineText = await safeReadText(path.join(adjustmentsPath, 'BLResults.res'));

  const adjustmentFiles = [];
  for (const fileName of files.filter((name) => /^Adj_.*\.txt$/i.test(name))) {
    const text = await safeReadText(path.join(adjustmentsPath, fileName));
    adjustmentFiles.push({
      fileName,
      analyzerModel: findFirst(/^--Adjustments:\s*([^\r\n]+)/m, text),
      firmwareVersion: findFirst(/^--Fw version:\s*([^\r\n]+)/m, text),
      capturedAt: findFirst(/^--Date & Time:\s*([^\r\n]+)/m, text),
      clotDetectionSetting: findFirst(/^CLOT:([^;]+);/m, text),
      sampleArmSafeVertical: findFirst(/^M1SV:([^;]+);/m, text),
      reagent2SafeVertical: findFirst(/^R2SV:([^;]+);/m, text),
    });
  }

  return {
    fileCount: files.length,
    files,
    adjustmentFiles,
    analyzerInfo: {
      serialNumber: findFirst(/Serial Number Analyzer\s*:\s*([^\r\n]+)/m, analyzerInfoText),
      boardSerialNumber: findFirst(/Board Serial Number:\s*([^\r\n]+)/m, analyzerInfoText),
      firmwareVersion: findFirst(/Firmware Version:\s*([^\r\n]+)/m, analyzerInfoText),
      hardwareVersion: findFirst(/Hardware Version:\s*([^\r\n]+)/m, analyzerInfoText),
      crc32Result: findFirst(/CRC32 Result:\s*([^\r\n]+)/m, analyzerInfoText),
    },
    photometryArtifacts: {
      baselineFilePresent: baselineText.length > 0,
      repeatabilityFilePresent: repeatabilityText.length > 0,
      stabilityFilePresent: stabilityText.length > 0,
      baselineDarkCounts: {
        main: findNumber(/\(Ph Main dark - Ph Ref dark\)\s*\r?\n([0-9.]+)/m, baselineText),
        ref: findNumber(/\(Ph Main dark - Ph Ref dark\)\s*\r?\n[0-9.]+\s+([0-9.]+)/m, baselineText),
      },
      repeatability: {
        mean: findNumber(/Mean\s*:\s*([^\r\n]+)/m, repeatabilityText),
        stdDeviation: findNumber(/Std\. deviation\s*:\s*([^\r\n]+)/m, repeatabilityText),
        range: findNumber(/Range\s*:\s*([^\r\n]+)/m, repeatabilityText),
      },
      stability: {
        mean: findNumber(/Mean\s*:\s*([^\r\n]+)/m, stabilityText),
        stdDeviation: findNumber(/Std\. deviation\s*:\s*([^\r\n]+)/m, stabilityText),
        range: findNumber(/Range\s*:\s*([^\r\n]+)/m, stabilityText),
      },
    },
  };
}

async function inspectLogConsum(basePath) {
  const consumPath = path.join(basePath, 'LogConsum');
  const entries = await safeReadDir(consumPath);
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  const serialMap = new Map();

  for (const fileName of files) {
    const match = fileName.match(/^([^_]+)_(Reagent|Rotor)Consumption_(\d{6})\.csv$/i);
    if (!match) {
      continue;
    }
    const [, serial, kindRaw, monthKey] = match;
    const kind = kindRaw.toLowerCase();
    if (!serialMap.has(serial)) {
      serialMap.set(serial, {
        serial,
        months: new Set(),
        reagentFiles: 0,
        rotorFiles: 0,
        testNames: new Set(),
      });
    }
    const bucket = serialMap.get(serial);
    bucket.months.add(monthKey);
    if (kind === 'reagent') {
      bucket.reagentFiles += 1;
      const csvText = await safeReadText(path.join(consumPath, fileName));
      const lines = csvText.split(/\r?\n/).filter(Boolean);
      for (const line of lines.slice(1)) {
        const parts = line.split(',');
        if (parts[2]) {
          bucket.testNames.add(normalizeText(parts[2]));
        }
      }
    } else {
      bucket.rotorFiles += 1;
    }
  }

  return {
    fileCount: files.length,
    files: files.slice(0, 20),
    analyzers: Array.from(serialMap.values())
      .map((item) => ({
        serial: item.serial,
        reagentFiles: item.reagentFiles,
        rotorFiles: item.rotorFiles,
        monthCount: item.months.size,
        latestMonth: Array.from(item.months).sort().at(-1) || null,
        sampledTests: Array.from(item.testNames).filter(Boolean).slice(0, 12),
      }))
      .sort((left, right) => left.serial.localeCompare(right.serial)),
  };
}

async function inspectAx00Log(filePath) {
  const text = await safeReadText(filePath);
  if (!text) {
    return null;
  }

  const rowMatches = [...text.matchAll(/<row\b([^>]+?)\/>/g)];
  const messages = rowMatches
    .map((match) => {
      const attrs = match[1] || '';
      return findFirst(/Message="([^"]*)"/, attrs) || '';
    })
    .filter(Boolean);

  const countByKeyword = (keyword) =>
    messages.filter((message) => message.toLowerCase().includes(keyword.toLowerCase())).length;

  return {
    rowCount: rowMatches.length,
    keywordHits: {
      qc: countByKeyword('QC'),
      calibrator: countByKeyword('Calibrator'),
      blank: countByKeyword('Blank'),
      historic: countByKeyword('Historic'),
      resetWorkSession: countByKeyword('ResetWorkSession'),
      error: countByKeyword('Error'),
      exception: countByKeyword('Exception'),
    },
    sampleMessages: messages.slice(0, 8),
  };
}

async function inspectTraceComm(filePath) {
  const text = await safeReadText(filePath);
  if (!text) {
    return null;
  }

  const lines = text.split(/\r?\n/).filter(Boolean);
  const ansErrCounts = new Map();
  const statusErrorCounts = new Map();
  let identity = null;
  const telemetryFields = new Set();

  for (const line of lines) {
    if (!identity && line.includes('ANSFCP;')) {
      identity = {
        analyzerSerial: findFirst(/;ASN:([^;\r\n]+)/, line),
        firmwareVersion: findFirst(/;RV:([^;\r\n]+)/, line),
        boardSerial: findFirst(/;SMC:([^;\r\n]+)/, line),
        hardwareVersion: findFirst(/;HWV:([^;\r\n]+)/, line),
      };
    }

    if (line.includes('ANSERR;')) {
      const code = findFirst(/;E:([^;\r\n]+)/, line);
      if (code) {
        ansErrCounts.set(code, (ansErrCounts.get(code) || 0) + 1);
      }
    }

    if (line.includes(';STATUS;')) {
      const code = findFirst(/;E:([^;\r\n]+)/, line);
      if (code && code !== '0') {
        statusErrorCounts.set(code, (statusErrorCounts.get(code) || 0) + 1);
      }
    }

    if (line.includes('ANSINF;')) {
      for (const field of ['PT', 'HT', 'R1T', 'R2T', 'FS', 'FT', 'SW', 'WW', 'GC', 'PC', 'RC', 'SC', 'HS', 'WS', 'IS']) {
        if (line.includes(`${field}:`)) {
          telemetryFields.add(field);
        }
      }
    }
  }

  return {
    lineCount: lines.length,
    identity,
    ansErrCounts: Object.fromEntries(ansErrCounts),
    statusErrorCounts: Object.fromEntries(statusErrorCounts),
    telemetryFields: Array.from(telemetryFields).sort(),
    sampleLines: lines.slice(0, 10),
  };
}

async function inspectLog(basePath) {
  const logPath = path.join(basePath, 'Log');
  const entries = await safeReadDir(logPath);
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  const xmlFiles = files.filter((name) => /\.xml$/i.test(name));
  const traceFiles = files.filter((name) => /\.lax00$/i.test(name));
  const latestTrace = traceFiles.at(-1) ? path.join(logPath, traceFiles.at(-1)) : null;
  const latestXml = xmlFiles.at(-1) ? path.join(logPath, xmlFiles.at(-1)) : null;

  return {
    fileCount: files.length,
    files,
    latestTraceComm: latestTrace ? await inspectTraceComm(latestTrace) : null,
    latestApplicationLog: latestXml ? await inspectAx00Log(latestXml) : null,
  };
}

async function inspectAuditTrail(basePath) {
  const auditPath = path.join(basePath, 'AuditTrail');
  const entries = await safeReadDir(auditPath);
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  const latestFile = files.at(-1) ? path.join(auditPath, files.at(-1)) : null;
  const latestStats = latestFile ? await safeStat(latestFile) : null;
  const sample = latestFile ? await fs.readFile(latestFile).catch(() => Buffer.alloc(0)) : Buffer.alloc(0);

  return {
    fileCount: files.length,
    files: files.slice(-12),
    latestFile: latestFile ? path.basename(latestFile) : null,
    latestSize: latestStats?.size ?? null,
    sampleAscii: sample.toString('ascii', 0, Math.min(sample.length, 120)).replace(/[^\x20-\x7E]+/g, ' ').trim(),
    parseStatus: 'pending_reverse_engineering',
  };
}

async function inspectFwScripts(basePath) {
  const fwScriptsPath = path.join(basePath, 'FwScripts', 'Factory', 'BA400', 'FactoryFwScriptsDataDecrypted.xml');
  const text = await safeReadText(fwScriptsPath);
  if (!text) {
    return { filePresent: false };
  }

  const utilityHints = [
    'Photometry',
    'Thermos',
    'Level Detection',
    'Bar Code',
    'Motors Pumps Valves',
    'Position Adjustments',
  ];

  return {
    filePresent: true,
    sourceReference: fwScriptsPath,
    containsUtilities: utilityHints.filter((hint) => text.includes(hint)),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const basePath = args.targetPath;

  const summary = {
    inspectedAt: new Date().toISOString(),
    basePath,
    sources: {
      adjustments: await inspectAdjustments(basePath),
      logConsum: await inspectLogConsum(basePath),
      log: await inspectLog(basePath),
      auditTrail: await inspectAuditTrail(basePath),
      fwScripts: await inspectFwScripts(basePath),
    },
    driPotential: {
      readyNow: [
        'TraceComm para errores activos, estados y telemetría térmica/fluídica.',
        'LogConsum para patrón de uso por reactivo, calibrador/control y rotor.',
        'Adjustments para evidencias de photometry, baseline, repeatability y stability.',
        'FwScripts para mapear hipótesis a utilidades y scripts reales del BA400.',
      ],
      futureResearch: [
        'AuditTrail requiere reverse engineering antes de usarlo en producción.',
        'PhotometryTests.bin y Storage/*.udc siguen pendientes de decodificación.',
        'Ax00Log puede enriquecer timeline operativo y exportaciones QC/historic.',
      ],
    },
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
