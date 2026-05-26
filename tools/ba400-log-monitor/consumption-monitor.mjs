#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { discoverMatchingDirectories } from './source-discovery.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TRANSIENT_FILE_ERROR_CODES = new Set(['EBUSY', 'EACCES', 'EPERM']);
const EQUIPMENT_MODEL_RULES = [
  { prefix: '83400', model: 'BA400' },
  { prefix: '83200', model: 'BA200' },
  { prefix: '83105', model: 'A15' },
  { prefix: '83101', model: 'A25' },
];
const SAMPLE_CLASS_KEYS = new Set(['BLANK', 'CALIB', 'CTRL', 'PATIENT']);

function parseArgs(argv) {
  const args = {
    config: path.join(__dirname, 'config.local.json'),
    once: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--config' && argv[index + 1]) {
      args.config = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (current === '--once') {
      args.once = true;
    }
  }

  return args;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function timestamp() {
  return new Date().toISOString();
}

function log(message) {
  console.log(`[${timestamp()}] ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function expandPlaceholders(value, context) {
  if (typeof value !== 'string') {
    return value;
  }

  return value
    .replace(/\$\{CONFIG_DIR\}/g, context.configDir)
    .replace(/\$\{SCRIPT_DIR\}/g, __dirname)
    .replace(/\$\{ENV:([A-Z0-9_]+)\}/gi, (_, name) => {
      return process.env[name] || process.env[name.toUpperCase()] || process.env[name.toLowerCase()] || '';
    });
}

function deepExpandPlaceholders(value, context) {
  if (Array.isArray(value)) {
    return value.map((item) => deepExpandPlaceholders(item, context));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, deepExpandPlaceholders(item, context)]),
    );
  }

  return expandPlaceholders(value, context);
}

function inferEquipmentModelFromSerial(serial) {
  const normalizedSerial = normalizeText(serial);
  if (!normalizedSerial) {
    return null;
  }

  const rule = EQUIPMENT_MODEL_RULES.find((candidate) => normalizedSerial.startsWith(candidate.prefix));
  return rule?.model || null;
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).replace(/\u0000/g, '').trim();
}

function normalizeCsvCell(value) {
  return normalizeText(value).replace(/^\t+|\t+$/g, '');
}

function parseNumber(value) {
  const normalized = normalizeCsvCell(value);
  if (!normalized) {
    return 0;
  }

  const parsed = Number(normalized.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseBoolean(value) {
  const normalized = normalizeCsvCell(value).toUpperCase();
  return ['TRUE', '1', 'YES', 'Y'].includes(normalized);
}

function parseLocalTimestamp(value) {
  const normalized = normalizeCsvCell(value);
  if (!normalized) {
    return null;
  }

  const candidate = normalized.includes('T') ? normalized : normalized.replace(' ', 'T');
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function sha1(value) {
  return crypto.createHash('sha1').update(value).digest('hex');
}

function buildPipelineSignature(config) {
  return sha1(
    JSON.stringify({
      aggregation: 'monthly-v2',
      reagentTable: config.supabase.reagentTable || '',
      rotorTable: config.supabase.rotorTable || '',
      equipmentStateTable: config.supabase.equipmentStateTable || '',
    }),
  );
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (insideQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
        continue;
      }
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === ',' && !insideQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function mapCsvRow(header, values) {
  const row = {};

  for (let index = 0; index < header.length; index += 1) {
    row[header[index]] = values[index] ?? '';
  }

  return row;
}

function normalizeSampleClassKey(sampleClass) {
  const normalized = normalizeCsvCell(sampleClass).toUpperCase();
  return SAMPLE_CLASS_KEYS.has(normalized) ? normalized : 'OTHER';
}

function toLocalMonthKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}

async function readTextFileWithRetries(filePath, encoding) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fs.readFile(filePath, encoding || 'utf8');
    } catch (error) {
      const shouldRetry =
        error &&
        typeof error === 'object' &&
        TRANSIENT_FILE_ERROR_CODES.has(error.code) &&
        attempt < 3;

      if (!shouldRetry) {
        throw error;
      }

      log(`lectura temporalmente bloqueada en ${path.basename(filePath)}; reintento ${attempt}/3`);
      await sleep(250 * attempt);
    }
  }

  return '';
}

function parseConsumptionFileName(name) {
  const match = name.match(/^([^_]+)_(Reagent|Rotor)Consumption_(\d{6})\.csv$/i);
  if (!match) {
    return null;
  }

  return {
    serialFromName: normalizeText(match[1]),
    kind: match[2].toLowerCase(),
    monthKey: match[3],
  };
}

function extractConsumptionMonthKey(name) {
  const match = String(name || '').match(/_(\d{6})\.csv$/i);
  return match ? match[1] : '';
}

function extractConsumptionKind(name) {
  if (/ReagentConsumption/i.test(String(name || ''))) {
    return 'reagent';
  }
  if (/RotorConsumption/i.test(String(name || ''))) {
    return 'rotor';
  }
  return '';
}

function rankConsumptionDirectoryCandidates(candidates) {
  const currentMonthKey = toLocalMonthKey();

  return [...candidates].sort((left, right) => {
    const leftReagentMonth = left.matchingFiles.reduce((best, file) => {
      if (extractConsumptionKind(file.basename) !== 'reagent') {
        return best;
      }
      const current = extractConsumptionMonthKey(file.basename);
      return current > best ? current : best;
    }, '');
    const rightReagentMonth = right.matchingFiles.reduce((best, file) => {
      if (extractConsumptionKind(file.basename) !== 'reagent') {
        return best;
      }
      const current = extractConsumptionMonthKey(file.basename);
      return current > best ? current : best;
    }, '');

    const leftRotorMonth = left.matchingFiles.reduce((best, file) => {
      if (extractConsumptionKind(file.basename) !== 'rotor') {
        return best;
      }
      const current = extractConsumptionMonthKey(file.basename);
      return current > best ? current : best;
    }, '');
    const rightRotorMonth = right.matchingFiles.reduce((best, file) => {
      if (extractConsumptionKind(file.basename) !== 'rotor') {
        return best;
      }
      const current = extractConsumptionMonthKey(file.basename);
      return current > best ? current : best;
    }, '');

    const leftHasCurrent = leftReagentMonth === currentMonthKey || leftRotorMonth === currentMonthKey;
    const rightHasCurrent = rightReagentMonth === currentMonthKey || rightRotorMonth === currentMonthKey;
    if (Number(rightHasCurrent) !== Number(leftHasCurrent)) {
      return Number(rightHasCurrent) - Number(leftHasCurrent);
    }

    if (rightReagentMonth !== leftReagentMonth) {
      return rightReagentMonth.localeCompare(leftReagentMonth);
    }

    if (rightRotorMonth !== leftRotorMonth) {
      return rightRotorMonth.localeCompare(leftRotorMonth);
    }

    if (right.latestFileMtimeMs !== left.latestFileMtimeMs) {
      return right.latestFileMtimeMs - left.latestFileMtimeMs;
    }

    if (right.totalMatchingFiles !== left.totalMatchingFiles) {
      return right.totalMatchingFiles - left.totalMatchingFiles;
    }

    if (Number(right.preferredMatch) !== Number(left.preferredMatch)) {
      return Number(right.preferredMatch) - Number(left.preferredMatch);
    }

    return left.directoryPath.length - right.directoryPath.length;
  });
}

async function resolveSourceDirectory(sourceConfig, state) {
  const defaultPath = sourceConfig.path ? path.resolve(sourceConfig.path) : '';
  const shouldDiscover = Boolean(sourceConfig.autoDiscover);

  if (!shouldDiscover) {
    return defaultPath;
  }

  const discoveryIntervalMs = Number(sourceConfig.discoveryCooldownMs || 600000);
  const lastDiscoveryAt = state.source_directory_last_discovery_at
    ? Date.parse(state.source_directory_last_discovery_at)
    : 0;
  const cachedDirectory = state.source_directory ? path.resolve(state.source_directory) : '';
  const preferredPaths = [cachedDirectory, defaultPath, ...(sourceConfig.pathCandidates || [])].filter(Boolean);
  const filePatterns = [sourceConfig.reagentPattern, sourceConfig.rotorPattern];

  const now = Date.now();
  const canRediscover = !lastDiscoveryAt || now - lastDiscoveryAt >= discoveryIntervalMs;
  if (!canRediscover && cachedDirectory) {
    const cachedCandidates = await discoverMatchingDirectories({
      preferredPaths: [cachedDirectory],
      roots: [],
      filePatterns,
      preferredDirNamePattern: sourceConfig.discoveryPreferredDirNamePattern,
      maxDepth: 0,
      maxDirectories: 1,
      skipDirectoryNames: sourceConfig.discoverySkipDirectoryNames,
    });

    if (cachedCandidates.length) {
      return cachedDirectory;
    }
  }

  const discoveredCandidates = await discoverMatchingDirectories({
    preferredPaths,
    roots: sourceConfig.discoveryRoots || [],
    filePatterns,
    preferredDirNamePattern: sourceConfig.discoveryPreferredDirNamePattern,
    maxDepth: sourceConfig.discoveryMaxDepth,
    maxDirectories: sourceConfig.discoveryMaxDirectories,
    skipDirectoryNames: sourceConfig.discoverySkipDirectoryNames,
  });

  state.source_directory_last_discovery_at = new Date(now).toISOString();

  if (!discoveredCandidates.length) {
    state.source_directory = null;
    return null;
  }

  const discovered = rankConsumptionDirectoryCandidates(discoveredCandidates)[0];
  if (state.source_directory !== discovered.directoryPath) {
    log(`directorio de consumos detectado automaticamente: ${discovered.directoryPath}`);
  }
  state.source_directory = discovered.directoryPath;
  return discovered.directoryPath;
}

async function resolveCandidateFiles(sourceConfig, directoryOverride) {
  const directoryPath = directoryOverride ? path.resolve(directoryOverride) : path.resolve(sourceConfig.path);
  const dirents = await fs.readdir(directoryPath, { withFileTypes: true });
  const reagentPattern = new RegExp(sourceConfig.reagentPattern);
  const rotorPattern = new RegExp(sourceConfig.rotorPattern);
  const candidates = [];

  for (const entry of dirents) {
    if (!entry.isFile()) {
      continue;
    }

    const fullPath = path.join(directoryPath, entry.name);
    const parsedName = parseConsumptionFileName(entry.name);
    const isReagent = reagentPattern.test(entry.name);
    const isRotor = rotorPattern.test(entry.name);

    if (!isReagent && !isRotor) {
      continue;
    }

    let stats;
    try {
      stats = await fs.stat(fullPath);
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        continue;
      }
      throw error;
    }

    candidates.push({
      fullPath,
      basename: entry.name,
      kind: parsedName?.kind || (isReagent ? 'reagent' : 'rotor'),
      monthKey: parsedName?.monthKey || '',
      serialFromName: parsedName?.serialFromName || '',
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      signature: `${stats.size}:${Math.floor(stats.mtimeMs)}`,
    });
  }

  candidates.sort((left, right) => left.basename.localeCompare(right.basename));
  return candidates;
}

async function loadState(filePath) {
  if (!(await fileExists(filePath))) {
    return {
      pipeline_signature: null,
      source_directory: null,
      source_directory_last_discovery_at: null,
      files: {},
    };
  }

  const state = await readJson(filePath);
  state.pipeline_signature = state.pipeline_signature || null;
  state.source_directory = state.source_directory || null;
  state.source_directory_last_discovery_at = state.source_directory_last_discovery_at || null;
  state.files = state.files || {};
  return state;
}

function getOrCreateFileState(state, fileMeta) {
  if (!state.files[fileMeta.fullPath]) {
    state.files[fileMeta.fullPath] = {
      last_signature: null,
      last_synced_at: null,
      kind: fileMeta.kind,
      month_key: fileMeta.monthKey,
      serial_from_name: fileMeta.serialFromName,
    };
  }

  const fileState = state.files[fileMeta.fullPath];
  fileState.kind = fileMeta.kind;
  fileState.month_key = fileMeta.monthKey;
  fileState.serial_from_name = fileMeta.serialFromName;
  return fileState;
}

function shouldReprocessFile(fileMeta, fileState, config) {
  if (fileState.last_signature !== fileMeta.signature) {
    return true;
  }

  const currentMonthKey = toLocalMonthKey();
  if (fileMeta.monthKey === currentMonthKey) {
    return true;
  }

  const resyncIntervalMs = Number(config.source.resyncIntervalMs || 0);
  if (!resyncIntervalMs || !fileState.last_synced_at) {
    return false;
  }

  const lastSyncedAt = Date.parse(fileState.last_synced_at);
  if (!Number.isFinite(lastSyncedAt)) {
    return true;
  }

  return Date.now() - lastSyncedAt >= resyncIntervalMs;
}

function ensureEquipmentState(map, serial, defaults) {
  if (!map.has(serial)) {
    map.set(serial, {
      numero_serie: serial,
      modelo: defaults.modelo || null,
      monitor_name: defaults.monitor_name,
      machine_name: defaults.machine_name,
      ultimo_evento_consumo_at: null,
      pack_ise_sn: '',
      ref_electrode: '',
      na_electrode: '',
      k_electrode: '',
      cl_electrode: '',
      li_electrode: '',
    });
  }

  return map.get(serial);
}

function updateEquipmentStateFromRow(equipmentState, row, eventIso, model) {
  if (!equipmentState.ultimo_evento_consumo_at || eventIso > equipmentState.ultimo_evento_consumo_at) {
    equipmentState.ultimo_evento_consumo_at = eventIso;
  }

  if (!equipmentState.modelo && model) {
    equipmentState.modelo = model;
  }

  const packIse = normalizeCsvCell(row.PackISE_SN);
  const refElectrode = normalizeCsvCell(row.RefElectrode);
  const naElectrode = normalizeCsvCell(row.NaElectrode);
  const kElectrode = normalizeCsvCell(row.KElectrode);
  const clElectrode = normalizeCsvCell(row.ClElectrode);
  const liElectrode = normalizeCsvCell(row.LiElectrode);

  if (packIse) {
    equipmentState.pack_ise_sn = packIse;
  }
  if (refElectrode) {
    equipmentState.ref_electrode = refElectrode;
  }
  if (naElectrode) {
    equipmentState.na_electrode = naElectrode;
  }
  if (kElectrode) {
    equipmentState.k_electrode = kElectrode;
  }
  if (clElectrode) {
    equipmentState.cl_electrode = clElectrode;
  }
  if (liElectrode) {
    equipmentState.li_electrode = liElectrode;
  }
}

function buildEquipmentStateRow(equipmentState) {
  return {
    numero_serie: equipmentState.numero_serie,
    modelo: equipmentState.modelo,
    monitor_name: equipmentState.monitor_name,
    machine_name: equipmentState.machine_name,
    ultimo_evento_consumo_at: equipmentState.ultimo_evento_consumo_at,
    pack_ise_sn: equipmentState.pack_ise_sn,
    ref_electrode: equipmentState.ref_electrode,
    na_electrode: equipmentState.na_electrode,
    k_electrode: equipmentState.k_electrode,
    cl_electrode: equipmentState.cl_electrode,
    li_electrode: equipmentState.li_electrode,
    updated_at: new Date().toISOString(),
    payload: {
      numero_serie: equipmentState.numero_serie,
      modelo: equipmentState.modelo,
      ultimo_evento_consumo_at: equipmentState.ultimo_evento_consumo_at,
      pack_ise_sn: equipmentState.pack_ise_sn,
      ref_electrode: equipmentState.ref_electrode,
      na_electrode: equipmentState.na_electrode,
      k_electrode: equipmentState.k_electrode,
      cl_electrode: equipmentState.cl_electrode,
      li_electrode: equipmentState.li_electrode,
    },
  };
}

function createReagentSummary(context) {
  return {
    summary_key: sha1(`${context.bucketMonth}|${context.numeroSerie}|${context.testName}`),
    bucket_month: context.bucketMonth,
    numero_serie: context.numeroSerie,
    modelo: context.modelo,
    test_name: context.testName,
    pipetting_count: 0,
    vr1_total_ul: 0,
    vr2_total_ul: 0,
    sample_volume_total_ul: 0,
    blank_count: 0,
    calib_count: 0,
    ctrl_count: 0,
    patient_count: 0,
    factory_test_count: 0,
    non_factory_test_count: 0,
    first_event_at: null,
    last_event_at: null,
    source_basename: context.sourceBasename,
    monitor_name: context.monitorName,
    machine_name: context.machineName,
  };
}

function updateReagentSummary(summary, row, context) {
  summary.pipetting_count += 1;
  summary.vr1_total_ul += parseNumber(row.VR1);
  summary.vr2_total_ul += parseNumber(row.VR2);
  summary.sample_volume_total_ul += parseNumber(row.SampleVolume);

  const sampleClassKey = normalizeSampleClassKey(row.SampleClass);
  if (sampleClassKey === 'BLANK') {
    summary.blank_count += 1;
  } else if (sampleClassKey === 'CALIB') {
    summary.calib_count += 1;
  } else if (sampleClassKey === 'CTRL') {
    summary.ctrl_count += 1;
  } else if (sampleClassKey === 'PATIENT') {
    summary.patient_count += 1;
  }

  if (parseBoolean(row.IsFactoryTest)) {
    summary.factory_test_count += 1;
  } else {
    summary.non_factory_test_count += 1;
  }

  if (!summary.first_event_at || context.eventIso < summary.first_event_at) {
    summary.first_event_at = context.eventIso;
  }
  if (!summary.last_event_at || context.eventIso > summary.last_event_at) {
    summary.last_event_at = context.eventIso;
  }
}

function finalizeReagentSummary(summary) {
  return {
    summary_key: summary.summary_key,
    bucket_month: summary.bucket_month,
    numero_serie: summary.numero_serie,
    modelo: summary.modelo,
    test_name: summary.test_name,
    pipetting_count: summary.pipetting_count,
    vr1_total_ul: Number(summary.vr1_total_ul.toFixed(2)),
    vr2_total_ul: Number(summary.vr2_total_ul.toFixed(2)),
    sample_volume_total_ul: Number(summary.sample_volume_total_ul.toFixed(2)),
    blank_count: summary.blank_count,
    calib_count: summary.calib_count,
    ctrl_count: summary.ctrl_count,
    patient_count: summary.patient_count,
    factory_test_count: summary.factory_test_count,
    non_factory_test_count: summary.non_factory_test_count,
    first_event_at: summary.first_event_at,
    last_event_at: summary.last_event_at,
    source_basename: summary.source_basename,
    monitor_name: summary.monitor_name,
    machine_name: summary.machine_name,
    updated_at: new Date().toISOString(),
  };
}

function createRotorSummary(context) {
  return {
    summary_key: sha1(`${context.bucketMonth}|${context.numeroSerie}`),
    bucket_month: context.bucketMonth,
    numero_serie: context.numeroSerie,
    modelo: context.modelo,
    rotor_change_count: 0,
    first_change_at: null,
    last_change_at: null,
    change_timestamps: [],
    source_basename: context.sourceBasename,
    monitor_name: context.monitorName,
    machine_name: context.machineName,
  };
}

function updateRotorSummary(summary, eventIso) {
  summary.rotor_change_count += 1;
  summary.change_timestamps.push(eventIso);

  if (!summary.first_change_at || eventIso < summary.first_change_at) {
    summary.first_change_at = eventIso;
  }
  if (!summary.last_change_at || eventIso > summary.last_change_at) {
    summary.last_change_at = eventIso;
  }
}

function finalizeRotorSummary(summary) {
  return {
    ...summary,
    updated_at: new Date().toISOString(),
  };
}

function resolveEffectiveIdentity(row, fileMeta, config) {
  const analyzerSerial =
    normalizeCsvCell(row.AnalyzerSN) || config.identity.equipmentSerial || fileMeta.serialFromName || '';
  const model =
    config.identity.equipmentModel ||
    inferEquipmentModelFromSerial(config.identity.equipmentSerial || analyzerSerial || fileMeta.serialFromName || '') ||
    null;

  return {
    serial: analyzerSerial,
    model,
  };
}

function mergeEquipmentStateMaps(target, partial) {
  for (const [serial, stateRow] of partial.entries()) {
    if (!target.has(serial)) {
      target.set(serial, stateRow);
      continue;
    }

    const current = target.get(serial);
    if (
      stateRow.ultimo_evento_consumo_at &&
      (!current.ultimo_evento_consumo_at || stateRow.ultimo_evento_consumo_at >= current.ultimo_evento_consumo_at)
    ) {
      target.set(serial, stateRow);
    }
  }
}

async function processReagentFile(fileMeta, fileText, config) {
  const reagentSummaries = new Map();
  const equipmentStates = new Map();
  const lines = fileText.split(/\r?\n/);
  let header = null;

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    if (!header) {
      header = parseCsvLine(line).map((item) => normalizeCsvCell(item));
      continue;
    }

    const row = mapCsvRow(header, parseCsvLine(line));
    const eventDate = parseLocalTimestamp(row.Date);
    if (!eventDate) {
      continue;
    }

    const identity = resolveEffectiveIdentity(row, fileMeta, config);
    if (config.identity.requireEquipmentSerial && !identity.serial) {
      continue;
    }

    const testName = normalizeCsvCell(row.TestName);
    if (!testName) {
      continue;
    }

    const eventIso = eventDate.toISOString();
    const summaryKey = sha1(`${fileMeta.monthKey}|${identity.serial}|${testName}`);
    let summary = reagentSummaries.get(summaryKey);

    if (!summary) {
      summary = createReagentSummary({
        bucketMonth: fileMeta.monthKey,
        numeroSerie: identity.serial,
        modelo: identity.model,
        testName,
        sourceBasename: fileMeta.basename,
        monitorName: config.monitorName,
        machineName: config.identity.machineName,
      });
      reagentSummaries.set(summaryKey, summary);
    }

    updateReagentSummary(summary, row, { eventIso });

    const equipmentState = ensureEquipmentState(equipmentStates, identity.serial, {
      modelo: identity.model,
      monitor_name: config.monitorName,
      machine_name: config.identity.machineName,
    });
    updateEquipmentStateFromRow(equipmentState, row, eventIso, identity.model);
  }

  return {
    reagentRows: Array.from(reagentSummaries.values()).map((summary) => finalizeReagentSummary(summary)),
    equipmentStateRows: Array.from(equipmentStates.values()).map((row) => buildEquipmentStateRow(row)),
    rotorRows: [],
  };
}

async function processRotorFile(fileMeta, fileText, config) {
  const rotorSummaries = new Map();
  const lines = fileText.split(/\r?\n/);
  let header = null;

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    if (!header) {
      header = parseCsvLine(line).map((item) => normalizeCsvCell(item));
      continue;
    }

    const row = mapCsvRow(header, parseCsvLine(line));
    const eventDate = parseLocalTimestamp(row.Date);
    if (!eventDate) {
      continue;
    }

    const identity = resolveEffectiveIdentity(row, fileMeta, config);
    if (config.identity.requireEquipmentSerial && !identity.serial) {
      continue;
    }

    const eventIso = eventDate.toISOString();
    const summaryKey = sha1(`${fileMeta.monthKey}|${identity.serial}`);
    let summary = rotorSummaries.get(summaryKey);

    if (!summary) {
      summary = createRotorSummary({
        bucketMonth: fileMeta.monthKey,
        numeroSerie: identity.serial,
        modelo: identity.model,
        sourceBasename: fileMeta.basename,
        monitorName: config.monitorName,
        machineName: config.identity.machineName,
      });
      rotorSummaries.set(summaryKey, summary);
    }

    updateRotorSummary(summary, eventIso);
  }

  return {
    reagentRows: [],
    equipmentStateRows: [],
    rotorRows: Array.from(rotorSummaries.values()).map((summary) => finalizeRotorSummary(summary)),
  };
}

async function processFile(fileMeta, config) {
  const fileText = await readTextFileWithRetries(fileMeta.fullPath, config.source.encoding || 'utf8');

  if (fileMeta.kind === 'reagent') {
    return processReagentFile(fileMeta, fileText, config);
  }

  return processRotorFile(fileMeta, fileText, config);
}

function chunkRows(rows, batchSize) {
  const batches = [];
  for (let index = 0; index < rows.length; index += batchSize) {
    batches.push(rows.slice(index, index + batchSize));
  }
  return batches;
}

async function upsertRows(table, rows, conflictColumns, config) {
  if (!rows.length) {
    return;
  }

  if (config.upload.dryRun) {
    log(`dryRun activo: ${rows.length} filas preparadas para ${table}`);
    console.log(JSON.stringify(rows.slice(0, Math.min(rows.length, 5)), null, 2));
    return;
  }

  const endpoint = new URL(`/rest/v1/${table}`, config.supabase.url);
  endpoint.searchParams.set('on_conflict', conflictColumns);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: config.supabase.apiKey,
      Authorization: `Bearer ${config.supabase.apiKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
      'Content-Profile': config.supabase.schema || 'public',
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Supabase upsert failed for ${table} (${response.status}): ${details}`);
  }

  log(`upsert de ${rows.length} filas en ${table}`);
}

function normalizeConfig(rawConfig, options = {}) {
  const configDir = options.configDir || __dirname;
  const expandedConfig = deepExpandPlaceholders(rawConfig, { configDir });

  return {
    monitorName: expandedConfig.monitorName || 'ax00-consumption-monitor',
    identity: {
      machineName: expandedConfig.identity?.machineName || os.hostname(),
      equipmentSerial: expandedConfig.identity?.equipmentSerial || '',
      equipmentModel: expandedConfig.identity?.equipmentModel || '',
      requireEquipmentSerial: expandedConfig.identity?.requireEquipmentSerial !== false,
    },
    source: {
      path: expandedConfig.source?.path || '',
      pathCandidates: expandedConfig.source?.pathCandidates || [],
      autoDiscover: expandedConfig.source?.autoDiscover !== false,
      discoveryRoots: expandedConfig.source?.discoveryRoots || [],
      discoveryMaxDepth: Number(expandedConfig.source?.discoveryMaxDepth || 5),
      discoveryMaxDirectories: Number(expandedConfig.source?.discoveryMaxDirectories || 500),
      discoveryCooldownMs: Number(expandedConfig.source?.discoveryCooldownMs || 600000),
      discoveryPreferredDirNamePattern:
        expandedConfig.source?.discoveryPreferredDirNamePattern || '[Ll][Oo][Gg][Cc][Oo][Nn][Ss][Uu][Mm]|[Cc][Oo][Nn][Ss][Uu][Mm]',
      discoverySkipDirectoryNames: expandedConfig.source?.discoverySkipDirectoryNames || [],
      encoding: expandedConfig.source?.encoding || 'utf8',
      pollIntervalMs: Number(expandedConfig.source?.pollIntervalMs || 3600000),
      reagentPattern:
        expandedConfig.source?.reagentPattern || '^.*_ReagentConsumption_\\d{6}\\.csv$',
      rotorPattern:
        expandedConfig.source?.rotorPattern || '^.*_RotorConsumption_\\d{6}\\.csv$',
      resyncIntervalMs: Number(expandedConfig.source?.resyncIntervalMs || 86400000),
    },
    supabase: {
      url: expandedConfig.supabase?.url || '',
      apiKey: expandedConfig.supabase?.apiKey || expandedConfig.supabase?.anonKey || '',
      schema: expandedConfig.supabase?.schema || 'public',
      reagentTable: expandedConfig.supabase?.reagentTable || '',
      rotorTable: expandedConfig.supabase?.rotorTable || '',
      equipmentStateTable: expandedConfig.supabase?.equipmentStateTable || '',
    },
    upload: {
      dryRun: expandedConfig.upload?.dryRun !== false,
      batchSize: Number(expandedConfig.upload?.batchSize || 200),
    },
    state: {
      path: path.resolve(
        expandedConfig.state?.path || path.join(configDir, 'state', 'consumption-monitor-state.json'),
      ),
    },
  };
}

async function pollOnce(config, state) {
  const pipelineSignature = buildPipelineSignature(config);
  if (state.pipeline_signature !== pipelineSignature) {
    log('cambio detectado en el formato o tabla destino; se reinicia el estado local de consumos para resincronizar');
    state.pipeline_signature = pipelineSignature;
    state.files = {};
  }

  const sourceDirectory = await resolveSourceDirectory(config.source, state);
  if (!sourceDirectory) {
    log('sin directorio candidato para logs de consumo');
    await writeJson(config.state.path, state);
    return;
  }

  const candidates = await resolveCandidateFiles(config.source, sourceDirectory);
  if (!candidates.length) {
    log('sin archivos candidatos en LogConsum');
    await writeJson(config.state.path, state);
    return;
  }

  const nextState = JSON.parse(JSON.stringify(state));
  nextState.files = nextState.files || {};
  nextState.pipeline_signature = pipelineSignature;

  const reagentRows = new Map();
  const rotorRows = new Map();
  const equipmentStateRows = new Map();
  const processedFiles = [];

  for (const candidate of candidates) {
    const fileState = getOrCreateFileState(nextState, candidate);
    if (!shouldReprocessFile(candidate, fileState, config)) {
      continue;
    }

    const result = await processFile(candidate, config);
    for (const row of result.reagentRows) {
      reagentRows.set(row.summary_key, row);
    }
    for (const row of result.rotorRows) {
      rotorRows.set(row.summary_key, row);
    }
    for (const row of result.equipmentStateRows) {
      equipmentStateRows.set(row.numero_serie, row);
    }
    processedFiles.push(candidate);
  }

  if (!processedFiles.length) {
    return;
  }

  log(
    `preparados ${reagentRows.size} acumulados mensuales de reactivo, ${rotorRows.size} acumulados mensuales de rotor y ${equipmentStateRows.size} estados de equipo`,
  );

  const batchSize = Number(config.upload.batchSize || 200);

  for (const batch of chunkRows(Array.from(reagentRows.values()), batchSize)) {
    await upsertRows(config.supabase.reagentTable, batch, 'summary_key', config);
  }

  for (const batch of chunkRows(Array.from(rotorRows.values()), batchSize)) {
    await upsertRows(config.supabase.rotorTable, batch, 'summary_key', config);
  }

  for (const batch of chunkRows(Array.from(equipmentStateRows.values()), batchSize)) {
    await upsertRows(config.supabase.equipmentStateTable, batch, 'numero_serie', config);
  }

  const syncedAt = new Date().toISOString();
  for (const candidate of processedFiles) {
    const fileState = getOrCreateFileState(nextState, candidate);
    fileState.last_signature = candidate.signature;
    fileState.last_synced_at = syncedAt;
  }

  await writeJson(config.state.path, nextState);
  state.source_directory = nextState.source_directory;
  state.source_directory_last_discovery_at = nextState.source_directory_last_discovery_at;
  state.files = nextState.files;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = normalizeConfig(await readJson(args.config), {
    configDir: path.dirname(args.config),
  });
  const state = await loadState(config.state.path);

  log('monitor de consumos iniciado');
  log(`origen: ${config.source.path}`);
  log(`dryRun: ${config.upload.dryRun ? 'true' : 'false'}`);

  do {
    try {
      await pollOnce(config, state);
    } catch (error) {
      log(`error en ciclo de monitoreo: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (args.once) {
      break;
    }

    await sleep(config.source.pollIntervalMs);
  } while (true);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
