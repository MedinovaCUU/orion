import { DRI_SUBSYSTEM_LABELS } from '../knowledge/mechanicalSubsystems';
import { normalizeText, countCoverage, roundDri } from '../utils/relationUtils';
import type {
  DriCatalog,
  DriCaseFormState,
  DriEngineLogEntry,
  DriFactor,
  DriFactorAggregate,
  DriRelationSignal,
  DriReagentProfile,
} from '../types/dri.types';
import { createDriLogger } from '../utils/driLogging';

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
    registerSignal(
      signalMap,
      {
        id: `reaction:${profile.reactionKind.value}`,
        category: 'reaction',
        label: `Reacción ${profile.reactionKind.value}`,
        suspectedSubsystems: profile.mechanicalSubsystems.value,
      },
      profile.id,
      outcome,
    );

    registerSignal(
      signalMap,
      {
        id: `scheme:${profile.reagentScheme.value}`,
        category: 'scheme',
        label: `Esquema ${profile.reagentScheme.value}`,
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
          id: 'temperature:sensitive',
          category: 'temperature',
          label: 'Sensibles a temperatura',
          suspectedSubsystems: ['reaction_rotor', 'fridge'],
        },
        profile.id,
        outcome,
      );
    }

    if (normalizeText(profile.legacy.operationalNote).includes('agua')) {
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

    if (profile.allowsAutoDilution.value) {
      registerSignal(
        signalMap,
        {
          id: 'dilution:auto',
          category: 'dilution',
          label: 'Permiten dilución automática',
          suspectedSubsystems: ['sample_arm', 'fluidics', 'level_detection'],
        },
        profile.id,
        outcome,
      );
    }

    profile.mechanicalSubsystems.value.forEach((subsystem) => {
      registerSignal(
        signalMap,
        {
          id: `subsystem:${subsystem}`,
          category: 'subsystem',
          label: DRI_SUBSYSTEM_LABELS[subsystem],
          suspectedSubsystems: [subsystem],
        },
        profile.id,
        outcome,
      );
    });
  };

  failedProfiles.forEach((profile) => pushProfileSignals(profile, 'failed'));
  correctProfiles.forEach((profile) => pushProfileSignals(profile, 'correct'));

  form.serviceTests
    .filter((test) => test.result === 'abnormal' || test.result === 'failed')
    .forEach((test) => {
      signalMap.set(`service:${test.utilityId}`, {
        id: `service:${test.utilityId}`,
        category: 'service',
        label: `Servicio anormal: ${test.label}`,
        failedCoverage: 1,
        correctCoverage: 0,
        suspicionScore: 82,
        relatedReagentIds: [],
        contrastReagentIds: [],
        suspectedSubsystems:
          test.utilityId === 'photometry'
            ? ['optical_system']
            : test.utilityId === 'motors_valves_pumps'
              ? ['fluidics', 'reagent_arm_r1', 'reagent_arm_r2']
              : test.utilityId === 'thermostatting'
                ? ['reaction_rotor', 'fridge']
                : ['sample_arm'],
        evidenceFor: [`${test.label} fue capturado como ${test.result}.`],
        evidenceAgainst: [],
      });
    });

  const signals = Array.from(signalMap.values())
    .map((signal) => {
      const failedCoverage = countCoverage(signal.relatedReagentIds.length, failedProfiles.length);
      const correctCoverage = countCoverage(signal.contrastReagentIds.length, correctProfiles.length);
      const matchingFactorBoost = factorAggregates
        .filter((aggregate) => normalizeText(aggregate.label).includes(normalizeText(signal.label).replace('filtro/longitud ', '').split(' ')[0]))
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
