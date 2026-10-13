// PowerPoint deck of the general summary in the BioSystems identity: white space, Alliance No.2,
// graphite text and the corporate red for the brand and for what needs attention. Charts are rendered
// from the same analytics as the screen; every number and sentence comes from the summary and the
// ticket rows of the current filters. Loaded on demand (pptxgenjs + ECharts).
import PptxGenJS from 'pptxgenjs';
import { BRAND_FONT_FAMILY, waitForBrandFonts } from '../config/brandFonts';
import { fetchAllKpiRecords } from './serviceKpiApi';
import { hidePointPerson, shownName } from '../config/presentationPrivacy';
import {
  chartsFor, definitions, formatCount, formatDateTime, formatHours, num, qualityLabels, sectionsFor, teamLabels,
  type CardSpec, type KpiSummary,
} from './serviceKpiModel';
import { toPoints, wilson } from './kpiAnalytics';
import {
  arrivalsText, curveText, deckFacts, distributionText, evolutionText, executiveSummary, groupsText, periodLabel, previousLabel, scatterText,
  type SlideText,
} from './kpiDeckNarrative';
import {
  arrivalsChart, BRAND, curveChart, evolutionChart, groupsChart, histogramChart, renderChart, scatterChart, seriesChart,
} from './kpiDeckCharts';

type Filters = Record<string, string | number>;
const hex = (color: string) => color.replace('#', '').toUpperCase();
const C = { red: hex(BRAND.red), ink: hex(BRAND.ink), graphite: hex(BRAND.graphite), slate: hex(BRAND.slate), grey: hex(BRAND.grey), light: hex(BRAND.light), white: 'FFFFFF' };
const FONT = BRAND_FONT_FAMILY;
const W = 13.333; const M = 0.6;
const WORDMARK_RATIO = 1800 / 323;
const TAGLINE = 'human - centred biotech';
const WEB = 'www.biosystems.global';

const asData = (url: string) => url.replace(/^data:/, '');
async function loadImage(path: string) {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!response.ok) throw new Error(`No se pudo cargar ${path}`);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(asData(String(reader.result)));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export interface DeckInput {
  summary: KpiSummary; filters: Filters; criteria: Array<[string, string]>;
  onProgress?: (message: string) => void;
}

export async function buildServiceDeck({ summary, filters, criteria, onProgress }: DeckInput) {
  const step = (message: string) => onProgress?.(message);
  step('Cargando tickets del periodo…');
  const [records, red, white] = await Promise.all([
    fetchAllKpiRecords({ dataset: 'tickets', filters, match: { relevant: true }, search: '', sort: 'opened_at', desc: false }),
    loadImage('bios-brand/BioS_wordmark_red.png'), loadImage('bios-brand/BioS_wordmark_white.png'),
    waitForBrandFonts(document, 4000),
  ]);
  await Promise.all(['400', '500', '600'].map(weight => document.fonts.load(`${weight} 16px "${FONT}"`).catch(() => [])));
  const points = toPoints(records.rows).map(hidePointPerson);
  const facts = deckFacts(summary, points);
  const cutAt = Date.parse(summary.period.cut_at);
  const period = periodLabel(summary);

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'ORION · BioSystems';
  pptx.company = 'BioSystems';
  pptx.title = `Indicadores de servicio · ${period}`;
  pptx.subject = 'Resumen general de servicio técnico';
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT };

  const wordmark = (data: string, x: number, y: number, w: number) => ({ image: { data, x, y, w, h: w / WORDMARK_RATIO } });
  pptx.defineSlideMaster({
    title: 'BIOS_CONTENT', background: { color: C.white },
    objects: [
      wordmark(red, M, 6.93, 1.2),
      { text: { text: TAGLINE, options: { x: W - M - 3, y: 6.86, w: 3, h: 0.32, fontFace: FONT, fontSize: 9, color: C.red, align: 'right', valign: 'middle', margin: 0 } } },
      { text: { text: WEB, options: { x: W - M - 3, y: 0.28, w: 3, h: 0.28, fontFace: FONT, fontSize: 9, color: C.red, align: 'right', valign: 'middle', margin: 0 } } },
    ],
    slideNumber: { x: W / 2 - 0.3, y: 6.86, w: 0.6, h: 0.32, fontFace: FONT, fontSize: 9, color: C.slate, align: 'center' },
  });
  pptx.defineSlideMaster({
    title: 'BIOS_SECTION', background: { color: C.red },
    objects: [
      wordmark(white, M, 6.93, 1.2),
      { text: { text: TAGLINE, options: { x: W - M - 3, y: 6.86, w: 3, h: 0.32, fontFace: FONT, fontSize: 9, color: C.white, align: 'right', valign: 'middle', margin: 0 } } },
    ],
  });

  const t = (slide: PptxGenJS.Slide, value: string | PptxGenJS.TextProps[], options: PptxGenJS.TextPropsOptions) =>
    slide.addText(value, { fontFace: FONT, color: C.ink, margin: 0, valign: 'top', ...options });
  const header = (slide: PptxGenJS.Slide, kicker: string, title: string) => {
    t(slide, kicker.toUpperCase(), { x: M, y: 0.5, w: 8.5, h: 0.3, fontSize: 10, color: C.red, charSpacing: 1.5, bold: true });
    t(slide, title, { x: M, y: 0.82, w: W - 2 * M, h: 0.75, fontSize: 25, color: C.ink, valign: 'top', fit: 'shrink' });
  };
  const source = (slide: PptxGenJS.Slide, value: string) =>
    t(slide, value, { x: M, y: 6.5, w: W - 2 * M, h: 0.26, fontSize: 8, color: C.slate });
  const bullets = (items: string[], size: number, color: string): PptxGenJS.TextProps[] => items.map(item => ({
    text: item, options: { bullet: { code: '25AA', indent: 13 }, fontSize: size, color, paraSpaceAfter: 6, breakLine: true },
  }));

  // ── 1 · Cover ─────────────────────────────────────────────────────────────────────────────
  step('Diseñando portada…');
  const cover = pptx.addSlide();
  cover.background = { color: C.white };
  t(cover, WEB, { x: W - M - 3, y: 0.28, w: 3, h: 0.28, fontSize: 9, color: C.red, align: 'right' });
  cover.addShape(pptx.ShapeType.rect, { x: M + 0.2, y: 1.72, w: 0.55, h: 0.06, fill: { color: C.red }, line: { color: C.red, width: 0 } });
  t(cover, 'ORION · SERVICIO TÉCNICO', { x: M + 0.2, y: 1.95, w: 8, h: 0.3, fontSize: 11, color: C.red, charSpacing: 2, bold: true });
  t(cover, 'Indicadores de servicio', { x: M + 0.2, y: 2.35, w: 11, h: 1.0, fontSize: 48, color: C.ink });
  t(cover, 'Resumen general', { x: M + 0.2, y: 3.35, w: 11, h: 0.6, fontSize: 28, color: C.red });
  t(cover, [
    { text: period, options: { fontSize: 15, color: C.graphite, breakLine: true } },
    { text: `Comparado con ${previousLabel(summary)}`, options: { fontSize: 11, color: C.slate, breakLine: true } },
    { text: `Pendientes al ${formatDateTime(summary.period.cut_at)} · zona horaria ${summary.period.timezone}`, options: { fontSize: 11, color: C.slate } },
  ], { x: M + 0.2, y: 4.15, w: 11, h: 1.0, paraSpaceAfter: 4 });
  const narrowed = criteria.filter(([key, value]) => !['Vista', 'Periodo', 'Agrupación', 'Ventana de reincidencia'].includes(key) && !/^Tod[oa]s$/.test(value));
  if (narrowed.length) t(cover, `Filtros: ${narrowed.map(([key, value]) => `${key}: ${value}`).join(' · ')}`, { x: M + 0.2, y: 5.2, w: 11, h: 0.3, fontSize: 10, color: C.slate });
  cover.addImage(wordmark(red, M + 0.2, 6.15, 3.2).image);
  t(cover, TAGLINE, { x: W - M - 4, y: 6.45, w: 4, h: 0.35, fontSize: 13, color: C.red, align: 'right' });

  // ── 2 · Executive summary ─────────────────────────────────────────────────────────────────
  step('Redactando el resumen ejecutivo…');
  const sections = sectionsFor('general');
  const card = (sectionId: string, cardId: string) => sections.find(section => section.id === sectionId)?.cards.find(spec => spec.id === cardId);
  const tiles = (slide: PptxGenJS.Slide, specs: CardSpec[], y: number, h: number) => {
    const width = (W - 2 * M) / specs.length;
    specs.forEach((spec, index) => {
      const value = spec.read(summary.current); const change = spec.compare(summary.current, summary.previous);
      const x = M + index * width;
      if (index) slide.addShape(pptx.ShapeType.line, { x, y: y + 0.05, w: 0, h: h - 0.1, line: { color: C.light, width: 1 } });
      const alarm = spec.tone === 'danger' && value.state === 'ok' && change?.tone === 'bad';
      t(slide, spec.label, { x: x + 0.15, y, w: width - 0.3, h: 0.3, fontSize: 10.5, color: C.slate });
      t(slide, value.value, { x: x + 0.15, y: y + 0.32, w: width - 0.3, h: 0.62, fontSize: value.state === 'na' || value.state === 'missing' ? 20 : 30, color: alarm ? C.red : C.ink, fit: 'shrink' });
      t(slide, value.detail, { x: x + 0.15, y: y + 0.98, w: width - 0.3, h: h - 1.35, fontSize: 9, color: C.slate, fit: 'shrink' });
      if (change) t(slide, change.text, { x: x + 0.15, y: y + h - 0.36, w: width - 0.3, h: 0.32, fontSize: 9, color: change.tone === 'bad' ? C.red : change.tone === 'good' ? C.ink : C.slate, fit: 'shrink' });
    });
  };
  const summarySlide = pptx.addSlide({ masterName: 'BIOS_CONTENT' });
  header(summarySlide, 'Resumen ejecutivo', 'Lo más relevante del periodo');
  tiles(summarySlide, ['opened', 'closed', 'sla', 'late', 'resolution', 'pending'].map(id => card('tickets', id)).filter((spec): spec is CardSpec => Boolean(spec)), 1.75, 1.95);
  summarySlide.addShape(pptx.ShapeType.line, { x: M, y: 3.95, w: W - 2 * M, h: 0, line: { color: C.light, width: 1 } });
  t(summarySlide, 'EN SÍNTESIS', { x: M, y: 4.15, w: 4, h: 0.3, fontSize: 10, color: C.red, charSpacing: 1.5, bold: true });
  const brief = executiveSummary(summary, facts);
  t(summarySlide, bullets(brief, 13, C.ink), { x: M, y: 4.5, w: W - 2 * M, h: 1.95, valign: 'top', fit: 'shrink' });
  summarySlide.addNotes(['Resumen ejecutivo.', ...brief].join('\n'));

  // ── Section dividers ──────────────────────────────────────────────────────────────────────
  const section = (number: string, title: string, subtitle: string) => {
    const slide = pptx.addSlide({ masterName: 'BIOS_SECTION' });
    t(slide, number, { x: M + 0.2, y: 1.6, w: 3, h: 1.2, fontSize: 60, color: C.white });
    slide.addShape(pptx.ShapeType.rect, { x: M + 0.25, y: 3.0, w: 0.55, h: 0.06, fill: { color: C.white }, line: { color: C.white, width: 0 } });
    t(slide, title, { x: M + 0.2, y: 3.25, w: 11.5, h: 0.9, fontSize: 40, color: C.white });
    t(slide, subtitle, { x: M + 0.2, y: 4.2, w: 11.5, h: 0.5, fontSize: 16, color: C.white });
  };

  // ── Chart slides ──────────────────────────────────────────────────────────────────────────
  const chartSlide = async (text: SlideText, option: Parameters<typeof renderChart>[0], label: string) => {
    step(`Dibujando «${label}»…`);
    const image = await renderChart(option, 8.35, 4.75);
    const slide = pptx.addSlide({ masterName: 'BIOS_CONTENT' });
    header(slide, text.kicker, text.headline);
    slide.addImage({ data: asData(image), x: M, y: 1.62, w: 8.35, h: 4.75, altText: label });
    const x = M + 8.75; const w = W - M - x;
    slide.addShape(pptx.ShapeType.line, { x: x - 0.22, y: 1.7, w: 0, h: 4.6, line: { color: C.light, width: 1 } });
    t(slide, 'LO QUE MUESTRA', { x, y: 1.7, w, h: 0.28, fontSize: 9.5, color: C.red, charSpacing: 1.5, bold: true });
    t(slide, bullets(text.shows.length ? text.shows : ['Sin datos suficientes en el periodo con estos filtros.'], 11.5, C.ink), { x, y: 2.02, w, h: 2.45, fit: 'shrink' });
    t(slide, 'CÓMO LEERLA', { x, y: 4.6, w, h: 0.28, fontSize: 9.5, color: C.slate, charSpacing: 1.5, bold: true });
    t(slide, bullets(text.howTo, 9.5, C.slate), { x, y: 4.92, w, h: 1.5, fit: 'shrink' });
    source(slide, text.source);
    slide.addNotes([text.headline, '', 'Lo que muestra:', ...text.shows, '', 'Cómo leerla:', ...text.howTo].join('\n'));
  };

  section('01', 'Cumplimiento y tiempos', 'Volumen, plazo comprometido y tiempo de cierre de los tickets de soporte');
  await chartSlide(evolutionText(summary, facts), evolutionChart(summary, facts.minSample), 'Evolución del volumen y de los cierres fuera del plazo');
  await chartSlide(curveText(facts), curveChart(points, cutAt), 'Curva de cierre');
  await chartSlide(distributionText(facts), histogramChart(facts), 'Distribución del tiempo de cierre');
  await chartSlide(scatterText(facts), scatterChart(points), 'Mapa de cierres');
  await chartSlide(arrivalsText(summary, facts), arrivalsChart(points, summary.period.timezone || 'America/Chihuahua'), 'Cuándo llegan los tickets');
  await chartSlide(groupsText(facts), groupsChart(facts), 'Cumplimiento del plazo por responsable');

  // ── 02 · Service quality ──────────────────────────────────────────────────────────────────
  step('Preparando calidad del servicio…');
  section('02', 'Calidad del servicio', 'Reaperturas, resolución en primera visita, reincidencia y satisfacción');
  const surveys = num(summary.quality.surveys_answered_total) !== 0;
  const qualitySpecs = (sections.find(item => item.id === 'calidad')?.cards || []).filter(spec => spec.id !== 'csat' || surveys);
  const qualitySlide = pptx.addSlide({ masterName: 'BIOS_CONTENT' });
  header(qualitySlide, 'Calidad del servicio', 'Indicadores de calidad del periodo');
  tiles(qualitySlide, qualitySpecs, 1.75, 2.1);
  const qualityNotes = qualitySpecs.map(spec => {
    const value = spec.read(summary.current); const definition = definitions[spec.definition];
    return `${spec.label}: ${value.value}${value.detail ? ` (${value.detail})` : ''}. ${definition?.formula || ''}`;
  });
  t(qualitySlide, 'CÓMO SE CALCULAN', { x: M, y: 4.2, w: 6, h: 0.3, fontSize: 9.5, color: C.slate, charSpacing: 1.5, bold: true });
  t(qualitySlide, bullets(qualitySpecs.map(spec => `${spec.label}: ${definitions[spec.definition]?.formula || ''}`), 10, C.graphite), { x: M, y: 4.55, w: W - 2 * M, h: 1.6, fit: 'shrink' });
  if (!surveys) t(qualitySlide, 'La satisfacción del cliente se mostrará cuando existan encuestas respondidas.', { x: M, y: 6.15, w: W - 2 * M, h: 0.3, fontSize: 9, color: C.slate });
  qualitySlide.addNotes(qualityNotes.join('\n'));

  // ── 03 · Field activity ───────────────────────────────────────────────────────────────────
  step('Preparando actividad de campo…');
  section('03', 'Actividad de campo', 'Preventivos, correctivos, visitas, llamadas y capacitaciones');
  const activitySpecs = sections.find(item => item.id === 'actividad')?.cards || [];
  const activitySlide = pptx.addSlide({ masterName: 'BIOS_CONTENT' });
  header(activitySlide, 'Actividad de campo', 'Lo que hizo el equipo en campo y por teléfono');
  tiles(activitySlide, activitySpecs, 1.75, 2.1);
  const specs = chartsFor('general');
  const maintenance = specs.find(spec => spec.id === 'maintenance'); const field = specs.find(spec => spec.id === 'field');
  if (maintenance && field) {
    step('Dibujando «Actividad de campo»…');
    const [left, right] = await Promise.all([
      renderChart(seriesChart(summary, maintenance, [BRAND.graphite, BRAND.red]), 5.95, 2.45),
      renderChart(seriesChart(summary, field, [BRAND.graphite, BRAND.grey]), 5.95, 2.45),
    ]);
    t(activitySlide, maintenance.title.toUpperCase(), { x: M, y: 4.0, w: 5.95, h: 0.28, fontSize: 9.5, color: C.slate, charSpacing: 1.2, bold: true });
    t(activitySlide, field.title.toUpperCase(), { x: W - M - 5.95, y: 4.0, w: 5.95, h: 0.28, fontSize: 9.5, color: C.slate, charSpacing: 1.2, bold: true });
    activitySlide.addImage({ data: asData(left), x: M, y: 4.28, w: 5.95, h: 2.15, altText: maintenance.title });
    activitySlide.addImage({ data: asData(right), x: W - M - 5.95, y: 4.28, w: 5.95, h: 2.15, altText: field.title });
  }
  activitySlide.addNotes(activitySpecs.map(spec => { const value = spec.read(summary.current); return `${spec.label}: ${value.value}${value.detail ? ` (${value.detail})` : ''}`; }).join('\n'));

  // ── Team workload ─────────────────────────────────────────────────────────────────────────
  step('Armando la tabla del equipo…');
  const staff = [...summary.breakdowns.staff].filter(person => person.tickets_relevant || person.visits || person.calls || person.trainings || person.preventive_programmed)
    .sort((a, b) => b.tickets_relevant - a.tickets_relevant || a.name.localeCompare(b.name, 'es'));
  const overallOnTime = facts.groups.overall?.pct ?? null;
  const clearlyBelow = (onTime: number, n: number) => overallOnTime !== null && n >= facts.minSample && (wilson(onTime, n)?.high ?? 100) < overallOnTime;
  const head = ['Colaborador', 'Equipo', 'Tickets', 'Cerrados', 'Fuera de plazo', 'Resolución', 'Visitas', 'Llamadas', 'Preventivos', 'Correctivos', 'Capacitaciones'];
  const rule = (pt: number, color: string): [PptxGenJS.BorderProps, PptxGenJS.BorderProps, PptxGenJS.BorderProps, PptxGenJS.BorderProps] =>
    [{ type: 'none' }, { type: 'none' }, { type: 'solid', pt, color }, { type: 'none' }];
  const cell = (value: string, options: PptxGenJS.TableCellProps = {}): PptxGenJS.TableCell =>
    ({ text: value, options: { fontFace: FONT, fontSize: 10, color: C.ink, valign: 'middle', border: rule(0.75, C.light), ...options } });
  for (let page = 0; page * 12 < Math.max(1, staff.length); page++) {
    const slide = pptx.addSlide({ masterName: 'BIOS_CONTENT' });
    header(slide, 'Balance de carga', page ? 'Balance de carga por colaborador (continuación)' : 'Balance de carga por colaborador');
    const rows = staff.slice(page * 12, page * 12 + 12).map(person => [
      cell(shownName(person.name)), cell(teamLabels[person.team] || person.team, { color: C.slate }),
      cell(formatCount(person.tickets_relevant), { align: 'right' }), cell(formatCount(person.tickets_closed), { align: 'right' }),
      // Red only when the person is clearly below the overall rate (same rule as the chart), never for any late case.
      cell(person.sla_evaluable ? `${formatCount(person.sla_late)} de ${formatCount(person.sla_evaluable)} (${Math.round(person.sla_late / person.sla_evaluable * 100)} %)` : '—',
        { align: 'right', color: clearlyBelow(person.sla_evaluable - person.sla_late, person.sla_evaluable) ? C.red : C.ink }),
      cell(person.resolution_median === null ? '—' : formatHours(person.resolution_median), { align: 'right' }),
      cell(formatCount(person.visits), { align: 'right' }), cell(formatCount(person.calls), { align: 'right' }),
      cell(person.preventive_programmed ? `${formatCount(person.preventive_done)} de ${formatCount(person.preventive_programmed)}` : '—', { align: 'right' }),
      cell(formatCount(person.corrective), { align: 'right' }), cell(formatCount(person.trainings), { align: 'right' }),
    ]);
    const headRow = head.map((label, index) => cell(label.toUpperCase(), { fontSize: 8, color: C.slate, bold: true, align: index > 1 ? 'right' : 'left', border: rule(1.25, C.ink) }));
    slide.addTable([headRow, ...(rows.length ? rows : [[cell('Sin colaboradores con actividad en el periodo.', { colspan: head.length, color: C.slate })]])], {
      x: M, y: 1.7, w: W - 2 * M, colW: [2.2, 1.0, 0.72, 0.82, 1.5, 0.95, 0.72, 0.82, 1.05, 1.0, 1.36], rowH: 0.34, autoPage: false,
    });
    source(slide, 'No es un ranking: considera tipo de servicio, prioridad y carga asignada antes de comparar personas. Fuera de plazo: cierres fuera del compromiso de los evaluables; en rojo solo quien queda claramente por debajo del general.');
  }

  // ── Method and data quality ───────────────────────────────────────────────────────────────
  step('Documentando el método…');
  const method = pptx.addSlide({ masterName: 'BIOS_CONTENT' });
  header(method, 'Anexo', 'Cómo se calculan los indicadores');
  const rules = [
    'Plazo: 48 horas corridas desde la apertura (24 h para Falcon Ciudad de México), según la regla vigente de cada ticket.',
    'Fuera de plazo: cierres evaluables cuyo tiempo supera el compromiso. Los enviados a administrativo no cuentan para el plazo ni para la resolución técnica.',
    'Intervalo de confianza del 95 % (Wilson): rango plausible de un porcentaje; es amplio cuando hay pocos casos.',
    'Curva de cierre (Kaplan-Meier): los tickets aún abiertos cuentan hasta el corte y nunca se suponen cerrados.',
    'Tickets históricos de Biosisa (folio BIO-): fechas de creación y cierre registradas en Biosisa; responsable, el asignado en Biosisa.',
    'Pendientes: fotografía al corte del periodo. Los periodos se asignan por fecha local.',
  ];
  t(method, 'REGLAS', { x: M, y: 1.7, w: 6, h: 0.28, fontSize: 9.5, color: C.red, charSpacing: 1.5, bold: true });
  t(method, bullets(rules, 10.5, C.ink), { x: M, y: 2.02, w: 6.6, h: 4.3, fit: 'shrink' });
  const quality = qualityLabels.map(([key, label]) => [num(summary.quality[key]) ?? 0, label] as const).filter(([value]) => value > 0);
  t(method, 'CALIDAD DE LOS DATOS', { x: M + 7.0, y: 1.7, w: 5, h: 0.28, fontSize: 9.5, color: C.red, charSpacing: 1.5, bold: true });
  t(method, bullets(quality.length ? quality.map(([value, label]) => `${formatCount(value)} · ${label}`) : ['Sin registros con datos faltantes en el periodo.'], 9.5, C.graphite), { x: M + 7.0, y: 2.02, w: W - 2 * M - 7.0, h: 4.3, fit: 'shrink' });
  source(method, `Generado por ORION el ${formatDateTime(new Date().toISOString())} con los filtros: ${criteria.map(([key, value]) => `${key} ${value}`).join(' · ')}.`);

  // ── Closing ───────────────────────────────────────────────────────────────────────────────
  const closing = pptx.addSlide();
  closing.background = { color: C.white };
  closing.addImage(wordmark(red, (W - 5) / 2, 2.9, 5).image);
  t(closing, TAGLINE, { x: 0, y: 4.0, w: W, h: 0.4, fontSize: 15, color: C.red, align: 'center' });
  t(closing, WEB, { x: 0, y: 6.6, w: W, h: 0.3, fontSize: 10, color: C.slate, align: 'center' });

  step('Guardando la presentación…');
  const fileName = `BioSystems_Indicadores_servicio_${summary.period.from}_${summary.period.to}.pptx`;
  await pptx.writeFile({ fileName, compression: true });
  return { fileName, tickets: points.length };
}
