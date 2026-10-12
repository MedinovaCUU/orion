import {
  parseGuardsTab,
  parsePlanningTab,
  parseSheetIndex,
  sheetTabMonth,
  type SheetActivity,
  type SheetAvailabilityNote,
  type SheetGuardWeekend,
  type SheetTab,
  type SheetWeek,
} from './planningSheet';

// Official planning workbook, shared read-only. Google answers these pages with CORS headers,
// so Orion reads it straight from the browser without a server in between.
export const PLANNING_SHEET_ID = '1V7Uhwp1esEfP7UVv-v8FrDQTUhV7SjT9';
export const PLANNING_SHEET_URL = `https://docs.google.com/spreadsheets/u/0/d/${PLANNING_SHEET_ID}/htmlview`;
export const planningSheetTabUrl = (gid: string) => `${PLANNING_SHEET_URL}#gid=${gid}`;
const tabHtmlUrl = (gid: string) => `${PLANNING_SHEET_URL}/sheet?headers=true&gid=${gid}`;

const GUARDS_TAB = 'GUARDIAS';
const CACHE_MS = 5 * 60_000;

export type PlanningSheetSnapshot = {
  title: string;
  year: number;
  fetchedAt: string;
  tabs: SheetTab[];
  readTabs: string[];
  weeks: SheetWeek[];
  activities: SheetActivity[];
  notes: SheetAvailabilityNote[];
  guards: SheetGuardWeekend[];
  warnings: string[];
};

const fetchText = async (url: string) => {
  const response = await fetch(url, { credentials: 'omit', cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`La hoja oficial de planeación no respondió (${response.status}).`);
  }
  return response.text();
};

const currentMonthKey = () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Ciudad_Juarez' });
  return today.slice(0, 7);
};

const previousMonthKey = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${`${month - 1}`.padStart(2, '0')}`;
};

const loadSnapshot = async (fromMonth: string): Promise<PlanningSheetSnapshot> => {
  const index = parseSheetIndex(await fetchText(PLANNING_SHEET_URL));
  if (index.tabs.length === 0) {
    throw new Error('No se encontraron pestañas en la hoja oficial de planeación.');
  }

  const year = index.year || Number(fromMonth.slice(0, 4));
  // Past months are history (already closed in Orion) and some old tabs weigh 10+ MB,
  // so only the previous month onward is read. The previous one holds weeks that cross into this month.
  const planningTabs = index.tabs.filter((tab) => {
    const month = sheetTabMonth(tab.name);
    return month !== null && `${year}-${`${month + 1}`.padStart(2, '0')}` >= fromMonth;
  });
  const guardsTab = index.tabs.find((tab) => tab.name.trim().toUpperCase() === GUARDS_TAB);

  const [planningPages, guardsPage] = await Promise.all([
    Promise.all(planningTabs.map(async (tab) => ({ tab, html: await fetchText(tabHtmlUrl(tab.gid)) }))),
    guardsTab ? fetchText(tabHtmlUrl(guardsTab.gid)) : Promise.resolve(''),
  ]);

  const snapshot: PlanningSheetSnapshot = {
    title: index.title,
    year,
    fetchedAt: new Date().toISOString(),
    tabs: index.tabs,
    readTabs: planningTabs.map((tab) => tab.name),
    weeks: [],
    activities: [],
    notes: [],
    guards: guardsPage ? parseGuardsTab(guardsPage, year) : [],
    warnings: guardsTab ? [] : ['La hoja oficial no tiene pestaña de guardias.'],
  };

  for (const { tab, html } of planningPages) {
    const parsed = parsePlanningTab(html, tab, year);
    snapshot.weeks.push(...parsed.weeks);
    snapshot.activities.push(...parsed.activities);
    snapshot.notes.push(...parsed.notes);
    snapshot.warnings.push(...parsed.warnings);
  }

  return snapshot;
};

let cached: { at: number; fromMonth: string; promise: Promise<PlanningSheetSnapshot> } | null = null;

export const fetchPlanningSheet = ({ force = false, fromMonth = previousMonthKey(currentMonthKey()) } = {}) => {
  if (!force && cached && cached.fromMonth <= fromMonth && Date.now() - cached.at < CACHE_MS) {
    return cached.promise;
  }
  const promise = loadSnapshot(fromMonth);
  cached = { at: Date.now(), fromMonth, promise };
  promise.catch(() => {
    if (cached?.promise === promise) cached = null;
  });
  return promise;
};
