import type {
  DriEquipmentModel,
  DriFactorAggregate,
  DriKnowledgeField,
  DriKnowledgeStatus,
  DriReagentProfile,
  NumericLike,
} from '../types/dri.types';

export const roundDri = (value: number, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export const normalizeText = (value?: string | null) => (value || '').trim().toLowerCase();

export const readNumericValue = (value: NumericLike) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

export const countCoverage = (count: number, total: number) => (total > 0 ? roundDri(count / total, 3) : 0);

export const maxCoverage = (aggregates: DriFactorAggregate[], ids: Set<string>, key: 'failedCoverage' | 'correctCoverage') =>
  aggregates
    .filter((aggregate) => ids.has(aggregate.factorId))
    .reduce((max, aggregate) => Math.max(max, aggregate[key]), 0);

export const buildKnowledgeField = <T,>(
  value: T,
  status: DriKnowledgeStatus,
  sourceReference: string,
  sourceType: DriKnowledgeField<T>['sourceType'],
  confidence: DriKnowledgeField<T>['confidence'],
): DriKnowledgeField<T> => ({
  value,
  status,
  sourceReference,
  sourceType,
  confidence,
});

export const platformSupportsProfile = (profile: DriReagentProfile, model: DriEquipmentModel) =>
  profile.platforms.value.length === 0 || profile.platforms.value.includes(model);

export const collectProfileIds = (profiles: DriReagentProfile[]) => profiles.map((profile) => profile.id);
