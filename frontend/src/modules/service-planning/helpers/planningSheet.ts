// Parser for the official planning workbook ("PROGRAMACION 2026.xlsx") as Google Drive renders it
// in its read-only HTML view. Pure string parsing, no DOM, so it runs in the browser and in node tests.

import type { ServiceType } from '../types/servicePlanning.types';

export const MONTH_NAMES = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
] as const;

// The workbook has typos ("NOVIMEBRE", "SEPTIEMRE"), so months are recognised by their first letters.
const MONTH_PREFIXES: Array<[string, number]> = [
  ['ENE', 0],
  ['FEB', 1],
  ['MAR', 2],
  ['ABR', 3],
  ['MAY', 4],
  ['JUN', 5],
  ['JUL', 6],
  ['AGO', 7],
  ['SEP', 8],
  ['SET', 8],
  ['OCT', 9],
  ['NOV', 10],
  ['DIC', 11],
];

const WEEKDAY_OFFSETS: Array<[RegExp, number]> = [
  [/^LUN/, 0],
  [/^MAR(?!ZO)/, 1],
  [/^MIE/, 2],
  [/^JUE/, 3],
  [/^VIE/, 4],
  [/^SAB/, 5],
  [/^DOM/, 6],
];

export type SheetTab = { name: string; gid: string };

export type SheetWeek = {
  tab: string;
  rawLabel: string;
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  monthKey: string;
};

export type SheetActivityStatus = 'cancelado' | 'pospuesto' | null;

export type SheetActivity = {
  tab: string;
  gid: string;
  sheetRow: number;
  week: SheetWeek;
  rawType: string;
  serviceType: ServiceType;
  platform: string;
  locality: string;
  serialText: string;
  serial: string;
  observations: string;
  engineerTokens: string[];
  companionTokens: string[];
  daysText: string;
  scheduledDate: string | null;
  rowNote: string;
  color: string | null;
  status: SheetActivityStatus;
};

export type SheetNoteKind = 'TXT' | 'VAC' | 'CUMPLEAÑOS' | 'SEMANA SANTA' | 'APARTADO' | 'NOTA';

export type SheetAvailabilityNote = {
  tab: string;
  sheetRow: number;
  week: SheetWeek;
  text: string;
  kind: SheetNoteKind;
  daysLabel: string;
  personText: string;
};

export type SheetGuardWeekend = {
  rawLabel: string;
  weekendStart: string;
  aplicativo: string;
  ingenieria: string;
};

type Cell = {
  text: string;
  className: string;
  rowSpan: number;
  colSpan: number;
};

type GridCell = Cell & { originRow: number; originCol: number; rowNumber: number };

const pad = (value: number) => `${value}`.padStart(2, '0');

const toIsoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const fromIsoDate = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
};

const addDays = (iso: string, days: number) => {
  const date = fromIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
};

const cleanText = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();

export const foldText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const decodeEntities = (value: string) =>
  value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const parsed = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });

const readAttribute = (attributes: string, name: string) => {
  const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return match ? decodeEntities(match[1]) : '';
};

const monthFromWord = (word: string) => {
  const folded = foldText(word);
  return MONTH_PREFIXES.find(([prefix]) => folded.startsWith(prefix))?.[1] ?? null;
};

export const sheetTabMonth = (tabName: string) => monthFromWord(tabName);

export const parseSheetIndex = (html: string) => {
  const title = cleanText(decodeEntities(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '')).replace(/\s*-\s*Google Drive$/i, '');
  const tabs: SheetTab[] = [];
  const tabPattern = /items\.push\(\{name:\s*"((?:[^"\\]|\\.)*)",\s*pageUrl:\s*"(?:[^"\\]|\\.)*",\s*gid:\s*"(-?\d+)"/g;
  for (const match of html.matchAll(tabPattern)) {
    tabs.push({ name: JSON.parse(`"${match[1]}"`), gid: match[2] });
  }
  const year = Number(title.match(/\b(20\d{2})\b/)?.[1]) || null;
  return { title, year, tabs };
};

const parseCellStyles = (html: string) => {
  const styles = new Map<string, { background: string | null }>();
  const styleText = Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi), (match) => match[1]).join('\n');
  for (const match of styleText.matchAll(/\.waffle \.([a-z0-9_-]+)\{([^}]*)\}/gi)) {
    const background = match[2].match(/background-color:\s*([^;]+)/i)?.[1]?.trim().toLowerCase() || null;
    styles.set(match[1], { background });
  }
  return styles;
};

// Turns the waffle table into a grid where merged cells are repeated on every row and column they cover.
const parseGrid = (html: string, maxColumns: number) => {
  const tableStart = html.search(/<table[^>]*class="[^"]*waffle/i);
  if (tableStart < 0) {
    throw new Error('La hoja no tiene la tabla esperada.');
  }
  const tableEnd = html.indexOf('</table>', tableStart);
  const tableHtml = html.slice(tableStart, tableEnd < 0 ? undefined : tableEnd);

  const rows: Array<{ rowNumber: number; cells: Cell[] }> = [];
  let currentRow: { rowNumber: number; cells: Cell[] } | null = null;
  let currentCell: Cell | null = null;
  let inRowHeader = false;
  let rowHeaderText = '';

  for (const match of tableHtml.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi)) {
    const [, closing, rawTag, attributes, text] = match;
    if (text !== undefined) {
      if (currentCell) currentCell.text += decodeEntities(text);
      else if (inRowHeader) rowHeaderText += text;
      continue;
    }
    const tag = rawTag.toLowerCase();
    if (tag === 'tr') {
      if (closing) {
        if (currentRow) rows.push(currentRow);
        currentRow = null;
      } else {
        currentRow = { rowNumber: 0, cells: [] };
      }
    } else if (tag === 'th') {
      if (closing) {
        if (currentRow && !currentRow.rowNumber) currentRow.rowNumber = Number(cleanText(rowHeaderText)) || 0;
        inRowHeader = false;
      } else {
        inRowHeader = true;
        rowHeaderText = '';
      }
    } else if (tag === 'td') {
      if (closing) {
        if (currentRow && currentCell) currentRow.cells.push(currentCell);
        currentCell = null;
      } else {
        currentCell = {
          text: '',
          className: readAttribute(attributes, 'class').split(/\s+/)[0] || '',
          rowSpan: Number(readAttribute(attributes, 'rowspan')) || 1,
          colSpan: Number(readAttribute(attributes, 'colspan')) || 1,
        };
      }
    } else if (tag === 'br' && currentCell) {
      currentCell.text += '\n';
    }
  }

  const grid = new Map<string, GridCell>();
  const at = (row: number, col: number) => grid.get(`${row}:${col}`);
  rows.forEach((row, rowIndex) => {
    let col = 0;
    for (const cell of row.cells) {
      while (at(rowIndex, col)) col += 1;
      if (col >= maxColumns) break;
      for (let dr = 0; dr < cell.rowSpan; dr += 1) {
        for (let dc = 0; dc < cell.colSpan && col + dc < maxColumns; dc += 1) {
          grid.set(`${rowIndex + dr}:${col + dc}`, {
            ...cell,
            text: cleanText(cell.text.replace(/\n/g, ' / ')),
            originRow: rowIndex,
            originCol: col,
            rowNumber: row.rowNumber,
          });
        }
      }
      col += cell.colSpan;
    }
  });

  return { rowCount: rows.length, rowNumbers: rows.map((row) => row.rowNumber), at };
};

const WEEK_LABEL_PATTERN = /^(\d{1,2})\s*(?:AL|A|-)\s*(\d{1,2})(?:\s+DE)?\s*([A-Z]*)(?:\s+(\d{2,4}))?/;

export const parseSheetWeekLabel = (rawLabel: string, year: number, tabMonth: number | null, tab = '') => {
  const folded = foldText(rawLabel);
  const match = folded.match(WEEK_LABEL_PATTERN);
  if (!match) return null;

  const startDay = Number(match[1]);
  const endDay = Number(match[2]);
  const month = monthFromWord(match[3] || '') ?? tabMonth;
  if (month === null || startDay < 1 || startDay > 31 || endDay < 1 || endDay > 31) return null;

  let endYear = match[4] ? (match[4].length === 2 ? 2000 + Number(match[4]) : Number(match[4])) : year;
  if (!match[4] && tabMonth === 11 && month === 0) endYear += 1;
  const end = new Date(endYear, month, endDay, 12, 0, 0);
  const start = new Date(endYear, startDay > endDay ? month - 1 : month, startDay, 12, 0, 0);

  return {
    tab,
    rawLabel: cleanText(rawLabel),
    weekLabel: `${pad(startDay)} AL ${pad(endDay)} ${MONTH_NAMES[month]}`,
    weekStart: toIsoDate(start),
    weekEnd: toIsoDate(end),
    monthKey: `${end.getFullYear()}-${pad(month + 1)}`,
  } satisfies SheetWeek;
};

// Weeks run one after another; "27 AL 01 ABRIL" after "20 AL 24 ABRIL" is really 27 April - 1 May.
const followPreviousWeek = (week: SheetWeek, previous: SheetWeek | undefined): SheetWeek => {
  if (!previous) return week;
  const expectedStart = addDays(previous.weekStart, 7);
  if (week.weekStart === expectedStart || expectedStart.slice(8, 10) !== week.weekLabel.slice(0, 2)) return week;
  const endDay = week.weekLabel.slice(6, 8);
  const weekEnd = [1, 2, 3, 4, 5, 6].map((days) => addDays(expectedStart, days)).find((date) => date.slice(8, 10) === endDay) || addDays(expectedStart, 4);
  const end = fromIsoDate(weekEnd);
  return {
    ...week,
    weekStart: expectedStart,
    weekEnd,
    weekLabel: `${expectedStart.slice(8, 10)} AL ${weekEnd.slice(8, 10)} ${MONTH_NAMES[end.getMonth()]}`,
    monthKey: `${end.getFullYear()}-${pad(end.getMonth() + 1)}`,
  };
};

// Day cells hold "7 AL 9", "28 y 29", "LUNES", "SAB 03 OCT"... The first day mentioned becomes the agreed date.
export const parseSheetDays = (rawText: string, week: SheetWeek) => {
  const folded = foldText(rawText);
  if (!folded) return null;

  const explicit = folded.match(/\b(\d{1,2})\s+(?:DE\s+)?([A-Z]{3,})/);
  if (explicit) {
    const month = monthFromWord(explicit[2]);
    if (month !== null) {
      const year = Number(week.weekEnd.slice(0, 4));
      return toIsoDate(new Date(year, month, Number(explicit[1]), 12, 0, 0));
    }
  }

  const firstNumber = folded.match(/\b(\d{1,2})\b/);
  if (firstNumber) {
    const day = Number(firstNumber[1]);
    for (let offset = -2; offset <= 8; offset += 1) {
      const candidate = addDays(week.weekStart, offset);
      if (Number(candidate.slice(8, 10)) === day) return candidate;
    }
    return null;
  }

  const firstWord = folded.split(' ')[0];
  const weekday = WEEKDAY_OFFSETS.find(([pattern]) => pattern.test(firstWord));
  return weekday ? addDays(week.weekStart, weekday[1]) : null;
};

export const detectSheetStatus = (...texts: string[]): SheetActivityStatus => {
  const folded = foldText(texts.join(' '));
  if (/\bCANCELAD[OA]S?\b/.test(folded)) return 'cancelado';
  if (/\bPOSPUEST[OA]S?\b|\bSE CAMBIA A\b|\bREPROGRAM/.test(folded)) return 'pospuesto';
  return null;
};

const NOTE_KINDS: Array<[RegExp, SheetNoteKind]> = [
  [/\bTXT\b/, 'TXT'],
  [/\bVAC(ACIONES)?\b/, 'VAC'],
  [/\bCUMPLE/, 'CUMPLEAÑOS'],
  [/\bSEMANA SANTA\b/, 'SEMANA SANTA'],
  [/\bAPARTAR\b/, 'APARTADO'],
];

const AVAILABILITY_PATTERN = /\b(TXT|VAC|VACACIONES|CUMPLE\w*|SEMANA SANTA|APARTAR|INCAPACIDAD|PERMISO|DESCANSO)\b/;

const parseAvailabilityNote = (text: string) => {
  const folded = foldText(text);
  const kind = NOTE_KINDS.find(([pattern]) => pattern.test(folded))?.[1] || 'NOTA';
  const daysLabel = cleanText(
    (folded.match(/\b\d{1,2}(?:\s*(?:AL|Y|-|,)\s*\d{1,2})*\b/) || [''])[0],
  );
  const personText = cleanText(
    folded
      .replace(/\b\d{1,2}(?:\s*(?:AL|Y|-|,)\s*\d{1,2})*\b/g, ' ')
      .replace(/\b(TXT|VAC|VACACIONES|CUMPLEANOS|CUMPLE|SEMANA SANTA|APARTAR A|APARTAR|PARA|DE|EL|LA|DEL)\b/g, ' '),
  );
  return { kind, daysLabel, personText };
};

// People in one cell come separated by "/", line breaks (read as "/"), backslash, "|", ",", ";", "+", "&",
// dashes, or the words "Y", "E", "O", "Y/O" and "CON" ("LALO - DIEGO G", "LALO O GUILLERMO").
// The words need spaces around them so initials such as "E. DURAN" stay whole.
export const splitPeople = (value: string) =>
  cleanText(value)
    .split(/\s*(?:\sY\s*\/\s*O\s|[/\\|,;+&\-\u2013\u2014]|\s(?:Y|E|O|CON)\s)\s*/i)
    .map((entry) => cleanText(entry))
    .filter(Boolean);

const SERIAL_PATTERN = /^\d(?=(?:\D*\d){5})[0-9A-Z]{5,}$/;

export const sheetServiceType = (rawType: string, observations: string, locality: string): ServiceType => {
  const folded = foldText(rawType);
  if (/RECAPACIT/.test(folded)) return 'recapacitacion';
  if (/CAPACIT/.test(folded)) return 'capacitacion';
  if (/CORRECT/.test(folded)) return 'correctivo';
  if (/PREVENT/.test(folded)) return 'preventivo';
  if (/INSTAL/.test(folded)) return 'instalacion';
  if (folded) return 'ingenieria_soporte';
  // Rows without a type in the workbook: infer it from the observations, as the rest of Orion does.
  const context = foldText(`${observations} ${locality}`);
  if (/RECAPACIT/.test(context)) return 'recapacitacion';
  if (/CAPACIT/.test(context)) return 'capacitacion';
  if (/CORRECT/.test(context)) return 'correctivo';
  if (/INSTAL/.test(context)) return 'instalacion';
  return 'preventivo';
};

const HEADER_KEYS: Array<[string, RegExp]> = [
  ['type', /^TIPO/],
  ['platform', /^PLATAFORMA/],
  ['locality', /^LOCALIDAD/],
  ['serial', /^(NS|N\/S|SERIE)/],
  ['observations', /^OBSERVACION/],
  ['engineers', /^SERVICIO|^INGENIER/],
  ['companions', /^ACOMPA/],
  ['days', /^DIAS?\b/],
];

type ColumnMap = Record<'type' | 'platform' | 'locality' | 'serial' | 'observations' | 'engineers' | 'companions' | 'days' | 'notes', number>;

const DEFAULT_COLUMNS: ColumnMap = {
  type: 0,
  platform: 1,
  locality: 2,
  serial: 3,
  observations: 4,
  engineers: 5,
  companions: 6,
  days: 7,
  notes: 8,
};

const MAX_COLUMNS = 12;

export const parsePlanningTab = (html: string, tab: SheetTab, year: number) => {
  const tabMonth = monthFromWord(tab.name);
  const grid = parseGrid(html, MAX_COLUMNS);
  const weeks: SheetWeek[] = [];
  const activities: SheetActivity[] = [];
  const notes: SheetAvailabilityNote[] = [];
  const warnings: string[] = [];
  const styles = parseCellStyles(html);

  let week: SheetWeek | null = null;
  let columns: ColumnMap = DEFAULT_COLUMNS;
  let headerSeen = false;

  const text = (row: number, col: number) => grid.at(row, col)?.text || '';
  const ownText = (row: number, col: number) => {
    const cell = grid.at(row, col);
    return cell && cell.originRow === row ? cell.text : '';
  };

  const addNote = (row: number, noteText: string, targetWeek: SheetWeek) => {
    const parsed = parseAvailabilityNote(noteText);
    notes.push({ tab: tab.name, sheetRow: grid.rowNumbers[row], week: targetWeek, text: noteText, ...parsed });
  };

  for (let row = 0; row < grid.rowCount; row += 1) {
    const first = ownText(row, 0);
    const weekInfo = first ? parseSheetWeekLabel(first, year, tabMonth, tab.name) : null;
    const platformCell = grid.at(row, columns.platform);
    // Week titles are a single cell merged across the block (or alone in column A).
    if (weekInfo && (!platformCell?.text || platformCell.originCol === 0)) {
      week = followPreviousWeek(weekInfo, weeks[weeks.length - 1]);
      weeks.push(week);
      headerSeen = false;
      // A note written on the title row belongs to the week it mentions, usually the previous one.
      const titleNote = ownText(row, columns.notes);
      if (titleNote) addNote(row, titleNote, weeks[weeks.length - 2] || week);
      continue;
    }

    if (!week) continue;

    const rowTexts = Array.from({ length: MAX_COLUMNS }, (_, col) => foldText(ownText(row, col)));
    if (rowTexts.some((value) => value.startsWith('PLATAFORMA')) || rowTexts.some((value) => value.startsWith('LOCALIDAD'))) {
      const mapped: ColumnMap = { ...DEFAULT_COLUMNS };
      rowTexts.forEach((value, col) => {
        const key = HEADER_KEYS.find(([, pattern]) => pattern.test(value))?.[0];
        if (key) mapped[key as keyof ColumnMap] = col;
      });
      mapped.notes = mapped.days + 1;
      columns = mapped;
      headerSeen = true;
      continue;
    }
    if (!headerSeen) continue;

    const activityColumns = [columns.type, columns.platform, columns.locality, columns.serial, columns.observations, columns.engineers, columns.companions, columns.days];
    const isActivity = activityColumns.some((col) => ownText(row, col)) && Boolean(text(row, columns.locality) || text(row, columns.platform) || ownText(row, columns.serial));
    const noteText = ownText(row, columns.notes);

    if (!isActivity) {
      if (noteText) addNote(row, noteText, week);
      continue;
    }

    const rawType = text(row, columns.type);
    const platform = text(row, columns.platform);
    const locality = text(row, columns.locality);
    const serialText = text(row, columns.serial);
    const observations = text(row, columns.observations);
    const companionsText = text(row, columns.companions);
    const daysText = text(row, columns.days);
    const foldedSerial = foldText(serialText).replace(/\s+/g, '');
    const serial = SERIAL_PATTERN.test(foldedSerial) ? foldedSerial : '';
    let rowNote = '';

    if (noteText) {
      if (AVAILABILITY_PATTERN.test(foldText(noteText))) addNote(row, noteText, week);
      else rowNote = noteText;
    }

    const localityCell = grid.at(row, columns.locality) || grid.at(row, columns.type);
    activities.push({
      tab: tab.name,
      gid: tab.gid,
      sheetRow: grid.rowNumbers[row],
      week,
      rawType,
      serviceType: sheetServiceType(rawType, observations, locality),
      platform,
      locality,
      serialText,
      serial,
      observations,
      engineerTokens: splitPeople(text(row, columns.engineers)),
      companionTokens: splitPeople(companionsText),
      daysText,
      scheduledDate: parseSheetDays(daysText, week),
      rowNote,
      color: (localityCell && styles.get(localityCell.className)?.background) || null,
      status: detectSheetStatus(daysText, companionsText, rowNote),
    });
  }

  if (weeks.length === 0) warnings.push(`La pestaña ${tab.name} no tiene semanas reconocibles.`);
  return { weeks, activities, notes, warnings };
};

export const parseGuardsTab = (html: string, year: number) => {
  const grid = parseGrid(html, MAX_COLUMNS);
  const weekends: SheetGuardWeekend[] = [];
  let columns: { days: number; aplicativo: number; ingenieria: number } | null = null;

  for (let row = 0; row < grid.rowCount; row += 1) {
    const texts = Array.from({ length: MAX_COLUMNS }, (_, col) => foldText(grid.at(row, col)?.text || ''));
    if (!columns) {
      const aplicativo = texts.findIndex((value) => value.startsWith('APLICATIVO'));
      const ingenieria = texts.findIndex((value) => value.startsWith('INGENIERIA'));
      const days = texts.findIndex((value) => value.startsWith('DIA'));
      if (aplicativo >= 0 && ingenieria >= 0) columns = { days: days >= 0 ? days : Math.min(aplicativo, ingenieria) - 1, aplicativo, ingenieria };
      continue;
    }

    const rawLabel = texts[columns.days];
    const match = rawLabel.match(/^(\d{1,2})\s*([A-Z]{3,})?\s*(?:Y|AL|-)\s*(\d{1,2})\s*(?:DE\s+)?([A-Z]{3,})?/);
    if (!match) continue;
    const endMonth = monthFromWord(match[4] || match[2] || '');
    if (endMonth === null) continue;
    const startMonth = match[2] ? monthFromWord(match[2]) ?? endMonth : Number(match[1]) > Number(match[3]) ? endMonth - 1 : endMonth;
    weekends.push({
      rawLabel: cleanText(grid.at(row, columns.days)?.text),
      weekendStart: toIsoDate(new Date(year, startMonth, Number(match[1]), 12, 0, 0)),
      aplicativo: cleanText(grid.at(row, columns.aplicativo)?.text),
      ingenieria: cleanText(grid.at(row, columns.ingenieria)?.text),
    });
  }

  return weekends.sort((left, right) => left.weekendStart.localeCompare(right.weekendStart));
};
