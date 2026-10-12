// Importación SAT de un solo paso en /dri-preview (modo demostración: analiza sin guardar en Supabase y, sin
// sesión, pide la contraseña porque no puede leer el secreto SAT_EXPORT_PASSWORD).
// Uso: SAT_FILE=<ruta .A400> SAT_PASSWORD=<clave> BA400_PREVIEW_URL=http://127.0.0.1:5200/orion/dri-preview node tests/tools/dri-sat-import.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const url = process.env.BA400_PREVIEW_URL || 'http://127.0.0.1:5173/orion/dri-preview';
const satFile = process.env.SAT_FILE;
const password = process.env.SAT_PASSWORD;
assert.ok(satFile && password, 'SAT_FILE y SAT_PASSWORD son obligatorios');
const out = new URL('../../../outputs/dri-workbench/', import.meta.url);
await fs.mkdir(out, { recursive: true });
const shot = (name) => fileURLToPath(new URL(name, out));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
await page.addInitScript(() => { try { window.sessionStorage.setItem('orion.intro.seen', '1'); } catch { /* sin almacenamiento */ } });
const errors = [];
const writes = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && /supabase/.test(request.url())) writes.push(request.url()); });
try {
  await page.goto(url);
  await page.getByRole('button', { name: /Importar SAT/ }).waitFor({ timeout: 30000 });
  // 1) Elegir el archivo: sin contraseña recordada, el importador la pide una sola vez.
  await page.locator('.dri-sources input.sat-importer__file-input').setInputFiles(satFile);
  const dialog = page.locator('.sat-importer__dialog');
  await dialog.getByLabel('Contraseña de exportación').waitFor({ timeout: 60000 });
  await page.screenshot({ path: shot('20-sat-import-password.png') });
  await dialog.getByLabel('Contraseña de exportación').fill(password);
  await dialog.getByRole('button', { name: 'Abrir e importar' }).click();
  // 2) Análisis y resumen sin más clics.
  await dialog.getByRole('heading', { name: 'Quedó cargado' }).waitFor({ timeout: 120000 });
  const result = await dialog.innerText();
  assert.match(result, /serie 834000473/);
  assert.match(result, /DRI: el caso tomó la serie 834000473/);
  assert.match(result, /frascos de reactivo con lote y caducidad/);
  assert.match(result, /Resultados de control/);
  assert.match(result, /marca qué pruebas fallaron/);
  assert.match(result, /modo demostración/);
  await dialog.screenshot({ path: shot('21-sat-import-result.png') });
  await dialog.getByRole('button', { name: 'Listo' }).click();
  // 3) El caso recibió el SAT y la lista se filtra a las pruebas del equipo.
  const strip = await page.locator('.dri-sources').innerText();
  assert.match(strip, /Aplicad/i);
  const filter = page.getByLabel(/Solo pruebas del SAT/);
  await filter.waitFor();
  const filtered = await page.locator('.dri-reagent-list > *').count();
  await filter.uncheck();
  const all = await page.locator('.dri-reagent-list > *').count();
  assert.ok(filtered > 0 && filtered < all, `filter reduces the list (${filtered} of ${all})`);
  await filter.check();
  await page.locator('.dri-picker').screenshot({ path: shot('22-sat-filter.png') });
  // 4) La contraseña no se recuerda en el navegador: sin sesión (demostración) se vuelve a pedir; con sesión la
  //    entrega el secreto de Supabase y no se pide nunca.
  await page.locator('.dri-sources input.sat-importer__file-input').setInputFiles(satFile);
  await dialog.getByLabel('Contraseña de exportación').waitFor({ timeout: 60000 });
  assert.equal(await page.evaluate(() => Object.keys(window.localStorage).filter((key) => /sat/i.test(key)).length), 0, 'nothing about the SAT password is stored');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  assert.deepEqual(writes, [], 'demo mode never writes to Supabase');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, filtered, all }));
} catch (caught) {
  const text = await page.locator('.sat-importer__dialog').innerText().catch(() => '(sin diálogo)');
  console.error('DIALOG:', text.slice(0, 1500));
  console.error('PAGE ERRORS:', errors);
  await page.screenshot({ path: shot('29-sat-import-failure.png') }).catch(() => {});
  throw caught;
} finally {
  await browser.close();
}
