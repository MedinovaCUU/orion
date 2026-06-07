import { roundDri } from '../utils/relationUtils';
import type { DriSeverity } from '../types/dri.types';

export interface DriScoreContribution {
  label: string;
  points: number;
}

export interface DriScoredBundle {
  probabilityScore: number;
  confidenceScore: number;
  severity: DriSeverity;
  explanationText: string;
}

export const resolveProbabilityLabel = (score: number) => {
  if (score >= 85) {
    return 'Muy alta';
  }
  if (score >= 70) {
    return 'Alta';
  }
  if (score >= 55) {
    return 'Media';
  }
  return 'Baja';
};

export const scoreHypothesis = (
  title: string,
  positive: DriScoreContribution[],
  negative: DriScoreContribution[],
  missingEvidence: string[],
): DriScoredBundle => {
  const positiveScore = positive.reduce((sum, item) => sum + item.points, 0);
  const negativeScore = negative.reduce((sum, item) => sum + item.points, 0);
  const probabilityScore = Math.max(0, Math.min(100, roundDri(28 + positiveScore - negativeScore)));
  const confidencePenalty = missingEvidence.length * 8 + (negative.length > positive.length ? 8 : 0);
  const confidenceScore = Math.max(20, Math.min(100, roundDri(42 + positiveScore * 0.88 - confidencePenalty)));
  const severity: DriSeverity =
    probabilityScore >= 86 ? 'critical' : probabilityScore >= 72 ? 'high' : probabilityScore >= 55 ? 'medium' : 'low';
  const explanationText = `${title}: ${positive.length} evidencia(s) a favor, ${negative.length} en contra y ${missingEvidence.length} dato(s) faltante(s).`;
  return {
    probabilityScore,
    confidenceScore,
    severity,
    explanationText,
  };
};
