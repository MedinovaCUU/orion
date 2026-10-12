/**
 * Extractores de hechos a partir del texto de los documentos de einfo.bio (español).
 * Devuelven únicamente lo que encuentran; nunca inventan un valor.
 */

/**
 * Número con separador decimal local. Un único ',' o '.' es el separador decimal ("0,401", "0.575", "108,408",
 * "1,200" del límite de absorbancia = 1,2). Solo se lee como separador de millar cuando hay agrupación clara:
 * los dos signos a la vez ("1.200,5" / "1,200.5": el último es el decimal) o el mismo signo repetido en grupos
 * de tres cifras ("1.200.000"). Toma el número inicial del texto ("0001A" → 1, "1300." → 1300).
 */
export const parseNumber = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = String(value)
    .replace(/[\s\u00a0]+/g, '')
    .replace(/[−–]/g, '-')
    .match(/^[-+]?\d[\d.,]*/);
  if (!match) return null;
  let token = match[0].replace(/[.,]+$/, '');
  const sign = token.startsWith('-') ? -1 : 1;
  token = token.replace(/^[-+]/, '');
  const commas = (token.match(/,/g) || []).length;
  const dots = (token.match(/\./g) || []).length;
  let normalized;
  if (commas && dots) {
    const decimalSeparator = token.lastIndexOf(',') > token.lastIndexOf('.') ? ',' : '.';
    const groupSeparator = decimalSeparator === ',' ? '.' : ',';
    const [integer, fraction] = [token.slice(0, token.lastIndexOf(decimalSeparator)), token.slice(token.lastIndexOf(decimalSeparator) + 1)];
    if (integer.includes(decimalSeparator) || !integer.split(groupSeparator).slice(1).every((group) => group.length === 3)) return null;
    normalized = `${integer.split(groupSeparator).join('')}.${fraction}`;
  } else if (commas + dots > 1) {
    const parts = token.split(commas ? ',' : '.');
    if (!parts.slice(1).every((group) => group.length === 3)) return null;
    normalized = parts.join('');
  } else {
    normalized = token.replace(',', '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? sign * parsed : null;
};

const flatten = (text) => text.replace(/\s+/g, ' ').trim();

const between = (text, start, end) => {
  const from = text.search(start);
  if (from < 0) return null;
  const rest = text.slice(from);
  const to = end ? rest.slice(1).search(end) : -1;
  return (to >= 0 ? rest.slice(0, to + 1) : rest).trim();
};

const hoursFromDuration = (count, unit) => {
  const value = Number(count);
  if (!Number.isFinite(value)) return null;
  const key = unit.toLowerCase();
  if (key.startsWith('mes')) return Math.round(value * 30 * 24);
  if (key.startsWith('semana')) return value * 7 * 24;
  if (key.startsWith('d')) return value * 24;
  if (key.startsWith('hora')) return value;
  return null;
};

const pair = (text, pattern) => {
  const match = text.match(pattern);
  if (!match) return null;
  return { ba200: match[1], ba400: match[2] ?? match[1] };
};

const pairNumbers = (text, pattern) => {
  const found = pair(text, pattern);
  return found ? { ba200: parseNumber(found.ba200), ba400: parseNumber(found.ba400) } : null;
};

const micro = (unit) => (unit ? unit.replace(/μ/g, 'µ') : unit);

/* ------------------------------------------------------------------ matriz de muestra */

const MATRIX_RANK = { serum: 0, null: 1, urine: 2, csf: 3 };
const matrixFromWord = (word) => {
  const key = (word || '').toLowerCase();
  if (key.startsWith('suero') || key.startsWith('plasma')) return 'serum';
  if (key.startsWith('orina')) return 'urine';
  if (key === 'lcr' || key.startsWith('l\u00edquido') || key.startsWith('liquido')) return 'csf';
  return null;
};
const MATRIX_WORD = String.raw`suero|plasma|orina|LCR|l[ií]quido\s+cefalorraqu[ií]deo`;
/** Suero primero (es la matriz que usa el diagnóstico), luego sin matriz, orina y LCR; estable dentro de cada matriz. */
const serumFirst = (items) =>
  items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => MATRIX_RANK[String(left.item.matrix)] - MATRIX_RANK[String(right.item.matrix)] || left.index - right.index)
    .map(({ item }) => item);

/* ------------------------------------------------------------------ precisión */

const PRECISION_UNIT = String.raw`U\/L|mg\/dL|g\/dL|g\/L|mmol\/L|[µμ]mol\/L|[µμ]g\/dL|[µμ]kat\/L|%|ng\/mL|mg\/L|IU\/mL`;
// Media, unidad, equivalencias opcionales ("= 2600 nkat/L", "(2,6 µkat/L)") y los dos CV.
const PRECISION_ROW = new RegExp(
  String.raw`([\d.,]+)\s*(${PRECISION_UNIT})\s*(?:=\s*[\d.,]+\s*[^\s(]+\s*)?(?:\(\s*[\d.,]+\s*[^)]*\)\s*)?([\d.,]+)\s*%\s*([\d.,]+)\s*%`,
  'g',
);
// Encabezados de matriz dentro del bloque de precisión: "Suero.", "Orina.", "LCR:" …
const PRECISION_MATRIX_HEADING = new RegExp(String.raw`\b(${MATRIX_WORD})(?:\s*(?:y|\/|o)\s*(?:suero|plasma))?\s*[.:]`, 'gi');
// Encabezado de columna de cada tabla: "Concentración media Repetibilidad", "Concentración media urea Repetibilidad",
// "Media (mg/dL) / (mol/L) Repetibilidad". El grupo 1 es el analito al que se refiere la media (p. ej. urea y no BUN).
const PRECISION_COLUMN_HEADING = /\bmedia\s+(?:\([^)]*\)\s*(?:\/\s*\([^)]*\)\s*)?)?(?:([a-záéíóúñ]+)\s+)?Repetibilidad/gi;

/**
 * Tablas de precisión del IFU; cada fila lleva la matriz de su tabla (suero/orina/LCR) o null si no se indica, y
 * `analyte` solo cuando el encabezado de la tabla nombra el analito de la media ("Concentración media urea").
 */
export const parsePrecision = (block) => {
  if (!block) return [];
  const headings = [...block.matchAll(PRECISION_MATRIX_HEADING)].map((match) => ({ index: match.index, matrix: matrixFromWord(match[1]) }));
  const columnHeadings = [...block.matchAll(PRECISION_COLUMN_HEADING)].map((match) => ({ index: match.index, analyte: match[1] ? match[1].toLowerCase() : null }));
  const rows = [...block.matchAll(PRECISION_ROW)].map((match) => {
    const heading = headings.filter((item) => item.index < match.index).pop();
    const columns = columnHeadings.filter((item) => item.index < match.index).pop();
    return {
      mean: parseNumber(match[1]),
      unit: micro(match[2]),
      repeatabilityCv: parseNumber(match[3]),
      totalCv: parseNumber(match[4]),
      matrix: heading ? heading.matrix : null,
      ...(columns && columns.analyte ? { analyte: columns.analyte } : {}),
    };
  });
  return serumFirst(rows);
};

/* ------------------------------------------------------------------ interferencias */

// Los patrones no llevan grupos de captura propios: el índice del grupo que coincide identifica al interferente.
const INTERFERENTS = [
  { key: 'bilirubin', label: 'Bilirrubina', pattern: String.raw`bilirrubina|bilirubin` },
  { key: 'hemolysis', label: 'Hemólisis (hemoglobina)', pattern: String.raw`hem[oó]lisis|hemoglobina|hemolysis|hemoglobin` },
  { key: 'lipemia', label: 'Lipemia (triglicéridos)', pattern: String.raw`lipemia|lipaemia|triglic[eé]ridos|triglycerides` },
  { key: 'ascorbic_acid', label: 'Ácido ascórbico', pattern: String.raw`[aáà]cido\s+asc[oó]rbico|ascorbic\s+acid|vitamina\s+C\b` },
  { key: 'uric_acid', label: 'Ácido úrico', pattern: String.raw`[aáà]cido\s+[uú]rico|uric\s+acid` },
  { key: 'acetaminophen', label: 'Acetaminofén (paracetamol)', pattern: String.raw`acetaminof[eé]n|acetaminophen|paracetamol` },
  { key: 'protein', label: 'Proteínas', pattern: String.raw`cuerpos\s+proteicos|\bprote[ií]nas?\b|\bproteins?\b` },
  { key: 'ketones', label: 'Cuerpos cetónicos', pattern: String.raw`(?:cuerpos|compuestos)\s+cet[oó]nicos|\bcet[oó]nicos|\bcetonas\b|ketone\s+bodies|\bketones\b` },
  { key: 'reducing_substances', label: 'Sustancias reductoras', pattern: String.raw`(?:sustancias|compuestos|agentes)\s+reductor(?:es|as)|reducing\s+(?:substances|compounds|agents)` },
  { key: 'ck_bb', label: 'CK-BB', pattern: String.raw`\bCK-?BB\b` },
  { key: 'adenylate_kinase', label: 'Adenilato quinasa', pattern: String.raw`adenilato\s+(?:quinasa|kinasa|cinasa)|adenylate\s+kinase` },
  { key: 'macro_ck', label: 'Macro-CK', pattern: String.raw`\bmacro-?\s?CK\b` },
  { key: 'mitochondrial_ck', label: 'CK mitocondrial', pattern: String.raw`\bCK\s+mitocondrial|mitochondrial\s+CK\b` },
  { key: 'delayed_separation', label: 'Separación tardía del suero', pattern: String.raw`tard[ií]a\s+separaci[oó]n(?:\s+del\s+(?:suero|plasma))?|separaci[oó]n\s+tard[ií]a(?:\s+del\s+(?:suero|plasma))?` },
];
const INTERFERENT_MENTION = new RegExp(INTERFERENTS.map((item) => `(${item.pattern})`).join('|'), 'gi');
// Fin de palabra sin \b: las llamadas de bibliografía van pegadas ("interfieren6").
const NO_INTERFERENCE = /\bno\s+(?:interfiere|interfieren|interfiera|interfieran|interfere|interferes|afecta|afectan)(?![a-záéíóúñ])/i;
const INTERFERENCE =
  /\b(?:interfiere|interfieren|interfere|interferes)(?![a-záéíóúñ])|\bpuede(?:n)?\s+interferir(?![a-záéíóúñ])|\bocasiona(?:n)?\s+resultados\b|\b(?:puede(?:n)?\s+(?:ser|verse)\s+)?afectad[ao]s?\s+por\b/i;
// Valor tras la mención: "(hasta 10 mg/dL)", "(20 mg/dL)", "(hemoglobina 25 mg/dL)", "hasta 2 g/L", "(<20 mg/dL)", "(>50 mg/dL)".
// El grupo 1 es el calificador: «hasta»/«<» marca el máximo ensayado, «>»/«por encima de» el inicio de la interferencia.
const THRESHOLD_VALUE =
  /(hasta|up\s+to|<=?|≤|>=?|≥|por\s+encima\s+de|superiores?\s+a|mayores?\s+(?:de|a)|above)?\s*(\d+(?:[.,]\d+)*)\s*(%|[a-zA-Zµμ]+\/[a-zA-Z]+)/i;
const UP_TO_QUALIFIER = /^(?:hasta|up\s+to|<=?|≤)$/i;
// «concentraciones por encima de lo normal de X», «una concentración elevada de X»: interfiere solo si X está elevado.
const ELEVATED_CONCENTRATION =
  /concentraci[oó]n(?:es)?\s+(?:por\s+encima\s+de\s+lo\s+normal|elevadas?|altas?)|(?:elevadas?|altas?)\s+concentraci[oó]n(?:es)?|(?:high|elevated)\s+concentrations?|por\s+encima\s+de\s+lo\s+normal/i;
const SENTENCE_MATRIX_HEADING = new RegExp(String.raw`^(?:en\s+)?(${MATRIX_WORD})\s*[:.,]\s*`, 'i');
const SENTENCE_MATRIX_INLINE = new RegExp(String.raw`\b(?:en|de)\s+(?:las?\s+)?(?:muestras?\s+de\s+)?(${MATRIX_WORD})\b`, 'i');

/**
 * Umbrales de interferencia frase a frase. `effect` dice qué declara el IFU y `thresholdValue` el valor a partir del
 * cual aplica; si el IFU no imprime ese valor queda en null (nunca se inventa un umbral):
 *  - "X (hasta N) no interfiere(n)" / "X (N) no interfiere(n)" → no_interference_below N;
 *  - "X (N) interfiere(n)" / "X (>N) interfiere(n)" → may_interfere_above N (interfiere desde N);
 *  - "X (hasta N) interfiere(n)" → interfiere dentro del intervalo ensayado: may_interfere_above sin umbral
 *    (null) y `testedUpTo` { value: N, unit }; no hay concentración segura declarada;
 *  - "X interfiere(n)" sin valor → may_interfere_above sin umbral; "X no interfiere(n)" sin valor → no_interference_below sin umbral;
 *  - «concentraciones por encima de lo normal / elevadas de X» añade `condition: 'elevated'`.
 * Una frase con efecto pero sin interferente conocido se guarda como 'other' con su sujeto como etiqueta.
 */
export const parseInterferences = (block) => {
  if (!block) return [];
  const body = block.replace(/^Interferencias:\s*/i, '').replace(/^[−–-]\s*/, '');
  const sentences = body.split(/(?<=\.)\s+(?=[A-ZÁÉÍÓÚÑ¿])|;\s+/);
  const thresholds = [];
  let currentMatrix = null;
  for (const raw of sentences) {
    let sentence = raw.trim();
    const heading = sentence.match(SENTENCE_MATRIX_HEADING);
    if (heading) {
      currentMatrix = matrixFromWord(heading[1]);
      sentence = sentence.slice(heading[0].length);
    }
    const verb = sentence.match(NO_INTERFERENCE) || sentence.match(INTERFERENCE);
    if (!verb) continue;
    const effect = NO_INTERFERENCE.test(sentence) ? 'no_interference_below' : 'may_interfere_above';
    const inline = sentence.match(SENTENCE_MATRIX_INLINE);
    const matrix = inline ? matrixFromWord(inline[1]) : currentMatrix;
    const elevated = sentence.match(ELEVATED_CONCENTRATION);
    // "hemólisis (hemoglobina …)" y "lipemia (triglicéridos …)" son una sola mención.
    const mentions = [];
    for (const match of sentence.matchAll(INTERFERENT_MENTION)) {
      const kind = INTERFERENTS[match.slice(1).findIndex((group) => group !== undefined)];
      const previous = mentions[mentions.length - 1];
      if (previous && previous.kind === kind && /^\s*\(?\s*$/.test(sentence.slice(previous.end, match.index))) {
        previous.end = match.index + match[0].length;
        continue;
      }
      mentions.push({ kind, start: match.index, end: match.index + match[0].length });
    }
    if (!mentions.length) {
      // Interferente no catalogado: se conserva la frase (su sujeto) para no perder la declaración.
      // El sujeto acaba antes del valor entre paréntesis o del verbo; el valor se sigue buscando después.
      const valueStart = sentence.slice(0, verb.index).search(/\(|\d/);
      const end = valueStart >= 0 ? valueStart : verb.index;
      const subject = sentence.slice(0, end).replace(/^(?:el|la|los|las|una?|the)\s+/i, '').replace(/[\s,]+$/, '');
      mentions.push({ kind: { key: 'other', label: subject || sentence.replace(/\.$/, '') }, start: 0, end });
    }
    mentions.forEach((mention, index) => {
      const segment = sentence.slice(mention.end, index + 1 < mentions.length ? mentions[index + 1].start : sentence.length);
      const value = segment.match(THRESHOLD_VALUE);
      const number = value ? parseNumber(value[2]) : null;
      const unit = value ? micro(value[3]) : null;
      const testedRangeOnly = effect === 'may_interfere_above' && value && value[1] && UP_TO_QUALIFIER.test(value[1].replace(/\s+/g, ' '));
      const entry = {
        interferent: mention.kind.key,
        label: mention.kind.label,
        thresholdValue: testedRangeOnly ? null : number,
        unit: testedRangeOnly ? null : unit,
        effect,
        matrix,
      };
      if (testedRangeOnly) entry.testedUpTo = { value: number, unit };
      if (!value && elevated && elevated.index < mention.end) entry.condition = 'elevated';
      const duplicate = thresholds.some(
        (item) =>
          ['interferent', 'label', 'thresholdValue', 'unit', 'effect', 'matrix', 'condition'].every((field) => item[field] === entry[field]) &&
          item.testedUpTo?.value === entry.testedUpTo?.value,
      );
      if (!duplicate) thresholds.push(entry);
    });
  }
  return serumFirst(thresholds);
};

/* ------------------------------------------------------------------ IFU */

const DURATION = String.raw`(\d+(?:[.,]\d+)?)\s*(meses|mes|semanas|semana|d[ií]as|d[ií]a|horas|hora)`;

/**
 * Límite del IFU ("Límite de detección: 3,69 mg/dL urea = 1,72 mg/dL BUN"): valor y unidad del primer término y,
 * si el IFU lo nombra junto a la unidad, el analito al que se refiere (`analyte`: urea frente a BUN).
 */
const measurementLimit = (text, label) => {
  const match = text.match(new RegExp(String.raw`L[ií]mite de ${label}:\s*([\d.,]+)\s*([^\s=.;]+)(?:\s+([a-záéíóúñ]+)(?=\s*(?:=|[.;]|$)))?`, 'i'));
  if (!match) return null;
  return { value: parseNumber(match[1]), unit: match[2], ...(match[3] ? { analyte: match[3] } : {}) };
};

/**
 * Reactivos de trabajo que se preparan antes de cargarlos (p. ej. "Reactivo de Trabajo A con fosfato de piridoxal
 * (Nota 1): … La mezcla es estable durante 6 días a 2-8ºC y durante 6 días en el compartimento refrigerado del
 * analizador."): nombre, frase de estabilidad y horas a bordo (las del compartimento refrigerado del analizador).
 */
const workingReagentStability = (text) => {
  const found = [];
  const pattern = /(Reactivo de [Tt]rabajo\b[^:.()]*?)\s*(?:\(Nota\s*\d+\)\s*)?:\s*(.*?)(?=\s+(?:MUESTRAS|CALIBRACI[OÓ]N|CONSERVACI[OÓ]N|PROCEDIMIENTO|Reactivo de [Tt]rabajo)\b|$)/g;
  for (const match of text.matchAll(pattern)) {
    const sentence = match[2].split(/(?<=\.)\s+/).find((item) => /compartimento refrigerado|a bordo/i.test(item) && new RegExp(DURATION, 'i').test(item));
    if (!sentence) continue;
    const onboard =
      sentence.match(new RegExp(String.raw`${DURATION}\s+(?:en\s+el\s+compartimento\s+refrigerado|a\s+bordo)`, 'i')) ||
      sentence.match(new RegExp(String.raw`(?:compartimento\s+refrigerado|a\s+bordo)[^.]*?${DURATION}`, 'i'));
    found.push({
      name: match[1].trim(),
      text: sentence.trim(),
      hours: onboard ? hoursFromDuration(parseNumber(onboard[1]), onboard[2]) : null,
    });
  }
  return found;
};

/** IFU de reactivo BA (español). */
export const parseIfu = (rawText) => {
  const text = flatten(rawText);
  const version = text.match(/\bM(\d{5})([a-z])-(\d{2})\s+(\d{2}\/\d{4})/);
  const onboard = text.match(/Estabilidad a bordo:\s*([^.]*\.)/i);
  const onboardDuration = onboard ? onboard[1].match(new RegExp(DURATION, 'i')) : null;
  const workingReagents = workingReagentStability(text);
  const deterioration = text.match(/Indicaciones de deterioro:\s*([^.]*\.)/i);
  const precisionBlock = between(text, /Precisi[oó]n:/i, /Veracidad|LIMITACIONES|BIBLIOGRAF/i) || '';
  const interferenceBlock = between(text, /Interferencias:/i, /[Oo]tros (?:medicamentos|f[aá]rmacos)|BIBLIOGRAF|PAR[AÁ]METROS DE LA PRUEBA|\bNOTAS?\s+\d/) || '';
  const calibrators = [...text.matchAll(/Calibrador[^.]*?cod\.\s*(\d{5})/gi)].map((match) => match[1]);
  const controlsBlock = between(text, /CONTROL DE CALIDAD/i, /VALORES DE REFERENCIA|CARACTER[IÍ]STICAS/i) || '';
  const controls = [...controlsBlock.matchAll(/\b(1[89]\d{3})\b/g)].map((match) => match[1]);
  const referenceBlock = between(text, /VALORES DE REFERENCIA/i, /CARACTER[IÍ]STICAS METROL[OÓ]GICAS/i);
  const calibrationBlock = between(text, /\bCALIBRACI[OÓ]N\s+(?=[A-Z][a-z])/, /CONTROL DE CALIDAD/i);
  const parameters = {
    analysisMode: (text.match(/Modo de an[aá]lisis\s+(.+?)\s+Unidad\s/i) || [])[1] || null,
    unit: pair(text, /\bUnidad\s+(\S+)\s+(\S+)\s+Decimales/i),
    reactionType: pair(text, /Tipo de reacci[oó]n\s+(\S+)\s+(\S+)/i),
    readMode: pair(text, /Modo de lectura\s+(\S+)\s+(\S+)/i),
    primaryFilterNm: pairNumbers(text, /Filtro principal\s+(\d{3})\s+(\d{3})/i),
    referenceFilterNm: pair(text, /Filtro de referencia\s+(\S+)\s+(\S+)/i),
    sampleVolumeUl: pairNumbers(text, /\bMuestra\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s+Vol\. R1/i),
    r1VolumeUl: pairNumbers(text, /Vol\. R1\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)/i),
    r2VolumeUl: pairNumbers(text, /Vol\. R2\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)/i),
    reading1Cycle: pairNumbers(text, /Lectura 1 \(ciclo\)\s+(\d+)\s+(\d+)/i),
    reading2Cycle: pairNumbers(text, /Lectura 2 \(ciclo\)\s+(\d+)\s+(\d+)/i),
    blankType: (text.match(/Tipo blanco\s+(.+?)\s+Modo calibraci[oó]n/i) || [])[1] || null,
    calibrationMode: (text.match(/Modo calibraci[oó]n\s+(.+?)\s+N[uú]mero de calibradores/i) || [])[1] || null,
    calibratorCount: pairNumbers(text, /N[uú]mero de calibradores\s+(\d+)\s+(\d+)/i),
    blankAbsorbanceLimit: pairNumbers(text, /L[ií]mite absorbancia blanco\s+([\d.,]+)\s+([\d.,]+)/i),
    kineticBlankLimit: pair(text, /L[ií]mite blanco cin[eé]tico\s+(\S+)\s+(\S+)/i),
    linearityLimit: pairNumbers(text, /L[ií]mite linealidad\s+([\d.,]+)\s+([\d.,]+)/i),
    substrateDepletion: pair(text, /Sustrato consumido\s+(\S+)\s+(\S+)/i),
  };
  // Las columnas BA200/BA400 repiten el mismo texto: "cinética bireactiva cinética bireactiva" → una sola vez.
  const dedupeHalves = (value) => {
    if (!value) return value;
    const words = value.split(' ');
    const middle = words.length / 2;
    return Number.isInteger(middle) && words.slice(0, middle).join(' ') === words.slice(middle).join(' ') ? words.slice(0, middle).join(' ') : value;
  };
  parameters.analysisMode = dedupeHalves(parameters.analysisMode);
  parameters.blankType = dedupeHalves(parameters.blankType);
  parameters.calibrationMode = dedupeHalves(parameters.calibrationMode);
  return {
    ifuCode: version ? `M${version[1]}${version[2]}-${version[3]}` : null,
    ifuDate: version ? version[4] : null,
    detectionLimit: measurementLimit(text, String.raw`detecci[oó]n`),
    quantificationLimit: measurementLimit(text, String.raw`cuantificaci[oó]n`),
    linearityLimit: measurementLimit(text, 'linealidad'),
    precision: parsePrecision(precisionBlock),
    // `hours` es la «Estabilidad a bordo» de los reactivos tal como se suministran; un reactivo de trabajo preparado
    // (p. ej. A + fosfato de piridoxal) tiene su propia estabilidad en `workingReagents`.
    onboardStability:
      onboard || workingReagents.length
        ? {
            text: onboard ? onboard[1].trim() : null,
            hours: onboardDuration ? hoursFromDuration(parseNumber(onboardDuration[1]), onboardDuration[2]) : null,
            ...(workingReagents.length ? { workingReagents } : {}),
          }
        : null,
    deteriorationSigns: deterioration ? deterioration[1].trim() : null,
    interferences: interferenceBlock ? interferenceBlock.slice(0, 700) : null,
    interferenceThresholds: parseInterferences(interferenceBlock),
    calibratorCodes: [...new Set(calibrators)],
    controlCodes: [...new Set(controls)],
    referenceValues: referenceBlock ? referenceBlock.slice(0, 700) : null,
    calibration: calibrationBlock ? calibrationBlock.slice(0, 500) : null,
    parameters,
  };
};

/* ------------------------------------------------------------------ tablas por columnas */

/** Columnas de una tabla a partir de la fila de encabezado: devuelve [{ key, x }] ordenado por x. */
const columnsFromHeader = (line, labels) => {
  const columns = [];
  for (const [key, pattern] of labels) {
    const word = line.words.find((item) => pattern.test(item.text));
    if (word) columns.push({ key, x: word.x });
  }
  return columns.sort((left, right) => left.x - right.x);
};

const columnOf = (x, columns, firstKey) => {
  let key = firstKey;
  for (const column of columns) if (x >= column.x - 4) key = column.key;
  return key;
};

const cellsByColumn = (line, columns, firstKey) => {
  const cells = {};
  for (const word of line.words) {
    const key = columnOf(word.x, columns, firstKey);
    cells[key] = cells[key] ? `${cells[key]} ${word.text}` : word.text;
  }
  return cells;
};

/* ------------------------------------------------------------------ certificado de análisis */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const COMPONENT_LOT = /^(?=[0-9A-Z]*\d)[0-9A-Z]{4,7}$/;
// Etiqueta de componente: A, B, A1, R1, R2, I, II, III, IV …
const COMPONENT_LABEL = /^(?:[A-Z]\d?|R\d{1,2}|[IVX]{1,4})$/;

/** Lotes de componente leídos por posición: cada fila de la tabla COMPONENT | LOT | EXP con su fecha ISO. */
const componentsFromPages = (pages) => {
  for (const page of pages || []) {
    const headerIndex = page.lines.findIndex(
      (line) => line.words.some((word) => /^COMPONENT$/i.test(word.text)) && line.words.some((word) => /^LOT$/i.test(word.text)) && line.words.some((word) => /^EXP$/i.test(word.text)),
    );
    if (headerIndex < 0) continue;
    const lotHeader = page.lines[headerIndex].words.find((word) => /^LOT$/i.test(word.text));
    const components = [];
    for (const line of page.lines.slice(headerIndex + 1)) {
      const date = line.words.find((word) => ISO_DATE.test(word.text));
      const lot = date && line.words.find((word) => word !== date && word.x < date.x && word.x >= lotHeader.x - 40 && COMPONENT_LOT.test(word.text));
      if (!date || !lot) break;
      const label = line.words.find((word) => word.x < lot.x - 5 && COMPONENT_LABEL.test(word.text));
      components.push({ component: label ? label.text : null, lot: lot.text, expiresAt: date.text });
    }
    if (components.length) return components;
  }
  return [];
};

/**
 * Lotes de componente desde el texto plano (sin posiciones). Tras COMPONENT/LOT/EXP vienen etiqueta, lote y fecha;
 * algunas plantillas imprimen las etiquetas al principio del documento ("A\nB\nCERTIFICATE …"): se emparejan en
 * orden solo si su número coincide con el de filas; si no, la etiqueta queda en null.
 */
const componentsFromText = (lines) => {
  const start = lines.findIndex((line, index) => /^COMPONENT$/i.test(line) && /^LOT$/i.test(lines[index + 1] || '') && /^EXP$/i.test(lines[index + 2] || ''));
  if (start < 0) return [];
  const components = [];
  let label = null;
  let lot = null;
  for (const line of lines.slice(start + 3)) {
    if (ISO_DATE.test(line) && lot) {
      components.push({ component: label, lot, expiresAt: line });
      label = null;
      lot = null;
    } else if (COMPONENT_LOT.test(line) && !lot) lot = line;
    else if (COMPONENT_LABEL.test(line) && !lot && !label) label = line;
    else break;
  }
  if (components.length && components.every((item) => item.component === null)) {
    const leading = [];
    for (const line of lines) {
      if (!COMPONENT_LABEL.test(line)) break;
      leading.push(line);
    }
    if (leading.length === components.length) components.forEach((item, index) => (item.component = leading[index]));
  }
  return components;
};

/** Especificación de una sola celda: "<0.650" → máx., ">1.2" → mín., "1.21 - 1.81" → ambos. */
export const parseSpecification = (text) => {
  const value = (text || '').replace(/\s+/g, ' ').trim();
  let match = value.match(/^(?:<=?|≤)\s*(\S+)$/);
  if (match) return { specMin: null, specMax: parseNumber(match[1]) };
  match = value.match(/^(?:>=?|≥)\s*(\S+)$/);
  if (match) return { specMin: parseNumber(match[1]), specMax: null };
  match = value.match(/^(-?[\d.,]+)\s*(?:-|–|a)\s*(-?[\d.,]+)$/);
  if (match) return { specMin: parseNumber(match[1]), specMax: parseNumber(match[2]) };
  return { specMin: null, specMax: null };
};

const COA_STOP = /^(?:Spec\.:|This lot|Approved by|Notes\b|A sheet containing)/i;

/**
 * Datos de control del CoA leídos por columnas en las dos plantillas:
 *  - actual: Lot | Unit | Result | Spec. (min) | Spec. (max) | Pass/Fail/NA con el nombre a la izquierda;
 *  - anterior a 2025 (lotes numéricos de 5 cifras): "REAGENT ABSORBANCE" con Result | Specification ("<0.650")
 *    | Pass/Fail/NA y "ACCURACY" con Sample | Lot | Unit | Result | Spec. (min) | Spec. (max) | Pass/Fail/NA.
 * Una sección termina en la primera fila sin resultado numérico.
 */
const parseCoaControlData = (pages) => {
  const rows = [];
  for (const page of pages || []) {
    const lines = page.lines;
    for (let index = 0; index < lines.length; index += 1) {
      const header = lines[index];
      if (!(header.words.some((word) => word.text === 'Result') && header.words.some((word) => /^Pass\/Fail/.test(word.text)))) continue;
      const columns = columnsFromHeader(header, [
        ['name', /^Sample$/],
        ['lot', /^Lot$/],
        ['unit', /^Unit$/],
        ['result', /^Result$/],
        ['specification', /^Specification$/],
        ['verdict', /^Pass\/Fail/],
      ]);
      header.words.forEach((word, position) => {
        const next = header.words[position + 1];
        if (word.text === 'Spec.' && next && /^\(min\)$/.test(next.text)) columns.push({ key: 'specMin', x: word.x });
        if (word.text === 'Spec.' && next && /^\(max\)$/.test(next.text)) columns.push({ key: 'specMax', x: word.x });
      });
      columns.sort((left, right) => left.x - right.x);
      // Sin columna de nombre (REAGENT ABSORBANCE de la plantilla anterior) el nombre es el título de la sección.
      const firstData = lines[index + 1];
      const hasNameColumn = columns[0].key === 'name' || Boolean(firstData && firstData.words.some((word) => word.x < columns[0].x - 4));
      const sectionTitle = index > 0 ? lines[index - 1].words.map((word) => word.text).join(' ') : null;
      for (const line of lines.slice(index + 1)) {
        const joined = line.words.map((word) => word.text).join(' ');
        if (COA_STOP.test(joined)) break;
        const cells = cellsByColumn(line, columns, 'name');
        const result = parseNumber(cells.result);
        if (result === null) break;
        const spec = cells.specification ? parseSpecification(cells.specification) : { specMin: parseNumber(cells.specMin), specMax: parseNumber(cells.specMax) };
        rows.push({
          name: hasNameColumn ? cells.name || null : sectionTitle,
          lot: cells.lot || null,
          unit: cells.unit || null,
          result,
          specMin: spec.specMin,
          specMax: spec.specMax,
          verdict: cells.verdict || null,
        });
      }
    }
  }
  return rows;
};

/** Certificado de análisis (CoA): lote de producto, caducidad, lotes de componente y datos de control. */
export const parseCoa = (rawText, pages = []) => {
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const text = flatten(rawText);
  // El certificado imprime el valor antes de su etiqueta (21592 COD 0004061 LOT 2028-10-01 EXP 2025-11-14 MANUF);
  // se acepta también el orden etiqueta-valor de la plantilla anterior.
  const header =
    text.match(/(\d{5})\s+COD\s+(\S+)\s+LOT\s+(\d{4}-\d{2}-\d{2})\s+EXP\s+(\d{4}-\d{2}-\d{2})\s+MANUF/) ||
    text.match(/COD\s+(\d{5})\s+LOT\s+(\S+)\s+EXP\s+(\d{4}-\d{2}-\d{2})\s+MANUF\s+(\d{4}-\d{2}-\d{2})/);
  const positional = componentsFromPages(pages);
  const components = positional.length ? positional : componentsFromText(lines);
  const controlData = parseCoaControlData(pages);
  const passIndex = controlData.length ? -1 : lines.findIndex((line) => /^Pass\/Fail\/NA$/i.test(line));
  if (passIndex >= 0) {
    // Respaldo de texto plano para la plantilla actual (sin posiciones): columnas impresas una tras otra.
    const names = [];
    let index = passIndex + 1;
    while (index < lines.length && /^[A-Z][A-Z ]+\d*$/.test(lines[index]) && !/^(Abs|U\/L)/.test(lines[index])) {
      names.push(lines[index]);
      index += 1;
    }
    const count = names.length;
    if (count) {
      const rest = lines.slice(index, index + count * 6 + 2).filter((line) => !/^Spec\./.test(line));
      // El primer control (absorbancia del reactivo) no lleva lote: la columna de lotes tiene count-1 valores.
      const lots = rest.slice(0, count - 1);
      const units = rest.slice(count - 1, count * 2 - 1);
      const results = rest.slice(count * 2 - 1, count * 3 - 1);
      const mins = rest.slice(count * 3 - 1, count * 4 - 1);
      const maxs = rest.slice(count * 4 - 1, count * 5 - 1);
      const verdicts = rest.slice(count * 5 - 1, count * 6 - 1);
      names.forEach((name, position) => {
        controlData.push({
          name,
          lot: position === 0 ? null : lots[position - 1] || null,
          unit: units[position] || null,
          result: parseNumber(results[position]),
          specMin: parseNumber(mins[position]),
          specMax: parseNumber(maxs[position]),
          verdict: verdicts[position] || null,
        });
      });
    }
  }
  return {
    productCode: header ? header[1] : null,
    productLot: header ? header[2] : null,
    expiresAt: header ? header[3] : null,
    manufacturedAt: header ? header[4] : null,
    components,
    controlData,
    released: /released for sale/i.test(text),
  };
};

/* ------------------------------------------------------------------ hoja de valores de control */

const VALUE_SHEET_COLUMNS = [
  ['method', /^M[EÉ]TODO$/i],
  ['value', /^VALOR$/i],
  ['limits', /^L[IÍ]MITES$/i],
  ['sd1', /^1S$/],
  ['unit', /^UNIDAD$/i],
  ['traceability', /^TRAZABILIDAD$/i],
];
const VALUE_KEYS = new Set(['value', 'limits', 'sd1', 'unit']);
const isPlaceholder = (text) => /^\*+$/.test(text || '');

/** Palabras agrupadas en renglones (tolerancia vertical), ordenados de arriba abajo y leídos de izquierda a derecha. */
const textLines = (words, tolerance = 2.5) => {
  const lines = [];
  for (const word of [...words].sort((left, right) => left.y - right.y || left.x - right.x)) {
    const line = lines.find((item) => Math.abs(item.y - word.y) <= tolerance);
    if (line) line.words.push(word);
    else lines.push({ y: word.y, words: [word] });
  }
  return lines.map((line) => {
    const sorted = line.words.sort((left, right) => left.x - right.x);
    return { y: line.y, words: sorted, text: sorted.map((word) => word.text).join(' ') };
  });
};

/** Índice de la celda (entre reglas) que contiene y. */
const spanIndex = (bounds, y) => bounds.filter((bound) => bound < y).length;

/**
 * Reparte elementos ordenados (filas o grupos con top/bottom) en tantos tramos contiguos como etiquetas, de modo
 * que cada etiqueta quede lo más cerca posible del centro vertical de su tramo (las etiquetas van centradas en su
 * celda). Devuelve el índice de etiqueta de cada elemento, o null si no hay al menos un elemento por etiqueta.
 */
const segmentByCenteredLabels = (labels, items) => {
  const n = items.length;
  const m = labels.length;
  if (!m || n < m) return null;
  const best = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(Infinity));
  const from = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(-1));
  best[0][0] = 0;
  for (let k = 1; k <= m; k += 1) {
    for (let end = k; end <= n - (m - k); end += 1) {
      for (let start = k - 1; start < end; start += 1) {
        if (best[k - 1][start] === Infinity) continue;
        const cost = best[k - 1][start] + Math.abs(labels[k - 1].y - (items[start].top + items[end - 1].bottom) / 2);
        if (cost < best[k][end]) {
          best[k][end] = cost;
          from[k][end] = start;
        }
      }
    }
  }
  const assignment = new Array(n);
  let end = n;
  for (let k = m; k >= 1; k -= 1) {
    const start = from[k][end];
    for (let index = start; index < end; index += 1) assignment[index] = k - 1;
    end = start;
  }
  return assignment;
};

/** Etiquetas de varias líneas (p. ej. "Fosfotungstato/Mg - Colesterol" + "oxidasa/peroxidasa") se unen si no hay una fila de valores entre ellas. */
const mergeLabelLines = (lines, rowYs) => {
  const merged = [];
  for (const line of lines) {
    const previous = merged[merged.length - 1];
    if (previous && line.y - previous.last <= 7.5 && !rowYs.some((y) => y > previous.last + 0.5 && y < line.y - 0.5)) {
      previous.text = `${previous.text} ${line.text}`;
      previous.last = line.y;
      previous.y = (previous.first + line.y) / 2;
    } else merged.push({ text: line.text, y: line.y, first: line.y, last: line.y });
  }
  return merged;
};

const valueRowFromCells = (cells) => {
  // El límite inferior empieza antes de la columna LIMITES del encabezado: cae en la celda VALOR.
  const valueTokens = (cells.value || '').split(' ').filter(Boolean);
  const valueText = valueTokens[0];
  if (!valueText || isPlaceholder(valueText)) return null;
  const limitsText = [...valueTokens.slice(1), cells.limits || ''].join(' ').trim();
  const limits = limitsText.match(/^(\S+)\s*-\s*(\S+)$/) || limitsText.match(/^(\S+)\s+(\S+)$/);
  return {
    value: parseNumber(valueText),
    low: limits && !isPlaceholder(limits[1]) ? parseNumber(limits[1]) : null,
    high: limits && !isPlaceholder(limits[2]) ? parseNumber(limits[2]) : null,
    sd1: cells.sd1 && !isPlaceholder(cells.sd1) ? parseNumber(cells.sd1) : null,
    unit: cells.unit ? micro(cells.unit) : null,
  };
};

const cellsFromWords = (words) => {
  const cells = {};
  for (const word of [...words].sort((left, right) => left.x - right.x)) cells[word.key] = cells[word.key] ? `${cells[word.key]} ${word.text}` : word.text;
  return cells;
};

/**
 * Hoja de valores de control (Value Sheet), leída por columnas: COMPONENTE | MÉTODO | VALOR | LIMITES | 1S |
 * UNIDAD | TRAZABILIDAD. Cada método agrupa una o dos filas de valores (unidad convencional y SI) y cada
 * componente uno o varios métodos; sus nombres van centrados verticalmente en su celda.
 *  - Con las reglas horizontales del PDF (pdf-text.py), la celda de cada componente, método y fila queda
 *    delimitada exactamente: una regla que nace en la columna COMPONENTE cierra un componente, una que nace en
 *    MÉTODO cierra un método y las discontinuas de la zona de valores separan filas.
 *  - Sin reglas, los tramos se reconstruyen colocando cada etiqueta en el centro de sus filas.
 * Las filas con '*' o '**' (valor no asignado para este nivel) se omiten.
 */
export const parseValueSheet = (pages) => {
  const rows = [];
  let level = null;
  let lot = null;
  for (const page of pages || []) {
    const headerLine = page.lines.find((line) => line.words.some((word) => /^COMPONENTE$/i.test(word.text)) && line.words.some((word) => /^VALOR$/i.test(word.text)));
    const levelLine = (page.rows || []).find((row) => /NIVEL:\s*(\S+)\s+LOTE:\s*(\S+)/.test(row));
    if (levelLine) {
      const match = levelLine.match(/NIVEL:\s*(\S+)\s+LOTE:\s*(\S+)/);
      level ||= match[1];
      lot ||= match[2];
    }
    if (!headerLine) continue;
    const columns = columnsFromHeader(headerLine, VALUE_SHEET_COLUMNS);
    const methodX = columns.find((column) => column.key === 'method')?.x ?? 0;
    const valueX = columns.find((column) => column.key === 'value')?.x ?? 0;
    const headerY = Math.max(headerLine.y, ...headerLine.words.map((word) => word.y ?? headerLine.y));
    const words = [];
    for (const line of page.lines) {
      for (const word of line.words) {
        const y = word.y ?? line.y;
        if (y <= headerY + 1) continue;
        words.push({ key: columnOf(word.x, columns, 'component'), x: word.x, y, text: word.text });
      }
    }
    const rules = (page.rules || []).filter((rule) => rule.y > headerY + 1 && rule.x1 > valueX);
    const componentBounds = [...new Set(rules.filter((rule) => rule.x0 < methodX - 20).map((rule) => rule.y))].sort((a, b) => a - b);

    let valueRows;
    let componentOf;
    let methodOf;
    let traceabilityOf;
    if (componentBounds.length >= 2) {
      const tableBottom = componentBounds[componentBounds.length - 1];
      const methodBounds = [...new Set(rules.filter((rule) => rule.x0 < valueX - 20).map((rule) => rule.y))].sort((a, b) => a - b);
      const rowBounds = [...new Set(rules.map((rule) => rule.y))].sort((a, b) => a - b);
      const inTable = words.filter((word) => word.y < tableBottom);
      const bySpan = (bounds, key) => {
        const spans = new Map();
        for (const word of inTable.filter((item) => item.key === key)) {
          const span = spanIndex(bounds, word.y);
          spans.set(span, [...(spans.get(span) || []), word]);
        }
        return spans;
      };
      const componentWords = bySpan(componentBounds, 'component');
      const methodWords = bySpan(methodBounds, 'method');
      const traceWords = bySpan(methodBounds, 'traceability');
      const rowWords = new Map();
      for (const word of inTable.filter((item) => VALUE_KEYS.has(item.key))) {
        const span = spanIndex(rowBounds, word.y);
        rowWords.set(span, [...(rowWords.get(span) || []), word]);
      }
      valueRows = [...rowWords.values()]
        .map((items) => ({ y: items.reduce((total, item) => total + item.y, 0) / items.length, cells: cellsFromWords(items) }))
        .sort((left, right) => left.y - right.y);
      const label = (spans, bounds, y) => {
        const items = spans.get(spanIndex(bounds, y));
        return items ? textLines(items).map((line) => line.text).join(' ') : null;
      };
      componentOf = (row) => label(componentWords, componentBounds, row.y);
      methodOf = (row) => label(methodWords, methodBounds, row.y);
      traceabilityOf = (row) => {
        const items = traceWords.get(spanIndex(methodBounds, row.y));
        return items ? [...new Set(textLines(items).map((line) => line.text))].join('; ') : null;
      };
    } else {
      // Sin reglas: filas por renglón; métodos y componentes por tramos centrados en su etiqueta. La tabla acaba
      // en las NOTAS al pie, y una fila de valores empieza por un número o un marcador '*' y lleva unidad.
      const notes = words.find((word) => word.key === 'component' && /^NOTAS?:?$/i.test(word.text));
      const tableWords = notes ? words.filter((word) => word.y < notes.y - 1) : words;
      valueRows = textLines(tableWords.filter((word) => VALUE_KEYS.has(word.key)))
        .map((line) => ({ y: line.y, cells: cellsFromWords(line.words) }))
        .filter((row) => /^(?:\d|\*)/.test(row.cells.value || '') && row.cells.unit);
      const rowYs = valueRows.map((row) => row.y);
      const top = Math.min(...rowYs) - 3;
      const bottom = Math.max(...rowYs) + 3;
      const inBand = (key) => textLines(tableWords.filter((word) => word.key === key && word.y >= top && word.y <= bottom));
      const methodLabels = mergeLabelLines(inBand('method'), rowYs);
      const componentLabels = mergeLabelLines(inBand('component').filter((line) => /^[A-ZÁÉÍÓÚÜÑÀÈÌÒÙÂÊÎÔÛÄËÏÖÇα-ωΑ-Ω0-9]/.test(line.text)), rowYs);
      const rowMethod = segmentByCenteredLabels(methodLabels, valueRows.map((row) => ({ top: row.y, bottom: row.y }))) || valueRows.map(() => null);
      valueRows.forEach((row, position) => (row.group = rowMethod[position]));
      const groups = methodLabels.map((methodLabel, index) => {
        const ys = valueRows.filter((row) => row.group === index).map((row) => row.y);
        return { label: methodLabel, top: Math.min(...ys), bottom: Math.max(...ys) };
      });
      const groupComponent = segmentByCenteredLabels(componentLabels, groups) || groups.map(() => null);
      const traceLines = inBand('traceability');
      componentOf = (row) => (row.group === null || groupComponent[row.group] === null ? null : componentLabels[groupComponent[row.group]].text);
      methodOf = (row) => (row.group === null ? null : methodLabels[row.group].text);
      traceabilityOf = (row) => {
        const group = row.group;
        if (group === null) return null;
        const { top: groupTop, bottom: groupBottom } = groups[group];
        const owned = traceLines.filter((line) => {
          const nearest = groups.reduce((best, item, index) => {
            const distance = line.y < item.top ? item.top - line.y : line.y > item.bottom ? line.y - item.bottom : 0;
            return !best || distance < best.distance ? { index, distance } : best;
          }, null);
          return nearest && nearest.index === group && line.y >= groupTop - 6 && line.y <= groupBottom + 6;
        });
        return owned.length ? [...new Set(owned.map((line) => line.text))].join('; ') : null;
      };
    }
    for (const row of valueRows) {
      const parsed = valueRowFromCells(row.cells);
      if (!parsed) continue;
      rows.push({
        component: componentOf(row),
        method: methodOf(row),
        value: parsed.value,
        low: parsed.low,
        high: parsed.high,
        sd1: parsed.sd1,
        unit: parsed.unit,
        traceability: traceabilityOf(row),
      });
    }
  }
  return { level, lot, rows };
};
