export type AdvisoryThreadRole = 'requester' | 'trainer' | 'system';
export type AdvisoryStatus = 'solicitada' | 'en_revision' | 'asesorada' | 'cerrada';
export type AdvisoryWaitingOn = 'requester' | 'trainer' | 'closed';

export interface AdvisoryAttachmentAnalysis {
  summary: string[];
  tags: string[];
  utilities: string[];
  detectedCodes: string[];
  textExcerpt: string;
  sourceReference: string;
}

export type AdvisoryAttachmentKind = 'photo' | 'report' | 'service_test' | 'video';

export interface AdvisoryAttachmentRecord {
  id: string;
  kind: AdvisoryAttachmentKind;
  fileName: string;
  mimeType: string;
  size: number;
  storagePath: string;
  publicUrl: string;
  uploadedAt: string;
  analysis: AdvisoryAttachmentAnalysis | null;
}

export interface AdvisoryThreadMessage {
  id: string;
  kind: 'initial' | 'reply' | 'status_update';
  role: AdvisoryThreadRole;
  actorId: string | null;
  actorName: string;
  body: string;
  createdAt: string;
  attachments: AdvisoryAttachmentRecord[];
  statusSnapshot: AdvisoryStatus | null;
}

export interface AdvisoryMetadata {
  thread?: AdvisoryThreadMessage[];
  serviceDesk?: {
    waitingOn?: AdvisoryWaitingOn;
    unreadRequester?: number;
    unreadTrainer?: number;
    lastActorRole?: AdvisoryThreadRole | null;
    lastMessageAt?: string | null;
    firstTrainerResponseAt?: string | null;
    messageCount?: number;
    attachmentCount?: number;
    responseCount?: number;
    evidenceTags?: string[];
  };
  chemistryGuide?: Record<string, unknown>;
}

export interface AdvisoryThreadSource {
  consultaEscalada: string;
  creadoEn: string;
  solicitanteId: string | null;
  solicitanteNombre: string;
  estado: AdvisoryStatus;
  legacyRespuestaTrainer?: string | null;
  legacyRespondidaEn?: string | null;
  legacyRespondidaPorId?: string | null;
  legacyRespondidaPorNombre?: string | null;
}

export interface AdvisoryThreadAnalytics {
  waitingOn: AdvisoryWaitingOn;
  unreadRequester: number;
  unreadTrainer: number;
  lastActorRole: AdvisoryThreadRole | null;
  lastMessageAt: string | null;
  firstTrainerResponseAt: string | null;
  firstTrainerResponseMinutes: number | null;
  messageCount: number;
  attachmentCount: number;
  responseCount: number;
  evidenceTags: string[];
}

interface AppendMessageOptions {
  metadata: unknown;
  source: AdvisoryThreadSource;
  message: AdvisoryThreadMessage;
  nextStatus: AdvisoryStatus;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const coerceString = (value: unknown) => (typeof value === 'string' ? value : '');
const coerceNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const uniqueStrings = (values: string[]) =>
  values.filter((value, index) => value && values.indexOf(value) === index);

const compareMessages = (left: AdvisoryThreadMessage, right: AdvisoryThreadMessage) =>
  new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();

const sanitizeAnalysis = (value: unknown): AdvisoryAttachmentAnalysis | null => {
  if (!isObject(value)) {
    return null;
  }

  return {
    summary: Array.isArray(value.summary) ? value.summary.map(coerceString).filter(Boolean).slice(0, 6) : [],
    tags: Array.isArray(value.tags) ? uniqueStrings(value.tags.map(coerceString).filter(Boolean)).slice(0, 8) : [],
    utilities: Array.isArray(value.utilities) ? uniqueStrings(value.utilities.map(coerceString).filter(Boolean)).slice(0, 8) : [],
    detectedCodes: Array.isArray(value.detectedCodes)
      ? uniqueStrings(value.detectedCodes.map(coerceString).filter(Boolean)).slice(0, 8)
      : [],
    textExcerpt: coerceString(value.textExcerpt).slice(0, 2400),
    sourceReference: coerceString(value.sourceReference) || 'OCR asesoría',
  };
};

const sanitizeAttachment = (value: unknown): AdvisoryAttachmentRecord | null => {
  if (!isObject(value)) {
    return null;
  }

  const publicUrl = coerceString(value.publicUrl);
  const storagePath = coerceString(value.storagePath);
  if (!publicUrl || !storagePath) {
    return null;
  }

  return {
    id: coerceString(value.id) || crypto.randomUUID(),
    kind:
      value.kind === 'photo' || value.kind === 'report' || value.kind === 'service_test' || value.kind === 'video'
        ? value.kind
        : 'report',
    fileName: coerceString(value.fileName) || 'archivo',
    mimeType: coerceString(value.mimeType) || 'application/octet-stream',
    size: coerceNumber(value.size),
    storagePath,
    publicUrl,
    uploadedAt: coerceString(value.uploadedAt) || new Date().toISOString(),
    analysis: sanitizeAnalysis(value.analysis),
  };
};

const sanitizeMessage = (value: unknown): AdvisoryThreadMessage | null => {
  if (!isObject(value)) {
    return null;
  }

  const body = coerceString(value.body).trim();
  const createdAt = coerceString(value.createdAt) || new Date().toISOString();
  const role: AdvisoryThreadRole =
    value.role === 'trainer' || value.role === 'requester' || value.role === 'system' ? value.role : 'system';
  const kind =
    value.kind === 'initial' || value.kind === 'reply' || value.kind === 'status_update'
      ? value.kind
      : role === 'system'
        ? 'status_update'
        : 'reply';

  if (!body && kind !== 'status_update') {
    return null;
  }

  return {
    id: coerceString(value.id) || crypto.randomUUID(),
    kind,
    role,
    actorId: coerceString(value.actorId) || null,
    actorName: coerceString(value.actorName) || (role === 'system' ? 'ORION' : 'Staff'),
    body,
    createdAt,
    attachments: Array.isArray(value.attachments)
      ? value.attachments.map(sanitizeAttachment).filter((item): item is AdvisoryAttachmentRecord => Boolean(item))
      : [],
    statusSnapshot:
      value.statusSnapshot === 'solicitada' ||
      value.statusSnapshot === 'en_revision' ||
      value.statusSnapshot === 'asesorada' ||
      value.statusSnapshot === 'cerrada'
        ? value.statusSnapshot
        : null,
  };
};

const sanitizeMetadata = (value: unknown): AdvisoryMetadata => {
  if (!isObject(value)) {
    return {};
  }

  const metadata = value as AdvisoryMetadata;
  return {
    ...metadata,
    thread: Array.isArray(metadata.thread)
      ? metadata.thread.map(sanitizeMessage).filter((item): item is AdvisoryThreadMessage => Boolean(item))
      : [],
    serviceDesk: isObject(metadata.serviceDesk) ? { ...metadata.serviceDesk } : {},
    chemistryGuide: isObject(metadata.chemistryGuide) ? { ...metadata.chemistryGuide } : undefined,
  };
};

const buildInitialMessage = (source: AdvisoryThreadSource): AdvisoryThreadMessage => ({
  id: 'initial-consultation',
  kind: 'initial',
  role: 'requester',
  actorId: source.solicitanteId,
  actorName: source.solicitanteNombre || 'Solicitante',
  body: source.consultaEscalada,
  createdAt: source.creadoEn,
  attachments: [],
  statusSnapshot: 'solicitada',
});

const buildLegacyTrainerMessage = (source: AdvisoryThreadSource): AdvisoryThreadMessage | null => {
  if (!source.legacyRespuestaTrainer?.trim()) {
    return null;
  }

  return {
    id: 'legacy-trainer-response',
    kind: 'reply',
    role: 'trainer',
    actorId: source.legacyRespondidaPorId || null,
    actorName: source.legacyRespondidaPorNombre || 'Trainer',
    body: source.legacyRespuestaTrainer.trim(),
    createdAt: source.legacyRespondidaEn || source.creadoEn,
    attachments: [],
    statusSnapshot: source.estado,
  };
};

export const getAdvisoryThreadMessages = (metadataValue: unknown, source: AdvisoryThreadSource) => {
  const metadata = sanitizeMetadata(metadataValue);
  const thread = [...(metadata.thread || [])].sort(compareMessages);

  if (!thread.some((message) => message.kind === 'initial')) {
    thread.unshift(buildInitialMessage(source));
  }

  const legacyTrainerMessage = buildLegacyTrainerMessage(source);
  if (
    legacyTrainerMessage &&
    !thread.some(
      (message) =>
        message.role === 'trainer' &&
        message.body.trim() === legacyTrainerMessage.body.trim() &&
        message.createdAt === legacyTrainerMessage.createdAt,
    )
  ) {
    thread.push(legacyTrainerMessage);
  }

  return thread.sort(compareMessages);
};

export const getAdvisoryThreadAnalytics = (
  metadataValue: unknown,
  source: AdvisoryThreadSource,
): AdvisoryThreadAnalytics => {
  const metadata = sanitizeMetadata(metadataValue);
  const thread = getAdvisoryThreadMessages(metadataValue, source);
  const preservedState = metadata.serviceDesk || {};
  const messageCount = thread.length;
  const attachmentCount = thread.reduce((total, message) => total + message.attachments.length, 0);
  const responseCount = thread.filter((message) => message.role === 'trainer').length;
  const lastBusinessMessage = [...thread].reverse().find((message) => message.role !== 'system') || null;
  const firstTrainerReply =
    thread.find((message) => message.role === 'trainer' && message.kind !== 'status_update') || null;
  const firstTrainerResponseMinutes = firstTrainerReply
    ? Math.max(
        0,
        Math.round(
          (new Date(firstTrainerReply.createdAt).getTime() - new Date(source.creadoEn).getTime()) / 60000,
        ),
      )
    : null;
  const waitingOn: AdvisoryWaitingOn =
    source.estado === 'cerrada'
      ? 'closed'
      : lastBusinessMessage?.role === 'trainer'
        ? 'requester'
        : 'trainer';
  const evidenceTags = uniqueStrings(
    thread.flatMap((message) =>
      message.attachments.flatMap((attachment) => [
        ...(attachment.analysis?.tags || []),
        ...(attachment.analysis?.utilities || []),
        ...(attachment.analysis?.detectedCodes || []),
      ]),
    ),
  ).slice(0, 12);

  return {
    waitingOn,
    unreadRequester: coerceNumber(preservedState.unreadRequester),
    unreadTrainer: coerceNumber(preservedState.unreadTrainer),
    lastActorRole: lastBusinessMessage?.role || null,
    lastMessageAt: lastBusinessMessage?.createdAt || null,
    firstTrainerResponseAt: firstTrainerReply?.createdAt || null,
    firstTrainerResponseMinutes,
    messageCount,
    attachmentCount,
    responseCount,
    evidenceTags,
  };
};

const buildServiceDeskState = (
  metadataValue: unknown,
  source: AdvisoryThreadSource,
  thread: AdvisoryThreadMessage[],
  unreadRequester: number,
  unreadTrainer: number,
  status: AdvisoryStatus,
) => {
  const previousMetadata = sanitizeMetadata(metadataValue);
  const analytics = getAdvisoryThreadAnalytics(
    {
      ...previousMetadata,
      thread,
      serviceDesk: {
        ...previousMetadata.serviceDesk,
        unreadRequester,
        unreadTrainer,
      },
    },
    { ...source, estado: status },
  );

  return {
    waitingOn: analytics.waitingOn,
    unreadRequester,
    unreadTrainer,
    lastActorRole: analytics.lastActorRole,
    lastMessageAt: analytics.lastMessageAt,
    firstTrainerResponseAt: analytics.firstTrainerResponseAt,
    messageCount: analytics.messageCount,
    attachmentCount: analytics.attachmentCount,
    responseCount: analytics.responseCount,
    evidenceTags: analytics.evidenceTags,
  };
};

export const appendAdvisoryThreadMessage = ({
  metadata,
  source,
  message,
  nextStatus,
}: AppendMessageOptions): AdvisoryMetadata => {
  const base = sanitizeMetadata(metadata);
  const currentThread = getAdvisoryThreadMessages(base, source).filter((entry) => entry.id !== message.id);
  const thread = [...currentThread, message].sort(compareMessages);
  const currentRequesterUnread = coerceNumber(base.serviceDesk?.unreadRequester);
  const currentTrainerUnread = coerceNumber(base.serviceDesk?.unreadTrainer);

  const nextUnreadRequester = message.role === 'trainer' ? currentRequesterUnread + 1 : currentRequesterUnread;
  const nextUnreadTrainer = message.role === 'requester' ? currentTrainerUnread + 1 : currentTrainerUnread;

  return {
    ...base,
    thread,
    serviceDesk: buildServiceDeskState(
      base,
      source,
      thread,
      nextUnreadRequester,
      nextUnreadTrainer,
      nextStatus,
    ),
  };
};

export const appendAdvisorySystemMessage = (
  metadata: unknown,
  source: AdvisoryThreadSource,
  body: string,
  status: AdvisoryStatus,
) => {
  const message: AdvisoryThreadMessage = {
    id: crypto.randomUUID(),
    kind: 'status_update',
    role: 'system',
    actorId: null,
    actorName: 'ORION',
    body,
    createdAt: new Date().toISOString(),
    attachments: [],
    statusSnapshot: status,
  };

  const base = sanitizeMetadata(metadata);
  const thread = [...getAdvisoryThreadMessages(base, source), message].sort(compareMessages);

  return {
    ...base,
    thread,
    serviceDesk: buildServiceDeskState(
      base,
      source,
      thread,
      coerceNumber(base.serviceDesk?.unreadRequester),
      coerceNumber(base.serviceDesk?.unreadTrainer),
      status,
    ),
  };
};

export const markAdvisoryThreadRead = (
  metadata: unknown,
  source: AdvisoryThreadSource,
  viewerRole: 'requester' | 'trainer',
) => {
  const base = sanitizeMetadata(metadata);
  const thread = getAdvisoryThreadMessages(base, source);
  return {
    ...base,
    thread,
    serviceDesk: buildServiceDeskState(
      base,
      source,
      thread,
      viewerRole === 'requester' ? 0 : coerceNumber(base.serviceDesk?.unreadRequester),
      viewerRole === 'trainer' ? 0 : coerceNumber(base.serviceDesk?.unreadTrainer),
      source.estado,
    ),
  };
};
