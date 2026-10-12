/**
 * Extracción de controles de un reporte SAT: los valores numéricos de QC solo viven en el respaldo SQL Server
 * (.bak) que viaja dentro del .A400. Se restaura en un contenedor temporal de SQL Server (Docker), se consulta el
 * último resultado por prueba, lote y nivel con los límites que usa el propio analizador, y se elimina todo.
 *
 * Requisitos: Docker en marcha (imagen mcr.microsoft.com/mssql/server:2022-latest) y `unzip`.
 */
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename } from 'node:path';
import { spawn } from 'node:child_process';

export const QC_SCHEMA_VERSION = 'orion-equipment-qc-v1';
/**
 * Contraseña de exportación de los SAT. No vive en el código: es el secreto `SAT_EXPORT_PASSWORD` del proyecto de
 * Supabase (el servicio la pide a la función `sat-export-password`) o la misma variable en el entorno local.
 */
export const DEFAULT_SAT_PASSWORD = process.env.SAT_EXPORT_PASSWORD || '';

const run = (command, commandArgs, options = {}) =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, commandArgs, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.stderr?.on('data', (chunk) => { stderr += chunk; });
    child.on('error', rejectRun);
    child.on('close', (code) => {
      if (code === 0) resolveRun({ stdout, stderr });
      else rejectRun(new Error(`${command} terminó con código ${code}: ${stderr || stdout}`));
    });
  });

const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
const sqlEscape = (value) => String(value).replaceAll("'", "''");
const nullableNumber = (value) => (value === '' || value === 'NULL' ? null : Number(value));
const nullableText = (value) => (value === '' || value === 'NULL' ? null : value);
const normalizeUnit = (value) => ({ UL: 'U/L', GDL: 'g/dL', GL: 'g/L', MGDL: 'mg/dL', MGL: 'mg/L', MMOLL: 'mmol/L', UMOLL: 'µmol/L' }[value] || value || null);
const controlLevel = (value) => ({ 1: 'level_1', 2: 'level_2', 3: 'level_3' }[Number(value)] || 'unknown');

/** ¿Hay Docker utilizable? Devuelve un mensaje legible si no. */
export const checkDocker = async () => {
  try {
    await run('docker', ['info', '--format', '{{.ServerVersion}}']);
    return null;
  } catch {
    return 'Docker no está en marcha: abre Docker Desktop (o el servicio de Docker) y vuelve a intentarlo.';
  }
};

export const extractQcFromSat = async ({ archivePath, password = DEFAULT_SAT_PASSWORD, serialNumber, equipmentModel = 'BA400', log = () => {} }) => {
  if (!archivePath || !serialNumber) throw new Error('Faltan el archivo SAT o la serie del equipo.');
  if (!password) throw new Error('Falta la contraseña de exportación del SAT (secreto SAT_EXPORT_PASSWORD).');
  const dockerProblem = await checkDocker();
  if (dockerProblem) throw new Error(dockerProblem);

  const workDir = await mkdtemp(`${tmpdir()}/orion-sat-qc-`);
  const backupPath = `${workDir}/report.bak`;
  const containerName = `orion-sat-qc-${Date.now()}-${randomBytes(3).toString('hex')}`;
  const saPassword = `Orion!${randomBytes(9).toString('base64url')}aA1`;
  const sqlcmd = '/opt/mssql-tools18/bin/sqlcmd';
  const sql = (args) => run('docker', ['exec', containerName, sqlcmd, '-S', 'localhost', '-U', 'sa', '-P', saPassword, '-C', ...args]);

  try {
    log('Extrayendo el respaldo SQL Server del SAT…');
    await new Promise((resolveExtract, rejectExtract) => {
      const child = spawn('unzip', ['-P', password, '-p', archivePath, '*.bak'], { stdio: ['ignore', 'pipe', 'pipe'] });
      const chunks = [];
      let stderr = '';
      child.stdout.on('data', (chunk) => chunks.push(chunk));
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', rejectExtract);
      child.on('close', async (code) => {
        if (code !== 0 || !chunks.length) return rejectExtract(new Error(`No se pudo extraer el .bak del SAT: ${stderr.trim() || 'el archivo no trae respaldo'}`));
        await writeFile(backupPath, Buffer.concat(chunks));
        resolveExtract();
      });
    });

    log('Restaurando el respaldo en un SQL Server temporal…');
    await run('docker', [
      'run', '--platform', 'linux/amd64', '-d', '--name', containerName,
      '-e', 'ACCEPT_EULA=Y', '-e', `MSSQL_SA_PASSWORD=${saPassword}`,
      '-v', `${workDir}:/var/opt/mssql/backup:ro`,
      'mcr.microsoft.com/mssql/server:2022-latest',
    ]);
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      try {
        await sql(['-Q', 'SELECT 1']);
        ready = true;
        break;
      } catch {
        await sleep(1000);
      }
    }
    if (!ready) throw new Error('SQL Server no quedó disponible dentro del tiempo esperado.');

    const fileList = await sql(['-W', '-s', '|', '-Q', "SET NOCOUNT ON; RESTORE FILELISTONLY FROM DISK=N'/var/opt/mssql/backup/report.bak';"]);
    const fileRows = fileList.stdout.split(/\r?\n/).slice(2).filter((line) => line.includes('|'));
    const dataFile = fileRows.map((line) => line.split('|')).find((columns) => columns[2] === 'D');
    const logFile = fileRows.map((line) => line.split('|')).find((columns) => columns[2] === 'L');
    if (!dataFile || !logFile) throw new Error('No se identificaron los archivos de datos y de log del respaldo.');
    await sql(['-Q', [
      "RESTORE DATABASE [SatAx00] FROM DISK=N'/var/opt/mssql/backup/report.bak' WITH",
      `MOVE N'${sqlEscape(dataFile[0])}' TO N'/var/opt/mssql/data/SatAx00.mdf',`,
      `MOVE N'${sqlEscape(logFile[0])}' TO N'/var/opt/mssql/data/SatAx00_log.ldf', REPLACE, RECOVERY;`,
    ].join(' ')]);

    log('Leyendo los resultados de control…');
    const query = `
SET NOCOUNT ON;
WITH ranked AS (
  SELECT r.QCTestSampleID, r.QCControlLotID,
    CASE WHEN ISNULL(r.ManualResultFlag,0)=1 AND r.ManualResultValue IS NOT NULL THEN r.ManualResultValue ELSE r.ResultValue END ResultValue,
    r.ResultDateTime, r.ValidationStatus,
    ROW_NUMBER() OVER(PARTITION BY r.QCTestSampleID,r.QCControlLotID ORDER BY r.ResultDateTime DESC,r.RunNumber DESC) rn
  FROM dbo.tqcResults r WHERE ISNULL(r.Excluded,0)=0
)
SELECT h.TestID,h.TestName,h.TestShortName,h.MeasureUnit,cl.ControlID,cl.ControlName,cl.LotNumber,
  pc.ControlLevel,r.ResultValue,CONVERT(varchar(33),r.ResultDateTime,126),
  lim.MinConcentration,lim.MaxConcentration,tc.TargetMean,tc.TargetSD,r.ValidationStatus
FROM ranked r
JOIN dbo.tqcHistoryTestSamples h ON h.QCTestSampleID=r.QCTestSampleID
JOIN dbo.tqcHistoryControlLots cl ON cl.QCControlLotID=r.QCControlLotID
LEFT JOIN dbo.tparControls pc ON pc.ControlID=cl.ControlID
LEFT JOIN dbo.tqcHistoryTestControlLots lim ON lim.QCTestSampleID=r.QCTestSampleID AND lim.QCControlLotID=r.QCControlLotID
LEFT JOIN dbo.tparTestControls tc ON tc.TestID=h.TestID AND tc.ControlID=cl.ControlID AND tc.SampleType=cl.SampleType
WHERE r.rn=1 ORDER BY r.ResultDateTime DESC;`;
    const queryResult = await sql(['-d', 'SatAx00', '-W', '-s', '|', '-Q', query]);
    const rows = queryResult.stdout.split(/\r?\n/).slice(2).filter((line) => line.split('|').length === 15);
    const parsed = rows
      .map((line) => {
        const columns = line.split('|').map((value) => value.trim());
        return {
          serialNumber,
          equipmentModel,
          testKey: columns[2] || columns[1] || String(columns[0]),
          testId: nullableNumber(columns[0]),
          testName: columns[1],
          testShortName: nullableText(columns[2]),
          reagentId: null,
          controlId: nullableNumber(columns[4]),
          controlName: nullableText(columns[5]),
          controlLot: nullableText(columns[6]),
          controlLevel: controlLevel(columns[7]),
          resultValue: Number(columns[8]),
          resultAt: columns[9],
          unit: normalizeUnit(columns[3]),
          analyzerMin: nullableNumber(columns[10]),
          analyzerMax: nullableNumber(columns[11]),
          analyzerTarget: nullableNumber(columns[12]),
          analyzerSd: nullableNumber(columns[13]),
          analyzerValidationStatus: nullableText(columns[14]),
          sourceType: 'sat_report',
        };
      })
      .filter((result) => Number.isFinite(result.resultValue) && result.resultAt);

    // Una fila por prueba y nivel (la tabla operativa guarda solo el último resultado).
    const latest = new Map();
    for (const result of parsed) {
      const key = `${result.testKey}::${result.controlLevel}`;
      const current = latest.get(key);
      if (!current || Date.parse(result.resultAt) > Date.parse(current.resultAt)) latest.set(key, result);
    }
    const results = [...latest.values()].sort((left, right) => Date.parse(right.resultAt) - Date.parse(left.resultAt));
    return { schemaVersion: QC_SCHEMA_VERSION, sourceFile: basename(archivePath), extractedAt: new Date().toISOString(), serialNumber, equipmentModel, results };
  } finally {
    await run('docker', ['rm', '-f', containerName]).catch(() => undefined);
    await rm(workDir, { recursive: true, force: true });
  }
};

/**
 * Hora local del analizador → instante. SQL Server devuelve «2026-09-08T08:28:00.123» sin zona; los equipos de
 * este proyecto están en México, así que se interpreta como hora local de quien corre la extracción.
 */
export const toInstant = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/** Filas para `equipment_qc_latest` (llave única serial_number + test_key + control_level). */
export const toEquipmentQcRows = (payload, importId = null) =>
  payload.results.map((result) => ({
    serial_number: result.serialNumber,
    equipment_model: result.equipmentModel,
    test_key: result.testKey,
    test_id: result.testId,
    test_name: result.testName,
    test_short_name: result.testShortName,
    reagent_id: result.reagentId,
    control_id: result.controlId,
    control_name: result.controlName,
    control_lot: result.controlLot,
    control_level: result.controlLevel,
    result_value: result.resultValue,
    result_at: toInstant(result.resultAt),
    unit: result.unit,
    analyzer_min: result.analyzerMin,
    analyzer_max: result.analyzerMax,
    analyzer_target: result.analyzerTarget,
    analyzer_sd: result.analyzerSd,
    analyzer_validation_status: result.analyzerValidationStatus,
    source_type: 'sat_report',
    source_import_id: importId,
    raw_payload: { sourceFile: payload.sourceFile, extractedAt: payload.extractedAt },
    updated_at: new Date().toISOString(),
  }));
