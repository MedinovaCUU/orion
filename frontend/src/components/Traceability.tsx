import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import './Traceability.css';

type TraceabilitySource = 'structured' | 'payload' | 'demo';
type TraceabilityWindow = 30 | 90 | 180 | 365;
type TraceabilityKind = 'all' | 'reactivo' | 'refaccion' | 'consumible' | 'control' | 'calibrador' | 'otro';
type SeverityTone = 'critical' | 'warning' | 'info';
type SolarRiskTone = 'critical' | 'warning' | 'healthy' | 'neutral';
type TraceabilityView = 'streetStock' | 'solar' | 'pulse' | 'clients' | 'risk' | 'matrix' | 'references';
type StockLocationType = 'warehouse' | 'field';

interface ServiceReportMaterialRow {
  id: string;
  item_id?: string | null;
  material_kind?: string | null;
  quantity?: number | null;
  product_name?: string | null;
  raw_scan?: string | null;
  scan_method?: string | null;
  scan_format?: string | null;
  gtin?: string | null;
  reference_code?: string | null;
  lot_number?: string | null;
  expires_on?: string | null;
  catalog_code?: string | null;
  category_name?: string | null;
  presentation?: string | null;
  price_mxn?: number | null;
  catalog_matched?: boolean | null;
  scanned_at?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  service_reports?: {
    id?: string;
    created_at?: string | null;
    service_date?: string | null;
    call_date?: string | null;
    engineer_name?: string | null;
    client_name?: string | null;
    equipment_serial?: string | null;
    equipment_name?: string | null;
    service_type?: string | null;
    status?: string | null;
    diagnostic_code?: string | null;
    diagnostic_label?: string | null;
  } | Array<{
    id?: string;
    created_at?: string | null;
    service_date?: string | null;
    call_date?: string | null;
    engineer_name?: string | null;
    client_name?: string | null;
    equipment_serial?: string | null;
    equipment_name?: string | null;
    service_type?: string | null;
    status?: string | null;
    diagnostic_code?: string | null;
    diagnostic_label?: string | null;
  }> | null;
}

interface ServiceReportFallbackRow {
  id: string;
  created_at?: string | null;
  service_date?: string | null;
  call_date?: string | null;
  engineer_name?: string | null;
  client_name?: string | null;
  equipment_serial?: string | null;
  equipment_name?: string | null;
  service_type?: string | null;
  status?: string | null;
  diagnostic_code?: string | null;
  diagnostic_label?: string | null;
  report_payload?: {
    form?: {
      materialsUsed?: Array<Record<string, unknown>>;
    };
  } | null;
}

interface TraceabilityRecord {
  id: string;
  serviceReportId: string;
  productName: string;
  materialKind: Exclude<TraceabilityKind, 'all'>;
  quantity: number;
  rawScan: string;
  scanMethod: string;
  scanFormat: string;
  gtin: string;
  referenceCode: string;
  lotNumber: string;
  expiresOn: string;
  catalogCode: string;
  categoryName: string;
  presentation: string;
  priceMxn: number | null;
  catalogMatched: boolean;
  scannedAt: string;
  notes: string;
  engineerName: string;
  clientName: string;
  equipmentSerial: string;
  equipmentName: string;
  serviceType: string;
  status: string;
  diagnosticCode: string;
  diagnosticLabel: string;
  metadata?: Record<string, unknown>;
}

interface StreetStockHolder {
  id: string;
  name: string;
  locationType: StockLocationType;
  quantity: number;
  value: number;
  uniqueRefs: number;
  uniqueLots: number;
  matchedQuantity: number;
  scanCount: number;
  expiringSoon: number;
  expired: number;
  topReference: string;
  share: number;
  valueShare: number;
  matchRate: number;
}

interface PulseBucket {
  isoDate: string;
  label: string;
  total: number;
  matched: number;
  byKind: Record<string, number>;
}

interface ReferenceInsight {
  referenceCode: string;
  productName: string;
  totalQuantity: number;
  scanCount: number;
  uniqueLots: number;
  clients: number;
  engineers: number;
  matchRate: number;
  priceMxn: number | null;
  sparkline: number[];
}

interface SignalRing {
  label: string;
  value: number;
  tone: string;
  hint: string;
}

interface SignalAlert {
  id: string;
  tone: SeverityTone;
  title: string;
  body: string;
}

interface SolarFrontInsight {
  id: string;
  unitName: string;
  unitCode: string;
  frontCode: string;
  productName: string;
  referenceCode: string;
  dominantKind: Exclude<TraceabilityKind, 'all'>;
  quantity: number;
  estimatedValue: number;
  uniqueLots: number;
  uniqueRefs: number;
  scanCount: number;
  coverageScore: number;
  expiryScore: number;
  riskTone: SolarRiskTone;
  latestScan: string;
  leadEngineer: string;
  expiredCount: number;
  expiringSoonCount: number;
  matchedRatio: number;
  serial: string;
}

const WINDOW_OPTIONS: TraceabilityWindow[] = [30, 90, 180, 365];
const KIND_OPTIONS: TraceabilityKind[] = ['all', 'refaccion', 'consumible', 'otro'];
const CURRENT_SCOPE_KINDS: Array<Exclude<TraceabilityKind, 'all'>> = ['refaccion', 'consumible', 'otro'];
const VISUALIZATION_OPTIONS: Array<{
  key: TraceabilityView;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    key: 'streetStock',
    label: 'Stock en calle',
    shortLabel: 'Calle',
    description: 'Piezas trazadas en almacén contra piezas asignadas a ingenieros, con valor por responsable.',
  },
  {
    key: 'solar',
    label: 'Solar operativo',
    shortLabel: 'Solar',
    description: 'Mapa radial de unidades, refacciones, cobertura y riesgo.',
  },
  {
    key: 'pulse',
    label: 'Pulso temporal',
    shortLabel: 'Pulso',
    description: 'Evolución del uso y reconocimiento por fecha.',
  },
  {
    key: 'clients',
    label: 'Presión por unidad',
    shortLabel: 'Unidades',
    description: 'Clientes con mayor consumo relativo de refacciones.',
  },
  {
    key: 'risk',
    label: 'Riesgo de lote',
    shortLabel: 'Riesgo',
    description: 'Vigencia, vencimiento y urgencia de revisión.',
  },
  {
    key: 'matrix',
    label: 'Matriz persona × REF',
    shortLabel: 'Matriz',
    description: 'Concentración de uso por ingeniero, químico o responsable.',
  },
  {
    key: 'references',
    label: 'Deck de refacciones',
    shortLabel: 'REF',
    description: 'Ranking de piezas dominantes, lotes y valor estimado.',
  },
];
const KIND_LABELS: Record<TraceabilityKind, string> = {
  all: 'Todo',
  reactivo: 'Reactivos futuros',
  refaccion: 'Refacciones',
  consumible: 'Consumibles técnicos',
  control: 'Controles futuros',
  calibrador: 'Calibradores futuros',
  otro: 'Otros',
};
const KIND_COLORS: Record<Exclude<TraceabilityKind, 'all'>, string> = {
  reactivo: '#42636f',
  refaccion: '#f4f6fb',
  consumible: '#ba000d',
  control: '#7d91b4',
  calibrador: '#7d91b4',
  otro: '#c0c0c0',
};

const TRACEABILITY_VIEW_DIAL_SIZE = 320;
const TRACEABILITY_VIEW_DIAL_CENTER = TRACEABILITY_VIEW_DIAL_SIZE / 2;
const TRACEABILITY_VIEW_DIAL_OUTER_RADIUS = 142;
const TRACEABILITY_VIEW_DIAL_INNER_RADIUS = 92;
const TRACEABILITY_VIEW_SEGMENT_OUTER_RADIUS = 138;
const TRACEABILITY_VIEW_SEGMENT_INNER_RADIUS = 96;

function polarPoint(cx: number, cy: number, radius: number, angleDeg: number) {
  const radians = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function describeRingSegment(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
) {
  const outerStart = polarPoint(cx, cy, outerRadius, startAngle);
  const outerEnd = polarPoint(cx, cy, outerRadius, endAngle);
  const innerEnd = polarPoint(cx, cy, innerRadius, endAngle);
  const innerStart = polarPoint(cx, cy, innerRadius, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;

  return [
    `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
    `L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

const mxnFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

const pctFormatter = new Intl.NumberFormat('es-MX', {
  style: 'percent',
  maximumFractionDigits: 0,
});

const compactFormatter = new Intl.NumberFormat('es-MX', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toIsoDate = (value?: string | null) => {
  if (!value) {
    return '';
  }

  const candidate = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    return candidate;
  }

  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString().slice(0, 10);
};

const toDisplayDate = (value?: string | null) => {
  const iso = toIsoDate(value);
  if (!iso) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${iso}T12:00:00`));
};

const ensureNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const ensureNullableNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const average = (values: number[]) => {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const ensureKind = (value: unknown): Exclude<TraceabilityKind, 'all'> => {
  const normalized = normalizeText(String(value || ''));
  if (normalized === 'reactivo') return 'reactivo';
  if (normalized === 'refaccion') return 'refaccion';
  if (normalized === 'consumible') return 'consumible';
  if (normalized === 'control') return 'control';
  if (normalized === 'calibrador') return 'calibrador';
  return 'otro';
};

const materialDateKey = (record: TraceabilityRecord) => toIsoDate(record.scannedAt) || toIsoDate(record.expiresOn);

const daysUntil = (value: string) => {
  const iso = toIsoDate(value);
  if (!iso) {
    return null;
  }

  const date = new Date(`${iso}T12:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
};

const expirationTone = (value: string) => {
  const remaining = daysUntil(value);
  if (remaining === null) return 'neutral';
  if (remaining < 0) return 'critical';
  if (remaining <= 90) return 'warning';
  return 'healthy';
};

const buildSmoothLinePath = (points: Array<{ x: number; y: number }>) => {
  if (points.length === 0) {
    return '';
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const midX = (current.x + next.x) / 2;
    path += ` C ${midX} ${current.y}, ${midX} ${next.y}, ${next.x} ${next.y}`;
  }

  return path;
};

const buildAreaPath = (topPoints: Array<{ x: number; y: number }>, bottomPoints: Array<{ x: number; y: number }>) => {
  if (topPoints.length === 0 || bottomPoints.length === 0) {
    return '';
  }

  const topPath = buildSmoothLinePath(topPoints);
  const reversedBottom = [...bottomPoints].reverse();
  const bottomPath = buildSmoothLinePath(reversedBottom).replace(/^M/, 'L');
  return `${topPath} ${bottomPath} Z`;
};

const buildSparklinePath = (values: number[], width: number, height: number) => {
  if (values.length === 0) {
    return '';
  }

  const max = Math.max(...values, 1);
  const step = values.length === 1 ? 0 : width / (values.length - 1);

  return buildSmoothLinePath(
    values.map((value, index) => ({
      x: index * step,
      y: height - (value / max) * height,
    })),
  );
};

const pulseDateRange = (windowDays: number) => {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (windowDays - 1));
  return { start, end };
};

const getSupabaseErrorText = (error: unknown) => {
  if (!error) {
    return '';
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object') {
    const candidate = error as Record<string, unknown>;
    return [candidate.message, candidate.details, candidate.hint, candidate.code]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean)
      .join(' · ');
  }

  return '';
};

const isMissingStructuredTable = (error: unknown) =>
  /service_report_materials|schema cache|Could not find the table|Could not find a relationship/i.test(getSupabaseErrorText(error));

const normalizeStructuredRecord = (row: ServiceReportMaterialRow): TraceabilityRecord => {
  const parent = Array.isArray(row.service_reports) ? row.service_reports[0] : row.service_reports;
  const scannedAt = row.scanned_at || parent?.created_at || '';

  return {
    id: row.id,
    serviceReportId: parent?.id || '',
    productName: row.product_name || `REF ${row.reference_code || 'sin referencia'}`,
    materialKind: ensureKind(row.material_kind),
    quantity: Math.max(1, ensureNumber(row.quantity, 1)),
    rawScan: row.raw_scan || '',
    scanMethod: row.scan_method || 'manual',
    scanFormat: row.scan_format || 'manual',
    gtin: row.gtin || '',
    referenceCode: row.reference_code || '',
    lotNumber: row.lot_number || '',
    expiresOn: toIsoDate(row.expires_on),
    catalogCode: row.catalog_code || '',
    categoryName: row.category_name || '',
    presentation: row.presentation || '',
    priceMxn: ensureNullableNumber(row.price_mxn),
    catalogMatched: Boolean(row.catalog_matched),
    scannedAt,
    notes: row.notes || '',
    engineerName: parent?.engineer_name || 'Ingeniero sin nombre',
    clientName: parent?.client_name || 'Cliente no especificado',
    equipmentSerial: parent?.equipment_serial || '',
    equipmentName: parent?.equipment_name || '',
    serviceType: parent?.service_type || '',
    status: parent?.status || '',
    diagnosticCode: parent?.diagnostic_code || '',
    diagnosticLabel: parent?.diagnostic_label || '',
    metadata: row.metadata ?? {},
  };
};

const normalizePayloadRecord = (
  report: ServiceReportFallbackRow,
  item: Record<string, unknown>,
  index: number,
): TraceabilityRecord => ({
  id: `${report.id}-${String(item.id || index)}`,
  serviceReportId: report.id,
  productName: String(item.productName || item.product_name || `REF ${String(item.referenceCode || item.reference_code || 'sin referencia')}`),
  materialKind: ensureKind(item.kind || item.material_kind),
  quantity: Math.max(1, ensureNumber(item.quantity, 1)),
  rawScan: String(item.rawScan || item.raw_scan || ''),
  scanMethod: String(item.scanMethod || item.scan_method || 'manual'),
  scanFormat: String(item.scanFormat || item.scan_format || 'manual'),
  gtin: String(item.gtin || ''),
  referenceCode: String(item.referenceCode || item.reference_code || ''),
  lotNumber: String(item.lotNumber || item.lot_number || ''),
  expiresOn: toIsoDate(String(item.expiresOn || item.expires_on || '')),
  catalogCode: String(item.catalogCode || item.catalog_code || ''),
  categoryName: String(item.categoryName || item.category_name || ''),
  presentation: String(item.presentation || ''),
  priceMxn: ensureNullableNumber(item.priceMxn),
  catalogMatched: Boolean(item.catalogMatched),
  scannedAt: String(item.scannedAt || report.service_date || report.call_date || report.created_at || ''),
  notes: String(item.notes || ''),
  engineerName: report.engineer_name || 'Ingeniero sin nombre',
  clientName: report.client_name || 'Cliente no especificado',
  equipmentSerial: report.equipment_serial || '',
  equipmentName: report.equipment_name || '',
  serviceType: report.service_type || '',
  status: report.status || '',
  diagnosticCode: report.diagnostic_code || '',
  diagnosticLabel: report.diagnostic_label || '',
  metadata: {},
});

const createDailyBuckets = (records: TraceabilityRecord[], windowDays: TraceabilityWindow) => {
  const { start, end } = pulseDateRange(windowDays);
  const buckets = new Map<string, PulseBucket>();
  const cursor = new Date(start);

  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    buckets.set(iso, {
      isoDate: iso,
      label: toDisplayDate(iso),
      total: 0,
      matched: 0,
      byKind: {
        reactivo: 0,
        refaccion: 0,
        consumible: 0,
        control: 0,
        calibrador: 0,
        otro: 0,
      },
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  records.forEach((record) => {
    const key = materialDateKey(record);
    const bucket = key ? buckets.get(key) : undefined;
    if (!bucket) {
      return;
    }

    bucket.total += record.quantity;
    if (record.catalogMatched) {
      bucket.matched += record.quantity;
    }
    bucket.byKind[record.materialKind] += record.quantity;
  });

  return Array.from(buckets.values());
};

const polarToCartesian = (cx: number, cy: number, radius: number, angleDeg: number) => {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
};

const describeArc = (cx: number, cy: number, radius: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
};

const describeDonutArc = (cx: number, cy: number, radius: number, value: number) => {
  const endAngle = -220 + clamp(value, 0, 1) * 260;
  return describeArc(cx, cy, radius, -220, endAngle);
};

const classifyScanMethod = (value: string) => {
  const normalized = normalizeText(value);
  if (normalized.includes('manual')) {
    return 'manual';
  }
  if (normalized.includes('imagen') || normalized.includes('archivo') || normalized.includes('upload')) {
    return 'imagen';
  }
  return 'scanner';
};

const toSafeId = (value: string) => normalizeText(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'trace';

const stringifyMetadataValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
};

const metadataPick = (metadata: Record<string, unknown> | undefined, keys: string[]) => {
  if (!metadata) {
    return '';
  }

  for (const key of keys) {
    const value = stringifyMetadataValue(metadata[key]).trim();
    if (value) {
      return value;
    }
  }

  return '';
};

const resolveStockHolder = (record: TraceabilityRecord) => {
  const metadata = record.metadata ?? {};
  const explicitHolder = metadataPick(metadata, [
    'holder_name',
    'custodian_name',
    'assigned_to',
    'responsible_name',
    'engineer_name',
    'owner_name',
    'warehouse_name',
    'stock_location',
    'location_name',
  ]);
  const explicitLocation = metadataPick(metadata, [
    'location_type',
    'stock_location_type',
    'holder_type',
    'warehouse',
    'almacen',
    'bodega',
    'inventory_location',
  ]);
  const locationNeedle = normalizeText(
    [
      explicitLocation,
      metadataPick(metadata, ['movement_type', 'stock_status', 'inventory_status']),
      record.status,
      record.engineerName,
    ].join(' '),
  );
  const isWarehouse =
    /(^|\s)(almacen|bodega|warehouse|inventario)(\s|$)/.test(locationNeedle) ||
    locationNeedle.includes('stock central') ||
    normalizeText(record.engineerName) === 'ingeniero sin nombre' ||
    normalizeText(record.engineerName) === 'sin asignar';

  return {
    locationType: isWarehouse ? 'warehouse' : 'field',
    name: isWarehouse ? explicitHolder || 'Almacén / stock central' : explicitHolder || record.engineerName || 'Sin responsable',
  } as const;
};

const toUnitCode = (name: string, serial: string, index: number) => {
  const initials = name
    .split(/\s+/)
    .map((segment) => segment.trim()[0] || '')
    .join('')
    .slice(0, 3)
    .toUpperCase();

  const serialCode = serial ? serial.slice(-4) : String(index + 1).padStart(3, '0');
  return `${initials || 'UM'}-${serialCode}`;
};

const isoDateFromNow = (daysFromNow: number) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
};

const isoDateTimeFromNow = (daysFromNow: number, hour = 11) => {
  const date = new Date();
  date.setHours(hour, 18, 0, 0);
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString();
};

const buildDemoTraceabilityRecords = (): TraceabilityRecord[] => {
  const seeds: TraceabilityRecord[] = [
    {
    id: 'demo-1',
    serviceReportId: 'demo-sr-1',
    productName: 'Filtro de agua desionizada BA400',
    materialKind: 'refaccion',
    quantity: 4,
    rawScan: 'REF-WTR-FLT-BA400(10)WF49369',
    scanMethod: 'scanner',
    scanFormat: 'QR interno',
    gtin: '',
    referenceCode: 'WTR-FLT',
    lotNumber: 'WF49369',
    expiresOn: isoDateFromNow(100),
    catalogCode: 'SP-WTR-FLT',
    categoryName: 'Hidráulica',
    presentation: '1 pieza',
    priceMxn: 1480,
    catalogMatched: true,
    scannedAt: isoDateTimeFromNow(-28, 10),
    notes: 'Cambio preventivo por ciclo de mantenimiento.',
    engineerName: 'Ricardo Montañez',
    clientName: 'ERLICH Cuauhtémoc',
    equipmentSerial: '831067674',
    equipmentName: 'BioSystems BA400',
    serviceType: 'preventivo',
    status: 'registrado',
    diagnosticCode: 'MP-PLAN',
    diagnosticLabel: 'Mantenimiento preventivo',
  },
  {
    id: 'demo-2',
    serviceReportId: 'demo-sr-2',
    productName: 'Jeringa de dispensación 500 µL',
    materialKind: 'refaccion',
    quantity: 3,
    rawScan: 'REF-SYR-500-BA400(10)SY49784',
    scanMethod: 'scanner',
    scanFormat: 'QR interno',
    gtin: '',
    referenceCode: 'SYR-500',
    lotNumber: 'SY49784',
    expiresOn: isoDateFromNow(131),
    catalogCode: 'SP-SYR-500',
    categoryName: 'Dispensación',
    presentation: '1 pieza',
    priceMxn: 2190,
    catalogMatched: true,
    scannedAt: isoDateTimeFromNow(-24, 12),
    notes: 'Reemplazo preventivo tras verificación de dispensación.',
    engineerName: 'Ricardo Montañez',
    clientName: 'Laboratorio Erlich',
    equipmentSerial: '834000262',
    equipmentName: 'BioSystems BA400',
    serviceType: 'correctivo',
    status: 'registrado',
    diagnosticCode: 'FOT-BASE',
    diagnosticLabel: 'Verificación fotométrica',
  },
  {
    id: 'demo-3',
    serviceReportId: 'demo-sr-3',
    productName: 'Kit de mangueras peristálticas',
    materialKind: 'consumible',
    quantity: 5,
    rawScan: 'REF-TUBE-KIT-BA400(10)TK48695',
    scanMethod: 'imagen',
    scanFormat: 'QR interno',
    gtin: '',
    referenceCode: 'TUBE-KIT',
    lotNumber: 'TK48695',
    expiresOn: isoDateFromNow(-22),
    catalogCode: 'SP-TUBE-KIT',
    categoryName: 'Fluidos',
    presentation: 'Kit',
    priceMxn: 2540,
    catalogMatched: true,
    scannedAt: isoDateTimeFromNow(-22, 16),
    notes: 'Lote de consumible técnico con vigencia superada.',
    engineerName: 'Francisco Salgado',
    clientName: 'ISSSTE Orizaba',
    equipmentSerial: '834002504',
    equipmentName: 'BioSystems BA400',
    serviceType: 'correctivo',
    status: 'registrado',
    diagnosticCode: 'USB-COM',
    diagnosticLabel: 'Error de comunicación',
  },
  {
    id: 'demo-4',
    serviceReportId: 'demo-sr-4',
    productName: 'Punta de muestra BA400',
    materialKind: 'refaccion',
    quantity: 2,
    rawScan: 'REF-SAMPLE-PROBE(10)SP48632',
    scanMethod: 'scanner',
    scanFormat: 'QR interno',
    gtin: '',
    referenceCode: 'SAMPLE-PROBE',
    lotNumber: 'SP48632',
    expiresOn: isoDateFromNow(48),
    catalogCode: 'SP-SAMPLE-PROBE',
    categoryName: 'Muestreo',
    presentation: '1 pieza',
    priceMxn: 3720,
    catalogMatched: true,
    scannedAt: isoDateTimeFromNow(-18, 9),
    notes: 'Repuesto en visita de revisión de muestreo.',
    engineerName: 'Martha Carbajal',
    clientName: 'Hospital Ángeles Chihuahua',
    equipmentSerial: '831066733',
    equipmentName: 'BioSystems BA400',
    serviceType: 'preventivo',
    status: 'registrado',
    diagnosticCode: 'METRO',
    diagnosticLabel: 'Metrología',
  },
  {
    id: 'demo-5',
    serviceReportId: 'demo-sr-5',
    productName: 'Lámpara halógena BA400',
    materialKind: 'refaccion',
    quantity: 1,
    rawScan: 'REF-BA400-LAMP-01',
    scanMethod: 'manual',
    scanFormat: 'manual',
    gtin: '',
    referenceCode: 'LAMP-BA400',
    lotNumber: 'L2409',
    expiresOn: '',
    catalogCode: 'SP-LAMP-BA400',
    categoryName: 'Óptica',
    presentation: '1 pieza',
    priceMxn: 6850,
    catalogMatched: true,
    scannedAt: isoDateTimeFromNow(-15, 14),
    notes: 'Cambio de lámpara tras drift fotométrico.',
    engineerName: 'Ricardo Montañez',
    clientName: 'CH Star Médica',
    equipmentSerial: '831060931',
    equipmentName: 'BioSystems BA400',
    serviceType: 'correctivo',
    status: 'registrado',
    diagnosticCode: 'LAMP',
    diagnosticLabel: 'Cambio de lámpara',
  },
  {
    id: 'demo-6',
    serviceReportId: 'demo-sr-6',
    productName: 'Sonda de lavado',
    materialKind: 'refaccion',
    quantity: 2,
    rawScan: 'REF-WASH-PROBE',
    scanMethod: 'manual',
    scanFormat: 'manual',
    gtin: '',
    referenceCode: 'WASH-PROBE',
    lotNumber: 'WP-331',
    expiresOn: '',
    catalogCode: 'SP-WASH-PROBE',
    categoryName: 'Wash station',
    presentation: '1 pieza',
    priceMxn: 3240,
    catalogMatched: false,
    scannedAt: isoDateTimeFromNow(-13, 11),
    notes: 'Captura manual pendiente de vincular a catálogo.',
    engineerName: 'Francisco Salgado',
    clientName: 'ISSSTE Orizaba',
    equipmentSerial: '834002504',
    equipmentName: 'BioSystems BA400',
    serviceType: 'correctivo',
    status: 'registrado',
    diagnosticCode: 'WASH',
    diagnosticLabel: 'Ajuste de estación de lavado',
  },
  {
    id: 'demo-7',
    serviceReportId: 'demo-sr-7',
    productName: 'Solución limpiadora de cubetas',
    materialKind: 'consumible',
    quantity: 6,
    rawScan: 'CLEAN-BS-900',
    scanMethod: 'imagen',
    scanFormat: 'QR',
    gtin: '',
    referenceCode: 'CLEAN-900',
    lotNumber: 'CL-782',
    expiresOn: isoDateFromNow(61),
    catalogCode: 'BS-CLEAN-900',
    categoryName: 'Limpieza',
    presentation: '900 mL',
    priceMxn: 890,
    catalogMatched: true,
    scannedAt: isoDateTimeFromNow(-10, 13),
    notes: 'Uso elevado tras mantenimiento profundo.',
    engineerName: 'Martha Carbajal',
    clientName: 'Hospital Ángeles Chihuahua',
    equipmentSerial: '831066733',
    equipmentName: 'BioSystems BA400',
    serviceType: 'preventivo',
    status: 'registrado',
    diagnosticCode: 'CLEAN',
    diagnosticLabel: 'Mantenimiento profundo',
  },
  {
    id: 'demo-8',
    serviceReportId: 'demo-sr-8',
    productName: 'Rotor de reacción BA400',
    materialKind: 'refaccion',
    quantity: 2,
    rawScan: 'REF-REACTION-ROTOR(10)RRCTRL11',
    scanMethod: 'scanner',
    scanFormat: 'QR interno',
    gtin: '',
    referenceCode: 'REACTION-ROTOR',
    lotNumber: 'RRCTRL11',
    expiresOn: isoDateFromNow(284),
    catalogCode: 'SP-REACTION-ROTOR',
    categoryName: 'Rotor',
    presentation: '1 pieza',
    priceMxn: 11200,
    catalogMatched: true,
    scannedAt: isoDateTimeFromNow(-8, 15),
    notes: 'Revisión posterior a ajuste de encoder.',
    engineerName: 'Ricardo Montañez',
    clientName: 'ERLICH Cuauhtémoc',
    equipmentSerial: '831067674',
    equipmentName: 'BioSystems BA400',
    serviceType: 'preventivo',
    status: 'registrado',
    diagnosticCode: 'ENC',
    diagnosticLabel: 'Ajuste de encoder',
  },
  {
    id: 'demo-9',
    serviceReportId: 'demo-sr-9',
    productName: 'Sensor capacitivo de nivel',
    materialKind: 'refaccion',
    quantity: 2,
    rawScan: 'REF-LEVEL-SENSOR(10)LSCAL778',
    scanMethod: 'scanner',
    scanFormat: 'QR interno',
    gtin: '',
    referenceCode: 'LEVEL-SENSOR',
    lotNumber: 'LSCAL778',
    expiresOn: isoDateFromNow(252),
    catalogCode: 'SP-LEVEL-SENSOR',
    categoryName: 'Sensores',
    presentation: '1 pieza',
    priceMxn: 8120,
    catalogMatched: true,
    scannedAt: isoDateTimeFromNow(-6, 10),
    notes: 'Cambio por lectura inestable de nivel.',
    engineerName: 'Francisco Salgado',
    clientName: 'Laboratorio Erlich',
    equipmentSerial: '834000262',
    equipmentName: 'BioSystems BA400',
    serviceType: 'correctivo',
    status: 'registrado',
    diagnosticCode: 'CAL',
    diagnosticLabel: 'Calibración',
  },
  {
    id: 'demo-10',
    serviceReportId: 'demo-sr-10',
    productName: 'Motor agitador',
    materialKind: 'refaccion',
    quantity: 1,
    rawScan: 'AGT-MOTOR-BA400',
    scanMethod: 'manual',
    scanFormat: 'manual',
    gtin: '',
    referenceCode: 'AGT-MOTOR',
    lotNumber: 'MT-2208',
    expiresOn: '',
    catalogCode: '',
    categoryName: 'Agitación',
    presentation: '1 pieza',
    priceMxn: 4980,
    catalogMatched: false,
    scannedAt: isoDateTimeFromNow(-5, 17),
    notes: 'Falta normalizar referencia interna.',
    engineerName: 'Ricardo Montañez',
    clientName: 'Centro Médico del Norte',
    equipmentSerial: '831060931',
    equipmentName: 'BioSystems BA400',
    serviceType: 'correctivo',
    status: 'registrado',
    diagnosticCode: 'AGT',
    diagnosticLabel: 'Ajuste de agitadores',
  },
  {
    id: 'demo-11',
    serviceReportId: 'demo-sr-11',
    productName: 'Filtro de agua desionizada BA400',
    materialKind: 'refaccion',
    quantity: 7,
    rawScan: 'REF-WTR-FLT-BA400(10)WF49369',
    scanMethod: 'scanner',
    scanFormat: 'QR interno',
    gtin: '',
    referenceCode: 'WTR-FLT',
    lotNumber: 'WF49369',
    expiresOn: isoDateFromNow(100),
    catalogCode: 'SP-WTR-FLT',
    categoryName: 'Hidráulica',
    presentation: '1 pieza',
    priceMxn: 1480,
    catalogMatched: true,
    scannedAt: isoDateTimeFromNow(-3, 11),
    notes: 'Pieza dominante del periodo.',
    engineerName: 'Ricardo Montañez',
    clientName: 'ERLICH Cuauhtémoc',
    equipmentSerial: '831067674',
    equipmentName: 'BioSystems BA400',
    serviceType: 'preventivo',
    status: 'registrado',
    diagnosticCode: 'MP-PLAN',
    diagnosticLabel: 'Mantenimiento preventivo',
  },
  {
    id: 'demo-12',
    serviceReportId: 'demo-sr-12',
    productName: 'Punta de muestra BA400',
    materialKind: 'refaccion',
    quantity: 3,
    rawScan: 'REF-SAMPLE-PROBE(10)SP48632',
    scanMethod: 'scanner',
    scanFormat: 'QR interno',
    gtin: '',
    referenceCode: 'SAMPLE-PROBE',
    lotNumber: 'SP48632',
    expiresOn: isoDateFromNow(48),
    catalogCode: 'SP-SAMPLE-PROBE',
    categoryName: 'Muestreo',
    presentation: '1 pieza',
    priceMxn: 3720,
    catalogMatched: true,
    scannedAt: isoDateTimeFromNow(-2, 8),
    notes: 'Uso reforzado tras revisión de muestreo.',
    engineerName: 'Martha Carbajal',
    clientName: 'Hospital Ángeles Chihuahua',
    equipmentSerial: '831066733',
    equipmentName: 'BioSystems BA400',
    serviceType: 'capacitacion',
    status: 'registrado',
    diagnosticCode: 'TRAIN',
    diagnosticLabel: 'Capacitación',
  },
  {
    id: 'demo-13',
    serviceReportId: 'demo-stock-1',
    productName: 'Lámpara halógena BA400',
    materialKind: 'refaccion',
    quantity: 3,
    rawScan: 'STOCK-LAMP-BA400',
    scanMethod: 'scanner',
    scanFormat: 'inventario',
    gtin: '',
    referenceCode: 'LAMP-BA400',
    lotNumber: 'L2501',
    expiresOn: '',
    catalogCode: 'SP-LAMP-BA400',
    categoryName: 'Óptica',
    presentation: '1 pieza',
    priceMxn: 6850,
    catalogMatched: true,
    scannedAt: isoDateTimeFromNow(-1, 9),
    notes: 'Existencia física disponible en almacén.',
    engineerName: 'Almacén Guadalajara',
    clientName: 'Almacén central Biosystems',
    equipmentSerial: '',
    equipmentName: 'Stock de refacciones BA400',
    serviceType: 'inventario',
    status: 'almacen',
    diagnosticCode: 'STOCK',
    diagnosticLabel: 'Existencia de refacciones',
    metadata: { location_type: 'almacen', stock_location: 'Almacén Guadalajara' },
  },
  {
    id: 'demo-14',
    serviceReportId: 'demo-stock-2',
    productName: 'Sonda de lavado',
    materialKind: 'refaccion',
    quantity: 4,
    rawScan: 'STOCK-WASH-PROBE',
    scanMethod: 'scanner',
    scanFormat: 'inventario',
    gtin: '',
    referenceCode: 'WASH-PROBE',
    lotNumber: 'WP-335',
    expiresOn: '',
    catalogCode: 'SP-WASH-PROBE',
    categoryName: 'Wash station',
    presentation: '1 pieza',
    priceMxn: 3240,
    catalogMatched: true,
    scannedAt: isoDateTimeFromNow(-1, 10),
    notes: 'Stock físico listo para asignación a campo.',
    engineerName: 'Almacén Guadalajara',
    clientName: 'Almacén central Biosystems',
    equipmentSerial: '',
    equipmentName: 'Stock de refacciones BA400',
    serviceType: 'inventario',
    status: 'almacen',
    diagnosticCode: 'STOCK',
    diagnosticLabel: 'Existencia de refacciones',
    metadata: { location_type: 'almacen', stock_location: 'Almacén Guadalajara' },
  },
  ];

  const seedByReference = new Map(
    seeds.map((record) => [record.referenceCode || record.productName, record] as const),
  );

  const simulationEntries = [
    {
      baseRef: 'WTR-FLT',
      days: -86,
      hour: 9,
      quantity: 5,
      engineerName: 'Ricardo Montañez',
      clientName: 'TORREON HOSP UNIVERSIDAD',
      equipmentSerial: '83105C1228',
      lotNumber: 'WF50211',
      expiresOnDays: 182,
      notes: 'Ruta preventiva en Laguna con consumo sostenido de filtros.',
    },
    {
      baseRef: 'WTR-FLT',
      days: -58,
      hour: 13,
      quantity: 4,
      engineerName: 'Eduardo D. Garcia',
      clientName: 'Laboratorio Erlich',
      equipmentSerial: '834000262',
      lotNumber: 'WF50731',
      expiresOnDays: 151,
      notes: 'Recambio preventivo tras alerta de flujo inestable.',
    },
    {
      baseRef: 'WTR-FLT',
      days: -39,
      hour: 11,
      quantity: 6,
      engineerName: 'Benjamín Falcon',
      clientName: 'Hospital del Pacífico Mazatlán',
      equipmentSerial: '831057945',
      lotNumber: 'WF51004',
      expiresOnDays: 136,
      notes: 'Consumo reforzado en equipo de alto throughput.',
    },
    {
      baseRef: 'WTR-FLT',
      days: -12,
      hour: 10,
      quantity: 5,
      engineerName: 'Ricardo Montañez',
      clientName: 'TORREON HOSP UNIVERSIDAD',
      equipmentSerial: '83105C1228',
      lotNumber: 'WF51077',
      expiresOnDays: 119,
      notes: 'Refuerzo de stock de campo previo a semana de preventivos.',
    },
    {
      baseRef: 'WTR-FLT',
      days: -2,
      hour: 8,
      quantity: 8,
      engineerName: 'Almacén Querétaro',
      clientName: 'Stock regional Bajío',
      equipmentSerial: '',
      equipmentName: 'Stock de refacciones BA400',
      serviceType: 'inventario',
      status: 'almacen',
      lotNumber: 'WF51202',
      expiresOnDays: 163,
      notes: 'Reabasto de filtro dominante para rutas del Bajío.',
      metadata: { location_type: 'almacen', stock_location: 'Almacén Querétaro' },
    },
    {
      baseRef: 'SAMPLE-PROBE',
      days: -64,
      hour: 14,
      quantity: 2,
      engineerName: 'Martha Carbajal',
      clientName: 'Hospital Ángeles Chihuahua',
      equipmentSerial: '831066733',
      lotNumber: 'SP48914',
      expiresOnDays: 44,
      notes: 'Sustitución puntual de sonda en validación de muestreo.',
    },
    {
      baseRef: 'SAMPLE-PROBE',
      days: -31,
      hour: 12,
      quantity: 3,
      engineerName: 'Eduardo D. Garcia',
      clientName: 'Centro Médico del Norte',
      equipmentSerial: '831060931',
      lotNumber: 'SP49103',
      expiresOnDays: 37,
      notes: 'Rotación preventiva tras entrenamiento de usuario.',
    },
    {
      baseRef: 'SAMPLE-PROBE',
      days: -7,
      hour: 16,
      quantity: 2,
      engineerName: 'Benjamín Falcon',
      clientName: 'TORREON HOSP UNIVERSIDAD',
      equipmentSerial: '83105C1228',
      lotNumber: 'SP49332',
      expiresOnDays: 33,
      notes: 'Sonda asignada a campo para contingencia de fin de mes.',
    },
    {
      baseRef: 'TUBE-KIT',
      days: -70,
      hour: 15,
      quantity: 4,
      engineerName: 'Francisco Salgado',
      clientName: 'ISSSTE Orizaba',
      equipmentSerial: '834002504',
      lotNumber: 'TK48770',
      expiresOnDays: -11,
      notes: 'Lote próximo a retiro capturado en visita correctiva.',
    },
    {
      baseRef: 'TUBE-KIT',
      days: -44,
      hour: 10,
      quantity: 4,
      engineerName: 'Benjamín Falcon',
      clientName: 'Hospital del Pacífico Mazatlán',
      equipmentSerial: '831057945',
      lotNumber: 'TK48942',
      expiresOnDays: -2,
      notes: 'Kit de mangueras retirado tras drift de peristáltica.',
    },
    {
      baseRef: 'TUBE-KIT',
      days: -11,
      hour: 9,
      quantity: 6,
      engineerName: 'Almacén Monterrey',
      clientName: 'Stock regional Norte',
      equipmentSerial: '',
      equipmentName: 'Stock de refacciones BA400',
      serviceType: 'inventario',
      status: 'almacen',
      lotNumber: 'TK49018',
      expiresOnDays: 28,
      notes: 'Inventario técnico reservado para correctivos urgentes.',
      metadata: { location_type: 'almacen', stock_location: 'Almacén Monterrey' },
    },
    {
      baseRef: 'WASH-PROBE',
      days: -59,
      hour: 11,
      quantity: 3,
      engineerName: 'Francisco Salgado',
      clientName: 'ISSSTE Orizaba',
      equipmentSerial: '834002504',
      lotNumber: 'WP-338',
      catalogMatched: false,
      notes: 'Captura manual todavía pendiente de homologación con catálogo.',
    },
    {
      baseRef: 'WASH-PROBE',
      days: -22,
      hour: 13,
      quantity: 2,
      engineerName: 'Ricardo Montañez',
      clientName: 'TORREON HOSP UNIVERSIDAD',
      equipmentSerial: '83105C1228',
      lotNumber: 'WP-341',
      catalogMatched: true,
      notes: 'Reemplazo preventivo de sonda de lavado en ruta técnica.',
    },
    {
      baseRef: 'WASH-PROBE',
      days: -3,
      hour: 12,
      quantity: 5,
      engineerName: 'Almacén Monterrey',
      clientName: 'Stock regional Norte',
      equipmentSerial: '',
      equipmentName: 'Stock de refacciones BA400',
      serviceType: 'inventario',
      status: 'almacen',
      lotNumber: 'WP-345',
      notes: 'Disponibilidad inmediata para asignación de correctivos.',
      metadata: { location_type: 'almacen', stock_location: 'Almacén Monterrey' },
    },
    {
      baseRef: 'CLEAN-900',
      days: -47,
      hour: 9,
      quantity: 4,
      engineerName: 'Martha Carbajal',
      clientName: 'Hospital Ángeles Chihuahua',
      equipmentSerial: '831066733',
      lotNumber: 'CL-803',
      expiresOnDays: 92,
      notes: 'Consumo asociado a limpieza posterior a capacitación.',
    },
    {
      baseRef: 'CLEAN-900',
      days: -25,
      hour: 12,
      quantity: 6,
      engineerName: 'Eduardo D. Garcia',
      clientName: 'Centro Médico del Norte',
      equipmentSerial: '831060931',
      lotNumber: 'CL-811',
      expiresOnDays: 78,
      notes: 'Volumen elevado por lavado intensivo de cubetas.',
    },
    {
      baseRef: 'CLEAN-900',
      days: -16,
      hour: 10,
      quantity: 5,
      engineerName: 'Benjamín Falcon',
      clientName: 'Hospital del Pacífico Mazatlán',
      equipmentSerial: '831057945',
      lotNumber: 'CL-816',
      expiresOnDays: 69,
      notes: 'Reposición de solución limpiadora en módulo costero.',
    },
    {
      baseRef: 'CLEAN-900',
      days: -14,
      hour: 8,
      quantity: 8,
      engineerName: 'Almacén CDMX',
      clientName: 'Stock central consumibles técnicos',
      equipmentSerial: '',
      equipmentName: 'Stock de refacciones BA400',
      serviceType: 'inventario',
      status: 'almacen',
      lotNumber: 'CL-820',
      expiresOnDays: 105,
      notes: 'Reserva de consumibles para campañas de mantenimiento profundo.',
      metadata: { location_type: 'almacen', stock_location: 'Almacén CDMX' },
    },
    {
      baseRef: 'LAMP-BA400',
      days: -73,
      hour: 16,
      quantity: 1,
      engineerName: 'Martha Carbajal',
      clientName: 'Sanatorio del Valle Chihuahua',
      equipmentSerial: '831068188',
      lotNumber: 'L2410',
      notes: 'Cambio de lámpara en equipo con deriva de absorbancia.',
    },
    {
      baseRef: 'LAMP-BA400',
      days: -61,
      hour: 14,
      quantity: 1,
      engineerName: 'Ricardo Montañez',
      clientName: 'TORREON HOSP UNIVERSIDAD',
      equipmentSerial: '83105C1228',
      lotNumber: 'L2411',
      notes: 'Lámpara reemplazada durante correctivo óptico.',
    },
    {
      baseRef: 'LAMP-BA400',
      days: -4,
      hour: 9,
      quantity: 2,
      engineerName: 'Almacén Guadalajara',
      clientName: 'Stock regional Occidente',
      equipmentSerial: '',
      equipmentName: 'Stock de refacciones BA400',
      serviceType: 'inventario',
      status: 'almacen',
      lotNumber: 'L2504',
      notes: 'Existencia protegida para salidas críticas de óptica.',
      metadata: { location_type: 'almacen', stock_location: 'Almacén Guadalajara' },
    },
    {
      baseRef: 'LEVEL-SENSOR',
      days: -34,
      hour: 12,
      quantity: 2,
      engineerName: 'Francisco Salgado',
      clientName: 'Laboratorio Erlich',
      equipmentSerial: '834000262',
      lotNumber: 'LS783',
      expiresOnDays: 219,
      notes: 'Cambio de sensor por inestabilidad en lectura de nivel.',
    },
    {
      baseRef: 'LEVEL-SENSOR',
      days: -9,
      hour: 11,
      quantity: 1,
      engineerName: 'Eduardo D. Garcia',
      clientName: 'Centro Médico del Norte',
      equipmentSerial: '831060931',
      lotNumber: 'LS790',
      expiresOnDays: 208,
      notes: 'Seguimiento a comportamiento intermitente de sensor.',
    },
    {
      baseRef: 'LEVEL-SENSOR',
      days: -1,
      hour: 8,
      quantity: 3,
      engineerName: 'Almacén CDMX',
      clientName: 'Stock central sensores',
      equipmentSerial: '',
      equipmentName: 'Stock de refacciones BA400',
      serviceType: 'inventario',
      status: 'almacen',
      lotNumber: 'LS794',
      expiresOnDays: 246,
      notes: 'Lote nuevo de sensores listo para distribución nacional.',
      metadata: { location_type: 'almacen', stock_location: 'Almacén CDMX' },
    },
    {
      baseRef: 'AGT-MOTOR',
      days: -26,
      hour: 17,
      quantity: 1,
      engineerName: 'Benjamín Falcon',
      clientName: 'Hospital del Pacífico Mazatlán',
      equipmentSerial: '831057945',
      lotNumber: 'MT-2212',
      catalogMatched: false,
      notes: 'Motor agitador capturado manualmente en espera de homologación.',
    },
    {
      baseRef: 'REACTION-ROTOR',
      days: -88,
      hour: 10,
      quantity: 1,
      engineerName: 'Eduardo D. Garcia',
      clientName: 'Laboratorio Erlich',
      equipmentSerial: '834000262',
      lotNumber: 'RRCTRL07',
      expiresOnDays: 292,
      notes: 'Ajuste mayor de rotor registrado como evento patrimonial.',
    },
    {
      baseRef: 'REACTION-ROTOR',
      days: -18,
      hour: 15,
      quantity: 1,
      engineerName: 'Ricardo Montañez',
      clientName: 'TORREON HOSP UNIVERSIDAD',
      equipmentSerial: '83105C1228',
      lotNumber: 'RRCTRL15',
      expiresOnDays: 281,
      notes: 'Rotor sustituido tras hallazgo de desbalance en operación.',
    },
    {
      baseRef: 'SYR-500',
      days: -54,
      hour: 13,
      quantity: 2,
      engineerName: 'Ricardo Montañez',
      clientName: 'Centro Médico del Norte',
      equipmentSerial: '831060931',
      lotNumber: 'SY49811',
      expiresOnDays: 176,
      notes: 'Jeringa de dispensación usada en corrección volumétrica.',
    },
    {
      baseRef: 'SYR-500',
      days: -17,
      hour: 9,
      quantity: 3,
      engineerName: 'Benjamín Falcon',
      clientName: 'Hospital del Pacífico Mazatlán',
      equipmentSerial: '831057945',
      lotNumber: 'SY49884',
      expiresOnDays: 162,
      notes: 'Consumo concentrado por ajustes de dosificación.',
    },
  ];

  const synthetic = simulationEntries.flatMap((entry, index) => {
    const base = seedByReference.get(entry.baseRef);
    if (!base) {
      return [];
    }

    return [
      {
        ...base,
        id: `demo-sim-${index + 1}`,
        serviceReportId: `demo-sim-sr-${index + 1}`,
        quantity: entry.quantity ?? base.quantity,
        rawScan: `${entry.baseRef}-${entry.lotNumber || base.lotNumber || `SIM-${index + 1}`}`,
        lotNumber: entry.lotNumber || base.lotNumber,
        expiresOn:
          entry.expiresOnDays === undefined ? base.expiresOn : entry.expiresOnDays === null ? '' : isoDateFromNow(entry.expiresOnDays),
        catalogMatched: entry.catalogMatched ?? base.catalogMatched,
        scannedAt: isoDateTimeFromNow(entry.days, entry.hour),
        notes: entry.notes || base.notes,
        engineerName: entry.engineerName || base.engineerName,
        clientName: entry.clientName || base.clientName,
        equipmentSerial: entry.equipmentSerial ?? base.equipmentSerial,
        equipmentName: entry.equipmentName || base.equipmentName,
        serviceType: entry.serviceType || base.serviceType,
        status: entry.status || base.status,
        metadata: entry.metadata ?? base.metadata ?? {},
      } satisfies TraceabilityRecord,
    ];
  });

  return [...seeds, ...synthetic];
};

const TRACEABILITY_VISUAL_FLOOR = 42;

const enrichTraceabilityRecordsForPresentation = (baseRecords: TraceabilityRecord[]) => {
  if (baseRecords.length >= TRACEABILITY_VISUAL_FLOOR) {
    return {
      records: baseRecords,
      notice: '',
    };
  }

  const missing = TRACEABILITY_VISUAL_FLOOR - baseRecords.length;
  const supplement = buildDemoTraceabilityRecords()
    .slice(0, missing)
    .map((record, index) => ({
      ...record,
      id: `simblend-${index + 1}-${record.id}`,
      serviceReportId: `simblend-${index + 1}-${record.serviceReportId}`,
    }));

  return {
    records: [...baseRecords, ...supplement],
    notice:
      'Vista enriquecida con simulación operativa para mostrar patrones completos mientras crece el histórico real.',
  };
};

export default function Traceability() {
  const solarPanelRef = useRef<HTMLDivElement | null>(null);
  const [records, setRecords] = useState<TraceabilityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [source, setSource] = useState<TraceabilitySource>('structured');
  const [windowDays, setWindowDays] = useState<TraceabilityWindow>(90);
  const [kindFilter, setKindFilter] = useState<TraceabilityKind>('all');
  const [engineerFilter, setEngineerFilter] = useState('all');
  const [referenceQuery, setReferenceQuery] = useState('');
  const [unitQuery, setUnitQuery] = useState('');
  const [actorQuery, setActorQuery] = useState('');
  const [activeView, setActiveView] = useState<TraceabilityView>('streetStock');
  const [solarHover, setSolarHover] = useState<{ x: number; y: number; item: SolarFrontInsight } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchTraceability = async () => {
      setLoading(true);
      setError('');
      setNotice('');

      try {
        const { data, error: structuredError } = await supabase
          .from('service_report_materials')
          .select(
            `
              id,
              item_id,
              material_kind,
              quantity,
              product_name,
              raw_scan,
              scan_method,
              scan_format,
              gtin,
              reference_code,
              lot_number,
              expires_on,
              catalog_code,
              category_name,
              presentation,
              price_mxn,
              catalog_matched,
              scanned_at,
              notes,
              metadata,
              service_reports (
                id,
                created_at,
                service_date,
                call_date,
                engineer_name,
                client_name,
                equipment_serial,
                equipment_name,
                service_type,
                status,
                diagnostic_code,
                diagnostic_label
              )
            `,
          )
          .order('scanned_at', { ascending: false })
          .limit(4000);

        if (structuredError && !isMissingStructuredTable(structuredError)) {
          throw structuredError;
        }

        if (!structuredError && Array.isArray(data) && data.length > 0) {
          if (!cancelled) {
            const normalized = (data as ServiceReportMaterialRow[]).map(normalizeStructuredRecord);
            const enriched = enrichTraceabilityRecordsForPresentation(normalized);
            setRecords(enriched.records);
            setSource('structured');
            setNotice(enriched.notice);
            setLoading(false);
          }
          return;
        }

        const { data: fallbackReports, error: fallbackError } = await supabase
          .from('service_reports')
          .select(
            `
              id,
              created_at,
              service_date,
              call_date,
              engineer_name,
              client_name,
              equipment_serial,
              equipment_name,
              service_type,
              status,
              diagnostic_code,
              diagnostic_label,
              report_payload
            `,
          )
          .order('updated_at', { ascending: false })
          .limit(3000);

        if (fallbackError) {
          throw fallbackError;
        }

        const flattened = (fallbackReports as ServiceReportFallbackRow[]).flatMap((report) => {
          const materials = report.report_payload?.form?.materialsUsed;
          if (!Array.isArray(materials) || materials.length === 0) {
            return [];
          }

          return materials.map((item, index) => normalizePayloadRecord(report, item, index));
        });

        if (!cancelled) {
          if (flattened.length > 0) {
            const enriched = enrichTraceabilityRecordsForPresentation(flattened);
            setRecords(enriched.records);
            setSource('payload');
            setNotice(enriched.notice);
          } else {
            setRecords(buildDemoTraceabilityRecords());
            setSource('demo');
            setNotice('Mostrando una vista demo mientras se registran refacciones reales en reportes de servicio.');
          }
          setLoading(false);
        }
      } catch (fetchError) {
        if (!cancelled) {
          const details = getSupabaseErrorText(fetchError);
          setRecords(buildDemoTraceabilityRecords());
          setSource('demo');
          setNotice(
            details
              ? `Mostrando demo de refacciones porque la fuente real no respondió todavía: ${details}`
              : 'Mostrando demo de refacciones porque la fuente real todavía no está disponible.',
          );
          setError('');
          setLoading(false);
        }
      }
    };

    void fetchTraceability();

    return () => {
      cancelled = true;
    };
  }, []);

  const scopedRecords = useMemo(
    () => records.filter((record) => CURRENT_SCOPE_KINDS.includes(record.materialKind)),
    [records],
  );

  const engineerOptions = useMemo(() => {
    const values = Array.from(new Set(scopedRecords.map((record) => record.engineerName).filter(Boolean)));
    return values.sort((left, right) => left.localeCompare(right, 'es'));
  }, [scopedRecords]);

  const referenceOptions = useMemo(() => {
    const values = new Set<string>();
    scopedRecords.forEach((record) => {
      if (record.referenceCode) values.add(record.referenceCode);
      if (record.catalogCode) values.add(record.catalogCode);
      if (record.gtin) values.add(record.gtin);
      if (record.lotNumber) values.add(`Lote ${record.lotNumber}`);
      if (record.productName) values.add(record.productName);
    });
    return Array.from(values).sort((left, right) => left.localeCompare(right, 'es')).slice(0, 80);
  }, [scopedRecords]);

  const unitOptions = useMemo(() => {
    const values = new Set<string>();
    scopedRecords.forEach((record) => {
      if (record.clientName) values.add(record.clientName);
      if (record.equipmentSerial) values.add(record.equipmentSerial);
      if (record.equipmentName) values.add(record.equipmentName);
    });
    return Array.from(values).sort((left, right) => left.localeCompare(right, 'es')).slice(0, 80);
  }, [scopedRecords]);

  const actorOptions = useMemo(() => {
    const values = new Set<string>();
    scopedRecords.forEach((record) => {
      if (record.engineerName) values.add(record.engineerName);
    });
    return Array.from(values).sort((left, right) => left.localeCompare(right, 'es')).slice(0, 80);
  }, [scopedRecords]);

  const filteredRecords = useMemo(() => {
    const { start } = pulseDateRange(windowDays);
    const startTime = start.getTime();
    const referenceNeedle = normalizeText(referenceQuery);
    const unitNeedle = normalizeText(unitQuery);
    const actorNeedle = normalizeText(actorQuery);

    return scopedRecords.filter((record) => {
      const recordDateKey = materialDateKey(record);
      const recordTime = recordDateKey ? new Date(`${recordDateKey}T12:00:00`).getTime() : 0;
      if (!recordDateKey || recordTime < startTime) {
        return false;
      }

      if (kindFilter !== 'all' && record.materialKind !== kindFilter) {
        return false;
      }

      if (engineerFilter !== 'all' && record.engineerName !== engineerFilter) {
        return false;
      }

      if (
        referenceNeedle &&
        ![
          record.referenceCode,
          record.catalogCode,
          record.gtin,
          record.lotNumber,
          record.lotNumber ? `Lote ${record.lotNumber}` : '',
          record.rawScan,
          record.productName,
          record.categoryName,
        ].some((value) => normalizeText(value || '').includes(referenceNeedle))
      ) {
        return false;
      }

      if (
        unitNeedle &&
        ![record.clientName, record.equipmentSerial, record.equipmentName, record.serviceReportId].some((value) =>
          normalizeText(value || '').includes(unitNeedle),
        )
      ) {
        return false;
      }

      if (actorNeedle && !normalizeText(record.engineerName || '').includes(actorNeedle)) {
        return false;
      }

      return true;
    });
  }, [actorQuery, engineerFilter, kindFilter, referenceQuery, scopedRecords, unitQuery, windowDays]);

  const dailyBuckets = useMemo(() => createDailyBuckets(filteredRecords, windowDays), [filteredRecords, windowDays]);

  const totals = useMemo(() => {
    const totalQuantity = filteredRecords.reduce((sum, record) => sum + record.quantity, 0);
    const recognizedQuantity = filteredRecords.reduce((sum, record) => sum + (record.catalogMatched ? record.quantity : 0), 0);
    const uniqueRefs = new Set(filteredRecords.map((record) => record.referenceCode).filter(Boolean)).size;
    const uniqueLots = new Set(
      filteredRecords
        .map((record) => `${record.referenceCode}::${record.lotNumber}`)
        .filter((value) => !value.endsWith('::')),
    ).size;
    const estimatedValue = filteredRecords.reduce(
      (sum, record) => sum + ((record.priceMxn ?? 0) * record.quantity),
      0,
    );
    const expiringSoon = filteredRecords.filter((record) => {
      const remaining = daysUntil(record.expiresOn);
      return remaining !== null && remaining >= 0 && remaining <= 90;
    }).length;
    const expired = filteredRecords.filter((record) => {
      const remaining = daysUntil(record.expiresOn);
      return remaining !== null && remaining < 0;
    }).length;

    return {
      totalQuantity,
      recognizedQuantity,
      uniqueRefs,
      uniqueLots,
      estimatedValue,
      expiringSoon,
      expired,
      matchRate: totalQuantity > 0 ? recognizedQuantity / totalQuantity : 0,
    };
  }, [filteredRecords]);

  const streetStock = useMemo(() => {
    const grouped = new Map<
      string,
      {
        name: string;
        locationType: StockLocationType;
        quantity: number;
        value: number;
        refs: Set<string>;
        lots: Set<string>;
        matchedQuantity: number;
        scanCount: number;
        expiringSoon: number;
        expired: number;
        refTotals: Map<string, number>;
      }
    >();

    filteredRecords.forEach((record) => {
      const holder = resolveStockHolder(record);
      const key = `${holder.locationType}::${holder.name}`;
      const existing =
        grouped.get(key) ||
        {
          name: holder.name,
          locationType: holder.locationType,
          quantity: 0,
          value: 0,
          refs: new Set<string>(),
          lots: new Set<string>(),
          matchedQuantity: 0,
          scanCount: 0,
          expiringSoon: 0,
          expired: 0,
          refTotals: new Map<string, number>(),
        };

      const reference = record.referenceCode || record.productName || 'SIN REF';
      const remaining = daysUntil(record.expiresOn);
      existing.quantity += record.quantity;
      existing.value += (record.priceMxn ?? 0) * record.quantity;
      existing.scanCount += 1;
      existing.refs.add(reference);
      if (record.lotNumber) {
        existing.lots.add(record.lotNumber);
      }
      if (record.catalogMatched) {
        existing.matchedQuantity += record.quantity;
      }
      if (remaining !== null && remaining < 0) {
        existing.expired += 1;
      } else if (remaining !== null && remaining <= 90) {
        existing.expiringSoon += 1;
      }
      existing.refTotals.set(reference, (existing.refTotals.get(reference) || 0) + record.quantity);

      grouped.set(key, existing);
    });

    const totalQuantity = Math.max(0, totals.totalQuantity);
    const totalValue = Math.max(0, totals.estimatedValue);
    const holders = Array.from(grouped.entries())
      .map(([id, holder]) => {
        const topReference =
          Array.from(holder.refTotals.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] || 'SIN REF';

        return {
          id,
          name: holder.name,
          locationType: holder.locationType,
          quantity: holder.quantity,
          value: holder.value,
          uniqueRefs: holder.refs.size,
          uniqueLots: holder.lots.size,
          matchedQuantity: holder.matchedQuantity,
          scanCount: holder.scanCount,
          expiringSoon: holder.expiringSoon,
          expired: holder.expired,
          topReference,
          share: totalQuantity > 0 ? holder.quantity / totalQuantity : 0,
          valueShare: totalValue > 0 ? holder.value / totalValue : 0,
          matchRate: holder.quantity > 0 ? holder.matchedQuantity / holder.quantity : 0,
        } satisfies StreetStockHolder;
      })
      .sort((left, right) => {
        if (left.locationType !== right.locationType) {
          return left.locationType === 'warehouse' ? -1 : 1;
        }
        return right.value - left.value || right.quantity - left.quantity;
      });

    const warehouseHolders = holders.filter((holder) => holder.locationType === 'warehouse');
    const fieldHolders = holders.filter((holder) => holder.locationType === 'field');
    const warehouseQuantity = warehouseHolders.reduce((sum, holder) => sum + holder.quantity, 0);
    const warehouseValue = warehouseHolders.reduce((sum, holder) => sum + holder.value, 0);
    const fieldQuantity = fieldHolders.reduce((sum, holder) => sum + holder.quantity, 0);
    const fieldValue = fieldHolders.reduce((sum, holder) => sum + holder.value, 0);
    const topFieldHolder = fieldHolders[0] ?? null;

    return {
      holders,
      warehouseHolders,
      fieldHolders,
      warehouseQuantity,
      warehouseValue,
      fieldQuantity,
      fieldValue,
      fieldShare: totalQuantity > 0 ? fieldQuantity / totalQuantity : 0,
      warehouseShare: totalQuantity > 0 ? warehouseQuantity / totalQuantity : 0,
      topFieldHolder,
      maxHolderValue: Math.max(1, ...holders.map((holder) => holder.value)),
      maxHolderQuantity: Math.max(1, ...holders.map((holder) => holder.quantity)),
    };
  }, [filteredRecords, totals.estimatedValue, totals.totalQuantity]);

  const topReferences = useMemo<ReferenceInsight[]>(() => {
    const grouped = new Map<string, ReferenceInsight>();
    const sparklineBuckets = dailyBuckets.map((bucket) => bucket.isoDate);

    filteredRecords.forEach((record) => {
      const key = record.referenceCode || record.productName;
      const existing = grouped.get(key) || {
        referenceCode: record.referenceCode || 'SIN REF',
        productName: record.productName,
        totalQuantity: 0,
        scanCount: 0,
        uniqueLots: 0,
        clients: 0,
        engineers: 0,
        matchRate: 0,
        priceMxn: record.priceMxn,
        sparkline: sparklineBuckets.map(() => 0),
      };

      existing.totalQuantity += record.quantity;
      existing.scanCount += 1;
      existing.priceMxn = existing.priceMxn ?? record.priceMxn;
      const index = sparklineBuckets.indexOf(materialDateKey(record));
      if (index >= 0) {
        existing.sparkline[index] += record.quantity;
      }

      grouped.set(key, existing);
    });

    return Array.from(grouped.values())
      .map((item) => {
        const related = filteredRecords.filter((record) => (record.referenceCode || record.productName) === (item.referenceCode || item.productName));
        return {
          ...item,
          uniqueLots: new Set(related.map((record) => record.lotNumber).filter(Boolean)).size,
          clients: new Set(related.map((record) => record.clientName).filter(Boolean)).size,
          engineers: new Set(related.map((record) => record.engineerName).filter(Boolean)).size,
          matchRate: related.length > 0 ? related.filter((record) => record.catalogMatched).length / related.length : 0,
        };
      })
      .sort((left, right) => right.totalQuantity - left.totalQuantity)
      .slice(0, 6);
  }, [dailyBuckets, filteredRecords]);

  const engineerMatrix = useMemo(() => {
    const engineerRanking = Array.from(
      filteredRecords.reduce((map, record) => {
        map.set(record.engineerName, (map.get(record.engineerName) || 0) + record.quantity);
        return map;
      }, new Map<string, number>()),
    )
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([name]) => name);

    const refRanking = Array.from(
      filteredRecords.reduce((map, record) => {
        const key = record.referenceCode || record.productName;
        map.set(key, (map.get(key) || 0) + record.quantity);
        return map;
      }, new Map<string, number>()),
    )
      .sort((left, right) => right[1] - left[1])
      .slice(0, 7)
      .map(([value]) => value);

    const cells = engineerRanking.map((engineer) =>
      refRanking.map((ref) =>
        filteredRecords
          .filter((record) => record.engineerName === engineer && (record.referenceCode || record.productName) === ref)
          .reduce((sum, record) => sum + record.quantity, 0),
      ),
    );

    const maxCell = Math.max(1, ...cells.flat());

    return { engineerRanking, refRanking, cells, maxCell };
  }, [filteredRecords]);

  const expiryRecords = useMemo(() => {
    return filteredRecords
      .filter((record) => record.expiresOn)
      .map((record) => ({
        ...record,
        daysRemaining: daysUntil(record.expiresOn),
      }))
      .filter((record) => record.daysRemaining !== null)
      .sort((left, right) => (left.daysRemaining as number) - (right.daysRemaining as number))
      .slice(0, 14);
  }, [filteredRecords]);

  const kindBreakdown = useMemo(() => {
    const total = Math.max(1, totals.totalQuantity);
    return (KIND_OPTIONS.filter((option) => option !== 'all') as Array<Exclude<TraceabilityKind, 'all'>>)
      .map((kind) => {
        const quantity = filteredRecords
          .filter((record) => record.materialKind === kind)
          .reduce((sum, record) => sum + record.quantity, 0);

        return {
          kind,
          quantity,
          share: quantity / total,
        };
      })
      .filter((item) => item.quantity > 0)
      .sort((left, right) => right.quantity - left.quantity);
  }, [filteredRecords, totals.totalQuantity]);

  const scanMethodBreakdown = useMemo(() => {
    const buckets = filteredRecords.reduce(
      (accumulator, record) => {
        const method = classifyScanMethod(record.scanMethod);
        accumulator[method] += record.quantity;
        return accumulator;
      },
      { scanner: 0, imagen: 0, manual: 0 },
    );

    const total = Math.max(1, buckets.scanner + buckets.imagen + buckets.manual);

    return [
      { label: 'Scanner directo', key: 'scanner', quantity: buckets.scanner, share: buckets.scanner / total },
      { label: 'Imagen / adjunto', key: 'imagen', quantity: buckets.imagen, share: buckets.imagen / total },
      { label: 'Captura manual', key: 'manual', quantity: buckets.manual, share: buckets.manual / total },
    ];
  }, [filteredRecords]);

  const clientLeaders = useMemo(() => {
    return Array.from(
      filteredRecords.reduce((map, record) => {
        map.set(record.clientName, (map.get(record.clientName) || 0) + record.quantity);
        return map;
      }, new Map<string, number>()),
    )
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([name, quantity], index) => ({
        id: `${name}-${index}`,
        name,
        quantity,
        share: totals.totalQuantity > 0 ? quantity / totals.totalQuantity : 0,
      }));
  }, [filteredRecords, totals.totalQuantity]);

  const solarInsights = useMemo<SolarFrontInsight[]>(() => {
    const grouped = new Map<
      string,
      {
        unitName: string;
        productName: string;
        referenceCode: string;
        serial: string;
        quantity: number;
        estimatedValue: number;
        uniqueLots: Set<string>;
        uniqueRefs: Set<string>;
        scanCount: number;
        latestScan: string;
        engineers: Map<string, number>;
        kindTotals: Map<Exclude<TraceabilityKind, 'all'>, number>;
        expiredCount: number;
        expiringSoonCount: number;
        matchedQuantity: number;
      }
    >();

    filteredRecords.forEach((record) => {
      const key = [record.clientName || 'Sin unidad', record.equipmentSerial || 'SIN-SERIE', record.referenceCode || record.productName].join('::');
      const existing =
        grouped.get(key) ||
        {
          unitName: record.clientName || 'Unidad no especificada',
          productName: record.productName,
          referenceCode: record.referenceCode || 'SIN REF',
          serial: record.equipmentSerial || '',
          quantity: 0,
          estimatedValue: 0,
          uniqueLots: new Set<string>(),
          uniqueRefs: new Set<string>(),
          scanCount: 0,
          latestScan: '',
          engineers: new Map<string, number>(),
          kindTotals: new Map<Exclude<TraceabilityKind, 'all'>, number>(),
          expiredCount: 0,
          expiringSoonCount: 0,
          matchedQuantity: 0,
        };

      existing.quantity += record.quantity;
      existing.estimatedValue += (record.priceMxn ?? 0) * record.quantity;
      existing.scanCount += 1;
      existing.uniqueRefs.add(record.referenceCode || record.productName);
      if (record.lotNumber) {
        existing.uniqueLots.add(record.lotNumber);
      }
      if (!existing.latestScan || new Date(record.scannedAt).getTime() > new Date(existing.latestScan).getTime()) {
        existing.latestScan = record.scannedAt;
      }
      existing.engineers.set(record.engineerName, (existing.engineers.get(record.engineerName) || 0) + record.quantity);
      existing.kindTotals.set(record.materialKind, (existing.kindTotals.get(record.materialKind) || 0) + record.quantity);
      if (record.catalogMatched) {
        existing.matchedQuantity += record.quantity;
      }

      const remaining = daysUntil(record.expiresOn);
      if (remaining !== null && remaining < 0) {
        existing.expiredCount += 1;
      } else if (remaining !== null && remaining <= 90) {
        existing.expiringSoonCount += 1;
      }

      grouped.set(key, existing);
    });

    const rows = Array.from(grouped.entries()).map(([key, value], index) => {
      const dominantKind =
        Array.from(value.kindTotals.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] || 'otro';
      const leadEngineer =
        Array.from(value.engineers.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] || 'Sin asignar';

      return {
        id: key,
        unitName: value.unitName,
        unitCode: toUnitCode(value.unitName, value.serial, index),
        frontCode: value.serial ? `SER-${value.serial.slice(-6)}` : `FRENTE-${String(index + 1).padStart(2, '0')}`,
        productName: value.productName,
        referenceCode: value.referenceCode,
        dominantKind,
        quantity: value.quantity,
        estimatedValue: value.estimatedValue,
        uniqueLots: value.uniqueLots.size,
        uniqueRefs: value.uniqueRefs.size,
        scanCount: value.scanCount,
        coverageScore: 0,
        expiryScore: 0,
        riskTone: 'neutral' as SolarRiskTone,
        latestScan: value.latestScan,
        leadEngineer,
        expiredCount: value.expiredCount,
        expiringSoonCount: value.expiringSoonCount,
        matchedRatio: value.quantity > 0 ? value.matchedQuantity / value.quantity : 0,
        serial: value.serial,
      };
    });

    const maxQuantity = Math.max(1, ...rows.map((row) => row.quantity));
    const maxValue = Math.max(1, ...rows.map((row) => row.estimatedValue));
    const maxLots = Math.max(1, ...rows.map((row) => row.uniqueLots));

    return rows
      .map((row) => {
        const coverageScore = clamp(
          (row.quantity / maxQuantity) * 0.52 + (row.estimatedValue / maxValue) * 0.18 + (row.uniqueLots / maxLots) * 0.12 + row.matchedRatio * 0.18,
          0.18,
          1,
        );

        const totalExpirySignals = row.expiredCount + row.expiringSoonCount;
        const expiryScore =
          totalExpirySignals === 0
            ? 0.92
            : clamp(1 - (row.expiredCount * 1 + row.expiringSoonCount * 0.38) / Math.max(row.scanCount, 1), 0.08, 0.95);

        const riskTone: SolarRiskTone =
          row.expiredCount > 0 ? 'critical' : row.expiringSoonCount > 0 ? 'warning' : row.latestScan ? 'healthy' : 'neutral';

        return {
          ...row,
          coverageScore,
          expiryScore,
          riskTone,
        };
      })
      .sort((left, right) => right.estimatedValue - left.estimatedValue || right.quantity - left.quantity)
      .slice(0, 24);
  }, [filteredRecords]);

  const solarAverageCoverage = useMemo(() => average(solarInsights.map((item) => item.coverageScore)), [solarInsights]);
  const solarHoverItem = solarHover?.item ?? solarInsights[0] ?? null;

  const signalRings = useMemo<SignalRing[]>(() => {
    const manualShare = scanMethodBreakdown.find((item) => item.key === 'manual')?.share ?? 0;
    const freshnessScore = filteredRecords.length > 0 ? 1 - clamp((totals.expiringSoon + totals.expired) / filteredRecords.length, 0, 1) : 0;
    const automationScore = 1 - manualShare;

    return [
      {
        label: 'Integridad catálogo',
        value: totals.matchRate,
        tone: '#f4f6fb',
        hint: `${pctFormatter.format(totals.matchRate)} reconocible por REF/GTIN`,
      },
      {
        label: 'Persistencia de lote',
        value: filteredRecords.length > 0 ? clamp(totals.uniqueLots / Math.max(filteredRecords.length, 1), 0, 1) : 0,
        tone: '#c0c0c0',
        hint: `${totals.uniqueLots} lotes únicos observados`,
      },
      {
        label: 'Disciplina de captura',
        value: automationScore,
        tone: '#ba000d',
        hint: `${pctFormatter.format(automationScore)} no depende de captura manual`,
      },
      {
        label: 'Salud de vigencia',
        value: freshnessScore,
        tone: '#8f0b14',
        hint: `${totals.expired + totals.expiringSoon} lote(s) en ventana sensible`,
      },
    ];
  }, [filteredRecords.length, scanMethodBreakdown, totals.expired, totals.expiringSoon, totals.matchRate, totals.uniqueLots]);

  const telemetryScore = useMemo(() => {
    if (filteredRecords.length === 0) {
      return 0;
    }

    const manualShare = scanMethodBreakdown.find((item) => item.key === 'manual')?.share ?? 0;
    const expiryPenalty = clamp((totals.expiringSoon * 0.4 + totals.expired) / filteredRecords.length, 0, 1);
    const score = (totals.matchRate * 0.45 + (1 - manualShare) * 0.25 + (1 - expiryPenalty) * 0.3) * 100;
    return Math.round(clamp(score, 0, 99));
  }, [filteredRecords.length, scanMethodBreakdown, totals.expired, totals.expiringSoon, totals.matchRate]);

  const alerts = useMemo<SignalAlert[]>(() => {
    const next: SignalAlert[] = [];
    const manualShare = scanMethodBreakdown.find((item) => item.key === 'manual')?.share ?? 0;
    const uncatalogued = filteredRecords.filter((record) => !record.catalogMatched).length;
    const dominantRef = topReferences[0];
    const hottestClient = clientLeaders[0];

    if (totals.expired > 0) {
      next.push({
        id: 'expired',
        tone: 'critical',
        title: 'Lotes vencidos detectados',
        body: `${totals.expired} lectura(s) ya superaron la vigencia registrada. Conviene validar existencia física, lote y destino de la pieza.`,
      });
    }

    if (totals.expiringSoon > 0) {
      next.push({
        id: 'expiring',
        tone: 'warning',
        title: 'Ventana de vencimiento activa',
        body: `${totals.expiringSoon} lectura(s) vencerán en los próximos 90 días. Esta señal ya puede anticipar rotación o desperdicio.`,
      });
    }

    if (uncatalogued > 0) {
      next.push({
        id: 'uncatalogued',
        tone: 'warning',
        title: 'Refacción sin match de catálogo',
        body: `${uncatalogued} evento(s) no pudieron consolidarse con REF o catálogo. Si esto crece, se rompe el valor analítico del módulo.`,
      });
    }

    if (manualShare > 0.35) {
      next.push({
        id: 'manual',
        tone: 'info',
        title: 'Dependencia manual elevada',
        body: `${pctFormatter.format(manualShare)} del volumen activo entró por captura manual. Conviene empujar más uso de escáner para fortalecer trazabilidad.`,
      });
    }

    if (dominantRef) {
      next.push({
        id: 'dominant-ref',
        tone: 'info',
        title: 'Referencia dominante del periodo',
        body: `${dominantRef.referenceCode || dominantRef.productName} concentra ${dominantRef.totalQuantity} unidades y marca la principal corriente operativa del horizonte activo.`,
      });
    }

    if (hottestClient) {
      next.push({
        id: 'hottest-client',
        tone: 'info',
        title: 'Cliente con mayor densidad',
        body: `${hottestClient.name} concentra ${pctFormatter.format(hottestClient.share)} del movimiento visible. Puede servir para priorizar abasto y seguimiento.`,
      });
    }

    if (source === 'payload') {
      next.push({
        id: 'payload-source',
        tone: 'info',
        title: 'Fuente temporal reconstruida',
        body: 'La vista está leyendo refacciones desde report_payload. Funciona, pero el mayor valor llega cuando todo cae ya en tabla estructurada.',
      });
    }

    if (source === 'demo') {
      next.push({
        id: 'demo-source',
        tone: 'info',
        title: 'Vista de demostración activa',
        body: 'Los valores mostrados son sintéticos y simulan trazabilidad de refacciones; sólo sirven para validar la experiencia visual, no para decisiones operativas.',
      });
    }

    return next.slice(0, 6);
  }, [clientLeaders, filteredRecords, scanMethodBreakdown, source, topReferences, totals.expired, totals.expiringSoon]);

  const viewDialId = useId().replace(/:/g, '');
  const activeViewMeta = VISUALIZATION_OPTIONS.find((option) => option.key === activeView) ?? VISUALIZATION_OPTIONS[0];
  const viewSegments = useMemo(() => {
    const activeIndex = VISUALIZATION_OPTIONS.findIndex((option) => option.key === activeView);
    const step = 360 / VISUALIZATION_OPTIONS.length;
    const gap = 1.8;

    return VISUALIZATION_OPTIONS.map((option, index) => {
      const isActive = index === activeIndex;
      const centerAngle = index * step;
      const startAngle = centerAngle - step / 2 + gap / 2;
      const endAngle = centerAngle + step / 2 - gap / 2;
      const outerRadius = TRACEABILITY_VIEW_SEGMENT_OUTER_RADIUS;
      const innerRadius = TRACEABILITY_VIEW_SEGMENT_INNER_RADIUS;
      const slotOuterRadius = outerRadius - 10;
      const slotInnerRadius = outerRadius - 24;
      const labelPoint = polarPoint(
        TRACEABILITY_VIEW_DIAL_CENTER,
        TRACEABILITY_VIEW_DIAL_CENTER,
        (outerRadius + innerRadius) / 2 - 2,
        centerAngle,
      );
      const labelRotation = centerAngle > 90 && centerAngle < 270 ? centerAngle + 180 : centerAngle;
      const labelFontSize =
        option.shortLabel.length >= 8 ? 8.6 : option.shortLabel.length >= 6 ? 9.1 : 9.8;

      return {
        ...option,
        centerAngle,
        isActive,
        segmentPath: describeRingSegment(
          TRACEABILITY_VIEW_DIAL_CENTER,
          TRACEABILITY_VIEW_DIAL_CENTER,
          innerRadius,
          outerRadius,
          startAngle,
          endAngle,
        ),
        slotPath: describeRingSegment(
          TRACEABILITY_VIEW_DIAL_CENTER,
          TRACEABILITY_VIEW_DIAL_CENTER,
          slotInnerRadius,
          slotOuterRadius,
          startAngle + 4.2,
          endAngle - 4.2,
        ),
        labelX: labelPoint.x,
        labelY: labelPoint.y,
        labelRotation,
        labelFontSize,
      };
    });
  }, [activeView]);
  const activeViewSegment = viewSegments.find((segment) => segment.key === activeView) ?? viewSegments[0];
  const viewSegmentDividers = useMemo(() => {
    const step = 360 / VISUALIZATION_OPTIONS.length;

    return VISUALIZATION_OPTIONS.map((_, index) => {
      const angle = index * step - step / 2;
      const outer = polarPoint(
        TRACEABILITY_VIEW_DIAL_CENTER,
        TRACEABILITY_VIEW_DIAL_CENTER,
        TRACEABILITY_VIEW_SEGMENT_OUTER_RADIUS + 6,
        angle,
      );
      const inner = polarPoint(
        TRACEABILITY_VIEW_DIAL_CENTER,
        TRACEABILITY_VIEW_DIAL_CENTER,
        TRACEABILITY_VIEW_SEGMENT_INNER_RADIUS - 8,
        angle,
      );

      return `M ${outer.x.toFixed(2)} ${outer.y.toFixed(2)} L ${inner.x.toFixed(2)} ${inner.y.toFixed(2)}`;
    });
  }, []);
  const viewHubSpokes = useMemo(
    () =>
      Array.from({ length: 6 }, (_, index) =>
        describeRingSegment(
          TRACEABILITY_VIEW_DIAL_CENTER,
          TRACEABILITY_VIEW_DIAL_CENTER,
          34,
          58,
          index * 60 - 15,
          index * 60 + 15,
        ),
      ),
    [],
  );
  const activeInputCount = [referenceQuery, unitQuery, actorQuery].filter((value) => value.trim()).length;
  const resetTraceabilityInputs = () => {
    setReferenceQuery('');
    setUnitQuery('');
    setActorQuery('');
    setEngineerFilter('all');
  };

  const streamMetrics = useMemo(() => {
    const maxTotal = Math.max(1, ...dailyBuckets.map((bucket) => bucket.total));
    const order = KIND_OPTIONS.filter((option) => option !== 'all') as Array<Exclude<TraceabilityKind, 'all'>>;
    const width = 960;
    const height = 300;
    const paddingX = 32;
    const chartHeight = 196;
    const baselineY = 232;
    const step = dailyBuckets.length > 1 ? (width - paddingX * 2) / (dailyBuckets.length - 1) : 0;
    const stackedBase = dailyBuckets.map(() => 0);

    const layers = order.map((kind) => {
      const topPoints = dailyBuckets.map((bucket, index) => {
        stackedBase[index] += bucket.byKind[kind];
        return {
          x: paddingX + step * index,
          y: baselineY - (stackedBase[index] / maxTotal) * chartHeight,
        };
      });

      const runningBottom = topPoints.map((point, index) => ({
        x: point.x,
        y: baselineY - ((stackedBase[index] - dailyBuckets[index].byKind[kind]) / maxTotal) * chartHeight,
      }));

      return {
        kind,
        color: KIND_COLORS[kind],
        areaPath: buildAreaPath(topPoints, runningBottom),
      };
    });

    const totalPoints = dailyBuckets.map((bucket, index) => ({
      x: paddingX + step * index,
      y: baselineY - (bucket.total / maxTotal) * chartHeight,
    }));

    const matchedPoints = dailyBuckets.map((bucket, index) => ({
      x: paddingX + step * index,
      y: baselineY - (bucket.matched / maxTotal) * chartHeight,
    }));

    return {
      width,
      height,
      layers,
      totalPath: buildSmoothLinePath(totalPoints),
      matchedPath: buildSmoothLinePath(matchedPoints),
      ticks: dailyBuckets.filter((_, index) => {
        const stepSize = dailyBuckets.length > 12 ? Math.ceil(dailyBuckets.length / 6) : 2;
        return index === 0 || index === dailyBuckets.length - 1 || index % stepSize === 0;
      }),
    };
  }, [dailyBuckets]);

  const handleSolarHover = (event: ReactMouseEvent<SVGGElement>, item: SolarFrontInsight) => {
    const rect = solarPanelRef.current?.getBoundingClientRect();
    if (!rect) {
      setSolarHover({ x: 0, y: 0, item });
      return;
    }

    setSolarHover({
      x: clamp(event.clientX - rect.left, 140, rect.width - 140),
      y: clamp(event.clientY - rect.top, 110, rect.height - 110),
      item,
    });
  };

  const clearSolarHover = () => {
    setSolarHover(null);
  };

  if (loading) {
    return <div className="traceability-loading">Construyendo capa de trazabilidad operativa…</div>;
  }

  if (error) {
    return <div className="traceability-error">No fue posible cargar trazabilidad: {error}</div>;
  }

  if (scopedRecords.length === 0) {
    return (
      <section className="traceability-shell">
        <div className="traceability-loading">
          Todavía no hay lecturas de refacciones o consumibles técnicos para construir trazabilidad. En cuanto se
          registren piezas desde reportes de servicio, este tablero empezará a mostrar uso, lotes, vigencias y
          patrones de uso por unidad médica.
        </div>
      </section>
    );
  }

  return (
    <section className="traceability-shell">
      <section className="traceability-source-strip">
        <div className="traceability-source-card">
          <span className={`traceability-source-badge ${source}`}>
            {source === 'structured' ? 'Canal estructurado' : source === 'payload' ? 'Reconstrucción payload' : 'Vista demo'}
          </span>

          <div className="traceability-source-card__value">
            <strong>{compactFormatter.format(scopedRecords.length)}</strong>
            <span>eventos de refacciones</span>
          </div>

          <div className="traceability-source-card__meta">
            <div>
              <label>Score Orion</label>
              <b>{telemetryScore}</b>
            </div>
            <div>
              <label>Ventana activa</label>
              <b>{windowDays} d</b>
            </div>
            <div>
              <label>Integridad</label>
              <b>{pctFormatter.format(totals.matchRate)}</b>
            </div>
          </div>
        </div>
      </section>

      {notice ? (
        <div className={`traceability-notice ${source === 'demo' ? 'demo' : ''}`}>
          {notice}
        </div>
      ) : null}

      <section className="traceability-control-console">
        <div className="traceability-query-grid">
          <label className="traceability-query-module">
            <span>Refacción, lote o GTIN</span>
            <input
              className="input-field"
              list="traceability-reference-options"
              value={referenceQuery}
              onChange={(event) => setReferenceQuery(event.target.value)}
              placeholder="Ej. WTR-FLT, LAMP-BA400, lote WF49369"
            />
          </label>

          <label className="traceability-query-module">
            <span>Unidad, cliente o serie</span>
            <input
              className="input-field"
              list="traceability-unit-options"
              value={unitQuery}
              onChange={(event) => setUnitQuery(event.target.value)}
              placeholder="Ej. ERLICH, 831060931, BA400"
            />
          </label>

          <label className="traceability-query-module">
            <span>Ingeniero / químico</span>
            <input
              className="input-field"
              list="traceability-actor-options"
              value={actorQuery}
              onChange={(event) => setActorQuery(event.target.value)}
              placeholder="Responsable que capturó o usó la pieza"
            />
          </label>

          <datalist id="traceability-reference-options">
            {referenceOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <datalist id="traceability-unit-options">
            {unitOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <datalist id="traceability-actor-options">
            {actorOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>

        <div className="traceability-view-selector">
          <div className="traceability-view-orb" aria-label="Selector de visualizaciones de trazabilidad">
            <svg
              className="traceability-view-orb__svg"
              viewBox={`0 0 ${TRACEABILITY_VIEW_DIAL_SIZE} ${TRACEABILITY_VIEW_DIAL_SIZE}`}
              aria-hidden="true"
            >
              <defs>
                <radialGradient id={`${viewDialId}-plateGlow`} cx="50%" cy="50%" r="64%">
                  <stop offset="0%" stopColor="var(--trace-rotor-plate-start)" />
                  <stop offset="58%" stopColor="var(--trace-rotor-plate-end)" />
                  <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                </radialGradient>
                <radialGradient id={`${viewDialId}-centerGlow`} cx="50%" cy="50%" r="62%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
                  <stop offset="38%" stopColor="var(--trace-rotor-center-glow)" />
                  <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                </radialGradient>
                <linearGradient id={`${viewDialId}-segmentBase`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--trace-rotor-segment-start)" />
                  <stop offset="54%" stopColor="var(--trace-rotor-segment-mid)" />
                  <stop offset="100%" stopColor="var(--trace-rotor-segment-end)" />
                </linearGradient>
                <linearGradient id={`${viewDialId}-segmentInset`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--trace-rotor-slot-start)" />
                  <stop offset="100%" stopColor="var(--trace-rotor-slot-end)" />
                </linearGradient>
                <linearGradient id={`${viewDialId}-segmentActive`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--trace-rotor-segment-active-start)" />
                  <stop offset="48%" stopColor="var(--trace-rotor-segment-active-mid)" />
                  <stop offset="100%" stopColor="var(--trace-rotor-segment-active-end)" />
                </linearGradient>
                <linearGradient id={`${viewDialId}-segmentActiveInset`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--trace-rotor-slot-active-start)" />
                  <stop offset="100%" stopColor="var(--trace-rotor-slot-active-end)" />
                </linearGradient>
                <linearGradient id={`${viewDialId}-hubShell`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--trace-rotor-hub-start)" />
                  <stop offset="54%" stopColor="var(--trace-rotor-hub-mid)" />
                  <stop offset="100%" stopColor="var(--trace-rotor-hub-end)" />
                </linearGradient>
                <linearGradient id={`${viewDialId}-hubCore`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--trace-rotor-core-start)" />
                  <stop offset="100%" stopColor="var(--trace-rotor-core-end)" />
                </linearGradient>
              </defs>

              <circle
                className="traceability-view-ring traceability-view-ring--plate"
                cx={TRACEABILITY_VIEW_DIAL_CENTER}
                cy={TRACEABILITY_VIEW_DIAL_CENTER}
                r={TRACEABILITY_VIEW_DIAL_OUTER_RADIUS + 9}
                fill={`url(#${viewDialId}-plateGlow)`}
              />

              <circle
                className="traceability-view-ring traceability-view-ring--outer"
                cx={TRACEABILITY_VIEW_DIAL_CENTER}
                cy={TRACEABILITY_VIEW_DIAL_CENTER}
                r={TRACEABILITY_VIEW_DIAL_OUTER_RADIUS + 4}
              />
              <circle
                className="traceability-view-ring traceability-view-ring--mid"
                cx={TRACEABILITY_VIEW_DIAL_CENTER}
                cy={TRACEABILITY_VIEW_DIAL_CENTER}
                r={TRACEABILITY_VIEW_DIAL_INNER_RADIUS - 14}
              />
              <circle
                className="traceability-view-ring traceability-view-ring--inner"
                cx={TRACEABILITY_VIEW_DIAL_CENTER}
                cy={TRACEABILITY_VIEW_DIAL_CENTER}
                r={58}
              />
              <path
                className="traceability-view-ring traceability-view-ring--accent"
                d={describeRingSegment(
                  TRACEABILITY_VIEW_DIAL_CENTER,
                  TRACEABILITY_VIEW_DIAL_CENTER,
                  76,
                  82,
                  activeViewSegment.centerAngle - 18,
                  activeViewSegment.centerAngle + 18,
                )}
              />
              <circle
                className="traceability-view-grid-ring"
                cx={TRACEABILITY_VIEW_DIAL_CENTER}
                cy={TRACEABILITY_VIEW_DIAL_CENTER}
                r={72}
              />
              {viewSegmentDividers.map((dividerPath, index) => (
                <path key={`divider-${index}`} className="traceability-view-divider" d={dividerPath} />
              ))}

              {viewSegments.map((segment) => {
                const isActive = activeView === segment.key;

                return (
                  <g
                    key={segment.key}
                    className={`traceability-view-segment ${isActive ? 'active' : ''}`}
                    onClick={() => setActiveView(segment.key)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setActiveView(segment.key);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={segment.label}
                    aria-pressed={isActive}
                  >
                    <path className="traceability-view-segment__hit" d={segment.segmentPath} />
                    <path
                      className="traceability-view-segment__path"
                      d={segment.segmentPath}
                      style={{ fill: `url(#${viewDialId}-${isActive ? 'segmentActive' : 'segmentBase'})` } as CSSProperties}
                    />
                    <path
                      className="traceability-view-segment__slot"
                      d={segment.slotPath}
                      style={{ fill: `url(#${viewDialId}-${isActive ? 'segmentActiveInset' : 'segmentInset'})` } as CSSProperties}
                    />
                    <text
                      className="traceability-view-segment__label"
                      x={segment.labelX}
                      y={segment.labelY}
                      transform={`rotate(${segment.labelRotation} ${segment.labelX} ${segment.labelY})`}
                      style={{ fontSize: `${segment.labelFontSize}px` } as CSSProperties}
                    >
                      {segment.shortLabel.toUpperCase()}
                    </text>
                  </g>
                );
              })}

              <circle
                className="traceability-view-center traceability-view-center--glow"
                cx={TRACEABILITY_VIEW_DIAL_CENTER}
                cy={TRACEABILITY_VIEW_DIAL_CENTER}
                r={70}
                fill={`url(#${viewDialId}-centerGlow)`}
              />
              {viewHubSpokes.map((spokePath, index) => (
                <path key={`hub-spoke-${index}`} className="traceability-view-hub-spoke" d={spokePath} />
              ))}
              <circle
                className="traceability-view-center traceability-view-center--shell"
                cx={TRACEABILITY_VIEW_DIAL_CENTER}
                cy={TRACEABILITY_VIEW_DIAL_CENTER}
                r={50}
                fill={`url(#${viewDialId}-hubShell)`}
              />
              <circle
                className="traceability-view-center traceability-view-center--core"
                cx={TRACEABILITY_VIEW_DIAL_CENTER}
                cy={TRACEABILITY_VIEW_DIAL_CENTER}
                r={24}
                fill={`url(#${viewDialId}-hubCore)`}
              />
              <circle
                className="traceability-view-center traceability-view-center--axle"
                cx={TRACEABILITY_VIEW_DIAL_CENTER}
                cy={TRACEABILITY_VIEW_DIAL_CENTER}
                r={7.5}
              />
              <text
                className="traceability-view-center__icon"
                x={TRACEABILITY_VIEW_DIAL_CENTER}
                y={TRACEABILITY_VIEW_DIAL_CENTER - 2}
              >
                ✓
              </text>
              <text
                className="traceability-view-center__title"
                x={TRACEABILITY_VIEW_DIAL_CENTER}
                y={TRACEABILITY_VIEW_DIAL_CENTER + 34}
              >
                {activeViewMeta.shortLabel.toUpperCase()}
              </text>
              <text
                className="traceability-view-center__meta"
                x={TRACEABILITY_VIEW_DIAL_CENTER}
                y={TRACEABILITY_VIEW_DIAL_CENTER + 50}
              >
                {compactFormatter.format(filteredRecords.length)} EVENTO(S)
              </text>
            </svg>
          </div>

          <div className="traceability-view-readout">
            <span>Visualización seleccionada</span>
            <strong>{activeViewMeta.label}</strong>
            <p>{activeViewMeta.description}</p>
            <button type="button" className="button-primary inactive chip" onClick={resetTraceabilityInputs}>
              Limpiar filtros de búsqueda
            </button>
          </div>
        </div>

        <aside className="traceability-query-readout">
          <span>Contexto filtrado</span>
          <strong>{activeInputCount > 0 ? `${activeInputCount} filtro(s) directo(s)` : 'Sin búsqueda directa'}</strong>
          <p>
            {filteredRecords.length === 0
              ? 'No hay eventos con la combinación actual. Ajusta REF, unidad o responsable para recuperar trazabilidad.'
              : `${compactFormatter.format(filteredRecords.length)} evento(s), ${totals.uniqueRefs} referencia(s), ${totals.uniqueLots} lote(s) y ${mxnFormatter.format(totals.estimatedValue)} de valor referencial.`}
          </p>
        </aside>
      </section>

      <article className={`traceability-panel traceability-panel--wide traceability-panel--street-stock traceability-view-block ${activeView === 'streetStock' ? 'is-active' : ''}`}>
        <div className="traceability-panel__header">
          <div>
            <span className="traceability-panel__eyebrow">Stock trazado</span>
            <h3>Refacciones en almacén y en calle</h3>
          </div>
          <p>
            Distribuye las piezas visibles entre stock de almacén y responsables de campo. El valor se calcula con el
            precio capturado por refacción, por lo que sirve para detectar carga económica por ingeniero.
          </p>
        </div>

        <div className="traceability-stock-grid">
          <div className="traceability-stock-overview">
            <span className="traceability-stock-overview__eyebrow">Distribución visible</span>
            <div
              className="traceability-stock-orb"
              style={
                {
                  '--field-share': `${streetStock.fieldShare * 100}%`,
                  '--warehouse-share': `${streetStock.warehouseShare * 100}%`,
                } as CSSProperties
              }
            >
              <div className="traceability-stock-orb__core">
                <span>En calle</span>
                <strong>{compactFormatter.format(streetStock.fieldQuantity)}</strong>
                <small>{mxnFormatter.format(streetStock.fieldValue)}</small>
              </div>
            </div>

            <div className="traceability-stock-balance">
              <article className="traceability-stock-balance__item traceability-stock-balance__item--field">
                <span>Campo</span>
                <strong>{pctFormatter.format(streetStock.fieldShare)}</strong>
              </article>
              <article className="traceability-stock-balance__item traceability-stock-balance__item--warehouse">
                <span>Almacén</span>
                <strong>{pctFormatter.format(streetStock.warehouseShare)}</strong>
              </article>
              <article className="traceability-stock-balance__item">
                <span>Responsables</span>
                <strong>{streetStock.fieldHolders.length}</strong>
              </article>
            </div>
          </div>

          <div className="traceability-stock-content">
            <div className="traceability-stock-summary">
              <article>
                <span>Total trazado</span>
                <strong>{compactFormatter.format(totals.totalQuantity)}</strong>
                <small>{mxnFormatter.format(totals.estimatedValue)}</small>
              </article>
              <article>
                <span>En almacén</span>
                <strong>{compactFormatter.format(streetStock.warehouseQuantity)}</strong>
                <small>{mxnFormatter.format(streetStock.warehouseValue)}</small>
              </article>
              <article>
                <span>Responsable dominante</span>
                <strong>{streetStock.topFieldHolder ? streetStock.topFieldHolder.name : 'Sin clasificar'}</strong>
                <small>
                  {streetStock.topFieldHolder
                    ? mxnFormatter.format(streetStock.topFieldHolder.value)
                    : 'Sin responsables clasificados'}
                </small>
              </article>
            </div>

            <div className="traceability-stock-ledger">
              <div className="traceability-stock-ledger__section">
                <span>Almacén</span>
                {streetStock.warehouseHolders.length === 0 ? (
                  <div className="traceability-stock-empty">
                    No hay registros clasificados como almacén. Cuando una lectura venga con ubicación almacén, bodega o
                    inventario, aparecerá aquí automáticamente.
                  </div>
                ) : (
                  streetStock.warehouseHolders.map((holder) => (
                    <article key={holder.id} className="traceability-stock-holder traceability-stock-holder--warehouse">
                      <div className="traceability-stock-holder__head">
                        <strong>{holder.name}</strong>
                        <span>{compactFormatter.format(holder.quantity)} pza(s)</span>
                      </div>
                      <div className="traceability-stock-holder__bar">
                        <div style={{ width: `${Math.max((holder.value / streetStock.maxHolderValue) * 100, 6)}%` }} />
                      </div>
                      <div className="traceability-stock-holder__meta">
                        <span>{mxnFormatter.format(holder.value)}</span>
                        <span>{holder.uniqueRefs} REF</span>
                        <span>{holder.uniqueLots} lote(s)</span>
                        <span>{holder.topReference}</span>
                      </div>
                    </article>
                  ))
                )}
              </div>

              <div className="traceability-stock-ledger__section">
                <span>Ingenieros / campo</span>
                {streetStock.fieldHolders.length === 0 ? (
                  <div className="traceability-stock-empty">No hay piezas trazadas con responsable de campo.</div>
                ) : (
                  streetStock.fieldHolders.map((holder) => (
                    <article key={holder.id} className="traceability-stock-holder traceability-stock-holder--field">
                      <div className="traceability-stock-holder__head">
                        <strong>{holder.name}</strong>
                        <span>{compactFormatter.format(holder.quantity)} pza(s)</span>
                      </div>
                      <div className="traceability-stock-holder__bar">
                        <div style={{ width: `${Math.max((holder.value / streetStock.maxHolderValue) * 100, 6)}%` }} />
                      </div>
                      <div className="traceability-stock-holder__meta">
                        <span>{mxnFormatter.format(holder.value)}</span>
                        <span>{holder.uniqueRefs} REF</span>
                        <span>{pctFormatter.format(holder.matchRate)} catalogado</span>
                        <span>{holder.topReference}</span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </article>

      <article className={`traceability-panel traceability-panel--wide traceability-panel--solar traceability-view-block ${activeView === 'solar' ? 'is-active' : ''}`}>
        <div className="traceability-panel__header">
          <div>
            <span className="traceability-panel__eyebrow">Vista holística</span>
            <h3>Solar de unidades y refacciones activas</h3>
          </div>
          <p>
            Cada rayo representa una refacción activa dentro de una unidad médica. El largo resume cobertura relativa,
            el color identifica el tipo de pieza y el halo exterior revela vigencia o riesgo del lote sin abrir tablas.
          </p>
        </div>

        <div className="traceability-solar-layout">
          <div className="traceability-solar-visual" ref={solarPanelRef} onMouseLeave={clearSolarHover}>
            <svg viewBox="0 0 620 620" className="traceability-solar-svg" aria-hidden="true">
              <defs>
                <radialGradient id="traceability-solar-center" cx="50%" cy="50%" r="60%">
                  <stop offset="0%" stopColor="rgba(244, 246, 251, 0.32)" />
                  <stop offset="52%" stopColor="rgba(186, 0, 13, 0.18)" />
                  <stop offset="100%" stopColor="rgba(186, 0, 13, 0)" />
                </radialGradient>
              </defs>

              {[88, 122, 156, 190, 224, 258].map((radius) => (
                <circle key={radius} cx="310" cy="310" r={radius} className="traceability-solar-grid" />
              ))}

              {solarInsights.map((item, index) => {
                const angle = -90 + (360 / Math.max(solarInsights.length, 1)) * index;
                const innerRadius = 126;
                const outerRadius = innerRadius + 68 + item.coverageScore * 118;
                const haloRadius = outerRadius + 26 + item.expiryScore * 12;
                const x1 = polarToCartesian(310, 310, innerRadius, angle).x;
                const y1 = polarToCartesian(310, 310, innerRadius, angle).y;
                const x2 = polarToCartesian(310, 310, outerRadius, angle).x;
                const y2 = polarToCartesian(310, 310, outerRadius, angle).y;
                const x3 = polarToCartesian(310, 310, haloRadius, angle).x;
                const y3 = polarToCartesian(310, 310, haloRadius, angle).y;
                const labelRadius = haloRadius + 18;
                const labelPoint = polarToCartesian(310, 310, labelRadius, angle);
                const isActive = solarHover?.item.id === item.id || (!solarHover && solarHoverItem?.id === item.id);
                const glowClass =
                  item.riskTone === 'critical'
                    ? 'traceability-solar-ray-glow--critical'
                    : item.riskTone === 'warning'
                      ? 'traceability-solar-ray-glow--warning'
                      : item.riskTone === 'healthy'
                        ? 'traceability-solar-ray-glow--healthy'
                        : 'traceability-solar-ray-glow--neutral';

                return (
                  <g
                    key={item.id}
                    className={`traceability-solar-ray-group ${isActive ? 'active' : ''}`}
                    onMouseEnter={(event) => handleSolarHover(event, item)}
                    onMouseMove={(event) => handleSolarHover(event, item)}
                    onClick={(event) => handleSolarHover(event, item)}
                  >
                    <line x1={x1} y1={y1} x2={x2} y2={y2} className="traceability-solar-ray-base" />
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      className="traceability-solar-ray-core"
                      style={{
                        color: KIND_COLORS[item.dominantKind],
                        stroke: KIND_COLORS[item.dominantKind],
                        strokeWidth: 6 + item.coverageScore * 10,
                      }}
                    />
                    <line x1={x2} y1={y2} x2={x3} y2={y3} className={`traceability-solar-ray-glow ${glowClass}`} />
                    <circle
                      cx={x3}
                      cy={y3}
                      r={4 + item.expiryScore * 6}
                      className={`traceability-solar-tip ${glowClass}`}
                    />

                    {solarInsights.length <= 18 || index % 2 === 0 ? (
                      <text
                        x={labelPoint.x}
                        y={labelPoint.y}
                        textAnchor={labelPoint.x >= 310 ? 'start' : 'end'}
                        className="traceability-solar-label"
                      >
                        {item.referenceCode}
                      </text>
                    ) : null}
                  </g>
                );
              })}

              <circle cx="310" cy="310" r="112" fill="url(#traceability-solar-center)" opacity="0.95" />
              <circle cx="310" cy="310" r="92" className="traceability-solar-core-ring" />
              <circle cx="310" cy="310" r="70" className="traceability-solar-core-ring traceability-solar-core-ring--soft" />
              <text x="310" y="284" textAnchor="middle" className="traceability-solar-core-copy">
                SOLAR
              </text>
              <text x="310" y="320" textAnchor="middle" className="traceability-solar-core-value">
                {Math.round(solarAverageCoverage * 100)}%
              </text>
              <text x="310" y="348" textAnchor="middle" className="traceability-solar-core-copy traceability-solar-core-copy--sub">
                cobertura promedio
              </text>
              <text x="310" y="372" textAnchor="middle" className="traceability-solar-core-copy traceability-solar-core-copy--tiny">
                {solarInsights.length} frentes visibles
              </text>
            </svg>

            <div className="traceability-solar-caption">
              Rayo = unidad + refacción · Largo = cobertura relativa · Halo = vigencia/riesgo · Color = tipo de pieza
            </div>

            {solarHover ? (
              <div
                className="traceability-solar-tooltip"
                style={{ left: solarHover.x, top: solarHover.y }}
              >
                <span>{solarHover.item.unitCode}</span>
                <strong>{solarHover.item.unitName}</strong>
                <p>{`${solarHover.item.referenceCode} · ${solarHover.item.productName}`}</p>
                <div className="traceability-solar-tooltip__metrics">
                  <b>{compactFormatter.format(solarHover.item.quantity)} u</b>
                  <b>{mxnFormatter.format(solarHover.item.estimatedValue)}</b>
                </div>
              </div>
            ) : null}
          </div>

          <aside className="traceability-solar-side">
            {solarHoverItem ? (
              <>
                <div className="traceability-solar-side__hero">
                  <span>{solarHoverItem.unitCode}</span>
                  <h4>{solarHoverItem.unitName}</h4>
                  <p>{`${solarHoverItem.frontCode} · ${solarHoverItem.referenceCode} · ${solarHoverItem.productName}`}</p>
                </div>

                <div className="traceability-solar-side__grid">
                  <div>
                    <label>Flujo trazado</label>
                    <strong>{compactFormatter.format(solarHoverItem.quantity)} u</strong>
                  </div>
                  <div>
                    <label>Valor estimado</label>
                    <strong>{mxnFormatter.format(solarHoverItem.estimatedValue)}</strong>
                  </div>
                  <div>
                    <label>Lotes activos</label>
                    <strong>{solarHoverItem.uniqueLots}</strong>
                  </div>
                  <div>
                    <label>Lecturas</label>
                    <strong>{solarHoverItem.scanCount}</strong>
                  </div>
                </div>

                <div className="traceability-solar-side__bars">
                  <div>
                    <span>Cobertura relativa</span>
                    <div className="traceability-solar-mini-track">
                      <div className="traceability-solar-mini-fill" style={{ width: `${solarHoverItem.coverageScore * 100}%` }} />
                    </div>
                  </div>
                  <div>
                    <span>Integridad catálogo</span>
                    <div className="traceability-solar-mini-track">
                      <div className="traceability-solar-mini-fill traceability-solar-mini-fill--blue" style={{ width: `${solarHoverItem.matchedRatio * 100}%` }} />
                    </div>
                  </div>
                  <div>
                    <span>Salud de vigencia</span>
                    <div className="traceability-solar-mini-track">
                      <div className="traceability-solar-mini-fill traceability-solar-mini-fill--amber" style={{ width: `${solarHoverItem.expiryScore * 100}%` }} />
                    </div>
                  </div>
                </div>

                <div className="traceability-solar-side__meta">
                  <span>{`Ingeniero líder: ${solarHoverItem.leadEngineer}`}</span>
                  <span>{`Última captura: ${toDisplayDate(solarHoverItem.latestScan)}`}</span>
                  <span>{`Vigencia crítica: ${solarHoverItem.expiredCount} fuera de vigencia · ${solarHoverItem.expiringSoonCount} por vencer`}</span>
                </div>
              </>
            ) : (
              <div className="traceability-empty-copy">Todavía no hay frentes suficientes para construir el solar.</div>
            )}
          </aside>
        </div>
      </article>

      <section className="traceability-command-deck">
        <article className="traceability-panel traceability-panel--hud">
          <div className="traceability-panel__header">
            <div>
              <span className="traceability-panel__eyebrow">Matriz de mezcla</span>
              <h3>Señal por tipo de refacción</h3>
            </div>
            <p>Distribución real del flujo activo. Aquí se ve si el periodo está cargado hacia piezas críticas, consumibles técnicos o capturas aún sin clasificar.</p>
          </div>

          <div className="traceability-kind-stack">
            {kindBreakdown.length === 0 ? (
              <div className="traceability-empty-copy">Todavía no hay mezcla suficiente para proyectar la señal por tipo de refacción.</div>
            ) : (
              kindBreakdown.map((item) => (
                <div key={item.kind} className="traceability-beam-row">
                  <div className="traceability-beam-copy">
                    <strong>{KIND_LABELS[item.kind]}</strong>
                    <span>{compactFormatter.format(item.quantity)} u</span>
                  </div>
                  <div className="traceability-beam-track">
                    <div
                      className="traceability-beam-fill"
                      style={{
                        width: `${Math.max(item.share * 100, 5)}%`,
                        '--beam-color': KIND_COLORS[item.kind],
                      } as CSSProperties}
                    />
                  </div>
                  <div className="traceability-beam-share">{pctFormatter.format(item.share)}</div>
                </div>
              ))
            )}
          </div>

          <div className="traceability-method-grid">
            {scanMethodBreakdown.map((item) => (
              <div key={item.key} className="traceability-method-card">
                <span>{item.label}</span>
                <strong>{pctFormatter.format(item.share)}</strong>
                <small>{compactFormatter.format(item.quantity)} u</small>
              </div>
            ))}
          </div>
        </article>

        <article className="traceability-panel traceability-panel--core">
          <div className="traceability-panel__header">
            <div>
              <span className="traceability-panel__eyebrow">Núcleo de mando</span>
              <h3>Radar holográfico de salud</h3>
            </div>
            <p>Resume calidad de trazabilidad, frescura de inventario, persistencia de lote y disciplina de captura en una sola lectura.</p>
          </div>

          <div className="traceability-core-shell">
            <svg viewBox="0 0 360 360" className="traceability-core-svg" aria-hidden="true">
              <defs>
                <radialGradient id="traceability-core-glow" cx="50%" cy="50%" r="55%">
                  <stop offset="0%" stopColor="rgba(68, 255, 221, 0.65)" />
                  <stop offset="45%" stopColor="rgba(68, 255, 221, 0.18)" />
                  <stop offset="100%" stopColor="rgba(68, 255, 221, 0)" />
                </radialGradient>
              </defs>

              <circle cx="180" cy="180" r="144" className="traceability-core-grid" />
              <circle cx="180" cy="180" r="114" className="traceability-core-grid traceability-core-grid--soft" />
              <circle cx="180" cy="180" r="84" className="traceability-core-grid traceability-core-grid--soft" />
              <circle cx="180" cy="180" r="52" fill="url(#traceability-core-glow)" opacity="0.9" />
              <circle cx="180" cy="180" r="44" className="traceability-core-center" />

              <line x1="180" y1="16" x2="180" y2="344" className="traceability-core-axis" />
              <line x1="16" y1="180" x2="344" y2="180" className="traceability-core-axis" />
              <line x1="66" y1="66" x2="294" y2="294" className="traceability-core-axis traceability-core-axis--soft" />
              <line x1="294" y1="66" x2="66" y2="294" className="traceability-core-axis traceability-core-axis--soft" />

              {signalRings.map((ring, index) => {
                const radius = 136 - index * 24;
                return (
                  <g key={ring.label}>
                    <path d={describeArc(180, 180, radius, -220, 40)} className="traceability-core-track" />
                    <path
                      d={describeDonutArc(180, 180, radius, ring.value)}
                      className="traceability-core-ring"
                      style={{ stroke: ring.tone }}
                    />
                  </g>
                );
              })}

              <g className="traceability-core-score">
                <text x="180" y="171" textAnchor="middle" className="traceability-core-score__label">
                  SCORE ORION
                </text>
                <text x="180" y="208" textAnchor="middle" className="traceability-core-score__value">
                  {telemetryScore}
                </text>
              </g>
            </svg>

            <div className="traceability-core-rings">
              {signalRings.map((ring) => (
                <div key={ring.label} className="traceability-core-ring-row">
                  <div className="traceability-core-ring-dot" style={{ background: ring.tone }} />
                  <div className="traceability-core-ring-copy">
                    <strong>{ring.label}</strong>
                    <span>{ring.hint}</span>
                  </div>
                  <b>{pctFormatter.format(ring.value)}</b>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="traceability-panel traceability-panel--hud">
          <div className="traceability-panel__header">
            <div>
              <span className="traceability-panel__eyebrow">Feed operativo</span>
              <h3>Alertas y focos activos</h3>
            </div>
            <p>Las alertas aquí son operativas, no decorativas. Están pensadas para detectar dónde se degrada la confiabilidad del dato.</p>
          </div>

          <div className="traceability-alert-feed">
            {alerts.length === 0 ? (
              <div className="traceability-empty-copy">Sin alertas activas en la ventana filtrada.</div>
            ) : (
              alerts.map((alert) => (
                <article key={alert.id} className={`traceability-alert-card traceability-alert-card--${alert.tone}`}>
                  <span>{alert.tone === 'critical' ? 'Crítico' : alert.tone === 'warning' ? 'Vigilancia' : 'Señal'}</span>
                  <strong>{alert.title}</strong>
                  <p>{alert.body}</p>
                </article>
              ))
            )}
          </div>
        </article>
      </section>

      <div className="traceability-filters">
        <div className="traceability-filter-block">
          <label>Horizonte</label>
          <div className="traceability-chip-group">
            {WINDOW_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={`button-primary chip ${windowDays === option ? '' : 'inactive'}`}
                onClick={() => setWindowDays(option)}
              >
                {option} días
              </button>
            ))}
          </div>
        </div>

        <div className="traceability-filter-block">
          <label>Tipo de pieza</label>
          <div className="traceability-chip-group">
            {KIND_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={`button-primary chip ${kindFilter === option ? '' : 'inactive'}`}
                onClick={() => setKindFilter(option)}
              >
                {KIND_LABELS[option]}
              </button>
            ))}
          </div>
        </div>

        <div className="traceability-select">
          <label>Ingeniero</label>
          <select className="input-field" value={engineerFilter} onChange={(event) => setEngineerFilter(event.target.value)}>
            <option value="all">Todos</option>
            {engineerOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="traceability-metric-grid">
        <article className="traceability-metric-card">
          <span>Flujo trazado</span>
          <strong>{compactFormatter.format(totals.totalQuantity)}</strong>
          <small>unidades registradas en el horizonte activo</small>
        </article>
        <article className="traceability-metric-card">
          <span>Integridad de catálogo</span>
          <strong>{pctFormatter.format(totals.matchRate)}</strong>
          <small>{compactFormatter.format(totals.recognizedQuantity)} unidades reconocidas por REF o GTIN</small>
        </article>
        <article className="traceability-metric-card">
          <span>Referencias vivas</span>
          <strong>{totals.uniqueRefs}</strong>
          <small>{totals.uniqueLots} lotes distintos con actividad visible</small>
        </article>
        <article className="traceability-metric-card">
          <span>Valor referencial</span>
          <strong>{mxnFormatter.format(totals.estimatedValue)}</strong>
          <small>estimado a precio lista cuando el catálogo aporta precio</small>
        </article>
        <article className="traceability-metric-card traceability-metric-card--warning">
          <span>Vigencia sensible</span>
          <strong>{totals.expiringSoon}</strong>
          <small>lecturas con vencimiento en 90 días o menos</small>
        </article>
        <article className="traceability-metric-card traceability-metric-card--critical">
          <span>Lotes vencidos</span>
          <strong>{totals.expired}</strong>
          <small>piezas que ya ameritan revisión inmediata</small>
        </article>
      </div>

      <div className="traceability-grid traceability-grid--top">
        <article className={`traceability-panel traceability-panel--wide traceability-view-block ${activeView === 'pulse' ? 'is-active' : ''}`}>
          <div className="traceability-panel__header">
            <div>
              <span className="traceability-panel__eyebrow">Pulso temporal</span>
              <h3>Corriente de uso y reconocimiento</h3>
            </div>
            <p>
              Superpone río de volumen por tipo de refacción, línea total y señal reconocida por catálogo. Aquí se ve
              si la trazabilidad además de existir realmente sirve.
            </p>
          </div>

          <div className="traceability-stream-card">
            <svg viewBox={`0 0 ${streamMetrics.width} ${streamMetrics.height}`} className="traceability-stream-svg">
              <defs>
                {Object.entries(KIND_COLORS).map(([kind, color]) => (
                  <linearGradient key={kind} id={`traceability-gradient-${kind}`} x1="0%" x2="100%" y1="0%" y2="0%">
                    <stop offset="0%" stopColor={color} stopOpacity="0.08" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.42" />
                  </linearGradient>
                ))}
              </defs>

              {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
                <line
                  key={tick}
                  x1="32"
                  x2="928"
                  y1={232 - tick * 196}
                  y2={232 - tick * 196}
                  className="traceability-stream-grid"
                />
              ))}

              {streamMetrics.layers.map((layer) => (
                <path key={layer.kind} d={layer.areaPath} fill={`url(#traceability-gradient-${layer.kind})`} stroke="none" />
              ))}

              <path d={streamMetrics.matchedPath} className="traceability-stream-line traceability-stream-line--matched" />
              <path d={streamMetrics.totalPath} className="traceability-stream-line traceability-stream-line--total" />

              {streamMetrics.ticks.map((tick) => {
                const index = dailyBuckets.findIndex((item) => item.isoDate === tick.isoDate);
                const x = 32 + (dailyBuckets.length > 1 ? (960 - 64) / (dailyBuckets.length - 1) : 0) * index;
                return (
                  <g key={tick.isoDate}>
                    <line x1={x} x2={x} y1="236" y2="243" className="traceability-stream-axis" />
                    <text x={x} y="267" textAnchor="middle" className="traceability-stream-label">
                      {tick.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            <div className="traceability-legend">
              {(KIND_OPTIONS.filter((option) => option !== 'all') as Array<Exclude<TraceabilityKind, 'all'>>).map((kind) => (
                <span key={kind}>
                  <i style={{ background: KIND_COLORS[kind] }} />
                  {KIND_LABELS[kind]}
                </span>
              ))}
              <span>
                <i className="traceability-legend-line traceability-legend-line--matched" />
                Reconocido
              </span>
              <span>
                <i className="traceability-legend-line traceability-legend-line--total" />
                Total
              </span>
            </div>
          </div>
        </article>

        <article className={`traceability-panel traceability-view-block ${activeView === 'clients' ? 'is-active' : ''}`}>
          <div className="traceability-panel__header">
            <div>
              <span className="traceability-panel__eyebrow">Dominio por cliente</span>
              <h3>Unidades con mayor presión de refacciones</h3>
            </div>
            <p>Sirve para ver dónde se están usando más piezas y dónde vale la pena reforzar control, abasto o inventario mínimo.</p>
          </div>

          <div className="traceability-client-stack">
            {clientLeaders.length === 0 ? (
              <div className="traceability-empty-copy">Sin suficiente volumen para perfilar clientes dominantes.</div>
            ) : (
              clientLeaders.map((client, index) => (
                <div key={client.id} className="traceability-client-row">
                  <div className="traceability-client-rank">{String(index + 1).padStart(2, '0')}</div>
                  <div className="traceability-client-copy">
                    <strong>{client.name}</strong>
                    <span>{compactFormatter.format(client.quantity)} unidades</span>
                  </div>
                  <div className="traceability-client-bar">
                    <div className="traceability-client-bar__fill" style={{ width: `${Math.max(client.share * 100, 8)}%` }} />
                  </div>
                  <div className="traceability-client-share">{pctFormatter.format(client.share)}</div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className={`traceability-panel traceability-view-block ${activeView === 'risk' ? 'is-active' : ''}`}>
          <div className="traceability-panel__header">
            <div>
              <span className="traceability-panel__eyebrow">Riesgo de lote</span>
              <h3>Runway de vigencia</h3>
            </div>
            <p>No interesa solo contar piezas; importa saber qué lote, garantía o vigencia empieza a volverse riesgosa.</p>
          </div>

          <div className="traceability-expiry-list">
            {expiryRecords.length === 0 ? (
              <div className="traceability-empty-copy">No hay suficientes lecturas con vigencia para construir el horizonte.</div>
            ) : (
              expiryRecords.map((record) => {
                const remaining = record.daysRemaining as number;
                const progress = clamp(((remaining + 30) / 210) * 100, 0, 100);
                return (
                  <div key={record.id} className="traceability-expiry-row">
                    <div className="traceability-expiry-meta">
                      <strong>{record.productName}</strong>
                      <span>{`${record.referenceCode || 'Sin REF'} · lote ${record.lotNumber || 'N/D'} · ${record.clientName}`}</span>
                    </div>
                    <div className="traceability-expiry-bar">
                      <div className={`traceability-expiry-point traceability-expiry-point--${expirationTone(record.expiresOn)}`} style={{ left: `${progress}%` }} />
                    </div>
                    <div className="traceability-expiry-days">
                      {remaining < 0 ? `${Math.abs(remaining)} d fuera` : `${remaining} d`}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </article>
      </div>

      <div className="traceability-grid">
        <article className={`traceability-panel traceability-view-block ${activeView === 'matrix' ? 'is-active' : ''}`}>
          <div className="traceability-panel__header">
            <div>
              <span className="traceability-panel__eyebrow">Concentración operativa</span>
              <h3>Matriz ingeniero × referencia</h3>
            </div>
            <p>Revela dependencia operativa: quién está usando qué refacciones y con qué intensidad relativa.</p>
          </div>

          <div className="traceability-heatmap-shell">
            {engineerMatrix.engineerRanking.length === 0 || engineerMatrix.refRanking.length === 0 ? (
              <div className="traceability-empty-copy">Todavía no hay suficiente densidad para mostrar concentración cruzada.</div>
            ) : (
              <svg viewBox={`0 0 ${220 + engineerMatrix.refRanking.length * 92} ${110 + engineerMatrix.engineerRanking.length * 72}`} className="traceability-heatmap-svg">
                {engineerMatrix.refRanking.map((ref, columnIndex) => (
                  <text
                    key={ref}
                    x={240 + columnIndex * 92}
                    y="38"
                    textAnchor="start"
                    transform={`rotate(-18 ${240 + columnIndex * 92} 38)`}
                    className="traceability-heatmap-label"
                  >
                    {ref}
                  </text>
                ))}

                {engineerMatrix.engineerRanking.map((engineer, rowIndex) => (
                  <text key={engineer} x="0" y={96 + rowIndex * 72} className="traceability-heatmap-row">
                    {engineer}
                  </text>
                ))}

                {engineerMatrix.cells.map((row, rowIndex) =>
                  row.map((value, columnIndex) => {
                    const intensity = value / engineerMatrix.maxCell;
                    const activeFill = `rgba(186, 0, 13, ${0.18 + intensity * 0.62})`;
                    const inactiveFill = 'rgba(255, 255, 255, 0.035)';
                    const activeStroke = `rgba(255, 255, 255, ${0.16 + intensity * 0.32})`;
                    return (
                      <g key={`${rowIndex}-${columnIndex}`}>
                        <rect
                          x={200 + columnIndex * 92}
                          y={58 + rowIndex * 72}
                          rx="18"
                          ry="18"
                          width="72"
                          height="52"
                          fill={value > 0 ? activeFill : inactiveFill}
                          stroke={value > 0 ? activeStroke : 'rgba(255,255,255,0.08)'}
                        />
                        <text x={236 + columnIndex * 92} y={90 + rowIndex * 72} textAnchor="middle" className="traceability-heatmap-value">
                          {value || '·'}
                        </text>
                      </g>
                    );
                  }),
                )}
              </svg>
            )}
          </div>
        </article>

        <article className={`traceability-panel traceability-panel--wide traceability-view-block ${activeView === 'references' ? 'is-active' : ''}`}>
          <div className="traceability-panel__header">
            <div>
              <span className="traceability-panel__eyebrow">Momentum por referencia</span>
              <h3>Deck analítico de refacciones dominantes</h3>
            </div>
            <p>Combina densidad temporal, dispersión de unidades y estabilidad de lotes para detectar piezas que de verdad gobiernan la operación.</p>
          </div>

          <div className="traceability-reference-grid">
            {topReferences.length === 0 ? (
              <div className="traceability-empty-copy">Aún no hay referencias suficientes para construir el deck de momentum.</div>
            ) : (
              topReferences.map((reference) => (
                <article key={reference.referenceCode || reference.productName} className="traceability-reference-card">
                  <div className="traceability-reference-card__header">
                    <div>
                      <span className="traceability-reference-code">{reference.referenceCode || 'SIN REF'}</span>
                      <strong>{reference.productName}</strong>
                    </div>
                    <div className="traceability-reference-qty">{compactFormatter.format(reference.totalQuantity)}</div>
                  </div>

                  <svg viewBox="0 0 240 78" className="traceability-sparkline">
                    <defs>
                      <linearGradient id={`spark-${toSafeId(reference.referenceCode || reference.productName)}`} x1="0%" x2="100%" y1="0%" y2="0%">
                        <stop offset="0%" stopColor="#ba000d" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="#f5f7ff" stopOpacity="0.8" />
                      </linearGradient>
                    </defs>
                    <path
                      d={`${buildSparklinePath(reference.sparkline, 240, 60)} L 240 78 L 0 78 Z`}
                      fill={`url(#spark-${toSafeId(reference.referenceCode || reference.productName)})`}
                      opacity="0.28"
                    />
                    <path d={buildSparklinePath(reference.sparkline, 240, 60)} className="traceability-sparkline-path" />
                  </svg>

                  <div className="traceability-reference-stats">
                    <span>{`${reference.scanCount} lectura(s)`}</span>
                    <span>{`${reference.uniqueLots} lote(s)`}</span>
                    <span>{`${reference.clients} cliente(s)`}</span>
                    <span>{`${reference.engineers} ingeniero(s)`}</span>
                    <span>{pctFormatter.format(reference.matchRate)} catalogado</span>
                    <span>{reference.priceMxn ? mxnFormatter.format(reference.priceMxn) : 'Precio N/D'}</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
