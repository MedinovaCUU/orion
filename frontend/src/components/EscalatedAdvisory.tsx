import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { stripPlaneacionMeta, type EquipmentSummary, type ProfileSummary } from './servicesPlanning';

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

interface AdvisoryFeedback {
  tone: 'success' | 'error' | 'info';
  message: string;
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

const STATUS_TONE: Record<AdvisoryStatus, { background: string; color: string; border: string }> = {
  solicitada: {
    background: 'rgba(186, 0, 13, 0.14)',
    color: '#ffd7db',
    border: 'rgba(186, 0, 13, 0.32)',
  },
  en_revision: {
    background: 'rgba(242, 190, 42, 0.14)',
    color: '#ffe7a3',
    border: 'rgba(242, 190, 42, 0.3)',
  },
  asesorada: {
    background: 'rgba(0, 230, 118, 0.12)',
    color: '#cbffe2',
    border: 'rgba(0, 230, 118, 0.28)',
  },
  cerrada: {
    background: 'rgba(133, 145, 166, 0.12)',
    color: '#dde5f0',
    border: 'rgba(133, 145, 166, 0.24)',
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
  const [activeAdvisoryId, setActiveAdvisoryId] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [selectedArea, setSelectedArea] = useState<AdvisoryArea>('ingenieria');
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [pasosSeguidos, setPasosSeguidos] = useState('');
  const [ajustesRealizados, setAjustesRealizados] = useState('');
  const [accionesTomadas, setAccionesTomadas] = useState('');
  const [averia, setAveria] = useState('');
  const [detalleAveria, setDetalleAveria] = useState('');
  const [refaccionesUtilizadas, setRefaccionesUtilizadas] = useState('');
  const [bibliografiaConsultada, setBibliografiaConsultada] = useState('');
  const [consultaEscalada, setConsultaEscalada] = useState('');
  const [responseDrafts, setResponseDrafts] = useState<Record<string, { estado: AdvisoryStatus; respuesta: string }>>(
    {},
  );

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

  useEffect(() => {
    const inferredArea = inferAdvisoryAreaFromTicket(selectedTicket);
    setSelectedArea(inferredArea);
    setAveria(getTicketAveriaSuggestion(selectedTicket));
    setDetalleAveria(getTicketDetailSuggestion(selectedTicket));
  }, [selectedTicketId, selectedTicket]);

  const staffProfiles = useMemo(
    () => sortProfilesByName(profiles.filter((profile) => STAFF_ROLES.has(profile.rol || ''))),
    [profiles],
  );

  const recommendedTrainers = useMemo(
    () =>
      staffProfiles.filter((profile) =>
        selectedArea === 'ingenieria' ? profile.trainer_ingenieria : profile.trainer_quimica,
      ),
    [selectedArea, staffProfiles],
  );

  const fallbackRecipients = useMemo(() => {
    const withoutCurrentUser = staffProfiles.filter((profile) => profile.id !== currentUserId);
    const admins = withoutCurrentUser.filter((profile) => profile.rol === 'admin');
    const receivingStaff = withoutCurrentUser.filter((profile) => profile.recibe_tickets !== false);

    if (admins.length > 0) {
      return admins;
    }

    if (receivingStaff.length > 0) {
      return receivingStaff;
    }

    return withoutCurrentUser;
  }, [currentUserId, staffProfiles]);

  const recipientPool = recommendedTrainers.length > 0 ? recommendedTrainers : fallbackRecipients;
  const usingFallbackRecipients = recommendedTrainers.length === 0;

  useEffect(() => {
    const availableIds = new Set(recipientPool.map((profile) => profile.id));
    const defaultIds = recipientPool.map((profile) => profile.id);

    setSelectedRecipientIds((current) => {
      const stillValid = current.filter((profileId) => availableIds.has(profileId));
      return stillValid.length > 0 ? stillValid : defaultIds;
    });
  }, [recipientPool]);

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
    ] = await Promise.all([
      supabase.from('profiles').select('id, rol').eq('id', user.id).single(),
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
          'id, nombre_completo, employee_number, telefono, territorio, rol, recibe_tickets, trainer_ingenieria, trainer_quimica',
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

    setCurrentUserId(user.id);
    setCurrentRole((profileResponse.data as { rol?: string | null } | null)?.rol || null);
    setTickets((ticketsResponse.data as AdvisoryTicketSummary[] | null) || []);
    setEquipments((equipmentsResponse.data as EquipmentSummary[] | null) || []);
    setProfiles((profilesResponse.data as ProfileSummary[] | null) || []);
    setAdvisories((advisoriesResponse.data as AdvisoryRecord[] | null) || []);
    setNotifications((notificationsResponse.data as AdvisoryNotificationRecord[] | null) || []);
    setLoading(false);
  };

  useEffect(() => {
    void fetchModuleData();

    const timer = window.setInterval(() => {
      void fetchModuleData(false);
    }, 45000);

    return () => window.clearInterval(timer);
  }, []);

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
    setSelectedRecipientIds(recipientPool.map((profile) => profile.id));
  };

  const toggleRecipient = (profileId: string) => {
    setSelectedRecipientIds((current) =>
      current.includes(profileId) ? current.filter((id) => id !== profileId) : [...current, profileId],
    );
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

    if (selectedRecipientIds.length === 0) {
      setFeedback({ tone: 'error', message: 'Selecciona al menos un trainer o destinatario para la escalación.' });
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

    const notificationsPayload = selectedRecipientIds.map((profileId) => ({
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
      message: `La asesoría se escaló a ${selectedRecipientIds.length} destinatario(s).`,
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

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <div className="card" style={{ padding: '1.35rem' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Notificaciones para mí
          </div>
          <strong style={{ display: 'block', fontSize: '2rem', marginTop: '0.4rem' }}>{unreadNotificationsForMe}</strong>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginTop: '0.3rem' }}>
            Escalaciones pendientes por leer o revisar.
          </p>
        </div>
        <div className="card" style={{ padding: '1.35rem' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Mis solicitudes
          </div>
          <strong style={{ display: 'block', fontSize: '2rem', marginTop: '0.4rem' }}>{myRequestedAdvisories.length}</strong>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginTop: '0.3rem' }}>
            Asesorías escaladas desde tus tickets.
          </p>
        </div>
        <div className="card" style={{ padding: '1.35rem' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Bandeja asignada
          </div>
          <strong style={{ display: 'block', fontSize: '2rem', marginTop: '0.4rem' }}>{myAssignedAdvisories.length}</strong>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginTop: '0.3rem' }}>
            Casos donde apareces como trainer o destinatario.
          </p>
        </div>
      </div>

      <div className="card" style={{ padding: '1.65rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ marginBottom: '0.35rem' }}>Escalar asesoría</h3>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '760px' }}>
              Selecciona el ticket, resume qué ya se intentó en campo y dirige la solicitud al grupo correcto para que el trainer revise y responda.
            </p>
          </div>
          <button type="button" className="button-primary inactive" onClick={() => void fetchModuleData(false)} disabled={loading || saving}>
            Actualizar módulo
          </button>
        </div>

        {feedback ? (
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.95rem 1rem',
              borderRadius: '14px',
              border:
                feedback.tone === 'error'
                  ? '1px solid rgba(244, 63, 94, 0.3)'
                  : feedback.tone === 'success'
                    ? '1px solid rgba(34, 197, 94, 0.28)'
                    : '1px solid rgba(59, 130, 246, 0.28)',
              background:
                feedback.tone === 'error'
                  ? 'rgba(127, 29, 29, 0.22)'
                  : feedback.tone === 'success'
                    ? 'rgba(20, 83, 45, 0.18)'
                    : 'rgba(15, 23, 42, 0.28)',
              color:
                feedback.tone === 'error'
                  ? '#ffd7dc'
                  : feedback.tone === 'success'
                    ? '#d4ffe4'
                    : '#dcebff',
            }}
          >
            {feedback.message}
          </div>
        ) : null}

        <form onSubmit={handleCreateAdvisory} style={{ display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.75fr 0.75fr', gap: '1rem' }}>
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
            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', color: 'var(--text-secondary)' }}>Actividad *</label>
              <select
                className="input-field"
                value={selectedArea}
                onChange={(event) => setSelectedArea(event.target.value as AdvisoryArea)}
              >
                <option value="ingenieria">Ingeniería</option>
                <option value="quimica">Química</option>
              </select>
            </div>
          </div>

          {selectedTicket ? (
            <div
              style={{
                padding: '1rem',
                borderRadius: '14px',
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.03)',
                display: 'grid',
                gap: '0.25rem',
              }}
            >
              <strong>{selectedTicket.asunto}</strong>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
                Serie {selectedTicket.numero_serie_equipo || 'N/D'} · ticket abierto desde {formatDateTimeLabel(selectedTicket.creado_en)}
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                Plataforma: {selectedPlatformStatusLabel} · área sugerida: {AREA_LABELS[inferAdvisoryAreaFromTicket(selectedTicket)]}
              </span>
            </div>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', color: 'var(--text-secondary)' }}>Avería *</label>
              <input
                className="input-field"
                value={averia}
                onChange={(event) => setAveria(event.target.value)}
                required
                placeholder="Tipo de avería o síntoma principal"
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
                placeholder="Describe técnicamente la falla observada por el ingeniero a cargo."
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1rem' }}>
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
                placeholder="Parámetros, calibraciones, limpiezas o reconfiguraciones aplicadas."
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', color: 'var(--text-secondary)' }}>Acciones tomadas</label>
              <textarea
                className="input-field"
                rows={5}
                value={accionesTomadas}
                onChange={(event) => setAccionesTomadas(event.target.value)}
                placeholder="Partes cambiadas, pruebas ejecutadas, llamados previos, evidencias levantadas."
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', color: 'var(--text-secondary)' }}>Refacciones utilizadas</label>
              <textarea
                className="input-field"
                rows={3}
                value={refaccionesUtilizadas}
                onChange={(event) => setRefaccionesUtilizadas(event.target.value)}
                placeholder="Códigos, cantidades o descripción de refacciones usadas."
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.45rem', color: 'var(--text-secondary)' }}>Bibliografía consultada</label>
              <textarea
                className="input-field"
                rows={3}
                value={bibliografiaConsultada}
                onChange={(event) => setBibliografiaConsultada(event.target.value)}
                placeholder="Manual, procedimiento, boletín técnico o referencia revisada."
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

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.55rem' }}>
              <label style={{ color: 'var(--text-secondary)' }}>
                Destinatarios de la notificación ({AREA_LABELS[selectedArea]})
              </label>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                {usingFallbackRecipients
                  ? 'Sin trainers configurados para esta área; se usa staff de respaldo.'
                  : 'Se detectaron trainers configurados para esta área.'}
              </span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '0.75rem',
              }}
            >
              {recipientPool.map((profile) => {
                const checked = selectedRecipientIds.includes(profile.id);
                return (
                  <label
                    key={profile.id}
                    style={{
                      display: 'flex',
                      gap: '0.7rem',
                      alignItems: 'flex-start',
                      padding: '0.9rem 0.95rem',
                      borderRadius: '14px',
                      cursor: 'pointer',
                      border: checked ? '1px solid rgba(186, 0, 13, 0.35)' : '1px solid rgba(255,255,255,0.08)',
                      background: checked ? 'rgba(186, 0, 13, 0.12)' : 'rgba(255,255,255,0.03)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRecipient(profile.id)}
                      style={{ marginTop: '0.22rem' }}
                    />
                    <span style={{ display: 'grid', gap: '0.16rem' }}>
                      <strong>{profile.nombre_completo || 'Sin nombre'}</strong>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
                        {(profile.rol || 'staff').toUpperCase()} · {profile.telefono || 'Sin teléfono'}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
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
              Aquí ves tanto lo que has escalado como lo que te asignaron para revisión.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className="button-primary inactive chip" style={{ textTransform: 'none' }}>
              {myAssignedAdvisories.length} asignadas
            </span>
            <span className="button-primary inactive chip" style={{ textTransform: 'none' }}>
              {myRequestedAdvisories.length} solicitadas por mí
            </span>
          </div>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Cargando asesorías escaladas...</p>
        ) : advisories.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>Todavía no hay asesorías escaladas registradas.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.85rem' }}>
            {advisories.map((advisory) => {
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
                  style={{
                    borderRadius: '16px',
                    border: `1px solid ${tone.border}`,
                    background: 'rgba(255,255,255,0.02)',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => void handleOpenAdvisory(advisory.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: 'transparent',
                      color: 'inherit',
                      border: 'none',
                      padding: '1rem 1.1rem',
                      cursor: 'pointer',
                      display: 'grid',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span
                          className="button-primary inactive chip"
                          style={{ textTransform: 'none', background: tone.background, color: tone.color, borderColor: tone.border }}
                        >
                          {STATUS_LABELS[advisory.estado]}
                        </span>
                        <span className="button-primary inactive chip" style={{ textTransform: 'none' }}>
                          {AREA_LABELS[advisory.area]}
                        </span>
                        {unreadForThisAdvisory > 0 ? (
                          <span
                            className="button-primary chip"
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
                      style={{
                        borderTop: '1px solid rgba(255,255,255,0.08)',
                        padding: '1rem 1.1rem 1.15rem',
                        display: 'grid',
                        gap: '0.9rem',
                        background: 'rgba(0,0,0,0.18)',
                      }}
                    >
                      <div
                        style={{
                          padding: '1rem',
                          borderRadius: '14px',
                          border: '1px solid rgba(255,255,255,0.08)',
                          background: 'rgba(255,255,255,0.025)',
                          display: 'grid',
                          gap: '0.85rem',
                        }}
                      >
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          Reporte generado
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '0.75rem' }}>
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
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.75rem' }}>
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

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.75rem' }}>
                        <div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.28rem' }}>
                            Pasos seguidos
                          </div>
                          <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{advisory.pasos_seguidos || 'Sin detalle capturado.'}</p>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.28rem' }}>
                            Ajustes realizados
                          </div>
                          <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{advisory.ajustes_realizados || 'Sin detalle capturado.'}</p>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.28rem' }}>
                            Acciones tomadas
                          </div>
                          <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{advisory.acciones_tomadas || 'Sin detalle capturado.'}</p>
                        </div>
                      </div>

                      <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.28rem' }}>
                          Destinatarios notificados
                        </div>
                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                          {recipients.map((notification) => {
                            const recipient = profileById.get(notification.destinatario_id);
                            return (
                              <span key={notification.id} className="button-primary inactive chip" style={{ textTransform: 'none' }}>
                                {recipient?.nombre_completo || 'Sin nombre'}
                                {notification.leida_en ? ' · visto' : ' · pendiente'}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gap: '0.75rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '0.75rem' }}>
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
    </div>
  );
}
