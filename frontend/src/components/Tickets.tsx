import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import TravelPlannerModal from './TravelPlannerModal';
import FalconSlaAlerts, { type FalconSlaAlertEntry } from './FalconSlaAlerts';
import falconUploadIcon from '../assets/falcon-upload-icon.png';
import { splitServiceCatalog, type AveriaCatalogRow, type ServiceCatalogRow, type SolucionCatalogRow } from './serviceCatalog';
import { extractServiceReportTicketFromImage } from './serviceReportTicketOcr';
import {
  buildTicketDraftFromOcr,
  formatFalconScopeLabel,
  formatLocationLine,
  type FalconTicketSla,
  getFalconSlaTone,
  getFalconTicketSla,
  type TicketIntakeDraft,
} from './ticketIntake';
import useSecondTicker from './useSecondTicker';
import {
  extractPlaneacionMeta,
  stripPlaneacionMeta,
  type EquipmentSummary,
  type PendingServiceTicket,
  type PlanningMetadata,
  type ProfileSummary,
} from './servicesPlanning';
import './Tickets.css';

interface TicketRecord {
  id: string;
  user_id: string | null;
  asunto: string;
  descripcion: string | null;
  estado: string;
  creado_en: string;
  numero_serie_equipo?: string | null;
  nombre_cliente_guest?: string | null;
  telefono_cliente_guest?: string | null;
}

interface TicketFeedback {
  tone: 'success' | 'error' | 'info';
  message: string;
}

interface TicketRenderItem {
  ticket: TicketRecord;
  notification: ReturnType<typeof getTicketNotificationModel>;
  resolvedEquipment: EquipmentSummary | null;
  ticketClientLabel: string;
  ticketPhoneLabel: string;
  locationLabel: string;
  staticFalconSla: FalconTicketSla | null;
}

interface TrackedFalconTicketEntry {
  ticket: TicketRecord;
  equipment: EquipmentSummary | null;
  locationLabel: string;
}

const getRawTicketDescription = (description: string | null | undefined) => {
  if (!description) {
    return '';
  }

  const metadataIndex = description.indexOf('[METADATA_PLANEACION]');
  return metadataIndex >= 0 ? description.slice(0, metadataIndex).trim() : description.trim();
};

const normalizeComparableText = (value: string | null | undefined) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

const extractDescriptionField = (
  description: string | null | undefined,
  labelPrefixes: string[],
) => {
  const raw = getRawTicketDescription(description);
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const normalizedLine = normalizeComparableText(line);
    for (const label of labelPrefixes) {
      const normalizedLabel = normalizeComparableText(label);
      if (normalizedLine.startsWith(normalizedLabel)) {
        const value = line.slice(label.length).trim();
        if (value) {
          return value;
        }
      }
    }
  }

  return '';
};

const getClientSimilarityScore = (left: string, right: string) => {
  const leftNorm = normalizeComparableText(left);
  const rightNorm = normalizeComparableText(right);

  if (!leftNorm || !rightNorm) {
    return 0;
  }

  if (leftNorm === rightNorm) {
    return 3;
  }

  if (leftNorm.includes(rightNorm) || rightNorm.includes(leftNorm)) {
    return 2;
  }

  const leftTokens = new Set(leftNorm.split(/\s+/).filter(Boolean));
  const rightTokens = new Set(rightNorm.split(/\s+/).filter(Boolean));
  let tokenMatches = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      tokenMatches += 1;
    }
  });

  return tokenMatches;
};

const resolveTicketEquipment = (ticket: TicketRecord, equipmentCatalog: EquipmentSummary[]) => {
  if (!ticket.numero_serie_equipo) {
    return null;
  }

  const candidates = equipmentCatalog.filter(
    (equipment) => equipment.numero_serie === ticket.numero_serie_equipo,
  );

  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const clientHint = extractDescriptionField(ticket.descripcion, ['Cliente/Localidad:', 'Cliente:']);
  const sortedCandidates = [...candidates].sort((left, right) => {
    const rightScore = getClientSimilarityScore(clientHint, right.clientes?.razon_social || '');
    const leftScore = getClientSimilarityScore(clientHint, left.clientes?.razon_social || '');

    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    const rightPhone = right.clientes?.telefono ? 1 : 0;
    const leftPhone = left.clientes?.telefono ? 1 : 0;
    if (rightPhone !== leftPhone) {
      return rightPhone - leftPhone;
    }

    return 0;
  });

  return sortedCandidates[0];
};

const resolveTicketClientLabel = (ticket: TicketRecord, equipmentCatalog: EquipmentSummary[]) => {
  const guestClient = ticket.nombre_cliente_guest?.trim();
  if (guestClient) {
    return guestClient;
  }

  const descriptionClient = extractDescriptionField(ticket.descripcion, ['Cliente/Localidad:', 'Cliente:']);
  if (descriptionClient) {
    return descriptionClient;
  }

  return resolveTicketEquipment(ticket, equipmentCatalog)?.clientes?.razon_social || 'Cliente no especificado';
};

const resolveTicketPhoneLabel = (ticket: TicketRecord, equipmentCatalog: EquipmentSummary[]) => {
  const guestPhone = ticket.telefono_cliente_guest?.trim();
  if (guestPhone) {
    return guestPhone;
  }

  return resolveTicketEquipment(ticket, equipmentCatalog)?.clientes?.telefono || 'N/D';
};

const formatSupportStatus = (status: string) =>
  ({
    abierto: 'Abierto',
    pendiente_piezas: 'Pendiente por piezas',
    en_observacion: 'En observación',
    cerrado: 'Cerrado',
  })[status] || status.replaceAll('_', ' ');

const looksLikePlanningWeekRange = (value: string | null | undefined) =>
  /^\s*\d{1,2}\s+al\s+\d{1,2}\s+(enero|ene|febrero|feb|marzo|mar|abril|abr|mayo|may|junio|jun|julio|jul|agosto|ago|septiembre|sep|setiembre|octubre|oct|noviembre|nov|diciembre|dic)(?:\s+\d{2,4})?\s*$/i.test(
    (value || '').trim(),
  );

const getPlanningSummaryItems = (meta: PlanningMetadata) => {
  const items: Array<{ label: string; value: string }> = [];

  if (meta.fecha_acordada && !looksLikePlanningWeekRange(meta.fecha_acordada)) {
    items.push({ label: 'Fecha acordada', value: meta.fecha_acordada });
  } else if (meta.fecha_tentativa) {
    items.push({ label: 'Fecha tentativa', value: meta.fecha_tentativa });
  }

  if (meta.ingeniero_csv) {
    items.push({ label: 'Ingeniero asignado', value: meta.ingeniero_csv });
  }

  items.push({ label: 'Vuelo', value: meta.requiere_vuelos ? 'Requerido' : 'No requerido' });
  items.push({ label: 'Auto', value: meta.requiere_auto ? 'Requerido' : 'No requerido' });

  return items;
};

const getTicketNotificationModel = (ticket: TicketRecord) => {
  const meta = extractPlaneacionMeta(ticket.descripcion);
  const cleanDescription = stripPlaneacionMeta(ticket.descripcion).trim();
  const detailLines = cleanDescription
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    meta,
    cleanDescription,
    detailLines,
    planningSummaryItems: meta ? getPlanningSummaryItems(meta) : [],
  };
};

const LiveFalconTicketSlaPanel = React.memo(function LiveFalconTicketSlaPanel({
  ticket,
  equipment,
  locationLabel,
}: {
  ticket: TicketRecord;
  equipment: EquipmentSummary | null;
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
      style={{
        marginTop: '0.85rem',
        padding: '0.85rem 1rem',
        borderRadius: '12px',
        border: `1px solid ${ticketSlaTone.border}`,
        background: ticketSlaTone.background,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: '0.75rem 1rem',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
        <strong style={{ color: ticketSlaTone.color, fontSize: '0.95rem' }}>
          {ticketSla.statusLabel}
        </strong>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
          {locationLabel || 'Ubicación no identificada'} · vence {new Date(ticketSla.dueAtMs).toLocaleString('es-MX')}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', alignItems: 'flex-end' }}>
        <span style={{ color: ticketSlaTone.color, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {ticketSla.scopeLabel}
        </span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.76rem' }}>
          {ticketSla.severity === 'breached' ? 'Escalar inmediato' : 'Monitoreo automático activo'}
        </span>
      </div>
    </div>
  );
});

const TicketFalconAlertsBridge = React.memo(function TicketFalconAlertsBridge({
  contextLabel,
  entries,
}: {
  contextLabel: string;
  entries: TrackedFalconTicketEntry[];
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
});

export default function Tickets() {
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [asunto, setAsunto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [numeroSerie, setNumeroSerie] = useState('');
  const [tipoSoporte, setTipoSoporte] = useState<'Ingeniero' | 'Químico' | null>(null);
  const [nombreContacto, setNombreContacto] = useState('');
  const [telefonoContacto, setTelefonoContacto] = useState('');
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState('');
  const [ticketFeedback, setTicketFeedback] = useState<TicketFeedback | null>(null);
  const [draftReportCreatedAt, setDraftReportCreatedAt] = useState<string | null>(null);
  const [equiposDisponibles, setEquiposDisponibles] = useState<string[]>([]);
  const [equipmentCatalog, setEquipmentCatalog] = useState<EquipmentSummary[]>([]);
  const [engineerProfiles, setEngineerProfiles] = useState<ProfileSummary[]>([]);
  // Intelligent Closure Modal State
  const [cerrarModalOpen, setCerrarModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [averias, setAverias] = useState<AveriaCatalogRow[]>([]);
  const [soluciones, setSoluciones] = useState<SolucionCatalogRow[]>([]);
  const [refacciones, setRefacciones] = useState<any[]>([]);
  const [overrideFilter, setOverrideFilter] = useState(false);
  const [cerrarData, setCerrarData] = useState({
      no_serie: '',
      cda: '',
      cds: '',
      comentarios: '',
      refaccionesUsadas: [] as { codigo: string, cant: number }[]
  });
  const [travelPlannerOpen, setTravelPlannerOpen] = useState(false);
  const [travelPlannerRequestId, setTravelPlannerRequestId] = useState<string | null>(null);
  const [travelPlannerTicketId, setTravelPlannerTicketId] = useState<string | null>(null);
  const ticketImageInputRef = useRef<HTMLInputElement | null>(null);

  const fetchTickets = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('nombre_completo')
        .eq('id', user.id)
        .maybeSingle();

      const currentProfileName = normalizeComparableText(
        (profile?.nombre_completo as string | null | undefined) || user.user_metadata?.nombre_completo || user.email,
      );

      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .neq('estado', 'cerrado')
        .order('creado_en', { ascending: false });
      
      if (!error && data) {
        const visibleTickets = (data as TicketRecord[]).filter((ticket) => {
          const meta = extractPlaneacionMeta(ticket.descripcion);
          const assignedEngineerName = normalizeComparableText(meta?.ingeniero_csv);
          const belongsByUserId = ticket.user_id === user.id;
          const belongsByEngineerName = !!currentProfileName && assignedEngineerName === currentProfileName;

          if (meta) {
            return belongsByEngineerName || belongsByUserId;
          }

          return belongsByUserId;
        });

        setTickets(visibleTickets);
      }
    } else {
      setTickets([]);
    }
    setLoading(false);
  };

  const fetchCatalogs = async () => {
    const [{ data: eqs }, { data: catalogRows }, { data: refs }, { data: profiles }] = await Promise.all([
      supabase.from('equipos').select('*, clientes(id, razon_social, persona_contacto, telefono)'),
      supabase.from('catalogo_servicio').select('catalog_kind, catalog_code, catalog_type, catalog_detail, category_code'),
      supabase.from('refacciones_catalogo').select('*'),
      supabase.from('profiles').select('*'),
    ]);
    if (eqs) {
      setEquipmentCatalog(eqs as EquipmentSummary[]);
      setEquiposDisponibles(Array.from(new Set((eqs as EquipmentSummary[]).map((e) => e.numero_serie))));
    }
    if (catalogRows) {
      const { averias: nextAverias, soluciones: nextSoluciones } = splitServiceCatalog(catalogRows as ServiceCatalogRow[]);
      setAverias(nextAverias);
      setSoluciones(nextSoluciones);
    }
    if (refs) setRefacciones(refs);
    if (profiles) setEngineerProfiles(profiles as ProfileSummary[]);
  };

  useEffect(() => {
    fetchTickets();
    fetchCatalogs();
  }, []);

  const resetTicketForm = () => {
    setAsunto('');
    setDescripcion('');
    setNumeroSerie('');
    setNombreContacto('');
    setTelefonoContacto('');
    setTipoSoporte(null);
    setDraftReportCreatedAt(null);
  };

  const applyTicketDraft = (draft: TicketIntakeDraft) => {
    setAsunto(draft.asunto);
    setDescripcion(draft.descripcion);
    setNumeroSerie(draft.numeroSerie);
    setNombreContacto(draft.nombreContacto);
    setTelefonoContacto(draft.telefonoContacto);
    setTipoSoporte((current) => current || draft.tipoSoporte);
    setDraftReportCreatedAt(draft.reportCreatedAt);
  };

  const extractTicketDraftFromImage = async (imageFile: File) => {
    const ocrResult = await extractServiceReportTicketFromImage(imageFile, (progress, status) => {
      setOcrProgress(progress);
      setOcrStatus(status);
    });

    return buildTicketDraftFromOcr(ocrResult);
  };

  const createTicketRow = async (draft: TicketIntakeDraft, userId: string) => {
    const supportType = tipoSoporte || draft.tipoSoporte;
    const subject = supportType ? `[Soporte ${supportType}] ${draft.asunto}` : draft.asunto;
    const payload = {
      user_id: userId,
      asunto: subject,
      descripcion: draft.descripcion,
      numero_serie_equipo: draft.numeroSerie || null,
      nombre_cliente_guest: draft.nombreContacto || null,
      telefono_cliente_guest: draft.telefonoContacto || null,
      ...(draft.reportCreatedAt ? { creado_en: draft.reportCreatedAt } : {}),
    };

    const { error } = await supabase.from('tickets').insert([payload]);
    if (error) {
      throw error;
    }
  };

  const openTravelPlannerForTicket = (ticket: TicketRecord, meta: PlanningMetadata) => {
    setTravelPlannerRequestId(meta.travel_request_id || null);
    setTravelPlannerTicketId(ticket.id);
    setTravelPlannerOpen(true);
  };

  const closeTravelPlanner = () => {
    setTravelPlannerOpen(false);
    setTravelPlannerRequestId(null);
    setTravelPlannerTicketId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setTicketFeedback(null);
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      try {
        await createTicketRow(
          {
            asunto,
            descripcion,
            numeroSerie,
            nombreContacto,
            telefonoContacto,
            tipoSoporte: tipoSoporte || 'Ingeniero',
            specialClientCode: '',
            reportCreatedAt: draftReportCreatedAt,
          },
          user.id,
        );
        resetTicketForm();
        setTicketFeedback({ tone: 'success', message: 'Ticket levantado correctamente.' });
        fetchTickets();
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim()
            ? error.message
            : 'No se pudo crear el ticket. Revisa la conexión o el contenido capturado.';
        setTicketFeedback({ tone: 'error', message });
      }
    }
    setSubmitting(false);
  };

  const handleTicketImageSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const selectedFile = input.files?.[0] || null;
    input.value = '';

    if (!selectedFile) {
      return;
    }

    setTicketFeedback(null);
    setOcrBusy(true);
    setOcrProgress(0);
    setOcrStatus('Preparando captura');

    try {
      const draft = await extractTicketDraftFromImage(selectedFile);
      applyTicketDraft(draft);
      setTicketFeedback({
        tone: 'success',
        message: `Captura procesada: ${selectedFile.name}. Revisa el borrador y confirma el ticket.`,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : 'No fue posible leer la captura. Puedes seguir levantando el ticket manualmente.';
      setTicketFeedback({ tone: 'error', message });
    } finally {
      setOcrBusy(false);
      setOcrProgress(0);
      setOcrStatus('');
    }
  };

  const handleCerrarTicket = async (estadoAAsignar: string) => {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();

      const parsedCda = cerrarData.cda ? cerrarData.cda.split(' - ')[0].trim() : null;
      const parsedCds = cerrarData.cds ? cerrarData.cds.split(' - ')[0].trim() : null;
      
      // 1. Cerrar o Actualizar Ticket
      await supabase.from('tickets').update({ estado: estadoAAsignar }).eq('id', selectedTicket.id);

      // 2. Crear Servicio Historial
      const { data: servData, error: servErr } = await supabase.from('servicios_historial').insert({
          ticket_id: selectedTicket.id,
          no_serie: cerrarData.no_serie || selectedTicket.numero_serie_equipo || null,
          cda: parsedCda,
          cds: parsedCds,
          motivo: cerrarData.comentarios || selectedTicket.asunto,
          tecnico_id: user?.id
      }).select('id').single();

      if (!servErr && servData && cerrarData.refaccionesUsadas.length > 0) {
          // 3. Registrar refacciones usadas en puente
          const refPayload = cerrarData.refaccionesUsadas.filter(r => r.codigo.trim() !== '').map(r => ({
              servicio_id: servData.id,
              codigo_refaccion: r.codigo.split(' - ')[0].trim(),
              cantidad: r.cant
          }));
          if (refPayload.length > 0) {
             await supabase.from('servicios_refacciones').insert(refPayload);
          }
      }

      setSubmitting(false);
      setCerrarModalOpen(false);
      fetchTickets();
  };

  const generarPDFTicket = async () => {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text("ACTA DE REPORTE Y DIAGNOSTICO DE SERVICIO", 20, 20);
      doc.setFontSize(11);
      doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 20, 30);
      doc.text(`Asunto Reportado: ${selectedTicket.asunto}`, 20, 40);
      doc.text(`Número de Serie de Equipo: ${cerrarData.no_serie || 'N/D'}`, 20, 50);
      
      doc.text(`Diagnóstico/Avería: ${cerrarData.cda || 'No indicado'}`, 20, 70);
      doc.text(`Solución Aplicada: ${cerrarData.cds || 'No indicada'}`, 20, 80);
      
      doc.text(`Comentarios Especiales / Observaciones:`, 20, 100);
      doc.text(`${cerrarData.comentarios || 'Ninguno.'}`, 20, 110, { maxWidth: 170 });
      
      doc.text("Refacciones Utilizadas:", 20, 140);
      cerrarData.refaccionesUsadas.forEach((ru: any, idx: number) => {
          doc.text(`- [${ru.codigo.split(' - ')[0]}] x${ru.cant} -- ${ru.codigo.substring(0, 50)}...`, 25, 150 + (idx * 8));
      });

      doc.text(`Firma del Responsable / Jefe de Laboratorio`, 20, 240);
      doc.text(`_____________________________________`, 20, 245);
      
      doc.text(`Firma del Tecnico Especialista`, 120, 240);
      doc.text(`_____________________________`, 120, 245);
      
      doc.save(`Acta_Diangostico_${selectedTicket.id.substring(0,6)}.pdf`);
  };

  const plannedTickets = tickets.filter((ticket): ticket is PendingServiceTicket => Boolean(extractPlaneacionMeta(ticket.descripcion)));
  const ticketRenderItems = useMemo<TicketRenderItem[]>(
    () =>
      tickets.map((ticket) => {
        const notification = getTicketNotificationModel(ticket);
        const resolvedEquipment = resolveTicketEquipment(ticket, equipmentCatalog);
        const ticketClientLabel = resolveTicketClientLabel(ticket, equipmentCatalog);
        const ticketPhoneLabel = resolveTicketPhoneLabel(ticket, equipmentCatalog);
        const locationLabel = formatLocationLine(ticket, resolvedEquipment);
        const staticFalconSla = getFalconTicketSla(ticket, resolvedEquipment);

        return {
          ticket,
          notification,
          resolvedEquipment,
          ticketClientLabel,
          ticketPhoneLabel,
          locationLabel,
          staticFalconSla,
        };
      }),
    [equipmentCatalog, tickets],
  );
  const trackedFalconTickets = useMemo<TrackedFalconTicketEntry[]>(
    () =>
      ticketRenderItems
        .filter((item) => item.ticket.estado !== 'cerrado' && Boolean(item.staticFalconSla))
        .map((item) => ({
          ticket: item.ticket,
          equipment: item.resolvedEquipment,
          locationLabel: item.locationLabel,
        })),
    [ticketRenderItems],
  );

  return (
    <div className="tickets-shell">
      <div className="card" style={{ background: 'var(--bg-secondary)', border: 'none', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem', marginBottom: '0.35rem' }}>
          <h3 style={{ margin: 0 }}>Abrir un Nuevo Ticket</h3>
          {ocrBusy ? (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              {ocrStatus || `Procesando captura ${Math.round(ocrProgress * 100)}%`}
            </span>
          ) : null}
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' }}>
          {ticketFeedback ? (
            <div
              style={{
                padding: '0.9rem 1rem',
                borderRadius: '12px',
                border:
                  ticketFeedback.tone === 'error'
                    ? '1px solid rgba(244, 63, 94, 0.38)'
                    : ticketFeedback.tone === 'success'
                      ? '1px solid rgba(74, 222, 128, 0.3)'
                      : '1px solid rgba(56, 189, 248, 0.28)',
                background:
                  ticketFeedback.tone === 'error'
                    ? 'rgba(127, 29, 29, 0.24)'
                    : ticketFeedback.tone === 'success'
                      ? 'rgba(20, 83, 45, 0.2)'
                      : 'rgba(8, 47, 73, 0.24)',
                color:
                  ticketFeedback.tone === 'error'
                    ? '#ffd5dc'
                    : ticketFeedback.tone === 'success'
                      ? '#d8ffe7'
                      : '#d7f3ff',
                fontSize: '0.9rem',
              }}
            >
              {ticketFeedback.message}
            </div>
          ) : null}
          
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 1fr', gap: '1.5rem' }}>
              <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Tipo de Soporte a Asignar</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="button" className={`button-primary chip ${tipoSoporte === 'Ingeniero' ? '' : 'inactive'}`} style={{ flex: 1, padding: '0.6rem' }} onClick={() => setTipoSoporte('Ingeniero')}>🔧 ING</button>
                      <button type="button" className={`button-primary chip ${tipoSoporte === 'Químico' ? '' : 'inactive'}`} style={{ flex: 1, padding: '0.6rem' }} onClick={() => setTipoSoporte('Químico')}>🧪 QUÍM</button>
                  </div>
              </div>
              <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>N° Serie del Equipo *</label>
                  <input type="text" list="equipos-autocompletado" className="input-field" value={numeroSerie} onChange={(e) => setNumeroSerie(e.target.value)} required placeholder="Debe coincidir con la lista de Equipos..." />
                  <datalist id="equipos-autocompletado">
                      {equiposDisponibles.map(serie => (
                          <option key={serie} value={serie} />
                      ))}
                  </datalist>
              </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Nombre de Contacto Directo</label>
                <input type="text" className="input-field" value={nombreContacto} onChange={(e) => setNombreContacto(e.target.value)} placeholder="¿Quién es la persona interesada? (Opcional)" />
              </div>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Teléfono a Contactar</label>
                <input type="text" className="input-field" value={telefonoContacto} onChange={(e) => setTelefonoContacto(e.target.value)} placeholder="(Opcional)" />
              </div>
          </div>

          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Asunto breve del ticket *</label>
            <input type="text" className="input-field" value={asunto} onChange={(e) => setAsunto(e.target.value)} required placeholder="Describa el inconveniente central en 1 oración..." />
          </div>

          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Diagnóstico Prévio o Descripción del Problema *</label>
            <textarea className="input-field" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required rows={4} placeholder="Escriba los pormenores, antecedentes o mensajes de error reportados en el equipo..."></textarea>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem', width: '100%' }}>
            <button type="submit" className="button-primary" disabled={submitting} style={{ alignSelf: 'flex-start' }}>
              {submitting ? 'Procesando el envío...' : 'Levantar Nuevo Ticket Interno'}
            </button>
            <input
              ref={ticketImageInputRef}
              type="file"
              accept="image/*"
              disabled={ocrBusy || submitting}
              style={{ display: 'none' }}
              onChange={(event) => void handleTicketImageSelection(event)}
            />
            <button
              type="button"
              className="button-primary inactive"
              disabled={ocrBusy || submitting}
              onClick={() => ticketImageInputRef.current?.click()}
              title="Seleccionar y procesar captura externa"
              aria-label="Seleccionar y procesar captura externa"
              style={{
                marginLeft: 'auto',
                width: '46px',
                minWidth: '46px',
                height: '46px',
                padding: '0.22rem',
                borderRadius: '16px',
                border: '1px solid rgba(255, 60, 90, 0.4)',
                background: 'linear-gradient(180deg, rgba(255, 40, 70, 0.95), rgba(125, 0, 22, 0.92))',
                display: 'grid',
                placeItems: 'center',
                boxShadow: '0 14px 24px rgba(90, 0, 18, 0.24)',
              }}
            >
              <img
                src={falconUploadIcon}
                alt=""
                style={{ width: '22px', height: '30px', objectFit: 'contain', filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.24))' }}
              />
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ background: 'var(--bg-secondary)', border: 'none' }}>
        <h3 style={{ marginBottom: '1rem' }}>Mis Tickets de Soporte</h3>
      {loading ? (
        <p>Cargando tickets...</p>
      ) : tickets.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>No tienes tickets aún.</p>
      ) : (
        <ul className="tickets-list">
          {ticketRenderItems.map(({ ticket, notification, resolvedEquipment, ticketClientLabel, ticketPhoneLabel, locationLabel, staticFalconSla }) => {
              const isPlanningTicket = Boolean(notification.meta);
              const ticketSlaTone = staticFalconSla ? getFalconSlaTone(staticFalconSla.severity) : null;

              return (
                <li key={ticket.id} className="tickets-list-card">
                  <div className="tickets-list-card__header">
                    <div className="tickets-list-card__copy">
                      <strong className="tickets-list-card__title">{ticket.asunto}</strong>
                      <div className="tickets-list-card__chips">
                        {ticket.numero_serie_equipo && (
                          <span className="button-primary inactive chip tickets-list-card__chip">
                            Serie {ticket.numero_serie_equipo}
                          </span>
                        )}
                        <span className="button-primary inactive chip tickets-list-card__chip">
                          {ticketClientLabel}
                        </span>
                        <span className="button-primary inactive chip tickets-list-card__chip">
                          Tel. {ticketPhoneLabel}
                        </span>
                        {staticFalconSla && ticketSlaTone ? (
                          <span
                            className="button-primary inactive chip tickets-list-card__chip"
                            style={{
                              background: ticketSlaTone.background,
                              borderColor: ticketSlaTone.border,
                              color: ticketSlaTone.color,
                            }}
                          >
                            {formatFalconScopeLabel(staticFalconSla)}
                          </span>
                        ) : null}
                        {isPlanningTicket && (
                          <span className="button-primary inactive chip tickets-list-card__chip tickets-list-card__chip--planning">
                            Planeación detectada
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`tickets-list-card__status ${ticket.estado === 'abierto' ? 'tickets-list-card__status--open' : 'tickets-list-card__status--closed'}`}
                    >
                      {formatSupportStatus(ticket.estado)}
                    </span>
                  </div>

                  {staticFalconSla ? (
                    <LiveFalconTicketSlaPanel
                      ticket={ticket}
                      equipment={resolvedEquipment}
                      locationLabel={locationLabel}
                    />
                  ) : null}

                  {notification.cleanDescription && (
                    <div className="tickets-list-card__note">
                      <div className="tickets-list-card__note-label">Descripción reportada</div>
                      <div className="tickets-list-card__note-lines">
                        {notification.detailLines.length > 0 ? (
                          notification.detailLines.map((line, index) => (
                            <p key={`${ticket.id}-line-${index}`}>
                              {line}
                            </p>
                          ))
                        ) : (
                          <p>Sin descripción capturada.</p>
                        )}
                      </div>
                    </div>
                  )}

                  {notification.meta && (
                    <button
                      type="button"
                      onClick={() => openTravelPlannerForTicket(ticket, notification.meta as PlanningMetadata)}
                      className="tickets-list-card__ops"
                    >
                      <div className="tickets-list-card__ops-label">Notificación operativa</div>
                      <div className="tickets-list-card__ops-grid">
                        {notification.planningSummaryItems.map((item) => (
                          <div key={`${ticket.id}-${item.label}`} className="tickets-list-card__ops-item">
                            <span>{item.label}</span>
                            <strong>{item.value}</strong>
                          </div>
                        ))}
                      </div>
                      <div className="tickets-list-card__ops-cta">Clic para abrir la solicitud de viaje ligada a esta planeación.</div>
                    </button>
                  )}
              
                  {ticket.estado !== 'cerrado' && (
                      <div className="tickets-list-card__footer">
                          <button 
                             className="button-primary" 
                             style={{ width: '100%' }}
                             onClick={() => {
                                 setSelectedTicket(ticket);
                                 setCerrarData({
                                     no_serie: ticket.numero_serie_equipo || '', cda: '', cds: '', comentarios: '', refaccionesUsadas: []
                                 });
                                 setCerrarModalOpen(true);
                             }}
                          >
                             Diagnosticar y Cerrar Ticket
                          </button>
                      </div>
                  )}
                </li>
              );
          })}
        </ul>
      )}
      </div>

      {travelPlannerOpen && (
        <TravelPlannerModal
          isOpen={travelPlannerOpen}
          onClose={closeTravelPlanner}
          engineers={engineerProfiles}
          equipments={equipmentCatalog}
          plannedTickets={plannedTickets}
          initialTravelRequestId={travelPlannerRequestId}
          initialPlanningTicketId={travelPlannerTicketId}
          onSaved={fetchTickets}
        />
      )}

      <TicketFalconAlertsBridge contextLabel="Mis Tickets" entries={trackedFalconTickets} />

      {cerrarModalOpen && selectedTicket && createPortal(
        <div 
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem', backdropFilter: 'blur(5px)' }}
            onClick={() => setCerrarModalOpen(false)}
        >
            <div 
                className="card" 
                style={{ maxWidth: '700px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
                onClick={(e) => e.stopPropagation()}
            >
                <h3 style={{ color: 'var(--primary-color)' }}>Diagnóstico Inteligente de Servicio</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Asunto Original: {selectedTicket.asunto}</p>
                <hr style={{ margin: '1.5rem 0', borderColor: 'var(--border-color)' }}/>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>N° Serie de Equipo Afectado *</label>
                        <input 
                            type="text" list="equipos-autocompletado" className="input-field" 
                            value={cerrarData.no_serie} 
                            onChange={(e) => setCerrarData({...cerrarData, no_serie: e.target.value})} 
                            required placeholder="Debe coincidir con la BD"
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Diagnóstico / Avería * (Selec. de lista o escriba)</label>
                        <input 
                            list="averias-datalist"
                            type="text"
                            className="input-field" required
                            placeholder="Busque código de avería, o escriba libremente..."
                            value={cerrarData.cda}
                            onChange={(e) => {
                                setCerrarData({...cerrarData, cda: e.target.value, cds: ''});
                            }}
                            style={{ borderColor: 'var(--border-color)' }}
                        />
                        <datalist id="averias-datalist">
                            {averias.map(av => (
                                <option key={av.cda} value={`${av.cda} - ${av.detalle_averia}`}>{av.cda} - {av.detalle_averia} ({av.tipo_averia})</option>
                            ))}
                        </datalist>
                    </div>

                    {cerrarData.cda && (() => {
                        const parsedCdaLocal = cerrarData.cda.split(' - ')[0].trim();
                        const selectedAv = averias.find(a => a.cda === parsedCdaLocal);
                        
                        let solucionesCompatibles = (selectedAv && !overrideFilter) ? soluciones.filter(s => {
                            const groupAveria = selectedAv.cda ? selectedAv.cda.substring(0, 2) : '';
                            const groupSolucion = s.cds ? s.cds.substring(0, 2) : '';

                            if (groupAveria.length >= 2 && groupSolucion.length >= 2) {
                                return groupSolucion.charAt(1) === groupAveria.charAt(1);
                            }
                            
                            if (s.cts !== 'ND' && selectedAv.cta !== 'ND') {
                                return s.cts.charAt(1) === selectedAv.cta.charAt(1);
                            }
                            if (s.tipo_solucion !== 'Sin Tipo' && selectedAv.tipo_averia !== 'Sin Tipo') {
                                return s.tipo_solucion === selectedAv.tipo_averia;
                            }
                            return false;
                        }) : soluciones;

                        if (!selectedAv && !overrideFilter) solucionesCompatibles = soluciones;

                        return (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <label style={{ fontSize: '0.85rem', color: 'var(--primary-color)' }}>Solución Implementada * (Selec. o escriba)</label>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={overrideFilter} onChange={(e) => setOverrideFilter(e.target.checked)} />
                                        Forzar Filtro Abierto
                                    </label>
                                </div>
                                <input 
                                    list="soluciones-datalist"
                                    type="text"
                                    className="input-field" required
                                    value={cerrarData.cds}
                                    placeholder="Solución del catálogo o texto libre..."
                                    onChange={(e) => setCerrarData({...cerrarData, cds: e.target.value})}
                                    style={{ borderColor: 'var(--primary-color)' }}
                                />
                                <datalist id="soluciones-datalist">
                                    {solucionesCompatibles.map(sol => (
                                        <option key={sol.cds} value={`${sol.cds} - ${sol.detalle_solucion}`}>{sol.cds} - {sol.detalle_solucion}</option>
                                    ))}
                                </datalist>
                                {solucionesCompatibles.length === 0 && <span style={{ color: 'var(--error-color)', fontSize: '0.8rem' }}>No hay soluciones estrictamente compatibles registradas.</span>}
                            </div>
                        );
                    })()}

                    <hr style={{ margin: '0.5rem 0', borderColor: 'rgba(255,255,255,0.05)' }}/>

                    <div>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.8rem' }}>Refacciones Aplicadas (Opcional - Busque por ID)</label>
                        {cerrarData.refaccionesUsadas.map((ru, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                <input 
                                    type="text" list="refacciones-lista" className="input-field"
                                    value={ru.codigo} 
                                    onChange={(e) => {
                                        const nl = [...cerrarData.refaccionesUsadas];
                                        nl[idx].codigo = e.target.value;
                                        setCerrarData({...cerrarData, refaccionesUsadas: nl});
                                    }}
                                    placeholder="Código de Pieza (ej. 3010344)"
                                />
                                <input 
                                    type="number" className="input-field" style={{ width: '90px' }}
                                    value={ru.cant} min="1" title="Cantidad Usada"
                                    onChange={(e) => {
                                        const nl = [...cerrarData.refaccionesUsadas];
                                        nl[idx].cant = parseInt(e.target.value) || 1;
                                        setCerrarData({...cerrarData, refaccionesUsadas: nl});
                                    }}
                                />
                                <button type="button" className="button-primary" style={{ padding: '0 1rem', background: 'var(--error-color)', border: 'none' }} onClick={() => {
                                    const nl = [...cerrarData.refaccionesUsadas];
                                    nl.splice(idx, 1);
                                    setCerrarData({...cerrarData, refaccionesUsadas: nl});
                                }}>&times;</button>
                            </div>
                        ))}
                        <button type="button" className="button-primary chip inactive" style={{ fontSize: '0.8rem', padding: '0.4rem 1rem' }} onClick={() => {
                            setCerrarData({...cerrarData, refaccionesUsadas: [...cerrarData.refaccionesUsadas, { codigo: '', cant: 1 }]});
                        }}>
                           + Añadir Pieza Consumida
                        </button>
                        <datalist id="refacciones-lista">
                            {refacciones.map(r => <option key={r.codigo_refaccion} value={`${r.codigo_refaccion} - ${r.descripcion}`} />)}
                        </datalist>
                    </div>

                    <hr style={{ margin: '0.5rem 0', borderColor: 'rgba(255,255,255,0.05)' }}/>

                    <div>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Comentarios de Bitácora</label>
                        <textarea className="input-field" rows={4} value={cerrarData.comentarios} onChange={(e) => setCerrarData({...cerrarData, comentarios: e.target.value})} placeholder="Detalles extra sobre la reparación en la visita..."></textarea>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                        <button type="button" className="button-primary inactive" onClick={() => setCerrarModalOpen(false)}>Cancelar Vista</button>
                        
                        <button type="button" className="button-primary" style={{ background: 'var(--text-secondary)', color: 'var(--bg-color)', border: 'none' }} onClick={generarPDFTicket}>
                            ⬇️ Descargar Acta PDF
                        </button>

                        <button 
                            type="button" className="button-primary" 
                            style={{ background: 'rgba(255, 150, 0, 0.2)', color: '#ffb74d', borderColor: '#ffb74d' }} 
                            disabled={!cerrarData.no_serie || submitting} 
                            onClick={() => handleCerrarTicket('pendiente_piezas')}
                        >
                            Pausar (Faltan Piezas)
                        </button>
                        
                        <button 
                            type="button" className="button-primary" 
                            style={{ background: 'rgba(255, 150, 0, 0.2)', color: '#ffb74d', borderColor: '#ffb74d' }} 
                            disabled={!cerrarData.no_serie || submitting} 
                            onClick={() => handleCerrarTicket('en_observacion')}
                        >
                            Pausar (En Observación)
                        </button>

                        <button 
                            type="button" className="button-primary" 
                            disabled={!cerrarData.no_serie || !cerrarData.cda || !cerrarData.cds || submitting} 
                            onClick={() => handleCerrarTicket('cerrado')}
                        >
                            {submitting ? 'Archivando base de datos...' : 'Finalizar y Archivar Servicio'}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
      )}
    </div>
  );
}
