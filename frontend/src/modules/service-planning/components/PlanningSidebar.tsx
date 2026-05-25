import type { ComponentProps } from 'react';
import PlanningIcon from './PlanningIcon';
import type { ServicePlanningSection } from '../types/servicePlanning.types';

interface PlanningSidebarProps {
  active: ServicePlanningSection;
  onChange: (section: ServicePlanningSection) => void;
  alertsCount: number;
  currentUserName: string;
  roleLabel: string;
}

const ITEMS: Array<{ key: ServicePlanningSection; label: string; icon: ComponentProps<typeof PlanningIcon>['name'] }> = [
  { key: 'resumen', label: 'Resumen', icon: 'chart' },
  { key: 'calendario', label: 'Calendario', icon: 'calendar' },
  { key: 'tabla', label: 'Tabla maestra', icon: 'table' },
  { key: 'ingenieros', label: 'Ingenieros', icon: 'users' },
  { key: 'alertas', label: 'Alertas', icon: 'bell' },
  { key: 'reportes', label: 'Reportes', icon: 'chart' },
  { key: 'configuracion', label: 'Configuración', icon: 'settings' },
];

const getInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() || '')
    .join('');

export default function PlanningSidebar({ active, onChange, alertsCount, currentUserName, roleLabel }: PlanningSidebarProps) {
  return (
    <aside className="planning-sidebar">
      <div className="planning-sidebar__brand">
        <strong>ORION</strong>
        <span>Medinova</span>
      </div>

      <nav className="planning-sidebar__nav" aria-label="Navegacion de planeacion de servicios">
        {ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`planning-sidebar__item ${active === item.key ? 'active' : ''}`}
            onClick={() => onChange(item.key)}
          >
            <span className="planning-sidebar__item-icon">
              <PlanningIcon name={item.icon} />
            </span>
            <strong>{item.label}</strong>
            {item.key === 'alertas' && alertsCount > 0 ? <em className="planning-sidebar__count">{alertsCount}</em> : null}
          </button>
        ))}
      </nav>

      <div className="planning-sidebar__footer">
        <div className="planning-sidebar__user-badge">{getInitials(currentUserName || 'OR')}</div>
        <div>
          <strong>{currentUserName}</strong>
          <span>{roleLabel}</span>
        </div>
      </div>
    </aside>
  );
}
