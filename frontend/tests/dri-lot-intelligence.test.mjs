import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Inteligencia de lotes DRI: botellas del SAT → lote en uso → hechos del lote (einfo.bio) → motor diferencial.
// Corre con TZ=America/Mexico_City (script npm) para cubrir el corrimiento de fechas UTC → local.
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, cacheDir: 'node_modules/.vite-dri-tests', server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
console.info = () => {};
console.debug = () => {};
console.warn = () => {};
const checks = [];
const check = (name, fn) => {
  fn();
  checks.push(name);
};

const opening = (firstSeenAt, lastSeenAt, barcode = 'X', pipettingCount = 100) => ({ barcode, firstSeenAt, lastSeenAt, pipettingCount });
// Con `openings`, los campos agregados del lote salen de sus frascos, como en buildCaseReagentBottles.
const bottle = (overrides) => {
  const base = rawBottle(overrides);
  if (!overrides?.openings?.length) return base;
  const sorted = [...overrides.openings].sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt));
  const lasts = sorted.map((o) => o.lastSeenAt).filter(Boolean).sort();
  return { ...base, firstSeenAt: sorted[0].firstSeenAt, openedAt: sorted.at(-1).firstSeenAt, lastSeenAt: lasts.at(-1) ?? null, bottleCount: sorted.length, ...('lastSeenAt' in overrides ? { lastSeenAt: overrides.lastSeenAt } : {}) };
};
const rawBottle = (overrides) => ({
  testName: 'GLUCOSE',
  reagentId: 'GLU',
  reagentKey: 'GLU',
  reagentRole: 'R1',
  techniqueCode: '503',
  lot: '00005',
  expiresAt: '2028-03-31',
  barcode: '50311032800005000123',
  bottleCount: 1,
  firstSeenAt: '2027-11-10T08:00:00.000Z',
  openedAt: '2027-11-10T08:00:00.000Z',
  lastSeenAt: '2028-05-02T09:00:00.000Z',
  pipettingCount: 1200,
  lotFactsKey: '21503:0001935',
  ...overrides,
});

const baseForm = (overrides = {}) => ({
  equipmentModel: 'BA400', serialNumber: '834000473', eventDate: '2026-10-01', eventType: 'qc_out_of_range', failureDirection: 'high',
  reagentLot: '', controlLot: '', calibratorLot: '', calibratorName: '', controlLevel: 'level_1',
  selectedQcReferenceId: '', expectedValue: '', obtainedValue: '', reagentExpiryDate: '', reagentOpenedAt: '', ambientTemperatureC: '',
  observations: '', failedReagentIds: ['GLU'], correctReagentIds: ['ALB'],
  reagentMeasurements: {}, serviceTests: [], evidenceItems: [],
  signals: { intermittentPattern: false, normalCurvesObserved: false, opticalRejectObserved: false, waterSensitivePattern: false },
  bplEvidence: null,
  reagentBottles: null,
  ...overrides,
});

const GLU = { id: 'GLU', key: 'GLU', code: 'GLU' };
const lotForm = (bottles, eventDate, extra = {}) => ({ reagentBottles: bottles, eventDate, reagentMeasurements: {}, ...extra });

try {
  assert.equal(process.env.TZ, 'America/Mexico_City', 'run through npm run test:dri:lots (sets TZ)');
  const { findLotFacts, getLotFactsByKey, listLotFacts } = await vite.ssrLoadModule('/src/modules/dri/knowledge/lotFacts.ts');
  const lots = await vite.ssrLoadModule('/src/modules/dri/utils/lotIntelligence.ts');
  const dates = await vite.ssrLoadModule('/src/modules/dri/utils/lotDates.ts');
  const { buildSatFormPatch } = await vite.ssrLoadModule('/src/modules/dri/utils/sourcePatches.ts');
  const { assessProcedureLimitations } = await vite.ssrLoadModule('/src/modules/dri/utils/procedureLimitations.ts');
  const { runDriEngine } = await vite.ssrLoadModule('/src/modules/dri/driEngine.ts');
  const { DRI_WORKBOOK_SEED } = await vite.ssrLoadModule('/src/modules/dri/driWorkbookSeed.generated.ts');
  const { enrichCatalogWithReagentIdentity } = await vite.ssrLoadModule('/src/modules/dri/knowledge/reagentIdentity.ts');
  const { buildReagentProfiles } = await vite.ssrLoadModule('/src/modules/dri/knowledge/reagentRelations.ts');
  const enrich = (reagents) => enrichCatalogWithReagentIdentity({ reagents, factors: DRI_WORKBOOK_SEED.factors, links: DRI_WORKBOOK_SEED.factorLinks }, { catalogRows: [], aliasRows: [] });
  const catalog = enrich(DRI_WORKBOOK_SEED.reagents);

  check('generated lot facts resolve a real SAT bottle by technique, component lot and expiry month', () => {
    assert.ok(listLotFacts().length >= 30, 'expected the generated einfo facts to be populated');
    const facts = findLotFacts({ techniqueCode: '503', lot: '00005', expiresAt: '2028-03-31' });
    assert.ok(facts, 'GLUCOSE lot 00005 must be documented');
    assert.equal(facts.key, '21503:0001935');
    assert.equal(facts.componentMatchConfirmed, true);
    assert.ok(facts.ifu?.linearityLimit?.value > 0, 'linearity limit parsed from the lot IFU');
    assert.ok(facts.ifu?.onboardStability?.hours > 0, 'onboard stability parsed from the lot IFU');
    assert.ok(facts.coa?.controlData.some((row) => /REAGENT ABSORBANCE/i.test(row.name)), 'CoA reagent absorbance parsed');
    assert.equal(facts.coa.productLot, '0001935');
  });

  check('dates: date-only values stay on their calendar day and UTC timestamps map to the local day', () => {
    assert.match(dates.formatLocalDate('2028-03-31'), /31 mar 2028/);
    assert.equal(dates.toLocalIsoDate('2026-10-01T01:00:00.000Z'), '2026-09-30', '19:00 in Mexico is still Sep 30');
    assert.equal(dates.calendarDaysBetween('2028-03-31', '2028-05-02'), 32);
    assert.equal(dates.calendarDaysBetween('2026-11-01', '2026-11-02'), 1, 'DST change does not break whole days');
  });

  check('bottle → reagent resolution does not depend on catalog order (duplicates GLU/GLUCOSA, CHOL/COLESTEROL)', () => {
    const orders = {
      seed: catalog,
      reversed: enrich([...DRI_WORKBOOK_SEED.reagents].reverse()),
      byName: enrich([...DRI_WORKBOOK_SEED.reagents].sort((a, b) => String(a.name).localeCompare(String(b.name)))),
    };
    for (const [label, cat] of Object.entries(orders)) {
      const glu = lots.resolveReagentForBottle(cat, { techniqueCode: '503', testName: 'GLUCOSE' });
      assert.equal(lots.reagentMatchKey(glu), 'GLU', `${label}: glucose key`);
      assert.equal(glu.id, 'GLU', `${label}: canonical id wins`);
      const chol = lots.resolveReagentForBottle(cat, { techniqueCode: '505', testName: 'CHOLESTEROL' });
      assert.equal(lots.reagentMatchKey(chol), lots.reagentMatchKey(cat.reagents.find((r) => r.id === 'CHOL')), `${label}: cholesterol key`);
    }
    // Aunque la botella quede ligada a un duplicado, la clave canónica la une al reactivo del caso.
    const viaKey = lots.assessReagentLots(lotForm([bottle({ reagentId: 'GLUCOSA', reagentKey: 'GLU' })], '2028-01-10'), GLU, 'failed');
    assert.equal(viaKey.length, 1);
  });

  check('SAT bottles aggregate per lot and keep every physical bottle with its own first/last pipetting', () => {
    const summary = {
      reportGeneratedAt: '2026-10-01T10:00:00.000Z',
      findings: { dateTo: '2026-10-01T10:00:00.000Z' },
      reagentBottles: [
        { testName: 'GLUCOSE', reagentRole: 'R1', barcode: 'A', techniqueCode: '503', lot: '00005', expiryMonth: 3, expiryYear: 2028, expiresAt: '2028-03-31', bottleSerial: '1', firstSeenAt: '2026-06-01T00:00:00.000Z', lastSeenAt: '2026-08-01T00:00:00.000Z', pipettingCount: 100, sourceFile: 'x' },
        { testName: 'GLUCOSE', reagentRole: 'R1', barcode: 'B', techniqueCode: '503', lot: '00005', expiryMonth: 3, expiryYear: 2028, expiresAt: '2028-03-31', bottleSerial: '2', firstSeenAt: '2026-08-02T00:00:00.000Z', lastSeenAt: '2026-10-01T00:00:00.000Z', pipettingCount: 50, sourceFile: 'x' },
        { testName: 'GLUCOSE', reagentRole: 'R1', barcode: 'C', techniqueCode: '503', lot: '00001', expiryMonth: 1, expiryYear: 2024, expiresAt: '2024-01-31', bottleSerial: '3', firstSeenAt: '2022-01-01T00:00:00.000Z', lastSeenAt: '2022-03-01T00:00:00.000Z', pipettingCount: 10, sourceFile: 'x' },
      ],
    };
    const bottles = lots.buildCaseReagentBottles(summary, catalog, { sinceMonths: 24 });
    assert.equal(bottles.length, 1, 'old lot outside the window is dropped');
    const [glu] = bottles;
    assert.equal(glu.bottleCount, 2);
    assert.equal(glu.pipettingCount, 150);
    assert.deepEqual(glu.openings.map((o) => o.barcode), ['A', 'B']);
    assert.equal(glu.openedAt, '2026-08-02T00:00:00.000Z');
    assert.equal(glu.reagentId, 'GLU');
    assert.equal(glu.reagentKey, 'GLU');
    assert.equal(glu.lotFactsKey, '21503:0001935');
  });

  check('active lot = the bottle used closest to the event, not the lot that first appeared last', () => {
    // Lote A se reabre (2.º frasco) después de que el lote B se agotó: el 10 de junio el equipo usa A.
    const lotA = bottle({ lot: 'AAAAA', expiresAt: '2027-12-31', lotFactsKey: null, openings: [opening('2026-01-05T15:00:00.000Z', '2026-02-28T15:00:00.000Z', 'A1'), opening('2026-05-02T15:00:00.000Z', '2026-06-20T15:00:00.000Z', 'A2')] });
    const lotB = bottle({ lot: 'BBBBB', expiresAt: '2027-12-31', lotFactsKey: null, openings: [opening('2026-03-01T15:00:00.000Z', '2026-04-30T15:00:00.000Z', 'B1')] });
    const active = lots.resolveActiveLot([lotA, lotB], 'R1', '2026-06-10');
    assert.equal(active.bottle.lot, 'AAAAA');
    assert.equal(active.opening.barcode, 'A2');
    assert.equal(active.previousLot, 'BBBBB');
    assert.equal(active.runStartedAt, '2026-05-02T15:00:00.000Z');
    assert.equal(lots.resolveActiveLot([lotA, lotB], 'R1', '2025-12-01'), null, 'nothing opened before the event');
    assert.equal(lots.resolveActiveLot([lotA, lotB], 'R1', '2026-04-10').bottle.lot, 'BBBBB');
    // #4: a stray old-lot bottle loaded once while lot B was in continuous use is not a lot change.
    const a = bottle({ lot: 'AAAAA', expiresAt: '2029-12-31', lotFactsKey: null, openings: [opening('2028-01-01T15:00:00.000Z', '2028-02-28T15:00:00.000Z', 'A1'), opening('2028-03-10T15:00:00.000Z', '2028-03-10T16:00:00.000Z', 'A2')] });
    const b = bottle({ lot: 'BBBBB', expiresAt: '2029-12-31', lotFactsKey: null, openings: [opening('2028-03-01T15:00:00.000Z', '2028-03-30T15:00:00.000Z', 'B1'), opening('2028-03-31T15:00:00.000Z', '2028-04-10T15:00:00.000Z', 'B2')] });
    const run = lots.resolveActiveLot([a, b], 'R1', '2028-04-05');
    assert.equal(run.opening.barcode, 'B2');
    assert.equal(run.runStartedAt, '2028-03-01T15:00:00.000Z', 'run started with B1, not with the new bottle B2');
    assert.equal(run.previousLot, 'AAAAA');
    const noChange = lots.assessReagentLots(lotForm([a, b], '2028-04-05'), GLU, 'failed');
    assert.ok(!noChange[0].findings.some((f) => f.type === 'lot_change'), '35 days in use is not a recent lot change');
  });

  check('onboard stability uses the bottle open on the event day and whole days', () => {
    const glu = bottle({
      openings: [opening('2028-01-01T18:00:00.000Z', '2028-03-10T15:00:00.000Z', 'OLD'), opening('2028-03-11T15:00:00.000Z', '2028-03-25T15:00:00.000Z', 'NEW')],
      expiresAt: '2029-03-31',
      lotFactsKey: '21503:0001935',
    });
    // 2028-01-01 12:00 local + 60 días: el 1 de marzo lleva 59 días completos, el 3 de marzo 61.
    const notYet = lots.assessReagentLots(lotForm([glu], '2028-03-01'), GLU, 'failed');
    assert.equal(notYet[0].opening.barcode, 'OLD');
    assert.ok(!notYet[0].findings.some((f) => f.type === 'onboard_exceeded'), 'day 59 of 60 is not exceeded');
    const exceeded = lots.assessReagentLots(lotForm([glu], '2028-03-03'), GLU, 'failed');
    const finding = exceeded[0].findings.find((f) => f.type === 'onboard_exceeded');
    assert.ok(finding, 'day 62 of 60 is exceeded');
    assert.equal(finding.observed, true);
    assert.match(finding.explanation, /seguía en uso el día del evento .* 62 días a bordo contra 60 días/);
    // Opened at noon on Jan 1: on Mar 2 the bottle passes 60 days during the day and is still used (#3 off-by-one).
    const sameDay = lots.assessReagentLots(lotForm([glu], '2028-03-02'), GLU, 'failed');
    assert.ok(sameDay[0].findings.some((f) => f.type === 'onboard_exceeded'), 'exceeded on the day it is passed');
    assert.equal(sameDay[0].daysOnboard, 61);
    const later = lots.assessReagentLots(lotForm([glu], '2028-03-20'), GLU, 'failed');
    assert.equal(later[0].opening.barcode, 'NEW');
    assert.ok(!later[0].findings.some((f) => f.type === 'onboard_exceeded'), 'new bottle is fresh');
  });

  check('expired: used after expiry (88), last known lot when the SAT ends first (60), silent when the SAT shows it was not used', () => {
    const used = lots.assessReagentLots(lotForm([bottle({ openings: [opening('2028-03-01T15:00:00.000Z', '2028-05-02T15:00:00.000Z', '50311032800005000123')] })], '2028-05-02'), GLU, 'failed');
    const strong = used[0].findings.find((f) => f.type === 'expired');
    assert.equal(strong.score, 88);
    assert.equal(used[0].expirySource, 'coa');
    assert.equal(used[0].expiresAt, '2028-03-19');
    assert.match(strong.explanation, /caducó el 2028-03-19 según el certificado del lote; el frasco 000123 se siguió pipeteando hasta el 2028-05-02, 44 días después de caducar/);
    const satEnds = lots.assessReagentLots(lotForm([bottle({ openings: [opening('2028-02-01T15:00:00.000Z', '2028-03-20T15:00:00.000Z')] })], '2028-05-02'), GLU, 'failed');
    assert.equal(satEnds[0].satEndsBeforeEvent, true);
    assert.equal(satEnds[0].usage, 'last_known');
    const weak = satEnds[0].findings.find((f) => f.type === 'expired');
    assert.equal(weak.score, 60);
    assert.equal(weak.observed, false, 'extrapolated findings do not count for the contrast');
    const other = bottle({ testName: 'ALBUMIN', reagentId: 'ALB', reagentKey: 'ALB', techniqueCode: '547', lot: '00002', expiresAt: '2029-12-31', lotFactsKey: null, openings: [opening('2028-03-01T15:00:00.000Z', '2028-05-03T15:00:00.000Z')] });
    const notUsed = lots.assessReagentLots(lotForm([bottle({ openings: [opening('2028-02-01T15:00:00.000Z', '2028-03-20T15:00:00.000Z')] }), other], '2028-05-02'), GLU, 'failed');
    assert.equal(notUsed[0].usage, 'stopped');
    assert.ok(!notUsed[0].findings.some((f) => f.type === 'expired'), 'the SAT shows the lot stopped weeks before the event');
    // #0: last used the night before the export while other tests ran that morning → still the lot in use.
    const nightBefore = lots.assessReagentLots(
      lotForm([bottle({ openings: [opening('2028-04-01T15:00:00.000Z', '2028-05-01T23:00:00.000Z')] }), { ...other, openings: [opening('2028-03-01T15:00:00.000Z', '2028-05-02T13:30:00.000Z')] }], '2028-05-02'),
      GLU,
      'failed',
    );
    assert.equal(nightBefore[0].usage, 'observed');
    assert.equal(nightBefore[0].findings.find((f) => f.type === 'expired')?.score, 88);
  });

  check('expiry uses the exact CoA date of the confirmed component lot (#1)', () => {
    const glu = bottle({ openings: [opening('2028-03-01T15:00:00.000Z', '2028-03-28T15:00:00.000Z')] });
    const result = lots.assessReagentLots(lotForm([glu], '2028-03-25'), GLU, 'failed');
    assert.equal(result[0].daysToExpiry, -6);
    assert.equal(result[0].findings.find((f) => f.type === 'expired')?.score, 88);
    assert.ok(!result[0].findings.some((f) => f.type === 'near_expiry'));
  });

  check('recent lot change becomes a finding with the date the new lot entered', () => {
    const old = bottle({ lot: '00002', expiresAt: '2027-10-31', lotFactsKey: '21503:0000555', openings: [opening('2027-03-01T15:00:00.000Z', '2027-11-09T15:00:00.000Z')] });
    const fresh = bottle({ openings: [opening('2027-11-10T15:00:00.000Z', '2027-11-15T15:00:00.000Z')] });
    const changed = lots.assessReagentLots(lotForm([old, fresh], '2027-11-15'), GLU, 'failed');
    const finding = changed[0].findings.find((f) => f.type === 'lot_change');
    assert.ok(finding);
    assert.equal(changed[0].previousLot, '00002');
    assert.equal(changed[0].lotChangedDaysBefore, 5);
    assert.match(finding.explanation, /entró el 2027-11-10/);
  });

  check('blank out of the CoA spec: above a maximum, below a minimum (NADH reagents), only with a confirmed component lot', () => {
    const gluFacts = getLotFactsByKey('21503:0001935');
    const max = gluFacts.coa.controlData.find((row) => /REAGENT ABSORBANCE/i.test(row.name)).specMax;
    const above = lots.assessReagentLots(lotForm([bottle({ expiresAt: '2029-03-31' })], '2028-01-10', { reagentMeasurements: { GLU: { reagentId: 'GLU', obtainedValue: '', blankAbsorbance: String(max + 0.2), source: 'manual' } } }), GLU, 'failed');
    const finding = above[0].findings.find((f) => f.type === 'blank_out_of_coa');
    assert.ok(finding, 'above max');
    assert.match(finding.explanation, /máximo/);
    assert.equal(finding.fromBpl, undefined);

    // #2: a slightly negative blank on an increasing reagent (CoA spec 0–max) is noise, not a «below minimum».
    const negative = lots.assessReagentLots(lotForm([bottle({ expiresAt: '2029-03-31' })], '2028-01-10', { reagentMeasurements: { GLU: { reagentId: 'GLU', obtainedValue: '', blankAbsorbance: '-0.004', source: 'manual' } } }), GLU, 'failed');
    assert.ok(!negative[0].findings.some((f) => f.type === 'blank_out_of_coa'));
    assert.equal(negative[0].blankEvaluable, true);

    const ldhKey = listLotFacts().find((f) => f.productCode === '21580' && f.componentMatchConfirmed && f.coa?.controlData.some((r) => /REAGENT ABSORBANCE/i.test(r.name) && typeof r.specMin === 'number' && r.specMin > 0))?.key;
    assert.ok(ldhKey, 'an LDH lot with a minimum blank spec exists');
    const LDH = { id: 'LDH', key: 'LDH', code: 'LDH' };
    const ldhBottle = bottle({ testName: 'LDH', reagentId: 'LDH', reagentKey: 'LDH', techniqueCode: '580', expiresAt: '2029-09-30', lotFactsKey: ldhKey });
    const below = lots.assessReagentLots(lotForm([ldhBottle], '2028-01-10', { reagentMeasurements: { LDH: { reagentId: 'LDH', obtainedValue: '', blankAbsorbance: '0.9', source: 'manual' } } }), LDH, 'failed');
    assert.match(below[0].findings.find((f) => f.type === 'blank_out_of_coa').explanation, /mínimo/);

    const unconfirmed = (key) => ({ ...getLotFactsByKey(key), componentMatchConfirmed: false });
    const gated = lots.assessReagentLots(lotForm([bottle({ expiresAt: '2029-03-31' })], '2028-01-10', { reagentMeasurements: { GLU: { reagentId: 'GLU', obtainedValue: '', blankAbsorbance: String(max + 0.2), source: 'manual' } } }), GLU, 'failed', unconfirmed);
    assert.ok(!gated[0].findings.some((f) => f.type === 'blank_out_of_coa'), 'no CoA verdict for a lot inferred by expiry only');

    const bpl = lots.assessReagentLots(lotForm([bottle({ expiresAt: '2029-03-31' })], '2028-01-10', { bplEvidence: { serial: 'x' }, reagentMeasurements: { GLU: { reagentId: 'GLU', obtainedValue: '', blankAbsorbance: String(max + 0.2), source: 'auto_import' } } }), GLU, 'failed');
    assert.equal(bpl[0].findings.find((f) => f.type === 'blank_out_of_coa').fromBpl, true);
  });

  check('lot facts override the profile with the lot IFU (validated when the CoA confirms the lot, inferred otherwise)', () => {
    const profile = buildReagentProfiles(catalog).find((item) => item.id === 'GLU');
    const facts = getLotFactsByKey('21503:0001935');
    const adjusted = lots.applyLotFactsToProfile(profile, facts);
    assert.equal(adjusted.linearityLimit.value.value, facts.ifu.linearityLimit.value);
    assert.equal(adjusted.linearityLimit.status, 'validated');
    assert.match(adjusted.linearityLimit.sourceReference, /einfo\.bio 21503\/0001935/);
    assert.equal(adjusted.onboardStabilityHours.value, facts.ifu.onboardStability.hours);
    const inferred = lots.applyLotFactsToProfile(profile, { ...facts, componentMatchConfirmed: false });
    assert.equal(inferred.linearityLimit.confidence, 'inferred');
    assert.match(inferred.linearityLimit.sourceReference, /inferido por caducidad/);
  });

  check('IFU "interfiere" thresholds flag from the threshold and say so', () => {
    const profile = buildReagentProfiles(catalog).find((item) => item.id === 'GLU');
    const withThreshold = {
      ...profile,
      interferenceThresholds: { ...profile.interferenceThresholds, value: [{ interferent: 'lipemia', label: 'Lipemia (triglicéridos)', thresholdValue: 1300, unit: 'mg/dL', effect: 'may_interfere_above' }] },
    };
    const result = assessProcedureLimitations({ form: baseForm({ observations: 'lipemia triglicéridos 1300 mg/dL' }), failedProfiles: [withThreshold], matchedQcReference: null });
    const finding = result.findings.find((f) => f.type === 'interference');
    assert.ok(finding, 'interference at the declared level');
    assert.match(finding.explanation, /declara interferencia desde 1300/);
    // «La lipemia (triglicéridos hasta 1300 mg/dL) interfiere» (BIL T 21506): no safe level, any observed lipemia counts.
    const bilKey = listLotFacts().find((f) => f.productCode === '21506')?.key;
    const bil = lots.applyLotFactsToProfile(buildReagentProfiles(catalog).find((item) => item.id === 'BIL_T'), getLotFactsByKey(bilKey));
    const lipemia = bil.interferenceThresholds.value.find((t) => t.interferent === 'lipemia');
    assert.equal(lipemia.anyLevel, true);
    const anyLevel = assessProcedureLimitations({ form: baseForm({ observations: 'lipemia triglicéridos 400 mg/dL' }), failedProfiles: [bil], matchedQcReference: null });
    assert.match(anyLevel.findings.find((f) => f.type === 'interference')?.explanation || '', /interfiere \(probada hasta 1300 mg\/dL\), sin un nivel seguro/);
  });

  check('SAT patch: local report date drives eventDate and [LOTE] lines; bottles always travel as an array', () => {
    const summary = {
      sha256: 'f'.repeat(64), fileName: 'x.A400', serialNumber: '834000473', equipmentModel: 'BA400',
      // 2028-05-02 19:30 en México = 2028-05-03T01:30Z.
      reportGeneratedAt: '2028-05-03T01:30:00.000Z',
      coverage: { processedFiles: 1, totalFiles: 1, hasDatabaseBackup: false },
      findings: { distinctTests: 1, distinctLots: 1, errorCount: 0, warningCount: 0, qcEventCount: 0, calibrationEventCount: 0, dateFrom: null, dateTo: '2028-05-03T01:00:00.000Z' },
      events: Array.from({ length: 9 }, (_, i) => ({ category: 'error', code: `E${i}`, message: `evento ${i}` })),
      lots: [], qcResults: [],
      reagentBottles: [
        { testName: 'GLUCOSE', reagentRole: 'R1', barcode: '50311032800005000123', techniqueCode: '503', lot: '00005', expiryMonth: 3, expiryYear: 2028, expiresAt: '2028-03-31', bottleSerial: '000123', firstSeenAt: '2028-03-01T15:00:00.000Z', lastSeenAt: '2028-05-03T01:00:00.000Z', pipettingCount: 40, sourceFile: 'x' },
      ],
    };
    const build = buildSatFormPatch(summary, catalog);
    assert.equal(build.patch.fields.eventDate, '2028-05-02', 'local day, not the UTC day');
    assert.ok(Array.isArray(build.patch.reagentBottles) && build.patch.reagentBottles.length === 1);
    assert.match(build.patch.observationBlock.text, /\[LOTE 2028-05-02\] GLU R1 lote 00005 .*caducó el 2028-03-19 según el certificado del lote/);
    const summaryLines = build.patch.evidenceItems[0].ocrSummary;
    assert.ok(summaryLines.length <= 10);
    assert.ok(summaryLines.some((line) => line.startsWith('[LOTE')), 'evidence summary keeps room for lot lines');
    const empty = buildSatFormPatch({ ...summary, reagentBottles: undefined }, catalog);
    assert.deepEqual(empty.patch.reagentBottles, [], 'a report without barcodes still owns the bottle slot');
  });

  const engineForm = (overrides) =>
    baseForm({
      eventDate: '2028-05-02',
      failedReagentIds: ['GLU'],
      correctReagentIds: ['ALB', 'CHOL'],
      reagentBottles: [
        bottle({ openings: [opening('2028-04-20T15:00:00.000Z', '2028-05-02T15:00:00.000Z', '50311032800005000123')] }),
        bottle({ testName: 'ALBUMIN', reagentId: 'ALB', reagentKey: 'ALB', techniqueCode: '547', lot: '00002', expiresAt: '2029-12-31', lotFactsKey: '21547:0001144', openings: [opening('2028-03-01T15:00:00.000Z', '2028-05-02T15:00:00.000Z')] }),
        bottle({ testName: 'CHOLESTEROL', reagentId: 'CHOL', reagentKey: 'CHOL', techniqueCode: '505', lot: '00002', expiresAt: '2029-08-31', lotFactsKey: '21505:0001707', openings: [opening('2028-02-15T15:00:00.000Z', '2028-05-02T15:00:00.000Z')] }),
      ],
      ...overrides,
    });
  const hyp = (result, key) => result.hypotheses.find((h) => h.key === key);

  check('engine: an expired lot only in the failed test lifts control/lot over optics and shows lot evidence', () => {
    const result = runDriEngine(engineForm(), catalog);
    assert.equal(result.lotIntelligence.lotsInUse.length, 3);
    assert.ok(result.evidenceRows.some((row) => row.category === 'lot' && /caducado/.test(row.title)), 'lot evidence row');
    const control = hyp(result, 'hyp:control');
    assert.ok(control.evidenceFor.some((line) => /Lote caducado en uso/.test(line)), 'control cites the expired lot');
    assert.ok(control.evidenceFor.some((line) => /Ninguna prueba correcta evaluada en el SAT/.test(line)), 'observed contrast bonus');
    assert.equal(result.hypotheses[0].key, 'hyp:control');
    const optical = hyp(result, 'hyp:optical');
    if (optical) assert.ok(optical.evidenceAgainst.some((line) => /lote en uso/i.test(line)), 'optics is pushed back by the lot');
    assert.ok(result.logs.some((entry) => JSON.stringify(entry).includes('lot-intelligence')), 'engine logs the lot step');
  });

  check('engine: an expired lot shared by the correct tests does not move the verdict away from hardware', () => {
    const form = engineForm({ eventDate: '2030-06-01' });
    form.reagentBottles = form.reagentBottles.map((b) => ({ ...b, openings: b.openings.map((o) => ({ ...o, lastSeenAt: '2030-06-01T15:00:00.000Z' })) }));
    const result = runDriEngine(form, catalog);
    const control = hyp(result, 'hyp:control');
    assert.ok(!control || !control.evidenceFor.some((line) => /Lote caducado en uso/.test(line)), 'no lot positive when shared');
    assert.ok(!control || control.evidenceAgainst.some((line) => /también trabajan con lote caducado/.test(line)), 'explicit non-discrimination');
    for (const h of result.hypotheses) assert.ok(!h.evidenceAgainst.some((line) => /lote en uso/i.test(line)), `${h.key} keeps no lot negative`);
  });

  check('engine: no "contrast" bonus when the correct tests have no lots in the SAT', () => {
    const form = engineForm();
    form.reagentBottles = form.reagentBottles.filter((b) => b.reagentId === 'GLU');
    const result = runDriEngine(form, catalog);
    const control = hyp(result, 'hyp:control');
    assert.ok(control.evidenceFor.some((line) => /Lote caducado en uso/.test(line)));
    assert.ok(!control.evidenceFor.some((line) => /Ninguna prueba correcta/.test(line)), 'bonus not granted without observation');
    assert.ok(result.missingEvidence.some((line) => /Lotes de las pruebas correctas en el SAT/.test(line)));
  });

  check('engine: onboard stability is counted once when the manual opening date and the SAT bottle agree', () => {
    const form = engineForm({ eventDate: '2028-03-20', reagentOpenedAt: '2028-01-01' });
    form.reagentBottles = [bottle({ expiresAt: '2029-03-31', openings: [opening('2028-01-01T18:00:00.000Z', '2028-03-20T15:00:00.000Z')] }), ...form.reagentBottles.slice(1)];
    const result = runDriEngine(form, catalog);
    const control = hyp(result, 'hyp:control');
    const onboardLines = control.evidenceFor.filter((line) => /[Ee]stabilidad a bordo/.test(line));
    assert.equal(onboardLines.length, 1, onboardLines.join(' | '));
    assert.equal(result.evidenceRows.filter((row) => /estabilidad a bordo|stability:onboard/i.test(`${row.id} ${row.title}`)).length, 1);
  });

  check('engine: a BPL-imported blank out of the CoA is not booked as independent hardware-clearing evidence', () => {
    const max = getLotFactsByKey('21503:0001935').coa.controlData.find((row) => /REAGENT ABSORBANCE/i.test(row.name)).specMax;
    const form = engineForm({
      eventDate: '2028-01-10',
      bplEvidence: null,
      reagentMeasurements: { GLU: { reagentId: 'GLU', obtainedValue: '', blankAbsorbance: String(max + 0.2), source: 'auto_import' } },
    });
    form.reagentBottles = form.reagentBottles.map((b) => ({ ...b, expiresAt: '2029-12-31', openings: b.openings.map((o) => ({ ...o, firstSeenAt: '2028-01-05T15:00:00.000Z', lastSeenAt: '2028-01-10T15:00:00.000Z' })) }));
    const manual = runDriEngine({ ...form, reagentMeasurements: { GLU: { ...form.reagentMeasurements.GLU, source: 'manual' } } }, catalog);
    assert.ok(hyp(manual, 'hyp:control').evidenceFor.some((line) => /Blanco de reactivo fuera del límite del certificado/.test(line)));
    const stage = (status, rejectedTests = []) => ({ accepted: status === 'accepted' ? 1 : 0, rejected: rejectedTests.length, pending: 0, observed: 1, effectiveStatus: status, lastAt: '2028-01-10T15:00:00.000Z', rejectedTests, pendingTests: [], acceptedTests: [] });
    const bplEvidence = {
      serial: '834000473', sourceReference: 'BPL', capturedAt: '2028-01-10T15:00:00.000Z', windowStart: null, windowEnd: null, eventCount: 3,
      stages: { photometryBlank: stage('accepted'), reagentBlank: stage('rejected', ['GLUCOSE']), calibration: stage('accepted'), qualityControl: stage('rejected', ['GLUCOSE']) },
      qcFindings: [], calibrations: [], blanks: [], westgardRules: [], qcRejectedWithAcceptedChain: [], fullyAcceptedTests: [], intermittentTests: [], missingData: [], unmatchedTests: [],
    };
    const fromBpl = runDriEngine({ ...form, bplEvidence }, catalog);
    const control = hyp(fromBpl, 'hyp:control');
    if (control) assert.ok(!control.evidenceFor.some((line) => /^Blanco de reactivo fuera del límite/.test(line)), 'no full-weight duplicate');
    for (const h of fromBpl.hypotheses) assert.ok(!h.evidenceAgainst.some((line) => /lote en uso/i.test(line)), `${h.key}: BPL blank does not clear hardware`);
  });


  const lotBottle = (testName, reagentId, techniqueCode, lot, expiresAt, lotFactsKey, openings) =>
    bottle({ testName, reagentId, reagentKey: reagentId, techniqueCode, lot, expiresAt, lotFactsKey, openings });
  const stageOf = (status, rejectedTests = []) => ({ accepted: status === 'accepted' ? 1 : 0, rejected: rejectedTests.length, pending: 0, observed: 1, effectiveStatus: status, lastAt: null, rejectedTests, pendingTests: [], acceptedTests: [] });
  const bplWith = (extra = {}) => ({
    serial: '834000473', sourceReference: 'BPL', capturedAt: '2028-05-02T15:00:00.000Z', windowStart: null, windowEnd: null, eventCount: 1,
    stages: { photometryBlank: stageOf('accepted'), reagentBlank: stageOf('accepted'), calibration: stageOf('accepted'), qualityControl: stageOf('rejected', ['GLUCOSE']) },
    qcFindings: [], calibrations: [], blanks: [], westgardRules: [], qcRejectedWithAcceptedChain: [], fullyAcceptedTests: [], intermittentTests: [], missingData: [], unmatchedTests: [],
    ...extra,
  });

  check('engine (#6): correct tests without SAT lots do not dilute a lot finding shared by every evaluated correct test', () => {
    const result = runDriEngine(
      baseForm({
        eventDate: '2028-05-02',
        failedReagentIds: ['GLU', 'CHOL'],
        correctReagentIds: ['ALB', 'AMY', 'ALT_GPT'],
        reagentBottles: [
          lotBottle('GLUCOSE', 'GLU', '503', '00005', '2028-03-31', '21503:0001935', [opening('2028-04-20T15:00:00.000Z', '2028-05-02T15:00:00.000Z')]),
          lotBottle('CHOLESTEROL', 'CHOL', '505', '00002', '2027-08-31', '21505:0001707', [opening('2028-04-10T15:00:00.000Z', '2028-05-02T15:00:00.000Z')]),
          lotBottle('ALBUMIN', 'ALB', '547', '00002', '2027-12-31', '21547:0001144', [opening('2028-04-01T15:00:00.000Z', '2028-05-02T15:00:00.000Z')]),
        ],
      }),
      catalog,
    );
    const control = hyp(result, 'hyp:control');
    assert.ok(!control?.evidenceFor.some((line) => /Lote caducado en uso/.test(line)), 'no lot positive');
    assert.ok(control?.evidenceAgainst.some((line) => /también trabajan con lote caducado/.test(line)));
    for (const h of result.hypotheses) assert.ok(!h.evidenceAgainst.some((line) => /lote en uso/i.test(line)), `${h.key}: hardware not cleared`);
    const row = result.evidenceRows.find((r) => r.category === 'lot' && /caducado/.test(r.title));
    assert.match(row.evidenceAgainst, /También lo comparten 100% de las correctas evaluadas/, '#15: the row says it is shared');
    assert.ok(row.score < 88, '#15: shared rows rank lower');
  });

  check('engine (#7/#8): stopped or extrapolated lots neither inflate coverage nor clear hardware', () => {
    const result = runDriEngine(
      baseForm({
        eventDate: '2028-05-06',
        failedReagentIds: ['GLU', 'CHOL', 'TG'],
        correctReagentIds: ['ALB'],
        reagentBottles: [
          lotBottle('GLUCOSE', 'GLU', '503', '00005', '2028-03-31', '21503:0001935', [opening('2028-04-20T15:00:00.000Z', '2028-05-02T15:00:00.000Z')]),
          lotBottle('CHOLESTEROL', 'CHOL', '505', '00009', '2028-04-15', null, [opening('2028-03-01T15:00:00.000Z', '2028-04-10T15:00:00.000Z')]),
          lotBottle('ALBUMIN', 'ALB', '547', '00002', '2029-12-31', '21547:0001144', [opening('2028-04-01T15:00:00.000Z', '2028-05-02T15:00:00.000Z')]),
        ],
      }),
      catalog,
    );
    const chol = result.lotIntelligence.lotsInUse.find((lot) => lot.reagentId === 'CHOL');
    assert.equal(chol.usage, 'stopped');
    assert.ok(!chol.findings.some((f) => f.type === 'expired'));
    const control = hyp(result, 'hyp:control');
    assert.ok(!control?.evidenceFor.some((line) => /Lote caducado en uso en/.test(line)), '1 of 3 failed is not a majority');
    for (const h of result.hypotheses) assert.ok(!h.evidenceAgainst.some((line) => /lote en uso/i.test(line)));

    const extrapolated = runDriEngine(
      baseForm({
        eventDate: '2028-04-01',
        failedReagentIds: ['GLU', 'CHOL'],
        correctReagentIds: ['ALB'],
        reagentBottles: [
          lotBottle('GLUCOSE', 'GLU', '503', '00005', '2029-03-31', '21503:0001935', [opening('2028-01-01T15:00:00.000Z', '2028-02-15T15:00:00.000Z')]),
          lotBottle('CHOLESTEROL', 'CHOL', '505', '00002', '2029-08-31', '21505:0001707', [opening('2028-01-01T15:00:00.000Z', '2028-02-15T15:00:00.000Z')]),
          lotBottle('ALBUMIN', 'ALB', '547', '00002', '2029-12-31', '21547:0001144', [opening('2028-02-10T15:00:00.000Z', '2028-02-15T15:00:00.000Z')]),
        ],
      }),
      catalog,
    );
    const onboard = extrapolated.lotIntelligence.findings.filter((f) => f.type === 'onboard_exceeded' && f.outcome === 'failed');
    assert.ok(onboard.length && onboard.every((f) => !f.observed && f.score < 66), 'onboard past the SAT end is only «por confirmar»');
    for (const h of extrapolated.hypotheses) assert.ok(!h.evidenceAgainst.some((line) => /lote en uso/i.test(line)));
  });

  check('engine (#9): the lot IFU keeps comparing an interferent captured in another mass unit', () => {
    const result = runDriEngine(
      baseForm({
        eventDate: '2028-05-02',
        failedReagentIds: ['CK'],
        correctReagentIds: ['ALB'],
        observations: 'Muestra con hemólisis 12 g/L',
        reagentBottles: [lotBottle('CK', 'CK', '790', '00004', '2028-06-30', '21790:0003496', [opening('2028-04-20T15:00:00.000Z', '2028-05-02T15:00:00.000Z')])],
      }),
      catalog,
    );
    const row = result.evidenceRows.find((r) => /interference:CK:hemolysis/.test(r.id));
    assert.ok(row, 'hemolysis 12 g/L (1200 mg/dL) is above the lot IFU 1000 mg/dL');
    assert.match(row.evidenceFor || row.title, /hem/i);
  });

  check('engine (#10): manual onboard stability does not add +18 when the SAT shows the correct tests exceed it too', () => {
    const opened = [opening('2028-01-01T18:00:00.000Z', '2028-03-20T15:00:00.000Z')];
    const result = runDriEngine(
      baseForm({
        eventDate: '2028-03-20',
        reagentOpenedAt: '2028-01-01',
        failedReagentIds: ['GLU'],
        correctReagentIds: ['CHOL', 'CK'],
        reagentBottles: [
          lotBottle('GLUCOSE', 'GLU', '503', '00005', '2029-03-31', '21503:0001935', opened),
          lotBottle('CHOLESTEROL', 'CHOL', '505', '00002', '2029-08-31', '21505:0001707', opened),
          lotBottle('CK', 'CK', '790', '00004', '2029-06-30', '21790:0003496', opened),
        ],
      }),
      catalog,
    );
    const control = hyp(result, 'hyp:control');
    assert.ok(!control?.evidenceFor.some((line) => /lleva abierto más tiempo del que admite su IFU/.test(line)), 'no +18');
    assert.ok(control?.evidenceAgainst.some((line) => /también exceden la estabilidad a bordo/.test(line)));
  });

  check('engine (#11): a blank out of the CoA without any correct-test blank does not clear optics and asks for one', () => {
    const result = runDriEngine(
      baseForm({
        eventDate: '2028-01-10',
        eventType: 'failed_blank',
        failedReagentIds: ['GLU', 'CHOL'],
        correctReagentIds: ['ALB', 'AMY'],
        reagentMeasurements: {
          GLU: { reagentId: 'GLU', obtainedValue: '', blankAbsorbance: '0.30', source: 'manual' },
          CHOL: { reagentId: 'CHOL', obtainedValue: '', blankAbsorbance: '0.30', source: 'manual' },
        },
        reagentBottles: [
          lotBottle('GLUCOSE', 'GLU', '503', '00005', '2029-03-31', '21503:0001935', [opening('2028-01-05T15:00:00.000Z', '2028-01-10T15:00:00.000Z')]),
          lotBottle('CHOLESTEROL', 'CHOL', '505', '00002', '2029-08-31', '21505:0001707', [opening('2028-01-05T15:00:00.000Z', '2028-01-10T15:00:00.000Z')]),
          lotBottle('ALBUMIN', 'ALB', '547', '00002', '2029-12-31', '21547:0001144', [opening('2028-01-05T15:00:00.000Z', '2028-01-10T15:00:00.000Z')]),
        ],
      }),
      catalog,
    );
    for (const h of result.hypotheses) assert.ok(!h.evidenceAgainst.some((line) => /lote en uso/i.test(line)), `${h.key}: not cleared`);
    assert.ok(result.missingEvidence.some((line) => /Blanco de reactivo de una prueba correcta/.test(line)));
  });

  check('engine (#13/#14): missing evidence is listed once, and an accepted BPL calibration after the lot change satisfies the IFU', () => {
    const glu = [
      lotBottle('GLUCOSE', 'GLU', '503', '00004', '2029-01-31', null, [opening('2028-02-01T15:00:00.000Z', '2028-04-24T15:00:00.000Z')]),
      lotBottle('GLUCOSE', 'GLU', '503', '00005', '2028-03-31', '21503:0001935', [opening('2028-04-25T15:00:00.000Z', '2028-05-02T15:00:00.000Z')]),
    ];
    const lonely = runDriEngine(baseForm({ eventDate: '2028-05-02', failedReagentIds: ['GLU'], correctReagentIds: ['ALB'], reagentBottles: glu }), catalog);
    const control = hyp(lonely, 'hyp:control');
    assert.equal(control.missingEvidence.filter((line) => /Lotes de las pruebas correctas/.test(line)).length, 1);

    const withAlb = [...glu, lotBottle('ALBUMIN', 'ALB', '547', '00002', '2029-12-31', '21547:0001144', [opening('2028-03-01T15:00:00.000Z', '2028-05-02T15:00:00.000Z')])];
    const uncalibrated = runDriEngine(baseForm({ eventDate: '2028-05-02', failedReagentIds: ['GLU'], correctReagentIds: ['ALB'], reagentBottles: withAlb, bplEvidence: bplWith() }), catalog);
    assert.ok(hyp(uncalibrated, 'hyp:control').evidenceFor.some((line) => /Cambio de lote reciente solo en las fallidas/.test(line)));
    const calibrated = runDriEngine(
      baseForm({
        eventDate: '2028-05-02', failedReagentIds: ['GLU'], correctReagentIds: ['ALB'], reagentBottles: withAlb,
        bplEvidence: bplWith({ calibrations: [{ testName: 'GLUCOSE', reagentId: 'GLU', status: 'accepted', correlation: null, relativeError: null, slope: null, offset: null, curveType: null, pointCount: 1, calibratorName: null, calibratorLot: null, observedAt: '2028-04-26T15:00:00.000Z' }] }),
      }),
      catalog,
    );
    const cal = hyp(calibrated, 'hyp:control');
    assert.ok(!cal.evidenceFor.some((line) => /Cambio de lote reciente solo en las fallidas/.test(line)));
    assert.ok(!cal.missingEvidence.some((line) => /Calibración aceptada después del cambio de lote/.test(line)));
  });


  check('round 3: stray bottle at a swap, one in-use window for both sides, holiday export, parked failing test', () => {
    // #4: a stray old-lot bottle pipetted once between two bottles of lot B is not a lot change.
    const a = bottle({ lot: 'AAAAA', expiresAt: '2029-12-31', lotFactsKey: null, openings: [opening('2028-01-01T15:00:00.000Z', '2028-01-31T15:00:00.000Z', 'A1'), { ...opening('2028-04-23T14:30:00.000Z', '2028-04-23T14:30:00.000Z', 'A2'), pipettingCount: 1 }] });
    const b = bottle({ lot: 'BBBBB', expiresAt: '2029-12-31', lotFactsKey: null, openings: [opening('2028-02-01T15:00:00.000Z', '2028-04-23T14:00:00.000Z', 'B1'), opening('2028-04-23T16:00:00.000Z', '2028-05-02T15:00:00.000Z', 'B2')] });
    const swap = lots.resolveActiveLot([a, b], 'R1', '2028-05-02');
    assert.equal(swap.runStartedAt, '2028-02-01T15:00:00.000Z');
    // A real switch-back (lot A used for days between B bottles) still starts a new run.
    const realA = bottle({ lot: 'AAAAA', expiresAt: '2029-12-31', lotFactsKey: null, openings: [opening('2028-01-01T15:00:00.000Z', '2028-01-31T15:00:00.000Z', 'A1'), opening('2028-04-10T15:00:00.000Z', '2028-04-22T15:00:00.000Z', 'A2')] });
    const b2 = bottle({ lot: 'BBBBB', expiresAt: '2029-12-31', lotFactsKey: null, openings: [opening('2028-02-01T15:00:00.000Z', '2028-04-09T14:00:00.000Z', 'B1'), opening('2028-04-23T16:00:00.000Z', '2028-05-02T15:00:00.000Z', 'B2')] });
    assert.equal(lots.resolveActiveLot([realA, b2], 'R1', '2028-05-02').runStartedAt, '2028-04-23T16:00:00.000Z');

    // Regression 1: a weekly correct test last run 6 days before the event is evaluable and shares the expired lot.
    const weekly = runDriEngine(baseForm({
      eventDate: '2028-05-02', failedReagentIds: ['GLU'], correctReagentIds: ['ALB', 'CHOL'],
      reagentBottles: [
        lotBottle('GLUCOSE', 'GLU', '503', '00005', '2028-03-31', '21503:0001935', [opening('2028-04-20T15:00:00.000Z', '2028-05-02T15:00:00.000Z')]),
        lotBottle('ALBUMIN', 'ALB', '547', '00002', '2027-12-31', '21547:0001144', [opening('2028-04-01T15:00:00.000Z', '2028-04-26T15:00:00.000Z')]),
        lotBottle('CHOLESTEROL', 'CHOL', '505', '00002', '2029-08-31', '21505:0001707', [opening('2028-04-01T15:00:00.000Z', '2028-05-02T15:00:00.000Z')]),
      ],
    }), catalog);
    for (const h of weekly.hypotheses) assert.ok(!h.evidenceAgainst.some((line) => /lote en uso/i.test(line)), `${h.key}: shared with the weekly correct test`);

    // Regression 2: holiday export — every test stops Friday, SAT exported Tuesday; the shared expired lot is still shared.
    const holiday = runDriEngine(baseForm({
      eventDate: '2028-05-02', failedReagentIds: ['GLU'], correctReagentIds: ['ALB'],
      reagentBottles: [
        lotBottle('GLUCOSE', 'GLU', '503', '00005', '2028-03-31', '21503:0001935', [opening('2028-04-20T15:00:00.000Z', '2028-04-28T23:00:00.000Z')]),
        lotBottle('ALBUMIN', 'ALB', '547', '00002', '2027-12-31', '21547:0001144', [opening('2028-04-01T15:00:00.000Z', '2028-04-28T23:00:00.000Z')]),
      ],
    }), catalog);
    const hc = hyp(holiday, 'hyp:control');
    assert.ok(!hc?.evidenceFor.some((line) => /Lote caducado en uso en/.test(line)), 'no lot positive on a shared factor');
    assert.ok(hc?.evidenceAgainst.some((line) => /también trabajan con lote caducado/.test(line)));
    assert.ok(holiday.lotIntelligence.lotsInUse.every((lot) => lot.usage === 'observed'), 'horizon = end of the SAT');

    // Regression 3: the failing test parked 5 days before the export keeps its recent lot change.
    const parked = lots.assessReagentLots(lotForm([
      lotBottle('GLUCOSE', 'GLU', '503', '00002', '2029-01-31', null, [opening('2028-02-01T15:00:00.000Z', '2028-04-21T15:00:00.000Z')]),
      lotBottle('GLUCOSE', 'GLU', '503', '00005', '2029-03-31', '21503:0001935', [opening('2028-04-22T15:00:00.000Z', '2028-04-27T15:00:00.000Z')]),
      lotBottle('ALBUMIN', 'ALB', '547', '00002', '2029-12-31', null, [opening('2028-04-01T15:00:00.000Z', '2028-05-02T15:00:00.000Z')]),
    ], '2028-05-02'), GLU, 'failed');
    const change = parked[0].findings.find((f) => f.type === 'lot_change');
    assert.ok(change && change.observed, 'lot change kept and observed');
  });

  check('round 3: projected onboard never counts; manual stability vs SAT-only correct side; calibration by canonical key and before the event', () => {
    // #5/#8: SAT ends 2 days before the event at day 59 → only «por confirmar», never +16.
    const projected = runDriEngine(baseForm({
      eventDate: '2028-03-02', failedReagentIds: ['GLU', 'CHOL'], correctReagentIds: ['ALB'],
      reagentBottles: [
        lotBottle('GLUCOSE', 'GLU', '503', '00005', '2029-03-31', '21503:0001935', [opening('2028-01-01T18:00:00.000Z', '2028-03-01T02:00:00.000Z')]),
        lotBottle('CHOLESTEROL', 'CHOL', '505', '00002', '2029-08-31', '21505:0001707', [opening('2028-01-01T18:00:00.000Z', '2028-03-01T02:00:00.000Z')]),
        lotBottle('ALBUMIN', 'ALB', '547', '00002', '2029-12-31', '21547:0001144', [opening('2028-02-20T18:00:00.000Z', '2028-03-01T02:00:00.000Z')]),
      ],
    }), catalog);
    const proj = projected.lotIntelligence.findings.filter((f) => f.type === 'onboard_exceeded');
    assert.ok(proj.length && proj.every((f) => !f.observed));
    assert.ok(!hyp(projected, 'hyp:control')?.evidenceFor.some((line) => /Estabilidad a bordo del IFU del lote excedida/.test(line)));

    // #10 case B: failed GLU has no SAT bottle, correct CHOL and CK exceed → manual date does not add +18.
    const opened = [opening('2028-01-01T18:00:00.000Z', '2028-03-20T15:00:00.000Z')];
    const manual = runDriEngine(baseForm({
      eventDate: '2028-03-20', reagentOpenedAt: '2028-01-01', failedReagentIds: ['GLU'], correctReagentIds: ['CHOL', 'CK'],
      reagentBottles: [lotBottle('CHOLESTEROL', 'CHOL', '505', '00002', '2029-08-31', '21505:0001707', opened), lotBottle('CK', 'CK', '790', '00004', '2029-06-30', '21790:0003496', opened)],
    }), catalog);
    assert.ok(!hyp(manual, 'hyp:control')?.evidenceFor.some((line) => /lleva abierto más tiempo del que admite su IFU/.test(line)));

    // #14: a GLUCOSA (duplicate id) calibration counts for GLU; one after the event does not.
    const glu = [
      lotBottle('GLUCOSE', 'GLU', '503', '00004', '2029-01-31', null, [opening('2028-02-01T15:00:00.000Z', '2028-04-24T15:00:00.000Z')]),
      lotBottle('GLUCOSE', 'GLU', '503', '00005', '2029-03-31', '21503:0001935', [opening('2028-04-25T15:00:00.000Z', '2028-05-02T15:00:00.000Z')]),
      lotBottle('ALBUMIN', 'ALB', '547', '00002', '2029-12-31', '21547:0001144', [opening('2028-03-01T15:00:00.000Z', '2028-05-02T15:00:00.000Z')]),
    ];
    const cal = (reagentId, observedAt) => ({ testName: 'GLUCOSE', reagentId, status: 'accepted', correlation: null, relativeError: null, slope: null, offset: null, curveType: null, pointCount: 1, calibratorName: null, calibratorLot: null, observedAt });
    const run = (calibrations) => hyp(runDriEngine(baseForm({ eventDate: '2028-05-02', failedReagentIds: ['GLU'], correctReagentIds: ['ALB'], reagentBottles: glu, bplEvidence: bplWith({ calibrations }) }), catalog), 'hyp:control');
    assert.ok(!run([cal('GLUCOSA', '2028-04-26T15:00:00+00:00')]).evidenceFor.some((line) => /Cambio de lote reciente solo en las fallidas/.test(line)), 'duplicate id matched by key');
    assert.ok(run([cal('GLU', '2028-05-05T15:00:00.000Z')]).evidenceFor.some((line) => /Cambio de lote reciente solo en las fallidas/.test(line)), 'calibration after the event does not count');
  });

  check('round 3: shared rows, interference edge cases, SAT reagent lot field, R2 CoA expiry', () => {
    // #15: GLU expired (1 of 3 failed) and the only evaluated correct test ALB also expired → the row says so.
    const result = runDriEngine(baseForm({
      eventDate: '2028-05-02', failedReagentIds: ['GLU', 'TG', 'URIC'], correctReagentIds: ['ALB'],
      reagentBottles: [
        lotBottle('GLUCOSE', 'GLU', '503', '00005', '2028-03-31', '21503:0001935', [opening('2028-04-20T15:00:00.000Z', '2028-05-02T15:00:00.000Z')]),
        lotBottle('ALBUMIN', 'ALB', '547', '00002', '2027-12-31', '21547:0001144', [opening('2028-04-01T15:00:00.000Z', '2028-05-02T15:00:00.000Z')]),
      ],
    }), catalog);
    const row = result.evidenceRows.find((r) => r.id === 'lot:expired:GLU:R1');
    assert.match(row.evidenceAgainst, /También lo comparten 100%/);
    assert.ok(row.score < 88);

    const profile = buildReagentProfiles(catalog).find((item) => item.id === 'BIL_T');
    const bil = lots.applyLotFactsToProfile(profile, getLotFactsByKey(listLotFacts().find((f) => f.productCode === '21506').key));
    const zero = assessProcedureLimitations({ form: baseForm({ observations: 'Índices HIL: lipemia 0 mg/dL' }), failedProfiles: [bil], matchedQcReference: null });
    assert.ok(!zero.findings.some((f) => f.type === 'interference'), 'a zero HIL index is not interference');
    const crea = lots.applyLotFactsToProfile(buildReagentProfiles(catalog).find((item) => item.id === 'CREA_JAFFE'), getLotFactsByKey('21502:0002601'));
    const multi = assessProcedureLimitations({ form: baseForm({ observations: 'Hemoglobina 0,3 g/L en la primera toma; hemólisis 650 mg/dL en la repetición.' }), failedProfiles: [crea], matchedQcReference: null });
    assert.ok(multi.findings.some((f) => f.type === 'interference' && f.interferent === 'hemolysis'), 'the highest mention wins');
    const elevated = crea.interferenceThresholds.value.find((t) => t.condition === 'elevated');
    if (elevated) assert.equal(elevated.anyLevel, false);

    const ck = lots.assessReagentLots(lotForm([lotBottle('CK', 'CK', '790', '00004', '2028-06-30', '21790:0003496', [opening('2028-05-01T15:00:00.000Z', '2028-06-11T20:00:00.000Z')]), { ...lotBottle('CK', 'CK', '790', '00004', '2028-06-30', '21790:0003496', [opening('2028-05-01T15:00:00.000Z', '2028-06-11T20:00:00.000Z')]), reagentRole: 'R2' }], '2028-06-11'), { id: 'CK', key: 'CK', code: 'CK' }, 'failed');
    assert.equal(ck.find((l) => l.role === 'R1').expiresAt, '2028-06-10');
    assert.equal(ck.find((l) => l.role === 'R2').expiresAt, '2028-06-11', 'R2 uses component B');
    assert.ok(!ck.find((l) => l.role === 'R2').findings.some((f) => f.type === 'expired'));

    const sat = buildSatFormPatch({
      sha256: 'e'.repeat(64), fileName: 'x.A400', serialNumber: '834000473', equipmentModel: 'BA400', reportGeneratedAt: '2028-05-02T15:00:00.000Z',
      coverage: { processedFiles: 1, totalFiles: 1, hasDatabaseBackup: false },
      findings: { distinctTests: 1, distinctLots: 1, errorCount: 0, warningCount: 0, qcEventCount: 0, calibrationEventCount: 0, dateFrom: null, dateTo: null },
      events: [], qcResults: [], reagentBottles: [],
      lots: [{ kind: 'reagent', name: 'CHOLESTEROL R1', lot: '00002', firstSeenAt: '2028-05-01T00:00:00.000Z', lastSeenAt: '2028-05-02T00:00:00.000Z', sourceFile: 'x', tests: [] }],
    }, catalog);
    assert.equal(sat.patch.fields.reagentLot, undefined, 'barcode-derived lots do not fill the case reagent lot');
  });

  check('engine without bottles keeps the generic path (no lot intelligence, no lot rows)', () => {
    const result = runDriEngine(baseForm(), catalog);
    assert.equal(result.lotIntelligence, null);
    assert.ok(!result.evidenceRows.some((row) => row.category === 'lot'));
  });

  console.log(`${checks.length} checks passed`);
  checks.forEach((name) => console.log(`  ✓ ${name}`));
} finally {
  await vite.close();
}
