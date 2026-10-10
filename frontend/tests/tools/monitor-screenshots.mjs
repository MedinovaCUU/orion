// Capturas y compuertas de QA del módulo de monitoreo con datos simulados en varios viewports y estados.
// Semántica de superposición: el explorador 3D y el riel van SOBRE el globo por diseño (rejilla superpuesta, globo en pausa
// y difuminado); esos pares no cuentan como empalme. Cualquier otro par de regiones sigue siendo fallo.
// Uso: node tests/tools/monitor-screenshots.mjs --origin http://127.0.0.1:5174 --out ../../../outputs/monitor-visual/run
//      [--viewports desktop,mobile-portrait] [--strict] [--budget-scale 1.15]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createMonitorMock } from '../fixtures/monitorMock.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
};
const origin = option('origin', process.env.MONITOR_TEST_ORIGIN || 'http://127.0.0.1:5174');
const outDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)), option('out', '../../../outputs/monitor-visual/run'));
const only = option('viewports', '').split(',').filter(Boolean);
// --strict: termina con código 1 si algún estado desborda, empalma dos regiones (salvo los pares intencionales sobre el globo),
// excede su presupuesto de altura, deja texto por debajo de 11 px, bloquea el scroll táctil del globo, mantiene dos lienzos
// WebGL vivos al inspeccionar o abre el explorador sin difuminar el globo.
const strict = argv.includes('--strict');
// --budget-scale: multiplica los presupuestos de altura (solo para calibrar; los presupuestos del código se ajustan a la baja).
const budgetScale = Number(option('budget-scale', '1'));
if (!Number.isFinite(budgetScale) || budgetScale <= 0) {
  console.error('--budget-scale debe ser un número mayor que 0');
  process.exit(2);
}
const VIEWPORTS = [
  { name: 'desktop', width: 1540, height: 1000 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'tablet', width: 834, height: 1112, mobile: true },
  { name: 'mobile-portrait', width: 390, height: 844, mobile: true },
  { name: 'mobile-landscape', width: 844, height: 390, mobile: true },
].filter(viewport => !only.length || only.includes(viewport.name));

// Regiones que nunca deben empalmarse entre sí (un selector sin cajas simplemente no participa).
const REGIONS = ['.equipment-monitor__command', '.equipment-monitor__summary-grid', '.equipment-priority', '.equipment-globe', '.alarm-spatial', '.alarm-spatial__viewport', '.equipment-monitor__focus-panel', '.equipment-monitor__lists-grid', '.equipment-monitor__map-header'];
// Pares cuya superposición es intencional (capas sobre el globo en la rejilla superpuesta); se reportan aparte y no fallan.
const INTENTIONAL_OVERLAPS = [
  ['.alarm-spatial', '.equipment-globe'],
  ['.alarm-spatial__viewport', '.equipment-globe'],
  ['.equipment-priority', '.equipment-globe'],
];
// Presupuesto de altura total de la página (px) por viewport y estado; 'focused-city' usa 'inspect' si abrió el explorador y 'selected' si no.
const BUDGET = {
  // Línea base del 10 oct 2026 (escenario oscuro: explorador sobre el globo) + ~8 % de holgura; se ajusta a la baja, nunca al alza.
  desktop: { overview: 3760, inspect: 4910, selected: 4480 },
  laptop: { overview: 3600, inspect: 5050, selected: 4320 },
  tablet: { overview: 4400, inspect: 6530, selected: 5110 },
  'mobile-portrait': { overview: 5050, inspect: 7990, selected: 5910 },
  'mobile-landscape': { overview: 3620, inspect: 4720, selected: 4340 },
};
const MIN_FONT_PX = 11;
const OVERLAP_TOLERANCE_PX = 8;
// Controles del HUD que no son clusters de ciudad: se excluyen al buscar el objetivo de 'focused-city'.
const HUD_CONTROL_PATTERN = 'alejar|acercar|deseleccionar|limpiar|reencuadrar|cobertura|volver|girar|leyenda|ampliar|pantalla';

await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-features=LocalNetworkAccessChecks'] });
const report = [];

const metrics = async (page) => page.evaluate(({ selectors, intentional, tolerance, minFont }) => {
  const rect = (element) => { const box = element.getBoundingClientRect(); return { x: box.left + scrollX, y: box.top + scrollY, w: box.width, h: box.height }; };
  const describe = (element) => `${element.tagName.toLowerCase()}${[...element.classList].slice(0, 2).map(name => `.${name}`).join('')}`;
  const boxes = selectors.flatMap(selector => [...document.querySelectorAll(selector)].filter(element => element.offsetParent !== null || getComputedStyle(element).position === 'fixed').map(element => ({ selector, element, ...rect(element) })));
  const isIntentional = (left, right) => intentional.some(([a, b]) => (a === left && b === right) || (a === right && b === left));
  const overlaps = [];
  const intentionalOverlaps = [];
  for (let a = 0; a < boxes.length; a += 1) for (let b = a + 1; b < boxes.length; b += 1) {
    const A = boxes[a], B = boxes[b];
    if (A.selector === B.selector) continue;
    if (A.element.contains(B.element) || B.element.contains(A.element)) continue;
    const overlapW = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
    const overlapH = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
    if (overlapW > tolerance && overlapH > tolerance) {
      (isIntentional(A.selector, B.selector) ? intentionalOverlaps : overlaps).push({ a: A.selector, b: B.selector, w: Math.round(overlapW), h: Math.round(overlapH) });
    }
  }
  const wide = [...document.querySelectorAll('body *')].filter(element => { const box = element.getBoundingClientRect(); return box.width > 0 && box.right > document.documentElement.clientWidth + 2; }).slice(0, 8).map(describe);
  // Lienzos WebGL vivos: con área visible y fuera de [data-paused="true"] (el globo en pausa no cuenta); al inspeccionar queda uno.
  const liveCanvases = [...document.querySelectorAll('canvas')].filter(canvas => {
    if (canvas.closest('[data-paused="true"]')) return false;
    const box = canvas.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(canvas).visibility !== 'hidden';
  }).length;
  const explorer = document.querySelector('.alarm-spatial');
  const explorerBox = explorer ? explorer.getBoundingClientRect() : null;
  // touch-action calculado del lienzo del globo: en táctil debe ser 'pan-y' para no atrapar el scroll de la página.
  const globe = document.querySelector('.equipment-globe');
  const globeCanvas = document.querySelector('.equipment-globe canvas');
  const globeTouchAction = globeCanvas ? getComputedStyle(globeCanvas).touchAction : null;
  // Globo difuminado bajo el explorador: el filtro calculado debe contener blur mientras se inspecciona.
  const globeBlurred = globe ? getComputedStyle(globe).filter.includes('blur') : null;
  // Piso tipográfico: mínimo font-size entre nodos con texto propio bajo el módulo, ignorando lo oculto.
  let minFontPx = null;
  const smallTextElements = [];
  for (const element of document.querySelectorAll('.equipment-monitor *')) {
    let hasText = false;
    for (const node of element.childNodes) { if (node.nodeType === 3 && node.textContent.trim()) { hasText = true; break; } }
    if (!hasText) continue;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || !element.getClientRects().length) continue;
    const size = parseFloat(style.fontSize);
    if (!Number.isFinite(size)) continue;
    if (minFontPx === null || size < minFontPx) minFontPx = size;
    if (size < minFont) smallTextElements.push({ element: describe(element), fontSize: Math.round(size * 100) / 100, text: element.textContent.trim().slice(0, 40) });
  }
  // Se conservan los ocho infractores más pequeños para que el reporte señale primero lo peor.
  smallTextElements.sort((left, right) => left.fontSize - right.fontSize).splice(8);
  return {
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    pageHeight: document.documentElement.scrollHeight,
    viewportHeight: innerHeight,
    overflowingElements: wide,
    overlaps,
    overlapsAll: overlaps.length,
    intentionalOverlaps,
    liveCanvases,
    explorerOpen: Boolean(explorer),
    explorerFitsWidth: explorerBox ? explorerBox.width <= innerWidth + 1 && explorerBox.left >= -1 : null,
    explorerScrollWidth: explorer ? explorer.scrollWidth <= explorer.clientWidth + 1 : null,
    // El explorador superpuesto debe caber dentro del escenario (recortado por overflow: clip, invisible para scrollWidth del documento).
    explorerInsideStage: (() => {
      const workspace = document.querySelector('.equipment-monitor__spatial-workspace');
      if (!explorer || !workspace) return null;
      const stageBox = workspace.getBoundingClientRect();
      return explorerBox.right <= stageBox.right + 1 && explorerBox.left >= stageBox.left - 1 && workspace.scrollWidth <= workspace.clientWidth + 1;
    })(),
    globeTouchAction,
    globeBlurred,
    minFontPx,
    smallTextElements,
    boxes: boxes.map(({ element, ...box }) => ({ ...box, x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h) })),
  };
}, { selectors: REGIONS, intentional: INTENTIONAL_OVERLAPS, tolerance: OVERLAP_TOLERANCE_PX, minFont: MIN_FONT_PX });

/** Presupuesto de altura efectivo (escalado) de un estado; null si el viewport no tiene tabla. */
const budgetFor = (viewportName, state, result) => {
  const table = BUDGET[viewportName];
  if (!table) return null;
  const key = state in table ? state : (result.explorerOpen ? 'inspect' : 'selected');
  return Math.round(table[key] * budgetScale);
};

/** Fallos estrictos de un estado: desborde, empalmes no intencionales, altura, touch-action, piso tipográfico, lienzos duplicados y globo sin difuminar. */
const strictFailures = (state, result, viewport) => {
  const failures = [];
  if (result.horizontalOverflow > 0) failures.push(`desborde horizontal de ${result.horizontalOverflow}px`);
  (result.overlaps || []).forEach(overlap => failures.push(`empalme ${overlap.a} × ${overlap.b} (${overlap.w}x${overlap.h})`));
  if (result.budget !== null && result.pageHeight > result.budget) failures.push(`altura de página ${result.pageHeight}px > presupuesto ${result.budget}px`);
  if (viewport.mobile && result.globeTouchAction !== 'pan-y') {
    failures.push(result.globeTouchAction === null ? 'sin lienzo del globo para verificar touch-action' : `touch-action del globo '${result.globeTouchAction}' (se espera 'pan-y')`);
  }
  if (result.minFontPx !== null && result.minFontPx < MIN_FONT_PX) {
    failures.push(`texto de ${result.minFontPx}px por debajo del piso de ${MIN_FONT_PX}px: ${(result.smallTextElements || []).map(item => `${item.element} ${item.fontSize}px`).join(', ')}`);
  }
  if (result.explorerOpen) {
    if (result.liveCanvases > 1) failures.push(`${result.liveCanvases} lienzos WebGL vivos durante la inspección`);
    if (!result.globeBlurred) failures.push(result.globeBlurred === null ? 'sin globo bajo el explorador para verificar el difuminado' : 'el globo no queda difuminado (filter sin blur) bajo el explorador');
    if (result.explorerFitsWidth === false) failures.push('el explorador 3D excede el ancho de la pantalla');
    if (result.explorerScrollWidth === false) failures.push('el explorador 3D tiene scroll horizontal interno');
    if (result.explorerInsideStage === false) failures.push('el explorador 3D sobresale del escenario (recorte lateral)');
  }
  return failures;
};

const shoot = async (page, name, { full = true, target = null } = {}) => {
  const file = path.join(outDir, `${name}.png`);
  if (target) {
    const locator = page.locator(target).first();
    if (await locator.count()) { await locator.evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' })); }
  }
  await page.screenshot({ path: file, fullPage: full });
  return file;
};

/**
 * Objetivo del estado 'focused-city': un elemento clicable del globo con aria-label o role (fuera del HUD) o,
 * si no existe, el primer botón de la bandeja de ciudad. Marca el elemento con data-shot-target para el clic.
 */
const findCityTarget = async (page) => page.evaluate((pattern) => {
  const globe = document.querySelector('.equipment-globe');
  if (!globe) return null;
  const hudControl = new RegExp(pattern, 'i');
  const visible = (element) => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden'; };
  const label = (element) => element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent.trim();
  const candidates = [...globe.querySelectorAll('[aria-label], [role]')]
    .filter(element => element.matches('button, a, [role="button"], [role="option"], [role="listitem"], [tabindex]'))
    .filter(element => !element.closest('.equipment-globe__hud, .equipment-globe__context, .equipment-globe__equipment-dock'))
    .filter(element => visible(element) && !hudControl.test(label(element)));
  let source = 'cluster';
  let target = candidates[0] || null;
  if (!target) {
    source = 'dock';
    target = [...globe.querySelectorAll('.equipment-globe__equipment-dock button')].find(visible) || null;
  }
  if (!target) return null;
  document.querySelectorAll('[data-shot-target]').forEach(element => element.removeAttribute('data-shot-target'));
  target.setAttribute('data-shot-target', '1');
  return { source, label: label(target).slice(0, 80) };
}, HUD_CONTROL_PATTERN);

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1, isMobile: Boolean(viewport.mobile), hasTouch: Boolean(viewport.mobile) });
  const page = await context.newPage();
  // extended: añade un BA400 sin alarmas (834001903) y un equipo sin georreferencia para cubrir los estados raros del rediseño.
  const mock = createMonitorMock({ extended: true });
  await mock.install(page);
  const entry = { viewport: viewport.name, width: viewport.width, height: viewport.height, states: {} };
  const measure = async (state) => { const result = await metrics(page); return { ...result, budget: budgetFor(viewport.name, state, result) }; };
  try {
    await page.goto(`${origin}/orion/monitor-test`);
    await page.locator('.equipment-priority__list button, .equipment-monitor__lists-grid button').filter({ hasText: '834001902' }).first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(1200);
    entry.states.overview = { file: await shoot(page, `${viewport.name}-1-overview`), ...(await measure('overview')) };

    // Ciudad fijada desde el globo; si el globo no expone un elemento clicable, el estado se omite sin fallar.
    const cityTarget = await findCityTarget(page);
    if (cityTarget) {
      const clicked = await page.locator('[data-shot-target]').first().click({ timeout: 5000 }).then(() => true).catch(() => false);
      await page.waitForTimeout(1500);
      entry.states['focused-city'] = { target: { ...cityTarget, clicked }, file: await shoot(page, `${viewport.name}-2-focused-city`), ...(await measure('focused-city')) };
      // Si la ciudad abrió el explorador (cluster con BA400), se cierra para que 'inspect' parta del mismo punto de siempre.
      if (await page.locator('.alarm-spatial').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(600); }
    } else {
      entry.states['focused-city'] = { skipped: 'el globo no expone un elemento clicable de ciudad' };
    }

    await page.locator('.equipment-priority__list button, .equipment-monitor__lists-grid button').filter({ hasText: '834001902' }).first().click();
    const canvas = page.locator('[data-testid="ba400-canvas"]');
    // El visor 3D se monta de forma diferida: se espera unos segundos antes de concluir que no abrió.
    await canvas.waitFor({ timeout: 15000 }).catch(() => null);
    const opened = await canvas.count();
    if (opened) {
      await page.waitForFunction(() => ['ready', 'error'].includes(document.querySelector('[data-testid="ba400-canvas"]')?.getAttribute('data-state') || ''), null, { timeout: 120000 }).catch(() => {});
      await page.waitForTimeout(1500);
      entry.states.inspect = { file: await shoot(page, `${viewport.name}-3-inspect-full`), viewportFile: await shoot(page, `${viewport.name}-3-inspect-view`, { full: false, target: '.alarm-spatial' }), ...(await measure('inspect')) };
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
    } else {
      entry.states.inspect = { skipped: 'el panel 3D no se abrió' };
    }
    entry.states.selected = { file: await shoot(page, `${viewport.name}-4-selected`), ...(await measure('selected')) };
    entry.errors = mock.state.errors;
  } catch (error) {
    entry.error = error.message;
  }
  entry.failures = Object.entries(entry.states).flatMap(([state, result]) => (result.skipped ? [] : strictFailures(state, result, viewport).map(failure => `${state}: ${failure}`)));
  (entry.errors || []).forEach(pageError => entry.failures.push(`pageerror: ${pageError.split('\n')[0].slice(0, 200)}`));
  report.push(entry);
  await context.close();
}
await browser.close();
await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
const summary = report.map(entry => ({
  viewport: entry.viewport,
  error: entry.error,
  failures: entry.failures,
  states: Object.fromEntries(Object.entries(entry.states).map(([key, value]) => [key, value.skipped ? value.skipped : {
    overflow: value.horizontalOverflow, height: value.pageHeight, budget: value.budget, overlaps: value.overlapsAll, intentionalOverlaps: (value.intentionalOverlaps || []).length,
    liveCanvases: value.liveCanvases, globeBlurred: value.globeBlurred, touchAction: value.globeTouchAction, minFont: value.minFontPx, overflowing: value.overflowingElements,
    ...(value.target ? { target: value.target } : {}),
  }])),
}));
console.log(JSON.stringify(summary, null, 2));
if (strict && report.some(entry => entry.error || entry.failures.length)) {
  console.error(`FALLO estricto (budget-scale ${budgetScale}): revisa failures en el resumen anterior.`);
  process.exit(1);
}
