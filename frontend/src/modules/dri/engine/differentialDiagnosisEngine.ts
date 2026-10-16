import { A15_KNOWLEDGE } from '../knowledge/a15.rules';
import { BA200_KNOWLEDGE } from '../knowledge/ba200.rules';
import { BA400_KNOWLEDGE } from '../knowledge/ba400.rules';
import { buildReagentProfiles } from '../knowledge/reagentRelations';
import { buildContrastAnalysis, exonerationPoints } from './contrastAnalysis';
import { buildFactorAggregates, buildRelationSignals } from './evidenceMapper';
import { buildHypothesisRecommendation, rankSubsystems } from './recommendationEngine';
import { resolveProbabilityLabel, scoreHypothesis, type DriScoreContribution } from './scoringEngine';
import { createDriLogger } from '../utils/driLogging';
import { assessDilutionPattern } from '../utils/dilutionUtils';
import { assessProcedureLimitations } from '../utils/procedureLimitations';
import { assessLotIntelligence, lotContrast, reagentMatchKey } from '../utils/lotIntelligence';
import { localDayEndMs, parseInstantMs } from '../utils/lotDates';
import type { DriLotFinding, DriLotIntelligence } from '../types/dri.types';
import { assessQcReference, findQcReferenceById } from '../utils/qcReferenceUtils';
import { normalizeText } from '../utils/relationUtils';
import type {
  DriBplEvidenceSummary,
  DriBplStageEvidence,
  DriCaseFormState,
  DriCatalog,
  DriEngineResult,
  DriEvidenceRow,
  DriHypothesisResult,
  DriPlatformKnowledge,
  DriQcAssessment,
  DriQcReference,
  DriRelationSignal,
  DriReagentProfile,
} from '../types/dri.types';

const platformKnowledgeMap: Record<string, DriPlatformKnowledge> = {
  BA400: BA400_KNOWLEDGE,
  BA200: BA200_KNOWLEDGE,
  A15: A15_KNOWLEDGE,
};

const resolvePlatformKnowledge = (platform: DriCaseFormState['equipmentModel']) =>
  platformKnowledgeMap[platform] || BA400_KNOWLEDGE;

const topSignal = (signals: DriRelationSignal[], category: DriRelationSignal['category'], matcher?: (signal: DriRelationSignal) => boolean) =>
  signals.find((signal) => signal.category === category && (!matcher || matcher(signal)));

const hasAbnormalServiceTest = (form: DriCaseFormState, utilityId: string) =>
  form.serviceTests.some((test) => test.utilityId === utilityId && (test.result === 'abnormal' || test.result === 'failed'));

const hasRecordedServiceTest = (form: DriCaseFormState, utilityId: string) =>
  form.serviceTests.some((test) => test.utilityId === utilityId && test.result !== 'not_run');

const SERVICE_RESULT_PRIORITY = {
  not_run: 0,
  normal: 1,
  passed: 1,
  adjusted: 2,
  abnormal: 3,
  failed: 4,
} as const;

const CONTEXTUAL_SERVICE_UTILITIES = new Set(['historical_reports', 'analyzer_information']);

const buildRuleServiceEvidence = (
  form: DriCaseFormState,
  rule: DriPlatformKnowledge['rules'][number],
) => {
  const primaryUtilities = new Set(rule.checklist.map((step) => step.utilityId));
  const strongestByUtility = new Map<string, DriCaseFormState['serviceTests'][number]>();

  form.serviceTests.forEach((test) => {
    if (!rule.serviceUtilities.includes(test.utilityId) || test.result === 'not_run') return;
    const current = strongestByUtility.get(test.utilityId);
    if (!current || SERVICE_RESULT_PRIORITY[test.result] > SERVICE_RESULT_PRIORITY[current.result]) {
      strongestByUtility.set(test.utilityId, test);
    }
  });

  const positive: DriScoreContribution[] = [];
  const negative: DriScoreContribution[] = [];
  let confirmedAbnormal = false;
  let confirmedPrimaryAbnormal = false;

  strongestByUtility.forEach((test) => {
    const tier = primaryUtilities.has(test.utilityId)
      ? 'primary'
      : CONTEXTUAL_SERVICE_UTILITIES.has(test.utilityId)
        ? 'contextual'
        : 'supporting';
    const positivePoints =
      tier === 'primary'
        ? test.result === 'failed'
          ? 28
          : test.result === 'abnormal'
            ? 24
            : 10
        : tier === 'supporting'
          ? test.result === 'failed'
            ? 16
            : test.result === 'abnormal'
              ? 14
              : 6
          : test.result === 'failed'
            ? 8
            : test.result === 'abnormal'
              ? 7
              : 3;
    const negativePoints =
      tier === 'primary'
        ? test.result === 'passed'
          ? 16
          : 14
        : tier === 'supporting'
          ? test.result === 'passed'
            ? 10
            : 8
          : test.result === 'passed'
            ? 5
            : 4;

    if (test.result === 'failed' || test.result === 'abnormal' || test.result === 'adjusted') {
      confirmedAbnormal ||= test.result === 'failed' || test.result === 'abnormal';
      confirmedPrimaryAbnormal ||=
        primaryUtilities.has(test.utilityId) && (test.result === 'failed' || test.result === 'abnormal');
      positive.push({
        label:
          test.result === 'adjusted'
            ? `${test.label} requirió ajuste; aporta evidencia parcial a ${rule.title}.`
            : `${test.label} fue ${test.result === 'failed' ? 'fallida' : 'anormal'} y respalda ${rule.title}.`,
        points: positivePoints,
      });
      return;
    }

    negative.push({
      label: `${test.label} resultó ${test.result === 'passed' ? 'passed' : 'normal'} y reduce ${rule.title}.`,
      points: negativePoints,
    });
  });

  return {
    positive,
    negative,
    confirmedAbnormal,
    confirmedPrimaryAbnormal,
    evaluatedUtilities: strongestByUtility.size,
  };
};

// Reglas Westgard que señalan sesgo sistemático (calibrador/control) frente a error aleatorio (pipeteo).
const SYSTEMATIC_WESTGARD = /(^|[^0-9])(2[\s_-]?2s|4[\s_-]?1s|10[\s_-]?x|7[\s_-]?t|8[\s_-]?x|9[\s_-]?x|12[\s_-]?x)/i;
const RANDOM_WESTGARD = /(^|[^0-9])(1[\s_-]?3s|r[\s_-]?4s)/i;

/** Banderas derivadas de la evidencia BPL del monitor; todas quedan en cero cuando no hay evidencia. */
const summarizeBplEvidenceForEngine = (bpl: DriBplEvidenceSummary | null) => ({
  present: Boolean(bpl),
  photometryRejected: bpl?.stages.photometryBlank.effectiveStatus === 'rejected',
  photometryAccepted: bpl?.stages.photometryBlank.effectiveStatus === 'accepted',
  photometryObserved: Boolean(bpl?.stages.photometryBlank.lastAt),
  reagentBlankRejectedCount: bpl?.stages.reagentBlank.rejectedTests.length || 0,
  calibrationRejectedCount: bpl?.stages.calibration.rejectedTests.length || 0,
  qcRejectedCount: bpl?.stages.qualityControl.rejectedTests.length || 0,
  qcChainTests: bpl?.qcRejectedWithAcceptedChain || [],
  systematicWestgardRules: (bpl?.westgardRules || []).filter((rule) => SYSTEMATIC_WESTGARD.test(rule)),
  randomWestgardRules: (bpl?.westgardRules || []).filter((rule) => RANDOM_WESTGARD.test(rule)),
  poorCorrelationCount: (bpl?.calibrations || []).filter((item) => item.correlation !== null && Math.abs(item.correlation) < 0.99).length,
  intermittentTests: bpl?.intermittentTests || [],
});

const buildBplEvidenceRows = (bpl: DriBplEvidenceSummary | null): DriEvidenceRow[] => {
  if (!bpl) return [];
  const rows: DriEvidenceRow[] = [];
  const pushStage = (id: string, title: string, stage: DriBplStageEvidence, category: string, failedLabel = 'Rechazadas en el equipo') => {
    if (!stage.lastAt) return;
    const rejected = stage.rejectedTests.length;
    const pending = stage.pendingTests.length;
    const accepted = stage.acceptedTests.length;
    rows.push({
      id: `bpl:${id}`,
      title,
      category,
      failedCoverage: rejected ? 1 : 0,
      correctCoverage: accepted ? 1 : 0,
      score: rejected ? 88 : pending ? 40 : 12,
      evidenceFor: rejected
        ? `${failedLabel}: ${stage.rejectedTests.join(', ')}.`
        : pending
          ? `Pendientes de aceptación: ${stage.pendingTests.join(', ')}.`
          : 'Sin rechazos vigentes en el monitor BPL.',
      evidenceAgainst: accepted ? `Aceptadas: ${stage.acceptedTests.slice(0, 8).join(', ')}.` : 'Sin aceptaciones vigentes registradas.',
      source: 'Monitor BPL',
    });
  };
  pushStage('photometry', 'Blanco fotométrico instrumental', bpl.stages.photometryBlank, 'blank');
  pushStage('reagent-blank', 'Blancos de reactivo', bpl.stages.reagentBlank, 'blank');
  pushStage('calibration', 'Curvas de calibración', bpl.stages.calibration, 'calibration');
  // Controles: rechazo confirmado o fuera de control según las reglas Westgard de Orion.
  pushStage('qc', 'Controles de calidad', bpl.stages.qualityControl, 'control', 'Fuera de control en el equipo');
  if (bpl.westgardRules.length) {
    rows.push({
      id: 'bpl:westgard',
      title: `Westgard ${bpl.westgardRules.join(', ')}`,
      category: 'control',
      failedCoverage: 1,
      correctCoverage: 0,
      score: 60,
      evidenceFor: 'El analizador registró reglas Westgard violadas en los controles recientes.',
      evidenceAgainst: 'Las reglas no identifican por sí solas el subsistema; se cruzan con blancos y calibraciones.',
      source: 'Monitor BPL',
    });
  }
  return rows;
};

const buildEvidenceRows = (signals: DriRelationSignal[]): DriEvidenceRow[] =>
  signals.slice(0, 14).map((signal) => ({
    id: signal.id,
    title: signal.label,
    category: signal.category,
    failedCoverage: signal.failedCoverage,
    correctCoverage: signal.correctCoverage,
    score: signal.suspicionScore,
    evidenceFor: signal.evidenceFor.join(' '),
    evidenceAgainst: signal.evidenceAgainst.join(' '),
    source: signal.category === 'service' ? 'Prueba de servicio' : 'Relación reactivo/factor',
  }));

const buildQcEvidenceRow = (reference: DriQcReference, assessment: DriQcAssessment): DriEvidenceRow => ({
  id: `qc:${reference.id}`,
  title: `${reference.reagentDisplayCode || reference.reagentId} · ${reference.controlLevel === 'level_1' ? 'Nivel I' : 'Nivel II'} · ${reference.unit || 'sin unidad'}`,
  category: 'qc',
  failedCoverage: 1,
  correctCoverage: 0,
  score:
    assessment.band === 'out_of_reject'
      ? 92
      : assessment.band === 'near_reject'
        ? 76
        : assessment.band === 'within_2s'
          ? 52
          : assessment.band === 'within_1s'
            ? 18
            : 8,
  evidenceFor: `Target ${reference.targetValue} ${reference.unit || ''} · 1SD ${reference.sd1Low} a ${reference.sd1High} · rechazo ${reference.rejectLow} a ${reference.rejectHigh}.`,
  evidenceAgainst: assessment.explanation,
  source: 'Valuesheet QC',
});

const LOT_FINDING_SOURCE = 'Lote en uso (SAT · einfo.bio)';

/**
 * Filas de evidencia por hallazgo de lote de las pruebas fallidas. Igual que las filas de factores, el contraste
 * con las correctas evaluables se ve en la fila: si lo comparten, la fila lo dice y baja de puntuación; si no hubo
 * correctas evaluables, también. `skipReagents` evita repetir lo que ya tiene fila propia (estabilidad capturada a mano).
 */
const buildLotEvidenceRows = (
  intelligence: DriLotIntelligence | null,
  failedCount: number,
  skipReagents: { type: DriLotFinding['type']; reagentIds: string[] } | null = null,
): DriEvidenceRow[] => {
  if (!intelligence) return [];
  const seen = new Set<string>();
  return intelligence.findings
    .filter((finding) => finding.outcome === 'failed' && finding.score >= 30)
    .filter((finding) => !(skipReagents && finding.type === skipReagents.type && skipReagents.reagentIds.includes(finding.reagentId)))
    .filter((finding) => {
      const key = `${finding.type}:${finding.reagentId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((finding) => {
      const contrast = lotContrast(intelligence, finding.type, failedCount);
      // La fila dice que el hallazgo no separa en cuanto las correctas evaluadas lo comparten, aunque las
      // fallidas que lo tienen no sean mayoría.
      const shared = contrast.correctObserved && contrast.correctCoverage > 0 && (contrast.correctCoverage >= 0.5 || contrast.correctCoverage >= contrast.failedCoverage);
      const against = !finding.observed
        ? 'Extrapolado: el SAT no muestra el lote en uso cerca del evento.'
        : shared
          ? `También lo comparten ${Math.round(contrast.correctCoverage * 100)}% de las correctas evaluadas: no separa fallidas de correctas.`
          : !contrast.correctObserved
            ? 'Sin pruebas correctas evaluables en el SAT para contrastarlo.'
            : '';
      const factor = !finding.observed ? 0.6 : shared ? 0.4 : !contrast.correctObserved ? 0.75 : 1;
      return {
        id: finding.id,
        title: finding.title,
        category: 'lot',
        failedCoverage: contrast.failedCoverage,
        correctCoverage: contrast.correctCoverage,
        score: Math.round(finding.score * factor),
        evidenceFor: finding.explanation,
        evidenceAgainst: against,
        source: LOT_FINDING_SOURCE,
      };
    });
};

const buildProcedureEvidenceRow = (finding: ReturnType<typeof assessProcedureLimitations>['findings'][number]): DriEvidenceRow => ({
  id: `procedure:${finding.id}`,
  title: finding.title,
  category: finding.type === 'interference' ? 'control' : 'dilution',
  failedCoverage: 1,
  correctCoverage: 0,
  score: finding.score,
  evidenceFor: finding.explanation,
  evidenceAgainst: 'Antes de culpar al hardware, confirmar la limitación del procedimiento y la unidad reportada.',
  source: finding.source === 'observations' ? 'IFU + observaciones' : 'IFU / rango metrológico',
});

/** Techo de la evidencia indirecta: lineal hasta 70 y comprimido a la mitad por encima (100 → 85). */
export const UNCONFIRMED_PROBABILITY_CAP = 85;
const capUnconfirmedProbability = (score: number) => (score <= 70 ? score : Math.min(UNCONFIRMED_PROBABILITY_CAP, Math.round(70 + (score - 70) / 2)));

const createHypothesis = (
  key: string,
  title: string,
  ruleId: string,
  suspectedSubsystem: DriHypothesisResult['suspectedSubsystem'],
  positive: DriScoreContribution[],
  negative: DriScoreContribution[],
  missingEvidence: string[],
  explanation: string,
  rule: DriPlatformKnowledge['rules'][number],
  serviceTestAbnormal: boolean,
): DriHypothesisResult => {
  const scoring = scoreHypothesis(title, positive, negative, missingEvidence);
  // Sin una prueba directa anormal (Photometry, bombas, temperatura…) la evidencia es indirecta: el puntaje
  // se comprime por encima de 70 hasta un máximo de 85 (el orden se conserva). Solo la confirmación llega a 100.
  const probability = serviceTestAbnormal ? scoring.probabilityScore : capUnconfirmedProbability(scoring.probabilityScore);
  const serviceScriptIds = Array.from(
    new Set(rule.checklist.flatMap((step) => step.serviceScriptIds || [])),
  );
  return buildHypothesisRecommendation(
    {
      key,
      title,
      score: probability,
      probabilityScore: probability,
      confidenceScore: scoring.confidenceScore,
      severity: scoring.severity,
      probabilityLabel: resolveProbabilityLabel(probability),
      status: 'generated',
      suspectedSubsystem,
      explanation: `${explanation} ${scoring.explanationText}`,
      evidenceFor: positive.map((item) => item.label),
      evidenceAgainst: negative.map((item) => item.label),
      recommendedNextTest: rule.checklist[0]?.title || null,
      invasivenessLevel:
        probability >= 86 && serviceTestAbnormal
          ? 'possible_part'
          : probability >= 70
            ? 'service_test'
            : 'operational_review',
      supportingFactorIds: [],
      matchedRuleIds: [ruleId],
      missingEvidence,
      payload: {
        positiveWeights: positive,
        negativeWeights: negative,
        serviceScriptIds,
      },
    },
    rule,
    serviceTestAbnormal,
    missingEvidence,
  );
};

export function runDifferentialDiagnosisEngine(form: DriCaseFormState, catalog: DriCatalog): DriEngineResult {
  const runId = crypto.randomUUID();
  const platformKnowledge = resolvePlatformKnowledge(form.equipmentModel);
  const logs = [] as DriEngineResult['logs'];
  const logger = createDriLogger(runId, form.equipmentModel, logs);
  const profiles = buildReagentProfiles(catalog).filter((profile) =>
    profile.platforms.value.length === 0 || profile.platforms.value.includes(form.equipmentModel),
  );
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const catalogFailedProfiles = form.failedReagentIds
    .map((id) => profileById.get(id))
    .filter((profile): profile is DriReagentProfile => Boolean(profile));
  const catalogCorrectProfiles = form.correctReagentIds
    .map((id) => profileById.get(id))
    .filter((profile): profile is DriReagentProfile => Boolean(profile));
  // Lotes en uso (SAT) + hechos del lote (einfo.bio): los límites y la estabilidad del IFU del lote en uso
  // sustituyen a los genéricos del catálogo para las pruebas que tienen botella identificada.
  const lotAssessment = assessLotIntelligence(form, catalogFailedProfiles, catalogCorrectProfiles);
  const lotIntelligence = lotAssessment?.intelligence || null;
  const failedProfiles = lotAssessment?.failedProfiles || catalogFailedProfiles;
  const correctProfiles = lotAssessment?.correctProfiles || catalogCorrectProfiles;

  logger.info('ENGINE', 'input', 'Caso recibido por el motor diferencial.', {
    platform: form.equipmentModel,
    failed: failedProfiles.map((profile) => profile.id),
    correct: correctProfiles.map((profile) => profile.id),
    serviceTests: form.serviceTests.map((test) => ({ utilityId: test.utilityId, result: test.result })),
    selectedQcReferenceId: form.selectedQcReferenceId || null,
  });

  const factorAggregates = buildFactorAggregates(catalog, failedProfiles, correctProfiles, runId, form.equipmentModel, logs);
  const relationSignals = buildRelationSignals(form, failedProfiles, correctProfiles, factorAggregates, runId, form.equipmentModel, logs);
  const contrast = buildContrastAnalysis({ signals: relationSignals, failedProfiles, correctProfiles, platformProfiles: profiles });
  const contrastFor = (signal: DriRelationSignal | undefined | null) =>
    signal ? contrast.rows.find((row) => row.signalId === signal.id) || null : null;
  const isExonerated = (signal: DriRelationSignal | undefined | null) => contrastFor(signal)?.verdict === 'exonerates';
  if (contrast.exonerations.length || contrast.implications.length) {
    logger.info('EVIDENCE', 'contrast', 'Contraste fallidas/correctas por factor compartido.', {
      exonerated: contrast.exonerations.map((row) => ({ id: row.signalId, label: row.label, strength: row.exonerationStrength })),
      implicated: contrast.implications.map((row) => ({ id: row.signalId, label: row.label, score: row.suspicionScore })),
      discriminatingTests: contrast.discriminatingTests.slice(0, 5).map((test) => test.reagentId),
    });
  }
  const matchedQcReference = form.selectedQcReferenceId ? findQcReferenceById(catalog, form.selectedQcReferenceId) : null;
  const qcAssessment = assessQcReference(matchedQcReference, form.obtainedValue);
  const procedureAssessment = assessProcedureLimitations({
    form,
    failedProfiles,
    matchedQcReference,
  });
  const bplEvidence = form.bplEvidence || null;
  const bplSignals = summarizeBplEvidenceForEngine(bplEvidence);
  const evidenceRows = [
    ...(matchedQcReference && qcAssessment ? [buildQcEvidenceRow(matchedQcReference, qcAssessment)] : []),
    ...buildLotEvidenceRows(lotIntelligence, failedProfiles.length, {
      type: 'onboard_exceeded',
      reagentIds: relationSignals.find((signal) => signal.id === 'stability:onboard')?.relatedReagentIds || [],
    }),
    ...buildBplEvidenceRows(bplEvidence),
    ...procedureAssessment.findings.map((finding) => buildProcedureEvidenceRow(finding)),
    ...buildEvidenceRows(relationSignals),
  ];
  const hypotheses: DriHypothesisResult[] = [];
  const dilutionAssessment = assessDilutionPattern(form.expectedValue, form.obtainedValue);

  // El filtro primario manda: un filtro de referencia (p. ej. 670 nm) compartido por casi todas las técnicas
  // no debe convertirse por sí solo en el impulsor de la hipótesis óptica.
  const wavelengthSignal =
    topSignal(relationSignals, 'wavelength', (signal) => !signal.id.startsWith('wavelength:ref:')) ||
    topSignal(relationSignals, 'wavelength');
  const bireactiveSignal = topSignal(relationSignals, 'scheme', (signal) => signal.id === 'scheme:bireactive');
  const monoreactiveSignal = topSignal(relationSignals, 'scheme', (signal) => signal.id === 'scheme:monoreactive');
  const temperatureSignal = topSignal(relationSignals, 'temperature');
  const washSignal = topSignal(relationSignals, 'water');
  const topTechnicalSignal = relationSignals[0];
  // Para leer el "patrón técnico dominante" se ignoran las pruebas de servicio (evalúan sistemas, no factores).
  const topRelationSignal = relationSignals.find((signal) => signal.category !== 'service') || null;
  const topRelationContrast = contrastFor(topRelationSignal);
  const weakPattern = !topTechnicalSignal || (topTechnicalSignal.suspicionScore < 46 && topRelationContrast?.verdict !== 'implicates');
  const stabilitySignal = topSignal(relationSignals, 'storage', (signal) => signal.id === 'stability:onboard');
  const r2SharedSignal = topSignal(relationSignals, 'r2');
  const abnormalPhotometry = hasAbnormalServiceTest(form, 'photometry');
  const abnormalPumps = hasAbnormalServiceTest(form, 'motors_valves_pumps');
  const abnormalThermostat = hasAbnormalServiceTest(form, 'thermostatting');
  const abnormalWash = hasAbnormalServiceTest(form, 'washing_station');
  const procedureFindings = procedureAssessment.findings.filter((item) => item.type === 'interference');
  const metrologyFindings = procedureAssessment.findings.filter((item) => item.type !== 'interference');
  const strongestProcedureFinding = procedureAssessment.findings[0] || null;
  // Hallazgos de lote que explican por sí solos una desviación (caducado en uso, blanco fuera del CoA, estabilidad
  // del lote). Igual que los factores técnicos, solo cuentan si separan fallidas de correctas; el blanco que ya
  // trae el monitor BPL no se cuenta dos veces, y un «último lote conocido» sin uso observado no castiga hardware.
  const lotContrastOf = (type: DriLotFinding['type']) => lotContrast(lotIntelligence, type, failedProfiles.length);
  const strongLotTypes: DriLotFinding['type'][] = ['expired', 'blank_out_of_coa', 'onboard_exceeded'];
  const strongestLotFinding =
    lotIntelligence?.findings.find(
      (finding) =>
        finding.outcome === 'failed' &&
        strongLotTypes.includes(finding.type) &&
        finding.score >= 66 &&
        finding.observed &&
        !finding.fromBpl &&
        // Un blanco fotométrico instrumental rechazado deja abierta la óptica aunque el blanco de reactivo esté fuera del CoA.
        !(finding.type === 'blank_out_of_coa' && bplSignals.photometryRejected) &&
        lotContrastOf(finding.type).discriminates,
    ) || null;

  if (matchedQcReference && qcAssessment) {
    logger.info('EVIDENCE', 'qc-reference', 'Se aplicó referencia QC del valuesheet al caso.', {
      referenceId: matchedQcReference.id,
      reagentId: matchedQcReference.reagentDisplayCode || matchedQcReference.reagentId,
      controlLevel: matchedQcReference.controlLevel,
      lot: matchedQcReference.lot,
      targetValue: matchedQcReference.targetValue,
      obtainedValue: qcAssessment.obtainedValue,
      band: qcAssessment.band,
      zScore: qcAssessment.zScore,
    });
  }

  if (procedureAssessment.findings.length) {
    logger.info('EVIDENCE', 'procedure-limitations', 'El IFU aporta límites metrológicos o de interferencia relevantes para el caso.', {
      findings: procedureAssessment.findings.map((item) => ({
        id: item.id,
        type: item.type,
        reagentId: item.reagentId,
        score: item.score,
        explanation: item.explanation,
      })),
    });
  }

  if (bplEvidence) {
    logger.info('EVIDENCE', 'bpl-evidence', 'Evidencia BPL del monitor incorporada al caso.', {
      serial: bplEvidence.serial,
      eventCount: bplEvidence.eventCount,
      photometryBlank: bplEvidence.stages.photometryBlank.effectiveStatus,
      reagentBlankRejected: bplSignals.reagentBlankRejectedCount,
      calibrationRejected: bplSignals.calibrationRejectedCount,
      qcRejected: bplSignals.qcRejectedCount,
      qcRejectedWithAcceptedChain: bplSignals.qcChainTests,
      westgardRules: bplEvidence.westgardRules,
      unmatchedTests: bplEvidence.unmatchedTests,
    });
  }

  if (lotIntelligence) {
    logger.info('EVIDENCE', 'lot-intelligence', 'Lotes en uso del SAT ligados a los hechos del lote en einfo.bio.', {
      lotsInUse: lotIntelligence.lotsInUse.map((lot) => ({
        reagentId: lot.reagentId,
        role: lot.role,
        outcome: lot.outcome,
        lot: lot.bottle.lot,
        productLot: lot.facts?.productLot || null,
        expiresAt: lot.expiresAt,
        expirySource: lot.expirySource,
        barcodeExpiresAt: lot.bottle.expiresAt,
        usage: lot.usage,
        daysToExpiry: lot.daysToExpiry,
        hoursOnboard: lot.hoursOnboard === null ? null : Math.round(lot.hoursOnboard),
        lotChangedDaysBefore: lot.lotChangedDaysBefore,
        ifuCode: lot.facts?.ifu?.ifuCode || null,
      })),
      findings: lotIntelligence.findings.map((finding) => ({ id: finding.id, score: finding.score, explanation: finding.explanation })),
      documentedCount: lotIntelligence.documentedCount,
      undocumentedCount: lotIntelligence.undocumentedCount,
      factsGeneratedAt: lotIntelligence.factsGeneratedAt,
    });
  }

  if (platformKnowledge.supportStatus !== 'ready') {
    logger.warn('ENGINE', 'platform-fallback', 'La plataforma está en especialización; se usará conocimiento base orientado a BA400.', {
      requestedPlatform: form.equipmentModel,
      supportStatus: platformKnowledge.supportStatus,
    });
  }

  {
    const rule = BA400_KNOWLEDGE.rules.find((item) => item.id === 'ba400_optical_photometry')!;
    const positive: DriScoreContribution[] = [];
    const negative: DriScoreContribution[] = [];
    const missingEvidence: string[] = [];
    const serviceEvidence = buildRuleServiceEvidence(form, rule);
    positive.push(...serviceEvidence.positive);
    negative.push(...serviceEvidence.negative);
    const wavelengthContrast = contrastFor(wavelengthSignal);
    if (wavelengthContrast?.verdict === 'exonerates') {
      // El filtro también lo usan las pruebas correctas: no discrimina y pierde peso, pero sigue en la lista
      // (una falla parcial puede afectar solo a algunas técnicas) hasta que Photometry/baseline lo resuelva.
      positive.push({ label: `${wavelengthContrast.failedShared.length} de ${wavelengthContrast.failedTotal} fallidas usan ${wavelengthSignal!.label}.`, points: 26 });
      negative.push({ label: wavelengthContrast.explanation, points: exonerationPoints(wavelengthContrast, 38) });
    } else {
      const sharesFilter = Boolean(wavelengthSignal) && (wavelengthSignal!.failedCoverage >= 0.6 || wavelengthContrast?.verdict === 'implicates');
      if (sharesFilter) {
        positive.push({ label: `${Math.round(wavelengthSignal!.failedCoverage * 100)}% de fallidas comparten ${wavelengthSignal!.label}.`, points: 26 });
      }
      if (wavelengthContrast?.verdict === 'implicates' || (wavelengthSignal?.correctCoverage || 0) <= 0.3) {
        positive.push({ label: 'Las pruebas correctas no comparten de forma fuerte el mismo filtro.', points: 12 });
      } else {
        negative.push({ label: 'Las pruebas correctas también usan el mismo filtro/subsistema.', points: 16 });
      }
    }
    if (form.eventType === 'absorbance_error' || form.eventType === 'failed_blank') {
      positive.push({ label: 'El tipo de problema es compatible con fotometría/absorbancia.', points: 14 });
    }
    if (bplSignals.photometryRejected) {
      positive.push({ label: 'El blanco fotométrico instrumental está rechazado en el monitor BPL.', points: 24 });
    } else if (bplSignals.photometryAccepted) {
      negative.push({ label: 'El blanco fotométrico instrumental está aceptado en el monitor BPL.', points: 10 });
    }
    if (bplSignals.reagentBlankRejectedCount >= 2) {
      positive.push({ label: `${bplSignals.reagentBlankRejectedCount} blancos de reactivo rechazados en el monitor BPL comparten la ruta óptica.`, points: 10 });
    }
    if (strongestProcedureFinding) {
      negative.push({ label: `Existe una explicación analítica más directa: ${strongestProcedureFinding.explanation}`, points: 18 });
    }
    if (strongestLotFinding) {
      negative.push({ label: `El lote en uso explica la desviación antes que la óptica: ${strongestLotFinding.title}.`, points: 16 });
    }
    if (!hasRecordedServiceTest(form, 'photometry') && !hasRecordedServiceTest(form, 'baseline_darkness_current')) {
      missingEvidence.push('Resultado de Photometry / baseline');
    }
    if (bplSignals.present && !bplSignals.photometryObserved) {
      missingEvidence.push('Blanco fotométrico instrumental reciente en el monitor BPL');
    }
    if (positive.length) {
      hypotheses.push(
        createHypothesis(
          'hyp:optical',
          rule.title,
          rule.id,
          rule.targetSubsystem,
          positive,
          negative,
          missingEvidence,
          'El patrón agrupa fallas alrededor de la misma ruta óptica o su confirmación funcional.',
          rule,
          serviceEvidence.confirmedPrimaryAbnormal,
        ),
      );
    }
  }

  {
    const rule = BA400_KNOWLEDGE.rules.find((item) => item.id === 'ba400_r2_dispensing')!;
    const positive: DriScoreContribution[] = [];
    const negative: DriScoreContribution[] = [];
    const missingEvidence: string[] = [];
    const serviceEvidence = buildRuleServiceEvidence(form, rule);
    positive.push(...serviceEvidence.positive);
    negative.push(...serviceEvidence.negative);
    const r2Contrast = contrastFor(r2SharedSignal) || contrastFor(bireactiveSignal);
    if (r2Contrast?.verdict === 'exonerates') {
      positive.push({ label: `${r2Contrast.failedShared.length} de ${r2Contrast.failedTotal} fallidas dependen de ${r2Contrast.label}.`, points: 24 });
      negative.push({ label: r2Contrast.explanation, points: exonerationPoints(r2Contrast, 24) });
    } else if ((bireactiveSignal?.failedCoverage || 0) >= 0.55) {
      positive.push({ label: 'Las fallidas se concentran en técnicas bireactivas.', points: 24 });
    }
    // El contraste con monoreactivas solo cuenta si alguna fallida depende de R2.
    if ((monoreactiveSignal?.correctCoverage || 0) >= 0.25 && ((r2SharedSignal?.failedCoverage || 0) > 0 || (bireactiveSignal?.failedCoverage || 0) > 0)) {
      positive.push({ label: 'Las monoreactivas comparables se mantienen correctas.', points: 18 });
    }
    if (bplSignals.calibrationRejectedCount > 0 && (bireactiveSignal?.failedCoverage || 0) >= 0.55) {
      positive.push({ label: 'Las calibraciones rechazadas en el monitor BPL se concentran en técnicas bireactivas.', points: 8 });
    }
    if ((monoreactiveSignal?.correctCoverage || 0) === 0) {
      missingEvidence.push('Comparativo monoreactivo equivalente');
    }
    if (form.correctReagentIds.length === 0) {
      negative.push({ label: 'Sin pruebas correctas para contrastar R2 contra monoreactivas.', points: 12 });
    }
    if (strongestProcedureFinding) {
      negative.push({ label: `La limitación IFU/analítica puede explicar la desviación sin culpar a R2: ${strongestProcedureFinding.title}.`, points: 16 });
    }
    if (strongestLotFinding) {
      negative.push({ label: `El lote en uso puede explicar la desviación sin culpar a R2: ${strongestLotFinding.title}.`, points: 14 });
    }
    if (positive.length) {
      hypotheses.push(
        createHypothesis(
          'hyp:r2',
          rule.title,
          rule.id,
          rule.targetSubsystem,
          positive,
          negative,
          missingEvidence,
          'La falla apunta a la rama de R2, mezcla o dispensación secundaria del BA400.',
          rule,
          serviceEvidence.confirmedPrimaryAbnormal,
        ),
      );
    }
  }

  {
    const rule = BA400_KNOWLEDGE.rules.find((item) => item.id === 'ba400_temperature')!;
    const positive: DriScoreContribution[] = [];
    const negative: DriScoreContribution[] = [];
    const missingEvidence: string[] = [];
    const serviceEvidence = buildRuleServiceEvidence(form, rule);
    positive.push(...serviceEvidence.positive);
    negative.push(...serviceEvidence.negative);
    const temperatureContrast = contrastFor(temperatureSignal);
    if (temperatureContrast?.verdict === 'exonerates') {
      positive.push({ label: `${temperatureContrast.failedShared.length} de ${temperatureContrast.failedTotal} fallidas son sensibles a temperatura o cinética.`, points: 20 });
      negative.push({ label: temperatureContrast.explanation, points: exonerationPoints(temperatureContrast, 20) });
    } else if ((temperatureSignal?.failedCoverage || 0) >= 0.45) {
      positive.push({ label: 'Las fallidas son sensibles a temperatura o cinética.', points: 20 });
    }
    if (Number(form.ambientTemperatureC) >= 28) {
      positive.push({ label: `La temperatura ambiente reportada (${form.ambientTemperatureC} °C) es elevada.`, points: 8 });
    }
    if (bplSignals.calibrationRejectedCount > 0 && (temperatureSignal?.failedCoverage || 0) >= 0.45) {
      positive.push({ label: 'El monitor BPL registra calibraciones rechazadas en técnicas sensibles a temperatura.', points: 8 });
    }
    if ((topSignal(relationSignals, 'reaction', (signal) => signal.id === 'reaction:endpoint')?.correctCoverage || 0) > 0.25) {
      positive.push({ label: 'Las técnicas endpoint correctas contrastan contra cinéticas sensibles.', points: 12 });
    }
    if (strongestProcedureFinding) {
      negative.push({ label: `Existe una limitación del procedimiento documentada que puede explicar el sesgo: ${strongestProcedureFinding.title}.`, points: 16 });
    }
    if (strongestLotFinding) {
      negative.push({ label: `El lote en uso puede explicar el sesgo sin termostatización: ${strongestLotFinding.title}.`, points: 14 });
    }
    if (!hasRecordedServiceTest(form, 'thermostatting')) {
      missingEvidence.push('Resultado de Thermostatting');
    }
    if (positive.length) {
      hypotheses.push(
        createHypothesis(
          'hyp:temperature',
          rule.title,
          rule.id,
          rule.targetSubsystem,
          positive,
          negative,
          missingEvidence,
          'El patrón es compatible con termostatización, estabilidad a bordo o refrigeración.',
          rule,
          serviceEvidence.confirmedPrimaryAbnormal,
        ),
      );
    }
  }

  {
    const rule = BA400_KNOWLEDGE.rules.find((item) => item.id === 'ba400_fluidics_pipetting')!;
    const positive: DriScoreContribution[] = [];
    const negative: DriScoreContribution[] = [];
    const missingEvidence: string[] = [];
    const serviceEvidence = buildRuleServiceEvidence(form, rule);
    positive.push(...serviceEvidence.positive);
    negative.push(...serviceEvidence.negative);
    if (dilutionAssessment.nonProportionalPattern) {
      positive.push({ label: dilutionAssessment.explanation || 'La dilución no mantiene proporcionalidad.', points: 28 });
    }
    if (form.eventType === 'poor_repeatability' || form.eventType === 'dilution_error') {
      positive.push({ label: 'El tipo de problema coincide con pipeteo o dilución.', points: 14 });
    }
    if (bplSignals.randomWestgardRules.length) {
      positive.push({ label: `Reglas Westgard de error aleatorio (${bplSignals.randomWestgardRules.join(', ')}) en el monitor BPL.`, points: 8 });
    }
    if (bplSignals.poorCorrelationCount >= 2) {
      positive.push({ label: `${bplSignals.poorCorrelationCount} curvas de calibración con correlación baja en el monitor BPL.`, points: 10 });
    }
    if (dilutionAssessment.exactHalfPattern) {
      negative.push({ label: 'La dilución exacta a la mitad sugiere más bien factor no aplicado por software.', points: 18 });
    }
    if (strongestProcedureFinding) {
      negative.push({ label: `Hay una explicación analítica/IFU más directa que una falla fluídica: ${strongestProcedureFinding.title}.`, points: 14 });
    }
    if (strongestLotFinding) {
      negative.push({ label: `El lote en uso ofrece una explicación más directa que una falla fluídica: ${strongestLotFinding.title}.`, points: 12 });
    }
    if (!dilutionAssessment.explanation) {
      missingEvidence.push('Resultados de linealidad / dilución 1:2, 1:4, 1:5');
    }
    if (positive.length) {
      hypotheses.push(
        createHypothesis(
          'hyp:fluidics',
          rule.title,
          rule.id,
          rule.targetSubsystem,
          positive,
          negative,
          missingEvidence,
          'La desviación se parece a una falla de pipeteo, aspiración, mezcla o línea fluídica.',
          rule,
          serviceEvidence.confirmedPrimaryAbnormal,
        ),
      );
    }
  }

  {
    const rule = BA400_KNOWLEDGE.rules.find((item) => item.id === 'ba400_software_operational')!;
    const positive: DriScoreContribution[] = [];
    const negative: DriScoreContribution[] = [];
    const missingEvidence: string[] = [];
    const serviceEvidence = buildRuleServiceEvidence(form, rule);
    positive.push(...serviceEvidence.positive);
    negative.push(...serviceEvidence.negative);
    if (dilutionAssessment.exactHalfPattern) {
      positive.push({ label: dilutionAssessment.explanation || 'El valor diluido cae exactamente a la mitad.', points: 30 });
    }
    if (form.eventType === 'dilution_error' || normalizeText(form.observations).includes('lis')) {
      positive.push({ label: 'La observación/tipo de evento sugiere configuración o reporte.', points: 16 });
    }
    if (metrologyFindings.some((item) => item.type === 'linearity')) {
      positive.push({ label: 'El valor capturado rebasa la linealidad IFU y exige revisar dilución/factor.', points: 18 });
    }
    if (abnormalPumps || hasAbnormalServiceTest(form, 'thermostatting')) {
      negative.push({ label: 'Ya existe evidencia mecánica fuerte que compite con un error operativo puro.', points: 18 });
    }
    if (!form.expectedValue || !form.obtainedValue) {
      missingEvidence.push('Valor esperado y valor obtenido para confirmar factor');
    }
    if (positive.length) {
      hypotheses.push(
        createHypothesis(
          'hyp:software',
          rule.title,
          rule.id,
          rule.targetSubsystem,
          positive,
          negative,
          missingEvidence,
          'La tendencia sugiere que el equipo diluye físicamente, pero el software o el reporte no corrigen el factor.',
          rule,
          serviceEvidence.confirmedPrimaryAbnormal,
        ),
      );
    }
  }

  {
    const rule = BA400_KNOWLEDGE.rules.find((item) => item.id === 'ba400_wash_carryover')!;
    const positive: DriScoreContribution[] = [];
    const negative: DriScoreContribution[] = [];
    const missingEvidence: string[] = [];
    const serviceEvidence = buildRuleServiceEvidence(form, rule);
    positive.push(...serviceEvidence.positive);
    negative.push(...serviceEvidence.negative);
    if (form.eventType === 'failed_blank' || form.signals.opticalRejectObserved) {
      positive.push({ label: 'El caso fue marcado como blanco/rechazo óptico.', points: 20 });
    }
    if (form.signals.intermittentPattern) {
      positive.push({ label: 'El patrón es intermitente y compatible con carryover.', points: 10 });
    }
    const washContrast = contrastFor(washSignal);
    if (washContrast?.verdict === 'exonerates') {
      positive.push({ label: `${washContrast.failedShared.length} de ${washContrast.failedTotal} fallidas son sensibles a agua o lavado.`, points: 12 });
      negative.push({ label: washContrast.explanation, points: exonerationPoints(washContrast, 12) });
    } else if ((washSignal?.failedCoverage || 0) >= 0.2) {
      positive.push({ label: 'Hay reactivos sensibles a agua/lavado entre las fallidas.', points: 12 });
    }
    if (bplSignals.reagentBlankRejectedCount > 0) {
      positive.push({ label: `${bplSignals.reagentBlankRejectedCount} blanco(s) de reactivo rechazado(s) en el monitor BPL.`, points: 18 });
      if (bplSignals.photometryAccepted) {
        positive.push({ label: 'El blanco fotométrico instrumental está aceptado: el rechazo apunta a reactivo, cubeta o lavado y no a la óptica.', points: 6 });
      }
    }
    if (bplSignals.intermittentTests.length) {
      positive.push({ label: `Patrón intermitente aceptado/rechazado en ${bplSignals.intermittentTests.slice(0, 4).join(', ')} según el monitor BPL.`, points: 6 });
    }
    if (procedureFindings.length) {
      negative.push({ label: 'La interferencia documentada por IFU compite con una causa de carryover puro.', points: 14 });
    }
    if (!hasRecordedServiceTest(form, 'washing_station')) {
      missingEvidence.push('Resultado de Washing station / carryover');
    }
    if (positive.length) {
      hypotheses.push(
        createHypothesis(
          'hyp:wash',
          rule.title,
          rule.id,
          rule.targetSubsystem,
          positive,
          negative,
          missingEvidence,
          'La evidencia apunta a lavado, carryover, contaminación o cubeta local.',
          rule,
          serviceEvidence.confirmedPrimaryAbnormal,
        ),
      );
    }
  }

  {
    const rule = BA400_KNOWLEDGE.rules.find((item) => item.id === 'ba400_control_preanalytical')!;
    const positive: DriScoreContribution[] = [];
    const negative: DriScoreContribution[] = [];
    const missingEvidence: string[] = [];
    const serviceEvidence = buildRuleServiceEvidence(form, rule);
    positive.push(...serviceEvidence.positive);
    negative.push(...serviceEvidence.negative);
    if (weakPattern) {
      positive.push({ label: 'No hay un patrón técnico común dominante entre las fallidas.', points: 22 });
    } else if (topRelationSignal && isExonerated(topRelationSignal)) {
      positive.push({
        label: `El factor técnico dominante (${topRelationSignal.label}) también lo comparten las pruebas correctas: el contraste apunta a control, lote o preanalítica antes que al hardware.`,
        points: 22,
      });
    }
    // Estabilidad a bordo capturada a mano: si el SAT muestra que las correctas también la exceden, no separa.
    const satOnboardContrast = lotIntelligence ? lotContrastOf('onboard_exceeded') : null;
    // Basta con el lado de las correctas: la fecha capturada a mano cubre a las fallidas aunque el SAT no las vea.
    const satOnboardShared = Boolean(satOnboardContrast?.correctObserved && satOnboardContrast.correctCoverage >= 0.5);
    if ((stabilitySignal?.failedCoverage || 0) >= 0.5) {
      if (satOnboardShared) {
        negative.push({ label: `${stabilitySignal!.label}, pero el SAT muestra que las pruebas correctas también exceden la estabilidad a bordo: no separa fallidas de correctas.`, points: 6 });
      } else {
        positive.push({ label: `${stabilitySignal!.label}: el reactivo lleva abierto más tiempo del que admite su IFU; revisar lote y estabilidad antes del hardware.`, points: 18 });
      }
    }
    if (lotIntelligence) {
      const failedFindings = (type: DriLotFinding['type'], observedOnly = true) =>
        lotIntelligence.findings.filter((finding) => finding.outcome === 'failed' && finding.type === type && (!observedOnly || finding.observed));
      const describe = (type: DriLotFinding['type'], observedOnly = true) =>
        failedFindings(type, observedOnly)
          .map((finding) => `${finding.reagentCode} ${finding.role} ${finding.lot}`)
          .filter((label, index, list) => list.indexOf(label) === index)
          .slice(0, 4)
          .join(', ');
      const percent = (value: number) => `${Math.round(value * 100)}%`;
      const addMissing = (item: string) => {
        if (!missingEvidence.includes(item)) missingEvidence.push(item);
      };
      const noCorrectLots = 'Lotes de las pruebas correctas en el SAT (para contrastar el lote de las fallidas)';
      const counts = (contrast: { failedCoverage: number; sharedWithCorrect: boolean }) => contrast.failedCoverage >= 0.5 && !contrast.sharedWithCorrect;

      const expired = lotContrastOf('expired');
      if (counts(expired)) {
        positive.push({ label: `Lote caducado en uso en ${percent(expired.failedCoverage)} de las fallidas (${describe('expired')}): la desviación tiene causa de lote antes que de hardware.`, points: 26 });
        if (expired.discriminates && expired.correctCoverage === 0) {
          positive.push({ label: 'Ninguna prueba correcta evaluada en el SAT trabaja con lote caducado: el contraste señala al lote.', points: 8 });
        } else if (!expired.correctObserved) {
          addMissing(noCorrectLots);
        }
      } else if (expired.sharedWithCorrect) {
        negative.push({ label: 'Las pruebas correctas también trabajan con lote caducado: la caducidad no separa fallidas de correctas.', points: 6 });
      } else {
        const lastKnown = new Set(failedFindings('expired', false).filter((finding) => !finding.observed).map((finding) => finding.reagentId));
        if (failedProfiles.length && lastKnown.size / failedProfiles.length >= 0.5) {
          positive.push({ label: `El último lote registrado de ${percent(lastKnown.size / failedProfiles.length)} de las fallidas está caducado (${describe('expired', false)}): confirmar el lote cargado el día del evento.`, points: 12 });
          addMissing('Lote cargado el día del evento (el SAT termina antes)');
        }
      }

      const blank = lotContrastOf('blank_out_of_coa');
      if (counts(blank)) {
        const onlyBpl = failedFindings('blank_out_of_coa').every((finding) => finding.fromBpl);
        positive.push(
          onlyBpl
            ? { label: `El blanco rechazado en el monitor BPL también queda fuera del límite del certificado del lote (${describe('blank_out_of_coa')}): compatible con deterioro del reactivo.`, points: 10 }
            : { label: `Blanco de reactivo fuera del límite del certificado del lote (${describe('blank_out_of_coa')}): deterioro del reactivo según IFU.`, points: 22 },
        );
        if (!blank.correctObserved) addMissing('Blanco de reactivo de una prueba correcta (para contrastar el blanco fuera del certificado)');
      }

      // La estabilidad capturada a mano ya suma arriba; la del SAT solo suma si aquella no cubre a la mayoría.
      const onboard = lotContrastOf('onboard_exceeded');
      if (counts(onboard) && (stabilitySignal?.failedCoverage || 0) < 0.5) {
        positive.push({ label: `Estabilidad a bordo del IFU del lote excedida (${describe('onboard_exceeded')}).`, points: 16 });
        if (!onboard.correctObserved) addMissing(noCorrectLots);
      }

      const lotChange = lotContrastOf('lot_change');
      if (counts(lotChange)) {
        // Si el monitor BPL ya muestra una calibración aceptada de esas pruebas después del cambio, el requisito del IFU se cumplió.
        const changed = lotIntelligence.lotsInUse.filter((lot) => lot.outcome === 'failed' && lot.findings.some((finding) => finding.type === 'lot_change' && finding.observed));
        // Misma clave canónica que las botellas (GLU/GLUCOSA, CRP/PROTEINA_C) y entre el cambio y el fin del día del evento.
        const keyOf = (reagentId: string | null) => {
          const reagent = reagentId ? catalog.reagents.find((item) => item.id === reagentId) : null;
          return reagent ? reagentMatchKey(reagent) : reagentId;
        };
        const eventEnd = localDayEndMs(form.eventDate);
        const calibratedAfter = changed.filter((lot) => {
          const lotKey = lot.bottle.reagentKey || keyOf(lot.reagentId);
          const changedAt = parseInstantMs(lot.runStartedAt);
          return (bplEvidence?.calibrations || []).some((calibration) => {
            const at = parseInstantMs(calibration.observedAt);
            return (
              (calibration.reagentId === lot.reagentId || keyOf(calibration.reagentId) === lotKey) &&
              /accept/i.test(calibration.status) &&
              Number.isFinite(at) &&
              Number.isFinite(changedAt) &&
              at >= changedAt &&
              (!Number.isFinite(eventEnd) || at <= eventEnd)
            );
          });
        });
        if (changed.length && calibratedAfter.length === changed.length) {
          negative.push({ label: `Cambio de lote reciente (${describe('lot_change')}), pero el monitor BPL muestra una calibración aceptada después del cambio.`, points: 4 });
        } else {
          positive.push({ label: `Cambio de lote reciente solo en las fallidas (${describe('lot_change')}): el IFU exige calibrar tras cambiar de lote.`, points: 16 });
          addMissing('Calibración aceptada después del cambio de lote');
          if (!lotChange.correctObserved) addMissing(noCorrectLots);
        }
      } else if (lotChange.sharedWithCorrect) {
        negative.push({ label: 'Las pruebas correctas también cambiaron de lote hace poco: el cambio de lote no discrimina.', points: 6 });
      }
    }
    if (form.signals.normalCurvesObserved) {
      positive.push({ label: 'Se observaron curvas normales pese a la desviación analítica.', points: 12 });
    }
    if (['qc_out_of_range', 'control_low', 'control_high', 'failed_calibration'].includes(form.eventType)) {
      positive.push({ label: 'El tipo de evento es compatible con control/calibrador/preanalítico.', points: 16 });
    }
    if (bplSignals.qcChainTests.length) {
      positive.push({ label: `QC fuera de control con blanco y calibración aceptados en ${bplSignals.qcChainTests.slice(0, 5).join(', ')}: la desviación apunta a control, lote o preanalítica.`, points: 22 });
    }
    if (bplSignals.calibrationRejectedCount > 0 && bplSignals.reagentBlankRejectedCount === 0) {
      positive.push({ label: 'Calibraciones rechazadas con blancos aceptados en el monitor BPL: revisar calibrador y lote antes del hardware.', points: 12 });
    }
    if (bplSignals.systematicWestgardRules.length) {
      positive.push({ label: `Reglas Westgard sistemáticas (${bplSignals.systematicWestgardRules.join(', ')}) sugieren sesgo de calibrador o control.`, points: 10 });
    }
    if (bplSignals.photometryRejected) {
      negative.push({ label: 'El blanco fotométrico instrumental rechazado compite con una causa preanalítica.', points: 12 });
    }
    if (!bplSignals.present && form.equipmentModel === 'BA400') {
      missingEvidence.push('Evidencia BPL del monitor (blancos, calibraciones y QC del equipo)');
    }
    if (qcAssessment?.band === 'out_of_reject') {
      positive.push({ label: 'El valuesheet confirma que el control cayó fuera del límite de rechazo.', points: 16 });
    } else if (qcAssessment?.band === 'near_reject') {
      positive.push({ label: 'El resultado ya rebasó 2SD y quedó muy cerca del rechazo.', points: 10 });
    } else if (qcAssessment?.band === 'within_1s' || qcAssessment?.band === 'within_2s') {
      negative.push({ label: 'La referencia QC aplicada no confirma rechazo todavía.', points: 16 });
    }
    if (((wavelengthSignal?.failedCoverage || 0) >= 0.6 && !isExonerated(wavelengthSignal)) || abnormalPhotometry || abnormalPumps || abnormalThermostat) {
      negative.push({ label: 'Existe una señal mecánica más fuerte que compite con una causa preanalítica.', points: 18 });
    }
    if (!form.controlLot && !form.calibratorLot) {
      missingEvidence.push('Lote de control/calibrador');
    }
    if (['qc_out_of_range', 'control_low', 'control_high'].includes(form.eventType) && !matchedQcReference) {
      missingEvidence.push('Referencia QC / valuesheet aplicada');
    }
    if (positive.length) {
      hypotheses.push(
        createHypothesis(
          'hyp:control',
          rule.title,
          rule.id,
          rule.targetSubsystem,
          positive,
          negative,
          missingEvidence,
          'Antes de tocar hardware, el caso exige descartar control, calibrador, preparación o error operativo.',
          rule,
          serviceEvidence.confirmedPrimaryAbnormal,
        ),
      );
    }
  }

  {
    const rule = BA400_KNOWLEDGE.rules.find((item) => item.id === 'ba400_procedure_limitation_interference')!;
    const positive: DriScoreContribution[] = [];
    const negative: DriScoreContribution[] = [];
    const missingEvidence: string[] = [];
    const serviceEvidence = buildRuleServiceEvidence(form, rule);
    positive.push(...serviceEvidence.positive);
    negative.push(...serviceEvidence.negative);

    procedureFindings.forEach((finding, index) => {
      positive.push({
        label: finding.explanation,
        points: index === 0 ? 30 : 16,
      });
    });

    if (!procedureFindings.length && /bilirrubina|hem[oó]lisis|hemoglobina|lipemia|triglic[eé]ridos/i.test(form.observations || '')) {
      missingEvidence.push('Verificar unidad y umbral IFU del posible interferente');
    }

    if (abnormalPhotometry || abnormalPumps || abnormalThermostat || abnormalWash) {
      negative.push({ label: 'Sí existe evidencia funcional anormal en utilidades del equipo que compite con una explicación puramente interferencial.', points: 16 });
    }

    if (positive.length) {
      hypotheses.push(
        createHypothesis(
          'hyp:procedure-limitation',
          rule.title,
          rule.id,
          rule.targetSubsystem,
          positive,
          negative,
          missingEvidence,
          'El IFU del reactivo documenta una limitación del procedimiento o interferencia que puede explicar el sesgo analítico.',
          rule,
          serviceEvidence.confirmedPrimaryAbnormal,
        ),
      );
    }
  }

  {
    const rule = BA400_KNOWLEDGE.rules.find((item) => item.id === 'ba400_metrology_range')!;
    const positive: DriScoreContribution[] = [];
    const negative: DriScoreContribution[] = [];
    const missingEvidence: string[] = [];
    const serviceEvidence = buildRuleServiceEvidence(form, rule);
    positive.push(...serviceEvidence.positive);
    negative.push(...serviceEvidence.negative);

    metrologyFindings.forEach((finding, index) => {
      positive.push({
        label: finding.explanation,
        points: index === 0 ? 28 : 14,
      });
    });

    if ((form.failedReagentIds.length === 1 || matchedQcReference) && !metrologyFindings.length && form.obtainedValue) {
      missingEvidence.push('Unidad del resultado capturado para compararla con LOD/LOQ/linealidad IFU');
    }

    if (abnormalPumps || abnormalPhotometry) {
      negative.push({ label: 'Existe evidencia funcional anormal que compite con una causa puramente metrológica.', points: 14 });
    }

    if (positive.length) {
      hypotheses.push(
        createHypothesis(
          'hyp:metrology-range',
          rule.title,
          rule.id,
          rule.targetSubsystem,
          positive,
          negative,
          missingEvidence,
          'El valor capturado exige revisar rango metrológico, linealidad y dilución antes de concluir una falla del equipo.',
          rule,
          serviceEvidence.confirmedPrimaryAbnormal,
        ),
      );
    }
  }

  const rankedHypotheses = hypotheses
    .sort((left, right) => right.probabilityScore - left.probabilityScore)
    .slice(0, 8);

  const topSubsystems = rankSubsystems(
    rankedHypotheses.map((hypothesis) => ({
      subsystem: hypothesis.suspectedSubsystem,
      score: hypothesis.probabilityScore,
    })),
  );

  const missingEvidence = Array.from(
    new Set(rankedHypotheses.flatMap((hypothesis) => hypothesis.missingEvidence)),
  ).filter(Boolean);

  logger.success('ENGINE', 'output', 'Diagnóstico diferencial generado.', {
    hypothesisCount: rankedHypotheses.length,
    topHypotheses: rankedHypotheses.slice(0, 5).map((hypothesis) => ({
      key: hypothesis.key,
      title: hypothesis.title,
      probabilityScore: hypothesis.probabilityScore,
      confidenceScore: hypothesis.confidenceScore,
      subsystem: hypothesis.suspectedSubsystem,
      serviceScriptIds:
        Array.isArray(hypothesis.payload.serviceScriptIds) ? hypothesis.payload.serviceScriptIds : [],
    })),
    missingEvidence,
  });

  return {
    runId,
    platform: form.equipmentModel,
    factorAggregates,
    relationSignals,
    evidenceRows,
    hypotheses: rankedHypotheses,
    topSubsystems,
    missingEvidence,
    logs,
    matchedQcReference,
    qcAssessment,
    contrast,
    lotIntelligence,
  };
}
