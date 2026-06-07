import type {
  DriDiagnosticRuleDefinition,
  DriHypothesisResult,
  DriMechanicalSubsystemId,
} from '../types/dri.types';

export const shouldSuggestParts = (
  probabilityScore: number,
  confidenceScore: number,
  serviceTestAbnormal: boolean,
) => probabilityScore >= 86 && confidenceScore >= 74 && serviceTestAbnormal;

export const buildHypothesisRecommendation = (
  base: Omit<DriHypothesisResult, 'candidateParts' | 'warningText' | 'serviceUtilities' | 'checklist' | 'confirmatoryActions' | 'correctiveActions'>,
  rule: DriDiagnosticRuleDefinition,
  serviceTestAbnormal: boolean,
  missingEvidence: string[],
): DriHypothesisResult => ({
  ...base,
  serviceUtilities: rule.serviceUtilities,
  checklist: rule.checklist,
  confirmatoryActions: rule.confirmatoryActions,
  correctiveActions: rule.correctiveActions,
  candidateParts: shouldSuggestParts(base.probabilityScore, base.confidenceScore, serviceTestAbnormal)
    ? rule.candidateParts
    : [],
  warningText:
    shouldSuggestParts(base.probabilityScore, base.confidenceScore, serviceTestAbnormal) || rule.candidateParts.length === 0
      ? missingEvidence.length
        ? `Falta evidencia: ${missingEvidence.join(', ')}.`
        : null
      : 'No recomendar cambio de piezas hasta ejecutar pruebas confirmatorias y documentar un resultado anormal.',
});

export const rankSubsystems = (rows: Array<{ subsystem: DriMechanicalSubsystemId | string; score: number }>) =>
  [...rows]
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);
