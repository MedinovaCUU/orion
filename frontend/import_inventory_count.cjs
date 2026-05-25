const fs = require('node:fs');
const path = require('node:path');
const xlsx = require('xlsx');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });
const { createClient } = require('@supabase/supabase-js');

const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
const LOCAL_SUPABASE_SECRET = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz';
const DEFAULT_FILE = path.join(__dirname, '..', 'inventario 3 de mayo del 2026.xlsx');
const DEFAULT_COUNTED_BY = 'No indicado en archivo';
const DEFAULT_CAPTURED_BY = 'Carga automatizada desde Excel';

const monthMap = {
  enero: '01',
  febrero: '02',
  marzo: '03',
  abril: '04',
  mayo: '05',
  junio: '06',
  julio: '07',
  agosto: '08',
  septiembre: '09',
  setiembre: '09',
  octubre: '10',
  noviembre: '11',
  diciembre: '12',
};

const normalizeCodeKey = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .trim()
    .toUpperCase();

const sanitizeCodeDisplay = (value) =>
  String(value || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

const chunk = (items, size) => {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
};

const parseDateFromFileName = (fileName) => {
  const normalized = path
    .basename(fileName, path.extname(fileName))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const match = normalized.match(/(\d{1,2})\s+de\s+([a-z]+)\s+del\s+(\d{4})/i);
  if (!match) {
    return null;
  }

  const [, dayValue, monthValue, yearValue] = match;
  const month = monthMap[monthValue];
  if (!month) {
    return null;
  }

  return `${yearValue}-${month}-${dayValue.padStart(2, '0')}`;
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    filePath: DEFAULT_FILE,
    countedAt: null,
    countedByName: DEFAULT_COUNTED_BY,
    capturedByName: DEFAULT_CAPTURED_BY,
    replaceExisting: true,
  };

  for (const arg of args) {
    if (arg === '--no-replace') {
      options.replaceExisting = false;
      continue;
    }

    if (arg.startsWith('--date=')) {
      options.countedAt = arg.slice('--date='.length);
      continue;
    }

    if (arg.startsWith('--counted-by=')) {
      options.countedByName = arg.slice('--counted-by='.length).trim() || DEFAULT_COUNTED_BY;
      continue;
    }

    if (arg.startsWith('--captured-by=')) {
      options.capturedByName = arg.slice('--captured-by='.length).trim() || DEFAULT_CAPTURED_BY;
      continue;
    }

    options.filePath = path.resolve(process.cwd(), arg);
  }

  if (!options.countedAt) {
    options.countedAt = parseDateFromFileName(options.filePath);
  }

  if (!options.countedAt) {
    throw new Error('No fue posible inferir la fecha del conteo. Usa --date=YYYY-MM-DD.');
  }

  return options;
};

const readWorkbookRows = (filePath) => {
  const workbook = xlsx.readFile(filePath);
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  if (!worksheet) {
    throw new Error(`El archivo ${filePath} no contiene hojas legibles.`);
  }

  return xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: null });
};

async function main() {
  const options = parseArgs();

  if (!fs.existsSync(options.filePath)) {
    throw new Error(`No existe el archivo a importar: ${options.filePath}`);
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || LOCAL_SUPABASE_URL;
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || LOCAL_SUPABASE_SECRET;
  const supabase = createClient(supabaseUrl, supabaseSecret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const rows = readWorkbookRows(options.filePath);
  const sourceSignature = `inventory_file:${path.basename(options.filePath)}`;
  const uniqueWorkbookCodes = new Map();
  const importableRows = [];
  const skippedRows = [];
  const folioSet = new Set();

  rows.slice(1).forEach((rawRow, index) => {
    const rowNumber = index + 2;
    const folio = Number(rawRow?.[0]);
    const code = sanitizeCodeDisplay(rawRow?.[1]);
    const lote = String(rawRow?.[2] ?? '').trim() || 'N/A';
    const quantity = Number(rawRow?.[3]);
    const codeKey = normalizeCodeKey(code);

    if (codeKey) {
      uniqueWorkbookCodes.set(codeKey, code);
    }

    if (!code && !String(rawRow?.[2] ?? '').trim() && rawRow?.[3] == null) {
      skippedRows.push({ rowNumber, folio: Number.isFinite(folio) ? folio : null, reason: 'fila_vacia' });
      return;
    }

    if (!code) {
      skippedRows.push({ rowNumber, folio: Number.isFinite(folio) ? folio : null, reason: 'codigo_vacio' });
      return;
    }

    if (!Number.isFinite(folio) || folio < 1) {
      skippedRows.push({ rowNumber, code, reason: 'folio_invalido' });
      return;
    }

    if (folioSet.has(folio)) {
      skippedRows.push({ rowNumber, code, folio, reason: 'folio_duplicado' });
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      skippedRows.push({ rowNumber, code, folio, reason: 'cantidad_invalida' });
      return;
    }

    folioSet.add(folio);
    importableRows.push({
      rowNumber,
      folio,
      code,
      codeKey,
      lote,
      quantity,
    });
  });

  if (importableRows.length === 0) {
    throw new Error('No se encontraron renglones importables en el archivo.');
  }

  const { data: existingCatalogRows, error: catalogReadError } = await supabase
    .from('refacciones_catalogo')
    .select('codigo_refaccion');

  if (catalogReadError) {
    throw new Error(`No fue posible leer refacciones_catalogo: ${catalogReadError.message}`);
  }

  const existingCatalogKeys = new Set(
    (existingCatalogRows || []).map((row) => normalizeCodeKey(row.codigo_refaccion)),
  );

  const missingCatalogRows = Array.from(uniqueWorkbookCodes.entries())
    .filter(([codeKey]) => !existingCatalogKeys.has(codeKey))
    .map(([, code]) => ({
      codigo_refaccion: code,
      descripcion: `Alta creada desde importación de inventario (${options.countedAt}).`,
      equipo: null,
      nombre: null,
      desc_breve: null,
    }));

  if (missingCatalogRows.length > 0) {
    const { error: catalogUpsertError } = await supabase
      .from('refacciones_catalogo')
      .upsert(missingCatalogRows, { onConflict: 'codigo_refaccion' });

    if (catalogUpsertError) {
      throw new Error(`No fue posible agregar códigos nuevos al catálogo: ${catalogUpsertError.message}`);
    }
  }

  const { data: existingCounts, error: existingCountsError } = await supabase
    .from('inventory_counts')
    .select('id, count_reference, notes')
    .eq('counted_at', options.countedAt);

  if (existingCountsError) {
    throw new Error(`No fue posible revisar conteos previos: ${existingCountsError.message}`);
  }

  const matchingExistingCounts = (existingCounts || []).filter((count) =>
    String(count.notes || '').includes(sourceSignature),
  );

  if (matchingExistingCounts.length > 0) {
    if (!options.replaceExisting) {
      throw new Error(
        `Ya existe una importación previa para ${sourceSignature}: ${matchingExistingCounts
          .map((count) => count.count_reference || count.id)
          .join(', ')}`,
      );
    }

    for (const count of matchingExistingCounts) {
      const { error: deleteCountError } = await supabase.from('inventory_counts').delete().eq('id', count.id);
      if (deleteCountError) {
        throw new Error(`No fue posible reemplazar el conteo previo ${count.count_reference || count.id}: ${deleteCountError.message}`);
      }
    }
  }

  const missingCodeKeys = new Set(missingCatalogRows.map((row) => normalizeCodeKey(row.codigo_refaccion)));
  const totalQuantity = importableRows.reduce((sum, row) => sum + row.quantity, 0);
  const notesLines = [
    `Importado desde archivo: ${path.basename(options.filePath)}`,
    `source_signature=${sourceSignature}`,
    `lineas_excel=${rows.length - 1}`,
    `lineas_importadas=${importableRows.length}`,
    `unidades_importadas=${totalQuantity}`,
    `codigos_unicos=${uniqueWorkbookCodes.size}`,
    `codigos_nuevos_catalogo=${missingCatalogRows.length}`,
  ];

  if (skippedRows.length > 0) {
    notesLines.push(
      `filas_omitidas=${skippedRows
        .map((row) => [row.rowNumber, row.reason, row.code || row.folio || ''].filter(Boolean).join(':'))
        .join(', ')}`,
    );
  }

  let createdCountId = null;

  try {
    const { data: createdCount, error: countInsertError } = await supabase
      .from('inventory_counts')
      .insert({
        warehouse_code: 'GDL',
        warehouse_name: 'Guadalajara',
        capture_year: Number(options.countedAt.slice(0, 4)),
        status: 'registrado',
        counted_at: options.countedAt,
        counted_by_id: null,
        counted_by_name: options.countedByName,
        captured_by_id: null,
        captured_by_name: options.capturedByName,
        notes: notesLines.join('\n'),
        line_count: importableRows.length,
        total_quantity: totalQuantity,
      })
      .select('id, count_reference, count_number')
      .single();

    if (countInsertError || !createdCount) {
      throw new Error(countInsertError?.message || 'No fue posible crear el encabezado del conteo.');
    }

    createdCountId = createdCount.id;

    const linePayload = importableRows
      .sort((left, right) => left.folio - right.folio)
      .map((row) => ({
        inventory_count_id: createdCount.id,
        folio: row.folio,
        article_code: row.code,
        catalog_code: row.code,
        lote: row.lote,
        quantity: row.quantity,
        known_code: true,
        add_to_catalog: missingCodeKeys.has(row.codeKey),
        counted_by_id: null,
        counted_by_name: options.countedByName,
        notes: null,
      }));

    for (const batch of chunk(linePayload, 200)) {
      const { error: linesInsertError } = await supabase.from('inventory_count_lines').insert(batch);
      if (linesInsertError) {
        throw new Error(linesInsertError.message);
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          file: path.basename(options.filePath),
          countedAt: options.countedAt,
          countReference: createdCount.count_reference,
          countNumber: createdCount.count_number,
          importedLines: importableRows.length,
          totalQuantity,
          uniqueCodes: uniqueWorkbookCodes.size,
          missingCatalogCodesAdded: missingCatalogRows.length,
          skippedRows,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (createdCountId) {
      await supabase.from('inventory_counts').delete().eq('id', createdCountId);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
