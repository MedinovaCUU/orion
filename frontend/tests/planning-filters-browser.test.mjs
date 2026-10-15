import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

// Planeación must never look empty because of something the user can't see: a drill-down from
// "Alertas y pendientes", a filter left on with the panel closed, or a failed refresh.
const base = process.env.PLANNING_PAGE_URL || 'http://127.0.0.1:5200/orion/tests/fixtures/planning-page.html';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const sidebar = (name) => page.locator('.planning-sidebar').getByRole('button', { name, exact: false }).first();
  const alertRow = (text) => page.locator('.planning-alert-row').filter({ hasText: text });
  const chips = page.locator('.planning-active-filters__chip');
  const emptyState = page.locator('.planning-empty-state');
  const totalServices = page.locator('.planning-kpi-card').filter({ hasText: 'Total servicios' }).locator('strong');

  await page.goto(base);
  await alertRow('ns pendiente').waitFor();

  // Every alert with services drills down to exactly that many services; empty alerts can't be opened.
  for (const [text, count] of [['ns pendiente', 1], ['sin ingeniero', 1], ['sin dia asignado', 1]]) {
    await sidebar('Resumen').click();
    await alertRow(text).click();
    await page.locator('.planning-alert-row.is-active').filter({ hasText: text }).waitFor();
    assert.equal(await emptyState.count(), 0, `${text}: no debe quedar vacío`);
    assert.equal(await chips.count(), 1);
    assert.equal(await totalServices.innerText(), String(count), `${text}: total del filtro`);
  }
  assert.equal(await alertRow('criticos').isDisabled(), true);
  assert.equal(await alertRow('ya realizados').isDisabled(), true);

  // Leaving Alertas drops the drill-down, so the other sections show the whole month again.
  await sidebar('Calendario').click();
  assert.equal(await chips.count(), 0);
  assert.equal(await totalServices.innerText(), '4');

  // A filter left on with the panel closed stays visible and can be cleared from the empty state.
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await page.getByPlaceholder('Localidad, serie, plataforma, ingeniero o ticket').fill('zzz no existe');
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await sidebar('Resumen').click();
  await chips.filter({ hasText: 'Búsqueda: «zzz no existe»' }).waitFor();
  await emptyState.getByText('Ningún servicio coincide con los filtros').waitFor();
  await emptyState.getByText('Este mes tiene 4 servicios').waitFor();
  await emptyState.getByRole('button', { name: 'Limpiar filtros' }).click();
  assert.equal(await chips.count(), 0);
  await emptyState.waitFor({ state: 'detached' }); // the search is a deferred value: one render later

  // A failed first load says so (and offers a retry) instead of "no services".
  await page.goto(`${base}?fail`);
  await emptyState.getByText('No se pudo cargar la planeación').waitFor();
  assert.equal(await page.locator('.planning-load-error').count(), 0);
  await emptyState.getByRole('button', { name: 'Reintentar' }).click();
  assert.equal(await page.evaluate(() => window.__retries), 1);

  // A failed refresh keeps the services already loaded and warns about it.
  await page.goto(`${base}?stale`);
  await page.locator('.planning-load-error').getByText('Se muestran los últimos datos cargados.').waitFor();
  assert.equal(await emptyState.count(), 0);

  assert.deepEqual(errors, []);
  console.log('PASS: alert drill-down counts, disabled empty alerts, drill-down cleared outside Alertas, visible hidden filters, clear from empty state, failed load, failed refresh.');
} finally {
  await browser.close();
}
