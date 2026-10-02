import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const server = await createServer({ server: { host: '127.0.0.1', port: 5197, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-features=LocalNetworkAccessChecks'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => { if (errors.length < 5) errors.push(error.stack || error.message); });
  await page.route('**/piece-check', route => route.fulfill({ contentType: 'text/html', body: `<html><body style="margin:0;background:#eef4f5"><div id="root"></div><script type="module">import R from '/orion/@react-refresh';R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import('/orion/tests/fixtures/tracking-pieces.tsx');</script></body></html>` }));
  await page.goto('http://127.0.0.1:5197/orion/piece-check');
  await page.getByText('3 identificados · 1 con entrega individual confirmada').waitFor();
  assert.equal(await page.locator('.tracking-piece').count(), 3);
  await page.getByText('JD014600012808373608', { exact: true }).click();
  assert(await page.getByText('Movimiento asociado a esta pieza').isVisible());
  assert(await page.getByText('La guía figura entregada.', { exact: false }).isVisible());
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: '/tmp/orion-tracking-pieces-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: individual status, partial confirmation, expandable history, mobile overflow, no runtime errors.');
} finally { await browser.close(); await server.close(); }
