import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import ServiceReportModal from './ServiceReportModal';
import TravelAdminPanel from './TravelAdminPanel';
import TravelPlannerModal from './TravelPlannerModal';
import {
  buildWeeklyMonthBuckets,
  extractPlaneacionMeta,
  METADATA_DELIMITER,
  stripPlaneacionMeta,
  type EquipmentSummary,
  type HistoricalRefaccion,
  type HistoricalServiceRecord,
  type InlinePlanningForm,
  type PlanningMetadata,
  type PendingServiceTicket,
  type ProfileSummary,
} from './servicesPlanning';
import type { ClientServiceUnitSummary, ServiceReportMode } from './serviceReports';
import type { TravelFormData } from './travelPlanner';

type ActiveView = 'planeacion' | 'pendientes' | 'historicos';

interface CatalogAveria {
  cda: string;
  detalle_averia: string;
  tipo_averia?: string | null;
}

interface CatalogSolution {
  cds: string;
  detalle_solucion: string;
}

type DetailItem =
  | (PendingServiceTicket & { type: 'pendiente' })
  | (HistoricalServiceRecord & { type: 'historico' });

const MONTHS = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
];

const commonInputStyle = {
  width: '100%',
  background: 'transparent',
  border: '1px solid transparent',
  color: 'inherit',
  fontSize: 'inherit',
  fontWeight: 'inherit',
  padding: '0.4rem',
  borderRadius: '4px',
  outline: 'none',
  transition: 'border 0.2s',
  textAlign: 'inherit' as const,
};

const serviceSerialAccent = '#ff5f6d';

export default function Services() {
  const [activeView, setActiveView] = useState<ActiveView>('planeacion');
  const [pendingTickets, setPendingTickets] = useState<PendingServiceTicket[]>([]);
  const [historicalRecords, setHistoricalRecords] = useState<HistoricalServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [averiaCatalog, setAveriaCatalog] = useState<CatalogAveria[]>([]);
  const [solutionCatalog, setSolutionCatalog] = useState<CatalogSolution[]>([]);
  const [equipmentCatalog, setEquipmentCatalog] = useState<EquipmentSummary[]>([]);
  const [engineerProfiles, setEngineerProfiles] = useState<ProfileSummary[]>([]);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<DetailItem | null>(null);
  const [monthFilterIndex, setMonthFilterIndex] = useState(new Date().getMonth());
  const [inlineForms, setInlineForms] = useState<Record<string, InlinePlanningForm>>({});
  const [travelPlannerOpen, setTravelPlannerOpen] = useState(false);
  const [travelPlannerRequestId, setTravelPlannerRequestId] = useState<string | null>(null);
  const [travelPlannerTicketId, setTravelPlannerTicketId] = useState<string | null>(null);
  const [travelPlannerSeed, setTravelPlannerSeed] = useState<Partial<TravelFormData> | null>(null);
  const [serviceReportOpen, setServiceReportOpen] = useState(false);
  const [serviceReportMode, setServiceReportMode] = useState<ServiceReportMode>('servicio');
  const [serviceReportId, setServiceReportId] = useState<string | null>(null);
  const [serviceReportTicketId, setServiceReportTicketId] = useState<string | null>(null);
  const [travelRefreshKey, setTravelRefreshKey] = useState(0);
  const [clientServiceUnits, setClientServiceUnits] = useState<ClientServiceUnitSummary[]>([]);

  const openNewTravelPlanner = () => {
    setTravelPlannerRequestId(null);
    setTravelPlannerTicketId(null);
    setTravelPlannerSeed(null);
    setTravelPlannerOpen(true);
  };

  const openLinkedTravelPlanner = (travelRequestId: string, ticketId: string) => {
    setTravelPlannerRequestId(travelRequestId);
    setTravelPlannerTicketId(ticketId);
    setTravelPlannerSeed(null);
    setTravelPlannerOpen(true);
  };

  const closeTravelPlanner = () => {
    setTravelPlannerOpen(false);
    setTravelPlannerRequestId(null);
    setTravelPlannerTicketId(null);
    setTravelPlannerSeed(null);
  };

  const openNewServiceReport = (mode: ServiceReportMode) => {
    setServiceReportMode(mode);
    setServiceReportId(null);
    setServiceReportTicketId(null);
    setServiceReportOpen(true);
  };

  const openLinkedServiceReport = (linkedReportId: string, ticketId: string) => {
    setServiceReportMode('servicio');
    setServiceReportId(linkedReportId);
    setServiceReportTicketId(ticketId);
    setServiceReportOpen(true);
  };

  const closeServiceReport = () => {
    setServiceReportOpen(false);
    setServiceReportId(null);
    setServiceReportTicketId(null);
  };

  const getTravelRequestBadgeLabel = (meta: PlanningMetadata) => {
    const draftLikeStatuses = new Set(['borrador', 'buscando_vuelo', 'vuelo_seleccionado', 'requiere_cambios']);
    return draftLikeStatuses.has(meta.travel_status || '') ? '🧾 Borrador Solicitud' : '🧾 Solicitud de viaje';
  };

  const getServiceReportBadgeLabel = (meta: PlanningMetadata) => {
    const draftLikeStatuses = new Set(['borrador']);
    return draftLikeStatuses.has(meta.service_report_status || '') ? '📝 Borrador Reporte' : '📝 Reporte Servicio';
  };

  async function fetchAuxiliaryCatalogs() {
    const [averiasResponse, solutionsResponse, equipmentResponse, profilesResponse, clientServiceUnitsResponse] = await Promise.all([
      supabase.from('averias_catalogo').select('*'),
      supabase.from('soluciones_catalogo').select('*'),
      supabase.from('equipos').select('*, clientes(id, razon_social, persona_contacto, telefono)'),
      supabase.from('profiles').select('*'),
      supabase.from('client_service_units').select('id, client_id, equipment_id, numero_serie, cliente, persona_contacto, unidad_negocio, analizador'),
    ]);

    if (averiasResponse.data) {
      setAveriaCatalog(averiasResponse.data as CatalogAveria[]);
    }

    if (solutionsResponse.data) {
      setSolutionCatalog(solutionsResponse.data as CatalogSolution[]);
    }

    if (equipmentResponse.data) {
      setEquipmentCatalog(equipmentResponse.data as EquipmentSummary[]);
    }

    if (profilesResponse.data) {
      setEngineerProfiles(profilesResponse.data as ProfileSummary[]);
    }

    if (clientServiceUnitsResponse.data) {
      setClientServiceUnits(clientServiceUnitsResponse.data as ClientServiceUnitSummary[]);
    }
  }

  async function fetchPendingTickets() {
    setLoading(true);

    const { data, error } = await supabase
      .from('tickets')
      .select('id, user_id, asunto, descripcion, estado, creado_en, numero_serie_equipo, profiles:user_id(nombre_completo)')
      .neq('estado', 'cerrado')
      .order('creado_en', { ascending: false });

    if (!error && data) {
      setPendingTickets(data as PendingServiceTicket[]);
    }

    setLoading(false);
  }

  async function fetchHistoricalRecords() {
    setLoading(true);

    const { data, error } = await supabase
      .from('servicios_historial')
      .select(
        'id, ticket_id, id_legacy, no_serie, cda, cds, motivo, fecha_servicio, creado_en, profiles:tecnico_id(nombre_completo), servicios_refacciones(cantidad, refacciones_catalogo(descripcion, codigo_refaccion))',
      )
      .order('fecha_servicio', { ascending: false })
      .order('creado_en', { ascending: false });

    if (!error && data) {
      const mappedData = (data as HistoricalServiceRecord[]).map((record) => ({
        ...record,
        averias_catalogo: averiaCatalog.find((item) => item.cda === record.cda) || null,
        soluciones_catalogo: solutionCatalog.find((item) => item.cds === record.cds) || null,
      }));
      setHistoricalRecords(mappedData);
    }

    setLoading(false);
  }

  useEffect(() => {
    void fetchAuxiliaryCatalogs();
  }, []);

  useEffect(() => {
    void (activeView === 'historicos' ? fetchHistoricalRecords() : fetchPendingTickets());
  }, [activeView]);

  const updateTicketInline = async (
    ticket: PendingServiceTicket,
    fieldClass: 'tipo' | 'plataforma' | 'cliente' | 'serie' | 'observaciones' | 'ingeniero_id' | 'fecha_acordada',
    newValue: string,
  ) => {
    const meta = extractPlaneacionMeta(ticket.descripcion) || {};
    const rawChunks = ticket.asunto.split('-');
    let typeService = rawChunks.length > 0 ? rawChunks[0].replace('[PLAN]', '').trim() : ticket.asunto;
    let platform = rawChunks.length > 1 ? rawChunks[1].trim() : 'MULTIPLE';
    let client = rawChunks.length > 2 ? rawChunks[2].trim() : 'N/A';
    const updatePayload: Record<string, unknown> = {};

    switch (fieldClass) {
      case 'tipo':
        typeService = newValue;
        updatePayload.asunto = `[PLAN] ${typeService} - ${platform} - ${client}`;
        break;
      case 'plataforma':
        platform = newValue;
        updatePayload.asunto = `[PLAN] ${typeService} - ${platform} - ${client}`;
        break;
      case 'cliente':
        client = newValue;
        updatePayload.asunto = `[PLAN] ${typeService} - ${platform} - ${client}`;
        break;
      case 'serie':
        updatePayload.numero_serie_equipo = newValue;
        break;
      case 'observaciones':
        updatePayload.descripcion = `${newValue}\n\n${METADATA_DELIMITER} ${JSON.stringify(meta)}`;
        break;
      case 'ingeniero_id': {
        const matchedProfile = engineerProfiles.find(
          (profile) =>
            profile.nombre_completo?.toUpperCase() === newValue.toUpperCase() || profile.id === newValue,
        );
        if (matchedProfile) {
          updatePayload.user_id = matchedProfile.id;
          meta.ingeniero_csv = matchedProfile.nombre_completo || '';
        } else {
          updatePayload.user_id = null;
          meta.ingeniero_csv = newValue.trim();
        }
        updatePayload.descripcion = `${stripPlaneacionMeta(ticket.descripcion).trim()}\n\n${METADATA_DELIMITER} ${JSON.stringify(meta)}`;
        break;
      }
      case 'fecha_acordada':
        meta.fecha_acordada = newValue;
        updatePayload.descripcion = `${stripPlaneacionMeta(ticket.descripcion).trim()}\n\n${METADATA_DELIMITER} ${JSON.stringify(meta)}`;
        break;
    }

    await supabase.from('tickets').update(updatePayload).eq('id', ticket.id);
    await fetchPendingTickets();
  };

  const submitInline = async (weekLabel: string) => {
    const form = inlineForms[weekLabel];
    if (!form || !form.tipo) {
      return;
    }

    const metadata = {
      fecha_tentativa: weekLabel,
      requiere_vuelos: false,
      requiere_auto: false,
      dias_laborados: [],
    };

    const descriptionLines: string[] = [];
    if (form.cliente) {
      descriptionLines.push(`Cliente/Localidad: ${form.cliente}`);
    }
    if (form.observaciones) {
      descriptionLines.push(`Observaciones: ${form.observaciones}`);
    }

    const finalDescription = `${descriptionLines.join('\n')}\n\n${METADATA_DELIMITER} ${JSON.stringify(metadata)}`;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from('tickets').insert({
      user_id: form.ingeniero_id || user?.id || null,
      numero_serie_equipo: form.serie || null,
      asunto: `[PLAN] ${form.tipo} - ${form.plataforma || 'MULTIPLE'}`,
      descripcion: finalDescription,
      estado: 'abierto',
    });

    setInlineForms((current) => ({
      ...current,
      [weekLabel]: {},
    }));

    await fetchPendingTickets();
  };

  const deletePlannedTicket = async (ticketId: string) => {
    if (!window.confirm('¿Estas seguro de eliminar esta programacion?')) {
      return;
    }

    await supabase.from('tickets').delete().eq('id', ticketId);
    await fetchPendingTickets();
  };

  const handleTravelSaved = async () => {
    setTravelRefreshKey((current) => current + 1);
    await fetchPendingTickets();
  };

  const handleServiceReportSaved = async () => {
    await fetchPendingTickets();
  };

  const handleOpenTravelPlannerFromReport = (seed: Partial<TravelFormData>) => {
    setTravelPlannerRequestId(null);
    setTravelPlannerTicketId(null);
    setTravelPlannerSeed(seed);
    setTravelPlannerOpen(true);
  };

  const plannedTickets = pendingTickets.filter((ticket) => extractPlaneacionMeta(ticket.descripcion) !== null);
  const reactiveTickets = pendingTickets.filter((ticket) => extractPlaneacionMeta(ticket.descripcion) === null);

  const monthBuckets = (() => {
    const buckets = buildWeeklyMonthBuckets(monthFilterIndex, MONTHS);
    const monthTickets = plannedTickets.filter((ticket) => {
      const tentativeValue = extractPlaneacionMeta(ticket.descripcion)?.fecha_tentativa?.toUpperCase() || '';
      return tentativeValue.includes(MONTHS[monthFilterIndex]);
    });

    monthTickets.forEach((ticket) => {
      const meta = extractPlaneacionMeta(ticket.descripcion);
      let rawWeek = (meta?.fecha_tentativa || 'MES/SEMANA SIN DEFINIR').toUpperCase().trim();
      rawWeek = rawWeek.replace(`${MONTHS[monthFilterIndex]} ${MONTHS[monthFilterIndex]}`, MONTHS[monthFilterIndex]);
      const snapKey = Object.keys(buckets).find((key) => rawWeek.startsWith(key.split(' ')[0]));
      const finalKey = snapKey || rawWeek;

      if (!buckets[finalKey]) {
        buckets[finalKey] = [];
      }

      buckets[finalKey].push(ticket);
    });

    Object.keys(buckets).forEach((weekKey) => {
      buckets[weekKey].sort((left, right) => {
        const engineerLeft =
          left.profiles?.nombre_completo || extractPlaneacionMeta(left.descripcion)?.ingeniero_csv || 'Z-Sin Asignar';
        const engineerRight =
          right.profiles?.nombre_completo || extractPlaneacionMeta(right.descripcion)?.ingeniero_csv || 'Z-Sin Asignar';
        return engineerLeft.localeCompare(engineerRight);
      });
    });

    return buckets;
  })();

  const renderHistoricalRefactions = (items: HistoricalRefaccion[] | null | undefined) => {
    if (!items || items.length === 0) {
      return null;
    }

    return (
      <div style={{ marginTop: '0.8rem' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>Refacciones Empleadas:</span>
        <ul style={{ margin: '0.3rem 0 0 1rem', padding: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {items.map((item, index) => (
            <li key={`${item.refacciones_catalogo?.codigo_refaccion || 'ref'}-${index}`}>
              x{item.cantidad} - [{item.refacciones_catalogo?.codigo_refaccion}] {item.refacciones_catalogo?.descripcion || 'Pieza externa'}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="card" style={{ marginTop: '1rem', background: 'var(--bg-secondary)', border: 'none' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <h3 style={{ margin: 0 }}>Gestion Estrategica de Servicios</h3>
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            background: 'rgba(0,0,0,0.3)',
            padding: '0.3rem',
            borderRadius: '8px',
            overflowX: 'auto',
          }}
        >
          <button
            onClick={() => setActiveView('planeacion')}
            className={`button-primary ${activeView !== 'planeacion' ? 'inactive' : ''}`}
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
          >
            📅 Planeacion Semanal ({plannedTickets.length})
          </button>
          <button
            onClick={() => setActiveView('pendientes')}
            className={`button-primary ${activeView !== 'pendientes' ? 'inactive' : ''}`}
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
          >
            ⏳ Reportes Reactivos ({reactiveTickets.length})
          </button>
          <button
            onClick={() => setActiveView('historicos')}
            className={`button-primary ${activeView !== 'historicos' ? 'inactive' : ''}`}
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
          >
            ✔️ Historial Global
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Cargando registros...</p>
      ) : activeView === 'planeacion' ? (
        <div>
          <style>{`
            input[list]::-webkit-calendar-picker-indicator {
              display: block !important;
              opacity: 0.6 !important;
              cursor: pointer;
            }
            input[list]:hover::-webkit-calendar-picker-indicator {
              opacity: 1 !important;
            }
          `}</style>

          <datalist id="ingenieros-autocompletado">
            {engineerProfiles.map((profile) => (
              <option key={profile.id} value={profile.nombre_completo || ''} />
            ))}
          </datalist>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.5rem',
              borderBottom: '1px solid var(--border-color)',
              paddingBottom: '1rem',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h4 style={{ margin: 0, color: 'var(--primary-color)' }}>Tablero de Mantenimientos y Asignaciones</h4>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Programa intervenciones, coordina viajes y visualiza solicitudes listas para reservar.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
              <button className="button-primary" style={{ background: 'var(--primary-color)' }} onClick={openNewTravelPlanner}>
                + Planear Nuevo Servicio
              </button>
              <button className="button-primary inactive chip" type="button" onClick={() => openNewServiceReport('servicio')}>
                Reporte Servicio
              </button>
              <button className="button-primary inactive chip" type="button" onClick={() => openNewServiceReport('remoto')}>
                Reporte Remoto
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', margin: '0.5rem 0' }}>
              <button
                className="button-primary"
                disabled={monthFilterIndex === 0}
                style={{ padding: '0.4rem 1rem' }}
                onClick={() => setMonthFilterIndex(Math.max(0, monthFilterIndex - 1))}
              >
                ◀️ Anterior
              </button>
              <h3 style={{ margin: 0, width: '220px', textAlign: 'center', color: 'var(--primary-color)' }}>
                {MONTHS[monthFilterIndex]}
              </h3>
              <button
                className="button-primary"
                disabled={monthFilterIndex === 11}
                style={{ padding: '0.4rem 1rem' }}
                onClick={() => setMonthFilterIndex(Math.min(11, monthFilterIndex + 1))}
              >
                Siguiente ▶️
              </button>
            </div>

            {Object.entries(monthBuckets).map(([weekLabel, services]) => (
              <div
                key={weekLabel}
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                }}
              >
                <div
                  style={{
                    background: 'linear-gradient(135deg, #990000 0%, #5e0000 100%)',
                    color: '#ffffff',
                    padding: '0.8rem 1rem',
                    fontWeight: 600,
                    textAlign: 'center',
                    fontSize: '1.05rem',
                    letterSpacing: '2px',
                    boxShadow: '0 4px 15px rgba(153, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                    textTransform: 'uppercase',
                  }}
                >
                  {weekLabel}
                </div>

                <div style={{ overflowX: 'auto', background: 'var(--bg-card)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '900px' }}>
                    <thead
                      style={{
                        background: 'rgba(0,0,0,0.4)',
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <tr>
                        <th style={{ padding: '0.8rem', borderBottom: '1px solid var(--border-color)', width: '15%' }}>Asunto</th>
                        <th style={{ padding: '0.8rem', borderBottom: '1px solid var(--border-color)', textAlign: 'center', width: '10%' }}>Equipo</th>
                        <th style={{ padding: '0.8rem', borderBottom: '1px solid var(--border-color)', minWidth: '150px' }}>Ubicacion</th>
                        <th style={{ padding: '0.8rem', borderBottom: '1px solid var(--border-color)', textAlign: 'center' }}>Serie</th>
                        <th style={{ padding: '0.8rem', borderBottom: '1px solid var(--border-color)', width: '40%', textAlign: 'center' }}>Observaciones</th>
                        <th style={{ padding: '0.8rem', borderBottom: '1px solid var(--border-color)', minWidth: '120px' }}>Asignacion</th>
                        <th style={{ padding: '0.8rem', borderBottom: '1px solid var(--border-color)', minWidth: '150px' }}>Fecha Acordada</th>
                        <th style={{ padding: '0.8rem', borderBottom: '1px solid var(--border-color)', textAlign: 'center' }}>X</th>
                      </tr>
                    </thead>
                    <tbody style={{ fontSize: '0.85rem' }}>
                      {services.map((ticket) => {
                        const meta = extractPlaneacionMeta(ticket.descripcion) || {};
                        const engineerName = ticket.profiles?.nombre_completo || meta.ingeniero_csv || 'Sin Asignar';
                        const rawChunks = ticket.asunto.split('-');
                        const typeService = rawChunks.length > 0 ? rawChunks[0].replace('[PLAN]', '').trim() : ticket.asunto;
                        const platform = rawChunks.length > 1 ? rawChunks[1].trim() : ticket.numero_serie_equipo || 'MULTIPLE';
                        const client = rawChunks.length > 2 ? rawChunks[2].trim() : 'N/A';

                        return (
                          <tr
                            key={ticket.id}
                            style={{
                              background: 'transparent',
                              borderTop: '1px solid rgba(255,255,255,0.05)',
                              borderBottom: 'none',
                            }}
                          >
                            <td style={{ padding: '0.2rem', fontWeight: 'bold' }}>
                              <input
                                key={`tipo-${ticket.id}`}
                                defaultValue={typeService}
                                onBlur={(event) =>
                                  event.target.value !== typeService &&
                                  void updateTicketInline(ticket, 'tipo', event.target.value)
                                }
                                style={commonInputStyle}
                                onFocus={(event) => {
                                  event.target.style.border = '1px solid var(--border-color)';
                                }}
                                onBlurCapture={(event) => {
                                  event.target.style.border = '1px solid transparent';
                                }}
                              />
                            </td>
                            <td style={{ padding: '0.2rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                              <input
                                key={`plat-${ticket.id}`}
                                defaultValue={platform}
                                onBlur={(event) =>
                                  event.target.value !== platform &&
                                  void updateTicketInline(ticket, 'plataforma', event.target.value)
                                }
                                style={commonInputStyle}
                                onFocus={(event) => {
                                  event.target.style.border = '1px solid var(--border-color)';
                                }}
                                onBlurCapture={(event) => {
                                  event.target.style.border = '1px solid transparent';
                                }}
                              />
                            </td>
                            <td style={{ padding: '0.2rem' }}>
                              <input
                                key={`cli-${ticket.id}`}
                                defaultValue={client !== 'N/A' ? client : ''}
                                placeholder="N/A"
                                onBlur={(event) =>
                                  event.target.value !== client &&
                                  void updateTicketInline(ticket, 'cliente', event.target.value || 'N/A')
                                }
                                style={commonInputStyle}
                                onFocus={(event) => {
                                  event.target.style.border = '1px solid var(--border-color)';
                                }}
                                onBlurCapture={(event) => {
                                  event.target.style.border = '1px solid transparent';
                                }}
                              />
                            </td>
                            <td style={{ padding: '0.2rem', color: serviceSerialAccent, fontWeight: 'bold', textAlign: 'center' }}>
                              <input
                                key={`ser-${ticket.id}`}
                                defaultValue={ticket.numero_serie_equipo || ''}
                                placeholder="S/N"
                                onBlur={(event) =>
                                  event.target.value !== (ticket.numero_serie_equipo || '') &&
                                  void updateTicketInline(ticket, 'serie', event.target.value)
                                }
                                style={commonInputStyle}
                                onFocus={(event) => {
                                  event.target.style.border = '1px solid var(--border-color)';
                                }}
                                onBlurCapture={(event) => {
                                  event.target.style.border = '1px solid transparent';
                                }}
                              />
                            </td>
                            <td
                              style={{
                                padding: '0.4rem',
                                fontSize: '0.8rem',
                                color: 'var(--text-secondary)',
                                textAlign: 'center',
                                verticalAlign: 'middle',
                              }}
                            >
                              <textarea
                                key={`obs-${ticket.id}`}
                                defaultValue={stripPlaneacionMeta(ticket.descripcion).trim()}
                                placeholder="Ninguna nota al momento..."
                                onBlur={(event) =>
                                  event.target.value !== stripPlaneacionMeta(ticket.descripcion).trim() &&
                                  void updateTicketInline(ticket, 'observaciones', event.target.value)
                                }
                                style={{
                                  ...commonInputStyle,
                                  fieldSizing: 'content',
                                  resize: 'none',
                                  minHeight: '40px',
                                  color: 'var(--text-secondary)',
                                  textAlign: 'center',
                                  lineHeight: '1.4',
                                }}
                                onFocus={(event) => {
                                  event.target.style.border = '1px solid var(--border-color)';
                                }}
                                onBlurCapture={(event) => {
                                  event.target.style.border = '1px solid transparent';
                                }}
                              />
                              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.4rem', color: '#ffb74d', justifyContent: 'center' }}>
                                {meta.requiere_vuelos && <span title="Se detectaron vuelos solicitados">✈️ Viaje activo</span>}
                                {meta.requiere_auto && <span title="Se requiere renta automotriz">🚗 Auto extra</span>}
                                {meta.service_report_id && (
                                  <button
                                    type="button"
                                    onClick={() => openLinkedServiceReport(meta.service_report_id as string, ticket.id)}
                                    title="Abrir reporte de servicio ligado"
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: 'inherit',
                                      cursor: 'pointer',
                                      font: 'inherit',
                                      padding: 0,
                                    }}
                                  >
                                    {getServiceReportBadgeLabel(meta)}
                                  </button>
                                )}
                                {meta.travel_request_id && (
                                  <button
                                    type="button"
                                    onClick={() => openLinkedTravelPlanner(meta.travel_request_id as string, ticket.id)}
                                    title="Abrir solicitud de viaje ligada"
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: 'inherit',
                                      cursor: 'pointer',
                                      font: 'inherit',
                                      padding: 0,
                                    }}
                                  >
                                    {getTravelRequestBadgeLabel(meta)}
                                  </button>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '0.2rem', fontWeight: 'bold' }}>
                              <input
                                type="text"
                                list="ingenieros-autocompletado"
                                key={`ing-${ticket.id}`}
                                defaultValue={engineerName !== 'Sin Asignar' ? engineerName : ''}
                                placeholder="Sin Asignar"
                                onBlur={(event) => {
                                  if (event.target.value === '') {
                                    event.target.value = event.target.dataset.oldval || '';
                                  }
                                  if (event.target.value !== (engineerName !== 'Sin Asignar' ? engineerName : '')) {
                                    void updateTicketInline(ticket, 'ingeniero_id', event.target.value);
                                  }
                                }}
                                style={{
                                  ...commonInputStyle,
                                  textAlign: 'left',
                                  color: engineerName === 'Sin Asignar' ? 'var(--text-secondary)' : 'var(--text-primary)',
                                }}
                                onFocus={(event) => {
                                  event.target.style.border = '1px solid var(--border-color)';
                                  event.target.dataset.oldval = event.target.value;
                                  event.target.value = '';
                                }}
                                onBlurCapture={(event) => {
                                  event.target.style.border = '1px solid transparent';
                                }}
                              />
                            </td>
                            <td style={{ padding: '0.2rem', textAlign: 'center' }}>
                              <input
                                type={meta.fecha_acordada ? 'date' : 'text'}
                                placeholder="Sin Acordar"
                                key={`date-${ticket.id}`}
                                defaultValue={meta.fecha_acordada || ''}
                                onBlur={(event) => {
                                  if (!event.target.value) {
                                    event.target.type = 'text';
                                  }
                                  event.target.style.border = '1px solid transparent';
                                  if (event.target.value !== (meta.fecha_acordada || '')) {
                                    void updateTicketInline(ticket, 'fecha_acordada', event.target.value);
                                  }
                                }}
                                style={{
                                  ...commonInputStyle,
                                  color: meta.fecha_acordada ? 'var(--success-color)' : 'rgba(82, 82, 82, 0.72)',
                                  textAlign: 'center',
                                }}
                                onFocus={(event) => {
                                  event.target.type = 'date';
                                  try {
                                    event.target.showPicker();
                                  } catch {
                                    // Browsers without showPicker support can fall back to native focus behavior.
                                  }
                                  event.target.style.border = '1px solid var(--border-color)';
                                }}
                              />
                            </td>
                            <td style={{ padding: '0.8rem', textAlign: 'center' }}>
                              <button
                                style={{ background: 'none', border: 'none', color: 'var(--error-color)', cursor: 'pointer', fontSize: '1rem' }}
                                onClick={() => void deletePlannedTicket(ticket.id)}
                                title="Eliminar planeacion"
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        );
                      })}

                      <tr style={{ background: 'rgba(255,255,255,0.03)', borderTop: '2px dashed rgba(255,255,255,0.1)' }}>
                        <td style={{ padding: '0.4rem' }}>
                          <input
                            className="input-field"
                            style={{ padding: '0.4rem', fontSize: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                            placeholder="T. PREV..."
                            value={inlineForms[weekLabel]?.tipo || ''}
                            onChange={(event) =>
                              setInlineForms((current) => ({
                                ...current,
                                [weekLabel]: { ...(current[weekLabel] || {}), tipo: event.target.value },
                              }))
                            }
                          />
                        </td>
                        <td style={{ padding: '0.4rem' }}>
                          <input
                            className="input-field"
                            style={{ padding: '0.4rem', fontSize: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                            placeholder="A15..."
                            value={inlineForms[weekLabel]?.plataforma || ''}
                            onChange={(event) =>
                              setInlineForms((current) => ({
                                ...current,
                                [weekLabel]: { ...(current[weekLabel] || {}), plataforma: event.target.value },
                              }))
                            }
                          />
                        </td>
                        <td style={{ padding: '0.4rem' }}>
                          <input
                            className="input-field"
                            style={{ padding: '0.4rem', fontSize: '0.75rem', width: '150px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                            placeholder="Lab..."
                            value={inlineForms[weekLabel]?.cliente || ''}
                            onChange={(event) =>
                              setInlineForms((current) => ({
                                ...current,
                                [weekLabel]: { ...(current[weekLabel] || {}), cliente: event.target.value },
                              }))
                            }
                          />
                        </td>
                        <td style={{ padding: '0.4rem' }}>
                          <input
                            className="input-field"
                            style={{ padding: '0.4rem', fontSize: '0.75rem', width: '100px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                            placeholder="Serie..."
                            value={inlineForms[weekLabel]?.serie || ''}
                            onChange={(event) =>
                              setInlineForms((current) => ({
                                ...current,
                                [weekLabel]: { ...(current[weekLabel] || {}), serie: event.target.value },
                              }))
                            }
                          />
                        </td>
                        <td style={{ padding: '0.4rem' }}>
                          <input
                            className="input-field"
                            style={{ padding: '0.4rem', fontSize: '0.75rem', width: '300px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                            placeholder="Notas..."
                            value={inlineForms[weekLabel]?.observaciones || ''}
                            onChange={(event) =>
                              setInlineForms((current) => ({
                                ...current,
                                [weekLabel]: { ...(current[weekLabel] || {}), observaciones: event.target.value },
                              }))
                            }
                          />
                        </td>
                        <td style={{ padding: '0.4rem' }}>
                          <select
                            className="input-field"
                            style={{ padding: '0.4rem', fontSize: '0.75rem', width: '120px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)' }}
                            value={inlineForms[weekLabel]?.ingeniero_id || ''}
                            onChange={(event) =>
                              setInlineForms((current) => ({
                                ...current,
                                [weekLabel]: { ...(current[weekLabel] || {}), ingeniero_id: event.target.value },
                              }))
                            }
                          >
                            <option value="">-- ING/QFB --</option>
                            {engineerProfiles.map((profile) => (
                              <option key={profile.id} value={profile.id}>
                                {(profile.nombre_completo || 'Sin nombre').split(' ')[0]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td colSpan={2} style={{ padding: '0.4rem', textAlign: 'center', verticalAlign: 'middle' }}>
                          <button
                            className="button-primary"
                            style={{ padding: '0.4rem', width: '100%', fontSize: '0.75rem', border: '1px solid var(--primary-color)' }}
                            onClick={() => void submitInline(weekLabel)}
                          >
                            + Añadir Fila
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          <TravelAdminPanel refreshKey={travelRefreshKey} />
        </div>
      ) : activeView === 'pendientes' ? (
        <div>
          {reactiveTickets.length === 0 ? (
            <p style={{ color: 'var(--success-color)' }}>¡Todo al dia! No hay tickets reactivos pendientes de cierre.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {reactiveTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => {
                    setDetailItem({ ...ticket, type: 'pendiente' });
                    setDetailModalOpen(true);
                  }}
                  style={{
                    padding: '1rem',
                    background: 'var(--bg-card)',
                    borderRadius: '8px',
                    borderLeft: '4px solid #ffb74d',
                    cursor: 'pointer',
                    transition: 'filter 0.2s',
                    border: '1px solid transparent',
                  }}
                  onMouseOver={(event) => {
                    event.currentTarget.style.filter = 'brightness(1.2)';
                  }}
                  onMouseOut={(event) => {
                    event.currentTarget.style.filter = 'brightness(1)';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>{ticket.asunto}</strong>
                    <span style={{ fontSize: '0.8rem', background: 'rgba(255,150,0,0.2)', color: '#ffb74d', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                      Estatus: {ticket.estado.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>
                    {stripPlaneacionMeta(ticket.descripcion)}
                  </p>
                  <div style={{ marginTop: '0.8rem', fontSize: '0.8rem', color: 'var(--primary-color)' }}>
                    📍 Equipo involucrado: {ticket.numero_serie_equipo || 'Sin serie ingresada'}
                    <br />
                    👤 Levantado por: {ticket.profiles?.nombre_completo || 'N/D'} el{' '}
                    {new Date(ticket.creado_en).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          {historicalRecords.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No hay historicos registrados.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {historicalRecords.map((record) => (
                <div
                  key={record.id}
                  onClick={() => {
                    setDetailItem({ ...record, type: 'historico' });
                    setDetailModalOpen(true);
                  }}
                  style={{
                    padding: '1rem',
                    background: 'var(--bg-card)',
                    borderRadius: '8px',
                    borderLeft: '4px solid var(--success-color)',
                    cursor: 'pointer',
                    transition: 'filter 0.2s',
                    border: '1px solid transparent',
                  }}
                  onMouseOver={(event) => {
                    event.currentTarget.style.filter = 'brightness(1.2)';
                  }}
                  onMouseOut={(event) => {
                    event.currentTarget.style.filter = 'brightness(1)';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                    <strong style={{ fontSize: '0.95rem' }}>
                      <span style={{ color: 'var(--primary-color)' }}>
                        {record.ticket_id
                          ? `# TKT-${record.ticket_id.substring(0, 8).toUpperCase()}`
                          : record.id_legacy
                            ? `# LEG-${record.id_legacy}`
                            : '# SRV'}
                      </span>
                      <span style={{ margin: '0 0.5rem', color: 'var(--text-secondary)' }}>|</span>
                      {record.fecha_servicio || new Date(record.creado_en).toLocaleDateString()}
                    </strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {record.profiles?.nombre_completo || 'Sistema historico'}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(150px, 1fr) minmax(150px, 1fr)',
                      gap: '1rem',
                      background: 'rgba(0,0,0,0.2)',
                      padding: '0.8rem',
                      borderRadius: '6px',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--error-color)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                        Diagnostico / falla
                      </span>
                      <span style={{ fontSize: '0.85rem' }}>
                        [{record.cda || 'N/D'}] {record.averias_catalogo ? record.averias_catalogo.detalle_averia : 'Falla libre'}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--success-color)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                        Solucion
                      </span>
                      <span style={{ fontSize: '0.85rem' }}>
                        [{record.cds || 'N/D'}] {record.soluciones_catalogo ? record.soluciones_catalogo.detalle_solucion : 'Solucion libre'}
                      </span>
                    </div>
                  </div>

                  <p style={{ marginTop: '0.8rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <strong>Anotaciones extras:</strong> {record.motivo || 'Ninguna'}
                  </p>

                  {renderHistoricalRefactions(record.servicios_refacciones)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {travelPlannerOpen && (
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
      )}

      {serviceReportOpen && (
        <ServiceReportModal
          isOpen={serviceReportOpen}
          mode={serviceReportMode}
          onClose={closeServiceReport}
          engineers={engineerProfiles}
          equipments={equipmentCatalog}
          plannedTickets={plannedTickets}
          clientServiceUnits={clientServiceUnits}
          averias={averiaCatalog}
          initialServiceReportId={serviceReportId}
          initialPlanningTicketId={serviceReportTicketId}
          onOpenTravelPlanner={handleOpenTravelPlannerFromReport}
          onSaved={handleServiceReportSaved}
        />
      )}

      {detailModalOpen &&
        detailItem &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.85)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 1000,
              padding: '1rem',
              backdropFilter: 'blur(5px)',
            }}
            onClick={() => setDetailModalOpen(false)}
          >
            <div
              className="card"
              style={{ maxWidth: '650px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
              onClick={(event) => event.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                <h3 style={{ color: 'var(--primary-color)', margin: 0 }}>
                  {detailItem.type === 'pendiente' ? 'Reporte Operativo Activo' : 'Acta de Servicio Historico'}
                </h3>
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.5rem', lineHeight: '1rem' }}
                  onClick={() => setDetailModalOpen(false)}
                >
                  ×
                </button>
              </div>

              {(() => {
                const rawSerial =
                  detailItem.type === 'historico' ? detailItem.no_serie || undefined : detailItem.numero_serie_equipo || undefined;
                const equipment = rawSerial
                  ? equipmentCatalog.find((item) => String(item.numero_serie).trim() === String(rawSerial).trim())
                  : null;

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(200px, 1fr)', gap: '1.5rem' }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                        {detailItem.type === 'pendiente' ? 'Asunto del problema' : 'Motivo / asunto'}
                      </h4>
                      <p style={{ fontWeight: 500, fontSize: '1.05rem', margin: 0 }}>
                        {detailItem.type === 'pendiente' ? detailItem.asunto : detailItem.motivo}
                      </p>
                    </div>

                    <div>
                      <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.3rem' }}>ID seguimiento</h4>
                      <p style={{ color: 'var(--text-primary)', margin: 0 }}>
                        {detailItem.type === 'pendiente'
                          ? `# TKT-${detailItem.id.substring(0, 8).toUpperCase()}`
                          : detailItem.ticket_id
                            ? `# TKT-${detailItem.ticket_id.substring(0, 8).toUpperCase()}`
                            : detailItem.id_legacy
                              ? `# LEG-${detailItem.id_legacy}`
                              : 'S/R'}
                      </p>
                    </div>

                    <div>
                      <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                        {detailItem.type === 'pendiente' ? 'Estado' : 'Fecha'}
                      </h4>
                      {detailItem.type === 'pendiente' ? (
                        <span
                          style={{
                            fontSize: '0.85rem',
                            background: 'rgba(255,150,0,0.2)',
                            color: '#ffb74d',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontWeight: 'bold',
                          }}
                        >
                          {detailItem.estado.replace('_', ' ').toUpperCase()}
                        </span>
                      ) : (
                        <p style={{ margin: 0 }}>
                          {detailItem.fecha_servicio || new Date(detailItem.creado_en).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    {equipment ? (
                      <div
                        style={{
                          gridColumn: '1 / -1',
                          background: 'rgba(255,255,255,0.03)',
                          padding: '1.2rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color)',
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '1rem',
                        }}
                      >
                        <div>
                          <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Detalles del cliente</h4>
                          <p style={{ margin: 0, fontWeight: 'bold', color: 'var(--text-primary)' }}>
                            {equipment.clientes?.razon_social || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Equipo involucrado</h4>
                          <p style={{ margin: 0, fontWeight: 'bold' }}>{equipment.numero_serie}</p>
                          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--primary-color)' }}>
                            {equipment.modelo ? `Modelo: ${equipment.modelo}` : 'Modelo generico'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          gridColumn: '1 / -1',
                          background: 'rgba(255,255,255,0.03)',
                          padding: '1.2rem',
                          borderRadius: '8px',
                          border: '1px dashed var(--border-color)',
                          textAlign: 'center',
                        }}
                      >
                        <p style={{ margin: 0, color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.9rem' }}>
                          Este ticket no tiene un equipo asignado o registrado, por lo tanto no hay informacion de cliente disponible.
                        </p>
                      </div>
                    )}

                    {detailItem.type === 'historico' && (
                      <>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <h4 style={{ color: 'var(--error-color)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                            Causa de la intervencion
                          </h4>
                          <p style={{ margin: 0, background: 'rgba(0,0,0,0.2)', padding: '0.8rem', borderRadius: '6px' }}>
                            [{detailItem.cda || 'T. LIBRE'}] {detailItem.averias_catalogo ? detailItem.averias_catalogo.detalle_averia : 'Sin detalle'}
                          </p>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <h4 style={{ color: 'var(--success-color)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                            Resolucion final
                          </h4>
                          <p style={{ margin: 0, background: 'rgba(0,0,0,0.2)', padding: '0.8rem', borderRadius: '6px' }}>
                            [{detailItem.cds || 'T. LIBRE'}] {detailItem.soluciones_catalogo ? detailItem.soluciones_catalogo.detalle_solucion : 'Sin detalle'}
                          </p>
                        </div>
                        {detailItem.servicios_refacciones && detailItem.servicios_refacciones.length > 0 && (
                          <div style={{ gridColumn: '1 / -1' }}>
                            <h4 style={{ color: 'var(--primary-color)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                              Refacciones empleadas
                            </h4>
                            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)' }}>
                              {detailItem.servicios_refacciones.map((item, index) => (
                                <li key={`${item.refacciones_catalogo?.codigo_refaccion || 'detalle'}-${index}`} style={{ marginBottom: '0.4rem' }}>
                                  <strong>x{item.cantidad}</strong> - [{item.refacciones_catalogo?.codigo_refaccion}] {item.refacciones_catalogo?.descripcion || 'Generica'}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}

                    {detailItem.type === 'pendiente' && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                          Descripcion emitida por el creador
                        </h4>
                        <p
                          style={{
                            margin: 0,
                            color: 'var(--text-primary)',
                            background: 'rgba(0,0,0,0.2)',
                            padding: '0.8rem',
                            borderRadius: '6px',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {stripPlaneacionMeta(detailItem.descripcion)}
                        </p>
                      </div>
                    )}

                    <div style={{ gridColumn: '1 / -1', marginTop: '1rem', textAlign: 'right' }}>
                      <button type="button" className="button-primary inactive" onClick={() => setDetailModalOpen(false)}>
                        Cerrar Vista
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
