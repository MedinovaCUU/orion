import type { PlannedService, ServicePriority } from '../types/servicePlanning.types';

const PRIORITY_RANK: Record<ServicePriority, number> = {
  critica: 400,
  alta: 300,
  media: 200,
  baja: 100,
};

const TYPE_RANK: Record<PlannedService['serviceType'], number> = {
  correctivo: 700,
  instalacion: 400,
  capacitacion: 300,
  recapacitacion: 250,
  preventivo: 200,
  ingenieria_soporte: 150,
};

export const getPriorityRank = (priority: ServicePriority) => PRIORITY_RANK[priority] || 0;

export const getServiceOperationalRank = (service: PlannedService) => {
  if (service.flags.isCritical) return 10000;
  if (service.flags.isBlocked) return 9500;
  if (service.serviceType === 'correctivo') return 9000;
  if (service.flags.requiresPayment) return 8500;
  if (service.flags.missingEngineer) return 8000;
  if (service.flags.missingScheduledDay) return 7500;
  if (service.serviceType === 'instalacion') return 7000;
  if (service.serviceType === 'capacitacion') return 6500;
  if (service.serviceType === 'recapacitacion') return 6000;
  if (service.serviceType === 'preventivo') return 5500;
  if (service.flags.isCompleted) return 1000;
  return TYPE_RANK[service.serviceType] || 0;
};

export const comparePlannedServices = (left: PlannedService, right: PlannedService) => {
  const rankDiff = getServiceOperationalRank(right) - getServiceOperationalRank(left);
  if (rankDiff !== 0) {
    return rankDiff;
  }

  const priorityDiff = getPriorityRank(right.priority) - getPriorityRank(left.priority);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  if (left.scheduledDate && right.scheduledDate && left.scheduledDate !== right.scheduledDate) {
    return left.scheduledDate.localeCompare(right.scheduledDate);
  }

  if (left.scheduledDate && !right.scheduledDate) return -1;
  if (!left.scheduledDate && right.scheduledDate) return 1;

  return left.locality.localeCompare(right.locality, 'es');
};
