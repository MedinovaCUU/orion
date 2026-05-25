import { comparePlannedServices } from './priority';
import type { PlannedService, WeekBucket } from '../types/servicePlanning.types';

export const groupServicesByWeek = (services: PlannedService[]) => {
  const buckets = new Map<string, WeekBucket>();

  services.forEach((service) => {
    const key = `${service.month}-${service.weekLabel}`;
    const current =
      buckets.get(key) ||
      ({
        key,
        label: service.weekLabel,
        month: service.month,
        weekStart: service.weekStart,
        weekEnd: service.weekEnd,
        services: [],
        scheduledServices: [],
        unscheduledServices: [],
        total: 0,
        criticalCount: 0,
        pendingPaymentCount: 0,
        completedCount: 0,
      } satisfies WeekBucket);

    current.services.push(service);
    if (service.flags.missingScheduledDay) {
      current.unscheduledServices.push(service);
    } else {
      current.scheduledServices.push(service);
    }
    current.total += 1;
    if (service.flags.isCritical) current.criticalCount += 1;
    if (service.flags.requiresPayment) current.pendingPaymentCount += 1;
    if (service.flags.isCompleted) current.completedCount += 1;
    buckets.set(key, current);
  });

  return Array.from(buckets.values())
    .map((bucket) => ({
      ...bucket,
      services: [...bucket.services].sort(comparePlannedServices),
      scheduledServices: [...bucket.scheduledServices].sort(comparePlannedServices),
      unscheduledServices: [...bucket.unscheduledServices].sort(comparePlannedServices),
    }))
    .sort((left, right) => {
      const leftAnchor = left.weekStart || left.label;
      const rightAnchor = right.weekStart || right.label;
      return leftAnchor.localeCompare(rightAnchor);
    });
};

export const groupUpcomingServices = (services: PlannedService[]) =>
  [...services]
    .filter((service) => !service.flags.isCompleted)
    .sort(comparePlannedServices)
    .sort((left, right) => {
      if (left.scheduledDate && right.scheduledDate) {
        return left.scheduledDate.localeCompare(right.scheduledDate);
      }
      if (left.scheduledDate && !right.scheduledDate) return -1;
      if (!left.scheduledDate && right.scheduledDate) return 1;
      return 0;
    });
