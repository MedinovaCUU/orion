#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const archivePath = args.get('--file') ? resolve(args.get('--file')) : null;
const archivePassword = args.get('--password') || 'biosystems';
const serialNumber = args.get('--serial') || '';
const equipmentModel = args.get('--model') || 'BA400';
const outputPath = args.get('--output') ? resolve(args.get('--output')) : null;

if (!archivePath || !serialNumber) {
  console.error('Uso: node extract-latest-qc.mjs --file <SAT.A400> --password <clave> --serial <serie> [--model BA400] [--output archivo.json]');
  process.exit(2);
}

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

const workDir = await mkdtemp(`${tmpdir()}/orion-sat-qc-`);
const backupPath = `${workDir}/report.bak`;
const containerName = `orion-sat-qc-${Date.now()}-${randomBytes(3).toString('hex')}`;
const saPassword = `Orion!${randomBytes(9).toString('base64url')}aA1`;
const sqlcmd = '/opt/mssql-tools18/bin/sqlcmd';

try {
  console.error('Extrayendo respaldo SQL Server del SAT…');
  await new Promise((resolveExtract, rejectExtract) => {
    const child = spawn('unzip', ['-P', archivePassword, '-p', archivePath, '*.bak'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let stderr = '';
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', async (code) => {
      if (code !== 0 || !chunks.length) return rejectExtract(new Error(`No se pudo extraer el .bak: ${stderr}`));
      const { writeFile } = await import('node:fs/promises');
      await writeFile(backupPath, Buffer.concat(chunks));
      resolveExtract();
    });
  });

  console.error('Restaurando respaldo en un contenedor temporal aislado…');
  await run('docker', [
    'run', '--platform', 'linux/amd64', '-d', '--name', containerName,
    '-e', 'ACCEPT_EULA=Y', '-e', `MSSQL_SA_PASSWORD=${saPassword}`,
    '-v', `${workDir}:/var/opt/mssql/backup:ro`,
    'mcr.microsoft.com/mssql/server:2022-latest',
  ]);

  let ready = false;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      await run('docker', ['exec', containerName, sqlcmd, '-S', 'localhost', '-U', 'sa', '-P', saPassword, '-C', '-Q', 'SELECT 1']);
      ready = true;
      break;
    } catch {
      await sleep(1000);
    }
  }
  if (!ready) throw new Error('SQL Server no quedó disponible dentro del tiempo esperado.');

  const fileList = await run('docker', [
    'exec', containerName, sqlcmd, '-S', 'localhost', '-U', 'sa', '-P', saPassword, '-C',
    '-W', '-s', '|', '-Q', "SET NOCOUNT ON; RESTORE FILELISTONLY FROM DISK=N'/var/opt/mssql/backup/report.bak';",
  ]);
  const fileRows = fileList.stdout.split(/\r?\n/).slice(2).filter((line) => line.includes('|'));
  const dataFile = fileRows.map((line) => line.split('|')).find((columns) => columns[2] === 'D');
  const logFile = fileRows.map((line) => line.split('|')).find((columns) => columns[2] === 'L');
  if (!dataFile || !logFile) throw new Error('No se identificaron los archivos lógico y de log del respaldo.');

  const restoreSql = [
    "RESTORE DATABASE [SatAx00] FROM DISK=N'/var/opt/mssql/backup/report.bak' WITH",
    `MOVE N'${sqlEscape(dataFile[0])}' TO N'/var/opt/mssql/data/SatAx00.mdf',`,
    `MOVE N'${sqlEscape(logFile[0])}' TO N'/var/opt/mssql/data/SatAx00_log.ldf', REPLACE, RECOVERY;`,
  ].join(' ');
  await run('docker', ['exec', containerName, sqlcmd, '-S', 'localhost', '-U', 'sa', '-P', saPassword, '-C', '-Q', restoreSql]);

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
  const queryResult = await run('docker', [
    'exec', containerName, sqlcmd, '-S', 'localhost', '-U', 'sa', '-P', saPassword, '-C', '-d', 'SatAx00',
    '-W', '-s', '|', '-Q', query,
  ]);
  const rows = queryResult.stdout.split(/\r?\n/).slice(2).filter((line) => line.split('|').length === 15);
  const parsedResults = rows.map((line) => {
    const columns = line.split('|').map((value) => value.trim());
    const testKey = columns[2] || columns[1] || String(columns[0]);
    return {
      serialNumber,
      equipmentModel,
      testKey,
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
  }).filter((result) => Number.isFinite(result.resultValue) && result.resultAt);

  // The operational table keeps one compact snapshot per analyzer test and
  // control level. A SAT may contain several historical lots for the same
  // level, so retain only the freshest result before producing the payload.
  const latestBySnapshot = new Map();
  for (const result of parsedResults) {
    const key = `${result.testKey}::${result.controlLevel}`;
    const current = latestBySnapshot.get(key);
    if (!current || Date.parse(result.resultAt) > Date.parse(current.resultAt)) {
      latestBySnapshot.set(key, result);
    }
  }
  const results = [...latestBySnapshot.values()].sort(
    (left, right) => Date.parse(right.resultAt) - Date.parse(left.resultAt),
  );

  const payload = JSON.stringify({
    schemaVersion: 'orion-equipment-qc-v1',
    sourceFile: basename(archivePath),
    extractedAt: new Date().toISOString(),
    serialNumber,
    equipmentModel,
    results,
  }, null, 2);
  if (outputPath) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(outputPath, payload);
    console.error(`${results.length} resultados escritos en ${outputPath}`);
  } else {
    process.stdout.write(`${payload}\n`);
  }
} finally {
  await run('docker', ['rm', '-f', containerName]).catch(() => undefined);
  await rm(workDir, { recursive: true, force: true });
}
