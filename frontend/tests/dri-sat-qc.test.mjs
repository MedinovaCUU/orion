import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Controles del .bak en DRI: se clasifican contra los límites del analizador y marcan exactamente el reactivo que
// la lista del tablero muestra (sin importar el orden en que Supabase devuelva el catálogo).
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, cacheDir: 'node_modules/.vite-dri-tests', server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
console.info = () => {}; console.debug = () => {}; console.warn = () => {};
const checks = [];
const check = (name, fn) => { fn(); checks.push(name); };
const qc = (testKey, testName, resultValue, unit, analyzerMin, analyzerMax, analyzerTarget, analyzerSd = null, controlLot = '0001C1') => ({
  id: null, serialNumber: '834000473', equipmentModel: 'BA400', testKey, testId: null, testName, testShortName: testKey, reagentId: null,
  controlId: 1, controlName: 'CONTROL 1', controlLot, controlLevel: 'level_1', resultValue, resultAt: '2026-09-08T14:28:18.000Z',
  unit, analyzerMin, analyzerMax, analyzerTarget, analyzerSd, analyzerValidationStatus: 'PENDING', sourceType: 'sat_report', sourceImportId: 'imp-1',
});
// Valores reales del SAT 834000473 (08-09-2026) más un control fuera de límites para la prueba de «fallida».
const RESULTS = [
  qc('MG', 'MAGNESIUM', 1.6431487, 'mg/dL', 1.15, 1.73, 1.44),
  qc('LDH', 'LDH', 396.69333, 'U/L', 337, 485, 411),
  qc('AST-GOT', 'AST-GOT', 46.720577, 'U/L', 33, 56, 45),
  qc('ALT', 'ALT-GPT', 36.030365, 'U/L', 30, 46, 38),
  qc('T-PROT B', 'PROTEIN TOTALBIR', 5.5251646, 'g/dL', 4.59, 5.85, 5.22),
  qc('UREA', 'UREA-BUN-UV', 55.39542, 'mg/dL', 44, 66, 55),
  qc('GLU', 'GLUCOSE', 120, 'mg/dL', 75, 102, 89),
];
try {
  const { classifySatQcResults } = await vite.ssrLoadModule('/src/modules/dri/utils/satQcClassifier.ts');
  const { buildSatFormPatch } = await vite.ssrLoadModule('/src/modules/dri/utils/sourcePatches.ts');
  const { DRI_WORKBOOK_SEED } = await vite.ssrLoadModule('/src/modules/dri/driWorkbookSeed.generated.ts');
  const { enrichCatalogWithReagentIdentity, reagentSelectionKey, reagentSelectionScore } = await vite.ssrLoadModule('/src/modules/dri/knowledge/reagentIdentity.ts');
  const { buildReagentProfiles } = await vite.ssrLoadModule('/src/modules/dri/knowledge/reagentRelations.ts');
  const enrich = (reagents) => enrichCatalogWithReagentIdentity({ reagents, factors: DRI_WORKBOOK_SEED.factors, links: DRI_WORKBOOK_SEED.factorLinks }, { catalogRows: [], aliasRows: [] });
  const orders = {
    seed: DRI_WORKBOOK_SEED.reagents,
    byName: [...DRI_WORKBOOK_SEED.reagents].sort((a, b) => String(a.name).localeCompare(String(b.name))),
    reversed: [...DRI_WORKBOOK_SEED.reagents].reverse(),
  };
  /** Lo que muestra la lista del tablero: un reactivo por código visible, el de mayor puntuación (empate: id). */
  const visibleIds = (catalog) => {
    const visible = new Map();
    for (const profile of buildReagentProfiles(catalog).filter((p) => !p.platforms.value.length || p.platforms.value.includes('BA400'))) {
      const key = reagentSelectionKey(profile.legacy);
      const current = visible.get(key);
      const score = reagentSelectionScore(profile.legacy);
      if (!current || score > reagentSelectionScore(current.legacy) || (score === reagentSelectionScore(current.legacy) && profile.id.localeCompare(current.id) < 0)) visible.set(key, profile);
    }
    return new Set([...visible.values()].map((profile) => profile.id));
  };

  check('controls mark the same reagent the picker shows, whatever the catalog order', () => {
    const marked = [];
    for (const [label, reagents] of Object.entries(orders)) {
      const catalog = enrich(reagents);
      const projection = classifySatQcResults(catalog, RESULTS);
      const ids = [...projection.failedReagentIds, ...projection.correctReagentIds].sort();
      const hidden = ids.filter((id) => !visibleIds(catalog).has(id));
      assert.deepEqual(hidden, [], `${label}: every marked reagent is visible`);
      marked.push(ids.join(','));
    }
    assert.equal(new Set(marked).size, 1, 'same ids under every order');
  });

  check('a control outside the analyzer limits marks the test as failed; the others are correct', () => {
    const catalog = enrich(orders.byName);
    const projection = classifySatQcResults(catalog, RESULTS);
    assert.deepEqual(projection.failedReagentIds, ['GLU']);
    assert.equal(projection.correctReagentIds.length, 6);
    assert.equal(projection.reagentMeasurements.GLU.qcBand, 'out_of_reject');
  });

  check('each control is judged against the target ± SD of its own lot in use (real 834000473 values)', () => {
    // CK-MB existe en el catálogo de producción; aquí se agrega uno sintético para reproducirlo.
    const ck = DRI_WORKBOOK_SEED.reagents.find((reagent) => reagent.id === 'CK');
    const withCkMb = [...orders.byName, { ...ck, id: 'CK_MB', name: 'CK-MB', displayCode: 'CK MB', referenceCode: 'CK MB', canonicalNames: ['CK-MB', 'CK MB'] }];
    const catalog = enrich(withCkMb);
    const results = [
      qc('CK-MB', 'CK-MB', 34.035503, 'U/L', 50, 75, 62.5, 4.1666665, '0001  A'),
      qc('ALB', 'ALBUMIN', 3.27351, 'g/dL', 2.4000001, 3.4000001, 2.9000001, 0.17),
      qc('MG', 'MAGNESIUM', 1.6431487, 'mg/dL', 1.15, 1.73, 1.4400001, 0.097),
      qc('GLU', 'GLUCOSE', 84.212608, 'mg/dL', 75, 102, 89, 4.5),
    ];
    const projection = classifySatQcResults(catalog, results);
    const ckMbId = projection.failedReagentIds.find((id) => /CK.?MB/i.test(id));
    assert.ok(ckMbId, `CK-MB beyond 3 SD (z −6.8) must fail; failed=${projection.failedReagentIds}`);
    assert.equal(projection.reagentMeasurements[ckMbId].qcBand, 'out_of_reject');
    assert.equal(projection.reagentMeasurements[ckMbId].qcReference.targetValue, 62.5, 'the reference is the lot in use, not a value sheet of another lot');
    assert.equal(projection.reagentMeasurements.ALB.qcBand, 'near_reject', 'albumin z +2.2 is a warning, still correct');
    assert.ok(projection.correctReagentIds.includes('ALB'));
    assert.equal(projection.reagentMeasurements.ALB.obtainedValue, '3.27', 'shown with the precision of its SD');
    assert.equal(projection.reagentMeasurements.GLU.qcReference.productCode, 'ANALYZER');
  });

  check('without analyzer data, a value sheet is used only for the exact same control lot', () => {
    const catalog = enrich(orders.byName);
    const otherLot = classifySatQcResults(catalog, [qc('GLU', 'GLUCOSE', 160, 'mg/dL', null, null, null, null, '0001C1')]);
    assert.equal(otherLot.failedReagentIds.length + otherLot.correctReagentIds.length, 0, 'another lot\'s targets are not used: pending');
    assert.equal(otherLot.pendingCount, 1);
    const sameLot = classifySatQcResults(catalog, [qc('GLU', 'GLUCOSE', 160, 'mg/dL', null, null, null, null, '0001739')]);
    assert.deepEqual(sameLot.failedReagentIds, ['GLU'], 'the einfo sheet of lot 0001739 (target 91) applies to lot 0001739');
  });

  check('the SAT patch reports the controls instead of «.bak pendiente»', () => {
    const catalog = enrich(orders.byName);
    const summary = {
      sha256: 'a'.repeat(64), fileName: 'x.A400', serialNumber: '834000473', equipmentModel: 'BA400', reportGeneratedAt: '2026-09-08T21:29:00.000Z',
      coverage: { processedFiles: 1, totalFiles: 2, hasDatabaseBackup: true },
      findings: { distinctTests: 7, distinctLots: 1, errorCount: 0, warningCount: 0, qcEventCount: 0, calibrationEventCount: 0, dateFrom: null, dateTo: null },
      events: [], lots: [], reagentBottles: [], qcResults: RESULTS,
    };
    const withQc = buildSatFormPatch(summary, catalog);
    assert.ok(withQc.notes.some((note) => /Controles del equipo: 7 evaluados \(último 2026-09-08\)/.test(note)));
    assert.ok(!withQc.notes.some((note) => /pendiente/.test(note)));
    assert.deepEqual(withQc.patch.failedReagentIds, ['GLU']);
    const waiting = buildSatFormPatch({ ...summary, qcResults: [] }, catalog);
    assert.ok(waiting.notes.some((note) => /servicio de controles los extrae/.test(note)));
  });

  check('a duplicate «Pendiente IFU» entry does not outrank the one whose IFU was analyzed', () => {
    const catalog = enrich(orders.reversed);
    const byId = new Map(catalog.reagents.map((reagent) => [reagent.id, reagent]));
    assert.equal(byId.get('CREA_JAFFE').sourceStatus, 'Pendiente IFU/programación');
    assert.ok(reagentSelectionScore(byId.get('CREATININA')) > reagentSelectionScore(byId.get('CREA_JAFFE')));
    assert.ok(reagentSelectionScore(byId.get('BILIRRUBIN')) > reagentSelectionScore(byId.get('BIL_T')));
    const visible = visibleIds(catalog);
    assert.ok(visible.has('CREATININA') && !visible.has('CREA_JAFFE'));
    assert.ok(visible.has('BILIRRUBIN') && !visible.has('BIL_T'));
  });

  console.log(JSON.stringify({ checks: checks.length, passed: checks }, null, 2));
} finally {
  await vite.close();
}
