import { useEffect, useMemo, useRef, useState } from 'react';
import './EscalatedAdvisory.css';
import { supabase } from '../supabaseClient';
import { stripPlaneacionMeta, type EquipmentSummary, type ProfileSummary } from './servicesPlanning';
import {
  buildChemistryDraft,
  CHEMISTRY_GUIDE_MATERIALS,
  CHEMISTRY_OUTCOME_LABELS,
  type ChemistryDraftFields,
  type ChemistryMaterialKey,
  type ChemistryOutcome,
} from './escalatedAdvisoryChemistry';

type AdvisoryArea = 'ingenieria' | 'quimica';
type AdvisoryStatus = 'solicitada' | 'en_revision' | 'asesorada' | 'cerrada';

interface AdvisoryTicketSummary {
  id: string;
  asunto: string;
  descripcion: string | null;
  estado: string;
  creado_en: string;
  numero_serie_equipo?: string | null;
  nombre_cliente_guest?: string | null;
}

interface AdvisoryRecord {
  id: string;
  ticket_id: string | null;
  solicitante_id: string | null;
  solicitante_nombre_snapshot: string | null;
  plataforma_snapshot: string | null;
  actividad: string | null;
  averia: string | null;
  detalle_averia: string | null;
  refacciones_utilizadas: string | null;
  bibliografia_consultada: string | null;
  area: AdvisoryArea;
  estado: AdvisoryStatus;
  pasos_seguidos: string | null;
  ajustes_realizados: string | null;
  acciones_tomadas: string | null;
  consulta_escalada: string;
  respuesta_trainer: string | null;
  respondida_por_id: string | null;
  respondida_en: string | null;
  creado_en: string;
  actualizado_en: string;
}

interface AdvisoryNotificationRecord {
  id: string;
  asesoria_id: string;
  destinatario_id: string;
  leida_en: string | null;
  creado_en: string;
}

interface AdvisoryRoutingSetting {
  area: AdvisoryArea;
  weekday_assignee_names: string[] | null;
  weekend_assignee_names: string[] | null;
}

interface AdvisoryFeedback {
  tone: 'success' | 'error' | 'info';
  message: string;
}

interface AdvisoryMetricRow {
  key: string;
  label: string;
  value: number;
}

interface AdvisoryRequesterInsightRow {
  key: string;
  label: string;
  total: number;
  topTypes: AdvisoryMetricRow[];
}

interface EscalatedAdvisoryProps {
  onNotificationCountChange?: (count: number) => void;
}

const STAFF_ROLES = new Set(['admin', 'tecnico']);

const AREA_LABELS: Record<AdvisoryArea, string> = {
  ingenieria: 'Ingeniería',
  quimica: 'Química',
};

const STATUS_LABELS: Record<AdvisoryStatus, string> = {
  solicitada: 'Solicitada',
  en_revision: 'En revisión',
  asesorada: 'Asesorada',
  cerrada: 'Cerrada',
};

const DEFAULT_ADVISORY_ROUTING_NAMES: Record<AdvisoryArea, { weekday: string[]; weekend: string[] }> = {
  ingenieria: {
    weekday: ['Francisco', 'Hector Cortés'],
    weekend: ['Diego Navarro'],
  },
  quimica: {
    weekday: ['Martha'],
    weekend: ['Martha'],
  },
};

const STATUS_TONE: Record<
  AdvisoryStatus,
  { background: string; color: string; border: string; surface: string; expandedSurface: string; reportSurface: string }
> = {
  solicitada: {
    background: 'rgba(243, 39, 53, 0.14)',
    color: '#9d2432',
    border: 'rgba(243, 39, 53, 0.22)',
    surface:
      'radial-gradient(circle at top right, rgba(243, 39, 53, 0.1), transparent 34%), linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(255, 246, 247, 0.92))',
    expandedSurface: 'linear-gradient(180deg, rgba(255, 251, 251, 0.98), rgba(252, 246, 247, 0.95))',
    reportSurface: 'linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(255, 249, 250, 0.96))',
  },
  en_revision: {
    background: 'rgba(255, 196, 94, 0.18)',
    color: '#8f5b00',
    border: 'rgba(255, 196, 94, 0.3)',
    surface:
      'radial-gradient(circle at top right, rgba(255, 196, 94, 0.12), transparent 34%), linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(255, 251, 241, 0.92))',
    expandedSurface: 'linear-gradient(180deg, rgba(255, 253, 248, 0.98), rgba(253, 249, 238, 0.95))',
    reportSurface: 'linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(255, 252, 245, 0.96))',
  },
  asesorada: {
    background: 'rgba(76, 207, 147, 0.18)',
    color: '#187244',
    border: 'rgba(76, 207, 147, 0.26)',
    surface:
      'radial-gradient(circle at top right, rgba(76, 207, 147, 0.11), transparent 34%), linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(244, 252, 248, 0.92))',
    expandedSurface: 'linear-gradient(180deg, rgba(248, 255, 251, 0.98), rgba(241, 250, 246, 0.95))',
    reportSurface: 'linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(247, 255, 251, 0.96))',
  },
  cerrada: {
    background: 'rgba(124, 136, 149, 0.16)',
    color: '#546272',
    border: 'rgba(124, 136, 149, 0.24)',
    surface:
      'radial-gradient(circle at top right, rgba(124, 136, 149, 0.08), transparent 34%), linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(247, 249, 251, 0.92))',
    expandedSurface: 'linear-gradient(180deg, rgba(250, 252, 254, 0.98), rgba(244, 247, 250, 0.95))',
    reportSurface: 'linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(248, 250, 252, 0.96))',
  },
};

const normalizeText = (value: string | null | undefined) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const getPlainTicketDescription = (value: string | null | undefined) => stripPlaneacionMeta(value || '').trim();

const getTicketAveriaSuggestion = (ticket: AdvisoryTicketSummary | null) => {
  if (!ticket) {
    return '';
  }

  const subject = ticket.asunto
    .replace(/^\[[^\]]+\]\s*/g, '')
    .replace(/^reporte de falla:\s*/i, '')
    .trim();

  if (subject) {
    return subject;
  }

  return getPlainTicketDescription(ticket.descripcion).split('\n')[0]?.trim() || '';
};

const getTicketDetailSuggestion = (ticket: AdvisoryTicketSummary | null) => {
  if (!ticket) {
    return '';
  }

  return getPlainTicketDescription(ticket.descripcion);
};

const isWeekendDate = (value: Date | string | null | undefined) => {
  if (!value) {
    return false;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const day = date.getDay();
  return day === 0 || day === 6;
};

const inferAdvisoryAreaFromTicket = (ticket: AdvisoryTicketSummary | null): AdvisoryArea => {
  if (!ticket) {
    return 'ingenieria';
  }

  const haystack = normalizeText(`${ticket.asunto}\n${ticket.descripcion || ''}`);
  if (haystack.includes('quimic')) {
    return 'quimica';
  }

  if (haystack.includes('ingenier')) {
    return 'ingenieria';
  }

  return 'ingenieria';
};

const inferAdvisoryAreaFromEmployeeType = (employeeType: string | null | undefined): AdvisoryArea | null => {
  const haystack = normalizeText(employeeType);

  if (!haystack) {
    return null;
  }

  if (haystack.includes('quim')) {
    return 'quimica';
  }

  if (haystack.includes('ingen')) {
    return 'ingenieria';
  }

  return null;
};

const formatDateTimeLabel = (value: string | null | undefined) => {
  if (!value) {
    return 'Sin fecha';
  }

  return new Date(value).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const buildTicketOptionLabel = (ticket: AdvisoryTicketSummary) => {
  const serial = ticket.numero_serie_equipo?.trim() ? ` · Serie ${ticket.numero_serie_equipo}` : '';
  return `${ticket.asunto}${serial} · ${formatDateTimeLabel(ticket.creado_en)}`;
};

const sortProfilesByName = (profiles: ProfileSummary[]) =>
  [...profiles].sort((left, right) => (left.nombre_completo || '').localeCompare(right.nombre_completo || '', 'es'));

const sortMetricRows = (rows: AdvisoryMetricRow[]) =>
  [...rows].sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'es'));

const capMetricRows = (rows: AdvisoryMetricRow[], limit = 6) => sortMetricRows(rows).slice(0, limit);

function ChemistryIcon({ materialKey }: { materialKey: ChemistryMaterialKey }) {
  switch (materialKey) {
    case 'control':
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path
            d="M32 8 14 14v16c0 13.2 7.9 22.8 18 26 10.1-3.2 18-12.8 18-26V14L32 8Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <path d="m24.5 32 5.4 5.4L40.5 26.8" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'calibrador':
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M14 17h36" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M14 32h36" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M14 47h36" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="24" cy="17" r="5.5" fill="white" stroke="currentColor" strokeWidth="3.5" />
          <circle cx="40" cy="32" r="5.5" fill="white" stroke="currentColor" strokeWidth="3.5" />
          <circle cx="30" cy="47" r="5.5" fill="white" stroke="currentColor" strokeWidth="3.5" />
        </svg>
      );
    case 'blanco':
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="18" fill="none" stroke="currentColor" strokeWidth="3.5" />
          <circle cx="32" cy="32" r="6.5" fill="none" stroke="currentColor" strokeWidth="3.5" />
          <path d="M8 32h9M47 32h9M32 8v9M32 47v9" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      );
    case 'muestra':
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path
            d="M24 10h16M28 10v14l-10 18a9 9 0 0 0 7.8 13h12.4A9 9 0 0 0 46 42L36 24V10"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M22.5 41c2.7-1.5 5.4-2.1 8.1-1.7 2.6.4 4.9 1.8 6.9 4.2" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

export default function EscalatedAdvisory({ onNotificationCountChange }: EscalatedAdvisoryProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<AdvisoryFeedback | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [tickets, setTickets] = useState<AdvisoryTicketSummary[]>([]);
  const [equipments, setEquipments] = useState<EquipmentSummary[]>([]);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [advisories, setAdvisories] = useState<AdvisoryRecord[]>([]);
  const [notifications, setNotifications] = useState<AdvisoryNotificationRecord[]>([]);
  const [routingSettings, setRoutingSettings] = useState<AdvisoryRoutingSetting[]>([]);
  const [activeAdvisoryId, setActiveAdvisoryId] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [selectedArea, setSelectedArea] = useState<AdvisoryArea>('ingenieria');
  const [pasosSeguidos, setPasosSeguidos] = useState('');
  const [ajustesRealizados, setAjustesRealizados] = useState('');
  const [accionesTomadas, setAccionesTomadas] = useState('');
  const [averia, setAveria] = useState('');
  const [detalleAveria, setDetalleAveria] = useState('');
  const [refaccionesUtilizadas, setRefaccionesUtilizadas] = useState('');
  const [bibliografiaConsultada, setBibliografiaConsultada] = useState('');
  const [consultaEscalada, setConsultaEscalada] = useState('');
  const [selectedChemistryMaterialKey, setSelectedChemistryMaterialKey] = useState<ChemistryMaterialKey | null>(null);
  const [selectedChemistryIssueIds, setSelectedChemistryIssueIds] = useState<string[]>([]);
  const [chemistryNotes, setChemistryNotes] = useState('');
  const [chemistryOutcome, setChemistryOutcome] = useState<ChemistryOutcome>('sin_solucion');
  const [responseDrafts, setResponseDrafts] = useState<Record<string, { estado: AdvisoryStatus; respuesta: string }>>(
    {},
  );
  const chemistryAutofillRef = useRef<ChemistryDraftFields | null>(null);
  const areaInitializedRef = useRef(false);

  const isStaff = STAFF_ROLES.has(currentRole || '');

  const visibleTickets = useMemo(
    () =>
      tickets.filter(
        (ticket) => ticket.estado !== 'cerrado' && !ticket.asunto.trim().toUpperCase().startsWith('[PLAN]'),
      ),
    [tickets],
  );

  const selectedTicket = useMemo(
    () => visibleTickets.find((ticket) => ticket.id === selectedTicketId) || null,
    [selectedTicketId, visibleTickets],
  );

  const selectedChemistryMaterial = useMemo(
    () => CHEMISTRY_GUIDE_MATERIALS.find((material) => material.key === selectedChemistryMaterialKey) || null,
    [selectedChemistryMaterialKey],
  );

  const selectedChemistryIssues = useMemo(
    () =>
      selectedChemistryMaterial?.issues.filter((issue) => selectedChemistryIssueIds.includes(issue.id)) || [],
    [selectedChemistryIssueIds, selectedChemistryMaterial],
  );

  useEffect(() => {
    setAveria(getTicketAveriaSuggestion(selectedTicket));
    setDetalleAveria(getTicketDetailSuggestion(selectedTicket));
  }, [selectedTicketId]);

  const staffProfiles = useMemo(
    () => sortProfilesByName(profiles.filter((profile) => STAFF_ROLES.has(profile.rol || ''))),
    [profiles],
  );

  const profileById = useMemo(() => {
    const entries = profiles.map((profile) => [profile.id, profile] as const);
    return new Map(entries);
  }, [profiles]);

  const equipmentBySerial = useMemo(() => {
    const map = new Map<string, EquipmentSummary>();
    equipments.forEach((equipment) => {
      const normalizedSerial = equipment.numero_serie?.trim();
      if (normalizedSerial && !map.has(normalizedSerial)) {
        map.set(normalizedSerial, equipment);
      }
    });
    return map;
  }, [equipments]);

  const currentRequesterProfile = useMemo(
    () => (currentUserId ? profileById.get(currentUserId) || null : null),
    [currentUserId, profileById],
  );

  const selectedEquipment = useMemo(() => {
    if (!selectedTicket?.numero_serie_equipo) {
      return null;
    }

    return equipmentBySerial.get(selectedTicket.numero_serie_equipo.trim()) || null;
  }, [equipmentBySerial, selectedTicket]);

  const selectedPlatform = selectedEquipment?.modelo?.trim() || '';

  const selectedPlatformStatusLabel = useMemo(() => {
    if (!selectedTicket?.numero_serie_equipo) {
      return 'Sin número de serie en el ticket';
    }

    if (!selectedEquipment) {
      return 'Serie no encontrada en equipos';
    }

    if (!selectedPlatform) {
      return 'Equipo encontrado sin modelo capturado';
    }

    return selectedPlatform;
  }, [selectedEquipment, selectedPlatform, selectedTicket]);

  const chemistryDraft = useMemo(() => {
    if (!selectedChemistryMaterial || selectedChemistryIssues.length === 0) {
      return null;
    }

    return buildChemistryDraft({
      material: selectedChemistryMaterial,
      issues: selectedChemistryIssues,
      notes: chemistryNotes,
      outcome: chemistryOutcome,
      ticket: {
        subject: selectedTicket?.asunto,
        serial: selectedTicket?.numero_serie_equipo,
        platform: selectedPlatform || selectedPlatformStatusLabel,
      },
    });
  }, [
    chemistryNotes,
    chemistryOutcome,
    selectedChemistryIssues,
    selectedChemistryMaterial,
    selectedPlatform,
    selectedPlatformStatusLabel,
    selectedTicket?.asunto,
    selectedTicket?.numero_serie_equipo,
  ]);

  const ticketById = useMemo(() => {
    const entries = tickets.map((ticket) => [ticket.id, ticket] as const);
    return new Map(entries);
  }, [tickets]);

  const notificationsByAdvisoryId = useMemo(() => {
    const map = new Map<string, AdvisoryNotificationRecord[]>();

    notifications.forEach((notification) => {
      const bucket = map.get(notification.asesoria_id);
      if (bucket) {
        bucket.push(notification);
      } else {
        map.set(notification.asesoria_id, [notification]);
      }
    });

    return map;
  }, [notifications]);

  const routingSettingsByArea = useMemo(() => {
    const entries = routingSettings.map((setting) => [setting.area, setting] as const);
    return new Map(entries);
  }, [routingSettings]);

  const resolveProfilesFromRoutingNames = (names: string[]) => {
    const resolved = names
      .map((name) => {
        const normalizedName = normalizeText(name);
        return (
          staffProfiles.find((profile) => {
            const profileName = normalizeText(profile.nombre_completo);
            return (
              profileName === normalizedName ||
              profileName.startsWith(`${normalizedName} `) ||
              profileName.endsWith(` ${normalizedName}`) ||
              profileName.includes(` ${normalizedName} `)
            );
          }) || null
        );
      })
      .filter((profile): profile is ProfileSummary => Boolean(profile));

    return resolved.filter(
      (profile, index, list) => list.findIndex((candidate) => candidate.id === profile.id) === index,
    );
  };

  const getRoutingNamesForArea = (area: AdvisoryArea, schedule: 'weekday' | 'weekend') => {
    const setting = routingSettingsByArea.get(area);
    const configuredNames =
      schedule === 'weekend' ? setting?.weekend_assignee_names : setting?.weekday_assignee_names;

    if (configuredNames && configuredNames.length > 0) {
      return configuredNames;
    }

    return DEFAULT_ADVISORY_ROUTING_NAMES[area][schedule];
  };

  const engineeringWeekdayRotationProfiles = useMemo(
    () => resolveProfilesFromRoutingNames(getRoutingNamesForArea('ingenieria', 'weekday')),
    [routingSettingsByArea, staffProfiles],
  );

  const engineeringWeekendProfiles = useMemo(
    () => resolveProfilesFromRoutingNames(getRoutingNamesForArea('ingenieria', 'weekend')),
    [routingSettingsByArea, staffProfiles],
  );

  const chemistryRoutingProfiles = useMemo(
    () => resolveProfilesFromRoutingNames(getRoutingNamesForArea('quimica', 'weekday')),
    [routingSettingsByArea, staffProfiles],
  );

  const advisoryById = useMemo(() => {
    const entries = advisories.map((advisory) => [advisory.id, advisory] as const);
    return new Map(entries);
  }, [advisories]);

  const unreadNotificationsForMe = useMemo(
    () =>
      notifications.filter((notification) => notification.destinatario_id === currentUserId && !notification.leida_en)
        .length,
    [currentUserId, notifications],
  );

  useEffect(() => {
    onNotificationCountChange?.(unreadNotificationsForMe);
  }, [onNotificationCountChange, unreadNotificationsForMe]);

  const myAssignedAdvisories = useMemo(
    () =>
      advisories.filter((advisory) =>
        notifications.some(
          (notification) =>
            notification.asesoria_id === advisory.id && notification.destinatario_id === currentUserId,
        ),
      ),
    [advisories, currentUserId, notifications],
  );

  const myRequestedAdvisories = useMemo(
    () => advisories.filter((advisory) => advisory.solicitante_id === currentUserId),
    [advisories, currentUserId],
  );

  const assignedAdvisoryIdsForCurrentUser = useMemo(() => {
    const advisoryIds = notifications
      .filter((notification) => notification.destinatario_id === currentUserId)
      .map((notification) => notification.asesoria_id);

    return new Set(advisoryIds);
  }, [currentUserId, notifications]);

  const roleScopedAdvisories = useMemo(() => {
    if (currentRole !== 'tecnico') {
      return advisories;
    }

    return advisories.filter((advisory) => assignedAdvisoryIdsForCurrentUser.has(advisory.id));
  }, [advisories, assignedAdvisoryIdsForCurrentUser, currentRole]);

  const filteredAdvisories = useMemo(
    () => roleScopedAdvisories.filter((advisory) => advisory.area === selectedArea),
    [roleScopedAdvisories, selectedArea],
  );

  const areaUnreadNotificationsForMe = useMemo(
    () =>
      notifications.filter(
        (notification) =>
          notification.destinatario_id === currentUserId &&
          !notification.leida_en &&
          advisoryById.get(notification.asesoria_id)?.area === selectedArea,
      ).length,
    [advisoryById, currentUserId, notifications, selectedArea],
  );

  const areaAssignedAdvisories = useMemo(
    () =>
      myAssignedAdvisories.filter(
        (advisory) =>
          advisory.area === selectedArea &&
          (currentRole !== 'tecnico' || assignedAdvisoryIdsForCurrentUser.has(advisory.id)),
      ),
    [assignedAdvisoryIdsForCurrentUser, currentRole, myAssignedAdvisories, selectedArea],
  );

  const areaRequestedAdvisories = useMemo(
    () =>
      myRequestedAdvisories.filter(
        (advisory) =>
          advisory.area === selectedArea &&
          (currentRole !== 'tecnico' || assignedAdvisoryIdsForCurrentUser.has(advisory.id)),
      ),
    [assignedAdvisoryIdsForCurrentUser, currentRole, myRequestedAdvisories, selectedArea],
  );

  const engineeringWeekdayAdvisoriesCount = useMemo(
    () => advisories.filter((advisory) => advisory.area === 'ingenieria' && !isWeekendDate(advisory.creado_en)).length,
    [advisories],
  );

  const currentRoutingIsWeekend = isWeekendDate(new Date());

  const autoRecipientProfiles = useMemo(() => {
    if (selectedArea === 'quimica') {
      return chemistryRoutingProfiles;
    }

    if (currentRoutingIsWeekend) {
      return engineeringWeekendProfiles;
    }

    if (engineeringWeekdayRotationProfiles.length === 0) {
      return [];
    }

    return [
      engineeringWeekdayRotationProfiles[
        engineeringWeekdayAdvisoriesCount % engineeringWeekdayRotationProfiles.length
      ],
    ].filter(Boolean);
  }, [
    chemistryRoutingProfiles,
    currentRoutingIsWeekend,
    engineeringWeekdayAdvisoriesCount,
    engineeringWeekdayRotationProfiles,
    engineeringWeekendProfiles,
    selectedArea,
  ]);

  const autoRecipientIds = useMemo(
    () => autoRecipientProfiles.map((profile) => profile.id),
    [autoRecipientProfiles],
  );

  const isAreaTrainer = useMemo(() => {
    if (!currentRequesterProfile) {
      return false;
    }

    return selectedArea === 'ingenieria'
      ? currentRequesterProfile.trainer_ingenieria === true
      : currentRequesterProfile.trainer_quimica === true;
  }, [currentRequesterProfile, selectedArea]);

  const canViewMetrics = currentRole === 'admin' || isAreaTrainer;

  const metricsScopeAdvisories = useMemo(() => {
    const advisoriesForArea = advisories.filter((advisory) => advisory.area === selectedArea);

    if (currentRole === 'admin') {
      return advisoriesForArea;
    }

    if (!currentUserId || !isAreaTrainer) {
      return [];
    }

    return advisoriesForArea.filter((advisory) => assignedAdvisoryIdsForCurrentUser.has(advisory.id));
  }, [advisories, assignedAdvisoryIdsForCurrentUser, currentRole, currentUserId, isAreaTrainer, selectedArea]);

  const metricsOwnerRows = useMemo(() => {
    if (metricsScopeAdvisories.length === 0) {
      return [];
    }

    if (currentRole !== 'admin' && currentUserId) {
      return [
        {
          key: currentUserId,
          label: currentRequesterProfile?.nombre_completo || 'Mi bandeja',
          value: metricsScopeAdvisories.length,
        },
      ];
    }

    const counts = new Map<string, number>();

    metricsScopeAdvisories.forEach((advisory) => {
      const recipientIds = new Set(
        (notificationsByAdvisoryId.get(advisory.id) || []).map((notification) => notification.destinatario_id),
      );

      recipientIds.forEach((recipientId) => {
        const recipientProfile = profileById.get(recipientId);
        const isTrainerForArea =
          selectedArea === 'ingenieria'
            ? recipientProfile?.trainer_ingenieria === true
            : recipientProfile?.trainer_quimica === true;

        if (!isTrainerForArea) {
          return;
        }

        counts.set(recipientId, (counts.get(recipientId) || 0) + 1);
      });
    });

    return capMetricRows(
      [...counts.entries()].map(([key, value]) => ({
        key,
        label: profileById.get(key)?.nombre_completo || 'Trainer sin nombre',
        value,
      })),
    );
  }, [
    currentRequesterProfile?.nombre_completo,
    currentRole,
    currentUserId,
    metricsScopeAdvisories,
    notificationsByAdvisoryId,
    profileById,
    selectedArea,
  ]);

  const metricsResponderRows = useMemo(() => {
    if (metricsScopeAdvisories.length === 0) {
      return [];
    }

    if (currentRole !== 'admin' && currentUserId) {
      const ownResponses = metricsScopeAdvisories.filter((advisory) => advisory.respondida_por_id === currentUserId).length;
      return [
        {
          key: currentUserId,
          label: currentRequesterProfile?.nombre_completo || 'Mis respuestas',
          value: ownResponses,
        },
      ];
    }

    const counts = new Map<string, number>();

    metricsScopeAdvisories.forEach((advisory) => {
      if (!advisory.respondida_por_id) {
        return;
      }

      counts.set(advisory.respondida_por_id, (counts.get(advisory.respondida_por_id) || 0) + 1);
    });

    return capMetricRows(
      [...counts.entries()].map(([key, value]) => ({
        key,
        label: profileById.get(key)?.nombre_completo || 'Trainer sin nombre',
        value,
      })),
    );
  }, [currentRequesterProfile?.nombre_completo, currentRole, currentUserId, metricsScopeAdvisories, profileById]);

  const metricsRequesterRows = useMemo(
    () =>
      capMetricRows(
        [...metricsScopeAdvisories.reduce((map, advisory) => {
          const key = advisory.solicitante_id || advisory.solicitante_nombre_snapshot || 'sin-solicitante';
          const label =
            advisory.solicitante_nombre_snapshot ||
            (advisory.solicitante_id ? profileById.get(advisory.solicitante_id)?.nombre_completo : null) ||
            'Sin solicitante';

          map.set(key, {
            key,
            label,
            value: (map.get(key)?.value || 0) + 1,
          });

          return map;
        }, new Map<string, AdvisoryMetricRow>()).values()],
      ),
    [metricsScopeAdvisories, profileById],
  );

  const metricsTypeRows = useMemo(
    () =>
      capMetricRows(
        [...metricsScopeAdvisories.reduce((map, advisory) => {
          const label = advisory.averia?.trim() || advisory.actividad?.trim() || 'Sin tipo capturado';
          const key = normalizeText(label) || label;

          map.set(key, {
            key,
            label,
            value: (map.get(key)?.value || 0) + 1,
          });

          return map;
        }, new Map<string, AdvisoryMetricRow>()).values()],
      ),
    [metricsScopeAdvisories],
  );

  const metricsStatusRows = useMemo(
    () =>
      capMetricRows(
        [...metricsScopeAdvisories.reduce((map, advisory) => {
          const key = advisory.estado;
          map.set(key, {
            key,
            label: STATUS_LABELS[advisory.estado],
            value: (map.get(key)?.value || 0) + 1,
          });
          return map;
        }, new Map<string, AdvisoryMetricRow>()).values()],
        4,
      ),
    [metricsScopeAdvisories],
  );

  const metricsRequesterInsightRows = useMemo(() => {
    const rows = new Map<
      string,
      { key: string; label: string; total: number; typeRows: Map<string, AdvisoryMetricRow> }
    >();

    metricsScopeAdvisories.forEach((advisory) => {
      const requesterKey = advisory.solicitante_id || advisory.solicitante_nombre_snapshot || 'sin-solicitante';
      const requesterLabel =
        advisory.solicitante_nombre_snapshot ||
        (advisory.solicitante_id ? profileById.get(advisory.solicitante_id)?.nombre_completo : null) ||
        'Sin solicitante';
      const typeLabel = advisory.averia?.trim() || advisory.actividad?.trim() || 'Sin tipo capturado';
      const typeKey = normalizeText(typeLabel) || typeLabel;

      const currentRow = rows.get(requesterKey) || {
        key: requesterKey,
        label: requesterLabel,
        total: 0,
        typeRows: new Map<string, AdvisoryMetricRow>(),
      };

      currentRow.total += 1;
      currentRow.typeRows.set(typeKey, {
        key: typeKey,
        label: typeLabel,
        value: (currentRow.typeRows.get(typeKey)?.value || 0) + 1,
      });

      rows.set(requesterKey, currentRow);
    });

    return [...rows.values()]
      .map<AdvisoryRequesterInsightRow>((row) => ({
        key: row.key,
        label: row.label,
        total: row.total,
        topTypes: capMetricRows([...row.typeRows.values()], 3),
      }))
      .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label, 'es'))
      .slice(0, 6);
  }, [metricsScopeAdvisories, profileById]);

  const fetchModuleData = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const [
      profileResponse,
      ticketsResponse,
      equipmentsResponse,
      profilesResponse,
      advisoriesResponse,
      notificationsResponse,
      routingSettingsResponse,
    ] = await Promise.all([
      supabase.from('profiles').select('id, rol, employee_type').eq('id', user.id).single(),
      supabase
        .from('tickets')
        .select('id, asunto, descripcion, estado, creado_en, numero_serie_equipo, nombre_cliente_guest')
        .order('creado_en', { ascending: false })
        .limit(250),
      supabase
        .from('equipos')
        .select('numero_serie, modelo, software, firmware, estado, ciudad, municipio'),
      supabase
        .from('profiles')
        .select(
          'id, nombre_completo, employee_number, employee_type, telefono, territorio, rol, recibe_tickets, trainer_ingenieria, trainer_quimica',
        )
        .order('nombre_completo', { ascending: true }),
      supabase
        .from('asesorias_escaladas')
        .select(
          'id, ticket_id, solicitante_id, solicitante_nombre_snapshot, plataforma_snapshot, actividad, averia, detalle_averia, refacciones_utilizadas, bibliografia_consultada, area, estado, pasos_seguidos, ajustes_realizados, acciones_tomadas, consulta_escalada, respuesta_trainer, respondida_por_id, respondida_en, creado_en, actualizado_en',
        )
        .order('creado_en', { ascending: false })
        .limit(120),
      supabase
        .from('asesorias_escaladas_destinatarios')
        .select('id, asesoria_id, destinatario_id, leida_en, creado_en')
        .order('creado_en', { ascending: false })
        .limit(400),
      supabase
        .from('asesorias_escaladas_enrutamiento')
        .select('area, weekday_assignee_names, weekend_assignee_names'),
    ]);

    const firstError =
      profileResponse.error ||
      ticketsResponse.error ||
      equipmentsResponse.error ||
      profilesResponse.error ||
      advisoriesResponse.error ||
      notificationsResponse.error;

    if (firstError) {
      setFeedback({
        tone: 'error',
        message: firstError.message || 'No fue posible cargar el módulo de asesoría escalada.',
      });
      setLoading(false);
      return;
    }

    const currentProfile = profileResponse.data as { rol?: string | null; employee_type?: string | null } | null;
    const defaultArea = inferAdvisoryAreaFromEmployeeType(currentProfile?.employee_type) || 'ingenieria';

    setCurrentUserId(user.id);
    setCurrentRole(currentProfile?.rol || null);
    if (!areaInitializedRef.current) {
      setSelectedArea(defaultArea);
      areaInitializedRef.current = true;
    }
    setTickets((ticketsResponse.data as AdvisoryTicketSummary[] | null) || []);
    setEquipments((equipmentsResponse.data as EquipmentSummary[] | null) || []);
    setProfiles((profilesResponse.data as ProfileSummary[] | null) || []);
    setAdvisories((advisoriesResponse.data as AdvisoryRecord[] | null) || []);
    setNotifications((notificationsResponse.data as AdvisoryNotificationRecord[] | null) || []);
    setRoutingSettings((routingSettingsResponse.data as AdvisoryRoutingSetting[] | null) || []);
    setLoading(false);
  };

  useEffect(() => {
    void fetchModuleData();

    const timer = window.setInterval(() => {
      void fetchModuleData(false);
    }, 45000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (selectedArea !== 'quimica' || !chemistryDraft) {
      return;
    }

    const previousDraft = chemistryAutofillRef.current;
    const shouldReplace = (currentValue: string, previousValue: string | null | undefined) => {
      const normalizedCurrent = currentValue.trim();
      const normalizedPrevious = (previousValue || '').trim();
      return !normalizedCurrent || normalizedCurrent === normalizedPrevious;
    };

    if (shouldReplace(averia, previousDraft?.averia)) {
      setAveria(chemistryDraft.averia);
    }

    if (shouldReplace(detalleAveria, previousDraft?.detalleAveria)) {
      setDetalleAveria(chemistryDraft.detalleAveria);
    }

    if (shouldReplace(pasosSeguidos, previousDraft?.pasosSeguidos)) {
      setPasosSeguidos(chemistryDraft.pasosSeguidos);
    }

    if (shouldReplace(accionesTomadas, previousDraft?.accionesTomadas)) {
      setAccionesTomadas(chemistryDraft.accionesTomadas);
    }

    if (shouldReplace(consultaEscalada, previousDraft?.consultaEscalada)) {
      setConsultaEscalada(chemistryDraft.consultaEscalada);
    }

    chemistryAutofillRef.current = chemistryDraft;
  }, [accionesTomadas, averia, chemistryDraft, consultaEscalada, detalleAveria, pasosSeguidos, selectedArea]);

  const markNotificationsRead = async (advisoryId: string) => {
    if (!currentUserId) {
      return;
    }

    const unreadForThisAdvisory = notifications.filter(
      (notification) =>
        notification.asesoria_id === advisoryId &&
        notification.destinatario_id === currentUserId &&
        !notification.leida_en,
    );

    if (unreadForThisAdvisory.length === 0) {
      return;
    }

    const notificationIds = unreadForThisAdvisory.map((notification) => notification.id);
    const timestamp = new Date().toISOString();

    const { error } = await supabase
      .from('asesorias_escaladas_destinatarios')
      .update({ leida_en: timestamp })
      .in('id', notificationIds);

    if (error) {
      setFeedback({
        tone: 'error',
        message: error.message || 'No se pudieron marcar las notificaciones como leídas.',
      });
      return;
    }

    setNotifications((current) =>
      current.map((notification) =>
        notificationIds.includes(notification.id) ? { ...notification, leida_en: timestamp } : notification,
      ),
    );
  };

  const resetChemistryGuide = () => {
    setSelectedChemistryMaterialKey(null);
    setSelectedChemistryIssueIds([]);
    setChemistryNotes('');
    setChemistryOutcome('sin_solucion');
    chemistryAutofillRef.current = null;
  };

  const resetCreateForm = () => {
    setSelectedTicketId('');
    setPasosSeguidos('');
    setAjustesRealizados('');
    setAccionesTomadas('');
    setAveria('');
    setDetalleAveria('');
    setRefaccionesUtilizadas('');
    setBibliografiaConsultada('');
    setConsultaEscalada('');
    resetChemistryGuide();
  };

  const handleAreaChange = (nextArea: AdvisoryArea) => {
    setActiveAdvisoryId(null);
    setSelectedArea(nextArea);
    if (nextArea !== 'quimica') {
      resetChemistryGuide();
    }
  };

  const handleChemistryMaterialSelect = (materialKey: ChemistryMaterialKey) => {
    setSelectedArea('quimica');
    setSelectedChemistryMaterialKey(materialKey);
    setSelectedChemistryIssueIds([]);
    setChemistryOutcome('sin_solucion');
    setChemistryNotes((current) => (selectedChemistryMaterialKey === materialKey ? current : ''));
  };

  const toggleChemistryIssue = (issueId: string) => {
    setSelectedChemistryIssueIds((current) =>
      current.includes(issueId) ? current.filter((currentId) => currentId !== issueId) : [...current, issueId],
    );
  };

  const applyChemistryDraftToForm = (force = false) => {
    if (!chemistryDraft) {
      return;
    }

    if (force || !averia.trim()) {
      setAveria(chemistryDraft.averia);
    }

    if (force || !detalleAveria.trim()) {
      setDetalleAveria(chemistryDraft.detalleAveria);
    }

    if (force || !pasosSeguidos.trim()) {
      setPasosSeguidos(chemistryDraft.pasosSeguidos);
    }

    if (force || !accionesTomadas.trim()) {
      setAccionesTomadas(chemistryDraft.accionesTomadas);
    }

    if (force || !consultaEscalada.trim()) {
      setConsultaEscalada(chemistryDraft.consultaEscalada);
    }

    chemistryAutofillRef.current = chemistryDraft;
  };

  const handleCreateAdvisory = async (event: React.FormEvent) => {
    event.preventDefault();
    setFeedback(null);

    if (!currentUserId) {
      setFeedback({ tone: 'error', message: 'No hay sesión activa para registrar la solicitud.' });
      return;
    }

    if (!selectedTicketId) {
      setFeedback({ tone: 'error', message: 'Selecciona un ticket para escalar la asesoría.' });
      return;
    }

    if (autoRecipientIds.length === 0) {
      setFeedback({ tone: 'error', message: 'No hay destinatarios automáticos resueltos para esta asesoría.' });
      return;
    }

    if (!consultaEscalada.trim()) {
      setFeedback({ tone: 'error', message: 'Describe qué necesitas validar con el trainer.' });
      return;
    }

    setSaving(true);

    const advisoryPayload = {
      ticket_id: selectedTicketId,
      solicitante_id: currentUserId,
      solicitante_nombre_snapshot: currentRequesterProfile?.nombre_completo?.trim() || null,
      plataforma_snapshot: selectedPlatform || null,
      actividad: AREA_LABELS[selectedArea],
      averia: averia.trim() || getTicketAveriaSuggestion(selectedTicket) || null,
      detalle_averia: detalleAveria.trim() || getTicketDetailSuggestion(selectedTicket) || null,
      refacciones_utilizadas: refaccionesUtilizadas.trim() || null,
      bibliografia_consultada: bibliografiaConsultada.trim() || null,
      area: selectedArea,
      estado: 'solicitada' as AdvisoryStatus,
      pasos_seguidos: pasosSeguidos.trim() || null,
      ajustes_realizados: ajustesRealizados.trim() || null,
      acciones_tomadas: accionesTomadas.trim() || null,
      consulta_escalada: consultaEscalada.trim(),
    };

    const { data: insertedAdvisory, error: insertError } = await supabase
      .from('asesorias_escaladas')
      .insert(advisoryPayload)
      .select('id')
      .single();

    if (insertError || !insertedAdvisory) {
      setSaving(false);
      setFeedback({
        tone: 'error',
        message: insertError?.message || 'No se pudo registrar la asesoría escalada.',
      });
      return;
    }

    const notificationsPayload = autoRecipientIds.map((profileId) => ({
      asesoria_id: insertedAdvisory.id as string,
      destinatario_id: profileId,
    }));

    const { error: notificationError } = await supabase
      .from('asesorias_escaladas_destinatarios')
      .insert(notificationsPayload);

    if (notificationError) {
      setSaving(false);
      setFeedback({
        tone: 'error',
        message: notificationError.message || 'La asesoría se creó, pero no se pudieron generar las notificaciones.',
      });
      return;
    }

    resetCreateForm();
    setActiveAdvisoryId(insertedAdvisory.id as string);
    setSaving(false);
    setFeedback({
      tone: 'success',
      message: `La asesoría se escaló a ${autoRecipientIds.length} destinatario(s).`,
    });
    await fetchModuleData(false);
  };

  const updateResponseDraft = (advisoryId: string, patch: Partial<{ estado: AdvisoryStatus; respuesta: string }>) => {
    setResponseDrafts((current) => {
      const advisory = advisories.find((item) => item.id === advisoryId);
      const base = current[advisoryId] || {
        estado: advisory?.estado || 'solicitada',
        respuesta: advisory?.respuesta_trainer || '',
      };

      return {
        ...current,
        [advisoryId]: {
          ...base,
          ...patch,
        },
      };
    });
  };

  const handleOpenAdvisory = async (advisoryId: string) => {
    setActiveAdvisoryId((current) => (current === advisoryId ? null : advisoryId));

    const advisory = advisories.find((item) => item.id === advisoryId);
    if (advisory) {
      setResponseDrafts((current) => ({
        ...current,
        [advisoryId]: {
          estado: current[advisoryId]?.estado || advisory.estado,
          respuesta: current[advisoryId]?.respuesta ?? advisory.respuesta_trainer ?? '',
        },
      }));
    }

    await markNotificationsRead(advisoryId);
  };

  const handleSaveAdvisoryResponse = async (advisoryId: string) => {
    if (!currentUserId) {
      return;
    }

    const draft = responseDrafts[advisoryId];
    if (!draft) {
      return;
    }

    setSaving(true);

    const nextStatus = draft.estado;
    const trimmedResponse = draft.respuesta.trim();
    const timestamp = new Date().toISOString();
    const payload = {
      estado: nextStatus,
      respuesta_trainer: trimmedResponse || null,
      respondida_por_id: trimmedResponse ? currentUserId : null,
      respondida_en: trimmedResponse ? timestamp : null,
      actualizado_en: timestamp,
    };

    const { error } = await supabase.from('asesorias_escaladas').update(payload).eq('id', advisoryId);

    setSaving(false);

    if (error) {
      setFeedback({
        tone: 'error',
        message: error.message || 'No se pudo guardar la actualización de asesoría.',
      });
      return;
    }

    setFeedback({
      tone: 'success',
      message: nextStatus === 'cerrada' ? 'La asesoría quedó cerrada.' : 'La respuesta de asesoría quedó guardada.',
    });
    await fetchModuleData(false);
  };

  if (!isStaff && !loading) {
    return (
      <div className="card" style={{ padding: '1.5rem', background: 'rgba(90, 6, 17, 0.22)', borderColor: 'rgba(186, 0, 13, 0.25)' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>Acceso restringido</h3>
        <p style={{ color: 'var(--text-secondary)' }}>
          Este módulo está disponible solo para personal interno con rol de administración o soporte técnico.
        </p>
      </div>
    );
  }

  const activeAreaLabel = AREA_LABELS[selectedArea];
  const areaContributorLabel = selectedArea === 'quimica' ? 'químico' : 'ingeniero';
  const isTechnician = currentRole === 'tecnico';

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div className="advisory-team-switch" role="tablist" aria-label="Seleccionar vista de asesorías">
        <button
          type="button"
          className={`advisory-team-switch__pill ${selectedArea === 'ingenieria' ? 'is-active' : ''}`}
          onClick={() => handleAreaChange('ingenieria')}
        >
          Ingeniería
        </button>
        <button
          type="button"
          className={`advisory-team-switch__pill advisory-team-switch__pill--chemistry ${selectedArea === 'quimica' ? 'is-active' : ''}`}
          onClick={() => handleAreaChange('quimica')}
        >
          Química
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <div className="card" style={{ padding: '1.35rem' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Notificaciones para mí
          </div>
          <strong style={{ display: 'block', fontSize: '2rem', marginTop: '0.4rem' }}>{areaUnreadNotificationsForMe}</strong>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginTop: '0.3rem' }}>
            Pendientes dentro de la vista de {activeAreaLabel}.
          </p>
        </div>
        <div className="card" style={{ padding: '1.35rem' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {isTechnician ? 'Solicitudes mías visibles' : 'Mis solicitudes'}
          </div>
          <strong style={{ display: 'block', fontSize: '2rem', marginTop: '0.4rem' }}>{areaRequestedAdvisories.length}</strong>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginTop: '0.3rem' }}>
            {isTechnician
              ? `Casos de ${activeAreaLabel.toLowerCase()} que tú escalaste y además te fueron asignados.`
              : `Casos de ${activeAreaLabel.toLowerCase()} escalados desde tus tickets.`}
          </p>
        </div>
        <div className="card" style={{ padding: '1.35rem' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Bandeja asignada
          </div>
          <strong style={{ display: 'block', fontSize: '2rem', marginTop: '0.4rem' }}>{areaAssignedAdvisories.length}</strong>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginTop: '0.3rem' }}>
            Casos de {activeAreaLabel.toLowerCase()} donde apareces como destinatario.
          </p>
        </div>
      </div>

      <div className="card" style={{ padding: '1.65rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ marginBottom: '0.35rem' }}>Escalar asesoría de {activeAreaLabel.toLowerCase()}</h3>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '760px' }}>
              {selectedArea === 'quimica'
                ? 'Selecciona el ticket, arma el contexto por material y envía al equipo químico una explicación ya estructurada.'
                : 'Selecciona el ticket, resume el descarte técnico de campo y dirige la solicitud al equipo de ingeniería para revisión.'}
            </p>
          </div>
          <button type="button" className="button-primary inactive" onClick={() => void fetchModuleData(false)} disabled={loading || saving}>
            Actualizar módulo
          </button>
        </div>

        {feedback ? (
          <div
            className={`advisory-feedback advisory-feedback--${feedback.tone}`}
            style={{ marginBottom: '1rem' }}
          >
            {feedback.message}
          </div>
        ) : null}

        <form onSubmit={handleCreateAdvisory} style={{ display: 'grid', gap: '1rem' }}>
          <div className="advisory-form-grid advisory-form-grid--ticket">
            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', color: 'var(--text-secondary)' }}>Ticket a escalar *</label>
              <select
                className="input-field"
                value={selectedTicketId}
                onChange={(event) => setSelectedTicketId(event.target.value)}
                required
              >
                <option value="">Selecciona un ticket abierto</option>
                {visibleTickets.map((ticket) => (
                  <option key={ticket.id} value={ticket.id}>
                    {buildTicketOptionLabel(ticket)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedArea === 'quimica' ? (
            <section className="advisory-chemistry-shell">
              <div className="advisory-chemistry-header">
                <div>
                  <span className="glass-pill glass-pill--brand">Apartado de química</span>
                  <h4>¿Con qué presentas problemas?</h4>
                  <p>
                    Esta ruta arma el contexto de forma guiada para que el químico escale el caso sin volver a redactar todo desde cero.
                  </p>
                </div>
                {selectedChemistryMaterial ? (
                  <button
                    type="button"
                    className="button-primary inactive advisory-chemistry-reset"
                    onClick={resetChemistryGuide}
                  >
                    Reiniciar ruta
                  </button>
                ) : null}
              </div>

              <div className="advisory-chemistry-step-strip">
                <span className={`advisory-chemistry-step-pill ${!selectedChemistryMaterial ? 'is-active' : 'is-complete'}`}>
                  1. Material
                </span>
                <span className={`advisory-chemistry-step-pill ${selectedChemistryMaterial ? 'is-active' : ''}`}>
                  2. Problema
                </span>
                <span
                  className={`advisory-chemistry-step-pill ${
                    selectedChemistryMaterial && selectedChemistryIssueIds.length > 0 ? 'is-active' : ''
                  }`}
                >
                  3. Borrador
                </span>
              </div>

              <div className="advisory-chemistry-stage-frame">
                <div className="advisory-chemistry-stage" key={selectedChemistryMaterial ? `issues-${selectedChemistryMaterial.key}` : 'materials'}>
                  {!selectedChemistryMaterial ? (
                    <>
                      <div className="advisory-chemistry-stage__intro advisory-chemistry-stage__intro--material">
                        <div>
                          <span className="glass-pill">Paso 1</span>
                          <h5>Selecciona el material</h5>
                          <p>Empieza por control, calibrador, blanco o muestra. Al elegir uno, esta misma zona cambia al siguiente paso.</p>
                        </div>
                      </div>

                      <div className="advisory-chemistry-material-grid">
                        {CHEMISTRY_GUIDE_MATERIALS.map((material, index) => {
                          const isActive = selectedChemistryMaterialKey === material.key;
                          return (
                            <button
                              key={material.key}
                              type="button"
                              className={`advisory-chemistry-material-card ${isActive ? 'is-active' : ''}`}
                              onClick={() => handleChemistryMaterialSelect(material.key)}
                              style={{ animationDelay: `${index * 70}ms` }}
                            >
                              <span className="advisory-chemistry-material-card__icon">
                                <ChemistryIcon materialKey={material.key} />
                              </span>
                              <span className="advisory-chemistry-material-card__copy">
                                <small>{material.kicker}</small>
                                <strong>{material.label}</strong>
                                <p>{material.description}</p>
                                <em>{material.helper}</em>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="advisory-chemistry-stage__intro advisory-chemistry-stage__intro--issue">
                        <div className="advisory-chemistry-stage__selected">
                          <span className="advisory-chemistry-stage__selected-icon">
                            <ChemistryIcon materialKey={selectedChemistryMaterial.key} />
                          </span>
                          <div>
                            <small>{selectedChemistryMaterial.kicker}</small>
                            <h5>{selectedChemistryMaterial.label}</h5>
                            <p>Selecciona una o varias tarjetas que se parezcan a tu caso. El borrador se va actualizando abajo.</p>
                          </div>
                        </div>
                        <div className="advisory-chemistry-stage__meta">
                          <strong>{selectedChemistryIssueIds.length}</strong>
                          <span>problema(s) marcado(s)</span>
                        </div>
                      </div>

                      <div className="advisory-chemistry-issue-grid">
                        {selectedChemistryMaterial.issues.map((issue, index) => {
                          const isSelected = selectedChemistryIssueIds.includes(issue.id);
                          return (
                            <button
                              key={issue.id}
                              type="button"
                              className={`advisory-chemistry-issue-card ${isSelected ? 'is-selected' : ''}`}
                              onClick={() => toggleChemistryIssue(issue.id)}
                              style={{ animationDelay: `${index * 70}ms` }}
                            >
                              <span className="advisory-chemistry-issue-card__kicker">{isSelected ? 'Marcado para escalar' : 'Problema sugerido'}</span>
                              <strong>{issue.title}</strong>
                              <p>{issue.symptom}</p>
                              <div className="advisory-chemistry-issue-card__block">
                                <span>Qué revisar</span>
                                <ul>
                                  {issue.checks.slice(0, 3).map((check) => (
                                    <li key={check}>{check}</li>
                                  ))}
                                </ul>
                              </div>
                              <div className="advisory-chemistry-issue-card__block advisory-chemistry-issue-card__block--accent">
                                <span>Qué suele ayudar</span>
                                <ul>
                                  {issue.solutions.slice(0, 2).map((solution) => (
                                    <li key={solution}>{solution}</li>
                                  ))}
                                </ul>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {selectedChemistryMaterial ? (
                <div className="advisory-chemistry-detail-grid">
                  <div className="advisory-chemistry-detail-card">
                    <div className="advisory-chemistry-detail-card__header">
                      <div>
                        <span className="glass-pill">Estado del caso</span>
                        <h5>Resultado del descarte</h5>
                      </div>
                    </div>

                    <div className="advisory-chemistry-outcome-switch">
                      {Object.entries(CHEMISTRY_OUTCOME_LABELS).map(([outcomeKey, outcomeLabel]) => (
                        <button
                          key={outcomeKey}
                          type="button"
                          className={chemistryOutcome === outcomeKey ? 'is-active' : ''}
                          onClick={() => setChemistryOutcome(outcomeKey as ChemistryOutcome)}
                        >
                          {outcomeLabel}
                        </button>
                      ))}
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '0.45rem', color: 'var(--text-secondary)' }}>Notas rápidas del químico</label>
                      <textarea
                        className="input-field"
                        rows={5}
                        value={chemistryNotes}
                        onChange={(event) => setChemistryNotes(event.target.value)}
                        placeholder="Ejemplo: control nivel 2 alto, repetido por duplicado, mismo sesgo; se recalibró con lote nuevo y persiste."
                      />
                    </div>

                    <button
                      type="button"
                      className="button-primary inactive"
                      onClick={() => applyChemistryDraftToForm(true)}
                      disabled={!chemistryDraft}
                    >
                      Sobrescribir campos con este borrador
                    </button>
                  </div>

                  <div className="advisory-chemistry-preview-card">
                    <div className="advisory-chemistry-preview-card__header">
                      <div>
                        <span className="glass-pill glass-pill--brand">Autocompletado</span>
                        <h5>Borrador de explicación para la asesoría</h5>
                      </div>
                      <small>Se sincroniza con los campos editables de abajo.</small>
                    </div>

                    {chemistryDraft ? (
                      <pre>{chemistryDraft.consultaEscalada}</pre>
                    ) : (
                      <div className="advisory-chemistry-preview-card__empty">
                        Selecciona al menos una tarjeta de problema para generar el texto automáticamente.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {/* La guía extendida de ingeniería y el resumen visual del enrutamiento se dejaron fuera de la UI
              para mantener el módulo operativo y discreto. La lógica sigue activa en el flujo y en la configuración. */}

          {selectedTicket ? (
            <div className="advisory-ticket-summary">
              <strong>{selectedTicket.asunto}</strong>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
                Serie {selectedTicket.numero_serie_equipo || 'N/D'} · ticket abierto desde {formatDateTimeLabel(selectedTicket.creado_en)}
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                Plataforma: {selectedPlatformStatusLabel} · área sugerida: {AREA_LABELS[inferAdvisoryAreaFromTicket(selectedTicket)]}
              </span>
            </div>
          ) : null}

          {selectedArea === 'quimica' ? (
            <div className="advisory-chemistry-form-note">
              Los campos de abajo siguen siendo editables. Si ya marcaste tarjetas, el sistema llena el borrador para que solo ajustes el contexto fino.
            </div>
          ) : null}

          <div className="advisory-form-grid advisory-form-grid--symptoms">
            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', color: 'var(--text-secondary)' }}>Avería *</label>
              <input
                className="input-field"
                value={averia}
                onChange={(event) => setAveria(event.target.value)}
                required
                placeholder={selectedArea === 'quimica' ? 'Ej. Control fuera de rango / blanco alto' : 'Tipo de avería o síntoma principal'}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', color: 'var(--text-secondary)' }}>Detalle de avería *</label>
              <textarea
                className="input-field"
                rows={3}
                value={detalleAveria}
                onChange={(event) => setDetalleAveria(event.target.value)}
                required
                placeholder={
                  selectedArea === 'quimica'
                    ? 'Describe el comportamiento observado, corridas afectadas, nivel del control o condición de la muestra.'
                    : 'Describe técnicamente la falla observada por el ingeniero a cargo.'
                }
              />
            </div>
          </div>

          <div className="advisory-form-grid advisory-form-grid--triple">
            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', color: 'var(--text-secondary)' }}>Pasos ya seguidos</label>
              <textarea
                className="input-field"
                rows={5}
                value={pasosSeguidos}
                onChange={(event) => setPasosSeguidos(event.target.value)}
                placeholder="Qué revisión ya se hizo, en qué orden y con qué resultado."
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', color: 'var(--text-secondary)' }}>Ajustes realizados</label>
              <textarea
                className="input-field"
                rows={5}
                value={ajustesRealizados}
                onChange={(event) => setAjustesRealizados(event.target.value)}
                placeholder={
                  selectedArea === 'quimica'
                    ? 'Diluciones, recalibraciones, cambios de lote, limpieza, reconstituciones o verificaciones adicionales.'
                    : 'Parámetros, calibraciones, limpiezas o reconfiguraciones aplicadas.'
                }
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', color: 'var(--text-secondary)' }}>Acciones tomadas</label>
              <textarea
                className="input-field"
                rows={5}
                value={accionesTomadas}
                onChange={(event) => setAccionesTomadas(event.target.value)}
                placeholder={
                  selectedArea === 'quimica'
                    ? 'Repeticiones, cambio de reactivo, blanco nuevo, revisión de interferencias o evidencia levantada.'
                    : 'Partes cambiadas, pruebas ejecutadas, llamados previos, evidencias levantadas.'
                }
              />
            </div>
          </div>

          <div className="advisory-form-grid advisory-form-grid--double">
            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', color: 'var(--text-secondary)' }}>
                {selectedArea === 'quimica' ? 'Materiales o consumibles utilizados' : 'Refacciones utilizadas'}
              </label>
              <textarea
                className="input-field"
                rows={3}
                value={refaccionesUtilizadas}
                onChange={(event) => setRefaccionesUtilizadas(event.target.value)}
                placeholder={
                  selectedArea === 'quimica'
                    ? 'Lote de reactivo, control, calibrador, diluyente, agua o consumibles involucrados.'
                    : 'Códigos, cantidades o descripción de refacciones usadas.'
                }
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', color: 'var(--text-secondary)' }}>Bibliografía consultada</label>
              <textarea
                className="input-field"
                rows={3}
                value={bibliografiaConsultada}
                onChange={(event) => setBibliografiaConsultada(event.target.value)}
                placeholder="Manual, procedimiento, inserto, boletín técnico o referencia revisada."
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.45rem', color: 'var(--text-secondary)' }}>Consulta puntual para trainer *</label>
            <textarea
              className="input-field"
              rows={4}
              value={consultaEscalada}
              onChange={(event) => setConsultaEscalada(event.target.value)}
              required
              placeholder="Qué necesitas que valide el trainer o qué asesoría puntual requiere el químico."
            />
          </div>

          <div className="advisory-form-actions">
            <button
              type="button"
              className="button-primary inactive"
              onClick={resetCreateForm}
              disabled={saving}
            >
              Limpiar
            </button>
            <button type="submit" className="button-primary" disabled={saving || loading}>
              {saving ? 'Escalando...' : 'Escalar asesoría'}
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ padding: '1.65rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ marginBottom: '0.35rem' }}>Bandeja de asesorías</h3>
              <p style={{ color: 'var(--text-secondary)' }}>
                {isTechnician
                  ? `Estás viendo únicamente los casos de ${activeAreaLabel.toLowerCase()} donde apareces como destinatario.`
                  : `Estás viendo únicamente los casos de ${activeAreaLabel.toLowerCase()}, tanto los que escalaste como los que te asignaron.`}
              </p>
            </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className="button-primary inactive chip" style={{ textTransform: 'none' }}>
              {areaAssignedAdvisories.length} asignadas
            </span>
            <span className="button-primary inactive chip" style={{ textTransform: 'none' }}>
              {areaRequestedAdvisories.length} {isTechnician ? 'propias y asignadas' : 'solicitadas por mí'}
            </span>
          </div>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Cargando asesorías escaladas...</p>
        ) : filteredAdvisories.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>Todavía no hay asesorías escaladas registradas para {activeAreaLabel.toLowerCase()}.</p>
        ) : (
          <div className="advisory-thread-list">
            {filteredAdvisories.map((advisory) => {
              const ticket = advisory.ticket_id ? ticketById.get(advisory.ticket_id) || null : null;
              const requester = advisory.solicitante_id ? profileById.get(advisory.solicitante_id) || null : null;
              const responder = advisory.respondida_por_id ? profileById.get(advisory.respondida_por_id) || null : null;
              const recipients = notificationsByAdvisoryId.get(advisory.id) || [];
              const unreadForThisAdvisory = recipients.filter(
                (notification) => notification.destinatario_id === currentUserId && !notification.leida_en,
              ).length;
              const isExpanded = activeAdvisoryId === advisory.id;
              const draft = responseDrafts[advisory.id] || {
                estado: advisory.estado,
                respuesta: advisory.respuesta_trainer || '',
              };
              const tone = STATUS_TONE[advisory.estado];

              return (
                <div
                  key={advisory.id}
                  className={`advisory-thread-card ${isExpanded ? 'is-expanded' : ''}`}
                  style={{
                    borderColor: tone.border,
                    background: tone.surface,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => void handleOpenAdvisory(advisory.id)}
                    className="advisory-thread-card__summary"
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span
                          className="button-primary inactive chip advisory-thread-card__chip"
                          style={{ textTransform: 'none', background: tone.background, color: tone.color, borderColor: tone.border }}
                        >
                          {STATUS_LABELS[advisory.estado]}
                        </span>
                        <span className="button-primary inactive chip advisory-thread-card__chip advisory-thread-card__chip--neutral" style={{ textTransform: 'none' }}>
                          {AREA_LABELS[advisory.area]}
                        </span>
                        {unreadForThisAdvisory > 0 ? (
                          <span
                            className="button-primary chip advisory-thread-card__chip"
                            style={{ textTransform: 'none', padding: '0.2rem 0.7rem', minHeight: 'unset' }}
                          >
                            {unreadForThisAdvisory} nueva{unreadForThisAdvisory === 1 ? '' : 's'}
                          </span>
                        ) : null}
                      </div>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                        {formatDateTimeLabel(advisory.creado_en)}
                      </span>
                    </div>
                      <div style={{ display: 'grid', gap: '0.22rem' }}>
                        <strong style={{ fontSize: '1rem' }}>{ticket?.asunto || 'Ticket no encontrado'}</strong>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                        Serie {ticket?.numero_serie_equipo || 'N/D'} · solicitó {advisory.solicitante_nombre_snapshot || requester?.nombre_completo || 'Sistema'}
                      </span>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
                      {advisory.consulta_escalada}
                    </p>
                  </button>

                  {isExpanded ? (
                    <div
                      className="advisory-thread-card__panel"
                      style={{
                        borderTopColor: tone.border,
                        background: tone.expandedSurface,
                      }}
                    >
                      <div
                        className="advisory-thread-card__report"
                        style={{
                          borderColor: tone.border,
                          background: tone.reportSurface,
                        }}
                      >
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          Reporte generado
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                          <div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginBottom: '0.2rem' }}>Solicitante</div>
                            <strong>{advisory.solicitante_nombre_snapshot || requester?.nombre_completo || 'Sistema'}</strong>
                          </div>
                          <div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginBottom: '0.2rem' }}>Fecha</div>
                            <strong>{formatDateTimeLabel(advisory.creado_en)}</strong>
                          </div>
                          <div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginBottom: '0.2rem' }}>Plataforma</div>
                            <strong>{advisory.plataforma_snapshot || 'Sin plataforma'}</strong>
                          </div>
                          <div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginBottom: '0.2rem' }}>Actividad</div>
                            <strong>{advisory.actividad || AREA_LABELS[advisory.area]}</strong>
                          </div>
                          <div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginBottom: '0.2rem' }}>Avería</div>
                            <strong>{advisory.averia || 'Sin avería registrada'}</strong>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                          <div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginBottom: '0.22rem' }}>Detalle de avería</div>
                            <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{advisory.detalle_averia || 'Sin detalle técnico capturado.'}</p>
                          </div>
                          <div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginBottom: '0.22rem' }}>Refacciones utilizadas</div>
                            <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{advisory.refacciones_utilizadas || 'Sin refacciones reportadas.'}</p>
                          </div>
                          <div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginBottom: '0.22rem' }}>Bibliografía consultada</div>
                            <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{advisory.bibliografia_consultada || 'Sin bibliografía registrada.'}</p>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                        <div className="advisory-thread-card__section">
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.28rem' }}>
                            Pasos seguidos
                          </div>
                          <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{advisory.pasos_seguidos || 'Sin detalle capturado.'}</p>
                        </div>
                        <div className="advisory-thread-card__section">
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.28rem' }}>
                            Ajustes realizados
                          </div>
                          <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{advisory.ajustes_realizados || 'Sin detalle capturado.'}</p>
                        </div>
                        <div className="advisory-thread-card__section">
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.28rem' }}>
                            Acciones tomadas
                          </div>
                          <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{advisory.acciones_tomadas || 'Sin detalle capturado.'}</p>
                        </div>
                      </div>

                      <div className="advisory-thread-card__section">
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.28rem' }}>
                          Destinatarios notificados
                        </div>
                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                          {recipients.map((notification) => {
                            const recipient = profileById.get(notification.destinatario_id);
                            return (
                              <span key={notification.id} className="button-primary inactive chip advisory-thread-card__chip advisory-thread-card__chip--recipient" style={{ textTransform: 'none' }}>
                                {recipient?.nombre_completo || 'Sin nombre'}
                                {notification.leida_en ? ' · visto' : ' · pendiente'}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div className="advisory-thread-card__section advisory-thread-card__section--response">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
                          <div>
                            <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>Estado</label>
                            <select
                              className="input-field"
                              value={draft.estado}
                              onChange={(event) =>
                                updateResponseDraft(advisory.id, { estado: event.target.value as AdvisoryStatus })
                              }
                            >
                              <option value="solicitada">Solicitada</option>
                              <option value="en_revision">En revisión</option>
                              <option value="asesorada">Asesorada</option>
                              <option value="cerrada">Cerrada</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>Respuesta del trainer</label>
                            <textarea
                              className="input-field"
                              rows={4}
                              value={draft.respuesta}
                              onChange={(event) =>
                                updateResponseDraft(advisory.id, { respuesta: event.target.value })
                              }
                              placeholder="Documenta la asesoría entregada, validaciones pendientes o siguientes pasos."
                            />
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                            {advisory.respondida_en
                              ? `Última respuesta: ${formatDateTimeLabel(advisory.respondida_en)} por ${responder?.nombre_completo || 'staff'}`
                              : 'Aún no hay respuesta formal registrada.'}
                          </div>
                          <button
                            type="button"
                            className="button-primary"
                            onClick={() => void handleSaveAdvisoryResponse(advisory.id)}
                            disabled={saving}
                          >
                            Guardar actualización
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {canViewMetrics ? (
        <div className="card advisory-metrics-shell" style={{ padding: '1.65rem' }}>
          <div className="advisory-metrics-header">
            <div>
              <h3 style={{ marginBottom: '0.35rem' }}>Métricas de {activeAreaLabel.toLowerCase()}</h3>
              <p style={{ color: 'var(--text-secondary)' }}>
                {currentRole === 'admin'
                  ? `Vista consolidada para planeación de recapacitaciones y seguimiento del área de ${activeAreaLabel.toLowerCase()}.`
                  : `Vista privada de la cartera que te pertenece como trainer de ${activeAreaLabel.toLowerCase()}.`}
              </p>
            </div>
            <div className="advisory-metrics-kpis">
              <article className="advisory-metrics-kpi">
                <span>Total de asesorías</span>
                <strong>{metricsScopeAdvisories.length}</strong>
              </article>
              <article className="advisory-metrics-kpi">
                <span>Trainers con carga</span>
                <strong>{metricsOwnerRows.filter((row) => row.value > 0).length}</strong>
              </article>
              <article className="advisory-metrics-kpi">
                <span>{areaContributorLabel}s con incidencias</span>
                <strong>{metricsRequesterRows.length}</strong>
              </article>
              <article className="advisory-metrics-kpi">
                <span>Tipos detectados</span>
                <strong>{metricsTypeRows.length}</strong>
              </article>
            </div>
          </div>

          {metricsScopeAdvisories.length === 0 ? (
            <div className="advisory-metrics-empty">
              No hay asesorías suficientes en esta vista para generar métricas.
            </div>
          ) : (
            <div className="advisory-metrics-grid">
              <section className="advisory-metrics-card">
                <div className="advisory-metrics-card__header">
                  <strong>Propiedad de asesorías</strong>
                  <span>{currentRole === 'admin' ? 'Por trainer notificado' : 'Tu bandeja actual'}</span>
                </div>
                <div className="advisory-metrics-list">
                  {metricsOwnerRows.map((row) => (
                    <div key={row.key} className="advisory-metrics-row">
                      <div className="advisory-metrics-row__copy">
                        <strong>{row.label}</strong>
                        <span>{row.value} asesoría(s)</span>
                      </div>
                      <div className="advisory-metrics-row__bar">
                        <span style={{ width: `${(row.value / (metricsOwnerRows[0]?.value || 1)) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="advisory-metrics-card">
                <div className="advisory-metrics-card__header">
                  <strong>Registros por trainer</strong>
                  <span>{currentRole === 'admin' ? 'Respuestas capturadas' : 'Tus respuestas guardadas'}</span>
                </div>
                <div className="advisory-metrics-list">
                  {metricsResponderRows.length > 0 ? (
                    metricsResponderRows.map((row) => (
                      <div key={row.key} className="advisory-metrics-row">
                        <div className="advisory-metrics-row__copy">
                          <strong>{row.label}</strong>
                          <span>{row.value} registro(s)</span>
                        </div>
                        <div className="advisory-metrics-row__bar advisory-metrics-row__bar--accent">
                          <span style={{ width: `${(row.value / (metricsResponderRows[0]?.value || 1)) * 100}%` }} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="advisory-metrics-empty advisory-metrics-empty--inline">
                      Todavía no hay respuestas registradas para esta vista.
                    </div>
                  )}
                </div>
              </section>

              <section className="advisory-metrics-card">
                <div className="advisory-metrics-card__header">
                  <strong>Incidencias por {areaContributorLabel}</strong>
                  <span>Quién está escalando más casos</span>
                </div>
                <div className="advisory-metrics-list">
                  {metricsRequesterRows.map((row) => (
                    <div key={row.key} className="advisory-metrics-row">
                      <div className="advisory-metrics-row__copy">
                        <strong>{row.label}</strong>
                        <span>{row.value} incidencia(s)</span>
                      </div>
                      <div className="advisory-metrics-row__bar advisory-metrics-row__bar--warm">
                        <span style={{ width: `${(row.value / (metricsRequesterRows[0]?.value || 1)) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="advisory-metrics-card">
                <div className="advisory-metrics-card__header">
                  <strong>Batallas recurrentes por {areaContributorLabel}</strong>
                  <span>Qué tipo de asesoría solicita cada {areaContributorLabel}</span>
                </div>
                <div className="advisory-metrics-cluster">
                  <div className="advisory-metrics-insight-list">
                    {metricsRequesterInsightRows.map((row) => (
                      <article key={row.key} className="advisory-metrics-insight-card">
                        <div className="advisory-metrics-row__copy">
                          <strong>{row.label}</strong>
                          <span>{row.total} incidencia(s)</span>
                        </div>
                        <div className="advisory-metrics-tag-cloud">
                          {row.topTypes.map((typeRow) => (
                            <span key={`${row.key}-${typeRow.key}`} className="advisory-metrics-tag">
                              {typeRow.label} · {typeRow.value}
                            </span>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="advisory-metrics-mini-list">
                    <span className="advisory-metrics-mini-list__title">Estado de las asesorías</span>
                    {metricsStatusRows.map((row) => (
                      <div key={row.key} className="advisory-metrics-chip-row advisory-metrics-chip-row--status">
                        <strong>{row.label}</strong>
                        <span>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
