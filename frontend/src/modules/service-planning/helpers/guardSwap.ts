import type { WeekendGuardAssignment, WeekendGuardOverrideMap } from '../types/servicePlanning.types';

export type SwapArea = 'applicativo' | 'ingenieria';
export type GuardSwapDraft = { applicativo: string; ingenieria: string; note: string };
export const assignedName = (assignment: WeekendGuardAssignment, area: SwapArea) =>
  area === 'applicativo' ? assignment.applicativoAssigned : assignment.ingenieriaAssigned;

export const guardSwapCandidates = (assignments: WeekendGuardAssignment[], source: WeekendGuardAssignment, area: SwapArea, person: string) =>
  assignments.filter(a => a.weekendStart !== source.weekendStart && a.phase !== 'historico' && assignedName(a, area) === person)
    .sort((a, b) => a.weekendStart.localeCompare(b.weekendStart));

/** Apply both sides of each exchange to a single map, preserving unrelated changes. */
export function applyGuardSwap(assignments: WeekendGuardAssignment[], overrides: WeekendGuardOverrideMap, sourceDate: string, draft: GuardSwapDraft, targets: Partial<Record<SwapArea, string>>, actor: string): WeekendGuardOverrideMap {
  const source = assignments.find(a => a.weekendStart === sourceDate);
  if (!source) throw new Error('La guardia ya no está disponible.');
  const edits = new Map<string, GuardSwapDraft>();
  const edit = (a: WeekendGuardAssignment) => {
    let value = edits.get(a.weekendStart);
    if (!value) { value = { applicativo: a.applicativoAssigned, ingenieria: a.ingenieriaAssigned, note: a.note || '' }; edits.set(a.weekendStart, value); }
    return value;
  };
  edit(source).note = draft.note.trim();
  for (const area of ['applicativo', 'ingenieria'] as const) {
    const incoming = draft[area].trim();
    const outgoing = assignedName(source, area);
    if (incoming === outgoing) continue;
    const target = guardSwapCandidates(assignments, source, area, incoming).find(a => a.weekendStart === targets[area]);
    if (!target) throw new Error('Selecciona una guardia vigente de la persona con quien harás la permuta.');
    edit(source)[area] = incoming;
    edit(target)[area] = outgoing;
  }
  const next = { ...overrides };
  const updatedAt = new Date().toISOString();
  for (const [date, values] of edits) {
    const base = assignments.find(a => a.weekendStart === date)!;
    const applicativo = values.applicativo !== base.applicativoOriginal ? values.applicativo : undefined;
    const ingenieria = values.ingenieria !== base.ingenieriaOriginal ? values.ingenieria : undefined;
    if (!applicativo && !ingenieria && !values.note) delete next[date];
    else next[date] = { weekendStart: date, applicativo, ingenieria, note: values.note || undefined, updatedAt, updatedBy: actor };
  }
  return next;
}
