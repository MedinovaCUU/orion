import { formatPlanningPersonName, normalizeText, STATUS_LABELS } from '../helpers/normalizeService';
import type { SavedViewConfig } from './planningBackend';
import { TYPE_LABELS } from './planningColumns';
import type { PlanningRecord, PlanningValues } from './planningRecord';

// Search and filters over the same records every view uses (nothing is copied per view).

export type FilterKey = 'engineer' | 'serviceType' | 'platform' | 'locality' | 'status' | 'week';

export interface GridFilters {
  search: string;
  filters: Partial<Record<FilterKey, string[]>>;
  dateFrom: string;
  dateTo: string;
  onlyMine: boolean;
  onlyOpen: boolean;
}

export const EMPTY_FILTERS: GridFilters = { search: '', filters: {}, dateFrom: '', dateTo: '', onlyMine: false, onlyOpen: false };

export interface BuiltInView {
  id: string;
  name: string;
  config: SavedViewConfig;
}

export const BUILT_IN_VIEWS: BuiltInView[] = [
  { id: 'general', name: 'Planeación general', config: { layout: 'table' } },
  { id: 'mine', name: 'Mis servicios', config: { layout: 'table', onlyMine: true } },
  { id: 'pending', name: 'Servicios pendientes', config: { layout: 'table', onlyOpen: true } },
  { id: 'correctivos', name: 'Correctivos', config: { layout: 'table', filters: { serviceType: ['correctivo'] } } },
  { id: 'calendar', name: 'Calendario mensual', config: { layout: 'calendar' } },
];

const fold = (value: string) => normalizeText(value);

const haystack = (record: PlanningRecord, values: PlanningValues) =>
  fold(
    [
      TYPE_LABELS[values.serviceType],
      values.platform,
      values.locality,
      values.serialNumber,
      values.observations,
      values.engineer,
      formatPlanningPersonName(values.engineer),
      ...values.companions,
      values.days,
      ...values.statuses.map((status) => STATUS_LABELS[status]),
      record.ticketNumber || '',
      record.week.label,
      record.service.customer || '',
      record.service.city || '',
      record.service.state || '',
      ...Object.values(values.custom),
    ].join(' '),
  );

// "BA400 Chihuahua" finds rows that mention both words, in any column.
export const matchesSearch = (record: PlanningRecord, values: PlanningValues, search: string) => {
  const terms = fold(search).split(' ').filter(Boolean);
  if (!terms.length) return true;
  const text = haystack(record, values);
  return terms.every((term) => text.includes(term));
};

const recordDates = (record: PlanningRecord, values: PlanningValues) => {
  const from = values.scheduledDate || record.week.start;
  const to = values.scheduledEndDate || values.scheduledDate || record.week.end;
  return { from, to };
};

export const isDone = (record: PlanningRecord, values: PlanningValues) => record.closed || values.statuses.includes('realizado');

export const matchesFilters = (record: PlanningRecord, values: PlanningValues, state: GridFilters, currentUserName: string) => {
  const { filters } = state;
  const people = [values.engineer, ...values.companions].map(fold);
  if (filters.engineer?.length && !filters.engineer.some((name) => people.includes(fold(name)))) return false;
  if (filters.serviceType?.length && !filters.serviceType.includes(values.serviceType)) return false;
  if (filters.platform?.length && !filters.platform.some((platform) => fold(platform) === fold(values.platform))) return false;
  if (filters.locality?.length && !filters.locality.some((locality) => fold(locality) === fold(values.locality))) return false;
  if (filters.status?.length) {
    const wanted = filters.status;
    const sinIngeniero = wanted.includes('sin_asignar') && !values.engineer;
    if (!sinIngeniero && !values.statuses.some((status) => wanted.includes(status))) return false;
  }
  if (filters.week?.length && !filters.week.includes(record.week.start)) return false;
  if (state.onlyOpen && isDone(record, values)) return false;
  if (state.onlyMine) {
    const me = fold(currentUserName);
    if (!me || !people.some((person) => person === me || person.startsWith(`${me} `) || me.startsWith(`${person} `))) return false;
  }
  if (state.dateFrom || state.dateTo) {
    const { from, to } = recordDates(record, values);
    if (state.dateFrom && to < state.dateFrom) return false;
    if (state.dateTo && from > state.dateTo) return false;
  }
  return matchesSearch(record, values, state.search);
};

export const activeFilterCount = (state: GridFilters) =>
  Object.values(state.filters).filter((values) => values && values.length).length +
  (state.dateFrom || state.dateTo ? 1 : 0) +
  (state.onlyMine ? 1 : 0) +
  (state.onlyOpen ? 1 : 0) +
  (state.search.trim() ? 1 : 0);

export const filtersFromView = (config: SavedViewConfig): GridFilters => ({
  search: config.search || '',
  filters: config.filters || {},
  dateFrom: config.dateFrom || '',
  dateTo: config.dateTo || '',
  onlyMine: Boolean(config.onlyMine),
  onlyOpen: Boolean(config.onlyOpen),
});

export const viewFromFilters = (state: GridFilters, layout: 'table' | 'calendar', hiddenColumns?: string[]): SavedViewConfig => ({
  search: state.search || undefined,
  filters: Object.fromEntries(Object.entries(state.filters).filter(([, values]) => values && values.length)),
  dateFrom: state.dateFrom || undefined,
  dateTo: state.dateTo || undefined,
  onlyMine: state.onlyMine || undefined,
  onlyOpen: state.onlyOpen || undefined,
  layout,
  hiddenColumns,
});
