import { formatPlanningPersonName, normalizeText } from '../helpers/normalizeService';
import type { PlanningRecord, PlanningValues } from './planningRecord';
import { addDays, daysBetween } from './planningWeeks';

// Same person, same days, different places. Informative only: nothing is blocked. Activities without a
// concrete day (only the week) are not compared, and by default two activities at the same place are
// considered compatible (several equipment at one hospital), to avoid false alarms.

export interface ConflictRules {
  enabled: boolean;
  sameLocalityIsConflict: boolean;
  includeCompanions: boolean;
}

export const DEFAULT_CONFLICT_RULES: ConflictRules = { enabled: true, sameLocalityIsConflict: false, includeCompanions: true };

export interface ScheduleConflict {
  person: string;
  otherId: string;
  otherLabel: string;
  days: string[];
}

const DAY_INDEX: Record<string, number> = { LUN: 0, LUNES: 0, MAR: 1, MARTES: 1, MIE: 2, MIERCOLES: 2, JUE: 3, JUEVES: 3, VIE: 4, VIERNES: 4, SAB: 5, SABADO: 5, DOM: 6, DOMINGO: 6 };

// "LUN-MAR", "MIE", "LUN, MIE", "LUN A MIE", "7 AL 9", "28 y 29" → dates inside the activity's week.
export const daysFromText = (text: string, weekStart: string): string[] => {
  const folded = normalizeText(text).toUpperCase();
  if (!folded) return [];
  const range = folded.match(/^([A-Z]+)\s*(?:-|A|AL)\s*([A-Z]+)$/);
  if (range && range[1] in DAY_INDEX && range[2] in DAY_INDEX) {
    const from = DAY_INDEX[range[1]];
    const to = DAY_INDEX[range[2]];
    return to >= from ? Array.from({ length: to - from + 1 }, (_, offset) => addDays(weekStart, from + offset)) : [];
  }
  const names = folded.split(/[\s,/Y]+/).filter(Boolean);
  if (names.length && names.every((name) => name in DAY_INDEX)) return names.map((name) => addDays(weekStart, DAY_INDEX[name]));
  const numbers = folded.match(/^(\d{1,2})\s*(?:-|AL|A|Y|,)\s*(\d{1,2})$/) || folded.match(/^(\d{1,2})$/);
  if (numbers) {
    const weekDays = Array.from({ length: 7 }, (_, offset) => addDays(weekStart, offset));
    const first = weekDays.find((date) => Number(date.slice(8, 10)) === Number(numbers[1]));
    const last = numbers[2] ? weekDays.find((date) => Number(date.slice(8, 10)) === Number(numbers[2])) : first;
    if (first && last && last >= first) return Array.from({ length: daysBetween(first, last) + 1 }, (_, offset) => addDays(first, offset));
  }
  return [];
};

export const activityDays = (record: PlanningRecord, values: PlanningValues): string[] => {
  if (values.scheduledDate) {
    const end = values.scheduledEndDate && values.scheduledEndDate >= values.scheduledDate ? values.scheduledEndDate : values.scheduledDate;
    const span = Math.min(daysBetween(values.scheduledDate, end), 30);
    return Array.from({ length: span + 1 }, (_, offset) => addDays(values.scheduledDate, offset));
  }
  return daysFromText(values.days, record.week.start);
};

export const findScheduleConflicts = (
  items: Array<{ record: PlanningRecord; values: PlanningValues }>,
  rules: ConflictRules = DEFAULT_CONFLICT_RULES,
): Map<string, ScheduleConflict[]> => {
  const result = new Map<string, ScheduleConflict[]>();
  if (!rules.enabled) return result;
  const byPerson = new Map<string, Array<{ id: string; label: string; locality: string; days: Set<string> }>>();
  const displayName = new Map<string, string>();
  for (const { record, values } of items) {
    if (record.closed || values.statuses.includes('realizado')) continue;
    const days = activityDays(record, values);
    if (!days.length) continue;
    const people = [values.engineer, ...(rules.includeCompanions ? values.companions : [])].filter(Boolean);
    for (const person of people) {
      const key = normalizeText(person);
      if (!displayName.has(key)) displayName.set(key, formatPlanningPersonName(person) || person);
      const entry = { id: record.id, label: `${values.platform || 'Servicio'} · ${values.locality || 'sin localidad'}`, locality: normalizeText(values.locality), days: new Set(days) };
      byPerson.set(key, [...(byPerson.get(key) || []), entry]);
    }
  }
  byPerson.forEach((entries, key) => {
    for (let left = 0; left < entries.length; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        const a = entries[left];
        const b = entries[right];
        if (a.id === b.id) continue;
        if (!rules.sameLocalityIsConflict && a.locality && a.locality === b.locality) continue;
        const shared = [...a.days].filter((day) => b.days.has(day)).sort();
        if (!shared.length) continue;
        const person = displayName.get(key) || key;
        result.set(a.id, [...(result.get(a.id) || []), { person, otherId: b.id, otherLabel: b.label, days: shared }]);
        result.set(b.id, [...(result.get(b.id) || []), { person, otherId: a.id, otherLabel: a.label, days: shared }]);
      }
    }
  });
  return result;
};
