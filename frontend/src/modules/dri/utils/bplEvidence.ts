import type { SatQcResult } from '../../sat-report/satReportTypes';
import {
  formatBplNumber,
  summarizeBplEventMetrics,
  type BplEvent,
  type BplSerialSummary,
  type BplStage,
  type BplStageOverview,
  type BplTestSnapshot,
} from '../../equipment-monitoring/bplEvents';
import type {
  DriBplBlankReading,
  DriBplCalibrationQuality,
  DriBplEvidenceSummary,
  DriBplQcFinding,
  DriBplStageEvidence,
  DriCaseFormState,
  DriCaseSignals,
  DriCatalog,
  DriEvidenceArtifact,
  DriFailureDirection,
  DriFailurePatternType,
  DriQcBand,
  DriReagentMeasurementInput,
} from '../types/dri.types';
import { classifySatQcResults, resolveReagentForTest } from './satQcClassifier';

export interface DriBplProjection {
  evidence: DriBplEvidenceSummary;
  failedReagentIds: string[];
  correctReagentIds: string[];
  reagentMeasurements: Record<string, DriReagentMeasurementInput>;
  suggestedEventType: DriFailurePatternType | null;
  suggestedFailureDirection: DriFailureDirection | null;
  controlLot: string | null;
  controlLevel: DriCaseFormState['controlLevel'] | null;
  calibratorName: string | null;
  calibratorLot: string | null;
  reagentLot: string | null;
  eventDate: string | null;
  signalPatch: Partial<DriCaseSignals>;
  observationBlock: string;
  evidenceItem: DriEvidenceArtifact;
  matchedTests: number;
  unmatchedTests: string[];
}

const BPL_OBSERVATION_PATTERN = /\[BPL:[\s\S]*$/m;

const stageEvidence = (overview: BplStageOverview, tests: BplTestSnapshot[], stage: BplStage): DriBplStageEvidence => ({
  accepted: overview.counts.accepted,
  rejected: overview.counts.rejected,
  pending: overview.counts.pending,
  observed: overview.counts.observed,
  effectiveStatus:
    overview.testsRejected > 0
      ? 'rejected'
      : overview.testsPending > 0
        ? 'pending'
        : overview.testsAccepted > 0
          ? 'accepted'
          : overview.lastEvent
            ? 'evidence_observed'
            : null,
  lastAt: overview.lastEvent?.timestamp || null,
  rejectedTests: tests.filter((test) => test.stages[stage]?.effectiveStatus === 'rejected').map((test) => test.testName),
  pendingTests: tests.filter((test) => test.stages[stage]?.effectiveStatus === 'pending').map((test) => test.testName),
  acceptedTests: tests.filter((test) => test.stages[stage]?.effectiveStatus === 'accepted').map((test) => test.testName),
});

const effectiveStageEvent = (test: BplTestSnapshot, stage: BplStage): BplEvent | null => {
  const state = test.stages[stage];
  if (!state) return null;
  return state.latestEvaluated || state.latest;
};

const bandFromQc = (event: BplEvent): DriQcBand => {
  const qc = event.qc;
  if (!qc || qc.resultValue === null) return event.status === 'rejected' ? 'out_of_reject' : 'missing_reference';
  if (qc.withinLimits === false) return 'out_of_reject';
  if (qc.zScore !== null) {
    const magnitude = Math.abs(qc.zScore);
    if (magnitude >= 3) return 'out_of_reject';
    if (magnitude >= 2) return 'near_reject';
    if (magnitude >= 1) return 'within_2s';
    return 'within_1s';
  }
  if (event.status === 'rejected') return 'out_of_reject';
  if (qc.withinLimits === true) return 'within_1s';
  return 'missing_reference';
};

const toControlLevel = (value: string | null | undefined): DriCaseFormState['controlLevel'] | null =>
  value === 'level_1' || value === 'level_2' ? value : null;

const toIsoDate = (value: string | null) => (value ? value.slice(0, 10) : null);

/**
 * Proyecta el resumen BPL de una serie sobre el formulario DRI. La evaluación del
 * instrumento (aceptado/rechazado) manda; las referencias EInfo solo enriquecen la
 * medición cuando el nivel y el lote del control se reconocen.
 */
export const buildDriBplProjection = (summary: BplSerialSummary, catalog: DriCatalog): DriBplProjection => {
  const reagentByTest = new Map<string, string | null>();
  const unmatchedTests: string[] = [];
  summary.tests.forEach((test) => {
    if (test.testKey === 'INSTRUMENTO' || test.testKey === 'SIN PRUEBA') {
      reagentByTest.set(test.testKey, null);
      return;
    }
    const reagent = resolveReagentForTest(catalog, { testName: test.testName, testKey: test.testKey });
    reagentByTest.set(test.testKey, reagent?.id || null);
    if (!reagent) unmatchedTests.push(test.testName);
  });

  const qcResults: SatQcResult[] = [];
  const qcFindings: DriBplQcFinding[] = [];
  const calibrations: DriBplCalibrationQuality[] = [];
  const blanks: DriBplBlankReading[] = [];
  const failedIds = new Set<string>();
  const correctIds = new Set<string>();
  const measurements: Record<string, DriReagentMeasurementInput> = {};
  const westgardRules = new Set<string>();
  const qcRejectedWithAcceptedChain: string[] = [];
  const fullyAcceptedTests: string[] = [];
  const intermittentTests: string[] = [];

  summary.tests.forEach((test) => {
    const reagentId = reagentByTest.get(test.testKey) || null;
    if (test.statusFlips >= 2) intermittentTests.push(test.testName);

    const qcEvent = effectiveStageEvent(test, 'quality_control');
    if (qcEvent?.qc) {
      qcEvent.qc.westgardRules.forEach((rule) => westgardRules.add(rule));
      qcFindings.push({
        testName: test.testName,
        reagentId,
        status: qcEvent.status,
        resultValue: qcEvent.qc.resultValue,
        unit: qcEvent.qc.unit,
        targetMean: qcEvent.qc.targetMean,
        targetSd: qcEvent.qc.targetSd,
        minLimit: qcEvent.qc.minLimit,
        maxLimit: qcEvent.qc.maxLimit,
        zScore: qcEvent.qc.zScore,
        direction: qcEvent.qc.direction,
        westgardRules: qcEvent.qc.westgardRules,
        controlName: qcEvent.controlOrCalibratorName,
        controlLot: qcEvent.lotNumber,
        controlLevel: qcEvent.qc.controlLevel,
        observedAt: qcEvent.timestamp,
      });
      if (qcEvent.qc.resultValue !== null && qcEvent.timestamp) {
        qcResults.push({
          id: qcEvent.key,
          serialNumber: summary.serial,
          equipmentModel: 'BA400',
          testKey: test.testKey,
          testId: null,
          testName: test.testName,
          testShortName: null,
          reagentId,
          controlId: null,
          controlName: qcEvent.controlOrCalibratorName,
          controlLot: qcEvent.lotNumber,
          controlLevel: qcEvent.qc.controlLevel || 'unknown',
          resultValue: qcEvent.qc.resultValue,
          resultAt: qcEvent.timestamp,
          unit: qcEvent.qc.unit,
          analyzerMin: qcEvent.qc.minLimit,
          analyzerMax: qcEvent.qc.maxLimit,
          analyzerTarget: qcEvent.qc.targetMean,
          analyzerSd: qcEvent.qc.targetSd,
          analyzerValidationStatus: qcEvent.qc.validationStatus,
          sourceType: 'live_equipment',
          sourceImportId: null,
        });
      }
    }

    const calibrationEvent = effectiveStageEvent(test, 'calibration');
    if (calibrationEvent && calibrationEvent.eventType !== 'bpl_consumption_record') {
      calibrations.push({
        testName: test.testName,
        reagentId,
        status: calibrationEvent.status,
        correlation: calibrationEvent.calibration?.correlation ?? null,
        relativeError: calibrationEvent.calibration?.relativeError ?? null,
        slope: calibrationEvent.calibration?.slope ?? null,
        offset: calibrationEvent.calibration?.offset ?? null,
        curveType: calibrationEvent.calibration?.curveType ?? null,
        pointCount: calibrationEvent.calibration?.points.length ?? 0,
        calibratorName: calibrationEvent.controlOrCalibratorName,
        calibratorLot: calibrationEvent.lotNumber,
        observedAt: calibrationEvent.timestamp,
      });
    }

    (['reagent_blank', 'instrument_photometry_blank'] as const).forEach((stage) => {
      const blankEvent = effectiveStageEvent(test, stage);
      if (!blankEvent || blankEvent.eventType === 'bpl_consumption_record') return;
      blanks.push({
        testName: test.testName,
        reagentId,
        status: blankEvent.status,
        stage,
        absorbance: blankEvent.blank?.absorbance ?? null,
        limit: blankEvent.blank?.absorbanceLimit ?? null,
        observedAt: blankEvent.timestamp,
      });
    });

    const qcStatus = test.stages.quality_control?.effectiveStatus || null;
    const calibrationStatus = test.stages.calibration?.effectiveStatus || null;
    const blankStatus = test.stages.reagent_blank?.effectiveStatus || null;
    if (qcStatus === 'rejected' && calibrationStatus !== 'rejected' && blankStatus !== 'rejected' && (calibrationStatus === 'accepted' || blankStatus === 'accepted')) {
      qcRejectedWithAcceptedChain.push(test.testName);
    }
    if (test.chainAccepted) fullyAcceptedTests.push(test.testName);

    if (!reagentId) return;
    if (test.effectiveStatus === 'rejected') {
      failedIds.add(reagentId);
    } else if (test.chainAccepted || (qcStatus === 'accepted' && calibrationStatus !== 'rejected' && blankStatus !== 'rejected')) {
      correctIds.add(reagentId);
    }

    if (qcEvent?.qc && qcEvent.qc.resultValue !== null) {
      measurements[reagentId] = {
        reagentId,
        obtainedValue: String(qcEvent.qc.resultValue),
        blankAbsorbance: '',
        selectedQcReferenceId: null,
        expectedValue: qcEvent.qc.targetMean !== null ? String(qcEvent.qc.targetMean) : null,
        unit: qcEvent.qc.unit,
        blankUnit: 'A',
        source: 'auto_import',
        updatedAt: new Date().toISOString(),
        controlLevel: toControlLevel(qcEvent.qc.controlLevel) === null ? null : (qcEvent.qc.controlLevel as 'level_1' | 'level_2'),
        controlLot: qcEvent.lotNumber,
        observedAt: qcEvent.timestamp,
        sourceResultId: qcEvent.key,
        qcBand: bandFromQc(qcEvent),
        matchConfidence: 'compatible',
      };
    }
    const reagentBlankEvent = effectiveStageEvent(test, 'reagent_blank');
    if (reagentBlankEvent?.blank?.absorbance !== null && reagentBlankEvent?.blank?.absorbance !== undefined) {
      const existing = measurements[reagentId] || {
        reagentId,
        obtainedValue: '',
        blankAbsorbance: '',
        source: 'auto_import' as const,
        updatedAt: new Date().toISOString(),
      };
      measurements[reagentId] = { ...existing, blankAbsorbance: String(reagentBlankEvent.blank.absorbance), blankUnit: 'A' };
    }
  });

  // Las referencias EInfo refinan la medición cuando lote, nivel y unidad coinciden.
  if (qcResults.length) {
    const projection = classifySatQcResults(catalog, qcResults);
    Object.entries(projection.reagentMeasurements).forEach(([reagentId, measurement]) => {
      measurements[reagentId] = { ...measurements[reagentId], ...measurement, blankAbsorbance: measurements[reagentId]?.blankAbsorbance || '' };
    });
    projection.failedReagentIds.forEach((reagentId) => {
      failedIds.add(reagentId);
      correctIds.delete(reagentId);
    });
  }
  failedIds.forEach((reagentId) => correctIds.delete(reagentId));

  const stages = {
    photometryBlank: stageEvidence(summary.stages.instrument_photometry_blank, summary.tests, 'instrument_photometry_blank'),
    reagentBlank: stageEvidence(summary.stages.reagent_blank, summary.tests, 'reagent_blank'),
    calibration: stageEvidence(summary.stages.calibration, summary.tests, 'calibration'),
    qualityControl: stageEvidence(summary.stages.quality_control, summary.tests, 'quality_control'),
  };

  const rejectedQc = qcFindings.filter((finding) => finding.status === 'rejected');
  const worstQc = [...rejectedQc].sort((left, right) => Math.abs(right.zScore || 0) - Math.abs(left.zScore || 0))[0] || null;
  const rejectedBlank = blanks.find((blank) => blank.status === 'rejected' && blank.stage === 'reagent_blank') || null;
  const rejectedCalibration = calibrations.find((calibration) => calibration.status === 'rejected') || null;

  const suggestedEventType: DriFailurePatternType | null = worstQc
    ? worstQc.direction === 'high'
      ? 'control_high'
      : worstQc.direction === 'low'
        ? 'control_low'
        : 'qc_out_of_range'
    : rejectedCalibration
      ? 'failed_calibration'
      : rejectedBlank
        ? 'failed_blank'
        : stages.photometryBlank.effectiveStatus === 'rejected'
          ? 'absorbance_error'
          : null;

  const suggestedFailureDirection: DriFailureDirection | null = worstQc?.direction
    ? worstQc.direction
    : rejectedBlank
      ? rejectedBlank.absorbance !== null && rejectedBlank.limit !== null && Math.abs(rejectedBlank.absorbance) > Math.abs(rejectedBlank.limit)
        ? 'high_absorbance'
        : 'low_absorbance'
      : rejectedCalibration
        ? 'unstable'
        : null;

  const failedTests = summary.tests.filter((test) => test.effectiveStatus === 'rejected');
  const primaryTest = failedTests[0] || summary.tests[0] || null;
  const controlSource = worstQc || qcFindings.find((finding) => finding.controlLot) || null;
  const calibratorSource =
    (rejectedCalibration && (rejectedCalibration.calibratorLot || rejectedCalibration.calibratorName) ? rejectedCalibration : null) ||
    calibrations.find((calibration) => calibration.calibratorLot || calibration.calibratorName) ||
    null;
  const reagentLot = primaryTest?.reagentBarcodes[0] || summary.reagentBarcodes[0]?.barcode || null;

  const signalPatch: Partial<DriCaseSignals> = {};
  if (stages.photometryBlank.effectiveStatus === 'rejected') signalPatch.opticalRejectObserved = true;
  if (stages.calibration.accepted > 0 && stages.calibration.rejected === 0) signalPatch.normalCurvesObserved = true;
  if (intermittentTests.length) signalPatch.intermittentPattern = true;

  const windowStart = summary.events.length ? summary.events[summary.events.length - 1].timestamp : null;
  const windowEnd = summary.lastEventAt;
  const rejectedEventDate =
    failedTests
      .map((test) => test.lastEventAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) || null;

  const describeStage = (label: string, stage: DriBplStageEvidence) =>
    `${label}: ${stage.acceptedTests.length} aceptadas · ${stage.rejectedTests.length} rechazadas · ${stage.pendingTests.length} pendientes`;
  const describeTest = (test: BplTestSnapshot) => {
    const parts = (['reagent_blank', 'calibration', 'quality_control'] as const)
      .map((stage) => {
        const event = effectiveStageEvent(test, stage);
        if (!event || event.status !== 'rejected') return null;
        const metrics = summarizeBplEventMetrics(event).slice(0, 3).join(' · ');
        const label = stage === 'reagent_blank' ? 'blanco' : stage === 'calibration' ? 'calibración' : 'QC';
        return `${label} rechazada${metrics ? ` (${metrics})` : ''}`;
      })
      .filter(Boolean);
    return `${test.testName}: ${parts.join('; ') || 'rechazo sin detalle'}`;
  };

  const lines = [
    describeStage('Blanco fotométrico', stages.photometryBlank),
    describeStage('Blancos de reactivo', stages.reagentBlank),
    describeStage('Calibraciones', stages.calibration),
    describeStage('Controles', stages.qualityControl),
    ...failedTests.slice(0, 8).map(describeTest),
    summary.pendingTests.length ? `Pendientes de aceptación: ${summary.pendingTests.slice(0, 8).join(', ')}` : null,
    westgardRules.size ? `Reglas Westgard: ${Array.from(westgardRules).join(', ')}` : null,
    summary.missingData.length ? `Falta para aceptar: ${summary.missingData.slice(0, 6).join(', ')}` : null,
    unmatchedTests.length ? `Sin reactivo DRI equivalente: ${unmatchedTests.join(', ')}` : null,
  ].filter((line): line is string => Boolean(line));

  const observationBlock = [
    `[BPL:${summary.serial}] Evidencia del monitor BA400 · ${summary.events.length} eventos${windowStart && windowEnd ? ` (${toIsoDate(windowStart)} a ${toIsoDate(windowEnd)})` : ''}`,
    ...lines,
  ].join('\n');

  const evidence: DriBplEvidenceSummary = {
    serial: summary.serial,
    sourceReference: `ba400_bpl_events · ${summary.serial}`,
    capturedAt: new Date().toISOString(),
    windowStart,
    windowEnd,
    eventCount: summary.events.length,
    stages,
    qcFindings,
    calibrations,
    blanks,
    westgardRules: Array.from(westgardRules),
    qcRejectedWithAcceptedChain,
    fullyAcceptedTests,
    intermittentTests,
    missingData: summary.missingData,
    unmatchedTests,
  };

  const evidenceItem: DriEvidenceArtifact = {
    id: `bpl-${summary.serial}`,
    type: 'report',
    title: `Evidencia BPL · ${summary.serial}`,
    value: `${summary.events.length} eventos del monitor BA400 · ${failedTests.length} pruebas con rechazo`,
    note: '',
    capturedAt: evidence.capturedAt,
    ocrSummary: lines.slice(0, 8),
    sourceStatus: 'validated',
    sourceReference: evidence.sourceReference,
    derivedData: {
      signalPatch,
      serviceTests: [],
      observationLines: lines,
      observedInterferents: [],
    },
  };

  return {
    evidence,
    failedReagentIds: Array.from(failedIds),
    correctReagentIds: Array.from(correctIds),
    reagentMeasurements: measurements,
    suggestedEventType,
    suggestedFailureDirection,
    controlLot: controlSource?.controlLot || null,
    controlLevel: toControlLevel(controlSource?.controlLevel),
    calibratorName: calibratorSource?.calibratorName || null,
    calibratorLot: calibratorSource?.calibratorLot || null,
    reagentLot,
    eventDate: toIsoDate(rejectedEventDate || windowEnd),
    signalPatch,
    observationBlock,
    evidenceItem,
    matchedTests: summary.tests.length - unmatchedTests.length,
    unmatchedTests,
  };
};

/** Mezcla la proyección sobre el formulario sin pisar capturas manuales ya escritas. */
export const applyBplProjectionToForm = (form: DriCaseFormState, projection: DriBplProjection): DriCaseFormState => {
  const failedSet = new Set(projection.failedReagentIds);
  const correctIds = projection.correctReagentIds.filter((reagentId) => !failedSet.has(reagentId));
  const observations = [form.observations.replace(BPL_OBSERVATION_PATTERN, '').trim(), projection.observationBlock].filter(Boolean).join('\n\n');
  const evidenceItems = [...form.evidenceItems.filter((item) => item.id !== projection.evidenceItem.id), projection.evidenceItem];
  return {
    ...form,
    equipmentModel: /^83400/.test(projection.evidence.serial) ? 'BA400' : form.equipmentModel,
    serialNumber: projection.evidence.serial,
    eventDate: projection.eventDate || form.eventDate,
    eventType: projection.suggestedEventType || form.eventType,
    failureDirection: projection.suggestedFailureDirection || form.failureDirection,
    controlLot: form.controlLot || projection.controlLot || '',
    controlLevel: projection.controlLevel || form.controlLevel,
    calibratorName: form.calibratorName || projection.calibratorName || '',
    calibratorLot: form.calibratorLot || projection.calibratorLot || '',
    reagentLot: form.reagentLot || projection.reagentLot || '',
    failedReagentIds: projection.failedReagentIds,
    correctReagentIds: correctIds,
    reagentMeasurements: { ...form.reagentMeasurements, ...projection.reagentMeasurements },
    signals: { ...form.signals, ...projection.signalPatch },
    observations,
    evidenceItems,
    bplEvidence: projection.evidence,
  };
};

export const describeBplProjection = (projection: DriBplProjection) =>
  `Evidencia BPL aplicada: ${projection.evidence.eventCount} eventos, ${projection.failedReagentIds.length} reactivos con rechazo, ${projection.correctReagentIds.length} correctos` +
  (projection.unmatchedTests.length ? ` y ${projection.unmatchedTests.length} pruebas sin reactivo equivalente (${projection.unmatchedTests.slice(0, 4).join(', ')}).` : '.');

export const formatBplEvidenceBadge = (evidence: DriBplEvidenceSummary) =>
  `Evidencia BPL · ${evidence.eventCount} eventos · ${formatBplNumber(evidence.stages.qualityControl.rejectedTests.length, 0)} QC rechazados`;
