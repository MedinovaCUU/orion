import { getCanonicalReagentKey } from '../knowledge/reagentIdentity';
import { roundDri } from '../utils/relationUtils';
import type {
  DriContrastAnalysis,
  DriContrastRow,
  DriContrastVerdict,
  DriDiscriminatingTest,
  DriRelationSignal,
  DriReagentProfile,
} from '../types/dri.types';

/**
 * Contraste diferencial: para cada factor compartido (filtro, R2, temperatura, agua, contaminación,
 * esquema, reacción) compara cuántas fallidas y cuántas correctas lo comparten. Un factor que también
 * comparten las pruebas correctas no discrimina y pierde peso (p. ej. un reactivo a 505 nm falla pero
 * otros tres a 505 nm salen bien → el filtro de 505 nm baja en la lista).
 *
 * El contraste es evidencia indirecta: nunca descarta. Una falla parcial (un filtro degradado, una
 * posición intermitente) puede afectar solo a algunas técnicas, así que la hipótesis sigue en la lista
 * hasta que una prueba directa (Photometry, baseline, bombas…) la confirme o la descarte.
 */

/** Categorías con pertenencia reconstruible desde el perfil (para sugerir pruebas discriminantes). */
const CONTAMINATION_KEYWORDS = ['contamin', 'carryover', 'arrastre', 'lavado', 'wash', 'blanco inicial', 'blank'];

const profileText = (profile: DriReagentProfile) =>
  [profile.legacy.reportedMethod, profile.legacy.operationalNote, profile.legacy.preliminaryRisk, ...profile.technicalNotes.value]
    .filter(Boolean)
    .join(' ')
    .trim()
    .toLowerCase();

const CONTRASTABLE_CATEGORIES = new Set<DriRelationSignal['category']>([
  'wavelength',
  'r2',
  'scheme',
  'reaction',
  'temperature',
  'contamination',
  'water',
  'technique',
  'trend',
  'storage',
  'blank',
]);

/** Pertenencia de un perfil a una señal, derivada de sus campos conocidos. Null = no reconstruible. */
export const profileMatchesSignal = (profile: DriReagentProfile, signalId: string): boolean | null => {
  if (signalId.startsWith('wavelength:ref:')) {
    return profile.secondaryWavelengthNm.value === Number(signalId.slice('wavelength:ref:'.length));
  }
  if (signalId.startsWith('wavelength:')) {
    return profile.primaryWavelengthNm.value === Number(signalId.slice('wavelength:'.length));
  }
  if (signalId === 'r2:shared') return Boolean(profile.usesR2.value);
  if (signalId.startsWith('scheme:')) {
    // Misma regla que evidenceMapper: una técnica "variable" cuenta como bireactiva en BA cuando el IFU lo dice.
    const scheme = signalId.slice('scheme:'.length);
    const text = profileText(profile);
    const effective =
      profile.reagentScheme.value === 'variable' && text.includes('ba:') && text.includes('bireact') ? 'bireactive' : profile.reagentScheme.value;
    return effective === scheme;
  }
  if (signalId.startsWith('reaction:')) return profile.reactionKind.value === signalId.slice('reaction:'.length);
  if (signalId === 'temperature:reaction_sensitive') return Boolean(profile.temperatureSensitive.value);
  if (signalId === 'contamination:carryover') {
    const text = profileText(profile);
    return Boolean(profile.contaminationSensitive.value) || CONTAMINATION_KEYWORDS.some((keyword) => text.includes(keyword));
  }
  // La estabilidad a bordo depende de las fechas del caso, no del perfil: no se sugieren pruebas por ella.
  if (signalId === 'stability:onboard') return false;
  return null;
};

/** Inicio de la explicación de un factor que pierde peso por contraste (el dock la marca por este prefijo). */
export const CONTRAST_AGAINST_PREFIX = 'Menos probable por contraste';

const describeVerdict = (
  verdict: DriContrastVerdict,
  label: string,
  failedShared: number,
  failedTotal: number,
  correctShared: number,
  correctTotal: number,
) => {
  if (verdict === 'untested') {
    return `${label}: ${failedShared} de ${failedTotal} fallidas lo comparten; sin pruebas correctas capturadas no hay contraste.`;
  }
  if (verdict === 'exonerates') {
    return `${CONTRAST_AGAINST_PREFIX}: ${correctShared} de ${correctTotal} pruebas correctas también usan ${label} (frente a ${failedShared} fallidas). El factor no discrimina y pierde peso, pero no queda descartado: una falla parcial puede afectar solo a algunas técnicas y se confirma o se descarta con la prueba directa.`;
  }
  if (verdict === 'implicates') {
    return `${label} concentra ${failedShared} de ${failedTotal} fallidas y solo ${correctShared} de ${correctTotal} correctas: el factor discrimina y gana fuerza.`;
  }
  return `${label}: ${failedShared} de ${failedTotal} fallidas y ${correctShared} de ${correctTotal} correctas lo comparten; contraste parcial.`;
};

const isSynthetic = (profile: DriReagentProfile) => Boolean((profile.legacy.metadata || {}) as Record<string, unknown>)
  && Boolean(((profile.legacy.metadata || {}) as Record<string, unknown>).syntheticFromContext);

export const buildContrastAnalysis = ({
  signals,
  failedProfiles,
  correctProfiles,
  platformProfiles,
}: {
  signals: DriRelationSignal[];
  failedProfiles: DriReagentProfile[];
  correctProfiles: DriReagentProfile[];
  platformProfiles: DriReagentProfile[];
}): DriContrastAnalysis => {
  const failedTotal = failedProfiles.length;
  const correctTotal = correctProfiles.length;
  // Identidad canónica: el catálogo trae duplicados documentales (GLU/GLUCOSA, ALT_GPT/ALANINA_AM…) con ids distintos.
  const canonical = (profile: DriReagentProfile) => getCanonicalReagentKey(profile.legacy);
  const inCase = new Set([...failedProfiles, ...correctProfiles].flatMap((profile) => [profile.id, canonical(profile)]));
  const seenCandidates = new Set<string>();
  const candidates = platformProfiles.filter((profile) => {
    const key = canonical(profile);
    if (inCase.has(profile.id) || inCase.has(key) || isSynthetic(profile) || seenCandidates.has(key)) return false;
    seenCandidates.add(key);
    return true;
  });

  const rows = signals
    .filter((signal) => signal.category !== 'service')
    .map<DriContrastRow>((signal) => {
      const failedShared = signal.relatedReagentIds;
      const correctShared = signal.contrastReagentIds;
      const sharedTotal = failedShared.length + correctShared.length;
      const exonerationStrength = sharedTotal ? roundDri(correctShared.length / sharedTotal, 3) : 0;
      const balance = roundDri(signal.failedCoverage - signal.correctCoverage, 3);

      // Reglas por conteo, no solo por cobertura: con una única correcta la cobertura no discrimina nada.
      let verdict: DriContrastVerdict;
      if (correctTotal === 0) {
        verdict = 'untested';
      } else if (correctShared.length >= 2 && correctShared.length >= failedShared.length) {
        verdict = 'exonerates';
      } else if (
        (failedShared.length >= 3 && correctShared.length * 3 <= failedShared.length) ||
        (correctShared.length === 0 && signal.failedCoverage >= 0.6)
      ) {
        verdict = 'implicates';
      } else {
        verdict = 'ambiguous';
      }

      const untestedReagentIds = CONTRASTABLE_CATEGORIES.has(signal.category)
        ? candidates.filter((profile) => profileMatchesSignal(profile, signal.id) === true).map((profile) => profile.id)
        : [];

      return {
        signalId: signal.id,
        category: signal.category,
        label: signal.label,
        failedShared,
        correctShared,
        failedTotal,
        correctTotal,
        failedCoverage: signal.failedCoverage,
        correctCoverage: signal.correctCoverage,
        balance,
        exonerationStrength,
        verdict,
        explanation: describeVerdict(verdict, signal.label, failedShared.length, failedTotal, correctShared.length, correctTotal),
        untestedReagentIds,
        suspectedSubsystems: signal.suspectedSubsystems,
        suspicionScore: signal.suspicionScore,
      };
    });

  const exonerations = rows.filter((row) => row.verdict === 'exonerates').sort((left, right) => right.exonerationStrength - left.exonerationStrength);
  const implications = rows.filter((row) => row.verdict === 'implicates').sort((left, right) => right.suspicionScore - left.suspicionScore);

  // Pruebas discriminantes: reactivos del catálogo que comparten un factor aún no resuelto.
  const weights = new Map<string, { weight: number; signalIds: string[]; labels: string[] }>();
  rows
    .filter((row) => (row.verdict === 'implicates' || row.verdict === 'ambiguous' || row.verdict === 'untested') && row.untestedReagentIds.length)
    .sort((left, right) => right.suspicionScore - left.suspicionScore)
    .slice(0, 6)
    .forEach((row) => {
      const factor = row.verdict === 'implicates' ? 1 : row.verdict === 'untested' ? 0.8 : 0.6;
      row.untestedReagentIds.forEach((reagentId) => {
        const entry = weights.get(reagentId) || { weight: 0, signalIds: [], labels: [] };
        if (entry.signalIds.includes(row.signalId)) return;
        entry.weight += Math.max(row.suspicionScore, 12) * factor;
        entry.signalIds.push(row.signalId);
        entry.labels.push(row.label);
        weights.set(reagentId, entry);
      });
    });

  const discriminatingTests = Array.from(weights.entries())
    .map<DriDiscriminatingTest>(([reagentId, entry]) => ({
      reagentId,
      weight: roundDri(entry.weight),
      signalIds: entry.signalIds,
      reason: `Comparte ${entry.labels.slice(0, 3).join(', ')} con las fallidas: si resulta correcta debilita ese factor; si falla, lo refuerza.`,
    }))
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 8);

  return { rows, exonerations, implications, discriminatingTests };
};

/**
 * Puntos en contra que aporta una exoneración: proporcional a su fuerza (24..40) y nunca mayores que los
 * puntos a favor que el factor habría aportado (`cap`), para que un factor débil no arrastre evidencia directa.
 */
export const exonerationPoints = (row: DriContrastRow, cap = 40) =>
  Math.min(cap, Math.round(24 + 16 * Math.min(1, Math.max(0, row.exonerationStrength))));
