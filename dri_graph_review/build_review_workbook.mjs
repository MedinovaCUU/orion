import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FRONTEND_ROOT = path.join(ROOT, 'frontend');
const OUTPUT_DIR = path.join(__dirname, 'outputs');
const OUTPUT_XLSX = path.join(OUTPUT_DIR, 'DRI_grafo_revision_orion.xlsx');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'DRI_grafo_revision_orion.json');

const frontendRequire = createRequire(path.join(FRONTEND_ROOT, 'package.json'));
const runtimeRequire = createRequire(
  '/Users/ricardomontanezmiranda/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json',
);

const ts = frontendRequire('typescript');
const { Workbook, SpreadsheetFile } = runtimeRequire('@oai/artifact-tool');

const accentRed = '#B0122B';
const silverFill = '#F2F4F7';
const silverBorder = '#D9DEE5';
const tealFill = '#E8F7F5';
const amberFill = '#FFF5E8';
const softRose = '#FFF1F3';
const darkText = '#243041';
const mutedText = '#667085';

function colLetter(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const mod = (n - 1) % 26;
    s = String.fromCharCode(65 + mod) + s;
    n = Math.floor((n - mod) / 26);
  }
  return s;
}

async function loadTsModule(filePath, extraExportNames = []) {
  const source = await fs.readFile(filePath, 'utf8');
  const extraExportBlock = extraExportNames.length
    ? `\nmodule.exports.__extra = {\n${extraExportNames
        .map((name) => `  ${JSON.stringify(name)}: typeof ${name} !== 'undefined' ? ${name} : undefined`)
        .join(',\n')}\n};\n`
    : '';
  const transpiled = ts.transpileModule(`${source}\n${extraExportBlock}`, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filePath,
    reportDiagnostics: false,
  }).outputText;

  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    require: (specifier) => {
      throw new Error(`Unexpected runtime require("${specifier}") while loading ${filePath}`);
    },
    __dirname: path.dirname(filePath),
    __filename: filePath,
    console,
  });
  new vm.Script(transpiled, { filename: filePath }).runInContext(context);
  return module.exports;
}

function setColumnWidths(sheet, widths) {
  widths.forEach((width, index) => {
    sheet.getRange(`${colLetter(index)}:${colLetter(index)}`).format.columnWidthPx = width;
  });
}

function formatCell(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(' | ');
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function withSheetTable(sheet, title, columns, rows, options = {}) {
  const endColumn = colLetter(Math.max(columns.length - 1, 0));
  const titleRange = `A1:${endColumn}1`;
  sheet.getRange(titleRange).merge();
  sheet.getRange('A1').values = [[title]];
  sheet.getRange(titleRange).format = {
    fill: silverFill,
    font: { bold: true, size: 16, color: accentRed },
    verticalAlignment: 'center',
  };
  sheet.getRange(titleRange).format.rowHeightPx = 30;

  if (options.subtitle) {
    const subtitleRange = `A2:${endColumn}2`;
    sheet.getRange(subtitleRange).merge();
    sheet.getRange('A2').values = [[options.subtitle]];
    sheet.getRange(subtitleRange).format = {
      font: { size: 10, color: mutedText },
      verticalAlignment: 'center',
      wrapText: true,
    };
    sheet.getRange(subtitleRange).format.rowHeightPx = 42;
  }

  const headerRow = options.subtitle ? 4 : 3;
  const dataStartRow = headerRow + 1;
  sheet.getRange(`A${headerRow}:${endColumn}${headerRow}`).values = [columns];
  sheet.getRange(`A${headerRow}:${endColumn}${headerRow}`).format = {
    fill: accentRed,
    font: { bold: true, color: '#FFFFFF', size: 10 },
    verticalAlignment: 'center',
    wrapText: true,
  };

  if (rows.length) {
    const matrix = rows.map((row) => columns.map((column) => formatCell(row[column])));
    sheet.getRange(`A${dataStartRow}:${endColumn}${dataStartRow + rows.length - 1}`).values = matrix;
    sheet.getRange(`A${dataStartRow}:${endColumn}${dataStartRow + rows.length - 1}`).format = {
      font: { size: 10, color: darkText },
      verticalAlignment: 'center',
      wrapText: true,
    };
  }

  sheet.freezePanes.freezeRows(headerRow);
  sheet.getUsedRange().format.borders = { preset: 'outside', style: 'thin', color: silverBorder };
  sheet.getRange(`A${headerRow}:${endColumn}${Math.max(headerRow, dataStartRow + rows.length - 1)}`).format.borders = {
    preset: 'inside',
    style: 'thin',
    color: silverBorder,
  };
}

const seedPath = path.join(FRONTEND_ROOT, 'src/modules/dri/driWorkbookSeed.generated.ts');
const contextPath = path.join(FRONTEND_ROOT, 'src/modules/dri/knowledge/driReagentContext.generated.ts');
const hierarchyPath = path.join(FRONTEND_ROOT, 'src/modules/dri/knowledge/ba400SubsystemHierarchy.ts');

const seedModule = await loadTsModule(seedPath);
const contextModule = await loadTsModule(contextPath);
const hierarchyModule = await loadTsModule(hierarchyPath, ['BA400_HIERARCHY']);

const seed = seedModule.DRI_WORKBOOK_SEED;
const reagentContext = contextModule.DRI_REAGENT_CONTEXT;
const hierarchy = hierarchyModule.__extra?.BA400_HIERARCHY || [];

if (!seed || !reagentContext || !Array.isArray(hierarchy)) {
  throw new Error('No se pudo cargar la informacion base del DRI para generar el workbook de revision.');
}

const factorById = new Map((seed.factors || []).map((factor) => [factor.id, factor]));
const reagentById = new Map((seed.reagents || []).map((reagent) => [reagent.id, reagent]));

const rootLabels = {
  chemistry: 'Programa analítico',
  optics: 'Sistema óptico',
  reaction: 'Rotor de reacción',
  sample: 'Rotor de muestras',
  reagent: 'Rotor de reactivos',
  fluidics: 'Sistema fluídico',
  pipetting: 'Brazos de pipeteo',
  wash: 'Estación de lavado',
};

const tierLabels = {
  1: 'Estrato 1 · sistema raíz',
  2: 'Estrato 2 · subsistema',
  3: 'Estrato 3 · componente',
  4: 'Estrato 4 · detalle terminal',
};

const categoryLabels = {
  reaction: 'Perfil de reacción',
  technique: 'Técnica / modo',
  trend: 'Tendencia creciente/decreciente/fija',
  scheme: 'Arquitectura mono/bi',
  r2: 'Dependencia de R2',
  control: 'QC / control / target',
  dilution: 'Dilución / linealidad / corrección',
  volume: 'Volúmenes / pipeteo',
  temperature: 'Temperatura de reacción',
  storage: 'Conservación / refrigeración',
  water: 'Calidad de agua / lavado',
  contamination: 'Carryover / contaminación',
  blank: 'Blanco / absorbancia base',
  service: 'Utilidad o prueba de servicio',
  wavelength: 'Longitud de onda / filtro',
};

function buildHierarchyPath(definition, byId) {
  const trail = [];
  let cursor = definition;
  while (cursor) {
    trail.unshift(cursor.label);
    cursor = cursor.parentId ? byId.get(cursor.parentId) || null : null;
  }
  return trail.join(' > ');
}

const hierarchyById = new Map(hierarchy.map((definition) => [definition.id, definition]));

const reagentRows = (seed.reagents || [])
  .map((reagent) => {
    const ctx = reagentContext[reagent.id] || {};
    const baCodes = Array.isArray(ctx.productCodesByPlatform?.BA400) ? ctx.productCodesByPlatform.BA400 : [];
    const productEntries = Array.isArray(ctx.productEntries)
      ? ctx.productEntries.map((entry) => `${entry.productCode} · ${entry.format || ''}`.trim())
      : [];
    return {
      review_action: 'KEEP',
      reagentId: reagent.id,
      displayCode_actual: ctx.displayCode || reagent.id,
      displayName_actual: ctx.displayName || reagent.name,
      seedName_actual: reagent.name,
      primary_nm: reagent.primaryWavelengthNm,
      reference_nm: reagent.referenceWavelengthNm,
      reportedMethod: reagent.reportedMethod,
      reagentType: reagent.reagentType,
      productCodes_BA400: baCodes.join(' | '),
      products_detected: productEntries.join(' | '),
      has_ifu: ctx.documentation?.hasIfu === true ? 'yes' : 'no',
      has_valuesheet: ctx.documentation?.hasValuesheet === true ? 'yes' : 'no',
      review_note: '',
      proposed_displayCode: '',
      proposed_displayName: '',
      proposed_seedName: '',
    };
  })
  .sort((left, right) => String(left.displayCode_actual).localeCompare(String(right.displayCode_actual), 'es'));

const factorRows = (seed.factors || [])
  .map((factor) => ({
    review_action: 'KEEP',
    factorId: factor.id,
    factorType: factor.factorType,
    label_actual: factor.label,
    valueText: factor.valueText,
    valueNumeric: factor.valueNumeric,
    unit: factor.unit,
    description: factor.description,
    priority: factor.priority,
    sourceStatus: factor.sourceStatus,
    review_note: '',
    proposed_label: '',
    proposed_description: '',
  }))
  .sort((left, right) => String(left.factorType).localeCompare(String(right.factorType), 'es') || String(left.label_actual).localeCompare(String(right.label_actual), 'es'));

const relationRows = (seed.factorLinks || [])
  .map((link, index) => {
    const reagent = reagentById.get(link.reagentId) || {};
    const ctx = reagentContext[link.reagentId] || {};
    const factor = factorById.get(link.factorId) || {};
    return {
      row_ref: index + 1,
      review_action: 'KEEP',
      enabled: 'YES',
      reagentId: link.reagentId,
      reagentCode: ctx.displayCode || link.reagentId,
      reagentName: ctx.displayName || reagent.name || link.reagentId,
      factorId: link.factorId,
      factorLabel: factor.label || link.factorId,
      factorType: factor.factorType || '',
      relationType: link.relationType,
      weight: link.weight,
      confidence: link.confidence,
      note_actual: link.note,
      sourceReference: link.sourceReference,
      review_note: '',
      proposed_factorId: '',
      proposed_relationType: '',
      proposed_weight: '',
    };
  })
  .sort((left, right) => String(left.reagentCode).localeCompare(String(right.reagentCode), 'es') || String(left.factorLabel).localeCompare(String(right.factorLabel), 'es'));

const hierarchyNodeRows = hierarchy
  .map((definition) => ({
    review_action: 'KEEP',
    nodeId: definition.id,
    depth: definition.depth,
    tier_label: tierLabels[definition.depth] || `Estrato ${definition.depth}`,
    rootId: definition.rootId,
    root_label: rootLabels[definition.rootId] || definition.rootId,
    parentId_actual: definition.parentId || '',
    label_actual: definition.label,
    subtitle_actual: definition.subtitle,
    path_actual: buildHierarchyPath(definition, hierarchyById),
    alwaysVisible: definition.alwaysVisible ? 'yes' : 'no',
    mechanicalSubsystems: Array.isArray(definition.mechanicalSubsystems) ? definition.mechanicalSubsystems.join(' | ') : '',
    signalCategories: Array.isArray(definition.signalCategories) ? definition.signalCategories.join(' | ') : '',
    review_note: '',
    proposed_parentId: '',
    proposed_label: '',
    proposed_subtitle: '',
    proposed_depth: '',
  }))
  .sort((left, right) => Number(left.depth) - Number(right.depth) || String(left.rootId).localeCompare(String(right.rootId), 'es') || String(left.label_actual).localeCompare(String(right.label_actual), 'es'));

const hierarchyEdgeRows = hierarchy
  .filter((definition) => definition.parentId)
  .map((definition, index) => {
    const parent = hierarchyById.get(definition.parentId);
    return {
      row_ref: index + 1,
      review_action: 'KEEP',
      sourceNodeId: definition.parentId,
      sourceLabel: parent?.label || definition.parentId,
      targetNodeId: definition.id,
      targetLabel: definition.label,
      rootId: definition.rootId,
      depth_target: definition.depth,
      path_target: buildHierarchyPath(definition, hierarchyById),
      source_mechanicalSubsystems: Array.isArray(parent?.mechanicalSubsystems) ? parent.mechanicalSubsystems.join(' | ') : '',
      target_mechanicalSubsystems: Array.isArray(definition.mechanicalSubsystems) ? definition.mechanicalSubsystems.join(' | ') : '',
      review_note: '',
      proposed_sourceNodeId: '',
      proposed_targetNodeId: '',
    };
  });

const factorSummaryRows = [...factorById.values()]
  .map((factor) => {
    const relatedLinks = (seed.factorLinks || []).filter((link) => link.factorId === factor.id);
    const reagentCodes = relatedLinks
      .map((link) => reagentContext[link.reagentId]?.displayCode || link.reagentId)
      .sort((left, right) => String(left).localeCompare(String(right), 'es'));
    return {
      factorId: factor.id,
      factorType: factor.factorType,
      factorLabel: factor.label,
      linkedReagents: relatedLinks.length,
      reagentCodes: reagentCodes.join(' | '),
      averageWeight:
        relatedLinks.length > 0
          ? Math.round((relatedLinks.reduce((sum, link) => sum + Number(link.weight || 0), 0) / relatedLinks.length) * 100) / 100
          : '',
    };
  })
  .sort((left, right) => Number(right.linkedReagents) - Number(left.linkedReagents) || String(left.factorLabel).localeCompare(String(right.factorLabel), 'es'));

const categoryRows = Object.entries(categoryLabels).map(([categoryId, label]) => ({
  categoryId,
  meaning: label,
}));

const rootRows = Object.entries(rootLabels).map(([rootId, label]) => ({
  rootId,
  label,
}));

const generatedAtIso = new Date().toISOString();
const generatedAtDisplay = new Date().toLocaleString('es-MX', {
  timeZone: 'America/Chihuahua',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const summary = {
  generatedAt: generatedAtIso,
  generatedAtDisplay,
  counts: {
    reagents: reagentRows.length,
    factors: factorRows.length,
    reagentFactorRelations: relationRows.length,
    hierarchyNodes: hierarchyNodeRows.length,
    hierarchyEdges: hierarchyEdgeRows.length,
  },
  files: {
    seedPath,
    contextPath,
    hierarchyPath,
  },
};

const workbook = Workbook.create();

{
  const sheet = workbook.worksheets.add('00_LEEME');
  sheet.getRange('A1:F1').merge();
  sheet.getRange('A1').values = [['DRI · Workbook de revisión del grafo']];
  sheet.getRange('A1:F1').format = {
    fill: silverFill,
    font: { bold: true, size: 18, color: accentRed },
    verticalAlignment: 'center',
  };
  sheet.getRange('A1:F1').format.rowHeightPx = 34;

  sheet.getRange('A3:B8').values = [
    ['Campo', 'Valor'],
    ['Generado', summary.generatedAtDisplay],
    ['Reactivos', summary.counts.reagents],
    ['Factores', summary.counts.factors],
    ['Relaciones reactivo-factor', summary.counts.reagentFactorRelations],
    ['Nodos jerarquía BA400', summary.counts.hierarchyNodes],
  ];
  sheet.getRange('A3:B8').format.borders = { preset: 'inside', style: 'thin', color: silverBorder };
  sheet.getRange('A3:B3').format = { fill: accentRed, font: { bold: true, color: '#FFFFFF' } };

  sheet.getRange('D3:F9').values = [
    ['Cómo revisarlo', '', ''],
    ['1', 'Usa review_action = KEEP / EDIT / REMOVE / ADD', ''],
    ['2', 'Llena solo columnas proposed_* cuando quieras cambiar algo', ''],
    ['3', 'Usa review_note para explicar el motivo del cambio', ''],
    ['4', 'Si agregas algo nuevo, deja el ID propuesto en proposed_*', ''],
    ['5', 'Devuélveme este mismo .xlsx y lo convierto a cambios reales del grafo', ''],
    ['6', 'La jerarquía BA400 está separada de las ligas reactivo-factor para que no se mezclen responsabilidades', ''],
  ];
  sheet.getRange('D3:F9').format.wrapText = true;
  sheet.getRange('D3:F9').format.borders = { preset: 'inside', style: 'thin', color: silverBorder };
  sheet.getRange('D3:F3').format = { fill: accentRed, font: { bold: true, color: '#FFFFFF' } };

  sheet.getRange('A11:C16').values = [
    ['review_action', 'Uso', 'Color mental'],
    ['KEEP', 'Se conserva como está', 'neutro'],
    ['EDIT', 'Se modifica nodo, etiqueta o conexión', 'ámbar'],
    ['REMOVE', 'Se elimina del grafo', 'rojo'],
    ['ADD', 'Se agrega un nodo o relación nueva', 'teal'],
    ['', '', ''],
  ];
  sheet.getRange('A11:C16').format.borders = { preset: 'inside', style: 'thin', color: silverBorder };
  sheet.getRange('A11:C11').format = { fill: accentRed, font: { bold: true, color: '#FFFFFF' } };
  sheet.getRange('A12:C16').format = { font: { color: darkText } };

  setColumnWidths(sheet, [160, 220, 160, 120, 230, 200]);
}

{
  const sheet = workbook.worksheets.add('01_REACTIVOS');
  withSheetTable(
    sheet,
    'Reactivos visibles en DRI',
    [
      'review_action',
      'reagentId',
      'displayCode_actual',
      'displayName_actual',
      'seedName_actual',
      'primary_nm',
      'reference_nm',
      'reportedMethod',
      'reagentType',
      'productCodes_BA400',
      'products_detected',
      'has_ifu',
      'has_valuesheet',
      'review_note',
      'proposed_displayCode',
      'proposed_displayName',
      'proposed_seedName',
    ],
    reagentRows,
    { subtitle: 'Corrige aquí abreviaturas, nombre visible y equivalencias base. Este sheet sirve para limpiar pills y etiquetas del grafo.' },
  );
  setColumnWidths(sheet, [90, 90, 110, 220, 180, 75, 85, 220, 120, 120, 220, 80, 100, 180, 130, 220, 180]);
  sheet.getRange('A5:Q400').format.fill = '#FFFFFF';
}

{
  const sheet = workbook.worksheets.add('02_FACTORES');
  withSheetTable(
    sheet,
    'Factores discriminantes del DRI',
    [
      'review_action',
      'factorId',
      'factorType',
      'label_actual',
      'valueText',
      'valueNumeric',
      'unit',
      'description',
      'priority',
      'sourceStatus',
      'review_note',
      'proposed_label',
      'proposed_description',
    ],
    factorRows,
    { subtitle: 'Aquí puedes corregir el texto de cada factor del grafo. No modifica todavía la posición, solo la identidad y legibilidad.' },
  );
  setColumnWidths(sheet, [90, 150, 130, 220, 120, 90, 80, 240, 100, 110, 180, 220, 240]);
  sheet.getRange('A5:M600').format.fill = tealFill;
}

{
  const sheet = workbook.worksheets.add('03_REL_REACT_FACTOR');
  withSheetTable(
    sheet,
    'Relaciones reactivo → factor',
    [
      'row_ref',
      'review_action',
      'enabled',
      'reagentId',
      'reagentCode',
      'reagentName',
      'factorId',
      'factorLabel',
      'factorType',
      'relationType',
      'weight',
      'confidence',
      'note_actual',
      'sourceReference',
      'review_note',
      'proposed_factorId',
      'proposed_relationType',
      'proposed_weight',
    ],
    relationRows,
    { subtitle: 'Esta es la hoja más importante para editar nodos/conexiones de diagnóstico. Una fila = un nexo directo entre un reactivo y un factor.' },
  );
  setColumnWidths(sheet, [70, 90, 70, 90, 110, 220, 150, 220, 140, 150, 70, 90, 240, 280, 180, 150, 170, 90]);
  sheet.getRange('A5:R3000').format.fill = '#FFFFFF';
}

{
  const sheet = workbook.worksheets.add('04_BA400_NODOS');
  withSheetTable(
    sheet,
    'Jerarquía BA400 · nodos',
    [
      'review_action',
      'nodeId',
      'depth',
      'tier_label',
      'rootId',
      'root_label',
      'parentId_actual',
      'label_actual',
      'subtitle_actual',
      'path_actual',
      'alwaysVisible',
      'mechanicalSubsystems',
      'signalCategories',
      'review_note',
      'proposed_parentId',
      'proposed_label',
      'proposed_subtitle',
      'proposed_depth',
    ],
    hierarchyNodeRows,
    { subtitle: 'Aquí está la composición esférica base del BA400. Si quieres mover un nodo de estrato o cambiarle parent, esta es la hoja correcta.' },
  );
  setColumnWidths(sheet, [90, 180, 60, 160, 90, 150, 180, 180, 220, 320, 90, 220, 220, 180, 180, 180, 220, 90]);
  sheet.getRange('A5:R600').format.fill = amberFill;
}

{
  const sheet = workbook.worksheets.add('05_BA400_EDGES');
  withSheetTable(
    sheet,
    'Jerarquía BA400 · conexiones parent-child',
    [
      'row_ref',
      'review_action',
      'sourceNodeId',
      'sourceLabel',
      'targetNodeId',
      'targetLabel',
      'rootId',
      'depth_target',
      'path_target',
      'source_mechanicalSubsystems',
      'target_mechanicalSubsystems',
      'review_note',
      'proposed_sourceNodeId',
      'proposed_targetNodeId',
    ],
    hierarchyEdgeRows,
    { subtitle: 'Una fila = una conexión estructural del equipo. Si algo debe colgar de otro parent, corrígelo aquí.' },
  );
  setColumnWidths(sheet, [70, 90, 180, 170, 180, 170, 90, 80, 320, 220, 220, 180, 180, 180]);
  sheet.getRange('A5:N600').format.fill = softRose;
}

{
  const sheet = workbook.worksheets.add('06_FACTOR_SUMMARY');
  withSheetTable(
    sheet,
    'Resumen por factor',
    ['factorId', 'factorType', 'factorLabel', 'linkedReagents', 'averageWeight', 'reagentCodes'],
    factorSummaryRows,
    { subtitle: 'Sirve para detectar factores demasiado cargados, duplicados o mal normalizados antes de tocar la jerarquía.' },
  );
  setColumnWidths(sheet, [150, 140, 220, 90, 100, 360]);
}

{
  const sheet = workbook.worksheets.add('07_LEYENDAS');
  sheet.getRange('A1:C1').merge();
  sheet.getRange('A1').values = [['Leyendas del grafo']];
  sheet.getRange('A1:C1').format = {
    fill: silverFill,
    font: { bold: true, size: 16, color: accentRed },
    verticalAlignment: 'center',
  };

  sheet.getRange('A3:B11').values = [
    ['rootId', 'label'],
    ...rootRows.map((row) => [row.rootId, row.label]),
  ];
  sheet.getRange('A3:B11').format.borders = { preset: 'inside', style: 'thin', color: silverBorder };
  sheet.getRange('A3:B3').format = { fill: accentRed, font: { bold: true, color: '#FFFFFF' } };
  sheet.getRange('A12:B12').format = { fill: '#FFFFFF' };

  const categoryEndRow = 3 + categoryRows.length;
  sheet.getRange(`D3:E${categoryEndRow}`).values = [
    ['signalCategory', 'meaning'],
    ...categoryRows.map((row) => [row.categoryId, row.meaning]),
  ];
  sheet.getRange(`D3:E${categoryEndRow}`).format.borders = { preset: 'inside', style: 'thin', color: silverBorder };
  sheet.getRange('D3:E3').format = { fill: accentRed, font: { bold: true, color: '#FFFFFF' } };

  setColumnWidths(sheet, [120, 220, 40, 140, 260]);
}

{
  const sheet = workbook.worksheets.add('08_EDITA_AQUI');
  withSheetTable(
    sheet,
    'Plantilla rápida para devolver cambios',
    ['sheet', 'record_id', 'review_action', 'campo', 'valor_actual', 'valor_propuesto', 'motivo'],
    [],
    { subtitle: 'Si prefieres no tocar las hojas grandes, usa esta hoja como lista breve de cambios y yo lo traduzco al grafo.' },
  );
  setColumnWidths(sheet, [110, 180, 100, 140, 220, 220, 260]);
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.writeFile(OUTPUT_JSON, JSON.stringify({
  summary,
  reagentRows,
  factorRows,
  relationRows,
  hierarchyNodeRows,
  hierarchyEdgeRows,
  factorSummaryRows,
}, null, 2));

const file = await SpreadsheetFile.exportXlsx(workbook);
await file.save(OUTPUT_XLSX);

console.log(JSON.stringify({ outputXlsx: OUTPUT_XLSX, outputJson: OUTPUT_JSON, counts: summary.counts }, null, 2));
