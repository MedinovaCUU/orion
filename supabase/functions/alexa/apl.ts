// ORION · Echo Show screens (APL). Same identity as Orion's monitoring stage: dark cinematic space, dark glass
// panels, instrument cyan for data, amber for "watch", coral red only for risk. One document; the datasource `s`
// picks the layout. Sizes in vh/vw so it scales from Echo Show 5 to 15.

let ASSET_BASE = "";
/** The function serves its own images (assets.generated.ts); index.ts sets the public base URL once. */
export const setAssetBase = (url: string) => (ASSET_BASE = url.replace(/\/$/, ""));

const INK = "#eef3f7", INK2 = "#a7b6c4", INK3 = "#6f8191";
export type Tone = "hud" | "warn" | "risk" | "ok" | "mute";
const TONES: Record<Tone, { color: string; wash: string }> = {
  hud: { color: "#3fd2e4", wash: "rgba(63,210,228,0.10)" },
  warn: { color: "#f2b54a", wash: "rgba(242,181,74,0.11)" },
  risk: { color: "#ff6b7a", wash: "rgba(255,107,122,0.12)" },
  ok: { color: "#7fe0b5", wash: "rgba(127,224,181,0.10)" },
  mute: { color: "#4f6070", wash: "rgba(79,96,112,0.14)" },
};
export const toneColor = (t: Tone) => TONES[t].color;

export function arcPath(frac: number): string {
  const f = Math.max(0, Math.min(1, frac));
  if (f <= 0.001) return "";
  const r = 40, cx = 50, cy = 50;
  if (f >= 0.999) return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}`;
  const a = f * 2 * Math.PI - Math.PI / 2;
  return `M ${cx} ${cy - r} A ${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
}
const TICKS = Array.from({ length: 60 }, (_, i) => {
  const a = (i / 60) * 2 * Math.PI, r1 = i % 5 === 0 ? 45 : 46.5, r2 = 49;
  return `M ${(50 + r1 * Math.cos(a)).toFixed(2)} ${(50 + r1 * Math.sin(a)).toFixed(2)} L ${(50 + r2 * Math.cos(a)).toFixed(2)} ${(50 + r2 * Math.sin(a)).toFixed(2)}`;
}).join(" ");
const CIRCLE = "M 50 10 A 40 40 0 1 1 49.99 10";

/** Plain text of an SSML answer (for the generic screen). */
export const plain = (ssml: string) =>
  ssml.replace(/<break[^>]*>/g, " · ").replace(/<[^>]+>/g, "").replace(/\s+·\s+·\s+/g, " · ").replace(/\s+/g, " ").replace(/Orión/g, "Orion").trim();

// ── Screen model ─────────────────────────────────────────────────────────────
export interface Tile { label: string; value: string; hint: string; tone: Tone; frac: number }
export interface Row { text: string; tone: Tone; tag?: string }
export interface Fact { k: string; v: string; tone?: Tone }
export interface Bar { label: string; detail: string; frac: number; tone: Tone; value: string }
export interface Series { label: string; tone: Tone; points: Array<[number, number]> }
export type Visual =
  | { layout: "briefing"; kicker: string; title: string; subtitle: string; tiles: Tile[]; rows: Row[]; hint?: string }
  | { layout: "equipment"; kicker: string; label: string; title: string; subtitle: string; chip: { text: string; tone: Tone }; facts: Fact[]; rows: Row[]; hint?: string }
  | { layout: "diagnosis"; kicker: string; title: string; subtitle: string; bars: Bar[]; note?: { text: string; tone: Tone }; hint?: string }
  | { layout: "procedure"; kicker: string; title: string; step: number; total: number; body: string; caution?: string; hint?: string }
  | { layout: "chart"; kicker: string; title: string; subtitle: string; series: Series[]; xLabel: string; yLabel: string; facts: Fact[]; hint?: string }
  | { layout: "list"; kicker: string; title: string; subtitle: string; items: Row[]; offset: number; rest: number; hint?: string }
  | { layout: "code"; kicker: string; title: string; subtitle: string; digits: string[]; hint?: string }
  | { layout: "message"; kicker: string; title: string; body: string; hint?: string };

/** Polylines on a 400×200 canvas (AVG), y up. Each series keeps its own colour. */
function chartPaths(series: Series[]) {
  const all = series.flatMap((s) => s.points);
  if (!all.length) return { paths: [], grid: "" };
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y1 - y0 < 1e-9) { y0 -= 0.5; y1 += 0.5; }
  const pad = (y1 - y0) * 0.08;
  y0 -= pad; y1 += pad;
  const X = (x: number) => (x1 === x0 ? 200 : ((x - x0) / (x1 - x0)) * 392 + 4);
  const Y = (y: number) => 196 - ((y - y0) / (y1 - y0)) * 192;
  const paths = series.map((s) => ({
    d: s.points.map((p, i) => `${i ? "L" : "M"} ${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(" "),
    color: toneColor(s.tone),
    label: s.label,
  }));
  const grid = [0.25, 0.5, 0.75].map((f) => `M 0 ${(200 * f).toFixed(0)} L 400 ${(200 * f).toFixed(0)}`).join(" ");
  return { paths, grid, yMin: y0 + pad, yMax: y1 - pad };
}

export function datasource(v: Visual) {
  const date = new Date().toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", weekday: "long", day: "numeric", month: "long" }).toUpperCase();
  const base: Record<string, unknown> = { layout: v.layout, kicker: v.kicker.toUpperCase(), title: v.title, subtitle: "", hint: v.hint ?? "", date, bg: `${ASSET_BASE}/bg.jpg`, logo: `${ASSET_BASE}/orion.png` };
  const fact = (f: Fact) => ({ ...f, color: toneColor(f.tone ?? "hud") });
  const row = (r: Row) => ({ ...r, tag: r.tag ?? "", color: toneColor(r.tone) });
  switch (v.layout) {
    case "briefing":
      return { ...base, subtitle: v.subtitle, tiles: v.tiles.map((t) => ({ ...t, color: toneColor(t.tone), arc: arcPath(t.frac) })), rows: v.rows.map(row) };
    case "equipment":
      return { ...base, label: v.label.toUpperCase(), subtitle: v.subtitle, chip: { text: v.chip.text.toUpperCase(), color: TONES[v.chip.tone].color, wash: TONES[v.chip.tone].wash }, facts: v.facts.map(fact), rows: v.rows.map(row) };
    case "diagnosis":
      return { ...base, subtitle: v.subtitle, bars: v.bars.map((b, i) => ({ ...b, n: String(i + 1).padStart(2, "0"), color: toneColor(b.tone), width: `${Math.max(4, Math.round(b.frac * 100))}%` })), note: v.note ? { text: v.note.text, color: toneColor(v.note.tone) } : { text: "", color: INK3 } };
    case "procedure":
      return { ...base, step: `PASO ${v.step} DE ${v.total}`, body: v.body, caution: v.caution ?? "", dots: Array.from({ length: Math.min(v.total, 14) }, (_, i) => ({ color: i < v.step ? TONES.hud.color : "rgba(167,182,196,0.22)" })) };
    case "chart": {
      const c = chartPaths(v.series);
      const slots = Object.fromEntries([0, 1, 2, 3].flatMap((i) => [[`p${i + 1}`, c.paths[i]?.d ?? ""], [`c${i + 1}`, c.paths[i]?.color ?? TONES.hud.color]]));
      return { ...base, subtitle: v.subtitle, ...slots, grid: c.grid, xLabel: v.xLabel, yLabel: v.yLabel, legend: v.series.slice(0, 4).map((s) => ({ label: s.label, color: toneColor(s.tone) })), facts: v.facts.map(fact) };
    }
    case "list":
      return { ...base, subtitle: v.subtitle, rest: v.rest, items: v.items.map((r, i) => ({ ...row(r), n: String(v.offset + i + 1).padStart(2, "0") })) };
    case "code":
      return { ...base, subtitle: v.subtitle, digits: v.digits };
    case "message":
      return { ...base, body: v.body };
  }
}

// ── Document ─────────────────────────────────────────────────────────────────
const glass = { backgroundColor: "rgba(12,20,30,0.74)", borderColor: "rgba(120,200,220,0.16)", borderWidth: "1dp", borderRadius: "1.8vh" };
const label = (text: string, extra: Record<string, unknown> = {}) => ({ type: "Text", text, fontSize: "1.65vh", letterSpacing: "0.28vh", color: INK3, ...extra });
const when = (layout: string) => `\${s.layout == '${layout}'}`;
const enter = (ms = 0) => [{ type: "AnimateItem", delay: ms, duration: 650, easing: "ease-out", value: [{ property: "opacity", from: 0, to: 1 }, { property: "transform", from: [{ translateY: 18 }], to: [{ translateY: 0 }] }] }];

const header = {
  type: "Container", direction: "row", alignItems: "center", paddingLeft: "5vw", paddingRight: "5vw", paddingTop: "4.4vh",
  items: [
    { type: "Image", source: "${s.logo}", width: "8.5vh", height: "8.5vh", scale: "best-fit" },
    { type: "Container", paddingLeft: "1.3vw", items: [
      { type: "Text", text: "ORION", fontSize: "2.6vh", letterSpacing: "0.75vh", fontWeight: "500", color: INK },
      { type: "Text", text: "${s.kicker}", fontSize: "1.75vh", letterSpacing: "0.38vh", color: TONES.hud.color, paddingTop: "0.5vh" },
    ] },
    { type: "Container", grow: 1 },
    { type: "Container", alignItems: "end", items: [
      { type: "Text", text: "${Time.format('HH:mm', localTime)}", fontSize: "4.6vh", fontWeight: "200", color: INK },
      { type: "Text", text: "${s.date}", fontSize: "1.55vh", letterSpacing: "0.22vh", color: INK3 },
    ] },
  ],
};
const divider = {
  type: "Container", direction: "row", alignItems: "center", marginLeft: "5vw", marginRight: "5vw", marginTop: "2.2vh",
  items: [
    { type: "Frame", width: "5vw", height: "0.35vh", backgroundColor: TONES.hud.color },
    { type: "Frame", grow: 1, height: "1dp", backgroundColor: "rgba(167,182,196,0.16)" },
    { type: "Frame", width: "1.2vh", height: "1.2vh", borderRadius: "0.6vh", borderWidth: "1dp", borderColor: TONES.hud.color, marginLeft: "0.6vw" },
  ],
};
const dotRow = (textSize = "2.5vh") => ({
  type: "Container", direction: "row", alignItems: "center", paddingTop: "1.4vh", onMount: enter(240),
  items: [
    { type: "Frame", width: "1.3vh", height: "1.3vh", borderRadius: "0.65vh", backgroundColor: "${data.color}" },
    { type: "Text", when: "${data.tag != ''}", text: "${data.tag}", fontSize: "1.6vh", letterSpacing: "0.22vh", color: "${data.color}", paddingLeft: "1vw" },
    { type: "Text", text: "${data.text}", fontSize: textSize, color: INK, paddingLeft: "1vw", maxLines: 1, shrink: 1 },
  ],
});
const factCards = (marginTop: string) => ({
  type: "Container", direction: "row", marginTop, data: "${s.facts}", items: [{
    type: "Frame", grow: 1, width: "1dp", spacing: "1.2vw", ...glass, onMount: enter(200),
    item: { type: "Container", paddingLeft: "1.3vw", paddingRight: "1.1vw", paddingTop: "1.7vh", paddingBottom: "1.7vh", items: [
      label("${data.k}", { maxLines: 1 }),
      { type: "Text", text: "${data.v}", fontSize: "2.5vh", fontWeight: "300", color: "${data.color}", paddingTop: "0.7vh", maxLines: 2 },
    ] },
  }],
});

const briefing = {
  type: "Container", when: when("briefing"), items: [
    { type: "Text", text: "${s.title}", fontSize: "5vh", fontWeight: "200", color: INK, maxLines: 1 },
    { type: "Text", text: "${s.subtitle}", fontSize: "2.3vh", color: INK2, paddingTop: "0.8vh", maxLines: 1 },
    {
      type: "Container", direction: "row", justifyContent: "spaceBetween", marginTop: "3.2vh", data: "${s.tiles}",
      items: [{
        type: "Frame", width: "20.5vw", height: "20vh", ...glass, onMount: enter(120),
        item: { type: "Container", width: "100%", height: "100%", paddingLeft: "1.3vw", paddingRight: "1vw", paddingTop: "2vh", items: [
          { type: "Frame", position: "absolute", top: 0, left: "1.3vw", width: "3.5vw", height: "0.45vh", backgroundColor: "${data.color}" },
          label("${data.label}", { maxLines: 1 }),
          { type: "Container", direction: "row", alignItems: "center", justifyContent: "spaceBetween", marginTop: "0.6vh", items: [
            { type: "Text", text: "${data.value}", fontSize: "8vh", fontWeight: "200", color: "${data.color}" },
            { type: "VectorGraphic", source: "ring", width: "7.2vh", height: "7.2vh", scale: "best-fit", arc: "${data.arc}", color: "${data.color}" },
          ] },
          { type: "Text", text: "${data.hint}", fontSize: "1.6vh", color: INK2, maxLines: 1 },
        ] },
      }],
    },
    label("LO PRIMERO", { marginTop: "3.4vh" }),
    { type: "Container", data: "${s.rows}", items: [dotRow()] },
  ],
};

const equipment = {
  type: "Container", when: when("equipment"), items: [
    { type: "Container", direction: "row", alignItems: "start", items: [
      { type: "Container", shrink: 1, grow: 1, items: [
        label("${s.label}"),
        { type: "Text", text: "${s.title}", fontSize: "6.6vh", fontWeight: "200", letterSpacing: "0.3vh", color: INK, maxLines: 1 },
        { type: "Text", text: "${s.subtitle}", fontSize: "2.5vh", color: INK2, maxLines: 1 },
      ] },
      { type: "Frame", borderRadius: "3vh", borderWidth: "1dp", borderColor: "${s.chip.color}", backgroundColor: "${s.chip.wash}", marginTop: "2.2vh",
        item: { type: "Container", direction: "row", alignItems: "center", paddingLeft: "1.5vw", paddingRight: "1.5vw", paddingTop: "1.1vh", paddingBottom: "1.1vh", items: [
          { type: "Frame", width: "1.2vh", height: "1.2vh", borderRadius: "0.6vh", backgroundColor: "${s.chip.color}" },
          { type: "Text", text: "${s.chip.text}", fontSize: "2vh", letterSpacing: "0.3vh", fontWeight: "500", color: "${s.chip.color}", paddingLeft: "0.7vw" },
        ] } },
    ] },
    factCards("3.4vh"),
    { type: "Container", marginTop: "2.4vh", data: "${s.rows}", items: [dotRow("2.4vh")] },
  ],
};

const diagnosis = {
  type: "Container", when: when("diagnosis"), items: [
    { type: "Text", text: "${s.title}", fontSize: "4.6vh", fontWeight: "200", color: INK, maxLines: 1 },
    { type: "Text", text: "${s.subtitle}", fontSize: "2.2vh", color: INK2, paddingTop: "0.6vh", maxLines: 2 },
    { type: "Container", marginTop: "2.8vh", data: "${s.bars}", items: [{
      type: "Frame", spacing: "1.4vh", ...glass, onMount: enter(120),
      item: { type: "Container", direction: "row", alignItems: "center", paddingTop: "1.5vh", paddingBottom: "1.5vh", paddingRight: "2vw", items: [
        { type: "Text", text: "${data.n}", fontSize: "3.8vh", fontWeight: "200", color: "${data.color}", width: "7vw", paddingLeft: "1.5vw" },
        { type: "Container", grow: 1, shrink: 1, items: [
          { type: "Container", direction: "row", alignItems: "center", items: [
            { type: "Text", text: "${data.label}", fontSize: "2.5vh", color: INK, grow: 1, shrink: 1, maxLines: 1 },
            { type: "Text", text: "${data.value}", fontSize: "2.2vh", color: "${data.color}", paddingLeft: "1vw" },
          ] },
          { type: "Frame", marginTop: "0.9vh", height: "0.6vh", borderRadius: "0.3vh", backgroundColor: "rgba(167,182,196,0.14)", item: { type: "Frame", width: "${data.width}", height: "0.6vh", borderRadius: "0.3vh", backgroundColor: "${data.color}" } },
          { type: "Text", text: "${data.detail}", fontSize: "1.75vh", color: INK2, paddingTop: "0.7vh", maxLines: 1 },
        ] },
      ] },
    }] },
    { type: "Text", when: "${s.note.text != ''}", text: "${s.note.text}", fontSize: "2vh", color: "${s.note.color}", marginTop: "2vh", maxLines: 2 },
  ],
};

const procedure = {
  type: "Container", when: when("procedure"), items: [
    label("${s.step}", { color: TONES.hud.color }),
    { type: "Text", text: "${s.title}", fontSize: "4vh", fontWeight: "200", color: INK2, paddingTop: "0.6vh", maxLines: 1 },
    { type: "Container", direction: "row", marginTop: "1.6vh", data: "${s.dots}", items: [
      { type: "Frame", width: "3.2vw", height: "0.5vh", borderRadius: "0.25vh", marginRight: "0.5vw", backgroundColor: "${data.color}" },
    ] },
    { type: "Frame", marginTop: "3vh", ...glass, onMount: enter(100), item: {
      type: "Text", text: "${s.body}", fontSize: "3.6vh", fontWeight: "300", lineHeight: 1.3, color: INK, maxLines: 6, paddingLeft: "2.6vw", paddingRight: "2.6vw", paddingTop: "3.2vh", paddingBottom: "3.2vh",
    } },
    { type: "Text", when: "${s.caution != ''}", text: "${s.caution}", fontSize: "2.1vh", color: TONES.warn.color, marginTop: "2vh", maxLines: 2 },
  ],
};

const chart = {
  type: "Container", when: when("chart"), items: [
    { type: "Text", text: "${s.title}", fontSize: "4.2vh", fontWeight: "200", color: INK, maxLines: 1 },
    { type: "Text", text: "${s.subtitle}", fontSize: "2.1vh", color: INK2, paddingTop: "0.5vh", maxLines: 1 },
    { type: "Container", direction: "row", marginTop: "2.2vh", items: [
      { type: "Frame", grow: 1, ...glass, item: { type: "Container", paddingLeft: "1.4vw", paddingRight: "1.4vw", paddingTop: "1.6vh", paddingBottom: "1.4vh", items: [
        label("${s.yLabel}"),
        { type: "VectorGraphic", source: "plot", width: "100%", height: "34vh", scale: "fill", grid: "${s.grid}", onMount: enter(80), ...Object.fromEntries([1, 2, 3, 4].flatMap((i) => [[`p${i}`, `\${s.p${i}}`], [`c${i}`, `\${s.c${i}}`]])) },
        label("${s.xLabel}", { textAlign: "right" }),
      ] } },
    ] },
    { type: "Container", direction: "row", marginTop: "1.4vh", data: "${s.legend}", items: [
      { type: "Container", direction: "row", alignItems: "center", paddingRight: "2vw", items: [
        { type: "Frame", width: "2.4vw", height: "0.5vh", backgroundColor: "${data.color}" },
        { type: "Text", text: "${data.label}", fontSize: "1.8vh", color: INK2, paddingLeft: "0.6vw" },
      ] },
    ] },
    factCards("1.6vh"),
  ],
};

const list = {
  type: "Container", when: when("list"), items: [
    { type: "Text", text: "${s.title}", fontSize: "4.4vh", fontWeight: "200", color: INK, maxLines: 1 },
    { type: "Text", text: "${s.subtitle}", fontSize: "2.2vh", color: INK2, paddingTop: "0.6vh", maxLines: 2 },
    { type: "Container", marginTop: "2.6vh", data: "${s.items}", items: [{
      type: "Frame", spacing: "1.4vh", ...glass, onMount: enter(120),
      item: { type: "Container", direction: "row", alignItems: "center", paddingTop: "1.7vh", paddingBottom: "1.7vh", paddingRight: "2vw", items: [
        { type: "Frame", width: "0.5vh", height: "6vh", backgroundColor: "${data.color}" },
        { type: "Text", text: "${data.n}", fontSize: "4vh", fontWeight: "200", color: "${data.color}", width: "7vw", paddingLeft: "1.5vw" },
        { type: "Text", text: "${data.text}", fontSize: "2.4vh", color: INK, grow: 1, shrink: 1, maxLines: 2 },
      ] },
    }] },
    { type: "Text", when: "${s.rest > 0}", text: "${s.rest} MÁS  ·  DI «SÍ» PARA CONTINUAR", fontSize: "1.8vh", letterSpacing: "0.3vh", color: TONES.hud.color, marginTop: "2vh" },
  ],
};
const code = {
  type: "Container", when: when("code"), items: [
    { type: "Text", text: "${s.title}", fontSize: "4.6vh", fontWeight: "200", color: INK },
    { type: "Text", text: "${s.subtitle}", fontSize: "2.4vh", color: INK2, paddingTop: "0.8vh", maxLines: 2 },
    { type: "Container", direction: "row", marginTop: "5vh", data: "${s.digits}", items: [{
      type: "Frame", spacing: "1.2vw", width: "13vh", height: "16vh", ...glass, onMount: enter(100),
      item: { type: "Text", text: "${data}", width: "100%", height: "100%", textAlign: "center", textAlignVertical: "center", fontSize: "9.5vh", fontWeight: "200", color: TONES.hud.color },
    }] },
  ],
};
const message = {
  type: "Container", when: when("message"), items: [
    { type: "Text", text: "${s.title}", fontSize: "4.6vh", fontWeight: "200", color: INK, maxLines: 1 },
    { type: "Frame", marginTop: "3vh", ...glass, onMount: enter(100), item: {
      type: "Text", text: "${s.body}", fontSize: "3vh", fontWeight: "300", lineHeight: 1.35, color: INK, maxLines: 9, paddingLeft: "2.4vw", paddingRight: "2.4vw", paddingTop: "3vh", paddingBottom: "3vh",
    } },
  ],
};

const LAYOUTS: Record<Visual["layout"], unknown> = { briefing, equipment, diagnosis, procedure, chart, list, code, message };
const RING = {
  type: "AVG", version: "1.1", width: 100, height: 100,
  parameters: [{ name: "arc", type: "string", default: "" }, { name: "color", type: "color", default: TONES.hud.color }],
  items: [
    { type: "path", pathData: TICKS, stroke: "rgba(167,182,196,0.30)", strokeWidth: 0.8 },
    { type: "path", pathData: CIRCLE, stroke: "rgba(167,182,196,0.12)", strokeWidth: 6 },
    { type: "path", pathData: "${arc}", stroke: "${color}", strokeWidth: 6, strokeLineCap: "round" },
  ],
};
const PLOT = {
  type: "AVG", version: "1.1", width: 400, height: 200,
  // Up to four series as fixed paths (p1..p4 / c1..c4): plain parameters render on every APL version.
  parameters: [
    { name: "grid", type: "string", default: "" },
    ...[1, 2, 3, 4].flatMap((i) => [{ name: `p${i}`, type: "string", default: "" }, { name: `c${i}`, type: "color", default: "#3fd2e4" }]),
  ],
  items: [
    { type: "path", pathData: "${grid}", stroke: "rgba(167,182,196,0.14)", strokeWidth: 0.6 },
    ...[1, 2, 3, 4].map((i) => ({ type: "path", pathData: `\${p${i}}`, stroke: `\${c${i}}`, strokeWidth: 2, strokeLineJoin: "round" })),
  ],
};

/**
 * One small document per screen: only the layout in use (and only the vector graphic it needs). Alexa rejects responses
 * over 24 KB, so shipping all eight layouts in every answer is not an option. `version` follows the device's APL runtime.
 */
export function aplDocument(layout: Visual["layout"] = "message", version = "2023.2") {
  const graphics: Record<string, unknown> = {};
  if (layout === "briefing") graphics.ring = RING;
  if (layout === "chart") graphics.plot = PLOT;
  return {
    type: "APL",
    version,
    theme: "dark",
    ...(Object.keys(graphics).length ? { graphics } : {}),
    mainTemplate: {
      parameters: ["s"],
      items: [{
        type: "Container", width: "100vw", height: "100vh", items: [
          { type: "Image", source: "${s.bg}", position: "absolute", left: 0, top: 0, width: "100vw", height: "100vh", scale: "best-fill" },
          header,
          divider,
          { type: "Container", grow: 1, paddingLeft: "5vw", paddingRight: "5vw", paddingTop: "3vh", paddingBottom: "7vh", items: [LAYOUTS[layout]] },
          { type: "Text", when: "${s.hint != ''}", text: "${s.hint}", position: "absolute", left: "5vw", right: "5vw", bottom: "3.2vh", fontSize: "1.7vh", letterSpacing: "0.12vh", color: INK3, maxLines: 1 },
        ],
      }],
    },
  };
}

/** APL version to declare: the device's own runtime when it is older than ours (the console simulator reports 1.3). */
export function aplVersionFor(maxVersion: string | undefined | null) {
  const v = String(maxVersion ?? "");
  if (/^1\.\d+$/.test(v)) return v;
  if (/^\d{4}\.\d+$/.test(v) && v < "2023.2") return v;
  return "2023.2";
}

export const renderDirective = (v: Visual, version?: string) => ({ type: "Alexa.Presentation.APL.RenderDocument", token: "orion", document: aplDocument(v.layout, version), datasources: { s: datasource(v) } });
