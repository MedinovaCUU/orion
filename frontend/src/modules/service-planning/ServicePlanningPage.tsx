import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  formatFalconScopeLabel,
  formatLocationLine,
  getFalconSlaTone,
  getFalconTicketSla,
} from '../../components/ticketIntake';
import FalconSlaAlerts, { type FalconSlaAlertEntry } from '../../components/FalconSlaAlerts';
import AlertsPanel from './components/AlertsPanel';
import EmptyState from './components/EmptyState';
import EngineerLoadPanel from './components/EngineerLoadPanel';
import ImportPreviewPanel from './components/ImportPreviewPanel';
import KpiStrip from './components/KpiStrip';
import MasterServiceTable from './components/MasterServiceTable';
import PlanningFilters from './components/PlanningFilters';
import PlanningHeader from './components/PlanningHeader';
import PlanningLegend from './components/PlanningLegend';
import PlanningSidebar from './components/PlanningSidebar';
import ServiceDetailDrawer from './components/ServiceDetailDrawer';
import UpcomingServicesTable from './components/UpcomingServicesTable';
import WeeklyBoard from './components/WeeklyBoard';
import { calculateKpis, buildAlerts } from './helpers/calculateKpis';
import { applyServiceFilters, buildFilterOptions, createDefaultFilters } from './helpers/filters';
import {
  buildMonthOptions,
  formatPlanningPersonName,
  createMockImportPreview,
  formatMonthLabel,
  formatShortDate,
  getCurrentMonthKey,
  getPermissions,
  resolveRole,
} from './helpers/normalizeService';
import { groupServicesByWeek } from './helpers/weekGrouping';
import type {
  PlannedService,
  QuickCreateDraft,
  ServiceDetailUpdate,
  ServicePlanningSection,
} from './types/servicePlanning.types';
import type { EquipmentSummary, HistoricalServiceRecord, PendingServiceTicket } from '../../components/servicesPlanning';
import useSecondTicker from '../../components/useSecondTicker';
import './servicePlanning.css';

interface ServicePlanningPageProps {
  services: PlannedService[];
  loading: boolean;
  userRole: string | null;
  currentUserName: string;
  engineerOptions: string[];
  onCreateService: (draft: QuickCreateDraft) => Promise<void>;
  onUpdateService: (service: PlannedService, updates: ServiceDetailUpdate) => Promise<void>;
  onDeleteService: (service: PlannedService) => Promise<void>;
  onOpenTravel: (service: PlannedService) => void;
  onOpenReport: (service: PlannedService, mode: 'servicio' | 'remoto') => void;
  equipments: EquipmentSummary[];
  reactiveTickets: PendingServiceTicket[];
  historicalRecords: HistoricalServiceRecord[];
  travelAdminPanel: ReactNode;
}

interface TrackedReactiveTicketEntry {
  ticket: PendingServiceTicket;
  equipment?: EquipmentSummary;
  locationLabel: string;
}

const createInitialDraft = (weekLabel: string): QuickCreateDraft => ({
  weekLabel,
  scheduledDate: '',
  scheduledDay: '',
  serviceType: 'preventivo',
  platform: '',
  locality: '',
  serialNumber: '',
  observations: '',
  responsibleEngineers: '',
  companions: '',
  priority: 'media',
  source: 'orion',
});

function PlanningFalconAlertsBridge({
  contextLabel,
  entries,
}: {
  contextLabel: string;
  entries: TrackedReactiveTicketEntry[];
}) {
  const nowMs = useSecondTicker(entries.length > 0);

  const alertEntries = useMemo<FalconSlaAlertEntry[]>(
    () =>
      entries.flatMap((entry) => {
        const sla = getFalconTicketSla(entry.ticket, entry.equipment, nowMs);
        if (!sla) {
          return [];
        }

        return [
          {
            id: entry.ticket.id,
            asunto: entry.ticket.asunto,
            estado: entry.ticket.estado,
            numeroSerie: entry.ticket.numero_serie_equipo,
            locationLabel: entry.locationLabel,
            sla,
          },
        ];
      }),
    [entries, nowMs],
  );

  return <FalconSlaAlerts contextLabel={contextLabel} entries={alertEntries} />;
}

function ReactiveTicketSlaPanel({
  ticket,
  equipment,
  locationLabel,
}: {
  ticket: PendingServiceTicket;
  equipment?: EquipmentSummary;
  locationLabel: string;
}) {
  const tracked = useMemo(() => Boolean(getFalconTicketSla(ticket, equipment)), [equipment, ticket]);
  const nowMs = useSecondTicker(tracked);
  const ticketSla = useMemo(
    () => (tracked ? getFalconTicketSla(ticket, equipment, nowMs) : null),
    [equipment, nowMs, ticket, tracked],
  );

  if (!ticketSla) {
    return null;
  }

  const ticketSlaTone = getFalconSlaTone(ticketSla.severity);

  return (
    <div
      className="planning-report-sla"
      style={{
        borderColor: ticketSlaTone.border,
        background: ticketSlaTone.background,
        color: ticketSlaTone.color,
      }}
    >
      <strong>{ticketSla.statusLabel}</strong>
      <small>{locationLabel || 'Ubicación no identificada'} · {ticketSla.scopeLabel}</small>
    </div>
  );
}

export default function ServicePlanningPage({
  services,
  loading,
  userRole,
  currentUserName,
  engineerOptions,
  onCreateService,
  onUpdateService,
  onDeleteService,
  onOpenTravel,
  onOpenReport,
  equipments,
  reactiveTickets,
  historicalRecords,
  travelAdminPanel,
}: ServicePlanningPageProps) {
  const role = resolveRole(userRole);
  const permissions = getPermissions(role);
  const currentMonthKey = useMemo(() => getCurrentMonthKey(), []);
  const monthOptions = useMemo(() => buildMonthOptions(services), [services]);
  const initialMonth = monthOptions.find((option) => option.value === currentMonthKey)?.value || monthOptions[0]?.value || currentMonthKey;
  const [section, setSection] = useState<ServicePlanningSection>('calendario');
  const [filters, setFilters] = useState(() => createDefaultFilters(initialMonth));
  const [selectedService, setSelectedService] = useState<PlannedService | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [composerDraft, setComposerDraft] = useState<QuickCreateDraft>(() => createInitialDraft(''));
  const deferredSearch = useDeferredValue(filters.search);

  useEffect(() => {
    if (!initialMonth) {
      return;
    }

    setFilters((current) => (current.month ? current : createDefaultFilters(initialMonth)));
  }, [initialMonth]);

  useEffect(() => {
    if (!filters.month && initialMonth) {
      setFilters(createDefaultFilters(initialMonth));
    }
  }, [filters.month, initialMonth]);

  const monthScopedServices = useMemo(
    () => services.filter((service) => service.month === filters.month || !filters.month),
    [filters.month, services],
  );

  const filterOptions = useMemo(() => buildFilterOptions(monthScopedServices), [monthScopedServices]);
  const filteredServices = useMemo(
    () => applyServiceFilters(services, { ...filters, search: deferredSearch }, currentUserName),
    [currentUserName, deferredSearch, filters, services],
  );
  const weekBuckets = useMemo(() => groupServicesByWeek(filteredServices), [filteredServices]);
  const kpis = useMemo(() => calculateKpis(filteredServices), [filteredServices]);
  const alerts = useMemo(() => buildAlerts(filteredServices), [filteredServices]);
  const importPreview = useMemo(() => createMockImportPreview(filteredServices), [filteredServices]);
  const falconTrackedReactiveTickets = useMemo<TrackedReactiveTicketEntry[]>(
    () =>
      reactiveTickets
        .flatMap((ticket) => {
          if ((ticket.estado || '').trim().toLowerCase() === 'cerrado') {
            return [];
          }

          const matchedEquipment = ticket.numero_serie_equipo
            ? equipments.find((equipment) => equipment.numero_serie.trim().toUpperCase() === ticket.numero_serie_equipo?.trim().toUpperCase())
            : undefined;
          const sla = getFalconTicketSla(ticket, matchedEquipment);
          if (!sla) {
            return [];
          }

          return [
            {
              ticket,
              equipment: matchedEquipment,
              locationLabel: formatLocationLine(ticket, matchedEquipment),
            },
          ];
        }),
    [equipments, reactiveTickets],
  );

  useEffect(() => {
    if (!composerDraft.weekLabel && weekBuckets[0]?.label) {
      setComposerDraft((current) => ({ ...current, weekLabel: weekBuckets[0].label }));
    }
  }, [composerDraft.weekLabel, weekBuckets]);

  const monthLabel = filters.month ? formatMonthLabel(filters.month) : 'Sin periodo';

  const handleQuickCreate = async () => {
    await onCreateService(composerDraft);
    setComposerDraft(createInitialDraft(weekBuckets[0]?.label || ''));
    setShowComposer(false);
  };

  const handleAlertSelect = (alertKey: string) => {
    setSection('alertas');
    if (alertKey === 'missing_day') {
      setFilters((current) => ({ ...current, status: 'missing_day' }));
      return;
    }

    if (alertKey === 'missing_engineer') {
      setFilters((current) => ({ ...current, status: 'sin_asignar' }));
      return;
    }

    const statusMap: Record<string, string> = {
      critical: 'critico',
      payment: 'requiere_pago',
      blocked: 'bloqueado',
      completed: 'realizado',
      missing_serial: 'all',
    };

    setFilters((current) => ({
      ...current,
      status: (statusMap[alertKey] || 'all') as typeof current.status,
      search: alertKey === 'missing_serial' ? 'ns pendiente' : current.search,
    }));
  };

  const handleResetFilters = () => {
    if (!filters.month) {
      return;
    }
    setFilters(createDefaultFilters(filters.month));
  };

  const renderSummary = () => (
    <div className="planning-summary-stack">
      <div className="planning-summary-board">
        <WeeklyBoard weeks={weekBuckets} onOpenService={setSelectedService} />
      </div>
      <PlanningLegend />
      <div className="planning-summary-panels">
        <EngineerLoadPanel engineers={kpis.servicesByEngineer} />
        <AlertsPanel alerts={alerts} onSelect={(alert) => handleAlertSelect(alert.key)} />
        <UpcomingServicesTable services={kpis.upcomingServices} onOpenService={setSelectedService} />
      </div>
    </div>
  );

  const renderReports = () => (
    <div className="planning-main">
      <div className="planning-report-grid">
        <section className="planning-report-card">
          <div className="planning-report-card__header">
            <div>
              <span className="planning-eyebrow">Reactivos</span>
              <h3>Tickets pendientes</h3>
            </div>
            <span className="planning-badge planning-badge--neutral">{reactiveTickets.length}</span>
          </div>
          <div className="planning-report-card__list">
            {reactiveTickets.slice(0, 8).map((ticket) => {
              const matchedEquipment = ticket.numero_serie_equipo
                ? equipments.find((equipment) => equipment.numero_serie.trim().toUpperCase() === ticket.numero_serie_equipo?.trim().toUpperCase())
                : undefined;
              const ticketSla = getFalconTicketSla(ticket, matchedEquipment);
              const ticketSlaTone = ticketSla ? getFalconSlaTone(ticketSla.severity) : null;
              const locationLabel = formatLocationLine(ticket, matchedEquipment);

              return (
                <div key={ticket.id} className="planning-report-row">
                  <strong>{ticket.asunto}</strong>
                  <p>{ticket.numero_serie_equipo || 'Sin serie'} · {new Date(ticket.creado_en).toLocaleDateString('es-MX')}</p>
                  <div className="planning-report-card__chips">
                    <span className="planning-badge planning-badge--neutral">{ticket.estado}</span>
                    {ticket.profiles?.nombre_completo ? <span className="planning-badge planning-badge--neutral">{formatPlanningPersonName(ticket.profiles.nombre_completo)}</span> : null}
                    {ticketSla && ticketSlaTone ? (
                      <span
                        className="planning-badge"
                        style={{
                          background: ticketSlaTone.background,
                          borderColor: ticketSlaTone.border,
                          color: ticketSlaTone.color,
                        }}
                      >
                        {formatFalconScopeLabel(ticketSla)}
                      </span>
                    ) : null}
                  </div>
                  {ticketSla && ticketSlaTone ? <ReactiveTicketSlaPanel ticket={ticket} equipment={matchedEquipment} locationLabel={locationLabel} /> : null}
                </div>
              );
            })}
            {reactiveTickets.length === 0 ? <EmptyState title="Sin reactivos pendientes" description="No hay tickets abiertos fuera de la planeacion actual." /> : null}
          </div>
        </section>

        <section className="planning-report-card">
          <div className="planning-report-card__header">
            <div>
              <span className="planning-eyebrow">Historico</span>
              <h3>Servicios realizados</h3>
            </div>
            <span className="planning-badge planning-badge--neutral">{historicalRecords.length}</span>
          </div>
          <div className="planning-report-card__list">
            {historicalRecords.slice(0, 8).map((record) => (
              <div key={record.id} className="planning-report-row">
                <strong>{record.motivo || 'Servicio historico'}</strong>
                <p>{record.no_serie || 'Sin serie'} · {record.fecha_servicio || formatShortDate(record.creado_en.slice(0, 10))}</p>
                <small>{record.profiles?.nombre_completo ? formatPlanningPersonName(record.profiles.nombre_completo) : 'Sistema historico'}</small>
              </div>
            ))}
            {historicalRecords.length === 0 ? <EmptyState title="Sin historico" description="Todavia no hay servicios cerrados para este entorno." /> : null}
          </div>
        </section>
      </div>

      {travelAdminPanel}
    </div>
  );

  const renderSection = () => {
    if (loading) {
      return <EmptyState title="Cargando planeacion" description="Estamos recuperando tickets, modales relacionados y la capa de viajes." />;
    }

    if (filteredServices.length === 0 && section !== 'reportes' && section !== 'configuracion') {
      return <EmptyState title="Sin servicios para esta combinacion" description="Prueba otro mes, semana o limpia filtros para ampliar la ventana." />;
    }

    switch (section) {
      case 'resumen':
      case 'calendario':
        return renderSummary();
      case 'tabla':
        return <MasterServiceTable services={filteredServices} permissions={permissions} onOpenService={setSelectedService} />;
      case 'ingenieros':
        return <EngineerLoadPanel engineers={kpis.servicesByEngineer} />;
      case 'alertas':
        return (
          <div className="planning-content-grid">
            <AlertsPanel alerts={alerts} onSelect={(alert) => handleAlertSelect(alert.key)} />
            <UpcomingServicesTable services={kpis.upcomingServices} onOpenService={setSelectedService} />
          </div>
        );
      case 'reportes':
        return renderReports();
      case 'configuracion':
        return (
          <div className="planning-main">
            <ImportPreviewPanel
              preview={importPreview}
              permissions={permissions}
              visible
              onClose={() => setShowImportPreview(false)}
              onImport={() => setShowImportPreview(false)}
            />
            <EmptyState
              title="Capa de importacion y reglas"
              description="La estructura ya esta lista para parser XLSX, lotes de importacion, validaciones y trazabilidad futura con Supabase."
            />
          </div>
        );
      default:
        return renderSummary();
    }
  };

  return (
    <div className="planning-shell">
      <PlanningFalconAlertsBridge contextLabel="Planeación" entries={falconTrackedReactiveTickets} />
      <PlanningSidebar
        active={section}
        onChange={setSection}
        alertsCount={alerts.reduce((total, alert) => total + alert.count, 0)}
        currentUserName={currentUserName}
        roleLabel={role}
      />

      <div className="planning-main">
        <PlanningHeader
          monthLabel={monthLabel}
          monthOptions={monthOptions}
          selectedMonth={filters.month}
          showFilters={showFilters}
          canCreate={permissions.canCreate}
          onMonthChange={(month) => setFilters((current) => ({ ...current, month }))}
          onToggleFilters={() => setShowFilters((current) => !current)}
          onToggleComposer={() => setShowComposer((current) => !current)}
        />

        <KpiStrip kpis={kpis} />

        {showFilters ? (
          <PlanningFilters
            filters={filters}
            monthOptions={monthOptions}
            weeks={groupServicesByWeek(monthScopedServices)}
            platforms={filterOptions.platforms}
            engineers={Array.from(new Set([...engineerOptions, ...filterOptions.engineers])).sort((left, right) => left.localeCompare(right, 'es'))}
            companions={filterOptions.companions}
            localities={filterOptions.localities}
            onChange={(next) => setFilters((current) => ({ ...current, ...next }))}
            onReset={handleResetFilters}
          />
        ) : null}

        {showComposer ? (
          <section className="planning-composer">
            <div className="planning-panel__header">
              <div>
                <span className="planning-eyebrow">Alta rapida</span>
                <h3>Nueva actividad operativa</h3>
              </div>
            </div>
            <div className="planning-composer__grid">
              <label>
                <span>Semana</span>
                <select className="input-field" value={composerDraft.weekLabel} onChange={(event) => setComposerDraft((current) => ({ ...current, weekLabel: event.target.value }))}>
                  {weekBuckets.map((bucket) => (
                    <option key={bucket.key} value={bucket.label}>
                      {bucket.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Fecha</span>
                <input className="input-field" type="date" value={composerDraft.scheduledDate} onChange={(event) => setComposerDraft((current) => ({ ...current, scheduledDate: event.target.value }))} />
              </label>
              <label>
                <span>Dia</span>
                <input className="input-field" value={composerDraft.scheduledDay} onChange={(event) => setComposerDraft((current) => ({ ...current, scheduledDay: event.target.value }))} />
              </label>
              <label>
                <span>Tipo</span>
                <select className="input-field" value={composerDraft.serviceType} onChange={(event) => setComposerDraft((current) => ({ ...current, serviceType: event.target.value as QuickCreateDraft['serviceType'] }))}>
                  <option value="preventivo">Preventivo</option>
                  <option value="correctivo">Correctivo</option>
                  <option value="capacitacion">Capacitacion</option>
                  <option value="recapacitacion">Recapacitacion</option>
                  <option value="instalacion">Instalacion</option>
                  <option value="ingenieria_soporte">Ingenieria / Soporte</option>
                </select>
              </label>
              <label>
                <span>Plataforma</span>
                <input className="input-field" value={composerDraft.platform} onChange={(event) => setComposerDraft((current) => ({ ...current, platform: event.target.value }))} />
              </label>
              <label className="planning-drawer__span-2">
                <span>Localidad / cliente</span>
                <input className="input-field" value={composerDraft.locality} onChange={(event) => setComposerDraft((current) => ({ ...current, locality: event.target.value }))} />
              </label>
              <label>
                <span>Numero de serie</span>
                <input className="input-field" value={composerDraft.serialNumber} onChange={(event) => setComposerDraft((current) => ({ ...current, serialNumber: event.target.value }))} />
              </label>
              <label>
                <span>Ingeniero(s)</span>
                <input className="input-field" value={composerDraft.responsibleEngineers} onChange={(event) => setComposerDraft((current) => ({ ...current, responsibleEngineers: event.target.value }))} />
              </label>
              <label>
                <span>Acompanante(s)</span>
                <input className="input-field" value={composerDraft.companions} onChange={(event) => setComposerDraft((current) => ({ ...current, companions: event.target.value }))} />
              </label>
              <label>
                <span>Prioridad</span>
                <select className="input-field" value={composerDraft.priority} onChange={(event) => setComposerDraft((current) => ({ ...current, priority: event.target.value as QuickCreateDraft['priority'] }))}>
                  <option value="baja">Baja</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                  <option value="critica">Critica</option>
                </select>
              </label>
              <label className="planning-drawer__span-2">
                <span>Observaciones</span>
                <textarea className="input-field planning-drawer__textarea" value={composerDraft.observations} onChange={(event) => setComposerDraft((current) => ({ ...current, observations: event.target.value }))} />
              </label>
            </div>
            <div className="planning-composer__footer">
              <button type="button" className="button-primary inactive" onClick={() => setShowComposer(false)}>
                Cancelar
              </button>
              <button type="button" className="button-primary" onClick={() => void handleQuickCreate()}>
                Registrar actividad
              </button>
            </div>
          </section>
        ) : null}

        {showImportPreview && section !== 'configuracion' ? (
          <ImportPreviewPanel
            preview={importPreview}
            permissions={permissions}
            visible
            onClose={() => setShowImportPreview(false)}
            onImport={() => setShowImportPreview(false)}
          />
        ) : null}

        {renderSection()}
      </div>

      <ServiceDetailDrawer
        service={selectedService}
        permissions={permissions}
        visible={Boolean(selectedService)}
        onClose={() => setSelectedService(null)}
        onSave={onUpdateService}
        onDelete={onDeleteService}
        onOpenTravel={onOpenTravel}
        onOpenReport={onOpenReport}
      />
    </div>
  );
}
