/**
 * Código de barras de botella de reactivo BA200/BA400 (20 dígitos, sufijo "_BC" en los CSV del SAT).
 * Estructura verificada el 2026-10-10 cruzando el SAT de la serie 834000473 con los lotes y certificados
 * publicados en einfo.bio:
 *
 *   TTT RR MM YY LLLLL SSSSSS
 *   ├── TTT    técnica = últimos tres dígitos del código de producto BA (580 → 21580/23580 LDH, 503 → GLUCOSA…)
 *   ├── RR     11 = reactivo 1 (R1 / componente A), 22 = reactivo 2 (R2 / componente B)
 *   ├── MM YY  mes y año de caducidad de la botella (06 28 → junio de 2028)
 *   ├── LLLLL  lote del componente: el mismo `LotNumber` de 5 caracteres que guarda el analizador y que el
 *   │          certificado de análisis (CoA) de einfo.bio lista como lote de componente (p. ej. 00004)
 *   └── SSSSSS serie de la botella
 */
export interface Ba400ReagentBarcode {
  barcode: string;
  techniqueCode: string;
  reagentRole: 'R1' | 'R2';
  expiryMonth: number;
  expiryYear: number;
  /** Último día del mes de caducidad, en ISO (fecha local). */
  expiresAt: string;
  lot: string;
  bottleSerial: string;
}

const BARCODE_PATTERN = /^(\d{3})(11|22)(\d{2})(\d{2})(\d{5})(\d{6})$/;

export const normalizeReagentBarcode = (value: string | null | undefined) =>
  String(value || '')
    .trim()
    .replace(/_BC$/i, '')
    .replace(/\s+/g, '');

/** Devuelve null cuando el texto no sigue el patrón conocido; nunca inventa un lote. */
export const decodeBa400ReagentBarcode = (value: string | null | undefined): Ba400ReagentBarcode | null => {
  const barcode = normalizeReagentBarcode(value);
  const match = barcode.match(BARCODE_PATTERN);
  if (!match) return null;
  const [, techniqueCode, role, month, year, lot, bottleSerial] = match;
  const expiryMonth = Number(month);
  const expiryYear = 2000 + Number(year);
  if (expiryMonth < 1 || expiryMonth > 12 || expiryYear < 2010 || expiryYear > 2060) return null;
  const lastDay = new Date(expiryYear, expiryMonth, 0).getDate();
  return {
    barcode,
    techniqueCode,
    reagentRole: role === '11' ? 'R1' : 'R2',
    expiryMonth,
    expiryYear,
    expiresAt: `${expiryYear}-${String(expiryMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    lot,
    bottleSerial,
  };
};

/** Códigos de producto BA compatibles con una técnica: 21xxx (formatos BA400) y 23xxx (formatos BA200). */
export const productCodesForTechnique = (techniqueCode: string) => [`21${techniqueCode}`, `23${techniqueCode}`];
