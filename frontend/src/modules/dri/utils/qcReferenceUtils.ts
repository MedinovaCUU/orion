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

export const extractQcReferences = (reagent: DriReagent): DriQcReference[] => {
  const technicalProfile = reagent.technicalProfile || {};
  const qcRoot = (technicalProfile.qc_reference || technicalProfile.qcReference) as { references?: unknown } | undefined;
  if (!qcRoot || !Array.isArray(qcRoot.references)) {
    return [];
  }

  return qcRoot.references.flatMap((candidate) => {
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
};

const controlLevelMatches = (formLevel: DriCaseFormState['controlLevel'], referenceLevel: DriQcReferenceControlLevel) =>
  formLevel === 'both' || formLevel === referenceLevel;

export const findQcReferenceById = (catalog: DriCatalog, referenceId: string) => {
  if (!referenceId.trim()) return null;
  for (const reagent of catalog.reagents) {
    const found = extractQcReferences(reagent).find((reference) => reference.id === referenceId);
    if (found) return found;
  }
  return null;
};

export const getMatchingQcReferences = (catalog: DriCatalog, form: DriCaseFormState) => {
  if (!form.failedReagentIds.length || form.controlLevel === 'not_applicable') {
    return [] as DriQcReference[];
  }

  const lotFilter = form.controlLot.trim().toLowerCase();

  const allCandidates = catalog.reagents
    .filter((reagent) => form.failedReagentIds.includes(reagent.id))
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
      if (left.reagentId !== right.reagentId) return form.failedReagentIds.indexOf(left.reagentId) - form.failedReagentIds.indexOf(right.reagentId);
      if (left.controlLevel !== right.controlLevel) return left.controlLevel.localeCompare(right.controlLevel);
      if (leftLot !== rightLot) return rightLot.localeCompare(leftLot);
      if ((left.unit || '') !== (right.unit || '')) return (left.unit || '').localeCompare(right.unit || '');
      return (left.methodName || '').localeCompare(right.methodName || '');
    })
    .forEach((reference) => {
      unique.set(reference.id, reference);
    });

  return Array.from(unique.values());
};

export const assessQcReference = (reference: DriQcReference | null, obtainedValue: string): DriQcAssessment | null => {
  if (!reference) {
    return null;
  }

  const obtained = toNumber(obtainedValue);
  if (obtained === null) {
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
