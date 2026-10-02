import { normalizeText, countCoverage, roundDri } from '../utils/relationUtils';
import type {
  DriCatalog,
  DriCaseFormState,
  DriEngineLogEntry,
  DriFactor,
  DriFactorAggregate,
  DriMechanicalSubsystemId,
  DriRelationSignal,
  DriReagentProfile,
  DriServiceUtilityId,
} from '../types/dri.types';
import { createDriLogger } from '../utils/driLogging';

const REACTION_LABELS: Record<string, string> = {
  endpoint: 'Punto final',
  kinetic: 'Cinética',
  turbidimetric: 'Turbidimetría',
  ise: 'ISE',
  other: 'Otra reacción',
};

const SCHEME_LABELS: Record<string, string> = {
  monoreactive: 'Monoreactiva',
  bireactive: 'Bireactiva',
  multireactive: 'Multirreactiva',
  variable: 'Variable por programa',
  unknown: 'Esquema pendiente',
};

const SERVICE_SIGNAL_SCORE = {
  failed: 90,
  abnormal: 82,
  adjusted: 58,
} as const;

const SERVICE_UTILITY_SUBSYSTEMS: Partial<Record<DriServiceUtilityId, DriMechanicalSubsystemId[]>> = {
  photometry: ['optical_system'],
  baseline_darkness_current: ['optical_system'],
  metrology: ['optical_system'],
  motors_valves_pumps: ['fluidics', 'reagent_arm_r1', 'reagent_arm_r2'],
  thermostatting: ['reaction_rotor', 'fridge'],
  level_detection: ['level_detection', 'sample_arm', 'reagent_arm_r1', 'reagent_arm_r2'],
  washing_station: ['wash_station'],
  conditioning: ['fluidics', 'wash_station', 'reagent_arm_r1', 'reagent_arm_r2'],
  positioning: ['sample_arm', 'reagent_arm_r1', 'reagent_arm_r2', 'stirrer'],
  stress_mode: ['reaction_rotor', 'sample_arm', 'reagent_arm_r1', 'reagent_arm_r2', 'stirrer'],
  bottle_level: ['reagent_arm_r1', 'reagent_arm_r2', 'level_detection'],
  barcode: ['barcode'],
  ise_module: ['ise'],
  clot_sensor: ['clot_sensor'],
  dilution_review: ['fluidics', 'sample_arm'],
};

const WATER_KEYWORDS = ['agua', 'water', 'wash', 'lavado', 'destilada', 'conductividad'];
const CONTAMINATION_KEYWORDS = ['contamin', 'carryover', 'arrastre', 'lavado', 'wash', 'blanco inicial', 'blank'];

const extractProfileText = (profile: DriReagentProfile) => {
  const technicalProfile = (profile.legacy.technicalProfile || {}) as Record<string, unknown>;
  const ifuFacts = (technicalProfile.ifuFacts || {}) as Record<string, unknown>;
  const ifuNotes = Array.isArray(ifuFacts.notes) ? ifuFacts.notes.filter((item): item is string => typeof item === 'string') : [];
  return {
    text: normalizeText(
      [
        profile.legacy.reportedMethod,
        profile.legacy.operationalNote,
        profile.legacy.preliminaryRisk,
        ...profile.technicalNotes.value,
        ...ifuNotes,
      ]
        .filter(Boolean)
        .join(' '),
    ),
    ifuFacts,
  };
};

const registerTechniqueSignal = (
  signalMap: Map<string, DriRelationSignal>,
  profile: DriReagentProfile,
  outcome: 'failed' | 'correct',
  id: string,
  label: string,
  subsystems = profile.mechanicalSubsystems.value,
) => {
  registerSignal(
    signalMap,
    {
      id,
      category: 'technique',
      label,
      suspectedSubsystems: subsystems,
    },
    profile.id,
    outcome,
  );
};

export const buildFactorAggregates = (
  catalog: DriCatalog,
  failedProfiles: DriReagentProfile[],
  correctProfiles: DriReagentProfile[],
  runId: string,
  platform: string,
  sink: DriEngineLogEntry[],
): DriFactorAggregate[] => {
  const logger = createDriLogger(runId, platform, sink);
  const factorById = new Map(catalog.factors.map((factor) => [factor.id, factor]));
  const failedSet = new Set(failedProfiles.map((profile) => profile.id));
  const correctSet = new Set(correctProfiles.map((profile) => profile.id));
  const map = new Map<
    string,
    {
      factor: DriFactor;
      failedIds: Set<string>;
      correctIds: Set<string>;
      failedWeight: number;
      correctWeight: number;
      count: number;
    }
  >();

  catalog.links.forEach((link) => {
    const factor = factorById.get(link.factorId);
    if (!factor) {
      return;
    }

    const bucket = map.get(link.factorId) ?? {
      factor,
      failedIds: new Set<string>(),
      correctIds: new Set<string>(),
      failedWeight: 0,
      correctWeight: 0,
      count: 0,
    };

    if (failedSet.has(link.reagentId)) {
      bucket.failedIds.add(link.reagentId);
      bucket.failedWeight += link.weight;
      bucket.count += 1;
    }
    if (correctSet.has(link.reagentId)) {
      bucket.correctIds.add(link.reagentId);
      bucket.correctWeight += link.weight;
      bucket.count += 1;
    }
    map.set(link.factorId, bucket);
  });

  const aggregates = Array.from(map.values())
    .map<DriFactorAggregate>((entry) => {
      const failedCoverage = countCoverage(entry.failedIds.size, failedProfiles.length);
      const correctCoverage = countCoverage(entry.correctIds.size, correctProfiles.length);
      const meanLinkWeight = entry.count ? roundDri((entry.failedWeight + entry.correctWeight) / entry.count) : 0;
      const suspicionScore = roundDri(
        Math.max(0, failedCoverage * 70 + meanLinkWeight * 16 - correctCoverage * 44),
      );
      return {
        factorId: entry.factor.id,
        label: entry.factor.label,
        factorType: entry.factor.factorType,
        priority: entry.factor.priority,
        failedCount: entry.failedIds.size,
        correctCount: entry.correctIds.size,
        failedCoverage,
        correctCoverage,
        meanLinkWeight,
        suspicionScore,
        positiveReagents: Array.from(entry.failedIds),
        negativeReagents: Array.from(entry.correctIds),
        sourceType: entry.factor.sourceType,
        sourceReference: entry.factor.sourceReference,
      };
    })
    .sort((left, right) => right.suspicionScore - left.suspicionScore);

  logger.info('EVIDENCE', 'factor-aggregates', 'Factores agregados a partir del catálogo relacional.', {
    factorCount: aggregates.length,
    topFactors: aggregates.slice(0, 6).map((aggregate) => ({
      factorId: aggregate.factorId,
      label: aggregate.label,
      score: aggregate.suspicionScore,
      failedCoverage: aggregate.failedCoverage,
      correctCoverage: aggregate.correctCoverage,
    })),
  });

  return aggregates;
};

const registerSignal = (
  signalMap: Map<string, DriRelationSignal>,
  signal: Omit<DriRelationSignal, 'failedCoverage' | 'correctCoverage' | 'suspicionScore' | 'relatedReagentIds' | 'contrastReagentIds' | 'evidenceFor' | 'evidenceAgainst'>,
  reagentId: string,
  outcome: 'failed' | 'correct',
) => {
  const existing = signalMap.get(signal.id) ?? {
    ...signal,
    failedCoverage: 0,
    correctCoverage: 0,
    suspicionScore: 0,
    relatedReagentIds: [],
    contrastReagentIds: [],
    evidenceFor: [],
    evidenceAgainst: [],
  };

  if (outcome === 'failed') {
    if (!existing.relatedReagentIds.includes(reagentId)) {
      existing.relatedReagentIds.push(reagentId);
    }
  } else if (!existing.contrastReagentIds.includes(reagentId)) {
    existing.contrastReagentIds.push(reagentId);
  }

  signalMap.set(signal.id, existing);
};

export const buildRelationSignals = (
  form: DriCaseFormState,
  failedProfiles: DriReagentProfile[],
  correctProfiles: DriReagentProfile[],
  factorAggregates: DriFactorAggregate[],
  runId: string,
  platform: string,
  sink: DriEngineLogEntry[],
): DriRelationSignal[] => {
  const logger = createDriLogger(runId, platform, sink);
  const signalMap = new Map<string, DriRelationSignal>();

  const pushProfileSignals = (profile: DriReagentProfile, outcome: 'failed' | 'correct') => {
    const { text, ifuFacts } = extractProfileText(profile);
    const storageMin = typeof ifuFacts.storageTempMinC === 'number' ? ifuFacts.storageTempMinC : null;
    const storageMax = typeof ifuFacts.storageTempMaxC === 'number' ? ifuFacts.storageTempMaxC : null;
    const blankDeterioration = typeof ifuFacts.blankDeterioration === 'string' ? ifuFacts.blankDeterioration : null;
    const platformSpecificScheme =
      profile.reagentScheme.value === 'variable' && ['BA400', 'BA200'].includes(platform) && text.includes('ba:') && text.includes('bireact')
        ? 'bireactive'
        : profile.reagentScheme.value === 'variable' && platform === 'A15' && text.includes('a15') && text.includes('monoreact')
          ? 'monoreactive'
          : profile.reagentScheme.value;

    registerSignal(
      signalMap,
      {
        id: `reaction:${profile.reactionKind.value}`,
        category: 'reaction',
        label: REACTION_LABELS[profile.reactionKind.value] || `Reacción ${profile.reactionKind.value}`,
        suspectedSubsystems: profile.mechanicalSubsystems.value,
      },
      profile.id,
      outcome,
    );

    if (text.includes('punto final')) {
      registerTechniqueSignal(signalMap, profile, outcome, 'technique:endpoint', 'Técnica de punto final');
    }
    if (text.includes('tiempo fijo')) {
      registerTechniqueSignal(signalMap, profile, outcome, 'technique:fixed_time', 'Técnica de tiempo fijo');
    }
    if (text.includes('enzimat')) {
      registerTechniqueSignal(signalMap, profile, outcome, 'technique:enzymatic', 'Técnica enzimática');
    }
    if (text.includes('decreciente')) {
      registerSignal(
        signalMap,
        {
          id: 'trend:decreasing',
          category: 'trend',
          label: 'Cinética decreciente',
          suspectedSubsystems: ['optical_system', 'reaction_rotor', 'reagent_arm_r2'],
        },
        profile.id,
        outcome,
      );
    }
    if (text.includes('creciente')) {
      registerSignal(
        signalMap,
        {
          id: 'trend:increasing',
          category: 'trend',
          label: 'Cinética creciente',
          suspectedSubsystems: ['optical_system', 'reaction_rotor', 'reagent_arm_r2'],
        },
        profile.id,
        outcome,
      );
    }

    registerSignal(
      signalMap,
      {
        id: `scheme:${platformSpecificScheme}`,
        category: 'scheme',
        label: SCHEME_LABELS[platformSpecificScheme] || `Esquema ${platformSpecificScheme}`,
        suspectedSubsystems: profile.mechanicalSubsystems.value,
      },
      profile.id,
      outcome,
    );

    if (profile.primaryWavelengthNm.value) {
      registerSignal(
        signalMap,
        {
          id: `wavelength:${profile.primaryWavelengthNm.value}`,
          category: 'wavelength',
          label: `Filtro/longitud ${profile.primaryWavelengthNm.value} nm`,
          suspectedSubsystems: ['optical_system', 'reaction_rotor'],
        },
        profile.id,
        outcome,
      );
    }

    if (profile.secondaryWavelengthNm.value) {
      registerSignal(
        signalMap,
        {
          id: `wavelength:ref:${profile.secondaryWavelengthNm.value}`,
          category: 'wavelength',
          label: `Filtro de referencia ${profile.secondaryWavelengthNm.value} nm`,
          suspectedSubsystems: ['optical_system', 'reaction_rotor'],
        },
        profile.id,
        outcome,
      );
    }

    if (profile.usesR2.value) {
      registerSignal(
        signalMap,
        {
          id: 'r2:shared',
          category: 'r2',
          label: 'Dependencia de R2',
          suspectedSubsystems: ['reagent_arm_r2', 'stirrer', 'fluidics'],
        },
        profile.id,
        outcome,
      );
    }

    if (profile.temperatureSensitive.value) {
      registerSignal(
        signalMap,
        {
          id: 'temperature:reaction_sensitive',
          category: 'temperature',
          label: 'Sensibles a temperatura de reacción',
          suspectedSubsystems: ['reaction_rotor', 'fridge'],
        },
        profile.id,
        outcome,
      );
    }

    if (storageMin !== null || storageMax !== null) {
      registerSignal(
        signalMap,
        {
          id: `storage:${storageMin ?? 'x'}:${storageMax ?? 'x'}`,
          category: 'storage',
          label:
            storageMin !== null && storageMax !== null
              ? `Conservación ${storageMin}-${storageMax} °C`
              : 'Conservación IFU documentada',
          suspectedSubsystems: ['fridge'],
        },
        profile.id,
        outcome,
      );
    }

    if (blankDeterioration) {
      registerSignal(
        signalMap,
        {
          id: `blank:${blankDeterioration}`,
          category: 'blank',
          label: 'Blanco inicial / absorbancia base crítica',
          suspectedSubsystems: ['optical_system', 'reaction_rotor', 'wash_station'],
        },
        profile.id,
        outcome,
      );
    }

    if (WATER_KEYWORDS.some((keyword) => text.includes(keyword))) {
      registerSignal(
        signalMap,
        {
          id: 'water:sensitive',
          category: 'water',
          label: 'Sensibles a agua/lavado',
          suspectedSubsystems: ['wash_station', 'fluidics'],
        },
        profile.id,
        outcome,
      );
    }

    if (profile.contaminationSensitive.value || CONTAMINATION_KEYWORDS.some((keyword) => text.includes(keyword))) {
      registerSignal(
        signalMap,
        {
          id: 'contamination:carryover',
          category: 'contamination',
          label: 'Sensibles a contaminación / carryover',
          suspectedSubsystems: ['wash_station', 'fluidics', 'sample_arm', 'reagent_arm_r1', 'reagent_arm_r2'],
        },
        profile.id,
        outcome,
      );
    }

  };

  failedProfiles.forEach((profile) => pushProfileSignals(profile, 'failed'));
  correctProfiles.forEach((profile) => pushProfileSignals(profile, 'correct'));

  form.serviceTests
    .filter((test) => test.result === 'abnormal' || test.result === 'failed' || test.result === 'adjusted')
    .forEach((test) => {
      const score =
        test.result === 'failed'
          ? SERVICE_SIGNAL_SCORE.failed
          : test.result === 'abnormal'
            ? SERVICE_SIGNAL_SCORE.abnormal
            : SERVICE_SIGNAL_SCORE.adjusted;
      const signalId = `service:${test.utilityId}`;
      const existing = signalMap.get(signalId);
      if (existing && existing.suspicionScore >= score) return;
      signalMap.set(`service:${test.utilityId}`, {
        id: signalId,
        category: 'service',
        label: `${test.result === 'adjusted' ? 'Servicio ajustado' : 'Servicio anormal'}: ${test.label}`,
        failedCoverage: 1,
        correctCoverage: 0,
        suspicionScore: score,
        relatedReagentIds: [],
        contrastReagentIds: [],
        suspectedSubsystems: SERVICE_UTILITY_SUBSYSTEMS[test.utilityId] || [],
        evidenceFor: [`${test.label} fue capturado como ${test.result}.`],
        evidenceAgainst: [],
      });
    });

  const signals = Array.from(signalMap.values())
    .map((signal) => {
      if (signal.category === 'service') {
        return signal;
      }
      const failedCoverage = countCoverage(signal.relatedReagentIds.length, failedProfiles.length);
      const correctCoverage = countCoverage(signal.contrastReagentIds.length, correctProfiles.length);
      const matchingFactorBoost = factorAggregates
        .filter((aggregate) => {
          const aggregateLabel = normalizeText(aggregate.label);
          const signalLabel = normalizeText(signal.label);
          const signalTerms = signalLabel
            .replace('filtro de referencia ', '')
            .replace('filtro longitud ', '')
            .replace('filtro/longitud ', '')
            .split(' ')
            .filter(Boolean);
          return signalTerms.some((term) => term.length > 2 && aggregateLabel.includes(term));
        })
        .reduce((max, aggregate) => Math.max(max, aggregate.suspicionScore), 0);
      const suspicionScore = roundDri(Math.max(0, failedCoverage * 74 - correctCoverage * 42 + matchingFactorBoost * 0.28));
      return {
        ...signal,
        failedCoverage,
        correctCoverage,
        suspicionScore,
        evidenceFor: signal.evidenceFor.length
          ? signal.evidenceFor
          : [
              `${Math.round(failedCoverage * 100)}% de las fallidas comparten ${signal.label}.`,
            ],
        evidenceAgainst:
          signal.evidenceAgainst.length > 0
            ? signal.evidenceAgainst
            : correctCoverage > 0
              ? [`${Math.round(correctCoverage * 100)}% de las correctas también dependen de ${signal.label}.`]
              : ['Sin contraste positivo en pruebas correctas.'],
      };
    })
    .filter((signal) => signal.failedCoverage > 0 || signal.category === 'service')
    .sort((left, right) => right.suspicionScore - left.suspicionScore);

  logger.info('EVIDENCE', 'relation-signals', 'Señales relacionales construidas para el caso.', {
    signalCount: signals.length,
    topSignals: signals.slice(0, 8).map((signal) => ({
      id: signal.id,
      category: signal.category,
      label: signal.label,
      score: signal.suspicionScore,
      failedCoverage: signal.failedCoverage,
      correctCoverage: signal.correctCoverage,
    })),
  });

  return signals;
};
