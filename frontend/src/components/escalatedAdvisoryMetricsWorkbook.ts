import type {
  AdvisoryMetricsExportPayload,
  AdvisoryMetricsTimelineRow,
  AdvisoryMetricsTrainerRow,
  AdvisoryMetricsValueRow,
} from './escalatedAdvisoryMetricsExport';

interface AdvisoryBucketRow {
  label: string;
  value: number;
  share: number;
  color: string;
}

interface AdvisoryRankRow {
  label: string;
  value: number;
  share: number;
}

interface AdvisoryOldestOpenRow {
  advisoryId: string;
  requester: string;
  typeLabel: string;
  waitingOn: string;
  createdAt: string;
  ageHours: number;
}

interface AdvisoryWorkbookStats {
  total: number;
  closedCount: number;
  openCount: number;
  closeRate: number;
  responseCoverage: number;
  sameDayCloseRate: number;
  averageAttachments: number;
  averageMessages: number;
  averageFirstResponse: number | null;
  medianFirstResponse: number | null;
  p90FirstResponse: number | null;
  averageResolution: number | null;
  medianResolution: number | null;
  p90Resolution: number | null;
  averageOpenAgeHours: number | null;
  statusRows: AdvisoryMetricsValueRow[];
  waitingRows: AdvisoryMetricsValueRow[];
  responseBuckets: AdvisoryBucketRow[];
  resolutionBuckets: AdvisoryBucketRow[];
  topTypes: AdvisoryRankRow[];
  topRequesters: AdvisoryRankRow[];
  oldestOpenRows: AdvisoryOldestOpenRow[];
  trainerRows: Array<
    AdvisoryMetricsTrainerRow & {
      responseRate: number;
    }
  >;
  timelineRows: AdvisoryMetricsTimelineRow[];
  heatmapRows: AdvisoryMetricsExportPayload['heatmapRows'];
  insights: string[];
}

const BRAND = {
  red: '#A8102A',
  redSoft: '#F9EDF0',
  silver: '#F4F6F9',
  silverStrong: '#E8EDF3',
  silverLine: '#D9DFE6',
  ink: '#1E232A',
  muted: '#67707D',
  teal: '#3B849E',
  tealSoft: '#EBF6FA',
  green: '#247D4E',
  greenSoft: '#EAF7EF',
  amber: '#A36F11',
  amberSoft: '#FCF5E3',
  navy: '#132033',
  white: '#FFFFFF',
} as const;

const FONT_BODY = 'Aptos';
const FONT_HEADLINE = 'Aptos Display';
const DATE_TIME_FORMAT = 'dd/mm/yyyy hh:mm';

const RESPONSE_BUCKETS = [
  { label: '<= 1 h', maxMinutes: 60, color: BRAND.green },
  { label: '1-4 h', maxMinutes: 240, color: BRAND.teal },
  { label: '4-24 h', maxMinutes: 1440, color: '#4D6EA8' },
  { label: '1-3 dias', maxMinutes: 4320, color: BRAND.amber },
  { label: '> 3 dias', maxMinutes: Number.POSITIVE_INFINITY, color: BRAND.red },
] as const;

const RESOLUTION_BUCKETS = [
  { label: '<= 4 h', maxMinutes: 240, color: BRAND.green },
  { label: '4-24 h', maxMinutes: 1440, color: BRAND.teal },
  { label: '1-3 dias', maxMinutes: 4320, color: '#4D6EA8' },
  { label: '3-7 dias', maxMinutes: 10080, color: BRAND.amber },
  { label: '> 7 dias', maxMinutes: Number.POSITIVE_INFINITY, color: BRAND.red },
] as const;

const RESPONSE_BUCKET_LABEL_BY_MINUTES = (value: number | null) =>
  resolveBucketLabel(value, RESPONSE_BUCKETS, 'Sin respuesta');

const RESOLUTION_BUCKET_LABEL_BY_MINUTES = (value: number | null) =>
  resolveBucketLabel(value, RESOLUTION_BUCKETS, 'Abiertas');

const numberFormatter = new Intl.NumberFormat('es-MX');
const percentFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
const oneDecimalFormatter = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const assetToDataUrl = async (assetPath: string) => {
  const response = await fetch(`${import.meta.env.BASE_URL}${assetPath}`);
  if (!response.ok) {
    throw new Error(`No se pudo cargar el asset ${assetPath}.`);
  }

  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error(`No se pudo leer ${assetPath}.`));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });
};

const buildExportSlug = (areaLabel: string) =>
  areaLabel
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const buildFileStamp = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const panelFill = (color: string) => ({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: argb(color) },
});

const thinBorder = (color: string = BRAND.silverLine) => ({
  top: { style: 'thin', color: { argb: argb(color) } },
  left: { style: 'thin', color: { argb: argb(color) } },
  bottom: { style: 'thin', color: { argb: argb(color) } },
  right: { style: 'thin', color: { argb: argb(color) } },
});

const softBorder = (color = BRAND.silverLine) => ({
  bottom: { style: 'thin', color: { argb: argb(color) } },
});

const parseDate = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const diffMinutes = (start: string | null | undefined, end: string | null | undefined) => {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate || !endDate) {
    return null;
  }

  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
};

const average = (values: number[]) => {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const percentile = (values: number[], ratio: number) => {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * ratio;
  const floor = Math.floor(index);
  const ceil = Math.ceil(index);
  if (floor === ceil) {
    return sorted[floor];
  }

  const base = sorted[floor];
  const next = sorted[ceil];
  return base + (next - base) * (index - floor);
};

const roundMetric = (value: number | null) => (value === null ? null : Math.round(value));

const percent = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

const formatInteger = (value: number) => numberFormatter.format(value);

const formatPercent = (value: number) => `${percentFormatter.format(value)}%`;

const formatHoursLabel = (value: number | null) => {
  if (value === null || Number.isNaN(value)) {
    return 'Sin dato';
  }

  if (value < 24) {
    return `${oneDecimalFormatter.format(value)} h`;
  }

  return `${oneDecimalFormatter.format(value / 24)} dias`;
};

const formatMinutesLabel = (value: number | null) => {
  if (value === null || Number.isNaN(value)) {
    return 'Sin dato';
  }

  if (value < 60) {
    return `${formatInteger(Math.round(value))} min`;
  }

  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  if (value < 1440) {
    return minutes > 0 ? `${formatInteger(hours)} h ${formatInteger(minutes)} min` : `${formatInteger(hours)} h`;
  }

  const days = value / 1440;
  return `${oneDecimalFormatter.format(days)} dias`;
};

const truncateLabel = (value: string, max = 28) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const resolveBucketLabel = (
  value: number | null,
  definitions: readonly { label: string; maxMinutes: number }[],
  fallbackLabel: string,
) => {
  if (value === null || Number.isNaN(value)) {
    return fallbackLabel;
  }

  return definitions.find((definition) => value <= definition.maxMinutes)?.label || fallbackLabel;
};

const buildBuckets = (
  values: Array<number | null>,
  definitions: readonly { label: string; maxMinutes: number; color: string }[],
  fallback: { label: string; color: string },
) => {
  const counts = new Map<string, AdvisoryBucketRow>();

  definitions.forEach((definition) => {
    counts.set(definition.label, {
      label: definition.label,
      value: 0,
      share: 0,
      color: definition.color,
    });
  });
  counts.set(fallback.label, { label: fallback.label, value: 0, share: 0, color: fallback.color });

  values.forEach((value) => {
    const bucket = value === null ? fallback : definitions.find((definition) => value <= definition.maxMinutes) || null;
    const key = bucket?.label || fallback.label;
    const existing = counts.get(key);
    if (existing) {
      existing.value += 1;
    }
  });

  const total = values.length;
  return [...counts.values()]
    .filter((row) => row.value > 0)
    .map((row) => ({
      ...row,
      share: percent(row.value, total),
    }));
};

const aggregateRankRows = (values: string[], limit = 6) => {
  const counts = values.reduce((map, rawValue) => {
    const value = rawValue.trim() || 'Sin dato';
    map.set(value, (map.get(value) || 0) + 1);
    return map;
  }, new Map<string, number>());

  const total = values.length;
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value, share: percent(value, total) }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'es'))
    .slice(0, limit);
};

const sortMetricRows = (rows: AdvisoryMetricsValueRow[]) =>
  [...rows].sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'es'));

const svgToPngDataUrl = (svgMarkup: string, width: number, height: number) =>
  new Promise<string>((resolve, reject) => {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('No se pudo crear el canvas para la grafica.');
        }
        context.fillStyle = BRAND.white;
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/png'));
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo rasterizar la grafica.'));
    };
    image.src = url;
  });

const createHorizontalBarChartSvg = (
  title: string,
  subtitle: string,
  rows: Array<{ label: string; value: number; color: string; share?: number }>,
) => {
  const width = 960;
  const rowHeight = 42;
  const chartTop = 106;
  const labelX = 34;
  const barX = 276;
  const barWidth = 538;
  const rightX = 904;
  const maxValue = Math.max(...rows.map((row) => row.value), 1);
  const height = chartTop + rows.length * rowHeight + 36;

  const body = rows
    .map((row, index) => {
      const y = chartTop + index * rowHeight;
      const widthValue = Math.max(14, (row.value / maxValue) * barWidth);
      const shareLabel = typeof row.share === 'number' ? ` · ${row.share}%` : '';
      return `
        <text x="${labelX}" y="${y + 18}" font-size="15" font-family="${FONT_BODY}" fill="${BRAND.ink}">${escapeXml(
          truncateLabel(row.label, 28),
        )}</text>
        <rect x="${barX}" y="${y}" rx="12" ry="12" width="${barWidth}" height="18" fill="${BRAND.silverStrong}" />
        <rect x="${barX}" y="${y}" rx="12" ry="12" width="${widthValue}" height="18" fill="${row.color}" />
        <text x="${rightX}" y="${y + 15}" font-size="15" font-family="${FONT_HEADLINE}" text-anchor="end" fill="${BRAND.ink}">${escapeXml(
          `${formatInteger(row.value)}${shareLabel}`,
        )}</text>
      `;
    })
    .join('');

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect x="0" y="0" width="${width}" height="${height}" rx="28" fill="${BRAND.white}" />
      <text x="34" y="42" font-size="28" font-family="${FONT_HEADLINE}" font-weight="700" fill="${BRAND.ink}">${escapeXml(
        title,
      )}</text>
      <text x="34" y="72" font-size="16" font-family="${FONT_BODY}" fill="${BRAND.muted}">${escapeXml(subtitle)}</text>
      ${body}
    </svg>
  `;
};

const createTimelineChartSvg = (rows: AdvisoryMetricsTimelineRow[]) => {
  const width = 960;
  const height = 500;
  const left = 68;
  const right = 34;
  const top = 92;
  const bottom = 86;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const maxTotal = Math.max(...rows.map((row) => row.created + row.replied + row.closed), 1);
  const barGap = 18;
  const barWidth = Math.max(38, (chartWidth - (rows.length - 1) * barGap) / Math.max(rows.length, 1));
  const gridValues = [0, 0.25, 0.5, 0.75, 1];

  const grid = gridValues
    .map((factor) => {
      const y = top + chartHeight - chartHeight * factor;
      const label = Math.round(maxTotal * factor);
      return `
        <line x1="${left}" x2="${width - right}" y1="${y}" y2="${y}" stroke="${BRAND.silverLine}" stroke-dasharray="4 6" />
        <text x="${left - 12}" y="${y + 5}" font-size="12" font-family="${FONT_BODY}" text-anchor="end" fill="${BRAND.muted}">${escapeXml(
          formatInteger(label),
        )}</text>
      `;
    })
    .join('');

  const bars = rows
    .map((row, index) => {
      const total = row.created + row.replied + row.closed;
      const barX = left + index * (barWidth + barGap);
      const totalHeight = (total / maxTotal) * chartHeight;
      let cursorY = top + chartHeight;
      const segments = [
        { value: row.closed, color: BRAND.green },
        { value: row.replied, color: BRAND.teal },
        { value: row.created, color: BRAND.red },
      ];

      const stacked = segments
        .map((segment) => {
          if (segment.value <= 0 || total <= 0) {
            return '';
          }

          const segmentHeight = Math.max((segment.value / total) * totalHeight, 8);
          cursorY -= segmentHeight;
          return `<rect x="${barX}" y="${cursorY}" width="${barWidth}" height="${segmentHeight}" rx="10" fill="${segment.color}" />`;
        })
        .join('');

      return `
        ${stacked}
        <text x="${barX + barWidth / 2}" y="${top + chartHeight + 24}" font-size="13" font-family="${FONT_BODY}" text-anchor="middle" fill="${BRAND.ink}">${escapeXml(
          row.label,
        )}</text>
        <text x="${barX + barWidth / 2}" y="${top + chartHeight + 42}" font-size="12" font-family="${FONT_BODY}" text-anchor="middle" fill="${BRAND.muted}">${escapeXml(
          formatInteger(total),
        )}</text>
      `;
    })
    .join('');

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect x="0" y="0" width="${width}" height="${height}" rx="28" fill="${BRAND.white}" />
      <text x="34" y="42" font-size="28" font-family="${FONT_HEADLINE}" font-weight="700" fill="${BRAND.ink}">Timeline operativo</text>
      <text x="34" y="72" font-size="16" font-family="${FONT_BODY}" fill="${BRAND.muted}">Nuevas, respondidas y cerradas por dia en la ventana visible</text>
      ${grid}
      ${bars}
      <circle cx="34" cy="${height - 26}" r="6" fill="${BRAND.red}" />
      <text x="48" y="${height - 21}" font-size="13" font-family="${FONT_BODY}" fill="${BRAND.ink}">Nuevas</text>
      <circle cx="126" cy="${height - 26}" r="6" fill="${BRAND.teal}" />
      <text x="140" y="${height - 21}" font-size="13" font-family="${FONT_BODY}" fill="${BRAND.ink}">Respondidas</text>
      <circle cx="260" cy="${height - 26}" r="6" fill="${BRAND.green}" />
      <text x="274" y="${height - 21}" font-size="13" font-family="${FONT_BODY}" fill="${BRAND.ink}">Cerradas</text>
    </svg>
  `;
};

const applyPanel = (
  worksheet: any,
  rowStart: number,
  rowEnd: number,
  columnStart: number,
  columnEnd: number,
  fillColor: string = BRAND.white,
  borderColor: string = BRAND.silverLine,
) => {
  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let column = columnStart; column <= columnEnd; column += 1) {
      const cell = worksheet.getCell(row, column);
      cell.fill = clone(panelFill(fillColor));
      cell.border = {
        top: row === rowStart ? { style: 'thin', color: { argb: argb(borderColor) } } : undefined,
        bottom: row === rowEnd ? { style: 'thin', color: { argb: argb(borderColor) } } : undefined,
        left: column === columnStart ? { style: 'thin', color: { argb: argb(borderColor) } } : undefined,
        right: column === columnEnd ? { style: 'thin', color: { argb: argb(borderColor) } } : undefined,
      };
    }
  }
};

const setCellValue = (
  worksheet: any,
  row: number,
  column: number,
  value: Date | string | number | null,
  options?: {
    font?: Record<string, unknown>;
    fill?: Record<string, unknown>;
    border?: Record<string, unknown>;
    alignment?: Record<string, unknown>;
    numFmt?: string;
  },
) => {
  const cell = worksheet.getCell(row, column);
  cell.value = value;
  if (options?.font) {
    cell.font = clone(options.font);
  }
  if (options?.fill) {
    cell.fill = clone(options.fill);
  }
  if (options?.border) {
    cell.border = clone(options.border);
  }
  if (options?.alignment) {
    cell.alignment = clone(options.alignment);
  }
  if (options?.numFmt) {
    cell.numFmt = options.numFmt;
  }
  return cell;
};

const mergeAndWrite = (
  worksheet: any,
  rowStart: number,
  rowEnd: number,
  columnStart: number,
  columnEnd: number,
  value: Date | string | number | null,
  options?: {
    font?: Record<string, unknown>;
    fill?: Record<string, unknown>;
    border?: Record<string, unknown>;
    alignment?: Record<string, unknown>;
    numFmt?: string;
  },
) => {
  worksheet.mergeCells(rowStart, columnStart, rowEnd, columnEnd);
  applyPanel(
    worksheet,
    rowStart,
    rowEnd,
    columnStart,
    columnEnd,
    typeof options?.fill === 'object' && options.fill !== null && 'fgColor' in options.fill
      ? fillToHex(options.fill as { fgColor?: { argb?: string } })
      : BRAND.white,
  );
  return setCellValue(worksheet, rowStart, columnStart, value, options);
};

const fillToHex = (fill: { fgColor?: { argb?: string } }) => {
  const value = fill?.fgColor?.argb || argb(BRAND.white);
  return `#${value.slice(2)}`;
};

const createKpiCard = (
  worksheet: any,
  rowStart: number,
  rowEnd: number,
  columnStart: number,
  columnEnd: number,
  title: string,
  value: string,
  subtitle: string,
  accent: string,
  fillColor: string,
) => {
  applyPanel(worksheet, rowStart, rowEnd, columnStart, columnEnd, fillColor);
  mergeAndWrite(worksheet, rowStart, rowStart, columnStart, columnEnd, title.toUpperCase(), {
    font: { name: FONT_BODY, size: 10, bold: true, color: { argb: argb(BRAND.muted) } },
    fill: panelFill(fillColor),
    alignment: { vertical: 'middle', horizontal: 'left' },
  });
  mergeAndWrite(worksheet, rowStart + 1, rowStart + 2, columnStart, columnEnd, value, {
    font: { name: FONT_HEADLINE, size: 19, bold: true, color: { argb: argb(accent) } },
    fill: panelFill(fillColor),
    alignment: { vertical: 'middle', horizontal: 'left' },
  });
  mergeAndWrite(worksheet, rowStart + 3, rowEnd, columnStart, columnEnd, subtitle, {
    font: { name: FONT_BODY, size: 9, color: { argb: argb(BRAND.ink) } },
    fill: panelFill(fillColor),
    alignment: { vertical: 'top', horizontal: 'left', wrapText: true },
  });
};

const writeMetricTable = (
  worksheet: any,
  rowStart: number,
  columnStart: number,
  title: string,
  rows: Array<{ label: string; value: string; accent?: string }>,
  width: number,
) => {
  const titleColumnEnd = columnStart + width - 1;
  applyPanel(worksheet, rowStart, rowStart + rows.length + 1, columnStart, titleColumnEnd, BRAND.white);
  mergeAndWrite(worksheet, rowStart, rowStart, columnStart, titleColumnEnd, title, {
    font: { name: FONT_HEADLINE, size: 13, bold: true, color: { argb: argb(BRAND.ink) } },
    fill: panelFill(BRAND.white),
    alignment: { vertical: 'middle', horizontal: 'left' },
  });

  rows.forEach((row, index) => {
    const currentRow = rowStart + index + 1;
    if (width === 1) {
      mergeAndWrite(worksheet, currentRow, currentRow, columnStart, titleColumnEnd, `${row.label}: ${row.value}`, {
        font: { name: FONT_BODY, size: 10, color: { argb: argb(row.accent || BRAND.ink) }, bold: true },
        fill: panelFill(index % 2 === 0 ? BRAND.white : BRAND.silver),
        alignment: { vertical: 'middle', horizontal: 'left', wrapText: true },
        border: softBorder(),
      });
      return;
    }

    mergeAndWrite(worksheet, currentRow, currentRow, columnStart, titleColumnEnd - 1, row.label, {
      font: { name: FONT_BODY, size: 10, color: { argb: argb(BRAND.ink) } },
      fill: panelFill(index % 2 === 0 ? BRAND.white : BRAND.silver),
      alignment: { vertical: 'middle', horizontal: 'left' },
      border: softBorder(),
    });
    setCellValue(worksheet, currentRow, titleColumnEnd, row.value, {
      font: {
        name: FONT_BODY,
        size: 10,
        bold: true,
        color: { argb: argb(row.accent || BRAND.ink) },
      },
      fill: panelFill(index % 2 === 0 ? BRAND.white : BRAND.silver),
      alignment: { vertical: 'middle', horizontal: 'right' },
      border: softBorder(),
    });
  });
};

const writeInsightPanel = (worksheet: any, rowStart: number, columnStart: number, columnEnd: number, insights: string[]) => {
  applyPanel(worksheet, rowStart, rowStart + 8, columnStart, columnEnd, BRAND.white);
  mergeAndWrite(worksheet, rowStart, rowStart, columnStart, columnEnd, 'Hallazgos ejecutivos', {
    font: { name: FONT_HEADLINE, size: 13, bold: true, color: { argb: argb(BRAND.ink) } },
    fill: panelFill(BRAND.white),
    alignment: { vertical: 'middle', horizontal: 'left' },
  });

  insights.forEach((insight, index) => {
    mergeAndWrite(worksheet, rowStart + 1 + index * 2, rowStart + 2 + index * 2, columnStart, columnEnd, `• ${insight}`, {
      font: { name: FONT_BODY, size: 10, color: { argb: argb(BRAND.ink) } },
      fill: panelFill(index % 2 === 0 ? BRAND.silver : BRAND.white),
      alignment: { vertical: 'middle', horizontal: 'left', wrapText: true },
    });
  });
};

const writeOldestOpenPanel = (
  worksheet: any,
  rowStart: number,
  columnStart: number,
  columnEnd: number,
  rows: AdvisoryOldestOpenRow[],
) => {
  applyPanel(worksheet, rowStart, rowStart + 9, columnStart, columnEnd, BRAND.white);
  mergeAndWrite(worksheet, rowStart, rowStart, columnStart, columnEnd, 'Casos abiertos mas antiguos', {
    font: { name: FONT_HEADLINE, size: 13, bold: true, color: { argb: argb(BRAND.ink) } },
    fill: panelFill(BRAND.white),
    alignment: { vertical: 'middle', horizontal: 'left' },
  });

  if (rows.length === 0) {
    mergeAndWrite(worksheet, rowStart + 2, rowStart + 4, columnStart, columnEnd, 'No hay asesorias abiertas en esta vista.', {
      font: { name: FONT_BODY, size: 10, color: { argb: argb(BRAND.muted) } },
      fill: panelFill(BRAND.silver),
      alignment: { vertical: 'middle', horizontal: 'center' },
    });
    return;
  }

  rows.slice(0, 4).forEach((row, index) => {
    const currentRow = rowStart + 1 + index * 2;
    applyPanel(worksheet, currentRow, currentRow + 1, columnStart, columnEnd, index % 2 === 0 ? BRAND.silver : BRAND.white);
    mergeAndWrite(
      worksheet,
      currentRow,
      currentRow,
      columnStart,
      columnEnd - 2,
      `${row.requester} · ${truncateLabel(row.typeLabel, 34)}`,
      {
        font: { name: FONT_BODY, size: 10, bold: true, color: { argb: argb(BRAND.ink) } },
        fill: panelFill(index % 2 === 0 ? BRAND.silver : BRAND.white),
        alignment: { vertical: 'middle', horizontal: 'left' },
      },
    );
    mergeAndWrite(
      worksheet,
      currentRow,
      currentRow,
      columnEnd - 1,
      columnEnd,
      formatHoursLabel(row.ageHours),
      {
        font: { name: FONT_BODY, size: 10, bold: true, color: { argb: argb(BRAND.red) } },
        fill: panelFill(index % 2 === 0 ? BRAND.silver : BRAND.white),
        alignment: { vertical: 'middle', horizontal: 'right' },
      },
    );
    mergeAndWrite(
      worksheet,
      currentRow + 1,
      currentRow + 1,
      columnStart,
      columnEnd,
      `${row.waitingOn} · ${parseDate(row.createdAt)?.toLocaleString('es-MX', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }) || row.createdAt}`,
      {
        font: { name: FONT_BODY, size: 9, color: { argb: argb(BRAND.muted) } },
        fill: panelFill(index % 2 === 0 ? BRAND.silver : BRAND.white),
        alignment: { vertical: 'middle', horizontal: 'left' },
      },
    );
  });
};

const deriveWorkbookStats = (payload: AdvisoryMetricsExportPayload) => {
  const generatedAt = parseDate(payload.generatedAtIso) || new Date();
  const total = payload.detailRows.length || payload.summary.total;
  const closedRows = payload.detailRows.filter((row) => typeof row.resolutionMinutes === 'number');
  const openRows = payload.detailRows.filter((row) => row.resolutionMinutes === null);
  const firstResponseValues = payload.detailRows
    .map((row) => row.firstResponseMinutes)
    .filter((value): value is number => typeof value === 'number' && value >= 0);
  const resolutionValues = closedRows
    .map((row) => row.resolutionMinutes)
    .filter((value): value is number => typeof value === 'number' && value >= 0);
  const averageFirstResponse = roundMetric(average(firstResponseValues));
  const medianFirstResponse = roundMetric(percentile(firstResponseValues, 0.5));
  const p90FirstResponse = roundMetric(percentile(firstResponseValues, 0.9));
  const averageResolution = roundMetric(average(resolutionValues));
  const medianResolution = roundMetric(percentile(resolutionValues, 0.5));
  const p90Resolution = roundMetric(percentile(resolutionValues, 0.9));
  const averageOpenAgeHours = (() => {
    const values = openRows
      .map((row) => diffMinutes(row.createdAt, generatedAt.toISOString()))
      .filter((value): value is number => typeof value === 'number')
      .map((value) => value / 60);
    const metric = average(values);
    return metric === null ? null : Number(metric.toFixed(1));
  })();
  const responseBuckets = buildBuckets(
    payload.detailRows.map((row) => row.firstResponseMinutes),
    RESPONSE_BUCKETS,
    { label: 'Sin respuesta', color: BRAND.redSoft },
  );
  const resolutionBuckets = buildBuckets(
    payload.detailRows.map((row) => row.resolutionMinutes),
    RESOLUTION_BUCKETS,
    { label: 'Abiertas', color: BRAND.redSoft },
  );
  const topTypes = aggregateRankRows(payload.detailRows.map((row) => row.typeLabel || 'Sin tipo capturado'));
  const topRequesters = aggregateRankRows(payload.detailRows.map((row) => row.requester || 'Sin solicitante'));
  const oldestOpenRows = openRows
    .map((row) => ({
      advisoryId: row.advisoryId,
      requester: row.requester,
      typeLabel: row.typeLabel,
      waitingOn: row.waitingOn,
      createdAt: row.createdAt,
      ageHours: Number((((diffMinutes(row.createdAt, generatedAt.toISOString()) || 0) as number) / 60).toFixed(1)),
    }))
    .sort((left, right) => right.ageHours - left.ageHours || left.requester.localeCompare(right.requester, 'es'))
    .slice(0, 4);
  const trainerRows = payload.trainerRows
    .map((row) => ({
      ...row,
      responseRate: percent(row.responded, row.assigned),
    }))
    .sort((left, right) => right.assigned - left.assigned || left.label.localeCompare(right.label, 'es'))
    .slice(0, 6);
  const closedCount = closedRows.length;
  const openCount = Math.max(total - closedCount, 0);
  const closeRate = percent(closedCount, total);
  const responseCoverage = percent(firstResponseValues.length, total);
  const sameDayCloseRate = percent(
    closedRows.filter((row) => (row.resolutionMinutes || 0) <= 1440).length,
    Math.max(closedRows.length, 1),
  );
  const averageAttachments = Number((average(payload.detailRows.map((row) => row.attachmentCount)) || 0).toFixed(1));
  const averageMessages = Number((average(payload.detailRows.map((row) => row.messageCount)) || 0).toFixed(1));
  const statusRows = sortMetricRows(payload.statusRows);
  const waitingRows = sortMetricRows(payload.waitingRows);

  return {
    total,
    closedCount,
    openCount,
    closeRate,
    responseCoverage,
    sameDayCloseRate,
    averageAttachments,
    averageMessages,
    averageFirstResponse,
    medianFirstResponse,
    p90FirstResponse,
    averageResolution,
    medianResolution,
    p90Resolution,
    averageOpenAgeHours,
    statusRows,
    waitingRows,
    responseBuckets,
    resolutionBuckets,
    topTypes,
    topRequesters,
    oldestOpenRows,
    trainerRows,
    timelineRows: payload.timelineRows,
    heatmapRows: payload.heatmapRows,
    insights: [
      `${formatPercent(closeRate)} del volumen ya esta cerrado; ${formatInteger(openCount)} asesorias siguen activas y ${formatInteger(payload.summary.waitingOnTrainer)} esperan al trainer.`,
      `La primera respuesta cubre ${formatPercent(responseCoverage)} de los casos. Promedio: ${formatMinutesLabel(averageFirstResponse)} · Mediana: ${formatMinutesLabel(medianFirstResponse)} · P90: ${formatMinutesLabel(p90FirstResponse)}.`,
      resolutionValues.length > 0
        ? `El cierre promedio toma ${formatMinutesLabel(averageResolution)} y ${formatPercent(sameDayCloseRate)} de las asesorias cerradas se resuelve dentro de 24 horas.`
        : 'Aun no hay asesorias cerradas suficientes para estimar tiempo de cierre en esta vista.',
    ],
  } satisfies AdvisoryWorkbookStats;
};

const writeDashboard = async (workbook: any, payload: AdvisoryMetricsExportPayload, stats: AdvisoryWorkbookStats) => {
  const worksheet = workbook.addWorksheet('Dashboard');
  worksheet.views = [{ showGridLines: false }];
  worksheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
  const columnWidths = [4, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 4];
  columnWidths.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });

  [2, 8, 9, 10, 11, 12, 13, 14, 15, 17, 32, 47, 62].forEach((rowNumber) => {
    worksheet.getRow(rowNumber).height = rowNumber === 2 ? 28 : 22;
  });

  applyPanel(worksheet, 2, 4, 2, 13, BRAND.navy, BRAND.navy);
  mergeAndWrite(worksheet, 2, 3, 5, 13, `ORION · Analitica de asesorias`, {
    font: { name: FONT_HEADLINE, size: 22, bold: true, color: { argb: argb(BRAND.white) } },
    fill: panelFill(BRAND.navy),
    alignment: { vertical: 'middle', horizontal: 'left' },
  });
  mergeAndWrite(worksheet, 4, 4, 5, 13, `${payload.areaLabel} · ${payload.scopeLabel} · ${payload.generatedAt}`, {
    font: { name: FONT_BODY, size: 10, color: { argb: argb('#D5DCE7') } },
    fill: panelFill(BRAND.navy),
    alignment: { vertical: 'middle', horizontal: 'left' },
  });

  try {
    const logoDataUrl = await assetToDataUrl('bios-brand/BioS_Logo_300dpi.png');
    const imageId = workbook.addImage({ base64: logoDataUrl, extension: 'png' });
    worksheet.addImage(imageId, {
      tl: { col: 1.4, row: 1.4 },
      ext: { width: 155, height: 54 },
      editAs: 'oneCell',
    });
  } catch (_error) {
    mergeAndWrite(worksheet, 2, 4, 2, 4, 'BioSystems', {
      font: { name: FONT_HEADLINE, size: 18, bold: true, color: { argb: argb(BRAND.white) } },
      fill: panelFill(BRAND.navy),
      alignment: { vertical: 'middle', horizontal: 'center' },
    });
  }

  mergeAndWrite(worksheet, 6, 6, 2, 13, `Generado: ${payload.generatedAt} · Casos analizados: ${formatInteger(stats.total)} · Cobertura con evidencia: ${formatPercent(payload.summary.evidenceCoverage)}`, {
    font: { name: FONT_BODY, size: 10, color: { argb: argb(BRAND.ink) } },
    fill: panelFill(BRAND.silver),
    border: thinBorder(),
    alignment: { vertical: 'middle', horizontal: 'left' },
  });

  createKpiCard(
    worksheet,
    8,
    11,
    2,
    4,
    'Total asesorias',
    formatInteger(stats.total),
    `${formatPercent(stats.closeRate)} cerradas`,
    BRAND.red,
    BRAND.redSoft,
  );
  createKpiCard(
    worksheet,
    8,
    11,
    5,
    7,
    'Espera trainer',
    formatInteger(payload.summary.waitingOnTrainer),
    `${formatPercent(percent(payload.summary.waitingOnTrainer, Math.max(stats.total, 1)))} del universo`,
    BRAND.amber,
    BRAND.amberSoft,
  );
  createKpiCard(
    worksheet,
    8,
    11,
    8,
    10,
    '1ra respuesta prom.',
    formatMinutesLabel(stats.averageFirstResponse),
    `Mediana: ${formatMinutesLabel(stats.medianFirstResponse)}`,
    BRAND.teal,
    BRAND.tealSoft,
  );
  createKpiCard(
    worksheet,
    8,
    11,
    11,
    13,
    'Cierre promedio',
    formatMinutesLabel(stats.averageResolution),
    `P90: ${formatMinutesLabel(stats.p90Resolution)}`,
    BRAND.green,
    BRAND.greenSoft,
  );
  createKpiCard(
    worksheet,
    12,
    15,
    2,
    4,
    'Cobertura respuesta',
    formatPercent(stats.responseCoverage),
    `${formatInteger(stats.closedCount)} cerradas · ${formatInteger(stats.openCount)} activas`,
    BRAND.teal,
    BRAND.tealSoft,
  );
  createKpiCard(
    worksheet,
    12,
    15,
    5,
    7,
    'Cierre < 24 h',
    formatPercent(stats.sameDayCloseRate),
    'Solo sobre asesorias cerradas',
    BRAND.green,
    BRAND.greenSoft,
  );
  createKpiCard(
    worksheet,
    12,
    15,
    8,
    10,
    'Mensajes por caso',
    oneDecimalFormatter.format(stats.averageMessages),
    `Evidencias por caso: ${oneDecimalFormatter.format(stats.averageAttachments)}`,
    BRAND.red,
    BRAND.redSoft,
  );
  createKpiCard(
    worksheet,
    12,
    15,
    11,
    13,
    'Antiguedad abierta',
    formatHoursLabel(stats.averageOpenAgeHours),
    'Promedio sobre casos sin cerrar',
    BRAND.amber,
    BRAND.amberSoft,
  );

  const statusChart = await svgToPngDataUrl(
    createHorizontalBarChartSvg(
      'Distribucion por estado',
      'Balance actual del backlog visible',
      stats.statusRows.map((row) => ({
        label: row.label,
        value: row.value,
        share: percent(row.value, Math.max(stats.total, 1)),
        color: row.label.toLowerCase().includes('cerrad')
          ? BRAND.green
          : row.label.toLowerCase().includes('revision')
            ? BRAND.amber
            : row.label.toLowerCase().includes('asesorad')
              ? BRAND.teal
              : BRAND.red,
      })),
    ),
    960,
    420,
  );
  const statusChartId = workbook.addImage({ base64: statusChart, extension: 'png' });
  worksheet.addImage(statusChartId, {
    tl: { col: 1.2, row: 16.2 },
    ext: { width: 455, height: 250 },
    editAs: 'oneCell',
  });

  const responseChart = await svgToPngDataUrl(
    createHorizontalBarChartSvg(
      'SLA de primera respuesta',
      'Velocidad de contacto inicial del trainer',
      stats.responseBuckets.map((row) => ({
        label: row.label,
        value: row.value,
        share: row.share,
        color: row.color,
      })),
    ),
    960,
    420,
  );
  const responseChartId = workbook.addImage({ base64: responseChart, extension: 'png' });
  worksheet.addImage(responseChartId, {
    tl: { col: 7.5, row: 16.2 },
    ext: { width: 455, height: 250 },
    editAs: 'oneCell',
  });

  const resolutionChart = await svgToPngDataUrl(
    createHorizontalBarChartSvg(
      'SLA de cierre',
      'Tiempo total que toma completar la asesoria',
      stats.resolutionBuckets.map((row) => ({
        label: row.label,
        value: row.value,
        share: row.share,
        color: row.color,
      })),
    ),
    960,
    420,
  );
  const resolutionChartId = workbook.addImage({ base64: resolutionChart, extension: 'png' });
  worksheet.addImage(resolutionChartId, {
    tl: { col: 1.2, row: 31.2 },
    ext: { width: 455, height: 250 },
    editAs: 'oneCell',
  });

  const timelineChart = await svgToPngDataUrl(createTimelineChartSvg(stats.timelineRows), 960, 500);
  const timelineChartId = workbook.addImage({ base64: timelineChart, extension: 'png' });
  worksheet.addImage(timelineChartId, {
    tl: { col: 7.5, row: 31.2 },
    ext: { width: 455, height: 272 },
    editAs: 'oneCell',
  });

  writeMetricTable(
    worksheet,
    47,
    2,
    'Carga por trainer',
    stats.trainerRows.map((row) => ({
      label: `${row.label} · ${row.assigned} asignadas · ${row.responded} respondidas`,
      value: `${row.responseRate}%`,
      accent: row.responseRate >= 70 ? BRAND.green : row.responseRate >= 40 ? BRAND.amber : BRAND.red,
    })),
    6,
  );
  writeMetricTable(
    worksheet,
    47,
    8,
    'Top tipos de incidencia',
    stats.topTypes.map((row) => ({
      label: row.label,
      value: `${formatInteger(row.value)} · ${row.share}%`,
      accent: BRAND.red,
    })),
    6,
  );
  writeInsightPanel(worksheet, 62, 2, 7, stats.insights);
  writeOldestOpenPanel(worksheet, 62, 8, 13, stats.oldestOpenRows);
};

const writeAnalysisSheet = (workbook: any, payload: AdvisoryMetricsExportPayload, stats: AdvisoryWorkbookStats) => {
  const worksheet = workbook.addWorksheet('Resumen analitico');
  worksheet.views = [{ showGridLines: false, state: 'frozen', ySplit: 2 }];
  worksheet.pageSetup = { orientation: 'landscape' };
  const widths = [28, 12, 24, 12, 24, 12, 26, 12, 12, 14];
  widths.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });

  mergeAndWrite(worksheet, 1, 1, 1, 10, `Resumen analitico · ${payload.areaLabel}`, {
    font: { name: FONT_HEADLINE, size: 18, bold: true, color: { argb: argb(BRAND.white) } },
    fill: panelFill(BRAND.navy),
    alignment: { vertical: 'middle', horizontal: 'left' },
  });
  mergeAndWrite(worksheet, 2, 2, 1, 10, `${payload.scopeLabel} · ${payload.generatedAt}`, {
    font: { name: FONT_BODY, size: 10, color: { argb: argb('#D5DCE7') } },
    fill: panelFill(BRAND.navy),
    alignment: { vertical: 'middle', horizontal: 'left' },
  });

  writeMetricTable(
    worksheet,
    4,
    1,
    'Estados',
    stats.statusRows.map((row) => ({ label: row.label, value: formatInteger(row.value), accent: BRAND.red })),
    2,
  );
  writeMetricTable(
    worksheet,
    4,
    4,
    'Espera de',
    stats.waitingRows.map((row) => ({ label: row.label, value: formatInteger(row.value), accent: BRAND.amber })),
    2,
  );
  writeMetricTable(
    worksheet,
    4,
    7,
    'Buckets 1ra respuesta',
    stats.responseBuckets.map((row) => ({ label: row.label, value: `${formatInteger(row.value)} · ${row.share}%`, accent: row.color })),
    4,
  );
  writeMetricTable(
    worksheet,
    13,
    1,
    'Buckets de cierre',
    stats.resolutionBuckets.map((row) => ({ label: row.label, value: `${formatInteger(row.value)} · ${row.share}%`, accent: row.color })),
    4,
  );
  writeMetricTable(
    worksheet,
    13,
    6,
    'Top solicitantes',
    stats.topRequesters.map((row) => ({ label: row.label, value: `${formatInteger(row.value)} · ${row.share}%`, accent: BRAND.teal })),
    3,
  );
  writeMetricTable(
    worksheet,
    13,
    10,
    'Timeline reciente',
    stats.timelineRows.map((row) => ({
      label: `${row.label} · N ${row.created} · R ${row.replied} · C ${row.closed}`,
      value: formatInteger(row.created + row.replied + row.closed),
      accent: BRAND.green,
    })),
    1,
  );

  const trainerStartRow = 24;
  mergeAndWrite(worksheet, trainerStartRow, trainerStartRow, 1, 5, 'Rendimiento por trainer', {
    font: { name: FONT_HEADLINE, size: 13, bold: true, color: { argb: argb(BRAND.ink) } },
    fill: panelFill(BRAND.white),
    border: thinBorder(),
    alignment: { vertical: 'middle', horizontal: 'left' },
  });
  const trainerHeaders = ['Trainer', 'Asignadas', 'Respondidas', '% respuesta', '1ra respuesta prom.'];
  trainerHeaders.forEach((header, index) => {
    setCellValue(worksheet, trainerStartRow + 1, index + 1, header, {
      font: { name: FONT_BODY, size: 10, bold: true, color: { argb: argb(BRAND.white) } },
      fill: panelFill(BRAND.navy),
      border: thinBorder(BRAND.navy),
      alignment: { vertical: 'middle', horizontal: index === 0 ? 'left' : 'center' },
    });
  });
  stats.trainerRows.forEach((row, index) => {
    const currentRow = trainerStartRow + 2 + index;
    const fillColor = index % 2 === 0 ? BRAND.white : BRAND.silver;
    [
      row.label,
      row.assigned,
      row.responded,
      `${row.responseRate}%`,
      formatMinutesLabel(row.avgFirstResponseMinutes),
    ].forEach((value, cellIndex) => {
      setCellValue(worksheet, currentRow, cellIndex + 1, value, {
        font: {
          name: FONT_BODY,
          size: 10,
          color: { argb: argb(cellIndex === 3 ? (row.responseRate >= 70 ? BRAND.green : row.responseRate >= 40 ? BRAND.amber : BRAND.red) : BRAND.ink) },
          bold: cellIndex === 0 || cellIndex === 3,
        },
        fill: panelFill(fillColor),
        border: softBorder(),
        alignment: { vertical: 'middle', horizontal: cellIndex === 0 ? 'left' : 'center', wrapText: true },
      });
    });
  });
};

const writeDetailSheet = (workbook: any, payload: AdvisoryMetricsExportPayload) => {
  const worksheet = workbook.addWorksheet('Detalle asesorias');
  worksheet.views = [{ showGridLines: false, state: 'frozen', ySplit: 2 }];
  worksheet.pageSetup = { orientation: 'landscape' };
  const headers = [
    'ID',
    'Ticket',
    'Estado',
    'Solicitante',
    'Resolver',
    'Plataforma',
    'Tipo de incidencia',
    'Espera de',
    'Creada',
    '1ra respuesta',
    '1ra resp. (min)',
    '1ra resp. (h)',
    'Ultima actualizacion',
    'Cierre (min)',
    'Cierre (h)',
    'Antiguedad abierta (h)',
    'Mensajes',
    'Respuestas trainer',
    'Evidencias',
    'Tags de evidencia',
    'SLA 1ra respuesta',
    'SLA cierre',
    'Consulta escalada',
  ];
  const widths = [24, 20, 16, 24, 24, 18, 28, 22, 20, 20, 16, 16, 22, 16, 16, 18, 12, 16, 12, 24, 18, 16, 52];
  widths.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });

  mergeAndWrite(worksheet, 1, 1, 1, headers.length, `Detalle exportado · ${payload.areaLabel} · ${payload.generatedAt}`, {
    font: { name: FONT_HEADLINE, size: 18, bold: true, color: { argb: argb(BRAND.white) } },
    fill: panelFill(BRAND.navy),
    alignment: { vertical: 'middle', horizontal: 'left' },
  });

  headers.forEach((header, index) => {
    setCellValue(worksheet, 2, index + 1, header, {
      font: { name: FONT_BODY, size: 10, bold: true, color: { argb: argb(BRAND.white) } },
      fill: panelFill(BRAND.navy),
      border: thinBorder(BRAND.navy),
      alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
    });
  });

  const generatedAt = parseDate(payload.generatedAtIso) || new Date();
  payload.detailRows
    .slice()
    .sort((left, right) => (parseDate(right.createdAt)?.getTime() || 0) - (parseDate(left.createdAt)?.getTime() || 0))
    .forEach((row, index) => {
      const currentRow = index + 3;
      const fillColor = index % 2 === 0 ? BRAND.white : BRAND.silver;
      const createdAt = parseDate(row.createdAt);
      const firstResponseAt = parseDate(row.firstResponseAt);
      const updatedAt = parseDate(row.updatedAt);
      const openAgeHours = row.resolutionMinutes === null ? Number((((diffMinutes(row.createdAt, generatedAt.toISOString()) || 0) as number) / 60).toFixed(1)) : null;
      const values = [
        row.advisoryId,
        row.ticketId || 'Sin ticket',
        row.status,
        row.requester,
        row.resolver || 'Sin resolver',
        row.platform || 'Sin plataforma',
        row.typeLabel,
        row.waitingOn,
        createdAt,
        firstResponseAt,
        row.firstResponseMinutes,
        row.firstResponseMinutes === null ? null : Number((row.firstResponseMinutes / 60).toFixed(1)),
        updatedAt,
        row.resolutionMinutes,
        row.resolutionMinutes === null ? null : Number((row.resolutionMinutes / 60).toFixed(1)),
        openAgeHours,
        row.messageCount,
        row.responseCount,
        row.attachmentCount,
        row.evidenceTags.join(', '),
        RESPONSE_BUCKET_LABEL_BY_MINUTES(row.firstResponseMinutes),
        RESOLUTION_BUCKET_LABEL_BY_MINUTES(row.resolutionMinutes),
        row.inquiry,
      ];

      values.forEach((value, cellIndex) => {
        const cell = setCellValue(worksheet, currentRow, cellIndex + 1, value as string | number | Date | null, {
          font: {
            name: FONT_BODY,
            size: 10,
            color: { argb: argb(BRAND.ink) },
            bold: cellIndex === 0 || cellIndex === 2,
          },
          fill: panelFill(fillColor),
          border: softBorder(),
          alignment: {
            vertical: 'top',
            horizontal: cellIndex >= 8 && cellIndex <= 18 ? 'center' : 'left',
            wrapText: cellIndex === 22 || cellIndex === 19 || cellIndex === 6,
          },
        });

        if ([8, 9, 12].includes(cellIndex) && value instanceof Date) {
          cell.numFmt = DATE_TIME_FORMAT;
        }
        if ([10, 11, 13, 14, 15, 16, 17, 18].includes(cellIndex) && typeof value === 'number') {
          cell.numFmt = cellIndex === 11 || cellIndex === 14 || cellIndex === 15 ? '0.0' : '#,##0';
        }
      });

      worksheet.getRow(currentRow).height = row.inquiry.length > 180 ? 48 : 30;
    });

  worksheet.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: 2, column: headers.length },
  };
};

const triggerDownload = (buffer: ArrayBuffer | Uint8Array, fileName: string) => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const safeBytes = Uint8Array.from(bytes);
  const blob = new Blob([safeBytes.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const downloadAdvisoryMetricsWorkbook = async (payload: AdvisoryMetricsExportPayload) => {
  const excelJSImport = await import('exceljs');
  const ExcelJS = ((excelJSImport as unknown as { default?: typeof import('exceljs') }).default ||
    excelJSImport) as typeof import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BioSystems ORION';
  workbook.lastModifiedBy = 'BioSystems ORION';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const stats = deriveWorkbookStats(payload);
  await writeDashboard(workbook, payload, stats);
  writeAnalysisSheet(workbook, payload, stats);
  writeDetailSheet(workbook, payload);

  const buffer = await workbook.xlsx.writeBuffer();
  const generatedAt = payload.generatedAtIso || new Date().toISOString();
  triggerDownload(
    buffer,
    `orion_metricas_asesorias_${buildExportSlug(payload.areaLabel)}_${buildFileStamp(generatedAt)}.xlsx`,
  );
};
