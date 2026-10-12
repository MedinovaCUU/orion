// Alexa panel (Orion web): approvals go through the module's normal path, linking reports the RPC status.
//   ALEXA_PANEL_URL=http://127.0.0.1:5200/orion/tests/fixtures/alexa-panel.html node tests/alexa-panel-browser.test.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const FIXTURE_URL = process.env.ALEXA_PANEL_URL || 'http://127.0.0.1:5200/orion/tests/fixtures/alexa-panel.html';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 375, height: 812 }]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(FIXTURE_URL);
    await page.getByRole('heading', { name: /Por aprobar/ }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Aprobar', exact: true }).count(), 3);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `no horizontal scroll at ${viewport.width}px (overflow ${overflow})`);
    if (viewport.width > 600) {
      // Ticket approval: insert as the user, read the case number, record the decision.
      await page.getByRole('button', { name: 'Aprobar', exact: true }).first().click();
      await page.getByRole('status').filter({ hasText: 'Ticket creado: caso 1O200T61' }).waitFor();
      // Wrong code, then the right one.
      await page.getByLabel('Código de vinculación').fill('654321');
      await page.getByRole('button', { name: 'Vincular', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Código inválido' }).waitFor();
      await page.getByLabel('Código de vinculación').fill('123456');
      await page.getByRole('button', { name: 'Vincular', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'quedó vinculado' }).waitFor();
      await page.getByRole('button', { name: 'Enterado' }).first().click();
      const calls = await page.evaluate(() => window.__alexaCalls.map((c) => (c.op === 'rpc' ? `rpc:${c.fn}` : `insert:${c.table}`)));
      assert.deepEqual(calls.slice(0, 3), ['insert:tickets', 'rpc:get_ticket_creation_receipt', 'rpc:decide_alexa_action']);
      assert.ok(calls.includes('rpc:ack_alexa_alert'));
      const ticket = await page.evaluate(() => window.__alexaCalls.find((c) => c.table === 'tickets').args);
      assert.equal(ticket.asunto, '[Soporte Ingeniero] alarma de temperatura del rotor');
      assert.equal(ticket.numero_serie_equipo, '834000473');
      assert.equal(ticket.user_id, 'tecnico-demo');
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('alexa panel browser test ok');
} finally {
  await browser.close();
}
