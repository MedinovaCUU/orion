import jsPDF from 'jspdf';

export interface EmployeeCredentialPdfPayload {
  fullName: string;
  roleLabel: string;
  areaLabel: string;
  employeeNumber: string;
  jobTitle: string;
  territory: string;
  phone: string;
  email: string;
  issueDate: string;
  validUntil: string;
  validityLabel: string;
  verificationCode: string;
  photoUrl: string | null;
}

const COLORS = {
  paper: [248, 250, 252] as const,
  shell: [255, 255, 255] as const,
  shellTint: [242, 245, 248] as const,
  border: [214, 221, 229] as const,
  ink: [28, 38, 48] as const,
  muted: [102, 114, 128] as const,
  accent: [176, 18, 43] as const,
  accentSoft: [248, 231, 235] as const,
  accentDeep: [120, 27, 39] as const,
} as const;

const BRAND_LOGO_URL = `${import.meta.env.BASE_URL || '/'}bios-brand/BioS_Logo_300dpi.png`;

const setFill = (doc: jsPDF, color: readonly [number, number, number]) => {
  doc.setFillColor(color[0], color[1], color[2]);
};

const setDraw = (doc: jsPDF, color: readonly [number, number, number]) => {
  doc.setDrawColor(color[0], color[1], color[2]);
};

const setText = (doc: jsPDF, color: readonly [number, number, number]) => {
  doc.setTextColor(color[0], color[1], color[2]);
};

const sanitizeFileName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'credencial-biosystems';

const fileToDataUrl = async (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(blob);
  });

const fetchImageDataUrl = async (url: string | null) => {
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    return await fileToDataUrl(await response.blob());
  } catch {
    return null;
  }
};

const drawLabelValue = (doc: jsPDF, x: number, y: number, label: string, value: string, width: number) => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.6);
  setText(doc, COLORS.muted);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  setText(doc, COLORS.ink);
  const lines = doc.splitTextToSize(value || 'N/D', width) as string[];
  doc.text(lines.slice(0, 2), x, y + 4.2);
  return y + 4.2 + Math.max(lines.length, 1) * 4.3;
};

export const downloadEmployeeCredentialPdf = async (payload: EmployeeCredentialPdfPayload) => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [56, 90],
    compress: true,
  });

  const logoDataUrl = await fetchImageDataUrl(BRAND_LOGO_URL);
  const photoDataUrl = await fetchImageDataUrl(payload.photoUrl);

  setFill(doc, COLORS.paper);
  doc.rect(0, 0, 90, 56, 'F');

  setFill(doc, COLORS.shell);
  setDraw(doc, COLORS.border);
  doc.roundedRect(2.5, 2.5, 85, 51, 6, 6, 'FD');

  setFill(doc, COLORS.accent);
  doc.roundedRect(2.5, 2.5, 18, 51, 6, 6, 'F');

  setFill(doc, COLORS.accentSoft);
  doc.roundedRect(55, 4.5, 30, 10, 4, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setText(doc, COLORS.accentDeep);
  doc.text('IDENTIFICACIÓN', 70, 9.8, { align: 'center' });
  doc.text('DIGITAL ORION', 70, 13.3, { align: 'center' });

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', 24, 6, 24, 9);
  }

  setText(doc, COLORS.muted);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.text('BIOSYSTEMS · SOPORTE TECNICO', 24, 18.5);

  if (photoDataUrl) {
    setFill(doc, COLORS.shellTint);
    setDraw(doc, COLORS.border);
    doc.roundedRect(6, 10.2, 11.2, 14.6, 3, 3, 'FD');
    doc.addImage(photoDataUrl, photoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG', 6.2, 10.4, 10.8, 14.2);
  } else {
    setFill(doc, COLORS.shellTint);
    setDraw(doc, COLORS.border);
    doc.roundedRect(6, 10.2, 11.2, 14.6, 3, 3, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    setText(doc, COLORS.accentDeep);
    const initials = payload.fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((token) => token[0]?.toUpperCase() || '')
      .join('');
    doc.text(initials || 'BS', 11.6, 18.9, { align: 'center' });
  }

  setText(doc, COLORS.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(payload.fullName || 'Nombre pendiente', 24, 26);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  setText(doc, COLORS.accentDeep);
  doc.text(payload.jobTitle || payload.roleLabel || 'Personal BioSystems', 24, 31);
  setText(doc, COLORS.muted);
  doc.text(payload.areaLabel || 'Operacion ORION', 24, 35.2);

  let cursorY = 39.8;
  cursorY = drawLabelValue(doc, 24, cursorY, 'No. empleado', payload.employeeNumber || payload.verificationCode, 20.5);
  cursorY = drawLabelValue(doc, 48.5, 39.8, 'Telefono', payload.phone || 'N/D', 18);
  cursorY = drawLabelValue(doc, 67.5, 39.8, 'Territorio', payload.territory || 'N/D', 16);
  drawLabelValue(doc, 24, 49, 'Correo', payload.email || 'N/D', 61);

  setDraw(doc, COLORS.border);
  doc.line(24, 47, 84, 47);

  setFill(doc, COLORS.shellTint);
  doc.roundedRect(4.5, 42.5, 15.2, 8.2, 2.5, 2.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.7);
  setText(doc, COLORS.accentDeep);
  doc.text('Emitida', 7, 45.7);
  doc.setFont('helvetica', 'normal');
  doc.text(payload.issueDate || 'N/D', 7, 48.9);

  setFill(doc, COLORS.shellTint);
  doc.roundedRect(4.5, 30.5, 15.2, 8.8, 2.5, 2.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.7);
  setText(doc, COLORS.accentDeep);
  doc.text('Vigencia', 7, 33.7);
  doc.setFont('helvetica', 'normal');
  doc.text((payload.validUntil || payload.validityLabel || 'Activa').slice(0, 20), 7, 36.9);

  setFill(doc, COLORS.accentSoft);
  doc.roundedRect(24, 51, 60, 2.6, 1.3, 1.3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.4);
  setText(doc, COLORS.accentDeep);
  doc.text(`FOLIO ${payload.verificationCode}`, 24.8, 52.8);
  doc.text('Documento digital de identificacion laboral BioSystems.', 84, 52.8, { align: 'right' });

  doc.save(`${sanitizeFileName(payload.fullName)}-credencial-biosystems.pdf`);
};
