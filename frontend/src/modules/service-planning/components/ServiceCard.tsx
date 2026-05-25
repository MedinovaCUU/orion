import type { CSSProperties } from 'react';
import PlanningIcon from './PlanningIcon';
import StatusBadge from './StatusBadge';
import { formatPlanningPersonName, SERVICE_TYPE_LABELS, SERVICE_TYPE_TONES } from '../helpers/normalizeService';
import type { PlannedService, ServiceStatus } from '../types/servicePlanning.types';

interface ServiceCardProps {
  service: PlannedService;
  onOpen: (service: PlannedService) => void;
}

const compactName = (value: string) => {
  const display = formatPlanningPersonName(value);
  const parts = display.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts[0]?.endsWith('.')) return display;
  if (parts[1].length === 1 || parts[1].length <= 2) return `${parts[0]} ${parts[1]}`;
  return parts[0];
};

const compactLine = (values: string[], emptyLabel: string, limit = 2) => {
  if (values.length === 0) {
    return emptyLabel;
  }

  const compacted = values.map(compactName);
  const visible = compacted.slice(0, limit).join(' / ');
  const remaining = compacted.length - limit;
  return remaining > 0 ? `${visible} +${remaining}` : visible;
};

const STATUS_PRIORITY: ServiceStatus[] = [
  'critico',
  'bloqueado',
  'requiere_pago',
  'garantia',
  'comodato',
  'confirmado',
  'sin_asignar',
  'pendiente',
  'realizado',
];

export default function ServiceCard({ service, onOpen }: ServiceCardProps) {
  const engineerLine = compactLine(service.responsibleEngineers, '-');
  const companionLine = compactLine(service.companions, '-', 1);
  const statusBadges: Array<ServiceStatus | 'sin_dia_asignado'> = [...service.status];
  const dateLabel = service.scheduledDay || '-';

  if (service.flags.missingScheduledDay) {
    statusBadges.unshift('sin_dia_asignado');
  }

  const visibleStatuses = [
    ...(service.flags.missingScheduledDay ? (['sin_dia_asignado'] as const) : []),
    ...STATUS_PRIORITY.filter((status) => statusBadges.includes(status)),
  ].slice(0, 2);

  return (
    <button
      type="button"
      className={`planning-service-card ${service.flags.isCompleted ? 'planning-service-card--done' : ''}`}
      style={{ '--planning-service-accent': SERVICE_TYPE_TONES[service.serviceType] } as CSSProperties}
      onClick={() => onOpen(service)}
    >
      <div className="planning-service-card__top">
        <strong className="planning-service-card__type">{SERVICE_TYPE_LABELS[service.serviceType].toUpperCase()}</strong>
        <span className="planning-service-card__platform">{service.platform}</span>
      </div>

      <h4 title={service.locality}>{service.locality}</h4>
      <p className="planning-service-card__serial">NS {service.serialNumber || '-'}</p>

      <div className="planning-service-card__badges">
        {visibleStatuses.map((status) =>
          status === 'sin_dia_asignado' ? (
            <StatusBadge key={`${service.id}-${status}`} kind="neutral" value="Sin dia" />
          ) : (
            <StatusBadge key={`${service.id}-${status}`} kind="status" value={status} />
          ),
        )}
      </div>

      <div className="planning-service-card__meta-row">
        <span><PlanningIcon name="user" /> {engineerLine}</span>
        <span><PlanningIcon name="users" /> {companionLine}</span>
        <span><PlanningIcon name="calendar" /> {dateLabel}</span>
      </div>
    </button>
  );
}
