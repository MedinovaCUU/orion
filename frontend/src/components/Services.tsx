import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import ServicePlanningPage from '../modules/service-planning/ServicePlanningPage';
import {
  buildPlannedServiceUpdate,
  buildQuickCreatePayload,
  mapPendingTicketToPlannedService,
} from '../modules/service-planning/helpers/normalizeService';
import {
  canAccessPlanningSync,
  syncServicePlanningFromSheet,
} from '../modules/service-planning/helpers/servicePlanningSync';
import type {
  PlannedService,
  QuickCreateDraft,
  ServiceDetailUpdate,
} from '../modules/service-planning/types/servicePlanning.types';
import ServiceReportModal from './ServiceReportModal';
import { splitServiceCatalog, type AveriaCatalogRow, type ServiceCatalogRow, type SolucionCatalogRow } from './serviceCatalog';
import TravelAdminPanel from './TravelAdminPanel';
import TravelPlannerModal from './TravelPlannerModal';
import {
  type EquipmentSummary,
  extractPlaneacionMeta,
  type HistoricalServiceRecord,
  type PendingServiceTicket,
  type ProfileSummary,
} from './servicesPlanning';
import type { ClientServiceUnitSummary, ServiceReportMode } from './serviceReports';
import type { TravelFormData } from './travelPlanner';

export default function Services({ subPermissions = ['planeacion', 'viajes', 'reportes'] }: { subPermissions?: string[] }) {
  const canViewPlanning = subPermissions.includes('planeacion');
  const canManageTravel = subPermissions.includes('viajes');
  const canManageReports = subPermissions.includes('reportes');
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [pendingTickets, setPendingTickets] = useState<PendingServiceTicket[]>([]);
  const [historicalRecords, setHistoricalRecords] = useState<HistoricalServiceRecord[]>([]);
  const [averiaCatalog, setAveriaCatalog] = useState<AveriaCatalogRow[]>([]);
  const [solucionCatalog, setSolucionCatalog] = useState<SolucionCatalogRow[]>([]);
  const [equipmentCatalog, setEquipmentCatalog] = useState<EquipmentSummary[]>([]);
  const [engineerProfiles, setEngineerProfiles] = useState<ProfileSummary[]>([]);
  const [clientServiceUnits, setClientServiceUnits] = useState<ClientServiceUnitSummary[]>([]);
  const [travelPlannerOpen, setTravelPlannerOpen] = useState(false);
  const [travelPlannerRequestId, setTravelPlannerRequestId] = useState<string | null>(null);
  const [travelPlannerTicketId, setTravelPlannerTicketId] = useState<string | null>(null);
  const [travelPlannerSeed, setTravelPlannerSeed] = useState<Partial<TravelFormData> | null>(null);
  const [serviceReportOpen, setServiceReportOpen] = useState(false);
  const [serviceReportMode, setServiceReportMode] = useState<ServiceReportMode>('servicio');
  const [serviceReportId, setServiceReportId] = useState<string | null>(null);
  const [serviceReportTicketId, setServiceReportTicketId] = useState<string | null>(null);
  const [travelRefreshKey, setTravelRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fetchSequence = useRef(0);

  const fetchContext = async () => {
    // Keep mounted views and unsaved drafts during background refreshes. A failed request keeps the last
    // good data and is reported, so a network or session hiccup never looks like an empty planning.
    const sequence = ++fetchSequence.current;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const [profileResponse, pendingResponse, historyResponse, catalogResponse, equipmentResponse, engineersResponse, unitsResponse] =
        await Promise.all([
          user?.id ? supabase.from('profiles').select('id, nombre_completo, rol').eq('id', user.id).single() : Promise.resolve({ data: null, error: null }),
          supabase
            .from('tickets')
            .select('id, user_id, asunto, descripcion, estado, creado_en, numero_serie_equipo, profiles:user_id(nombre_completo)')
            .neq('estado', 'cerrado')
            .order('creado_en', { ascending: false }),
          supabase
            .from('servicios_historial')
            .select('id, ticket_id, id_legacy, no_serie, cda, cds, motivo, fecha_servicio, creado_en, profiles:tecnico_id(nombre_completo)')
            .order('fecha_servicio', { ascending: false })
            .order('creado_en', { ascending: false })
            .limit(60),
          supabase.from('catalogo_servicio').select('catalog_kind, catalog_code, catalog_type, catalog_detail, category_code'),
          supabase.from('equipos').select('id, numero_serie, modelo, software, firmware, pais, estado, ciudad, municipio, colonia, direccion, codigo_postal, clientes(id, razon_social, persona_contacto, telefono)'),
          supabase.from('profiles').select('id, nombre_completo, employee_number, employee_type, telefono, territorio, rol, recibe_tickets').order('nombre_completo'),
          supabase.from('client_service_units').select('id, client_id, equipment_id, numero_serie, cliente, persona_contacto, unidad_negocio, analizador'),
        ]);

      // A slower, older refresh must not overwrite a newer one.
      if (sequence !== fetchSequence.current) {
        return;
      }

      setCurrentUserId(user?.id || null);

      if (profileResponse.data) {
        setCurrentUserName(profileResponse.data.nombre_completo || user?.email || 'Operacion ORION');
        setCurrentUserRole(profileResponse.data.rol || null);
      } else if (!profileResponse.error) {
        setCurrentUserName(user?.email || 'Operacion ORION');
        setCurrentUserRole(null);
      }

      if (!pendingResponse.error) {
        setPendingTickets((pendingResponse.data || []) as PendingServiceTicket[]);
      }

      if (!historyResponse.error) {
        setHistoricalRecords((historyResponse.data || []) as HistoricalServiceRecord[]);
      }

      if (!catalogResponse.error) {
        const { averias, soluciones } = splitServiceCatalog((catalogResponse.data || []) as ServiceCatalogRow[]);
        setAveriaCatalog(averias);
        setSolucionCatalog(soluciones);
      }

      if (!equipmentResponse.error) {
        setEquipmentCatalog((equipmentResponse.data || []) as EquipmentSummary[]);
      }

      if (!engineersResponse.error) {
        setEngineerProfiles((engineersResponse.data || []) as ProfileSummary[]);
      }

      if (!unitsResponse.error) {
        setClientServiceUnits((unitsResponse.data || []) as ClientServiceUnitSummary[]);
      }

      const failure = [pendingResponse, engineersResponse, equipmentResponse, historyResponse, catalogResponse, unitsResponse, profileResponse]
        .map((response) => response.error)
        .find(Boolean);
      if (failure) {
        console.error('No se pudo actualizar la planeación.', failure);
      }
      setLoadError(failure ? failure.message || 'error de conexión' : null);
    } catch (error) {
      if (sequence !== fetchSequence.current) {
        return;
      }
      console.error('No se pudo actualizar la planeación.', error);
      setLoadError(error instanceof Error ? error.message : 'error de conexión');
    } finally {
      if (sequence === fetchSequence.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void fetchContext();
    const refresh = () => { void fetchContext(); };
    // No periodic or focus refresh: it re-renders the page while someone is working on it.
    // The live monitor asks for a silent refresh only in fullscreen, as it changes panel,
    // so the update coincides with the transition and is not noticeable.
    window.addEventListener('planning-wall-refresh', refresh);
    window.addEventListener('ticket-assignment-changed', refresh);
    return () => { window.removeEventListener('planning-wall-refresh', refresh); window.removeEventListener('ticket-assignment-changed', refresh); };
  }, []);

  const plannedTickets = useMemo(
    () => pendingTickets.filter((ticket) => extractPlaneacionMeta(ticket.descripcion) !== null),
    [pendingTickets],
  );

  const reactiveTickets = useMemo(
    () => pendingTickets.filter((ticket) => extractPlaneacionMeta(ticket.descripcion) === null),
    [pendingTickets],
  );

  const plannedServices = useMemo(
    () => plannedTickets.map((ticket) => mapPendingTicketToPlannedService(ticket, equipmentCatalog, engineerProfiles)),
    [equipmentCatalog, engineerProfiles, plannedTickets],
  );
  const canSyncPlanning = useMemo(() => canAccessPlanningSync(currentUserName), [currentUserName]);

  const handleCreateService = async (draft: QuickCreateDraft) => {
    const payload = buildQuickCreatePayload(
      draft,
      engineerProfiles,
      currentUserId,
      currentUserName || 'Operacion ORION',
    );
    const { error } = await supabase.from('tickets').insert(payload);
    if (error) throw new Error(error.message);
    await fetchContext();
  };

  const handleUpdateService = async (service: PlannedService, updates: ServiceDetailUpdate) => {
    const payload = buildPlannedServiceUpdate(
      service,
      updates,
      engineerProfiles,
      currentUserName || 'Operacion ORION',
    );
    const { error } = await supabase.from('tickets').update(payload).eq('id', service.id);
    if (error) throw new Error(error.message);
    await fetchContext();
  };

  const handleDeleteService = async (service: PlannedService) => {
    if (!window.confirm(`¿Eliminar la actividad ${service.links.ticketId || service.locality}?`)) {
      return;
    }

    await supabase.from('tickets').delete().eq('id', service.id);
    await fetchContext();
  };

  const handleSyncPlanning = async () => {
    const summary = await syncServicePlanningFromSheet({
      actorName: currentUserName || 'Operacion ORION',
      profiles: engineerProfiles,
    });
    await fetchContext();
    return summary;
  };

  const openTravelForService = (service: PlannedService) => {
    setTravelPlannerRequestId(service.links.linkedTravelRequestId || null);
    setTravelPlannerTicketId(service.id);
    setTravelPlannerSeed(null);
    setTravelPlannerOpen(true);
  };

  const closeTravelPlanner = () => {
    setTravelPlannerOpen(false);
    setTravelPlannerRequestId(null);
    setTravelPlannerTicketId(null);
    setTravelPlannerSeed(null);
  };

  const openReportForService = (service: PlannedService, mode: 'servicio' | 'remoto') => {
    setServiceReportMode(mode);
    setServiceReportId(mode === 'servicio' ? service.links.linkedServiceReportId || null : null);
    setServiceReportTicketId(service.id);
    setServiceReportOpen(true);
  };

  const closeServiceReport = () => {
    setServiceReportOpen(false);
    setServiceReportId(null);
    setServiceReportTicketId(null);
  };

  const handleTravelSaved = async () => {
    setTravelRefreshKey((current) => current + 1);
    await fetchContext();
  };

  const handleServiceReportSaved = async () => {
    await fetchContext();
  };

  const handleOpenTravelPlannerFromReport = (seed: Partial<TravelFormData>) => {
    setTravelPlannerRequestId(null);
    setTravelPlannerTicketId(null);
    setTravelPlannerSeed(seed);
    setTravelPlannerOpen(true);
  };

  return (
    <>
      <ServicePlanningPage
        services={plannedServices}
        loading={loading}
        loadError={loadError}
        onRetryLoad={() => void fetchContext()}
        userRole={currentUserRole}
        currentUserName={currentUserName}
        engineerOptions={engineerProfiles.map((profile) => profile.nombre_completo || '').filter(Boolean)}
        staffProfiles={engineerProfiles}
        onCreateService={handleCreateService}
        onUpdateService={handleUpdateService}
        onDeleteService={handleDeleteService}
        onOpenTravel={openTravelForService}
        onOpenReport={openReportForService}
        equipments={equipmentCatalog}
        reactiveTickets={reactiveTickets}
        historicalRecords={historicalRecords}
        travelAdminPanel={<TravelAdminPanel refreshKey={travelRefreshKey} />}
        canViewPlanning={canViewPlanning}
        canManageTravel={canManageTravel}
        canManageReports={canManageReports}
        canSyncPlanning={canSyncPlanning}
        onSyncPlanning={handleSyncPlanning}
      />

      {canManageTravel && travelPlannerOpen ? (
        <TravelPlannerModal
          isOpen={travelPlannerOpen}
          onClose={closeTravelPlanner}
          engineers={engineerProfiles}
          equipments={equipmentCatalog}
          plannedTickets={plannedTickets}
          initialTravelRequestId={travelPlannerRequestId}
          initialPlanningTicketId={travelPlannerTicketId}
          initialFormSeed={travelPlannerSeed}
          disableAutoRecover={Boolean(travelPlannerSeed)}
          onSaved={handleTravelSaved}
        />
      ) : null}

      {canManageReports && serviceReportOpen ? (
        <ServiceReportModal
          isOpen={serviceReportOpen}
          mode={serviceReportMode}
          onClose={closeServiceReport}
          engineers={engineerProfiles}
          equipments={equipmentCatalog}
          plannedTickets={plannedTickets}
          clientServiceUnits={clientServiceUnits}
          averias={averiaCatalog}
          soluciones={solucionCatalog}
          initialServiceReportId={serviceReportId}
          initialPlanningTicketId={serviceReportTicketId}
          onOpenTravelPlanner={handleOpenTravelPlannerFromReport}
          onSaved={handleServiceReportSaved}
        />
      ) : null}
    </>
  );
}
