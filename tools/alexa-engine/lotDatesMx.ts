/**
 * Drop-in replacement of frontend/src/modules/dri/utils/lotDates.ts for the server bundle.
 *
 * The browser module reads "local" days with the host time zone, which in the lab is America/Mexico_City. Edge
 * Functions run in UTC, so the same code would shift expiry days, days on board and the 14-day lot window by one
 * day. This version computes the same calendar days with an explicit America/Mexico_City zone. Parity with the
 * original under TZ=America/Mexico_City is checked by tools/alexa-engine/lotDates.parity.test.mjs.
 */
export const DAY_MS = 86_400_000;
const ZONE = 'America/Mexico_City';
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Date-time without offset: `new Date()` reads it as host-local wall clock, i.e. Mexico City in the lab. */
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?$/;

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

interface ZonedParts { y: number; m: number; d: number; h: number; mi: number; s: number }
const zonedParts = (ms: number): ZonedParts => {
  const out: Record<string, number> = {};
  for (const p of partsFmt.formatToParts(new Date(ms))) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return { y: out.year, m: out.month, d: out.day, h: out.hour % 24, mi: out.minute, s: out.second };
};
/** Zone offset (ms) at an instant: local wall clock minus UTC. */
const offsetAt = (ms: number) => {
  const p = zonedParts(ms);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
};
/** Instant of a wall-clock time in the zone (same rule as `new Date(y, m, d, ...)` in that zone). */
const zonedToMs = (y: number, m0: number, d: number, h = 0, mi = 0, s = 0, ms = 0) => {
  const guess = Date.UTC(y, m0, d, h, mi, s, ms);
  let t = guess - offsetAt(guess);
  const again = guess - offsetAt(t);
  if (again !== t) t = again;
  return t;
};

export const parseLocalDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const text = value.trim();
  const match = text.match(DATE_ONLY);
  const wall = match ? null : text.match(LOCAL_DATE_TIME);
  const date = match
    ? new Date(zonedToMs(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    : wall
      ? new Date(zonedToMs(Number(wall[1]), Number(wall[2]) - 1, Number(wall[3]), Number(wall[4]), Number(wall[5]), Number(wall[6] ?? 0), Number((wall[7] ?? '0').padEnd(3, '0'))))
      : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const parseInstantMs = (value: string | null | undefined) => parseLocalDate(value)?.getTime() ?? Number.NaN;

export const localDayStartMs = (value: string | null | undefined) => {
  const date = parseLocalDate(value);
  if (!date) return Number.NaN;
  const p = zonedParts(date.getTime());
  return zonedToMs(p.y, p.m - 1, p.d);
};

export const localDayEndMs = (value: string | null | undefined) => {
  const date = parseLocalDate(value);
  if (!date) return Number.NaN;
  const p = zonedParts(date.getTime());
  return zonedToMs(p.y, p.m - 1, p.d, 23, 59, 59, 999);
};

const pad = (value: number) => String(value).padStart(2, '0');

export const toLocalIsoDate = (value: string | null | undefined): string | null => {
  const date = parseLocalDate(value);
  if (!date) return null;
  const p = zonedParts(date.getTime());
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
};

export const calendarDaysBetween = (from: string | null | undefined, to: string | null | undefined) => {
  const start = localDayStartMs(from);
  const end = localDayStartMs(to);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / DAY_MS) : null;
};

export const formatLocalDate = (value: string | null | undefined) => {
  const date = parseLocalDate(value);
  return date ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: ZONE }).format(date) : null;
};
