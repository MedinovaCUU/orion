import StatusBadge from './StatusBadge';
import { formatDateTime, formatPlanningPeopleList, formatShortDate } from '../helpers/normalizeService';
import type { PlannedService, ServicePlanningPermissions } from '../types/servicePlanning.types';

interface MasterServiceTableProps {
  services: PlannedService[];
  permissions: ServicePlanningPermissions;
  onOpenService: (service: PlannedService) => void;
}

export default function MasterServiceTable({ services, permissions, onOpenService }: MasterServiceTableProps) {
  return (
    <section className="planning-panel">
      <div className="planning-panel__header">
        <div>
          <span className="planning-eyebrow">Tabla maestra</span>
          <h3>Vista secundaria de control</h3>
        </div>
      </div>

      <div className="planning-table-scroll">
        <table className="planning-table planning-table--master">
          <thead>
            <tr>
              <th>Semana</th>
              <th>Dia</th>
              <th>Tipo</th>
              <th>Plataforma</th>
              <th>Localidad</th>
              <th>NS</th>
              <th>Estado</th>
              <th>Observaciones</th>
              <th>Ingeniero(s)</th>
              <th>Acompanante(s)</th>
              <th>Prioridad</th>
              <th>Fuente</th>
              <th>Ticket</th>
              <th>Ultima actualizacion</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr key={service.id}>
                <td>{service.weekLabel}</td>
                <td>{service.scheduledDate ? formatShortDate(service.scheduledDate) : service.scheduledDay || 'Sin dia'}</td>
                <td><StatusBadge kind="type" value={service.serviceType} /></td>
                <td>{service.platform}</td>
                <td>{service.locality}</td>
                <td>{service.serialNumber || 'NS pendiente'}</td>
                <td>
                  <div className="planning-table__badge-row">
                    {service.status.map((status) => (
                      <StatusBadge key={`${service.id}-${status}`} kind="status" value={status} />
                    ))}
                    {service.flags.missingScheduledDay ? <StatusBadge kind="neutral" value="Sin dia asignado" /> : null}
                  </div>
                </td>
                <td>{service.observations || 'Sin observacion'}</td>
                <td>{service.responsibleEngineers.length > 0 ? formatPlanningPeopleList(service.responsibleEngineers) : 'Sin asignar'}</td>
                <td>{service.companions.length > 0 ? formatPlanningPeopleList(service.companions) : 'Sin acompanante'}</td>
                <td><StatusBadge kind="priority" value={service.priority} /></td>
                <td>{service.source}</td>
                <td>{service.links.ticketId || 'Sin ticket'}</td>
                <td>{formatDateTime(service.trace.updatedAt)}</td>
                <td>
                  <button type="button" className="button-primary inactive planning-table__action" onClick={() => onOpenService(service)}>
                    Abrir
                  </button>
                  {permissions.canEditAll ? <span className="planning-table__hint">Edicion</span> : <span className="planning-table__hint">Lectura</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
