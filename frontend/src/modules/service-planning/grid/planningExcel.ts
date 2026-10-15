// Excel import/export for the service-planning grid. Pure TypeScript (no DOM, no React): bundled by Vite for
// the browser and imported directly by node tests.
//
// Import understands two layouts:
//  - the official workbook ("PROGRAMACION 2026.xlsx"): month tabs with week blocks (week title row, header row,
//    activity rows, merged cells, notes beside the weeks). Each worksheet becomes the same cell grid Google's
//    HTML view produces and is walked by parsePlanningGrid, so the live sync and this importer read a tab
//    identically;
//  - a flat table: one header row anywhere, one activity per row, the week coming from a SEMANA or FECHA column
//    (or from week-title rows between blocks, which is how the grouped export writes it).
// Nothing is invented: what the file does not say stays null and is reported as an issue.

import type { ServiceType } from '../types/servicePlanning.types';
import type { ProfileSummary } from '../../../components/servicesPlanning';
import { applyBrandFontToWorkbook } from '../../../config/brandFonts.ts';
import { buildPlanningSubject } from '../helpers/normalizeService.ts';
import { buildRowKey, createPeopleResolver, looseKey } from '../helpers/planningPeople.ts';
import {
  detectSheetStatus,
  foldText,
  MONTH_NAMES,
  parsePlanningGrid,
  parseSheetDays,
  parseSheetWeekLabel,
  sheetSerial,
  sheetServiceType,
  sheetTabMonth,
  splitPeople,
  type PlanningCellGrid,
  type PlanningGridCell,
  type SheetActivityStatus,
  type SheetWeek,
} from '../helpers/planningSheet.ts';

// ---------------------------------------------------------------------------------------------------------
// Contract

export type ImportRowStatus = 'nuevo' | 'duplicado' | 'invalido' | 'cancelado';

export interface ImportRow {
  id: string; // stable temp id: `${sheet}:${sheetRow}`
  sheet: string;
  sheetRow: number; // 1-based row in the worksheet
  weekLabel: string; // normalized like the sync: '12 AL 16 OCTUBRE' ('' when the week is unknown)
  weekStart: string | null; // ISO yyyy-mm-dd (Monday)
  weekEnd: string | null; // ISO (Friday)
  monthKey: string | null; // 'yyyy-mm'
  serviceType: ServiceType;
  rawType: string;
  platform: string;
  locality: string;
  serialNumber: string | null; // null when NA/N/A/PENDIENTE/empty or unreadable
  serialText: string; // raw cell text
  observations: string;
  engineer: string | null; // responsible (first of the crew), resolved to a profile name when possible
  companions: string[]; // rest of the crew + companion cell people
  daysText: string;
  scheduledDate: string | null;
  scheduledEndDate: string | null;
  sheetStatus: 'cancelado' | 'pospuesto' | null;
  status: ImportRowStatus;
  issues: string[];
  duplicateOfId?: string; // existing Orion ticket id when status === 'duplicado'
}

export interface ImportPreview {
  fileName: string;
  sheets: string[]; // tabs that produced at least one row, in workbook order
  rows: ImportRow[];
  warnings: string[];
}

export interface ExistingPlanningKey {
  id: string;
  weekLabel: string;
  subject: string;
  serial: string | null;
  sourceRowKey?: string | null;
}

export interface EquipmentRef {
  numero_serie: string;
  modelo?: string | null;
}

export interface ExportRow {
  weekLabel: string;
  weekStart: string;
  serviceType: ServiceType;
  platform: string;
  locality: string;
  serialNumber: string | null;
  observations: string;
  engineer: string;
  companions: string[];
  daysText: string;
  scheduledDate: string | null;
  scheduledEndDate: string | null;
  status: string;
  custom: Record<string, string>;
}

// ---------------------------------------------------------------------------------------------------------
// Small helpers

type ExcelJSModule = typeof import('exceljs');
type SheetJSModule = typeof import('xlsx');

// exceljs is CommonJS: Vite exposes it as `default`, node as `default` too, older bundles as the namespace.
const loadExcelJS = async () => {
  const imported = await import('exceljs');
  return ((imported as unknown as { default?: ExcelJSModule }).default || imported) as ExcelJSModule;
};

// SheetJS: node gets the CommonJS build (everything under `default`), Vite the ESM build (named exports).
const loadSheetJS = async () => {
  const imported = (await import('xlsx')) as unknown as SheetJSModule & { default?: SheetJSModule };
  return imported.default && typeof imported.default.read === 'function' ? imported.default : imported;
};

const cleanText = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();
const pad = (value: number) => `${value}`.padStart(2, '0');
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const utcIso = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
const isoToUtc = (iso: string) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))));
const addIsoDays = (iso: string, days: number) => {
  const date = isoToUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return utcIso(date);
};
// Builds an ISO date only when the day exists (no 31 de febrero rolling into March).
const isoFromParts = (year: number, monthIndex: number, day: number) => {
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || !Number.isInteger(day)) return null;
  const date = new Date(Date.UTC(year, monthIndex, day));
  return date.getUTCMonth() === monthIndex && date.getUTCDate() === day && year >= 1990 && year <= 2100 ? utcIso(date) : null;
};

const monthNumber = (word: string) => sheetTabMonth(word);

// Monday-to-Friday week that contains a date, labelled like the workbook ('28 AL 02 OCTUBRE').
const weekOfDate = (iso: string, tab: string): SheetWeek => {
  const weekday = (isoToUtc(iso).getUTCDay() + 6) % 7;
  const weekStart = addIsoDays(iso, -weekday);
  const weekEnd = addIsoDays(weekStart, 4);
  const label = `${weekStart.slice(8, 10)} AL ${weekEnd.slice(8, 10)} ${MONTH_NAMES[Number(weekEnd.slice(5, 7)) - 1]}`;
  return { tab, rawLabel: label, weekLabel: label, weekStart, weekEnd, monthKey: weekEnd.slice(0, 7) };
};

// ISO week number ("SEMANA 42", "S42", "42") of a given year.
const weekOfNumber = (text: string, year: number, tab: string) => {
  const match = foldText(text).match(/^(?:SEMANA|SEM|S|W)?\.?\s*(\d{1,2})$/);
  const number = match ? Number(match[1]) : 0;
  if (number < 1 || number > 53) return null;
  const january4 = `${year}-01-04`;
  const firstMonday = addIsoDays(january4, -((isoToUtc(january4).getUTCDay() + 6) % 7));
  return weekOfDate(addIsoDays(firstMonday, (number - 1) * 7), tab);
};

// Week titles parsePlanningGrid does not read by itself: a month on both sides ("28 SEPT AL 2 OCT") and
// leading words ("SEMANA DEL 12 AL 16 DE OCTUBRE"). Anything else comes back untouched.
const CROSSING_WEEK = /^(\d{1,2})\s*(?:DE\s+)?([A-Z]{3,})\.?\s*(?:AL|A|-)\s*(\d{1,2})\s*(?:DE\s+)?([A-Z]{3,})\b\.?(?:\s*(?:DEL?\s+)?(\d{4}|\d{2})\b)?/;
export const normalizeWeekLabel = (text: string) => {
  const folded = foldText(text).replace(/^(?:SEMANA\s+(?:DEL?\s+)?|DEL?\s+)(?=\d)/, '');
  const crossing = folded.match(CROSSING_WEEK);
  if (crossing) {
    const startMonth = monthNumber(crossing[2]);
    const endMonth = monthNumber(crossing[4]);
    if (startMonth !== null && endMonth !== null && (endMonth === startMonth || endMonth === (startMonth + 1) % 12)) {
      return `${crossing[1]} AL ${crossing[3]} ${MONTH_NAMES[endMonth]}${crossing[5] ? ` ${crossing[5]}` : ''}`;
    }
  }
  return folded !== foldText(text) && /^\d{1,2}\s*(?:AL|A|-)\s*\d{1,2}/.test(folded) ? folded : text;
};

const readWeekLabel = (text: string, year: number, tabMonth: number | null, tab: string) =>
  text ? parseSheetWeekLabel(normalizeWeekLabel(text), year, tabMonth, tab) : null;

// Dates typed as text: 14/10/2026, 14-10-26, 2026-10-14, "14 OCT", "MIE 14 DE OCTUBRE 2026", or an Excel serial.
const parseDateText = (text: string, year: number) => {
  const folded = foldText(text);
  if (!folded) return null;
  let match = folded.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (match) return isoFromParts(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  match = folded.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/);
  if (match) {
    const fullYear = match[3] ? (match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])) : year;
    return isoFromParts(fullYear, Number(match[2]) - 1, Number(match[1]));
  }
  match = folded.match(/\b(\d{1,2})\s+(?:DE\s+)?([A-Z]{3,})\.?(?:\s+(?:DE(?:L)?\s+)?(\d{4}))?\b/);
  if (match && monthNumber(match[2]) !== null) {
    return isoFromParts(match[3] ? Number(match[3]) : year, monthNumber(match[2]) as number, Number(match[1]));
  }
  match = folded.match(/^(\d{5})(?:\.\d+)?$/);
  if (match && Number(match[1]) > 30000 && Number(match[1]) < 80000) return addIsoDays('1899-12-30', Number(match[1]));
  return null;
};

const WEEKDAY_TOKENS: Array<[RegExp, number]> = [
  [/^LUN(ES)?$/, 0],
  [/^MAR(TES)?$/, 1],
  [/^MIE(RCOLES)?$/, 2],
  [/^JUE(VES)?$/, 3],
  [/^VIE(RNES)?$/, 4],
  [/^SAB(ADO)?$/, 5],
  [/^DOM(INGO)?$/, 6],
];

// Last day of a range in the days cell ("LUN-MAR", "7 AL 9", "30 SEP AL 2 OCT"), when it ends after `start`.
const daysRangeEnd = (daysText: string, week: SheetWeek, start: string | null) => {
  const folded = foldText(daysText);
  if (!start || !folded) return null;
  let end: string | null = null;
  const explicit = Array.from(folded.matchAll(/\b(\d{1,2})\s+(?:DE\s+)?([A-Z]{3,})/g)).filter((match) => monthNumber(match[2]) !== null);
  const numbers = Array.from(folded.matchAll(/\b(\d{1,2})\b/g), (match) => Number(match[1]));
  if (explicit.length > 1) {
    const last = explicit[explicit.length - 1];
    end = isoFromParts(Number(week.weekEnd.slice(0, 4)), monthNumber(last[2]) as number, Number(last[1]));
  } else if (numbers.length > 1) {
    const day = numbers[numbers.length - 1];
    for (let offset = -2; offset <= 8 && !end; offset += 1) {
      const candidate = addIsoDays(week.weekStart, offset);
      if (Number(candidate.slice(8, 10)) === day && candidate >= start) end = candidate;
    }
  } else if (numbers.length === 0) {
    const offsets = folded
      .split(/[^A-Z]+/)
      .map((token) => WEEKDAY_TOKENS.find(([pattern]) => pattern.test(token))?.[1])
      .filter((offset): offset is number => offset !== undefined);
    if (offsets.length > 1) end = addIsoDays(week.weekStart, offsets[offsets.length - 1]);
  }
  return end && end > start ? end : null;
};

// ---------------------------------------------------------------------------------------------------------
// Worksheets → cell grids

type SourceCell = PlanningGridCell & { date: string | null };
type SourceGrid = {
  rowCount: number;
  rowNumbers: number[];
  colCount: number;
  at: (row: number, col: number) => SourceCell | undefined;
};
type RawCell = { row: number; col: number; originRow: number; originCol: number; text: string; date: string | null; color: string | null };

const MAX_GRID_ROWS = 50000;
const MAX_GRID_COLUMNS = 60;

// Line breaks inside a cell separate people ("MARTHA\nFRANCISCO"), exactly as the HTML path reads them.
const cellText = (value: string) => cleanText(value.replace(/\r?\n/g, ' / '));
const dateWords = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

// Rows and columns are 0-based sheet coordinates; leading empty columns are dropped so a table that starts in
// column B still has its week titles in column 0, as parsePlanningGrid expects.
const buildSourceGrid = (cells: RawCell[]): SourceGrid => {
  const filled = cells.filter((cell) => cell.text || cell.date);
  if (filled.length === 0) return { rowCount: 0, rowNumbers: [], colCount: 0, at: () => undefined };
  const lastRow = Math.min(Math.max(...filled.map((cell) => cell.row)), MAX_GRID_ROWS - 1);
  const firstCol = Math.min(...filled.map((cell) => cell.col));
  const lastCol = Math.min(Math.max(...filled.map((cell) => cell.col)), firstCol + MAX_GRID_COLUMNS - 1);
  const rows: Array<Array<SourceCell | undefined>> = Array.from({ length: lastRow + 1 }, () => []);
  for (const cell of cells) {
    if (cell.row > lastRow || cell.col < firstCol || cell.col > lastCol) continue;
    rows[cell.row][cell.col - firstCol] = {
      text: cell.text,
      date: cell.date,
      color: cell.color,
      originRow: cell.originRow,
      originCol: Math.max(0, cell.originCol - firstCol),
    };
  }
  return {
    rowCount: rows.length,
    rowNumbers: rows.map((_, index) => index + 1),
    colCount: lastCol - firstCol + 1,
    at: (row, col) => rows[row]?.[col],
  };
};

const excelContent = (value: unknown): { text: string; date: string | null } => {
  if (value === null || value === undefined) return { text: '', date: null };
  if (value instanceof Date) {
    const iso = Number.isNaN(value.getTime()) ? null : utcIso(value);
    return iso && Number(iso.slice(0, 4)) >= 1990 ? { text: dateWords(iso), date: iso } : { text: '', date: null };
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.richText)) return { text: record.richText.map((part: { text?: string }) => part.text || '').join(''), date: null };
    if ('result' in record) return excelContent(record.result);
    if ('text' in record) return excelContent(record.text);
    return { text: '', date: null };
  }
  return { text: String(value), date: null };
};

const excelFillColor = (fill: unknown) => {
  const pattern = fill as { type?: string; pattern?: string; fgColor?: { argb?: string } } | undefined;
  if (!pattern || pattern.type !== 'pattern' || !pattern.pattern || pattern.pattern === 'none') return null;
  const argb = pattern.fgColor?.argb || '';
  return /^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(argb) ? `#${argb.slice(-6).toLowerCase()}` : null;
};

type SourceSheet = { name: string; grid: SourceGrid };

const readWithExcelJS = async (data: ArrayBuffer): Promise<SourceSheet[]> => {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  return workbook.worksheets
    .filter((sheet) => sheet.state !== 'veryHidden')
    .map((sheet) => {
      const cells: RawCell[] = [];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        row.eachCell({ includeEmpty: false }, (cell) => {
          // Merged cells repeat their top-left cell's value and fill, pointing back at it.
          const master = cell.master;
          const content = excelContent(master.value);
          cells.push({
            row: Number(cell.row) - 1,
            col: Number(cell.col) - 1,
            originRow: Number(master.row) - 1,
            originCol: Number(master.col) - 1,
            text: cellText(content.text),
            date: content.date,
            color: excelFillColor(master.fill),
          });
        });
      });
      return { name: sheet.name, grid: buildSourceGrid(cells) };
    });
};

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((byte, index) => bytes[index] === byte);

// Legacy .xls, .ods and .csv files (no fill colors there). CSV text is decoded here so accents survive and
// day/month dates are never read the US way.
const readWithSheetJS = async (data: ArrayBuffer): Promise<SourceSheet[]> => {
  const XLSX = await loadSheetJS();
  const bytes = new Uint8Array(data);
  const binary = startsWith(bytes, [0x50, 0x4b]) || startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0]);
  const decodeText = () => {
    const utf8 = new TextDecoder('utf-8').decode(bytes);
    const text = utf8.includes('�') ? new TextDecoder('windows-1252').decode(bytes) : utf8;
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x08\x0E-\x1F]/.test(text)) throw new Error('not a text table');
    return text;
  };
  const workbook = binary ? XLSX.read(bytes, { type: 'array', cellNF: true }) : XLSX.read(decodeText(), { type: 'string', raw: true });
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const byAddress = new Map<string, RawCell>();
    const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;
    for (let row = range?.s.r ?? 0; range && row <= range.e.r && row < MAX_GRID_ROWS; row += 1) {
      for (let col = range.s.c; col <= range.e.c; col += 1) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })] as { t?: string; v?: unknown; w?: string; z?: string } | undefined;
        if (!cell || cell.v === undefined || cell.v === null) continue;
        let date: string | null = null;
        if (cell.t === 'n' && typeof cell.v === 'number' && cell.z && XLSX.SSF.is_date(cell.z)) {
          const parts = XLSX.SSF.parse_date_code(cell.v) as { y: number; m: number; d: number };
          date = isoFromParts(parts.y, parts.m - 1, parts.d);
        }
        const text = date ? dateWords(date) : cellText(String(cell.w ?? cell.v));
        byAddress.set(`${row}:${col}`, { row, col, originRow: row, originCol: col, text, date, color: null });
      }
    }
    for (const merge of (sheet['!merges'] || []) as Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>) {
      const master = byAddress.get(`${merge.s.r}:${merge.s.c}`);
      if (!master) continue;
      for (let row = merge.s.r; row <= merge.e.r; row += 1) {
        for (let col = merge.s.c; col <= merge.e.c; col += 1) {
          if (row !== merge.s.r || col !== merge.s.c) byAddress.set(`${row}:${col}`, { ...master, row, col });
        }
      }
    }
    return { name, grid: buildSourceGrid(Array.from(byAddress.values())) };
  });
};

const readWorkbook = async (data: ArrayBuffer): Promise<SourceSheet[]> => {
  try {
    return await readWithExcelJS(data);
  } catch {
    try {
      return await readWithSheetJS(data);
    } catch {
      throw new Error('No se pudo leer el archivo. Usa un libro de Excel (.xlsx o .xls) o un .csv.');
    }
  }
};

// parsePlanningGrid reads week titles from column 0; this view hands it the titles it can parse.
const walkerView = (grid: SourceGrid): PlanningCellGrid => ({
  rowCount: grid.rowCount,
  rowNumbers: grid.rowNumbers,
  at: (row, col) => {
    const cell = grid.at(row, col);
    if (!cell || cell.originCol !== 0) return cell;
    const label = normalizeWeekLabel(cell.text);
    return label === cell.text ? cell : { ...cell, text: label };
  },
});

// ---------------------------------------------------------------------------------------------------------
// Flat tables

type FlatKey = 'type' | 'platform' | 'locality' | 'serial' | 'observations' | 'engineer' | 'companions' | 'days' | 'date' | 'endDate' | 'week' | 'status';

// Order matters: the first pattern that matches a header wins ("FECHA FIN" before "FECHA").
const FLAT_HEADERS: Array<[FlatKey, RegExp]> = [
  ['week', /^SEMANA\b(?! SANTA)/],
  ['endDate', /^(?:FECHA (?:DE )?(?:FIN|FINAL|TERMINO|CIERRE)|FIN|TERMINO|HASTA)\b/],
  ['date', /^(?:FECHA|INICIO|DESDE)\b/],
  ['type', /^(?:TIPO|ACTIVIDAD)\b/],
  ['platform', /^(?:PLATAFORMA|EQUIPO|MODELO|ANALIZADOR)\b/],
  ['locality', /^(?:LOCALIDAD|CLIENTE|HOSPITAL|INSTITUCION|UBICACION|SITIO)\b/],
  ['serial', /^(?:N ?S|NO S|N (?:DE )?SERIE|NO (?:DE )?SERIE|NUM(?:ERO)? (?:DE )?SERIE|SERIE)$/],
  ['observations', /^(?:OBSERVACION(?:ES)?|NOTAS?|COMENTARIOS?)\b/],
  ['engineer', /^(?:INGENIEROS?|RESPONSABLE|TECNICO)\b/],
  ['companions', /^ACOMPA/],
  ['days', /^DIAS?$/],
  ['status', /^(?:ESTADO|ESTATUS|STATUS)\b/],
];

const TYPE_WORDS = /PREVENT|CORRECT|CAPACIT|INSTAL|SOPORTE|INGENIERIA|RETIRO/;

const headerWord = (text: string) => foldText(text).replace(/[^A-Z0-9]+/g, ' ').trim();
const headerKey = (text: string): FlatKey | 'servicio' | null => {
  const word = headerWord(text);
  if (!word) return null;
  // "SERVICIO" alone is the service type in some files and the engineer crew in the official workbook.
  if (word === 'SERVICIO' || word === 'SERVICIOS') return 'servicio';
  return FLAT_HEADERS.find(([, pattern]) => pattern.test(word))?.[0] ?? null;
};

// Cells that start in this row and column (a merged cell counts once).
const ownCells = (grid: SourceGrid, row: number) => {
  const cells: Array<{ col: number; cell: SourceCell }> = [];
  for (let col = 0; col < grid.colCount; col += 1) {
    const cell = grid.at(row, col);
    if (cell && cell.originRow === row && cell.originCol === col && (cell.text || cell.date)) cells.push({ col, cell });
  }
  return cells;
};

type FlatHeader = { row: number; columns: Partial<Record<FlatKey, number>>; words: Map<number, string>; hasDateColumn: boolean };

// The header repeated further down (between week blocks): at least three cells say exactly what the header says.
const isRepeatedHeader = (grid: SourceGrid, row: number, header: FlatHeader) =>
  ownCells(grid, row).filter(({ col, cell }) => header.words.get(col) === headerWord(cell.text)).length >= Math.min(3, header.words.size);

const findFlatHeader = (grid: SourceGrid): FlatHeader | null => {
  for (let row = 0; row < grid.rowCount; row += 1) {
    const columns: Partial<Record<FlatKey, number>> = {};
    const words = new Map<number, string>();
    const ambiguous: number[] = [];
    let matched = 0;
    for (const { col, cell } of ownCells(grid, row)) {
      const key = headerKey(cell.text);
      if (!key) continue;
      matched += 1;
      words.set(col, headerWord(cell.text));
      if (key === 'servicio') ambiguous.push(col);
      else if (columns[key] === undefined) columns[key] = col;
    }
    if (matched < 3 || (columns.locality === undefined && columns.platform === undefined)) continue;
    for (const col of ambiguous) {
      let target: FlatKey;
      if (columns.type !== undefined) target = 'engineer';
      else if (columns.engineer !== undefined) target = 'type';
      else {
        const values = Array.from({ length: Math.min(50, grid.rowCount - row - 1) }, (_, index) => foldText(grid.at(row + 1 + index, col)?.text || '')).filter(Boolean);
        target = values.filter((value) => TYPE_WORDS.test(value)).length * 2 > values.length ? 'type' : 'engineer';
      }
      if (columns[target] === undefined) columns[target] = col;
    }
    return { row, columns, words, hasDateColumn: columns.week !== undefined || columns.date !== undefined || columns.endDate !== undefined };
  }
  return null;
};

type Draft = {
  sheet: string;
  sheetRow: number;
  week: SheetWeek | null;
  rawType: string;
  serviceType: ServiceType;
  platform: string;
  locality: string;
  serialText: string;
  serial: string;
  observations: string;
  rowNote: string;
  engineerTokens: string[];
  companionTokens: string[];
  daysText: string;
  scheduledDate: string | null;
  scheduledEndDate: string | null;
  sheetStatus: SheetActivityStatus;
  issues: string[];
};

const parseFlatSheet = (grid: SourceGrid, sheet: string, header: FlatHeader, year: number): Draft[] => {
  const tabMonth = sheetTabMonth(sheet);
  const { columns } = header;
  const drafts: Draft[] = [];
  let titleWeek: SheetWeek | null = null;

  for (let row = header.row + 1; row < grid.rowCount; row += 1) {
    const own = ownCells(grid, row);
    if (own.length === 0) continue;
    // A row holding only a week title ("12 AL 16 OCTUBRE") sets the week of the rows below it.
    if (own.length === 1) {
      const week = readWeekLabel(own[0].cell.text, year, tabMonth, sheet);
      // A title merged across the table that is not a week ("Sin semana") ends the previous week's block.
      const next = grid.at(row, 1);
      if (week || (own[0].col === 0 && next?.originRow === row && next.originCol === 0)) {
        titleWeek = week;
        continue;
      }
    }
    if (isRepeatedHeader(grid, row, header)) continue;

    const cell = (key: FlatKey) => (columns[key] === undefined ? undefined : grid.at(row, columns[key] as number));
    const text = (key: FlatKey) => cell(key)?.text || '';
    const ownText = (key: FlatKey) => (cell(key)?.originRow === row ? text(key) : '');
    const activityKeys: FlatKey[] = ['type', 'platform', 'locality', 'serial', 'observations', 'engineer', 'companions', 'days', 'date', 'week'];
    const isActivity = activityKeys.some((key) => ownText(key)) && Boolean(text('locality') || text('platform') || ownText('serial'));
    if (!isActivity) continue;

    const issues: string[] = [];
    let week: SheetWeek | null = null;
    const weekCell = cell('week');
    if (weekCell?.date) week = weekOfDate(weekCell.date, sheet);
    else if (weekCell?.text) week = readWeekLabel(weekCell.text, year, tabMonth, sheet) || weekOfNumber(weekCell.text, year, sheet);
    const unreadWeek = !week && weekCell?.text ? weekCell.text : '';
    week = week || titleWeek;

    const readDate = (key: FlatKey) => {
      const source = cell(key);
      if (!source || (!source.text && !source.date)) return null;
      const iso = source.date || parseDateText(source.text, week ? Number(week.weekEnd.slice(0, 4)) : year);
      if (!iso) issues.push(`Fecha no reconocida: «${source.text}»`);
      return iso;
    };
    const dateValue = readDate('date');
    const endValue = readDate('endDate');
    if (!week && dateValue) week = weekOfDate(dateValue, sheet);
    if (unreadWeek) {
      issues.push(week ? `Semana «${unreadWeek}» no reconocida; se tomó ${titleWeek ? 'la del título de semana' : 'la de la fecha'}` : `Semana no reconocida: «${unreadWeek}»`);
    }

    const rawType = text('type');
    const locality = text('locality');
    const observations = text('observations');
    const daysText = text('days');
    const companionsText = text('companions');
    const scheduledDate = dateValue || (week && daysText ? parseSheetDays(daysText, week) : null);
    const serialText = text('serial');
    drafts.push({
      sheet,
      sheetRow: grid.rowNumbers[row],
      week,
      rawType,
      serviceType: sheetServiceType(rawType, observations, locality),
      platform: text('platform'),
      locality,
      serialText,
      serial: sheetSerial(serialText),
      observations,
      rowNote: '',
      engineerTokens: splitPeople(text('engineer')),
      companionTokens: splitPeople(companionsText),
      daysText,
      scheduledDate,
      scheduledEndDate: endValue || (week ? daysRangeEnd(daysText, week, scheduledDate) : null),
      sheetStatus: detectSheetStatus(text('status'), daysText, companionsText),
      issues,
    });
  }
  return drafts;
};

// ---------------------------------------------------------------------------------------------------------
// Classification: issues, people, serials and duplicates

const SERIAL_PLACEHOLDER =
  /^(?:N\s*\/?\s*A|N\.\s*A\.?|NO APLICA|NO TIENE|PENDIENTE|DESCONOCIDO|POR (?:DEFINIR|CONFIRMAR|ASIGNAR)|SIN(?: (?:NS|N\/S|SERIE|NUMERO(?: DE SERIE)?))?|S\/N|SN|-+|\?+|X+|0+)$/;
const compactSerial = (value: string | null | undefined) => foldText(value || '').replace(/[^A-Z0-9]/g, '');
const modelCodes = (value: string) =>
  foldText(value)
    .split(/[\s/,;|+&]+/)
    .map((token) => token.replace(/[^A-Z0-9]/g, ''))
    .filter(Boolean);

// The registered model contradicts the platform only when both name model codes and none overlap
// ("BA400" vs "BA200"); a brand or a blank ("MINDRAY", "VARIOS") is not a contradiction.
const platformContradicts = (platform: string, model: string | null | undefined) => {
  const platformCodes = modelCodes(platform).filter((code) => /\d/.test(code));
  const registeredCodes = modelCodes(model || '').filter((code) => /\d/.test(code));
  if (platformCodes.length === 0 || registeredCodes.length === 0) return false;
  const platformAll = compactSerial(platform);
  const modelAll = compactSerial(model);
  if (platformAll.includes(modelAll) || modelAll.includes(platformAll)) return false;
  return !platformCodes.some((code) => registeredCodes.some((other) => code.includes(other) || other.includes(code)));
};

const TYPE_LABELS: Record<ServiceType, string> = {
  preventivo: 'Preventivo',
  correctivo: 'Correctivo',
  capacitacion: 'Capacitación',
  recapacitacion: 'Recapacitación',
  instalacion: 'Instalación',
  ingenieria_soporte: 'Ingeniería / Soporte',
};

type ClassifyOptions = { profiles: ProfileSummary[]; equipments: EquipmentRef[]; existing: ExistingPlanningKey[] };

const classify = (drafts: Draft[], options: ClassifyOptions): ImportRow[] => {
  const people = createPeopleResolver(options.profiles);
  const equipmentBySerial = new Map<string, EquipmentRef>();
  for (const equipment of options.equipments) {
    const key = compactSerial(equipment.numero_serie);
    if (key && !equipmentBySerial.has(key)) equipmentBySerial.set(key, equipment);
  }
  const checkRegistry = equipmentBySerial.size > 0;

  const keys = new Map<ImportRow, string>();
  const rows = drafts.map((draft): ImportRow => {
    const issues = [...draft.issues];
    const { week } = draft;

    let serialNumber: string | null = null;
    if (!draft.serialText || SERIAL_PLACEHOLDER.test(foldText(draft.serialText))) {
      issues.push('Sin NS');
    } else {
      const registered = equipmentBySerial.get(compactSerial(draft.serialText));
      const token = foldText(draft.serialText).replace(/\s+/g, '');
      serialNumber = cleanText(registered?.numero_serie) || draft.serial || (/^(?=.*\d)[A-Z0-9][A-Z0-9-]{3,}$/.test(token) ? token : null);
      if (!serialNumber) issues.push(`NS no reconocido: «${draft.serialText}»`);
      else if (checkRegistry && !registered) issues.push('NS no registrado en Equipos');
      else if (registered && draft.platform && platformContradicts(draft.platform, registered.modelo)) {
        issues.push(`Plataforma ${draft.platform} no coincide con Equipos (${cleanText(registered.modelo)})`);
      }
      if (registered && !draft.platform && cleanText(registered.modelo)) issues.push(`Falta plataforma (en Equipos: ${cleanText(registered.modelo)})`);
    }
    if (!draft.platform && !issues.some((issue) => issue.startsWith('Falta plataforma'))) issues.push('Falta plataforma');
    if (!draft.locality) issues.push('Falta localidad');
    if (!week && !issues.some((issue) => issue.startsWith('Semana no reconocida'))) issues.push('Semana no reconocida');
    if (!draft.rawType) issues.push(`Sin tipo de servicio (se tomó ${TYPE_LABELS[draft.serviceType]})`);

    // The workbook writes the whole crew in the engineer cell: the first one is responsible, the rest go along.
    const [lead, ...crew] = people.engineers(draft.engineerTokens);
    const companionCell = people.companions(draft.companionTokens);
    const companions = Array.from(new Set([...crew, ...companionCell.people])).filter((name) => name !== lead);
    const engineer = lead || null;
    if (!engineer) issues.push('Sin ingeniero asignado');
    else if (options.profiles.length > 0 && !people.profileFor(engineer)) issues.push(`Ingeniero sin perfil en Orion: ${engineer}`);
    const observations = Array.from(new Set([draft.observations, ...companionCell.notes, draft.rowNote].map(cleanText).filter(Boolean))).join(' · ');

    if (week && draft.daysText && !draft.scheduledDate && !detectSheetStatus(draft.daysText)) {
      issues.push(`Días sin fecha reconocible: «${draft.daysText}»`);
    }
    if (draft.sheetStatus === 'cancelado') issues.push('Cancelada en la hoja');
    if (draft.sheetStatus === 'pospuesto') issues.push('Pospuesta en la hoja');

    const status: ImportRowStatus = !draft.locality || !week ? 'invalido' : draft.sheetStatus === 'cancelado' ? 'cancelado' : 'nuevo';
    const row: ImportRow = {
      id: `${draft.sheet}:${draft.sheetRow}`,
      sheet: draft.sheet,
      sheetRow: draft.sheetRow,
      weekLabel: week?.weekLabel || '',
      weekStart: week?.weekStart || null,
      weekEnd: week?.weekEnd || null,
      monthKey: week?.monthKey || null,
      serviceType: draft.serviceType,
      rawType: draft.rawType,
      platform: draft.platform,
      locality: draft.locality,
      serialNumber,
      serialText: draft.serialText,
      observations,
      engineer,
      companions,
      daysText: draft.daysText,
      scheduledDate: draft.scheduledDate,
      scheduledEndDate: draft.scheduledEndDate,
      sheetStatus: draft.sheetStatus,
      status,
      issues,
    };
    if (week) keys.set(row, buildRowKey(week.weekLabel, buildPlanningSubject(draft.serviceType, draft.platform, draft.locality), serialNumber));
    return row;
  });

  // Orion activities by the sync's row key (and the key the sync stored), plus a loose index for rows where
  // one side has no serial: the workbook often says "NA" for an activity Orion already holds with its serial.
  const exact = new Map<string, ExistingPlanningKey[]>();
  const loose = new Map<string, Array<{ existing: ExistingPlanningKey; serial: string }>>();
  for (const existing of options.existing) {
    const key = buildRowKey(existing.weekLabel, existing.subject, existing.serial);
    for (const indexKey of new Set([key, cleanText(existing.sourceRowKey)].filter(Boolean))) {
      exact.set(indexKey, [...(exact.get(indexKey) || []), existing]);
    }
    loose.set(looseKey(key), [...(loose.get(looseKey(key)) || []), { existing, serial: key.split('|')[2] }]);
  }
  const consumed = new Set<string>();
  const exactMatch = (key: string) => (exact.get(key) || []).find((existing) => !consumed.has(existing.id));
  const looseMatch = (key: string) =>
    (loose.get(looseKey(key)) || []).find(({ existing, serial }) => !consumed.has(existing.id) && (!serial || !key.split('|')[2]))?.existing;
  const markExisting = (row: ImportRow, existing: ExistingPlanningKey, issue: string) => {
    consumed.add(existing.id);
    row.status = 'duplicado';
    row.duplicateOfId = existing.id;
    row.issues.push(issue);
  };

  // Exact matches first, so a loose match never takes the Orion activity another row matches exactly.
  for (const row of rows) {
    const key = keys.get(row);
    const existing = key && row.status === 'nuevo' ? exactMatch(key) : undefined;
    if (existing) markExisting(row, existing, 'Ya existe en Orion');
  }
  const seen = new Map<string, ImportRow>();
  for (const row of rows) {
    const key = keys.get(row);
    if (!key || (row.status !== 'nuevo' && row.status !== 'duplicado')) continue;
    const first = seen.get(key);
    if (row.status === 'nuevo' && first) {
      row.status = 'duplicado';
      row.issues.push(`Duplicado en el archivo (${first.sheet === row.sheet ? '' : `${first.sheet}, `}fila ${first.sheetRow})`);
    } else if (row.status === 'nuevo') {
      const existing = looseMatch(key);
      if (existing) markExisting(row, existing, 'Ya existe en Orion (sin NS en uno de los dos)');
    }
    if (!first) seen.set(key, row);
  }
  // Cancelled rows are not imported, but say so when Orion still holds them.
  for (const row of rows) {
    const key = keys.get(row);
    if (row.status === 'cancelado' && key && (exactMatch(key) || looseMatch(key))) row.issues.push('Ya existe en Orion');
  }
  return rows;
};

// ---------------------------------------------------------------------------------------------------------
// Import

export async function parsePlanningWorkbook(
  data: ArrayBuffer,
  options: { fileName: string; year?: number; profiles: ProfileSummary[]; equipments: EquipmentRef[]; existing: ExistingPlanningKey[] },
): Promise<ImportPreview> {
  const sheets = await readWorkbook(data);
  const warnings: string[] = [];
  const yearFromName = Number(options.fileName.match(/(?:^|\D)(20\d{2})(?!\d)/)?.[1]) || null;
  const year = options.year || yearFromName || new Date().getFullYear();
  if (!options.year && !yearFromName) warnings.push(`El archivo no indica el año; las semanas sin año se leyeron como ${year}.`);

  const drafts: Draft[] = [];
  const readSheets: string[] = [];
  let availabilityNotes = 0;
  for (const { name, grid } of sheets) {
    if (/^GUARDIA/.test(foldText(name))) {
      warnings.push(`La pestaña ${name} (guardias) no se importa aquí.`);
      continue;
    }
    if (grid.rowCount === 0) continue;

    const flatHeader = findFlatHeader(grid);
    const structured = parsePlanningGrid(walkerView(grid), { name, gid: '' }, year);
    let sheetDrafts: Draft[];
    // The official layout never has SEMANA/FECHA columns; a header with them is a flat table.
    if (flatHeader && (flatHeader.hasDateColumn || structured.activities.length === 0)) {
      sheetDrafts = parseFlatSheet(grid, name, flatHeader, year);
    } else if (structured.weeks.length > 0) {
      availabilityNotes += structured.notes.length;
      sheetDrafts = structured.activities.map((activity) => ({
        sheet: name,
        sheetRow: activity.sheetRow,
        week: activity.week,
        rawType: activity.rawType,
        serviceType: activity.serviceType,
        platform: activity.platform,
        locality: activity.locality,
        serialText: activity.serialText,
        serial: activity.serial,
        observations: activity.observations,
        rowNote: activity.rowNote,
        engineerTokens: activity.engineerTokens,
        companionTokens: activity.companionTokens,
        daysText: activity.daysText,
        scheduledDate: activity.scheduledDate,
        scheduledEndDate: daysRangeEnd(activity.daysText, activity.week, activity.scheduledDate),
        sheetStatus: activity.status,
        issues: [],
      }));
    } else {
      warnings.push(`La pestaña ${name} no tiene semanas ni encabezados reconocibles; no se leyó.`);
      continue;
    }
    if (sheetDrafts.length > 0) readSheets.push(name);
    else warnings.push(`La pestaña ${name} no tiene actividades.`);
    drafts.push(...sheetDrafts);
  }

  if (availabilityNotes > 0) {
    warnings.push(`${availabilityNotes} ${availabilityNotes === 1 ? 'nota' : 'notas'} de disponibilidad (VAC, TXT, cumpleaños…) no se importan como actividades.`);
  }
  if (options.equipments.length === 0) warnings.push('No se validaron los NS: no se cargó el catálogo de Equipos.');
  const rows = classify(drafts, options);
  if (rows.length === 0) warnings.push('No se encontraron actividades en el archivo.');
  return { fileName: options.fileName, sheets: readSheets, rows, warnings };
}

// ---------------------------------------------------------------------------------------------------------
// Export

const TYPE_FILLS: Record<ServiceType, string> = {
  preventivo: 'FFEAF6EC',
  correctivo: 'FFFFF4DF',
  instalacion: 'FFE7F0FB',
  capacitacion: 'FFF1ECFA',
  recapacitacion: 'FFF1ECFA',
  ingenieria_soporte: 'FFF1F3F5',
};
const HEADER_FILL = 'FF153C48';
const WEEK_FILL = 'FFE4E9EE';
const RULE_COLOR = 'FFD5DCE3';

// Week title with its year, so the file reads back the same in any year ("12 AL 16 OCTUBRE 2026").
const exportWeekTitle = (row: ExportRow) => {
  const start = ISO_DATE.test(row.weekStart || '') ? row.weekStart : '';
  const label = cleanText(row.weekLabel) || (start ? weekOfDate(start, '').weekLabel : '');
  if (!label || !start || /\b\d{4}\b/.test(label)) return label;
  const labelMonth = monthNumber(label.split(' ').pop() || '');
  const year = Number(start.slice(0, 4)) + (labelMonth === 0 && start.slice(5, 7) === '12' ? 1 : 0);
  return `${label} ${year}`;
};

const excelDate = (iso: string | null) => (iso && ISO_DATE.test(iso) ? new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))) : null);

type ExportColumn = { header: string; min: number; max: number; wrap?: boolean; date?: boolean; value: (row: ExportRow) => string | Date | null };

const sheetName = (title: string) =>
  cleanText(title.replace(/[[\]:*?/\\]/g, ' '))
    .replace(/^'+|'+$/g, '')
    .slice(0, 31) || 'Planeación';

export async function buildPlanningWorkbook(
  rows: ExportRow[],
  options: { title: string; groupByWeek: boolean; customColumns: { key: string; label: string }[] },
): Promise<ArrayBuffer> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Orion';
  workbook.title = options.title;
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName(options.title), { views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }] });

  const columns: ExportColumn[] = [
    // Without week title rows the week travels in its own column, or an undated row could not be placed again.
    ...(options.groupByWeek ? [] : [{ header: 'Semana', min: 18, max: 26, value: exportWeekTitle } satisfies ExportColumn]),
    { header: 'Tipo', min: 12, max: 22, value: (row) => TYPE_LABELS[row.serviceType] || '' },
    { header: 'Plataforma', min: 11, max: 22, value: (row) => row.platform },
    { header: 'Localidad', min: 18, max: 40, wrap: true, value: (row) => row.locality },
    { header: 'N/S', min: 11, max: 18, value: (row) => row.serialNumber || '' },
    { header: 'Observaciones', min: 22, max: 60, wrap: true, value: (row) => row.observations },
    { header: 'Ingeniero', min: 14, max: 28, value: (row) => row.engineer },
    { header: 'Acompañantes', min: 14, max: 36, wrap: true, value: (row) => row.companions.filter(Boolean).join(' / ') },
    { header: 'Días', min: 8, max: 18, value: (row) => row.daysText },
    { header: 'Fecha programada', min: 12, max: 12, date: true, value: (row) => excelDate(row.scheduledDate) },
    { header: 'Fecha fin', min: 11, max: 11, date: true, value: (row) => excelDate(row.scheduledEndDate) },
    { header: 'Estado', min: 11, max: 20, value: (row) => row.status },
    ...options.customColumns.map((column): ExportColumn => ({ header: column.label, min: 10, max: 32, wrap: true, value: (row) => row.custom?.[column.key] ?? '' })),
  ];
  const widths = columns.map((column) => column.header.length + 2);
  const thin = { style: 'thin' as const, color: { argb: RULE_COLOR } };

  const header = sheet.addRow(columns.map((column) => column.header));
  header.height = 22;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });

  const addActivity = (item: ExportRow) => {
    const values = columns.map((column) => column.value(item));
    const row = sheet.addRow(values);
    const fill = TYPE_FILLS[item.serviceType] || TYPE_FILLS.ingenieria_soporte;
    columns.forEach((column, index) => {
      const cell = row.getCell(index + 1);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      cell.border = { bottom: thin };
      cell.alignment = { vertical: 'top', wrapText: Boolean(column.wrap) };
      if (column.date) cell.numFmt = 'dd/mm/yyyy';
      const value = values[index];
      const length = value instanceof Date ? 10 : Math.max(0, ...String(value ?? '').split('\n').map((line) => line.length));
      widths[index] = Math.max(widths[index], length + 2);
    });
  };

  if (options.groupByWeek) {
    // Weeks in calendar order; rows keep their order inside a week.
    const groups = new Map<string, ExportRow[]>();
    const ordered = rows
      .map((row, index) => ({ row, index }))
      .sort((left, right) => (left.row.weekStart || '9999').localeCompare(right.row.weekStart || '9999') || left.index - right.index);
    for (const { row } of ordered) {
      const title = exportWeekTitle(row) || 'Sin semana';
      groups.set(title, [...(groups.get(title) || []), row]);
    }
    for (const [title, items] of groups) {
      const titleRow = sheet.addRow([title]);
      sheet.mergeCells(titleRow.number, 1, titleRow.number, columns.length);
      titleRow.height = 20;
      const cell = titleRow.getCell(1);
      cell.font = { bold: true, size: 12, color: { argb: HEADER_FILL } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WEEK_FILL } };
      cell.alignment = { vertical: 'middle' };
      items.forEach(addActivity);
    }
  } else {
    rows.forEach(addActivity);
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  }

  columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = Math.min(column.max, Math.max(column.min, widths[index]));
  });
  applyBrandFontToWorkbook(workbook);

  const output = (await workbook.xlsx.writeBuffer()) as ArrayBuffer | Uint8Array;
  if (output instanceof ArrayBuffer) return output;
  return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer;
}
