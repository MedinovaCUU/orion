import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import StatusBadge from './StatusBadge';
import { formatDateTime, formatPlanningPeopleList, formatShortDate, splitPeople } from '../helpers/normalizeService';
import type {
  PlannedService,
  ServiceDetailUpdate,
  ServicePlanningPermissions,
  ServicePriority,
  ServiceSource,
  ServiceType,
} from '../types/servicePlanning.types';

interface ServiceDetailDrawerProps {
  service: PlannedService | null;
  permissions: ServicePlanningPermissions;
  visible: boolean;
  onClose: () => void;
  onSave: (service: PlannedService, payload: ServiceDetailUpdate) => Promise<void>;
  onDelete: (service: PlannedService) => Promise<void>;
  onOpenTravel: (service: PlannedService) => void;
  onOpenReport: (service: PlannedService, mode: 'servicio' | 'remoto') => void;
}

interface DrawerDraft {
  scheduledDate: string;
  scheduledDay: string;
  serviceType: ServiceType;
  platform: string;
  locality: string;
  serialNumber: string;
  observations: string;
  responsibleEngineers: string;
  companions: string;
  priority: ServicePriority;
  source: ServiceSource;
}

const createDraft = (service: PlannedService): DrawerDraft => ({
  scheduledDate: service.scheduledDate || '',
  scheduledDay: service.scheduledDay || '',
  serviceType: service.serviceType,
  platform: service.platform,
  locality: service.locality,
  serialNumber: service.serialNumber || '',
  observations: service.observations || '',
  responsibleEngineers: service.responsibleEngineers.join(' / '),
  companions: service.companions.join(' / '),
  priority: service.priority,
  source: service.source,
});

export default function ServiceDetailDrawer({
  service,
  permissions,
  visible,
  onClose,
  onSave,
  onDelete,
  onOpenTravel,
  onOpenReport,
}: ServiceDetailDrawerProps) {
  const [draft, setDraft] = useState<DrawerDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (service) {
      setDraft(createDraft(service));
    }
  }, [service]);

  useEffect(() => {
    if (!visible || !service) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
      bodyRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    });

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [service, visible]);

  if (!visible || !service || !draft) {
    return null;
  }

  const canEditEverything = permissions.canEditAll;
  const canEditNotes = permissions.canEditStatus || permissions.canEditAll;
  const scheduledLabel = service.scheduledDate ? formatShortDate(service.scheduledDate) : 'Sin fecha';
  const scheduledSubLabel = service.scheduledDay || 'Sin dia asignado';
  const engineerSummary = service.responsibleEngineers.length > 0 ? formatPlanningPeopleList(service.responsibleEngineers) : 'Sin asignar';
  const companionSummary = service.companions.length > 0 ? formatPlanningPeopleList(service.companions) : 'Sin acompanante';

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(service, {
        scheduledDate: draft.scheduledDate,
        scheduledDay: draft.scheduledDay,
        serviceType: draft.serviceType,
        platform: draft.platform,
        locality: draft.locality,
        serialNumber: draft.serialNumber,
        observations: draft.observations,
        responsibleEngineers: splitPeople(draft.responsibleEngineers),
        companions: splitPeople(draft.companions),
        priority: draft.priority,
        source: draft.source,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="planning-drawer-overlay" onClick={onClose}>
      <aside className="planning-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="planning-drawer__header">
          <div className="planning-drawer__headline">
            <span className="planning-eyebrow">Detalle del servicio</span>
            <h3>{service.locality}</h3>
            <p className="planning-drawer__lede">
              {service.platform} · {service.serialNumber || 'NS pendiente'} · {service.weekLabel}
            </p>
            <div className="planning-drawer__badges">
              <StatusBadge kind="type" value={service.serviceType} />
              <StatusBadge kind="priority" value={service.priority} />
              {service.status.map((status) => (
                <StatusBadge key={`${service.id}-${status}`} kind="status" value={status} />
              ))}
            </div>
            <div className="planning-drawer__facts">
              <div className="planning-drawer__fact">
                <span>Fecha</span>
                <strong>{scheduledLabel}</strong>
                <small>{scheduledSubLabel}</small>
              </div>
              <div className="planning-drawer__fact">
                <span>Responsables</span>
                <strong>{engineerSummary}</strong>
                <small>{companionSummary}</small>
              </div>
              <div className="planning-drawer__fact">
                <span>Fuente / ticket</span>
                <strong>{service.source}</strong>
                <small>{service.links.ticketId || 'Sin ticket'}</small>
              </div>
            </div>
          </div>
          <button type="button" className="planning-drawer__close" onClick={onClose}>
            ×
          </button>
        </div>

        <div ref={bodyRef} className="planning-drawer__body">
          <section className="planning-drawer__section">
            <div className="planning-drawer__subheader">
              <h4>Planeacion base</h4>
              <p>Fecha, tipo, prioridad y referencia tecnica del servicio.</p>
            </div>
            <div className="planning-drawer__grid">
              <label>
                <span>Fecha programada</span>
                <input
                  className="input-field"
                  type="date"
                  value={draft.scheduledDate}
                  disabled={!canEditEverything}
                  onChange={(event) => setDraft((current) => (current ? { ...current, scheduledDate: event.target.value } : current))}
                />
              </label>
              <label>
                <span>Dia</span>
                <input
                  className="input-field"
                  value={draft.scheduledDay}
                  disabled={!canEditEverything}
                  onChange={(event) => setDraft((current) => (current ? { ...current, scheduledDay: event.target.value } : current))}
                />
              </label>
              <label>
                <span>Tipo</span>
                <select
                  className="input-field"
                  value={draft.serviceType}
                  disabled={!canEditEverything}
                  onChange={(event) => setDraft((current) => (current ? { ...current, serviceType: event.target.value as ServiceType } : current))}
                >
                  <option value="preventivo">Preventivo</option>
                  <option value="correctivo">Correctivo</option>
                  <option value="capacitacion">Capacitacion</option>
                  <option value="recapacitacion">Recapacitacion</option>
                  <option value="instalacion">Instalacion</option>
                  <option value="ingenieria_soporte">Ingenieria / Soporte</option>
                </select>
              </label>
              <label>
                <span>Prioridad</span>
                <select
                  className="input-field"
                  value={draft.priority}
                  disabled={!canEditEverything}
                  onChange={(event) => setDraft((current) => (current ? { ...current, priority: event.target.value as ServicePriority } : current))}
                >
                  <option value="baja">Baja</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                  <option value="critica">Critica</option>
                </select>
              </label>
              <label>
                <span>Plataforma</span>
                <input
                  className="input-field"
                  value={draft.platform}
                  disabled={!canEditEverything}
                  onChange={(event) => setDraft((current) => (current ? { ...current, platform: event.target.value } : current))}
                />
              </label>
              <label>
                <span>Numero de serie</span>
                <input
                  className="input-field"
                  value={draft.serialNumber}
                  disabled={!canEditEverything}
                  onChange={(event) => setDraft((current) => (current ? { ...current, serialNumber: event.target.value } : current))}
                />
              </label>
              <label className="planning-drawer__span-2">
                <span>Localidad / cliente</span>
                <input
                  className="input-field"
                  value={draft.locality}
                  disabled={!canEditEverything}
                  onChange={(event) => setDraft((current) => (current ? { ...current, locality: event.target.value } : current))}
                />
              </label>
              <label>
                <span>Fuente</span>
                <select
                  className="input-field"
                  value={draft.source}
                  disabled={!canEditEverything}
                  onChange={(event) => setDraft((current) => (current ? { ...current, source: event.target.value as ServiceSource } : current))}
                >
                  <option value="manual">Manual</option>
                  <option value="excel_import">Excel</option>
                  <option value="ticket">Ticket</option>
                  <option value="orion">Orion</option>
                </select>
              </label>
            </div>
          </section>

          <section className="planning-drawer__section">
            <div className="planning-drawer__subheader">
              <h4>Asignacion y contexto</h4>
              <p>Responsables, acompanantes y observaciones operativas.</p>
            </div>
            <div className="planning-drawer__grid">
              <label>
                <span>Ingeniero(s)</span>
                <input
                  className="input-field"
                  value={draft.responsibleEngineers}
                  disabled={!canEditEverything}
                  onChange={(event) => setDraft((current) => (current ? { ...current, responsibleEngineers: event.target.value } : current))}
                />
              </label>
              <label>
                <span>Acompanante(s)</span>
                <input
                  className="input-field"
                  value={draft.companions}
                  disabled={!canEditEverything}
                  onChange={(event) => setDraft((current) => (current ? { ...current, companions: event.target.value } : current))}
                />
              </label>
              <label className="planning-drawer__span-2">
                <span>Observaciones</span>
                <textarea
                  className="input-field planning-drawer__textarea"
                  value={draft.observations}
                  disabled={!canEditNotes}
                  onChange={(event) => setDraft((current) => (current ? { ...current, observations: event.target.value } : current))}
                />
              </label>
            </div>
          </section>

          <section className="planning-drawer__section">
            <div className="planning-drawer__subheader">
              <h4>Vinculos operativos</h4>
              <p>Viajes, viaticos y reportes siguen el flujo actual sin salir del tablero.</p>
            </div>
            <div className="planning-drawer__actions-grid">
              <button type="button" className="button-primary inactive" onClick={() => onOpenTravel(service)}>
                {service.links.linkedTravelRequestId ? 'Abrir viaje ligado' : 'Planear vuelo / viaticos'}
              </button>
              <button type="button" className="button-primary inactive" onClick={() => onOpenReport(service, 'servicio')}>
                {service.links.linkedServiceReportId ? 'Abrir reporte ligado' : 'Crear reporte servicio'}
              </button>
              <button type="button" className="button-primary inactive" onClick={() => onOpenReport(service, 'remoto')}>
                Crear reporte remoto
              </button>
            </div>
          </section>

          <section className="planning-drawer__section">
            <div className="planning-drawer__subheader">
              <h4>Trazabilidad</h4>
              <p>Origen, importacion y ultima edicion visible.</p>
            </div>
            <div className="planning-trace-grid">
              <div><span>Ticket</span><strong>{service.links.ticketId || 'Sin ticket'}</strong></div>
              <div><span>Fuente</span><strong>{service.source}</strong></div>
              <div><span>Archivo origen</span><strong>{service.trace.sourceFileName || 'Captura ORION'}</strong></div>
              <div><span>Lote importacion</span><strong>{service.trace.importBatchId || 'N/A'}</strong></div>
              <div><span>Creado</span><strong>{formatDateTime(service.trace.createdAt)}</strong></div>
              <div><span>Actualizado</span><strong>{formatDateTime(service.trace.updatedAt)}</strong></div>
            </div>
          </section>
        </div>

        <div className="planning-drawer__footer">
          <div className="planning-drawer__footer-left">
            {permissions.canDelete ? (
              <button type="button" className="button-primary inactive" onClick={() => void onDelete(service)}>
                Eliminar
              </button>
            ) : null}
          </div>
          <div className="planning-drawer__footer-right">
            <button type="button" className="button-primary inactive" onClick={onClose}>
              Cerrar
            </button>
            <button type="button" className="button-primary" onClick={() => void handleSave()} disabled={saving || (!canEditEverything && !canEditNotes)}>
              Guardar cambios
            </button>
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
