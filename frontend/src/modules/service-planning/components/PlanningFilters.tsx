import type { ServicePlanningFilters, ServiceSource, ServiceStatus, ServiceType, WeekBucket } from '../types/servicePlanning.types';
import { formatPlanningPersonName, SERVICE_TYPE_LABELS, STATUS_LABELS } from '../helpers/normalizeService';

interface PlanningFiltersProps {
  filters: ServicePlanningFilters;
  monthOptions: Array<{ value: string; label: string }>;
  weeks: WeekBucket[];
  platforms: string[];
  engineers: string[];
  companions: string[];
  localities: string[];
  onChange: (next: Partial<ServicePlanningFilters>) => void;
  onReset: () => void;
}

const sourceLabels: Record<ServiceSource, string> = {
  manual: 'Manual',
  excel_import: 'Excel',
  ticket: 'Ticket',
  orion: 'Orion',
};

export default function PlanningFilters({
  filters,
  monthOptions,
  weeks,
  platforms,
  engineers,
  companions,
  localities,
  onChange,
  onReset,
}: PlanningFiltersProps) {
  return (
    <section className="planning-filters">
      <div className="planning-filters__grid">
        <label>
          <span>Mes</span>
          <select className="input-field" value={filters.month} onChange={(event) => onChange({ month: event.target.value })}>
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Semana</span>
          <select className="input-field" value={filters.weekLabel} onChange={(event) => onChange({ weekLabel: event.target.value })}>
            <option value="all">Todas</option>
            {weeks.map((week) => (
              <option key={week.key} value={week.label}>
                {week.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Tipo</span>
          <select className="input-field" value={filters.serviceType} onChange={(event) => onChange({ serviceType: event.target.value as 'all' | ServiceType })}>
            <option value="all">Todos</option>
            {Object.entries(SERVICE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Estado</span>
          <select className="input-field" value={filters.status} onChange={(event) => onChange({ status: event.target.value as 'all' | ServiceStatus | 'missing_day' })}>
            <option value="all">Todos</option>
            <option value="missing_day">Sin dia asignado</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Ingeniero</span>
          <select className="input-field" value={filters.engineer} onChange={(event) => onChange({ engineer: event.target.value })}>
            <option value="all">Todos</option>
            {engineers.map((engineer) => (
              <option key={engineer} value={engineer}>
                {formatPlanningPersonName(engineer)}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Acompanante</span>
          <select className="input-field" value={filters.companion} onChange={(event) => onChange({ companion: event.target.value })}>
            <option value="all">Todos</option>
            {companions.map((companion) => (
              <option key={companion} value={companion}>
                {formatPlanningPersonName(companion)}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Plataforma</span>
          <select className="input-field" value={filters.platform} onChange={(event) => onChange({ platform: event.target.value })}>
            <option value="all">Todas</option>
            {platforms.map((platform) => (
              <option key={platform} value={platform}>
                {platform}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Localidad</span>
          <select className="input-field" value={filters.locality} onChange={(event) => onChange({ locality: event.target.value })}>
            <option value="all">Todas</option>
            {localities.map((locality) => (
              <option key={locality} value={locality}>
                {locality}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Prioridad</span>
          <select className="input-field" value={filters.priority} onChange={(event) => onChange({ priority: event.target.value as ServicePlanningFilters['priority'] })}>
            <option value="all">Todas</option>
            <option value="critica">Critica</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
        </label>

        <label>
          <span>Fuente</span>
          <select className="input-field" value={filters.source} onChange={(event) => onChange({ source: event.target.value as 'all' | ServiceSource })}>
            <option value="all">Todas</option>
            {Object.entries(sourceLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="planning-filters__search">
          <span>Buscar</span>
          <input
            className="input-field"
            value={filters.search}
            onChange={(event) => onChange({ search: event.target.value })}
            placeholder="Localidad, serie, plataforma, ingeniero o ticket"
          />
        </label>
      </div>

      <div className="planning-filters__actions">
        <label className="planning-checkbox">
          <input type="checkbox" checked={filters.onlyMine} onChange={(event) => onChange({ onlyMine: event.target.checked })} />
          <span>Solo mis servicios</span>
        </label>
        <button type="button" className="button-primary inactive" onClick={onReset}>
          Limpiar filtros
        </button>
      </div>
    </section>
  );
}
