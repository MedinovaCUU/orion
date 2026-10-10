/**
 * Formateadores y banderas de presentación del módulo de monitoreo.
 * Se construyen una sola vez: crear un Intl por celda era uno de los costos de render más altos.
 */
import { runtimeFlags } from '../../config/runtimeFlags';
import type { NumericLike } from './monitoringDerivations';

export const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
export const MONTH_FORMATTER = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });
export const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat('es-MX', { numeric: 'auto' });
export const INTEGER_FORMATTER = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
export const CURRENCY_FORMATTER = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });

// Estas banderas ocultan información en la interfaz; no sustituyen permisos de base de datos.
export const showMonitoringErrorCodes = runtimeFlags.monitoringErrorCodesVisible;
export const showMonitoringTestPricing = runtimeFlags.monitoringTestPricingVisible;

export const formatMonitoringErrorLabel = (code: string | null | undefined, fallbackLabel: string) => {
  if (!code) {
    return fallbackLabel;
  }

  return showMonitoringErrorCodes ? `E${code}` : fallbackLabel;
};

// Mes YYYYMM calculado al cargar el módulo, no en cada refresco del componente.
export const CURRENT_REAGENT_BUCKET_MONTH = (() => {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
})();


/** Normaliza los numeric de Supabase, que pueden llegar como cadenas; usa cero si no son válidos. */
export const readNumericValue = (value: NumericLike) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

/** Presenta fechas en español de México usando la zona horaria del navegador. */
export const formatDateTime = (value?: string | null) => {
  if (!value) {
    return 'Sin dato';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Sin dato';
  }

  return DATE_TIME_FORMATTER.format(parsed);
};

/** Expresa la antigüedad en minutos, horas o días para facilitar la lectura operativa. */
export const formatRelativeTime = (value?: string | null) => {
  if (!value) {
    return 'Sin dato';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Sin dato';
  }

  const diffMs = parsed.getTime() - Date.now();
  const formatter = RELATIVE_TIME_FORMATTER;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (Math.abs(diffMs) < hour) {
    return formatter.format(Math.round(diffMs / minute), 'minute');
  }

  if (Math.abs(diffMs) < day) {
    return formatter.format(Math.round(diffMs / hour), 'hour');
  }

  return formatter.format(Math.round(diffMs / day), 'day');
};

export const formatInteger = (value: NumericLike) => INTEGER_FORMATTER.format(readNumericValue(value));

export const formatCurrency = (value: NumericLike) => CURRENCY_FORMATTER.format(readNumericValue(value));

/** Convierte la clave mensual YYYYMM en un nombre de mes y año legible. */
export const formatBucketMonth = (bucketMonth?: string | null) => {
  if (!bucketMonth || bucketMonth.length !== 6) {
    return 'Sin dato';
  }

  const year = Number.parseInt(bucketMonth.slice(0, 4), 10);
  const month = Number.parseInt(bucketMonth.slice(4, 6), 10) - 1;
  const date = new Date(year, month, 1);

  if (Number.isNaN(date.getTime())) {
    return 'Sin dato';
  }

  return MONTH_FORMATTER.format(date);
};

