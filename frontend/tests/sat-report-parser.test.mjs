import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Parser del reporte SAT: ambos dialectos de CSV (exportaciones antiguas con ";" y unidades en el encabezado,
// exportaciones nuevas con "," y columnas de control/calibrador) y ambas nomenclaturas de mes de archivo.
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, cacheDir: 'node_modules/.vite-dri-tests', server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const checks = [];
const check = (name, fn) => { fn(); checks.push(name); };

const OLD_CSV = [
  '﻿Date,AnalyzerSN;TestName;SampleClass;SampleType;VR1(uL);BarcodeR1;VR2(uL);BarcodeR2',
  '2019-08-27 15:39:25,834000473;CK;BLANK;PLM;240;79011012800002021273_BC;60;79022012800002020599_BC',
  '2019-08-27 15:40:01,834000473;GLUCOSE;CTRL;SER;300;50311032800005109727_BC',
  '2019-08-27 15:41:12,834000473;GLUCOSE;PATIENT;SER;300;50311032800005109727_BC',
  '2019-08-28 08:02:40,834000473;CK;CALIB;SER;240;79011012800002021273_BC;60;79022012800002020599_BC',
].join('\r\n');

const NEW_CSV = [
  '﻿Date,AnalyzerSN,TestName,SampleClass,SampleType,VR1,BarcodeR1,VR2,BarcodeR2,CalibControlName,CalibControlLotNumber,SampleVolume,PackISE_SN,RefElectrode,NaElectrode,KElectrode,ClElectrode,LiElectrode,IsFactoryTest',
  '2026-09-01 07:39:54,834000473,CK,CTRL,SER,240,79011062800004003304_BC,60,79022062800004006523_BC,CONTROL 2   0001,\t0001  A,15,\t,,,,,,True',
  '2026-09-01 07:40:03,834000473,GLUCOSE,PATIENT,SER,300,50311032800005118042_BC,0,,,,3,\t,,,,,,False',
  '2026-09-04 12:57:47,834000473,GLUCOSE,CALIB,SER,300,50311032800005118042_BC,0,,CALIBRADOR 0001,0001,3,\t,,,,,,True',
].join('\r\n');

const ROTOR_OLD = '﻿Date,AnalyzerSN\r\n2019-08-27 15:30:00,834000473\r\n2019-08-29 09:10:00,834000473\r\n';
const ROTOR_NEW = '﻿Date,AnalyzerSN\r\n2026-09-02 08:37:32,834000473\r\n';
const XML = '<?xml version="1.0"?><log><row LogDateTime="2026-09-08 09:14:52.423" ThreadID="x" Message="Export QC Results to QC Historic Module 250" LogType="Information"/><row LogDateTime="2026-09-08 10:00:00.000" ThreadID="x" Message="AutoCreate WS with LIS exception: Any LIS workorder received" LogType="Information"/><row LogDateTime="2026-09-08 10:01:00.000" ThreadID="x" Message="More than one transaction at the same time. Possible locking" LogType="Warning"/></log>';

try {
  const { parseSatReport } = await vite.ssrLoadModule('/src/modules/sat-report/satReportParser.ts');
  const { BlobWriter, TextReader, ZipWriter } = await import('@zip.js/zip.js');
  const writer = new ZipWriter(new BlobWriter('application/zip'));
  const add = (name, text) => writer.add(name, new TextReader(text));
  await add('Version.txt', '5.7.1\nA400\n');
  await add('AX00PCOSInfo.txt', 'OS Name: Microsoft Windows 10 Pro\n');
  await add('FWAdjustments.txt', '--Adjustments: A400 - SN834000473\n--Fw version: BA400v4.05.3\n');
  await add('Ax00Log_20260908_001.xml', XML);
  await add('ConsumptionLogs/834000473_ReagentConsumption_2019_08.csv', OLD_CSV);
  await add('ConsumptionLogs/834000473_ReagentConsumption_202609.csv', NEW_CSV);
  await add('ConsumptionLogs/834000473_RotorConsumption_2019_08.csv', ROTOR_OLD);
  await add('ConsumptionLogs/834000473_RotorConsumption_202609.csv', ROTOR_NEW);
  const blob = await writer.close();
  const file = new File([await blob.arrayBuffer()], 'SATReport 08-09-2026 15-29.A400');

  const summary = await parseSatReport(file, '');

  check('identity, model and report date come from file names and text entries', () => {
    assert.equal(summary.serialNumber, '834000473');
    assert.equal(summary.equipmentModel, 'BA400');
    assert.equal(summary.reportGeneratedAt, new Date('2026-09-08T15:29:00').toISOString());
    assert.equal(summary.softwareVersion, '5.7.1');
    assert.match(summary.operatingSystem, /Windows 10/);
    assert.equal(summary.firmwareAdjustments.length, 2);
  });

  const months = [...new Set(summary.consumption.map((row) => row.bucketMonth))].sort();
  check('old ";" dialect and new "," dialect both produce consumption rows with proper month buckets', () => {
    assert.deepEqual(months, ['201908', '202609']);
    assert.equal(summary.consumption.length, 4); // CK+GLUCOSE in 201908, CK+GLUCOSE in 202609
  });

  const oldGlucose = summary.consumption.find((row) => row.bucketMonth === '201908' && row.testName === 'GLUCOSE');
  const oldCk = summary.consumption.find((row) => row.bucketMonth === '201908' && row.testName === 'CK');
  check('old dialect: VR1(uL)/VR2(uL) headers map to volumes and sample classes are counted', () => {
    assert.equal(oldGlucose.pipettingCount, 2);
    assert.equal(oldGlucose.controlCount, 1);
    assert.equal(oldGlucose.patientCount, 1);
    assert.equal(oldGlucose.vr1TotalUl, 600);
    assert.equal(oldCk.calibrationCount, 1);
    assert.equal(oldCk.vr2TotalUl, 120);
    assert.equal(oldCk.nonFactoryTestCount, 2);
  });

  const newCk = summary.consumption.find((row) => row.bucketMonth === '202609' && row.testName === 'CK');
  check('new dialect: control name/lot, sample volume and factory flag are read', () => {
    assert.equal(newCk.controlCount, 1);
    assert.equal(newCk.sampleVolumeTotalUl, 15);
    assert.equal(newCk.factoryTestCount, 1);
  });

  const control = summary.lots.find((lot) => lot.kind === 'control');
  const calibrator = summary.lots.find((lot) => lot.kind === 'calibrator');
  check('control and calibrator lots are compacted (tabs/double spaces) and linked to tests', () => {
    assert.equal(control.name, 'CONTROL 2 0001');
    assert.equal(control.lot, '0001 A');
    assert.deepEqual(control.tests, ['CK']);
    assert.equal(calibrator.name, 'CALIBRADOR 0001');
    assert.equal(calibrator.lot, '0001');
    assert.equal(summary.lots.filter((lot) => lot.kind === 'barcode').length, 6);
  });

  check('reagent bottle barcodes are decoded into lot, expiry, role and serial', () => {
    const bottles = summary.reagentBottles;
    assert.equal(bottles.length, 6);
    const ckR1Old = bottles.find((b) => b.barcode === '79011012800002021273');
    assert.deepEqual(
      { role: ckR1Old.reagentRole, lot: ckR1Old.lot, expiresAt: ckR1Old.expiresAt, technique: ckR1Old.techniqueCode, serial: ckR1Old.bottleSerial, pipettings: ckR1Old.pipettingCount },
      { role: 'R1', lot: '00002', expiresAt: '2028-01-31', technique: '790', serial: '021273', pipettings: 2 },
    );
    const ckR2New = bottles.find((b) => b.barcode === '79022062800004006523');
    assert.deepEqual({ role: ckR2New.reagentRole, lot: ckR2New.lot, expiresAt: ckR2New.expiresAt }, { role: 'R2', lot: '00004', expiresAt: '2028-06-30' });
    const reagentLots = summary.lots.filter((lot) => lot.kind === 'reagent');
    assert.ok(reagentLots.some((lot) => lot.name === 'CK R1' && lot.lot === '00004' && lot.tests.includes('CK')));
    assert.equal(summary.findings.distinctLots, 2 + reagentLots.length);
  });

  check('rotor changes keep per-month buckets for both file namings', () => {
    assert.deepEqual(summary.rotors.map((row) => [row.bucketMonth, row.rotorChangeCount]).sort(), [['201908', 2], ['202609', 1]]);
    assert.equal(summary.findings.rotorChangeCount, 3);
  });

  check('xml log rows are classified and counted in findings', () => {
    const categories = summary.events.map((event) => event.category).sort();
    // «Export QC Results to QC Historic Module» es rutina del software, no un resultado de control.
    assert.deepEqual(categories, ['error', 'operation', 'warning']);
    assert.equal(summary.findings.errorCount, 1);
    assert.equal(summary.findings.warningCount, 1);
    assert.equal(summary.findings.dateFrom, new Date('2019-08-27 15:39:25').toISOString());
    assert.equal(summary.coverage.processedFiles, 8);
    assert.equal(summary.coverage.hasDatabaseBackup, false);
  });

  console.log(JSON.stringify({ checks: checks.length, passed: checks }, null, 2));
} finally {
  await vite.close();
}
