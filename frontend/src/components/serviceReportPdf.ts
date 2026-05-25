import jsPDF from 'jspdf';
import logoDataUrl from '../assets/orion-imagotipo.png?inline';
import {
  getSpecialClientReferenceLabel,
  resolveServiceReportReference,
  type ServiceReportFormData,
  type ServiceReportStatus,
} from './serviceReports';
import {
  formatMaterialExpirationLabel,
  isMeaningfulServiceReportMaterialItem,
  resolveMaterialExpirationState,
} from './gs1DataMatrix';

const COLORS = {
  ink: [25, 28, 34] as const,
  muted: [103, 112, 125] as const,
  line: [218, 224, 231] as const,
  paper: [247, 249, 252] as const,
  shell: [255, 255, 255] as const,
  shellMuted: [255, 239, 243] as const,
  accent: [168, 16, 42] as const,
  accentSoft: [248, 234, 238] as const,
  slate: [37, 42, 51] as const,
  successSoft: [233, 245, 237] as const,
  successInk: [32, 110, 66] as const,
  warnSoft: [253, 245, 227] as const,
  warnInk: [146, 93, 0] as const,
};

const PAGE = {
  width: 595.28,
  height: 841.89,
  marginX: 24,
  marginY: 18,
  footer: 18,
};

const DENSITY = {
  sectionGap: 10,
  blockGap: 8,
  gridGap: 8,
  headerHeight: 86,
  badgeWidth: 156,
  metricHeight: 36,
  signatureHeight: 80,
  sectionHeaderContentGap: 16,
};

const SERVICE_TYPE_LABELS: Record<ServiceReportFormData['serviceType'], string> = {
  preventivo: 'Preventivo',
  correctivo: 'Correctivo',
  instalacion: 'Instalacion',
  capacitacion: 'Capacitacion',
  emergencia: 'Emergencia',
  otro: 'Otro',
};

const STATUS_LABELS: Record<ServiceReportStatus, string> = {
  borrador: 'Borrador',
  registrado: 'Registrado',
  requiere_visita: 'Requiere visita',
};

const REPORT_TYPE_LABELS: Record<ServiceReportFormData['reportType'], string> = {
  servicio: 'Servicio presencial',
  remoto: 'Soporte remoto',
};

interface GenerateServiceReportPdfOptions {
  status: ServiceReportStatus;
  reportId: string;
  generatedAt?: Date;
}

interface GenerateServiceReportPdfResult {
  blob: Blob;
  fileName: string;
  title: string;
}

const sanitizeFileName = (value: string) => value.replace(/[^a-zA-Z0-9._-]+/g, '-');

const pad = (value: number) => value.toString().padStart(2, '0');

const formatDate = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return 'Sin fecha';
  const [year, month, day] = raw.split('-');
  if (!year || !month || !day) return raw;
  return `${day}/${month}/${year}`;
};

const formatTime = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return 'Sin hora';
  return raw.slice(0, 5);
};

const formatDateTime = (value: Date) =>
  `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()} ${pad(value.getHours())}:${pad(value.getMinutes())}`;

const minutesFromTime = (value: string) => {
  const [hoursText, minutesText] = String(value || '').split(':');
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
};

const formatDuration = (startedAt: string, endedAt: string) => {
  const start = minutesFromTime(startedAt);
  const end = minutesFromTime(endedAt);

  if (start === null || end === null || end < start) {
    return 'Sin duracion confiable';
  }

  const total = end - start;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }

  if (minutes === 0) {
    return `${hours} h`;
  }

  return `${hours} h ${minutes} min`;
};

const valueOrFallback = (value: unknown, fallback = 'Sin definir') => {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
};

const formatCodeDescription = (code: string, description: string, fallback = 'Sin dato codificado') => {
  const normalizedCode = code.trim();
  const normalizedDescription = description.trim();

  if (normalizedCode && normalizedDescription) {
    return `${normalizedCode} · ${normalizedDescription}`;
  }

  return normalizedCode || normalizedDescription || fallback;
};

const setFill = (doc: jsPDF, color: readonly [number, number, number]) => {
  doc.setFillColor(color[0], color[1], color[2]);
};

const setDraw = (doc: jsPDF, color: readonly [number, number, number]) => {
  doc.setDrawColor(color[0], color[1], color[2]);
};

const setText = (doc: jsPDF, color: readonly [number, number, number]) => {
  doc.setTextColor(color[0], color[1], color[2]);
};

const getLogoDataUrl = async () => (logoDataUrl.trim() ? logoDataUrl : null);

const wrapText = (doc: jsPDF, value: string, width: number, fontSize: number) => {
  doc.setFontSize(fontSize);
  return doc.splitTextToSize(valueOrFallback(value), width) as string[];
};

const fitTextBlock = (
  doc: jsPDF,
  value: string,
  width: number,
  options: {
    preferredSize: number;
    minSize: number;
    maxLines?: number;
    step?: number;
  },
) => {
  const maxLines = options.maxLines ?? 1;
  const step = options.step ?? 0.2;

  for (let lineTarget = 1; lineTarget <= maxLines; lineTarget += 1) {
    for (let size = options.preferredSize; size >= options.minSize; size -= step) {
      const lines = wrapText(doc, value, width, size);
      if (lines.length <= lineTarget) {
        return { fontSize: size, lines };
      }
    }
  }

  return {
    fontSize: options.minSize,
    lines: wrapText(doc, value, width, options.minSize).slice(0, maxLines),
  };
};

const estimateTextHeight = (lineCount: number, lineHeight: number, padding = 0) =>
  Math.max(1, lineCount) * lineHeight + padding;

const estimateNarrativeBlockHeight = (
  doc: jsPDF,
  width: number,
  value: string,
  options: {
    minHeight?: number;
    lineHeight?: number;
    paddingBottom?: number;
    valueOffsetY?: number;
    valueFontSize?: number;
  } = {},
) => {
  const valueFontSize = options.valueFontSize ?? 9.4;
  const lineHeight = options.lineHeight ?? 10.5;
  const minHeight = options.minHeight ?? 46;
  const paddingBottom = options.paddingBottom ?? 22;
  const valueOffsetY = options.valueOffsetY ?? 22;
  const lines = wrapText(doc, value, width - 20, valueFontSize);

  return Math.max(minHeight, estimateTextHeight(lines.length, lineHeight, valueOffsetY + paddingBottom - lineHeight));
};

const renderFooter = (doc: jsPDF, generatedAt: Date) => {
  const totalPages = doc.getNumberOfPages();

  for (let pageIndex = 1; pageIndex <= totalPages; pageIndex += 1) {
    doc.setPage(pageIndex);
    setDraw(doc, COLORS.line);
    doc.setLineWidth(0.45);
    doc.line(PAGE.marginX, PAGE.height - PAGE.footer - 6, PAGE.width - PAGE.marginX, PAGE.height - PAGE.footer - 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setText(doc, COLORS.muted);
    doc.text(
      `Documento generado automaticamente por Orion el ${formatDateTime(generatedAt)}`,
      PAGE.marginX,
      PAGE.height - PAGE.footer + 5,
    );
    doc.text(`Pagina ${pageIndex} de ${totalPages}`, PAGE.width - PAGE.marginX, PAGE.height - PAGE.footer + 5, {
      align: 'right',
    });
  }
};

const renderMetricCard = (
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  soft = false,
) => {
  setFill(doc, soft ? COLORS.accentSoft : COLORS.paper);
  setDraw(doc, COLORS.line);
  doc.roundedRect(x, y, width, DENSITY.metricHeight, 8, 8, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setText(doc, COLORS.muted);
  doc.text(label.toUpperCase(), x + 10, y + 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  setText(doc, soft ? COLORS.accent : COLORS.ink);
  const lines = wrapText(doc, value, width - 20, 10.5).slice(0, 2);
  doc.text(lines, x + 10, y + 24);
};

const renderSectionHeader = (doc: jsPDF, y: number, title: string, subtitle?: string) => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setText(doc, COLORS.ink);
  doc.text(title, PAGE.marginX, y);

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setText(doc, COLORS.muted);
    doc.text(subtitle, PAGE.marginX, y + 9);
  }
};

interface GridOptions {
  columns?: number;
  gap?: number;
  minHeight?: number;
  labelFontSize?: number;
  valueFontSize?: number;
  lineHeight?: number;
  paddingX?: number;
  labelOffsetY?: number;
  valueOffsetY?: number;
  radius?: number;
}

interface FactsCardOptions {
  columns?: number;
  gap?: number;
  rowGap?: number;
  minRowHeight?: number;
  bottomPadding?: number;
  paddingX?: number;
  paddingY?: number;
  labelFontSize?: number;
  valueFontSize?: number;
  lineHeight?: number;
  labelOffsetY?: number;
  valueOffsetY?: number;
  radius?: number;
  tone?: 'default' | 'accent';
}

const renderFieldGrid = (
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  fields: Array<{ label: string; value: string; span?: number }>,
  options: GridOptions = {},
) => {
  const columns = options.columns || 2;
  const gap = options.gap ?? DENSITY.gridGap;
  const minHeight = options.minHeight ?? 34;
  const labelFontSize = options.labelFontSize ?? 6.9;
  const valueFontSize = options.valueFontSize ?? 9.4;
  const lineHeight = options.lineHeight ?? 10;
  const paddingX = options.paddingX ?? 10;
  const labelOffsetY = options.labelOffsetY ?? 11;
  const valueOffsetY = options.valueOffsetY ?? 22;
  const radius = options.radius ?? 8;
  const columnWidth = (width - gap * (columns - 1)) / columns;
  let cursorY = y;

  for (let index = 0; index < fields.length; ) {
    const rowFields: Array<{ label: string; value: string; span?: number }> = [];
    let occupied = 0;

    while (index < fields.length) {
      const nextField = fields[index];
      const span = Math.max(1, Math.min(columns, Number(nextField.span || 1)));
      if (occupied + span > columns) {
        break;
      }
      rowFields.push(nextField);
      occupied += span;
      index += 1;
      if (occupied === columns) {
        break;
      }
    }

    const rowHeight = rowFields.reduce((maxHeight, field) => {
      const span = Math.max(1, Math.min(columns, Number(field.span || 1)));
      const cellWidth = columnWidth * span + gap * (span - 1);
      const lines = wrapText(doc, field.value, cellWidth - paddingX * 2, valueFontSize);
      return Math.max(maxHeight, estimateTextHeight(lines.length, lineHeight, valueOffsetY + 8));
    }, minHeight);

    let cursorX = x;
    rowFields.forEach((field) => {
      const span = Math.max(1, Math.min(columns, Number(field.span || 1)));
      const cellWidth = columnWidth * span + gap * (span - 1);
      setFill(doc, COLORS.shell);
      setDraw(doc, COLORS.line);
      doc.roundedRect(cursorX, cursorY, cellWidth, rowHeight, radius, radius, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(labelFontSize);
      setText(doc, COLORS.muted);
      doc.text(field.label.toUpperCase(), cursorX + paddingX, cursorY + labelOffsetY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(valueFontSize);
      setText(doc, COLORS.ink);
      doc.text(wrapText(doc, field.value, cellWidth - paddingX * 2, valueFontSize), cursorX + paddingX, cursorY + valueOffsetY);

      cursorX += cellWidth + gap;
    });

    cursorY += rowHeight + gap;
  }

  return cursorY;
};

const renderFactsCard = (
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  fields: Array<{ label: string; value: string; span?: number }>,
  options: FactsCardOptions = {},
) => {
  const columns = options.columns || 3;
  const gap = options.gap ?? 10;
  const rowGap = options.rowGap ?? 2;
  const minRowHeight = options.minRowHeight ?? 21.5;
  const bottomPadding = options.bottomPadding ?? 0.8;
  const paddingX = options.paddingX ?? 12;
  const paddingY = options.paddingY ?? 3.5;
  const labelFontSize = options.labelFontSize ?? 6.3;
  const valueFontSize = options.valueFontSize ?? 8.4;
  const lineHeight = options.lineHeight ?? 8;
  const labelOffsetY = options.labelOffsetY ?? 5.8;
  const valueOffsetY = options.valueOffsetY ?? 15.4;
  const radius = options.radius ?? 10;
  const tone = options.tone || 'default';
  const columnWidth = (width - paddingX * 2 - gap * (columns - 1)) / columns;

  const rows: Array<{
    fields: Array<{ label: string; value: string; span: number; lines: string[]; width: number }>;
    height: number;
  }> = [];

  for (let index = 0; index < fields.length; ) {
    const rowFields: Array<{ label: string; value: string; span: number; lines: string[]; width: number }> = [];
    let occupied = 0;

    while (index < fields.length) {
      const nextField = fields[index];
      const span = Math.max(1, Math.min(columns, Number(nextField.span || 1)));
      if (occupied + span > columns) {
        break;
      }

      const cellWidth = columnWidth * span + gap * (span - 1);
      rowFields.push({
        label: nextField.label,
        value: nextField.value,
        span,
        lines: wrapText(doc, nextField.value, cellWidth, valueFontSize),
        width: cellWidth,
      });
      occupied += span;
      index += 1;

      if (occupied === columns) {
        break;
      }
    }

    const rowHeight = rowFields.reduce(
      (maxHeight, field) => Math.max(maxHeight, estimateTextHeight(field.lines.length, lineHeight, valueOffsetY + bottomPadding)),
      minRowHeight,
    );

    rows.push({ fields: rowFields, height: rowHeight });
  }

  const totalHeight =
    paddingY * 2 + rows.reduce((sum, row, rowIndex) => sum + row.height + (rowIndex > 0 ? rowGap : 0), 0);

  setFill(doc, tone === 'accent' ? COLORS.accentSoft : COLORS.shell);
  setDraw(doc, COLORS.line);
  doc.roundedRect(x, y, width, totalHeight, radius, radius, 'FD');

  let cursorY = y + paddingY;

  rows.forEach((row, rowIndex) => {
    if (rowIndex > 0) {
      setDraw(doc, COLORS.line);
      doc.setLineWidth(0.4);
      doc.line(x + paddingX, cursorY - rowGap / 2, x + width - paddingX, cursorY - rowGap / 2);
    }

    let cursorX = x + paddingX;

    row.fields.forEach((field, fieldIndex) => {
      if (fieldIndex > 0) {
        setDraw(doc, COLORS.line);
        doc.setLineWidth(0.35);
        doc.line(cursorX - gap / 2, cursorY + 1, cursorX - gap / 2, cursorY + row.height - 3);
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(labelFontSize);
      setText(doc, tone === 'accent' ? COLORS.accent : COLORS.muted);
      doc.text(field.label.toUpperCase(), cursorX, cursorY + labelOffsetY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(valueFontSize);
      setText(doc, COLORS.ink);
      doc.text(field.lines, cursorX, cursorY + valueOffsetY);

      cursorX += field.width + gap;
    });

    cursorY += row.height + rowGap;
  });

  return y + totalHeight;
};

const renderNarrativeBlock = (
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  title: string,
  value: string,
  tone: 'default' | 'accent' = 'default',
  options: {
    minHeight?: number;
    lineHeight?: number;
    paddingBottom?: number;
    labelOffsetY?: number;
    valueOffsetY?: number;
    valueFontSize?: number;
  } = {},
) => {
  const valueFontSize = options.valueFontSize ?? 9.4;
  const labelOffsetY = options.labelOffsetY ?? 12;
  const valueOffsetY = options.valueOffsetY ?? 22;
  const lines = wrapText(doc, value, width - 20, valueFontSize);
  const height = estimateNarrativeBlockHeight(doc, width, value, options);

  setFill(doc, tone === 'accent' ? COLORS.accentSoft : COLORS.shell);
  setDraw(doc, COLORS.line);
  doc.roundedRect(x, y, width, height, 10, 10, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  setText(doc, tone === 'accent' ? COLORS.accent : COLORS.muted);
  doc.text(title.toUpperCase(), x + 10, y + labelOffsetY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(valueFontSize);
  setText(doc, COLORS.ink);
  doc.text(lines, x + 10, y + valueOffsetY);

  return y + height;
};

const renderMaterialsTable = (
  doc: jsPDF,
  startY: number,
  items: ServiceReportFormData['materialsUsed'],
) => {
  const meaningfulItems = items.filter(isMeaningfulServiceReportMaterialItem);
  let cursorY = startY;
  const columns = [
    { key: 'product', label: 'Producto / tipo', width: 146 },
    { key: 'trace', label: 'Trazabilidad', width: 138 },
    { key: 'quantity', label: 'Cant.', width: 38 },
    { key: 'notes', label: 'Notas', width: 201.28 },
  ] as const;

  if (meaningfulItems.length === 0) {
    return renderNarrativeBlock(
      doc,
      PAGE.marginX,
      cursorY,
      PAGE.width - PAGE.marginX * 2,
      'Materiales utilizados',
      'No se registraron reactivos, consumibles ni refacciones en este reporte.',
      'default',
      {
        minHeight: 30,
        lineHeight: 8.9,
        paddingBottom: 8,
        labelOffsetY: 10.5,
        valueOffsetY: 18.5,
        valueFontSize: 8.7,
      },
    );
  }

  const renderTableHeader = () => {
    setFill(doc, COLORS.paper);
    setDraw(doc, COLORS.line);
    doc.roundedRect(PAGE.marginX, cursorY, PAGE.width - PAGE.marginX * 2, 20, 8, 8, 'FD');

    let cursorX = PAGE.marginX;
    columns.forEach((column) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      setText(doc, COLORS.muted);
      doc.text(column.label.toUpperCase(), cursorX + 8, cursorY + 13);
      cursorX += column.width;
    });

    cursorY += 22;
  };

  renderTableHeader();

  meaningfulItems.forEach((item) => {
    const productText = [valueOrFallback(item.productName, 'Sin producto'), item.kind ? `Tipo: ${item.kind}` : '']
      .filter(Boolean)
      .join('\n');
    const traceParts = [
      item.referenceCode ? `REF ${item.referenceCode}` : 'Sin REF',
      item.lotNumber ? `Lote ${item.lotNumber}` : 'Sin lote',
      item.expiresOn
        ? `${formatMaterialExpirationLabel(resolveMaterialExpirationState(item.expiresOn))} ${item.expiresOn}`
        : 'Sin caducidad',
    ];
    const traceText = traceParts.join('\n');
    const notesText = valueOrFallback(item.notes, item.catalogMatched ? 'Reconocido por catalogo Orion.' : 'Sin notas.');
    const productLines = wrapText(doc, productText, columns[0].width - 16, 8.7);
    const traceLines = wrapText(doc, traceText, columns[1].width - 16, 8.4);
    const quantityLines = wrapText(doc, String(item.quantity || 1), columns[2].width - 16, 8.8);
    const notesLines = wrapText(doc, notesText, columns[3].width - 16, 8.4);
    const rowHeight =
      Math.max(
        estimateTextHeight(productLines.length, 9.5),
        estimateTextHeight(traceLines.length, 9.5),
        estimateTextHeight(quantityLines.length, 9.5),
        estimateTextHeight(notesLines.length, 9.5),
      ) + 14;

    if (cursorY + rowHeight > PAGE.height - PAGE.marginY - PAGE.footer - 10) {
      doc.addPage();
      cursorY = PAGE.marginY;
      renderTableHeader();
    }

    setFill(doc, COLORS.shell);
    setDraw(doc, COLORS.line);
    doc.roundedRect(PAGE.marginX, cursorY, PAGE.width - PAGE.marginX * 2, rowHeight, 8, 8, 'FD');

    let cursorX = PAGE.marginX;
    [
      { lines: productLines, width: columns[0].width, size: 8.7 },
      { lines: traceLines, width: columns[1].width, size: 8.4 },
      { lines: quantityLines, width: columns[2].width, size: 8.8 },
      { lines: notesLines, width: columns[3].width, size: 8.4 },
    ].forEach((cell) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(cell.size);
      setText(doc, COLORS.ink);
      doc.text(cell.lines, cursorX + 8, cursorY + 12);
      cursorX += cell.width;
    });

    cursorY += rowHeight + 6;
  });

  return cursorY;
};

const renderSignatureCard = (
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  title: string,
  name: string,
  signatureDataUrl: string,
) => {
  const height = DENSITY.signatureHeight;

  setFill(doc, COLORS.shell);
  setDraw(doc, COLORS.line);
  doc.roundedRect(x, y, width, height, 10, 10, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setText(doc, COLORS.muted);
  doc.text(title.toUpperCase(), x + 10, y + 12);

  if (signatureDataUrl.trim()) {
    try {
      doc.addImage(signatureDataUrl, 'PNG', x + 14, y + 18, width - 28, 34, undefined, 'FAST');
    } catch {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.4);
      setText(doc, COLORS.muted);
      doc.text('No se pudo renderizar la firma en este PDF.', x + 10, y + 36);
    }
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.4);
    setText(doc, COLORS.muted);
    doc.text('Firma no capturada.', x + 10, y + 36);
  }

  setDraw(doc, COLORS.line);
  doc.line(x + 10, y + 58, x + width - 10, y + 58);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  setText(doc, COLORS.ink);
  doc.text(valueOrFallback(name), x + 10, y + 72);

  return y + height;
};

export const buildServiceReportPdfFileName = (form: ServiceReportFormData) => {
  const reference = resolveServiceReportReference(form);
  return sanitizeFileName(`${reference}.pdf`);
};

export const generateServiceReportPdf = async (
  form: ServiceReportFormData,
  options: GenerateServiceReportPdfOptions,
): Promise<GenerateServiceReportPdfResult> => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
    compress: true,
  });
  const generatedAt = options.generatedAt || new Date();
  const reportReference = resolveServiceReportReference(form);
  const fileName = buildServiceReportPdfFileName(form);
  const title = `${REPORT_TYPE_LABELS[form.reportType]} ${reportReference}`;
  const contentWidth = PAGE.width - PAGE.marginX * 2;
  const metricGap = DENSITY.gridGap;
  const metricWidth = (contentWidth - metricGap * 2) / 3;
  const gridGap = DENSITY.gridGap;
  const halfWidth = (contentWidth - gridGap) / 2;
  const logoDataUrl = await getLogoDataUrl();
  const hasVersionInfo =
    form.softwareVersion.trim() ||
    form.firmwareVersion.trim() ||
    form.serviceSoftwareVersion.trim();

  let cursorY = PAGE.marginY;

  const ensureSpace = (height: number) => {
    if (cursorY + height <= PAGE.height - PAGE.marginY - PAGE.footer) {
      return;
    }

    doc.addPage();
    cursorY = PAGE.marginY;
  };

  setFill(doc, COLORS.slate);
  doc.roundedRect(PAGE.marginX, cursorY, contentWidth, DENSITY.headerHeight, 16, 16, 'F');

  setFill(doc, COLORS.accent);
  doc.roundedRect(PAGE.marginX + contentWidth - DENSITY.badgeWidth, cursorY, DENSITY.badgeWidth, DENSITY.headerHeight, 16, 16, 'F');

  const headerContentX = PAGE.marginX + 14;
  const headerContentWidth = contentWidth - DENSITY.badgeWidth - 28;
  const headerCenterY = cursorY + DENSITY.headerHeight / 2;
  const logoWidth = 128;
  const logoHeight = 39.6;
  const logoX = headerContentX;
  const logoY = cursorY + (DENSITY.headerHeight - logoHeight) / 2;
  const textX = logoX + logoWidth + 14;
  const textWidth = Math.max(150, headerContentWidth - logoWidth - 14);

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', logoX, logoY, logoWidth, logoHeight, undefined, 'FAST');
    } catch {
      // no-op
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  setText(doc, COLORS.shell);
  doc.text('Reporte de servicio', textX, headerCenterY - 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.9);
  doc.text(
    wrapText(
      doc,
      form.reportType === 'servicio'
        ? 'Formato tecnico de campo con trazabilidad, firmas y materiales.'
        : 'Formato operativo para soporte remoto y continuidad del caso.',
      textWidth,
      7.9,
    ),
    textX,
    headerCenterY + 10,
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setText(doc, COLORS.shellMuted);
  const badgeTextX = PAGE.width - PAGE.marginX - (DENSITY.badgeWidth - 12);
  const badgeTextWidth = DENSITY.badgeWidth - 24;
  doc.text('FOLIO', badgeTextX, cursorY + 18);

  doc.setFont('helvetica', 'bold');
  setText(doc, COLORS.shell);
  const badgeReference = fitTextBlock(doc, reportReference, badgeTextWidth, {
    preferredSize: 12.2,
    minSize: 9.2,
    maxLines: 2,
  });
  doc.setFontSize(badgeReference.fontSize);
  badgeReference.lines.forEach((line, index) => {
    doc.text(line, badgeTextX, cursorY + 32 + index * 10.2);
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.text(`Estado: ${STATUS_LABELS[options.status]}`, badgeTextX, cursorY + 54);
  doc.text(`Reporte: ${options.reportId.slice(0, 8).toUpperCase()}`, badgeTextX, cursorY + 65);
  doc.text(`Emitido: ${formatDateTime(generatedAt)}`, badgeTextX, cursorY + 76);

  cursorY += DENSITY.headerHeight + DENSITY.sectionGap;

  renderMetricCard(doc, PAGE.marginX, cursorY, metricWidth, 'Ingeniero', valueOrFallback(form.engineerName), true);
  renderMetricCard(
    doc,
    PAGE.marginX + metricWidth + metricGap,
    cursorY,
    metricWidth,
    'Servicio',
    `${REPORT_TYPE_LABELS[form.reportType]} · ${SERVICE_TYPE_LABELS[form.serviceType] || 'Operativo'}`,
  );
  renderMetricCard(
    doc,
    PAGE.marginX + (metricWidth + metricGap) * 2,
    cursorY,
    metricWidth,
    'Ventana',
    `${formatTime(form.startedAt)} - ${formatTime(form.endedAt)} · ${formatDuration(form.startedAt, form.endedAt)}`,
  );

  cursorY += DENSITY.metricHeight + DENSITY.sectionGap;
  ensureSpace(118);
  renderSectionHeader(doc, cursorY, 'Cliente y sitio', 'La visita queda asociada a cliente, contacto y direccion operativa.');
  cursorY += DENSITY.sectionHeaderContentGap;
  cursorY = renderFactsCard(doc, PAGE.marginX, cursorY, contentWidth, [
    { label: 'Cliente / sitio', value: valueOrFallback(form.clientName) },
    { label: 'Unidad / negocio', value: valueOrFallback(form.businessUnitName, 'Sin unidad capturada') },
    { label: 'Contacto en sitio', value: valueOrFallback(form.siteContact || form.specialUserName) },
    { label: 'Telefono', value: valueOrFallback(form.sitePhone) },
    { label: 'Direccion operativa', value: valueOrFallback(form.siteAddress), span: 2 },
  ], {
    columns: 2,
    gap: 12,
    rowGap: 2,
    minRowHeight: 21.5,
    bottomPadding: 0.8,
    paddingY: 3.5,
    valueFontSize: 8.4,
    lineHeight: 8,
    labelOffsetY: 5.8,
    valueOffsetY: 15.4,
  });

  ensureSpace(150);
  renderSectionHeader(doc, cursorY + 2, 'Equipo e intervencion', 'Orden, serie, referencias y versiones capturadas en campo.');
  cursorY += DENSITY.sectionHeaderContentGap;
  const equipmentFacts = [
    { label: 'Tipo de reporte', value: REPORT_TYPE_LABELS[form.reportType] },
    { label: 'Tipo de servicio', value: SERVICE_TYPE_LABELS[form.serviceType] || 'Otro' },
    { label: 'Serie del equipo', value: valueOrFallback(form.equipmentSerial) },
    { label: 'Equipo / analizador', value: valueOrFallback(form.equipmentName) },
    { label: 'Fecha de servicio', value: formatDate(form.reportType === 'servicio' ? form.serviceDate : form.callDate) },
    { label: 'Folio operativo', value: valueOrFallback(form.serviceReference || reportReference) },
    { label: 'Ticket relacionado', value: valueOrFallback(form.serviceTicketId, 'Sin ticket ligado'), span: 3 },
    {
      label: 'Averia codificada',
      value: formatCodeDescription(form.diagnosticCode, form.diagnosticLabel),
      span: 3,
    },
    {
      label: 'Solucion codificada',
      value: formatCodeDescription(form.solutionCode, form.solutionLabel),
      span: 3,
    },
    ...(hasVersionInfo
      ? [
          {
            label: 'Software reportado',
            value: form.softwareVersion || 'Sin dato',
          },
          {
            label: 'Firmware reportado',
            value: form.firmwareVersion || 'Sin dato',
          },
          {
            label: 'Software de servicio',
            value: valueOrFallback(form.serviceSoftwareVersion, 'Sin dato'),
          },
        ]
      : []),
  ];

  cursorY = renderFactsCard(doc, PAGE.marginX, cursorY, contentWidth, equipmentFacts, {
      columns: 3,
      rowGap: 2,
      minRowHeight: 21.5,
      bottomPadding: 0.8,
      paddingY: 3.5,
      valueFontSize: 8.4,
      lineHeight: 8,
      labelOffsetY: 5.8,
      valueOffsetY: 15.4,
      tone: 'default',
    });

  if (form.specialClientCode) {
    ensureSpace(90);
    cursorY = renderFieldGrid(doc, PAGE.marginX, cursorY, contentWidth, [
      {
        label: getSpecialClientReferenceLabel(form.specialClientCode),
        value: valueOrFallback(form.specialReferenceValue),
      },
      {
        label: 'Formato especial',
        value: form.specialClientCode.toUpperCase(),
      },
    ], { minHeight: 30 });
  }

  ensureSpace(170);
  renderSectionHeader(doc, cursorY + 2, 'Diagnostico y cierre tecnico');
  cursorY += 15;

  const leftBlockBottom = renderNarrativeBlock(
    doc,
    PAGE.marginX,
    cursorY,
    halfWidth,
    form.reportType === 'servicio' ? 'Diagnostico' : 'Asunto / diagnostico',
    valueOrFallback(form.diagnosticLabel || form.subject),
    'accent',
  );
  const rightBlockBottom = renderNarrativeBlock(
    doc,
    PAGE.marginX + halfWidth + gridGap,
    cursorY,
    halfWidth,
    'Hallazgos / trabajo realizado',
    valueOrFallback(form.comments, 'Sin comentarios capturados.'),
  );
  cursorY = Math.max(leftBlockBottom, rightBlockBottom) + DENSITY.blockGap;

  ensureSpace(100);
  cursorY = renderNarrativeBlock(
    doc,
    PAGE.marginX,
    cursorY,
    contentWidth,
    form.reportType === 'servicio' ? 'Solucion aplicada' : 'Resolucion remota / siguiente accion',
    valueOrFallback(form.solution, 'Sin solucion asentada.'),
    'accent',
  );
  cursorY += DENSITY.blockGap;

  if (form.versionDiscrepancyExplanation.trim()) {
    ensureSpace(84);
    cursorY =
      renderNarrativeBlock(
        doc,
        PAGE.marginX,
        cursorY,
        contentWidth,
        'Justificacion de versiones',
        form.versionDiscrepancyExplanation,
      ) + 12;
  }

  ensureSpace(120);
  renderSectionHeader(doc, cursorY + 2, 'Materiales y trazabilidad', 'Reactivos, consumibles o refacciones capturados durante la atencion.');
  cursorY += DENSITY.sectionHeaderContentGap;
  cursorY = renderMaterialsTable(doc, cursorY, form.materialsUsed) + DENSITY.blockGap;

  if (form.reportType === 'servicio' || form.signatureDataUrl.trim() || form.clientSignatureDataUrl.trim()) {
    const signatureSectionHeight = 13 + DENSITY.signatureHeight + DENSITY.blockGap + 6;
    ensureSpace(signatureSectionHeight);
    renderSectionHeader(doc, cursorY + 2, 'Firmas');
    cursorY += 13;
    const signatureWidth = (contentWidth - gridGap) / 2;
    const leftSignatureBottom = renderSignatureCard(
      doc,
      PAGE.marginX,
      cursorY,
      signatureWidth,
      'Ingeniero responsable',
      form.engineerName,
      form.signatureDataUrl,
    );
    const rightSignatureBottom = renderSignatureCard(
      doc,
      PAGE.marginX + signatureWidth + gridGap,
      cursorY,
      signatureWidth,
      'Cliente / responsable del sitio',
      form.siteContact || form.specialUserName || form.clientName,
      form.clientSignatureDataUrl,
    );
    cursorY = Math.max(leftSignatureBottom, rightSignatureBottom) + DENSITY.blockGap;
  }

  const clientComments = valueOrFallback(form.clientComments, 'Sin comentarios del cliente.');
  const clientCommentsOptions = {
    minHeight: 36,
    lineHeight: 9.4,
    paddingBottom: 10,
    labelOffsetY: 11,
    valueOffsetY: 19,
    valueFontSize: 8.9,
  } as const;
  const clientCommentsHeight = estimateNarrativeBlockHeight(doc, contentWidth, clientComments, clientCommentsOptions);
  ensureSpace(clientCommentsHeight + 4);
  cursorY = renderNarrativeBlock(
    doc,
    PAGE.marginX,
    cursorY,
    contentWidth,
    'Comentarios del cliente',
    clientComments,
    'default',
    clientCommentsOptions,
  );
  cursorY += 4;

  renderFooter(doc, generatedAt);

  return {
    blob: doc.output('blob'),
    fileName,
    title,
  };
};
