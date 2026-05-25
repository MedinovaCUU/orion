#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TRANSIENT_FILE_ERROR_CODES = new Set(['EBUSY', 'EACCES', 'EPERM']);

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

function getValueByPath(record, dotPath) {
  if (!dotPath) {
    return undefined;
  }

  return dotPath.split('.').reduce((value, segment) => {
    if (value === null || value === undefined) {
      return undefined;
    }
    return value[segment];
  }, record);
}

function removeUndefinedProperties(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadState(filePath) {
  if (!(await fileExists(filePath))) {
    return {
      active_file: null,
      files: {},
    };
  }

  return readJson(filePath);
}

async function resolveActiveFile(sourceConfig) {
  if (sourceConfig.mode === 'file') {
    return path.resolve(sourceConfig.path);
  }

  if (sourceConfig.mode !== 'latest-file-in-dir') {
    throw new Error(`Unsupported source mode: ${sourceConfig.mode}`);
  }

  const directoryPath = path.resolve(sourceConfig.path);
  const fileNamePattern = new RegExp(sourceConfig.fileNamePattern || '.*');
  const dirents = await fs.readdir(directoryPath, { withFileTypes: true });
  const candidates = [];

  for (const entry of dirents) {
    if (!entry.isFile()) {
      continue;
    }

    if (!fileNamePattern.test(entry.name)) {
      continue;
    }

    const fullPath = path.join(directoryPath, entry.name);
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
      mtimeMs: stats.mtimeMs,
      size: stats.size,
    });
  }

  if (!candidates.length) {
    return null;
  }

  candidates.sort((left, right) => {
    if (right.mtimeMs !== left.mtimeMs) {
      return right.mtimeMs - left.mtimeMs;
    }
    return right.size - left.size;
  });

  return candidates[0].fullPath;
}

function getOrCreateFileState(state, filePath) {
  if (!state.files[filePath]) {
    state.files[filePath] = {
      offset: 0,
      line_number: 0,
      pending_fragment: '',
      pending_fragment_offset: 0,
      detected_equipment_serial: '',
      tracecomm_active_error_signature: '',
      initialized: false,
    };
  }

  return state.files[filePath];
}

async function readIncrementalChunk(filePath, startOffset, endOffset) {
  if (endOffset <= startOffset) {
    return Buffer.alloc(0);
  }

  const size = endOffset - startOffset;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let handle;

    try {
      handle = await fs.open(filePath, 'r');
      const buffer = Buffer.alloc(size);
      await handle.read(buffer, 0, size, startOffset);
      return buffer;
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
    } finally {
      if (handle) {
        await handle.close();
      }
    }
  }

  return Buffer.alloc(0);
}

function parseErrorCodes(line, pattern) {
  const codes = [];
  const regex = new RegExp(pattern.source, pattern.flags);

  for (const match of line.matchAll(regex)) {
    if (match[1]) {
      codes.push(match[1]);
    }
  }

  return Array.from(new Set(codes));
}

function parseTraceCommLine(line, fileState, parserConfig) {
  const serialMatches = line.matchAll(/(?:^|;)(?:ASN|SN):([^;]+)/g);
  for (const match of serialMatches) {
    const serial = (match[1] || '').trim();
    if (serial) {
      fileState.detected_equipment_serial = serial;
    }
  }

  const messageMatch = line.match(/(?:<<|>>)\s+([A-Z0-9]+);([A-Z0-9]+);/);
  const analyzerId = messageMatch?.[1] || null;
  const messageType = messageMatch?.[2] || null;

  const allErrorCodes = [];
  for (const match of line.matchAll(/(?:^|;)E:(\d+)(?=;|$)/g)) {
    allErrorCodes.push(match[1]);
  }

  const nonZeroErrorCodes = Array.from(
    new Set(allErrorCodes.filter((code) => !parserConfig.ignoreZeroErrors || code !== '0')),
  );
  const hasExplicitZeroOnly = allErrorCodes.length > 0 && nonZeroErrorCodes.length === 0;

  if (hasExplicitZeroOnly) {
    fileState.tracecomm_active_error_signature = '';
  }

  if (!nonZeroErrorCodes.length) {
    return {
      shouldUpload: false,
      errorCodes: [],
      metadata: {
        analyzer_id: analyzerId,
        message_type: messageType,
      },
    };
  }

  const signature = nonZeroErrorCodes.join(',');
  if (parserConfig.dedupeActiveErrors && fileState.tracecomm_active_error_signature === signature) {
    return {
      shouldUpload: false,
      errorCodes: nonZeroErrorCodes,
      metadata: {
        analyzer_id: analyzerId,
        message_type: messageType,
      },
    };
  }

  fileState.tracecomm_active_error_signature = signature;

  return {
    shouldUpload: true,
    errorCodes: nonZeroErrorCodes,
    metadata: {
      analyzer_id: analyzerId,
      message_type: messageType,
    },
  };
}

function buildEvent({
  monitorName,
  machineName,
  equipmentSerial,
  sourceFile,
  lineNumber,
  byteOffsetStart,
  byteOffsetEnd,
  rawLine,
  errorCodes,
  catalog,
  metadata,
}) {
  const matchedDescriptions = errorCodes.map((code) => ({
    code,
    description: catalog[code]?.description || null,
    section: catalog[code]?.section || null,
  }));

  const payload = {
    monitor_name: monitorName,
    machine_name: machineName,
    configured_equipment_serial: equipmentSerial || null,
    effective_equipment_serial: equipmentSerial || machineName,
    source_file: sourceFile,
    source_basename: path.basename(sourceFile),
    line_number: lineNumber,
    byte_offset_start: byteOffsetStart,
    byte_offset_end: byteOffsetEnd,
    raw_line: rawLine,
    error_codes: errorCodes,
    primary_error_code: errorCodes[0] || null,
    primary_error_description: matchedDescriptions[0]?.description || null,
    matched_error_descriptions: matchedDescriptions,
    detected_at: new Date().toISOString(),
    analyzer_id: metadata?.analyzer_id || null,
    message_type: metadata?.message_type || null,
  };

  payload.line_hash = crypto
    .createHash('sha1')
    .update(`${payload.source_file}|${payload.line_number}|${payload.raw_line}`)
    .digest('hex');

  payload.payload = {
    ...payload,
  };

  return payload;
}

function mapEventToRow(event, uploadConfig) {
  const staticColumns = uploadConfig.staticColumns || {};
  const columnMap = uploadConfig.columnMap;

  if (!columnMap || !Object.keys(columnMap).length) {
    return removeUndefinedProperties({
      ...event,
      ...staticColumns,
    });
  }

  const row = { ...staticColumns };

  for (const [columnName, sourcePath] of Object.entries(columnMap)) {
    row[columnName] = getValueByPath(event, sourcePath);
  }

  return removeUndefinedProperties(row);
}

async function uploadBatch(rows, config) {
  if (!rows.length) {
    return;
  }

  if (config.upload.dryRun) {
    log(`dryRun activo: ${rows.length} filas preparadas para insercion`);
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  if (!config.supabase.table) {
    throw new Error('Missing supabase.table in config.');
  }

  const endpoint = new URL(`/rest/v1/${config.supabase.table}`, config.supabase.url);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: config.supabase.apiKey,
      Authorization: `Bearer ${config.supabase.apiKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
      'Content-Profile': config.supabase.schema || 'public',
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Supabase insert failed (${response.status}): ${details}`);
  }

  log(`insertadas ${rows.length} filas en ${config.supabase.table}`);
}

async function uploadEvents(events, config) {
  if (!events.length) {
    return;
  }

  const rows = events.map((event) => mapEventToRow(event, config.upload));
  const batchSize = Number(config.upload.batchSize || 50);

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    await uploadBatch(batch, config);
  }
}

async function pollOnce(config, state, catalog, compiledPattern) {
  const activeFile = await resolveActiveFile(config.source);

  if (!activeFile) {
    log('sin archivo candidato en el origen configurado');
    return;
  }

  const stats = await fs.stat(activeFile);
  const fileState = getOrCreateFileState(state, activeFile);
  const isFirstTimeSeeingFile = !fileState.initialized;
  const switchedFile = state.active_file && state.active_file !== activeFile;

  state.active_file = activeFile;

  if (isFirstTimeSeeingFile) {
    fileState.initialized = true;
    if (config.source.startAtEndOnFirstSeen) {
      fileState.offset = stats.size;
      fileState.pending_fragment = '';
      fileState.pending_fragment_offset = 0;
      await writeJson(config.state.path, state);
      log(`archivo inicial detectado, saltando contenido previo: ${activeFile}`);
      return;
    }
  }

  if (switchedFile && config.source.startAtEndOnFileSwitch) {
    fileState.offset = stats.size;
    fileState.pending_fragment = '';
    fileState.pending_fragment_offset = 0;
    await writeJson(config.state.path, state);
    log(`cambio de archivo detectado, empezando desde el final: ${activeFile}`);
    return;
  }

  if (stats.size < fileState.offset) {
    log(`archivo truncado o rotado, reiniciando lectura: ${activeFile}`);
    fileState.offset = 0;
    fileState.line_number = 0;
    fileState.pending_fragment = '';
    fileState.pending_fragment_offset = 0;
  }

  if (stats.size === fileState.offset) {
    return;
  }

  const startOffset = fileState.offset;
  const endOffset = stats.size;
  const chunkBuffer = await readIncrementalChunk(activeFile, startOffset, endOffset);
  const chunkText = chunkBuffer.toString(config.source.encoding || 'utf8');
  const combinedText = `${fileState.pending_fragment || ''}${chunkText}`;
  const endsWithNewline = /\r?\n$/.test(combinedText);
  const rawLines = combinedText.split(/\r?\n/);
  const pendingFragment = endsWithNewline ? '' : rawLines.pop() || '';
  const events = [];
  let processedBytes = fileState.pending_fragment
    ? fileState.pending_fragment_offset
    : startOffset;

  for (const rawLine of rawLines) {
    const line = rawLine.replace(/\r$/, '');
    const byteLength = Buffer.byteLength(`${rawLine}\n`, config.source.encoding || 'utf8');
    const lineStart = processedBytes;
    const lineEnd = processedBytes + byteLength;
    processedBytes = lineEnd;
    fileState.line_number += 1;

    if (!line.trim()) {
      continue;
    }

    let errorCodes = [];
    let shouldUpload = config.parser.uploadLinesWithoutCode;
    let metadata = {};

    if (config.parser.mode === 'tracecomm') {
      const parsed = parseTraceCommLine(line, fileState, config.parser);
      errorCodes = parsed.errorCodes;
      shouldUpload = parsed.shouldUpload || (config.parser.uploadLinesWithoutCode && errorCodes.length === 0);
      metadata = parsed.metadata;
    } else {
      errorCodes = parseErrorCodes(line, compiledPattern);
      shouldUpload = errorCodes.length > 0 || config.parser.uploadLinesWithoutCode;
    }

    if (!shouldUpload) {
      continue;
    }

    events.push(
      buildEvent({
        monitorName: config.monitorName,
        machineName: config.identity.machineName,
        equipmentSerial: config.identity.equipmentSerial || fileState.detected_equipment_serial || '',
        sourceFile: activeFile,
        lineNumber: fileState.line_number,
        byteOffsetStart: lineStart,
        byteOffsetEnd: lineEnd,
        rawLine: line,
        errorCodes,
        catalog,
        metadata,
      }),
    );
  }

  fileState.offset = endOffset;
  fileState.pending_fragment = pendingFragment;
  fileState.pending_fragment_offset = pendingFragment
    ? endOffset - Buffer.byteLength(pendingFragment, config.source.encoding || 'utf8')
    : 0;

  await writeJson(config.state.path, state);

  if (events.length) {
    log(`detectados ${events.length} eventos nuevos en ${path.basename(activeFile)}`);
    await uploadEvents(events, config);
  }
}

function normalizeConfig(rawConfig, options = {}) {
  const configDir = options.configDir || __dirname;
  const expandedConfig = deepExpandPlaceholders(rawConfig, { configDir });

  return {
    monitorName: expandedConfig.monitorName || 'ba400-log-monitor',
    identity: {
      machineName: expandedConfig.identity?.machineName || os.hostname(),
      equipmentSerial: expandedConfig.identity?.equipmentSerial || '',
    },
    source: {
      mode: expandedConfig.source?.mode || 'file',
      path: expandedConfig.source?.path || '',
      fileNamePattern: expandedConfig.source?.fileNamePattern || '.*',
      encoding: expandedConfig.source?.encoding || 'utf8',
      pollIntervalMs: Number(expandedConfig.source?.pollIntervalMs || 5000),
      startAtEndOnFirstSeen: Boolean(expandedConfig.source?.startAtEndOnFirstSeen),
      startAtEndOnFileSwitch: Boolean(expandedConfig.source?.startAtEndOnFileSwitch),
    },
    parser: {
      mode: expandedConfig.parser?.mode || 'pattern',
      errorPattern: expandedConfig.parser?.errorPattern || 'E:\\((\\d+)\\)',
      uploadLinesWithoutCode: Boolean(expandedConfig.parser?.uploadLinesWithoutCode),
      ignoreZeroErrors: expandedConfig.parser?.ignoreZeroErrors !== false,
      dedupeActiveErrors: expandedConfig.parser?.dedupeActiveErrors !== false,
    },
    supabase: {
      url: expandedConfig.supabase?.url || '',
      apiKey: expandedConfig.supabase?.apiKey || expandedConfig.supabase?.anonKey || '',
      schema: expandedConfig.supabase?.schema || 'public',
      table: expandedConfig.supabase?.table || '',
    },
    upload: {
      dryRun: expandedConfig.upload?.dryRun !== false,
      batchSize: Number(expandedConfig.upload?.batchSize || 50),
      staticColumns: expandedConfig.upload?.staticColumns || {},
      columnMap: expandedConfig.upload?.columnMap || null,
    },
    state: {
      path: path.resolve(expandedConfig.state?.path || path.join(configDir, 'state', 'monitor-state.json')),
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = normalizeConfig(await readJson(args.config), {
    configDir: path.dirname(args.config),
  });
  const state = await loadState(config.state.path);
  const catalogPath = path.join(__dirname, 'error-catalog.json');
  const catalog = await readJson(catalogPath);
  const compiledPattern = new RegExp(config.parser.errorPattern, 'g');

  log(`monitor iniciado en modo ${config.source.mode}`);
  log(`origen: ${config.source.path}`);
  log(`dryRun: ${config.upload.dryRun ? 'true' : 'false'}`);

  do {
    try {
      await pollOnce(config, state, catalog, compiledPattern);
    } catch (error) {
      log(`error en ciclo de monitoreo: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (args.once) {
      break;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, config.source.pollIntervalMs);
    });
  } while (true);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
