// Datos simulados del módulo de monitoreo para pruebas de navegador y capturas visuales.
// Monta el módulo real en un documento interceptado: no añade rutas de demo a producción.

// extended: añade un BA400 sin alarmas (834001903) y un equipo sin georreferencia (solo capturas visuales);
// con extended=false las respuestas son idénticas a las que espera tests/ba400-monitor-browser.test.mjs.
export function createMonitorMock({ now = new Date().toISOString(), extended = false } = {}) {
  const state = { resolved: false, reads: 0, writes: [], errors: [], downloads: 0 };
  const first = { id: 'fixture-ba400', numero_serie: '834001902', modelo: 'BA400', pais: 'Mexico', estado: 'Chihuahua', ciudad: 'Chihuahua', municipio: 'Chihuahua', clientes: { razon_social: 'Laboratorio de prueba local' }, supremo_enabled: false };
  const second = { ...first, id: 'fixture-ba200', numero_serie: '832001902', modelo: 'BA200' };
  // BA400 en la misma ciudad con estado vigente 'ok' y lista de errores vacía: abre el explorador sin alarmas.
  const quiet = { ...first, id: 'fixture-ba400-quiet', numero_serie: '834001903', clientes: { razon_social: 'Laboratorio sin alarmas' } };
  // Sin fila de geocodificación ni estado reconocible: queda fuera del globo (geoPoint null) pero dentro del riel.
  const unlocated = { id: 'fixture-sin-geo', numero_serie: '851000777', modelo: 'A15', pais: 'Mexico', estado: null, ciudad: null, municipio: null, clientes: { razon_social: 'Laboratorio sin georreferencia' }, supremo_enabled: false };
  const equipments = extended ? [first, second, quiet, unlocated] : [first, second];
  const located = extended ? [first, second, quiet] : [first, second];
  const alarms = [
    { codigo_error: '213', descripcion_error: 'DR2 Collision Detected', seccion_error: 'DR1,DR2,DM1', tipo_mensaje: 'fatal' },
    { codigo_error: '61', descripcion_error: 'ISE Time Out', seccion_error: 'CPU', tipo_mensaje: 'fatal' },
    { codigo_error: '9999', descripcion_error: 'Alarma de prueba sin correspondencia física', seccion_error: 'TEST', tipo_mensaje: 'warning' },
    { codigo_error: '21', descripcion_error: 'Instruction Aborted by an Error', seccion_error: 'CPU', tipo_mensaje: 'fatal' },
  ];
  // Evidencia BPL del monitor: la serie BA400 queda con QC rechazado, calibración y blanco aceptados.
  const bplRow = (overrides) => ({ effective_equipment_serial: first.numero_serie, detected_at: now, bpl_status: 'evidence_observed', missing_data_for_acceptance: null, rule_ids: null, ...overrides });
  const bplRows = [
    bplRow({ id: 1, occurred_at: new Date(Date.now() - 3 * 3600e3).toISOString(), event_type: 'bpl_quality_control_result', bpl_stage: 'quality_control', bpl_status: 'rejected', diagnostic_status: 'quality_control_rejected', test_name: 'GLUCOSE', sample_class: 'CTRL', calibration_control_name: 'CONTROL LEVEL I', calibration_control_lot_number: 'L-10', rule_ids: ['qc_out_of_limits'], payload: { result_value: 140, unit: 'mg/dL', limits: { min: 80, max: 120, target: 100, sd: 5 }, westgard_assessment: { status: 'reject', violated_rules: ['1_3s'] } } }),
    bplRow({ id: 2, occurred_at: new Date(Date.now() - 5 * 3600e3).toISOString(), event_type: 'bpl_calibration_curve', bpl_stage: 'calibration', bpl_status: 'accepted', diagnostic_status: 'calibration_accepted', test_name: 'GLUCOSE', sample_class: 'CALIB', calibration_control_name: 'CAL BIO', calibration_control_lot_number: 'C-77', payload: { calibration_curve: { slope: 1.02, correlation: 0.9995, curve_type: 'LINEAR', points: [{ curve_point: 1, abs_value: 0.01, conc_value: 0 }, { curve_point: 2, abs_value: 0.5, conc_value: 100 }] } } }),
    bplRow({ id: 3, occurred_at: new Date(Date.now() - 6 * 3600e3).toISOString(), event_type: 'bpl_analytical_result', bpl_stage: 'reagent_blank', bpl_status: 'accepted', diagnostic_status: 'blank_accepted', test_name: 'GLUCOSE', sample_class: 'BLANK', payload: { ABSValue: 0.012, BlankAbsorbanceLimit: 0.1 } }),
    bplRow({ id: 4, occurred_at: new Date(Date.now() - 7 * 3600e3).toISOString(), event_type: 'bpl_photometry_blank', bpl_stage: 'instrument_photometry_blank', bpl_status: 'accepted', diagnostic_status: 'photometry_blank_accepted', test_name: null, payload: { '340': 0.001, '405': 0.002 } }),
    bplRow({ id: 5, occurred_at: new Date(Date.now() - 2 * 3600e3).toISOString(), event_type: 'bpl_quality_control_result', bpl_stage: 'quality_control', bpl_status: 'pending', diagnostic_status: 'quality_control_pending', test_name: 'CHOLESTEROL', sample_class: 'CTRL', missing_data_for_acceptance: ['control_lot'], payload: { result_value: 180 } }),
  ];
  // Curvas de reacción: GLUCOSE con tres réplicas (abs2 y dif presentes) y ALT-GPT con una réplica solo abs1.
  const curvePoint = (cycle, base, slope, withAbs2) => {
    const abs1 = Number((base + slope * cycle + Math.sin(cycle / 3) * 0.002).toFixed(4));
    const abs2 = withAbs2 ? Number((base * 0.6 + slope * 0.5 * cycle).toFixed(4)) : null;
    return { cycle, abs1, abs2, dif: withAbs2 ? Number((abs1 - abs2).toFixed(4)) : null, reading_datetime: `2026-10-09 08:${String(10 + cycle).padStart(2, '0')}:00`, readings: [{ main_counts: 120000 - cycle * 300, ref_counts: 140000, baseline_main_light: 150000, baseline_ref_light: 150500, main_dark: 120, ref_dark: 118 }] };
  };
  const curveRow = (id, test, cls, ws, order, rep, hours, withAbs2, base, slope, version = 'screen-abs-v2', detectedAt = now) => bplRow({ id, occurred_at: new Date(Date.now() - hours * 3600e3).toISOString(), detected_at: detectedAt, event_type: 'bpl_reaction_curve', bpl_stage: cls === 'CTRL' ? 'quality_control' : 'calibration', sample_class: cls, sample_type: 'SERUM', test_name: test, payload: { reaction_curve: { work_session_id: ws, order_test_id: order, execution_id: `${order}-${rep}`, replicate_number: rep, result_datetime: '2026-10-09 08:45:00', final_absorbance: Number((base + slope * 30).toFixed(4)), ...(version ? { calculation_version: version } : {}), points: Array.from({ length: 30 }, (_, index) => curvePoint(index + 1, base, slope, withAbs2)) } } });
  const curveRows = [
    curveRow(101, 'GLUCOSE', 'CTRL', 'WS-7', '501', 1, 1, true, 0.12, 0.0105),
    curveRow(102, 'GLUCOSE', 'CTRL', 'WS-7', '501', 2, 1, true, 0.121, 0.0102),
    curveRow(103, 'GLUCOSE', 'CTRL', 'WS-7', '501', 3, 1, true, 0.118, 0.0108),
    curveRow(104, 'ALT-GPT', 'CALIB', 'WS-7', '502', 1, 4, false, 0.9, -0.004),
    curveRow(105, 'GLUCOSE', 'CALIB', 'WS-6', '420', 1, 30, true, 0.1, 0.009),
    // Fila antigua sin calculation_version (fórmula equivocada): debe ignorarse aunque sea la más reciente.
    curveRow(106, 'CHOLESTEROL', 'CTRL', 'WS-7', '503', 1, 0.5, true, -0.05, 0.001, null),
    // Republicación de la réplica 2 de GLUCOSE con detected_at anterior: gana la fila 102, más reciente.
    curveRow(107, 'GLUCOSE', 'CTRL', 'WS-7', '501', 2, 1, true, 0.5, 0.05, 'screen-abs-v2', new Date(Date.now() - 2 * 3600e3).toISOString()),
  ];
  async function install(page) {
    page.on('pageerror', error => { if (state.errors.length < 10) state.errors.push(error.stack || error.message); });
    page.on('console', message => { if (message.type() === 'error') console.error(message.text().slice(0, 600)); });
    page.on('requestfailed', request => console.error('REQUEST FAILED', request.url(), request.failure()?.errorText));
    page.on('request', request => { if (request.url().includes('BA400_web.glb')) state.downloads++; });
    await page.routeWebSocket(/supabase/, socket => { socket.onMessage(() => {}); });
    await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    if (!['GET', 'OPTIONS'].includes(request.method())) { state.writes.push(request.url()); return route.abort(); }
    const table = new URL(request.url()).pathname.split('/').at(-1);
    state.reads++;
    const data = {
      equipos: equipments,
      v_equipment_map_locations: located.map(item => ({ equipment_id: item.id, geo_latitude: 28.632, geo_longitude: -106.0691, geo_precision: 'city', locality_cache_key: 'chihuahua|chihuahua' })),
      estado_errores_equipo_actual: [
        ...[first, second].map(item => ({ numero_serie: item.numero_serie, estado_actual: state.resolved ? 'ok' : 'fatal', tipo_mensaje: state.resolved ? 'ok' : 'fatal', errores_activos: state.resolved ? [] : alarms, last_event_at: now, updated_at: now })),
        ...(extended ? [{ numero_serie: quiet.numero_serie, estado_actual: 'ok', tipo_mensaje: 'ok', errores_activos: [], last_event_at: now, updated_at: now }] : []),
      ],
      monitoreo_errores_equipos: alarms.map((alarm, index) => ({ ...alarm, id: index + 1, numero_serie: first.numero_serie, detected_at: now })),
      ba400_bpl_events: [...bplRows, ...curveRows],
    }[table] || [];
    await route.fulfill({ json: data, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
  });
    await page.route('**/monitor-test', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>*,*::before,*::after{box-sizing:border-box}body{margin:0;background:#edf4f8;font-family: sans-serif}button{cursor:pointer}</style></head><body><div id="root"></div><script type="module">
  import RefreshRuntime from '/orion/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;
  await import('/orion/tests/fixtures/monitor.tsx');
  </script></body></html>` }));
  }

  return { state, now, extended, first, second, quiet, unlocated, alarms, bplRows, curveRows, install };
}
