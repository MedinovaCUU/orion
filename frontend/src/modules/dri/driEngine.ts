import { DRI_WORKBOOK_SEED } from './driWorkbookSeed.generated';
import type {
  DriCatalog,
  DriCaseFormState,
  DriEngineResult,
  DriEvidenceRow,
  DriFactor,
  DriFactorAggregate,
  DriHypothesisResult,
  DriLogEntry,
  DriReagent,
} from './driTypes';

const priorityBonusMap: Record<string, number> = {
  Alta: 8,
  'Media/Alta': 5,
  Media: 3,
  Baja: 1,
};

const factorColorByType: Record<string, string> = {
  wavelength: '#f5b567',
  method: '#66d4e7',
  reaction_type: '#7cb8ff',
  risk: '#ff8f5f',
};

const diagnosticRuleLookup = Object.fromEntries(
  DRI_WORKBOOK_SEED.diagnosticRules.map((rule) => [rule.id, rule]),
);

const kineticFactorIds = new Set(
  DRI_WORKBOOK_SEED.factors.filter((factor) => factor.label.toLowerCase().includes('cinética')).map((factor) => factor.id),
);

const endpointFactorIds = new Set(
  DRI_WORKBOOK_SEED.factors.filter((factor) => factor.label.toLowerCase().includes('punto final')).map((factor) => factor.id),
);

const bireactiveFactorIds = new Set(
  DRI_WORKBOOK_SEED.factors.filter((factor) => factor.label.toLowerCase().includes('bireactiva')).map((factor) => factor.id),
);

const monoreactiveFactorIds = new Set(
  DRI_WORKBOOK_SEED.factors.filter((factor) => factor.label.toLowerCase().includes('monoreactiva')).map((factor) => factor.id),
);

const waterRiskFactorIds = new Set(
  DRI_WORKBOOK_SEED.factors
    .filter((factor) => factor.label.toLowerCase().includes('agua'))
    .map((factor) => factor.id),
);

const reagentNameKeywordsForWater = ['calcium', 'magnesium', 'phosph', 'phos'];

const hypothesisProbability = (score: number) => {
  if (score >= 82) {
    return 'Alta';
  }

  if (score >= 64) {
    return 'Media-alta';
  }

  if (score >= 48) {
    return 'Media';
  }

  return 'Baja';
};

const normalizeText = (value: string | null | undefined) => (value || '').trim().toLowerCase();

const round = (value: number) => Math.round(value * 100) / 100;

const pushLog = (
  logs: DriLogEntry[],
  runId: string,
  level: DriLogEntry['level'],
  step: string,
  message: string,
  details: Record<string, unknown> = {},
) => {
  logs.push({ runId, level, step, message, details });
};

const getPriorityBonus = (priority: string | null) => priorityBonusMap[priority || ''] ?? 0;

const buildFactorAggregates = (
  catalog: DriCatalog,
  failedReagents: DriReagent[],
  correctReagents: DriReagent[],
  logs: DriLogEntry[],
  runId: string,
) => {
  const factorById = new Map(catalog.factors.map((factor) => [factor.id, factor]));
  const reagentById = new Map(catalog.reagents.map((reagent) => [reagent.id, reagent]));
  const aggregateMap = new Map<
    string,
    {
      factor: DriFactor;
      failedIds: Set<string>;
      correctIds: Set<string>;
      failedWeightSum: number;
      correctWeightSum: number;
      linkCount: number;
    }
  >();

  const register = (reagentId: string, factorId: string, weight: number, outcome: 'failed' | 'correct') => {
    const factor = factorById.get(factorId);
    if (!factor) {
      return;
    }

    const existing = aggregateMap.get(factorId) ?? {
      factor,
      failedIds: new Set<string>(),
      correctIds: new Set<string>(),
      failedWeightSum: 0,
      correctWeightSum: 0,
      linkCount: 0,
    };

    if (outcome === 'failed') {
      existing.failedIds.add(reagentId);
      existing.failedWeightSum += weight;
    } else {
      existing.correctIds.add(reagentId);
      existing.correctWeightSum += weight;
    }

    existing.linkCount += 1;
    aggregateMap.set(factorId, existing);
  };

  const failedSet = new Set(failedReagents.map((reagent) => reagent.id));
  const correctSet = new Set(correctReagents.map((reagent) => reagent.id));

  catalog.links.forEach((link) => {
    if (failedSet.has(link.reagentId)) {
      register(link.reagentId, link.factorId, link.weight, 'failed');
    }

    if (correctSet.has(link.reagentId)) {
      register(link.reagentId, link.factorId, link.weight, 'correct');
    }
  });

  const aggregates = Array.from(aggregateMap.values())
    .map<DriFactorAggregate>((entry) => {
      const failedCount = entry.failedIds.size;
      const correctCount = entry.correctIds.size;
      const failedCoverage = failedReagents.length > 0 ? failedCount / failedReagents.length : 0;
      const correctCoverage = correctReagents.length > 0 ? correctCount / correctReagents.length : 0;
      const meanLinkWeight = entry.linkCount > 0 ? (entry.failedWeightSum + entry.correctWeightSum) / entry.linkCount : 0;
      const suspicionScore = round(
        Math.max(
          0,
          failedCoverage * 72 + meanLinkWeight * 18 + getPriorityBonus(entry.factor.priority) - correctCoverage * 48,
        ),
      );

      const positiveReagents = Array.from(entry.failedIds)
        .map((id) => reagentById.get(id)?.name || id)
        .sort();
      const negativeReagents = Array.from(entry.correctIds)
        .map((id) => reagentById.get(id)?.name || id)
        .sort();

      return {
        factorId: entry.factor.id,
        label: entry.factor.label,
        factorType: entry.factor.factorType,
        priority: entry.factor.priority,
        failedCount,
        correctCount,
        failedCoverage: round(failedCoverage),
        correctCoverage: round(correctCoverage),
        meanLinkWeight: round(meanLinkWeight),
        suspicionScore,
        positiveReagents,
        negativeReagents,
        sourceType: entry.factor.sourceType,
        sourceReference: entry.factor.sourceReference,
      };
    })
    .sort((left, right) => right.suspicionScore - left.suspicionScore);

  aggregates.forEach((aggregate) => {
    pushLog(logs, runId, 'info', 'aggregate.factor', `Factor ${aggregate.label} agregado`, {
      factorId: aggregate.factorId,
      failedCoverage: aggregate.failedCoverage,
      correctCoverage: aggregate.correctCoverage,
      meanLinkWeight: aggregate.meanLinkWeight,
      suspicionScore: aggregate.suspicionScore,
      positiveReagents: aggregate.positiveReagents,
      negativeReagents: aggregate.negativeReagents,
    });
  });

  return aggregates;
};

const buildEvidenceRows = (aggregates: DriFactorAggregate[]): DriEvidenceRow[] =>
  aggregates.map((aggregate) => ({
    id: aggregate.factorId,
    factorId: aggregate.factorId,
    label: aggregate.label,
    factorType: aggregate.factorType,
    failedCoverage: aggregate.failedCoverage,
    correctCoverage: aggregate.correctCoverage,
    meanLinkWeight: aggregate.meanLinkWeight,
    suspicionScore: aggregate.suspicionScore,
    evidenceFor:
      aggregate.positiveReagents.length > 0
        ? `${aggregate.positiveReagents.join(', ')} comparten este factor.`
        : 'Sin evidencia positiva capturada.',
    evidenceAgainst:
      aggregate.negativeReagents.length > 0
        ? `${aggregate.negativeReagents.join(', ')} también lo comparten.`
        : 'No apareció en pruebas correctas registradas.',
  }));

const getCoverageForFactorSet = (aggregates: DriFactorAggregate[], factorIds: Set<string>, kind: 'failed' | 'correct') => {
  const matching = aggregates.filter((aggregate) => factorIds.has(aggregate.factorId));
  if (matching.length === 0) {
    return 0;
  }

  return Math.max(...matching.map((aggregate) => (kind === 'failed' ? aggregate.failedCoverage : aggregate.correctCoverage)));
};

const createHypothesis = (
  hypothesis: Omit<DriHypothesisResult, 'probabilityLabel' | 'status'>,
): DriHypothesisResult => ({
  ...hypothesis,
  probabilityLabel: hypothesisProbability(hypothesis.score),
  status: 'generated',
});

const createGenericFactorHypotheses = (
  aggregates: DriFactorAggregate[],
  logs: DriLogEntry[],
  runId: string,
): DriHypothesisResult[] => {
  return aggregates
    .filter((aggregate) => aggregate.suspicionScore >= 28)
    .slice(0, 4)
    .map((aggregate) => {
      const typeLabel =
        aggregate.factorType === 'wavelength'
          ? `Filtro sospechoso: ${aggregate.label}`
          : aggregate.factorType === 'method'
            ? `Patrón metodológico: ${aggregate.label}`
            : aggregate.factorType === 'reaction_type'
              ? `Esquema reactivo dominante: ${aggregate.label}`
              : `Riesgo operativo dominante: ${aggregate.label}`;

      const hypothesis = createHypothesis({
        key: `factor:${aggregate.factorId}`,
        title: typeLabel,
        score: Math.min(92, round(aggregate.suspicionScore + aggregate.failedCoverage * 15)),
        evidenceFor: [
          `${Math.round(aggregate.failedCoverage * 100)}% de las pruebas fallidas comparten ${aggregate.label}.`,
          aggregate.positiveReagents.length > 0
            ? `Reactivos implicados: ${aggregate.positiveReagents.join(', ')}.`
            : 'No se listaron reactivos fallidos para este factor.',
        ],
        evidenceAgainst: [
          aggregate.negativeReagents.length > 0
            ? `${Math.round(aggregate.correctCoverage * 100)}% de las pruebas correctas también comparten el factor.`
            : 'No se detectaron pruebas correctas con el mismo factor.',
        ],
        confirmatoryActions: [
          `Comparar otra técnica relacionada con ${aggregate.label}.`,
          `Confirmar la programación real del método/filtro en exportación BA400 antes de concluir.`,
        ],
        supportingFactorIds: [aggregate.factorId],
        matchedRuleIds: [],
        payload: {
          factorType: aggregate.factorType,
          factorColor: factorColorByType[aggregate.factorType] ?? '#f5b567',
        },
      });

      pushLog(logs, runId, 'success', 'hypothesis.factor', `Hipótesis genérica creada para ${aggregate.label}`, {
        hypothesisKey: hypothesis.key,
        score: hypothesis.score,
      });

      return hypothesis;
    });
};

const buildRuleHypotheses = (
  form: DriCaseFormState,
  failedReagents: DriReagent[],
  correctReagents: DriReagent[],
  aggregates: DriFactorAggregate[],
  logs: DriLogEntry[],
  runId: string,
): DriHypothesisResult[] => {
  const hypotheses: DriHypothesisResult[] = [];
  const aggregateById = new Map(aggregates.map((aggregate) => [aggregate.factorId, aggregate]));
  const observationsText = normalizeText(form.observations);

  const wavelengthHits = aggregates.filter(
    (aggregate) => aggregate.factorType === 'wavelength' && aggregate.failedCoverage >= 0.6 && aggregate.correctCoverage <= 0.3,
  );

  if (wavelengthHits.length > 0) {
    wavelengthHits.forEach((aggregate) => {
      const rule = diagnosticRuleLookup.R001;
      hypotheses.push(
        createHypothesis({
          key: `rule:R001:${aggregate.factorId}`,
          title: `${rule?.hypothesis ?? 'Falla óptica/filtro'} · ${aggregate.label}`,
          score: Math.min(96, round(72 + aggregate.failedCoverage * 18 - aggregate.correctCoverage * 8 + aggregate.meanLinkWeight * 6)),
          evidenceFor: [
            `${Math.round(aggregate.failedCoverage * 100)}% de las pruebas fallidas comparten ${aggregate.label}.`,
            aggregate.positiveReagents.length > 0
              ? `Coincidencias en fallidas: ${aggregate.positiveReagents.join(', ')}.`
              : 'No se listaron coincidencias nominales.',
          ],
          evidenceAgainst: [
            aggregate.negativeReagents.length > 0
              ? `${aggregate.negativeReagents.join(', ')} también usan el mismo filtro y permanecieron correctas.`
              : 'Menos del 30% de las pruebas correctas comparten el filtro.',
          ],
          confirmatoryActions: [rule?.confirmatoryAction || 'Comparar con otra técnica del mismo filtro y otra de filtro distinto.'],
          supportingFactorIds: [aggregate.factorId],
          matchedRuleIds: ['R001'],
          payload: {
            factorType: aggregate.factorType,
          },
        }),
      );
    });
    pushLog(logs, runId, 'success', 'rule.R001', 'Regla óptica/filtro activada', {
      factorIds: wavelengthHits.map((hit) => hit.factorId),
    });
  } else {
    pushLog(logs, runId, 'info', 'rule.R001', 'Regla óptica/filtro descartada', {});
  }

  const kineticFailed = getCoverageForFactorSet(aggregates, kineticFactorIds, 'failed');
  const endpointCorrect = getCoverageForFactorSet(aggregates, endpointFactorIds, 'correct');
  const enzymaticRiskCoverage = aggregates
    .filter((aggregate) => normalizeText(aggregate.label).includes('enzimático') || normalizeText(aggregate.label).includes('enzimatico'))
    .reduce((max, aggregate) => Math.max(max, aggregate.failedCoverage), 0);

  if (kineticFailed >= 0.6 && endpointCorrect >= 0.3) {
    const rule = diagnosticRuleLookup.R002;
    hypotheses.push(
      createHypothesis({
        key: 'rule:R002',
        title: rule?.hypothesis ?? 'Temperatura/refrigeración',
        score: Math.min(92, round(66 + kineticFailed * 18 + endpointCorrect * 12 + enzymaticRiskCoverage * 6)),
        evidenceFor: [
          `${Math.round(kineticFailed * 100)}% de fallidas pertenecen a grupos cinéticos/enzimáticos.`,
          `${Math.round(endpointCorrect * 100)}% de correctas siguen estables en punto final.`,
        ],
        evidenceAgainst: [
          endpointCorrect > 0.55
            ? 'Hay suficientes técnicas de punto final correctas para acotar el patrón.'
            : 'La muestra de pruebas correctas es limitada para descartar otros factores.',
        ],
        confirmatoryActions: [rule?.confirmatoryAction || 'Verificar temperatura, estabilidad y repetir con reactivo fresco.'],
        supportingFactorIds: Array.from(kineticFactorIds).filter((id) => aggregateById.has(id)),
        matchedRuleIds: ['R002'],
        payload: {
          kineticFailed,
          endpointCorrect,
        },
      }),
    );
    pushLog(logs, runId, 'success', 'rule.R002', 'Regla temperatura/reactivo activada', {
      kineticFailed,
      endpointCorrect,
    });
  } else {
    pushLog(logs, runId, 'info', 'rule.R002', 'Regla temperatura/reactivo descartada', {
      kineticFailed,
      endpointCorrect,
    });
  }

  const bireactiveFailed = getCoverageForFactorSet(aggregates, bireactiveFactorIds, 'failed');
  const monoreactiveCorrect = getCoverageForFactorSet(aggregates, monoreactiveFactorIds, 'correct');

  if (bireactiveFailed >= 0.6 && monoreactiveCorrect >= 0.3) {
    const rule = diagnosticRuleLookup.R003;
    hypotheses.push(
      createHypothesis({
        key: 'rule:R003',
        title: rule?.hypothesis ?? 'R2/agitación/dispensación',
        score: Math.min(92, round(65 + bireactiveFailed * 18 + monoreactiveCorrect * 14)),
        evidenceFor: [
          `${Math.round(bireactiveFailed * 100)}% de las fallidas son bireactivas.`,
          `${Math.round(monoreactiveCorrect * 100)}% de las correctas comparables siguen monoreactivas.`,
        ],
        evidenceAgainst: [
          correctReagents.length === 0
            ? 'No se registraron comparativos correctos; la hipótesis se mantiene con evidencia parcial.'
            : 'La comparación depende de que los pares monoreactivos sean realmente equivalentes.',
        ],
        confirmatoryActions: [rule?.confirmatoryAction || 'Revisar pipeteo R2, agitador y curvas L1/L2.'],
        supportingFactorIds: Array.from(bireactiveFactorIds).filter((id) => aggregateById.has(id)),
        matchedRuleIds: ['R003'],
        payload: {
          bireactiveFailed,
          monoreactiveCorrect,
        },
      }),
    );
    pushLog(logs, runId, 'success', 'rule.R003', 'Regla de R2/agitación activada', {
      bireactiveFailed,
      monoreactiveCorrect,
    });
  } else {
    pushLog(logs, runId, 'info', 'rule.R003', 'Regla de R2/agitación descartada', {
      bireactiveFailed,
      monoreactiveCorrect,
    });
  }

  const intermittentSignal = form.signals.intermittentPattern || form.failureDirection === 'unstable' || observationsText.includes('intermit');
  const sharedCorrectAgainstFailed = aggregates.some(
    (aggregate) => aggregate.failedCoverage > 0 && aggregate.correctCoverage > 0 && aggregate.correctCoverage >= 0.3,
  );

  if (intermittentSignal && sharedCorrectAgainstFailed) {
    const rule = diagnosticRuleLookup.R004;
    hypotheses.push(
      createHypothesis({
        key: 'rule:R004',
        title: rule?.hypothesis ?? 'Contaminación cruzada',
        score: Math.min(84, round(54 + (failedReagents.length === 1 ? 12 : 4) + (correctReagents.length > 0 ? 8 : 0))),
        evidenceFor: [
          'La falla fue marcada como inestable/intermitente.',
          'Existen factores compartidos entre fallidas y correctas, lo que sugiere dependencia del orden de corrida.',
        ],
        evidenceAgainst: [
          failedReagents.length > 1
            ? 'Hay más de una prueba afectada; revisar también hipótesis sistémicas.'
            : 'No se capturó la prueba previa potencialmente contaminante.',
        ],
        confirmatoryActions: [rule?.confirmatoryAction || 'Correr la prueba aislada y revisar carryover de punta/cubeta.'],
        supportingFactorIds: [],
        matchedRuleIds: ['R004'],
        payload: {
          intermittentSignal,
          sharedCorrectAgainstFailed,
        },
      }),
    );
    pushLog(logs, runId, 'success', 'rule.R004', 'Regla de contaminación cruzada activada', {});
  } else {
    pushLog(logs, runId, 'info', 'rule.R004', 'Regla de contaminación cruzada descartada', {
      intermittentSignal,
      sharedCorrectAgainstFailed,
    });
  }

  const waterFactorCoverage = getCoverageForFactorSet(aggregates, waterRiskFactorIds, 'failed');
  const explicitWaterPattern =
    form.signals.waterSensitivePattern ||
    failedReagents.some((reagent) =>
      reagentNameKeywordsForWater.some((keyword) => normalizeText(reagent.name).includes(keyword)),
    );

  if (waterFactorCoverage >= 0.34 || explicitWaterPattern) {
    const rule = diagnosticRuleLookup.R005;
    hypotheses.push(
      createHypothesis({
        key: 'rule:R005',
        title: rule?.hypothesis ?? 'Calidad de agua',
        score: Math.min(90, round(62 + waterFactorCoverage * 18 + (explicitWaterPattern ? 10 : 0))),
        evidenceFor: [
          explicitWaterPattern
            ? 'Se marcaron pruebas típicamente sensibles a agua/calidad de lavado.'
            : 'Los reactivos fallidos comparten sensibilidad operativa a agua.',
          waterFactorCoverage > 0 ? `${Math.round(waterFactorCoverage * 100)}% de las fallidas concentran el riesgo.` : 'La señal proviene del grupo de reactivos seleccionado.',
        ],
        evidenceAgainst: [
          correctReagents.length > 0
            ? 'Si reactivos igualmente sensibles permanecen correctos, revisar también contaminación localizada.'
            : 'Sin comparativos correctos para contrastar el patrón.',
        ],
        confirmatoryActions: [rule?.confirmatoryAction || 'Verificar agua, depósito, línea y blancos.'],
        supportingFactorIds: Array.from(waterRiskFactorIds).filter((id) => aggregateById.has(id)),
        matchedRuleIds: ['R005'],
        payload: {
          waterFactorCoverage,
          explicitWaterPattern,
        },
      }),
    );
    pushLog(logs, runId, 'success', 'rule.R005', 'Regla de calidad de agua activada', {
      waterFactorCoverage,
      explicitWaterPattern,
    });
  } else {
    pushLog(logs, runId, 'info', 'rule.R005', 'Regla de calidad de agua descartada', {
      waterFactorCoverage,
      explicitWaterPattern,
    });
  }

  if (form.eventType === 'qc_out_of_range' && form.signals.normalCurvesObserved) {
    const rule = diagnosticRuleLookup.R006;
    hypotheses.push(
      createHypothesis({
        key: 'rule:R006',
        title: rule?.hypothesis ?? 'Calibrador/control',
        score: Math.min(88, round(68 + (failedReagents.length <= 2 ? 8 : 0) + (correctReagents.length > 0 ? 6 : 0))),
        evidenceFor: [
          'El caso fue capturado como QC fuera de rango.',
          'Se marcaron curvas normales pese a la desviación del control.',
        ],
        evidenceAgainst: [
          wavelengthHits.length > 0
            ? 'También existe una coincidencia fuerte por filtro; confirmar antes de culpar al control/calibrador.'
            : 'No se detectó sesgo dominante por filtro en esta corrida.',
        ],
        confirmatoryActions: [rule?.confirmatoryAction || 'Revisar historial de calibración, lote y recalibrar si procede.'],
        supportingFactorIds: [],
        matchedRuleIds: ['R006'],
        payload: {
          eventType: form.eventType,
          normalCurvesObserved: form.signals.normalCurvesObserved,
        },
      }),
    );
    pushLog(logs, runId, 'success', 'rule.R006', 'Regla calibrador/control activada', {});
  } else {
    pushLog(logs, runId, 'info', 'rule.R006', 'Regla calibrador/control descartada', {
      eventType: form.eventType,
      normalCurvesObserved: form.signals.normalCurvesObserved,
    });
  }

  const opticalRejectSignal =
    form.signals.opticalRejectObserved ||
    form.eventType === 'failed_blank' ||
    observationsText.includes('rechazo óptico') ||
    observationsText.includes('cubeta') ||
    observationsText.includes('burbuja') ||
    observationsText.includes('lavado');

  if (opticalRejectSignal) {
    const rule = diagnosticRuleLookup.R007;
    hypotheses.push(
      createHypothesis({
        key: 'rule:R007',
        title: rule?.hypothesis ?? 'Cubeta/lavado/óptica local',
        score: Math.min(90, round(64 + (form.eventType === 'failed_blank' ? 10 : 0) + (form.signals.opticalRejectObserved ? 10 : 0))),
        evidenceFor: [
          form.eventType === 'failed_blank'
            ? 'El evento fue capturado como blanco fallido.'
            : 'Se marcó rechazo óptico/indicador visual compatible con cubeta o lavado.',
          'Las causas compatibles incluyen cubeta sucia, burbuja, lavado o secado deficiente.',
        ],
        evidenceAgainst: [
          wavelengthHits.length > 0
            ? 'Existe además un patrón por filtro que debe descartarse primero.'
            : 'Sin patrón exclusivo de filtro, la óptica local gana peso.',
        ],
        confirmatoryActions: [rule?.confirmatoryAction || 'Revisar cubetas, lavado, secado y línea base.'],
        supportingFactorIds: wavelengthHits.slice(0, 2).map((aggregate) => aggregate.factorId),
        matchedRuleIds: ['R007'],
        payload: {
          opticalRejectSignal,
        },
      }),
    );
    pushLog(logs, runId, 'success', 'rule.R007', 'Regla cubeta/lavado activada', {
      opticalRejectSignal,
    });
  } else {
    pushLog(logs, runId, 'info', 'rule.R007', 'Regla cubeta/lavado descartada', {
      opticalRejectSignal,
    });
  }

  return hypotheses;
};

export function runDriEngine(form: DriCaseFormState, catalog: DriCatalog): DriEngineResult {
  const runId = crypto.randomUUID();
  const logs: DriLogEntry[] = [];
  const reagentById = new Map(catalog.reagents.map((reagent) => [reagent.id, reagent]));

  const failedReagents = form.failedReagentIds
    .map((id) => reagentById.get(id))
    .filter((reagent): reagent is DriReagent => Boolean(reagent));
  const correctReagents = form.correctReagentIds
    .map((id) => reagentById.get(id))
    .filter((reagent): reagent is DriReagent => Boolean(reagent));

  pushLog(logs, runId, 'info', 'input.summary', 'Caso recibido por motor DRI', {
    equipmentModel: form.equipmentModel,
    serialNumber: form.serialNumber,
    eventType: form.eventType,
    failureDirection: form.failureDirection,
    failedReagentIds: failedReagents.map((reagent) => reagent.id),
    correctReagentIds: correctReagents.map((reagent) => reagent.id),
    signals: form.signals,
  });

  const factorAggregates = buildFactorAggregates(catalog, failedReagents, correctReagents, logs, runId);
  const evidenceRows = buildEvidenceRows(factorAggregates);
  const genericHypotheses = createGenericFactorHypotheses(factorAggregates, logs, runId);
  const ruleHypotheses = buildRuleHypotheses(form, failedReagents, correctReagents, factorAggregates, logs, runId);

  const hypotheses = [...ruleHypotheses, ...genericHypotheses]
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);

  hypotheses.forEach((hypothesis) => {
    pushLog(logs, runId, 'success', 'hypothesis.final', `Hipótesis final ${hypothesis.title}`, {
      hypothesisKey: hypothesis.key,
      score: hypothesis.score,
      probability: hypothesis.probabilityLabel,
      matchedRuleIds: hypothesis.matchedRuleIds,
    });
  });

  console.groupCollapsed(
    `[DRI] ${form.equipmentModel} ${form.serialNumber || 'sin-serie'} · ${failedReagents.length} fallida(s) / ${correctReagents.length} correcta(s)`,
  );
  console.table(
    factorAggregates.map((aggregate) => ({
      factor: aggregate.label,
      tipo: aggregate.factorType,
      fallidas: aggregate.failedCoverage,
      correctas: aggregate.correctCoverage,
      peso: aggregate.meanLinkWeight,
      score: aggregate.suspicionScore,
    })),
  );
  console.table(
    hypotheses.map((hypothesis) => ({
      hypothesis: hypothesis.title,
      score: hypothesis.score,
      probability: hypothesis.probabilityLabel,
      rules: hypothesis.matchedRuleIds.join(', '),
    })),
  );
  console.groupEnd();

  return {
    runId,
    factorAggregates,
    evidenceRows,
    hypotheses,
    logs,
  };
}
