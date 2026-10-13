// Public support portal rules. They mirror portal_serial_key / portal_serial_issue / portal_model_family
// and the field checks of submit_public_support_case (migration 20261013010000); the database decides.

export type SerialIssue = 'vacio' | 'producto' | 'incompleto' | 'formato';
export type SerialStatus = SerialIssue | 'ok' | 'no_encontrado' | 'limite';
export type SerialFamily = 'BA400' | 'BA200' | 'A15' | 'A25' | 'Y15';

export interface SerialCheckResult {
  status: SerialStatus;
  serie?: string | null;
  modelo?: string | null;
  mensaje?: string | null;
}

export interface SubmitResult {
  status: 'creado' | 'agrupado' | 'serie' | 'datos' | 'limite';
  numero_caso?: string | null;
  modelo?: string | null;
  motivo?: SerialStatus | null;
  campo?: 'tipo' | 'nombre' | 'telefono' | 'descripcion' | null;
  mensaje?: string | null;
  repetido?: boolean | null;
}

const LABEL_PREFIX = /^(S\/N|N\/S|SN|NS|NO\.? ?DE ?SERIE|SERIE)[\s:#.-]*/;

/** "SN: 83400-1902" → "834001902". Only letters and digits count. */
export const serialKey = (value: string): string =>
  value.trim().toUpperCase().replace(LABEL_PREFIX, '').replace(/[^A-Z0-9]/g, '');

export const serialIssue = (key: string): SerialIssue | null => {
  if (!key) return 'vacio';
  if (key.includes('8435287')) return 'producto';
  if (/^[0-9]{4,5}$/.test(key)) return 'incompleto';
  if (key.length < 6 || key.length > 24 || !/[0-9]{3}/.test(key)) return 'formato';
  return null;
};

export const serialFamily = (key: string): SerialFamily | null => {
  if (key.startsWith('83400')) return 'BA400';
  if (key.startsWith('83200')) return 'BA200';
  if (key.startsWith('83105')) return 'A15';
  if (key.startsWith('83101')) return 'A25';
  if (key.startsWith('83106')) return 'Y15';
  return null;
};

export const serialStatusMessage = (status: SerialStatus, family?: string | null): string => {
  switch (status) {
    case 'vacio':
      return 'Escribe el número de serie del equipo.';
    case 'producto':
      return 'Ese es el código del producto (el que empieza con (01)), no el número de serie. Usa el número que aparece junto a «SN».';
    case 'incompleto':
      return 'Parece que falta el inicio del número. En un A15 con etiqueta anterior (REF 83105 y SN de 5 números que empieza con 0), escribe 83105C y los últimos 4 números: REF 83105 y SN 04321 se escriben 83105C4321.';
    case 'formato':
      return 'Ese dato no corresponde a un número de serie. Por favor ingresa el número de serie correcto del equipo.';
    case 'no_encontrado':
      return family
        ? `No encontramos ese número de serie entre los equipos ${family} registrados. Por favor ingresa el número de serie correcto del equipo.`
        : 'No encontramos ese número de serie entre los equipos registrados. Por favor ingresa el número de serie correcto del equipo.';
    case 'limite':
      return 'Demasiadas consultas seguidas. Espera unos minutos e inténtalo de nuevo.';
    default:
      return '';
  }
};

/** Digits only; a pasted "+52 …" or "+52 1 …" keeps the 10-digit national number. */
export const phoneDigits = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (/^521\d{10}$/.test(digits)) return digits.slice(3);
  if (/^52\d{10}$/.test(digits)) return digits.slice(2);
  return digits.slice(0, 10);
};

/** Mexican mobile: 10 digits, never starting with 0 or 1, not one repeated digit. */

export const phoneIssue = (digits: string): string | null => {
  if (!/^[2-9][0-9]{9}$/.test(digits) || /^([0-9])\1{9}$/.test(digits) || ['2345678901', '9876543210'].includes(digits)) {
    return 'Escribe un celular válido de 10 dígitos (sin lada internacional).';
  }
  return null;
};

export const nameIssue = (value: string): string | null => {
  const name = value.replace(/\s+/g, ' ').trim();
  const letters = name.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g)?.length ?? 0;
  return name.length < 3 || name.length > 120 || letters < 2 ? 'Escribe el nombre real de la persona de contacto.' : null;
};

export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 3000;

export const descriptionIssue = (value: string): string | null => {
  const length = value.trim().length;
  return length < DESCRIPTION_MIN || length > DESCRIPTION_MAX
    ? `Describe el problema en al menos ${DESCRIPTION_MIN} caracteres (máximo ${DESCRIPTION_MAX}).`
    : null;
};
