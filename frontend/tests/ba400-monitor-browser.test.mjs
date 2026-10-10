import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createMonitorMock } from './fixtures/monitorMock.mjs';

// Monta el módulo real en un documento interceptado: no añade rutas de demo a producción.
const origin = process.env.MONITOR_TEST_ORIGIN || 'http://127.0.0.1:5173';
const output = new URL('../../outputs/monitor-hologram/', import.meta.url);
await fs.mkdir(output, { recursive: true });
// Chrome clasifica el HTML interceptado como origen no local; esta excepción solo afecta al navegador de prueba.
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-features=LocalNetworkAccessChecks'] });
const page = await browser.newPage({ viewport: { width: 1540, height: 1100 }, deviceScaleFactor: 1 });
const mock = createMonitorMock();
const { state, now, first, alarms } = mock;
await mock.install(page);
const capture = async name => {
  const panel = page.locator('.alarm-spatial');
  if (await panel.count()) await panel.evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  return page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)) });
};
const ready = async () => {
  await page.waitForFunction(() => document.querySelector('[data-testid="ba400-canvas"]')?.getAttribute('data-state') === 'ready', null, { timeout: 120000 });
};
const cards = page.locator('.alarm-spatial__event');
try {
  const preload = page.waitForRequest(request => request.url().includes('BA400_web.glb'), { timeout: 30000 });
  await page.goto(`${origin}/orion/monitor-test`);
  await page.locator('.equipment-monitor__lists-grid button').filter({ hasText: '834001902' }).first().waitFor({ timeout: 30000 });
  await preload;
  assert.equal(state.downloads, 1, 'Precarga silenciosa al entrar al módulo');
  assert.equal(await page.locator('[data-testid="ba400-canvas"]').count(), 0);
  await page.locator('.equipment-monitor__lists-grid button').filter({ hasText: '834001902' }).first().click();
  await ready();
  assert.equal(await page.getByRole('button', { name: 'Ocultar cubiertas', exact: true }).count(), 1);
  assert(await page.locator('.equipment-monitor__spatial-workspace.is-inspecting > .equipment-globe').isVisible());
  assert.equal(await cards.count(), 4);
  assert.equal(await page.locator('.monitor-alarm-anchor').count(), 4);
  // Rejilla superpuesta: el explorador va SOBRE el globo por diseño (misma celda, z superior) y nunca se empalma con el riel;
  // el globo queda en pausa (data-paused) y difuminado (filter: blur). elementFromPoint trabaja en coordenadas de viewport y el
  // explorador puede ser más alto que la pantalla, así que se sondea el centro de su parte visible tras traerlo a la vista.
  const overlayState = async () => {
    await page.locator('.alarm-spatial').evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
    return page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
      const hit = (A, B) => Math.min(A.right, B.right) - Math.max(A.left, B.left) > 8 && Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top) > 8;
      const a = rect('.alarm-spatial'), g = rect('.equipment-globe'), p = rect('.equipment-priority');
      const x = (Math.max(a.left, 0) + Math.min(a.right, innerWidth)) / 2;
      const y = (Math.max(a.top, 0) + Math.min(a.bottom, innerHeight)) / 2;
      const topmost = document.elementFromPoint(x, y);
      const globe = document.querySelector('.equipment-globe');
      return {
        overGlobe: hit(a, g),
        onTop: Boolean(topmost && topmost.closest('.alarm-spatial')),
        railClear: !hit(a, p),
        paused: globe.getAttribute('data-paused') === 'true',
        blurred: getComputedStyle(globe).filter.includes('blur'),
      };
    });
  };
  const overlay = await overlayState();
  assert(overlay.overGlobe && overlay.onTop, 'el explorador se superpone al globo y queda encima (elementFromPoint)');
  assert(overlay.railClear, 'el explorador no se superpone al riel más de 8 px a 1540');
  assert(overlay.paused && overlay.blurred, 'mientras se inspecciona el globo tiene data-paused="true" y filter con blur');
  assert(await page.evaluate(() => {
    const viewport = document.querySelector('.alarm-spatial__viewport').getBoundingClientRect();
    return [...document.querySelectorAll('.alarm-spatial__event')].every(card => { const box = card.getBoundingClientRect(); return box.right <= viewport.left + 1 || box.left >= viewport.right - 1; });
  }), 'ninguna tarjeta de alarma intersecta el viewport 3D');
  // Un solo lienzo vivo: los lienzos dentro de [data-paused="true"] (el globo en pausa) no cuentan.
  const liveCanvases = () => page.evaluate(() => [...document.querySelectorAll('canvas')].filter(canvas => {
    if (canvas.closest('[data-paused="true"]')) return false;
    const box = canvas.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(canvas).visibility !== 'hidden';
  }).length);
  assert.equal(await liveCanvases(), 1, 'un solo lienzo WebGL vivo mientras se inspecciona');
  // Cristal oscuro del explorador (tinta clara sobre superficie oscura con alfa) y piso tipográfico de 11 px en todo el módulo.
  assert(await page.evaluate(() => {
    const luminance = (value) => { const [r, g, b] = value.match(/[\d.]+/g).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
    const style = getComputedStyle(document.querySelector('.alarm-spatial'));
    const alpha = Number((style.backgroundColor.match(/[\d.]+/g) || [])[3] ?? 1);
    return alpha > 0 && luminance(style.backgroundColor) < 0.3 && luminance(style.color) > 0.7;
  }), 'el explorador es cristal oscuro: tinta clara sobre superficie oscura');
  const smallText = await page.evaluate(() => [...document.querySelectorAll('.equipment-monitor *')].filter(element => {
    if (![...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim())) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0 && parseFloat(style.fontSize) < 11;
  }).map(element => `${element.tagName.toLowerCase()}.${element.className} ${getComputedStyle(element).fontSize}`));
  assert.deepEqual(smallText, [], 'ningún texto por debajo de 11 px');
  // Estado BPL analítico: resumen por etapa, matriz por prueba y salto a DRI con la serie.
  const bplSection = page.locator('[data-testid="bpl-section"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="bpl-section"]')?.getAttribute('data-tone') === 'rejected', null, { timeout: 30000 });
  await page.waitForFunction(() => /Resultado 140/.test(document.querySelector('[data-testid="bpl-section"]')?.textContent || ''), null, { timeout: 30000 });
  assert.equal(await bplSection.locator('.equipment-monitor__bpl-stage').count(), 4);
  assert.equal(await bplSection.locator('.equipment-monitor__bpl-stage[data-tone="rejected"]').count(), 1);
  assert.equal(await bplSection.locator('.equipment-monitor__bpl-test').count(), 3);
  const bplText = await bplSection.innerText();
  assert.match(bplText, /BPL con rechazo/i);
  assert.match(bplText, /GLUCOSE[\s\S]*Control de calidad · Control de calidad rechazado · Resultado 140 mg\/dL · Límites 80 a 120 · Z 8 · Westgard 1_3s/);
  assert.match(bplText, /Calibrador CAL BIO · C-77 · Control CONTROL LEVEL I · L-10/);
  assert.match(bplText, /CHOLESTEROL[\s\S]*Falta: control_lot/);
  assert.match(bplText, /Falta para cerrar aceptación: control_lot/);
  assert.equal(await bplSection.locator('.equipment-monitor__bpl-tests .equipment-monitor__bpl-dot[data-tone="rejected"]').count(), 1);
  assert.equal(await bplSection.getByRole('link', { name: 'Diagnosticar en DRI' }).getAttribute('href'), `${origin}/orion/dashboard?tab=dri&serial=834001902&bpl=apply`);
  assert.match(await page.locator('.equipment-monitor__summary-card--bpl').innerText(), /BPL con rechazo\s*1/i);
  assert.equal(await page.locator('.equipment-priority__bpl[data-tone="rejected"]').count(), 1);
  assert.match(await page.locator('.equipment-priority__bpl[data-tone="rejected"]').innerText(), /BPL con rechazo · GLUCOSE/i);
  await bplSection.locator('.equipment-monitor__bpl-timeline summary').click();
  assert.equal(await bplSection.locator('.equipment-monitor__bpl-timeline li').count(), 5, 'las curvas no entran en la cronología BPL');
  // Curvas de reacción: miniatura en la tarjeta, visor con réplicas, métricas, tooltip y tabla contraída.
  const glucoseCard = bplSection.locator('.equipment-monitor__bpl-test').filter({ hasText: 'GLUCOSE' });
  await glucoseCard.locator('[data-testid="reaction-sparkline"]').waitFor({ timeout: 30000 });
  assert.match(await glucoseCard.locator('[data-testid="reaction-sparkline"]').innerText(), /ÚLTIMA CURVA · Abs1 .* · 30 ciclos · 3 rép\./i, 'la réplica republicada no duplica la serie');
  assert.equal(await bplSection.locator('.equipment-monitor__bpl-test').filter({ hasText: 'CHOLESTEROL' }).locator('[data-testid="reaction-sparkline"]').count(), 0, 'la curva sin calculation_version no se usa');
  const explorer = page.locator('[data-testid="reaction-explorer"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="reaction-explorer"]')?.getAttribute('data-state') === 'ready', null, { timeout: 30000 });
  assert.match(await explorer.locator('.reaction-explorer__count').innerText(), /3 reacciones · 5 réplicas/);
  assert.equal(await explorer.locator('.reaction-explorer__group').count(), 3);
  assert.equal(await explorer.locator('.reaction-explorer__group[aria-pressed="true"]').innerText().then(text => /GLUCOSE[\s\S]*CTRL · SERUM · 3 rép\./.test(text)), true, 'la reacción más reciente queda seleccionada');
  await page.waitForFunction(() => document.querySelectorAll('.reaction-chart__line').length === 3, null, { timeout: 30000 });
  const chart = page.locator('[data-testid="reaction-chart"]');
  assert.equal(await chart.getAttribute('data-metric'), 'abs1');
  assert.equal(await explorer.locator('.reaction-chart__legend-item').count(), 3);
  assert.deepEqual(await explorer.locator('.reaction-explorer__metric').allInnerTexts(), ['Abs1', 'Abs2', 'Dif']);
  assert.match(await explorer.locator('.reaction-explorer__stats').innerText(), /Δ ABS1[\s\S]*PENDIENTE \/ CICLO[\s\S]*CICLOS\s*1–30[\s\S]*ABS FINAL[\s\S]*R1 0\.435 · R2 0\.427/i, 'R2 conserva la versión más reciente por detected_at');
  assert.match(await explorer.locator('.reaction-explorer__viewer-head small').innerText(), /cálculo screen-abs-v2/);
  // Gráfica en el tercio izquierdo y tabla a la derecha; filas R1:1, R2:1, R3:1, R1:2…
  const table = explorer.locator('[data-testid="reaction-table"]');
  assert.equal(await table.locator('tbody tr').count(), 90);
  assert.deepEqual(await table.locator('tbody tr td:first-child').evaluateAll(cells => cells.slice(0, 4).map(cell => cell.textContent.trim())), ['R1:1', 'R2:1', 'R3:1', 'R1:2']);
  assert.match(await table.locator('tbody tr').first().innerText(), /^R1:1\s+0\.1[\d.]*\s+0\.0[\d.]*\s+[\d.]+\s+8:11:00/);
  assert.equal(await table.locator('thead th').count(), 12, 'la absorbancia corregida va en la tabla técnica, no en la gráfica');
  const chartBox = await chart.boundingBox();
  const tableBox = await table.boundingBox();
  assert(chartBox.width < tableBox.width / 1.6 && Math.abs(chartBox.y - tableBox.y) < 40, 'gráfica a la izquierda en un tercio, tabla a la derecha en dos tercios');
  const hit = chart.locator('.reaction-chart__hit');
  const box = await hit.boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  const tooltip = page.locator('[data-testid="reaction-tooltip"]');
  await tooltip.waitFor({ timeout: 10000 });
  assert.match(await tooltip.innerText(), /Ciclo 1[5-6][\s\S]*8:2[5-6]:00[\s\S]*Réplica\s+Abs1\s+Abs2\s+Dif[\s\S]*R1\s+0\.\d+\s+0\.\d+\s+0\.\d+[\s\S]*R2[\s\S]*R3/i);
  assert.equal(await chart.locator('.reaction-chart__crosshair circle').count(), 6, 'retícula por réplica en el ciclo señalado');
  await bplSection.locator('[data-testid="reaction-shell"]').screenshot({ path: fileURLToPath(new URL('09-curva-reaccion.png', output)) });
  await page.mouse.move(0, 0);
  await explorer.getByRole('button', { name: 'Abs2', exact: true }).click();
  assert.equal(await chart.getAttribute('data-metric'), 'abs2');
  await explorer.locator('.reaction-chart__legend-item').nth(1).click();
  assert.equal(await explorer.locator('.reaction-chart__line').count(), 2, 'la leyenda oculta réplicas');
  await explorer.locator('.reaction-chart__legend-item').nth(0).click();
  await explorer.locator('.reaction-chart__legend-item').nth(2).click();
  assert.equal(await explorer.locator('.reaction-chart__line').count(), 0);
  assert.equal(await explorer.locator('.reaction-chart__legend-item').count(), 3, 'la leyenda sigue visible con todo oculto');
  assert.match(await explorer.locator('.reaction-chart__empty').innerText(), /Todas las réplicas están ocultas/);
  assert.equal(await table.locator('tbody tr').count(), 90, 'la tabla no desaparece al ocultar réplicas');
  for (const index of [0, 1, 2]) await explorer.locator('.reaction-chart__legend-item').nth(index).click();
  assert.equal(await explorer.locator('.reaction-chart__line').count(), 3, 'las réplicas se recuperan desde la leyenda');
  await explorer.locator('.reaction-explorer__group').filter({ hasText: 'ALT-GPT' }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="reaction-viewer"]')?.getAttribute('data-group') === 'WS-7|502', null, { timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll('.reaction-chart__line').length === 1, null, { timeout: 30000 });
  assert.equal(await explorer.getByRole('button', { name: 'Abs2', exact: true }).count(), 0, 'sin abs2 no hay alternancia de métrica');
  assert.equal(await explorer.locator('.reaction-chart__legend-item').count(), 0, 'una sola réplica no necesita leyenda');
  await explorer.locator('select').nth(1).selectOption('CALIB');
  assert.match(await explorer.locator('.reaction-explorer__count').innerText(), /2 reacciones · 2 réplicas/);
  await explorer.locator('select').nth(0).selectOption('GLUCOSE');
  assert.match(await explorer.locator('.reaction-explorer__count').innerText(), /1 reacciones · 1 réplicas/);
  assert.match(await explorer.locator('.reaction-explorer__group[aria-pressed="true"]').innerText(), /sesión WS-6/);
  await explorer.getByRole('button', { name: 'Limpiar', exact: true }).click();
  assert.equal(await explorer.locator('.reaction-explorer__group').count(), 3);
  await glucoseCard.locator('[data-testid="reaction-sparkline"]').click();
  assert.match(await explorer.locator('.reaction-explorer__group[aria-pressed="true"]').innerText(), /sesión WS-7 · orden 501/);
  await bplSection.screenshot({ path: fileURLToPath(new URL('07-bpl-estado.png', output)) });
  await page.locator('.equipment-monitor__focus-panel').screenshot({ path: fileURLToPath(new URL('08-bpl-ficha.png', output)) });
  const history = page.locator('.equipment-monitor__focus-section--history');
  assert.match(await history.innerText(), /Brazo R2 · Ubicación 3D definida/);
  assert.match(await history.innerText(), /Analizador completo · Evento derivado · Sin pieza asociada/);
  const consequence = cards.filter({ hasText: 'Instruction Aborted' });
  assert.equal(await consequence.getAttribute('data-part'), null);
  assert.match(await consequence.innerText(), /Evento derivado.*Sin pieza asociada/);
  assert.match(await consequence.innerText(), /Último antecedente reportado.*causa sin confirmar/);
  assert.match(await consequence.innerText(), /DR2 Collision Detected/);
  await consequence.click();
  assert(await page.getByRole('button', { name: 'Aislar conjunto', exact: true }).isDisabled());
  assert.equal(await page.locator('.monitor-alarm-anchor[data-part-id="brazo_r2"]').count(), 1);
  assert.equal(await cards.filter({ hasText: 'ISE Time Out' }).filter({ hasNotText: 'Instruction Aborted' }).getAttribute('data-parts'), 'ise_01 ise_02 ise_03');
  for (const partId of ['ise_01', 'ise_02', 'ise_03']) {
    const marker = page.locator(`.monitor-alarm-anchor[data-part-id="${partId}"]`);
    assert.equal(await marker.count(), 1);
    await marker.dispatchEvent('click');
    assert.match(await page.locator('.alarm-spatial__inspector').innerText(), /ISE Time Out/);
  }
  const markerPositions = () => page.locator('.monitor-alarm-anchor').evaluateAll(elements => elements.map(element => element.getAttribute('style')));
  await page.waitForTimeout(900);
  const beforeRotation = await markerPositions();
  await page.waitForTimeout(1200);
  assert.notDeepEqual(await markerPositions(), beforeRotation, 'El modelo gira automáticamente sin interacción');
  await page.locator('.alarm-spatial__stage').hover();
  await page.getByRole('button', { name: 'Pausar giro', exact: true }).click();
  await page.waitForTimeout(1500);
  const pausedPositions = await markerPositions();
  await page.waitForTimeout(700);
  assert.deepEqual(await markerPositions(), pausedPositions, 'Pausar detiene el giro');
  await page.getByRole('button', { name: 'Reanudar giro', exact: true }).click();
  await page.waitForTimeout(800);
  assert.notDeepEqual(await markerPositions(), pausedPositions, 'Reanudar activa el giro');
  await page.waitForTimeout(1000); await capture('01-holograma-general');
  assert.equal(await page.locator('.alarm-spatial__connectors path').count(), 8);
  assert(!(await page.locator('.alarm-spatial__connectors').innerHTML()).includes('NaN'));
  await page.getByRole('button', { name: 'Eventos 4', exact: true }).click();
  assert.equal(await cards.count(), 4);
  await page.getByRole('button', { name: 'Vista general', exact: true }).click();
  await page.locator('.alarm-spatial__stage').hover();
  await page.getByRole('button', { name: 'Ocultar cubiertas', exact: true }).click();
  await page.getByRole('button', { name: 'Mostrar cubiertas', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'Despiece visual del monitor' });
  await slider.focus(); await slider.press('End');
  assert.equal(await slider.inputValue(), '1');
  await page.waitForTimeout(500); await capture('06-despiece');
  await slider.press('Home');
  await cards.filter({ hasText: 'Collision' }).filter({ hasNotText: 'Instruction Aborted' }).click();
  await page.waitForTimeout(850);
  assert.match(await page.locator('.alarm-spatial__inspector').innerText(), /Brazo.*R2/);
  await capture('02-alarma-r1');
  await page.locator('.alarm-spatial__stage').hover();
  await page.getByRole('button', { name: 'Aislar conjunto', exact: true }).click();
  await page.waitForTimeout(850); await capture('03-aislamiento');
  await cards.filter({ hasText: 'sin correspondencia' }).filter({ hasNotText: 'Instruction Aborted' }).click();
  assert.match(await page.locator('.alarm-spatial__inspector').innerText(), /Sin ubicación 3D definida/);
  assert(await page.getByRole('button', { name: 'Aislar conjunto', exact: true }).isDisabled());
  assert.equal(state.downloads, 1);
  await page.locator('.alarm-spatial__stage').hover();
  await page.getByRole('button', { name: 'Restablecer vista', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(850); await capture('04-movil');
  assert(await page.locator('.alarm-spatial').evaluate(element => element.getBoundingClientRect().width <= innerWidth), 'Panel dentro del ancho de pantalla móvil');
  assert(await page.locator('.alarm-spatial').evaluate(element => element.scrollWidth <= element.clientWidth + 1), 'Sin overflow móvil');
  assert(await page.locator('.alarm-spatial__viewport').evaluate(element => element.getBoundingClientRect().height >= 280), 'viewport 3D legible en móvil vertical');
  const mobileOverlay = await overlayState();
  assert(mobileOverlay.railClear, 'el riel no se superpone al explorador en móvil vertical');
  assert(mobileOverlay.onTop, 'el explorador queda encima del globo en móvil vertical (elementFromPoint)');
  // Móvil horizontal: el holograma cabe en la altura de pantalla y el explorador no desborda.
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(850); await capture('04b-movil-horizontal');
  assert(await page.locator('.alarm-spatial__viewport').evaluate(element => element.getBoundingClientRect().height <= innerHeight), 'viewport 3D dentro de la altura en horizontal');
  assert(await page.locator('.alarm-spatial').evaluate(element => element.scrollWidth <= element.clientWidth + 1), 'Sin overflow horizontal en móvil apaisado');
  await page.setViewportSize({ width: 1540, height: 1100 });
  // El sondeo existente sigue funcionando mientras se inspecciona el modelo.
  const previousReads = state.reads; state.resolved = true;
  await page.waitForFunction(() => document.querySelector('.alarm-spatial__empty')?.textContent.includes('Sin alarmas activas'), null, { timeout: 35000 });
  assert(state.reads > previousReads);
  assert.equal(await page.locator('.monitor-alarm-anchor').count(), 0);
  await capture('05-alarmas-resueltas');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.alarm-spatial').count(), 0);
  assert.equal(await page.locator('[data-testid="ba400-canvas"]').count(), 0);
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  // El globo vuelve a la vida: sin data-paused y sin filtro (la transición del filtro dura menos de medio segundo).
  const globeRestored = await page.waitForFunction(() => {
    const globe = document.querySelector('.equipment-globe');
    return Boolean(globe) && !globe.hasAttribute('data-paused') && getComputedStyle(globe).filter === 'none';
  }, null, { timeout: 5000 }).then(() => true, () => false);
  assert(globeRestored, 'tras Escape el globo queda sin data-paused y con filter none');
  // La lista de prioridad permite abrir un BA400 sin alarmas en un clic.
  await page.locator('.equipment-priority button').filter({ hasText: '834001902' }).click();
  await ready();
  assert.match(await page.locator('.alarm-spatial__empty').innerText(), /Sin alarmas activas/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.alarm-spatial').count(), 0);
  assert(await page.evaluate(() => document.activeElement?.closest('.equipment-priority') !== null), 'tras Escape el foco vuelve al riel que abrió el explorador');
  // BA200 no debe utilizar la geometría BA400.
  state.resolved = false;
  await page.waitForTimeout(31000);
  await page.locator('.equipment-monitor__lists-grid button').filter({ hasText: '832001902' }).first().click();
  assert.equal(await page.locator('.alarm-spatial').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Explorar alarmas en 3D' }).count(), 0);
  assert.equal(state.writes.length, 0); assert.deepEqual(state.errors, []);
  console.log(JSON.stringify({ result: 'PASS', checks: ['selección explícita en monitoreo', 'precarga silenciosa única', 'mapa integrado', 'cubiertas visibles por defecto', 'modelo holográfico', 'alarmas y marcadores', 'foco e aislamiento', 'desconocidos sin asociación', 'móvil sin desbordamiento', 'actualización y limpieza al resolver', 'Escape y desmontaje', 'explorador sobre el globo', 'un lienzo visible', 'cristal oscuro y piso de 11 px', 'móvil horizontal', 'foco restaurado', 'BA200 sin modelo BA400', 'sin escrituras'], downloads: state.downloads, reads: state.reads, errors: state.errors }, null, 2));
} catch (error) { await capture('failure'); console.error(state.errors); throw error; }
finally { await browser.close(); }
