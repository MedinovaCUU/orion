import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

// Monta el módulo real en un documento interceptado: no añade rutas de demo a producción.
const origin = process.env.MONITOR_TEST_ORIGIN || 'http://127.0.0.1:5173';
const output = new URL('../../outputs/monitor-hologram/', import.meta.url);
await fs.mkdir(output, { recursive: true });
// Chrome clasifica el HTML interceptado como origen no local; esta excepción solo afecta al navegador de prueba.
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-features=LocalNetworkAccessChecks'] });
const page = await browser.newPage({ viewport: { width: 1540, height: 1100 }, deviceScaleFactor: 1 });
const errors = [], writes = [];
let downloads = 0, resolved = false, reads = 0;
const now = new Date().toISOString();
const first = { id: 'fixture-ba400', numero_serie: '834001902', modelo: 'BA400', pais: 'Mexico', estado: 'Chihuahua', ciudad: 'Chihuahua', municipio: 'Chihuahua', clientes: { razon_social: 'Laboratorio de prueba local' }, supremo_enabled: false };
const second = { ...first, id: 'fixture-ba200', numero_serie: '832001902', modelo: 'BA200' };
const alarms = [
  { codigo_error: '203', descripcion_error: 'DR1 Collision Detected', seccion_error: 'DR1,DR2,DM1', tipo_mensaje: 'fatal' },
  { codigo_error: '301', descripcion_error: 'RR1 Fridge Temperature Alarm', seccion_error: 'RR1, RM1', tipo_mensaje: 'warning' },
  { codigo_error: '9999', descripcion_error: 'Alarma de prueba sin correspondencia física', seccion_error: 'TEST', tipo_mensaje: 'warning' },
  { codigo_error: '70', descripcion_error: 'Main Cover opened while instrument working', seccion_error: 'CPU', tipo_mensaje: 'fatal' },
];
page.on('pageerror', error => { if (errors.length < 10) errors.push(error.stack || error.message); });
page.on('console', message => { if (message.type() === 'error') console.error(message.text().slice(0, 600)); });
page.on('requestfailed', request => console.error('REQUEST FAILED', request.url(), request.failure()?.errorText));
page.on('request', request => { if (request.url().includes('BA400_web.glb')) downloads++; });
await page.routeWebSocket(/supabase/, socket => { socket.onMessage(() => {}); });
await page.route('**/rest/v1/**', async route => {
  const request = route.request();
  if (!['GET', 'OPTIONS'].includes(request.method())) { writes.push(request.url()); return route.abort(); }
  const table = new URL(request.url()).pathname.split('/').at(-1);
  reads++;
  const data = {
    equipos: [first, second],
    v_equipment_map_locations: [first, second].map(item => ({ equipment_id: item.id, geo_latitude: 28.632, geo_longitude: -106.0691, geo_precision: 'city', locality_cache_key: 'chihuahua|chihuahua' })),
    estado_errores_equipo_actual: [first, second].map(item => ({ numero_serie: item.numero_serie, estado_actual: resolved ? 'ok' : 'fatal', tipo_mensaje: resolved ? 'ok' : 'fatal', errores_activos: resolved ? [] : alarms, last_event_at: now, updated_at: now })),
    monitoreo_errores_equipos: alarms.map((alarm, index) => ({ ...alarm, id: index + 1, numero_serie: first.numero_serie, detected_at: now })),
  }[table] || [];
  await route.fulfill({ json: data, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
});
await page.route('**/monitor-test', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#edf4f8;font-family: sans-serif}button{cursor:pointer}</style></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/orion/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;
await import('/orion/tests/fixtures/monitor.tsx');
</script></body></html>` }));
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
  await page.goto(`${origin}/orion/monitor-test`);
  await page.locator('.equipment-monitor__lists-grid button').filter({ hasText: '834001902' }).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  assert.equal(downloads, 1, 'Precarga silenciosa al entrar al módulo');
  assert.equal(await page.locator('[data-testid="ba400-canvas"]').count(), 0);
  await page.locator('.equipment-monitor__lists-grid button').filter({ hasText: '834001902' }).first().click();
  await ready();
  assert.equal(await page.getByRole('button', { name: 'Ocultar cubiertas', exact: true }).count(), 1);
  assert(await page.locator('.equipment-monitor__spatial-workspace.is-inspecting > .equipment-globe').isVisible());
  assert.equal(await cards.count(), 4);
  assert.equal(await page.locator('.monitor-alarm-anchor').count(), 3);
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
  assert.equal(await page.locator('.alarm-spatial__connectors path').count(), 3);
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
  await cards.filter({ hasText: 'Collision' }).click();
  await page.waitForTimeout(850);
  assert.match(await page.locator('.alarm-spatial__inspector').innerText(), /Brazo.*R1/);
  await capture('02-alarma-r1');
  await page.locator('.alarm-spatial__stage').hover();
  await page.getByRole('button', { name: 'Aislar conjunto', exact: true }).click();
  await page.waitForTimeout(850); await capture('03-aislamiento');
  await cards.filter({ hasText: 'sin correspondencia' }).click();
  assert.match(await page.locator('.alarm-spatial__inspector').innerText(), /Sin ubicación 3D definida/);
  assert(await page.getByRole('button', { name: 'Aislar conjunto', exact: true }).isDisabled());
  assert.equal(downloads, 1);
  await page.locator('.alarm-spatial__stage').hover();
  await page.getByRole('button', { name: 'Restablecer vista', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(850); await capture('04-movil');
  assert(await page.locator('.alarm-spatial').evaluate(element => element.getBoundingClientRect().width <= innerWidth), 'Panel dentro del ancho de pantalla móvil');
  assert(await page.locator('.alarm-spatial').evaluate(element => element.scrollWidth <= element.clientWidth + 1), 'Sin overflow móvil');
  await page.setViewportSize({ width: 1540, height: 1100 });
  // El sondeo existente sigue funcionando mientras se inspecciona el modelo.
  const previousReads = reads; resolved = true;
  await page.waitForFunction(() => document.querySelector('.alarm-spatial__empty')?.textContent.includes('Sin alarmas activas'), null, { timeout: 35000 });
  assert(reads > previousReads);
  assert.equal(await page.locator('.monitor-alarm-anchor').count(), 0);
  await capture('05-alarmas-resueltas');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.alarm-spatial').count(), 0);
  assert.equal(await page.locator('[data-testid="ba400-canvas"]').count(), 0);
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  // La lista de prioridad permite abrir un BA400 sin alarmas en un clic.
  await page.locator('.equipment-priority button').filter({ hasText: '834001902' }).click();
  await ready();
  assert.match(await page.locator('.alarm-spatial__empty').innerText(), /Sin alarmas activas/);
  await page.keyboard.press('Escape');
  // BA200 no debe utilizar la geometría BA400.
  resolved = false;
  await page.waitForTimeout(31000);
  await page.locator('.equipment-monitor__lists-grid button').filter({ hasText: '832001902' }).first().click();
  assert.equal(await page.locator('.alarm-spatial').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Explorar alarmas en 3D' }).count(), 0);
  assert.equal(writes.length, 0); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'PASS', checks: ['selección explícita en monitoreo', 'precarga silenciosa única', 'mapa integrado', 'cubiertas visibles por defecto', 'modelo holográfico', 'alarmas y marcadores', 'foco e aislamiento', 'desconocidos sin asociación', 'móvil sin desbordamiento', 'actualización y limpieza al resolver', 'Escape y desmontaje', 'BA200 sin modelo BA400', 'sin escrituras'], downloads, reads, errors }, null, 2));
} catch (error) { await capture('failure'); console.error(errors); throw error; }
finally { await browser.close(); }
