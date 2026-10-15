import { MONTH_NAMES } from '../helpers/planningSheet';

// Weeks are computed from dates (Monday to Friday) and labelled like the official workbook:
// "12 AL 16 OCTUBRE"; a week that crosses months takes the month where it ends ("28 AL 02 OCTUBRE").
// They are only a way to group activities, never a stored container.

export interface PlanningWeek {
  start: string; // Monday, ISO
  end: string; // Friday, ISO
  label: string;
  monthKey: string; // month where the week ends
}

const pad = (value: number) => String(value).padStart(2, '0');

export const fromIsoDate = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
};

export const toIsoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const isIsoDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

export const addDays = (iso: string, days: number) => {
  const date = fromIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
};

export const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((fromIsoDate(toIso).getTime() - fromIsoDate(fromIso).getTime()) / 86400000);

export const mondayOf = (iso: string) => {
  const date = fromIsoDate(iso);
  const offset = (date.getDay() + 6) % 7; // Monday = 0, Sunday = 6
  return addDays(iso, -offset);
};

export const weekLabel = (start: string, end: string) => {
  const endDate = fromIsoDate(end);
  return `${start.slice(8, 10)} AL ${end.slice(8, 10)} ${MONTH_NAMES[endDate.getMonth()]}`;
};

export const weekFromMonday = (monday: string): PlanningWeek => {
  const end = addDays(monday, 4);
  return { start: monday, end, label: weekLabel(monday, end), monthKey: end.slice(0, 7) };
};

export const weekOfDate = (iso: string) => weekFromMonday(mondayOf(iso));

export const todayIso = (timeZone = 'America/Ciudad_Juarez') => new Date().toLocaleDateString('en-CA', { timeZone });

export const monthKeyOf = (iso: string) => iso.slice(0, 7);

export const shiftMonth = (monthKey: string, delta: number) => {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1, 12);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
};

const MONTH_TITLES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export const monthTitle = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number);
  return `${MONTH_TITLES[month - 1]} ${year}`;
};

// Every week whose Friday falls in the month: the same rule the workbook tabs follow.
export const weeksOfMonth = (monthKey: string): PlanningWeek[] => {
  const first = `${monthKey}-01`;
  let monday = mondayOf(first);
  const weeks: PlanningWeek[] = [];
  for (let guard = 0; guard < 7; guard += 1) {
    const week = weekFromMonday(monday);
    if (week.monthKey === monthKey) weeks.push(week);
    else if (week.monthKey > monthKey) break;
    monday = addDays(monday, 7);
  }
  return weeks;
};

export const formatShortIso = (iso: string) => {
  if (!isIsoDate(iso)) return '';
  const date = fromIsoDate(iso);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
};

const MONTH_TOKENS: Record<string, number> = {
  ene: 0, enero: 0, feb: 1, febrero: 1, mar: 2, marzo: 2, abr: 3, abril: 3, may: 4, mayo: 4, jun: 5, junio: 5,
  jul: 6, julio: 6, ago: 7, agosto: 7, sep: 8, sept: 8, septiembre: 8, set: 8, setiembre: 8, oct: 9, octubre: 9,
  nov: 10, noviembre: 10, dic: 11, diciembre: 11,
};

// Dates typed or pasted the way people write them in Mexico: 15/10/2026, 15-10-26, 2026-10-15, 15 oct, 15/10.
export const parseLooseDate = (raw: string, referenceIso = todayIso()): string | null => {
  const text = raw.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return isValidParts(+text.slice(0, 4), +text.slice(5, 7) - 1, +text.slice(8, 10));
  // Excel serial dates pasted as numbers.
  if (/^\d{5}$/.test(text)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Number(text) * 86400000);
    return toIsoDate(new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
  }
  const referenceYear = Number(referenceIso.slice(0, 4));
  const numeric = text.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (numeric) {
    const year = numeric[3] ? (numeric[3].length === 2 ? 2000 + Number(numeric[3]) : Number(numeric[3])) : referenceYear;
    return isValidParts(year, Number(numeric[2]) - 1, Number(numeric[1]));
  }
  const textual = text.match(/^(\d{1,2})\s*(?:de\s+)?([a-z]+)\.?(?:\s*(?:de\s+)?(\d{2,4}))?$/);
  if (textual && textual[2] in MONTH_TOKENS) {
    const year = textual[3] ? (textual[3].length === 2 ? 2000 + Number(textual[3]) : Number(textual[3])) : referenceYear;
    return isValidParts(year, MONTH_TOKENS[textual[2]], Number(textual[1]));
  }
  return null;
};

const isValidParts = (year: number, monthIndex: number, day: number) => {
  const date = new Date(year, monthIndex, day, 12);
  return date.getFullYear() === year && date.getMonth() === monthIndex && date.getDate() === day ? toIsoDate(date) : null;
};
