import type { PlanningRecord, PlanningValues } from './planningRecord';
import type { DraftRow } from './planningStore';
import type { ChangeRequest } from './planningApprovals';
import { addDays, mondayOf, weekFromMonday, weeksOfMonth, type PlanningWeek } from './planningWeeks';

// The flat list the table renders: a band per week, its activities in order, then the capture row.

export type GridRow =
  | { kind: 'week'; key: string; week: PlanningWeek; count: number; current: boolean; collapsed: boolean }
  | { kind: 'record'; key: string; record: PlanningRecord; values: PlanningValues; week: PlanningWeek; order: number }
  | { kind: 'draft'; key: string; draft: DraftRow; values: PlanningValues; week: PlanningWeek; order: number }
  | { kind: 'capture'; key: string; week: PlanningWeek; order: number }
  | { kind: 'proposal'; key: string; request: ChangeRequest; values: PlanningValues; week: PlanningWeek; order: number };

export type DataRow = Exclude<GridRow, { kind: 'week' }>;

export const captureKey = (week: PlanningWeek) => `capture:${week.start}`;

const defaultSortKey = (record: PlanningRecord, values: PlanningValues) => `${values.scheduledDate || '9999'}|${record.createdAt}|${record.id}`;

export interface BuildRowsInput {
  month: string;
  dateFrom?: string;
  dateTo?: string;
  items: Array<{ record: PlanningRecord; values: PlanningValues }>;
  drafts: DraftRow[];
  collapsed: Set<string>;
  today: string;
  showCapture: boolean;
  /** New activities the user proposed and are waiting for approval. */
  proposals?: Array<{ request: ChangeRequest; week: PlanningWeek; values: PlanningValues }>;
}

const weeksBetween = (from: string, to: string) => {
  const weeks: PlanningWeek[] = [];
  for (let monday = mondayOf(from); monday <= to && weeks.length < 60; monday = addDays(monday, 7)) weeks.push(weekFromMonday(monday));
  return weeks;
};

export const buildGridRows = ({ month, dateFrom, dateTo, items, drafts, collapsed, today, showCapture, proposals = [] }: BuildRowsInput): GridRow[] => {
  const ranged = Boolean(dateFrom || dateTo);
  const baseWeeks = ranged ? weeksBetween(dateFrom || dateTo || today, dateTo || dateFrom || today) : weeksOfMonth(month);
  const weeks = new Map(baseWeeks.map((week) => [week.start, week]));
  const inScope = (week: PlanningWeek) => (ranged ? true : week.monthKey === month);

  const byWeek = new Map<string, Array<{ record: PlanningRecord; values: PlanningValues }>>();
  for (const item of items) {
    if (!inScope(item.record.week)) continue;
    if (!weeks.has(item.record.week.start)) weeks.set(item.record.week.start, item.record.week);
    byWeek.set(item.record.week.start, [...(byWeek.get(item.record.week.start) || []), item]);
  }
  const draftsByWeek = new Map<string, DraftRow[]>();
  for (const draft of drafts) {
    if (!weeks.has(draft.week.start)) {
      if (!inScope(draft.week)) continue;
      weeks.set(draft.week.start, draft.week);
    }
    draftsByWeek.set(draft.week.start, [...(draftsByWeek.get(draft.week.start) || []), draft]);
  }

  const proposalsByWeek = new Map<string, NonNullable<BuildRowsInput['proposals']>>();
  for (const proposal of proposals) {
    if (!weeks.has(proposal.week.start)) {
      if (!inScope(proposal.week)) continue;
      weeks.set(proposal.week.start, proposal.week);
    }
    proposalsByWeek.set(proposal.week.start, [...(proposalsByWeek.get(proposal.week.start) || []), proposal]);
  }

  const rows: GridRow[] = [];
  for (const week of Array.from(weeks.values()).sort((left, right) => left.start.localeCompare(right.start))) {
    const entries = byWeek.get(week.start) || [];
    // Explicit order (dragged rows) wins; otherwise by date, then creation.
    const sorted = [...entries].sort((left, right) => defaultSortKey(left.record, left.values).localeCompare(defaultSortKey(right.record, right.values)));
    const ordered = sorted.map((entry, index) => ({ entry, order: entry.record.order ?? (index + 1) * 1000 }));
    const weekDrafts = draftsByWeek.get(week.start) || [];
    const dataRows: Array<Exclude<GridRow, { kind: 'week' | 'capture' }>> = [
      ...ordered.map(({ entry, order }) => ({ kind: 'record' as const, key: entry.record.id, record: entry.record, values: entry.values, week, order })),
      ...weekDrafts.map((draft) => ({ kind: 'draft' as const, key: draft.id, draft, values: draft.values, week, order: draft.order })),
    ].sort((left, right) => left.order - right.order);
    const isCollapsed = collapsed.has(week.start);
    rows.push({ kind: 'week', key: `week:${week.start}`, week, count: entries.length, current: today >= week.start && today <= addDays(week.start, 6), collapsed: isCollapsed });
    if (isCollapsed) continue;
    rows.push(...dataRows);
    (proposalsByWeek.get(week.start) || []).forEach((proposal, index) =>
      rows.push({ kind: 'proposal', key: `req:${proposal.request.id}`, request: proposal.request, values: proposal.values, week, order: Number.MAX_SAFE_INTEGER - 50000 + index }),
    );
    if (showCapture) {
      const last = dataRows[dataRows.length - 1];
      rows.push({ kind: 'capture', key: `capture:${week.start}`, week, order: (last && last.order < Number.MAX_SAFE_INTEGER - 100000 ? last.order : dataRows.length * 1000) + 1000 });
    }
  }
  return rows;
};
