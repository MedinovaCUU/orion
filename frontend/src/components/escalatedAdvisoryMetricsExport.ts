import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

export interface AdvisoryMetricsValueRow {
  label: string;
  value: number;
}

export interface AdvisoryMetricsTrainerRow {
  label: string;
  assigned: number;
  responded: number;
  avgFirstResponseMinutes: number | null;
}

export interface AdvisoryMetricsHeatmapRow {
  requester: string;
  type: string;
  count: number;
}

export interface AdvisoryMetricsTimelineRow {
  label: string;
  created: number;
  replied: number;
  closed: number;
}

export interface AdvisoryMetricsExportPayload {
  areaLabel: string;
  scopeLabel: string;
  generatedAt: string;
  summary: {
    total: number;
    averageFirstResponseLabel: string;
    evidenceCoverage: number;
    waitingOnTrainer: number;
  };
  statusRows: AdvisoryMetricsValueRow[];
  waitingRows: AdvisoryMetricsValueRow[];
  trainerRows: AdvisoryMetricsTrainerRow[];
  heatmapRows: AdvisoryMetricsHeatmapRow[];
  timelineRows: AdvisoryMetricsTimelineRow[];
}

const BRAND = {
  red: [168, 16, 42] as const,
  redSoft: [249, 237, 240] as const,
  silver: [244, 246, 249] as const,
  silverLine: [217, 223, 230] as const,
  ink: [30, 35, 42] as const,
  muted: [103, 112, 125] as const,
  teal: [59, 132, 158] as const,
  tealSoft: [235, 246, 250] as const,
  green: [36, 125, 78] as const,
  greenSoft: [234, 247, 239] as const,
  amber: [163, 111, 17] as const,
  amberSoft: [252, 245, 227] as const,
} as const;

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

const setFill = (doc: jsPDF, color: readonly [number, number, number]) => {
  doc.setFillColor(color[0], color[1], color[2]);
};

const setDraw = (doc: jsPDF, color: readonly [number, number, number]) => {
  doc.setDrawColor(color[0], color[1], color[2]);
};

const setText = (doc: jsPDF, color: readonly [number, number, number]) => {
  doc.setTextColor(color[0], color[1], color[2]);
};

const formatMinutesLabel = (value: number | null) => {
  if (value === null || Number.isNaN(value)) {
    return 'Sin respuesta';
  }

  if (value < 60) {
    return `${value} min`;
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
};

const buildExportSlug = (areaLabel: string) =>
  areaLabel
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const buildFileStamp = (generatedAt: string) =>
  generatedAt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

const addCellStyles = (sheet: XLSX.WorkSheet, columnWidths: number[]) => {
  sheet['!cols'] = columnWidths.map((wch) => ({ wch }));
};

export const downloadAdvisoryMetricsExcel = (payload: AdvisoryMetricsExportPayload) => {
  const workbook = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ['BioSystems', 'ORION · Métricas de asesoría'],
    ['Área', payload.areaLabel],
    ['Alcance', payload.scopeLabel],
    ['Generado', payload.generatedAt],
    [],
    ['Indicador', 'Valor'],
    ['Casos analizados', payload.summary.total],
    ['Primera respuesta promedio', payload.summary.averageFirstResponseLabel],
    ['Cobertura con evidencia', `${payload.summary.evidenceCoverage}%`],
    ['Esperando trainer', payload.summary.waitingOnTrainer],
  ]);
  addCellStyles(summarySheet, [28, 48]);

  const statusSheet = XLSX.utils.json_to_sheet(
    payload.statusRows.map((row) => ({
      Estado: row.label,
      Casos: row.value,
    })),
  );
  addCellStyles(statusSheet, [28, 14]);

  const waitingSheet = XLSX.utils.json_to_sheet(
    payload.waitingRows.map((row) => ({
      'Espera de': row.label,
      Casos: row.value,
    })),
  );
  addCellStyles(waitingSheet, [28, 14]);

  const trainerSheet = XLSX.utils.json_to_sheet(
    payload.trainerRows.map((row) => ({
      Trainer: row.label,
      Asignadas: row.assigned,
      Respondidas: row.responded,
      'Primera respuesta': formatMinutesLabel(row.avgFirstResponseMinutes),
    })),
  );
  addCellStyles(trainerSheet, [28, 14, 14, 22]);

  const heatmapSheet = XLSX.utils.json_to_sheet(
    payload.heatmapRows.map((row) => ({
      Solicitante: row.requester,
      'Tipo de incidencia': row.type,
      Frecuencia: row.count,
    })),
  );
  addCellStyles(heatmapSheet, [28, 32, 14]);

  const timelineSheet = XLSX.utils.json_to_sheet(
    payload.timelineRows.map((row) => ({
      Periodo: row.label,
      Nuevas: row.created,
      Respondidas: row.replied,
      Cerradas: row.closed,
    })),
  );
  addCellStyles(timelineSheet, [18, 12, 14, 12]);

  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');
  XLSX.utils.book_append_sheet(workbook, statusSheet, 'Estados');
  XLSX.utils.book_append_sheet(workbook, waitingSheet, 'Espera');
  XLSX.utils.book_append_sheet(workbook, trainerSheet, 'Trainers');
  XLSX.utils.book_append_sheet(workbook, heatmapSheet, 'Cruces');
  XLSX.utils.book_append_sheet(workbook, timelineSheet, 'Timeline');

  XLSX.writeFile(
    workbook,
    `orion_metricas_asesorias_${buildExportSlug(payload.areaLabel)}_${buildFileStamp(payload.generatedAt)}.xlsx`,
  );
};

const drawSectionCard = (doc: jsPDF, x: number, y: number, width: number, height: number) => {
  setFill(doc, [255, 255, 255]);
  setDraw(doc, BRAND.silverLine);
  doc.roundedRect(x, y, width, height, 18, 18, 'FD');
};

const drawKpiCard = (
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  title: string,
  value: string,
  accent: readonly [number, number, number],
) => {
  drawSectionCard(doc, x, y, width, 82);
  setText(doc, BRAND.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(title.toUpperCase(), x + 16, y + 20);
  setText(doc, accent);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(value, x + 16, y + 52);
};

const drawMiniTable = (
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  title: string,
  rows: { label: string; value: string }[],
) => {
  const rowHeight = 22;
  const height = 46 + rows.length * rowHeight;
  drawSectionCard(doc, x, y, width, height);
  setText(doc, BRAND.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(title, x + 16, y + 22);

  rows.forEach((row, index) => {
    const rowY = y + 42 + index * rowHeight;
    if (index > 0) {
      setDraw(doc, BRAND.silverLine);
      doc.line(x + 16, rowY - 12, x + width - 16, rowY - 12);
    }
    setText(doc, BRAND.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(row.label, x + 16, rowY);
    setText(doc, BRAND.ink);
    doc.setFont('helvetica', 'bold');
    doc.text(row.value, x + width - 16, rowY, { align: 'right' });
  });

  return height;
};

const drawTrainerTable = (
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  rows: AdvisoryMetricsTrainerRow[],
) => {
  const rowHeight = 42;
  const height = 56 + rows.length * rowHeight;
  drawSectionCard(doc, x, y, width, height);
  setText(doc, BRAND.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Carga por trainer', x + 16, y + 22);

  const maxAssigned = Math.max(...rows.map((row) => row.assigned), 1);
  rows.forEach((row, index) => {
    const rowY = y + 48 + index * rowHeight;
    if (index > 0) {
      setDraw(doc, BRAND.silverLine);
      doc.line(x + 16, rowY - 16, x + width - 16, rowY - 16);
    }

    setText(doc, BRAND.ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(row.label, x + 16, rowY);
    setText(doc, BRAND.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`1ra respuesta: ${formatMinutesLabel(row.avgFirstResponseMinutes)}`, x + 16, rowY + 13);

    const barX = x + width - 176;
    const barWidth = 112;
    const firstWidth = Math.max(10, (row.assigned / maxAssigned) * barWidth);
    const secondWidth = Math.max(10, (row.responded / maxAssigned) * barWidth);

    setFill(doc, BRAND.silver);
    doc.roundedRect(barX, rowY - 8, barWidth, 8, 6, 6, 'F');
    setFill(doc, BRAND.red);
    doc.roundedRect(barX, rowY - 8, firstWidth, 8, 6, 6, 'F');
    setFill(doc, BRAND.teal);
    doc.roundedRect(barX, rowY + 6, barWidth, 8, 6, 6, 'F');
    setFill(doc, BRAND.green);
    doc.roundedRect(barX, rowY + 6, secondWidth, 8, 6, 6, 'F');

    setText(doc, BRAND.ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`${row.assigned}`, x + width - 48, rowY - 1, { align: 'right' });
    doc.text(`${row.responded}`, x + width - 48, rowY + 13, { align: 'right' });
  });

  return height;
};

const drawTopCrosses = (
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  rows: AdvisoryMetricsHeatmapRow[],
) => {
  const usableRows = rows.slice(0, 8);
  const rowHeight = 28;
  const height = 56 + usableRows.length * rowHeight;
  drawSectionCard(doc, x, y, width, height);

  setText(doc, BRAND.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Cruces solicitante · incidencia', x + 16, y + 22);

  usableRows.forEach((row, index) => {
    const rowY = y + 46 + index * rowHeight;
    if (index > 0) {
      setDraw(doc, BRAND.silverLine);
      doc.line(x + 16, rowY - 12, x + width - 16, rowY - 12);
    }
    setText(doc, BRAND.ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.8);
    doc.text(row.requester, x + 16, rowY);
    setText(doc, BRAND.muted);
    doc.setFont('helvetica', 'normal');
    doc.text(row.type, x + 160, rowY);
    setText(doc, BRAND.red);
    doc.setFont('helvetica', 'bold');
    doc.text(`${row.count}`, x + width - 16, rowY, { align: 'right' });
  });

  return height;
};

const drawTimeline = (
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  rows: AdvisoryMetricsTimelineRow[],
) => {
  const height = 164;
  drawSectionCard(doc, x, y, width, height);
  setText(doc, BRAND.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Timeline operativo', x + 16, y + 22);

  const maxTotal = Math.max(...rows.map((row) => row.created + row.replied + row.closed), 1);
  const chartX = x + 18;
  const chartY = y + 44;
  const chartWidth = width - 36;
  const chartHeight = 86;
  const barWidth = Math.max(24, chartWidth / Math.max(1, rows.length) - 18);
  const gap = Math.max(10, (chartWidth - rows.length * barWidth) / Math.max(1, rows.length - 1 || 1));

  rows.forEach((row, index) => {
    const total = row.created + row.replied + row.closed;
    const fullHeight = (total / maxTotal) * chartHeight;
    const barX = chartX + index * (barWidth + gap);
    let cursorY = chartY + chartHeight;

    const segments = [
      { value: row.closed, color: BRAND.green },
      { value: row.replied, color: BRAND.teal },
      { value: row.created, color: BRAND.red },
    ];

    segments.forEach((segment) => {
      if (segment.value <= 0) {
        return;
      }
      const segmentHeight = (segment.value / Math.max(total, 1)) * fullHeight;
      cursorY -= segmentHeight;
      setFill(doc, segment.color);
      doc.roundedRect(barX, cursorY, barWidth, segmentHeight, 6, 6, 'F');
    });

    setText(doc, BRAND.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    doc.text(row.label, barX + barWidth / 2, chartY + chartHeight + 18, { align: 'center' });
  });

  setText(doc, BRAND.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Rojo: nuevas · Azul: respondidas · Verde: cerradas', x + 16, y + height - 16);
  return height;
};

export const downloadAdvisoryMetricsPdf = async (payload: AdvisoryMetricsExportPayload) => {
  const assetResults = await Promise.allSettled([
    assetToDataUrl('bios-brand/BioS_Logo_300dpi.png'),
    assetToDataUrl('bios-letter-template/image1.jpeg'),
  ]);
  const logoDataUrl = assetResults[0].status === 'fulfilled' ? assetResults[0].value : null;
  const paperDataUrl = assetResults[1].status === 'fulfilled' ? assetResults[1].value : null;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 30;
  const contentWidth = pageWidth - marginX * 2;
  let cursorY = 24;

  const addNewPage = () => {
    doc.addPage();
    if (paperDataUrl) {
      doc.addImage(paperDataUrl, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
    }
    cursorY = 24;
  };

  const ensureSpace = (height: number) => {
    if (cursorY + height <= pageHeight - 38) {
      return;
    }
    addNewPage();
  };

  if (paperDataUrl) {
    doc.addImage(paperDataUrl, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
  }

  setFill(doc, BRAND.red);
  doc.roundedRect(marginX, cursorY, contentWidth, 8, 6, 6, 'F');
  cursorY += 18;

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', marginX, cursorY, 126, 42, undefined, 'FAST');
  }

  setText(doc, BRAND.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('ORION · Analítica de asesorías', pageWidth - marginX, cursorY + 10, { align: 'right' });
  setText(doc, BRAND.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(`Métricas de ${payload.areaLabel.toLowerCase()}`, pageWidth - marginX, cursorY + 34, { align: 'right' });
  setText(doc, BRAND.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.text(`${payload.scopeLabel} · ${payload.generatedAt}`, pageWidth - marginX, cursorY + 52, { align: 'right' });
  cursorY += 68;

  const kpiGap = 12;
  const kpiWidth = (contentWidth - kpiGap) / 2;
  drawKpiCard(doc, marginX, cursorY, kpiWidth, 'Casos analizados', `${payload.summary.total}`, BRAND.red);
  drawKpiCard(
    doc,
    marginX + kpiWidth + kpiGap,
    cursorY,
    kpiWidth,
    'Primera respuesta',
    payload.summary.averageFirstResponseLabel,
    BRAND.teal,
  );
  cursorY += 94;
  drawKpiCard(
    doc,
    marginX,
    cursorY,
    kpiWidth,
    'Cobertura con evidencia',
    `${payload.summary.evidenceCoverage}%`,
    BRAND.green,
  );
  drawKpiCard(
    doc,
    marginX + kpiWidth + kpiGap,
    cursorY,
    kpiWidth,
    'Esperando trainer',
    `${payload.summary.waitingOnTrainer}`,
    BRAND.amber,
  );
  cursorY += 98;

  ensureSpace(240);
  const halfWidth = (contentWidth - 12) / 2;
  const leftHeight = drawMiniTable(
    doc,
    marginX,
    cursorY,
    halfWidth,
    'Distribución por estado',
    payload.statusRows.map((row) => ({ label: row.label, value: `${row.value}` })),
  );
  const rightHeight = drawMiniTable(
    doc,
    marginX + halfWidth + 12,
    cursorY,
    halfWidth,
    'A quién le toca',
    payload.waitingRows.map((row) => ({ label: row.label, value: `${row.value}` })),
  );
  cursorY += Math.max(leftHeight, rightHeight) + 12;

  ensureSpace(260);
  const trainerHeight = drawTrainerTable(doc, marginX, cursorY, contentWidth, payload.trainerRows);
  cursorY += trainerHeight + 12;

  ensureSpace(280);
  const crossHeight = drawTopCrosses(doc, marginX, cursorY, contentWidth, payload.heatmapRows);
  cursorY += crossHeight + 12;

  ensureSpace(190);
  drawTimeline(doc, marginX, cursorY, contentWidth, payload.timelineRows);

  doc.save(
    `orion_metricas_asesorias_${buildExportSlug(payload.areaLabel)}_${buildFileStamp(payload.generatedAt)}.pdf`,
  );
};
