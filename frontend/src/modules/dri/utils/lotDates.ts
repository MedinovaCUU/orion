/**
 * Fechas de calendario locales para la inteligencia de lotes.
 *
 * Las caducidades del código de barras y la fecha del caso son fechas sin hora («2028-03-31»); `new Date()`
 * las interpreta como medianoche UTC y en México (UTC-6) caen en el día anterior. Aquí toda fecha sin hora
 * se lee como día local y toda marca de tiempo ISO se lleva a su día local antes de comparar o mostrar.
 */
export const DAY_MS = 86_400_000;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Date local: fecha sin hora → medianoche local; marca de tiempo → el instante tal cual. */
export const parseLocalDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const match = value.trim().match(DATE_ONLY);
  const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Instante en ms (fecha sin hora = inicio del día local). */
export const parseInstantMs = (value: string | null | undefined) => parseLocalDate(value)?.getTime() ?? Number.NaN;

export const localDayStartMs = (value: string | null | undefined) => {
  const date = parseLocalDate(value);
  return date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() : Number.NaN;
};

export const localDayEndMs = (value: string | null | undefined) => {
  const date = parseLocalDate(value);
  return date ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime() : Number.NaN;
};

const pad = (value: number) => String(value).padStart(2, '0');

/** «YYYY-MM-DD» del día local (una marca UTC de las 01:00 del día siguiente sigue siendo hoy en México). */
export const toLocalIsoDate = (value: string | null | undefined): string | null => {
  const date = parseLocalDate(value);
  return date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : null;
};

/** Días de calendario entre dos fechas (positivo si `to` es posterior). Redondeo para tolerar el cambio de horario. */
export const calendarDaysBetween = (from: string | null | undefined, to: string | null | undefined) => {
  const start = localDayStartMs(from);
  const end = localDayStartMs(to);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / DAY_MS) : null;
};

/** Fecha corta en español de México; las fechas sin hora no se recorren un día. */
export const formatLocalDate = (value: string | null | undefined) => {
  const date = parseLocalDate(value);
  return date ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(date) : null;
};
