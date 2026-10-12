import type {
  DriCaseFormState,
  DriQcAssessment,
  DriQcReference,
  DriReagentProfile,
} from '../types/dri.types';

type DriProcedureFindingType = 'interference' | 'linearity' | 'detection' | 'quantification';

export interface DriProcedureFinding {
  id: string;
  type: DriProcedureFindingType;
  reagentId: string;
  reagentCode: string;
  title: string;
  explanation: string;
  score: number;
  source: 'ifu' | 'observations' | 'qc_reference';
  interferent?: string;
}

const normalizeUnit = (value?: string | null) => (value || '').replace(/\s+/g, '').toLowerCase();

/** Factor a mg/dL para unidades de masa por volumen (g/L ×100, mg/L ×0.1, g/dL ×1000); null si no es convertible. */
const MASS_TO_MG_DL: Record<string, number> = { 'mg/dl': 1, 'g/l': 100, 'mg/l': 0.1, 'g/dl': 1000 };

/** Lleva un valor de interferente a la unidad del umbral cuando ambas son de masa por volumen. */
const toThresholdUnit = (value: number, unit: string, thresholdUnit: string) => {
  if (normalizeUnit(unit) === normalizeUnit(thresholdUnit)) return value;
  const from = MASS_TO_MG_DL[normalizeUnit(unit)];
  const to = MASS_TO_MG_DL[normalizeUnit(thresholdUnit)];
  return from && to ? (value * from) / to : null;
};

const parseOptionalNumeric = (value: string | number | null | undefined) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.replace(',', '.').trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseObservedInterferents = (observations: string) => {
  const matches: Array<{ interferent: string; label: string; value: number; unit: string }> = [];
  const patterns = [
    {
      interferent: 'bilirubin',
      label: 'Bilirrubina',
      regex: /bilirrubina[^\d]{0,24}(\d+(?:[.,]\d+)?)\s*(mg\/dl|g\/l|mmol\/l)/gi,
    },
    {
      interferent: 'hemolysis',
      label: 'Hemólisis / hemoglobina',
      regex: /(?:hem[oó]lisis|hemoglobina)[^\d]{0,24}(\d+(?:[.,]\d+)?)\s*(mg\/dl|g\/l|mmol\/l)/gi,
    },
    {
      interferent: 'lipemia',
      label: 'Lipemia / triglicéridos',
      regex: /(?:lipemia|triglic[eé]ridos)[^\d]{0,24}(\d+(?:[.,]\d+)?)\s*(mg\/dl|g\/l|mmol\/l)/gi,
    },
  ] as const;

  for (const pattern of patterns) {
    for (const match of observations.matchAll(pattern.regex)) {
      const value = parseOptionalNumeric(match[1]);
      if (value === null) {
        continue;
      }
      matches.push({
        interferent: pattern.interferent,
        label: pattern.label,
        value,
        unit: match[2],
      });
    }
  }

  return matches;
};

export const assessProcedureLimitations = ({
  form,
  failedProfiles,
  matchedQcReference,
  reagentQcReferenceById,
  reagentQcAssessmentById,
}: {
  form: DriCaseFormState;
  failedProfiles: DriReagentProfile[];
  matchedQcReference: DriQcReference | null;
  reagentQcReferenceById?: Map<string, DriQcReference>;
  reagentQcAssessmentById?: Map<string, DriQcAssessment>;
}) => {
  const findings: DriProcedureFinding[] = [];
  const observations = form.observations || '';
  const observedInterferents = parseObservedInterferents(observations);

  failedProfiles.forEach((profile) => {
    profile.interferenceThresholds.value.forEach((threshold) => {
      // La observación puede venir en otra unidad de masa (12 g/L de hemoglobina contra un umbral en mg/dL).
      // Si el IFU declara interferencia sin nivel seguro, cualquier valor observado cuenta, en cualquier unidad.
      // «Interfiere si está elevada» no tiene un nivel comparable con lo observado: solo se muestra en la ficha.
      if (threshold.condition === 'elevated') return;
      const observed = observedInterferents
        .filter((candidate) => candidate.interferent === threshold.interferent)
        .map((candidate) => {
          // Un índice HIL en 0 no es interferencia aunque el IFU no declare un nivel seguro.
          if (threshold.anyLevel) return candidate.value > 0 ? { ...candidate, original: `${candidate.value} ${candidate.unit}` } : null;
          const converted = toThresholdUnit(candidate.value, candidate.unit, threshold.unit);
          return converted === null ? null : { ...candidate, value: converted, unit: threshold.unit, original: `${candidate.value} ${candidate.unit}` };
        })
        .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
        // Se evalúan todas las menciones: gana la mayor (una toma baja en g/L no oculta otra alta en mg/dL).
        .sort((left, right) => right.value - left.value)[0];

      // «no interfiere hasta N»: solo por encima de N hay riesgo. «interfiere (N)»: desde N ya hay interferencia.
      const interferesFromThreshold = threshold.effect === 'may_interfere_above';
      if (!observed || (!threshold.anyLevel && (interferesFromThreshold ? observed.value < threshold.thresholdValue : observed.value <= threshold.thresholdValue))) {
        return;
      }

      findings.push({
        id: `interference:${profile.id}:${threshold.interferent}`,
        type: 'interference',
        reagentId: profile.id,
        reagentCode: profile.referenceCode.value || profile.id,
        title: `${profile.referenceCode.value || profile.id} · posible interferencia por ${threshold.label}`,
        explanation: threshold.anyLevel
          ? `${threshold.label} observada ${observed.original}; el IFU declara que interfiere${threshold.testedUpTo ? ` (probada hasta ${threshold.testedUpTo.value} ${threshold.testedUpTo.unit})` : ''}, sin un nivel seguro.`
          : interferesFromThreshold
          ? `${threshold.label} observada ${observed.original}; el IFU declara interferencia desde ${threshold.thresholdValue} ${threshold.unit}.`
          : `${threshold.label} observada ${observed.original}; el IFU indica no interferencia solo hasta ${threshold.thresholdValue} ${threshold.unit}.`,
        score: 82,
        source: 'observations',
        interferent: threshold.interferent,
      });
    });
  });

  failedProfiles.forEach((profile) => {
      const profileReference =
        (matchedQcReference?.reagentId === profile.id ? matchedQcReference : null) ||
        reagentQcReferenceById?.get(profile.id) ||
        null;
      const measurement = form.reagentMeasurements[profile.id];
      const obtainedValue = parseOptionalNumeric(
        measurement?.obtainedValue || (failedProfiles.length === 1 ? form.obtainedValue : ''),
      );
      const matchedUnit = normalizeUnit(profileReference?.unit || measurement?.unit || '');
      const assessment = reagentQcAssessmentById?.get(profile.id) || null;
      if (obtainedValue === null || assessment?.assumedNeutral) {
        return;
      }

      const reagentCode = profile.referenceCode.value || profile.id;
      const linearityLimit = profile.linearityLimit.value;
      const detectionLimit = profile.detectionLimit.value;
      const quantificationLimit = profile.quantificationLimit.value;

      if (
        linearityLimit &&
        matchedUnit &&
        matchedUnit === normalizeUnit(linearityLimit.unit) &&
        obtainedValue > linearityLimit.value
      ) {
        findings.push({
          id: `linearity:${profile.id}`,
          type: 'linearity',
          reagentId: profile.id,
          reagentCode,
          title: `${reagentCode} · fuera de linealidad IFU`,
          explanation: `El valor capturado (${obtainedValue} ${linearityLimit.unit}) supera el límite de linealidad del IFU (${linearityLimit.value} ${linearityLimit.unit}).`,
          score: 86,
          source: profileReference ? 'qc_reference' : 'ifu',
        });
      }

      if (
        detectionLimit &&
        matchedUnit &&
        matchedUnit === normalizeUnit(detectionLimit.unit) &&
        obtainedValue < detectionLimit.value
      ) {
        findings.push({
          id: `detection:${profile.id}`,
          type: 'detection',
          reagentId: profile.id,
          reagentCode,
          title: `${reagentCode} · por debajo del límite de detección`,
          explanation: `El valor capturado (${obtainedValue} ${detectionLimit.unit}) está por debajo del límite de detección del IFU (${detectionLimit.value} ${detectionLimit.unit}).`,
          score: 74,
          source: profileReference ? 'qc_reference' : 'ifu',
        });
      }

      if (
        quantificationLimit &&
        matchedUnit &&
        matchedUnit === normalizeUnit(quantificationLimit.unit) &&
        obtainedValue < quantificationLimit.value
      ) {
        findings.push({
          id: `quantification:${profile.id}`,
          type: 'quantification',
          reagentId: profile.id,
          reagentCode,
          title: `${reagentCode} · por debajo del límite de cuantificación`,
          explanation: `El valor capturado (${obtainedValue} ${quantificationLimit.unit}) cae por debajo del límite de cuantificación del IFU (${quantificationLimit.value} ${quantificationLimit.unit}).`,
          score: 76,
          source: profileReference ? 'qc_reference' : 'ifu',
        });
      }
  });

  const sortedFindings = [...findings].sort((left, right) => right.score - left.score);

  return {
    findings: sortedFindings,
    hasInterference: sortedFindings.some((item) => item.type === 'interference'),
    hasMetrologyLimit: sortedFindings.some((item) => item.type !== 'interference'),
  };
};
