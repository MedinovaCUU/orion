import type { EquipmentSummary, PendingServiceTicket, PlanningMetadata, ProfileSummary } from '../../../components/servicesPlanning';
import { extractPlaneacionMeta, stripPlaneacionMeta } from '../../../components/servicesPlanning';
import type {
  PlannedService,
  QuickCreateDraft,
  ServiceDetailUpdate,
  ServicePlanningPermissions,
  ServicePlanningRole,
  ServicePriority,
  ServiceSource,
  ServiceStatus,
  ServiceType,
  WeekBucket,
} from '../types/servicePlanning.types';

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const MONTH_INDEX: Record<string, number> = {
  enero: 0,
  ene: 0,
  febrero: 1,
  feb: 1,
  marzo: 2,
  mar: 2,
  abril: 3,
  abr: 3,
  mayo: 4,
  may: 4,
  junio: 5,
  jun: 5,
  julio: 6,
  jul: 6,
  agosto: 7,
  ago: 7,
  septiembre: 8,
  sep: 8,
  setiembre: 8,
  octubre: 9,
  oct: 9,
  noviembre: 10,
  nov: 10,
  diciembre: 11,
  dic: 11,
};

const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
const WEEK_RANGE_TEXT_REGEX =
  /^\s*\d{1,2}\s+al\s+\d{1,2}\s+(enero|ene|febrero|feb|marzo|mar|abril|abr|mayo|may|junio|jun|julio|jul|agosto|ago|septiembre|sep|setiembre|octubre|oct|noviembre|nov|diciembre|dic)(?:\s+\d{2,4})?\s*$/i;

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  preventivo: 'Preventivo',
  correctivo: 'Correctivo',
  capacitacion: 'Capacitacion',
  recapacitacion: 'Recapacitacion',
  instalacion: 'Instalacion',
  ingenieria_soporte: 'Ingenieria / Soporte',
};

export const SERVICE_TYPE_TONES: Record<ServiceType, string> = {
  preventivo: '#69DDE0',
  correctivo: '#F1727D',
  capacitacion: '#63AEFE',
  recapacitacion: '#A886FF',
  instalacion: '#FFC45E',
  ingenieria_soporte: '#FF8D52',
};

export const STATUS_LABELS: Record<ServiceStatus, string> = {
  programado: 'Programado',
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
  requiere_pago: 'Requiere pago',
  realizado: 'Ya realizado',
  bloqueado: 'Bloqueado',
  critico: 'Critico / Falcon',
  garantia: 'Garantia',
  comodato: 'Comodato',
  sin_asignar: 'Sin asignar',
};

export const STATUS_TONES: Record<ServiceStatus, { text: string; background: string; border: string }> = {
  programado: {
    text: '#6f6256',
    background: 'rgba(206,191,168,0.14)',
    border: 'rgba(206,191,168,0.28)',
  },
  pendiente: {
    text: '#65707c',
    background: 'rgba(148,163,184,0.1)',
    border: 'rgba(148,163,184,0.24)',
  },
  confirmado: {
    text: '#1f7f87',
    background: 'rgba(105,221,224,0.16)',
    border: 'rgba(105,221,224,0.3)',
  },
  requiere_pago: {
    text: '#9a6513',
    background: 'rgba(255,196,94,0.16)',
    border: 'rgba(255,196,94,0.3)',
  },
  realizado: {
    text: '#1f8c60',
    background: 'rgba(76,207,147,0.14)',
    border: 'rgba(76,207,147,0.26)',
  },
  critico: {
    text: '#b3263e',
    background: 'rgba(243,39,53,0.12)',
    border: 'rgba(243,39,53,0.28)',
  },
  comodato: {
    text: '#76695c',
    background: 'rgba(206,191,168,0.12)',
    border: 'rgba(206,191,168,0.24)',
  },
  garantia: {
    text: '#2c78ca',
    background: 'rgba(99,174,254,0.14)',
    border: 'rgba(99,174,254,0.28)',
  },
  bloqueado: {
    text: '#8e2d36',
    background: 'rgba(243,39,53,0.14)',
    border: 'rgba(243,39,53,0.24)',
  },
  sin_asignar: {
    text: '#65707c',
    background: 'rgba(148,163,184,0.08)',
    border: 'rgba(148,163,184,0.2)',
  },
};

export const PRIORITY_LABELS: Record<ServicePriority, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Critica',
};

const priorityOrder: Record<ServicePriority, number> = {
  baja: 1,
  media: 2,
  alta: 3,
  critica: 4,
};

export const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const cleanText = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();
const isPlanningWeekRangeLabel = (value: string | null | undefined) => WEEK_RANGE_TEXT_REGEX.test(cleanText(value));

const PERSON_ALIAS_RULES: Array<{ match: RegExp; display: string }> = [
  { match: /^martha(?:\s+carbajal)?$/i, display: 'Martha Carbajal' },
  { match: /^olivia(?:\s+angulo)?$/i, display: 'Olivia Angulo' },
  { match: /^ivonne(?:\s+jaramillo)?$/i, display: 'Ivonne Jaramillo' },
  { match: /^francisco(?:\s+salgado)?$/i, display: 'Francisco' },
  { match: /^(?:ricardo\s+v(?:ilchis)?|vilchis)$/i, display: 'Ricardo Vilchis' },
  { match: /^(?:ricardo\s+m(?:ontanez|ontañez)?|montanez|montañez)$/i, display: 'Ricardo Montañez' },
  { match: /^diego\s+g(?:\.|arcia)?$/i, display: 'Diego Garcia' },
  { match: /^garcia$/i, display: 'Diego Garcia' },
  { match: /^diego\s+garcia$/i, display: 'Diego Garcia' },
  { match: /^diego\s+n(?:\.|avarro)?$/i, display: 'Diego Navarro' },
  { match: /^navarro$/i, display: 'Diego Navarro' },
  { match: /^diego\s+navarro$/i, display: 'Diego Navarro' },
  { match: /^diego\s+b(?:\.|ermudez)?$/i, display: 'Diego Bermudez' },
  { match: /^bermudez$/i, display: 'Diego Bermudez' },
  { match: /^diego\s+bermudez$/i, display: 'Diego Bermudez' },
  { match: /^centrum$/i, display: 'Proveedor externo · Centrum' },
];

const PERSON_DISPLAY_ALIASES: Record<string, string> = {
  'ricardo montanez': 'R. Montañez',
  'ricardo vilchis': 'R. Vilchis',
  'diego garcia': 'D. Garcia',
  'diego garcia garcia': 'D. Garcia',
  'diego navarro': 'D. Navarro',
};

const uniqueByNormalizedValue = (values: string[]) => {
  const seen = new Set<string>();

  return values.filter((value) => {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
};

const buildProfileCandidates = (profileName: string) => {
  const normalizedFull = normalizeText(profileName.replace(/\./g, ' '));
  const tokens = normalizedFull.split(' ').filter(Boolean);
  if (tokens.length === 0) {
    return [];
  }

  const firstToken = tokens[0] || '';
  const lastToken = tokens[tokens.length - 1] || '';
  const firstTwoTokens = tokens.slice(0, 2).join(' ');
  const firstAndLast = uniqueByNormalizedValue([firstToken, lastToken, firstTwoTokens, `${firstToken} ${lastToken}`]).filter(Boolean);

  return uniqueByNormalizedValue([normalizedFull, ...firstAndLast]);
};

const resolveProfileName = (normalizedCandidate: string, engineerProfiles: ProfileSummary[]) => {
  if (!normalizedCandidate || engineerProfiles.length === 0) {
    return null;
  }

  const exactFullName = engineerProfiles.find(
    (profile) => normalizeText(profile.nombre_completo || '') === normalizedCandidate,
  );
  if (exactFullName?.nombre_completo) {
    return cleanText(exactFullName.nombre_completo);
  }

  const candidateMatches = engineerProfiles.filter((profile) => {
    const profileName = cleanText(profile.nombre_completo);
    if (!profileName) {
      return false;
    }

    return buildProfileCandidates(profileName).includes(normalizedCandidate);
  });

  if (candidateMatches.length === 1) {
    return cleanText(candidateMatches[0]?.nombre_completo);
  }

  const prefixMatches = engineerProfiles.filter((profile) => {
    const normalizedProfile = normalizeText(profile.nombre_completo || '');
    return Boolean(
      normalizedProfile &&
        (normalizedProfile.startsWith(`${normalizedCandidate} `) ||
          normalizedProfile.endsWith(` ${normalizedCandidate}`) ||
          normalizedProfile.includes(` ${normalizedCandidate} `)),
    );
  });

  if (prefixMatches.length === 1) {
    return cleanText(prefixMatches[0]?.nombre_completo);
  }

  return null;
};

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatMonthKey = (dateIso: string) => {
  const date = new Date(`${dateIso}T12:00:00`);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`;
};

export const getCurrentMonthKey = (referenceDate = new Date()) =>
  `${referenceDate.getFullYear()}-${`${referenceDate.getMonth() + 1}`.padStart(2, '0')}`;

export const formatMonthLabel = (monthKey: string) => {
  const [yearText, monthText] = monthKey.split('-');
  const monthIndex = Number(monthText) - 1;
  const monthName = MONTH_NAMES[monthIndex] || monthText;
  return `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${yearText}`;
};

export const formatShortDate = (dateIso: string | undefined) => {
  if (!dateIso) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${dateIso}T12:00:00`));
};

export const formatDateTime = (dateIso: string | undefined) => {
  if (!dateIso) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(dateIso));
};

export const resolveRole = (rawRole: string | null | undefined): ServicePlanningRole => {
  const normalized = normalizeText(rawRole || '');
  if (normalized.includes('admin')) return 'admin';
  if (normalized.includes('coord')) return 'coordinador';
  if (normalized.includes('ingenier') || normalized.includes('tecnico') || normalized.includes('qfb')) return 'ingeniero';
  return 'visor';
};

export const getPermissions = (role: ServicePlanningRole): ServicePlanningPermissions => ({
  canCreate: role === 'admin' || role === 'coordinador',
  canEditAll: role === 'admin' || role === 'coordinador',
  canDelete: role === 'admin',
  canImport: role === 'admin' || role === 'coordinador',
  canExport: role !== 'visor' || role === 'visor',
  canEditStatus: role === 'admin' || role === 'coordinador' || role === 'ingeniero',
});

export const normalizePersonName = (
  raw: string | null | undefined,
  engineerProfiles: ProfileSummary[] = [],
) => {
  const cleaned = cleanText(raw);
  if (!cleaned) {
    return '';
  }

  const normalized = normalizeText(cleaned.replace(/\./g, ' '));
  const profileMatch = resolveProfileName(normalized, engineerProfiles);
  if (profileMatch) {
    return profileMatch;
  }

  for (const rule of PERSON_ALIAS_RULES) {
    if (rule.match.test(normalized)) {
      return rule.display;
    }
  }

  return cleaned;
};

export const formatPlanningPersonName = (raw: string | null | undefined) => {
  const cleaned = cleanText(raw);
  if (!cleaned) {
    return '';
  }

  return PERSON_DISPLAY_ALIASES[normalizeText(cleaned)] || cleaned;
};

export const formatPlanningPeopleList = (values: string[], separator = ' / ') =>
  values.map((value) => formatPlanningPersonName(value)).filter(Boolean).join(separator);

export const isExternalProviderName = (raw: string | null | undefined) =>
  normalizeText(raw || '').includes('centrum') || normalizeText(raw || '').includes('proveedor externo');

export const splitPeople = (
  raw: string | string[] | null | undefined,
  engineerProfiles: ProfileSummary[] = [],
) => {
  const base = Array.isArray(raw) ? raw.join(',') : cleanText(raw || '');
  if (!base) {
    return [];
  }

  return uniqueByNormalizedValue(
    base
      .split(/\/|,|-|\sy\s/gi)
      .map((token) => normalizePersonName(token, engineerProfiles))
      .filter(Boolean),
  );
};

const parseMetadataArray = (value: unknown, engineerProfiles: ProfileSummary[] = []) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizePersonName(typeof entry === 'string' ? entry : '', engineerProfiles))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return splitPeople(value, engineerProfiles);
  }

  return [];
};

const parseStoredStatuses = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeStatus(typeof entry === 'string' ? entry : ''))
      .filter((entry): entry is ServiceStatus => Boolean(entry));
  }

  if (typeof value === 'string') {
    return value
      .split(/[,/|]/)
      .map((entry) => normalizeStatus(entry))
      .filter((entry): entry is ServiceStatus => Boolean(entry));
  }

  return [];
};

export const normalizeServiceType = (value: string | null | undefined, fallbackObservation?: string, fallbackLocality?: string): ServiceType => {
  const normalized = normalizeText([value, fallbackObservation, fallbackLocality].filter(Boolean).join(' '));

  if (normalized.includes('recapacit')) return 'recapacitacion';
  if (normalized.includes('capacit')) return 'capacitacion';
  if (normalized.includes('correct') || normalized.includes('falla') || normalized.includes('emerg')) return 'correctivo';
  if (normalized.includes('prevent')) return 'preventivo';
  if (normalized.includes('instal')) return 'instalacion';
  if (normalized.includes('ingenier') || normalized.includes('soporte')) return 'ingenieria_soporte';
  return 'ingenieria_soporte';
};

export const normalizeStatus = (value: string | null | undefined): ServiceStatus | null => {
  const normalized = normalizeText(value || '');
  if (!normalized) return null;

  if (normalized.includes('requiere pago') || normalized === 'requiere_pago') return 'requiere_pago';
  if (normalized.includes('realizado')) return 'realizado';
  if (normalized.includes('confirm')) return 'confirmado';
  if (normalized.includes('program')) return 'programado';
  if (normalized.includes('pend')) return 'pendiente';
  if (normalized.includes('bloque')) return 'bloqueado';
  if (normalized.includes('crit') || normalized.includes('falcon')) return 'critico';
  if (normalized.includes('garantia')) return 'garantia';
  if (normalized.includes('comodato')) return 'comodato';
  if (normalized.includes('sin asignar')) return 'sin_asignar';
  return null;
};

const detectStatuses = (
  observations: string,
  storedStatuses: ServiceStatus[],
  requiresEngineerFlag: boolean,
  travelMeta: PlanningMetadata | null,
) => {
  const normalized = normalizeText(observations);
  const statuses = new Set<ServiceStatus>(storedStatuses);

  if (normalized.includes('falcon')) {
    statuses.add('critico');
  }
  if (normalized.includes('requiere pago')) {
    statuses.add('requiere_pago');
  }
  if (normalized.includes('ya realizado')) {
    statuses.add('realizado');
  }
  if (normalized.includes('comodato')) {
    statuses.add('comodato');
  }
  if (normalized.includes('garantia')) {
    statuses.add('garantia');
  }
  if (normalized.includes('bloquead')) {
    statuses.add('bloqueado');
  }
  if (!requiresEngineerFlag) {
    statuses.add('sin_asignar');
  }
  if (
    travelMeta?.travel_status &&
    ['reservado', 'en_revision_administrativa'].includes(cleanText(travelMeta.travel_status).toLowerCase())
  ) {
    statuses.add('confirmado');
  }

  if (statuses.size === 0) {
    statuses.add('programado');
  }

  return Array.from(statuses);
};

const resolvePriority = (serviceType: ServiceType, statuses: ServiceStatus[], observations: string, storedPriority: string | null | undefined) => {
  let priority: ServicePriority =
    normalizeText(storedPriority || '') === 'critica'
      ? 'critica'
      : normalizeText(storedPriority || '') === 'alta'
        ? 'alta'
        : normalizeText(storedPriority || '') === 'baja'
          ? 'baja'
          : 'media';

  if (serviceType === 'correctivo' && priorityOrder[priority] < priorityOrder.alta) {
    priority = 'alta';
  }

  const normalized = normalizeText(observations);
  if (statuses.includes('critico') || normalized.includes('falcon')) {
    return 'critica';
  }
  if (statuses.includes('requiere_pago') && priorityOrder[priority] < priorityOrder.alta) {
    return 'alta';
  }
  if (statuses.includes('bloqueado') && priorityOrder[priority] < priorityOrder.alta) {
    return 'alta';
  }

  return priority;
};

export const parsePlanningDateText = (value: string | null | undefined, referenceDate = new Date()) => {
  const raw = cleanText(value);
  if (!raw) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const numericMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (numericMatch) {
    const [, dayText, monthText, yearText] = numericMatch;
    const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
    const date = new Date(year, Number(monthText) - 1, Number(dayText), 12, 0, 0);
    return Number.isNaN(date.getTime()) ? '' : toIsoDate(date);
  }

  const textualMatch = normalizeText(raw).match(
    /(\d{1,2})(?:\s+al\s+\d{1,2})?.*?(enero|ene|febrero|feb|marzo|mar|abril|abr|mayo|may|junio|jun|julio|jul|agosto|ago|septiembre|sep|setiembre|octubre|oct|noviembre|nov|diciembre|dic)(?:.*?(\d{2,4}))?/,
  );
  if (!textualMatch) {
    return '';
  }

  const [, dayText, monthToken, yearText] = textualMatch;
  const monthIndex = MONTH_INDEX[monthToken];
  const year = yearText ? (yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText)) : referenceDate.getFullYear();
  const date = new Date(year, monthIndex, Number(dayText), 12, 0, 0);
  return Number.isNaN(date.getTime()) ? '' : toIsoDate(date);
};

export const resolveScheduledDay = (scheduledDate: string | undefined, fallbackDay: string | null | undefined) => {
  if (scheduledDate) {
    const date = new Date(`${scheduledDate}T12:00:00`);
    return DAY_LABELS[date.getDay()];
  }

  return cleanText(fallbackDay) || '';
};

const resolveWeekRange = (ticketMeta: PlanningMetadata | null, scheduledDate: string, createdAt: string) => {
  const fromMeta = cleanText(ticketMeta?.fecha_tentativa);
  if (fromMeta) {
    const upper = normalizeText(fromMeta);
    const dayRangeMatch = upper.match(
      /(\d{1,2})\s+al\s+(\d{1,2})\s+(enero|ene|febrero|feb|marzo|mar|abril|abr|mayo|may|junio|jun|julio|jul|agosto|ago|septiembre|sep|setiembre|octubre|oct|noviembre|nov|diciembre|dic)(?:\s+(\d{2,4}))?/,
    );
    if (dayRangeMatch) {
      const [, startText, endText, monthToken, yearText] = dayRangeMatch;
      const monthIndex = MONTH_INDEX[monthToken];
      const year = yearText ? (yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText)) : new Date(createdAt).getFullYear();
      const weekStart = toIsoDate(new Date(year, monthIndex, Number(startText), 12, 0, 0));
      const weekEnd = toIsoDate(new Date(year, monthIndex, Number(endText), 12, 0, 0));
      const label = `${startText.padStart(2, '0')} al ${endText.padStart(2, '0')} ${MONTH_NAMES[monthIndex]}`;
      return {
        weekLabel: label,
        weekStart,
        weekEnd,
        month: formatMonthKey(weekStart),
      };
    }
  }

  const anchor = scheduledDate || toIsoDate(new Date(createdAt));
  const base = new Date(`${anchor}T12:00:00`);
  const day = base.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const weekStartDate = new Date(base);
  weekStartDate.setDate(base.getDate() + mondayOffset);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekStartDate.getDate() + 4);
  return {
    weekLabel: `${`${weekStartDate.getDate()}`.padStart(2, '0')} al ${`${weekEndDate.getDate()}`.padStart(2, '0')} ${
      MONTH_NAMES[weekStartDate.getMonth()]
    }`,
    weekStart: toIsoDate(weekStartDate),
    weekEnd: toIsoDate(weekEndDate),
    month: formatMonthKey(toIsoDate(weekStartDate)),
  };
};

const resolveLocality = (ticket: PendingServiceTicket, cleanDescription: string) => {
  const subjectParts = ticket.asunto
    .replace('[PLAN]', '')
    .split('-')
    .map((part) => cleanText(part))
    .filter(Boolean);
  if (subjectParts.length >= 3) {
    return subjectParts.slice(2).join(' - ');
  }

  const localityLine = cleanDescription
    .split('\n')
    .map((line) => cleanText(line))
    .find((line) => normalizeText(line).startsWith('cliente/localidad:'));

  return localityLine ? localityLine.split(':').slice(1).join(':').trim() : 'Localidad por definir';
};

const resolvePlatform = (ticket: PendingServiceTicket) => {
  const subjectParts = ticket.asunto
    .replace('[PLAN]', '')
    .split('-')
    .map((part) => cleanText(part))
    .filter(Boolean);
  if (subjectParts.length >= 2) {
    return subjectParts[1];
  }

  return ticket.numero_serie_equipo || 'MULTIPLE';
};

const resolveServiceTypeFromTicket = (ticket: PendingServiceTicket, cleanDescription: string) => {
  const subjectParts = ticket.asunto
    .replace('[PLAN]', '')
    .split('-')
    .map((part) => cleanText(part))
    .filter(Boolean);
  return normalizeServiceType(subjectParts[0], cleanDescription, resolveLocality(ticket, cleanDescription));
};

const resolveSource = (meta: Record<string, unknown>, currentSource?: ServiceSource): ServiceSource => {
  if (currentSource) {
    return currentSource;
  }

  const source = normalizeText(typeof meta.source === 'string' ? meta.source : '');
  if (source.includes('excel')) return 'excel_import';
  if (source.includes('manual')) return 'manual';
  if (source.includes('orion')) return 'orion';
  return 'ticket';
};

export const serializePlanningDescription = (
  locality: string,
  observations: string,
  metadata: Record<string, unknown>,
) => {
  const descriptionLines = [];
  if (cleanText(locality)) {
    descriptionLines.push(`Cliente/Localidad: ${cleanText(locality)}`);
  }
  if (cleanText(observations)) {
    descriptionLines.push(`Observaciones: ${cleanText(observations)}`);
  }
  return `${descriptionLines.join('\n')}\n\n[METADATA_PLANEACION] ${JSON.stringify(metadata)}`;
};

export const buildPlanningSubject = (serviceType: ServiceType, platform: string, locality: string) =>
  `[PLAN] ${SERVICE_TYPE_LABELS[serviceType].toUpperCase()} - ${cleanText(platform) || 'MULTIPLE'} - ${cleanText(locality) || 'LOCALIDAD POR DEFINIR'}`;

export const mapPendingTicketToPlannedService = (
  ticket: PendingServiceTicket,
  equipments: EquipmentSummary[],
  engineerProfiles: ProfileSummary[] = [],
): PlannedService => {
  const rawMeta = (extractPlaneacionMeta(ticket.descripcion) || {}) as PlanningMetadata & Record<string, unknown>;
  const cleanDescription = cleanText(stripPlaneacionMeta(ticket.descripcion));
  const observations = cleanDescription.replace(/^cliente\/localidad:[^\n]*\n?/i, '').replace(/^observaciones:/i, '').trim();
  const serialNumber = cleanText(ticket.numero_serie_equipo) || '';
  const matchedEquipment = serialNumber
    ? equipments.find((equipment) => cleanText(equipment.numero_serie).toUpperCase() === serialNumber.toUpperCase())
    : undefined;
  const scheduledDateSource =
    (typeof rawMeta.scheduled_date === 'string' ? rawMeta.scheduled_date : null) ||
    (isPlanningWeekRangeLabel(typeof rawMeta.fecha_acordada === 'string' ? rawMeta.fecha_acordada : null) ? null : rawMeta.fecha_acordada);
  const scheduledDate =
    parsePlanningDateText(scheduledDateSource, new Date(ticket.creado_en)) || '';
  const weekRange = resolveWeekRange(rawMeta, scheduledDate, ticket.creado_en);
  const locality = resolveLocality(ticket, cleanDescription);
  const serviceType = normalizeServiceType(
    typeof rawMeta.service_type === 'string' ? rawMeta.service_type : null,
    ticket.asunto,
    `${cleanDescription} ${locality}`,
  ) || resolveServiceTypeFromTicket(ticket, cleanDescription);
  const resolvedParticipants = Array.from(
    new Set(
      [
        ticket.profiles?.nombre_completo,
        typeof rawMeta.ingeniero_csv === 'string' ? rawMeta.ingeniero_csv : '',
      ]
        .filter(Boolean)
        .flatMap((entry) => splitPeople(entry as string, engineerProfiles)),
    ),
  );
  const responsibleEngineers = resolvedParticipants.filter((entry) => !isExternalProviderName(entry));
  const companions = Array.from(
    new Set(
      [
        ...parseMetadataArray(
          rawMeta.companions_csv ?? rawMeta.companions ?? rawMeta.acompanantes_csv ?? rawMeta.acompanante_csv,
          engineerProfiles,
        ),
        ...resolvedParticipants.filter((entry) => isExternalProviderName(entry)),
      ],
    ),
  );
  const storedStatuses = parseStoredStatuses(rawMeta.status_values ?? rawMeta.service_status ?? rawMeta.status);
  const statuses = detectStatuses(cleanDescription, storedStatuses, responsibleEngineers.length > 0, rawMeta);
  const priority = resolvePriority(
    serviceType,
    statuses,
    cleanDescription,
    typeof rawMeta.priority_csv === 'string' ? rawMeta.priority_csv : typeof rawMeta.priority === 'string' ? rawMeta.priority : null,
  );
  const scheduledDay = resolveScheduledDay(
    scheduledDate,
    (typeof rawMeta.scheduled_day === 'string' ? rawMeta.scheduled_day : null) ||
      (isPlanningWeekRangeLabel(typeof rawMeta.fecha_acordada === 'string' ? rawMeta.fecha_acordada : null) ? null : rawMeta.fecha_acordada),
  );
  const source = resolveSource(rawMeta, undefined);
  const importedFromExcel = source === 'excel_import';
  const isCompleted = statuses.includes('realizado');
  const isCritical = statuses.includes('critico');
  const requiresPayment = statuses.includes('requiere_pago');
  const isBlocked = statuses.includes('bloqueado');
  const missingEngineer = responsibleEngineers.length === 0;
  const missingScheduledDay = !scheduledDay;

  return {
    id: ticket.id,
    month: weekRange.month,
    weekLabel: weekRange.weekLabel,
    weekStart: weekRange.weekStart,
    weekEnd: weekRange.weekEnd,
    scheduledDate: scheduledDate || undefined,
    scheduledDay: scheduledDay || undefined,
    serviceType,
    platform: resolvePlatform(ticket),
    locality,
    serialNumber: serialNumber || undefined,
    observations: observations || cleanDescription || undefined,
    rawObservations: cleanDescription || undefined,
    status: statuses,
    priority,
    responsibleEngineers,
    companions,
    customer: matchedEquipment?.clientes?.razon_social || undefined,
    city: matchedEquipment?.ciudad || undefined,
    state: matchedEquipment?.estado || undefined,
    source,
    trace: {
      source,
      importedFromExcel,
      importBatchId: typeof rawMeta.import_batch_id === 'string' ? rawMeta.import_batch_id : undefined,
      sourceFileName: typeof rawMeta.source_file_name === 'string' ? rawMeta.source_file_name : undefined,
      createdBy: typeof rawMeta.created_by_name === 'string' ? rawMeta.created_by_name : undefined,
      updatedBy: typeof rawMeta.updated_by_name === 'string' ? rawMeta.updated_by_name : undefined,
      assignedBy: typeof rawMeta.assigned_by_name === 'string' ? rawMeta.assigned_by_name : undefined,
      createdAt: ticket.creado_en,
      updatedAt: typeof rawMeta.updated_at === 'string' ? rawMeta.updated_at : ticket.creado_en,
      lastStatusChangeAt: typeof rawMeta.last_status_change_at === 'string' ? rawMeta.last_status_change_at : undefined,
    },
    links: {
      ticketId: `TKT-${ticket.id.substring(0, 8).toUpperCase()}`,
      originalTicketId: ticket.id,
      linkedTravelRequestId: typeof rawMeta.travel_request_id === 'string' ? rawMeta.travel_request_id : undefined,
      linkedTravelStatus: typeof rawMeta.travel_status === 'string' ? rawMeta.travel_status : undefined,
      linkedServiceReportId: typeof rawMeta.service_report_id === 'string' ? rawMeta.service_report_id : undefined,
      linkedServiceReportStatus: typeof rawMeta.service_report_status === 'string' ? rawMeta.service_report_status : undefined,
    },
    flags: {
      requiresFlight: Boolean(rawMeta.requiere_vuelos),
      requiresCar: Boolean(rawMeta.requiere_auto),
      missingScheduledDay,
      missingEngineer,
      missingSerial: !serialNumber,
      isCritical,
      isBlocked,
      isCompleted,
      requiresPayment,
    },
    ticketStatus: ticket.estado,
    travelPriority: typeof rawMeta.travel_priority === 'string' ? rawMeta.travel_priority : undefined,
  };
};

export const buildQuickCreatePayload = (
  draft: QuickCreateDraft,
  engineerProfiles: ProfileSummary[],
  currentUserId: string | null,
  currentUserName: string,
) => {
  const engineers = splitPeople(draft.responsibleEngineers, engineerProfiles).filter((entry) => !isExternalProviderName(entry));
  const companions = Array.from(
    new Set([
      ...splitPeople(draft.companions, engineerProfiles),
      ...splitPeople(draft.responsibleEngineers, engineerProfiles).filter((entry) => isExternalProviderName(entry)),
    ]),
  );
  const matchedEngineer = engineerProfiles.find(
    (profile) => normalizeText(profile.nombre_completo || '') === normalizeText(engineers[0] || ''),
  );
  const metadata = {
    fecha_tentativa: cleanText(draft.weekLabel),
    fecha_acordada: cleanText(draft.scheduledDate) || cleanText(draft.scheduledDay) || null,
    scheduled_date: cleanText(draft.scheduledDate) || null,
    scheduled_day: cleanText(draft.scheduledDay) || null,
    requires_flight: false,
    requiere_vuelos: false,
    requires_car: false,
    requiere_auto: false,
    service_type: draft.serviceType,
    priority_csv: draft.priority,
    source: draft.source,
    companions_csv: companions,
    status_values: [],
    created_by_name: currentUserName,
    updated_by_name: currentUserName,
    assigned_by_name: currentUserName,
    created_from: 'service_planning_quick_create',
    updated_at: new Date().toISOString(),
    import_batch_id: draft.source === 'excel_import' ? `manual-import-${Date.now()}` : null,
    source_file_name: draft.source === 'excel_import' ? 'captura_orion.csv' : null,
    ingeniero_csv: engineers.join(' / '),
  };

  return {
    user_id: matchedEngineer?.id || currentUserId || null,
    numero_serie_equipo: cleanText(draft.serialNumber) || null,
    asunto: buildPlanningSubject(draft.serviceType, draft.platform, draft.locality),
    descripcion: serializePlanningDescription(draft.locality, draft.observations, metadata),
    estado: 'abierto',
  };
};

export const buildPlannedServiceUpdate = (
  service: PlannedService,
  updates: ServiceDetailUpdate,
  engineerProfiles: ProfileSummary[],
  currentUserName: string,
) => {
  const nextType = updates.serviceType || service.serviceType;
  const nextPlatform = cleanText(updates.platform || service.platform);
  const nextLocality = cleanText(updates.locality || service.locality);
  const nextObservations = cleanText(updates.observations ?? service.observations ?? service.rawObservations ?? '');
  const rawNextResponsibleEngineers = (updates.responsibleEngineers || service.responsibleEngineers).map((engineer) =>
    normalizePersonName(engineer, engineerProfiles),
  );
  const nextResponsibleEngineers = rawNextResponsibleEngineers.filter((engineer) => !isExternalProviderName(engineer));
  const nextCompanions = Array.from(
    new Set([
      ...(updates.companions || service.companions).map((companion) => normalizePersonName(companion, engineerProfiles)),
      ...rawNextResponsibleEngineers.filter((engineer) => isExternalProviderName(engineer)),
    ]),
  );
  const nextScheduledDate = cleanText(updates.scheduledDate || service.scheduledDate || '');
  const nextScheduledDay = cleanText(updates.scheduledDay || service.scheduledDay || '');
  const nextPriority = updates.priority || service.priority;
  const nextSource = updates.source || service.source;
  const nextLeadEngineer = nextResponsibleEngineers[0] || '';
  const matchedLead = engineerProfiles.find(
    (profile) => normalizeText(profile.nombre_completo || '') === normalizeText(nextLeadEngineer),
  );

  const metadata = {
    fecha_tentativa: service.weekLabel,
    fecha_acordada: nextScheduledDate || nextScheduledDay || null,
    scheduled_date: nextScheduledDate || null,
    scheduled_day: nextScheduledDay || null,
    requires_flight: service.flags.requiresFlight,
    requiere_vuelos: service.flags.requiresFlight,
    requires_car: service.flags.requiresCar,
    requiere_auto: service.flags.requiresCar,
    service_type: nextType,
    priority_csv: nextPriority,
    source: nextSource,
    companions_csv: nextCompanions,
    status_values: service.status,
    created_by_name: service.trace.createdBy || undefined,
    updated_by_name: currentUserName,
    assigned_by_name: currentUserName,
    created_from: 'service_planning_drawer',
    updated_at: new Date().toISOString(),
    import_batch_id: service.trace.importBatchId || null,
    source_file_name: service.trace.sourceFileName || null,
    ingeniero_csv: nextResponsibleEngineers.join(' / '),
    travel_request_id: service.links.linkedTravelRequestId || null,
    travel_status: service.links.linkedTravelStatus || null,
    travel_priority: service.travelPriority || null,
    service_report_id: service.links.linkedServiceReportId || null,
    service_report_status: service.links.linkedServiceReportStatus || null,
    last_status_change_at: service.trace.lastStatusChangeAt || null,
  };

  return {
    user_id: matchedLead?.id || null,
    numero_serie_equipo: cleanText(updates.serialNumber || service.serialNumber || '') || null,
    asunto: buildPlanningSubject(nextType, nextPlatform, nextLocality),
    descripcion: serializePlanningDescription(nextLocality, nextObservations, metadata),
  };
};

export const createMockImportPreview = (services: PlannedService[]) => {
  const sample = services.slice(0, 6);
  return {
    sourceFileName: services.some((service) => service.trace.sourceFileName)
      ? services.find((service) => service.trace.sourceFileName)?.trace.sourceFileName || 'planeacion_orion.xlsx'
      : 'planeacion_orion.xlsx',
    detectedRows: sample.length,
    validRows: sample.filter((service) => !service.flags.missingSerial && !service.flags.missingEngineer).length,
    warningRows: sample.filter((service) => service.flags.missingSerial || service.flags.missingEngineer).length,
    errorRows: 0,
    duplicates: 0,
    items: sample.map((service) => ({
      id: service.id,
      locality: service.locality,
      platform: service.platform,
      serialNumber: service.serialNumber,
      status: (service.flags.missingEngineer || service.flags.missingSerial ? 'warning' : 'valid') as 'warning' | 'valid',
      message:
        service.flags.missingEngineer || service.flags.missingSerial
          ? 'Registro importable con pendientes de asignacion o serie.'
          : 'Registro listo para crear o actualizar.',
    })),
  };
};

export const createWeekOptions = (services: PlannedService[]) =>
  Array.from(new Set(services.map((service) => service.weekLabel)))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, 'es'));

export const buildMonthOptions = (services: PlannedService[]) =>
  Array.from(new Set([getCurrentMonthKey(), ...services.map((service) => service.month)]))
    .filter(Boolean)
    .sort()
    .map((month) => ({ value: month, label: formatMonthLabel(month) }));

export const createEmptyWeekBucket = (month: string, label: string): WeekBucket => ({
  key: `${month}-${label}`,
  label,
  month,
  weekStart: '',
  weekEnd: '',
  services: [],
  scheduledServices: [],
  unscheduledServices: [],
  total: 0,
  criticalCount: 0,
  pendingPaymentCount: 0,
  completedCount: 0,
});
