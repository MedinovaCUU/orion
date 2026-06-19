import { A15_KNOWLEDGE } from '../knowledge/a15.rules';
import { BA200_KNOWLEDGE } from '../knowledge/ba200.rules';
import { BA400_KNOWLEDGE } from '../knowledge/ba400.rules';
import { buildReagentProfiles } from '../knowledge/reagentRelations';
import { buildFactorAggregates, buildRelationSignals } from './evidenceMapper';
import { buildHypothesisRecommendation, rankSubsystems } from './recommendationEngine';
import { resolveProbabilityLabel, scoreHypothesis, type DriScoreContribution } from './scoringEngine';
import { createDriLogger } from '../utils/driLogging';
import { assessDilutionPattern } from '../utils/dilutionUtils';
import { assessProcedureLimitations } from '../utils/procedureLimitations';
import { assessQcReference, findQcReferenceById } from '../utils/qcReferenceUtils';
import { normalizeText } from '../utils/relationUtils';
import type {
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

const hasNormalServiceTest = (form: DriCaseFormState, utilityId: string) =>
  form.serviceTests.some((test) => test.utilityId === utilityId && (test.result === 'normal' || test.result === 'passed'));

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
  const serviceScriptIds = Array.from(
    new Set(rule.checklist.flatMap((step) => step.serviceScriptIds || [])),
  );
  return buildHypothesisRecommendation(
    {
      key,
      title,
      score: scoring.probabilityScore,
      probabilityScore: scoring.probabilityScore,
      confidenceScore: scoring.confidenceScore,
      severity: scoring.severity,
      probabilityLabel: resolveProbabilityLabel(scoring.probabilityScore),
      status: 'generated',
      suspectedSubsystem,
      explanation: `${explanation} ${scoring.explanationText}`,
      evidenceFor: positive.map((item) => item.label),
      evidenceAgainst: negative.map((item) => item.label),
      recommendedNextTest: rule.checklist[0]?.title || null,
      invasivenessLevel:
        scoring.probabilityScore >= 86 && serviceTestAbnormal
          ? 'possible_part'
          : scoring.probabilityScore >= 70
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
  const failedProfiles = form.failedReagentIds
    .map((id) => profileById.get(id))
    .filter((profile): profile is DriReagentProfile => Boolean(profile));
  const correctProfiles = form.correctReagentIds
    .map((id) => profileById.get(id))
    .filter((profile): profile is DriReagentProfile => Boolean(profile));

  logger.info('ENGINE', 'input', 'Caso recibido por el motor diferencial.', {
    platform: form.equipmentModel,
    failed: failedProfiles.map((profile) => profile.id),
    correct: correctProfiles.map((profile) => profile.id),
    serviceTests: form.serviceTests.map((test) => ({ utilityId: test.utilityId, result: test.result })),
    selectedQcReferenceId: form.selectedQcReferenceId || null,
  });

  const factorAggregates = buildFactorAggregates(catalog, failedProfiles, correctProfiles, runId, form.equipmentModel, logs);
  const relationSignals = buildRelationSignals(form, failedProfiles, correctProfiles, factorAggregates, runId, form.equipmentModel, logs);
  const matchedQcReference = form.selectedQcReferenceId ? findQcReferenceById(catalog, form.selectedQcReferenceId) : null;
  const qcAssessment = assessQcReference(matchedQcReference, form.obtainedValue);
  const procedureAssessment = assessProcedureLimitations({
    form,
    failedProfiles,
    matchedQcReference,
  });
  const evidenceRows = [
    ...(matchedQcReference && qcAssessment ? [buildQcEvidenceRow(matchedQcReference, qcAssessment)] : []),
    ...procedureAssessment.findings.map((finding) => buildProcedureEvidenceRow(finding)),
    ...buildEvidenceRows(relationSignals),
  ];
  const hypotheses: DriHypothesisResult[] = [];
  const dilutionAssessment = assessDilutionPattern(form.expectedValue, form.obtainedValue);

  const wavelengthSignal = topSignal(relationSignals, 'wavelength');
  const bireactiveSignal = topSignal(relationSignals, 'scheme', (signal) => signal.id === 'scheme:bireactive');
  const monoreactiveSignal = topSignal(relationSignals, 'scheme', (signal) => signal.id === 'scheme:monoreactive');
  const temperatureSignal = topSignal(relationSignals, 'temperature');
  const washSignal = topSignal(relationSignals, 'water');
  const topTechnicalSignal = relationSignals[0];
  const weakPattern = !topTechnicalSignal || topTechnicalSignal.suspicionScore < 46;
  const abnormalPhotometry = hasAbnormalServiceTest(form, 'photometry');
  const abnormalPumps = hasAbnormalServiceTest(form, 'motors_valves_pumps');
  const abnormalThermostat = hasAbnormalServiceTest(form, 'thermostatting');
  const abnormalWash = hasAbnormalServiceTest(form, 'washing_station');
  const normalPhotometry = hasNormalServiceTest(form, 'photometry');
  const procedureFindings = procedureAssessment.findings.filter((item) => item.type === 'interference');
  const metrologyFindings = procedureAssessment.findings.filter((item) => item.type !== 'interference');
  const strongestProcedureFinding = procedureAssessment.findings[0] || null;

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
    if (wavelengthSignal?.failedCoverage && wavelengthSignal.failedCoverage >= 0.6) {
      positive.push({ label: `${Math.round(wavelengthSignal.failedCoverage * 100)}% de fallidas comparten ${wavelengthSignal.label}.`, points: 26 });
    }
    if ((wavelengthSignal?.correctCoverage || 0) <= 0.3) {
      positive.push({ label: 'Las pruebas correctas no comparten de forma fuerte el mismo filtro.', points: 12 });
    } else {
      negative.push({ label: 'Las pruebas correctas también usan el mismo filtro/subsistema.', points: 16 });
    }
    if (abnormalPhotometry) {
      positive.push({ label: 'Photometry fue capturado como anormal.', points: 30 });
    }
    if (normalPhotometry) {
      negative.push({ label: 'Photometry salió normal en las utilidades de servicio.', points: 14 });
    }
    if (form.eventType === 'absorbance_error' || form.eventType === 'failed_blank') {
      positive.push({ label: 'El tipo de problema es compatible con fotometría/absorbancia.', points: 14 });
    }
    if (strongestProcedureFinding) {
      negative.push({ label: `Existe una explicación analítica más directa: ${strongestProcedureFinding.explanation}`, points: 18 });
    }
    if (!abnormalPhotometry) {
      missingEvidence.push('Resultado de Photometry / baseline');
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
          abnormalPhotometry,
        ),
      );
    }
  }

  {
    const rule = BA400_KNOWLEDGE.rules.find((item) => item.id === 'ba400_r2_dispensing')!;
    const positive: DriScoreContribution[] = [];
    const negative: DriScoreContribution[] = [];
    const missingEvidence: string[] = [];
    if ((bireactiveSignal?.failedCoverage || 0) >= 0.55) {
      positive.push({ label: 'Las fallidas se concentran en técnicas bireactivas.', points: 24 });
    }
    if ((monoreactiveSignal?.correctCoverage || 0) >= 0.25) {
      positive.push({ label: 'Las monoreactivas comparables se mantienen correctas.', points: 18 });
    }
    if (abnormalPumps) {
      positive.push({ label: 'Motors, valves and pumps mostró una anomalía.', points: 24 });
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
          abnormalPumps,
        ),
      );
    }
  }

  {
    const rule = BA400_KNOWLEDGE.rules.find((item) => item.id === 'ba400_temperature')!;
    const positive: DriScoreContribution[] = [];
    const negative: DriScoreContribution[] = [];
    const missingEvidence: string[] = [];
    if ((temperatureSignal?.failedCoverage || 0) >= 0.45) {
      positive.push({ label: 'Las fallidas son sensibles a temperatura o cinética.', points: 20 });
    }
    if (abnormalThermostat) {
      positive.push({ label: 'Thermostatting fue capturado como anormal.', points: 28 });
    }
    if (Number(form.ambientTemperatureC) >= 28) {
      positive.push({ label: `La temperatura ambiente reportada (${form.ambientTemperatureC} °C) es elevada.`, points: 8 });
    }
    if ((topSignal(relationSignals, 'reaction', (signal) => signal.id === 'reaction:endpoint')?.correctCoverage || 0) > 0.25) {
      positive.push({ label: 'Las técnicas endpoint correctas contrastan contra cinéticas sensibles.', points: 12 });
    }
    if (strongestProcedureFinding) {
      negative.push({ label: `Existe una limitación del procedimiento documentada que puede explicar el sesgo: ${strongestProcedureFinding.title}.`, points: 16 });
    }
    if (!abnormalThermostat) {
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
          'El patrón es compatible con termostatización, estabilidad abordo o refrigeración.',
          rule,
          abnormalThermostat,
        ),
      );
    }
  }

  {
    const rule = BA400_KNOWLEDGE.rules.find((item) => item.id === 'ba400_fluidics_pipetting')!;
    const positive: DriScoreContribution[] = [];
    const negative: DriScoreContribution[] = [];
    const missingEvidence: string[] = [];
    if (dilutionAssessment.nonProportionalPattern) {
      positive.push({ label: dilutionAssessment.explanation || 'La dilución no mantiene proporcionalidad.', points: 28 });
    }
    if (abnormalPumps) {
      positive.push({ label: 'Motors, valves and pumps confirmó una anomalía.', points: 24 });
    }
    if (hasAbnormalServiceTest(form, 'level_detection')) {
      positive.push({ label: 'Level detection fue anormal.', points: 18 });
    }
    if (form.eventType === 'poor_repeatability' || form.eventType === 'dilution_error') {
      positive.push({ label: 'El tipo de problema coincide con pipeteo o dilución.', points: 14 });
    }
    if (dilutionAssessment.exactHalfPattern) {
      negative.push({ label: 'La dilución exacta a la mitad sugiere más bien factor no aplicado por software.', points: 18 });
    }
    if (strongestProcedureFinding) {
      negative.push({ label: `Hay una explicación analítica/IFU más directa que una falla fluídica: ${strongestProcedureFinding.title}.`, points: 14 });
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
          abnormalPumps || hasAbnormalServiceTest(form, 'level_detection'),
        ),
      );
    }
  }

  {
    const rule = BA400_KNOWLEDGE.rules.find((item) => item.id === 'ba400_software_operational')!;
    const positive: DriScoreContribution[] = [];
    const negative: DriScoreContribution[] = [];
    const missingEvidence: string[] = [];
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
          false,
        ),
      );
    }
  }

  {
    const rule = BA400_KNOWLEDGE.rules.find((item) => item.id === 'ba400_wash_carryover')!;
    const positive: DriScoreContribution[] = [];
    const negative: DriScoreContribution[] = [];
    const missingEvidence: string[] = [];
    if (form.eventType === 'failed_blank' || form.signals.opticalRejectObserved) {
      positive.push({ label: 'El caso fue marcado como blanco/rechazo óptico.', points: 20 });
    }
    if (form.signals.intermittentPattern) {
      positive.push({ label: 'El patrón es intermitente y compatible con carryover.', points: 10 });
    }
    if ((washSignal?.failedCoverage || 0) >= 0.2) {
      positive.push({ label: 'Hay reactivos sensibles a agua/lavado entre las fallidas.', points: 12 });
    }
    if (abnormalWash) {
      positive.push({ label: 'Washing station fue capturada como anormal.', points: 26 });
    }
    if (procedureFindings.length) {
      negative.push({ label: 'La interferencia documentada por IFU compite con una causa de carryover puro.', points: 14 });
    }
    if (!abnormalWash) {
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
          abnormalWash,
        ),
      );
    }
  }

  {
    const rule = BA400_KNOWLEDGE.rules.find((item) => item.id === 'ba400_control_preanalytical')!;
    const positive: DriScoreContribution[] = [];
    const negative: DriScoreContribution[] = [];
    const missingEvidence: string[] = [];
    if (weakPattern) {
      positive.push({ label: 'No hay un patrón técnico común dominante entre las fallidas.', points: 22 });
    }
    if (form.signals.normalCurvesObserved) {
      positive.push({ label: 'Se observaron curvas normales pese a la desviación analítica.', points: 12 });
    }
    if (['qc_out_of_range', 'control_low', 'control_high', 'failed_calibration'].includes(form.eventType)) {
      positive.push({ label: 'El tipo de evento es compatible con control/calibrador/preanalítico.', points: 16 });
    }
    if (qcAssessment?.band === 'out_of_reject') {
      positive.push({ label: 'El valuesheet confirma que el control cayó fuera del límite de rechazo.', points: 16 });
    } else if (qcAssessment?.band === 'near_reject') {
      positive.push({ label: 'El resultado ya rebasó 2SD y quedó muy cerca del rechazo.', points: 10 });
    } else if (qcAssessment?.band === 'within_1s' || qcAssessment?.band === 'within_2s') {
      negative.push({ label: 'La referencia QC aplicada no confirma rechazo todavía.', points: 16 });
    }
    if ((wavelengthSignal?.failedCoverage || 0) >= 0.6 || abnormalPhotometry || abnormalPumps || abnormalThermostat) {
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
          false,
        ),
      );
    }
  }

  {
    const rule = BA400_KNOWLEDGE.rules.find((item) => item.id === 'ba400_procedure_limitation_interference')!;
    const positive: DriScoreContribution[] = [];
    const negative: DriScoreContribution[] = [];
    const missingEvidence: string[] = [];

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
          false,
        ),
      );
    }
  }

  {
    const rule = BA400_KNOWLEDGE.rules.find((item) => item.id === 'ba400_metrology_range')!;
    const positive: DriScoreContribution[] = [];
    const negative: DriScoreContribution[] = [];
    const missingEvidence: string[] = [];

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
          false,
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
  };
}
