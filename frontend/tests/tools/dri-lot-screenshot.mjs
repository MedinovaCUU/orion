// Captura la ficha «Lote en uso · SAT + einfo.bio» del reactivo GLU con el fixture case-18 cargado en /dri-preview.
// Uso: BA400_PREVIEW_URL=http://127.0.0.1:5200/orion/dri-preview node tests/tools/dri-lot-screenshot.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const url = process.env.BA400_PREVIEW_URL || 'http://127.0.0.1:5173/orion/dri-preview';
const out = new URL('../../../outputs/dri-workbench/', import.meta.url);
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
await page.addInitScript(() => { try { window.sessionStorage.setItem('orion.intro.seen', '1'); } catch { /* sin almacenamiento */ } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(url);
  await page.getByRole('tab', { name: 'Evidencia' }).click();
  const row = page.locator('.dri-fixture-list li', { hasText: 'case-18' });
  await row.getByRole('button', { name: 'Cargar en el caso' }).click();
  await page.getByRole('tab', { name: 'Caso' }).click();
  const card = page.getByTestId('dri-reagent-lot');
  await card.waitFor({ timeout: 20000 });
  const text = await card.innerText();
  assert.match(text, /R1 · lote 00005/);
  assert.match(text, /21503 · 0001935/);
  assert.doesNotMatch(text, /Límite linealidad/i, 'limits shown in the header are not repeated in the card');
  assert.match(text, /lote caducado en uso/i);
  assert.match(text, /se siguió pipeteando hasta el 2028-05-02, 44 días después de caducar/, 'finding explanation is visible, not only a tooltip');
  assert.match(text, /Caducó 19 mar 2028 \(CoA\)/, 'exact CoA expiry of the component lot, not shifted a day in Mexico');
  assert.equal(await card.locator('.dri-lot-card').getAttribute('data-risk'), 'high');
  assert.match(await page.getByTestId('dri-lot-ifu-badge').innerText(), /IFU del lote 0001935/i);
  const metrics = await page.locator('.dri-reagent-detail__metrics').innerText();
  assert.match(metrics, /3\.6 mg\/dL/, 'header LOD comes from the lot IFU, not the generic catalog');
  assert.match(metrics, /500 mg\/dL/, 'header linearity from the lot IFU');
  const riskInk = await card.locator('.dri-badge--red').first().evaluate((node) => getComputedStyle(node).color);
  assert.notEqual(riskInk, 'rgb(243, 39, 53)', 'risk text uses the ink red, not the brand red');
  const smallest = await card.evaluate((node) => Math.min(...[...node.querySelectorAll('*')].filter((el) => el.childElementCount === 0 && el.textContent.trim()).map((el) => parseFloat(getComputedStyle(el).fontSize))));
  assert.ok(smallest >= 11, `no text under 11 px (min ${smallest})`);
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.locator('.dri-reagent-detail').screenshot({ path: fileURLToPath(new URL('14-lot-card-case-18.png', out)) });
  await page.getByRole('tab', { name: /Evidencia/ }).click();
  const evidence = await page.locator('.dri-dock-section').innerText();
  assert.match(evidence, /lote caducado en uso/i);
  await page.locator('.dri-dock-section').screenshot({ path: fileURLToPath(new URL('15-lot-evidence-case-18.png', out)) });
  assert.deepEqual(errors, []);
  console.log('lot card verified: outputs/dri-workbench/14-lot-card-case-18.png, 15-lot-evidence-case-18.png');
} finally {
  await browser.close();
}
