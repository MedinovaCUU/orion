export interface DriDilutionAssessment {
  exactHalfPattern: boolean;
  nonProportionalPattern: boolean;
  explanation: string | null;
}

const safeNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const assessDilutionPattern = (expectedValue: string, obtainedValue: string): DriDilutionAssessment => {
  const expected = safeNumber(expectedValue);
  const obtained = safeNumber(obtainedValue);

  if (!expected || !obtained) {
    return {
      exactHalfPattern: false,
      nonProportionalPattern: false,
      explanation: null,
    };
  }

  const ratio = obtained / expected;
  const exactHalfPattern = Math.abs(ratio - 0.5) <= 0.03;
  const nonProportionalPattern = ratio < 0.43 || ratio > 0.57;

  return {
    exactHalfPattern,
    nonProportionalPattern,
    explanation: exactHalfPattern
      ? `La relación ${obtained}/${expected} se comporta como una dilución 1:2 sin corrección de factor.`
      : nonProportionalPattern
        ? `La relación ${obtained}/${expected} no se comporta como una dilución proporcional esperada.`
        : null,
  };
};
