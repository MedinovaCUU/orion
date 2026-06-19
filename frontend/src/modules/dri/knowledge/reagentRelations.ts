import type {
  DriCatalog,
  DriConfidence,
  DriEquipmentModel,
  DriInterferenceThreshold,
  DriKnowledgeStatus,
  DriMechanicalSubsystemId,
  DriMeasurementLimit,
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

const CONTAMINATION_KEYWORDS = [
  'contamin',
  'carryover',
  'arrastre',
  'lavado',
  'wash',
  'agua destilada',
  'water quality',
  'quality water',
  'blanco inicial',
  'blank',
];

const WATER_KEYWORDS = ['agua', 'water', 'lavado', 'wash', 'destilada', 'conductividad'];

const isNumeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const buildMeasurementLimit = (
  value: unknown,
  unit: unknown,
  alternateValue: unknown,
  alternateUnit: unknown,
): DriMeasurementLimit | null => {
  if (!isNumeric(value) || typeof unit !== 'string' || !unit.trim()) {
    return null;
  }

  return {
    value,
    unit,
    alternateValue: isNumeric(alternateValue) ? alternateValue : null,
    alternateUnit: typeof alternateUnit === 'string' && alternateUnit.trim() ? alternateUnit : null,
  };
};

const buildMeasurementText = (prefix: string, limit: DriMeasurementLimit | null) => {
  if (!limit) {
    return null;
  }
  const alternate =
    limit.alternateValue !== null && limit.alternateValue !== undefined && limit.alternateUnit
      ? ` (${limit.alternateValue} ${limit.alternateUnit})`
      : '';
  return `${prefix}: ${limit.value} ${limit.unit}${alternate}`;
};

const parseInterferenceThresholds = (value: unknown): DriInterferenceThreshold[] =>
  Array.isArray(value)
    ? value
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
          }
          const row = item as Record<string, unknown>;
          if (!isNumeric(row.thresholdValue) || typeof row.unit !== 'string' || !row.unit.trim()) {
            return null;
          }
          return {
            interferent: typeof row.interferent === 'string' ? row.interferent : 'other',
            label: typeof row.label === 'string' ? row.label : 'Interferencia',
            thresholdValue: row.thresholdValue,
            unit: row.unit,
            effect: row.effect === 'no_interference_below' ? 'no_interference_below' : 'may_interfere_above',
            ...(typeof row.sourceExcerpt === 'string' ? { sourceExcerpt: row.sourceExcerpt } : {}),
          } as DriInterferenceThreshold;
        })
        .filter((item): item is DriInterferenceThreshold => item !== null)
    : [];

export const buildReagentProfiles = (catalog: DriCatalog): DriReagentProfile[] =>
  catalog.reagents.map((reagent) => {
    const technicalProfile = (reagent.technicalProfile || {}) as Record<string, unknown>;
    const ifuFacts = (technicalProfile.ifuFacts || {}) as Record<string, unknown>;
    const reactionKind = inferReactionKind(reagent.reportedMethod || '');
    const scheme = inferScheme(reagent.reagentType || '');
    const platforms = reagent.platforms?.length ? reagent.platforms : inferPlatforms(reagent.reportedMethod || '', reagent.reagentType || '');
    const fieldMeta = inferFieldMeta(reagent.sourceReference, reagent.sourceType, reagent.confidence, 'pending');
    const noteText = `${reagent.operationalNote || ''} ${reagent.preliminaryRisk || ''}`;
    const noteNormalized = normalizeText(noteText);
    const temperatureSensitive = DRI_ENZYMATIC_KEYWORDS.some((keyword) => noteNormalized.includes(keyword)) || reactionKind === 'kinetic';
    const subsystems = inferSubsystems(reactionKind, scheme, reagent.primaryWavelengthNm);
    const usesR1 = scheme === 'unknown' ? null : true;
    const usesR2 = scheme === 'bireactive' || scheme === 'multireactive' || scheme === 'variable' ? true : scheme === 'monoreactive' ? false : null;
    const relatedReagents = Array.isArray(reagent.relatedReagentIds) ? reagent.relatedReagentIds : [];
    const contextualNotes = Array.isArray(ifuFacts.notes) ? ifuFacts.notes.filter((item): item is string => typeof item === 'string') : [];
    const missingFields = Array.isArray(technicalProfile.missingFields)
      ? technicalProfile.missingFields.filter((item): item is string => typeof item === 'string')
      : [];
    const lightSensitive = typeof ifuFacts.lightSensitive === 'boolean' ? ifuFacts.lightSensitive : null;
    const onboardStabilityHours = typeof ifuFacts.onboardStabilityHours === 'number' ? ifuFacts.onboardStabilityHours : null;
    const blankDeterioration = typeof ifuFacts.blankDeterioration === 'string' ? ifuFacts.blankDeterioration : null;
    const ifuStorageMin = typeof ifuFacts.storageTempMinC === 'number' ? ifuFacts.storageTempMinC : null;
    const ifuStorageMax = typeof ifuFacts.storageTempMaxC === 'number' ? ifuFacts.storageTempMaxC : null;
    const detectionLimit = buildMeasurementLimit(
      ifuFacts.detectionLimitValue,
      ifuFacts.detectionLimitUnit,
      ifuFacts.detectionLimitAlternateValue,
      ifuFacts.detectionLimitAlternateUnit,
    );
    const quantificationLimit = buildMeasurementLimit(
      ifuFacts.quantificationLimitValue,
      ifuFacts.quantificationLimitUnit,
      ifuFacts.quantificationLimitAlternateValue,
      ifuFacts.quantificationLimitAlternateUnit,
    );
    const linearityLimit = buildMeasurementLimit(
      ifuFacts.linearityLimitValue,
      ifuFacts.linearityLimitUnit,
      ifuFacts.linearityLimitAlternateValue,
      ifuFacts.linearityLimitAlternateUnit,
    );
    const procedureLimitations = Array.isArray(ifuFacts.procedureLimitations)
      ? ifuFacts.procedureLimitations.filter((item): item is string => typeof item === 'string')
      : [];
    const interferenceThresholds = parseInterferenceThresholds(ifuFacts.interferenceThresholds);
    const hasHemolysisThreshold = interferenceThresholds.some((item) => item.interferent === 'hemolysis');
    const hasLipemiaThreshold = interferenceThresholds.some((item) => item.interferent === 'lipemia');
    const hasBilirubinThreshold = interferenceThresholds.some((item) => item.interferent === 'bilirubin');
    const contaminationSensitive =
      CONTAMINATION_KEYWORDS.some((keyword) => noteNormalized.includes(keyword)) ||
      Boolean(blankDeterioration) ||
      reactionKind === 'turbidimetric';
    const waterSensitive = WATER_KEYWORDS.some((keyword) => noteNormalized.includes(keyword));

    return {
      id: reagent.id,
      displayName: reagent.displayName || reagent.name,
      referenceCode: buildKnowledgeField(reagent.displayCode || reagent.referenceCode || reagent.id, 'estimated', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
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
      lightSensitive: buildKnowledgeField(lightSensitive, lightSensitive === null ? 'pending' : 'validated', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      contaminationSensitive: buildKnowledgeField(
        contaminationSensitive,
        contaminationSensitive ? 'estimated' : 'pending',
        fieldMeta.reference,
        fieldMeta.sourceType,
        fieldMeta.confidence,
      ),
      hemolysisSensitive: buildKnowledgeField(
        hasHemolysisThreshold ? true : null,
        hasHemolysisThreshold ? 'validated' : 'pending',
        fieldMeta.reference,
        fieldMeta.sourceType,
        fieldMeta.confidence,
      ),
      lipemiaSensitive: buildKnowledgeField(
        hasLipemiaThreshold ? true : null,
        hasLipemiaThreshold ? 'validated' : 'pending',
        fieldMeta.reference,
        fieldMeta.sourceType,
        fieldMeta.confidence,
      ),
      ictericiaSensitive: buildKnowledgeField(
        hasBilirubinThreshold ? true : null,
        hasBilirubinThreshold ? 'validated' : 'pending',
        fieldMeta.reference,
        fieldMeta.sourceType,
        fieldMeta.confidence,
      ),
      detectionLimit: buildKnowledgeField(
        detectionLimit,
        detectionLimit ? 'validated' : 'pending',
        fieldMeta.reference,
        fieldMeta.sourceType,
        fieldMeta.confidence,
      ),
      quantificationLimit: buildKnowledgeField(
        quantificationLimit,
        quantificationLimit ? 'validated' : 'pending',
        fieldMeta.reference,
        fieldMeta.sourceType,
        fieldMeta.confidence,
      ),
      linearityLimit: buildKnowledgeField(
        linearityLimit,
        linearityLimit ? 'validated' : 'pending',
        fieldMeta.reference,
        fieldMeta.sourceType,
        fieldMeta.confidence,
      ),
      sampleVolumeUl: buildKnowledgeField(null, 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      reagentR1VolumeUl: buildKnowledgeField(null, 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      reagentR2VolumeUl: buildKnowledgeField(usesR2 ? null : 0, usesR2 ? 'pending' : 'rule_inferred', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      totalReactionVolumeUl: buildKnowledgeField(null, 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      requiresBlank: buildKnowledgeField(blankDeterioration ? true : reactionKind !== 'ise', blankDeterioration ? 'validated' : 'estimated', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      requiresFrequentCalibration: buildKnowledgeField(reactionKind === 'kinetic' || scheme === 'bireactive', 'estimated', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      onboardStabilityHours: buildKnowledgeField(onboardStabilityHours, onboardStabilityHours === null ? 'pending' : 'validated', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      reconstitutedStabilityHours: buildKnowledgeField(null, 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      recommendedPlacement: buildKnowledgeField(platforms.includes('BA400') ? 'BA400_PENDIENTE_VALIDACION' : null, 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      analyticalRange: buildKnowledgeField(
        detectionLimit && linearityLimit && detectionLimit.unit === linearityLimit.unit
          ? `${detectionLimit.value} a ${linearityLimit.value} ${linearityLimit.unit}`
          : null,
        detectionLimit && linearityLimit && detectionLimit.unit === linearityLimit.unit ? 'validated' : 'pending',
        fieldMeta.reference,
        fieldMeta.sourceType,
        fieldMeta.confidence,
      ),
      linearity: buildKnowledgeField(
        linearityLimit ? `≤ ${linearityLimit.value} ${linearityLimit.unit}` : null,
        linearityLimit ? 'validated' : 'pending',
        fieldMeta.reference,
        fieldMeta.sourceType,
        fieldMeta.confidence,
      ),
      allowsAutoDilution: buildKnowledgeField(reactionKind !== 'ise', 'estimated', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      dilutionFactors: buildKnowledgeField(['1:2', '1:4', '1:5'], 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      procedureLimitations: buildKnowledgeField(
        procedureLimitations,
        procedureLimitations.length ? 'validated' : 'pending',
        fieldMeta.reference,
        fieldMeta.sourceType,
        fieldMeta.confidence,
      ),
      interferenceThresholds: buildKnowledgeField(
        interferenceThresholds,
        interferenceThresholds.length ? 'validated' : 'pending',
        fieldMeta.reference,
        fieldMeta.sourceType,
        fieldMeta.confidence,
      ),
      technicalNotes: buildKnowledgeField(
        [
          ...([reagent.operationalNote, reagent.preliminaryRisk].filter(Boolean) as string[]),
          ...contextualNotes,
          ...(waterSensitive ? ['Sensibilidad potencial a agua/lavado'] : []),
          ...(buildMeasurementText('Límite de detección IFU', detectionLimit) ? [buildMeasurementText('Límite de detección IFU', detectionLimit) as string] : []),
          ...(buildMeasurementText('Límite de cuantificación IFU', quantificationLimit) ? [buildMeasurementText('Límite de cuantificación IFU', quantificationLimit) as string] : []),
          ...(buildMeasurementText('Límite de linealidad IFU', linearityLimit) ? [buildMeasurementText('Límite de linealidad IFU', linearityLimit) as string] : []),
          ...interferenceThresholds.map((item) => `${item.label}: posible interferencia por arriba de ${item.thresholdValue} ${item.unit}`),
          ...procedureLimitations.slice(0, 2),
          ...(ifuStorageMin !== null || ifuStorageMax !== null
            ? [`Conservación IFU: ${ifuStorageMin ?? '?'}-${ifuStorageMax ?? '?'} °C`]
            : []),
          ...missingFields.map((item) => `Dato pendiente: ${item}`),
        ],
        contextualNotes.length || waterSensitive || ifuStorageMin !== null || ifuStorageMax !== null ? 'validated' : 'estimated',
        fieldMeta.reference,
        fieldMeta.sourceType,
        fieldMeta.confidence,
      ),
      mechanicalSubsystems: buildKnowledgeField(subsystems, 'estimated', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      relatedReagents: buildKnowledgeField(relatedReagents, relatedReagents.length ? 'validated' : 'pending', fieldMeta.reference, fieldMeta.sourceType, fieldMeta.confidence),
      legacy: reagent,
    };
  });
