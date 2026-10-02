import type { SatQcResult } from '../../sat-report/satReportTypes';
import { getCanonicalReagentKey, getReagentDisplayCode } from '../knowledge/reagentIdentity';
import type {
  DriCatalog,
  DriQcAssessment,
  DriQcReference,
  DriReagent,
  DriReagentMeasurementInput,
} from '../types/dri.types';
import { assessQcReference, extractQcReferences } from './qcReferenceUtils';

export interface ClassifiedSatQcResult {
  result: SatQcResult;
  reagent: DriReagent | null;
  reference: DriQcReference | null;
  assessment: DriQcAssessment | null;
  outcome: 'correct' | 'failed' | 'pending';
  matchConfidence: 'exact' | 'compatible' | 'unmatched';
}

export interface SatQcFormProjection {
  failedReagentIds: string[];
  correctReagentIds: string[];
  reagentMeasurements: Record<string, DriReagentMeasurementInput>;
  classified: ClassifiedSatQcResult[];
  matchedCount: number;
  pendingCount: number;
}

const normalizeText = (value: string | null | undefined) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[-_/()]+/g, ' ')
    .replace(/\b(CONTROL|SERUM|SUERO|LEVEL|NIVEL|BIOCHEMISTRY|GENERAL)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeUnit = (value: string | null | undefined) => {
  const normalized = (value || '')
    .toUpperCase()
    .replace(/Μ|Μ|μ/g, 'µ')
    .replace(/\s+/g, '')
    .replace(/PER/g, '/');
  const aliases: Record<string, string> = {
    UL: 'U/L',
    'U/L': 'U/L',
    GDL: 'G/DL',
    'G/DL': 'G/DL',
    GL: 'G/L',
    'G/L': 'G/L',
    MGDL: 'MG/DL',
    'MG/DL': 'MG/DL',
    MGL: 'MG/L',
    'MG/L': 'MG/L',
    MMOLL: 'MMOL/L',
    'MMOL/L': 'MMOL/L',
    UMOLL: 'µMOL/L',
    'µMOL/L': 'µMOL/L',
    UKATL: 'µKAT/L',
    'µKAT/L': 'µKAT/L',
  };
  return aliases[normalized] || normalized;
};

const reagentCandidates = (reagent: DriReagent) =>
  new Set(
    [
      reagent.id,
      reagent.name,
      reagent.displayCode,
      reagent.displayName,
      reagent.referenceCode,
      getCanonicalReagentKey(reagent),
      getReagentDisplayCode(reagent),
      ...(reagent.canonicalNames || []),
    ]
      .map(normalizeText)
      .filter(Boolean),
  );

const TEST_ALIASES: Record<string, string> = {
  ALP: 'ALP AMP',
  ALT: 'ALT GPT',
  'AMYDIR': 'AMY',
  AST: 'AST GOT',
  BILD: 'BIL D',
  BILT: 'BIL T',
  'CAAZO': 'CA ARS',
  'CKMB': 'CK MB',
  CREAENZ: 'CREA ENZ',
  'DBILDPD': 'BIL D',
  GLUHK: 'GLU HK',
  'HBA1CDI': 'HGB',
  'HDLTOOS': 'HDL TOOS',
  LDHIFCC: 'LDH IFCC',
  'LIPDGGR': 'LIPASA',
  PROTT: 'PROT T',
  PROTU: 'PROT U',
  'TBILDPD': 'BIL T',
  'TPROTB': 'PROT T',
  TRIG: 'TG',
  UREA: 'UREA UV',
};

const resolveReagent = (catalog: DriCatalog, result: SatQcResult) => {
  if (result.reagentId) {
    const explicit = catalog.reagents.find((reagent) => reagent.id === result.reagentId);
    if (explicit) return explicit;
  }
  const resultKeys = [result.testKey, result.testShortName, result.testName]
    .map(normalizeText)
    .flatMap((key) => [key, TEST_ALIASES[key.replace(/\s/g, '')] || ''])
    .filter(Boolean);

  return (
    catalog.reagents.find((reagent) => {
      const candidates = reagentCandidates(reagent);
      return resultKeys.some((key) => candidates.has(key));
    }) || null
  );
};

const chooseReference = (reagent: DriReagent, result: SatQcResult) => {
  if (result.controlLevel !== 'level_1' && result.controlLevel !== 'level_2') {
    return { reference: null, confidence: 'unmatched' as const };
  }
  const resolvedControlLevel = result.controlLevel;
  const expectedUnit = normalizeUnit(result.unit);
  const candidates = extractQcReferences(reagent).filter(
    (reference) =>
      reference.controlLevel === resolvedControlLevel &&
      (!expectedUnit || normalizeUnit(reference.unit) === expectedUnit),
  );
  const analyzerReference = (): DriQcReference | null => {
    if (result.analyzerMin === null || result.analyzerMax === null || result.analyzerMin >= result.analyzerMax) return null;
    const target = result.analyzerTarget ?? (result.analyzerMin + result.analyzerMax) / 2;
    const sd = result.analyzerSd && result.analyzerSd > 0
      ? result.analyzerSd
      : (result.analyzerMax - result.analyzerMin) / 6;
    return {
      id: `sat-analyzer::${result.serialNumber}::${result.testKey}::${result.controlLevel}`,
      reagentId: reagent.id,
      reagentDisplayCode: getReagentDisplayCode(reagent),
      reagentDisplayName: reagent.displayName || reagent.name,
      productCode: 'ANALYZER',
      lot: result.controlLot,
      controlLevel: resolvedControlLevel,
      analyteName: result.testName,
      methodName: 'Límites configurados en el analizador',
      unit: result.unit,
      targetValue: target,
      sd1: sd,
      sd1Low: target - sd,
      sd1High: target + sd,
      sd2Low: target - 2 * sd,
      sd2High: target + 2 * sd,
      rejectLow: result.analyzerMin,
      rejectHigh: result.analyzerMax,
      traceability: 'Configuración QC del equipo',
      matchConfidence: 'compatible',
      sourceStatus: 'user_captured',
      sourceType: 'ba400_export',
      sourceReference: `SAT ${result.serialNumber} · ${result.resultAt}`,
    };
  };
  if (!candidates.length) {
    const fallback = analyzerReference();
    return { reference: fallback, confidence: fallback ? 'compatible' as const : 'unmatched' as const };
  }

  const exactLot = result.controlLot
    ? candidates.filter((reference) => normalizeText(reference.lot) === normalizeText(result.controlLot))
    : [];
  if (exactLot.length === 1) return { reference: exactLot[0], confidence: 'exact' as const };
  if (exactLot.length > 1) {
    const closest = [...exactLot].sort(
      (left, right) =>
        Math.abs(result.resultValue - left.targetValue) - Math.abs(result.resultValue - right.targetValue),
    )[0];
    return { reference: closest, confidence: 'exact' as const };
  }

  // A result without a matching lot is only safe when EInfo exposes one unique
  // reference for the reagent + level + unit. Multiple lots stay pending.
  if (candidates.length === 1) return { reference: candidates[0], confidence: 'compatible' as const };
  const fallback = analyzerReference();
  return { reference: fallback, confidence: fallback ? 'compatible' as const : 'unmatched' as const };
};

const bandSeverity: Record<string, number> = {
  out_of_reject: 5,
  near_reject: 4,
  within_2s: 3,
  within_1s: 2,
  non_numeric: 1,
  missing_reference: 0,
};

export const classifySatQcResults = (catalog: DriCatalog, results: SatQcResult[]): SatQcFormProjection => {
  const classified = results.map<ClassifiedSatQcResult>((result) => {
    const reagent = resolveReagent(catalog, result);
    if (!reagent) {
      return { result, reagent: null, reference: null, assessment: null, outcome: 'pending', matchConfidence: 'unmatched' };
    }
    const match = chooseReference(reagent, result);
    const assessment = match.reference ? assessQcReference(match.reference, String(result.resultValue)) : null;
    const outcome = !assessment
      ? 'pending'
      : assessment.band === 'out_of_reject'
        ? 'failed'
        : assessment.band === 'non_numeric' || assessment.band === 'missing_reference'
          ? 'pending'
          : 'correct';
    return { result, reagent, reference: match.reference, assessment, outcome, matchConfidence: match.confidence };
  });

  const worstByReagent = new Map<string, ClassifiedSatQcResult>();
  classified.forEach((item) => {
    if (!item.reagent || !item.reference || !item.assessment) return;
    const current = worstByReagent.get(item.reagent.id);
    const severity = bandSeverity[item.assessment.band] || 0;
    const currentSeverity = current?.assessment ? bandSeverity[current.assessment.band] || 0 : -1;
    const z = Math.abs(item.assessment.zScore || 0);
    const currentZ = Math.abs(current?.assessment?.zScore || 0);
    if (!current || severity > currentSeverity || (severity === currentSeverity && z > currentZ)) {
      worstByReagent.set(item.reagent.id, item);
    }
  });

  const failedReagentIds: string[] = [];
  const correctReagentIds: string[] = [];
  const reagentMeasurements: Record<string, DriReagentMeasurementInput> = {};
  worstByReagent.forEach((item, reagentId) => {
    if (!item.reference || !item.assessment) return;
    if (item.outcome === 'failed') failedReagentIds.push(reagentId);
    if (item.outcome === 'correct') correctReagentIds.push(reagentId);
    reagentMeasurements[reagentId] = {
      reagentId,
      obtainedValue: String(item.result.resultValue),
      blankAbsorbance: '',
      selectedQcReferenceId: item.reference.id,
      expectedValue: String(item.reference.targetValue),
      unit: item.reference.unit || item.result.unit,
      blankUnit: 'A',
      source: 'auto_import',
      updatedAt: new Date().toISOString(),
      controlLevel: item.reference.controlLevel,
      controlLot: item.result.controlLot,
      observedAt: item.result.resultAt,
      sourceResultId: item.result.id || null,
      qcBand: item.assessment.band,
      matchConfidence: item.matchConfidence,
    };
  });

  return {
    failedReagentIds,
    correctReagentIds,
    reagentMeasurements,
    classified,
    matchedCount: classified.filter((item) => item.outcome !== 'pending').length,
    pendingCount: classified.filter((item) => item.outcome === 'pending').length,
  };
};
