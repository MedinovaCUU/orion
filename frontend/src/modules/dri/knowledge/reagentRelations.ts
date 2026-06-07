import type {
  DriCatalog,
  DriConfidence,
  DriEquipmentModel,
  DriKnowledgeStatus,
  DriMechanicalSubsystemId,
  DriReactionKind,
  DriReagentProfile,
  DriReagentScheme,
  DriSourceType,
} from '../types/dri.types';
import { DRI_ENZYMATIC_KEYWORDS } from './diagnosticPatterns';
import { buildKnowledgeField, normalizeText } from '../utils/relationUtils';

const inferReactionKind = (method: string): DriReactionKind => {
  const normalized = normalizeText(method);
  if (normalized.includes('kinet') || normalized.includes('cinética') || normalized.includes('cinetica')) {
    return 'kinetic';
  }
  if (normalized.includes('turbid')) {
    return 'turbidimetric';
  }
  if (normalized.includes('ise')) {
    return 'ise';
  }
  if (normalized.includes('punto final') || normalized.includes('tiempo fijo') || normalized.includes('diferencial')) {
    return 'endpoint';
  }
  return 'other';
};

const inferScheme = (reagentType: string): DriReagentScheme => {
  const normalized = normalizeText(reagentType);
  if (normalized.includes('monoreact')) {
    return 'monoreactive';
  }
  if (normalized.includes('bireact')) {
    return 'bireactive';
  }
  if (normalized.includes('multir')) {
    return 'multireactive';
  }
  if (normalized.includes('variable')) {
    return 'variable';
  }
  return 'unknown';
};

const inferPlatforms = (reportedMethod: string, reagentType: string): DriEquipmentModel[] => {
  const text = `${reportedMethod} ${reagentType}`.toUpperCase();
  if (text.includes('A15') || text.includes('BA200') || text.includes('BA400')) {
    const platforms: DriEquipmentModel[] = [];
    if (text.includes('BA400') || text.includes('BA:')) {
      platforms.push('BA400');
    }
    if (text.includes('BA200')) {
      platforms.push('BA200');
    }
    if (text.includes('A15')) {
      platforms.push('A15');
    }
    return platforms.length ? platforms : ['BA400'];
  }
  return ['BA400'];
};

const inferSubsystems = (reactionKind: DriReactionKind, scheme: DriReagentScheme, wavelength: number | null): DriMechanicalSubsystemId[] => {
  const subsystems = new Set<DriMechanicalSubsystemId>(['sample_arm', 'reaction_rotor']);
  if (wavelength) {
    subsystems.add('optical_system');
  }
  if (scheme === 'monoreactive' || scheme === 'bireactive' || scheme === 'multireactive' || scheme === 'variable') {
    subsystems.add('reagent_arm_r1');
    subsystems.add('fluidics');
  }
  if (scheme === 'bireactive' || scheme === 'multireactive' || scheme === 'variable') {
    subsystems.add('reagent_arm_r2');
    subsystems.add('stirrer');
  }
  if (reactionKind === 'kinetic' || reactionKind === 'turbidimetric') {
    subsystems.add('stirrer');
    subsystems.add('wash_station');
  }
  if (reactionKind === 'ise') {
    subsystems.add('ise');
  }
  return Array.from(subsystems);
};

const inferFieldMeta = (
  reference: string,
  sourceType: DriSourceType,
  confidence: DriConfidence,
  status: DriKnowledgeStatus,
) => ({ reference, sourceType, confidence, status });

export const buildReagentProfiles = (catalog: DriCatalog): DriReagentProfile[] =>
  catalog.reagents.map((reagent) => {
    const reactionKind = inferReactionKind(reagent.reportedMethod || '');
    const scheme = inferScheme(reagent.reagentType || '');
    const platforms = inferPlatforms(reagent.reportedMethod || '', reagent.reagentType || '');
    const fieldMeta = inferFieldMeta(reagent.sourceReference, reagent.sourceType, reagent.confidence, 'pending');
    const noteText = `${reagent.operationalNote || ''} ${reagent.preliminaryRisk || ''}`;
    const noteNormalized = normalizeText(noteText);
    const temperatureSensitive = DRI_ENZYMATIC_KEYWORDS.some((keyword) => noteNormalized.includes(keyword)) || reactionKind === 'kinetic';
    const subsystems = inferSubsystems(reactionKind, scheme, reagent.primaryWavelengthNm);
    const usesR1 = scheme === 'unknown' ? null : true;
    const usesR2 = scheme === 'bireactive' || scheme === 'multireactive' || scheme === 'variable' ? true : scheme === 'monoreactive' ? false : null;
    const relatedReagents = Array.isArray(reagent.relatedReagentIds) ? reagent.relatedReagentIds : [];

    return {
      id: reagent.id,
      displayName: reagent.name,
      referenceCode: buildKnowledgeField(reagent.referenceCode || reagent.id, 'estimated', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      platforms: buildKnowledgeField(platforms, 'estimated', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      analyticalFamily: buildKnowledgeField(reagent.analyticalFamily || null, reagent.analyticalFamily ? 'validated' : 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      reactionKind: buildKnowledgeField(reactionKind, 'estimated', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      reagentScheme: buildKnowledgeField(scheme, 'estimated', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      usesR1: buildKnowledgeField(usesR1, usesR1 === null ? 'pending' : 'rule_inferred', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      usesR2: buildKnowledgeField(usesR2, usesR2 === null ? 'pending' : 'rule_inferred', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      sharedR2Group: buildKnowledgeField(usesR2 ? 'PENDIENTE_VALIDACION' : null, usesR2 ? 'pending' : 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      primaryWavelengthNm: buildKnowledgeField(reagent.primaryWavelengthNm, reagent.primaryWavelengthNm ? 'validated' : 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      secondaryWavelengthNm: buildKnowledgeField(reagent.referenceWavelengthNm, reagent.referenceWavelengthNm ? 'validated' : 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      temperatureSensitive: buildKnowledgeField(temperatureSensitive, temperatureSensitive ? 'estimated' : 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      lightSensitive: buildKnowledgeField(null, 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      contaminationSensitive: buildKnowledgeField(reactionKind !== 'ise', 'estimated', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      hemolysisSensitive: buildKnowledgeField(null, 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      lipemiaSensitive: buildKnowledgeField(null, 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      ictericiaSensitive: buildKnowledgeField(null, 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      sampleVolumeUl: buildKnowledgeField(null, 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      reagentR1VolumeUl: buildKnowledgeField(null, 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      reagentR2VolumeUl: buildKnowledgeField(usesR2 ? null : 0, usesR2 ? 'pending' : 'rule_inferred', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      totalReactionVolumeUl: buildKnowledgeField(null, 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      requiresBlank: buildKnowledgeField(reactionKind !== 'ise', 'estimated', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      requiresFrequentCalibration: buildKnowledgeField(reactionKind === 'kinetic' || scheme === 'bireactive', 'estimated', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      onboardStabilityHours: buildKnowledgeField(null, 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      reconstitutedStabilityHours: buildKnowledgeField(null, 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      recommendedPlacement: buildKnowledgeField(platforms.includes('BA400') ? 'BA400_PENDIENTE_VALIDACION' : null, 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      analyticalRange: buildKnowledgeField(null, 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      linearity: buildKnowledgeField(null, 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      allowsAutoDilution: buildKnowledgeField(reactionKind !== 'ise', 'estimated', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      dilutionFactors: buildKnowledgeField(['1:2', '1:4', '1:5'], 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      technicalNotes: buildKnowledgeField(
        [reagent.operationalNote, reagent.preliminaryRisk].filter(Boolean) as string[],
        'estimated',
        fieldMeta.reference,
        fieldMeta.sourceType,
        fieldMeta.confidence,
      ),
      mechanicalSubsystems: buildKnowledgeField(subsystems, 'estimated', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      relatedReagents: buildKnowledgeField(relatedReagents, relatedReagents.length ? 'validated' : 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      legacy: reagent,
    };
  });
