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

const parseOptionalNumeric = (value: string | number | null | undefined) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const parsed = Number(value.replace(',', '.').trim());
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
      const observed = observedInterferents.find(
        (candidate) =>
          candidate.interferent === threshold.interferent &&
          normalizeUnit(candidate.unit) === normalizeUnit(threshold.unit),
      );

      if (!observed || observed.value <= threshold.thresholdValue) {
        return;
      }

      findings.push({
        id: `interference:${profile.id}:${threshold.interferent}`,
        type: 'interference',
        reagentId: profile.id,
        reagentCode: profile.referenceCode.value || profile.id,
        title: `${profile.referenceCode.value || profile.id} · posible interferencia por ${threshold.label}`,
        explanation: `${threshold.label} observada ${observed.value} ${observed.unit}; el IFU indica no interferencia solo hasta ${threshold.thresholdValue} ${threshold.unit}.`,
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
