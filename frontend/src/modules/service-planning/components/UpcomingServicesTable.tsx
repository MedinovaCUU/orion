import { formatPlanningPeopleList, formatShortDate } from '../helpers/normalizeService';
import type { PlannedService } from '../types/servicePlanning.types';

interface UpcomingServicesTableProps {
  services: PlannedService[];
  onOpenService: (service: PlannedService) => void;
}

export default function UpcomingServicesTable({ services, onOpenService }: UpcomingServicesTableProps) {
  return (
    <section className="planning-panel planning-panel--table">
      <div className="planning-panel__header">
        <div>
          <h3>Próximos servicios ({services.length})</h3>
        </div>
      </div>

      <div className="planning-table-scroll">
        <table className="planning-table planning-table--compact">
          <thead>
            <tr>
              <th>Servicio</th>
              <th>Plataforma</th>
              <th>Ingeniero(s)</th>
              <th>Día</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr key={service.id} onClick={() => onOpenService(service)}>
                <td>{service.locality}</td>
                <td>{service.platform}</td>
                <td>{service.responsibleEngineers.length > 0 ? formatPlanningPeopleList(service.responsibleEngineers) : '-'}</td>
                <td>{service.scheduledDay || (service.scheduledDate ? formatShortDate(service.scheduledDate) : '-')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
