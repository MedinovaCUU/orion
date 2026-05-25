import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import './TravelPlannerModal.css';
import BrandLockup from './BrandLockup';
import {
  extractPlaneacionMeta,
  METADATA_DELIMITER,
  stripPlaneacionMeta,
  type EquipmentSummary,
  type PendingServiceTicket,
  type ProfileSummary,
} from './servicesPlanning';
import {
  getTravelRequestEmailDisabledMessage,
  isTravelRequestEmailEnabled,
  sendTravelRequestEmail,
} from './travelEmailApi';
import {
  fetchBookingOptions,
  getFlightSearchDisabledMessage,
  isFlightSearchEnabled,
  searchLiveFlights,
  searchReturnFlights,
} from './travelSearchApi';
import {
  buildFlightSearchSessionPayload,
  buildStatusHistoryPayload,
  buildTravelSummary,
  buildInitialValuesFromPlannedTicket,
  createEmptyTravelForm,
  createOfferSnapshotPayload,
  createRequestPayload,
  defaultTravelPolicy,
  findOfferById,
  formatDisplayDateTime,
  formatDuration,
  getAssignedPlannedTicketCandidates,
  getAirportOptionsByCity,
  getAirportByCode,
  getFlightProviderLabel,
  getKnownCities,
  getSelectionRequirementErrors,
  getServiceWindowCompatibilityNote,
  getPriorityBadge,
  getRequestInitialValues,
  getStatusLabel,
  hydrateFormFromSelections,
  isSimulatedFlightProvider,
  resolveOperationalCity,
  resolveServiceReference,
  findNearbyPlannedPreventive,
  resolveTravelRequestId,
  sortFlightOffers,
  type FlightLeg,
  type FlightOffer,
  type FlightSearchSession,
  type FlightSelections,
  type FlightSortMode,
  type TravelFormData,
  type TravelWorkflowStatus,
  validateTravelForm,
} from './travelPlanner';

interface TravelPlannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  engineers: ProfileSummary[];
  equipments: EquipmentSummary[];
  plannedTickets: PendingServiceTicket[];
  initialTravelRequestId?: string | null;
  initialPlanningTicketId?: string | null;
  initialFormSeed?: Partial<TravelFormData> | null;
  disableAutoRecover?: boolean;
  onSaved?: () => void;
}

type PlannerStep = 'request' | 'search' | 'selection' | 'summary';
type FeedbackTone = 'error' | 'success' | 'info';

interface ModalAlert {
  title: string;
  messages: string[];
  tone: FeedbackTone;
}

const STEP_ITEMS: Array<{ id: PlannerStep; title: string; description: string }> = [
  {
    id: 'request',
    title: 'Solicitud',
    description: 'Captura contexto de servicio, viaje y datos de sitio.',
  },
  {
    id: 'search',
    title: 'Busqueda',
    description: 'Consulta opciones, score operativo y riesgos.',
  },
  {
    id: 'selection',
    title: 'Seleccion',
    description: 'Define opcion preferida, respaldo y mensaje para reserva.',
  },
  {
    id: 'summary',
    title: 'Solicitud lista',
    description: 'Genera resumen, copia, exporta y envia para compra.',
  },
];

const EMPTY_SELECTIONS: FlightSelections = {
  preferredOutboundId: '',
  backupOutboundId: '',
  preferredReturnId: '',
  backupReturnId: '',
  adminMessage: '',
};

const AUTO_PLANNED_JUSTIFICATION = 'Mantenimiento Preventivo Planeado por Coordinacion';

const sortLabels: Record<FlightSortMode, string> = {
  cheapest: 'Mas barato',
  fastest: 'Mas rapido',
  fewest_stops: 'Menos escalas',
  earliest: 'Mas temprano',
  most_convenient: 'Mas conveniente',
};

const statusColor = (status: TravelWorkflowStatus) => {
  if (status === 'reservado') return '#00e676';
  if (status === 'solicitud_enviada') return '#80cbc4';
  if (status === 'requiere_cambios') return '#ffb74d';
  if (status === 'rechazado' || status === 'cancelado') return '#ff6b6b';
  return '#b3b8c2';
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (error && typeof error === 'object') {
    const candidate = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [candidate.message, candidate.details, candidate.hint]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

    if (parts.length > 0) {
      return parts.join(' | ');
    }

    if (typeof candidate.code === 'string' && candidate.code.trim()) {
      return `${fallback} (${candidate.code})`;
    }
  }

  return fallback;
};

export default function TravelPlannerModal({
  isOpen,
  onClose,
  engineers,
  equipments,
  plannedTickets,
  initialTravelRequestId = null,
  initialPlanningTicketId = null,
  initialFormSeed = null,
  disableAutoRecover = false,
  onSaved,
}: TravelPlannerModalProps) {
  const [step, setStep] = useState<PlannerStep>('request');
  const [formData, setFormData] = useState<TravelFormData>(createEmptyTravelForm());
  const [searchSession, setSearchSession] = useState<FlightSearchSession | null>(null);
  const [outboundSort, setOutboundSort] = useState<FlightSortMode>('most_convenient');
  const [returnSort, setReturnSort] = useState<FlightSortMode>('most_convenient');
  const [selections, setSelections] = useState<FlightSelections>(EMPTY_SELECTIONS);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: FeedbackTone; message: string } | null>(null);
  const [modalAlert, setModalAlert] = useState<ModalAlert | null>(null);
  const [, setValidationErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingReturnOptions, setLoadingReturnOptions] = useState(false);
  const [returnSearchIssue, setReturnSearchIssue] = useState<string | null>(null);
  const [resolvingOfferIds, setResolvingOfferIds] = useState<string[]>([]);
  const [draftStatus, setDraftStatus] = useState<TravelWorkflowStatus>('borrador');
  const searchRequestSequence = useRef(0);
  const returnSearchRequestSequence = useRef(0);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    const initialize = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) {
        return;
      }

      const defaultEngineer = engineers.find((engineer) => engineer.id === user?.id) || engineers[0];
      const assignedCandidates = getAssignedPlannedTicketCandidates(plannedTickets, defaultEngineer);
      const recoverableStatuses: TravelWorkflowStatus[] = [
        'borrador',
        'buscando_vuelo',
        'vuelo_seleccionado',
        'requiere_cambios',
      ];
      const hasExplicitTarget = Boolean(initialTravelRequestId || initialPlanningTicketId || initialFormSeed);
      const loadLinkedRequest = async (linkedRequestId: string, allowAnyStatus = false) => {
        const { data: linkedRequest, error } = await supabase
          .from('travel_requests')
          .select('id, workflow_status, service_ticket_id, request_payload, request_snapshot')
          .eq('id', linkedRequestId)
          .maybeSingle();

        if (cancelled) {
          return null;
        }

        const linkedStatus = linkedRequest?.workflow_status as TravelWorkflowStatus | undefined;
        if (
          error ||
          !linkedRequest ||
          !linkedStatus ||
          (!allowAnyStatus && !recoverableStatuses.includes(linkedStatus))
        ) {
          return null;
        }

        const storedForm = (linkedRequest.request_payload as { form?: TravelFormData } | null)?.form;
        const restoredSelections = {
          ...EMPTY_SELECTIONS,
          ...(((linkedRequest.request_snapshot as { selections?: FlightSelections } | null)?.selections ||
            (linkedRequest.request_payload as { selections?: FlightSelections } | null)?.selections ||
            {}) as Partial<FlightSelections>),
        };
        const restoredSession =
          ((linkedRequest.request_snapshot as
            | { searchSession?: FlightSearchSession | null; session?: FlightSearchSession | null }
            | null)?.searchSession ||
            (linkedRequest.request_snapshot as
              | { searchSession?: FlightSearchSession | null; session?: FlightSearchSession | null }
              | null)?.session ||
            (linkedRequest.request_payload as { searchSession?: FlightSearchSession | null } | null)?.searchSession ||
            null) as FlightSearchSession | null;
        const restoredForm: TravelFormData = {
          ...createEmptyTravelForm(),
          ...(storedForm || {}),
          clientId: storedForm?.clientId ?? null,
          serviceTicketId: storedForm?.serviceTicketId || ((linkedRequest.service_ticket_id as string | null) || ''),
        };
        const restoredStep: PlannerStep =
          linkedStatus === 'buscando_vuelo' && restoredSession
            ? 'search'
            : linkedStatus === 'vuelo_seleccionado' && restoredSession
              ? 'selection'
              : allowAnyStatus && linkedStatus !== 'borrador'
                ? 'summary'
                : 'request';

        return {
          form: restoredForm,
          selections: restoredSelections,
          session: restoredSession,
          requestId: linkedRequest.id as string,
          status: linkedStatus,
          step: restoredStep,
        };
      };

      let restoredForm: TravelFormData = getRequestInitialValues(engineers, equipments, plannedTickets, user?.id);
      let restoredStep: PlannerStep = 'request';
      let restoredSession: FlightSearchSession | null = null;
      let restoredSelections = EMPTY_SELECTIONS;
      let restoredRequestId: string | null = null;
      let restoredStatus: TravelWorkflowStatus = 'borrador';
      let restoredFeedback: { tone: FeedbackTone; message: string } | null = null;
      const explicitPlanningTicket = initialPlanningTicketId
        ? plannedTickets.find((ticket) => ticket.id === initialPlanningTicketId) || null
        : null;

      if (initialTravelRequestId) {
        const explicitlyRequestedState = await loadLinkedRequest(initialTravelRequestId, true);
        if (cancelled) {
          return;
        }

        if (explicitlyRequestedState) {
          restoredForm = explicitlyRequestedState.form;
          restoredSelections = explicitlyRequestedState.selections;
          restoredSession = explicitlyRequestedState.session;
          restoredRequestId = explicitlyRequestedState.requestId;
          restoredStatus = explicitlyRequestedState.status;
          restoredStep = explicitlyRequestedState.step;
          restoredFeedback = {
            tone: 'info',
            message:
              restoredStatus === 'borrador'
                ? 'Se recupero el Borrador Solicitud ligado a la planeacion.'
                : 'Se abrio la solicitud de viaje ligada a la planeacion.',
          };
        }
      }

      if (!restoredRequestId && explicitPlanningTicket) {
        const explicitLinkedRequestId = extractPlaneacionMeta(explicitPlanningTicket.descripcion)?.travel_request_id;
        if (explicitLinkedRequestId) {
          const explicitlyLinkedState = await loadLinkedRequest(explicitLinkedRequestId, true);
          if (cancelled) {
            return;
          }

          if (explicitlyLinkedState) {
            restoredForm = explicitlyLinkedState.form;
            restoredSelections = explicitlyLinkedState.selections;
            restoredSession = explicitlyLinkedState.session;
            restoredRequestId = explicitlyLinkedState.requestId;
            restoredStatus = explicitlyLinkedState.status;
            restoredStep = explicitlyLinkedState.step;
            restoredFeedback = {
              tone: 'info',
              message:
                restoredStatus === 'borrador'
                  ? 'Se recupero el Borrador Solicitud ligado a la planeacion.'
                  : 'Se abrio la solicitud de viaje ligada a la planeacion.',
            };
          }
        }
      }

      if (!restoredRequestId && explicitPlanningTicket) {
        restoredForm = buildInitialValuesFromPlannedTicket(explicitPlanningTicket, defaultEngineer, equipments);
        restoredSelections = EMPTY_SELECTIONS;
        restoredSession = null;
        restoredStatus = 'borrador';
        restoredStep = 'request';
        restoredRequestId = null;
        if (!restoredFeedback) {
          restoredFeedback = {
            tone: 'info',
            message: `Se cargo la planeacion ${explicitPlanningTicket.id.substring(0, 8).toUpperCase()} para preparar la solicitud de viaje.`,
          };
        }
      }

      if (!restoredRequestId && initialFormSeed) {
        restoredForm = {
          ...restoredForm,
          ...initialFormSeed,
          clientId: initialFormSeed.clientId ?? restoredForm.clientId,
        };
        restoredSelections = EMPTY_SELECTIONS;
        restoredSession = null;
        restoredStatus = 'borrador';
        restoredStep = 'request';
        restoredRequestId = null;
        restoredFeedback = {
          tone: 'info',
          message: 'Se cargo el contexto operativo desde el reporte para preparar la solicitud de viaje.',
        };
      }

      if (!hasExplicitTarget && !disableAutoRecover && !restoredRequestId) {
        for (const candidate of assignedCandidates) {
          const linkedRequestId = candidate.meta.travel_request_id;
          if (!linkedRequestId) {
            continue;
          }

          const recoveredState = await loadLinkedRequest(linkedRequestId);
          if (cancelled) {
            return;
          }

          if (!recoveredState) {
            continue;
          }

          restoredForm = recoveredState.form;
          restoredSelections = recoveredState.selections;
          restoredSession = recoveredState.session;
          restoredRequestId = recoveredState.requestId;
          restoredStatus = recoveredState.status;
          restoredStep = recoveredState.step;
          restoredFeedback = {
            tone: 'info',
            message: `Se recupero un borrador vinculado a la planeacion ${candidate.ticket.id.substring(0, 8).toUpperCase()}.`,
          };
          break;
        }
      }

      setStep(restoredStep);
      setSearchSession(restoredSession);
      setSelections(restoredSelections);
      setRequestId(restoredRequestId);
      setFeedback(restoredFeedback);
      setModalAlert(null);
      setValidationErrors([]);
      setLoadingReturnOptions(false);
      setResolvingOfferIds([]);
      setDraftStatus(restoredStatus);
      setFormData(restoredForm);
    };

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [
    disableAutoRecover,
    equipments,
    engineers,
    initialFormSeed,
    initialPlanningTicketId,
    initialTravelRequestId,
    isOpen,
    plannedTickets,
  ]);

  const visibleSteps = useMemo(
    () => STEP_ITEMS.filter((item) => formData.requiresFlight || (item.id !== 'search' && item.id !== 'selection')),
    [formData.requiresFlight],
  );

  useEffect(() => {
    if (!modalAlert) {
      return;
    }

    const duration = Math.min(8500, 3000 + Math.max(0, modalAlert.messages.length - 1) * 1400);
    const timeout = window.setTimeout(() => {
      setModalAlert(null);
    }, duration);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [modalAlert]);

  const engineerOptions = useMemo(
    () =>
      engineers.map((engineer) => ({
        value: engineer.id,
        label: engineer.nombre_completo || 'Ingeniero sin nombre',
      })),
    [engineers],
  );

  const equipmentOptions = useMemo(
    () =>
      equipments.map((equipment) => ({
        value: equipment.numero_serie,
        label: `${equipment.numero_serie} ${equipment.modelo ? `| ${equipment.modelo}` : ''} ${
          equipment.clientes?.razon_social ? `| ${equipment.clientes.razon_social}` : ''
        }`.trim(),
      })),
    [equipments],
  );

  const matchedEquipment = useMemo(() => {
    const normalizedSerial = formData.equipmentSerial.trim().toUpperCase();
    if (!normalizedSerial) {
      return undefined;
    }

    return equipments.find((equipment) => equipment.numero_serie.trim().toUpperCase() === normalizedSerial);
  }, [equipments, formData.equipmentSerial]);

  const originAirportOptions = useMemo(
    () => getAirportOptionsByCity(formData.originCity),
    [formData.originCity],
  );

  const destinationAirportOptions = useMemo(
    () => getAirportOptionsByCity(formData.destinationCity),
    [formData.destinationCity],
  );

  const knownCities = useMemo(() => getKnownCities(), []);

  const matchedPlannedPreventive = useMemo(
    () => findNearbyPlannedPreventive(formData, plannedTickets),
    [formData, plannedTickets],
  );

  const resolvedServiceReference = useMemo(() => resolveServiceReference(formData), [formData]);

  const selectionRequirementErrors = useMemo(
    () => getSelectionRequirementErrors(formData, selections),
    [formData, selections],
  );

  const sortedOutbound = searchSession ? sortFlightOffers(searchSession.outbound, outboundSort) : [];
  const sortedReturn =
    searchSession && formData.tripType === 'redondo'
      ? sortFlightOffers(searchSession.inbound, returnSort)
      : [];

  const preferredOutbound = findOfferById(searchSession, selections.preferredOutboundId);
  const backupOutbound = findOfferById(searchSession, selections.backupOutboundId);
  const preferredReturn = findOfferById(searchSession, selections.preferredReturnId);
  const backupReturn = findOfferById(searchSession, selections.backupReturnId);
  const returnContextOffer = findOfferById(searchSession, searchSession?.returnContextOfferId || '');

  const summaryBlockingErrors = useMemo(() => {
    if (!formData.requiresFlight) {
      return [] as string[];
    }

    const errors: string[] = [];

    if (!searchSession) {
      errors.push(
        'Falta una busqueda de vuelos activa. Ejecuta la busqueda otra vez o reabre un borrador que conserve la sesion.',
      );
      return errors;
    }

    errors.push(...selectionRequirementErrors);

    if (selections.preferredOutboundId && !preferredOutbound) {
      errors.push('La opcion preferida de ida ya no existe en la sesion actual. Vuelve a seleccionarla.');
    }

    if (selections.backupOutboundId && !backupOutbound) {
      errors.push('La opcion de respaldo de ida ya no existe en la sesion actual. Vuelve a seleccionarla.');
    }

    if (formData.tripType === 'redondo' && selections.preferredReturnId && !preferredReturn) {
      errors.push('La opcion preferida de regreso ya no existe en la sesion actual. Vuelve a seleccionarla.');
    }

    if (formData.tripType === 'redondo' && selections.backupReturnId && !backupReturn) {
      errors.push('La opcion de respaldo de regreso ya no existe en la sesion actual. Vuelve a seleccionarla.');
    }

    return [...new Set(errors)];
  }, [
    backupOutbound,
    backupReturn,
    formData.requiresFlight,
    formData.tripType,
    preferredOutbound,
    preferredReturn,
    searchSession,
    selectionRequirementErrors,
    selections.backupOutboundId,
    selections.backupReturnId,
    selections.preferredOutboundId,
    selections.preferredReturnId,
  ]);

  const summary = useMemo(() => {
    if (summaryBlockingErrors.length > 0) {
      return null;
    }

    return buildTravelSummary(formData, searchSession, selections);
  }, [formData, searchSession, selections, summaryBlockingErrors]);

  useEffect(() => {
    if (!formData.requiresFlight && (step === 'search' || step === 'selection')) {
      setStep('request');
    }
  }, [formData.requiresFlight, step]);

  useEffect(() => {
    if (!formData.requiresCar) {
      return;
    }

    setFormData((current) => {
      let changed = false;
      const next = { ...current };

      const destinationAirport = current.destinationAirport ? getAirportByCode(current.destinationAirport) : null;
      const defaultPickupLocation =
        destinationAirport && current.requiresFlight
          ? `${destinationAirport.code} | ${destinationAirport.airport}`
          : current.destinationCity || current.siteAddress;
      const defaultDropoffLocation = defaultPickupLocation || current.originCity || current.siteAddress;
      const defaultRoute = [current.destinationCity, current.siteAddress].filter(Boolean).join(' | ');

      if (!next.carPickupLocation && defaultPickupLocation) {
        next.carPickupLocation = defaultPickupLocation;
        changed = true;
      }
      if (!next.carDropoffLocation && defaultDropoffLocation) {
        next.carDropoffLocation = defaultDropoffLocation;
        changed = true;
      }
      if (!next.carPickupDate && current.departureDate) {
        next.carPickupDate = current.departureDate;
        changed = true;
      }
      if (!next.carDropoffDate) {
        const candidateDropoffDate =
          (current.tripType === 'redondo' ? current.returnDate : '') || current.serviceEndDate || current.departureDate;
        if (candidateDropoffDate) {
          next.carDropoffDate = candidateDropoffDate;
          changed = true;
        }
      }
      if (!next.carPickupTime && current.serviceStartTime) {
        next.carPickupTime = current.serviceStartTime;
        changed = true;
      }
      if (!next.carDropoffTime && current.serviceEndTime) {
        next.carDropoffTime = current.serviceEndTime;
        changed = true;
      }
      if (!next.carRouteDescription && defaultRoute) {
        next.carRouteDescription = defaultRoute;
        changed = true;
      }

      return changed ? next : current;
    });
  }, [
    formData.departureDate,
    formData.destinationAirport,
    formData.destinationCity,
    formData.originCity,
    formData.requiresCar,
    formData.requiresFlight,
    formData.returnDate,
    formData.serviceEndDate,
    formData.serviceEndTime,
    formData.serviceStartTime,
    formData.siteAddress,
    formData.tripType,
  ]);

  useEffect(() => {
    if (!formData.requiresFlight) {
      if (formData.tripType === 'solo_ida' && formData.returnDate) {
        updateFormField('returnDate', '');
      }
      return;
    }

    if (originAirportOptions.length === 1 && formData.originAirport !== originAirportOptions[0].code) {
      updateFormField('originAirport', originAirportOptions[0].code);
      return;
    }

    if (
      originAirportOptions.length > 1 &&
      formData.originAirport &&
      !originAirportOptions.some((option) => option.code === formData.originAirport)
    ) {
      updateFormField('originAirport', '');
    }
  }, [formData.originAirport, formData.originCity, formData.requiresFlight, formData.returnDate, formData.tripType, originAirportOptions]);

  useEffect(() => {
    if (!formData.requiresFlight) {
      return;
    }

    if (destinationAirportOptions.length === 1 && formData.destinationAirport !== destinationAirportOptions[0].code) {
      updateFormField('destinationAirport', destinationAirportOptions[0].code);
      return;
    }

    if (
      destinationAirportOptions.length > 1 &&
      formData.destinationAirport &&
      !destinationAirportOptions.some((option) => option.code === formData.destinationAirport)
    ) {
      updateFormField('destinationAirport', '');
    }
  }, [destinationAirportOptions, formData.destinationAirport, formData.destinationCity, formData.requiresFlight]);

  useEffect(() => {
    if (!matchedPlannedPreventive) {
      return;
    }

    setFormData((current) => {
      if (current.serviceType !== 'preventivo') {
        return current;
      }

      if (current.justification.trim() && current.justification !== AUTO_PLANNED_JUSTIFICATION) {
        return current;
      }

      return {
        ...current,
        justification: AUTO_PLANNED_JUSTIFICATION,
      };
    });
  }, [matchedPlannedPreventive]);

  const updateFormField = <K extends keyof TravelFormData>(field: K, value: TravelFormData[K]) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const normalizeCityField = (field: 'originCity' | 'destinationCity', rawValue: string) => {
    const canonicalCity = resolveOperationalCity(rawValue);
    if (canonicalCity && canonicalCity !== rawValue) {
      updateFormField(field, canonicalCity);
    }
  };

  const showModalAlert = (tone: FeedbackTone, title: string, messages: string[]) => {
    setFeedback(null);
    setModalAlert({
      tone,
      title,
      messages,
    });
  };

  const syncLinkedPlanningTicket = async (travelRequestId: string, travelStatus: TravelWorkflowStatus) => {
    if (!formData.serviceTicketId) {
      return;
    }

    const cachedTicket = plannedTickets.find((ticket) => ticket.id === formData.serviceTicketId);
    let currentDescription = cachedTicket?.descripcion || '';

    if (!cachedTicket) {
      const { data, error } = await supabase
        .from('tickets')
        .select('descripcion')
        .eq('id', formData.serviceTicketId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      currentDescription = data?.descripcion || '';
    }

    const currentMeta = extractPlaneacionMeta(currentDescription) || {};
    const cleanDescription = stripPlaneacionMeta(currentDescription).trim();
    const nextMeta = {
      ...currentMeta,
      travel_request_id: travelRequestId,
      travel_status: travelStatus,
      travel_priority: formData.priority,
    };
    const nextDescription = cleanDescription
      ? `${cleanDescription}\n\n${METADATA_DELIMITER} ${JSON.stringify(nextMeta)}`
      : `${METADATA_DELIMITER} ${JSON.stringify(nextMeta)}`;

    const { error } = await supabase
      .from('tickets')
      .update({ descripcion: nextDescription })
      .eq('id', formData.serviceTicketId);

    if (error) {
      throw error;
    }
  };

  const fetchLatestSiteContact = async (serial: string) => {
    if (!serial) {
      return;
    }

    const { data, error } = await supabase
      .from('tickets')
      .select('nombre_cliente_guest, telefono_cliente_guest')
      .eq('numero_serie_equipo', serial)
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return;
    }

    setFormData((current) => ({
      ...current,
      siteContact: data.nombre_cliente_guest || current.siteContact,
      sitePhone: data.telefono_cliente_guest || current.sitePhone,
    }));
  };

  const syncEngineer = (engineerId: string) => {
    const engineer = engineers.find((candidate) => candidate.id === engineerId);
    setFormData((current) =>
      hydrateFormFromSelections(current, engineer, equipments.find((item) => item.numero_serie === current.equipmentSerial)),
    );
  };

  const syncEquipment = (serial: string) => {
    const normalizedSerial = serial.trim().toUpperCase();
    const equipment = equipments.find((candidate) => candidate.numero_serie.trim().toUpperCase() === normalizedSerial);
    if (!equipment) {
      return;
    }

    setFormData((current) =>
      hydrateFormFromSelections(
        current,
        engineers.find((item) => item.id === current.engineerId),
        equipment,
      ),
    );
    void fetchLatestSiteContact(equipment.numero_serie);
  };

  useEffect(() => {
    if (!matchedEquipment || (formData.siteContact && formData.sitePhone)) {
      return;
    }

    void fetchLatestSiteContact(matchedEquipment.numero_serie);
  }, [formData.siteContact, formData.sitePhone, matchedEquipment]);

  const updateOfferInSession = (
    offerId: string,
    updater: (offer: FlightOffer) => FlightOffer,
  ) => {
    setSearchSession((current) => {
      if (!current) {
        return current;
      }

      const updateLeg = (offers: FlightOffer[]) =>
        offers.map((offer) => (offer.id === offerId ? updater(offer) : offer));

      return {
        ...current,
        outbound: updateLeg(current.outbound),
        inbound: updateLeg(current.inbound),
      };
    });
  };

  const markOfferResolving = (offerId: string, resolving: boolean) => {
    setResolvingOfferIds((current) =>
      resolving ? [...new Set([...current, offerId])] : current.filter((item) => item !== offerId),
    );
  };

  const resolveBookingForOffer = async (offer: FlightOffer) => {
    if (!offer.bookingToken || (offer.bookingOptions && offer.bookingOptions.length > 0)) {
      return;
    }

    markOfferResolving(offer.id, true);

    try {
      const bookingOptions = await fetchBookingOptions(offer.bookingToken, formData);
      updateOfferInSession(offer.id, (current) => ({
        ...current,
        bookingOptions,
        selectedBookingOption: bookingOptions[0] || null,
        deeplink: bookingOptions[0]?.url || current.deeplink,
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No fue posible obtener opciones de reserva para el vuelo elegido.';
      setFeedback({ tone: 'info', message });
    } finally {
      markOfferResolving(offer.id, false);
    }
  };

  const computeNextSelections = (
    current: FlightSelections,
    leg: FlightLeg,
    role: 'preferred' | 'backup',
    offerId: string,
  ) => {
    if (leg === 'outbound') {
      return {
        ...current,
        preferredOutboundId:
          role === 'preferred' ? offerId : current.preferredOutboundId === offerId ? '' : current.preferredOutboundId,
        backupOutboundId:
          role === 'backup' ? offerId : current.backupOutboundId === offerId ? '' : current.backupOutboundId,
      };
    }

    return {
      ...current,
      preferredReturnId:
        role === 'preferred' ? offerId : current.preferredReturnId === offerId ? '' : current.preferredReturnId,
      backupReturnId: role === 'backup' ? offerId : current.backupReturnId === offerId ? '' : current.backupReturnId,
    };
  };

  const loadReturnOptionsForOutbound = async (offer: FlightOffer | null) => {
    if (!searchSession) {
      return;
    }

    const requestSequence = ++returnSearchRequestSequence.current;

    if (!offer?.departureToken) {
      setSearchSession((current) =>
        current
          ? {
              ...current,
              inbound: [],
              returnContextOfferId: offer?.id || '',
              returnContextDepartureToken: '',
            }
          : current,
      );
      const message = 'La salida elegida no devolvio un token valido para consultar regresos compatibles.';
      setReturnSearchIssue(message);
      setFeedback({ tone: 'error', message });
      return;
    }

    setLoadingReturnOptions(true);
    setReturnSearchIssue(null);
    setFeedback({
      tone: 'info',
      message: `Consultando regresos compatibles para ${offer.airline} ${offer.flightNumber}.`,
    });

    try {
      const inboundOffers = await searchReturnFlights(formData, defaultTravelPolicy, offer.departureToken);
      if (requestSequence !== returnSearchRequestSequence.current) {
        return;
      }

      setSearchSession((current) =>
        current
          ? {
              ...current,
              inbound: inboundOffers,
              returnContextOfferId: offer.id,
              returnContextDepartureToken: offer.departureToken,
            }
          : current,
      );
      setReturnSearchIssue(null);
      setSelections((current) => ({
        ...current,
        preferredReturnId: '',
        backupReturnId: '',
      }));
      setFeedback({
        tone: inboundOffers.length > 0 ? 'success' : 'info',
        message:
          inboundOffers.length > 0
            ? 'Regresos compatibles cargados desde Google Flights para la salida seleccionada.'
            : 'Google Flights no devolvio regresos compatibles para la salida elegida. Prueba otra opcion de ida.',
      });
    } catch (error) {
      if (requestSequence !== returnSearchRequestSequence.current) {
        return;
      }

      const message = getErrorMessage(
        error,
        'No fue posible consultar regresos compatibles para la salida elegida.',
      );
      setSearchSession((current) =>
        current
          ? {
              ...current,
              inbound: [],
              returnContextOfferId: offer.id,
              returnContextDepartureToken: offer.departureToken,
            }
          : current,
      );
      setReturnSearchIssue(message);
      setFeedback({ tone: 'error', message });
    } finally {
      if (requestSequence === returnSearchRequestSequence.current) {
        setLoadingReturnOptions(false);
      }
    }
  };

  const assignOffer = async (leg: FlightLeg, role: 'preferred' | 'backup', offerId: string) => {
    const nextSelections = computeNextSelections(selections, leg, role, offerId);
    setSelections(nextSelections);

    const selectedOffer = findOfferById(searchSession, offerId);
    if (!selectedOffer) {
      return;
    }

    void resolveBookingForOffer(selectedOffer);

    if (leg !== 'outbound' || formData.tripType !== 'redondo' || !searchSession) {
      return;
    }

    const nextReturnContextOfferId = nextSelections.preferredOutboundId || nextSelections.backupOutboundId;
    const needsReturnRefresh =
      Boolean(nextReturnContextOfferId) &&
      (nextReturnContextOfferId !== (searchSession.returnContextOfferId || '') || searchSession.inbound.length === 0);

    if (!nextReturnContextOfferId) {
      setReturnSearchIssue(null);
      setSearchSession((current) =>
        current
          ? {
              ...current,
              inbound: [],
              returnContextOfferId: '',
              returnContextDepartureToken: '',
            }
          : current,
      );
      return;
    }

    if (!needsReturnRefresh) {
      return;
    }

    const outboundContextOffer = findOfferById(searchSession, nextReturnContextOfferId);
    await loadReturnOptionsForOutbound(outboundContextOffer);
  };

  const validateBeforeSearch = () => {
    const errors = validateTravelForm(formData);
    setValidationErrors(errors);
    if (errors.length > 0) {
      showModalAlert(
        'error',
        formData.requiresFlight ? 'Corrige la solicitud antes de buscar vuelos' : 'Corrige la solicitud',
        errors,
      );
      return false;
    }

    return true;
  };

  const buildDraftPayload = async (status: TravelWorkflowStatus) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const serviceReference = resolveServiceReference(formData);

    return {
      engineer_id: formData.engineerId || user?.id || null,
      client_id: formData.clientId ?? null,
      service_ticket_id: formData.serviceTicketId || null,
      employee_number: formData.employeeNumber,
      engineer_name: formData.engineerName,
      service_type: formData.serviceType,
      workflow_status: status,
      priority: formData.priority,
      trip_type: formData.tripType,
      origin_city: formData.originCity,
      destination_city: formData.destinationCity,
      origin_airport: formData.requiresFlight ? formData.originAirport || null : null,
      destination_airport: formData.requiresFlight ? formData.destinationAirport || null : null,
      desired_departure_date: formData.departureDate || null,
      desired_return_date: formData.tripType === 'redondo' ? formData.returnDate || null : null,
      preferred_departure_window: formData.requiresFlight ? formData.departurePreference : null,
      preferred_return_window:
        formData.requiresFlight && formData.tripType === 'redondo' ? formData.returnPreference : null,
      service_start_at: formData.serviceStartDate ? `${formData.serviceStartDate}T${formData.serviceStartTime}:00` : null,
      service_end_at:
        formData.serviceEndDate && formData.serviceEndTime
          ? `${formData.serviceEndDate}T${formData.serviceEndTime}:00`
          : null,
      client_name: formData.clientName,
      site_address: formData.siteAddress,
      site_contact: formData.siteContact,
      site_phone: formData.sitePhone,
      service_reference: serviceReference,
      equipment_name: formData.equipment,
      equipment_serial: formData.equipmentSerial,
      justification: formData.justification,
      admin_message: selections.adminMessage,
      comments: formData.adminComments,
      requires_checked_bag: formData.checkedBag,
      requires_special_tools: formData.specialTools,
      requires_flight: formData.requiresFlight,
      requires_car: formData.requiresCar,
      risk_level: 'green',
      convenience_score: 0,
      policy_status: 'draft',
      total_estimated_cost: summary?.estimatedTotalCost || 0,
      currency: summary?.currency || 'MXN',
      request_payload: {
        form: formData,
        selections,
      },
      request_snapshot: summary
        ? {
            summary,
            searchSession,
            selections,
          }
        : {
            form: formData,
            searchSession,
            selections,
          },
      created_by: user?.id || null,
      updated_by: user?.id || null,
    };
  };

  const upsertDraft = async (status: TravelWorkflowStatus) => {
    const payload = await buildDraftPayload(status);
    const stableTravelRequestId = requestId || resolveTravelRequestId(formData);

    if (requestId) {
      const { error } = await supabase.from('travel_requests').update(payload).eq('id', requestId);
      if (error) throw error;
      await syncLinkedPlanningTicket(requestId, status);
      return requestId;
    }

    const { data, error } = await supabase
      .from('travel_requests')
      .upsert({ id: stableTravelRequestId, ...payload })
      .select('id')
      .single();
    if (error) throw error;
    await syncLinkedPlanningTicket(data.id as string, status);
    setRequestId(data.id);
    return data.id as string;
  };

  const saveStatusHistory = async (travelRequestId: string, status: TravelWorkflowStatus, reason: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase
      .from('travel_request_status_history')
      .insert(buildStatusHistoryPayload(travelRequestId, status, user?.id || null, reason));
  };

  const handleSearch = async () => {
    if (!validateBeforeSearch()) {
      return;
    }

    if (!formData.requiresFlight) {
      setSearchSession(null);
      setSelections(EMPTY_SELECTIONS);
      setStep('summary');
      setDraftStatus('borrador');
      setFeedback({
        tone: 'info',
        message:
          'La solicitud no requiere vuelo. Ya puedes revisar el resumen final y enviarlo al flujo administrativo.',
      });
      return;
    }

    if (!isFlightSearchEnabled()) {
      setFeedback({
        tone: 'error',
        message: `${getFlightSearchDisabledMessage()} Puedes guardar Borrador Solicitud y reanudar cuando la integración quede habilitada por completo.`,
      });
      return;
    }

    setBusy(true);
    setFeedback(null);
    setReturnSearchIssue(null);
    const requestSequence = ++searchRequestSequence.current;
    returnSearchRequestSequence.current += 1;
    setLoadingReturnOptions(false);

    try {
      const generatedSession = await searchLiveFlights(formData, defaultTravelPolicy);
      if (requestSequence !== searchRequestSequence.current) {
        return;
      }

      setSearchSession(generatedSession);
      setSelections(EMPTY_SELECTIONS);
      setLoadingReturnOptions(false);
      setResolvingOfferIds([]);
      setStep('search');
      setDraftStatus('buscando_vuelo');

      const travelRequestId = await upsertDraft('buscando_vuelo');
      await saveStatusHistory(travelRequestId, 'buscando_vuelo', 'Busqueda de vuelos ejecutada por ingeniero.');
      await supabase.from('flight_search_sessions').insert(
        buildFlightSearchSessionPayload(travelRequestId, generatedSession, formData),
      );

      setFeedback({
        tone: 'success',
        message:
          formData.tripType === 'redondo'
            ? 'Busqueda completada con Google Flights. Selecciona una salida para cargar regresos compatibles y opciones reales de reserva.'
            : 'Busqueda completada con proveedor real. Revisa score, riesgos y deeplink antes de enviar la solicitud administrativa.',
      });
    } catch (error) {
      if (requestSequence !== searchRequestSequence.current) {
        return;
      }

      const message = getErrorMessage(error, 'No fue posible guardar la sesion de busqueda.');
      setFeedback({ tone: 'error', message });
    } finally {
      if (requestSequence === searchRequestSequence.current) {
        setBusy(false);
      }
    }
  };

  const handleSaveDraft = async () => {
    setBusy(true);
    setFeedback(null);

    try {
      const travelRequestId = await upsertDraft('borrador');
      await saveStatusHistory(travelRequestId, 'borrador', 'Solicitud guardada como borrador.');
      setDraftStatus('borrador');
      setFeedback({
        tone: 'success',
        message: 'Solicitud guardada como borrador. La administracion la podra ver sin perder trazabilidad.',
      });
      onSaved?.();
    } catch (error) {
      const message = getErrorMessage(error, 'No fue posible guardar el borrador.');
      showModalAlert('error', 'Error al guardar borrador', [message]);
    } finally {
      setBusy(false);
    }
  };

  const handlePrepareSummary = () => {
    if (!formData.requiresFlight) {
      setStep('summary');
      setFeedback({
        tone: 'info',
        message: 'La solicitud quedo lista sin busqueda de vuelos. Revisa el resumen final antes de enviarla.',
      });
      return;
    }

    if (summaryBlockingErrors.length > 0) {
      showModalAlert('error', 'No se puede generar el resumen', summaryBlockingErrors);
      return;
    }

    setStep('summary');
    setFeedback({
      tone: 'info',
      message:
        'La solicitud ya contiene vuelo preferido, respaldo, score de riesgo y mensaje listo para administracion.',
    });
  };

  const handleSubmitRequest = async () => {
    if (!summary || summaryBlockingErrors.length > 0 || (formData.requiresFlight && !searchSession)) {
      showModalAlert(
        'error',
        'Solicitud incompleta',
        summaryBlockingErrors.length > 0
          ? summaryBlockingErrors
          : ['No existe un resumen listo para enviar.'],
      );
      return;
    }

    setBusy(true);
    setFeedback(null);

    try {
      const shouldSendLogisticsCommunication = Boolean(
        formData.requiresFlight ||
          formData.requiresCar ||
          summary.outboundPreferred ||
          summary.outboundBackup ||
          summary.returnPreferred ||
          summary.returnBackup,
      );
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload = createRequestPayload(formData, searchSession, summary, selections, user?.id || null);
      let travelRequestId = requestId || resolveTravelRequestId(formData);

      if (requestId) {
        const { error } = await supabase.from('travel_requests').update(payload).eq('id', travelRequestId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('travel_requests')
          .upsert({ id: travelRequestId, ...payload })
          .select('id')
          .single();
        if (error) throw error;
        travelRequestId = data.id as string;
        setRequestId(travelRequestId);
      }

      await syncLinkedPlanningTicket(travelRequestId, 'solicitud_enviada');

      const snapshots = [
        searchSession && summary.outboundPreferred
          ? createOfferSnapshotPayload(travelRequestId, searchSession, summary.outboundPreferred, 'preferred')
          : null,
        searchSession && summary.outboundBackup
          ? createOfferSnapshotPayload(travelRequestId, searchSession, summary.outboundBackup, 'backup')
          : null,
        searchSession && summary.returnPreferred
          ? createOfferSnapshotPayload(travelRequestId, searchSession, summary.returnPreferred, 'preferred')
          : null,
        searchSession && summary.returnBackup
          ? createOfferSnapshotPayload(travelRequestId, searchSession, summary.returnBackup, 'backup')
          : null,
      ].filter(Boolean);

      if (snapshots.length > 0) {
        const { error } = await supabase.from('flight_offer_snapshots').insert(snapshots);
        if (error) throw error;
      }

      const { error: noteError } = await supabase.from('travel_admin_notes').insert({
        travel_request_id: travelRequestId,
        author_id: user?.id || null,
        note_type: 'engineer_message',
        note: selections.adminMessage || 'Sin mensaje adicional del ingeniero.',
        visibility: 'admin',
      });

      if (noteError) throw noteError;

      await saveStatusHistory(
        travelRequestId,
        'solicitud_enviada',
        shouldSendLogisticsCommunication
          ? 'Solicitud de logistica enviada con requerimientos de viaje y respaldo operativo.'
          : 'Solicitud operativa enviada sin requerimiento de vuelo.',
      );

      let emailFailureMessage = '';
      let emailRecipient = '';
      let emailSkippedMessage = '';
      if (shouldSendLogisticsCommunication) {
        if (!isTravelRequestEmailEnabled()) {
          emailSkippedMessage = getTravelRequestEmailDisabledMessage();
        } else {
          try {
            const emailResponse = await sendTravelRequestEmail({
              travelRequestId,
              form: formData,
              summary,
              selections,
              searchSession,
            });
            emailRecipient = emailResponse.to || '';
          } catch (error) {
            emailFailureMessage =
              error instanceof Error ? error.message : 'No fue posible enviar el correo formal de solicitud.';
          }
        }
      }

      setDraftStatus('solicitud_enviada');
      setFeedback({
        tone: emailFailureMessage ? 'info' : 'success',
        message:
          emailFailureMessage
            ? `Solicitud guardada y enviada al flujo administrativo, pero el correo a Sofia no pudo salir: ${emailFailureMessage}`
            : emailSkippedMessage
              ? `Solicitud enviada al flujo administrativo. ${emailSkippedMessage}`
            : shouldSendLogisticsCommunication
              ? `Solicitud enviada y correo formal generado${emailRecipient ? ` a ${emailRecipient}` : ' para Sofia Ceballos'}. La administracion ya puede revisar y reservar sin interpretar capturas ni mensajes ambiguos.`
              : 'Solicitud enviada. La administracion ya puede revisar el caso sin interpretar capturas ni mensajes ambiguos.',
      });
      onSaved?.();
    } catch (error) {
      const message = getErrorMessage(
        error,
        'No fue posible enviar la solicitud de viaje al flujo administrativo.',
      );
      showModalAlert('error', 'Error al enviar la solicitud', [message]);
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!summary) return;

    try {
      await navigator.clipboard.writeText(summary.messageText);
      setFeedback({ tone: 'success', message: 'Mensaje copiado al portapapeles.' });
    } catch {
      showModalAlert('error', 'No se pudo copiar', ['No fue posible copiar el mensaje.']);
    }
  };

  const handleExport = () => {
    if (!summary) return;

    const blob = new Blob(
      [
        JSON.stringify(
          {
            form: formData,
            summary,
            searchSession,
            selections,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `travel-request-${resolvedServiceReference || 'draft'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const openEmail = () => {
    if (!summary) return;
    window.open(
      `mailto:?subject=${encodeURIComponent(`Solicitud de logistica ${resolvedServiceReference}`)}&body=${encodeURIComponent(summary.messageText)}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const openWhatsApp = () => {
    if (!summary) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(summary.messageText)}`, '_blank', 'noopener,noreferrer');
  };

  const renderOfferCard = (offer: FlightOffer) => {
    const selectedAsPreferred =
      (offer.leg === 'outbound' && selections.preferredOutboundId === offer.id) ||
      (offer.leg === 'return' && selections.preferredReturnId === offer.id);
    const selectedAsBackup =
      (offer.leg === 'outbound' && selections.backupOutboundId === offer.id) ||
      (offer.leg === 'return' && selections.backupReturnId === offer.id);
    const isResolvingOffer = resolvingOfferIds.includes(offer.id);

    return (
      <article
        key={offer.id}
        className={`travel-flight-card ${selectedAsPreferred || selectedAsBackup ? 'selected' : ''}`}
      >
        <div className="travel-flight-topline">
          <div>
            <strong>
              {offer.airline} {offer.flightNumber}
            </strong>
            <div className="travel-flight-meta">
              <span className={`travel-badge travel-risk-${offer.riskLevel}`}>{offer.riskLevel.toUpperCase()}</span>
              <span className="travel-badge">{offer.recommendation === 'recommended' ? 'Recomendado' : 'Revisar'}</span>
              <span className="travel-badge">{offer.stops === 0 ? 'Directo' : `${offer.stops} escalas`}</span>
            </div>
          </div>
          <div className="travel-price">
            {offer.currency} {offer.price.toLocaleString('es-MX')}
          </div>
        </div>

        <div className="travel-flight-times">
          <div>
            <strong>{offer.departureAirport}</strong>
            <span>{formatDisplayDateTime(offer.departureAt)}</span>
            <small>Salida</small>
          </div>
          <span style={{ color: 'var(--text-secondary)' }}>{formatDuration(offer.durationMinutes)}</span>
          <div style={{ textAlign: 'right' }}>
            <strong>{offer.arrivalAirport}</strong>
            <span>{formatDisplayDateTime(offer.arrivalAt)}</span>
            <small>Llegada</small>
          </div>
        </div>

        <div className="travel-score">
          <span>Score de conveniencia {offer.convenienceScore}</span>
          <div className="travel-score-bar">
            <span style={{ width: `${offer.convenienceScore}%` }} />
          </div>
        </div>

        <div className="travel-flight-meta">
          <span className="travel-badge">{offer.fareType}</span>
          <span className="travel-badge">{offer.cabin}</span>
          {offer.badges.map((badge) => (
            <span key={badge} className="travel-badge">
              {badge}
            </span>
          ))}
        </div>

        {offer.warnings.length > 0 && (
          <div className="travel-warning-list">
            {offer.warnings.map((warning) => (
              <span key={warning}>• {warning}</span>
            ))}
          </div>
        )}

        {offer.selectedBookingOption && (
          <div className="travel-banner" style={{ marginTop: '0.9rem' }}>
            Reserva sugerida con <strong>{offer.selectedBookingOption.bookWith}</strong>
            {offer.selectedBookingOption.price
              ? ` por ${offer.currency} ${offer.selectedBookingOption.price.toLocaleString('es-MX')}`
              : ''}
          </div>
        )}

        {isResolvingOffer && (
          <div className="travel-hint" style={{ marginTop: '0.75rem' }}>
            Resolviendo opcion real de reserva...
          </div>
        )}

        <div className="travel-actions-group">
          <button
            type="button"
            className={`button-primary ${selectedAsPreferred ? '' : 'inactive'}`}
            onClick={() => void assignOffer(offer.leg, 'preferred', offer.id)}
          >
            {selectedAsPreferred ? 'Preferido' : 'Elegir preferido'}
          </button>
          <button
            type="button"
            className={`button-primary ${selectedAsBackup ? '' : 'inactive'}`}
            onClick={() => void assignOffer(offer.leg, 'backup', offer.id)}
          >
            {selectedAsBackup ? 'Respaldo' : 'Elegir respaldo'}
          </button>
        </div>
      </article>
    );
  };

  const renderSelectionBlock = (title: string, offer: FlightOffer | null, emptyMessage: string) => (
    <section className="travel-selection-card">
      <h4>{title}</h4>
      {offer ? (
        <>
          <strong>
            {offer.airline} {offer.flightNumber}
          </strong>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
            {offer.departureAirport} {formatDisplayDateTime(offer.departureAt)}
            {' -> '}
            {offer.arrivalAirport} {formatDisplayDateTime(offer.arrivalAt)}
          </p>
          <div className="travel-pill-row" style={{ marginTop: '0.8rem' }}>
            <span className={`travel-badge travel-risk-${offer.riskLevel}`}>{offer.riskLevel.toUpperCase()}</span>
            <span className="travel-badge">Score {offer.convenienceScore}</span>
            <span className="travel-badge">
              {offer.currency} {offer.price.toLocaleString('es-MX')}
            </span>
          </div>
          {offer.selectedBookingOption && (
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.75rem' }}>
              Reserva sugerida con {offer.selectedBookingOption.bookWith}
              {offer.selectedBookingOption.price
                ? ` | ${offer.currency} ${offer.selectedBookingOption.price.toLocaleString('es-MX')}`
                : ''}
            </p>
          )}
          {offer.warnings.length > 0 && (
            <div className="travel-warning-list" style={{ marginTop: '0.8rem' }}>
              {offer.warnings.map((warning) => (
                <span key={warning}>• {warning}</span>
              ))}
            </div>
          )}
        </>
      ) : (
        <p style={{ color: 'var(--text-secondary)' }}>{emptyMessage}</p>
      )}
    </section>
  );

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div className="travel-modal-overlay" onClick={onClose}>
      <div className="travel-modal-shell" onClick={(event) => event.stopPropagation()}>
        <aside className="travel-modal-sidebar">
          <div className="travel-modal-brand">
            <BrandLockup
              variant="sidebar"
              eyebrow="Orion"
              title="Panel de Viajes"
              subtitle="Modulo operativo para coordinar vuelos de servicio sin mensajes ambiguos."
            />
          </div>

          <div className="travel-step-list">
            {visibleSteps.map((item, index) => {
              const active = item.id === step;
              const done = visibleSteps.findIndex((candidate) => candidate.id === step) > index;
              return (
                <button
                  type="button"
                  key={item.id}
                  className={`travel-step-item ${active ? 'active' : ''} ${done ? 'done' : ''}`}
                  onClick={() => setStep(item.id)}
                >
                  <span>{index + 1}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="travel-sidebar-card">
            <h4>Estado actual</h4>
            <div className="travel-pill-row">
              <span className="travel-badge" style={{ color: statusColor(draftStatus) }}>
                {getStatusLabel(draftStatus)}
              </span>
              <span className="travel-badge">Politica MXN {defaultTravelPolicy.maxBudgetMxn.toLocaleString('es-MX')}</span>
            </div>
            <p className="travel-hint">
              Si guardas un Borrador Solicitud, al volver a abrir el modulo se recupera automaticamente el ultimo borrador
              pendiente ligado a tu planeacion. Si no hay borrador recuperable, se precarga la siguiente planeacion mas
              cercana.
            </p>
          </div>

          <div className="travel-sidebar-card">
            <h4>Principios del modulo</h4>
            <p className="travel-hint">
              1. El ingeniero elige la opcion que mejor sirve al servicio.
              <br />
              2. La administracion recibe una solicitud casi lista para reservar.
              <br />
              3. Cada seleccion guarda snapshot completo para trazabilidad.
            </p>
          </div>
        </aside>

        <section className="travel-modal-content">
          <header className="travel-modal-header">
            <div>
              <h2>Planear nuevo servicio con solicitud de viaje</h2>
              <p>
                Este flujo esta optimizado para mantenimiento preventivo, correctivo e intervenciones tecnicas. Busca,
                compara, puntua y transforma la seleccion del ingeniero en una solicitud administrativa lista para compra.
              </p>
            </div>
            <button type="button" className="travel-close" onClick={onClose}>
              ×
            </button>
          </header>

          <div className="travel-modal-body">
            {feedback && (
              <div className={`travel-banner ${feedback.tone === 'success' ? 'success' : feedback.tone === 'error' ? 'error' : ''}`}>
                {feedback.message}
              </div>
            )}

            {step === 'request' && (
              <>
                <section className="travel-form-section">
                  <h3>Responsable y motivo del viaje</h3>
                  <p>La solicitud inicia con el contexto operativo completo para evitar idas y vueltas con administracion.</p>

                  <div className="travel-grid-4 travel-grid-tight" style={{ marginTop: '1rem' }}>
                    <div className="travel-field travel-span-2">
                      <label>Ingeniero</label>
                      <select
                        className="input-field"
                        value={formData.engineerId}
                        onChange={(event) => {
                          updateFormField('engineerId', event.target.value);
                          syncEngineer(event.target.value);
                        }}
                      >
                        <option value="">Selecciona ingeniero</option>
                        {engineerOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="travel-field">
                      <label>Tipo de servicio</label>
                      <select
                        className="input-field"
                        value={formData.serviceType}
                        onChange={(event) => updateFormField('serviceType', event.target.value as TravelFormData['serviceType'])}
                      >
                        <option value="preventivo">Preventivo</option>
                        <option value="correctivo">Correctivo</option>
                        <option value="instalacion">Instalacion</option>
                        <option value="capacitacion">Capacitacion</option>
                        <option value="emergencia">Emergencia</option>
                        <option value="otro">Otro</option>
                      </select>
                    </div>
                    <div className="travel-field">
                      <label>Prioridad</label>
                      <select
                        className="input-field"
                        value={formData.priority}
                        onChange={(event) => updateFormField('priority', event.target.value as TravelFormData['priority'])}
                      >
                        <option value="baja">Baja</option>
                        <option value="media">Media</option>
                        <option value="alta">Alta</option>
                        <option value="critica">Critica</option>
                      </select>
                    </div>
                    <div className="travel-field">
                      <label>Viaje</label>
                      <select
                        className="input-field"
                        value={formData.tripType}
                        onChange={(event) => updateFormField('tripType', event.target.value as TravelFormData['tripType'])}
                      >
                        <option value="redondo">Redondo</option>
                        <option value="solo_ida">Solo ida</option>
                      </select>
                    </div>
                    <div className="travel-field travel-span-3">
                      <div className="travel-field-header">
                        <label>Folio / ticket</label>
                        <span className="travel-inline-hint">Se genera al guardar si aun no existe</span>
                      </div>
                      <input
                        className="input-field"
                        value={formData.serviceReference}
                        onChange={(event) => updateFormField('serviceReference', event.target.value)}
                        placeholder={resolvedServiceReference}
                      />
                    </div>
                  </div>

                  <div className="travel-field" style={{ marginTop: '1rem' }}>
                    <label>Justificacion / comentarios operativos</label>
                    <textarea
                      className="input-field travel-compact-textarea"
                      value={formData.justification}
                      onChange={(event) => updateFormField('justification', event.target.value)}
                      placeholder="Describe por que el viaje debe ejecutarse, riesgos de no atenderlo y observaciones para la reserva."
                    />
                    {matchedPlannedPreventive && (
                      <small className="travel-hint">
                        Se detecto una planeacion preventiva compatible para este numero de serie y se prelleno el motivo operativo.
                      </small>
                    )}
                  </div>
                </section>

                <section className="travel-form-section">
                  <h3>Cliente, equipo y sitio</h3>
                  <p>La reserva debe quedar vinculada al servicio y al sitio real para evitar interpretacion manual.</p>
                  <div className="travel-grid-2">
                    <div className="travel-field">
                      <label>Equipo / serie</label>
                      <input
                        className="input-field"
                        list="travel-equipment-serials"
                        value={formData.equipmentSerial}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          updateFormField('equipmentSerial', nextValue);
                          syncEquipment(nextValue);
                        }}
                        onBlur={(event) => {
                          syncEquipment(event.target.value);
                        }}
                        placeholder="Escribe o selecciona numero de serie"
                        autoComplete="off"
                      />
                      <datalist id="travel-equipment-serials">
                        {equipmentOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </datalist>
                    </div>
                    <div className="travel-field">
                      <label>Cliente / hospital / laboratorio</label>
                      <input
                        className="input-field"
                        value={formData.clientName}
                        onChange={(event) => updateFormField('clientName', event.target.value)}
                        placeholder="Nombre del cliente"
                      />
                    </div>
                  </div>

                  <div className="travel-grid-3" style={{ marginTop: '1rem' }}>
                    <div className="travel-field">
                      <label>Equipo o instrumento</label>
                      <input
                        className="input-field"
                        value={formData.equipment}
                        onChange={(event) => updateFormField('equipment', event.target.value)}
                        placeholder="Modelo o instrumento"
                      />
                    </div>
                    <div className="travel-field">
                      <label>Contacto en sitio</label>
                      <input
                        className="input-field"
                        value={formData.siteContact}
                        onChange={(event) => updateFormField('siteContact', event.target.value)}
                        placeholder="Nombre del contacto"
                      />
                    </div>
                    <div className="travel-field">
                      <label>Telefono de contacto</label>
                      <input
                        className="input-field"
                        value={formData.sitePhone}
                        onChange={(event) => updateFormField('sitePhone', event.target.value)}
                        placeholder="Telefono celular o conmutador"
                      />
                    </div>
                  </div>

                  <div className="travel-field" style={{ marginTop: '1rem' }}>
                    <label>Direccion del sitio <span className="travel-label-optional">(Opcional)</span></label>
                    <textarea
                      className="input-field"
                      value={formData.siteAddress}
                      onChange={(event) => updateFormField('siteAddress', event.target.value)}
                      placeholder="Direccion completa para confirmar destino y traslados."
                    />
                  </div>
                </section>

                <section className="travel-form-section">
                  <h3>Ruta, fechas y ventana operativa</h3>
                  <p>Este bloque captura el contexto comun del servicio, con o sin compra de transportacion.</p>

                  <div className="travel-grid-2" style={{ marginTop: '1rem' }}>
                    <div className="travel-field">
                      <label>Ciudad de origen</label>
                      <input
                        className="input-field"
                        list="travel-origin-cities"
                        value={formData.originCity}
                        onChange={(event) => updateFormField('originCity', event.target.value)}
                        onBlur={(event) => normalizeCityField('originCity', event.target.value)}
                        placeholder="Ciudad de origen"
                      />
                      <datalist id="travel-origin-cities">
                        {knownCities.map((city) => (
                          <option key={city} value={city} />
                        ))}
                      </datalist>
                    </div>
                    <div className="travel-field">
                      <label>Ciudad de destino</label>
                      <input
                        className="input-field"
                        list="travel-destination-cities"
                        value={formData.destinationCity}
                        onChange={(event) => updateFormField('destinationCity', event.target.value)}
                        onBlur={(event) => normalizeCityField('destinationCity', event.target.value)}
                        placeholder="Ciudad de destino"
                      />
                      <datalist id="travel-destination-cities">
                        {knownCities.map((city) => (
                          <option key={city} value={city} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  <div className="travel-grid-2" style={{ marginTop: '1rem' }}>
                    <div className="travel-field">
                      <label>{formData.requiresFlight || formData.requiresCar ? 'Salida deseada' : 'Salida deseada (opcional)'}</label>
                      <input
                        type="date"
                        className="input-field"
                        value={formData.departureDate}
                        onChange={(event) => updateFormField('departureDate', event.target.value)}
                      />
                    </div>
                    <div className="travel-field">
                      <label>
                        {formData.tripType === 'redondo' && (formData.requiresFlight || formData.requiresCar)
                          ? 'Regreso deseado'
                          : 'Regreso deseado (opcional)'}
                      </label>
                      <input
                        type="date"
                        className="input-field"
                        value={formData.returnDate}
                        disabled={formData.tripType === 'solo_ida'}
                        onChange={(event) => updateFormField('returnDate', event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="travel-grid-4" style={{ marginTop: '1rem' }}>
                    <div className="travel-field">
                      <label>Inicio del servicio</label>
                      <input
                        type="date"
                        className="input-field"
                        value={formData.serviceStartDate}
                        onChange={(event) => updateFormField('serviceStartDate', event.target.value)}
                      />
                    </div>
                    <div className="travel-field">
                      <label>Hora inicio</label>
                      <input
                        type="time"
                        className="input-field"
                        value={formData.serviceStartTime}
                        onChange={(event) => updateFormField('serviceStartTime', event.target.value)}
                      />
                    </div>
                    <div className="travel-field">
                      <label>Fin del servicio</label>
                      <input
                        type="date"
                        className="input-field"
                        value={formData.serviceEndDate}
                        onChange={(event) => updateFormField('serviceEndDate', event.target.value)}
                      />
                    </div>
                    <div className="travel-field">
                      <label>Hora fin</label>
                      <input
                        type="time"
                        className="input-field"
                        value={formData.serviceEndTime}
                        onChange={(event) => updateFormField('serviceEndTime', event.target.value)}
                      />
                    </div>
                  </div>
                  <small className="travel-hint" style={{ display: 'block', marginTop: '0.8rem' }}>
                    {getServiceWindowCompatibilityNote(formData)}
                  </small>

                  <div className="travel-field" style={{ marginTop: '1rem' }}>
                    <label>Notas adicionales para administracion</label>
                    <textarea
                      className="input-field"
                      value={formData.adminComments}
                      onChange={(event) => updateFormField('adminComments', event.target.value)}
                      placeholder="Preferencias, restricciones, agenda con cliente o datos extra que deben preservarse."
                    />
                  </div>

                  <div className="travel-chip-row" style={{ marginTop: '1rem' }}>
                    <button
                      type="button"
                      className={`travel-chip ${formData.requiresFlight ? 'active' : ''}`}
                      onClick={() => {
                        const nextRequiresFlight = !formData.requiresFlight;
                        setFormData((current) => ({
                          ...current,
                          requiresFlight: nextRequiresFlight,
                          originAirport: nextRequiresFlight ? current.originAirport : '',
                          destinationAirport: nextRequiresFlight ? current.destinationAirport : '',
                        }));
                        setSearchSession(null);
                        setSelections(EMPTY_SELECTIONS);
                      }}
                    >
                      Requiere vuelo
                    </button>
                    <button
                      type="button"
                      className={`travel-chip ${formData.requiresCar ? 'active' : ''}`}
                      onClick={() => updateFormField('requiresCar', !formData.requiresCar)}
                    >
                      Requiere renta automovil
                    </button>
                  </div>
                </section>

                {formData.requiresFlight && (
                  <section className="travel-form-section">
                    <h3>Formato de peticion de vuelos</h3>
                    <p>Este bloque solo aparece cuando realmente se debe coordinar compra de vuelo.</p>

                    <div className="travel-chip-row" style={{ marginTop: '1rem' }}>
                      <button
                        type="button"
                        className={`travel-chip ${formData.checkedBag ? 'active' : ''}`}
                        onClick={() => updateFormField('checkedBag', !formData.checkedBag)}
                      >
                        Requiere equipaje documentado
                      </button>
                      <button
                        type="button"
                        className={`travel-chip ${formData.specialTools ? 'active' : ''}`}
                        onClick={() => updateFormField('specialTools', !formData.specialTools)}
                      >
                        Lleva herramientas o maletas especiales
                      </button>
                    </div>

                    <div className="travel-grid-2" style={{ marginTop: '1rem' }}>
                      <div className="travel-field">
                        <label>Aeropuerto de origen</label>
                        {originAirportOptions.length > 0 ? (
                          <select
                            className="input-field"
                            value={formData.originAirport}
                            onChange={(event) => updateFormField('originAirport', event.target.value)}
                          >
                            <option value="">Selecciona aeropuerto</option>
                            {originAirportOptions.map((airport) => (
                              <option key={airport.code} value={airport.code}>
                                {airport.code} | {airport.airport}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="input-field"
                            value={formData.originAirport}
                            onChange={(event) => updateFormField('originAirport', event.target.value.toUpperCase())}
                            placeholder="Codigo IATA"
                          />
                        )}
                      </div>
                      <div className="travel-field">
                        <label>Aeropuerto de destino</label>
                        {destinationAirportOptions.length > 0 ? (
                          <select
                            className="input-field"
                            value={formData.destinationAirport}
                            onChange={(event) => updateFormField('destinationAirport', event.target.value)}
                          >
                            <option value="">Selecciona aeropuerto</option>
                            {destinationAirportOptions.map((airport) => (
                              <option key={airport.code} value={airport.code}>
                                {airport.code} | {airport.airport}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="input-field"
                            value={formData.destinationAirport}
                            onChange={(event) => updateFormField('destinationAirport', event.target.value.toUpperCase())}
                            placeholder="Codigo IATA"
                          />
                        )}
                      </div>
                    </div>

                    <div className="travel-grid-2" style={{ marginTop: '1rem' }}>
                      <div className="travel-field">
                        <label>Horario preferido salida</label>
                        <select
                          className="input-field"
                          value={formData.departurePreference}
                          onChange={(event) =>
                            updateFormField('departurePreference', event.target.value as TravelFormData['departurePreference'])
                          }
                        >
                          <option value="muy_temprano">Muy temprano</option>
                          <option value="manana">Mañana</option>
                          <option value="mediodia">Mediodia</option>
                          <option value="tarde">Tarde</option>
                          <option value="noche">Noche</option>
                          <option value="flexible">Flexible</option>
                        </select>
                      </div>
                      <div className="travel-field">
                        <label>Horario preferido regreso</label>
                        <select
                          className="input-field"
                          value={formData.returnPreference}
                          disabled={formData.tripType === 'solo_ida'}
                          onChange={(event) =>
                            updateFormField('returnPreference', event.target.value as TravelFormData['returnPreference'])
                          }
                        >
                          <option value="muy_temprano">Muy temprano</option>
                          <option value="manana">Mañana</option>
                          <option value="mediodia">Mediodia</option>
                          <option value="tarde">Tarde</option>
                          <option value="noche">Noche</option>
                          <option value="flexible">Flexible</option>
                        </select>
                      </div>
                    </div>
                  </section>
                )}

                {formData.requiresCar && (
                  <section className="travel-form-section">
                    <h3>Formato de renta automotriz</h3>
                    <p>
                      Este bloque genera la solicitud que hoy requiere la empresa para coordinar la renta de auto sin
                      mensajes adicionales.
                    </p>

                    <div className="travel-grid-3" style={{ marginTop: '1rem' }}>
                      <div className="travel-field" style={{ gridColumn: '1 / -1' }}>
                        <label>Lugar para recoger auto</label>
                        <input
                          className="input-field"
                          value={formData.carPickupLocation}
                          onChange={(event) => updateFormField('carPickupLocation', event.target.value)}
                          placeholder="Ejemplo: AVIS POLANCO CDMX o sucursal en aeropuerto"
                        />
                      </div>
                      <div className="travel-field">
                        <label>Fecha de recoleccion</label>
                        <input
                          type="date"
                          className="input-field"
                          value={formData.carPickupDate}
                          onChange={(event) => updateFormField('carPickupDate', event.target.value)}
                        />
                      </div>
                      <div className="travel-field">
                        <label>Hora de recoleccion</label>
                        <input
                          type="time"
                          className="input-field"
                          value={formData.carPickupTime}
                          onChange={(event) => updateFormField('carPickupTime', event.target.value)}
                        />
                      </div>
                    </div>

                    <div className="travel-grid-3" style={{ marginTop: '1rem' }}>
                      <div className="travel-field" style={{ gridColumn: '1 / -1' }}>
                        <label>Lugar para entregar auto</label>
                        <input
                          className="input-field"
                          value={formData.carDropoffLocation}
                          onChange={(event) => updateFormField('carDropoffLocation', event.target.value)}
                          placeholder="Ejemplo: AVIS POLANCO CDMX o sucursal final"
                        />
                      </div>
                      <div className="travel-field">
                        <label>Fecha de entrega</label>
                        <input
                          type="date"
                          className="input-field"
                          value={formData.carDropoffDate}
                          onChange={(event) => updateFormField('carDropoffDate', event.target.value)}
                        />
                      </div>
                      <div className="travel-field">
                        <label>Hora de entrega</label>
                        <input
                          type="time"
                          className="input-field"
                          value={formData.carDropoffTime}
                          onChange={(event) => updateFormField('carDropoffTime', event.target.value)}
                        />
                      </div>
                    </div>

                    <div className="travel-grid-2" style={{ marginTop: '1rem' }}>
                      <div className="travel-field">
                        <label>Kilometraje estimado</label>
                        <input
                          className="input-field"
                          value={formData.carEstimatedKilometers}
                          onChange={(event) => updateFormField('carEstimatedKilometers', event.target.value)}
                          placeholder="Ejemplo: 900"
                        />
                      </div>
                      <div className="travel-field">
                        <label>Recorrido estimado</label>
                        <input
                          className="input-field"
                          value={formData.carRouteDescription}
                          onChange={(event) => updateFormField('carRouteDescription', event.target.value)}
                          placeholder="Ejemplo: AVIS POLANCO, CDMX - PLATON SANCHEZ, VERACRUZ"
                        />
                      </div>
                    </div>

                    <small className="travel-hint" style={{ display: 'block', marginTop: '0.8rem' }}>
                      Si existe vuelo, puedes ajustar la sucursal segun el aeropuerto o la ciudad real de llegada.
                    </small>
                  </section>
                )}
              </>
            )}

            {step === 'search' && (
              <>
                <section className="travel-form-section">
                  <h3>Busqueda de vuelos con score operativo</h3>
                  <p>
                    Los resultados priorizan compatibilidad con la ventana del servicio, riesgo de escala, costo y
                    conveniencia para la persona que va a intervenir el equipo.
                  </p>
                  <div className="travel-search-toolbar">
                    <div className="travel-pill-row">
                      <span className="travel-badge">Proveedor: {getFlightProviderLabel(searchSession)}</span>
                      <span className="travel-badge">
                        Politica base: MXN {defaultTravelPolicy.maxBudgetMxn.toLocaleString('es-MX')}
                      </span>
                    </div>
                    <button type="button" className="button-primary" onClick={handleSearch} disabled={busy}>
                      {busy ? 'Buscando...' : 'Refrescar busqueda'}
                    </button>
                  </div>
                </section>

                {searchSession ? (
                  <>
                    {isSimulatedFlightProvider(searchSession.provider) && (
                      <div className="travel-banner error">
                        La busqueda actual esta en modo simulacion. Estas opciones sirven para probar el flujo operativo,
                        score y trazabilidad, pero no representan inventario ni tarifas reales.
                      </div>
                    )}
                    {searchSession.pricingMode === 'round_trip_total' && (
                      <div className="travel-banner" style={{ marginBottom: '1rem' }}>
                        Google Flights esta devolviendo <strong>precio total del viaje redondo</strong>. La salida carga
                        primero y los regresos se consultan despues con el token de la ida seleccionada.
                      </div>
                    )}
                    <section className="travel-results-section">
                      <div className="travel-search-toolbar">
                        <h3 style={{ margin: 0 }}>Opciones de ida</h3>
                        <select
                          className="input-field"
                          style={{ maxWidth: '240px' }}
                          value={outboundSort}
                          onChange={(event) => setOutboundSort(event.target.value as FlightSortMode)}
                        >
                          {Object.entries(sortLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {sortedOutbound.length > 0 ? (
                        <div className="travel-results-grid">{sortedOutbound.map(renderOfferCard)}</div>
                      ) : (
                        <div className="travel-banner error" style={{ marginTop: '1rem' }}>
                          No se encontraron salidas operativamente validas para esta ruta y fecha.
                        </div>
                      )}
                    </section>

                    {formData.tripType === 'redondo' && (
                      <section className="travel-results-section">
                        <div className="travel-search-toolbar">
                          <h3 style={{ margin: 0 }}>Opciones de regreso</h3>
                          <select
                            className="input-field"
                            style={{ maxWidth: '240px' }}
                            value={returnSort}
                            onChange={(event) => setReturnSort(event.target.value as FlightSortMode)}
                            disabled={loadingReturnOptions || !returnContextOffer}
                          >
                            {Object.entries(sortLabels).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>
                        {loadingReturnOptions ? (
                          <div className="travel-banner" style={{ marginTop: '1rem' }}>
                            Consultando regresos compatibles con la salida seleccionada...
                          </div>
                        ) : !returnContextOffer ? (
                          <div className="travel-banner" style={{ marginTop: '1rem' }}>
                            Selecciona una ida preferida o respaldo para cargar regresos compatibles desde Google Flights.
                          </div>
                        ) : returnSearchIssue ? (
                          <div className="travel-banner error" style={{ marginTop: '1rem' }}>
                            {returnSearchIssue}
                          </div>
                        ) : (
                          <>
                            <div className="travel-banner" style={{ marginTop: '1rem' }}>
                              Regresos cargados para <strong>{returnContextOffer.airline} {returnContextOffer.flightNumber}</strong>.
                            </div>
                            {sortedReturn.length > 0 ? (
                              <div className="travel-results-grid">{sortedReturn.map(renderOfferCard)}</div>
                            ) : (
                              <div className="travel-banner error" style={{ marginTop: '1rem' }}>
                                No hay regresos compatibles para la salida elegida. Prueba otra opcion de ida.
                              </div>
                            )}
                          </>
                        )}
                      </section>
                    )}
                  </>
                ) : (
                  <div className="travel-banner">
                    Todavia no hay busqueda ejecutada. Completa la solicitud y usa “Buscar vuelos” para generar
                    opciones recomendadas.
                  </div>
                )}
              </>
            )}

            {step === 'selection' && (
              <>
                <section className="travel-form-section">
                  <h3>Seleccion operativa</h3>
                  <p>
                    Define opcion preferida y respaldo para que administracion tenga una ruta principal y una alternativa
                    inmediata si cambia disponibilidad o tarifa.
                  </p>
                  {formData.tripType === 'redondo' && returnContextOffer && (
                    <div className="travel-banner" style={{ marginTop: '1rem' }}>
                      Los regresos visibles corresponden a la salida seleccionada: <strong>{returnContextOffer.airline} {returnContextOffer.flightNumber}</strong>.
                    </div>
                  )}
                  <div className="travel-selection-grid">
                    {renderSelectionBlock(
                      'Ida preferida',
                      preferredOutbound,
                      'Selecciona una opcion preferida de ida en la etapa de busqueda.',
                    )}
                    {renderSelectionBlock(
                      'Ida respaldo',
                      backupOutbound,
                      'Selecciona una opcion de respaldo de ida.',
                    )}
                    {formData.tripType === 'redondo' &&
                      renderSelectionBlock(
                        'Regreso preferido',
                        preferredReturn,
                        'Selecciona una opcion preferida de regreso.',
                      )}
                    {formData.tripType === 'redondo' &&
                      renderSelectionBlock(
                        'Regreso respaldo',
                        backupReturn,
                        'Selecciona una opcion de respaldo de regreso.',
                      )}
                  </div>
                </section>

                <section className="travel-form-section">
                  <h3>Mensaje para reserva</h3>
                  <p>Este texto se entrega a la persona administrativa para reducir preguntas y tiempos muertos.</p>
                  <div className="travel-field">
                    <label>Comentario adicional para quien reserva</label>
                    <textarea
                      className="input-field"
                      value={selections.adminMessage}
                      onChange={(event) =>
                        setSelections((current) => ({
                          ...current,
                          adminMessage: event.target.value,
                        }))
                      }
                      placeholder="Ejemplo: priorizar directo aunque cueste hasta MXN 1,500 extra si evita perder la ventana con el cliente."
                    />
                  </div>
                </section>
              </>
            )}

            {step === 'summary' && (
              <>
                {summary ? (
                  <div className="travel-summary-shell">
                    <div className="travel-summary-card">
                      <h3>Solicitud administrativa lista para reservar</h3>
                      <p style={{ color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                        Este resumen ya integra datos del ingeniero, servicio, cliente, ruta, score y alternativas.
                      </p>
                      <div className="travel-grid-2" style={{ marginTop: '1rem' }}>
                        <div className="travel-field">
                          <label>Ingeniero</label>
                          <strong>{summary.engineerLabel}</strong>
                        </div>
                        <div className="travel-field">
                          <label>Servicio</label>
                          <strong>{summary.serviceLabel}</strong>
                        </div>
                        <div className="travel-field">
                          <label>Ruta</label>
                          <strong>{summary.routeLabel}</strong>
                        </div>
                        <div className="travel-field">
                          <label>Urgencia</label>
                          <div className="travel-pill-row">
                            <span className="travel-badge" style={{ color: getPriorityBadge(formData.priority).color }}>
                              {summary.urgencyLabel}
                            </span>
                            <span className="travel-badge">Estimado {summary.currency} {summary.estimatedTotalCost.toLocaleString('es-MX')}</span>
                          </div>
                        </div>
                      </div>

                      <div className="travel-grid-2" style={{ marginTop: '1rem' }}>
                        {formData.requiresFlight ? (
                          <>
                            {renderSelectionBlock('Vuelo preferido de ida', summary.outboundPreferred, 'Sin seleccion')}
                            {renderSelectionBlock('Vuelo respaldo de ida', summary.outboundBackup, 'Sin seleccion')}
                            {formData.tripType === 'redondo' &&
                              renderSelectionBlock('Vuelo preferido de regreso', summary.returnPreferred, 'Sin seleccion')}
                            {formData.tripType === 'redondo' &&
                              renderSelectionBlock('Vuelo respaldo de regreso', summary.returnBackup, 'Sin seleccion')}
                          </>
                        ) : (
                          <div className="travel-banner" style={{ gridColumn: '1 / -1', marginTop: 0 }}>
                            Esta solicitud no requiere vuelo. La administracion recibira el contexto del servicio, la
                            urgencia, la direccion, el contacto en sitio y si requiere renta de automovil.
                          </div>
                        )}
                      </div>

                      <div className="travel-banner" style={{ marginTop: '1rem' }}>
                        <strong>Compatibilidad y riesgo:</strong> {summary.riskSummary}
                        {summary.compatibilityNotes.length > 0 && (
                          <div style={{ marginTop: '0.6rem' }}>
                            {summary.compatibilityNotes.map((note) => (
                              <div key={note}>• {note}</div>
                            ))}
                          </div>
                        )}
                      </div>

                      {isSimulatedFlightProvider(searchSession?.provider) && (
                        <div className="travel-banner error" style={{ marginTop: '1rem' }}>
                          Referencia simulada: antes de comprar o enviar a reserva externa, valida disponibilidad, aerolinea,
                          horario y tarifa en un proveedor real.
                        </div>
                      )}

                      {formData.requiresCar && (
                        <div className="travel-summary-card" style={{ marginTop: '1rem' }}>
                          <h3>Formato de renta de auto</h3>
                          <div className="travel-grid-2" style={{ marginTop: '1rem' }}>
                            <div className="travel-field">
                              <label>Recoger auto</label>
                              <strong>{formData.carPickupLocation || 'Sin definir'}</strong>
                              <small>{formData.carPickupDate || 'Sin fecha'} {formData.carPickupTime || ''}</small>
                            </div>
                            <div className="travel-field">
                              <label>Entregar auto</label>
                              <strong>{formData.carDropoffLocation || 'Sin definir'}</strong>
                              <small>{formData.carDropoffDate || 'Sin fecha'} {formData.carDropoffTime || ''}</small>
                            </div>
                            <div className="travel-field">
                              <label>Kilometraje estimado</label>
                              <strong>{formData.carEstimatedKilometers || 'Sin definir'}</strong>
                            </div>
                            <div className="travel-field">
                              <label>Recorrido</label>
                              <strong>{formData.carRouteDescription || 'Sin definir'}</strong>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="travel-request-card">
                      <h3>Plantilla automatica para reserva</h3>
                      <pre>{summary.messageText}</pre>
                    </div>
                  </div>
                ) : (
                  <div className="travel-banner error">
                    {summaryBlockingErrors.length > 0 ? (
                      <div>
                        <div>El resumen todavia no puede generarse porque falta completar lo siguiente:</div>
                        <div style={{ marginTop: '0.6rem' }}>
                          {summaryBlockingErrors.map((error) => (
                            <div key={error}>• {error}</div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      'El resumen todavia no puede generarse porque faltan datos operativos o selecciones requeridas.'
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <footer className="travel-actions">
            <div className="travel-actions-group">
              <button type="button" className="button-primary inactive" onClick={onClose}>
                Cerrar
              </button>
              <button
                type="button"
                className="button-primary inactive"
                onClick={handleSaveDraft}
                disabled={busy || loadingReturnOptions}
              >
                Guardar borrador
              </button>
            </div>

            <div className="travel-actions-group">
              {step === 'request' && (
                <button
                  type="button"
                  className="button-primary"
                  onClick={handleSearch}
                  disabled={busy || loadingReturnOptions}
                >
                  {busy
                    ? 'Procesando...'
                    : formData.requiresFlight
                      ? isFlightSearchEnabled()
                        ? 'Buscar vuelos'
                        : 'Busqueda integrada desactivada'
                      : 'Preparar solicitud'}
                </button>
              )}

              {step === 'search' && formData.requiresFlight && (
                <>
                  <button type="button" className="button-primary inactive" onClick={() => setStep('request')}>
                    Volver a solicitud
                  </button>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => setStep('selection')}
                    disabled={loadingReturnOptions}
                  >
                    Continuar a seleccion
                  </button>
                </>
              )}

              {step === 'selection' && formData.requiresFlight && (
                <>
                  <button type="button" className="button-primary inactive" onClick={() => setStep('search')}>
                    Volver a resultados
                  </button>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={handlePrepareSummary}
                    disabled={loadingReturnOptions}
                  >
                    Generar solicitud final
                  </button>
                </>
              )}

              {step === 'summary' && (
                <>
                  <button
                    type="button"
                    className="button-primary inactive"
                    onClick={() => setStep(formData.requiresFlight ? 'selection' : 'request')}
                  >
                    {formData.requiresFlight ? 'Ajustar seleccion' : 'Editar solicitud'}
                  </button>
                  <button type="button" className="button-primary inactive" onClick={handleCopy} disabled={!summary}>
                    Copiar
                  </button>
                  <button type="button" className="button-primary inactive" onClick={handleExport} disabled={!summary}>
                    Exportar
                  </button>
                  <button type="button" className="button-primary inactive" onClick={openEmail} disabled={!summary}>
                    Email
                  </button>
                  <button type="button" className="button-primary inactive" onClick={openWhatsApp} disabled={!summary}>
                    WhatsApp
                  </button>
                  <button type="button" className="button-primary" onClick={handleSubmitRequest} disabled={busy || !summary}>
                    {busy ? 'Enviando...' : 'Enviar solicitud'}
                  </button>
                </>
              )}
            </div>
          </footer>
        </section>

        {modalAlert && (
          <div className="travel-alert-overlay" onClick={() => setModalAlert(null)}>
            <div className={`travel-alert-card ${modalAlert.tone}`} onClick={(event) => event.stopPropagation()}>
              <div className="travel-alert-kicker">
                {modalAlert.tone === 'error' ? 'Atencion' : modalAlert.tone === 'success' ? 'Completado' : 'Aviso'}
              </div>
              <h3>{modalAlert.title}</h3>
              <div className="travel-alert-messages">
                {modalAlert.messages.map((message) => (
                  <div key={message}>• {message}</div>
                ))}
              </div>
              <button type="button" className="travel-alert-close" onClick={() => setModalAlert(null)}>
                Continuar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
