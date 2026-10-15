import type { ActiveFilterChip } from '../helpers/filters';

interface ActiveFiltersBarProps {
  chips: ActiveFilterChip[];
  onRemove: (key: ActiveFilterChip['key']) => void;
  onClear: () => void;
}

// Filters stay on while the panel is closed and across sections, so they are always shown here.
export default function ActiveFiltersBar({ chips, onRemove, onClear }: ActiveFiltersBarProps) {
  if (!chips.length) {
    return null;
  }

  return (
    <div className="planning-active-filters" role="status" aria-label="Filtros activos">
      <span className="planning-eyebrow">Filtrando</span>
      <div className="planning-active-filters__chips">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            className="planning-active-filters__chip"
            onClick={() => onRemove(chip.key)}
            aria-label={`Quitar filtro ${chip.label}`}
          >
            {chip.label}
            <span aria-hidden="true">×</span>
          </button>
        ))}
      </div>
      <button type="button" className="planning-active-filters__clear" onClick={onClear}>
        Limpiar filtros
      </button>
    </div>
  );
}
