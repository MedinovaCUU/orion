import type { ComponentProps } from 'react';
import PlanningIcon from './PlanningIcon';
import type { AlertSummary } from '../types/servicePlanning.types';

interface AlertsPanelProps {
  alerts: AlertSummary[];
  onSelect: (alert: AlertSummary) => void;
}

const iconByKey: Record<AlertSummary['key'], ComponentProps<typeof PlanningIcon>['name']> = {
  critical: 'alert',
  payment: 'coin',
  blocked: 'briefcase',
  missing_day: 'calendar',
  missing_engineer: 'users',
  completed: 'check',
  missing_serial: 'alert',
};

export default function AlertsPanel({ alerts, onSelect }: AlertsPanelProps) {
  return (
    <section className="planning-panel planning-panel--list">
      <div className="planning-panel__header">
        <div>
          <h3>Alertas y pendientes</h3>
        </div>
      </div>

      <div className="planning-alert-list">
        {alerts.map((alert) => (
          <button key={alert.key} type="button" className={`planning-alert-row planning-alert-row--${alert.tone}`} onClick={() => onSelect(alert)}>
            <span className="planning-alert-row__icon">
              <PlanningIcon name={iconByKey[alert.key]} />
            </span>
            <span className="planning-alert-row__text">
              <strong>{alert.count} {alert.title.toLowerCase()}</strong>
            </span>
            <span className="planning-alert-row__action">Ver detalle</span>
          </button>
        ))}
      </div>
    </section>
  );
}
