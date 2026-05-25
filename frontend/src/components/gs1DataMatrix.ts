import { getPublicAssetUrl } from './publicAssetUrl';

export type ServiceReportMaterialKind = 'reactivo' | 'refaccion' | 'consumible' | 'control' | 'calibrador' | 'otro';
export type ServiceReportMaterialScanMethod = 'camera' | 'image' | 'manual';

export interface BiosystemsCatalogItem {
  code: string;
  description: string;
  category: string;
  subcategory: string;
  presentation: string;
  priceMxn: number | null;
  notes: string;
}

export interface Gs1DataMatrixParseResult {
  rawText: string;
  normalizedText: string;
  gtin: string;
  referenceCode: string;
  lotNumber: string;
  expiresOn: string;
}

export interface ServiceReportMaterialItem {
  id: string;
  kind: ServiceReportMaterialKind;
  quantity: number;
  productName: string;
  rawScan: string;
  scanMethod: ServiceReportMaterialScanMethod;
  scanFormat: string;
  gtin: string;
  referenceCode: string;
  lotNumber: string;
  expiresOn: string;
  categoryName: string;
  presentation: string;
  priceMxn: number | null;
  catalogCode: string;
  catalogMatched: boolean;
  scannedAt: string;
  notes: string;
}

export type MaterialExpirationState = 'vigente' | 'proximo' | 'caducado' | 'sin_dato';

const CATALOG_URL = getPublicAssetUrl('biosystems-product-catalog.csv');
const GS = '\u001d';

let catalogPromise: Promise<Map<string, BiosystemsCatalogItem>> | null = null;

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const safeUuid = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `scan-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

const parseCsv = (text: string) => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentField += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      currentRow.push(currentField);
      currentField = '';
      if (currentRow.some((cell) => cell.trim().length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
};

const toIsoDate = (yyMMdd: string) => {
  if (!/^\d{6}$/.test(yyMMdd)) {
    return '';
  }

  const year = 2000 + Number(yyMMdd.slice(0, 2));
  const month = Number(yyMMdd.slice(2, 4));
  const day = Number(yyMMdd.slice(4, 6));
  const date = new Date(year, month - 1, day, 12, 0, 0);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${date.getFullYear()}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const normalizeGs1Raw = (rawText: string) =>
  rawText
    .replace(/^\]d2/, '')
    .replace(/[\r\n\t ]+/g, '')
    .replace(/[\u001e\u001f]/g, GS)
    .trim();

const parseParenthesizedGs1 = (rawText: string): Gs1DataMatrixParseResult | null => {
  const gtin = rawText.match(/\(01\)(\d{14})/)?.[1] || '';
  const lotNumber = rawText.match(/\(10\)([^\(\)\u001d]+)/)?.[1] || '';
  const expiresOn = toIsoDate(rawText.match(/\(17\)(\d{6})/)?.[1] || '');

  if (!gtin) {
    return null;
  }

  return {
    rawText,
    normalizedText: rawText,
    gtin,
    referenceCode: deriveReferenceFromGtin(gtin),
    lotNumber,
    expiresOn,
  };
};

const parseSequentialGs1 = (rawText: string): Gs1DataMatrixParseResult | null => {
  const normalizedText = normalizeGs1Raw(rawText);
  if (!normalizedText.startsWith('01') || normalizedText.length < 16) {
    return null;
  }

  let cursor = 0;
  let gtin = '';
  let lotNumber = '';
  let expiryToken = '';

  while (cursor < normalizedText.length) {
    const ai = normalizedText.slice(cursor, cursor + 2);

    if (ai === '01') {
      gtin = normalizedText.slice(cursor + 2, cursor + 16);
      cursor += 16;
      continue;
    }

    if (ai === '17') {
      expiryToken = normalizedText.slice(cursor + 2, cursor + 8);
      cursor += 8;
      continue;
    }

    if (ai === '10') {
      cursor += 2;
      const endIndex = normalizedText.indexOf(GS, cursor);
      lotNumber = normalizedText.slice(cursor, endIndex === -1 ? undefined : endIndex);
      cursor = endIndex === -1 ? normalizedText.length : endIndex + 1;
      continue;
    }

    if (normalizedText[cursor] === GS) {
      cursor += 1;
      continue;
    }

    break;
  }

  if (!gtin) {
    return null;
  }

  return {
    rawText,
    normalizedText,
    gtin,
    referenceCode: deriveReferenceFromGtin(gtin),
    lotNumber,
    expiresOn: toIsoDate(expiryToken),
  };
};

export const deriveReferenceFromGtin = (gtin: string) => {
  const normalized = gtin.replace(/\D/g, '');

  if (normalized.length >= 6) {
    return normalized.slice(-6, -1);
  }

  return normalized;
};

export const parseGs1DataMatrix = (rawText: string): Gs1DataMatrixParseResult | null => {
  const normalized = rawText.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.includes('(01)')) {
    return parseParenthesizedGs1(normalized);
  }

  return parseSequentialGs1(normalized);
};

export const loadBiosystemsProductCatalog = async () => {
  if (!catalogPromise) {
    catalogPromise = fetch(CATALOG_URL)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('No fue posible cargar el catalogo BioSystems.');
        }

        const rawCsv = await response.text();
        const rows = parseCsv(rawCsv);
        const [header, ...body] = rows;
        const headerIndex = Object.fromEntries(header.map((cell, index) => [cell, index]));
        const catalog = new Map<string, BiosystemsCatalogItem>();

        body.forEach((row) => {
          const code = String(row[headerIndex.codigo] || '').trim();
          if (!code) {
            return;
          }

          catalog.set(code, {
            code,
            description: String(row[headerIndex.descripcion] || '').trim(),
            category: String(row[headerIndex.categoria] || '').trim(),
            subcategory: String(row[headerIndex.subcategoria] || '').trim(),
            presentation: String(row[headerIndex.presentacion] || '').trim(),
            priceMxn: Number.isFinite(Number(row[headerIndex.precio_mxn]))
              ? Number(row[headerIndex.precio_mxn])
              : null,
            notes: String(row[headerIndex.notas] || '').trim(),
          });
        });

        return catalog;
      })
      .catch((error) => {
        catalogPromise = null;
        throw error;
      });
  }

  return catalogPromise;
};

export const findBiosystemsCatalogItem = async (referenceCode: string) => {
  const normalized = referenceCode.trim();
  if (!normalized) {
    return null;
  }

  try {
    const catalog = await loadBiosystemsProductCatalog();
    return catalog.get(normalized) || null;
  } catch {
    return null;
  }
};

export const inferMaterialKind = (catalogItem: BiosystemsCatalogItem | null, fallbackName = ''): ServiceReportMaterialKind => {
  const source = normalizeText([catalogItem?.category, catalogItem?.subcategory, catalogItem?.description, fallbackName].filter(Boolean).join(' | '));

  if (source.includes('control')) return 'control';
  if (source.includes('calibr')) return 'calibrador';
  if (source.includes('reactiv') || source.includes('quimica clinica') || source.includes('glucose') || source.includes('cholesterol')) return 'reactivo';
  if (source.includes('refaccion') || source.includes('spare') || source.includes('pieza') || source.includes('lamp')) return 'refaccion';
  if (source.includes('consumible') || source.includes('accesorio')) return 'consumible';
  return 'otro';
};

export const createEmptyServiceReportMaterialItem = (): ServiceReportMaterialItem => ({
  id: safeUuid(),
  kind: 'otro',
  quantity: 1,
  productName: '',
  rawScan: '',
  scanMethod: 'manual',
  scanFormat: 'manual',
  gtin: '',
  referenceCode: '',
  lotNumber: '',
  expiresOn: '',
  categoryName: '',
  presentation: '',
  priceMxn: null,
  catalogCode: '',
  catalogMatched: false,
  scannedAt: new Date().toISOString(),
  notes: '',
});

export const isMeaningfulServiceReportMaterialItem = (item: ServiceReportMaterialItem) =>
  Boolean(
    item.productName.trim() ||
      item.referenceCode.trim() ||
      item.lotNumber.trim() ||
      item.gtin.trim() ||
      item.expiresOn.trim() ||
      item.rawScan.trim() ||
      item.notes.trim(),
  );

export const enrichMaterialItemFromReference = async (item: ServiceReportMaterialItem) => {
  const catalogItem = await findBiosystemsCatalogItem(item.referenceCode);
  if (!catalogItem) {
    return {
      ...item,
      catalogMatched: false,
      catalogCode: item.referenceCode || item.catalogCode,
      kind: item.kind || 'otro',
    };
  }

  const nextName = item.productName.trim();

  return {
    ...item,
    productName: nextName || catalogItem.description,
    categoryName: catalogItem.category,
    presentation: item.presentation || catalogItem.presentation,
    priceMxn: item.priceMxn ?? catalogItem.priceMxn,
    catalogCode: catalogItem.code,
    catalogMatched: true,
    kind: item.kind === 'otro' ? inferMaterialKind(catalogItem, nextName) : item.kind,
  };
};

export const createMaterialItemFromScan = async ({
  rawText,
  scanMethod,
  scanFormat,
}: {
  rawText: string;
  scanMethod: ServiceReportMaterialScanMethod;
  scanFormat: string;
}) => {
  const parsed = parseGs1DataMatrix(rawText);

  if (!parsed) {
    throw new Error(
      'Se leyo un codigo 2D, pero no se pudo interpretar como GS1 DataMatrix de BioSystems. Intenta con mejor enfoque o carga una foto mas nitida.',
    );
  }

  const catalogItem = await findBiosystemsCatalogItem(parsed.referenceCode);
  const productName = catalogItem?.description || `Producto BioSystems REF ${parsed.referenceCode}`;

  return {
    id: safeUuid(),
    kind: inferMaterialKind(catalogItem, productName),
    quantity: 1,
    productName,
    rawScan: rawText,
    scanMethod,
    scanFormat,
    gtin: parsed.gtin,
    referenceCode: parsed.referenceCode,
    lotNumber: parsed.lotNumber,
    expiresOn: parsed.expiresOn,
    categoryName: catalogItem?.category || '',
    presentation: catalogItem?.presentation || '',
    priceMxn: catalogItem?.priceMxn ?? null,
    catalogCode: catalogItem?.code || parsed.referenceCode,
    catalogMatched: Boolean(catalogItem),
    scannedAt: new Date().toISOString(),
    notes: '',
  } satisfies ServiceReportMaterialItem;
};

export const resolveMaterialExpirationState = (expiresOn: string): MaterialExpirationState => {
  if (!expiresOn) {
    return 'sin_dato';
  }

  const expiration = new Date(`${expiresOn}T12:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (Number.isNaN(expiration.getTime())) {
    return 'sin_dato';
  }

  if (expiration.getTime() < today.getTime()) {
    return 'caducado';
  }

  const diffDays = Math.ceil((expiration.getTime() - today.getTime()) / 86_400_000);
  if (diffDays <= 90) {
    return 'proximo';
  }

  return 'vigente';
};

export const formatMaterialExpirationLabel = (state: MaterialExpirationState) => {
  if (state === 'caducado') return 'Caducado';
  if (state === 'proximo') return 'Caduca pronto';
  if (state === 'vigente') return 'Vigente';
  return 'Sin caducidad';
};
