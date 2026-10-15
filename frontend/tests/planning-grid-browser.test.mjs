import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

// Acceptance checks of the editable master table against the in-memory planning backend
// (tests/fixtures/memoryPlanningBackend.ts: versions, history and cross-tab updates like the database).
// Run with Vite serving the frontend: PLANNING_GRID_URL=http://127.0.0.1:<port>/orion/tests/fixtures/planning-grid.html
const URL = process.env.PLANNING_GRID_URL || 'http://127.0.0.1:5200/orion/tests/fixtures/planning-grid.html';
const SHOTS = process.env.PLANNING_GRID_SHOTS || path.join(tmpdir(), 'planning-grid-shots');
await mkdir(SHOTS, { recursive: true });
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const run = (name) => !only.length || only.includes(name);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
const passed = [];
const errors = [];

const open = async (query = '?reset') => {
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${URL}${query}`);
  await page.locator('.pgrid-row').first().waitFor();
  return page;
};
const rows = (page) => page.evaluate(() => window.__pgrid.rows());
const cell = (page, rowKey, colIndex) => page.locator(`.pgrid-row[data-row-key="${rowKey}"] .pgrid-cell`).nth(colIndex);
const rowByText = (page, text) => page.locator('.pgrid-row', { hasText: text });
const synced = (page) => page.locator('.pgrid-sync', { hasText: /Guardado|Todo guardado/ }).waitFor({ timeout: 8000 });
const metaOf = (row) => JSON.parse(row.descripcion.split('[METADATA_PLANEACION]')[1]);
const localityOf = (row) => (row.descripcion.match(/Cliente\/Localidad: ([^\n]*)/) || [])[1];

try {
  // 1. Quick capture: ten activities in a row using the keyboard only.
  if (run('capture')) {
    const page = await open();
    const before = (await rows(page)).length;
    await cell(page, 'capture:2026-10-12', 0).click();
    for (let index = 1; index <= 10; index += 1) {
      await page.keyboard.type('corr');
      await page.keyboard.press('Tab');
      await page.keyboard.type('BA400');
      await page.keyboard.press('Tab');
      await page.keyboard.type(`Sitio rápido ${index}`);
      await page.keyboard.press('Enter');
      await page.locator('.pgrid-row', { hasText: `Sitio rápido ${index}` }).locator('.pgrid-dot--idle').waitFor({ timeout: 5000 });
    }
    await synced(page);
    const after = await rows(page);
    assert.equal(after.length, before + 10, 'ten activities created');
    const created = after.filter((row) => /Sitio rápido/.test(localityOf(row) || ''));
    assert.equal(created.length, 10);
    for (const row of created) {
      const meta = metaOf(row);
      assert.equal(meta.service_type, 'correctivo');
      assert.equal(meta.week_start, '2026-10-12');
      assert.match(row.asunto, /^\[PLAN\] CORRECTIVO - BA400 - Sitio rápido \d+$/);
    }
    // The capture row stays ready for the next one.
    assert.equal(await page.locator('.pgrid-row[data-row-key="capture:2026-10-12"] .pgrid-cell.is-active').count(), 1);
    await page.screenshot({ path: path.join(SHOTS, '1-capture.png') });
    await page.close();
    passed.push('captura rápida de 10 actividades con teclado');
  }

  // 2. Paste ten rows copied from Excel into a week.
  if (run('paste')) {
    const page = await open();
    const before = (await rows(page)).length;
    await cell(page, 'capture:2026-10-19', 0).click();
    const lines = Array.from({ length: 10 }, (_, index) =>
      ['Preventivo', 'BA200', `Hospital pegado ${index + 1}`, index === 0 ? '832000333' : 'NA', `Nota ${index + 1}`, 'MARTHA', 'FRANCISCO / DIEGO', `2${index % 3}/10/2026`, 'LUN-MAR'].join('\t'),
    );
    const tsv = ['TIPO DE SERVICIO\tPLATAFORMA\tLOCALIDAD\tNS\tOBSERVACIONES\tINGENIERO\tACOMPAÑANTE\tFECHA\tDIAS', ...lines].join('\r\n') + '\r\n';
    await page.evaluate((text) => {
      const data = new DataTransfer();
      data.setData('text/plain', text);
      document.querySelector('.pgrid-scroll').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, tsv);
    await page.locator('.pgrid-toast', { hasText: 'Pegado: 10 nuevas' }).waitFor();
    const after = await rows(page);
    assert.equal(after.length, before + 10, 'ten pasted activities');
    const pasted = after.filter((row) => /Hospital pegado/.test(localityOf(row) || ''));
    const first = pasted.find((row) => localityOf(row) === 'Hospital pegado 1');
    const meta = metaOf(first);
    assert.equal(first.numero_serie_equipo, '832000333');
    assert.equal(meta.ingeniero_csv, 'Martha Carbajal');
    assert.deepEqual(meta.companions_csv, ['Francisco', 'Diego Garcia Garcia'], 'crew names resolved like the official sync');
    assert.equal(meta.scheduled_date, '2026-10-20');
    assert.equal(meta.scheduled_day, 'LUN-MAR');
    assert.ok(pasted.every((row) => metaOf(row).week_start === '2026-10-19'), 'pasted into the week where it started');
    assert.equal(pasted.find((row) => localityOf(row) === 'Hospital pegado 2').numero_serie_equipo, null, 'NA means no serial');
    await page.close();
    passed.push('pegar 10 filas desde Excel (con encabezado, personas y fechas)');
  }

  // 3. Persistence: saved values survive a reload.
  if (run('persist')) {
    const page = await open();
    const target = rowByText(page, 'Laboratorio Norte de Prueba');
    await target.locator('.pgrid-cell').nth(4).click();
    await page.keyboard.type('Cambiar rotor y calibrar');
    await page.keyboard.press('Enter');
    await synced(page);
    await page.reload();
    await rowByText(page, 'Cambiar rotor y calibrar').waitFor();
    await page.close();
    passed.push('lo guardado sigue tras recargar');
  }

  // 4. Organization: change month, find the week, move an activity to the next week (same weekday).
  if (run('organize')) {
    const page = await open();
    await page.getByRole('button', { name: 'Mes siguiente' }).click();
    await page.locator('.pgrid-months__current', { hasText: 'Noviembre 2026' }).waitFor();
    assert.ok(await page.locator('.pgrid-week', { hasText: '02 AL 06 NOVIEMBRE' }).count());
    await page.getByRole('button', { name: 'Mes anterior' }).click();
    await page.locator('.pgrid-months__current', { hasText: 'Octubre 2026' }).waitFor();
    const target = rowByText(page, 'Hospital Central de Prueba');
    await target.locator('.pgrid-cell').nth(2).click({ button: 'right' });
    await page.getByRole('menuitem', { name: /Mover a otra semana/ }).click();
    await page.getByRole('button', { name: 'Semana siguiente →' }).click();
    await synced(page);
    const moved = (await rows(page)).find((row) => localityOf(row) === 'Hospital Central de Prueba');
    assert.equal(metaOf(moved).week_start, '2026-10-19');
    assert.equal(metaOf(moved).scheduled_date, '2026-10-20', 'Tuesday stays Tuesday');
    assert.equal(metaOf(moved).fecha_tentativa, '19 AL 23 OCTUBRE');
    // Drag by the handle back to the 12-16 week band.
    const handle = rowByText(page, 'Hospital Central de Prueba').locator('.pgrid-rowhead__handle');
    const band = page.locator('.pgrid-week', { hasText: '12 AL 16 OCTUBRE' });
    const from = await handle.boundingBox();
    const to = await band.boundingBox();
    await page.mouse.move(from.x + 4, from.y + 6);
    await page.mouse.down();
    await page.mouse.move(to.x + 200, to.y + 10, { steps: 8 });
    await page.mouse.up();
    await synced(page);
    const back = (await rows(page)).find((row) => localityOf(row) === 'Hospital Central de Prueba');
    assert.equal(metaOf(back).week_start, '2026-10-12');
    assert.equal(metaOf(back).scheduled_date, '2026-10-13');
    await page.close();
    passed.push('cambiar de mes, mover entre semanas (menú y arrastre)');
  }

  // 5. Column layout: resize and reorder without touching the data.
  if (run('columns')) {
    const page = await open();
    const before = JSON.stringify(await rows(page));
    const header = page.locator('.pgrid-header__cell', { hasText: 'Plataforma' });
    const box = await header.boundingBox();
    const handle = header.locator('.pgrid-header__resize');
    const handleBox = await handle.boundingBox();
    await page.mouse.move(handleBox.x + 3, handleBox.y + 10);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + 83, handleBox.y + 10, { steps: 5 });
    await page.mouse.up();
    const wider = await header.boundingBox();
    assert.ok(wider.width > box.width + 60, 'column got wider');
    const obs = page.locator('.pgrid-header__cell', { hasText: 'Observaciones' });
    const obsBox = await obs.boundingBox();
    const platformBox = await header.boundingBox();
    await page.mouse.move(obsBox.x + 30, obsBox.y + 10);
    await page.mouse.down();
    await page.mouse.move(platformBox.x + 20, platformBox.y + 10, { steps: 10 });
    await page.mouse.up();
    const labels = await page.locator('.pgrid-header__cell > span:first-child').allTextContents();
    assert.ok(labels.indexOf('Observaciones') < labels.indexOf('Plataforma'), `reordered: ${labels.join(', ')}`);
    const rowCells = await rowByText(page, 'Laboratorio Norte de Prueba').locator('.pgrid-cell').allTextContents();
    assert.equal(rowCells[labels.indexOf('Observaciones')].trim(), 'Falla de rotor');
    assert.equal(rowCells[labels.indexOf('Plataforma')].trim(), 'A15');
    await page.waitForTimeout(800);
    assert.equal(JSON.stringify(await rows(page)), before, 'layout changes never touch activities');
    await page.reload();
    await page.locator('.pgrid-row').first().waitFor();
    const reloaded = await page.locator('.pgrid-header__cell > span:first-child').allTextContents();
    assert.ok(reloaded.indexOf('Observaciones') < reloaded.indexOf('Plataforma'), 'layout kept per user');
    await page.close();
    passed.push('ancho y orden de columnas sin afectar datos (y se recuerdan)');
  }

  // 6. Collaboration: what one user saves appears for the other without reloading.
  if (run('collab')) {
    const first = await open();
    const second = await open('');
    await rowByText(first, 'Clínica Sur de Prueba').locator('.pgrid-cell').nth(4).click();
    await first.keyboard.type('Capacitación de seguimiento');
    await first.keyboard.press('Enter');
    await synced(first);
    await rowByText(second, 'Capacitación de seguimiento').waitFor({ timeout: 5000 });
    await first.close();
    await second.close();
    passed.push('dos usuarios ven los cambios sin recargar');
  }

  // 7. Integrity: concurrent edits never overwrite silently.
  if (run('conflict')) {
    const page = await open();
    const id = (await rows(page)).find((row) => localityOf(row) === 'Laboratorio Norte de Prueba').id;
    // Someone else changes the observations; their live notification has not arrived yet.
    await page.evaluate((ticketId) => window.__pgrid.externalEdit(ticketId, (row) => ({ ...row, descripcion: row.descripcion.replace('Observaciones: Falla de rotor', 'Observaciones: Falla de rotor y tarjeta') }), 'Diego Garcia Garcia', false), id);
    // A different field merges by itself.
    await rowByText(page, 'Laboratorio Norte de Prueba').locator('.pgrid-cell').nth(1).click();
    await page.keyboard.type('A25');
    await page.keyboard.press('Enter');
    await synced(page);
    let saved = (await rows(page)).find((row) => row.id === id);
    assert.match(saved.descripcion, /Falla de rotor y tarjeta/, 'their change kept');
    assert.match(saved.asunto, / - A25 - /, 'my change saved');
    // The same field: the user decides.
    await page.evaluate((ticketId) => window.__pgrid.externalEdit(ticketId, (row) => ({ ...row, descripcion: row.descripcion.replace('Falla de rotor y tarjeta', 'Revisión completa (Diego)') }), 'Diego Garcia Garcia', false), id);
    await rowByText(page, 'Laboratorio Norte de Prueba').locator('.pgrid-cell').nth(4).click();
    await page.keyboard.type('Mi versión de la nota');
    await page.keyboard.press('Enter');
    const conflict = page.locator('.pgrid-issues li.is-conflict');
    await conflict.waitFor();
    assert.match(await conflict.innerText(), /tú pusiste «Mi versión de la nota»/);
    saved = (await rows(page)).find((row) => row.id === id);
    assert.match(saved.descripcion, /Revisión completa \(Diego\)/, 'nothing overwritten before deciding');
    await conflict.getByRole('button', { name: 'Conservar el mío' }).click();
    await synced(page);
    saved = (await rows(page)).find((row) => row.id === id);
    assert.match(saved.descripcion, /Mi versión de la nota/);
    await page.close();
    passed.push('edición simultánea: combina campos distintos y pregunta en el mismo campo');
  }

  // 8. A failed save keeps the value, says so, and retries.
  if (run('failure')) {
    const page = await open();
    await page.evaluate(() => {
      window.__pgrid.failNext = 1;
    });
    await rowByText(page, 'Hospital Poniente de Prueba').locator('.pgrid-cell').nth(4).click();
    await page.keyboard.type('Nota tras falla');
    await page.keyboard.press('Enter');
    await page.locator('.pgrid-sync--error').waitFor();
    assert.equal(await rowByText(page, 'Nota tras falla').count(), 1, 'typed value still on screen');
    await page.locator('.pgrid-issues li.is-error').getByRole('button', { name: 'Reintentar' }).click();
    await synced(page);
    assert.ok((await rows(page)).some((row) => /Nota tras falla/.test(row.descripcion)));
    await page.close();
    passed.push('error al guardar: no se pierde y se reintenta');
  }

  // 9. Delete with confirmation, undo, history panel and the read-only mode.
  if (run('delete')) {
    const page = await open();
    const before = (await rows(page)).length;
    await rowByText(page, 'Unidad Médica de Prueba').locator('.pgrid-cell').nth(4).click();
    await page.keyboard.type('Instalación con reubicación');
    await page.keyboard.press('Enter');
    await synced(page);
    await rowByText(page, 'Unidad Médica de Prueba').locator('.pgrid-cell').nth(2).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Consultar historial' }).click();
    await page.locator('.pgrid-history li', { hasText: 'modificó las observaciones de Mismo día que otro servicio a Instalación con reubicación' }).waitFor();
    await page.getByRole('button', { name: 'Cerrar historial' }).click();
    await rowByText(page, 'Unidad Médica de Prueba').locator('.pgrid-cell').nth(2).click({ button: 'right' });
    await page.getByRole('menuitem', { name: /Eliminar actividad/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click();
    await page.locator('.pgrid-toast', { hasText: 'eliminada' }).waitFor();
    assert.equal((await rows(page)).length, before - 1);
    await page.locator('.pgrid-scroll').focus();
    await page.keyboard.press('Meta+z');
    await rowByText(page, 'Unidad Médica de Prueba').waitFor();
    assert.equal((await rows(page)).length, before, 'undo recreated it');
    await page.close();

    const readonly = await open('?readonly');
    await rowByText(readonly, 'Clínica Sur de Prueba').locator('.pgrid-cell').nth(4).click();
    await readonly.keyboard.type('x');
    await readonly.locator('.pgrid-toast', { hasText: 'solo puede consultar' }).waitFor();
    assert.equal(await readonly.locator('.pgrid-editor').count(), 0);
    assert.equal(await readonly.locator('.pgrid-row--capture').count(), 0);
    await readonly.close();
    passed.push('eliminar con confirmación, deshacer, historial y modo lectura');
  }

  // 10. Search, filters, saved view and calendar layout over the same records.
  if (run('views')) {
    const page = await open();
    await page.getByLabel('Buscar en la planeación').fill('ba400 central');
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.pgrid-row:not(.pgrid-row--capture)').count(), 1);
    await page.getByLabel('Buscar en la planeación').fill('');
    await page.getByRole('button', { name: /^Vista:/ }).click();
    await page.getByRole('button', { name: 'Correctivos', exact: true }).click();
    assert.equal(await page.locator('.pgrid-row:not(.pgrid-row--capture)').count(), 1);
    await page.getByRole('button', { name: /^Vista:/ }).click();
    await page.getByLabel('Nombre de la vista').fill('Mis correctivos');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.getByRole('button', { name: 'Mis correctivos', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Calendario', exact: true }).click();
    await page.locator('.pgrid-cal__chip').first().waitFor();
    await page.getByRole('button', { name: /^Vista:/ }).click();
    await page.getByRole('button', { name: 'Planeación general' }).click();
    await page.getByRole('button', { name: 'Calendario', exact: true }).click();
    await page.screenshot({ path: path.join(SHOTS, '10-calendar.png') });
    assert.ok(await page.locator('.pgrid-cal__chip').count() >= 5);
    await page.close();
    passed.push('búsqueda multi‑palabra, vistas guardadas y calendario');
  }

  // 11. Excel: export the month and import it back (duplicates detected).
  if (run('excel')) {
    const page = await open();
    await page.getByRole('button', { name: 'Excel', exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /Exportar octubre 2026/ }).click()]);
    const file = path.join(SHOTS, download.suggestedFilename());
    await download.saveAs(file);
    assert.match(download.suggestedFilename(), /\.xlsx$/);
    await page.getByRole('button', { name: 'Excel', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: /Importar archivo/ }).click();
    await (await chooser).setFiles(file);
    const dialog = page.getByRole('dialog', { name: 'Importar planeación desde Excel' });
    await dialog.getByText(/filas leídas/).waitFor();
    assert.match(await dialog.innerText(), /Duplicada 6/, 'every exported activity is recognised as already in Orion');
    assert.match(await dialog.innerText(), /Importar 0/);
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await page.close();
    passed.push('exportar a Excel e importar con vista previa (duplicados detectados)');
  }

  // 12. Performance with 1,000 activities.
  if (run('perf')) {
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    const started = Date.now();
    await page.goto(`${URL}?reset&bulk=1000`);
    await page.locator('.pgrid-row').first().waitFor();
    const loadMs = Date.now() - started;
    const rendered = await page.locator('.pgrid-row').count();
    assert.ok(rendered < 120, `only visible rows are in the page (${rendered})`);
    await page.locator('.pgrid-row:not(.pgrid-row--capture) .pgrid-cell').first().click();
    const navStart = Date.now();
    for (let index = 0; index < 60; index += 1) await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);
    const navMs = (Date.now() - navStart) / 60;
    for (let index = 0; index < 4; index += 1) await page.keyboard.press('Tab');
    const editStart = Date.now();
    await page.keyboard.type('Z');
    await page.keyboard.press('Enter');
    await page.locator('.pgrid-editor').waitFor({ state: 'detached' });
    const editMs = Date.now() - editStart;
    const scrollStart = Date.now();
    await page.locator('.pgrid-scroll').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.locator('.pgrid-row[data-row-key="capture:2026-10-26"]').waitFor();
    const scrollMs = Date.now() - scrollStart;
    await page.screenshot({ path: path.join(SHOTS, '12-perf.png') });
    console.log(`perf: load ${loadMs} ms, arrow ${navMs.toFixed(1)} ms/key, edit ${editMs} ms, jump-scroll ${scrollMs} ms, rows in DOM ${rendered}`);
    assert.ok(loadMs < 6000 && navMs < 60 && editMs < 800 && scrollMs < 1500, 'fluid with 1,000 activities');
    await page.close();
    passed.push('1,000 actividades fluidas');
  }

  console.log(`PASS (${passed.length}): ${passed.join(' · ')}`);
  assert.deepEqual(errors, [], 'no page errors');
} catch (error) {
  console.error(`Passed before failing: ${passed.join(' · ')}`);
  throw error;
} finally {
  await browser.close();
}
