import type { jsPDF } from 'jspdf';
import type { Workbook } from 'exceljs';

/**
 * Tipografía corporativa Biosystems: Alliance No.2 (licencia web de Biosystems).
 * El CSS global (index.css) declara las caras para la interfaz; este módulo cubre lo que
 * no hereda ese CSS: PDF (jsPDF), ventanas de impresión, gráficas SVG rasterizadas,
 * libros de Excel y textos 3D (troika).
 */
export const BRAND_FONT_FAMILY = 'Alliance No.2';
export const BRAND_FONT_STACK = `'${BRAND_FONT_FAMILY}', 'Helvetica Neue', Arial, sans-serif`;

const FONT_DIR = `${`${import.meta.env?.BASE_URL || '/'}`.replace(/\/?$/, '/')}fonts/alliance/`;

export const BRAND_FONT_WOFF2 = {
  light: `${FONT_DIR}AllianceNo2-Light.woff2`,
  regular: `${FONT_DIR}AllianceNo2-Regular.woff2`,
  medium: `${FONT_DIR}AllianceNo2-Medium.woff2`,
  semibold: `${FONT_DIR}AllianceNo2-SemiBold.woff2`,
} as const;

/** TrueType (contornos glyf): jsPDF no lee CFF y troika no lee WOFF2. */
export const BRAND_FONT_TTF = {
  regular: `${FONT_DIR}AllianceNo2-Regular.ttf`,
  medium: `${FONT_DIR}AllianceNo2-Medium.ttf`,
  semibold: `${FONT_DIR}AllianceNo2-SemiBold.ttf`,
} as const;

const FACES = [
  { weight: '100 300', file: BRAND_FONT_WOFF2.light },
  { weight: '400', file: BRAND_FONT_WOFF2.regular },
  { weight: '500', file: BRAND_FONT_WOFF2.medium },
  { weight: '600 900', file: BRAND_FONT_WOFF2.semibold },
] as const;

const fontFace = (weight: string, src: string) =>
  `@font-face{font-family:'${BRAND_FONT_FAMILY}';font-style:normal;font-weight:${weight};font-display:block;src:url('${src}') format('woff2')}`;

const base64Cache = new Map<string, Promise<string>>();

const fetchBase64 = (url: string) => {
  let pending = base64Cache.get(url);
  if (!pending) {
    pending = fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status} al cargar ${url}`);
        return response.arrayBuffer();
      })
      .then(buffer => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let index = 0; index < bytes.length; index += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
        }
        return btoa(binary);
      });
    // Un fallo (sin red) no debe quedar cacheado: el siguiente intento vuelve a pedir el archivo.
    pending.catch(() => base64Cache.delete(url));
    base64Cache.set(url, pending);
  }
  return pending;
};

/** @font-face con URL absolutas, para documentos sin el CSS de Orion (ventanas de impresión). */
export const brandFontFaceCss = (baseHref = window.location.href) =>
  FACES.map(face => fontFace(face.weight, new URL(face.file, baseHref).href)).join('');

/**
 * @font-face con las fuentes embebidas en base64. Un SVG cargado como imagen no puede pedir
 * recursos externos, así que sus fuentes tienen que viajar dentro del propio SVG.
 * Si las fuentes no cargan devuelve '' y el SVG cae a la pila de respaldo.
 */
export const brandFontFaceCssInline = async () => {
  try {
    const faces = await Promise.all(
      [FACES[1], FACES[3]].map(async face =>
        fontFace(face.weight, `data:font/woff2;base64,${await fetchBase64(face.file)}`),
      ),
    );
    return faces.join('');
  } catch {
    return '';
  }
};

/** Espera a que las caras de Alliance estén listas en un documento (ventana de impresión incluida). */
export const waitForBrandFonts = (target: Document, timeoutMs = 2500) =>
  Promise.race([
    Promise.all(['400', '500', '600'].map(weight => target.fonts.load(`${weight} 16px '${BRAND_FONT_FAMILY}'`))).then(() => undefined),
    new Promise<void>(resolve => window.setTimeout(resolve, timeoutMs)),
  ]).catch(() => undefined);

/**
 * Nombres con los que Alliance se registra dentro de cada PDF. jsPDF usa el nombre como /BaseFont,
 * así que cada cara lleva el suyo: con un solo nombre, algunos visores confunden la negrita con la regular.
 */
const PDF_FACES = {
  normal: { name: 'AllianceNo2-Regular', file: BRAND_FONT_TTF.regular },
  bold: { name: 'AllianceNo2-SemiBold', file: BRAND_FONT_TTF.semibold },
} as const;

/**
 * Registra Alliance (Regular como normal, SemiBold como bold) en un documento jsPDF y la deja activa.
 * Sin red, el PDF se genera igual con Helvetica: usa siempre `setPdfFont` para elegir la fuente.
 */
export const registerBrandPdfFonts = async (doc: jsPDF) => {
  try {
    const faces = Object.values(PDF_FACES);
    const files = await Promise.all(faces.map(face => fetchBase64(face.file)));
    faces.forEach((face, index) => {
      doc.addFileToVFS(`${face.name}.ttf`, files[index]);
      doc.addFont(`${face.name}.ttf`, face.name, 'normal');
    });
  } catch (error) {
    console.warn('[Orion] Alliance No.2 no disponible para el PDF; se usa Helvetica.', error);
  }
  setPdfFont(doc, 'normal');
};

export const setPdfFont = (doc: jsPDF, style: 'normal' | 'bold' = 'normal') => {
  const face = PDF_FACES[style].name;
  if (doc.getFontList()[face]) doc.setFont(face, 'normal');
  else doc.setFont('helvetica', style);
};

/**
 * Pone Alliance en todas las celdas con contenido de un libro de Excel, conservando tamaño, color y negrita.
 * Excel la muestra en equipos con la fuente instalada; en los demás la sustituye por la de sistema.
 */
export const applyBrandFontToWorkbook = (workbook: Workbook) => {
  workbook.eachSheet(sheet => {
    sheet.eachRow(row => {
      row.eachCell(cell => {
        cell.font = { ...cell.font, name: BRAND_FONT_FAMILY };
      });
    });
  });
};
