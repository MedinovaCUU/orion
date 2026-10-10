import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-features=LocalNetworkAccessChecks'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } });
const errors = [];
page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
const alarm = { id: 2, codigo_error: '21', descripcion_error: 'Instruction Aborted by an Error', tipo_mensaje: 'fatal', detected_at: '2026-10-09T05:00:01Z' };
const prior = { id: 1, codigo_error: '213', descripcion_error: 'DR2 Collision Detected', detected_at: '2026-10-09T05:00:00Z' };
await page.route('**/antecedent-test', route => route.fulfill({ contentType: 'text/html', body: `<html><body style="margin:0;background:#031321"><div id="root"></div><script type="module">
import RefreshRuntime from '/orion/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;
const reactModule = await import('/orion/node_modules/.vite/deps/react.js');
const React = reactModule.default || reactModule;
const client = await import('/orion/node_modules/.vite/deps/react-dom_client.js');
const {createRoot} = client.default || client;
const {default:Panel} = await import('/orion/src/modules/equipment-monitoring/Ba400AlarmPanel.tsx');
const root = createRoot(document.getElementById('root'));
window.renderPanel = (active=true) => root.render(React.createElement(Panel,{equipment:{id:'test',serial:'834001902',clientName:'Prueba',status:active?'fatal':'ok',city:null,normalizedState:null,hasSupabaseSignal:true,lastErrorAt:null,currentErrors:active?[${JSON.stringify(alarm)}]:[],alarmHistory:[${JSON.stringify(prior)}],errorSource:'current'},showCodes:true,refreshedAt:null,onClose:()=>{}}));
window.renderPanel();
</script></body></html>` }));
try {
  await page.goto(`${process.env.MONITOR_TEST_ORIGIN || 'http://127.0.0.1:5173'}/orion/antecedent-test`);
  await page.waitForSelector('[data-testid="ba400-canvas"][data-state="ready"]', { timeout: 120000 });
  const priorRow = page.locator('.alarm-spatial__event .alarm-antecedents__entry');
  assert.equal(await priorRow.getAttribute('data-tone'), 'fatal');
  assert.equal(await priorRow.getAttribute('data-antecedent-parts'), 'brazo_r2');
  // Sobre cristal oscuro el rojo tinta no se lee: el antecedente fatal usa #ff6b7a (acordado entre agentes).
  assert.equal(await priorRow.evaluate(el => getComputedStyle(el).color), 'rgb(255, 107, 122)');
  const marker = page.locator('.monitor-alarm-anchor[data-part-id="brazo_r2"]');
  assert.equal(await marker.count(), 1);
  assert.match(await marker.getAttribute('aria-label'), /Antecedente/);
  await page.waitForSelector('.alarm-spatial__connectors path[data-tone="fatal"]');
  assert.equal(await page.locator('.alarm-spatial__event').getAttribute('data-part'), null);
  await marker.dispatchEvent('click');
  assert(await page.getByRole('button', { name: 'Aislar conjunto', exact: true }).isEnabled());
  await page.screenshot({path:'/tmp/orion-antecedent-red.png',fullPage:true});
  await page.evaluate(() => window.renderPanel(false));
  await page.waitForSelector('.monitor-alarm-anchor', {state:'detached'});
  assert.deepEqual(errors, []);
  console.log('PASS: historical DR2 fatal is red, connects to brazo_r2, remains contextual, supports focus and clears with active consequence.');
} finally { await browser.close(); }
