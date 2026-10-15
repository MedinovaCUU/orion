import type { ProfileSummary } from '../../../components/servicesPlanning';
import { formatPlanningPersonName, normalizeText } from '../helpers/normalizeService';
import { createPeopleResolver } from '../helpers/planningPeople';
import { foldText, splitPeople, type SheetAvailabilityNote } from '../helpers/planningSheet';
import { addDays, daysBetween, formatShortIso, fromIsoDate } from './planningWeeks';

// Absences (TXT "tiempo por tiempo", vacations, permits…) per person and date range. They come from the
// official sheet's notes or are added in Orion, show on the calendar and the table, and turn into a
// warning when the person has a service on one of those days.

export type AbsenceKind = 'TXT' | 'VAC' | 'PERMISO' | 'INCAPACIDAD' | 'CUMPLEANOS' | 'OTRO';

export const ABSENCE_KINDS: AbsenceKind[] = ['TXT', 'VAC', 'PERMISO', 'INCAPACIDAD', 'CUMPLEANOS', 'OTRO'];

export const ABSENCE_LABELS: Record<AbsenceKind, string> = {
  TXT: 'TXT (tiempo por tiempo)',
  VAC: 'Vacaciones',
  PERMISO: 'Permiso',
  INCAPACIDAD: 'Incapacidad',
  CUMPLEANOS: 'Cumpleaños',
  OTRO: 'Otra ausencia',
};

export const ABSENCE_SHORT: Record<AbsenceKind, string> = {
  TXT: 'TXT',
  VAC: 'Vacaciones',
  PERMISO: 'Permiso',
  INCAPACIDAD: 'Incapacidad',
  CUMPLEANOS: 'Cumpleaños',
  OTRO: 'Ausencia',
};

export interface PlanningAbsence {
  id: string;
  personId: string | null;
  personName: string;
  kind: AbsenceKind;
  startDate: string;
  endDate: string;
  note: string;
  source: 'orion' | 'sheet';
  sheetKey: string | null;
  sheetSyncedAt: string | null;
  orionEditedAt: string | null;
  version: number;
  createdByName: string | null;
  updatedByName: string | null;
  updatedAt: string | null;
  /** Shown only: a change the current user sent for approval. */
  proposal?: 'insert' | 'update' | 'delete';
}

export type AbsenceInput = Pick<PlanningAbsence, 'personName' | 'kind' | 'startDate' | 'endDate' | 'note'> & { personId?: string | null };

const MAX_DAYS = 120;

export const absenceDays = (absence: Pick<PlanningAbsence, 'startDate' | 'endDate'>) => {
  const span = Math.min(Math.max(daysBetween(absence.startDate, absence.endDate), 0), MAX_DAYS);
  return Array.from({ length: span + 1 }, (_, offset) => addDays(absence.startDate, offset));
};

export const overlaps = (absence: Pick<PlanningAbsence, 'startDate' | 'endDate'>, from: string, to: string) =>
  absence.startDate <= to && absence.endDate >= from;

export const personKey = (name: string) => normalizeText(name);

const DAY_NAMES = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

export const describeAbsenceDates = (absence: Pick<PlanningAbsence, 'startDate' | 'endDate'>) => {
  const label = (iso: string) => `${DAY_NAMES[(fromIsoDate(iso).getDay() + 6) % 7]} ${Number(iso.slice(8, 10))}`;
  if (absence.startDate === absence.endDate) return label(absence.startDate);
  return `${label(absence.startDate)} a ${label(absence.endDate)}`;
};

export const describeAbsence = (absence: PlanningAbsence) =>
  `${ABSENCE_SHORT[absence.kind]} · ${formatPlanningPersonName(absence.personName) || absence.personName} (${describeAbsenceDates(absence)})`;

export const absenceTitle = (absence: PlanningAbsence) =>
  `${ABSENCE_LABELS[absence.kind]}: ${formatPlanningPersonName(absence.personName) || absence.personName}, ${absence.startDate === absence.endDate ? formatShortIso(absence.startDate) : `${formatShortIso(absence.startDate)} al ${formatShortIso(absence.endDate)}`}${absence.note ? ` · ${absence.note}` : ''}`;

// ----- from the official sheet -----

const SHEET_KIND: Array<[RegExp, AbsenceKind]> = [
  [/\bTXT\b|\bDESCANSO\b/, 'TXT'],
  [/\bVAC(ACIONES)?\b|\bSEMANA SANTA\b/, 'VAC'],
  [/\bINCAPACIDAD\b/, 'INCAPACIDAD'],
  [/\bPERMISO\b/, 'PERMISO'],
  [/\bCUMPLE/, 'CUMPLEANOS'],
];

// "06", "03 AL 05", "4 Y 5", "28 AL 02" → dates inside the note's week (a week can cross months).
const sheetDayRanges = (daysLabel: string, weekStart: string): Array<[string, string]> => {
  const week = Array.from({ length: 7 }, (_, offset) => addDays(weekStart, offset));
  const dateFor = (day: number) => week.find((iso) => Number(iso.slice(8, 10)) === day) || null;
  const folded = foldText(daysLabel);
  if (!folded) return [[weekStart, addDays(weekStart, 4)]];
  const range = folded.match(/^(\d{1,2})\s*(?:AL|A|-)\s*(\d{1,2})$/);
  if (range) {
    const from = dateFor(Number(range[1]));
    const to = dateFor(Number(range[2]));
    return from && to && to >= from ? [[from, to]] : [];
  }
  const dates = Array.from(folded.matchAll(/\d{1,2}/g), (match) => dateFor(Number(match[0]))).filter((iso): iso is string => Boolean(iso)).sort();
  const ranges: Array<[string, string]> = [];
  for (const iso of dates) {
    const last = ranges[ranges.length - 1];
    if (last && addDays(last[1], 1) === iso) last[1] = iso;
    else if (!last || last[1] !== iso) ranges.push([iso, iso]);
  }
  return ranges;
};

export interface SheetAbsence extends AbsenceInput {
  sheetKey: string;
}

/** Absences a sheet note describes; notes that are not about someone being away give nothing. */
export const sheetNoteToAbsences = (note: SheetAvailabilityNote, profiles: ProfileSummary[]): SheetAbsence[] => {
  const folded = foldText(note.text);
  const kind = SHEET_KIND.find(([pattern]) => pattern.test(folded))?.[1];
  if (!kind) return [];
  const resolver = createPeopleResolver(profiles);
  const people = splitPeople(note.personText).flatMap((token) => resolver.engineers([token]));
  if (!people.length) return [];
  const ranges = sheetDayRanges(note.daysLabel, note.week.weekStart);
  return people.flatMap((personName) =>
    ranges.map(([startDate, endDate]) => ({
      personName,
      personId: resolver.profileFor(personName)?.id || null,
      kind,
      startDate,
      endDate,
      note: note.text,
      sheetKey: [note.tab, note.sheetRow, folded, personKey(personName), startDate].join('|'),
    })),
  );
};
