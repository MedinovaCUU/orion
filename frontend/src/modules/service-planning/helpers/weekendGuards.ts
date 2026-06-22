import type { ProfileSummary } from '../../../components/servicesPlanning';
import { formatMonthKey, formatMonthLabel, normalizeText } from './normalizeService';
import type {
  GuardArea,
  GuardRosterMember,
  WeekendGuardAssignment,
  WeekendGuardMetrics,
  WeekendGuardOverrideMap,
  WeekendGuardScheduleData,
} from '../types/servicePlanning.types';

const WEEKEND_GUARDS_STORAGE_KEY = 'orion.servicePlanning.weekendGuards.v1';
const FUTURE_WEEKEND_HORIZON = 24;
const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

interface GuardRosterConfig {
  key: string;
  area: GuardArea;
  canonicalName: string;
  shortName: string;
  accentRgb: string;
  active: boolean;
  profileCandidates: string[];
  aliases: string[];
}

interface SeedWeekendPattern {
  weekendStart: string;
  applicativo: string;
  ingenieria: string;
}

const GUARD_ROSTER_CONFIG: GuardRosterConfig[] = [
  {
    key: 'miguel-chitala',
    area: 'aplicativo',
    canonicalName: 'Miguel Chitala',
    shortName: 'Chitala',
    accentRgb: '14, 165, 233',
    active: true,
    profileCandidates: ['Miguel Chitala'],
    aliases: ['chitala', 'miguel chitala'],
  },
  {
    key: 'ricardo-vilchis',
    area: 'aplicativo',
    canonicalName: 'Ricardo Vilchis',
    shortName: 'R. Vilchis',
    accentRgb: '249, 115, 22',
    active: true,
    profileCandidates: ['Ricardo Vilchis'],
    aliases: ['ricardo', 'ricardo vilchis', 'ricardo vilchys', 'ricardo de aplicativo', 'ricardo aplicativo'],
  },
  {
    key: 'ivonne-jaramillo',
    area: 'aplicativo',
    canonicalName: 'Ivonne Jaramillo',
    shortName: 'Ivonne',
    accentRgb: '236, 72, 153',
    active: true,
    profileCandidates: ['Ivonne Jaramillo'],
    aliases: ['ivonne', 'ivonne jaramillo'],
  },
  {
    key: 'martha-carbajal',
    area: 'aplicativo',
    canonicalName: 'Martha Carbajal',
    shortName: 'Martha',
    accentRgb: '168, 85, 247',
    active: true,
    profileCandidates: ['Martha Carbajal'],
    aliases: ['martha', 'martha carbajal'],
  },
  {
    key: 'olivia-angulo',
    area: 'aplicativo',
    canonicalName: 'Olivia Angulo',
    shortName: 'Olivia',
    accentRgb: '16, 185, 129',
    active: true,
    profileCandidates: ['Olivia Angulo'],
    aliases: ['olivia', 'olivia angulo'],
  },
  {
    key: 'guillermo-martinez',
    area: 'ingenieria',
    canonicalName: 'Guillermo Martinez',
    shortName: 'Guillermo',
    accentRgb: '59, 130, 246',
    active: true,
    profileCandidates: ['Guillermo Martinez'],
    aliases: ['guillermo', 'guillermo martinez'],
  },
  {
    key: 'fernanda',
    area: 'ingenieria',
    canonicalName: 'Fernanda',
    shortName: 'Fernanda',
    accentRgb: '244, 114, 182',
    active: false,
    profileCandidates: [],
    aliases: ['fernanda'],
  },
  {
    key: 'alfredo-acevedo',
    area: 'ingenieria',
    canonicalName: 'Alfredo Acevedo',
    shortName: 'Alfredo',
    accentRgb: '245, 158, 11',
    active: true,
    profileCandidates: ['Alfredo Acevedo'],
    aliases: ['alfredo', 'alfredo acevedo'],
  },
  {
    key: 'francisco',
    area: 'ingenieria',
    canonicalName: 'Francisco',
    shortName: 'Francisco',
    accentRgb: '239, 68, 68',
    active: true,
    profileCandidates: ['Francisco'],
    aliases: ['francisco'],
  },
  {
    key: 'milka',
    area: 'ingenieria',
    canonicalName: 'Milka',
    shortName: 'Milka',
    accentRgb: '251, 146, 60',
    active: false,
    profileCandidates: [],
    aliases: ['milka'],
  },
  {
    key: 'hector-cortes',
    area: 'ingenieria',
    canonicalName: 'Hector Cortes',
    shortName: 'Hector',
    accentRgb: '132, 204, 22',
    active: true,
    profileCandidates: ['Hector Cortes', 'Hector Cortés'],
    aliases: ['hector', 'hector cortes'],
  },
  {
    key: 'diego-garcia',
    area: 'ingenieria',
    canonicalName: 'Diego Garcia Garcia',
    shortName: 'D. Garcia',
    accentRgb: '6, 182, 212',
    active: true,
    profileCandidates: ['Diego Garcia Garcia', 'Diego García García'],
    aliases: ['diego', 'diego garcia', 'diego garcia garcia'],
  },
  {
    key: 'ricardo-montanez',
    area: 'ingenieria',
    canonicalName: 'Ricardo Montanez',
    shortName: 'R. Montañez',
    accentRgb: '99, 102, 241',
    active: true,
    profileCandidates: ['Ricardo Montanez', 'Ricardo Montañez'],
    aliases: ['ricardo', 'ricardo montanez', 'ricardo montañez', 'ricardo de ingenieria', 'ricardo ingenieria'],
  },
  {
    key: 'eduardo-bautista',
    area: 'ingenieria',
    canonicalName: 'Eduardo Ignacio Bautista',
    shortName: 'Eduardo',
    accentRgb: '217, 70, 239',
    active: true,
    profileCandidates: ['Eduardo Ignacio Bautista'],
    aliases: ['eduardo', 'eduardo bautista', 'eduardo ignacio bautista'],
  },
  {
    key: 'erick-duran',
    area: 'ingenieria',
    canonicalName: 'Erick Duran',
    shortName: 'Erick',
    accentRgb: '34, 197, 94',
    active: true,
    profileCandidates: ['Erick Duran'],
    aliases: ['erick', 'erick duran'],
  },
];

const SEED_WEEKEND_PATTERN: SeedWeekendPattern[] = [
  { weekendStart: '2026-01-17', applicativo: 'CHITALA', ingenieria: 'GUILLERMO' },
  { weekendStart: '2026-01-24', applicativo: 'RICARDO', ingenieria: 'FERNANDA' },
  { weekendStart: '2026-01-31', applicativo: 'IVONNE', ingenieria: 'ALFREDO' },
  { weekendStart: '2026-02-07', applicativo: 'MARTHA', ingenieria: 'FRANCISCO' },
  { weekendStart: '2026-02-14', applicativo: 'OLIVIA', ingenieria: 'MILKA' },
  { weekendStart: '2026-02-21', applicativo: 'CHITALA', ingenieria: 'HECTOR' },
  { weekendStart: '2026-02-28', applicativo: 'OLIVIA', ingenieria: 'DIEGO' },
  { weekendStart: '2026-03-07', applicativo: 'IVONNE', ingenieria: 'ALFREDO' },
  { weekendStart: '2026-03-14', applicativo: 'MARTHA', ingenieria: 'FRANCISCO' },
  { weekendStart: '2026-03-21', applicativo: 'CHITALA', ingenieria: 'HECTOR' },
  { weekendStart: '2026-03-28', applicativo: 'RICARDO', ingenieria: 'GUILLERMO' },
  { weekendStart: '2026-04-04', applicativo: 'IVONNE', ingenieria: 'EDUARDO' },
  { weekendStart: '2026-04-11', applicativo: 'OLIVIA', ingenieria: 'DIEGO GARCIA' },
  { weekendStart: '2026-04-18', applicativo: 'MARTHA', ingenieria: 'FRANCISCO' },
  { weekendStart: '2026-04-25', applicativo: 'RICARDO', ingenieria: 'RICARDO' },
  { weekendStart: '2026-05-02', applicativo: 'OLIVIA', ingenieria: 'ALFREDO' },
  { weekendStart: '2026-05-09', applicativo: 'MARTHA', ingenieria: 'GUILLERMO' },
  { weekendStart: '2026-05-16', applicativo: 'IVONNE', ingenieria: 'EDUARDO' },
  { weekendStart: '2026-05-23', applicativo: 'IVONNE', ingenieria: 'DIEGO GARCIA' },
  { weekendStart: '2026-05-30', applicativo: 'OLIVIA', ingenieria: 'ALFREDO' },
  { weekendStart: '2026-06-06', applicativo: 'MARTHA', ingenieria: 'FRANCISCO' },
  { weekendStart: '2026-06-13', applicativo: 'RICARDO', ingenieria: 'RICARDO' },
  { weekendStart: '2026-06-20', applicativo: 'OLIVIA', ingenieria: 'ALFREDO' },
  { weekendStart: '2026-06-27', applicativo: 'IVONNE', ingenieria: 'GUILLERMO' },
  { weekendStart: '2026-07-04', applicativo: 'MARTHA', ingenieria: 'EDUARDO' },
  { weekendStart: '2026-07-11', applicativo: 'RICARDO', ingenieria: 'DIEGO GARCIA' },
];

const startOfDay = (value: Date | string) => {
  const base = value instanceof Date ? new Date(value) : new Date(`${value}T12:00:00`);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12, 0, 0);
};

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (dateIso: string, days: number) => {
  const next = startOfDay(dateIso);
  next.setDate(next.getDate() + days);
  return toIsoDate(next);
};

const formatWeekendLabel = (weekendStart: string) => {
  const start = startOfDay(weekendStart);
  const end = startOfDay(addDays(weekendStart, 1));
  const monthName = MONTH_NAMES[start.getMonth()] || '';
  return `${start.getDate()} y ${end.getDate()} ${monthName}`;
};

const buildRotationRoster = (profiles: ProfileSummary[]) => {
  const profileByName = new Map(
    profiles
      .filter((profile) => Boolean(profile.nombre_completo))
      .map((profile) => [normalizeText(profile.nombre_completo || ''), profile] as const),
  );

  return GUARD_ROSTER_CONFIG.reduce<Record<GuardArea, GuardRosterMember[]>>(
    (accumulator, config) => {
      const matchedProfile =
        config.profileCandidates
          .map((candidate) => profileByName.get(normalizeText(candidate)))
          .find(Boolean) || null;
      const fullName = matchedProfile?.nombre_completo?.trim() || config.canonicalName;

      accumulator[config.area].push({
        key: config.key,
        area: config.area,
        fullName,
        shortName: config.shortName,
        active: config.active,
        accentRgb: config.accentRgb,
        profileId: matchedProfile?.id,
        employeeType: matchedProfile?.employee_type || null,
        role: matchedProfile?.rol || null,
      });

      return accumulator;
    },
    { aplicativo: [], ingenieria: [] },
  );
};

const getConfiguredMemberByRawName = (
  area: GuardArea,
  rawName: string,
  roster: Record<GuardArea, GuardRosterMember[]>,
) => {
  const normalized = normalizeText(rawName);
  const config = GUARD_ROSTER_CONFIG.find(
    (candidate) => candidate.area === area && candidate.aliases.some((alias) => normalizeText(alias) === normalized),
  );

  if (!config) {
    return null;
  }

  return roster[area].find((member) => member.key === config.key) || null;
};

const sanitizeOverrideValue = (
  value: string | undefined,
  area: GuardArea,
  roster: Record<GuardArea, GuardRosterMember[]>,
) => {
  if (!value) {
    return undefined;
  }

  const normalized = normalizeText(value);
  const directMatch = roster[area].find((member) => normalizeText(member.fullName) === normalized);
  if (directMatch) {
    return directMatch.fullName;
  }

  const configuredMatch = getConfiguredMemberByRawName(area, value, roster);
  return configuredMatch?.fullName;
};

const getActiveNamesForArea = (roster: Record<GuardArea, GuardRosterMember[]>, area: GuardArea) =>
  roster[area].filter((member) => member.active).map((member) => member.fullName);

const normalizeOverrideMap = (
  overrides: WeekendGuardOverrideMap,
  roster: Record<GuardArea, GuardRosterMember[]>,
) =>
  Object.values(overrides).reduce<WeekendGuardOverrideMap>((accumulator, override) => {
    if (!override?.weekendStart) {
      return accumulator;
    }

    const applicativo = sanitizeOverrideValue(override.applicativo, 'aplicativo', roster);
    const ingenieria = sanitizeOverrideValue(override.ingenieria, 'ingenieria', roster);
    const note = override.note?.trim() || undefined;

    if (!applicativo && !ingenieria && !note) {
      return accumulator;
    }

    accumulator[override.weekendStart] = {
      weekendStart: override.weekendStart,
      ...(applicativo ? { applicativo } : {}),
      ...(ingenieria ? { ingenieria } : {}),
      ...(note ? { note } : {}),
      ...(override.updatedAt ? { updatedAt: override.updatedAt } : {}),
      ...(override.updatedBy ? { updatedBy: override.updatedBy } : {}),
    };
    return accumulator;
  }, {});

const namesMatch = (left: string | null | undefined, right: string | null | undefined) =>
  normalizeText(left || '') === normalizeText(right || '');

const moveNameToEnd = (queue: string[], name: string) => {
  if (!name.trim()) {
    return queue;
  }

  return [...queue.filter((candidate) => !namesMatch(candidate, name)), name];
};

const buildFutureQueue = (
  area: GuardArea,
  roster: Record<GuardArea, GuardRosterMember[]>,
  historicalAssignments: WeekendGuardAssignment[],
) => {
  const activeNames = getActiveNamesForArea(roster, area);
  // The seed history only tells us where the rotation stands today. It is not used
  // to "catch up" anyone; new participants simply join after the active queue.
  const lastAssignedByName = historicalAssignments.reduce<Map<string, string>>((accumulator, assignment) => {
    const assignedName = area === 'aplicativo' ? assignment.applicativoAssigned : assignment.ingenieriaAssigned;
    if (!activeNames.some((candidate) => namesMatch(candidate, assignedName))) {
      return accumulator;
    }

    const canonicalName = activeNames.find((candidate) => namesMatch(candidate, assignedName)) || assignedName;
    accumulator.set(canonicalName, assignment.weekendStart);
    return accumulator;
  }, new Map<string, string>());

  const withHistory = activeNames
    .filter((name) => lastAssignedByName.has(name))
    .sort((left, right) => {
      const leftDate = lastAssignedByName.get(left) || '';
      const rightDate = lastAssignedByName.get(right) || '';
      if (leftDate !== rightDate) {
        return leftDate.localeCompare(rightDate);
      }
      return left.localeCompare(right, 'es');
    });
  const withoutHistory = activeNames.filter((name) => !lastAssignedByName.has(name));

  return [...withHistory, ...withoutHistory];
};

export const loadWeekendGuardOverrides = (): WeekendGuardOverrideMap => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(WEEKEND_GUARDS_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as WeekendGuardOverrideMap;
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
};

export const saveWeekendGuardOverrides = (overrides: WeekendGuardOverrideMap) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(WEEKEND_GUARDS_STORAGE_KEY, JSON.stringify(overrides));
};

export const buildWeekendGuardSchedule = (
  profiles: ProfileSummary[],
  overrides: WeekendGuardOverrideMap,
  referenceDate = new Date(),
): WeekendGuardScheduleData => {
  const roster = buildRotationRoster(profiles);
  const sanitizedOverrides = normalizeOverrideMap(overrides, roster);
  const rawAssignments: Array<Omit<WeekendGuardAssignment, 'phase'>> = [];
  const today = startOfDay(referenceDate).getTime();
  const historicalSeedPattern = SEED_WEEKEND_PATTERN.filter(
    (seedEntry) => startOfDay(seedEntry.weekendStart).getTime() <= today,
  );

  for (const seedEntry of historicalSeedPattern) {
    const override = sanitizedOverrides[seedEntry.weekendStart];
    const applicativoOriginal =
      getConfiguredMemberByRawName('aplicativo', seedEntry.applicativo, roster)?.fullName || seedEntry.applicativo;
    const ingenieriaOriginal =
      getConfiguredMemberByRawName('ingenieria', seedEntry.ingenieria, roster)?.fullName || seedEntry.ingenieria;
    const applicativoAssigned = override?.applicativo || applicativoOriginal;
    const ingenieriaAssigned = override?.ingenieria || ingenieriaOriginal;

    rawAssignments.push({
      weekendStart: seedEntry.weekendStart,
      weekendEnd: addDays(seedEntry.weekendStart, 1),
      month: formatMonthKey(seedEntry.weekendStart),
      label: formatWeekendLabel(seedEntry.weekendStart),
      source: 'seed',
      applicativoOriginal,
      applicativoAssigned,
      ingenieriaOriginal,
      ingenieriaAssigned,
      hasOverride: Boolean(
        (override?.applicativo && normalizeText(override.applicativo) !== normalizeText(applicativoOriginal)) ||
          (override?.ingenieria && normalizeText(override.ingenieria) !== normalizeText(ingenieriaOriginal)) ||
          override?.note,
      ),
      note: override?.note,
      updatedAt: override?.updatedAt,
      updatedBy: override?.updatedBy,
    });
  }

  const seedAssignments = rawAssignments as WeekendGuardAssignment[];
  let applicativoQueue = buildFutureQueue('aplicativo', roster, seedAssignments);
  let engineeringQueue = buildFutureQueue('ingenieria', roster, seedAssignments);
  let cursor = historicalSeedPattern[historicalSeedPattern.length - 1]?.weekendStart || toIsoDate(referenceDate);

  for (let index = 0; index < FUTURE_WEEKEND_HORIZON; index += 1) {
    cursor = addDays(cursor, 7);
    const override = sanitizedOverrides[cursor];
    const applicativoOriginal = applicativoQueue[0] || getActiveNamesForArea(roster, 'aplicativo')[0] || '';
    const ingenieriaOriginal = engineeringQueue[0] || getActiveNamesForArea(roster, 'ingenieria')[0] || '';
    const applicativoAssigned = override?.applicativo || applicativoOriginal;
    const ingenieriaAssigned = override?.ingenieria || ingenieriaOriginal;

    if (namesMatch(applicativoAssigned, applicativoOriginal)) {
      applicativoQueue = [...applicativoQueue.slice(1), applicativoOriginal];
    } else {
      applicativoQueue = moveNameToEnd(applicativoQueue, applicativoAssigned);
    }

    if (namesMatch(ingenieriaAssigned, ingenieriaOriginal)) {
      engineeringQueue = [...engineeringQueue.slice(1), ingenieriaOriginal];
    } else {
      engineeringQueue = moveNameToEnd(engineeringQueue, ingenieriaAssigned);
    }

    rawAssignments.push({
      weekendStart: cursor,
      weekendEnd: addDays(cursor, 1),
      month: formatMonthKey(cursor),
      label: formatWeekendLabel(cursor),
      source: 'generated',
      applicativoOriginal,
      applicativoAssigned,
      ingenieriaOriginal,
      ingenieriaAssigned,
      hasOverride: Boolean(
        (override?.applicativo && normalizeText(override.applicativo) !== normalizeText(applicativoOriginal)) ||
          (override?.ingenieria && normalizeText(override.ingenieria) !== normalizeText(ingenieriaOriginal)) ||
          override?.note,
      ),
      note: override?.note,
      updatedAt: override?.updatedAt,
      updatedBy: override?.updatedBy,
    });
  }

  const firstUpcomingIndex = rawAssignments.findIndex((assignment) => startOfDay(assignment.weekendEnd).getTime() >= today);
  const assignments: WeekendGuardAssignment[] = rawAssignments.map((assignment, index) => ({
    ...assignment,
    phase:
      startOfDay(assignment.weekendEnd).getTime() < today
        ? 'historico'
        : index === firstUpcomingIndex
          ? 'proximo'
          : 'programado',
  }));
  const months = Array.from(new Set(assignments.map((assignment) => assignment.month))).sort();
  const firstUpcoming = assignments[firstUpcomingIndex] || null;
  const metrics: WeekendGuardMetrics = {
    totalWeekends: assignments.length,
    overrideCount: assignments.filter((assignment) => assignment.hasOverride).length,
    upcomingCount: assignments.filter((assignment) => assignment.phase !== 'historico').length,
    nextWeekendLabel: firstUpcoming ? `${firstUpcoming.label} · ${formatMonthLabel(firstUpcoming.month)}` : 'Sin guardias futuras',
  };

  return {
    months,
    roster,
    assignments,
    metrics,
  };
};
