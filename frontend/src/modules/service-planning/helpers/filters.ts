import { comparePlannedServices } from './priority';
import { getAlertTitle, matchesAlert } from './calculateKpis';
import { formatPlanningPersonName, normalizeText, SERVICE_TYPE_LABELS, STATUS_LABELS } from './normalizeService';
import type { PlannedService, ServicePlanningFilters, ServiceSource } from '../types/servicePlanning.types';

export const SOURCE_LABELS: Record<ServiceSource, string> = {
  manual: 'Manual',
  excel_import: 'Excel',
  ticket: 'Ticket',
  orion: 'Orion',
};

export const createDefaultFilters = (month: string): ServicePlanningFilters => ({
  month,
  weekLabel: 'all',
  serviceType: 'all',
  platform: 'all',
  engineer: 'all',
  companion: 'all',
  status: 'all',
  alert: 'all',
  locality: 'all',
  priority: 'all',
  source: 'all',
  search: '',
  onlyMine: false,
});

export interface ActiveFilterChip {
  key: Exclude<keyof ServicePlanningFilters, 'month'>;
  label: string;
}

// Everything that narrows the month, so the page can always show (and undo) what is hiding services.
export const describeActiveFilters = (filters: ServicePlanningFilters): ActiveFilterChip[] => {
  const defaults = createDefaultFilters(filters.month);
  const chips: ActiveFilterChip[] = [];
  const add = (key: ActiveFilterChip['key'], label: string) => {
    if (filters[key] !== defaults[key]) chips.push({ key, label });
  };

  add('alert', `Alerta: ${filters.alert === 'all' ? '' : getAlertTitle(filters.alert)}`);
  add('weekLabel', `Semana: ${filters.weekLabel}`);
  add('serviceType', `Tipo: ${filters.serviceType === 'all' ? '' : SERVICE_TYPE_LABELS[filters.serviceType]}`);
  add('status', `Estado: ${filters.status === 'missing_day' ? 'Sin dia asignado' : filters.status === 'all' ? '' : STATUS_LABELS[filters.status]}`);
  add('engineer', `Ingeniero: ${formatPlanningPersonName(filters.engineer)}`);
  add('companion', `Acompañante: ${formatPlanningPersonName(filters.companion)}`);
  add('platform', `Plataforma: ${filters.platform}`);
  add('locality', `Localidad: ${filters.locality}`);
  add('priority', `Prioridad: ${filters.priority.charAt(0).toUpperCase()}${filters.priority.slice(1)}`);
  add('source', `Fuente: ${filters.source === 'all' ? '' : SOURCE_LABELS[filters.source]}`);
  add('search', `Búsqueda: «${filters.search.trim()}»`);
  add('onlyMine', 'Solo mis servicios');
  return chips;
};

export const applyServiceFilters = (
  services: PlannedService[],
  filters: ServicePlanningFilters,
  currentUserName: string,
) => {
  const search = normalizeText(filters.search);
  const mine = normalizeText(currentUserName);

  return services
    .filter((service) => service.month === filters.month)
    .filter((service) => filters.weekLabel === 'all' || service.weekLabel === filters.weekLabel)
    .filter((service) => filters.serviceType === 'all' || service.serviceType === filters.serviceType)
    .filter((service) => filters.platform === 'all' || service.platform === filters.platform)
    .filter((service) => filters.engineer === 'all' || service.responsibleEngineers.includes(filters.engineer))
    .filter((service) => filters.companion === 'all' || service.companions.includes(filters.companion))
    .filter((service) => filters.locality === 'all' || service.locality === filters.locality)
    .filter((service) => filters.priority === 'all' || service.priority === filters.priority)
    .filter((service) => filters.source === 'all' || service.source === filters.source)
    .filter((service) => {
      if (filters.status === 'all') {
        return true;
      }
      if (filters.status === 'missing_day') {
        return service.flags.missingScheduledDay;
      }
      return service.status.includes(filters.status);
    })
    .filter((service) => filters.alert === 'all' || matchesAlert(service, filters.alert))
    .filter((service) => {
      if (!filters.onlyMine || !mine) {
        return true;
      }
      return service.responsibleEngineers.some((engineer) => normalizeText(engineer) === mine);
    })
    .filter((service) => {
      if (!search) {
        return true;
      }

      const haystack = normalizeText(
        [
          service.locality,
          service.platform,
          service.serialNumber,
          service.observations,
          service.responsibleEngineers.join(' '),
          service.companions.join(' '),
          service.links.ticketId,
          service.customer,
          service.city,
          service.state,
        ]
          .filter(Boolean)
          .join(' '),
      );

      return haystack.includes(search);
    })
    .sort(comparePlannedServices);
};

export const buildFilterOptions = (services: PlannedService[]) => ({
  platforms: Array.from(new Set(services.map((service) => service.platform))).filter(Boolean).sort((left, right) => left.localeCompare(right, 'es')),
  engineers: Array.from(new Set(services.flatMap((service) => service.responsibleEngineers))).filter(Boolean).sort((left, right) => left.localeCompare(right, 'es')),
  companions: Array.from(new Set(services.flatMap((service) => service.companions))).filter(Boolean).sort((left, right) => left.localeCompare(right, 'es')),
  localities: Array.from(new Set(services.map((service) => service.locality))).filter(Boolean).sort((left, right) => left.localeCompare(right, 'es')),
});
