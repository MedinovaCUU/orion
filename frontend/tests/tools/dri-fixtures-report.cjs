// Reporte de fixtures del motor DRI. Uso: node tests/tools/dri-fixtures-report.cjs [case-id]
// Con DRI_FIXTURES_MIN=N devuelve código 1 si pasan menos de N escenarios.
const { createServer } = require('vite');
(async () => {
  const vite = await createServer({ root: process.cwd(), cacheDir: 'node_modules/.vite-dri-tests', server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  console.info = () => {}; console.debug = () => {}; console.warn = () => {};
  const { runDriValidationFixtures, runDriEngine } = await vite.ssrLoadModule('/src/modules/dri/driEngine.ts');
  const { DRI_WORKBOOK_SEED } = await vite.ssrLoadModule('/src/modules/dri/driWorkbookSeed.generated.ts');
  const { enrichCatalogWithReagentIdentity } = await vite.ssrLoadModule('/src/modules/dri/knowledge/reagentIdentity.ts');
  const catalog = enrichCatalogWithReagentIdentity({ reagents: DRI_WORKBOOK_SEED.reagents, factors: DRI_WORKBOOK_SEED.factors, links: DRI_WORKBOOK_SEED.factorLinks }, { catalogRows: [], aliasRows: [] });
  const results = runDriValidationFixtures(catalog);
  const log = console.log;
  results.forEach(r => log(r.id.padEnd(8), r.passed ? 'PASS' : 'FAIL', String(r.topProbability).padStart(5), r.topHypothesis));
  const passed = results.filter(r => r.passed).length;
  log('passed', passed, '/', results.length);
  const minimum = Number(process.env.DRI_FIXTURES_MIN || 0);
  if (minimum && passed < minimum) process.exitCode = 1;
  if (process.argv[2]) {
    const { DRI_VALIDATION_FIXTURES } = await vite.ssrLoadModule('/src/modules/dri/driEngine.ts');
    const fx = DRI_VALIDATION_FIXTURES.find(f => f.id === process.argv[2]);
    const res = runDriEngine(fx.input, catalog);
    res.hypotheses.forEach(h => log('\n#', h.title, h.probabilityScore, '\n  +', h.evidenceFor.join('\n  + '), '\n  -', h.evidenceAgainst.join('\n  - ')));
    log('\ncontrast:', res.contrast.rows.slice(0, 8).map(r => `${r.signalId} ${r.verdict} f${r.failedShared.length}/c${r.correctShared.length}`).join(' | '));
    log('discriminating:', res.contrast.discriminatingTests.map(t => `${t.reagentId}(${t.weight})`).join(' '));
  }
  await vite.close();
})();
