import type { SatQcResult } from '../../sat-report/satReportTypes';
import { getCanonicalReagentKey, getReagentDisplayCode, pickRepresentativeReagent } from '../knowledge/reagentIdentity';
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
  // Nombres de prueba tal como los reporta el BA400 en LogConsum y en la base Ax00.
  AMYLASE: 'AMY',
  BILIRUBIND: 'BIL D',
  BILIRUBINT: 'BIL T',
  BILIRUBINDIRECT: 'BIL D',
  BILIRUBINTOTAL: 'BIL T',
  CALCIUMARS: 'CALCIUM ARSENAZO',
  CKNAC: 'CK',
  CREATININEENZ: 'CREA ENZ',
  GLUCOSEHK: 'GLU HK',
  HBA1C: 'HGB',
  HDLCHOLESTEROL: 'HDL TOOS',
  IRON: 'HIERRO FER',
  LACTATE: 'LACTATO DE',
  MICROALBUMIN: 'MALB',
  TOTALPROTEIN: 'PROT T',
  PROTEINTOTALBIR: 'PROT T',
  PROTEINTOTAL: 'PROT T',
  UREAUV: 'UREA UV',
};

export interface ReagentTestLookup {
  reagentId?: string | null;
  testKey?: string | null;
  testName?: string | null;
  testShortName?: string | null;
}

/** Resuelve una prueba del analizador (nombre corto, largo o clave) a un reactivo del catálogo DRI. */
export const resolveReagentForTest = (catalog: DriCatalog, lookup: ReagentTestLookup) => {
  if (lookup.reagentId) {
    const explicit = catalog.reagents.find((reagent) => reagent.id === lookup.reagentId);
    if (explicit) return explicit;
  }
  const resultKeys = [lookup.testKey, lookup.testShortName, lookup.testName]
    .map(normalizeText)
    .flatMap((key) => [key, TEST_ALIASES[key.replace(/\s/g, '')] || ''])
    .filter(Boolean);

  if (!resultKeys.length) return null;

  // Mismo criterio que la lista de reactivos del DRI: entre duplicados gana el representativo que la lista muestra.
  const matches = catalog.reagents.filter((reagent) => {
    const candidates = reagentCandidates(reagent);
    return resultKeys.some((key) => candidates.has(key));
  });
  if (!matches.length) return null;
  return pickRepresentativeReagent(matches);
};

const resolveReagent = (catalog: DriCatalog, result: SatQcResult) => resolveReagentForTest(catalog, result);

/**
 * Referencia del lote de control EN USO. El control se juzga contra el target ± SD de su propio lote:
 *  1. el que el laboratorio programó en el analizador para ese lote (target y SD del respaldo .bak; sus límites
 *     son ±3 SD);
 *  2. si el analizador no los trae, la hoja de valores de einfo.bio solo cuando el lote coincide exactamente.
 * Nunca se usa la hoja de otro lote: sus targets no describen el control que se corrió (por eso CK-MB 34 U/L,
 * fuera de 50–75 en su lote, salía «correcto» contra un target ajeno de 41.5).
 */
const chooseReference = (reagent: DriReagent, result: SatQcResult) => {
  // DRI maneja niveles I y II; un nivel III o desconocido queda pendiente.
  if (result.controlLevel !== 'level_1' && result.controlLevel !== 'level_2') {
    return { reference: null, confidence: 'unmatched' as const };
  }
  const resolvedControlLevel = result.controlLevel;
  const expectedUnit = normalizeUnit(result.unit);
  const analyzerReference = (): DriQcReference | null => {
    const hasLimits = result.analyzerMin !== null && result.analyzerMax !== null && result.analyzerMin < result.analyzerMax;
    const hasSd = result.analyzerSd !== null && result.analyzerSd > 0;
    const target = result.analyzerTarget ?? (hasLimits ? ((result.analyzerMin as number) + (result.analyzerMax as number)) / 2 : null);
    if (target === null || (!hasSd && !hasLimits)) return null;
    // Sin SD explícita, los límites del BA400 son target ± 3 SD.
    const sd = hasSd ? (result.analyzerSd as number) : ((result.analyzerMax as number) - (result.analyzerMin as number)) / 6;
    return {
      id: `sat-analyzer::${result.serialNumber}::${result.testKey}::${result.controlLevel}::${result.controlLot || 'sin-lote'}`,
      reagentId: reagent.id,
      reagentDisplayCode: getReagentDisplayCode(reagent),
      reagentDisplayName: reagent.displayName || reagent.name,
      productCode: 'ANALYZER',
      lot: result.controlLot,
      controlLevel: resolvedControlLevel,
      analyteName: result.testName,
      methodName: `Lote de control en uso${result.controlName ? ` (${result.controlName})` : ''} programado en el equipo`,
      unit: result.unit,
      targetValue: target,
      sd1: sd,
      sd1Low: target - sd,
      sd1High: target + sd,
      sd2Low: target - 2 * sd,
      sd2High: target + 2 * sd,
      rejectLow: target - 3 * sd,
      rejectHigh: target + 3 * sd,
      traceability: 'Configuración QC del equipo para el lote en uso',
      matchConfidence: 'exact',
      sourceStatus: 'user_captured',
      sourceType: 'ba400_export',
      sourceReference: `SAT ${result.serialNumber} · lote ${result.controlLot || 'sin lote'} · ${result.resultAt}`,
    };
  };

  const fromAnalyzer = analyzerReference();
  if (fromAnalyzer) return { reference: fromAnalyzer, confidence: 'exact' as const };

  const candidates = extractQcReferences(reagent).filter(
    (reference) =>
      reference.controlLevel === resolvedControlLevel &&
      (!expectedUnit || normalizeUnit(reference.unit) === expectedUnit),
  );
  const exactLot = result.controlLot
    ? candidates.filter((reference) => normalizeText(reference.lot) === normalizeText(result.controlLot))
    : [];
  if (exactLot.length) {
    const closest = [...exactLot].sort(
      (left, right) =>
        Math.abs(result.resultValue - left.targetValue) - Math.abs(result.resultValue - right.targetValue),
    )[0];
    return { reference: closest, confidence: 'exact' as const };
  }
  // Sin datos del lote en uso no hay contra qué juzgarlo: queda pendiente en lugar de usar otro lote.
  return { reference: null, confidence: 'unmatched' as const };
};

/** Decimales con los que se muestra un control: los que distinguen una décima de SD. */
const decimalsForSd = (sd: number | null | undefined) => {
  if (!sd || !Number.isFinite(sd) || sd <= 0) return 3;
  return Math.max(0, Math.min(4, Math.ceil(-Math.log10(sd)) + 1));
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
      obtainedValue: item.result.resultValue.toFixed(decimalsForSd(item.reference.sd1)).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''),
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
      qcReference: item.reference,
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
