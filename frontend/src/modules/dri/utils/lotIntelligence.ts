import type { SatReagentBottle, SatReportSummary } from '../../sat-report/satReportTypes';
import { findLotFacts, getLotFactsByKey, lotFactsGeneratedAt } from '../knowledge/lotFacts';
import { pickRepresentativeReagent, reagentSelectionKey } from '../knowledge/reagentIdentity';
import type {
  DriBottleOpening,
  DriCaseFormState,
  DriCaseReagentBottle,
  DriCatalog,
  DriInterferenceThreshold,
  DriKnowledgeField,
  DriLotFacts,
  DriLotFinding,
  DriLotInUse,
  DriLotIntelligence,
  DriMeasurementLimit,
  DriOutcomeType,
  DriReagent,
  DriReagentProfile,
} from '../types/dri.types';
import { DAY_MS, calendarDaysBetween, localDayEndMs, localDayStartMs, parseInstantMs, toLocalIsoDate } from './lotDates';
import { resolveReagentForTest } from './satQcClassifier';

/**
 * Inteligencia de lotes: une las botellas del SAT (lote y caducidad decodificados del código de barras)
 * con los hechos del lote publicados en einfo.bio (IFU vigente para ese lote y certificado de análisis)
 * y los convierte en hallazgos y en límites específicos del lote para el motor diferencial.
 *
 * Todo es puro y barato: se ejecuta en cada corrida viva del motor y en la ficha del reactivo.
 */

const LOT_CHANGE_WINDOW_DAYS = 14;
const NEAR_EXPIRY_DAYS = 30;

/* ------------------------------------------------------------ identidad */

/** Clave canónica de un reactivo (código visible): la misma que usan la lista del tablero y los controles. */
export const reagentMatchKey = (reagent: DriReagent) => reagentSelectionKey(reagent);

const productCodesOf = (reagent: DriReagent): string[] => {
  const technical = (reagent.technicalProfile || {}) as Record<string, unknown>;
  const byPlatform = (technical.productCodesByPlatform || {}) as Record<string, unknown>;
  const identity = ((reagent.metadata || {}) as Record<string, unknown>).driIdentity as Record<string, unknown> | undefined;
  const codes = new Set<string>();
  Object.values(byPlatform).forEach((list) => {
    if (Array.isArray(list)) list.forEach((code) => codes.add(String(code)));
  });
  if (identity && Array.isArray(identity.productCodes)) identity.productCodes.forEach((code) => codes.add(String(code)));
  return [...codes];
};

/**
 * Resuelve la técnica de una botella a un reactivo del catálogo: primero por código de producto
 * (21xxx/23xxx termina en la técnica), después por el nombre de la prueba del analizador. El orden del
 * catálogo no decide: los empates se rompen por puntuación y, al final, por id.
 */
export const resolveReagentForBottle = (catalog: DriCatalog, bottle: Pick<SatReagentBottle, 'techniqueCode' | 'testName'>): DriReagent | null => {
  const wanted = new Set([`21${bottle.techniqueCode}`, `23${bottle.techniqueCode}`]);
  const byProduct = catalog.reagents.filter((reagent) => productCodesOf(reagent).some((code) => wanted.has(code)));
  if (byProduct.length) return pickRepresentativeReagent(byProduct);
  return resolveReagentForTest(catalog, { testName: bottle.testName, testShortName: bottle.testName });
};

/* ------------------------------------------------------------ botellas del SAT → lotes del caso */

export interface BuildCaseBottlesOptions {
  /** Solo lotes vistos en los últimos N meses respecto a `at` (por defecto 24). */
  sinceMonths?: number;
  /** Fecha de referencia (ISO); por defecto la del reporte. */
  at?: string | null;
}

const firstFinite = (...values: number[]) => values.find((value) => Number.isFinite(value) && value > 0) ?? Number.NaN;

/**
 * Agrega las botellas físicas del SAT por (prueba, rol, lote, caducidad), conserva cada frasco con su
 * primer y último pipeteo y liga el lote al catálogo y a los hechos del lote. Orden: más reciente primero.
 */
export const buildCaseReagentBottles = (
  summary: Pick<SatReportSummary, 'reagentBottles' | 'reportGeneratedAt' | 'findings'>,
  catalog: DriCatalog,
  options: BuildCaseBottlesOptions = {},
): DriCaseReagentBottle[] => {
  const bottles = summary.reagentBottles || [];
  if (!bottles.length) return [];
  const sinceMonths = options.sinceMonths ?? 24;
  const reference = firstFinite(
    parseInstantMs(options.at),
    parseInstantMs(summary.reportGeneratedAt),
    parseInstantMs(summary.findings?.dateTo),
    bottles.reduce((max, bottle) => Math.max(max, parseInstantMs(bottle.lastSeenAt) || 0), 0),
  );
  const cutoff = Number.isFinite(reference) ? reference - sinceMonths * 30.4375 * DAY_MS : Number.NEGATIVE_INFINITY;

  const reagentCache = new Map<string, DriReagent | null>();
  const resolve = (bottle: SatReagentBottle) => {
    const key = `${bottle.techniqueCode}|${bottle.testName}`;
    if (!reagentCache.has(key)) reagentCache.set(key, resolveReagentForBottle(catalog, bottle));
    return reagentCache.get(key) || null;
  };

  const groups = new Map<string, DriCaseReagentBottle & { openings: DriBottleOpening[] }>();
  for (const bottle of bottles) {
    const lastSeen = parseInstantMs(bottle.lastSeenAt);
    if (Number.isFinite(lastSeen) && lastSeen < cutoff) continue;
    const key = `${bottle.testName}|${bottle.reagentRole}|${bottle.lot}|${bottle.expiresAt}`;
    const opening: DriBottleOpening = { barcode: bottle.barcode, firstSeenAt: bottle.firstSeenAt, lastSeenAt: bottle.lastSeenAt, pipettingCount: bottle.pipettingCount };
    const current = groups.get(key);
    if (!current) {
      const reagent = resolve(bottle);
      const facts = findLotFacts(bottle);
      groups.set(key, {
        testName: bottle.testName,
        reagentId: reagent?.id || null,
        reagentKey: reagent ? reagentMatchKey(reagent) : null,
        reagentRole: bottle.reagentRole,
        techniqueCode: bottle.techniqueCode,
        lot: bottle.lot,
        expiresAt: bottle.expiresAt,
        barcode: bottle.barcode,
        bottleCount: 1,
        firstSeenAt: bottle.firstSeenAt,
        openedAt: bottle.firstSeenAt,
        lastSeenAt: bottle.lastSeenAt,
        pipettingCount: bottle.pipettingCount,
        lotFactsKey: facts?.key || null,
        openings: [opening],
      });
      continue;
    }
    current.bottleCount += 1;
    current.pipettingCount += bottle.pipettingCount;
    current.openings.push(opening);
    if (bottle.firstSeenAt && (!current.firstSeenAt || bottle.firstSeenAt < current.firstSeenAt)) current.firstSeenAt = bottle.firstSeenAt;
    if (bottle.lastSeenAt && (!current.lastSeenAt || bottle.lastSeenAt > current.lastSeenAt)) current.lastSeenAt = bottle.lastSeenAt;
  }

  return [...groups.values()]
    .map((group) => {
      const openings = [...group.openings].sort((left, right) => (left.firstSeenAt || '').localeCompare(right.firstSeenAt || ''));
      const latest = openings[openings.length - 1];
      return { ...group, openings, openedAt: latest?.firstSeenAt ?? group.openedAt, barcode: latest?.barcode ?? group.barcode };
    })
    .sort((left, right) => (right.firstSeenAt || '').localeCompare(left.firstSeenAt || ''));
};

/* ------------------------------------------------------------ hechos → perfil */

const knowledgeField = <T,>(value: T, reference: string, confirmed: boolean): DriKnowledgeField<T> => ({
  value,
  status: confirmed ? 'validated' : 'estimated',
  confidence: confirmed ? 'confirmed' : 'inferred',
  sourceType: 'ifu',
  sourceReference: reference,
});

const toLimit = (limit: { value: number | null; unit: string } | null | undefined): DriMeasurementLimit | null =>
  limit && typeof limit.value === 'number' && Number.isFinite(limit.value) && limit.unit ? { value: limit.value, unit: limit.unit } : null;

/** Umbrales de interferencia del IFU del lote aplicables a suero/plasma (los de orina/LCR no se proyectan). */
export const lotInterferenceThresholds = (facts: DriLotFacts): DriInterferenceThreshold[] =>
  (facts.ifu?.interferenceThresholds || [])
    .filter((item) => !item.matrix || item.matrix === 'serum' || item.matrix === 'plasma')
    .flatMap((item): DriInterferenceThreshold[] => {
      const hasValue = typeof item.thresholdValue === 'number' && Number.isFinite(item.thresholdValue) && Boolean(item.unit);
      if (hasValue) {
        return [{ interferent: item.interferent, label: item.label, thresholdValue: item.thresholdValue as number, unit: item.unit, effect: item.effect || 'no_interference_below', sourceExcerpt: facts.ifu?.interferences || null }];
      }
      // «La lipemia (hasta 1300 mg/dL) interfiere»: no hay nivel seguro, cualquier valor observado cuenta.
      if (item.effect === 'may_interfere_above') {
        return [{ interferent: item.interferent, label: item.label, thresholdValue: 0, unit: item.testedUpTo?.unit || item.unit || '', effect: 'may_interfere_above', anyLevel: item.condition !== 'elevated', condition: item.condition || null, testedUpTo: item.testedUpTo || null, sourceExcerpt: facts.ifu?.interferences || null }];
      }
      return [];
    });

/**
 * Perfil del reactivo con los límites, la estabilidad y las interferencias del IFU vigente para el lote en uso.
 * Si el lote de producto se ligó solo por caducidad (sin confirmar el lote de componente en el CoA), los campos
 * quedan como estimados/inferidos en lugar de validados.
 */
export const applyLotFactsToProfile = (profile: DriReagentProfile, facts: DriLotFacts): DriReagentProfile => {
  const ifu = facts.ifu;
  if (!ifu) return profile;
  const confirmed = facts.componentMatchConfirmed;
  const reference =
    `einfo.bio ${facts.productCode}/${facts.productLot} · IFU ${ifu.ifuCode || 's/n'}${ifu.ifuDate ? ` (${ifu.ifuDate})` : ''}` +
    (confirmed ? '' : ' · lote inferido por caducidad');
  const detection = toLimit(ifu.detectionLimit);
  const quantification = toLimit(ifu.quantificationLimit);
  const linearity = toLimit(ifu.linearityLimit);
  const onboardHours = ifu.onboardStability?.hours ?? null;
  // El IFU del lote manda por interferente; los del catálogo para interferentes que el lote no menciona se conservan.
  const lotThresholds = lotInterferenceThresholds(facts);
  const covered = new Set(lotThresholds.map((item) => item.interferent));
  const thresholds = [...lotThresholds, ...profile.interferenceThresholds.value.filter((item) => !covered.has(item.interferent))];
  return {
    ...profile,
    detectionLimit: detection ? knowledgeField(detection, reference, confirmed) : profile.detectionLimit,
    quantificationLimit: quantification ? knowledgeField(quantification, reference, confirmed) : profile.quantificationLimit,
    linearityLimit: linearity ? knowledgeField(linearity, reference, confirmed) : profile.linearityLimit,
    onboardStabilityHours: onboardHours ? knowledgeField(onboardHours, reference, confirmed) : profile.onboardStabilityHours,
    interferenceThresholds: lotThresholds.length ? knowledgeField(thresholds, reference, confirmed) : profile.interferenceThresholds,
    technicalNotes: knowledgeField(
      [...profile.technicalNotes.value, `Lote en uso ${facts.productCode}/${facts.productLot}: límites y estabilidad tomados del IFU ${ifu.ifuCode || ''} de ese lote.`.replace(/\s+/g, ' ')],
      reference,
      confirmed,
    ),
  };
};

/* ------------------------------------------------------------ lote activo en la fecha del evento */

/**
 * Ventana única de «en uso»: un frasco pipeteado en los 14 días previos al evento cuenta como observado, en las
 * pruebas fallidas y en las correctas por igual. El caso se fecha con la exportación del SAT, el laboratorio suele
 * dejar de correr la prueba que falla días antes de exportar y hay pruebas que se corren una vez por semana.
 * Si el SAT completo termina antes del evento, la ventana se mide desde el fin del SAT (puente, exportación tardía).
 */
const RELEVANCE_WINDOW_DAYS = LOT_CHANGE_WINDOW_DAYS;
/** Un frasco de otro lote con menos uso que esto en un cambio de frasco es un frasco suelto, no un cambio de lote. */
const STRAY_MAX_PIPETTINGS = 20;

/** Frascos de un lote; los lotes sin detalle por frasco (casos guardados, fixtures) se reconstruyen con lo que hay. */
const openingsOf = (bottle: DriCaseReagentBottle): DriBottleOpening[] => {
  if (bottle.openings?.length) return bottle.openings;
  const openings: DriBottleOpening[] = [];
  const reopened = Boolean(bottle.openedAt && bottle.firstSeenAt && bottle.openedAt !== bottle.firstSeenAt);
  openings.push({ barcode: bottle.barcode, firstSeenAt: bottle.firstSeenAt, lastSeenAt: reopened ? null : bottle.lastSeenAt, pipettingCount: reopened ? 0 : bottle.pipettingCount });
  if (reopened) openings.push({ barcode: bottle.barcode, firstSeenAt: bottle.openedAt, lastSeenAt: bottle.lastSeenAt, pipettingCount: bottle.pipettingCount });
  return openings;
};

const sameLot = (left: DriCaseReagentBottle, right: DriCaseReagentBottle) => left.lot === right.lot && left.expiresAt === right.expiresAt;

export interface DriActiveLot {
  bottle: DriCaseReagentBottle;
  opening: DriBottleOpening;
  /** Inicio de la racha actual del lote: desde que otro lote dejó de usarse. */
  runStartedAt: string | null;
  previousLot: string | null;
}

interface TimelineEntry {
  bottle: DriCaseReagentBottle;
  opening: DriBottleOpening;
  start: number;
  end: number;
}

/**
 * Lote y frasco en uso para un rol en la fecha del evento. Entre los frascos abiertos hasta ese día gana el
 * que se pipeteó más cerca del evento (un lote agotado semanas antes no desplaza al que seguía cargado);
 * a igualdad, el abierto más tarde. La racha del lote se mide sobre el uso: un frasco suelto de otro lote
 * cargado mientras este seguía en uso no cuenta como cambio de lote. Sin fecha válida se toma el último uso.
 */
export const resolveActiveLot = (bottles: DriCaseReagentBottle[], role: 'R1' | 'R2', eventDate: string | null | undefined): DriActiveLot | null => {
  const limit = localDayEndMs(eventDate);
  const horizon = Number.isFinite(limit) ? limit : Number.POSITIVE_INFINITY;
  const timeline: TimelineEntry[] = bottles
    .filter((bottle) => bottle.reagentRole === role)
    .flatMap((bottle) =>
      openingsOf(bottle).map((opening) => {
        const start = parseInstantMs(opening.firstSeenAt);
        const last = parseInstantMs(opening.lastSeenAt);
        return { bottle, opening, start, end: Math.min(Number.isFinite(last) ? Math.max(last, start) : start, horizon) };
      }),
    )
    .filter((entry) => Number.isFinite(entry.start) && entry.start <= horizon)
    .sort((left, right) => left.start - right.start);
  if (!timeline.length) return null;
  const active = timeline.reduce((best, entry) => (entry.end > best.end || (entry.end === best.end && entry.start >= best.start) ? entry : best));

  const sameRun = timeline.filter((entry) => sameLot(entry.bottle, active.bottle) && entry.start <= active.start);
  const others = timeline.filter((entry) => !sameLot(entry.bottle, active.bottle));
  let runIndex = sameRun.indexOf(active);
  while (runIndex > 0) {
    const previous = sameRun[runIndex - 1];
    const current = sameRun[runIndex];
    const coveredUntil = Math.max(...sameRun.slice(0, runIndex).map((entry) => entry.end));
    if (coveredUntil < current.start) {
      // Hubo un hueco sin este lote: si en él otro lote se usó de verdad (un día o más, o varias decenas de
      // pipeteos), la racha empieza aquí; un frasco suelto pipeteado un momento al cambiar de frasco no cuenta.
      const takeover = others.some(
        (entry) =>
          entry.start > coveredUntil &&
          entry.start < current.start &&
          (entry.end - entry.start >= DAY_MS || entry.opening.pipettingCount >= STRAY_MAX_PIPETTINGS),
      );
      if (takeover) break;
    }
    runIndex -= 1;
    if (previous === sameRun[0]) break;
  }
  const runStart = sameRun[Math.max(0, runIndex)].start;
  const before = others
    .filter((entry) => entry.start < runStart)
    .sort((left, right) => Math.min(right.end, runStart) - Math.min(left.end, runStart))[0];
  return {
    bottle: active.bottle,
    opening: active.opening,
    runStartedAt: sameRun[Math.max(0, runIndex)].opening.firstSeenAt,
    previousLot: before ? before.bottle.lot : null,
  };
};

/* ------------------------------------------------------------ hallazgos por lote */

export type LotForm = Pick<DriCaseFormState, 'reagentBottles' | 'eventDate' | 'reagentMeasurements'> & Partial<Pick<DriCaseFormState, 'bplEvidence'>>;

export interface LotReagentRef {
  id: string;
  /** Clave canónica (`reagentMatchKey`): une botellas resueltas a un duplicado del catálogo. */
  key?: string | null;
  code: string;
}

const coaReagentAbsorbance = (facts: DriLotFacts | null) => {
  const row = facts?.coa?.controlData.find((item) => /REAGENT ABSORBANCE/i.test(item.name));
  if (!row || typeof row.result !== 'number') return null;
  const parameters = (facts?.ifu?.parameters || {}) as Record<string, unknown>;
  const reaction = parameters.reactionType as Record<string, unknown> | undefined;
  const decreasing = typeof reaction?.ba400 === 'string' && /decrec/i.test(reaction.ba400);
  // Un mínimo de 0 (reactivos crecientes) no es un límite inferior: solo cuenta un mínimo positivo (NADH, decrecientes).
  const specMin = typeof row.specMin === 'number' && row.specMin > 0 ? row.specMin : null;
  const specMax = typeof row.specMax === 'number' ? row.specMax : null;
  return { result: row.result, specMin: specMin ?? null, specMax: decreasing && specMin !== null ? null : specMax, unit: row.unit || 'Abs' };
};

/**
 * Caducidad efectiva del lote: el código de barras solo trae mes/año (último día del mes); el certificado del lote
 * de componente confirmado trae el día exacto, que puede ser anterior.
 */
const effectiveExpiry = (bottle: DriCaseReagentBottle, facts: DriLotFacts | null): { expiresAt: string; source: 'coa' | 'barcode' } => {
  if (facts?.componentMatchConfirmed) {
    const dated = (facts.coa?.components || []).filter((item) => item.lot === bottle.lot && /^\d{4}-\d{2}-\d{2}$/.test(item.expiresAt || ''));
    // Si A y B comparten lote con fechas distintas, R1 es el componente A y R2 el B.
    const letter = bottle.reagentRole === 'R2' ? 'B' : 'A';
    const component = dated.find((item) => (item.component || '').toUpperCase() === letter) || dated[0];
    const coaDate = component?.expiresAt || null;
    if (coaDate && coaDate.slice(0, 7) === bottle.expiresAt.slice(0, 7) && coaDate < bottle.expiresAt) return { expiresAt: coaDate, source: 'coa' };
  }
  return { expiresAt: bottle.expiresAt, source: 'barcode' };
};

const parseNumeric = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = Number(value.replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const plural = (count: number, singular: string, pluralForm = `${singular}s`) => `${count} ${count === 1 ? singular : pluralForm}`;

const bottleSerial = (barcode: string) => (barcode.length >= 6 ? barcode.slice(-6) : barcode);

/** Último pipeteo registrado en todo el SAT del caso (fin de la cobertura). Se memoriza por arreglo. */
const coverageCache = new WeakMap<DriCaseReagentBottle[], number>();
const satCoverageEndMs = (bottles: DriCaseReagentBottle[]) => {
  const cached = coverageCache.get(bottles);
  if (cached !== undefined) return cached;
  const end = bottles.reduce((max, bottle) => {
    const last = Math.max(parseInstantMs(bottle.lastSeenAt) || 0, ...openingsOf(bottle).map((opening) => parseInstantMs(opening.lastSeenAt) || 0));
    return Math.max(max, last);
  }, 0);
  coverageCache.set(bottles, end);
  return end;
};

/** Lotes en uso de un reactivo (R1 y R2) en la fecha del evento, con sus hallazgos. */
export const assessReagentLots = (
  form: LotForm,
  reagent: LotReagentRef,
  outcome: DriOutcomeType,
  /** Origen de los hechos del lote (inyectable en pruebas). */
  resolveFacts: (key: string | null | undefined) => DriLotFacts | null = getLotFactsByKey,
): DriLotInUse[] => {
  const allBottles = form.reagentBottles || [];
  const bottles = allBottles.filter((bottle) => bottle.reagentId === reagent.id || Boolean(reagent.key && bottle.reagentKey === reagent.key));
  if (!bottles.length) return [];
  const eventStart = localDayStartMs(form.eventDate);
  const coverageEnd = satCoverageEndMs(allBottles);
  const coverageEndIso = coverageEnd > 0 ? new Date(coverageEnd).toISOString() : null;
  const satEndsBeforeEvent = Number.isFinite(eventStart) && coverageEnd > 0 && coverageEnd < eventStart;
  const measurement = form.reagentMeasurements?.[reagent.id];
  const blankAbsorbance = parseNumeric(measurement?.blankAbsorbance);
  const blankFromBpl = Boolean(measurement && measurement.source === 'auto_import' && form.bplEvidence);
  const code = reagent.code;
  const lots: DriLotInUse[] = [];
  let blankReported = false;

  (['R1', 'R2'] as const).forEach((role) => {
    const active = resolveActiveLot(bottles, role, form.eventDate);
    if (!active) return;
    const { bottle, opening } = active;
    const facts = resolveFacts(bottle.lotFactsKey);
    const expiry = effectiveExpiry(bottle, facts);
    const daysToExpiry = calendarDaysBetween(form.eventDate, expiry.expiresAt);
    const openedMs = parseInstantMs(opening.firstSeenAt);
    // Lo que el SAT registró después del día del evento no es evidencia de lo que pasaba ese día.
    const eventEnd = localDayEndMs(form.eventDate);
    const recordedLastUseMs = parseInstantMs(opening.lastSeenAt);
    const lastUseMs = Number.isFinite(eventEnd) && Number.isFinite(recordedLastUseMs) ? Math.min(recordedLastUseMs, eventEnd) : recordedLastUseMs;
    const lastUseIso = Number.isFinite(lastUseMs) ? new Date(lastUseMs).toISOString() : null;
    const stillInUseAfterEvent = Number.isFinite(eventEnd) && recordedLastUseMs > eventEnd;
    const hoursOnboard = Number.isFinite(openedMs) && Number.isFinite(eventStart) ? Math.max(0, (eventStart - openedMs) / 3_600_000) : null;
    const daysOnboard = calendarDaysBetween(opening.firstSeenAt, form.eventDate);
    // Se mide contra el evento, o contra el fin del SAT si este termina antes (puente, exportación tardía).
    const horizonIso = satEndsBeforeEvent && coverageEndIso ? coverageEndIso : form.eventDate;
    const satGapDays = satEndsBeforeEvent && coverageEndIso ? calendarDaysBetween(coverageEndIso, form.eventDate) : 0;
    const daysSinceLastUse = lastUseIso ? calendarDaysBetween(lastUseIso, horizonIso) : null;
    const usage: DriLotInUse['usage'] =
      daysSinceLastUse === null || !Number.isFinite(eventStart) || (satGapDays ?? 0) > RELEVANCE_WINDOW_DAYS
        ? 'last_known'
        : daysSinceLastUse <= RELEVANCE_WINDOW_DAYS
          ? 'observed'
          : 'stopped';
    const recentlyUsed = usage === 'observed';
    const lotChangedDaysBefore = active.previousLot && active.runStartedAt ? calendarDaysBetween(active.runStartedAt, form.eventDate) : null;
    const productLot = facts?.productLot || null;
    const lotLabel = `${code} ${role} lote ${bottle.lot}${productLot ? ` (producto ${facts!.productCode}/${productLot})` : ''}`;
    const expiryText = `${expiry.expiresAt}${expiry.source === 'coa' ? ' según el certificado del lote' : ''}`;
    const lastUseDate = toLocalIsoDate(lastUseIso);
    const recordedLastUseDate = toLocalIsoDate(opening.lastSeenAt);
    const usedUntilText = stillInUseAfterEvent
      ? `seguía en uso el día del evento (último pipeteo ${recordedLastUseDate})`
      : `se siguió pipeteando hasta el ${lastUseDate}`;
    const findings: DriLotFinding[] = [];
    const push = (type: DriLotFinding['type'], title: string, explanation: string, score: number, observed: boolean, extra: Partial<DriLotFinding> = {}) =>
      findings.push({ id: `lot:${type}:${reagent.id}:${role}`, type, reagentId: reagent.id, reagentCode: code, outcome, role, lot: bottle.lot, productLot, title, explanation, score, observed, ...extra });

    if (daysToExpiry !== null && daysToExpiry < 0) {
      const expiryEnd = localDayEndMs(expiry.expiresAt);
      const usedExpired = Number.isFinite(lastUseMs) && lastUseMs > expiryEnd;
      if (usedExpired && recentlyUsed) {
        const daysAfter = calendarDaysBetween(expiry.expiresAt, lastUseIso) ?? 0;
        push(
          'expired',
          `${code} ${role} · lote caducado en uso`,
          `${lotLabel} caducó el ${expiryText}; el frasco ${bottleSerial(opening.barcode)} ${usedUntilText}, ${plural(daysAfter, 'día')} después de caducar.`,
          88,
          true,
        );
      } else if (usage === 'last_known') {
        push(
          'expired',
          `${code} ${role} · último lote conocido caducado`,
          `${lotLabel} es el último lote registrado en el SAT${lastUseDate ? ` (último pipeteo ${lastUseDate})` : ''} y caducó el ${expiryText}; confirmar qué lote estaba cargado el día del evento.`,
          60,
          false,
        );
      }
    } else if (daysToExpiry !== null && daysToExpiry <= NEAR_EXPIRY_DAYS && usage !== 'stopped') {
      push('near_expiry', `${code} ${role} · lote por caducar`, `${lotLabel} caduca el ${expiryText} (en ${plural(daysToExpiry, 'día')}).`, 34, usage === 'observed');
    }

    if (active.previousLot && lotChangedDaysBefore !== null && lotChangedDaysBefore <= LOT_CHANGE_WINDOW_DAYS && usage !== 'stopped') {
      push(
        'lot_change',
        `${code} ${role} · cambio de lote reciente`,
        `${lotLabel} entró el ${toLocalIsoDate(active.runStartedAt)} (${plural(lotChangedDaysBefore, 'día')} antes del evento; antes lote ${active.previousLot}); el IFU exige calibrar después de un cambio de lote.`,
        70,
        usage === 'observed',
      );
    }

    const onboardHours = facts?.ifu?.onboardStability?.hours ?? null;
    if (onboardHours && Number.isFinite(openedMs)) {
      const allowedDays = Math.round(onboardHours / 24);
      // Excedida y observada: el frasco se pipeteó después de agotar su estabilidad, antes del día del evento o
      // durante él, y ese uso es reciente. Se mide hasta el inicio del día del evento (la hora del evento no se
      // conoce): así no se adelanta un día respecto a la fecha de apertura capturada a mano.
      const overrunUntil = Number.isFinite(eventStart) && Number.isFinite(lastUseMs) ? Math.min(lastUseMs, Math.max(eventStart, openedMs)) : lastUseMs;
      const usedPastStability = Number.isFinite(overrunUntil) && (overrunUntil - openedMs) / 3_600_000 > onboardHours;
      if (usedPastStability && recentlyUsed) {
        const usedDays = calendarDaysBetween(opening.firstSeenAt, lastUseIso) ?? daysOnboard ?? 0;
        push(
          'onboard_exceeded',
          `${code} ${role} · estabilidad a bordo del lote excedida`,
          `El frasco ${bottleSerial(opening.barcode)} de ${lotLabel} se abrió el ${toLocalIsoDate(opening.firstSeenAt)} y ${usedUntilText}: ${plural(usedDays, 'día')} a bordo contra ${plural(allowedDays, 'día')} que admite el IFU del lote.`,
          66,
          true,
        );
      } else if (usage !== 'stopped' && hoursOnboard !== null && hoursOnboard > onboardHours) {
        // Solo se alcanza al proyectar la apertura hasta el día del evento: el SAT no lo muestra en uso tan tarde.
        push(
          'onboard_exceeded',
          `${code} ${role} · estabilidad a bordo por confirmar`,
          `El frasco ${bottleSerial(opening.barcode)} de ${lotLabel} se abrió el ${toLocalIsoDate(opening.firstSeenAt)}; si seguía cargado el día del evento sumaría ${plural(daysOnboard ?? 0, 'día')} a bordo (el IFU admite ${plural(allowedDays, 'día')}). Último pipeteo registrado: ${lastUseDate || 'sin dato'}.`,
          48,
          false,
        );
      }
    }

    const coaBlank = coaReagentAbsorbance(facts);
    const blankEvaluable = blankAbsorbance !== null && Boolean(coaBlank) && Boolean(facts?.componentMatchConfirmed) && (coaBlank!.specMax !== null || coaBlank!.specMin !== null);
    if (!blankReported && blankEvaluable && coaBlank) {
      const above = coaBlank.specMax !== null && blankAbsorbance! > coaBlank.specMax;
      const below = coaBlank.specMin !== null && blankAbsorbance! < coaBlank.specMin;
      if (above || below) {
        blankReported = true;
        const limitText = above ? `un máximo de ${coaBlank.specMax}` : `un mínimo de ${coaBlank.specMin}`;
        push(
          'blank_out_of_coa',
          `${code} · blanco fuera del límite del lote`,
          `Blanco ${blankFromBpl ? 'del monitor BPL' : 'capturado'} ${blankAbsorbance} ${coaBlank.unit} contra ${limitText} ${coaBlank.unit}; el lote salió de fábrica con ${coaBlank.result} ${coaBlank.unit} (CoA ${facts!.productCode}/${facts!.productLot}). El IFU lo marca como signo de deterioro del reactivo.`,
          84,
          true,
          blankFromBpl ? { fromBpl: true } : {},
        );
      }
    }

    if (!facts && outcome === 'failed') {
      push('undocumented', `${code} ${role} · lote sin ficha einfo`, `${lotLabel} no tiene IFU/CoA descargados; ejecutar la herramienta de lotes para traerlos de einfo.bio.`, 20, false);
    }

    lots.push({
      reagentId: reagent.id,
      reagentCode: code,
      outcome,
      role,
      bottle,
      opening,
      facts,
      expiresAt: expiry.expiresAt,
      expirySource: expiry.source,
      daysToExpiry,
      hoursOnboard,
      daysOnboard,
      usage,
      daysSinceLastUse,
      runStartedAt: active.runStartedAt,
      previousLot: active.previousLot,
      lotChangedDaysBefore: active.previousLot ? lotChangedDaysBefore : null,
      satEndsBeforeEvent,
      blankEvaluable,
      findings,
    });
  });

  return lots;
};

/** Hechos del lote que gobiernan los límites del perfil: R1 manda (comparte IFU con R2 del mismo producto). */
export const governingLotFacts = (lots: DriLotInUse[]) =>
  lots.find((lot) => lot.role === 'R1' && lot.facts)?.facts || lots.find((lot) => lot.facts)?.facts || null;

export interface LotIntelligenceAssessment {
  intelligence: DriLotIntelligence;
  /** Perfiles con los límites del IFU del lote en uso (misma identidad, campos validados por lote). */
  failedProfiles: DriReagentProfile[];
  correctProfiles: DriReagentProfile[];
}

/** Evalúa los lotes en uso de todas las pruebas del caso y devuelve perfiles ajustados al lote. */
export const assessLotIntelligence = (
  form: DriCaseFormState,
  failedProfiles: DriReagentProfile[],
  correctProfiles: DriReagentProfile[],
): LotIntelligenceAssessment | null => {
  if (!form.reagentBottles || !form.reagentBottles.length) return null;
  const lotsInUse: DriLotInUse[] = [];
  const withLot = (profiles: DriReagentProfile[], outcome: DriOutcomeType) =>
    profiles.map((profile) => {
      const lots = assessReagentLots(form, { id: profile.id, key: reagentMatchKey(profile.legacy), code: profile.referenceCode.value || profile.id }, outcome);
      lotsInUse.push(...lots);
      const facts = governingLotFacts(lots);
      return facts ? applyLotFactsToProfile(profile, facts) : profile;
    });
  const failed = withLot(failedProfiles, 'failed');
  const correct = withLot(correctProfiles, 'correct');
  const findings = lotsInUse.flatMap((lot) => lot.findings).sort((left, right) => right.score - left.score);
  const documentedCount = form.reagentBottles.filter((bottle) => bottle.lotFactsKey).length;
  return {
    intelligence: {
      lotsInUse,
      findings,
      documentedCount,
      undocumentedCount: form.reagentBottles.length - documentedCount,
      factsGeneratedAt: lotFactsGeneratedAt(),
    },
    failedProfiles: failed,
    correctProfiles: correct,
  };
};

/** Cobertura (0–1) de un tipo de hallazgo observado entre los reactivos de un resultado. */
export const lotFindingCoverage = (intelligence: DriLotIntelligence | null, type: DriLotFinding['type'], outcome: DriOutcomeType, total: number) => {
  if (!intelligence || !total) return 0;
  const reagents = new Set(
    intelligence.findings.filter((finding) => finding.type === type && finding.outcome === outcome && finding.observed).map((finding) => finding.reagentId),
  );
  return reagents.size / total;
};

/**
 * Pruebas (por resultado) en las que un tipo de hallazgo se pudo evaluar: sin lote observado cerca del evento
 * no se sabe si una correcta comparte la caducidad; sin blanco capturado, si comparte el blanco fuera del CoA.
 */
export const lotEvaluableReagents = (intelligence: DriLotIntelligence | null, type: DriLotFinding['type'], outcome: DriOutcomeType) => {
  const reagents = new Set<string>();
  intelligence?.lotsInUse.forEach((lot) => {
    if (lot.outcome !== outcome) return;
    const evaluable =
      type === 'blank_out_of_coa'
        ? lot.blankEvaluable
        : type === 'onboard_exceeded'
          ? lot.usage === 'observed' && Boolean(lot.facts?.ifu?.onboardStability?.hours)
          : lot.usage === 'observed';
    if (evaluable) reagents.add(lot.reagentId);
  });
  return reagents;
};

export interface LotContrast {
  failedCoverage: number;
  /** Fracción de las correctas evaluables que comparten el hallazgo. */
  correctCoverage: number;
  /** Alguna prueba correcta se pudo evaluar para este tipo de hallazgo. */
  correctObserved: boolean;
  /** La mayoría de las fallidas lo tiene y las correctas evaluadas no: separa unas de otras. */
  discriminates: boolean;
  /** La mayoría de las fallidas lo tiene pero las correctas evaluadas también: no separa. */
  sharedWithCorrect: boolean;
}

/**
 * Contraste fallidas/correctas de un hallazgo de lote, con la misma regla que los factores técnicos: un factor
 * que también comparten las pruebas correctas no explica la falla. Las correctas se cuentan solo donde el
 * hallazgo se pudo evaluar (una correcta sin lote en el SAT no «demuestra» que no lo comparte), y solo los
 * hallazgos observados (no los extrapolados) cuentan.
 */
export const lotContrast = (intelligence: DriLotIntelligence | null, type: DriLotFinding['type'], failedTotal: number): LotContrast => {
  const failedCoverage = lotFindingCoverage(intelligence, type, 'failed', failedTotal);
  const evaluable = lotEvaluableReagents(intelligence, type, 'correct');
  const sharing = new Set(
    (intelligence?.findings || [])
      .filter((finding) => finding.type === type && finding.outcome === 'correct' && finding.observed && evaluable.has(finding.reagentId))
      .map((finding) => finding.reagentId),
  );
  const correctObserved = evaluable.size > 0;
  const correctCoverage = correctObserved ? sharing.size / evaluable.size : 0;
  const majority = failedCoverage >= 0.5;
  const sharedWithCorrect = majority && correctObserved && (correctCoverage >= 0.5 || correctCoverage >= failedCoverage);
  return { failedCoverage, correctCoverage, correctObserved, discriminates: majority && correctObserved && !sharedWithCorrect, sharedWithCorrect };
};
