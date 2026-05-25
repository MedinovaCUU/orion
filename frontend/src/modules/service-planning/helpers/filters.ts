import { comparePlannedServices } from './priority';
import { normalizeText } from './normalizeService';
import type { PlannedService, ServicePlanningFilters } from '../types/servicePlanning.types';

export const createDefaultFilters = (month: string): ServicePlanningFilters => ({
  month,
  weekLabel: 'all',
  serviceType: 'all',
  platform: 'all',
  engineer: 'all',
  companion: 'all',
  status: 'all',
  locality: 'all',
  priority: 'all',
  source: 'all',
  search: '',
  onlyMine: false,
});

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
