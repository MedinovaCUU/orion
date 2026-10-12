import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { slimForFrontend } from './einfo-lot-facts.mjs';
import { chooseLotMatch, componentVerdict } from './lot-matching.mjs';
import { parseCoa, parseIfu, parseInterferences, parseNumber, parsePrecision, parseSpecification, parseValueSheet } from './parsers.mjs';

// Extractores de einfo.bio contra textos reales guardados en fixtures/einfo-texts.json (salida de pdf-text.py):
// IFU y CoA de reactivos (plantilla actual y anterior a 2025), CoA y hojas de valores de los controles 18009/18010.
const docs = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./fixtures/einfo-texts.json', import.meta.url)), 'utf8'));
const byName = (part) => {
  const doc = docs.find((item) => item.file.includes(part));
  assert.ok(doc, `fixture ${part}`);
  return doc;
};
const checks = [];
const check = (name, fn) => {
  fn();
  checks.push(name);
};
const threshold = (ifu, interferent) => ifu.interferenceThresholds.filter((item) => item.interferent === interferent);

/* ------------------------------------------------------------------ IFU */

const ifu = parseIfu(byName('21580_0005719_IFU').text);
check('IFU: version, limits, precision, stability, filters and volumes', () => {
  assert.equal(ifu.ifuCode, 'M21580c-07');
  assert.deepEqual(ifu.detectionLimit, { value: 24.4, unit: 'U/L' });
  assert.deepEqual(ifu.linearityLimit, { value: 1250, unit: 'U/L' });
  assert.equal(ifu.precision.length, 2);
  assert.equal(ifu.precision[0].totalCv, 2.5);
  assert.equal(ifu.onboardStability.hours, 1440);
  assert.deepEqual(ifu.parameters.primaryFilterNm, { ba200: 340, ba400: 340 });
  assert.deepEqual(ifu.parameters.r1VolumeUl, { ba200: 160, ba400: 160 });
  assert.deepEqual(ifu.parameters.blankAbsorbanceLimit, { ba200: 1.2, ba400: 1.2 });
  assert.equal(ifu.parameters.analysisMode, 'cinética bireactiva');
  assert.equal(ifu.parameters.calibrationMode, 'calibrador experimental');
  assert.deepEqual(ifu.calibratorCodes, ['18011', '18044']);
  assert.ok(ifu.controlCodes.includes('18009'));
  assert.deepEqual(threshold(ifu, 'bilirubin'), [{ interferent: 'bilirubin', label: 'Bilirrubina', thresholdValue: 20, unit: 'mg/dL', effect: 'no_interference_below', matrix: null }]);
});

check('IFU 21506 BILI TOTAL: "La lipemia (triglicéridos hasta 1300 mg/dL) interfiere" interferes within the tested range: no onset threshold, testedUpTo 1300', () => {
  const bili = parseIfu(byName('21506_0004659_IFU').text);
  // Nunca "interfiere por encima de 1300": eso daría por segura cualquier lipemia por debajo de 1300 mg/dL.
  assert.deepEqual(threshold(bili, 'lipemia'), [
    { interferent: 'lipemia', label: 'Lipemia (triglicéridos)', thresholdValue: null, unit: null, effect: 'may_interfere_above', matrix: null, testedUpTo: { value: 1300, unit: 'mg/dL' } },
  ]);
  assert.deepEqual(threshold(bili, 'hemolysis').map((item) => [item.thresholdValue, item.effect, item.testedUpTo]), [[250, 'no_interference_below', undefined]]);
});

check('Interferences: the qualifier before the value decides the direction ("hasta"/"<" vs bare value vs ">"/"por encima de")', () => {
  const rows = (text) => parseInterferences(text).map((item) => [item.interferent, item.thresholdValue, item.effect, item.testedUpTo?.value ?? null]);
  assert.deepEqual(rows('Interferencias: La lipemia (triglicéridos hasta 1300 mg/dL) interfiere.'), [['lipemia', null, 'may_interfere_above', 1300]]);
  assert.deepEqual(rows('Interferencias: La lipemia (triglicéridos <1300 mg/dL) interfiere.'), [['lipemia', null, 'may_interfere_above', 1300]]);
  assert.deepEqual(rows('Interferencias: La lipemia (triglicéridos 1300 mg/dL) interfiere.'), [['lipemia', 1300, 'may_interfere_above', null]]);
  assert.deepEqual(rows('Interferencias: La lipemia (triglicéridos >1300 mg/dL) interfiere.'), [['lipemia', 1300, 'may_interfere_above', null]]);
  assert.deepEqual(rows('Interferencias: La bilirrubina por encima de 20 mg/dL interfiere.'), [['bilirubin', 20, 'may_interfere_above', null]]);
  assert.deepEqual(rows('Interferencias: La bilirrubina (hasta 20 mg/dL) no interfiere.'), [['bilirubin', 20, 'no_interference_below', null]]);
});

check('IFU 21504 BILI DIRECT: thresholds without "hasta" are read and both interfere', () => {
  const direct = parseIfu(byName('21504_0004746_IFU').text);
  assert.deepEqual(
    direct.interferenceThresholds.map((item) => [item.interferent, item.label, item.thresholdValue, item.unit, item.effect]),
    [
      ['hemolysis', 'Hemólisis (hemoglobina)', 25, 'mg/dL', 'may_interfere_above'],
      ['lipemia', 'Lipemia (triglicéridos)', 1300, 'mg/dL', 'may_interfere_above'],
    ],
  );
});

check('IFU 21531 AST: lipemia 2 g/L interferes; bilirubin 20 mg/dL and hemoglobin 50 mg/dL do not', () => {
  const ast = parseIfu(byName('21531_0004182_IFU').text);
  assert.deepEqual(
    ast.interferenceThresholds.map((item) => [item.interferent, item.thresholdValue, item.unit, item.effect]),
    [
      ['lipemia', 2, 'g/L', 'may_interfere_above'],
      ['bilirubin', 20, 'mg/dL', 'no_interference_below'],
      ['hemolysis', 50, 'mg/dL', 'no_interference_below'],
    ],
  );
});

check('Interferences: matrix per sentence (serum first), ascorbic acid, no-value statements and glued footnote numbers', () => {
  const parsed = parseInterferences(
    'Interferencias: Orina: El ácido ascórbico (hasta 50 mg/dL) interfiere. Suero: La bilirrubina (<20 mg/dL) y la hemólisis (hemoglobina 2 g/L) no interfieren6. La lipemia interfiere. El àcido ascórbico (hasta 6,25 mg/dL) no interfiere en muestras de suero. El paracetamol (hasta 20 mg/dL) no interfiere.',
  );
  assert.deepEqual(
    parsed.map((item) => [item.interferent, item.thresholdValue, item.unit, item.effect, item.matrix]),
    [
      ['bilirubin', 20, 'mg/dL', 'no_interference_below', 'serum'],
      ['hemolysis', 2, 'g/L', 'no_interference_below', 'serum'],
      ['lipemia', null, null, 'may_interfere_above', 'serum'],
      ['ascorbic_acid', 6.25, 'mg/dL', 'no_interference_below', 'serum'],
      ['acetaminophen', 20, 'mg/dL', 'no_interference_below', 'serum'],
      ['ascorbic_acid', null, null, 'may_interfere_above', 'urine'],
    ],
  );
  assert.deepEqual(parsed[5].testedUpTo, { value: 50, unit: 'mg/dL' });
  assert.equal(parsed.find((item) => item.interferent === 'ascorbic_acid').label, 'Ácido ascórbico');
  assert.deepEqual(parseInterferences('Interferencias: La bilirrubina (hasta 20 mg/dL) no interfiere. La bilirrubina (<20 mg/dL) no interfiere.').length, 1);
});

check('IFU 21792 CK-MB: CK-BB, adenylate kinase, macro-CK and mitochondrial CK interfere when above normal (no numeric threshold)', () => {
  const ckmb = parseIfu(byName('21792_0001304_IFU').text);
  assert.deepEqual(
    ckmb.interferenceThresholds.map((item) => [item.interferent, item.label, item.thresholdValue, item.unit, item.effect, item.condition ?? null]),
    [
      ['bilirubin', 'Bilirrubina', 20, 'mg/dL', 'no_interference_below', null],
      ['hemolysis', 'Hemólisis (hemoglobina)', 250, 'mg/dL', 'no_interference_below', null],
      ['lipemia', 'Lipemia (triglicéridos)', 125, 'mg/dL', 'no_interference_below', null],
      ['ck_bb', 'CK-BB', null, null, 'may_interfere_above', 'elevated'],
      ['adenylate_kinase', 'Adenilato quinasa', null, null, 'may_interfere_above', 'elevated'],
      ['macro_ck', 'Macro-CK', null, null, 'may_interfere_above', 'elevated'],
      ['mitochondrial_ck', 'CK mitocondrial', null, null, 'may_interfere_above', 'elevated'],
    ],
  );
});

check('IFU 21502 CREATININE (M21502c-10 and -11): proteins and ketones do not interfere; elevated reducing substances do', () => {
  const summary = (name) =>
    parseIfu(byName(name).text)
      .interferenceThresholds.filter((item) => ['protein', 'ketones', 'reducing_substances'].includes(item.interferent))
      .map((item) => [item.interferent, item.thresholdValue, item.effect, item.condition ?? null]);
  const expected = [
    ['protein', null, 'no_interference_below', null],
    ['ketones', null, 'no_interference_below', null],
    ['reducing_substances', null, 'may_interfere_above', 'elevated'],
  ];
  // c-11: «cuerpos proteicos y cetónicos no interfieren. Una concentración elevada de compuestos reductores puede interferir.»
  assert.deepEqual(summary('21502_0002601_IFU'), expected);
  // c-10: «la proteína y compuestos cetónicos no interfieren. La determinación puede ser afectada por concentraciones elevadas de sustancias reductoras.»
  assert.deepEqual(summary('21502_0001236_IFU'), expected);
  assert.deepEqual(threshold(parseIfu(byName('21502_0001236_IFU').text), 'lipemia').map((item) => item.thresholdValue), [200]);
});

check('Interferences: every interferent named in an effect sentence is kept (LDH delayed separation, unknown subjects as "other")', () => {
  const ldh = parseIfu(byName('21580_0005719_IFU').text);
  assert.deepEqual(
    ldh.interferenceThresholds.filter((item) => item.thresholdValue === null).map((item) => [item.interferent, item.effect]),
    [
      ['hemolysis', 'may_interfere_above'],
      ['delayed_separation', 'may_interfere_above'],
    ],
  );
  const other = parseInterferences('Interferencias: La bilirrubina (hasta 20 mg/dL) no interfiere. Los anticoagulantes con flúor (hasta 3 g/L) interfieren.');
  assert.deepEqual(other[1], { interferent: 'other', label: 'anticoagulantes con flúor', thresholdValue: null, unit: null, effect: 'may_interfere_above', matrix: null, testedUpTo: { value: 3, unit: 'g/L' } });
});

check('IFU 21531/21533 working reagent with pyridoxal phosphate: 144 h on board kept apart from the 2-month plain reagents', () => {
  const ast = parseIfu(byName('21531_0004182_IFU').text);
  assert.equal(ast.onboardStability.hours, 1440);
  assert.deepEqual(ast.onboardStability.workingReagents, [
    {
      name: 'Reactivo de Trabajo A con fosfato de piridoxal',
      text: 'La mezcla es estable durante 6 días a 2-8ºC y durante 6 días en el compartimento refrigerado del analizador.',
      hours: 144,
    },
  ]);
  // La frase de calibración "(6 días para el Reactivo de Trabajo con Fosfato de piridoxal)" no es un reactivo de trabajo.
  assert.equal(ast.onboardStability.workingReagents.length, 1);
  assert.equal(ifu.onboardStability.workingReagents, undefined);
});

check('IFU 21516 UREA: limits and precision keep the analyte they refer to (urea, not BUN)', () => {
  const urea = parseIfu(byName('21516_0003375_IFU').text);
  assert.deepEqual(urea.detectionLimit, { value: 3.69, unit: 'mg/dL', analyte: 'urea' });
  assert.deepEqual(urea.linearityLimit, { value: 300, unit: 'mg/dL', analyte: 'urea' });
  assert.deepEqual(
    urea.precision.map((item) => [item.mean, item.unit, item.matrix, item.analyte]),
    [
      [26.8, 'mg/dL', 'serum', 'urea'],
      [137, 'mg/dL', 'serum', 'urea'],
      [1291, 'mg/dL', 'urine', 'urea'],
      [1771, 'mg/dL', 'urine', 'urea'],
    ],
  );
  // Sin analito impreso no se añade el campo.
  assert.ok(ifu.precision.every((item) => !('analyte' in item)));
  assert.equal('analyte' in ifu.linearityLimit, false);
});

check('IFU 21790 CK: precision rows with a second parenthesised alternate unit ("= 2600 nkat/L (2,6 µkat/L)")', () => {
  const ck = parseIfu(byName('21790_0001543_IFU').text);
  assert.deepEqual(ck.precision, [
    { mean: 159, unit: 'U/L', repeatabilityCv: 1.1, totalCv: 3.3, matrix: null },
    { mean: 299, unit: 'U/L', repeatabilityCv: 0.7, totalCv: 2, matrix: null },
  ]);
});

check('IFU 21797 Mg: serum and urine precision tables carry their matrix, serum rows first', () => {
  const magnesium = parseIfu(byName('21797_0000142_IFU').text);
  assert.deepEqual(
    magnesium.precision.map((item) => [item.mean, item.matrix]),
    [
      [1.53, 'serum'],
      [2.88, 'serum'],
      [3.43, 'serum'],
      [3.22, 'urine'],
      [7.1, 'urine'],
      [13.4, 'urine'],
    ],
  );
  assert.deepEqual(magnesium.precision[3], { mean: 3.22, unit: 'mg/dL', repeatabilityCv: 3.8, totalCv: 8.6, matrix: 'urine' });
  // Una tabla de orina impresa antes que la de suero se reordena con suero primero.
  const reordered = parsePrecision('Precisión: Orina. Concentración media 20,9 mg/dL = 1243 µmol/L 2,5 % 3,4 % Suero. Concentración media 5,2 mg/dL = 311 µmol/L 1,3 % 1,9 %');
  assert.deepEqual(reordered.map((item) => [item.mean, item.matrix]), [[5.2, 'serum'], [20.9, 'urine']]);
});

/* ------------------------------------------------------------------ números y especificaciones */

check('Numbers: locale-aware decimal separator (single separator = decimal, grouping only when unambiguous)', () => {
  const cases = {
    '0.575': 0.575,
    '1.59': 1.59,
    '0,401': 0.401,
    '108,408': 108.408,
    '81,400': 81.4,
    '117,200': 117.2,
    '1,200': 1.2,
    '1250': 1250,
    '24,4': 24.4,
    '34.0': 34,
    '1.200,5': 1200.5,
    '1,200.5': 1200.5,
    '1.200.000': 1200000,
    '1300.': 1300,
    '-0,565': -0.565,
    '0001A': 1,
  };
  for (const [text, expected] of Object.entries(cases)) assert.equal(parseNumber(text), expected, text);
  for (const text of ['U/L', '*', '**', '', null, undefined, '1.2.3']) assert.equal(parseNumber(text), null, String(text));
  assert.deepEqual(parseSpecification('<0.650'), { specMin: null, specMax: 0.65 });
  assert.deepEqual(parseSpecification('>1.2'), { specMin: 1.2, specMax: null });
  assert.deepEqual(parseSpecification('1.21 - 1.81'), { specMin: 1.21, specMax: 1.81 });
});

/* ------------------------------------------------------------------ CoA */

const coaLdh = parseCoa(byName('21580_0005719_CoA').text, byName('21580_0005719_CoA').pages);
check('CoA: product lot, components and control rows by column (blank max cell tolerated)', () => {
  assert.equal(coaLdh.productLot, '0005719');
  assert.equal(coaLdh.expiresAt, '2028-11-04');
  assert.deepEqual(coaLdh.components.map((item) => item.lot), ['00004', '00004']);
  assert.equal(coaLdh.controlData.length, 5);
  assert.equal(coaLdh.controlData[0].specMax, null);
  assert.deepEqual(coaLdh.controlData[1], { name: 'ACCURACY SAMPLE 1', lot: '0003A', unit: 'U/L', result: 415.244, specMin: 344, specMax: 494, verdict: 'Pass' });
  assert.equal(coaLdh.released, true);
});

const coaCk = parseCoa(byName('21790_0003496_CoA').text, byName('21790_0003496_CoA').pages);
check('CoA CK: component lot 00004 confirms the barcode lot of the 2026 bottle', () => {
  assert.equal(coaCk.productLot, '0003496');
  assert.ok(coaCk.components.every((item) => item.lot === '00004'));
  assert.equal(coaCk.controlData[0].specMax, 0.3);
});

check('CoA new template 21592: comma decimals unchanged (0,401 / 108,408 / 81,400 / 117,200)', () => {
  const alp = parseCoa(byName('21592_0004061_CoA').text, byName('21592_0004061_CoA').pages);
  assert.deepEqual(alp.components, [
    { component: 'A', lot: '00006', expiresAt: '2028-10-01' },
    { component: 'B', lot: '00006', expiresAt: '2028-10-01' },
  ]);
  assert.deepEqual(alp.controlData[0], { name: 'REAGENT ABSORBANCE', lot: null, unit: 'Abs', result: 0.401, specMin: 0, specMax: 1.2, verdict: 'Pass' });
  assert.deepEqual(alp.controlData[1], { name: 'ACCURACY SAMPLE 1', lot: '0002A', unit: 'U/L', result: 108.408, specMin: 81.4, specMax: 117.2, verdict: 'Pass' });
  assert.equal(alp.controlData.length, 5);
});

check('CoA 21797 lot 0000142: component letters printed apart from the table still pair with lot 60632', () => {
  const doc = byName('21797_0000142_CoA');
  const expected = [
    { component: 'A', lot: '60632', expiresAt: '2027-08-31' },
    { component: 'B', lot: '60632', expiresAt: '2027-08-31' },
  ];
  const positional = parseCoa(doc.text, doc.pages);
  assert.equal(positional.productLot, '0000142');
  assert.deepEqual(positional.components, expected);
  // Solo con el texto plano ("A\nB\nCERTIFICATE …" y luego "COMPONENT LOT EXP 60632 2027-08-31 …").
  assert.deepEqual(parseCoa(doc.text, []).components, expected);
  assert.equal(componentVerdict('60632', positional), 'confirmed');
});

check('CoA control 18010: roman component label II', () => {
  const control = parseCoa(byName('18010_0005597_CoA').text, byName('18010_0005597_CoA').pages);
  assert.deepEqual(control.components, [{ component: 'II', lot: '0003A', expiresAt: '2027-12-13' }]);
  assert.deepEqual(parseCoa(byName('18010_0005597_CoA').text, []).components, [{ component: 'II', lot: '0003A', expiresAt: '2027-12-13' }]);
  assert.deepEqual(control.controlData, []);
});

check('CoA old template 21797 lot 58540: REAGENT ABSORBANCE and CONT. MATERIAL rows', () => {
  const old = parseCoa(byName('21797_58540_CoA').text, byName('21797_58540_CoA').pages);
  assert.equal(old.productLot, '58540');
  assert.deepEqual(old.components.map((item) => `${item.component}:${item.lot}`), ['A:58304', 'B:58304']);
  assert.deepEqual(old.controlData[0], { name: 'REAGENT ABSORBANCE', lot: null, unit: null, result: 0.575, specMin: null, specMax: 0.65, verdict: 'PASS' });
  assert.deepEqual(old.controlData[1], { name: 'CONT. MATERIAL 1', lot: '108XA', unit: 'mg/dL', result: 1.59, specMin: 1.21, specMax: 1.81, verdict: 'PASS' });
  assert.deepEqual(old.controlData.map((item) => item.name), ['REAGENT ABSORBANCE', 'CONT. MATERIAL 1', 'CONT. MATERIAL 2', 'CONT. MATERIAL 3', 'CONT. MATERIAL 4']);
  assert.deepEqual(old.controlData[3], { name: 'CONT. MATERIAL 3', lot: '044XA', unit: 'mg/dL', result: 1.69, specMin: 1.3, specMax: 1.94, verdict: 'PASS' });
});

/* ------------------------------------------------------------------ hojas de valores */

const sheet = parseValueSheet(byName('18009_0005482_Value_Sheet').pages);
check('Value sheet: components, methods, value, limits, 1S, unit and traceability by column', () => {
  assert.equal(sheet.level, 'I');
  assert.equal(sheet.lot, '0004');
  assert.ok(sheet.rows.length >= 90);
  assert.ok(sheet.rows.every((row) => row.value !== null && row.low !== null && row.high !== null));
  const glucose = sheet.rows.find((row) => row.component === 'GLUCOSA' && row.method === 'Glucosa oxidasa/peroxidasa' && row.unit === 'mg/dL');
  assert.deepEqual({ value: glucose.value, low: glucose.low, high: glucose.high, sd1: glucose.sd1, traceability: glucose.traceability }, { value: 91, low: 77.4, high: 104.7, sd1: 4.6, traceability: 'SRM 965 (NIST)' });
  const alt = sheet.rows.filter((row) => row.component === 'ALT/GPT');
  assert.equal(alt.length, 4);
  assert.ok(alt.some((row) => row.method === 'IFCC con Fosfato de piridoxal' && row.value === 43.2));
});

const level1 = parseValueSheet(byName('18009_0006487_Value_Sheet').pages);
const level2 = parseValueSheet(byName('18010_0005597_Value_Sheet').pages);
const rowsOf = (parsed, component) => parsed.rows.filter((row) => row.component === component).map((row) => [row.method, row.value, row.low, row.high, row.unit]);
check('Value sheet 18009 by table rules: rows stay with their component and method (CLORURO, COLESTEROL, CREATININA, ÁCIDOS BILIARES)', () => {
  assert.equal(level1.level, 'I');
  assert.deepEqual(rowsOf(level1, 'CLORURO'), [['Electrodo selectivo', 88.5, 79.7, 97.4, 'mmol/L']]);
  assert.deepEqual(rowsOf(level1, 'COLESTEROL'), [
    ['Colesterol oxidasa/peroxidasa', 143, 122, 164, 'mg/dL'],
    ['Colesterol oxidasa/peroxidasa', 3.7, 3.15, 4.26, 'mmol/L'],
  ]);
  assert.deepEqual(
    rowsOf(level1, 'CALCIO').filter(([method]) => method === 'Azul de metiltimol'),
    [
      ['Azul de metiltimol', 9.56, 8.41, 10.71, 'mg/dL'],
      ['Azul de metiltimol', 2.39, 2.1, 2.68, 'mmol/L'],
    ],
  );
  assert.deepEqual(rowsOf(level1, 'COBRE-PAESA'), [
    ['3,5-DiBr-PAESA', 112, 84, 140, 'µg/dL'],
    ['3,5-DiBr-PAESA', 17.6, 13.2, 22, 'µmol/L'],
  ]);
  assert.deepEqual(rowsOf(level1, 'CREATININA').slice(0, 2), [
    ['Enzimático', 1.6, 1.31, 1.89, 'mg/dL'],
    ['Enzimático', 142, 116, 168, 'µmol/L'],
  ]);
  assert.deepEqual(rowsOf(level1, 'SODIO'), [['Electrodo selectivo', 118, 106, 130, 'mmol/L']]);
  assert.deepEqual(rowsOf(level1, 'ÀCIDOS BILIARES TOTALES'), [['Enzimático cíclico', 16.4, 13.4, 19.4, 'µmol/L']]);
  // Método en dos líneas → un solo método.
  assert.deepEqual(rowsOf(level1, 'COLESTEROL HDL'), [
    ['Fosfotungstato/Mg - Colesterol oxidasa/peroxidasa', 64.9, 48.7, 81.1, 'mg/dL'],
    ['Fosfotungstato/Mg - Colesterol oxidasa/peroxidasa', 1.68, 1.26, 2.1, 'mmol/L'],
  ]);
  const ck = level1.rows.find((row) => row.component === 'CK' && row.unit === 'U/L');
  assert.equal(ck.traceability, 'C-RSE/IFCC; ERM-AD455/IFCC (IRMM)');
  assert.ok(level1.rows.every((row) => row.value !== null && row.component && row.method));
});

check('Value sheet without table rules (legacy fixture of the same printed sheet) reconstructs the same rows', () => {
  assert.deepEqual(sheet.rows, level1.rows);
});

check('Value sheet 18010: "*"/"**" placeholder rows skipped (HDL), level II rows assigned by span', () => {
  assert.deepEqual([level2.level, level2.lot], ['II', '0003']);
  assert.deepEqual(rowsOf(level2, 'COLESTEROL HDL'), []);
  assert.deepEqual(rowsOf(level2, 'CLORURO'), [['Electrodo selectivo', 126, 113, 139, 'mmol/L']]);
  assert.deepEqual(rowsOf(level2, 'COLESTEROL'), [
    ['Colesterol oxidasa/peroxidasa', 235, 200, 270, 'mg/dL'],
    ['Colesterol oxidasa/peroxidasa', 6.1, 5.19, 7.02, 'mmol/L'],
  ]);
  assert.deepEqual(rowsOf(level2, 'CREATININA')[0], ['Enzimático', 5.03, 4.12, 5.94, 'mg/dL']);
  assert.deepEqual(rowsOf(level2, 'ÀCIDOS BILIARES TOTALES'), [['Enzimático cíclico', 121, 99, 143, 'µmol/L']]);
  assert.deepEqual(rowsOf(level2, 'SODIO'), [['Electrodo selectivo', 162, 146, 178, 'mmol/L']]);
  assert.ok(level2.rows.every((row) => row.value !== null && row.low !== null && row.high !== null && row.component && row.method));
});

/* ------------------------------------------------------------------ elección de lote */

const coaWith = (...lots) => ({ components: lots.map((lot, index) => ({ component: String.fromCharCode(65 + index), lot, expiresAt: '2028-03-19' })) });
const candidate = (productCode, productLot, expiresAt, coa) => ({ productCode, productLot, expiresAt, coa });
const bottle = { lot: '00005', expiresAt: '2028-03-31' };

check('Lot match: 21TTT contradicted by its CoA, 23TTT twin confirmed → 23TTT', () => {
  const decision = chooseLotMatch(bottle, [candidate('21503', '0001935', '2028-03-19', coaWith('00004')), candidate('23503', '0001936', '2028-03-19', coaWith('00005'))]);
  assert.equal(decision.match.productCode, '23503');
  assert.equal(decision.basis, 'component');
  assert.deepEqual(decision.evaluated.map((item) => item.verdict), ['contradicted', 'confirmed']);
});

check('Lot match: the only same-month lot is never accepted when its CoA lists other component lots', () => {
  const decision = chooseLotMatch(bottle, [candidate('21503', '0001935', '2028-03-19', coaWith('00004', '00004'))]);
  assert.equal(decision.match, null);
  assert.equal(decision.reason, 'contradicted_by_coa');
});

check('Lot match: unconfirmed lot accepted by expiry only if it is the only non-contradicted one and none is confirmed', () => {
  const unknown = candidate('21503', '0001935', '2028-03-19', { components: [] });
  assert.equal(chooseLotMatch(bottle, [unknown]).basis, 'expiry');
  assert.equal(chooseLotMatch(bottle, [candidate('21503', '0001900', '2028-03-02', coaWith('00009')), unknown]).match, unknown);
  const confirmed = candidate('23503', '0001936', '2028-03-19', coaWith('00005'));
  assert.equal(chooseLotMatch(bottle, [unknown, confirmed]).match, confirmed);
  const twinUnknown = candidate('23503', '0001936', '2028-03-19', null);
  const ambiguous = chooseLotMatch(bottle, [unknown, twinUnknown]);
  assert.equal(ambiguous.match, null);
  assert.equal(ambiguous.reason, 'ambiguous_same_month_lots');
});

check('Lot match: other months ignored, ties keep 21TTT first, lots compared trimmed and case-insensitive', () => {
  const other = chooseLotMatch(bottle, [candidate('21503', '0002000', '2028-04-30', coaWith('00005'))]);
  assert.equal(other.match, null);
  assert.equal(other.reason, 'no_same_month_lot');
  const first = candidate('21503', '0001935', '2028-03-19', coaWith(' 00005 '));
  const tie = chooseLotMatch(bottle, [first, candidate('23503', '0001936', '2028-03-19', coaWith('00005'))]);
  assert.equal(tie.match, first);
  assert.equal(tie.reason, 'several_component_confirmed');
  assert.equal(componentVerdict('0003a', coaWith('0003A')), 'confirmed');
});

/* ------------------------------------------------------------------ copia del frontend */

check('Frontend copy: no bottles, documents or reference values; calibration capped; products and controls reduced', () => {
  const slim = slimForFrontend({
    schemaVersion: 'einfo-lot-facts-v1',
    generatedAt: '2026-10-10T21:52:22.222Z',
    reparsedAt: '2026-10-11T00:00:00.000Z',
    products: { 21503: { code: '21503', title: 'GLUCOSE', activeLot: '0006710', lots: [{ lot: '0001935', expiresAt: '2028-03-19' }], fetchedAt: 'x' } },
    lots: {
      '21503:0001935': {
        key: '21503:0001935',
        productCode: '21503',
        bottles: [{ barcode: '1' }],
        documents: [{ tab: 'IFU', file: 'x.pdf' }],
        matchCandidates: [],
        ifu: { referenceValues: 'texto', calibration: 'c'.repeat(500), detectionLimit: { value: 1, unit: 'mg/dL' } },
        coa: { components: [] },
      },
      'unmatched:503:54838:2026-09': { key: null, techniqueCode: '503', evaluated: [], reason: 'no_same_month_lot' },
    },
    controls: { '18009:0006487': { key: '18009:0006487', productCode: '18009', productLot: '0006487', title: 'CONTROL I', expiresAt: '2027-11-16', sourceUrl: 'u', fetchedAt: 'f', documents: [], coa: {}, valueSheet: { level: 'I', lot: '0004', rows: [{ value: 1 }] } } },
  });
  assert.deepEqual(slim.products, { 21503: { code: '21503', title: 'GLUCOSE', activeLot: '0006710' } });
  const lot = slim.lots['21503:0001935'];
  assert.deepEqual(Object.keys(lot).sort(), ['coa', 'ifu', 'key', 'productCode']);
  assert.equal(lot.ifu.referenceValues, undefined);
  assert.equal(lot.ifu.calibration.length, 300);
  assert.deepEqual(slim.lots['unmatched:503:54838:2026-09'], { key: null, techniqueCode: '503', reason: 'no_same_month_lot' });
  assert.deepEqual(slim.controls['18009:0006487'], {
    key: '18009:0006487',
    productCode: '18009',
    productLot: '0006487',
    title: 'CONTROL I',
    expiresAt: '2027-11-16',
    sourceUrl: 'u',
    fetchedAt: 'f',
    valueSheet: { level: 'I', lot: '0004', rows: [{ value: 1 }] },
  });
  assert.equal(slim.generatedAt, '2026-10-10T21:52:22.222Z');
  assert.equal(slim.reparsedAt, '2026-10-11T00:00:00.000Z');
});

console.log(JSON.stringify({ checks: checks.length, passed: checks }, null, 2));
