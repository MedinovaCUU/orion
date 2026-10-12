#!/usr/bin/env node
/**
 * Servicio de extracción de controles SAT para Orion.
 *
 * El navegador no puede restaurar el respaldo SQL Server (.bak) del SAT, así que el importador guarda el original
 * en Storage y deja la importación en `processing_status = 'partial'`. Este servicio toma esas importaciones,
 * descarga el original (entero o en partes con manifiesto), extrae los controles con SQL Server en Docker,
 * hace upsert en `equipment_qc_latest` y marca la importación como procesada. DRI y Monitoreo lo ven solos.
 *
 * Uso (desde la raíz del proyecto):
 *   node tools/sat-qc-extractor/sat-qc-worker.mjs --watch            # servicio continuo (revisa cada 60 s)
 *   node tools/sat-qc-extractor/sat-qc-worker.mjs --once             # procesa lo pendiente y termina
 *   node tools/sat-qc-extractor/sat-qc-worker.mjs --file <SAT.A400>  # extrae un archivo local y lo incorpora
 *
 * Credenciales: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno; si faltan, se toman en memoria del
 * Supabase CLI enlazado a este proyecto (`supabase login` + `supabase link`). La contraseña de exportación es el
 * secreto SAT_EXPORT_PASSWORD del proyecto: se pide a la función `sat-export-password` con la llave de servicio
 * (o se toma de la misma variable en el entorno). Nada de esto se escribe ni se imprime.
 * Requiere Docker en marcha y `unzip`.
 */
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkDocker, extractQcFromSat, toEquipmentQcRows } from './extract-qc.mjs';

process.env.TZ ||= 'America/Mexico_City';
const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..', '..');
const BUCKET = 'sat-reports';
const POLL_MS = 60_000;
const MAX_ATTEMPTS = 3;

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const token = process.argv[index];
  if (!token.startsWith('--')) continue;
  const next = process.argv[index + 1];
  if (next && !next.startsWith('--')) {
    args.set(token, next);
    index += 1;
  } else args.set(token, 'true');
}
const log = (message) => console.log(`[${new Date().toLocaleString('es-MX')}] ${message}`);

/* ---------------------------------------------------------------- credenciales */

const readEnvFile = async (path) => {
  try {
    return Object.fromEntries(
      (await readFile(path, 'utf8'))
        .split(/\r?\n/)
        .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
        .filter(Boolean)
        .map((match) => [match[1], match[2].replace(/^['"]|['"]$/g, '')]),
    );
  } catch {
    return {};
  }
};

const resolveCredentials = async () => {
  const frontendEnv = await readEnvFile(join(projectRoot, 'frontend', '.env.local'));
  const url = process.env.SUPABASE_URL || frontendEnv.VITE_SUPABASE_URL;
  if (!url) throw new Error('Falta SUPABASE_URL (o VITE_SUPABASE_URL en frontend/.env.local).');
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return { url, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  const ref = new URL(url).hostname.split('.')[0];
  const cli = spawnSync('supabase', ['projects', 'api-keys', '--project-ref', ref, '-o', 'json'], { encoding: 'utf8', cwd: projectRoot });
  if (cli.status === 0) {
    try {
      const keys = JSON.parse(cli.stdout);
      const service = keys.find((item) => item.name === 'service_role') || keys.find((item) => item.type === 'secret');
      if (service?.api_key) return { url, key: service.api_key };
    } catch {
      /* se informa abajo */
    }
  }
  throw new Error('Sin credenciales de servicio: define SUPABASE_SERVICE_ROLE_KEY o inicia sesión con el Supabase CLI (supabase login).');
};

const loadSupabase = async () => {
  const entry = join(projectRoot, 'frontend', 'node_modules', '@supabase', 'supabase-js', 'dist', 'index.mjs');
  const { createClient } = await import(pathToFileURL(entry).href);
  const { url, key } = await resolveCredentials();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};

/** Contraseña de exportación: del entorno o del secreto del proyecto vía la función `sat-export-password`. */
const resolveExportPassword = async (supabase) => {
  if (process.env.SAT_EXPORT_PASSWORD) return process.env.SAT_EXPORT_PASSWORD;
  const { data, error } = await supabase.functions.invoke('sat-export-password', { body: {} });
  const password = !error && data && typeof data.password === 'string' ? data.password : '';
  if (!password) throw new Error(`No se pudo leer el secreto SAT_EXPORT_PASSWORD de Supabase: ${error?.message || 'respuesta vacía'}`);
  return password;
};
let exportPassword = '';

/* ---------------------------------------------------------------- original desde Storage */

const sha256File = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');

/** Descarga el SAT original (entero o por partes según su manifiesto) a un archivo temporal. */
const downloadOriginal = async (supabase, storagePath, workDir, fileName) => {
  const bucket = supabase.storage.from(BUCKET);
  const target = join(workDir, basename(fileName || 'report.A400'));
  const stream = createWriteStream(target);
  const append = async (path) => {
    const { data, error } = await bucket.download(path);
    if (error || !data) throw new Error(`No se pudo descargar ${path}: ${error?.message || 'sin datos'}`);
    const chunk = Buffer.from(await data.arrayBuffer());
    await new Promise((resolveWrite, rejectWrite) => stream.write(chunk, (err) => (err ? rejectWrite(err) : resolveWrite())));
  };
  try {
    if (storagePath.endsWith('.manifest.json')) {
      const { data, error } = await bucket.download(storagePath);
      if (error || !data) throw new Error(`No se pudo leer el manifiesto: ${error?.message || 'sin datos'}`);
      const manifest = JSON.parse(await data.text());
      for (const [index, part] of manifest.parts.entries()) {
        log(`  descargando parte ${index + 1} de ${manifest.parts.length}`);
        await append(part.path);
      }
    } else {
      await append(storagePath);
    }
  } finally {
    await new Promise((resolveEnd) => stream.end(resolveEnd));
  }
  return target;
};

/* ---------------------------------------------------------------- estado de la importación */

const setStatus = async (supabase, importRow, patch) => {
  const coverage = { ...(importRow.coverage || {}), qcExtraction: { ...(importRow.coverage?.qcExtraction || {}), ...patch } };
  const update = { coverage, updated_at: new Date().toISOString() };
  if (patch.status === 'done') update.processing_status = 'processed';
  const { error } = await supabase.from('sat_report_imports').update(update).eq('id', importRow.id);
  if (error) log(`  aviso: no se pudo actualizar el estado de la importación: ${error.message}`);
  importRow.coverage = coverage;
};

const upsertQc = async (supabase, payload, importId) => {
  const rows = toEquipmentQcRows(payload, importId);
  if (!rows.length) return 0;
  const { error } = await supabase.from('equipment_qc_latest').upsert(rows, { onConflict: 'serial_number,test_key,control_level' });
  if (error) throw new Error(`No se pudieron guardar los controles: ${error.message}`);
  return rows.length;
};

/** Procesa una importación pendiente de punta a punta. */
const processImport = async (supabase, importRow) => {
  const attempts = Number(importRow.coverage?.qcExtraction?.attempts || 0) + 1;
  log(`SAT ${importRow.file_name} · serie ${importRow.serial_number} · intento ${attempts}`);
  await setStatus(supabase, importRow, { status: 'processing', attempts, startedAt: new Date().toISOString(), error: null });
  const workDir = await mkdtemp(join(tmpdir(), 'orion-sat-worker-'));
  try {
    const archive = await downloadOriginal(supabase, importRow.storage_path, workDir, importRow.file_name);
    const digest = await sha256File(archive);
    if (importRow.file_sha256 && digest !== importRow.file_sha256) throw new Error('El original descargado no coincide con la huella del SAT importado.');
    const payload = await extractQcFromSat({
      archivePath: archive,
      password: exportPassword,
      serialNumber: importRow.serial_number,
      equipmentModel: importRow.equipment_model || 'BA400',
      log: (message) => log(`  ${message}`),
    });
    const written = await upsertQc(supabase, payload, importRow.id);
    await setStatus(supabase, importRow, { status: 'done', finishedAt: new Date().toISOString(), resultCount: written, error: null });
    log(`  ${written} controles incorporados.`);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    await setStatus(supabase, importRow, { status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', finishedAt: new Date().toISOString(), error: message.slice(0, 500) });
    log(`  error: ${message}`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
};

const pendingImports = async (supabase) => {
  const { data, error } = await supabase
    .from('sat_report_imports')
    .select('id,file_name,file_sha256,serial_number,equipment_model,storage_path,coverage,processing_status,created_at')
    .eq('processing_status', 'partial')
    .not('storage_path', 'is', null)
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) throw new Error(`No se pudieron leer las importaciones SAT: ${error.message}`);
  return (data || []).filter((row) => {
    const state = row.coverage?.qcExtraction;
    if (!row.coverage?.hasDatabaseBackup) return false;
    if (!state) return true;
    if (state.status === 'failed' || state.status === 'done') return false;
    // Una extracción «processing» de más de 30 min se da por abandonada (servicio reiniciado).
    if (state.status === 'processing') return Date.now() - Date.parse(state.startedAt || 0) > 30 * 60_000;
    return Number(state.attempts || 0) < MAX_ATTEMPTS;
  });
};

const runOnce = async (supabase) => {
  const pending = await pendingImports(supabase);
  if (!pending.length) return 0;
  for (const row of pending) await processImport(supabase, row);
  return pending.length;
};

/* ---------------------------------------------------------------- entrada */

const main = async () => {
  const dockerProblem = await checkDocker();
  if (dockerProblem) throw new Error(dockerProblem);
  const supabase = await loadSupabase();
  exportPassword = args.get('--password') || (await resolveExportPassword(supabase));

  if (args.has('--file')) {
    const archivePath = resolve(args.get('--file'));
    const digest = await sha256File(archivePath);
    const { data: importRow } = await supabase
      .from('sat_report_imports')
      .select('id,file_name,file_sha256,serial_number,equipment_model,storage_path,coverage,processing_status')
      .eq('file_sha256', digest)
      .maybeSingle();
    const serialNumber = args.get('--serial') || importRow?.serial_number;
    if (!serialNumber) throw new Error('El archivo no está importado en Orion: importa el SAT primero o indica --serial.');
    if (importRow) await setStatus(supabase, importRow, { status: 'processing', startedAt: new Date().toISOString(), error: null });
    const payload = await extractQcFromSat({
      archivePath,
      password: exportPassword,
      serialNumber,
      equipmentModel: args.get('--model') || importRow?.equipment_model || 'BA400',
      log: (message) => log(message),
    });
    const written = await upsertQc(supabase, payload, importRow?.id || null);
    if (importRow) await setStatus(supabase, importRow, { status: 'done', finishedAt: new Date().toISOString(), resultCount: written, error: null });
    log(`${written} controles de la serie ${serialNumber} incorporados${importRow ? ' y la importación quedó procesada' : ''}.`);
    return;
  }

  if (args.has('--once')) {
    const processed = await runOnce(supabase);
    log(processed ? `${processed} importaciones revisadas.` : 'Sin SAT pendientes de extracción.');
    return;
  }

  if (args.has('--watch')) {
    log('Servicio de controles SAT en marcha; revisa cada 60 s.');
    for (;;) {
      try {
        await runOnce(supabase);
      } catch (caught) {
        log(`error: ${caught instanceof Error ? caught.message : String(caught)}`);
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, POLL_MS));
    }
  }

  console.error('Indica --watch, --once o --file <SAT.A400>.');
  process.exitCode = 2;
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
