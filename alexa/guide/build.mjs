#!/usr/bin/env node
// ORION · Guía de voz (PDF). Everything in it is real:
//   - phrases are validated against the deployed interaction model (alexa/skill-package/.../es-MX.json): the build
//     fails if a phrase is not in the model;
//   - conversations and Echo Show screens come from alexa/guide/examples.json, captured by running the skill code
//     (deno run … alexa/guide/examples.ts).
// Render:  node alexa/guide/build.mjs   → alexa/guide/Orion_Guia_de_Voz.pdf (+ guide.html for review)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const require = createRequire(join(root, 'frontend/package.json'));
const { chromium } = require('playwright-core');

const model = JSON.parse(readFileSync(join(root, 'alexa/skill-package/interactionModels/custom/es-MX.json'), 'utf8')).interactionModel.languageModel;
const SAMPLES = new Set(model.intents.flatMap((i) => i.samples.map((s) => s.toLowerCase())));
const INVOCATION = model.invocationName;
const PRUEBAS = model.types.find((t) => t.name === 'PRUEBA').values.length;
const ex = JSON.parse(readFileSync(join(here, 'examples.json'), 'utf8')).dialogs;

// ── Phrases (validated) ──────────────────────────────────────────────────────
const missing = [];
/** say: what the person says; tpl: the sample in the model it matches (null = Amazon built-in intent). */
const P = (say, tpl = say) => {
  if (tpl !== null && !SAMPLES.has(tpl.toLowerCase())) missing.push(tpl);
  return say;
};
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Icons (1.6px line, currentColor) ─────────────────────────────────────────
const ICON = {
  mic: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  pulse: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  ticket: '<path d="M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z"/><path d="M10 7v12" stroke-dasharray="2 2"/>',
  device: '<rect x="4" y="4" width="16" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  alarm: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
  flask: '<path d="M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4A1.5 1.5 0 0 0 20 19l-6-10V3"/><path d="M7 15h10"/>',
  curve: '<path d="M3 20h18M4 18c3-9 6-12 9-12s5 2 7 4"/>',
  brain: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/>',
  steps: '<path d="M4 6h6M4 12h10M4 18h16"/><circle cx="18" cy="6" r="2"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M9 7h6"/>',
  pencil: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15 9-2 5-4 1 2-5z"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
};
const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

// ── Building blocks ──────────────────────────────────────────────────────────
const asset = (name) => pathToFileURL(join(here, 'assets', name)).href;
const chips = (phrases, cls = '') => `<div class="chips ${cls}">${phrases.map((p) => `<span class="chip">${icon('mic')}<span>«${esc(p)}»</span></span>`).join('')}</div>`;
const bubbles = (turns, opts = {}) => `<div class="chat ${opts.compact ? 'compact' : ''}">${turns
  .map((t) => `<div class="msg you"><span class="who">Tú</span><p>${esc(t.user)}</p></div><div class="msg orion"><span class="who"><img src="${asset('mark.png')}" alt=""/>Orión</span><p>${esc(t.orion)}</p></div>`)
  .join('')}</div>`;

/** Echo Show replica of the APL screens (same palette and layout as supabase/functions/alexa/apl.ts). */
function echoScreen(s, caption = '') {
  if (!s) return '';
  const header = `<div class="es-head"><img src="${asset('echo-mark.png')}" alt=""/><div><b>ORION</b><i>${esc(s.kicker)}</i></div><span class="es-grow"></span><div class="es-clock"><b>10:42</b><i>${esc(s.date)}</i></div></div><div class="es-divider"><span></span><span></span><span></span></div>`;
  let body = '';
  switch (s.layout) {
    case 'briefing':
      body = `<h4>${esc(s.title)}</h4><p class="es-sub">${esc(s.subtitle)}</p><div class="es-tiles">${s.tiles
        .map((t) => `<div class="es-card es-tile"><span class="es-bar" style="background:${t.color}"></span><small>${esc(t.label)}</small><div class="es-tilerow"><b style="color:${t.color}">${esc(t.value)}</b><svg viewBox="0 0 100 100"><path d="M 50 10 A 40 40 0 1 1 49.99 10" stroke="rgba(167,182,196,.14)" stroke-width="6" fill="none"/><path d="${t.arc}" stroke="${t.color}" stroke-width="6" fill="none" stroke-linecap="round"/></svg></div><em>${esc(t.hint)}</em></div>`)
        .join('')}</div><small class="es-label">LO PRIMERO</small>${s.rows.map((r) => `<div class="es-row"><span style="background:${r.color}"></span>${r.tag ? `<i style="color:${r.color}">${esc(r.tag)}</i>` : ''}${esc(r.text)}</div>`).join('')}`;
      break;
    case 'equipment':
      body = `<div class="es-eqhead"><div><small>${esc(s.label)}</small><h4 class="big">${esc(s.title)}</h4><p class="es-sub">${esc(s.subtitle)}</p></div><span class="es-chip" style="color:${s.chip.color};border-color:${s.chip.color};background:${s.chip.wash}"><span style="background:${s.chip.color}"></span>${esc(s.chip.text)}</span></div><div class="es-facts">${s.facts.map((f) => `<div class="es-card"><small>${esc(f.k)}</small><b style="color:${f.color}">${esc(f.v)}</b></div>`).join('')}</div>${s.rows.map((r) => `<div class="es-row"><span style="background:${r.color}"></span>${r.tag ? `<i style="color:${r.color}">${esc(r.tag)}</i>` : ''}${esc(r.text)}</div>`).join('')}`;
      break;
    case 'diagnosis':
      body = `<h4>${esc(s.title)}</h4><p class="es-sub">${esc(s.subtitle)}</p>${s.bars.map((b) => `<div class="es-card es-hyp"><b class="n" style="color:${b.color}">${b.n}</b><div><div class="es-hyptop"><span>${esc(b.label)}</span><em style="color:${b.color}">${esc(b.value)}</em></div><div class="es-track"><span style="width:${b.width};background:${b.color}"></span></div><small>${esc(b.detail)}</small></div></div>`).join('')}${s.note?.text ? `<p class="es-note" style="color:${s.note.color}">${esc(s.note.text)}</p>` : ''}`;
      break;
    case 'procedure':
      body = `<small class="es-label" style="color:#3fd2e4">${esc(s.step)}</small><h4 class="mid">${esc(s.title)}</h4><div class="es-dots">${s.dots.map((d) => `<span style="background:${d.color}"></span>`).join('')}</div><div class="es-card es-proc">${esc(s.body)}</div>${s.caution ? `<p class="es-note" style="color:#f2b54a">${esc(s.caution)}</p>` : ''}`;
      break;
    case 'chart': {
      const paths = [1, 2, 3, 4].map((i) => (s[`p${i}`] ? `<path d="${s[`p${i}`]}" stroke="${s[`c${i}`]}" stroke-width="2" fill="none" stroke-linejoin="round"/>` : '')).join('');
      body = `<h4>${esc(s.title)}</h4><p class="es-sub">${esc(s.subtitle)}</p><div class="es-card es-plot"><small>${esc(s.yLabel)}</small><svg viewBox="0 0 400 200" preserveAspectRatio="none"><path d="${s.grid}" stroke="rgba(167,182,196,.16)" stroke-width=".6"/>${paths}</svg><small style="text-align:right">${esc(s.xLabel)}</small></div><div class="es-legend">${s.legend.map((l) => `<span><i style="background:${l.color}"></i>${esc(l.label)}</span>`).join('')}</div>`;
      break;
    }
    case 'list':
      body = `<h4>${esc(s.title)}</h4><p class="es-sub">${esc(s.subtitle)}</p>${s.items.map((it) => `<div class="es-card es-item"><span class="bar" style="background:${it.color}"></span><b style="color:${it.color}">${it.n}</b><span>${esc(it.text)}</span></div>`).join('')}${s.rest > 0 ? `<p class="es-note" style="color:#3fd2e4">${s.rest} MÁS · DI «SÍ» PARA CONTINUAR</p>` : ''}`;
      break;
    case 'code':
      body = `<h4>${esc(s.title)}</h4><p class="es-sub">${esc(s.subtitle)}</p><div class="es-digits">${s.digits.map((d) => `<span class="es-card">${esc(d)}</span>`).join('')}</div>`;
      break;
    default:
      body = `<h4>${esc(s.title)}</h4><div class="es-card es-msg">${esc(s.body)}</div>`;
  }
  return `<figure class="echo"><div class="echo-body"><div class="echo-screen"><div class="es" style="background-image:url('${asset('echo-bg.jpg')}')">${header}<div class="es-content ${s.layout === 'diagnosis' && s.bars.length > 2 ? 'dense' : ''}">${body}</div>${s.hint ? `<div class="es-hint">${esc(s.hint)}</div>` : ''}</div></div></div><div class="echo-base"></div>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
}

const toc = [];
let lastOpener = null;
const page = (inner, { section = '', dark = false, n } = {}) => {
  if (lastOpener) toc.push({ ...lastOpener, n });
  lastOpener = null;
  return pageHtml(inner, { section, dark, n });
};
const pageHtml = (inner, { section, dark, n }) => `
<section class="page ${dark ? 'dark' : ''}">
  ${dark ? '' : `<header class="ph"><img src="${asset('mark.png')}" alt=""/><span>ORION · GUÍA DE VOZ</span><span class="ph-grow"></span><span class="ph-sec">${esc(section)}</span></header>`}
  <div class="pc">${inner}</div>
  ${dark ? '' : `<footer class="pf"><span>Biosystems · Medinova</span><span class="pf-grow"></span><span>«Alexa, abre ${esc(INVOCATION)}»</span><b>${n ?? ''}</b></footer>`}
</section>`;
let secN = 0;
const opener = (key, kicker, title, lead) => {
  const num = String(++secN).padStart(2, '0');
  lastOpener = { num, key, title };
  return `<div class="opener"><span class="num">${num}</span><div><small>${esc(kicker)}</small><h2>${title}</h2>${lead ? `<p class="lead">${lead}</p>` : ''}</div></div>`;
};
const card = (title, body, ic) => `<div class="card">${ic ? `<span class="card-ic">${icon(ic)}</span>` : ''}<h3>${title}</h3>${body}</div>`;
const T = (k, i) => ex[k][i];

// ── Content ──────────────────────────────────────────────────────────────────
const CAPS = [
  ['pulse', 'Cómo vamos', 'Flota, alarmas fatales, controles rechazados y casos en riesgo.', P('cómo vamos'), 'resumen'],
  ['calendar', 'Tu día y tus casos', 'Servicios planeados y casos, el más urgente primero.', P('qué tengo hoy'), 'casos'],
  ['ticket', 'Buscar un caso', 'Filtros, detalle, contacto, bitácora e historial.', P('casos pendientes por piezas', 'casos {condicion}'), 'buscar'],
  ['pencil', 'Registrar en un caso', 'Avances, llamadas, visitas y cambios de estado.', P('agrega un avance cambié la lámpara', 'agrega un avance {texto}'), 'registrar'],
  ['check', 'Respuesta y cierre', 'Con doble confirmación: le llegan al cliente.', P('cierra el caso'), 'cierre'],
  ['shield', 'Para administración', 'Asignar casos, aprobar demoras y cierres del equipo.', P('asigna el caso a Juan', 'asigna el caso a {persona}'), 'admin'],
  ['device', 'Un equipo y sus alarmas', 'Estado, alarmas en español, controles y casos.', P('cómo está el cero cuatro siete tres', 'cómo está el {serie}'), 'equipo'],
  ['flask', 'Controles y curvas', 'Controles explicados, calibración y curva de reacción.', P('pasaron los controles'), 'controles'],
  ['brain', 'Diagnóstico DRI', 'Causas con certeza y verificación guiada paso a paso.', P('diagnostica el cero cuatro siete tres', 'diagnostica el {serie}'), 'dri'],
  ['book', 'Inserto y lotes', 'Estabilidad, interferencias, linealidad, blanco y caducidad.', P('qué interfiere con glucosa', 'qué interfiere con {prueba}'), 'inserto'],
  ['spark', 'Casos nuevos y borradores', 'Abrir un caso, pedir refacciones, revisar borradores.', P('abre un ticket por alarma de temperatura del rotor', 'abre un ticket por {motivo}'), 'borradores'],
  ['bell', 'Avisos', 'Plazos, asignaciones, fatales, controles y seguimientos.', P('qué avisos tengo'), 'avisos'],
];

const pages = [];
let n = 2; // the cover is page 1
// 1 · Cover
pages.push(`<section class="page cover">
  <div class="cover-hero" style="background-image:url('${asset('cover.jpg')}')"></div>
  <div class="cover-fade"></div>
  <div class="cover-text">
    <div class="hud"><span></span><i>ASISTENTE DE SERVICIO · ALEXA</i></div>
    <h1>Guía de voz</h1>
    <p class="cover-sub">Todo lo que Orion hace hoy por voz: frases, ejemplos reales y lo que verás en el Echo Show.</p>
    <div class="cover-say">${icon('mic')}<span>«Alexa, abre <b>${esc(INVOCATION)}</b>»</span></div>
    <div class="cover-meta"><span>Versión octubre 2026</span><span>BA400 · BA200 · A15</span><span>Uso interno Biosystems</span></div>
  </div>
</section>`);

// 2 · How to talk to Orion
const anatomy = [
  ['«Alexa,', 'Palabra de activación', '#818b98'],
  [`pregúntale a ${INVOCATION}`, 'Abre Orion', '#f32735'],
  ['cómo está el', 'Lo que quieres saber', '#3fd2e4'],
  [`${P('cómo está el cero cuatro siete tres', 'cómo está el {serie}').replace('cómo está el ', '')}»`, 'Terminación de la serie: 4 dígitos', '#f2b54a'],
];
pages.push(page(`
  ${opener('inicio', 'Empieza aquí', 'Cómo hablarle a Orion', 'Orion es el asistente de servicio técnico de Biosystems. Contesta con lo que tu cuenta puede ver en Orion: flota, casos, controles, diagnósticos e insertos. Así tienes las manos libres frente al equipo.')}
  <div class="anatomy"><small>ANATOMÍA DE UNA FRASE</small><div class="an-row">${anatomy.map(([t, l, c]) => `<div class="an-seg"><b>${esc(t)}</b><i style="background:${c}"></i><small>${l}</small></div>`).join('')}</div></div>
  <div class="grid2">
    ${card('Abre la skill', `${chips([`Alexa, abre ${INVOCATION}`])}<p>Orion contesta con una frase corta, por ejemplo «Orión en línea. ¿Qué revisamos?», y te escucha.</p>`, 'mic')}
    ${card('O pregunta directo', `${chips([`Alexa, pregúntale a ${INVOCATION} cómo vamos`])}<p>Una sola frase: abre Orion y contesta de inmediato.</p>`, 'spark')}
    ${card('Nombra los equipos por su terminación', `${chips([P('cómo está el cero cuatro siete tres', 'cómo está el {serie}')])}<p>Los cuatro últimos dígitos de la serie, número por número. También funciona con el cliente: «cómo está el equipo de Demo Norte».</p>`, 'device')}
    ${card('Contesta con sí y no', `${chips(['sí', 'no', P('borrador'), P('confirmo'), 'siguiente'])}<p>Cuando Orion propone algo, basta con «sí». Antes de guardar en un caso te pregunta «sí, no o borrador»; al cerrar o responder al cliente, además «confirmo».</p>`, 'check')}
  </div>
  <div class="vocab">
    <div><small>PRUEBAS</small><p>Por su nombre: glucosa, colesterol, triglicéridos, urea, creatinina, ácido úrico, ALT, AST… ${PRUEBAS} en total.</p></div>
    <div><small>FECHAS</small><p>«hoy», «mañana», «esta semana» o un día: «qué tengo el lunes».</p></div>
    <div><small>CASOS</small><p>«caso», «reporte» o «ticket»; en una lista, «el primero», «el segundo».</p></div>
  </div>
  <div class="callout">${icon('compass')}<div><b>Atajo recomendado.</b> En la app de Alexa crea una rutina: «Cuando digas: <i>Orión</i>» → acción <i>Skills → Orion</i>. Así basta con decir «Alexa, Orión».</div></div>
`, { section: 'Empieza aquí', n: n++ }));

// 3 · Linking
const link = T('vincular', 0);
pages.push(page(`
  ${opener('vincular', 'Una sola vez', 'Vincula tu dispositivo', 'Por seguridad, Orion solo responde a dispositivos vinculados con una cuenta de Orion de ingeniería, química o administración.')}
  <div class="steps3">
    <div class="step"><b class="sn">1</b><h3>Abre la skill</h3>${chips([`Alexa, abre ${INVOCATION}`])}<p>Orion te dicta un código de 6 dígitos que vence en 10 minutos. En el Echo Show también lo ves en pantalla.</p></div>
    <div class="step"><b class="sn">2</b><h3>Escríbelo en Orion web</h3><div class="mini-web"><small>ORION · ALEXA</small><div class="mini-code">${link.screen.digits.join(' ')}</div><span class="mini-btn">Vincular</span></div><p>Entra a Orion, pestaña <b>Alexa</b>, escribe el código y pulsa Vincular.</p></div>
    <div class="step"><b class="sn">3</b><h3>Listo</h3><div class="mini-ok">${icon('check')}<span>Dispositivo vinculado</span></div><p>Desde ahí mismo activas los avisos, eliges tu horario de silencio o desvinculas el dispositivo.</p></div>
  </div>
  <div class="split wide-left">
    ${echoScreen(link.screen, 'Echo Show: código de vinculación')}
    <div class="note-card">${icon('bell')}<div><h3>Para que suenen los avisos</h3><p>En la app de Alexa: <i>Skills → Orion → Configuración</i> y permite las notificaciones.</p><h3>Con Alexa+</h3><p>Antes de la skill, Alexa+ dice «Aquí tienes la skill Orion. Di "Alexa, sal" para volver a Alexa plus». Es normal y no se puede quitar desde la skill. Si ese anuncio se corta, Orion sigue abierto: continúa diciendo «Alexa,» y tu instrucción, por ejemplo «Alexa, mis casos».</p></div></div>
  </div>
  <div class="travel"><small>QUÉ PASA CUANDO HABLAS</small><div class="tr-row">${[
    ['mic', 'Tú', 'Hablas con tu Echo o con la app de Alexa.'],
    ['device', 'Alexa', 'Amazon convierte tu voz en una intención: «estado del equipo 0473».'],
    ['shield', 'Orion', 'Comprueba que la petición viene de Amazon y lee los datos con los permisos de tu cuenta.'],
    ['spark', 'Respuesta', 'Orion contesta con voz y, en un Echo Show, con una pantalla.'],
  ].map(([ic, t, d], i) => `${i ? '<span class="tr-arrow">→</span>' : ''}<div class="tr-node">${icon(ic)}<b>${t}</b><p>${d}</p></div>`).join('')}</div>
  <p class="tr-foot">Orion nunca recibe tu audio: Amazon le envía solo la intención y los datos que dijiste.</p></div>
`, { section: 'Vinculación', n: n++ }));

// 4 · Capability map (doubles as the index: each card points to its page)
pages.push(page(`
  ${opener('mapa', 'Mapa', 'Lo que Orion hace hoy', 'Doce capacidades listas para usar. Cada una tiene su página con las frases que funcionan y un ejemplo real.')}
  <div class="caps">${CAPS.map(([ic, t, d, say, sec]) => `<div class="cap">${icon(ic)}<span class="cap-pg">PÁG. %%P${sec}%%</span><h3>${t}</h3><p>${d}</p><span class="cap-say">«${esc(say)}»</span></div>`).join('')}</div>
  <div class="legend">
    <div><span class="chip">${icon('mic')}<span>«frase»</span></span><p>Lo que puedes decir. Cada frase está comprobada contra el modelo de voz de la skill.</p></div>
    <div><span class="lg-bubble"><img src="${asset('mark.png')}" alt=""/>Orión</span><p>Respuesta real de la skill, generada con los equipos de demostración Demo Norte y Demo Centro.</p></div>
    <div><span class="lg-echo"></span><p>Lo que muestra un Echo Show. En un Echo sin pantalla, Orion dice lo mismo.</p></div>
  </div>
`, { section: 'Mapa', n: n++ }));

// 5 · Resumen
const TILE_HELP = {
  'EN LÍNEA': 'Equipos que reportaron al monitor en las últimas 24 horas.',
  'ALARMA FATAL': 'Equipos con una alarma que detiene el trabajo. Orion te dice cuál y en qué parte.',
  'CONTROLES RECHAZADOS': 'Controles de calidad rechazados en las últimas 24 horas.',
  'SLA EN RIESGO': 'Casos vencidos o cerca de vencer: Falcon CDMX a 8 horas o menos, Falcon foráneo a 16, los demás a 8.',
};
const INK = { '#3fd2e4': '#1f6f8a', '#ff6b7a': '#d63b49', '#f2b54a': '#a8691a' };
pages.push(page(`
  ${opener('resumen', 'La flota de un vistazo', 'Cómo vamos', 'El resumen prioriza lo urgente: equipos en alarma fatal, controles rechazados en las últimas 24 horas y casos en riesgo de SLA. Al final te ofrece el siguiente paso.')}
  ${chips([P('cómo vamos'), P('dame el resumen'), P('cómo está la flota'), P('qué es lo urgente')])}
  <div class="split">
    ${bubbles([T('resumen', 0)])}
    ${echoScreen(T('resumen', 0).screen, 'Echo Show: centro de servicio')}
  </div>
  <div class="tlegend">${T('resumen', 0).screen.tiles.map((t) => `<div class="tl"><i style="background:${t.color}"></i><b style="color:${INK[t.color] ?? '#17202b'}">${esc(t.label)}</b><p>${TILE_HELP[t.label] ?? ''}</p></div>`).join('')}</div>
  <div class="chain"><small>UNA CONVERSACIÓN ENCADENADA · BASTA CON «SÍ»</small><div class="ch-row">${[
    ['cómo vamos', '¿Quieres que revise ese equipo?', 'Resumen'],
    ['sí', '¿Quieres que lo diagnostique?', 'Estado del equipo'],
    ['sí', '¿Quieres que te guíe para verificarlo?', 'Diagnóstico DRI'],
    ['sí', 'Paso 1… ¿Hubo algún cambio de lote?', 'Verificación guiada'],
    ['ya quedó', 'Lo registro como resuelto.', 'El DRI aprende'],
  ].map(([you, orion, what], i) => `${i ? '<span class="ch-arrow">→</span>' : ''}<div class="ch-node"><em>${what}</em><b>«${you}»</b><p>${orion}</p></div>`).join('')}</div></div>
`, { section: 'Resumen', n: n++ }));

// 6 · Tu día y casos
pages.push(page(`
  ${opener('casos', 'Agenda y casos', 'Tu día, tus casos y reportes', 'Orion entiende «caso», «reporte» o «ticket». Si mencionó un solo caso, te da su estado directo; si hay varios, te pregunta la terminación del equipo.')}
  ${chips([P('qué tengo hoy'), P('qué tengo esta semana', 'qué tengo {cuando}'), P('mis reportes'), P('qué casos están en riesgo'), P('cómo vamos con el reporte'), P('el primero', 'el {ordinal}'), P('el reporte del cero cuatro siete tres', 'el reporte del {serie}'), P('quién tiene el reporte'), P('repíteme los reportes')])}
  ${bubbles(ex.casos, { compact: true })}
  <div class="callout soon">${icon('calendar')}<div><b>Plazos que cuenta Orion:</b> casos de Falcon en CDMX, 24 horas; Falcon fuera de CDMX y los demás casos, 48 horas, desde que se abrió el caso. El detalle te dice cuándo se abrió, cuánto le queda, quién lo tiene y lo último de la bitácora.</div></div>
`, { section: 'Casos', n: n++ }));

// 6b · Search and know a case
const FILTERS = [
  ['Estado', 'abiertos · en proceso · pendientes por piezas · en observación'],
  ['Atención', 'sin respuesta · sin asignar'],
  ['Plazo', 'vencidos · por vencer · nuevos de hoy'],
  ['Tipo', 'de Falcon · de química · de ingeniería'],
  ['Lugar o cliente', 'de Monterrey · de Demo Norte · o la terminación'],
  ['Cierres', 'cuántos casos cerré hoy · esta semana'],
];
pages.push(page(`
  ${opener('buscar', 'Consultas', 'Buscar y conocer un caso', 'Filtra tus casos por estado, plazo, tipo, lugar o cliente, y pregunta por cualquiera: de qué se trata, quién lo reportó, qué se ha hecho y qué historia tiene el equipo.')}
  ${chips([P('cuántos casos tengo'), P('casos pendientes por piezas', 'casos {condicion}'), P('casos sin respuesta', 'casos {condicion}'), P('casos de Monterrey', 'casos de {filtro}'), P('de qué se trata el caso'), P('quién reportó el caso'), P('léeme la bitácora'), P('historial del cero cuatro siete tres', 'historial del {serie}'), P('cuántos casos cerré esta semana', 'cuántos casos cerré {cuando}')])}
  <div class="split">
    ${bubbles([...ex.filtros.slice(0, 2), ...ex.detalleCaso], { compact: true })}
    <div class="stack">
      <div class="card">${icon('ticket')}<h3>Filtros que entiende</h3>
        <table class="x">${FILTERS.map(([a, b]) => `<tr><td class="say nowrap">${a}</td><td>${b}</td></tr>`).join('')}</table>
      </div>
      ${bubbles(ex.historial, { compact: true })}
    </div>
  </div>
`, { section: 'Casos', n: n++ }));

// 6c · Write in a case (sí / no / borrador)
const MOVES = [
  ['Avance', 'agrega un avance cambié la lámpara', 'agrega un avance {texto}'],
  ['Llamada', 'registra una llamada el cliente confirma que ya enciende', 'registra una llamada {texto}'],
  ['Visita', 'registra una visita revisé el equipo en sitio', 'registra una visita {texto}'],
  ['Diagnóstico', 'registra el diagnóstico falla de la lámpara', 'registra el diagnóstico {texto}'],
  ['Pieza', 'registra un cambio de pieza lámpara nueva', 'registra un cambio de pieza {texto}'],
  ['Escalamiento', 'escala el caso falla de tarjeta', 'escala el caso {texto}'],
  ['Nota interna', 'nota interna revisar el voltaje', 'nota interna {texto}'],
  ['Estado', 'pasa el caso a pendiente por piezas', 'pasa el caso a {estado}'],
];
pages.push(page(`
  ${opener('registrar', 'Manos libres', 'Registrar en un caso', 'Avances, llamadas, visitas, diagnósticos, piezas, escalamientos y notas internas quedan en la bitácora con tu usuario, igual que en Orion web. Antes de guardar, Orion te lee lo que entendió.')}
  <div class="decide"><div class="dc-q">${icon('mic')}<div><small>ORION PROPONE</small><p>«Agrego al caso de Demo Centro, terminación 0473, un avance: “Cambié la lámpara”, y lo paso a pendiente por piezas. ¿Lo guardo?»</p></div></div>
    <div class="dc-row">${[['sí', 'Se guarda en la bitácora con tu usuario y el caso cambia de estado.', 'ok'], ['no', 'No se guarda nada.', 'mute'], ['borrador', 'Queda en Orion web, pestaña Alexa, para que lo revises y lo apruebes.', 'warn']].map(([w, d, tone]) => `<div class="dc-opt ${tone}"><b>«${w}»</b><p>${d}</p></div>`).join('')}</div></div>
  <div class="split">
    ${bubbles([...ex.avance.slice(0, 2), ...ex.borrador], { compact: true })}
    <div class="card">${icon('pencil')}<h3>Qué puedes registrar</h3>
      <table class="x">${MOVES.map(([k, say, tpl]) => `<tr><td class="say nowrap">${k}</td><td>«${esc(P(say, tpl))}»</td></tr>`).join('')}</table>
      <p>Agrega el estado al final: «… y pásalo a pendiente por piezas». Para varias líneas, di «dicta una nota», luego «anota …» y al final «es todo».</p>
    </div>
  </div>
  <div class="callout soon">${icon('shield')}<div>Por voz nada se marca como visible para el cliente; eso se decide en Orion web. Si un caso no es tuyo, Orion te lo dice y no guarda nada.</div></div>
`, { section: 'Registrar', n: n++ }));

// 6d · First response and closure (double confirmation)
const REASONS = [['Solucionado', 'cierra el caso como solucionado'], ['Visita programada', 'cierra el caso como visita programada'], ['Sin respuesta del cliente', 'cierra el caso como sin respuesta del cliente'], ['Cierre administrativo', 'cierra el caso como administrativo']];
for (const [, say] of REASONS) P(say, 'cierra el caso como {razon}');
pages.push(page(`
  ${opener('cierre', 'Lo que ve el cliente', 'Primera respuesta y cierre', 'Son los dos momentos que le llegan al cliente: la primera respuesta y el cierre le mandan un WhatsApp, y el cierre también la encuesta de satisfacción. Por eso Orion pide dos confirmaciones: primero «sí» y después «confirmo».')}
  <div class="stepper">${[['1', 'Motivo', 'solucionado, visita programada, sin respuesta o administrativo'], ['2', 'Qué se hizo', '«solución cambié la lámpara»'], ['3', '«sí»', 'Orion te lee el cierre completo'], ['4', '«confirmo»', 'se cierra y sale el WhatsApp con la encuesta']].map(([nn, t, d], i) => `${i ? '<span class="st-arrow">→</span>' : ''}<div class="st"><b>${nn}</b><h3>${t}</h3><p>${d}</p></div>`).join('')}</div>
  ${chips([P('cierra el caso'), P('cierra el caso como solucionado', 'cierra el caso como {razon}'), P('solución cambié la lámpara y calibré glucosa', 'solución {texto}'), P('confirmo'), P('registra la respuesta al cliente le expliqué que mañana vamos', 'registra la respuesta al cliente {texto}')])}
  <div class="split">
    <div class="stack"><div class="ctx">Antes: «${esc(T('cerrar', 0).user)}» → Orion pregunta el motivo → «${esc(T('cerrar', 1).user)}» → «¿Qué se hizo?».</div>${bubbles(ex.cerrar.slice(2), { compact: true })}</div>
    <div class="stack">
      <div class="card">${icon('check')}<h3>Primera respuesta al cliente</h3><p>La primera vez que registras la respuesta, cuenta el tiempo de atención y el cliente recibe un WhatsApp. Las siguientes se guardan como seguimiento, sin WhatsApp y con un solo «sí». Si el caso no tiene teléfono, Orion te avisa que no saldrá WhatsApp.</p></div>
      ${bubbles(ex.respuesta.slice(1), { compact: true })}
    </div>
  </div>
`, { section: 'Cierre', n: n++ }));

// 6e · Administration
pages.push(page(`
  ${opener('admin', 'Administración', 'Para quien coordina', 'Con una cuenta de administración, Orion habla de todos los casos y te deja repartir el trabajo sin abrir la computadora.')}
  ${chips([P('casos sin asignar', 'casos {condicion}'), P('casos vencidos'), P('asigna el caso a Juan', 'asigna el caso a {persona}'), P('asígnamelo'), P('aprueba la demora esperamos la refacción', 'aprueba la demora {texto}'), P('cuántos casos se cerraron esta semana', 'cuántos casos se cerraron {cuando}')])}
  <div class="split">
    ${bubbles(ex.adminVer, { compact: true })}
    <div class="stack">
    <div class="card">${icon('shield')}<h3>Lo que solo hace administración</h3>
      <table class="x">${[['Repartir', 'Con «casos sin asignar», Orion va del más urgente al último y te sugiere a quién: primero quien ya atendió el caso o el equipo (si no está ocupado ni de visita hoy), luego quien cubre la región y, si no, quien tiene menos carga. Di «sí» o el nombre de otra persona.'], ['Misma área', 'Los casos de ingeniería van a ingenieros y los de química a químicos. Si el nombre se repite, elige a quien sea del área del caso y lo repite completo.'], ['Otra área', 'Pide confirmar el cambio de perfil de atención: el caso cambia de área y queda una nota en la bitácora.'], ['Aprobar demoras', 'Solo en casos de más de 48 horas, con la justificación que dictes.'], ['Cierres del equipo', '«cuántos casos cerré esta semana» te da los tuyos y el total del equipo.']].map(([a, b]) => `<tr><td class="say nowrap">${a}</td><td>${b}</td></tr>`).join('')}</table>
    </div>
      <div class="note-card">${icon('bell')}<div><h3>Aviso a quien recibe</h3><p>Cuando asignas un caso, el Echo de esa persona le avisa: «Te asignaron un caso…», con el cliente, el equipo y cuánto le queda al plazo.</p></div></div>
    </div>
  </div>
`, { section: 'Administración', n: n++ }));

// 7 · Equipo + alarmas
const ALARM_SAMPLES = [
  ['203 · DR1 Collision Detected', 'colisión en el brazo de reactivo 1'],
  ['BR1 Vertical Home Error', 'error de posición inicial vertical del brazo de reactivo 1'],
  ['RR1 Fridge Temperature Warning', 'temperatura fuera de rango en el refrigerador de reactivos'],
  ['BM1 Freq Detection Error', 'falla del detector de nivel del brazo de muestra'],
  ['711', 'obstrucción en el circuito de muestra'],
];
pages.push(page(`
  ${opener('equipo', 'Un analizador', 'Estado del equipo y alarmas', 'Te dice el estado del monitor, la alarma principal en español y en qué parte del equipo está, los controles de la semana y si tiene casos abiertos. El código de alarma solo lo menciona si tú preguntas por él.')}
  ${chips([P('cómo está el nueve nueve nueve nueve', 'cómo está el {serie}'), P('cómo está el equipo de Demo Norte', 'cómo está el equipo de {equipo}'), P('qué le pasa al cero cuatro siete tres', 'qué le pasa al {serie}'), P('qué alarmas tiene el nueve nueve nueve nueve', 'qué alarmas tiene el {serie}'), P('qué equipos están en alarma fatal'), P('qué significa la alarma doscientos tres', 'qué significa la alarma {codigo}')])}
  <div class="split">
    ${bubbles([T('equipo', 0), T('alarmas', 1)], { compact: true })}
    ${echoScreen(T('equipo', 0).screen, 'Echo Show: ficha del equipo')}
  </div>
  <div class="card">${icon('alarm')}<h3>Del monitor a tu idioma</h3><p>Orion convierte el texto del firmware en una frase en español y nombra la pieza: brazo de reactivo 1 o 2, brazo de muestra, agitadores y rotores.</p>
    <table class="x"><tr><th>En el monitor</th><th></th><th>Lo que oyes</th></tr>${ALARM_SAMPLES.map(([a, b]) => `<tr><td class="code">${esc(a)}</td><td class="arrow">→</td><td class="say">«${esc(b)}»</td></tr>`).join('')}</table>
  </div>
`, { section: 'Equipo', n: n++ }));

// 8 · Controles, calibración, curva
const RULES = [
  ['1-3s', 'quedó a más de 3 desviaciones estándar de la media'],
  ['2-2s', '2 resultados seguidos quedaron a más de 2 desviaciones estándar del mismo lado'],
  ['R-4s', 'entre dos controles de la misma corrida hay más de 4 desviaciones estándar de diferencia'],
  ['4-1s', '4 resultados seguidos quedaron a más de 1 desviación estándar del mismo lado'],
  ['10x', '10 resultados seguidos quedaron del mismo lado de la media'],
];
pages.push(page(`
  ${opener('controles', 'Calidad analítica', 'Controles, calibraciones y curvas', 'Lee los blancos, calibraciones y controles que publica el monitor del equipo. Explica cada rechazo en palabras: el valor, la media y a cuántas desviaciones estándar quedó.')}
  ${chips([P('pasaron los controles'), P('cómo salió el control de glucosa', 'cómo salió el control de {prueba}'), P('hay controles rechazados'), P('cuándo se calibró glucosa', 'cuándo se calibró {prueba}'), P('cómo quedó la calibración de colesterol', 'cómo quedó la calibración de {prueba}'), P('muéstrame la curva de reacción de glucosa', 'muéstrame la curva de reacción de {prueba}')])}
  <div class="split">
    ${bubbles(ex.controles, { compact: true })}
    ${echoScreen(T('controles', 2).screen, 'Echo Show: curva de reacción por réplica')}
  </div>
  <div class="card">${icon('flask')}<h3>Reglas de Westgard, en palabras</h3><p>Orion no dice «uno tres ese»: explica qué pasó con el control.</p>
    <table class="x"><tr><th>Regla</th><th></th><th>Lo que oyes</th></tr>${RULES.map(([a, b]) => `<tr><td class="code">${a}</td><td class="arrow">→</td><td class="say">«${b}»</td></tr>`).join('')}</table>
  </div>
`, { section: 'Controles', n: n++ }));

// 9 · DRI flow
pages.push(page(`
  ${opener('dri', 'Diagnóstico diferencial', 'El DRI, por voz', 'Es el mismo motor de diagnóstico de Orion web. Cruza lo que dices con las alarmas, los controles del equipo y el respaldo SAT. Ordena las causas por certeza, baja el peso de las que también usan las pruebas que salen bien —sin descartarlas— y te dice qué prueba directa las confirma o las descarta.')}
  <figure class="flow">
    <svg viewBox="0 0 720 300" aria-hidden="true">
      <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" fill="#8c99a6"/></marker></defs>
      ${[['Lo que dices', '«glucosa fuera, colesterol bien»', 20, 20], ['Alarmas', 'estado y bitácora del monitor', 20, 92], ['Controles del equipo', 'blancos, calibraciones, controles', 20, 164], ['Respaldo SAT', 'lotes y controles importados', 20, 236]]
        .map(([t, d, x, y]) => `<g><rect x="${x}" y="${y}" width="190" height="52" rx="12" fill="#fff" stroke="rgba(124,136,149,.25)"/><text x="${x + 14}" y="${y + 22}" class="ft">${t}</text><text x="${x + 14}" y="${y + 39}" class="fd">${d}</text><path d="M${x + 190} ${y + 26} C 250 ${y + 26}, 250 150, 268 150" stroke="#8c99a6" fill="none" marker-end="url(#a)"/></g>`).join('')}
      <g><rect x="272" y="104" width="150" height="92" rx="16" fill="#071927"/><circle cx="347" cy="132" r="10" fill="none" stroke="#3fd2e4" stroke-width="2"/><text x="347" y="166" text-anchor="middle" class="ftw">Motor DRI</text><text x="347" y="182" text-anchor="middle" class="fdw">mismas reglas que la web</text></g>
      <path d="M422 150 H 452" stroke="#8c99a6" marker-end="url(#a)"/>
      ${[['Causas con certeza', 'hasta 85 % sin prueba directa', 456, 20, '#f32735'], ['Contraste', 'pierde peso, no se descarta', 456, 92, '#f2b54a'], ['Prueba directa', 'Photometry, bombas, temperatura', 456, 164, '#1f6f8a'], ['Verificación guiada', 'confirma o descarta, con sí / no', 456, 236, '#7a5cff']]
        .map(([t, d, x, y, c]) => `<g><rect x="${x}" y="${y}" width="200" height="52" rx="12" fill="#fff" stroke="rgba(124,136,149,.25)"/><rect x="${x}" y="${y + 12}" width="4" height="28" rx="2" fill="${c}"/><text x="${x + 16}" y="${y + 22}" class="ft">${t}</text><text x="${x + 16}" y="${y + 39}" class="fd">${d}</text></g>`).join('')}
      <path d="M656 288 C 700 288, 700 20, 660 20" stroke="#f32735" stroke-dasharray="4 4" fill="none" marker-end="url(#a)"/>
      <text x="700" y="160" class="fr" transform="rotate(90 700 160)" text-anchor="middle">«ya quedó» → el DRI aprende</text>
    </svg>
  </figure>
  ${chips([P('diagnostica el cero cuatro siete tres', 'diagnostica el {serie}'), P('el cero cuatro siete tres tiene glucosa fuera de control', 'el {serie} tiene {pa} fuera de control'), P('glucosa y colesterol salen fuera', '{pa} y {pb} salen fuera'), P('colesterol triglicéridos y ácido úrico salen bien', '{pa} {pb} y {pc} salen bien'), P('también falla urea', 'también falla {pa}'), P('por qué'), P('qué más podría ser')])}
  <div class="grid2">
    ${card('Cómo describir la falla', '<ul><li>Di qué pruebas salen fuera y en qué equipo.</li><li>Di también cuáles salen bien: cada prueba buena que comparte filtro, reactivo o paso con la que falla le baja el peso a esa causa.</li><li>Si Orion propone una prueba para distinguir, te dice qué comparte con la que falla y qué significa que salga bien o mal.</li></ul>', 'brain')}
    ${card('Cómo leer la certeza', '<ul><li>«Lo más probable, con 60 por ciento de certeza…»: la primera causa. Sin una prueba directa del equipo, ninguna pasa de 85 por ciento.</li><li>«Casi seguro es…»: solo cuando una prueba directa, como Photometry, ya lo confirmó.</li><li>«La segunda opción…»: la siguiente causa, para comparar.</li><li>«Pierde peso…»: otras pruebas que usan ese factor salen bien. Sigue en la lista hasta que la prueba directa lo resuelva.</li></ul>', 'check')}
  </div>
  <div class="callout">${icon('alarm')}<div><b>El contraste no descarta.</b> Si glucosa falla y colesterol, triglicéridos y ácido úrico salen bien, el filtro de 505 nanómetros se vuelve menos probable, pero no queda fuera: un filtro degradado o una posición intermitente puede afectar a una prueba y no a otras. Por eso Orion lo deja en la lista y te dice cómo resolverlo: la utilidad Photometry y la línea base miden cada longitud de onda directamente.</div></div>
`, { section: 'Diagnóstico', n: n++ }));

// 10 · DRI example
/** Percentage of a hypothesis bar on the diagnosis screen of turn i ("óptica", "control"). */
const bar = (i, word) => String(T('diagnostico', i).screen.bars.find((x) => x.label.toLowerCase().includes(word))?.value ?? '?').replace('%', '');
pages.push(page(`
  ${opener('ejemplo', 'Ejemplo real', 'Un diagnóstico de principio a fin', 'Glucosa sale fuera en el BA400 terminación 9999. Orion revisa el equipo, propone causas y, cuando le dices qué pruebas salen bien, el filtro de 505 nanómetros pierde peso sin salir de la lista.')}
  <div class="split wide-left">
    <div class="stack"><div class="ctx">Antes: «${esc(T('diagnostico', 0).user)}». Orion describe el equipo y termina con «¿Quieres que lo diagnostique?».</div>${bubbles(ex.diagnostico.slice(1), { compact: true })}</div>
    <div class="stack">${echoScreen(T('diagnostico', 1).screen, 'Primero: causas con certeza')}${echoScreen(T('diagnostico', 2).screen, 'Después: la óptica baja, sigue listada')}</div>
  </div>
  <div class="callout soon">${icon('brain')}<div><b>Qué cambió entre las dos pantallas.</b> Al principio la causa óptica casi empataba con el control (${bar(1, 'óptica')} contra ${bar(1, 'control')} por ciento). Colesterol, triglicéridos y ácido úrico también se leen con el filtro de 505 nanómetros y salen bien, así que la óptica baja a ${bar(2, 'óptica')} por ciento, pero sigue en la lista. El control sube a ${bar(2, 'control')}, el máximo sin una prueba directa: se confirma con la verificación guiada y, si no lo explica, el siguiente paso es Photometry.</div></div>
`, { section: 'Diagnóstico', n: n++ }));

// 11 · Guided verification + closing
pages.push(page(`
  ${opener('guia', 'Manos libres', 'Verificación guiada y cierre', 'Cada paso trae una instrucción clara y una pregunta de sí o no. Tu respuesta dice si la causa se confirma o se descarta. Al final dices si se resolvió y Orion lo registra para que el DRI aprenda.')}
  <div class="split">
    <div>${bubbles([...ex.guia, ex.cierre[0]], { compact: true })}</div>
    <div class="stack">${echoScreen(T('guia', 0).screen, 'Echo Show: paso de verificación')}
      ${chips([P('guíame'), P('guíame en la segunda', 'guíame en la {ordinal}'), P('siguiente', null), P('anterior', null), P('repite', null), P('ya quedó'), P('no se resolvió'), P('se resolvió a medias'), P('lo resolví cambiando la lámpara', 'lo resolví {accion}')], 'tight')}
    </div>
  </div>
  <div class="callout">${icon('bell')}<div>Unas 20 horas después de un diagnóstico sin resultado, Orion te deja un aviso: «¿Se resolvió?». Así cada caso real mejora el motor.</div></div>
`, { section: 'Verificación', n: n++ }));

// 12 · Inserto y lotes
const DATOS = [
  ['estabilidad', 'a bordo, abierto'],
  ['interferencias', 'hemólisis, bilirrubina, lipemia'],
  ['linealidad', 'rango de medición'],
  ['límite de detección', 'sensibilidad'],
  ['precisión', 'coeficiente de variación'],
  ['blanco', 'absorbancia del blanco'],
  ['caducidad', 'por lote'],
];
pages.push(page(`
  ${opener('inserto', 'Reactivos', 'Inserto y lotes', 'Datos del inserto y del certificado de cada lote (einfo.bio): estabilidad a bordo, interferencias, linealidad, límites de detección, precisión, blanco y caducidad.')}
  ${chips([P('cuánto dura colesterol a bordo', 'cuánto dura {prueba} a bordo'), P('qué interfiere con glucosa', 'qué interfiere con {prueba}'), P('cuál es la linealidad de glucosa', 'cuál es la {dato} de {prueba}'), P('dime el blanco de colesterol', 'dime el {dato} de {prueba}'), P('qué lotes de glucosa hay', 'qué lotes de {prueba} hay'), P('cuándo caduca el lote cinco de glucosa', 'cuándo caduca el lote {lote} de {prueba}')])}
  <div class="split">
    ${bubbles(ex.inserto, { compact: true })}
    <div class="stack">${echoScreen(T('inserto', 1).screen, 'Echo Show: ficha del reactivo')}
      <div class="card">${icon('book')}<h3>Lo que puedes pedir del inserto</h3>
        <table class="x">${DATOS.map(([a, b]) => `<tr><td class="say">${a}</td><td>${b}</td></tr>`).join('')}</table>
      </div>
    </div>
  </div>
`, { section: 'Inserto', n: n++ }));

// 13 · New cases, parts and drafts
pages.push(page(`
  ${opener('borradores', 'Acciones', 'Casos nuevos, refacciones y borradores', 'Un caso nuevo se crea al decir «sí», con el mismo número y la misma asignación automática que en Orion web. Las refacciones, y todo lo que guardes como «borrador», esperan en la pestaña Alexa de Orion web.')}
  ${chips([P('abre un ticket por alarma de temperatura del rotor', 'abre un ticket por {motivo}'), P('pide dos lámparas halógenas', 'pide {pieza}'), P('qué borradores tengo'), P('dicta una nota'), P('anota cambié la lámpara y calibré glucosa', 'anota {texto}'), P('es todo')])}
  <div class="split">
    ${bubbles(ex.borradores.slice(1), { compact: true })}
    <div class="panel">
      <div class="panel-head"><small>ORION · ALEXA</small><b>Por aprobar <i>2</i></b></div>
      ${[['REFACCIÓN', '2 × lámparas halógenas · BA400 ···0473'], ['LLAMADA · BORRADOR', 'El cliente confirma que ya enciende · Laboratorio Demo Centro ···0473']]
        .map(([k, t]) => `<div class="panel-item"><div><small>${k}</small><p>${t}</p></div><span class="btn">Aprobar</span><span class="btn ghost">Descartar</span></div>`).join('')}
      <p class="panel-foot">Aprobar aplica cada borrador por el camino de su módulo. Un cierre o una primera respuesta guardados como borrador te piden confirmar el WhatsApp antes de aplicarse.</p>
    </div>
  </div>
  <div class="note-card">${icon('pencil')}<div><h3>Notas largas</h3><p>Después del detalle de un caso, di «dicta una nota». Luego «anota» y lo que hiciste, cuantas veces quieras. Al decir «es todo», Orion junta las líneas en un solo avance y te pregunta «sí», «no» o «borrador».</p></div></div>
`, { section: 'Borradores', n: n++ }));

// 14 · Avisos + navegación
const NAV = [['sí / no', 'Acepta o rechaza lo que Orion propone, o contesta un paso de la guía.'], ['siguiente / anterior', 'Avanza o regresa en listas y en la verificación guiada.'], ['repite', 'Repite la última respuesta.'], ['repíteme los reportes', 'Vuelve a leer la lista de casos.'], ['ayuda', 'Te dice todo lo que puede hacer.'], ['qué encontraste', 'Si un análisis tardó, te da el resultado.'], ['adiós / cancela', 'Cierra la skill.']];
for (const say of ['repíteme los reportes', 'qué encontraste', 'adiós', 'cancela']) P(say);
const ALERTS = [
  ['Caso de Falcon', 'A 8, 4 y 1 hora de vencer, y cuando vence.'],
  ['Otro caso tuyo', 'A 8 horas de vencer, y cuando vence.'],
  ['Alarma fatal', 'Cuando un equipo tuyo entra en alarma fatal.'],
  ['Control rechazado', 'Cuando se rechaza un control en un equipo tuyo.'],
  ['Caso asignado', 'Cuando alguien, o el reparto automático de Orion, te asigna un caso.'],
  ['Seguimiento', 'Unas 20 horas después de un diagnóstico: «¿se resolvió?».'],
];
pages.push(page(`
  ${opener('avisos', 'Sin estar pendiente', 'Avisos', 'Cada 5 minutos Orion revisa, con tus permisos, tus casos y tus equipos: los de tus casos abiertos y tu planeación de la semana (si eres administrador, toda la flota). Cuando hay algo nuevo, tu Echo te avisa.')}
  <div class="split">
    <div class="stack">${chips([P('qué avisos tengo'), P('enterado'), P('activa los avisos'), P('desactiva los avisos')])}${bubbles(ex.avisos.slice(0, 2), { compact: true })}
      <div class="note-card">${icon('calendar')}<div><h3>Horario de silencio</h3><p>De 8 de la noche a 7 de la mañana Orion guarda los avisos sin hacer sonar tu Echo; lo cambias en Orion web, pestaña Alexa. Lo crítico suena siempre: un caso vencido o a una hora de vencer y una alarma fatal. Lo demás suena como máximo una vez cada 30 minutos.</p></div></div>
    </div>
    <div class="card">${icon('bell')}<h3>Qué te avisa y cuándo</h3>
      <table class="x">${ALERTS.map(([a, b]) => `<tr><td class="say">${a}</td><td>${b}</td></tr>`).join('')}</table>
    </div>
  </div>
  <div class="card">${icon('compass')}<h3>Para moverte en la conversación</h3>
    <div class="grid2 tight">${[NAV.slice(0, 4), NAV.slice(4)].map((rows) => `<table class="x">${rows.map(([k, v]) => `<tr><td class="say nowrap">«${k}»</td><td>${v}</td></tr>`).join('')}</table>`).join('')}</div>
  </div>
`, { section: 'Avisos', n: n++ }));

// 15 · Tips + security
const TROUBLE = [
  ['Orion dice «No te entendí».', `Usa una frase de esta guía. Si estaban hablando de un caso, di «${P('cómo vamos con el reporte')}» o la terminación del equipo.`],
  ['Te pide vincular el dispositivo.', 'Escribe en Orion web, pestaña Alexa, el código que te dicta (página %%Pvincular%%). Vence en 10 minutos.'],
  ['No reconoce el equipo.', 'Di los cuatro últimos dígitos de la serie, uno por uno, o el nombre del cliente.'],
  ['Tu Echo no te avisa nada.', 'Permite las notificaciones de Orion en la app de Alexa y di «activa los avisos».'],
  ['El aviso de Alexa+ se corta.', 'Orion sigue abierto: continúa diciendo «Alexa,» y tu instrucción, por ejemplo «Alexa, mis casos».'],
  ['Una respuesta tardó.', 'Di «qué encontraste» y Orion te da el resultado del análisis.'],
];
pages.push(page(`
  ${opener('consejos', 'Para que todo fluya', 'Consejos y seguridad', '')}
  <div class="grid2">
    ${card('Si no te entiende', '<ul><li>Di el nombre completo: «Alexa, abre servicio orión».</li><li>Crea la rutina «Alexa, Orión» en la app de Alexa.</li><li>Di la terminación número por número: «cero cuatro siete tres».</li><li>Para casos, usa «reporte», «caso» o «ticket».</li></ul>', 'mic')}
    ${card('Con Alexa+', '<ul><li>El aviso «Di Alexa, sal…» es de Alexa+, no de Orion, y no se puede quitar. Cambiar la palabra de activación tampoco lo evita.</li><li>Si el aviso se corta, Orion sigue abierto: continúa diciendo «Alexa,» y lo que necesitas, por ejemplo «Alexa, cómo vamos».</li></ul>', 'spark')}
    ${card('Lo que Orion sí ve', '<ul><li>Solo lo que tu cuenta ve en Orion: un técnico oye sus casos; un administrador, toda la flota.</li><li>Nunca menciona resultados de pacientes: solo blancos, calibradores y controles.</li></ul>', 'shield')}
    ${card('Lo que Orion no hace solo', '<ul><li>No crea tickets, solicitudes ni notas sin tu aprobación en Orion web.</li><li>No da consejo clínico: su terreno es el diagnóstico técnico del equipo y del reactivo.</li></ul>', 'check')}
  </div>
  <div class="card">${icon('compass')}<h3>Si algo no sale</h3>
    <table class="x"><tr><th>Si pasa esto</th><th>Haz esto</th></tr>${TROUBLE.map(([a, b]) => `<tr><td class="say">${a}</td><td>${b}</td></tr>`).join('')}</table>
  </div>
`, { section: 'Consejos', n: n++ }));

// Page references (%%Pcasos%% → the page that opens the section with that key).
for (let i = 0; i < pages.length; i++) pages[i] = pages[i].replace(/%%P(\w+?)%%/g, (_, key) => String(toc.find((t) => t.key === key)?.n ?? '?'));

// 16 · Back cover
pages.push(`<section class="page back">
  <img class="back-logo" src="${asset('imagotipo.png')}" alt="Orion by Medinova"/>
  <p class="back-line">Orión en línea. ¿Qué revisamos?</p>
  <div class="back-say">${['cómo vamos', 'cómo está el cero cuatro siete tres', 'diagnostica el nueve nueve nueve nueve', 'cómo vamos con el reporte', 'qué avisos tengo'].map((s) => `<span>«${s}»</span>`).join('')}</div>
  <p class="back-foot">Biosystems · Medinova · Guía de voz de Orion · octubre 2026</p>
</section>`);

if (missing.length) {
  console.error('Phrases not in the interaction model:\n - ' + [...new Set(missing)].join('\n - '));
  process.exit(1);
}

// ── Styles ───────────────────────────────────────────────────────────────────
const CSS = `
@page { size: 8.5in 11in; margin: 0; }
:root { --red:#f32735; --red-deep:#751f28; --ink:#17202b; --ink2:#5d6674; --ink3:#818b98; --pearl:#f6f9fb; --line:rgba(124,136,149,.18); --cyan:#3fd2e4; --cyan-ink:#1f6f8a; --deep:#071927; --deep2:#0b2638; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #dfe6ec; }
body { font-family: 'Alliance No.2', sans-serif; color: var(--ink); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1, h2, h3, h4, .num, .sn { font-family: 'Alliance No.2', sans-serif; }
.page { width: 8.5in; height: 11in; position: relative; overflow: hidden; page-break-after: always; break-after: page;
  background: radial-gradient(circle at 92% 6%, rgba(105,221,224,.16), transparent 34%), radial-gradient(circle at 4% 96%, rgba(243,39,53,.07), transparent 38%), linear-gradient(180deg, #f8fbfd, #eef3f7); }
.page:last-child { page-break-after: auto; break-after: auto; }
.ph { position: absolute; top: .42in; left: .6in; right: .6in; display: flex; align-items: center; gap: 10px; font-size: 8.5px; letter-spacing: .28em; color: var(--ink3); font-weight: 700; }
.ph img { width: 22px; height: 22px; }
.ph-grow, .pf-grow, .es-grow { flex: 1; }
.ph-sec { color: var(--red); }
.ph::after { content: ''; position: absolute; left: 0; right: 0; bottom: -10px; height: 1px; background: linear-gradient(90deg, var(--red) 0 48px, var(--line) 48px); }
.pc { position: absolute; top: .95in; left: .6in; right: .6in; bottom: .75in; display: flex; flex-direction: column; gap: 14px; }
.pf { position: absolute; bottom: .38in; left: .6in; right: .6in; display: flex; align-items: center; gap: 14px; font-size: 8.5px; color: var(--ink3); letter-spacing: .06em; }
.pf b { font-family: 'Alliance No.2'; color: var(--ink); font-size: 10px; min-width: 18px; text-align: right; }
.opener { display: flex; gap: 18px; align-items: flex-start; }
.opener .num { font-size: 54px; font-weight: 200; line-height: .9; color: var(--red); letter-spacing: -.02em; }
.opener small { font-size: 9px; letter-spacing: .3em; text-transform: uppercase; color: var(--cyan-ink); font-weight: 700; }
.opener h2 { font-size: 27px; font-weight: 600; letter-spacing: -.01em; margin: 2px 0 6px; }
.lead { font-size: 11.4px; line-height: 1.55; color: var(--ink2); max-width: 6.2in; }
.chips { display: flex; flex-wrap: wrap; gap: 6px 7px; }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px 5px 8px; border-radius: 999px; background: rgba(255,255,255,.9); border: 1px solid var(--line); box-shadow: 0 4px 12px rgba(104,116,133,.08); font-size: 10px; font-weight: 600; color: var(--ink); }
.chip .ic { width: 12px; height: 12px; color: var(--red); }
.chips.tight .chip { font-size: 9px; padding: 4px 9px 4px 7px; }
.ic { width: 18px; height: 18px; flex: none; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.card { background: rgba(255,255,255,.82); border: 1px solid var(--line); border-radius: 18px; padding: 14px 16px; box-shadow: 0 14px 34px rgba(104,116,133,.10); display: flex; flex-direction: column; gap: 8px; }
.card > .ic, .card-ic .ic { color: var(--red); width: 22px; height: 22px; }
.card h3 { font-size: 13px; font-weight: 600; }
.card p, .card li { font-size: 10px; line-height: 1.5; color: var(--ink2); }
.card ul { padding-left: 14px; display: grid; gap: 4px; }
.callout { display: flex; gap: 12px; align-items: flex-start; padding: 12px 16px; border-radius: 16px; background: linear-gradient(90deg, rgba(243,39,53,.07), rgba(255,255,255,.7)); border: 1px solid rgba(243,39,53,.18); font-size: 10.2px; line-height: 1.5; color: var(--ink); }
.callout .ic { color: var(--red); }
.callout.soon { background: linear-gradient(90deg, rgba(63,210,228,.10), rgba(255,255,255,.7)); border-color: rgba(31,111,138,.2); }
.callout.soon .ic { color: var(--cyan-ink); }
.split { display: grid; grid-template-columns: 1.05fr .95fr; gap: 16px; align-items: start; }
.split.wide-left { grid-template-columns: 1.15fr .85fr; }
.stack { display: flex; flex-direction: column; gap: 12px; }
/* chat */
.chat { display: flex; flex-direction: column; gap: 7px; }
.msg { max-width: 92%; border-radius: 14px; padding: 8px 11px 9px; font-size: 9.6px; line-height: 1.5; }
.msg .who { display: flex; align-items: center; gap: 5px; font-size: 7.4px; letter-spacing: .24em; text-transform: uppercase; font-weight: 800; margin-bottom: 3px; }
.msg.you { align-self: flex-end; background: #fff; border: 1px solid var(--line); border-right: 3px solid var(--red); color: var(--ink); }
.msg.you .who { color: var(--red); justify-content: flex-end; }
.msg.orion { align-self: flex-start; background: linear-gradient(160deg, #0b2638, #071927); color: #eaf6f8; border: 1px solid rgba(105,221,224,.22); }
.msg.orion .who { color: var(--cyan); }
.msg.orion .who img { width: 13px; height: 13px; }
.chat.compact .msg { font-size: 9px; padding: 7px 10px 8px; }
/* echo show */
.echo { display: flex; flex-direction: column; align-items: center; gap: 0; }
.echo-body { width: 100%; aspect-ratio: 16 / 10.6; border-radius: 16px; padding: 9px; background: linear-gradient(160deg, #2a3038, #11151a); box-shadow: 0 22px 44px rgba(7,25,39,.35), inset 0 1px 0 rgba(255,255,255,.12); }
.echo-screen { width: 100%; height: 100%; border-radius: 9px; overflow: hidden; container-type: inline-size; }
.echo-base { width: 46%; height: 12px; margin-top: -2px; border-radius: 0 0 14px 14px; background: linear-gradient(180deg, #1c2127, #0d1013); }
.echo figcaption, figure.echo figcaption { margin-top: 8px; font-size: 8.4px; letter-spacing: .2em; text-transform: uppercase; color: var(--ink3); font-weight: 700; }
.es { width: 100%; height: 100%; background-size: cover; background-position: center; color: #eef3f7; position: relative; font-size: 2.1cqh; padding: 0; }
.es-head { display: flex; align-items: center; gap: 1.6cqw; padding: 4cqh 5cqw 0; }
.es-head img { width: 8cqh; height: 8cqh; }
.es-head b { display: block; font-family: 'Alliance No.2'; font-size: 2.5cqh; letter-spacing: .7cqh; font-weight: 500; }
.es-head i { display: block; font-style: normal; font-size: 1.7cqh; letter-spacing: .35cqh; color: var(--cyan); margin-top: .4cqh; }
.es-clock { text-align: right; }
.es-clock b { font-size: 4.4cqh; font-weight: 200; letter-spacing: 0; }
.es-clock i { color: #6f8191; font-size: 1.5cqh; letter-spacing: .2cqh; }
.es-divider { display: flex; align-items: center; gap: .6cqw; margin: 2cqh 5cqw 0; }
.es-divider span:nth-child(1) { width: 5cqw; height: .35cqh; background: var(--cyan); }
.es-divider span:nth-child(2) { flex: 1; height: 1px; background: rgba(167,182,196,.16); }
.es-divider span:nth-child(3) { width: 1.2cqh; height: 1.2cqh; border-radius: 50%; border: 1px solid var(--cyan); }
.es-content { padding: 3cqh 5cqw 0; display: flex; flex-direction: column; gap: 1.3cqh; }
.es h4 { font-family: 'Alliance No.2'; font-weight: 200; font-size: 4.3cqh; line-height: 1.15; }
.es h4.big { font-size: 6cqh; }
.es h4.mid { font-size: 3.6cqh; color: #a7b6c4; }
.es-sub { font-size: 2.1cqh; color: #a7b6c4; }
.es small, .es-label { display: block; font-size: 1.55cqh; letter-spacing: .26cqh; color: #6f8191; }
.es-card { background: rgba(12,20,30,.74); border: 1px solid rgba(120,200,220,.16); border-radius: 1.8cqh; }
.es-tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.4cqw; margin-top: 1.4cqh; }
.es-tile { position: relative; padding: 2cqh 1.2cqw 1.6cqh; }
.es-tile .es-bar { position: absolute; top: 0; left: 1.2cqw; width: 3.5cqw; height: .45cqh; }
.es-tilerow { display: flex; align-items: center; justify-content: space-between; }
.es-tilerow b { font-family: 'Alliance No.2'; font-weight: 200; font-size: 7cqh; }
.es-tilerow svg { width: 6.5cqh; height: 6.5cqh; }
.es-tile em { font-style: normal; font-size: 1.5cqh; color: #a7b6c4; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.es-row { display: flex; align-items: center; gap: 1cqw; font-size: 2.2cqh; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.es-row > span { width: 1.3cqh; height: 1.3cqh; border-radius: 50%; flex: none; }
.es-row i { font-style: normal; font-size: 1.5cqh; letter-spacing: .2cqh; }
.es-eqhead { display: flex; justify-content: space-between; align-items: flex-start; gap: 2cqw; }
.es-chip { display: inline-flex; align-items: center; gap: .7cqw; padding: 1cqh 1.5cqw; border: 1px solid; border-radius: 3cqh; font-size: 1.9cqh; letter-spacing: .28cqh; font-weight: 600; white-space: nowrap; margin-top: 2cqh; }
.es-chip span { width: 1.2cqh; height: 1.2cqh; border-radius: 50%; }
.es-facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.2cqw; margin-top: 1.4cqh; }
.es-facts .es-card { padding: 1.6cqh 1.2cqw; }
.es-facts b { display: block; font-weight: 300; font-size: 2.4cqh; margin-top: .6cqh; }
.es-hyp { display: flex; align-items: center; gap: 1cqw; padding: 1.3cqh 2cqw 1.3cqh 0; }
.es-hyp .n { font-family: 'Alliance No.2'; font-weight: 200; font-size: 3.6cqh; width: 7cqw; text-align: center; }
.es-hyp > div { flex: 1; min-width: 0; }
.es-hyptop { display: flex; justify-content: space-between; gap: 1cqw; font-size: 2.3cqh; }
.es-hyptop span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.es-hyptop em { font-style: normal; }
.es-track { height: .6cqh; border-radius: .3cqh; background: rgba(167,182,196,.14); margin: .9cqh 0 .6cqh; }
.es-track span { display: block; height: 100%; border-radius: .3cqh; }
.es-hyp small { letter-spacing: 0; font-size: 1.6cqh; color: #a7b6c4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.es-note { font-size: 1.9cqh; }
.es-dots { display: flex; gap: .5cqw; }
.es-dots span { width: 3.2cqw; height: .5cqh; border-radius: .25cqh; }
.es-proc { padding: 3cqh 2.6cqw; font-size: 3.4cqh; font-weight: 300; line-height: 1.3; }
.es-plot { padding: 1.4cqh 1.4cqw; display: flex; flex-direction: column; gap: .6cqh; }
.es-plot svg { width: 100%; height: 30cqh; }
.es-legend { display: flex; gap: 2cqw; font-size: 1.8cqh; color: #a7b6c4; }
.es-legend i { display: inline-block; width: 2.4cqw; height: .5cqh; margin-right: .6cqw; vertical-align: middle; }
.es-item { display: flex; align-items: center; padding: 1.4cqh 2cqw 1.4cqh 0; overflow: hidden; }
.es-item .bar { width: .5cqh; align-self: stretch; }
.es-item b { font-family: 'Alliance No.2'; font-weight: 200; font-size: 3.6cqh; width: 7cqw; text-align: center; flex: none; }
.es-item span:last-child { font-size: 2.2cqh; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.es-digits { display: flex; gap: 1.2cqw; margin-top: 3cqh; }
.es-digits span { width: 12cqh; height: 15cqh; display: grid; place-items: center; font-family: 'Alliance No.2'; font-weight: 200; font-size: 9cqh; color: var(--cyan); }
.es-msg { padding: 3cqh 2.4cqw; font-size: 2.8cqh; font-weight: 300; line-height: 1.35; }
.es-hint { position: absolute; left: 5cqw; right: 5cqw; bottom: 3cqh; font-size: 1.6cqh; color: #6f8191; letter-spacing: .1cqh; }
/* linking */
.steps3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.step { background: rgba(255,255,255,.85); border: 1px solid var(--line); border-radius: 18px; padding: 14px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 12px 28px rgba(104,116,133,.09); }
.step .sn { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--red); color: #fff; font-size: 12px; }
.step h3 { font-size: 12.5px; }
.step p { font-size: 9.6px; line-height: 1.5; color: var(--ink2); }
.mini-web { border: 1px solid var(--line); border-radius: 12px; padding: 8px 10px; background: #f6f9fb; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.mini-web small { font-size: 7px; letter-spacing: .24em; color: var(--ink3); font-weight: 700; }
.mini-code { font-family: 'Alliance No.2'; font-size: 15px; letter-spacing: .25em; padding: 4px 8px; border-radius: 8px; background: #fff; border: 1px solid var(--line); }
.mini-btn { font-size: 9px; font-weight: 700; color: #fff; padding: 4px 12px; border-radius: 999px; background: linear-gradient(135deg, #ff4a57, #c81f2c); }
.mini-ok { display: flex; align-items: center; gap: 8px; padding: 10px; border-radius: 12px; background: rgba(76,207,147,.12); border: 1px solid rgba(76,207,147,.35); color: #1f7a54; font-weight: 700; font-size: 10px; }
.mini-ok .ic { color: #1f9d6b; }
.note-card { display: flex; gap: 12px; background: rgba(255,255,255,.85); border: 1px solid var(--line); border-radius: 18px; padding: 14px 16px; }
.note-card .ic { color: var(--red); width: 22px; height: 22px; }
.note-card h3 { font-size: 12px; margin-bottom: 4px; }
.note-card p { font-size: 9.8px; line-height: 1.5; color: var(--ink2); margin-bottom: 10px; }
/* capabilities */
.caps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 11px; }
.cap { background: rgba(255,255,255,.86); border: 1px solid var(--line); border-radius: 18px; padding: 13px 14px; box-shadow: 0 12px 26px rgba(104,116,133,.08); display: flex; flex-direction: column; gap: 6px; }
.cap .ic { width: 24px; height: 24px; color: var(--red); }
.cap h3 { font-size: 12.5px; }
.cap p { font-size: 9.4px; color: var(--ink2); line-height: 1.45; flex: 1; }
.cap-say { font-size: 9px; font-weight: 700; color: var(--cyan-ink); }
/* flow */
.flow svg { width: 100%; height: auto; }
.flow .ft { font: 600 11px 'Alliance No.2'; fill: #17202b; }
.flow .fd { font: 500 9px 'Alliance No.2'; fill: #5d6674; }
.flow .ftw { font: 600 13px 'Alliance No.2'; fill: #eaf6f8; }
.flow .fdw { font: 500 8.5px 'Alliance No.2'; fill: #8bd7ee; }
.flow .fr { font: 700 9px 'Alliance No.2'; fill: #f32735; letter-spacing: .04em; }
/* web panel */
.panel { background: rgba(255,255,255,.9); border: 1px solid var(--line); border-radius: 18px; padding: 14px; box-shadow: 0 14px 30px rgba(104,116,133,.12); display: flex; flex-direction: column; gap: 8px; }
.panel-head small { display: block; font-size: 7.5px; letter-spacing: .24em; color: var(--ink3); font-weight: 700; }
.panel-head b { font-family: 'Alliance No.2'; font-size: 14px; display: flex; align-items: center; gap: 8px; }
.panel-head i { font-style: normal; font-size: 9px; color: var(--red); background: rgba(243,39,53,.1); border: 1px solid rgba(243,39,53,.25); border-radius: 999px; padding: 1px 7px; }
.panel-item { display: grid; grid-template-columns: 1fr auto auto; gap: 6px; align-items: center; border: 1px solid var(--line); border-radius: 12px; padding: 8px 10px; background: #fbfdfe; }
.panel-item small { font-size: 7px; letter-spacing: .2em; color: var(--ink3); font-weight: 700; }
.panel-item p { font-size: 9.2px; font-weight: 600; line-height: 1.35; }
.btn { font-size: 8.5px; font-weight: 700; color: #fff; padding: 5px 10px; border-radius: 999px; background: linear-gradient(135deg, #ff4a57, #c81f2c); white-space: nowrap; }
.btn.ghost { background: #fff; color: var(--ink2); border: 1px solid var(--line); }
.panel-foot { font-size: 8.8px; color: var(--ink2); line-height: 1.45; }
table.nav { width: 100%; border-collapse: collapse; }
table.nav td { font-size: 9.6px; padding: 6px 4px; border-bottom: 1px solid var(--line); vertical-align: top; line-height: 1.4; color: var(--ink2); }
table.nav td:first-child { font-weight: 700; color: var(--ink); white-space: nowrap; width: 38%; }
/* cover & back */
.cover { background: #010103; color: #eef3f7; }
.cover-hero { position: absolute; top: .55in; left: 0; right: 0; height: 5.9in; background-size: 112% auto; background-position: 86% 50%; background-repeat: no-repeat;  }
/* Avoid CSS masks: their PDF soft masks render clipped in macOS Preview. */
.cover-hero::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, #010103 0%, transparent 10%, transparent 78%, #010103 100%); }
.cover-fade { position: absolute; inset: 0; background: radial-gradient(circle at 72% 30%, rgba(105,221,224,.06), transparent 40%), radial-gradient(circle at 20% 92%, rgba(243,39,53,.10), transparent 36%); pointer-events: none; }
.cover-text { position: absolute; left: .75in; right: .75in; bottom: .8in; display: flex; flex-direction: column; gap: 16px; }
.hud { display: flex; align-items: center; gap: 12px; }
.hud span { width: 46px; height: 2px; background: var(--red); }
.hud i { font-style: normal; font-size: 9px; letter-spacing: .4em; color: var(--cyan); font-weight: 700; }
.cover h1 { font-size: 64px; font-weight: 200; letter-spacing: -.02em; line-height: 1; }
.cover-sub { font-size: 14px; line-height: 1.55; color: #a7b6c4; max-width: 5.6in; }
.cover-say { display: inline-flex; align-self: flex-start; align-items: center; gap: 10px; padding: 10px 18px; border-radius: 999px; border: 1px solid rgba(63,210,228,.35); background: rgba(11,38,56,.6); font-size: 13px; }
.cover-say .ic { color: var(--red); }
.cover-say b { color: #fff; }
.cover-meta { display: flex; gap: 22px; font-size: 9px; letter-spacing: .22em; text-transform: uppercase; color: #6f8191; border-top: 1px solid rgba(167,182,196,.18); padding-top: 14px; }
.back { background: radial-gradient(circle at 50% 38%, #0b2638, #04070c 70%); color: #eef3f7; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 26px; }
.back-logo { width: 5in; }
.back-line { font-family: 'Alliance No.2'; font-weight: 200; font-size: 22px; color: #eaf6f8; }
.back-say { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; max-width: 6in; }
.back-say span { font-size: 10px; padding: 6px 12px; border-radius: 999px; border: 1px solid rgba(63,210,228,.3); color: #8bd7ee; }
.back-foot { position: absolute; bottom: .5in; font-size: 8.5px; letter-spacing: .24em; text-transform: uppercase; color: #6f8191; }
/* anatomy of a phrase */
.anatomy { background: linear-gradient(160deg, #0b2638, #071927); border-radius: 20px; padding: 16px 20px 15px; color: #eaf6f8; box-shadow: 0 18px 40px rgba(7,25,39,.22); border: 1px solid rgba(105,221,224,.18); }
.anatomy > small { display: block; font-size: 7.6px; letter-spacing: .32em; color: var(--cyan); font-weight: 800; margin-bottom: 11px; }
.an-row { display: flex; gap: 9px; align-items: flex-start; }
.an-seg { display: flex; flex-direction: column; gap: 7px; }
.an-seg b { font-family: 'Alliance No.2'; font-weight: 300; font-size: 14.5px; white-space: nowrap; }
.an-seg i { height: 3px; border-radius: 2px; }
.an-seg small { font-size: 8.2px; color: #a7b6c4; line-height: 1.35; letter-spacing: .02em; }
/* index refs + legend */
.cap { position: relative; }
.cap-pg { position: absolute; top: 14px; right: 14px; font-size: 7.4px; letter-spacing: .2em; color: var(--ink3); font-weight: 800; }
.legend { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 4px; }
.legend > div { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; padding: 12px 14px; border-radius: 16px; border: 1px dashed rgba(124,136,149,.35); background: rgba(255,255,255,.55); }
.legend p { font-size: 9.2px; line-height: 1.45; color: var(--ink2); }
.lg-bubble { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 12px; background: linear-gradient(160deg, #0b2638, #071927); color: var(--cyan); font-size: 7.6px; letter-spacing: .24em; text-transform: uppercase; font-weight: 800; }
.lg-bubble img { width: 13px; height: 13px; }
.lg-echo { width: 54px; height: 34px; border-radius: 6px; border: 4px solid #1c2127; background: radial-gradient(circle at 30% 30%, #0b2638, #04070c); box-shadow: 0 6px 12px rgba(7,25,39,.25); position: relative; }
.lg-echo::after { content: ''; position: absolute; left: 6px; top: 6px; width: 16px; height: 2px; background: var(--cyan); }
/* tile legend */
.tlegend { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.tl { border-radius: 16px; padding: 12px 13px; background: rgba(255,255,255,.85); border: 1px solid var(--line); box-shadow: 0 10px 22px rgba(104,116,133,.07); }
.tl i { display: block; width: 26px; height: 3px; border-radius: 2px; }
.tl b { display: block; font-size: 8px; letter-spacing: .2em; margin: 8px 0 5px; font-weight: 800; }
.tl p { font-size: 9.1px; line-height: 1.45; color: var(--ink2); }
/* tables */
table.x { width: 100%; border-collapse: collapse; }
table.x th { text-align: left; font-size: 7.4px; letter-spacing: .22em; text-transform: uppercase; color: var(--ink3); padding: 2px 6px 6px 0; font-weight: 800; }
table.x td { font-size: 9.5px; line-height: 1.45; padding: 6px 8px 6px 0; border-top: 1px solid var(--line); color: var(--ink2); vertical-align: top; }
table.x td.code { font-family: 'Alliance No.2'; font-variant-numeric: tabular-nums; font-size: 8.6px; color: var(--ink); white-space: nowrap; }
table.x td.say { color: var(--ink); font-weight: 600; }
table.x td.nowrap { white-space: nowrap; }
table.x td.arrow { color: var(--red); width: 14px; font-weight: 700; }
.grid2.tight { gap: 18px; }
.ctx { font-size: 9px; line-height: 1.45; color: var(--ink2); background: rgba(255,255,255,.6); border: 1px dashed rgba(124,136,149,.4); border-radius: 12px; padding: 7px 11px; }
.card > table.x { margin-top: 2px; }

/* dense diagnosis screens */
.es-content.dense { zoom: .8; }
/* vocabulary */
.vocab { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.vocab > div { padding: 11px 14px; border-radius: 16px; background: rgba(255,255,255,.7); border: 1px solid var(--line); }
.vocab small { font-size: 7.6px; letter-spacing: .26em; color: var(--cyan-ink); font-weight: 800; }
.vocab p { font-size: 9.4px; line-height: 1.45; color: var(--ink2); margin-top: 4px; }
/* request journey */
.travel { padding: 14px 16px 12px; border-radius: 18px; background: rgba(255,255,255,.75); border: 1px solid var(--line); box-shadow: 0 12px 28px rgba(104,116,133,.08); }
.travel > small, .chain > small { display: block; font-size: 7.6px; letter-spacing: .3em; color: var(--cyan-ink); font-weight: 800; margin-bottom: 10px; }
.tr-row, .ch-row { display: flex; align-items: stretch; gap: 6px; }
.tr-node { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.tr-node .ic { color: var(--red); width: 20px; height: 20px; }
.tr-node b { font-family: 'Alliance No.2'; font-size: 11.5px; }
.tr-node p { font-size: 9px; line-height: 1.45; color: var(--ink2); }
.tr-arrow, .ch-arrow { align-self: center; color: var(--red); font-weight: 700; font-size: 13px; }
.tr-foot { margin-top: 9px; padding-top: 8px; border-top: 1px solid var(--line); font-size: 9px; color: var(--ink2); }
/* conversation chain */
.chain { background: linear-gradient(160deg, #0b2638, #071927); border-radius: 20px; padding: 15px 16px 14px; border: 1px solid rgba(105,221,224,.18); box-shadow: 0 18px 40px rgba(7,25,39,.22); }
.chain > small { color: var(--cyan); }
.ch-node { flex: 1; display: flex; flex-direction: column; gap: 4px; padding: 9px 10px; border-radius: 12px; background: rgba(12,20,30,.6); border: 1px solid rgba(120,200,220,.16); }
.ch-node em { font-style: normal; font-size: 7px; letter-spacing: .2em; text-transform: uppercase; color: #6f8191; font-weight: 800; }
.ch-node b { font-size: 10.5px; color: #fff; font-weight: 700; }
.ch-node p { font-size: 8.8px; line-height: 1.4; color: #8bd7ee; }
.chain .ch-arrow { color: #ff6b7a; }

/* sí / no / borrador */
.decide { display: flex; flex-direction: column; gap: 10px; }
.dc-q { display: flex; gap: 12px; align-items: flex-start; padding: 12px 16px; border-radius: 16px; background: linear-gradient(160deg, #0b2638, #071927); color: #eaf6f8; border: 1px solid rgba(105,221,224,.2); }
.dc-q .ic { color: var(--cyan); width: 20px; height: 20px; margin-top: 2px; }
.dc-q small { font-size: 7.4px; letter-spacing: .26em; color: var(--cyan); font-weight: 800; }
.dc-q p { font-size: 10px; line-height: 1.5; margin-top: 3px; }
.dc-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.dc-opt { border-radius: 14px; padding: 10px 12px; background: rgba(255,255,255,.88); border: 1px solid var(--line); border-top: 3px solid var(--c, #818b98); }
.dc-opt.ok { --c: #1f9d6b; } .dc-opt.mute { --c: #818b98; } .dc-opt.warn { --c: #f2b54a; }
.dc-opt b { font-family: 'Alliance No.2'; font-size: 12px; color: var(--ink); }
.dc-opt p { font-size: 9.2px; line-height: 1.45; color: var(--ink2); margin-top: 3px; }
/* closure stepper */
.stepper { display: flex; align-items: stretch; gap: 6px; }
.st { flex: 1; border-radius: 14px; padding: 10px 12px; background: rgba(255,255,255,.88); border: 1px solid var(--line); box-shadow: 0 10px 22px rgba(104,116,133,.07); }
.st b { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--red); color: #fff; font-size: 10px; font-family: 'Alliance No.2'; }
.st h3 { font-size: 11.5px; margin: 6px 0 3px; }
.st p { font-size: 8.8px; line-height: 1.4; color: var(--ink2); }
.st-arrow { align-self: center; color: var(--red); font-weight: 700; }
.card > p { font-size: 9.6px; line-height: 1.5; color: var(--ink2); }

/* PDF viewers built on PDFKit (Vista Previa, the iPhone) draw CSS shadow bitmaps as loose gray blocks, so the print
   has no shadows at all: depth comes from borders. */
*, *::before, *::after { box-shadow: none !important; }
/* PDFKit also leaves white seams inside CSS gradient fills, so the printed surfaces are solid tones of the same colors. */
.msg.orion, .anatomy, .chain, .dc-q, .lg-bubble { background: #09202f !important; }
.echo-body { background: #1b2026 !important; }
.echo-base { background: #15191d !important; }
.mini-btn, .btn:not(.ghost) { background: #e0303e !important; }
.callout { background: #fdf3f4 !important; }
.callout.soon { background: #eef8fa !important; }
.card, .cap, .step, .tl, .panel, .note-card, .travel, .st, .dc-opt, .chip, .legend > div, .vocab > div, .msg.you { border-color: rgba(124,136,149,.26); border-bottom-color: rgba(124,136,149,.42); }

`
  // Chrome prints blank pages with size containers, so the Echo screens use inline-size containers and the
  // height-relative units are converted to width (scaled so the text reads as it does on the device).
  .replace(/([\d.]+)cqh/g, (_, v) => `${+(v * 0.9).toFixed(2)}cqw`);

// Alliance No.2 (Biosystems corporate typeface), embedded from the files Orion serves (Chrome blocks file:// fonts).
const FONT_FACES = [['100 300', 'Light'], ['400', 'Regular'], ['500', 'Medium'], ['600 900', 'SemiBold']]
  .map(([weight, face]) => `@font-face{font-family:'Alliance No.2';font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${readFileSync(join(root, `frontend/public/fonts/alliance/AllianceNo2-${face}.woff2`)).toString('base64')}) format('woff2')}`)
  .join('');

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"/><title>Orion · Guía de voz</title>
<style>${FONT_FACES}${CSS}</style></head><body>${pages.join('\n')}</body></html>`;
const htmlPath = join(here, 'guide.html');
writeFileSync(htmlPath, html);

const out = join(here, 'Orion_Guia_de_Voz.pdf');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pageObj = await browser.newPage();
  await pageObj.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
  await pageObj.evaluate(() => document.fonts.ready);
  await pageObj.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
  // Layout guard: no content may spill below the footer.
  const overflow = await pageObj.evaluate(() => [...document.querySelectorAll('.pc')].map((el, i) => (el.scrollHeight > el.clientHeight + 2 ? i + 2 : 0)).filter(Boolean));
  if (overflow.length) console.warn(`content overflows on pages: ${overflow.join(', ')}`);
} finally {
  await browser.close();
}
console.log(`${pages.length} pages → ${out}`);
