import { groupUpcomingServices } from './weekGrouping';
import type {
  AlertSummary,
  EngineerLoadSummary,
  PlannedService,
  ServicePlanningKpis,
  ServiceStatus,
} from '../types/servicePlanning.types';

const countByStatus = (services: PlannedService[], status: ServiceStatus) =>
  services.filter((service) => service.status.includes(status)).length;

export const calculateEngineerLoad = (services: PlannedService[]): EngineerLoadSummary[] => {
  const loadMap = new Map<string, EngineerLoadSummary>();

  services.forEach((service) => {
    const engineers = service.responsibleEngineers.length > 0 ? service.responsibleEngineers : ['Sin asignar'];
    engineers.forEach((engineer) => {
      const current =
        loadMap.get(engineer) ||
        ({
          engineer,
          total: 0,
          critical: 0,
          corrective: 0,
          preventive: 0,
          pending: 0,
          completed: 0,
          loadRatio: 0,
          overload: false,
          services: [],
        } satisfies EngineerLoadSummary);

      current.total += 1;
      if (service.flags.isCritical) current.critical += 1;
      if (service.serviceType === 'correctivo') current.corrective += 1;
      if (service.serviceType === 'preventivo') current.preventive += 1;
      if (!service.flags.isCompleted) current.pending += 1;
      if (service.flags.isCompleted) current.completed += 1;
      current.services.push(service);
      loadMap.set(engineer, current);
    });
  });

  const maxLoad = Math.max(...Array.from(loadMap.values()).map((item) => item.total), 1);

  return Array.from(loadMap.values())
    .map((item) => ({
      ...item,
      loadRatio: item.total / maxLoad,
      overload: item.total >= Math.max(6, Math.ceil(maxLoad * 0.85)),
    }))
    .sort((left, right) => right.total - left.total || right.critical - left.critical);
};

export const buildAlerts = (services: PlannedService[]): AlertSummary[] => [
  {
    key: 'critical',
    title: 'Criticos / Falcon',
    description: 'Servicios que deben quedar al frente de la agenda.',
    count: services.filter((service) => service.flags.isCritical).length,
    tone: 'critical',
    services: services.filter((service) => service.flags.isCritical),
  },
  {
    key: 'payment',
    title: 'Requieren pago',
    description: 'Bloqueos administrativos antes de ejecutar.',
    count: services.filter((service) => service.flags.requiresPayment).length,
    tone: 'warning',
    services: services.filter((service) => service.flags.requiresPayment),
  },
  {
    key: 'blocked',
    title: 'Bloqueados',
    description: 'Casos detenidos por condición operativa.',
    count: services.filter((service) => service.flags.isBlocked).length,
    tone: 'critical',
    services: services.filter((service) => service.flags.isBlocked),
  },
  {
    key: 'missing_day',
    title: 'Sin dia asignado',
    description: 'Servicios sin fecha o dia firme dentro de la semana.',
    count: services.filter((service) => service.flags.missingScheduledDay).length,
    tone: 'neutral',
    services: services.filter((service) => service.flags.missingScheduledDay),
  },
  {
    key: 'missing_engineer',
    title: 'Sin ingeniero',
    description: 'Asignaciones incompletas listas para coordinación.',
    count: services.filter((service) => service.flags.missingEngineer).length,
    tone: 'neutral',
    services: services.filter((service) => service.flags.missingEngineer),
  },
  {
    key: 'completed',
    title: 'Ya realizados',
    description: 'Servicios cerrados, visibles para control y trazabilidad.',
    count: services.filter((service) => service.flags.isCompleted).length,
    tone: 'success',
    services: services.filter((service) => service.flags.isCompleted),
  },
  {
    key: 'missing_serial',
    title: 'NS pendiente',
    description: 'Registros con numero de serie faltante.',
    count: services.filter((service) => service.flags.missingSerial).length,
    tone: 'warning',
    services: services.filter((service) => service.flags.missingSerial),
  },
];

export const calculateKpis = (services: PlannedService[]): ServicePlanningKpis => {
  const servicesByEngineer = calculateEngineerLoad(services);
  const servicesByPlatform = Array.from(
    services.reduce((map, service) => map.set(service.platform, (map.get(service.platform) || 0) + 1), new Map<string, number>()),
  )
    .map(([label, total]) => ({ label, total }))
    .sort((left, right) => right.total - left.total);

  const servicesByWeek = Array.from(
    services.reduce((map, service) => map.set(service.weekLabel, (map.get(service.weekLabel) || 0) + 1), new Map<string, number>()),
  )
    .map(([label, total]) => ({ label, total }))
    .sort((left, right) => left.label.localeCompare(right.label));

  const servicesByStatus = Array.from(
    services.reduce((map, service) => {
      service.status.forEach((status) => map.set(status, (map.get(status) || 0) + 1));
      return map;
    }, new Map<string, number>()),
  )
    .map(([label, total]) => ({ label, total }))
    .sort((left, right) => right.total - left.total);

  const servicesBySource = Array.from(
    services.reduce((map, service) => map.set(service.source, (map.get(service.source) || 0) + 1), new Map<string, number>()),
  )
    .map(([label, total]) => ({ label, total }))
    .sort((left, right) => right.total - left.total);

  return {
    totalServices: services.length,
    preventiveCount: services.filter((service) => service.serviceType === 'preventivo').length,
    correctiveCount: services.filter((service) => service.serviceType === 'correctivo').length,
    trainingCount: services.filter((service) => service.serviceType === 'capacitacion').length,
    retrainingCount: services.filter((service) => service.serviceType === 'recapacitacion').length,
    installationCount: services.filter((service) => service.serviceType === 'instalacion').length,
    engineeringSupportCount: services.filter((service) => service.serviceType === 'ingenieria_soporte').length,
    pendingPaymentCount: countByStatus(services, 'requiere_pago'),
    completedCount: countByStatus(services, 'realizado'),
    criticalCount: countByStatus(services, 'critico'),
    warrantyCount: countByStatus(services, 'garantia'),
    comodatoCount: countByStatus(services, 'comodato'),
    unassignedCount: countByStatus(services, 'sin_asignar'),
    blockedCount: countByStatus(services, 'bloqueado'),
    confirmedCount: countByStatus(services, 'confirmado'),
    servicesByEngineer,
    servicesByPlatform,
    servicesByWeek,
    servicesByStatus,
    servicesBySource,
    upcomingServices: groupUpcomingServices(services).slice(0, 8),
  };
};
