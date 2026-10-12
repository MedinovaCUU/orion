// ORION · spoken Spanish helpers (SSML-safe text, numbers, dates, serials, test names).

export const TZ = "America/Mexico_City";

/** Text that goes inside <speak>: no markup characters from data. */
export const esc = (s: string) => String(s ?? "").replace(/&/g, " y ").replace(/[<>"]/g, "").replace(/\s+/g, " ").trim();
/**
 * "Orion" read in Spanish (o-rión), not the English "oraion". The IPA hint wraps the accented Spanish spelling, so a
 * voice that ignored <phoneme> would still read "Orión" the Spanish way. Idempotent (already wrapped text is skipped).
 */
// Read through globalThis so alexa/build-model.mjs can import this file under Node.
const BRAND_MODE = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get("ORION_ALEXA_BRAND") ?? "phoneme";
export const BRAND_SSML = BRAND_MODE === "phoneme" ? '<phoneme alphabet="ipa" ph="oˈɾjon">Orión</phoneme>' : "Orión";
export const brandSpeech = (ssml: string) => ssml.replace(/\bori[oó]n\b(?!<\/phoneme>)/gi, BRAND_SSML);
export const pause = (ms = 300) => `<break time="${ms}ms"/>`;
export const n0 = (x: number) => Math.round(x).toLocaleString("es-MX");
export const plural = (n: number, s: string, p = `${s}s`) => `${n0(n)} ${Math.round(n) === 1 ? s : p}`;
export const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
export const unaccent = (x: string) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Serials are named by their last four digits, read one by one ("el 0473" → "cero cuatro siete tres"). */
export const saySerial = (serial: string) => `<say-as interpret-as="digits">${esc(serial)}</say-as>`;
export const shortSerial = (serial: string) => serial.replace(/\D/g, "").slice(-4) || serial;
/** "el BA400 terminación 0473" — how the team names an analyzer out loud. */
export const sayEquipment = (serial: string, model?: string | null) =>
  `${model ? `${esc(spokenModel(model))} ` : ""}terminación <say-as interpret-as="digits">${shortSerial(serial)}</say-as>`;
export const spokenModel = (m: string) =>
  m.replace(/\[DEMO\]/i, "").replace(/\bBA\s?(\d{3})\b/i, "B A $1").replace(/\bA(15|25)\b/i, "A $1").trim();

export const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
export const localHour = () => Number(new Date().toLocaleString("en-US", { timeZone: TZ, hour: "numeric", hour12: false })) % 24;
const asDate = (d: Date | string) => new Date(typeof d === "string" && d.length === 10 ? `${d}T12:00:00` : d);
export const fecha = (d: Date | string) => asDate(d).toLocaleDateString("es-MX", { timeZone: TZ, day: "numeric", month: "long" });
/** "9:36 de la noche", "8 de la mañana", "1:15 de la tarde" — the way people say the time in Mexico. */
export function hora(d: Date | string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hourCycle: "h23" }).formatToParts(asDate(d)).map((p) => [p.type, p.value]));
  const h = Number(parts.hour) % 24, m = Number(parts.minute);
  const tramo = h < 6 ? "de la madrugada" : h < 12 ? "de la mañana" : h < 13 ? "del mediodía" : h < 20 ? "de la tarde" : "de la noche";
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${tramo}`;
}
/** "a las 9:36 de la noche" / "a la 1 de la tarde". */
export const aLas = (d: Date | string) => {
  const t = hora(d);
  return `${/^1(:| )/.test(t) ? "a la" : "a las"} ${t}`;
};
const dayKey = (d: Date | string) => asDate(d).toLocaleDateString("en-CA", { timeZone: TZ });
const dayDiff = (a: string, b: string) => Math.round((new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime()) / 864e5);
/** "hoy a las 9:40", "ayer", "el martes 7 de octubre", "hace 12 días". */
export function cuando(d: Date | string, withTime = true): string {
  const k = dayKey(d), n = dayDiff(todayIso(), k);
  if (n === 0) return withTime && (typeof d !== "string" || String(d).length > 10) ? `hoy ${aLas(d)}` : "hoy";
  if (n === 1) return "ayer";
  if (n === -1) return "mañana";
  if (n > 1 && n <= 6) return `el ${asDate(d).toLocaleDateString("es-MX", { timeZone: TZ, weekday: "long" })}`;
  if (n > 6 && n <= 45) return `hace ${n} días`;
  if (n < -1 && n >= -6) return `el ${asDate(d).toLocaleDateString("es-MX", { timeZone: TZ, weekday: "long", day: "numeric" })}`;
  return `el ${fecha(d)}`;
}
/** Remaining time for an SLA, spoken. */
export function duracion(hours: number): string {
  const h = Math.abs(hours);
  if (h < 1) return plural(Math.max(1, Math.round(h * 60)), "minuto");
  if (h < 48) return plural(Math.round(h), "hora");
  return plural(Math.round(h / 24), "día");
}
export function saludo() {
  const h = localHour();
  return h >= 5 && h < 12 ? "Buenos días" : h >= 12 && h < 19 ? "Buenas tardes" : "Buenas noches";
}
export const firstName = (full?: string | null) => esc((full ?? "").trim().split(/\s+/)[0] ?? "").replace(/^(\w)(\w*)$/u, (_, a: string, b: string) => a.toUpperCase() + b.toLowerCase());

// ── Clinical chemistry test names ───────────────────────────────────────────
// Spoken Spanish ↔ analyzer test codes (BA400 test_name / DRI catalog keys). Keys are unaccented, lower case.
export const TEST_SYNONYMS: Record<string, string[]> = {
  // First entry = how Alexa says it.
  GLUCOSE: ["glucosa", "glucose", "glu", "glucemia"],
  CHOLESTEROL: ["colesterol", "colesterol total", "chol", "cholesterol"],
  TRIGLYCERIDES: ["triglicéridos", "trigliceridos", "trig", "tg", "triglycerides"],
  "HDL CHOLESTEROL": ["colesterol H D L", "hdl", "colesterol hdl", "hdl colesterol", "hdl directo"],
  "LDL CHOLESTEROL": ["colesterol L D L", "ldl", "colesterol ldl", "ldl directo"],
  UREA: ["urea", "bun", "nitrogeno ureico"],
  CREATININE: ["creatinina", "crea", "creatinine"],
  "URIC ACID": ["ácido úrico", "acido urico", "urico"],
  "ALT-GPT": ["A L T", "alt", "gpt", "tgp", "alanina aminotransferasa", "alt gpt"],
  "AST-GOT": ["A S T", "ast", "got", "tgo", "aspartato aminotransferasa", "ast got"],
  "ALKALINE PHOSPHATASE": ["fosfatasa alcalina", "alp", "fa"],
  "GAMMA-GT": ["gamma G T", "ggt", "gamma gt", "gamma glutamil transferasa"],
  "BILIRUBIN TOTAL": ["bilirrubina total", "bilirrubina", "bt"],
  "BILIRUBIN DIRECT": ["bilirrubina directa", "bd"],
  "PROTEIN TOTAL": ["proteínas totales", "proteinas totales", "proteina total", "proteínas"],
  ALBUMIN: ["albúmina", "albumina", "alb"],
  "ALBUMIN-MAU": ["microalbúmina", "microalbumina", "mau"],
  CALCIUM: ["calcio", "ca"],
  PHOSPHORUS: ["fósforo", "fosforo"],
  MAGNESIUM: ["magnesio", "mg"],
  IRON: ["hierro", "fe"],
  AMYLASE: ["amilasa"],
  LIPASE: ["lipasa"],
  "CK-MB": ["C K M B", "ck mb", "ckmb", "cpk mb"],
  CK: ["C K", "ck", "cpk", "creatin cinasa", "creatina quinasa"],
  LDH: ["L D H", "ldh", "deshidrogenasa lactica", "deshidrogenasa láctica"],
  CRP: ["proteína C reactiva", "pcr", "proteina c reactiva"],
  HBA1C: ["hemoglobina glicosilada", "hba1c", "glicada", "a1c"],
  SODIUM: ["sodio", "na"],
  POTASSIUM: ["potasio", "k"],
  CHLORIDE: ["cloro", "cloruro", "cl"],
};
const SYN_INDEX = new Map<string, string>();
for (const [code, words] of Object.entries(TEST_SYNONYMS)) for (const w of [code, ...words]) SYN_INDEX.set(unaccent(w).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(), code);
/** "glucosa" → "GLUCOSE"; unknown words come back upper-cased so they can still match a catalog name. */
export function canonicalTest(spoken: string): string {
  const k = unaccent(spoken).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().replace(/^(el|la|los|las|de|del) /, "");
  const exact = SYN_INDEX.get(k) ?? SYN_INDEX.get(k.replace(/ (uv|color|enzimatico|directo|liquido|bicromatico)$/, ""));
  if (exact) return exact;
  // Catalog display names come truncated ("ACIDO URIC"): accept a prefix of a known name (4+ letters).
  if (k.length >= 4) {
    const hit = [...SYN_INDEX.keys()].filter((key) => key.length >= 4 && (key.startsWith(k) || k.startsWith(`${key} `))).sort((a, b) => b.length - a.length)[0];
    if (hit) return SYN_INDEX.get(hit)!;
  }
  return spoken.toUpperCase().trim();
}
/** "glucosa, colesterol y ALT" → ["GLUCOSE","CHOLESTEROL","ALT-GPT"] */
export function splitTests(spoken?: string | null): string[] {
  if (!spoken) return [];
  const parts = unaccent(spoken).split(/\s*(?:,|;|\by\b|\be\b|\bmas\b|\btambien\b)\s*/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const c = canonicalTest(p);
    if (!out.includes(c)) out.push(c);
  }
  return out;
}
const SPOKEN_TEST: Record<string, string> = Object.fromEntries(Object.entries(TEST_SYNONYMS).map(([k, v]) => [k, v[0]!]));
/** "GLUCOSE" → "glucosa" (falls back to the code with letters spaced when it is an acronym). */
export function sayTest(code: string): string {
  const c = canonicalTest(code);
  if (SPOKEN_TEST[c]) return SPOKEN_TEST[c]!;
  const t = code.toLowerCase().replace(/[_-]+/g, " ").trim();
  return /^[a-z]{2,4}$/.test(t) ? t.toUpperCase().split("").join(" ") : esc(t);
}
/** Engine labels read aloud: "control / calibrador" → "control o calibrador", "505 nm" → "505 nanómetros". */
export const spoken = (s: string) => esc(s).replace(/\s*\/\s*/g, " o ").replace(/(\d)\s*nm\b/g, "$1 nanómetros");
export const joinY = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/** Westgard rules as said in the lab: "1_3s" → "1 3 ese", "R_4s" → "R 4 ese", "10_x" → "10 x". */
export const sayRule = (r: string) => esc(r).replace(/^(\w+)[_-](\d+)s$/i, "$1 $2 ese").replace(/_/g, " ");
/** Lot or code read aloud: digits one by one, alphanumerics letter by letter. */
export const sayCode = (v: string) => (/^\d+$/.test(v) ? `<say-as interpret-as="digits">${esc(v)}</say-as>` : `<say-as interpret-as="characters">${esc(v.replace(/[^\p{L}\p{N}]/gu, ""))}</say-as>`);

const UNITS: Array<[RegExp, string]> = [
  [/^mg\/dl$/i, "miligramos por decilitro"], [/^g\/dl$/i, "gramos por decilitro"], [/^g\/l$/i, "gramos por litro"], [/^mg\/l$/i, "miligramos por litro"],
  [/^(µ|u)mol\/l$/i, "micromoles por litro"], [/^mmol\/l$/i, "milimoles por litro"], [/^(u|ui)\/l$/i, "unidades por litro"], [/^%$/, "por ciento"], [/^abs$/i, "de absorbancia"],
];
export const sayUnit = (u: string | null | undefined) => {
  const t = String(u ?? "").trim();
  return esc(UNITS.find(([re]) => re.test(t))?.[1] ?? t);
};

/** Spoken percentage ("85 por ciento"). */
export const pct = (x: number | null | undefined) => (x == null ? "sin dato" : `${Math.round(x * 100)} por ciento`);

// ── Client names ─────────────────────────────────────────────────────────────
const LEGAL = /\b(s\.?\s?a\.?\s?p?\.?\s?i?\.?(\s?de\s?c\.?\s?v\.?)?|s\.?\s?de\s?r\.?\s?l\.?(\s?de\s?c\.?\s?v\.?)?|s\.?\s?c\.?|a\.?\s?c\.?|sapi)\b\.?/gi;
/** "LABORATORIO FALCON MONTERREY SA DE CV" → "Laboratorio Falcon Monterrey" (escaped for SSML). */
export function shortClient(name: string | null | undefined) {
  if (!name) return "";
  const t = name.replace(LEGAL, " ").replace(/[,.]+/g, " ").replace(/\s+/g, " ").trim();
  const words = t.split(" ").slice(0, 5).join(" ");
  return esc(words.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, s: string, c: string) => s + c.toUpperCase()));
}
