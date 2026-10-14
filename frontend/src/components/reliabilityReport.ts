// "Evaluación de la confiabilidad de los analizadores reacondicionados": printable technical report (browser print → PDF)
// built with textContent only (database text never becomes HTML) and charts rendered off-screen to PNG.
import { echarts, type ChartOption } from './kpiEcharts';
import { brandFontFaceCss, BRAND_FONT_STACK, waitForBrandFonts } from '../config/brandFonts';
import { cohortLabels, formatDay, levelLabels, type Analysis, type LabModel } from './reliabilityAnalytics';
import { COLORS, doseScatterOption, forestOption, kmOption, paretoOption } from './reliabilityCharts';

function renderPng(option: ChartOption, width = 900, height = 380) {
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;font-family:${BRAND_FONT_STACK}`;
  document.body.append(host);
  const chart = echarts.init(host, undefined, { renderer: 'canvas', width, height });
  chart.setOption({ animation: false, textStyle: { fontFamily: BRAND_FONT_STACK }, ...option });
  const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' });
  chart.dispose(); host.remove();
  return url;
}
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(0)} %`);
const num = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d }));

export async function openReliabilityReport(a: Analysis, model: LabModel, generatedAt: string) {
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('Permite las ventanas emergentes para generar el informe.');
  const doc = popup.document; doc.title = 'ORION · Evaluación de la confiabilidad de los analizadores reacondicionados';
  const style = doc.createElement('style');
  style.textContent = `${brandFontFaceCss()}@page{size:A4;margin:14mm}body{font:10.5px/1.5 ${BRAND_FONT_STACK};color:#14313d;margin:0}h1{font-size:22px;margin:0 0 4px;letter-spacing:-.3px}
h2{font-size:14px;margin:22px 0 6px;padding-top:8px;border-top:2px solid #F12535;break-after:avoid}h3{font-size:12px;margin:12px 0 4px}p{margin:4px 0}
table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #d3dee4;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eef3f6}tr{break-inside:avoid}
img{width:100%;max-width:820px;display:block;margin:6px 0;break-inside:avoid}.eyebrow{font-size:9px;letter-spacing:.14em;color:#5a7280}.level{display:inline-block;padding:1px 7px;border:1px solid #9fb2bc;border-radius:999px;font-size:9px;font-weight:600}
.note{color:#5a7280;font-size:9.5px}.cover{padding:10px 0 8px;border-bottom:1px solid #d3dee4;margin-bottom:8px}`;
  doc.head.append(style);
  const el = (tag: string, text = '', parent: HTMLElement = doc.body, className?: string) => { const node = doc.createElement(tag); node.textContent = text; if (className) node.className = className; parent.append(node); return node; };
  const table = (head: string[], rows: Array<Array<string | number>>, parent: HTMLElement = doc.body) => {
    const t = el('table', '', parent); const tr = el('tr', '', el('thead', '', t)); head.forEach(h => el('th', h, tr));
    const body = el('tbody', '', t); rows.forEach(r => { const row = el('tr', '', body); r.forEach(v => el('td', String(v), row)); });
  };
  const image = (option: ChartOption, alt: string, h = 360) => { const img = doc.createElement('img'); img.src = renderPng(option, 900, h); img.alt = alt; doc.body.append(img); };
  const s = a.settings;

  const cover = el('div', '', doc.body, 'cover');
  el('div', 'ORION · CONFIABILIDAD · INFORME TÉCNICO', cover, 'eyebrow');
  el('h1', 'Evaluación de la confiabilidad de los analizadores clínicos reacondicionados', cover);
  el('p', `Generado ${new Date().toLocaleString('es-MX')} con datos al ${new Date(generatedAt).toLocaleString('es-MX')} · Modelos: ${s.platforms?.join(', ') || 'todos'} · Horizonte ${s.horizon} días · Falla = ${s.failureKinds.join(' o ')} · Umbral de piezas ${s.partsThreshold}`, cover, 'note');

  el('h2', '1. Objetivo del análisis');
  el('p', 'Determinar con datos verificables si los analizadores reacondicionados fallan más que los de primera instalación, cuánto tardan en presentar la primera falla, qué componentes fallan después de la entrega y si la cantidad de piezas sustituidas durante el reacondicionamiento se asocia con la confiabilidad posterior. El análisis no parte de que los reacondicionamientos sean deficientes: busca comprobar si lo son.');
  el('h2', '2. Población estudiada');
  table(['Grupo', 'Equipos con seguimiento', 'Fallas', 'Equipos-año'], (['reacondicionado', 'primera_instalacion', 'reinstalado'] as const).map(c => { const g = c === 'reacondicionado' ? a.recon : c === 'primera_instalacion' ? a.first : a.reinstall; return [cohortLabels[c], g.units, g.failures, num(g.exposureYears, 1)]; }));
  el('p', `${a.quality.episodes} episodios de reacondicionamiento en el filtro; ${a.quality.delivered} con entrega confirmada (${a.quality.byInstall} por reporte de instalación, ${a.quality.byAssignment} por fecha de asignación); ${a.quality.notDelivered} sin entrega en 365 días quedaron fuera del seguimiento.`, doc.body, 'note');
  el('h2', '3. Periodo de observación');
  el('p', `Historial estructurado desde ${a.quality.firstYearStart} (comparación con primera instalación). Cada equipo se sigue desde su entrega hasta ${s.horizon} días, el corte, el retiro o el siguiente reacondicionamiento.`);
  el('h2', '4. Fuentes de información');
  el('p', 'Historial de servicios de campo de Orion (incluye la migración de Biosisa) con sus refacciones, reportes de servicio de Orion, tickets de soporte con número de serie, catálogo de equipos y registros estructurados del módulo de confiabilidad. No se usan datos de pacientes ni resultados clínicos.');
  el('h2', '5. Metodología');
  el('p', 'Kaplan–Meier con límites log(−log) y censura a la derecha; log-rank simple y estratificado por modelo; regresión de Cox (empates de Efron) estratificada por modelo; tasas por equipo-año calendario con intervalos exactos de Poisson; razón de tasas de Mantel–Haenszel por modelo; bootstrap por equipo y permutación dentro de cada modelo para robustez frente a fallas repetidas; proporciones con intervalo de Wilson, diferencia con intervalo de Newcombe y prueba exacta de Fisher; Weibull por máxima verosimilitud con intervalo de razón de verosimilitudes; función media acumulada (Nelson). Las fórmulas se verificaron contra lifelines y scipy.');
  el('h2', '6. Indicadores');
  const e90 = a.early.find(w => w.days === 90) || a.early[a.early.length - 1];
  table(['Indicador', 'Reacondicionados', 'Primera instalación'], [
    ['Correctivos por equipo-año (calendario)', `${num(a.recon.rate?.rate)} (${num(a.recon.rate?.low)}–${num(a.recon.rate?.high)})`, `${num(a.first.rate?.rate)} (${num(a.first.rate?.low)}–${num(a.first.rate?.high)})`],
    [`Falla en los primeros ${e90?.days ?? '—'} días`, e90?.recon ? `${e90.recon.k}/${e90.recon.n} · ${pct(e90.recon.p)} (${pct(e90.recon.low)}–${pct(e90.recon.high)})` : '—', e90?.first ? `${e90.first.k}/${e90.first.n} · ${pct(e90.first.p)} (${pct(e90.first.low)}–${pct(e90.first.high)})` : '—'],
    ['Tiempo calendario entre fallas (días)', num(a.recon.mtbfDays?.value, 0), num(a.first.mtbfDays?.value, 0)],
    ['Reintervención ≤ 30 días', a.repeat.recon ? `${pct(a.repeat.recon.p)} (${a.repeat.recon.k}/${a.repeat.recon.n})` : '—', a.repeat.first ? `${pct(a.repeat.first.p)} (${a.repeat.first.k}/${a.repeat.first.n})` : '—'],
    ['Tickets de soporte por equipo-año', num(a.recon.tickets?.rate), num(a.first.tickets?.rate)],
  ]);
  el('h2', '7. Visualizaciones');
  image(kmOption([a.recon, a.first].map(g => ({ name: cohortLabels[g.cohort], color: COLORS[g.cohort], curve: g.km })), s.horizon), 'Curvas de supervivencia');
  el('p', 'Figura 1. Probabilidad de seguir sin falla después de la entrega (Kaplan–Meier, banda de 95 %).', doc.body, 'note');
  image(doseScatterOption(a.points, s.partsThreshold, 'rate'), 'Piezas frente a confiabilidad');
  el('p', 'Figura 2. Cada punto es un reacondicionamiento: piezas sustituidas frente a correctivos por equipo-año (equipos con ≥ 90 días observados).', doc.body, 'note');
  const rows = [a.dose.low, a.dose.high].filter(g => g.rate).map((g, i) => ({ label: `${g.label} · ${g.follow.length} eq.`, value: g.rate!.rate, low: g.rate!.low, high: g.rate!.high, color: i ? COLORS.high : COLORS.low }));
  if (rows.length) { image(forestOption(rows, { axisName: 'Correctivos por equipo-año (IC 95 %)' }), 'Tasas por grupo de piezas', 180); el('p', 'Figura 3. Tasa de correctivos por grupo de piezas, con intervalo exacto.', doc.body, 'note'); }
  if (a.components.length) { image(paretoOption(a.components), 'Pareto de componentes', 320); el('p', 'Figura 4. Piezas sustituidas después de la entrega: participación y acumulado.', doc.body, 'note'); }
  el('h2', '8. Resultados estadísticos');
  table(['Pregunta', 'Nivel de evidencia', 'Resultado'], a.findings.map(f => [f.question, levelLabels[f.level], f.answer]));
  el('h2', '9. Interpretación');
  for (const f of a.findings.filter(x => x.detail)) el('p', `${f.question} ${f.detail}`);
  el('h2', '10. Limitaciones');
  ['Cohortes no aleatorias: reacondicionados y nuevos van a clientes y usos distintos; el ajuste solo controla el modelo.', 'Correctivos atendidos por distribuidores o terceros pueden no estar registrados: la tasa observada es un mínimo.',
    'La inversión se mide en piezas registradas, no en pesos; no hay costos, indisponibilidad, horas de operación ni recomendaciones negadas registradas antes de este módulo.',
    'El historial estructurado comienza en 2023.', 'Las comparaciones por modelo y componente son exploratorias.'].forEach(t => el('p', `• ${t}`));
  el('h2', '11. Conclusiones');
  const tasa = a.findings.find(f => f.id === 'tasa'); const piezas = a.findings.find(f => f.id === 'piezas');
  el('p', `Reacondicionados frente a primera instalación: ${tasa ? levelLabels[tasa.level].toLowerCase() : 'sin evaluación'}. Piezas sustituidas frente a confiabilidad posterior: ${piezas ? levelLabels[piezas.level].toLowerCase() : 'sin evaluación'}.`);
  el('p', 'Una conclusión de «evidencia insuficiente» o «indicio» no equivale a «no hay problema»: indica que con los datos registrados no puede afirmarse ni descartarse con la precisión necesaria.', doc.body, 'note');
  el('h2', '12. Recomendaciones');
  ['Registrar en cada reacondicionamiento la condición de cada componente, la recomendación del ingeniero y la decisión de autorización con su motivo (sin ese registro, una pieza negada no deja rastro).',
    'Registrar la matriz de liberación con criterios tomados de la documentación vigente del fabricante y el «Refurbish Register» de cada modelo como kit oficial.',
    'Capturar costos comprobados (piezas, viáticos, traslados) de los correctivos posteriores para cuantificar el costo de la no calidad.',
    'Documentar en cada falla posterior su relación técnica con las decisiones del reacondicionamiento, con evidencia.',
    'Repetir este análisis trimestralmente; la precisión aumenta con cada equipo seguido 365 días.'].forEach(t => el('p', `• ${t}`));
  el('h2', '13. Anexo de trazabilidad de evidencias');
  table(['Equipo', 'Reacondicionamiento', 'Reportes', 'Piezas', 'Entrega', 'Días observados', 'Correctivos posteriores'], a.recon.follow.map(f => {
    const e = f.unit.episode!;
    return [`${e.platform} · ${e.serial}`, `${formatDay(e.start)}${e.caveats.length ? ` · ${e.caveats.join(', ')}` : ''}`, e.records.map(r => r.ref).join(', ') || 'Registro de Orion', e.partsQty,
      `${formatDay(f.unit.t0)} (${f.unit.t0Source === 'instalacion' ? 'instalación' : 'asignación'})`, f.fu, f.failures.map(x => `${x.service.ref} (día ${x.offset})`).join(', ') || 'Ninguno'];
  }));
  el('p', `Episodios sin entrega confirmada (excluidos): ${model.episodes.filter(e => e.delivery === null && (!s.platforms || s.platforms.includes(e.platform || ''))).map(e => `${e.platform} ${e.serial} (${formatDay(e.start)})`).join('; ') || 'ninguno'}.`, doc.body, 'note');
  await waitForBrandFonts(doc);
  popup.focus(); popup.print();
}
