import type { ServicePlanningSection } from '../types/servicePlanning.types';

interface ViewToggleProps {
  value: ServicePlanningSection;
  onChange: (value: ServicePlanningSection) => void;
}

const TOGGLE_ITEMS: Array<{ value: ServicePlanningSection; label: string }> = [
  { value: 'calendario', label: 'Calendario' },
  { value: 'tabla', label: 'Tabla' },
  { value: 'ingenieros', label: 'Ingenieros' },
  { value: 'alertas', label: 'Alertas' },
];

export default function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="planning-view-toggle" role="tablist" aria-label="Cambiar vista de planeacion">
      {TOGGLE_ITEMS.map((item) => (
        <button
          key={item.value}
          type="button"
          className={`planning-view-toggle__button ${value === item.value ? 'active' : ''}`}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
