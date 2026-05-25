import PlanningIcon from './PlanningIcon';

interface PlanningHeaderProps {
  monthLabel: string;
  monthOptions: Array<{ value: string; label: string }>;
  selectedMonth: string;
  showFilters: boolean;
  canCreate: boolean;
  onMonthChange: (month: string) => void;
  onToggleFilters: () => void;
  onToggleComposer: () => void;
}

export default function PlanningHeader({
  monthLabel,
  monthOptions,
  selectedMonth,
  showFilters,
  canCreate,
  onMonthChange,
  onToggleFilters,
  onToggleComposer,
}: PlanningHeaderProps) {
  return (
    <header className="planning-header">
      <div className="planning-header__title">
        <h2>{monthLabel.toUpperCase()} <span>• PLANEACIÓN DE SERVICIOS</span></h2>
      </div>

      <div className="planning-header__toolbar">
        <label className="planning-header__month">
          <PlanningIcon name="calendar" />
          <select className="input-field" value={selectedMonth} onChange={(event) => onMonthChange(event.target.value)}>
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className={`button-primary inactive planning-header__ghost ${showFilters ? 'is-active' : ''}`} onClick={onToggleFilters}>
          <PlanningIcon name="filter" />
          Filtros
        </button>

        <button type="button" className="button-primary planning-header__primary" onClick={onToggleComposer} disabled={!canCreate}>
          <PlanningIcon name="plus" />
          Nueva actividad
        </button>
      </div>
    </header>
  );
}
