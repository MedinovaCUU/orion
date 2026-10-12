#!/usr/bin/env node
/**
 * Inteligencia de lotes DRI: liga cada botella de reactivo vista en un reporte SAT (lote y caducidad
 * decodificados del código de barras) con su lote de producto en einfo.bio y extrae del IFU y del
 * certificado de análisis los hechos que necesita el diagnóstico (límites de detección y linealidad,
 * precisión, estabilidad a bordo, límite de absorbancia del blanco, filtros, volúmenes, calibración,
 * interferencias, datos de control del lote).
 *
 * Uso (desde la raíz del proyecto):
 *   node tools/einfo-lot-intelligence/einfo-lot-facts.mjs --sat "SATReport 08-09-2026 15-29.A400" --password "$SAT_EXPORT_PASSWORD" \
 *     [--since-months 18] [--controls 18009,18010] [--limit 60] [--out output/einfo/lot-facts] \
 *     [--generated frontend/src/modules/dri/knowledge/einfoLotFacts.generated.json]
 *   node tools/einfo-lot-intelligence/einfo-lot-facts.mjs --bottles 790:00004:2028-06-30,503:00005:2028-03-31
 *   node tools/einfo-lot-intelligence/einfo-lot-facts.mjs --reparse   (relee los PDF ya descargados sin tocar einfo.bio)
 *
 * Salidas:
 *  - output/einfo/lot-facts/einfo-lot-facts.full.json: todo (botellas, documentos, listas de lotes por producto,
 *    candidatos evaluados); es la fuente de --reparse. Además un <código>_<lote>.json por lote y por control.
 *  - el JSON del frontend es una copia reducida (sin botellas, documentos ni valores de referencia; productos
 *    solo con título y lote vigente; controles solo con su hoja de valores).
 * `generatedAt` es siempre la hora de la última consulta a einfo.bio; --reparse solo escribe `reparsedAt`.
 *
 * Requiere Node 20+ (fetch nativo) y python3 con PyMuPDF (`fitz`) para leer los PDF. No escribe en Supabase.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EInfoClient } from './einfo-client.mjs';
import { chooseLotMatch, monthKey } from './lot-matching.mjs';
import { parseCoa, parseIfu, parseValueSheet } from './parsers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..', '..');
const frontendRoot = path.join(projectRoot, 'frontend');

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const token = process.argv[index];
  if (!token.startsWith('--')) continue;
  const next = process.argv[index + 1];
  if (next && !next.startsWith('--')) {
    args.set(token, next);
    index += 1;
  } else args.set(token, 'true');
}

const outDir = path.resolve(projectRoot, args.get('--out') || 'output/einfo/lot-facts');
const fullPath = path.join(outDir, 'einfo-lot-facts.full.json');
const generatedPath = path.resolve(projectRoot, args.get('--generated') || 'frontend/src/modules/dri/knowledge/einfoLotFacts.generated.json');
const sinceMonths = Number(args.get('--since-months') || 18);
const limit = Number(args.get('--limit') || 80);
const controlCodes = (args.get('--controls') || '').split(',').map((value) => value.trim()).filter(Boolean);
const log = (message) => console.error(message);
const CALIBRATION_CHARS = 300;

/** Lee los PDF con PyMuPDF a través de pdf-text.py. */
const readPdfs = async (files) => {
  if (!files.length) return [];
  const result = spawnSync('python3', ['-I', path.join(here, 'pdf-text.py'), ...files], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`pdf-text.py falló: ${result.stderr.slice(0, 400)}`);
  return JSON.parse(result.stdout);
};

/** Botellas desde el SAT (reutiliza el parser del frontend mediante Vite SSR) o desde --bottles. */
const loadBottles = async () => {
  if (args.has('--bottles')) {
    return args
      .get('--bottles')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [techniqueCode, lot, expiresAt, testName = ''] = entry.split(':');
        return { testName, techniqueCode, lot, expiresAt, reagentRole: 'R1', barcode: null, firstSeenAt: null, lastSeenAt: null, pipettingCount: 0 };
      });
  }
  const satPath = args.get('--sat');
  if (!satPath) throw new Error('Indica --sat <archivo .A400> o --bottles <lista>');
  const { createServer } = await import(path.join(frontendRoot, 'node_modules', 'vite', 'dist', 'node', 'index.js'));
  const vite = await createServer({ root: frontendRoot, cacheDir: 'node_modules/.vite-dri-tests', server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { parseSatReport } = await vite.ssrLoadModule('/src/modules/sat-report/satReportParser.ts');
    const bytes = await fs.readFile(path.resolve(satPath));
    const file = new File([bytes], path.basename(satPath));
    const summary = await parseSatReport(file, args.get('--password') || process.env.SAT_PASSWORD || '');
    log(`SAT ${summary.serialNumber}: ${summary.reagentBottles?.length || 0} botellas decodificadas`);
    return summary.reagentBottles || [];
  } finally {
    await vite.close();
  }
};

/* ------------------------------------------------------------------ claves y documentos */

const fileStem = (code, lot) => `${code}_${lot}`;
const pdfName = (code, lot, tab) => `${fileStem(code, lot)}_${tab.replace(/\W+/g, '_')}.pdf`;
const unmatchedKey = (techniqueCode, componentLot, expiresAt) => `unmatched:${techniqueCode}:${componentLot}:${monthKey(expiresAt)}`;
const sameGroup = (entry, group) =>
  entry.techniqueCode === group.techniqueCode && entry.componentLot === group.lot && monthKey(entry.expiresAt) === monthKey(group.expiresAt);

/** PDF ya guardados de un lote de producto (la pestaña sale del nombre del archivo: Value_Sheet → "Value Sheet"). */
const savedDocuments = (code, lot) => {
  if (!existsSync(outDir)) return [];
  const prefix = `${fileStem(code, lot)}_`;
  return readdirSync(outDir)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.pdf'))
    .map((name) => ({ tab: name.slice(prefix.length, -4).replace(/_/g, ' '), file: path.relative(projectRoot, path.join(outDir, name)) }));
};

/** Texto de las pestañas que se analizan (IFU, CoA, hoja de valores); SDS, eFile y avisos no se leen. */
const PARSED_TABS = new Set(['IFU', 'CoA', 'Value Sheet']);
const documentsByTab = async (documents) => {
  const files = documents
    .filter((doc) => PARSED_TABS.has(doc.tab))
    .map((doc) => ({ tab: doc.tab, file: path.resolve(projectRoot, doc.file) }))
    .filter((doc) => existsSync(doc.file));
  const texts = await readPdfs(files.map((item) => item.file));
  return Object.fromEntries(files.map((item, index) => [item.tab, texts[index]]));
};

/**
 * Quita del grupo (técnica, lote de componente, mes) las entradas que ya no aplican: el 'unmatched:' del grupo
 * y cualquier otro lote de producto ligado antes al mismo grupo con otra clave.
 */
const removeStaleEntries = (generated, group, keepKey) => {
  delete generated.lots[unmatchedKey(group.techniqueCode, group.lot, group.expiresAt)];
  for (const [key, entry] of Object.entries(generated.lots)) {
    if (entry.key && key !== keepKey && sameGroup(entry, group)) delete generated.lots[key];
  }
};

const matchedEntry = (group, candidate, decision, extra = {}) => ({
  key: `${candidate.productCode}:${candidate.productLot}`,
  productCode: candidate.productCode,
  productLot: candidate.productLot,
  title: candidate.title || null,
  expiresAt: candidate.expiresAt || null,
  componentLot: group.lot,
  componentMatchConfirmed: decision.basis === 'component',
  matchBasis: decision.basis,
  techniqueCode: group.techniqueCode,
  testNames: group.testNames,
  bottles: group.bottles,
  sourceUrl: candidate.sourceUrl || null,
  fetchedAt: candidate.fetchedAt || null,
  documents: candidate.documents,
  ifu: candidate.ifu ?? null,
  coa: candidate.coa ?? null,
  matchCandidates: decision.evaluated,
  ...extra,
});

const unmatchedEntry = (group, decision, extra = {}) => ({
  key: null,
  techniqueCode: group.techniqueCode,
  componentLot: group.lot,
  expiresAt: group.expiresAt,
  testNames: group.testNames,
  candidates: [`21${group.techniqueCode}`, `23${group.techniqueCode}`],
  reason: decision.reason,
  evaluated: decision.evaluated,
  fetchedAt: group.fetchedAt || new Date().toISOString(),
  ...extra,
});

/* ------------------------------------------------------------------ salidas */

/** Copia del frontend: solo lo que consulta la app; lo demás queda en output/einfo/lot-facts. */
export const slimForFrontend = (generated) => ({
  schemaVersion: generated.schemaVersion,
  generatedAt: generated.generatedAt ?? null,
  ...(generated.reparsedAt ? { reparsedAt: generated.reparsedAt } : {}),
  products: Object.fromEntries(Object.entries(generated.products || {}).map(([code, product]) => [code, { code: product.code, title: product.title ?? null, activeLot: product.activeLot ?? null }])),
  lots: Object.fromEntries(
    Object.entries(generated.lots || {}).map(([key, entry]) => {
      if (!entry.key) {
        const { evaluated: _evaluated, ...unmatched } = entry;
        return [key, unmatched];
      }
      const { bottles: _bottles, documents: _documents, matchCandidates: _candidates, pendingCandidates: _pending, ...rest } = entry;
      if (rest.ifu) {
        const { referenceValues: _reference, ...ifu } = rest.ifu;
        rest.ifu = { ...ifu, calibration: ifu.calibration ? ifu.calibration.slice(0, CALIBRATION_CHARS).trim() : ifu.calibration ?? null };
      }
      return [key, rest];
    }),
  ),
  controls: Object.fromEntries(
    Object.entries(generated.controls || {}).map(([key, control]) => [
      key,
      {
        key: control.key,
        productCode: control.productCode,
        productLot: control.productLot,
        title: control.title ?? null,
        expiresAt: control.expiresAt ?? null,
        sourceUrl: control.sourceUrl ?? null,
        fetchedAt: control.fetchedAt ?? null,
        valueSheet: control.valueSheet ? { level: control.valueSheet.level, lot: control.valueSheet.lot, rows: control.valueSheet.rows } : null,
      },
    ]),
  ),
});

/** Hora de la última consulta a einfo.bio registrada en los datos (lotes, controles y búsquedas de producto). */
const lastFetchAt = (generated) =>
  [...Object.values(generated.lots || {}), ...Object.values(generated.controls || {}), ...Object.values(generated.products || {})]
    .map((entry) => entry.fetchedAt)
    .filter(Boolean)
    .sort()
    .pop() || null;

const writeOutputs = async (generated, mode) => {
  generated.generatedAt = lastFetchAt(generated) || generated.generatedAt || null;
  if (mode === 'reparse') generated.reparsedAt = new Date().toISOString();
  else delete generated.reparsedAt;
  await fs.mkdir(outDir, { recursive: true });
  for (const entry of [...Object.values(generated.lots), ...Object.values(generated.controls)]) {
    if (entry.key) await fs.writeFile(path.join(outDir, `${entry.key.replace(':', '_')}.json`), JSON.stringify(entry, null, 2));
  }
  await fs.writeFile(fullPath, JSON.stringify(generated, null, 2));
  await fs.mkdir(path.dirname(generatedPath), { recursive: true });
  await fs.writeFile(generatedPath, `${JSON.stringify(slimForFrontend(generated), null, 2)}\n`);
};

/**
 * Estado completo: output/…/einfo-lot-facts.full.json; si aún no existe se parte de la copia del frontend y se
 * recuperan las botellas y documentos de los <código>_<lote>.json guardados.
 */
const loadState = async () => {
  let generated = null;
  for (const source of [fullPath, generatedPath]) {
    try {
      generated = JSON.parse(await fs.readFile(source, 'utf8'));
      break;
    } catch {
      /* siguiente fuente */
    }
  }
  generated ||= { schemaVersion: 'einfo-lot-facts-v1', generatedAt: null, products: {}, lots: {}, controls: {} };
  generated.products ||= {};
  generated.lots ||= {};
  generated.controls ||= {};
  for (const entry of [...Object.values(generated.lots), ...Object.values(generated.controls)]) {
    if (!entry.key || (entry.documents && (entry.bottles || entry.valueSheet !== undefined))) continue;
    try {
      const saved = JSON.parse(await fs.readFile(path.join(outDir, `${entry.key.replace(':', '_')}.json`), 'utf8'));
      entry.bottles ??= saved.bottles;
      entry.documents ??= saved.documents;
    } catch {
      /* sin copia por lote */
    }
    entry.documents ??= savedDocuments(entry.productCode, entry.productLot);
  }
  return generated;
};

/* ------------------------------------------------------------------ --reparse */

/** Candidatos del mismo mes con CoA ya descargado (21TTT y 23TTT); los no descargados quedan como pendientes. */
const offlineCandidates = async (generated, group, cache) => {
  const candidates = [];
  const pending = [];
  for (const code of [`21${group.techniqueCode}`, `23${group.techniqueCode}`]) {
    const listed = (generated.products[code]?.lots || []).filter((lot) => monthKey(lot.expiresAt) === monthKey(group.expiresAt));
    for (const lotEntry of listed) {
      const key = `${code}:${lotEntry.lot}`;
      if (!cache.has(key)) {
        const documents = savedDocuments(code, lotEntry.lot);
        if (!documents.some((doc) => doc.tab === 'CoA')) cache.set(key, null);
        else {
          const byTab = await documentsByTab(documents);
          cache.set(key, {
            productCode: code,
            productLot: lotEntry.lot,
            expiresAt: lotEntry.expiresAt,
            title: generated.products[code]?.title || null,
            sourceUrl: `https://einfo.bio/${lotEntry.lot}/${code}/es`,
            fetchedAt: generated.products[code]?.fetchedAt || null,
            documents,
            coa: byTab.CoA ? parseCoa(byTab.CoA.text, byTab.CoA.pages) : null,
            ifu: byTab.IFU ? parseIfu(byTab.IFU.text) : null,
          });
        }
      }
      if (cache.get(key)) candidates.push(cache.get(key));
      else pending.push(key);
    }
  }
  return { candidates, pending };
};

/**
 * Relee los PDF ya descargados con los parsers actuales y vuelve a decidir cada liga botella → lote de producto
 * con chooseLotMatch sobre los candidatos guardados (sin red). Un lote cuyo CoA ya no incluye el lote de la
 * botella deja de estar ligado.
 */
const reparse = async () => {
  const generated = await loadState();
  const report = [];
  let documents = 0;
  for (const control of Object.values(generated.controls)) {
    const byTab = await documentsByTab(control.documents || []);
    if (!Object.keys(byTab).length) continue;
    control.valueSheet = byTab['Value Sheet'] ? parseValueSheet(byTab['Value Sheet'].pages) : null;
    control.coa = byTab.CoA ? parseCoa(byTab.CoA.text, byTab.CoA.pages) : null;
    documents += 1;
    report.push(`control ${control.key}: ${control.valueSheet ? `${control.valueSheet.rows.length} filas de hoja de valores` : 'sin hoja de valores'}`);
  }
  const cache = new Map();
  // Primero los lotes ligados: así un 'unmatched:' del mismo grupo ya se habrá retirado al llegar a él.
  const entries = Object.entries(generated.lots).sort(([, left], [, right]) => Number(!left.key) - Number(!right.key));
  for (const [key, entry] of entries) {
    if (!(key in generated.lots)) continue;
    const group = {
      techniqueCode: entry.techniqueCode,
      lot: entry.componentLot,
      expiresAt: entry.expiresAt,
      testNames: entry.testNames || [],
      bottles: entry.bottles || [],
      fetchedAt: entry.fetchedAt,
    };
    if (entry.key) {
      // El lote ligado siempre es candidato (aunque falte en la lista del producto) y se relee de sus propios PDF.
      const byTab = await documentsByTab(entry.documents || []);
      if (Object.keys(byTab).length) {
        entry.ifu = byTab.IFU ? parseIfu(byTab.IFU.text) : null;
        entry.coa = byTab.CoA ? parseCoa(byTab.CoA.text, byTab.CoA.pages) : null;
        documents += 1;
      }
      cache.set(entry.key, { ...entry, productCode: entry.productCode, productLot: entry.productLot });
    }
    const { candidates, pending } = await offlineCandidates(generated, group, cache);
    if (entry.key && !candidates.some((candidate) => `${candidate.productCode}:${candidate.productLot}` === entry.key)) {
      candidates.push(cache.get(entry.key));
      candidates.sort((left, right) => left.productCode.localeCompare(right.productCode)); // 21TTT antes que 23TTT, estable
    }
    const decision = chooseLotMatch(group, candidates);
    const label = `${group.testNames.join('/')} ${group.techniqueCode} lote ${group.lot} cad. ${monthKey(group.expiresAt)}`;
    const pendingField = pending.length ? { pendingCandidates: pending } : {};
    if (decision.match) {
      const matchKey = `${decision.match.productCode}:${decision.match.productLot}`;
      const base = matchKey === entry.key ? entry : decision.match;
      const updated = matchedEntry(group, { ...base, documents: base.documents || savedDocuments(decision.match.productCode, decision.match.productLot) }, decision, pendingField);
      if (matchKey !== entry.key) updated.fetchedAt = decision.match.fetchedAt || group.fetchedAt || null;
      removeStaleEntries(generated, group, matchKey);
      delete generated.lots[key];
      generated.lots[matchKey] = updated;
      report.push(`${label} → ${matchKey} (${decision.basis === 'component' ? 'componente confirmado' : 'por caducidad'})${matchKey !== entry.key ? ` [antes ${key}]` : ''}`);
    } else {
      removeStaleEntries(generated, group, null);
      delete generated.lots[key];
      generated.lots[unmatchedKey(group.techniqueCode, group.lot, group.expiresAt)] = unmatchedEntry(group, decision, pendingField);
      report.push(`${label} → sin lote de producto (${decision.reason})${entry.key ? ` [antes ${key}]` : ''}`);
    }
  }
  await writeOutputs(generated, 'reparse');
  console.log(report.join('\n'));
  console.log(`\n${documents} lotes/controles releídos de sus PDF → ${path.relative(projectRoot, generatedPath)} (completo en ${path.relative(projectRoot, fullPath)})`);
};

/* ------------------------------------------------------------------ descarga desde einfo.bio */

const main = async () => {
  if (args.has('--reparse')) {
    await reparse();
    return;
  }
  await fs.mkdir(outDir, { recursive: true });
  const bottles = await loadBottles();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - sinceMonths);
  const recent = bottles.filter((bottle) => !bottle.lastSeenAt || new Date(bottle.lastSeenAt) >= cutoff);

  // Una entrada por (técnica, lote de componente, mes de caducidad); las botellas se agregan por entrada.
  const groups = new Map();
  for (const bottle of recent) {
    const key = `${bottle.techniqueCode}|${bottle.lot}|${monthKey(bottle.expiresAt)}`;
    const group = groups.get(key) || { techniqueCode: bottle.techniqueCode, lot: bottle.lot, expiresAt: bottle.expiresAt, testNames: new Set(), bottles: [] };
    group.testNames.add(bottle.testName);
    group.bottles.push(bottle);
    groups.set(key, group);
  }
  const work = [...groups.values()].sort((left, right) => (right.expiresAt || '').localeCompare(left.expiresAt || '')).slice(0, limit);
  log(`${groups.size} combinaciones técnica/lote/caducidad (${work.length} a procesar, últimos ${sinceMonths} meses)`);

  const generated = await loadState();
  const client = new EInfoClient({ lang: 'es', log });
  const report = [];
  const candidateCache = new Map();

  const searchProduct = async (code) => {
    const search = await client.searchProduct(code);
    if (search.found) generated.products[code] = { code, title: search.title, activeLot: search.activeLot, lots: search.lots, fetchedAt: new Date().toISOString() };
    return search;
  };

  /** Descarga (una vez por ejecución) los PDF de un lote de producto y lee su CoA e IFU. */
  const loadCandidate = async (code, lotEntry, search) => {
    const key = `${code}:${lotEntry.lot}`;
    if (candidateCache.has(key)) return candidateCache.get(key);
    const page = await client.fetchLotDocuments(lotEntry.lot, code);
    const files = [];
    for (const doc of page.documents) {
      const file = path.join(outDir, pdfName(code, lotEntry.lot, doc.tab));
      await fs.writeFile(file, doc.pdf);
      files.push({ tab: doc.tab, file: path.relative(projectRoot, file) });
    }
    const byTab = await documentsByTab(files);
    const candidate = {
      productCode: code,
      productLot: lotEntry.lot,
      expiresAt: lotEntry.expiresAt,
      title: page.title || search.title,
      sourceUrl: page.url,
      fetchedAt: new Date().toISOString(),
      documents: files,
      coa: byTab.CoA ? parseCoa(byTab.CoA.text, byTab.CoA.pages) : null,
      ifu: byTab.IFU ? parseIfu(byTab.IFU.text) : null,
    };
    candidateCache.set(key, candidate);
    return candidate;
  };

  for (const group of work) {
    const testNames = [...group.testNames];
    const groupData = {
      techniqueCode: group.techniqueCode,
      lot: group.lot,
      expiresAt: group.expiresAt,
      testNames,
      bottles: group.bottles.map((bottle) => ({ barcode: bottle.barcode, reagentRole: bottle.reagentRole, firstSeenAt: bottle.firstSeenAt, lastSeenAt: bottle.lastSeenAt, pipettingCount: bottle.pipettingCount })),
    };
    // Todos los lotes del mismo mes de los dos formatos (21TTT y 23TTT): la decisión la toma chooseLotMatch.
    const candidates = [];
    for (const code of [`21${group.techniqueCode}`, `23${group.techniqueCode}`]) {
      const search = await searchProduct(code);
      if (!search.found) continue;
      for (const lotEntry of search.lots.filter((lot) => monthKey(lot.expiresAt) === monthKey(group.expiresAt))) {
        candidates.push(await loadCandidate(code, lotEntry, search));
      }
    }
    const decision = chooseLotMatch(groupData, candidates);
    const label = `${testNames.join('/')} ${group.techniqueCode} lote ${group.lot} cad. ${group.expiresAt}`;
    if (decision.match) {
      const entry = matchedEntry(groupData, decision.match, decision);
      removeStaleEntries(generated, groupData, entry.key);
      generated.lots[entry.key] = entry;
      report.push(`${label} → ${entry.key} (${decision.basis === 'component' ? 'componente confirmado' : 'por caducidad'})`);
    } else {
      removeStaleEntries(generated, groupData, null);
      generated.lots[unmatchedKey(group.techniqueCode, group.lot, group.expiresAt)] = unmatchedEntry({ ...groupData, fetchedAt: new Date().toISOString() }, decision);
      report.push(`${label} → sin lote de producto en einfo (${decision.reason})`);
    }
  }

  for (const code of controlCodes) {
    const search = await searchProduct(code);
    if (!search.found) {
      report.push(`control ${code}: sin documentos`);
      continue;
    }
    const lotsToRead = search.activeLot ? [search.activeLot] : search.lots.slice(-1).map((lot) => lot.lot);
    for (const lot of lotsToRead) {
      const page = await client.fetchLotDocuments(lot, code);
      const files = [];
      for (const doc of page.documents) {
        const file = path.join(outDir, pdfName(code, lot, doc.tab));
        await fs.writeFile(file, doc.pdf);
        files.push({ tab: doc.tab, file: path.relative(projectRoot, file) });
      }
      const byTab = await documentsByTab(files);
      const valueSheet = byTab['Value Sheet'] ? parseValueSheet(byTab['Value Sheet'].pages) : null;
      const coa = byTab.CoA ? parseCoa(byTab.CoA.text, byTab.CoA.pages) : null;
      generated.controls[`${code}:${lot}`] = {
        key: `${code}:${lot}`,
        productCode: code,
        productLot: lot,
        title: page.title || search.title,
        expiresAt: search.lots.find((entry) => entry.lot === lot)?.expiresAt || coa?.expiresAt || null,
        sourceUrl: page.url,
        fetchedAt: new Date().toISOString(),
        documents: files,
        valueSheet,
        coa,
      };
      report.push(`control ${code} lote ${lot}: ${valueSheet ? `${valueSheet.rows.length} filas de hoja de valores` : 'sin hoja de valores'}`);
    }
  }

  await writeOutputs(generated, 'fetch');
  console.log(report.join('\n'));
  console.log(`\n${Object.keys(generated.lots).length} lotes en ${path.relative(projectRoot, generatedPath)} (completo en ${path.relative(projectRoot, fullPath)})`);
};

// Solo se ejecuta como CLI; importarlo (p. ej. para probar slimForFrontend) no lanza nada.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
