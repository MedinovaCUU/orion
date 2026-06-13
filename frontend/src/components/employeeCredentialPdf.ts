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

const drawInfoCard = (doc: jsPDF, x: number, y: number, width: number, label: string, value: string, height = 12) => {
  setFill(doc, COLORS.shellTint);
  setDraw(doc, COLORS.border);
  doc.roundedRect(x, y, width, height, 3.2, 3.2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  setText(doc, COLORS.muted);
  doc.text(label.toUpperCase(), x + 2.6, y + 4);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  setText(doc, COLORS.ink);
  const lines = doc.splitTextToSize(value || 'N/D', width - 5.2) as string[];
  doc.text(lines.slice(0, 2), x + 2.6, y + 8.7);
};

export const downloadEmployeeCredentialPdf = async (payload: EmployeeCredentialPdfPayload) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [56, 90],
    compress: true,
  });

  const logoDataUrl = await fetchImageDataUrl(BRAND_LOGO_URL);
  const photoDataUrl = await fetchImageDataUrl(payload.photoUrl);
  const initials =
    payload.fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((token) => token[0]?.toUpperCase() || '')
      .join('') || 'BS';

  setFill(doc, COLORS.paper);
  doc.rect(0, 0, 56, 90, 'F');

  setFill(doc, COLORS.shell);
  setDraw(doc, COLORS.border);
  doc.roundedRect(2.4, 2.4, 51.2, 85.2, 5.8, 5.8, 'FD');

  setFill(doc, COLORS.accent);
  doc.roundedRect(2.4, 2.4, 8.4, 85.2, 5.8, 5.8, 'F');

  setFill(doc, COLORS.accentSoft);
  doc.roundedRect(12.8, 4.8, 39, 80, 4.8, 4.8, 'F');

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', 33.4, 9, 14.4, 5.2);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    setText(doc, COLORS.accentDeep);
    doc.text('BioSystems', 48, 12.8, { align: 'right' });
  }

  setText(doc, COLORS.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.7);
  doc.text('BioSystems', 48, 17.4, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.7);
  setText(doc, COLORS.ink);
  doc.text('Identificación', 48, 23.4, { align: 'right' });
  doc.text('laboral digital', 48, 28.1, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  setText(doc, COLORS.muted);
  doc.text('ORION · Servicio técnico', 48, 33, { align: 'right' });

  if (photoDataUrl) {
    setFill(doc, COLORS.shellTint);
    setDraw(doc, COLORS.border);
    doc.roundedRect(15, 36.2, 18.5, 23.2, 4.2, 4.2, 'FD');
    doc.addImage(photoDataUrl, photoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG', 15.4, 36.6, 17.7, 22.4);
  } else {
    setFill(doc, COLORS.shellTint);
    setDraw(doc, COLORS.border);
    doc.roundedRect(15, 36.2, 18.5, 23.2, 4.2, 4.2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    setText(doc, COLORS.accentDeep);
    doc.text(initials, 24.25, 49.8, { align: 'center' });
  }

  setFill(doc, COLORS.accentSoft);
  setDraw(doc, COLORS.accent);
  doc.roundedRect(15, 62.6, 31, 8.6, 4.3, 4.3, 'FD');
  setText(doc, COLORS.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  setText(doc, COLORS.accentDeep);
  doc.text(payload.areaLabel.toUpperCase().slice(0, 38), 30.5, 68, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  setText(doc, COLORS.ink);
  const fullNameLines = doc.splitTextToSize(payload.fullName || 'Nombre pendiente', 37) as string[];
  doc.text(fullNameLines.slice(0, 2), 15, 76.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  setText(doc, COLORS.muted);
  doc.text(payload.jobTitle || payload.roleLabel || 'Personal BioSystems', 15, 86);

  doc.addPage([56, 90], 'portrait');
  setFill(doc, COLORS.paper);
  doc.rect(0, 0, 56, 90, 'F');

  setFill(doc, COLORS.shell);
  setDraw(doc, COLORS.border);
  doc.roundedRect(2.4, 2.4, 51.2, 85.2, 5.8, 5.8, 'FD');

  setFill(doc, COLORS.accentSoft);
  doc.roundedRect(4.6, 4.8, 46.8, 80.6, 4.8, 4.8, 'F');

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', 6.8, 8.6, 18.6, 6.8);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setText(doc, COLORS.accentDeep);
    doc.text('BioSystems', 7.5, 13.2);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.6);
  setText(doc, COLORS.ink);
  doc.text('Reverso de validación', 7.2, 20.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  setText(doc, COLORS.muted);
  doc.text('Presenta esta vista si requieren más datos.', 7.2, 24);

  drawInfoCard(doc, 7.2, 28.2, 19.5, 'Folio ORION', payload.verificationCode, 12.5);
  drawInfoCard(doc, 29.1, 28.2, 19.5, 'Área', payload.areaLabel, 12.5);
  drawInfoCard(doc, 7.2, 43.2, 19.5, 'Emisión', payload.issueDate || 'N/D', 12.5);
  drawInfoCard(doc, 29.1, 43.2, 19.5, 'Vigencia', payload.validUntil || 'Activa', 12.5);
  drawInfoCard(doc, 7.2, 58.2, 19.5, 'Teléfono', payload.phone || 'N/D', 13.5);
  drawInfoCard(doc, 29.1, 58.2, 19.5, 'Territorio', payload.territory || 'N/D', 13.5);

  setFill(doc, COLORS.shell);
  setDraw(doc, COLORS.border);
  doc.roundedRect(7.2, 74, 41.4, 9.2, 3.2, 3.2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  setText(doc, COLORS.muted);
  doc.text('Correo', 9.8, 78);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  setText(doc, COLORS.ink);
  const emailLines = doc.splitTextToSize(payload.email || 'N/D', 36.5) as string[];
  doc.text(emailLines.slice(0, 2), 9.8, 81.7);

  doc.save(`${sanitizeFileName(payload.fullName)}-credencial-biosystems.pdf`);
};
