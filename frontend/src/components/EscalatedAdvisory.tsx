import { useEffect, useMemo, useRef, useState } from 'react';
import './EscalatedAdvisory.css';
import { getValidatedSession, supabase } from '../supabaseClient';
import EquipmentDetailsModal from './EquipmentDetailsModal';
import { stripPlaneacionMeta, type EquipmentSummary, type ProfileSummary } from './servicesPlanning';
import { normalizeSerialLookup } from './supremoPresets';
import {
  isAdvisoryEmailEnabled,
  sendAdvisoryEmailNotification,
} from './advisoryEmailApi';
import {
  isAdvisoryWhatsAppEnabled,
  sendAdvisoryWhatsAppNotification,
} from './advisoryWhatsAppApi';
import {
  runAdvisoryEvidenceOcr,
  uploadAdvisoryAttachment,
} from './escalatedAdvisoryEvidence';
import {
  downloadAdvisoryMetricsExcel,
  downloadAdvisoryMetricsPdf,
} from './escalatedAdvisoryMetricsExport';
import {
  buildChemistryDraft,
  CHEMISTRY_GUIDE_MATERIALS,
  CHEMISTRY_OUTCOME_LABELS,
  type ChemistryDraftFields,
  type ChemistryMaterialKey,
  type ChemistryOutcome,
} from './escalatedAdvisoryChemistry';
import {
  appendAdvisorySystemMessage,
  appendAdvisoryThreadMessage,
  getAdvisoryThreadAnalytics,
  getAdvisoryThreadMessages,
  markAdvisoryThreadRead,
  type AdvisoryAttachmentAnalysis,
  type AdvisoryAttachmentKind,
  type AdvisoryAttachmentRecord,
  type AdvisoryMetadata,
  type AdvisoryThreadMessage,
  type AdvisoryThreadRole,
  type AdvisoryWaitingOn,
} from './escalatedAdvisoryThread';

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
  metadata: AdvisoryMetadata | null;
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

interface PendingAdvisoryAttachment {
  localId: string;
  kind: AdvisoryAttachmentKind;
  file: File;
  fileName: string;
  previewUrl: string | null;
  status: 'processing' | 'ready' | 'error';
  error: string | null;
  analysis: AdvisoryAttachmentAnalysis | null;
}

interface AdvisoryReplyDraft {
  estado: AdvisoryStatus;
  mensaje: string;
  attachments: PendingAdvisoryAttachment[];
}

interface AdvisoryThreadSummary {
  messages: AdvisoryThreadMessage[];
  waitingOn: AdvisoryWaitingOn;
  unreadRequester: number;
  unreadTrainer: number;
  lastMessageAt: string | null;
  firstTrainerResponseAt: string | null;
  firstTrainerResponseMinutes: number | null;
  messageCount: number;
  attachmentCount: number;
  responseCount: number;
  evidenceTags: string[];
}

interface AdvisoryHeatmapCell {
  key: string;
  value: number;
}

interface AdvisoryTrainerWorkloadRow {
  key: string;
  label: string;
  assigned: number;
  responded: number;
  avgFirstResponseMinutes: number | null;
}

interface AdvisoryTimelineDay {
  key: string;
  label: string;
  created: number;
  replied: number;
  closed: number;
}

interface EscalatedAdvisoryProps {
  onNotificationCountChange?: (count: number) => void;
  requestedAdvisoryId?: string | null;
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

const WAITING_LABELS: Record<AdvisoryWaitingOn, string> = {
  requester: 'Espera al solicitante',
  trainer: 'Espera al trainer',
  closed: 'Cerrada',
};

const WAITING_COLORS: Record<AdvisoryWaitingOn, string> = {
  requester: '#2f7ec7',
  trainer: '#c13d4f',
  closed: '#7c8895',
};

const logAdvisoryIntegrationResult = (channel: 'whatsapp' | 'email', action: 'create' | 'reply', details: unknown) => {
  console.info(`[advisory:${channel}:${action}]`, details);
};

const logAdvisoryRoutingResolution = (action: 'create' | 'empty', details: unknown) => {
  console.info(`[advisory:routing:${action}]`, details);
};

const EVIDENCE_KIND_LABELS: Record<AdvisoryAttachmentKind, string> = {
  photo: 'Foto',
  report: 'Reporte',
  service_test: 'Prueba de servicio',
  video: 'Video',
};

const IMAGE_ATTACHMENT_ACCEPT = 'image/*';
const REPORT_ATTACHMENT_ACCEPT = '.pdf,.txt,image/*';
const VIDEO_ATTACHMENT_ACCEPT = 'video/*';

const getPendingAttachmentPreviewType = (attachment: Pick<PendingAdvisoryAttachment, 'kind' | 'file' | 'previewUrl'>) => {
  if (!attachment.previewUrl) {
    return null;
  }

  if (attachment.file.type.startsWith('image/')) {
    return 'image';
  }

  if (attachment.kind === 'video' || attachment.file.type.startsWith('video/')) {
    return 'video';
  }

  return null;
};

const renderPendingAttachmentPreview = (attachment: PendingAdvisoryAttachment) => {
  const previewType = getPendingAttachmentPreviewType(attachment);
  if (previewType === 'image') {
    return <img className="advisory-attachment-draft__media" src={attachment.previewUrl || ''} alt={attachment.fileName} />;
  }

  if (previewType === 'video') {
    return (
      <video className="advisory-attachment-draft__media" controls preload="metadata" src={attachment.previewUrl || ''}>
        Tu navegador no soporta video embebido.
      </video>
    );
  }

  return null;
};

const renderThreadAttachmentMedia = (attachment: AdvisoryAttachmentRecord) => {
  if (attachment.mimeType.startsWith('image/')) {
    return <img src={attachment.publicUrl} alt={attachment.fileName} />;
  }

  if (attachment.kind === 'video' || attachment.mimeType.startsWith('video/')) {
    return (
      <video controls preload="metadata" src={attachment.publicUrl}>
        Tu navegador no soporta video embebido.
      </video>
    );
  }

  return null;
};

const QUICK_REPLIES: Record<AdvisoryThreadRole, string[]> = {
  requester: [
    'Adjunto evidencia fotográfica del caso.',
    'Subo reporte para complementar la consulta.',
    'El problema persiste después de repetir la prueba.',
  ],
  trainer: [
    'Recibido. Reviso la evidencia y te respondo con siguiente paso.',
    'Comparte el resultado de la utilidad indicada para cerrar hipótesis.',
    'Antes de pensar en refacción, valida esta prueba de servicio.',
  ],
  system: [],
};

const STATUS_OPTIONS: { value: AdvisoryStatus; label: string }[] = [
  { value: 'solicitada', label: 'Solicitada' },
  { value: 'en_revision', label: 'En revisión' },
  { value: 'asesorada', label: 'Asesorada' },
  { value: 'cerrada', label: 'Cerrada' },
];

const formatMinutesLabel = (minutes: number | null) => {
  if (minutes === null || Number.isNaN(minutes)) {
    return 'Sin respuesta';
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = minutes / 60;
  return `${hours.toFixed(hours >= 10 ? 0 : 1)} h`;
};

const buildConicGradient = (segments: { value: number; color: string }[]) => {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  let current = 0;
  return `conic-gradient(${segments
    .map((segment) => {
      const start = (current / total) * 360;
      current += segment.value;
      const end = (current / total) * 360;
      return `${segment.color} ${start}deg ${end}deg`;
    })
    .join(', ')})`;
};

const getMessageRoleLabel = (role: AdvisoryThreadRole) => {
  if (role === 'trainer') {
    return 'Trainer';
  }

  if (role === 'requester') {
    return 'Solicitante';
  }

  return 'Sistema';
};

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

export default function EscalatedAdvisory({
  onNotificationCountChange,
  requestedAdvisoryId = null,
}: EscalatedAdvisoryProps) {
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
  const [equipmentDetailSerial, setEquipmentDetailSerial] = useState<string | null>(null);
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
  const [createEvidenceDrafts, setCreateEvidenceDrafts] = useState<PendingAdvisoryAttachment[]>([]);
  const [responseDrafts, setResponseDrafts] = useState<Record<string, AdvisoryReplyDraft>>({});
  const [exportingMetrics, setExportingMetrics] = useState<'excel' | 'pdf' | null>(null);
  const chemistryAutofillRef = useRef<ChemistryDraftFields | null>(null);
  const areaInitializedRef = useRef(false);
  const metricsFetchInFlightRef = useRef<Promise<void> | null>(null);
  const savingAdvisoryIdsRef = useRef(new Set<string>());
  const syncingActiveReadIdsRef = useRef(new Set<string>());
  const handledDeepLinkAdvisoryIdRef = useRef<string | null>(null);

  const advisoryWhatsAppEnabled = isAdvisoryWhatsAppEnabled();

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

  const buildThreadSource = (
    advisory: AdvisoryRecord,
    requesterName: string,
    responderName: string | null,
  ) => ({
    consultaEscalada: advisory.consulta_escalada,
    creadoEn: advisory.creado_en,
    solicitanteId: advisory.solicitante_id,
    solicitanteNombre: requesterName,
    estado: advisory.estado,
    legacyRespuestaTrainer: advisory.respuesta_trainer,
    legacyRespondidaEn: advisory.respondida_en,
    legacyRespondidaPorId: advisory.respondida_por_id,
    legacyRespondidaPorNombre: responderName,
  });

  const getViewerThreadRole = (advisory: AdvisoryRecord): 'requester' | 'trainer' =>
    advisory.solicitante_id === currentUserId ? 'requester' : 'trainer';

  const addPendingAttachments = async (
    files: FileList | null,
    kind: PendingAdvisoryAttachment['kind'],
    scope: 'create' | string,
  ) => {
    if (!files || files.length === 0) {
      return;
    }

    const nextDrafts = Array.from(files).map<PendingAdvisoryAttachment>((file) => ({
      localId: crypto.randomUUID(),
      kind,
      file,
      fileName: file.name,
      previewUrl: file.type.startsWith('image/') || file.type.startsWith('video/') ? URL.createObjectURL(file) : null,
      status: 'processing',
      error: null,
      analysis: null,
    }));

    if (scope === 'create') {
      setCreateEvidenceDrafts((current) => [...current, ...nextDrafts]);
    } else {
      setResponseDrafts((current) => {
        const base = current[scope];
        if (!base) {
          return current;
        }

        return {
          ...current,
          [scope]: {
            ...base,
            attachments: [...base.attachments, ...nextDrafts],
          },
        };
      });
    }

    await Promise.all(
      nextDrafts.map(async (draft) => {
        try {
          const analysis = await runAdvisoryEvidenceOcr(draft.file);
          const applyPatch = (items: PendingAdvisoryAttachment[]) =>
            items.map((item) =>
              item.localId === draft.localId
                ? {
                    ...item,
                    analysis,
                    status: 'ready' as const,
                  }
                : item,
            );

          if (scope === 'create') {
            setCreateEvidenceDrafts((current) => applyPatch(current));
          } else {
            setResponseDrafts((current) => {
              const base = current[scope];
              if (!base) {
                return current;
              }

              return {
                ...current,
                [scope]: {
                  ...base,
                  attachments: applyPatch(base.attachments),
                },
              };
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'No se pudo leer el archivo.';
          const applyPatch = (items: PendingAdvisoryAttachment[]) =>
            items.map((item) =>
              item.localId === draft.localId
                ? {
                    ...item,
                    status: 'error' as const,
                    error: message,
                  }
                : item,
            );

          if (scope === 'create') {
            setCreateEvidenceDrafts((current) => applyPatch(current));
          } else {
            setResponseDrafts((current) => {
              const base = current[scope];
              if (!base) {
                return current;
              }

              return {
                ...current,
                [scope]: {
                  ...base,
                  attachments: applyPatch(base.attachments),
                },
              };
            });
          }
        }
      }),
    );
  };

  const removePendingAttachment = (scope: 'create' | string, localId: string) => {
    const disposePreview = (attachment: PendingAdvisoryAttachment | undefined) => {
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    };

    if (scope === 'create') {
      setCreateEvidenceDrafts((current) => {
        disposePreview(current.find((item) => item.localId === localId));
        return current.filter((item) => item.localId !== localId);
      });
      return;
    }

    setResponseDrafts((current) => {
      const draft = current[scope];
      if (!draft) {
        return current;
      }

      disposePreview(draft.attachments.find((item) => item.localId === localId));
      return {
        ...current,
        [scope]: {
          ...draft,
          attachments: draft.attachments.filter((item) => item.localId !== localId),
        },
      };
    });
  };

  const buildUploadedAttachmentRecords = async (
    advisoryId: string,
    messageId: string,
    pendingAttachments: PendingAdvisoryAttachment[],
  ) =>
    Promise.all(
      pendingAttachments.map((attachment) =>
        uploadAdvisoryAttachment({
          advisoryId,
          messageId,
          kind: attachment.kind,
          file: attachment.file,
          analysis: attachment.analysis,
        }),
      ),
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
      const normalizedSerial = normalizeSerialLookup(equipment.numero_serie);
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
  const effectiveCurrentRole = currentRole || currentRequesterProfile?.rol || null;

  const selectedEquipment = useMemo(() => {
    if (!selectedTicket?.numero_serie_equipo) {
      return null;
    }

    return equipmentBySerial.get(normalizeSerialLookup(selectedTicket.numero_serie_equipo)) || null;
  }, [equipmentBySerial, selectedTicket]);

  const equipmentDetailRecord = useMemo(() => {
    if (!equipmentDetailSerial) {
      return null;
    }

    return equipmentBySerial.get(normalizeSerialLookup(equipmentDetailSerial)) || null;
  }, [equipmentBySerial, equipmentDetailSerial]);

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

  const openEquipmentDetailModal = (serial: string | null | undefined) => {
    const normalizedSerial = normalizeSerialLookup(serial);
    if (!normalizedSerial) {
      return;
    }

    setEquipmentDetailSerial(normalizedSerial);
  };

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

  const threadSummaryByAdvisoryId = useMemo(() => {
    const map = new Map<string, AdvisoryThreadSummary>();

    advisories.forEach((advisory) => {
      const requesterName =
        advisory.solicitante_nombre_snapshot ||
        (advisory.solicitante_id ? profileById.get(advisory.solicitante_id)?.nombre_completo : null) ||
        'Solicitante';
      const responderName =
        advisory.respondida_por_id ? profileById.get(advisory.respondida_por_id)?.nombre_completo || null : null;
      const source = buildThreadSource(advisory, requesterName, responderName);
      const analytics = getAdvisoryThreadAnalytics(advisory.metadata, source);
      map.set(advisory.id, {
        messages: getAdvisoryThreadMessages(advisory.metadata, source),
        ...analytics,
      });
    });

    return map;
  }, [advisories, profileById]);

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
    if (effectiveCurrentRole !== 'tecnico') {
      return advisories;
    }

    return advisories.filter(
      (advisory) =>
        assignedAdvisoryIdsForCurrentUser.has(advisory.id) || advisory.solicitante_id === currentUserId,
    );
  }, [advisories, assignedAdvisoryIdsForCurrentUser, currentUserId, effectiveCurrentRole]);

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
          (effectiveCurrentRole !== 'tecnico' || assignedAdvisoryIdsForCurrentUser.has(advisory.id)),
      ),
    [assignedAdvisoryIdsForCurrentUser, effectiveCurrentRole, myAssignedAdvisories, selectedArea],
  );

  const areaRequestedAdvisories = useMemo(
    () =>
      myRequestedAdvisories.filter((advisory) => advisory.area === selectedArea),
    [myRequestedAdvisories, selectedArea],
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

  const canViewMetrics = effectiveCurrentRole === 'admin' || isAreaTrainer;

  const metricsScopeAdvisories = useMemo(() => {
    const advisoriesForArea = advisories.filter((advisory) => advisory.area === selectedArea);

    if (effectiveCurrentRole === 'admin') {
      return advisoriesForArea;
    }

    if (!currentUserId || !isAreaTrainer) {
      return [];
    }

    return advisoriesForArea.filter((advisory) => assignedAdvisoryIdsForCurrentUser.has(advisory.id));
  }, [advisories, assignedAdvisoryIdsForCurrentUser, currentUserId, effectiveCurrentRole, isAreaTrainer, selectedArea]);

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

  const metricsWaitingRows = useMemo(
    () =>
      capMetricRows(
        [...metricsScopeAdvisories.reduce((map, advisory) => {
          const waitingOn = threadSummaryByAdvisoryId.get(advisory.id)?.waitingOn || 'trainer';
          map.set(waitingOn, {
            key: waitingOn,
            label: WAITING_LABELS[waitingOn],
            value: (map.get(waitingOn)?.value || 0) + 1,
          });
          return map;
        }, new Map<string, AdvisoryMetricRow>()).values()],
        3,
      ),
    [metricsScopeAdvisories, threadSummaryByAdvisoryId],
  );

  const metricsTrainerWorkloadRows = useMemo(() => {
    const counts = new Map<string, AdvisoryTrainerWorkloadRow>();

    metricsScopeAdvisories.forEach((advisory) => {
      const recipients = notificationsByAdvisoryId.get(advisory.id) || [];
      const summary = threadSummaryByAdvisoryId.get(advisory.id);
      recipients.forEach((notification) => {
        const recipient = profileById.get(notification.destinatario_id);
        const isTrainerForArea =
          selectedArea === 'ingenieria'
            ? recipient?.trainer_ingenieria === true
            : recipient?.trainer_quimica === true;

        if (!isTrainerForArea || !recipient) {
          return;
        }

        const existing = counts.get(recipient.id) || {
          key: recipient.id,
          label: recipient.nombre_completo || 'Trainer sin nombre',
          assigned: 0,
          responded: 0,
          avgFirstResponseMinutes: null,
        };

        existing.assigned += 1;
        if (advisory.respondida_por_id === recipient.id) {
          existing.responded += 1;
          const firstResponseMinutes = summary?.firstTrainerResponseMinutes;
          if (typeof firstResponseMinutes === 'number') {
            existing.avgFirstResponseMinutes =
              existing.avgFirstResponseMinutes === null
                ? firstResponseMinutes
                : Math.round((existing.avgFirstResponseMinutes + firstResponseMinutes) / 2);
          }
        }

        counts.set(recipient.id, existing);
      });
    });

    return [...counts.values()]
      .sort((left, right) => right.assigned - left.assigned || left.label.localeCompare(right.label, 'es'))
      .slice(0, 6);
  }, [metricsScopeAdvisories, notificationsByAdvisoryId, profileById, selectedArea, threadSummaryByAdvisoryId]);

  const metricsTimelineDays = useMemo(() => {
    const today = new Date();
    const rows: AdvisoryTimelineDay[] = [];

    for (let offset = 9; offset >= 0; offset -= 1) {
      const date = new Date(today);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      const nextDate = new Date(date);
      nextDate.setDate(date.getDate() + 1);
      const label = date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

      const created = metricsScopeAdvisories.filter((advisory) => {
        const advisoryDate = new Date(advisory.creado_en);
        return advisoryDate >= date && advisoryDate < nextDate;
      }).length;

      const replied = metricsScopeAdvisories.filter((advisory) => {
        const lastReplyDate = threadSummaryByAdvisoryId
          .get(advisory.id)
          ?.messages.slice()
          .reverse()
          .find((message) => message.role === 'trainer')?.createdAt;
        if (!lastReplyDate) {
          return false;
        }
        const advisoryDate = new Date(lastReplyDate);
        return advisoryDate >= date && advisoryDate < nextDate;
      }).length;

      const closed = metricsScopeAdvisories.filter((advisory) => {
        if (advisory.estado !== 'cerrada') {
          return false;
        }
        const advisoryDate = new Date(advisory.actualizado_en);
        return advisoryDate >= date && advisoryDate < nextDate;
      }).length;

      rows.push({
        key: date.toISOString(),
        label,
        created,
        replied,
        closed,
      });
    }

    return rows;
  }, [metricsScopeAdvisories, threadSummaryByAdvisoryId]);

  const metricsHeatmap = useMemo(() => {
    const requesterRows = metricsRequesterRows.slice(0, 5);
    const typeColumns = metricsTypeRows.slice(0, 5);
    const cells = new Map<string, AdvisoryHeatmapCell>();

    requesterRows.forEach((requester) => {
      typeColumns.forEach((type) => {
        const count = metricsScopeAdvisories.filter((advisory) => {
          const requesterKey =
            advisory.solicitante_id || advisory.solicitante_nombre_snapshot || 'sin-solicitante';
          const typeLabel = advisory.averia?.trim() || advisory.actividad?.trim() || 'Sin tipo capturado';
          const typeKey = normalizeText(typeLabel) || typeLabel;
          return requesterKey === requester.key && typeKey === type.key;
        }).length;

        cells.set(`${requester.key}:${type.key}`, {
          key: `${requester.key}:${type.key}`,
          value: count,
        });
      });
    });

    const max = Math.max(...[...cells.values()].map((cell) => cell.value), 0);

    return {
      requesters: requesterRows,
      types: typeColumns,
      cells,
      max,
    };
  }, [metricsRequesterRows, metricsScopeAdvisories, metricsTypeRows]);

  const metricsHeatmapRows = useMemo(
    () =>
      metricsHeatmap.requesters
        .flatMap((requesterRow) =>
          metricsHeatmap.types.map((type) => ({
            requester: requesterRow.label,
            type: type.label,
            count: metricsHeatmap.cells.get(`${requesterRow.key}:${type.key}`)?.value || 0,
          })),
        )
        .filter((row) => row.count > 0)
        .sort((left, right) => right.count - left.count || left.requester.localeCompare(right.requester)),
    [metricsHeatmap],
  );

  const metricsAverageFirstResponseMinutes = useMemo(() => {
    const values = metricsScopeAdvisories
      .map((advisory) => threadSummaryByAdvisoryId.get(advisory.id)?.firstTrainerResponseMinutes)
      .filter((value): value is number => typeof value === 'number' && value >= 0);

    if (values.length === 0) {
      return null;
    }

    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }, [metricsScopeAdvisories, threadSummaryByAdvisoryId]);

  const metricsEvidenceCoverage = useMemo(() => {
    if (metricsScopeAdvisories.length === 0) {
      return 0;
    }

    const withEvidence = metricsScopeAdvisories.filter(
      (advisory) => (threadSummaryByAdvisoryId.get(advisory.id)?.attachmentCount || 0) > 0,
    ).length;

    return Math.round((withEvidence / metricsScopeAdvisories.length) * 100);
  }, [metricsScopeAdvisories, threadSummaryByAdvisoryId]);

  const metricsScopeLabel = useMemo(() => {
    if (effectiveCurrentRole === 'admin') {
      return `Vista consolidada de ${AREA_LABELS[selectedArea]}`;
    }

    return `Cartera visible para ${currentRequesterProfile?.nombre_completo || 'trainer actual'}`;
  }, [currentRequesterProfile?.nombre_completo, effectiveCurrentRole, selectedArea]);

  const exportMetrics = async (format: 'excel' | 'pdf') => {
    if (!canViewMetrics || metricsScopeAdvisories.length === 0) {
      return;
    }

    const generatedAt = new Date();
    const generatedAtIso = generatedAt.toISOString();
    const payload = {
      areaLabel: AREA_LABELS[selectedArea],
      scopeLabel: metricsScopeLabel,
      generatedAt: generatedAt.toLocaleString('es-MX', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
      generatedAtIso,
      summary: {
        total: metricsScopeAdvisories.length,
        averageFirstResponseLabel: formatMinutesLabel(metricsAverageFirstResponseMinutes),
        evidenceCoverage: metricsEvidenceCoverage,
        waitingOnTrainer: metricsWaitingRows.find((row) => row.key === 'trainer')?.value || 0,
      },
      statusRows: metricsStatusRows.map((row) => ({ label: row.label, value: row.value })),
      waitingRows: metricsWaitingRows.map((row) => ({ label: row.label, value: row.value })),
      trainerRows: metricsTrainerWorkloadRows.map((row) => ({
        label: row.label,
        assigned: row.assigned,
        responded: row.responded,
        avgFirstResponseMinutes: row.avgFirstResponseMinutes,
      })),
      heatmapRows: metricsHeatmapRows,
      timelineRows: metricsTimelineDays.map((row) => ({
        label: row.label,
        created: row.created,
        replied: row.replied,
        closed: row.closed,
      })),
      detailRows: metricsScopeAdvisories
        .map((advisory) => {
          const summary = threadSummaryByAdvisoryId.get(advisory.id);
          const requesterName =
            advisory.solicitante_nombre_snapshot ||
            (advisory.solicitante_id ? profileById.get(advisory.solicitante_id)?.nombre_completo : null) ||
            'Solicitante';
          const resolverName =
            advisory.respondida_por_id ? profileById.get(advisory.respondida_por_id)?.nombre_completo || null : null;
          const typeLabel = advisory.averia?.trim() || advisory.actividad?.trim() || 'Sin tipo capturado';
          const resolutionMinutes =
            advisory.estado === 'cerrada'
              ? Math.max(
                  0,
                  Math.round(
                    (new Date(advisory.actualizado_en).getTime() - new Date(advisory.creado_en).getTime()) / 60000,
                  ),
                )
              : null;

          return {
            advisoryId: advisory.id,
            ticketId: advisory.ticket_id,
            requester: requesterName,
            resolver: resolverName,
            platform: advisory.plataforma_snapshot,
            typeLabel,
            status: STATUS_LABELS[advisory.estado],
            waitingOn: WAITING_LABELS[summary?.waitingOn || 'trainer'],
            createdAt: advisory.creado_en,
            updatedAt: advisory.actualizado_en,
            firstResponseAt: summary?.firstTrainerResponseAt || null,
            firstResponseMinutes: summary?.firstTrainerResponseMinutes ?? null,
            resolutionMinutes,
            attachmentCount: summary?.attachmentCount || 0,
            messageCount: summary?.messageCount || 0,
            responseCount: summary?.responseCount || 0,
            evidenceTags: summary?.evidenceTags || [],
            inquiry: advisory.consulta_escalada,
          };
        })
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    };

    setExportingMetrics(format);
    try {
      if (format === 'excel') {
        await downloadAdvisoryMetricsExcel(payload);
      } else {
        await downloadAdvisoryMetricsPdf(payload);
      }
      setFeedback({
        tone: 'success',
        message: `Las métricas de ${AREA_LABELS[selectedArea].toLowerCase()} se descargaron en ${format.toUpperCase()}.`,
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message:
          error instanceof Error
            ? `No se pudo generar la descarga de métricas: ${error.message}`
            : 'No se pudo generar la descarga de métricas.',
      });
    } finally {
      setExportingMetrics(null);
    }
  };

  const fetchModuleData = async (showLoading = true) => {
    if (metricsFetchInFlightRef.current) {
      return metricsFetchInFlightRef.current;
    }

    const task = (async () => {
      try {
        if (showLoading) {
          setLoading(true);
        }

        const session = await getValidatedSession();
        const user = session?.user ?? null;

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
            .select(
              'id, numero_serie, modelo, software, firmware, fecha_inicio, termino_garantia, fecha_fin, doc_asignacion, doc_terminacion, pais, estado, ciudad, municipio, colonia, direccion, codigo_postal, clientes(id, razon_social, persona_contacto, telefono), asigna:profiles!equipos_empleado_asignado_fkey(nombre_completo), retira:profiles!equipos_empleado_retira_fkey(nombre_completo)',
            ),
          supabase
            .from('profiles')
            .select(
              'id, nombre_completo, employee_number, employee_type, telefono, territorio, rol, recibe_tickets, trainer_ingenieria, trainer_quimica',
            )
            .order('nombre_completo', { ascending: true }),
          supabase
            .from('asesorias_escaladas')
            .select(
              'id, ticket_id, solicitante_id, solicitante_nombre_snapshot, plataforma_snapshot, actividad, averia, detalle_averia, refacciones_utilizadas, bibliografia_consultada, area, estado, pasos_seguidos, ajustes_realizados, acciones_tomadas, consulta_escalada, respuesta_trainer, respondida_por_id, respondida_en, creado_en, actualizado_en, metadata',
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
          notificationsResponse.error ||
          routingSettingsResponse.error;

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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || 'Error desconocido');
        const normalized = message.toLowerCase();

        if (normalized.includes('lock was stolen by another request')) {
          console.warn('[EscalatedAdvisory][fetchModuleData] Supabase lock contention detected; retrying on next tick.', error);
          setLoading(false);
          return;
        }

        setFeedback({
          tone: 'error',
          message: message || 'No fue posible cargar el módulo de asesoría escalada.',
        });
        setLoading(false);
      } finally {
        metricsFetchInFlightRef.current = null;
      }
    })();

    metricsFetchInFlightRef.current = task;
    return task;
  };

  useEffect(() => {
    void fetchModuleData();

    const channel = supabase
      .channel('escalated-advisory-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'asesorias_escaladas' }, () => {
        void fetchModuleData(false);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'asesorias_escaladas_destinatarios' }, () => {
        void fetchModuleData(false);
      })
      .subscribe();

    const timer = window.setInterval(() => {
      void fetchModuleData(false);
    }, 45000);

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
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
    createEvidenceDrafts.forEach((attachment) => {
      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    });
    setSelectedTicketId('');
    setPasosSeguidos('');
    setAjustesRealizados('');
    setAccionesTomadas('');
    setAveria('');
    setDetalleAveria('');
    setRefaccionesUtilizadas('');
    setBibliografiaConsultada('');
    setConsultaEscalada('');
    setCreateEvidenceDrafts([]);
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
      logAdvisoryRoutingResolution('empty', {
        area: selectedArea,
        weekdayNames: getRoutingNamesForArea(selectedArea, 'weekday'),
        weekendNames: getRoutingNamesForArea(selectedArea, 'weekend'),
        currentRoutingIsWeekend,
        resolvedProfiles: autoRecipientProfiles.map((profile) => ({
          id: profile.id,
          name: profile.nombre_completo,
          role: profile.rol,
        })),
      });
      setFeedback({ tone: 'error', message: 'No hay destinatarios automáticos resueltos para esta asesoría.' });
      return;
    }

    if (!consultaEscalada.trim()) {
      setFeedback({ tone: 'error', message: 'Describe qué necesitas validar con el trainer.' });
      return;
    }

    setSaving(true);

    const initialMessageId = crypto.randomUUID();
    const initialThreadMessage: AdvisoryThreadMessage = {
      id: initialMessageId,
      kind: 'initial',
      role: 'requester',
      actorId: currentUserId,
      actorName: currentRequesterProfile?.nombre_completo?.trim() || 'Solicitante',
      body: consultaEscalada.trim(),
      createdAt: new Date().toISOString(),
      attachments: [],
      statusSnapshot: 'solicitada',
    };

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
      metadata: {
        thread: [initialThreadMessage],
        serviceDesk: {
          waitingOn: 'trainer',
          unreadRequester: 0,
          unreadTrainer: 1,
          lastActorRole: 'requester',
          lastMessageAt: initialThreadMessage.createdAt,
          firstTrainerResponseAt: null,
          messageCount: 1,
          attachmentCount: 0,
          responseCount: 0,
          evidenceTags: [],
        },
      } satisfies AdvisoryMetadata,
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

    let evidenceWarning: string | null = null;
    if (createEvidenceDrafts.length > 0) {
      try {
        const uploadedAttachments = await buildUploadedAttachmentRecords(
          insertedAdvisory.id as string,
          initialMessageId,
          createEvidenceDrafts,
        );
        const metadataWithEvidence = appendAdvisoryThreadMessage({
          metadata: advisoryPayload.metadata,
          source: {
            consultaEscalada: advisoryPayload.consulta_escalada,
            creadoEn: initialThreadMessage.createdAt,
            solicitanteId: currentUserId,
            solicitanteNombre: currentRequesterProfile?.nombre_completo?.trim() || 'Solicitante',
            estado: 'solicitada',
          },
          message: {
            ...initialThreadMessage,
            attachments: uploadedAttachments,
          },
          nextStatus: 'solicitada',
        });

        const { error: metadataError } = await supabase
          .from('asesorias_escaladas')
          .update({
            metadata: metadataWithEvidence,
            actualizado_en: new Date().toISOString(),
          })
          .eq('id', insertedAdvisory.id);

        if (metadataError) {
          throw metadataError;
        }
      } catch (error) {
        evidenceWarning =
          error instanceof Error
            ? `La evidencia no se pudo procesar por completo: ${error.message}`
            : 'La evidencia no se pudo procesar por completo.';
        console.warn('[advisory:evidence:create]', error);
      }
    }

    const notificationsPayload = autoRecipientIds.map((profileId) => ({
      asesoria_id: insertedAdvisory.id as string,
      destinatario_id: profileId,
    }));

    logAdvisoryRoutingResolution('create', {
      advisoryId: insertedAdvisory.id,
      area: selectedArea,
      currentRoutingIsWeekend,
      weekdayNames: getRoutingNamesForArea(selectedArea, 'weekday'),
      weekendNames: getRoutingNamesForArea(selectedArea, 'weekend'),
      selectedRecipients: autoRecipientProfiles.map((profile) => ({
        id: profile.id,
        name: profile.nombre_completo,
        role: profile.rol,
      })),
    });

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

    if (advisoryWhatsAppEnabled) {
      try {
        const whatsappResponse = await sendAdvisoryWhatsAppNotification({
          advisoryId: insertedAdvisory.id as string,
        });
        logAdvisoryIntegrationResult('whatsapp', 'create', whatsappResponse);
      } catch (error) {
        console.warn('[advisory:whatsapp:create]', error);
      }
    }

    if (isAdvisoryEmailEnabled()) {
      try {
        const emailResponse = await sendAdvisoryEmailNotification({
          advisoryId: insertedAdvisory.id as string,
          eventType: 'new_advisory',
          eventMessageId: initialMessageId,
        });
        logAdvisoryIntegrationResult('email', 'create', emailResponse);
      } catch (error) {
        console.warn('[advisory:email:create]', error);
      }
    }

    resetCreateForm();
    setActiveAdvisoryId(insertedAdvisory.id as string);
    setSaving(false);
    setFeedback({
      tone: evidenceWarning ? 'info' : 'success',
      message: evidenceWarning
        ? `La asesoría se escaló a ${autoRecipientIds.length} destinatario(s), pero ${evidenceWarning}`
        : `La asesoría se escaló a ${autoRecipientIds.length} destinatario(s).`,
    });
    await fetchModuleData(false);
  };

  const updateResponseDraft = (
    advisoryId: string,
    patch: Partial<Pick<AdvisoryReplyDraft, 'estado' | 'mensaje' | 'attachments'>>,
  ) => {
    setResponseDrafts((current) => {
      const advisory = advisories.find((item) => item.id === advisoryId);
      const base = current[advisoryId] || {
        estado: advisory?.estado || 'solicitada',
        mensaje: '',
        attachments: [],
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

  const markThreadSideRead = async (advisory: AdvisoryRecord) => {
    const viewerRole = getViewerThreadRole(advisory);
    const requesterName =
      advisory.solicitante_nombre_snapshot ||
      (advisory.solicitante_id ? profileById.get(advisory.solicitante_id)?.nombre_completo : null) ||
      'Solicitante';
    const responderName = advisory.respondida_por_id ? profileById.get(advisory.respondida_por_id)?.nombre_completo || null : null;
    const source = buildThreadSource(advisory, requesterName, responderName);
    const analytics = getAdvisoryThreadAnalytics(advisory.metadata, source);

    if ((viewerRole === 'requester' && analytics.unreadRequester === 0) || (viewerRole === 'trainer' && analytics.unreadTrainer === 0)) {
      return;
    }

    const nextMetadata = markAdvisoryThreadRead(advisory.metadata, source, viewerRole);
    const { error } = await supabase
      .from('asesorias_escaladas')
      .update({ metadata: nextMetadata, actualizado_en: new Date().toISOString() })
      .eq('id', advisory.id);

    if (error) {
      return;
    }

    setAdvisories((current) =>
      current.map((item) => (item.id === advisory.id ? { ...item, metadata: nextMetadata } : item)),
    );
  };

  useEffect(() => {
    if (!activeAdvisoryId || !currentUserId || syncingActiveReadIdsRef.current.has(activeAdvisoryId)) {
      return;
    }

    const advisory = advisories.find((item) => item.id === activeAdvisoryId);
    if (!advisory) {
      return;
    }

    const threadSummary = threadSummaryByAdvisoryId.get(activeAdvisoryId);
    const viewerRole = advisory.solicitante_id === currentUserId ? 'requester' : 'trainer';
    const hasUnreadThread =
      viewerRole === 'requester'
        ? (threadSummary?.unreadRequester || 0) > 0
        : (threadSummary?.unreadTrainer || 0) > 0;
    const hasUnreadNotifications = notifications.some(
      (notification) =>
        notification.asesoria_id === activeAdvisoryId &&
        notification.destinatario_id === currentUserId &&
        !notification.leida_en,
    );

    if (!hasUnreadThread && !hasUnreadNotifications) {
      return;
    }

    syncingActiveReadIdsRef.current.add(activeAdvisoryId);

    void (async () => {
      try {
        if (hasUnreadThread) {
          await markThreadSideRead(advisory);
        }
        if (hasUnreadNotifications) {
          await markNotificationsRead(activeAdvisoryId);
        }
      } finally {
        syncingActiveReadIdsRef.current.delete(activeAdvisoryId);
      }
    })();
  }, [activeAdvisoryId, advisories, currentUserId, notifications, threadSummaryByAdvisoryId]);

  useEffect(() => {
    if (!requestedAdvisoryId || handledDeepLinkAdvisoryIdRef.current === requestedAdvisoryId) {
      return;
    }

    const advisory = advisories.find((item) => item.id === requestedAdvisoryId);
    if (!advisory) {
      return;
    }

    if (selectedArea !== advisory.area) {
      setSelectedArea(advisory.area);
      return;
    }

    if (activeAdvisoryId !== advisory.id) {
      setActiveAdvisoryId(advisory.id);
      return;
    }

    handledDeepLinkAdvisoryIdRef.current = requestedAdvisoryId;
    const frame = window.requestAnimationFrame(() => {
      const advisoryNode = document.querySelector<HTMLElement>(`[data-advisory-id="${requestedAdvisoryId}"]`);
      advisoryNode?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeAdvisoryId, advisories, requestedAdvisoryId, selectedArea]);

  const handleOpenAdvisory = async (advisoryId: string) => {
    setActiveAdvisoryId((current) => (current === advisoryId ? null : advisoryId));

    const advisory = advisories.find((item) => item.id === advisoryId);
    if (advisory) {
      setResponseDrafts((current) => ({
        ...current,
        [advisoryId]: {
          estado: current[advisoryId]?.estado || advisory.estado,
          mensaje: current[advisoryId]?.mensaje ?? '',
          attachments: current[advisoryId]?.attachments || [],
        },
      }));
      await markThreadSideRead(advisory);
    }

    await markNotificationsRead(advisoryId);
  };

  const handleSaveAdvisoryResponse = async (advisoryId: string) => {
    if (!currentUserId) {
      return;
    }

    if (savingAdvisoryIdsRef.current.has(advisoryId)) {
      return;
    }

    const draft = responseDrafts[advisoryId];
    if (!draft) {
      return;
    }

    savingAdvisoryIdsRef.current.add(advisoryId);
    setSaving(true);
    try {
      const nextStatus = draft.estado;
      const advisory = advisories.find((item) => item.id === advisoryId);
      if (!advisory) {
        return;
      }

      const trimmedResponse = draft.mensaje.trim();
      const viewerRole = getViewerThreadRole(advisory);
      const canEditStatus = viewerRole === 'trainer';
      const timestamp = new Date().toISOString();
      const hasStatusChange = canEditStatus && nextStatus !== advisory.estado;
      const hasBody = Boolean(trimmedResponse);
      const hasAttachments = draft.attachments.length > 0;

      if (!hasBody && !hasStatusChange && !hasAttachments) {
        setFeedback({
          tone: 'info',
          message: 'Agrega un comentario, evidencia o cambio de estado antes de guardar.',
        });
        return;
      }

      const requesterName =
        advisory.solicitante_nombre_snapshot ||
        (advisory.solicitante_id ? profileById.get(advisory.solicitante_id)?.nombre_completo : null) ||
        'Solicitante';
      const actorName =
        profileById.get(currentUserId)?.nombre_completo ||
        (viewerRole === 'trainer' ? 'Trainer' : requesterName);
      const source = buildThreadSource(
        advisory,
        requesterName,
        advisory.respondida_por_id ? profileById.get(advisory.respondida_por_id)?.nombre_completo || null : null,
      );
      const messageId = crypto.randomUUID();
      let attachments: AdvisoryAttachmentRecord[] = [];
      if (hasAttachments) {
        try {
          attachments = await buildUploadedAttachmentRecords(advisoryId, messageId, draft.attachments);
        } catch (error) {
          setFeedback({
            tone: 'error',
            message:
              error instanceof Error
                ? `No se pudo subir la evidencia adjunta: ${error.message}`
                : 'No se pudo subir la evidencia adjunta.',
          });
          return;
        }
      }
      let nextMetadata: AdvisoryMetadata | unknown = advisory.metadata;

      if (hasBody || hasAttachments) {
        nextMetadata = appendAdvisoryThreadMessage({
          metadata: advisory.metadata,
          source,
          message: {
            id: messageId,
            kind: 'reply',
            role: viewerRole,
            actorId: currentUserId,
            actorName,
            body: trimmedResponse || (attachments.length > 0 ? 'Adjuntó evidencia técnica.' : ''),
            createdAt: timestamp,
            attachments,
            statusSnapshot: canEditStatus ? nextStatus : advisory.estado,
          },
          nextStatus: canEditStatus ? nextStatus : advisory.estado,
        });
      }

      if (hasStatusChange) {
        nextMetadata = appendAdvisorySystemMessage(
          nextMetadata,
          source,
          `Estado actualizado a ${STATUS_LABELS[nextStatus]}.`,
          nextStatus,
        );
      }

      const payload: Record<string, unknown> = {
        estado: canEditStatus ? nextStatus : advisory.estado,
        metadata: nextMetadata,
        actualizado_en: timestamp,
      };

      if (viewerRole === 'trainer' && (trimmedResponse || attachments.length > 0)) {
        payload.respuesta_trainer = trimmedResponse || advisory.respuesta_trainer || 'Se adjuntó evidencia técnica.';
        payload.respondida_por_id = currentUserId;
        payload.respondida_en = timestamp;
      }

      const { error } = await supabase.from('asesorias_escaladas').update(payload).eq('id', advisoryId);

      if (error) {
        setFeedback({
          tone: 'error',
          message: error.message || 'No se pudo guardar la actualización de asesoría.',
        });
        return;
      }

      if (isAdvisoryEmailEnabled() && (hasBody || hasAttachments)) {
        try {
          const emailResponse = await sendAdvisoryEmailNotification({
            advisoryId,
            eventType: viewerRole === 'trainer' ? 'trainer_reply' : 'requester_reply',
            eventMessageId: messageId,
          });
          logAdvisoryIntegrationResult('email', 'reply', emailResponse);
        } catch (error) {
          console.warn('[advisory:email:reply]', error);
        }
      }

      setFeedback({
        tone: 'success',
        message:
          canEditStatus && nextStatus === 'cerrada'
            ? 'La asesoría quedó cerrada.'
            : 'La conversación y la actualización de asesoría quedaron guardadas.',
      });
      draft.attachments.forEach((attachment) => {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });
      setResponseDrafts((current) => ({
        ...current,
        [advisoryId]: {
          estado: canEditStatus ? nextStatus : advisory.estado,
          mensaje: '',
          attachments: [],
        },
      }));
      await fetchModuleData(false);
    } finally {
      savingAdvisoryIdsRef.current.delete(advisoryId);
      setSaving(false);
    }
  };

  const activeAreaLabel = AREA_LABELS[selectedArea];
  const areaContributorLabel = selectedArea === 'quimica' ? 'químico' : 'ingeniero';
  const isTechnician = effectiveCurrentRole === 'tecnico';

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
                Serie{' '}
                {selectedEquipment && selectedTicket.numero_serie_equipo ? (
                  <button
                    type="button"
                    className="advisory-equipment-link"
                    onClick={() => openEquipmentDetailModal(selectedTicket.numero_serie_equipo)}
                  >
                    {selectedTicket.numero_serie_equipo}
                  </button>
                ) : (
                  selectedTicket.numero_serie_equipo || 'N/D'
                )}{' '}
                · ticket abierto desde {formatDateTimeLabel(selectedTicket.creado_en)}
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                Plataforma: {selectedPlatformStatusLabel} · área sugerida: {AREA_LABELS[inferAdvisoryAreaFromTicket(selectedTicket)]}
              </span>
              {selectedEquipment ? (
                <span className="advisory-equipment-link__hint">Haz clic en la serie para abrir la ficha del equipo.</span>
              ) : null}
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

          <div className="advisory-thread-card__section">
            <div className="advisory-thread-card__section-header">
              <div>
                <div className="advisory-thread-card__eyebrow">Evidencia técnica</div>
                <strong>Adjunta foto, graba video o sube uno ya guardado</strong>
              </div>
              <div className="advisory-thread-actions">
                <label className="button-primary inactive advisory-thread-action-pill" htmlFor="advisory-create-photo">
                  Foto
                </label>
                <input
                  id="advisory-create-photo"
                  hidden
                  type="file"
                  accept={IMAGE_ATTACHMENT_ACCEPT}
                  capture="environment"
                  onChange={(event) => void addPendingAttachments(event.target.files, 'photo', 'create')}
                />
                <label className="button-primary inactive advisory-thread-action-pill" htmlFor="advisory-create-video-capture">
                  Grabar video
                </label>
                <input
                  id="advisory-create-video-capture"
                  hidden
                  type="file"
                  accept={VIDEO_ATTACHMENT_ACCEPT}
                  capture="environment"
                  onChange={(event) => void addPendingAttachments(event.target.files, 'video', 'create')}
                />
                <label className="button-primary inactive advisory-thread-action-pill" htmlFor="advisory-create-video-library">
                  Subir video
                </label>
                <input
                  id="advisory-create-video-library"
                  hidden
                  type="file"
                  accept={VIDEO_ATTACHMENT_ACCEPT}
                  onChange={(event) => void addPendingAttachments(event.target.files, 'video', 'create')}
                />
                <label className="button-primary inactive advisory-thread-action-pill" htmlFor="advisory-create-report">
                  Reporte
                </label>
                <input
                  id="advisory-create-report"
                  hidden
                  type="file"
                  accept={REPORT_ATTACHMENT_ACCEPT}
                  onChange={(event) => void addPendingAttachments(event.target.files, 'report', 'create')}
                />
              </div>
            </div>

            {createEvidenceDrafts.length > 0 ? (
              <div className="advisory-attachment-draft-grid">
                {createEvidenceDrafts.map((attachment) => (
                  <article key={attachment.localId} className="advisory-attachment-draft">
                    <div className="advisory-attachment-draft__topline">
                      <span className="glass-pill">{EVIDENCE_KIND_LABELS[attachment.kind]}</span>
                      <button
                        type="button"
                        className="button-primary inactive advisory-attachment-draft__remove"
                        onClick={() => removePendingAttachment('create', attachment.localId)}
                      >
                        Quitar
                      </button>
                    </div>
                    {renderPendingAttachmentPreview(attachment)}
                    <strong>{attachment.fileName}</strong>
                    <span>
                      {attachment.status === 'processing'
                        ? 'Analizando archivo…'
                        : attachment.status === 'error'
                          ? attachment.error || 'No se pudo leer'
                          : 'Listo para adjuntar'}
                    </span>
                    {attachment.analysis?.summary?.length ? (
                      <div className="advisory-attachment-draft__chips">
                        {attachment.analysis.summary.slice(0, 3).map((summary) => (
                          <span key={summary}>{summary}</span>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="advisory-thread-empty">Sin evidencias adjuntas todavía.</div>
            )}
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
                  ? `Estás viendo los casos de ${activeAreaLabel.toLowerCase()} donde eres solicitante o apareces como destinatario.`
                  : `Estás viendo únicamente los casos de ${activeAreaLabel.toLowerCase()}, tanto los que escalaste como los que te asignaron.`}
              </p>
            </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className="button-primary inactive chip" style={{ textTransform: 'none' }}>
              {areaAssignedAdvisories.length} asignadas
            </span>
            <span className="button-primary inactive chip" style={{ textTransform: 'none' }}>
              {areaRequestedAdvisories.length} solicitadas por mí
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
              const relatedEquipment = ticket?.numero_serie_equipo
                ? equipmentBySerial.get(normalizeSerialLookup(ticket.numero_serie_equipo)) || null
                : null;
              const requester = advisory.solicitante_id ? profileById.get(advisory.solicitante_id) || null : null;
              const recipients = notificationsByAdvisoryId.get(advisory.id) || [];
              const unreadForThisAdvisory = recipients.filter(
                (notification) => notification.destinatario_id === currentUserId && !notification.leida_en,
              ).length;
              const threadSummary = threadSummaryByAdvisoryId.get(advisory.id);
              const isExpanded = activeAdvisoryId === advisory.id;
              const draft = responseDrafts[advisory.id] || {
                estado: advisory.estado,
                mensaje: '',
                attachments: [],
              };
              const viewerRole = getViewerThreadRole(advisory);
              const conversationUnread =
                viewerRole === 'requester'
                  ? threadSummary?.unreadRequester || 0
                  : threadSummary?.unreadTrainer || 0;
              const unreadBadgeCount = Math.max(unreadForThisAdvisory, conversationUnread);
              const lastMessage =
                threadSummary?.messages.slice().reverse().find((message) => message.role !== 'system') ||
                threadSummary?.messages[threadSummary.messages.length - 1] ||
                null;
              const canEditStatus = viewerRole === 'trainer';
              const tone = STATUS_TONE[advisory.estado];

              return (
                <div
                  key={advisory.id}
                  data-advisory-id={advisory.id}
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
                        {unreadBadgeCount > 0 ? (
                          <span
                            className="button-primary chip advisory-thread-card__chip"
                            style={{ textTransform: 'none', padding: '0.2rem 0.7rem', minHeight: 'unset' }}
                          >
                            {unreadBadgeCount} nueva{unreadBadgeCount === 1 ? '' : 's'}
                          </span>
                        ) : null}
                        {threadSummary ? (
                          <span
                            className="button-primary inactive chip advisory-thread-card__chip advisory-thread-card__chip--neutral"
                            style={{
                              textTransform: 'none',
                              color: WAITING_COLORS[threadSummary.waitingOn],
                              borderColor: `${WAITING_COLORS[threadSummary.waitingOn]}33`,
                            }}
                          >
                            {WAITING_LABELS[threadSummary.waitingOn]}
                          </span>
                        ) : null}
                      </div>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                        {formatDateTimeLabel(threadSummary?.lastMessageAt || advisory.creado_en)}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gap: '0.22rem' }}>
                      <strong style={{ fontSize: '1rem' }}>{ticket?.asunto || 'Ticket no encontrado'}</strong>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                        Serie {ticket?.numero_serie_equipo || 'N/D'} · solicitó {advisory.solicitante_nombre_snapshot || requester?.nombre_completo || 'Sistema'}
                      </span>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
                      {lastMessage?.body || advisory.consulta_escalada}
                    </p>
                    {threadSummary ? (
                      <div className="advisory-thread-summary-strip">
                        <span>{threadSummary.messageCount} mensajes</span>
                        <span>{threadSummary.attachmentCount} evidencias</span>
                        <span>{formatMinutesLabel(threadSummary.firstTrainerResponseMinutes)} primera respuesta</span>
                      </div>
                    ) : null}
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
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginBottom: '0.2rem' }}>Serie / equipo</div>
                            {relatedEquipment && ticket?.numero_serie_equipo ? (
                              <button
                                type="button"
                                className="advisory-equipment-link"
                                onClick={() => openEquipmentDetailModal(ticket.numero_serie_equipo)}
                              >
                                {ticket.numero_serie_equipo}
                              </button>
                            ) : (
                              <strong>{ticket?.numero_serie_equipo || 'N/D'}</strong>
                            )}
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

                      <div className="advisory-thread-grid">
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

                      <div className="advisory-thread-grid advisory-thread-grid--topline">
                        <div className="advisory-thread-card__section">
                          <div className="advisory-thread-card__section-header">
                            <div>
                              <div className="advisory-thread-card__eyebrow">Customer service</div>
                              <strong>Estado operativo de la conversación</strong>
                            </div>
                          </div>
                          <div className="advisory-thread-service-grid">
                            <div className="advisory-thread-service-kpi">
                              <span>Espera</span>
                              <strong style={{ color: WAITING_COLORS[threadSummary?.waitingOn || 'trainer'] }}>
                                {threadSummary ? WAITING_LABELS[threadSummary.waitingOn] : 'Sin cálculo'}
                              </strong>
                            </div>
                            <div className="advisory-thread-service-kpi">
                              <span>Primera respuesta</span>
                              <strong>{formatMinutesLabel(threadSummary?.firstTrainerResponseMinutes ?? null)}</strong>
                            </div>
                            <div className="advisory-thread-service-kpi">
                              <span>Evidencias</span>
                              <strong>{threadSummary?.attachmentCount || 0}</strong>
                            </div>
                            <div className="advisory-thread-service-kpi">
                              <span>Mensajes</span>
                              <strong>{threadSummary?.messageCount || 0}</strong>
                            </div>
                          </div>
                          <div className="advisory-thread-chip-cloud">
                            {threadSummary?.evidenceTags?.length ? (
                              threadSummary.evidenceTags.map((tag) => (
                                <span key={tag} className="advisory-thread-chip-cloud__item">
                                  {tag}
                                </span>
                              ))
                            ) : (
                              <span className="advisory-thread-chip-cloud__item advisory-thread-chip-cloud__item--empty">
                                Sin señales OCR todavía
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="advisory-thread-card__section">
                          <div className="advisory-thread-card__section-header">
                            <div>
                              <div className="advisory-thread-card__eyebrow">Destinatarios</div>
                              <strong>Trainers notificados</strong>
                            </div>
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
                      </div>

                      <div className="advisory-thread-card__section">
                        <div className="advisory-thread-card__section-header">
                          <div>
                            <div className="advisory-thread-card__eyebrow">Conversación</div>
                            <strong>Expediente conversacional</strong>
                          </div>
                        </div>
                        <div className="advisory-thread-chat">
                          {threadSummary?.messages.map((message) => (
                            <div key={message.id} className={`advisory-thread-bubble advisory-thread-bubble--${message.role}`}>
                              <div className="advisory-thread-bubble__meta">
                                <strong>{message.actorName}</strong>
                                <span>
                                  {getMessageRoleLabel(message.role)} · {formatDateTimeLabel(message.createdAt)}
                                </span>
                              </div>
                              <p>{message.body}</p>
                              {message.attachments.length > 0 ? (
                                  <div className="advisory-thread-attachments">
                                    {message.attachments.map((attachment) => (
                                      <a
                                        key={attachment.id}
                                        href={attachment.publicUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="advisory-thread-attachment"
                                      >
                                      {(() => {
                                        const media = renderThreadAttachmentMedia(attachment);
                                        return media ? (
                                          media
                                        ) : (
                                          <div className="advisory-thread-attachment__file">
                                            <strong>{attachment.fileName}</strong>
                                            <span>{EVIDENCE_KIND_LABELS[attachment.kind]}</span>
                                          </div>
                                        );
                                      })()}
                                      {attachment.analysis?.summary?.length ? (
                                        <div className="advisory-thread-attachment__chips">
                                          {attachment.analysis.summary.slice(0, 3).map((summary) => (
                                            <span key={summary}>{summary}</span>
                                          ))}
                                        </div>
                                      ) : null}
                                    </a>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="advisory-thread-card__section advisory-thread-card__section--response">
                        <div className="advisory-thread-card__section-header">
                          <div>
                            <div className="advisory-thread-card__eyebrow">Responder</div>
                            <strong>{viewerRole === 'trainer' ? 'Responder como trainer' : 'Responder como solicitante'}</strong>
                          </div>
                        </div>

                        {canEditStatus ? (
                          <div className="advisory-thread-grid advisory-thread-grid--compact">
                            <div>
                              <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>Estado</label>
                              <select
                                className="input-field"
                                value={draft.estado}
                                onChange={(event) =>
                                  updateResponseDraft(advisory.id, { estado: event.target.value as AdvisoryStatus })
                                }
                              >
                                {STATUS_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ) : null}

                        <div className="advisory-thread-quick-replies">
                          {QUICK_REPLIES[viewerRole].map((reply) => (
                            <button
                              key={reply}
                              type="button"
                              className="button-primary inactive advisory-thread-quick-reply"
                              onClick={() =>
                                updateResponseDraft(advisory.id, {
                                  mensaje: draft.mensaje ? `${draft.mensaje}\n${reply}` : reply,
                                })
                              }
                            >
                              {reply}
                            </button>
                          ))}
                        </div>

                        <div>
                          <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>Mensaje</label>
                          <textarea
                            className="input-field"
                            rows={4}
                            value={draft.mensaje}
                            onChange={(event) => updateResponseDraft(advisory.id, { mensaje: event.target.value })}
                            placeholder={
                              viewerRole === 'trainer'
                                ? 'Documenta la asesoría, la interpretación de evidencia y el siguiente paso.'
                                : 'Responde con hallazgos nuevos, confirma resultado o agrega contexto.'
                            }
                          />
                        </div>

                        <div className="advisory-thread-actions">
                          <label className="button-primary inactive advisory-thread-action-pill" htmlFor={`reply-photo-${advisory.id}`}>
                            Foto
                          </label>
                          <input
                            id={`reply-photo-${advisory.id}`}
                            hidden
                            type="file"
                            accept={IMAGE_ATTACHMENT_ACCEPT}
                            capture="environment"
                            onChange={(event) => void addPendingAttachments(event.target.files, 'photo', advisory.id)}
                          />
                          <label className="button-primary inactive advisory-thread-action-pill" htmlFor={`reply-video-capture-${advisory.id}`}>
                            Grabar video
                          </label>
                          <input
                            id={`reply-video-capture-${advisory.id}`}
                            hidden
                            type="file"
                            accept={VIDEO_ATTACHMENT_ACCEPT}
                            capture="environment"
                            onChange={(event) => void addPendingAttachments(event.target.files, 'video', advisory.id)}
                          />
                          <label className="button-primary inactive advisory-thread-action-pill" htmlFor={`reply-video-library-${advisory.id}`}>
                            Subir video
                          </label>
                          <input
                            id={`reply-video-library-${advisory.id}`}
                            hidden
                            type="file"
                            accept={VIDEO_ATTACHMENT_ACCEPT}
                            onChange={(event) => void addPendingAttachments(event.target.files, 'video', advisory.id)}
                          />
                          <label className="button-primary inactive advisory-thread-action-pill" htmlFor={`reply-report-${advisory.id}`}>
                            Reporte
                          </label>
                          <input
                            id={`reply-report-${advisory.id}`}
                            hidden
                            type="file"
                            accept={REPORT_ATTACHMENT_ACCEPT}
                            onChange={(event) => void addPendingAttachments(event.target.files, 'report', advisory.id)}
                          />
                          <label className="button-primary inactive advisory-thread-action-pill" htmlFor={`reply-service-${advisory.id}`}>
                            Prueba de servicio
                          </label>
                          <input
                            id={`reply-service-${advisory.id}`}
                            hidden
                            type="file"
                            accept={REPORT_ATTACHMENT_ACCEPT}
                            onChange={(event) => void addPendingAttachments(event.target.files, 'service_test', advisory.id)}
                          />
                        </div>

                        {draft.attachments.length > 0 ? (
                          <div className="advisory-attachment-draft-grid">
                            {draft.attachments.map((attachment) => (
                              <article key={attachment.localId} className="advisory-attachment-draft">
                                <div className="advisory-attachment-draft__topline">
                                  <span className="glass-pill">{EVIDENCE_KIND_LABELS[attachment.kind]}</span>
                                  <button
                                    type="button"
                                    className="button-primary inactive advisory-attachment-draft__remove"
                                    onClick={() => removePendingAttachment(advisory.id, attachment.localId)}
                                  >
                                    Quitar
                                  </button>
                                </div>
                                {renderPendingAttachmentPreview(attachment)}
                                <strong>{attachment.fileName}</strong>
                                <span>
                                  {attachment.status === 'processing'
                                    ? 'Analizando archivo…'
                                    : attachment.status === 'error'
                                      ? attachment.error || 'No se pudo leer'
                                      : 'Listo para adjuntar'}
                                </span>
                                {attachment.analysis?.summary?.length ? (
                                  <div className="advisory-attachment-draft__chips">
                                    {attachment.analysis.summary.slice(0, 3).map((summary) => (
                                      <span key={summary}>{summary}</span>
                                    ))}
                                  </div>
                                ) : null}
                              </article>
                            ))}
                          </div>
                        ) : null}

                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                            {threadSummary?.lastMessageAt
                              ? `Última actividad: ${formatDateTimeLabel(threadSummary.lastMessageAt)}`
                              : 'Aún no hay actividad conversacional.'}
                          </div>
                          <button
                            type="button"
                            className="button-primary"
                            onClick={() => void handleSaveAdvisoryResponse(advisory.id)}
                            disabled={saving}
                          >
                            Guardar mensaje
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
            <div className="advisory-metrics-header__topline">
              <div>
                <h3 style={{ marginBottom: '0.35rem' }}>Métricas de {activeAreaLabel.toLowerCase()}</h3>
                <p style={{ color: 'var(--text-secondary)' }}>{metricsScopeLabel}.</p>
              </div>
              <div className="advisory-metrics-header__actions">
                <button
                  type="button"
                  className="button-primary inactive advisory-thread-action-pill"
                  onClick={() => void exportMetrics('excel')}
                  disabled={exportingMetrics !== null || metricsScopeAdvisories.length === 0}
                >
                  {exportingMetrics === 'excel' ? 'Generando Excel...' : 'Descargar Excel'}
                </button>
                <button
                  type="button"
                  className="button-primary inactive advisory-thread-action-pill"
                  onClick={() => void exportMetrics('pdf')}
                  disabled={exportingMetrics !== null || metricsScopeAdvisories.length === 0}
                >
                  {exportingMetrics === 'pdf' ? 'Generando PDF...' : 'Descargar PDF'}
                </button>
              </div>
            </div>
            <div className="advisory-metrics-kpis">
              <article className="advisory-metrics-kpi">
                <span>Total de asesorías</span>
                <strong>{metricsScopeAdvisories.length}</strong>
              </article>
              <article className="advisory-metrics-kpi">
                <span>Primera respuesta promedio</span>
                <strong>{formatMinutesLabel(metricsAverageFirstResponseMinutes)}</strong>
              </article>
              <article className="advisory-metrics-kpi">
                <span>Cobertura con evidencia</span>
                <strong>{metricsEvidenceCoverage}%</strong>
              </article>
              <article className="advisory-metrics-kpi">
                <span>Esperando a trainer</span>
                <strong>{metricsWaitingRows.find((row) => row.key === 'trainer')?.value || 0}</strong>
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
                  <strong>Distribución operativa</strong>
                  <span>Estados y espera del flujo</span>
                </div>
                <div className="advisory-metrics-donut-grid">
                  <div className="advisory-metrics-donut-card">
                    <div
                      className="advisory-metrics-donut"
                      style={{
                        background: buildConicGradient(
                          metricsStatusRows.map((row, index) => ({
                            value: row.value,
                            color: ['#c13d4f', '#d5902f', '#2f8c61', '#7c8895'][index % 4],
                          })),
                        ),
                      }}
                    >
                      <div className="advisory-metrics-donut__center">
                        <strong>{metricsScopeAdvisories.length}</strong>
                        <span>casos</span>
                      </div>
                    </div>
                    <div className="advisory-metrics-mini-list">
                      <span className="advisory-metrics-mini-list__title">Por estado</span>
                      {metricsStatusRows.map((row) => (
                        <div key={row.key} className="advisory-metrics-chip-row advisory-metrics-chip-row--status">
                          <strong>{row.label}</strong>
                          <span>{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="advisory-metrics-donut-card">
                    <div
                      className="advisory-metrics-donut advisory-metrics-donut--waiting"
                      style={{
                        background: buildConicGradient(
                          metricsWaitingRows.map((row) => ({
                            value: row.value,
                            color: WAITING_COLORS[row.key as AdvisoryWaitingOn] || '#7c8895',
                          })),
                        ),
                      }}
                    >
                      <div className="advisory-metrics-donut__center">
                        <strong>{metricsWaitingRows.reduce((sum, row) => sum + row.value, 0)}</strong>
                        <span>esperas</span>
                      </div>
                    </div>
                    <div className="advisory-metrics-mini-list">
                      <span className="advisory-metrics-mini-list__title">A quién le toca</span>
                      {metricsWaitingRows.map((row) => (
                        <div key={row.key} className="advisory-metrics-chip-row advisory-metrics-chip-row--status">
                          <strong>{row.label}</strong>
                          <span>{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="advisory-metrics-card">
                <div className="advisory-metrics-card__header">
                  <strong>Carga y respuesta por trainer</strong>
                  <span>Asignadas vs contestadas, con tiempo promedio</span>
                </div>
                <div className="advisory-metrics-list">
                  {metricsTrainerWorkloadRows.length > 0 ? (
                    metricsTrainerWorkloadRows.map((row) => (
                      <div key={row.key} className="advisory-metrics-row">
                        <div className="advisory-metrics-row__copy">
                          <strong>{row.label}</strong>
                          <span>
                            {row.assigned} asignada(s) · {row.responded} respondida(s) · {formatMinutesLabel(row.avgFirstResponseMinutes)}
                          </span>
                        </div>
                        <div className="advisory-metrics-row__dual">
                          <div className="advisory-metrics-row__bar">
                            <span style={{ width: `${(row.assigned / (metricsTrainerWorkloadRows[0]?.assigned || 1)) * 100}%` }} />
                          </div>
                          <div className="advisory-metrics-row__bar advisory-metrics-row__bar--accent">
                            <span style={{ width: `${(row.responded / (metricsTrainerWorkloadRows[0]?.assigned || 1)) * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="advisory-metrics-empty advisory-metrics-empty--inline">
                      Todavía no hay suficiente actividad de respuesta para esta vista.
                    </div>
                  )}
                </div>
              </section>

              <section className="advisory-metrics-card">
                <div className="advisory-metrics-card__header">
                  <strong>Heatmap de recurrencia</strong>
                  <span>{areaContributorLabel}s vs tipos más repetidos</span>
                </div>
                <div className="advisory-metrics-heatmap-shell">
                  <div
                    className="advisory-metrics-heatmap"
                    style={{
                      gridTemplateColumns: `minmax(150px, 190px) repeat(${Math.max(metricsHeatmap.types.length, 1)}, minmax(118px, 1fr))`,
                    }}
                  >
                    <div className="advisory-metrics-heatmap__header">Solicitante</div>
                    {metricsHeatmap.types.map((type) => (
                      <div key={type.key} className="advisory-metrics-heatmap__col-label" title={type.label}>
                        {type.label}
                      </div>
                    ))}
                    {metricsHeatmap.requesters.map((requesterRow) => (
                      <div key={requesterRow.key} className="advisory-metrics-heatmap__row">
                        <div className="advisory-metrics-heatmap__row-label" title={requesterRow.label}>
                          <strong>{requesterRow.label}</strong>
                        </div>
                        {metricsHeatmap.types.map((type) => {
                          const cell = metricsHeatmap.cells.get(`${requesterRow.key}:${type.key}`);
                          const value = cell?.value || 0;
                          const intensity = metricsHeatmap.max > 0 ? value / metricsHeatmap.max : 0;
                          return (
                            <div
                              key={`${requesterRow.key}:${type.key}`}
                              className={`advisory-metrics-heatmap__cell ${value === 0 ? 'is-empty' : ''}`}
                              style={{
                                background:
                                  value > 0
                                    ? `linear-gradient(180deg, rgba(var(--brand-red-rgb), ${0.12 + intensity * 0.2}), rgba(255,255,255,0.96))`
                                    : 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(246,248,251,0.82))',
                                borderColor:
                                  value > 0
                                    ? `rgba(var(--brand-red-rgb), ${0.12 + intensity * 0.25})`
                                    : 'rgba(124, 136, 149, 0.1)',
                                boxShadow:
                                  value > 0
                                    ? `0 14px 24px rgba(var(--brand-red-rgb), ${0.06 + intensity * 0.08})`
                                    : 'inset 0 1px 0 rgba(255,255,255,0.74)',
                              }}
                              title={`${requesterRow.label} · ${type.label}: ${value}`}
                            >
                              <strong>{value}</strong>
                              <span>{value > 0 ? 'casos' : 'sin cruce'}</span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="advisory-metrics-card">
                <div className="advisory-metrics-card__header">
                  <strong>Ritmo de la operación</strong>
                  <span>Nuevas, respondidas y cerradas por día</span>
                </div>
                <div className="advisory-metrics-timeline">
                  {metricsTimelineDays.map((day) => {
                    const max = Math.max(
                      ...metricsTimelineDays.map((item) => item.created + item.replied + item.closed),
                      1,
                    );
                    const total = day.created + day.replied + day.closed;

                    return (
                      <div key={day.key} className="advisory-metrics-timeline__day" title={`${day.label}: ${total} movimiento(s)`}>
                        <div className="advisory-metrics-timeline__stack">
                          <span
                            className="advisory-metrics-timeline__bar advisory-metrics-timeline__bar--created"
                            style={{ height: `${(day.created / max) * 100}%` }}
                          />
                          <span
                            className="advisory-metrics-timeline__bar advisory-metrics-timeline__bar--replied"
                            style={{ height: `${(day.replied / max) * 100}%` }}
                          />
                          <span
                            className="advisory-metrics-timeline__bar advisory-metrics-timeline__bar--closed"
                            style={{ height: `${(day.closed / max) * 100}%` }}
                          />
                        </div>
                        <div className="advisory-metrics-timeline__meta">
                          <strong>{total}</strong>
                          <span>{day.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="advisory-metrics-legend">
                  <span><i className="advisory-metrics-legend__dot advisory-metrics-legend__dot--created" />Nuevas</span>
                  <span><i className="advisory-metrics-legend__dot advisory-metrics-legend__dot--replied" />Respondidas</span>
                  <span><i className="advisory-metrics-legend__dot advisory-metrics-legend__dot--closed" />Cerradas</span>
                </div>
              </section>
            </div>
          )}
        </div>
      ) : null}
      <EquipmentDetailsModal
        equipment={equipmentDetailRecord}
        serial={equipmentDetailSerial}
        onClose={() => setEquipmentDetailSerial(null)}
      />
    </div>
  );
}
