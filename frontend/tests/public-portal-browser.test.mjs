// Run with Vite on port 5200 (launch config "orion-tests"): node tests/public-portal-browser.test.mjs
// Supabase RPCs are intercepted; nothing reaches the database.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser = await chromium.launch({channel: 'chrome', headless: true});
try {
  const page = await (await browser.newContext({viewport: {width: 420, height: 900}})).newPage();
  const calls = [];
  let submitReply = {status: 'agrupado', repetido: false, numero_caso: '1O222T64', modelo: 'BA400'};
  await page.route('**/auth/v1/**', route => route.abort());
  await page.route('**/rest/v1/rpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    const body = route.request().postDataJSON();
    calls.push({name, body});
    let reply = null;
    if (name === 'check_public_equipment_serial') {
      reply = body.p_serial === 'F050' ? {status: 'ok', serie: 'F050', modelo: 'IMLD'}
        : ['9', '7'].includes(body.p_serial) ? {status: 'formato', serie: null, modelo: null}
        : body.p_serial.replace(/\D/g, '') === '834001902'
        ? {status: 'ok', serie: '834001902', modelo: 'BA400'}
        : {status: 'no_encontrado', serie: null, modelo: body.p_serial.startsWith('83400') ? 'BA400' : null};
    } else if (name === 'submit_public_support_case') reply = submitReply;
    else assert.fail(`unexpected RPC ${name}`);
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(reply)});
  });
  await page.goto('http://127.0.0.1:5200/orion/');
  const serial = page.getByLabel('N° Serie del equipo *');
  await serial.waitFor();

  // A value that cannot be a serial: no lookup, error and help with the example photos on leaving the field.
  await serial.fill('9');
  await page.getByLabel('Nombre del Contacto *').click();
  await page.getByText('Ese dato no corresponde a un número de serie').waitFor();
  assert.equal(await serial.getAttribute('aria-invalid'), 'true');
  await page.getByText('Ayuda → Información del analizador').waitFor();
  const images = page.locator('.serial-help img');
  assert.equal(await images.count(), 2);
  for (const img of await images.all()) {
    await img.scrollIntoViewIfNeeded();
    await page.waitForFunction(el => el.complete && el.naturalWidth > 0, await img.elementHandle());
  }
  await page.getByRole('tab', {name: 'A15'}).click();
  await page.getByText('Ayuda → Acerca de…').waitFor();
  assert.equal(await page.locator('.serial-help img').count(), 3);
  // An odd-looking serial that is registered (e.g. F050) is accepted once the database confirms it.
  await serial.fill('F050');
  await page.getByText('Equipo registrado: IMLD · F050').waitFor();
  assert.equal(await serial.getAttribute('aria-invalid'), 'false');

  // A plausible serial that is not registered, then the right one.
  await serial.fill('834005555');
  await page.getByText('No encontramos ese número de serie entre los equipos BA400 registrados').waitFor();
  await serial.fill('SN 83400-1902');
  await page.getByText('Equipo registrado: BA400 · 834001902').waitFor();
  assert.equal(await serial.getAttribute('aria-invalid'), 'false');

  // Submit: pasted +52 phone is reduced to 10 digits; the report joins the open case.
  await page.getByRole('button', {name: /Ingeniería/}).click();
  await page.getByLabel('Nombre del Contacto *').fill('María López');
  await page.getByLabel('Celular (10 dígitos) *').fill('+52 614 123 4567');
  assert.equal(await page.getByLabel('Celular (10 dígitos) *').inputValue(), '6141234567');
  await page.getByLabel('Descripción detallada del problema *').fill('Marca error de lámpara al iniciar');
  await page.getByRole('button', {name: 'Crear Ticket'}).click();
  await page.getByRole('heading', {name: 'Lo sumamos al caso abierto'}).waitFor();
  await page.getByText('1O222T64').waitFor();
  const submit = calls.find(c => c.name === 'submit_public_support_case');
  assert.deepEqual(submit.body, {p_support_type: 'Ingeniero', p_serial: 'SN 83400-1902', p_contact_name: 'María López', p_phone: '6141234567', p_description: 'Marca error de lámpara al iniciar', p_confirm_unregistered: false});

  // Client-side checks stop obviously wrong data before calling the database.
  await page.getByRole('button', {name: 'Enviar otro ticket'}).click();
  await page.getByRole('button', {name: /Química/}).click();
  await serial.fill('834001902');
  await page.getByText('Equipo registrado: BA400').waitFor();
  await page.getByLabel('Nombre del Contacto *').fill('Juan Pérez');
  await page.getByLabel('Celular (10 dígitos) *').fill('5555555555');
  await page.getByLabel('Descripción detallada del problema *').fill('Los controles salen altos');
  const submits = () => calls.filter(c => c.name === 'submit_public_support_case').length;
  await page.getByRole('button', {name: 'Crear Ticket'}).click();
  await page.getByRole('alert').filter({hasText: 'celular válido'}).waitFor();
  assert.equal(submits(), 1);

  // The database rejects the serial (e.g. removed meanwhile): the form stays, the help opens.
  submitReply = {status: 'serie', motivo: 'no_encontrado', modelo: 'BA400', mensaje: 'Por favor ingresa el número de serie correcto del equipo.'};
  await page.getByLabel('Celular (10 dígitos) *').fill('6147654321');
  await page.getByRole('button', {name: 'Crear Ticket'}).click();
  await page.getByRole('alert').filter({hasText: 'No encontramos ese número de serie'}).waitFor();
  await page.locator('.serial-help').waitFor();
  assert.equal(submits(), 2);
  assert.equal(await page.getByRole('heading', {name: /Ticket enviado|Lo sumamos/}).count(), 0);

  // Real equipment not registered yet: blocked until the customer confirms the serial, then sent and acknowledged.
  submitReply = {status: 'creado', numero_caso: '1O223T62', modelo: 'A25', registrado: false};
  await serial.fill('8310151004');
  await page.getByText('No encontramos ese número de serie entre los equipos registrados').waitFor();
  const confirm = page.getByLabel('Revisé la etiqueta y el número es correcto; mi equipo no aparece registrado.');
  await page.getByRole('button', {name: 'Crear Ticket'}).click();
  await page.getByRole('alert').filter({hasText: 'si es correcto, confírmalo'}).waitFor();
  assert.equal(submits(), 2, 'not sent before the confirmation');
  await confirm.check();
  await page.getByText('lo validaremos al atenderte').waitFor();
  assert.equal(await serial.getAttribute('aria-invalid'), 'false');
  await page.getByRole('button', {name: 'Crear Ticket'}).click();
  await page.getByRole('heading', {name: 'Ticket enviado exitosamente'}).waitFor();
  await page.getByText('Tu equipo todavía no aparece en nuestro registro').waitFor();
  assert.equal(calls.filter(c => c.name === 'submit_public_support_case').at(-1).body.p_confirm_unregistered, true);
  assert.equal(submits(), 3);
  await page.getByRole('button', {name: 'Enviar otro ticket'}).click();
  await page.getByRole('button', {name: /Química/}).click();
  await serial.fill('834001902');
  await page.getByText('Equipo registrado: BA400').waitFor();
  assert.equal(await page.locator('.serial-confirm').count(), 0, 'no confirmation for a registered serial');

  // Bot trap: a filled hidden field never reaches the database.
  await page.locator('input[name=sitio_web]').fill('http://spam.example', {force: true});
  await page.getByRole('button', {name: 'Crear Ticket'}).click();
  await page.getByRole('heading', {name: 'Ticket enviado exitosamente'}).waitFor();
  assert.equal(submits(), 3);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no horizontal scroll at phone width');
  console.log('PASS: format error with help photos, unknown and registered serial, grouped case, server serial rejection, client checks, unregistered serial confirmation and bot trap');
} finally {
  await browser.close();
}
