export type SatEventCategory = 'error' | 'warning' | 'qc' | 'calibration' | 'operation';

export interface SatArchiveEntrySummary {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  encrypted: boolean;
  status: 'processed' | 'stored' | 'deferred' | 'ignored';
  purpose: string;
}

export interface SatDiagnosticEvent {
  category: SatEventCategory;
  occurredAt: string | null;
  code: string | null;
  message: string;
  sourceFile: string;
  raw: Record<string, string>;
}

export interface SatLotEvidence {
  kind: 'reagent' | 'control' | 'calibrator' | 'ise' | 'barcode' | 'unknown';
  name: string;
  lot: string;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  sourceFile: string;
  tests: string[];
}

/** Botella de reactivo observada en los consumos, con el lote y la caducidad decodificados del código de barras. */
export interface SatReagentBottle {
  testName: string;
  reagentRole: 'R1' | 'R2';
  barcode: string;
  techniqueCode: string;
  lot: string;
  expiryMonth: number;
  expiryYear: number;
  expiresAt: string;
  bottleSerial: string;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  pipettingCount: number;
  sourceFile: string;
}

export interface SatConsumptionSummary {
  summaryKey: string;
  bucketMonth: string;
  serialNumber: string;
  equipmentModel: string;
  testName: string;
  pipettingCount: number;
  vr1TotalUl: number;
  vr2TotalUl: number;
  sampleVolumeTotalUl: number;
  patientCount: number;
  blankCount: number;
  calibrationCount: number;
  controlCount: number;
  factoryTestCount: number;
  nonFactoryTestCount: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
  sourceFile: string;
}

export interface SatRotorSummary {
  summaryKey: string;
  bucketMonth: string;
  serialNumber: string;
  equipmentModel: string;
  rotorChangeCount: number;
  firstChangeAt: string | null;
  lastChangeAt: string | null;
  changeTimestamps: string[];
  sourceFile: string;
}

export type SatQcControlLevel = 'level_1' | 'level_2' | 'level_3' | 'unknown';

export interface SatQcResult {
  id?: string | null;
  serialNumber: string;
  equipmentModel: 'BA400' | 'BA200' | 'A15';
  testKey: string;
  testId: number | null;
  testName: string;
  testShortName: string | null;
  reagentId: string | null;
  controlId: number | null;
  controlName: string | null;
  controlLot: string | null;
  controlLevel: SatQcControlLevel;
  resultValue: number;
  resultAt: string;
  unit: string | null;
  analyzerMin: number | null;
  analyzerMax: number | null;
  analyzerTarget: number | null;
  analyzerSd: number | null;
  analyzerValidationStatus: string | null;
  sourceType: 'sat_report' | 'live_equipment';
  sourceImportId?: string | null;
}

export interface SatReportCoverage {
  processedFiles: number;
  totalFiles: number;
  processedBytes: number;
  totalUncompressedBytes: number;
  hasDatabaseBackup: boolean;
  databaseBackupBytes: number;
  deferredReasons: string[];
}

export interface SatReportSummary {
  schemaVersion: 'sat-import-v1';
  fileName: string;
  fileSize: number;
  sha256: string;
  encrypted: boolean;
  equipmentModel: 'BA400' | 'BA200' | 'A15';
  serialNumber: string;
  reportGeneratedAt: string | null;
  softwareVersion: string | null;
  operatingSystem: string | null;
  firmwareAdjustments: string[];
  archiveEntries: SatArchiveEntrySummary[];
  events: SatDiagnosticEvent[];
  lots: SatLotEvidence[];
  consumption: SatConsumptionSummary[];
  rotors: SatRotorSummary[];
  /** Botellas de reactivo decodificadas (lote, caducidad, serie); vacío en reportes sin códigos de barras legibles. */
  reagentBottles?: SatReagentBottle[];
  /** Filled by the server-side .bak extractor. CSV/XML-only imports leave it empty. */
  qcResults?: SatQcResult[];
  coverage: SatReportCoverage;
  findings: {
    errorCount: number;
    warningCount: number;
    qcEventCount: number;
    calibrationEventCount: number;
    distinctTests: number;
    distinctLots: number;
    distinctBarcodes: number;
    rotorChangeCount: number;
    dateFrom: string | null;
    dateTo: string | null;
  };
}

export interface SatPersistResult {
  importId: string | null;
  /** Ruta del original, o de su manifiesto `.manifest.json` cuando se guardó en partes. */
  storagePath: string | null;
  /** Partes en que se guardó el original (1 = archivo entero, 0 = no se guardó). */
  storedParts?: number;
  persisted: boolean;
  warning: string | null;
  /** Lo que quedó escrito en las tablas de Monitoreo y DRI. */
  written?: {
    consumptionMonths: number;
    consumptionRows: number;
    rotorRows: number;
    eventRows: number;
    lotRows: number;
    qcEventRows: number;
  };
}
