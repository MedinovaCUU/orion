import type {
  DriCaseFormState,
  DriCatalog,
  DriQcAssessment,
  DriQcReference,
  DriQcReferenceControlLevel,
  DriReagent,
} from '../types/dri.types';

const toNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeControlLevel = (value: unknown): DriQcReferenceControlLevel | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'i' || normalized === 'level_1' || normalized === 'nivel_1' || normalized === '1') return 'level_1';
  if (normalized === 'ii' || normalized === 'level_2' || normalized === 'nivel_2' || normalized === '2') return 'level_2';
  return null;
};

const buildReferenceId = (parts: Array<string | null | undefined>) =>
  parts
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('::');

const normalizeTextKey = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const normalizeUnitKey = (value: unknown) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/Μ/g, 'µ')
    .replace(/μ/g, 'µ')
    .replace(/\s+/g, '');

const roundForKey = (value: number | null) => (value === null ? '' : value.toFixed(6));

const buildSemanticReferenceKey = (reference: DriQcReference) =>
  [
    reference.reagentId,
    normalizeTextKey(reference.lot),
    reference.controlLevel,
    normalizeTextKey(reference.analyteName),
    normalizeTextKey(reference.methodName),
    normalizeUnitKey(reference.unit),
    roundForKey(reference.targetValue),
    roundForKey(reference.sd1),
    roundForKey(reference.sd1Low),
    roundForKey(reference.sd1High),
    roundForKey(reference.rejectLow),
    roundForKey(reference.rejectHigh),
  ].join('::');

const buildDisplayReferenceKey = (reference: DriQcReference) =>
  [
    reference.reagentDisplayCode || reference.reagentId,
    normalizeTextKey(reference.lot),
    reference.controlLevel,
    normalizeTextKey(reference.analyteName),
    normalizeTextKey(reference.methodName),
  ].join('::');

const GENERIC_UNIT_PRIORITY = [
  'U/L',
  'mg/dL',
  'g/L',
  'mg/L',
  'mmol/L',
  'µmol/L',
  'µkat/L',
  'nkat/L',
];

const getGenericUnitPriority = (unit: string | null) => {
  const normalized = normalizeUnitKey(unit);
  const index = GENERIC_UNIT_PRIORITY.findIndex((candidate) => normalizeUnitKey(candidate) === normalized);
  return index === -1 ? GENERIC_UNIT_PRIORITY.length : index;
};

const getPreferredUnitsForReagent = (reagent: DriReagent) => {
  const technicalProfile = (reagent.technicalProfile || {}) as Record<string, unknown>;
  const ifuFacts =
    technicalProfile.ifuFacts && typeof technicalProfile.ifuFacts === 'object'
      ? (technicalProfile.ifuFacts as Record<string, unknown>)
      : {};

  const candidates = [
    ifuFacts.linearityLimitUnit,
    ifuFacts.detectionLimitUnit,
    ifuFacts.quantificationLimitUnit,
    ifuFacts.linearityLimitAlternateUnit,
    ifuFacts.detectionLimitAlternateUnit,
    ifuFacts.quantificationLimitAlternateUnit,
  ]
    .map((value) => normalizeUnitKey(value))
    .filter(Boolean);

  return Array.from(new Set(candidates));
};

const scoreReferenceForDisplay = (reference: DriQcReference, reagent: DriReagent) => {
  const normalizedUnit = normalizeUnitKey(reference.unit);
  const preferredUnits = getPreferredUnitsForReagent(reagent);
  const preferredIndex = preferredUnits.indexOf(normalizedUnit);

  let score = 0;
  if (preferredIndex === 0) {
    score += 240;
  } else if (preferredIndex > 0) {
    score += 180 - preferredIndex * 20;
  }

  score += Math.max(0, 50 - getGenericUnitPriority(reference.unit) * 6);

  if (reference.sourceStatus === 'validated') score += 24;
  if (reference.methodName) score += 10;
  if (reference.productCode) score += 6;
  if (reference.matchConfidence === 'validated') score += 8;

  return score;
};

export const extractQcReferences = (reagent: DriReagent): DriQcReference[] => {
  const technicalProfile = reagent.technicalProfile || {};
  const qcRoot = (technicalProfile.qc_reference || technicalProfile.qcReference) as { references?: unknown } | undefined;
  if (!qcRoot || !Array.isArray(qcRoot.references)) {
    return [];
  }

  const extracted = qcRoot.references.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      return [];
    }
    const row = candidate as Record<string, unknown>;
    const targetValue = toNumber(row.targetValue);
    const sd1 = toNumber(row.sd1);
    const sd1Low = toNumber(row.sd1Low);
    const sd1High = toNumber(row.sd1High);
    const rejectLow = toNumber(row.rejectLow);
    const rejectHigh = toNumber(row.rejectHigh);
    const controlLevel = normalizeControlLevel(row.controlLevel);

    if (
      !controlLevel ||
      targetValue === null ||
      sd1 === null ||
      sd1Low === null ||
      sd1High === null ||
      rejectLow === null ||
      rejectHigh === null
    ) {
      return [];
    }

    return [{
      id:
        typeof row.id === 'string' && row.id.trim()
          ? row.id
          : buildReferenceId([
              reagent.id,
              row.productCode as string | null,
              row.lot as string | null,
              controlLevel,
              row.unit as string | null,
              row.methodName as string | null,
            ]),
      reagentId: reagent.id,
      reagentDisplayCode: reagent.displayCode || reagent.referenceCode || reagent.id,
      reagentDisplayName: reagent.displayName || reagent.name,
      productCode: String(row.productCode || '').trim(),
      lot: row.lot ? String(row.lot).trim() : null,
      controlLevel,
      analyteName: String(row.analyteName || reagent.name).trim(),
      methodName: row.methodName ? String(row.methodName).trim() : null,
      unit: row.unit ? String(row.unit).trim() : null,
      targetValue,
      sd1,
      sd1Low,
      sd1High,
      sd2Low: toNumber(row.sd2Low),
      sd2High: toNumber(row.sd2High),
      rejectLow,
      rejectHigh,
      traceability: row.traceability ? String(row.traceability).trim() : null,
      matchConfidence: row.matchConfidence ? String(row.matchConfidence).trim() : null,
      sourceStatus: (row.sourceStatus as DriQcReference['sourceStatus']) || 'validated',
      sourceType: (row.sourceType as DriQcReference['sourceType']) || 'manual',
      sourceReference: String(row.sourceReference || 'einfo.bio valuesheet').trim(),
    }];
  });

  const deduped = new Map<string, DriQcReference>();
  extracted.forEach((reference) => {
    const key = buildSemanticReferenceKey(reference);
    const current = deduped.get(key);
    if (!current || current.sourceStatus !== 'validated') {
      deduped.set(key, reference);
    }
  });

  return Array.from(deduped.values());
};

const controlLevelMatches = (formLevel: DriCaseFormState['controlLevel'], referenceLevel: DriQcReferenceControlLevel) =>
  formLevel === 'both' || formLevel === 'not_applicable' || formLevel === referenceLevel;

export const findQcReferenceById = (catalog: DriCatalog, referenceId: string) => {
  if (!referenceId.trim()) return null;
  for (const reagent of catalog.reagents) {
    const found = extractQcReferences(reagent).find((reference) => reference.id === referenceId);
    if (found) return found;
  }
  return null;
};

export const getMatchingQcReferences = (
  catalog: DriCatalog,
  form: DriCaseFormState,
  reagentIdsOverride?: string[],
) => {
  const reagentIds = reagentIdsOverride?.length ? reagentIdsOverride : form.failedReagentIds;

  if (!reagentIds.length) {
    return [] as DriQcReference[];
  }

  const lotFilter = form.controlLot.trim().toLowerCase();

  const allCandidates = catalog.reagents
    .filter((reagent) => reagentIds.includes(reagent.id))
    .flatMap((reagent) => extractQcReferences(reagent))
    .filter((reference) => controlLevelMatches(form.controlLevel, reference.controlLevel));

  const lotMatchedCandidates = lotFilter
    ? allCandidates.filter((reference) => reference.lot?.toLowerCase() === lotFilter)
    : allCandidates;

  const candidates = lotMatchedCandidates.length ? lotMatchedCandidates : allCandidates;

  const unique = new Map<string, DriQcReference>();
  candidates
    .sort((left, right) => {
      const leftLot = left.lot || '';
      const rightLot = right.lot || '';
      if (left.reagentId !== right.reagentId) return reagentIds.indexOf(left.reagentId) - reagentIds.indexOf(right.reagentId);
      if (left.controlLevel !== right.controlLevel) return left.controlLevel.localeCompare(right.controlLevel);
      if (leftLot !== rightLot) return rightLot.localeCompare(leftLot);
      if ((left.unit || '') !== (right.unit || '')) return (left.unit || '').localeCompare(right.unit || '');
      return (left.methodName || '').localeCompare(right.methodName || '');
    })
    .forEach((reference) => {
      const reagent = catalog.reagents.find((candidateReagent) => candidateReagent.id === reference.reagentId);
      if (!reagent) {
        unique.set(buildDisplayReferenceKey(reference), reference);
        return;
      }

      const key = buildDisplayReferenceKey(reference);
      const current = unique.get(key);
      if (!current) {
        unique.set(key, reference);
        return;
      }

      const currentScore = scoreReferenceForDisplay(current, reagent);
      const nextScore = scoreReferenceForDisplay(reference, reagent);
      if (nextScore > currentScore) {
        unique.set(key, reference);
      }
    });

  return Array.from(unique.values()).sort((left, right) => {
    const leftIndex = reagentIds.indexOf(left.reagentId);
    const rightIndex = reagentIds.indexOf(right.reagentId);
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    if (left.controlLevel !== right.controlLevel) return left.controlLevel.localeCompare(right.controlLevel);
    return (left.reagentDisplayCode || left.reagentId).localeCompare(right.reagentDisplayCode || right.reagentId);
  });
};

export const assessQcReference = (
  reference: DriQcReference | null,
  obtainedValue: string,
  options?: { assumeNeutralWhenMissing?: boolean },
): DriQcAssessment | null => {
  if (!reference) {
    return null;
  }

  const obtained = toNumber(obtainedValue);
  if (obtained === null) {
    if (options?.assumeNeutralWhenMissing) {
      return {
        referenceId: reference.id,
        obtainedValue: null,
        delta: 0,
        zScore: 0,
        band: 'within_1s',
        explanation: `No se capturó valor para ${reference.analyteName}; DRI lo toma como neutral y dentro de 1SD hasta recibir el dato real.`,
        assumedNeutral: true,
      };
    }
    return {
      referenceId: reference.id,
      obtainedValue: null,
      delta: null,
      zScore: null,
      band: 'non_numeric',
      explanation: `La referencia QC de ${reference.analyteName} quedó ligada, pero el valor obtenido no es numérico todavía.`,
    };
  }

  const delta = obtained - reference.targetValue;
  const zScore = reference.sd1 ? delta / reference.sd1 : null;

  if (obtained < reference.rejectLow || obtained > reference.rejectHigh) {
    return {
      referenceId: reference.id,
      obtainedValue: obtained,
      delta,
      zScore,
      band: 'out_of_reject',
      explanation: `El resultado ${obtained} ${reference.unit || ''} quedó fuera de rechazo (${reference.rejectLow} a ${reference.rejectHigh}).`,
    };
  }

  if (
    reference.sd2Low !== null &&
    reference.sd2High !== null &&
    (obtained < reference.sd2Low || obtained > reference.sd2High)
  ) {
    return {
      referenceId: reference.id,
      obtainedValue: obtained,
      delta,
      zScore,
      band: 'near_reject',
      explanation: `El resultado ${obtained} ${reference.unit || ''} ya rebasó 2SD y quedó cerca del rechazo (${reference.rejectLow} a ${reference.rejectHigh}).`,
    };
  }

  if (obtained < reference.sd1Low || obtained > reference.sd1High) {
    return {
      referenceId: reference.id,
      obtainedValue: obtained,
      delta,
      zScore,
      band: 'within_2s',
      explanation: `El resultado ${obtained} ${reference.unit || ''} salió fuera de 1SD pero todavía no toca 2SD.`,
    };
  }

  return {
    referenceId: reference.id,
    obtainedValue: obtained,
    delta,
    zScore,
    band: 'within_1s',
    explanation: `El resultado ${obtained} ${reference.unit || ''} quedó dentro de la primera desviación estándar.`,
  };
};
