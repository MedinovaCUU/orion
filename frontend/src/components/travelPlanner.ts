import {
  extractPlaneacionMeta,
  stripPlaneacionMeta,
  type PlanningMetadata,
  type EquipmentSummary,
  type PendingServiceTicket,
  type ProfileSummary,
} from './servicesPlanning';

export type TravelServiceType =
  | 'preventivo'
  | 'correctivo'
  | 'instalacion'
  | 'capacitacion'
  | 'emergencia'
  | 'otro';

export type TravelPriority = 'baja' | 'media' | 'alta' | 'critica';

export type TravelTripType = 'redondo' | 'solo_ida';

export type TravelTimePreference =
  | 'muy_temprano'
  | 'manana'
  | 'mediodia'
  | 'tarde'
  | 'noche'
  | 'flexible';

export type TravelWorkflowStatus =
  | 'borrador'
  | 'buscando_vuelo'
  | 'vuelo_seleccionado'
  | 'solicitud_enviada'
  | 'en_revision_administrativa'
  | 'reservado'
  | 'rechazado'
  | 'requiere_cambios'
  | 'cancelado';

export type FlightLeg = 'outbound' | 'return';

export type FlightRecommendation = 'recommended' | 'acceptable' | 'risky' | 'out_of_policy';

export type FlightRiskLevel = 'green' | 'amber' | 'red';

export type FlightSortMode =
  | 'cheapest'
  | 'fastest'
  | 'fewest_stops'
  | 'earliest'
  | 'most_convenient';

export interface FlightBookingOption {
  bookWith: string;
  price: number | null;
  currency: string;
  url: string | null;
  airline: boolean;
  separateTickets: boolean;
}

export interface TravelPolicy {
  maxBudgetMxn: number;
  directFareDeltaMxn: number;
  minBufferBeforeServiceMinutes: number;
  warningBufferBeforeServiceMinutes: number;
  minBufferAfterServiceMinutes: number;
  redEyeCutoffHour: number;
  redEyeResumeHour: number;
  riskyLayoverMinutes: number;
  maxRecommendedStops: number;
}

export interface TravelFormData {
  engineerId: string;
  engineerName: string;
  employeeNumber: string;
  serviceTicketId: string;
  serviceType: TravelServiceType;
  clientName: string;
  clientId?: number | null;
  originCity: string;
  destinationCity: string;
  originAirport: string;
  destinationAirport: string;
  departureDate: string;
  returnDate: string;
  departurePreference: TravelTimePreference;
  returnPreference: TravelTimePreference;
  priority: TravelPriority;
  justification: string;
  serviceReference: string;
  equipment: string;
  equipmentSerial: string;
  siteAddress: string;
  siteContact: string;
  sitePhone: string;
  checkedBag: boolean;
  specialTools: boolean;
  tripType: TravelTripType;
  serviceStartDate: string;
  serviceStartTime: string;
  serviceEndDate: string;
  serviceEndTime: string;
  adminComments: string;
  requiresFlight: boolean;
  requiresCar: boolean;
  carPickupLocation: string;
  carPickupDate: string;
  carPickupTime: string;
  carDropoffLocation: string;
  carDropoffDate: string;
  carDropoffTime: string;
  carEstimatedKilometers: string;
  carRouteDescription: string;
  passengerNotes: string;
}

export interface FlightOffer {
  id: string;
  leg: FlightLeg;
  provider: string;
  airline: string;
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  departureAt: string;
  arrivalAt: string;
  stops: number;
  durationMinutes: number;
  layoverMinutes: number;
  price: number;
  currency: string;
  fareType: string;
  cabin: string;
  deeplink: string;
  offerToken: string;
  departureToken?: string;
  bookingToken?: string;
  sessionToken: string;
  convenienceScore: number;
  policyScore: number;
  recommendation: FlightRecommendation;
  riskLevel: FlightRiskLevel;
  warnings: string[];
  badges: string[];
  bookingOptions?: FlightBookingOption[];
  selectedBookingOption?: FlightBookingOption | null;
}

export interface FlightSearchSession {
  id: string;
  searchedAt: string;
  provider: string;
  mode?: 'simulated' | 'live';
  pricingMode?: 'per_leg' | 'round_trip_total';
  criteria: {
    originAirport: string;
    destinationAirport: string;
    departureDate: string;
    returnDate: string;
    tripType: TravelTripType;
  };
  outbound: FlightOffer[];
  inbound: FlightOffer[];
  returnContextOfferId?: string;
  returnContextDepartureToken?: string;
}

export interface FlightSelections {
  preferredOutboundId: string;
  backupOutboundId: string;
  preferredReturnId: string;
  backupReturnId: string;
  adminMessage: string;
}

export interface TravelSummary {
  routeLabel: string;
  engineerLabel: string;
  serviceLabel: string;
  urgencyLabel: string;
  riskSummary: string;
  outboundPreferred: FlightOffer | null;
  outboundBackup: FlightOffer | null;
  returnPreferred: FlightOffer | null;
  returnBackup: FlightOffer | null;
  messageText: string;
  compatibilityNotes: string[];
  estimatedTotalCost: number;
  currency: string;
  requiresCar: boolean;
}

export interface AirportOption {
  city: string;
  code: string;
  airport: string;
  country: string;
}

export interface AssignedPlannedTicketCandidate {
  ticket: PendingServiceTicket;
  meta: PlanningMetadata;
  plannedDate: string | null;
  distance: number;
}

const SIMULATED_PROVIDER_ID = 'simulated_operational_reference';
const SIMULATED_PROVIDER_LABEL = 'Simulacion operativa de referencia';
const AUTO_PLANNED_JUSTIFICATION = 'Mantenimiento Preventivo Planeado por Coordinacion';
const MONTH_INDEX: Record<string, number> = {
  ENERO: 0,
  ENE: 0,
  FEBRERO: 1,
  FEB: 1,
  MARZO: 2,
  MAR: 2,
  ABRIL: 3,
  ABR: 3,
  MAYO: 4,
  MAY: 4,
  JUNIO: 5,
  JUN: 5,
  JULIO: 6,
  JUL: 6,
  AGOSTO: 7,
  AGO: 7,
  SEPTIEMBRE: 8,
  SEP: 8,
  SETIEMBRE: 8,
  OCTUBRE: 9,
  OCT: 9,
  NOVIEMBRE: 10,
  NOV: 10,
  DICIEMBRE: 11,
  DIC: 11,
};

export const defaultTravelPolicy: TravelPolicy = {
  maxBudgetMxn: 14500,
  directFareDeltaMxn: 1800,
  minBufferBeforeServiceMinutes: 240,
  warningBufferBeforeServiceMinutes: 150,
  minBufferAfterServiceMinutes: 120,
  redEyeCutoffHour: 23,
  redEyeResumeHour: 5,
  riskyLayoverMinutes: 180,
  maxRecommendedStops: 1,
};

const DOMESTIC_MX_AIRLINES = ['Aeromexico', 'Volaris', 'Viva'];
const CROSS_BORDER_AIRLINES = ['Aeromexico', 'Volaris', 'Viva', 'Delta', 'United', 'American Airlines'];
const DEFAULT_AIRLINES = ['Aeromexico', 'Volaris', 'Viva'];
const SERVICE_LABELS: Record<TravelServiceType, string> = {
  preventivo: 'Mantenimiento Preventivo',
  correctivo: 'Mantenimiento Correctivo',
  instalacion: 'Instalacion',
  capacitacion: 'Capacitacion',
  emergencia: 'Emergencia',
  otro: 'Otro Servicio',
};

const PRIORITY_LABELS: Record<TravelPriority, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Critica',
};

const TIME_RANGES: Record<TravelTimePreference, [number, number]> = {
  muy_temprano: [5, 7],
  manana: [7, 11],
  mediodia: [11, 14],
  tarde: [14, 18],
  noche: [18, 22],
  flexible: [6, 20],
};

const AIRPORT_DIRECTORY: AirportOption[] = [
  { city: 'Tijuana', code: 'TIJ', airport: 'Aeropuerto Internacional de Tijuana', country: 'MX' },
  { city: 'Mexicali', code: 'MXL', airport: 'Aeropuerto Internacional de Mexicali', country: 'MX' },
  { city: 'Hermosillo', code: 'HMO', airport: 'Aeropuerto Internacional de Hermosillo', country: 'MX' },
  { city: 'Ciudad Juarez', code: 'CJS', airport: 'Aeropuerto Internacional Abraham Gonzalez', country: 'MX' },
  { city: 'Chihuahua', code: 'CUU', airport: 'Aeropuerto Internacional de Chihuahua', country: 'MX' },
  { city: 'Monterrey', code: 'MTY', airport: 'Aeropuerto Internacional de Monterrey', country: 'MX' },
  { city: 'Guadalajara', code: 'GDL', airport: 'Aeropuerto Internacional de Guadalajara', country: 'MX' },
  { city: 'Ciudad de Mexico', code: 'MEX', airport: 'Aeropuerto Internacional Benito Juarez', country: 'MX' },
  { city: 'Ciudad de Mexico', code: 'NLU', airport: 'Aeropuerto Internacional Felipe Angeles', country: 'MX' },
  { city: 'Toluca', code: 'TLC', airport: 'Aeropuerto Internacional de Toluca', country: 'MX' },
  { city: 'Queretaro', code: 'QRO', airport: 'Aeropuerto Internacional de Queretaro', country: 'MX' },
  { city: 'Leon', code: 'BJX', airport: 'Aeropuerto Internacional del Bajio', country: 'MX' },
  { city: 'Puebla', code: 'PBC', airport: 'Aeropuerto Internacional Hermanos Serdan', country: 'MX' },
  { city: 'Veracruz', code: 'VER', airport: 'Aeropuerto Internacional Heriberto Jara', country: 'MX' },
  { city: 'Merida', code: 'MID', airport: 'Aeropuerto Internacional de Merida', country: 'MX' },
  { city: 'Cancun', code: 'CUN', airport: 'Aeropuerto Internacional de Cancun', country: 'MX' },
  { city: 'Villahermosa', code: 'VSA', airport: 'Aeropuerto Internacional de Villahermosa', country: 'MX' },
  { city: 'Tuxtla Gutierrez', code: 'TGZ', airport: 'Aeropuerto Internacional Angel Albino Corzo', country: 'MX' },
  { city: 'Oaxaca', code: 'OAX', airport: 'Aeropuerto Internacional de Oaxaca', country: 'MX' },
  { city: 'Puerto Vallarta', code: 'PVR', airport: 'Aeropuerto Internacional Gustavo Diaz Ordaz', country: 'MX' },
  { city: 'Los Cabos', code: 'SJD', airport: 'Aeropuerto Internacional de Los Cabos', country: 'MX' },
  { city: 'La Paz', code: 'LAP', airport: 'Aeropuerto Internacional de La Paz', country: 'MX' },
  { city: 'Culiacan', code: 'CUL', airport: 'Aeropuerto Internacional de Culiacan', country: 'MX' },
  { city: 'Mazatlan', code: 'MZT', airport: 'Aeropuerto Internacional de Mazatlan', country: 'MX' },
  { city: 'Torreon', code: 'TRC', airport: 'Aeropuerto Internacional de Torreon', country: 'MX' },
  { city: 'Aguascalientes', code: 'AGU', airport: 'Aeropuerto Internacional de Aguascalientes', country: 'MX' },
  { city: 'San Luis Potosi', code: 'SLP', airport: 'Aeropuerto Internacional de San Luis Potosi', country: 'MX' },
  { city: 'Zacatecas', code: 'ZCL', airport: 'Aeropuerto Internacional de Zacatecas', country: 'MX' },
  { city: 'Morelia', code: 'MLM', airport: 'Aeropuerto Internacional de Morelia', country: 'MX' },
  { city: 'Durango', code: 'DGO', airport: 'Aeropuerto Internacional de Durango', country: 'MX' },
  { city: 'Tampico', code: 'TAM', airport: 'Aeropuerto Internacional de Tampico', country: 'MX' },
  { city: 'Reynosa', code: 'REX', airport: 'Aeropuerto Internacional de Reynosa', country: 'MX' },
  { city: 'Matamoros', code: 'MAM', airport: 'Aeropuerto Internacional de Matamoros', country: 'MX' },
  { city: 'Cozumel', code: 'CZM', airport: 'Aeropuerto Internacional de Cozumel', country: 'MX' },
  { city: 'Houston', code: 'IAH', airport: 'George Bush Intercontinental Airport', country: 'US' },
  { city: 'Dallas', code: 'DFW', airport: 'Dallas Fort Worth International Airport', country: 'US' },
  { city: 'Phoenix', code: 'PHX', airport: 'Phoenix Sky Harbor International Airport', country: 'US' },
  { city: 'San Diego', code: 'SAN', airport: 'San Diego International Airport', country: 'US' },
];

const CITY_ALIASES: Record<string, string> = {
  'cd juarez': 'Ciudad Juarez',
  'cd. juarez': 'Ciudad Juarez',
  'cd juarez chihuahua': 'Ciudad Juarez',
  'ciudad juarez chihuahua': 'Ciudad Juarez',
  juarez: 'Ciudad Juarez',
  'juarez chihuahua': 'Ciudad Juarez',
  cdmx: 'Ciudad de Mexico',
  'cdmx mexico': 'Ciudad de Mexico',
  'ciudad de mexico cdmx': 'Ciudad de Mexico',
  'cd de mexico': 'Ciudad de Mexico',
  'cd. de mexico': 'Ciudad de Mexico',
  'cd mexico': 'Ciudad de Mexico',
  'cd. mexico': 'Ciudad de Mexico',
  'mexico df': 'Ciudad de Mexico',
  'mexico d f': 'Ciudad de Mexico',
  df: 'Ciudad de Mexico',
  'distrito federal': 'Ciudad de Mexico',
};

const riskWeight = (level: FlightRiskLevel) => {
  if (level === 'red') return 3;
  if (level === 'amber') return 2;
  return 1;
};

const hashSeed = (input: string) =>
  input.split('').reduce((acc, char, index) => acc + char.charCodeAt(0) * (index + 17), 0);

const hashHex = (input: string, salt: string) => {
  let hash = 2166136261;
  const seed = `${salt}:${input}`;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
};

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const normalizeCityKey = (value: string) =>
  normalizeText(value)
    .replace(/[.,/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const CANONICAL_CITY_MAP = new Map(
  Array.from(new Set(AIRPORT_DIRECTORY.map((entry) => entry.city))).flatMap((city) => [
    [normalizeCityKey(city), city] as const,
    [normalizeCityKey(city.split(',')[0] || city), city] as const,
  ]),
);

Object.entries(CITY_ALIASES).forEach(([alias, canonical]) => {
  CANONICAL_CITY_MAP.set(normalizeCityKey(alias), canonical);
});

export const resolveOperationalCity = (rawCity: string) => {
  const trimmedCity = rawCity.trim();
  if (!trimmedCity) {
    return '';
  }

  const segments = trimmedCity
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);
  const candidates = [
    trimmedCity,
    normalizeCityKey(trimmedCity),
    segments[0] || '',
    normalizeCityKey(segments[0] || ''),
    segments.slice(0, 2).join(' '),
    normalizeCityKey(segments.slice(0, 2).join(' ')),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeCityKey(candidate);
    const canonical = CANONICAL_CITY_MAP.get(normalizedCandidate);
    if (canonical) {
      return canonical;
    }
  }

  return segments[0] || trimmedCity;
};

const toIsoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const parsePlanningDateText = (value: string | null | undefined, referenceDate = new Date()) => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const numericMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (numericMatch) {
    const [, dayText, monthText, yearText] = numericMatch;
    const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
    const date = new Date(year, Number(monthText) - 1, Number(dayText), 12, 0, 0);
    return Number.isNaN(date.getTime()) ? null : toIsoDate(date);
  }

  const normalizedUpper = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const textualMatch = normalizedUpper.match(
    /(\d{1,2})(?:\s+AL\s+\d{1,2})?.*?(ENERO|ENE|FEBRERO|FEB|MARZO|MAR|ABRIL|ABR|MAYO|MAY|JUNIO|JUN|JULIO|JUL|AGOSTO|AGO|SEPTIEMBRE|SEP|SETIEMBRE|OCTUBRE|OCT|NOVIEMBRE|NOV|DICIEMBRE|DIC)(?:.*?(\d{2,4}))?/,
  );
  if (!textualMatch) {
    return null;
  }

  const [, dayText, monthToken, yearText] = textualMatch;
  const monthIndex = MONTH_INDEX[monthToken];
  if (monthIndex === undefined) {
    return null;
  }

  const year = yearText ? (yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText)) : referenceDate.getFullYear();
  const date = new Date(year, monthIndex, Number(dayText), 12, 0, 0);
  return Number.isNaN(date.getTime()) ? null : toIsoDate(date);
};

const parsePlannedServiceType = (ticketSubject: string): TravelServiceType => {
  const normalized = normalizeText(ticketSubject.replace('[PLAN]', ''));
  if (normalized.includes('prevent')) return 'preventivo';
  if (normalized.includes('correct')) return 'correctivo';
  if (normalized.includes('instal')) return 'instalacion';
  if (normalized.includes('capacit')) return 'capacitacion';
  if (normalized.includes('emerg') || normalized.includes('falla')) return 'emergencia';
  return 'otro';
};

const extractPlannedClientLabel = (ticket: PendingServiceTicket) => {
  const subjectParts = ticket.asunto
    .split('-')
    .map((part) => part.trim())
    .filter(Boolean);
  if (subjectParts.length >= 3) {
    return subjectParts.slice(2).join(' - ').trim();
  }

  const cleanDescription = stripPlaneacionMeta(ticket.descripcion);
  const clientLine = cleanDescription
    .split('\n')
    .map((line) => line.trim())
    .find((line) => normalizeText(line).startsWith('cliente/localidad:'));

  return clientLine ? clientLine.split(':').slice(1).join(':').trim() : '';
};

const extractPlannedPlatformLabel = (ticket: PendingServiceTicket) => {
  const subjectParts = ticket.asunto
    .split('-')
    .map((part) => part.trim())
    .filter(Boolean);

  return subjectParts.length >= 2 ? subjectParts[1].trim() : '';
};

export const buildInitialValuesFromPlannedTicket = (
  plannedTicket: PendingServiceTicket,
  engineer: ProfileSummary | undefined,
  equipments: EquipmentSummary[],
): TravelFormData => {
  const meta = extractPlaneacionMeta(plannedTicket.descripcion) || {};
  const plannedDate =
    parsePlanningDateText(meta.fecha_acordada, new Date()) || parsePlanningDateText(meta.fecha_tentativa, new Date()) || '';
  const matchedEquipment = plannedTicket.numero_serie_equipo
    ? equipments.find(
        (equipment) =>
          equipment.numero_serie.trim().toUpperCase() === plannedTicket.numero_serie_equipo?.trim().toUpperCase(),
      )
    : undefined;
  const baseForm = hydrateFormFromSelections(createEmptyTravelForm(), engineer, matchedEquipment);
  const plannedDescription = stripPlaneacionMeta(plannedTicket.descripcion).trim();
  const plannedServiceType = parsePlannedServiceType(plannedTicket.asunto);
  const defaultJustification =
    plannedServiceType === 'preventivo'
      ? AUTO_PLANNED_JUSTIFICATION
      : plannedDescription || 'Servicio planeado asignado por coordinacion.';

  return {
    ...baseForm,
    serviceTicketId: plannedTicket.id,
    serviceType: plannedServiceType,
    clientName: baseForm.clientName || extractPlannedClientLabel(plannedTicket),
    equipmentSerial: plannedTicket.numero_serie_equipo?.trim() || baseForm.equipmentSerial,
    equipment: baseForm.equipment || extractPlannedPlatformLabel(plannedTicket),
    departureDate: plannedDate,
    returnDate: plannedDate && (meta.requiere_vuelos || meta.requiere_auto) && baseForm.tripType === 'redondo' ? plannedDate : '',
    justification: defaultJustification,
    serviceReference: `TKT-${plannedTicket.id.substring(0, 8).toUpperCase()}`,
    serviceStartDate: plannedDate,
    serviceEndDate: plannedDate,
    adminComments: plannedDescription && plannedDescription !== defaultJustification ? plannedDescription : baseForm.adminComments,
    requiresFlight: Boolean(meta.requiere_vuelos),
    requiresCar: Boolean(meta.requiere_auto),
  };
};

export const getAssignedPlannedTicketCandidates = (
  plannedTickets: PendingServiceTicket[],
  engineer: ProfileSummary | undefined,
  referenceDate = new Date(),
): AssignedPlannedTicketCandidate[] => {
  if (!engineer) {
    return [];
  }

  const engineerName = normalizeText(engineer.nombre_completo || '');
  const referenceMidday = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate(), 12, 0, 0);

  return (
    plannedTickets
      .map((ticket) => {
        const meta = extractPlaneacionMeta(ticket.descripcion);
        if (!meta) {
          return null;
        }

        const assignedName = normalizeText(meta.ingeniero_csv || ticket.profiles?.nombre_completo || '');
        const assignedToEngineer =
          ticket.user_id === engineer.id || (!!engineerName && !!assignedName && assignedName === engineerName);
        if (!assignedToEngineer) {
          return null;
        }

        const plannedDate =
          parsePlanningDateText(meta.fecha_acordada, referenceDate) ||
          parsePlanningDateText(meta.fecha_tentativa, referenceDate);
        const distance = plannedDate
          ? Math.abs(new Date(`${plannedDate}T12:00:00`).getTime() - referenceMidday.getTime())
          : Number.POSITIVE_INFINITY;

        return { ticket, meta, plannedDate, distance };
      })
      .filter(
        (
          entry,
        ): entry is AssignedPlannedTicketCandidate => Boolean(entry),
      )
      .sort((left, right) => left.distance - right.distance || right.ticket.creado_en.localeCompare(left.ticket.creado_en))
  );
};

const findClosestAssignedPlannedTicket = (
  plannedTickets: PendingServiceTicket[],
  engineer: ProfileSummary | undefined,
  referenceDate = new Date(),
) =>
  getAssignedPlannedTicketCandidates(plannedTickets, engineer, referenceDate).find(
    (candidate) => !candidate.meta.travel_request_id,
  ) || null;

const pad = (value: number) => value.toString().padStart(2, '0');

const buildDateTime = (date: string, hour: number, minute: number) => `${date}T${pad(hour)}:${pad(minute)}:00`;

const addMinutes = (isoDateTime: string, minutes: number) => {
  const date = new Date(isoDateTime);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
};

const getServiceStart = (form: TravelFormData) =>
  form.serviceStartDate && form.serviceStartTime
    ? new Date(`${form.serviceStartDate}T${form.serviceStartTime}:00`)
    : null;

const getServiceEnd = (form: TravelFormData) =>
  form.serviceEndDate && form.serviceEndTime
    ? new Date(`${form.serviceEndDate}T${form.serviceEndTime}:00`)
    : null;

const isRedEye = (dateTimeIso: string, policy: TravelPolicy) => {
  const date = new Date(dateTimeIso);
  const hour = date.getHours();
  return hour >= policy.redEyeCutoffHour || hour < policy.redEyeResumeHour;
};

export const getPriorityBadge = (priority: TravelPriority) => {
  if (priority === 'critica') return { label: 'Critica', color: '#F43F5E' };
  if (priority === 'alta') return { label: 'Alta', color: '#F59E0B' };
  if (priority === 'media') return { label: 'Media', color: '#22D3EE' };
  return { label: 'Baja', color: '#94A3B8' };
};

export const deriveEngineerIdentifier = (engineer: ProfileSummary | undefined, currentValue = '') =>
  currentValue || engineer?.employee_number || (engineer?.id ? `USR-${engineer.id.slice(0, 8).toUpperCase()}` : '');

export const getKnownCities = () =>
  Array.from(new Set(AIRPORT_DIRECTORY.map((entry) => entry.city))).sort((left, right) =>
    left.localeCompare(right, 'es-MX'),
  );

export const getAirportOptionsByCity = (city: string) => {
  const normalizedCity = normalizeCityKey(resolveOperationalCity(city));
  if (!normalizedCity) {
    return [];
  }

  return AIRPORT_DIRECTORY.filter((entry) => normalizeCityKey(entry.city) === normalizedCity);
};

export const getAirportByCode = (code: string) => {
  const normalizedCode = code.trim().toUpperCase();
  return AIRPORT_DIRECTORY.find((entry) => entry.code === normalizedCode) || null;
};

export const isSimulatedFlightProvider = (provider?: string | null) => provider === SIMULATED_PROVIDER_ID;

export const getFlightProviderLabel = (session: FlightSearchSession | null) => {
  if (!session) {
    return 'Pendiente';
  }

  return isSimulatedFlightProvider(session.provider) ? SIMULATED_PROVIDER_LABEL : session.provider;
};

const SERVICE_REFERENCE_TYPE_MAP: Record<TravelServiceType, string> = {
  preventivo: 'MP',
  correctivo: 'MC',
  instalacion: 'INST',
  capacitacion: 'CAP',
  emergencia: 'EMR',
  otro: 'SRV',
};

const resolveReferenceAnchorDate = (form: TravelFormData) =>
  (form.serviceStartDate || form.departureDate || form.returnDate || 'SINFECHA').replaceAll('-', '');

const resolveTravelIdentitySeed = (form: TravelFormData) => {
  const anchorDate = resolveReferenceAnchorDate(form);
  const serialChunk =
    (form.equipmentSerial || form.equipment || 'GEN').replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'GEN';

  if (form.serviceTicketId.trim()) {
    return `ticket:${form.serviceTicketId.trim().toLowerCase()}`;
  }

  return `travel:${SERVICE_REFERENCE_TYPE_MAP[form.serviceType]}:${serialChunk}:${anchorDate}`;
};

export const resolveTravelRequestId = (form: TravelFormData) => {
  const seed = resolveTravelIdentitySeed(form);
  const hex = `${hashHex(seed, 'a')}${hashHex(seed, 'b')}${hashHex(seed, 'c')}${hashHex(seed, 'd')}`;

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
};

export const resolveServiceReference = (form: TravelFormData) => {
  if (form.serviceReference.trim()) {
    return form.serviceReference.trim();
  }

  if (form.serviceTicketId.trim()) {
    return `TKT-${form.serviceTicketId.trim().slice(0, 8).toUpperCase()}`;
  }

  const dateChunk = resolveReferenceAnchorDate(form);
  const serialChunk = (form.equipmentSerial || form.equipment || 'GEN').replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase() || 'GEN';
  return `PLAN-${SERVICE_REFERENCE_TYPE_MAP[form.serviceType]}-${serialChunk}-${dateChunk}`;
};

export const findNearbyPlannedPreventive = (
  form: TravelFormData,
  plannedTickets: PendingServiceTicket[],
) => {
  if (form.serviceType !== 'preventivo' || !form.equipmentSerial) {
    return null;
  }

  const referenceDate = form.departureDate || form.serviceStartDate;
  if (!referenceDate) {
    return null;
  }

  const reference = new Date(`${referenceDate}T12:00:00`);

  return (
    plannedTickets.find((ticket) => {
      if ((ticket.numero_serie_equipo || '').trim() !== form.equipmentSerial.trim()) {
        return false;
      }

      const meta = extractPlaneacionMeta(ticket.descripcion);
      const candidateDateText = meta?.fecha_acordada || meta?.fecha_tentativa;
      if (!candidateDateText || typeof candidateDateText !== 'string') {
        return false;
      }

      const candidateDateIso = parsePlanningDateText(candidateDateText, reference);
      const candidateDate = candidateDateIso ? new Date(`${candidateDateIso}T12:00:00`) : null;

      if (!candidateDate || Number.isNaN(candidateDate.getTime())) {
        return false;
      }

      const diffDays = Math.abs(reference.getTime() - candidateDate.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= 14;
    }) || null
  );
};

const pickWindowHour = (preference: TravelTimePreference, seed: number, index: number) => {
  const [start, end] = TIME_RANGES[preference];
  const span = Math.max(end - start, 1);
  return start + ((seed + index * 7) % (span + 1));
};

const getRouteAirlines = (originAirport: string, destinationAirport: string) => {
  const origin = getAirportByCode(originAirport);
  const destination = getAirportByCode(destinationAirport);

  if (origin?.country === 'MX' && destination?.country === 'MX') {
    return DOMESTIC_MX_AIRLINES;
  }

  if (
    (origin?.country === 'MX' && destination?.country === 'US') ||
    (origin?.country === 'US' && destination?.country === 'MX')
  ) {
    return CROSS_BORDER_AIRLINES;
  }

  return DEFAULT_AIRLINES;
};

const getFlightNumberPrefix = (airline: string) => {
  const prefixes: Record<string, string> = {
    Aeromexico: 'AM',
    Volaris: 'Y4',
    Viva: 'VB',
    Delta: 'DL',
    United: 'UA',
    'American Airlines': 'AA',
  };

  return prefixes[airline] || airline.slice(0, 2).toUpperCase();
};

const getFareTypesForAirline = (airline: string) => {
  if (airline === 'Aeromexico') {
    return ['Classic', 'AM Plus', 'Flex', 'Premier'];
  }

  if (airline === 'Volaris') {
    return ['Zero', 'Basic', 'Classic', 'Plus'];
  }

  if (airline === 'Viva') {
    return ['Light', 'Smart', 'Flex', 'Plus'];
  }

  return ['Basic', 'Main', 'Flex', 'Business'];
};

const getCabinsForAirline = (airline: string) => {
  if (airline === 'Aeromexico') {
    return ['Economy', 'AM Plus', 'Premier'];
  }

  if (airline === 'Delta' || airline === 'United' || airline === 'American Airlines') {
    return ['Economy', 'Economy Plus', 'Business'];
  }

  return ['Economy', 'Economy Plus'];
};

const scoreOffer = (
  offer: Omit<FlightOffer, 'convenienceScore' | 'policyScore' | 'recommendation' | 'riskLevel' | 'warnings' | 'badges'>,
  form: TravelFormData,
  policy: TravelPolicy,
): Pick<
  FlightOffer,
  'convenienceScore' | 'policyScore' | 'recommendation' | 'riskLevel' | 'warnings' | 'badges'
> => {
  const warnings: string[] = [];
  const badges: string[] = [];
  let score = 100;
  let policyScore = 100;

  const departureDate = new Date(offer.departureAt);
  const arrivalDate = new Date(offer.arrivalAt);
  const referenceDate = offer.leg === 'outbound' ? getServiceStart(form) : getServiceEnd(form);

  if (offer.stops === 0) {
    score += 12;
    badges.push('Directo');
  } else {
    score -= offer.stops * 9;
    policyScore -= offer.stops * 8;
  }

  if (offer.layoverMinutes >= policy.riskyLayoverMinutes) {
    warnings.push('Escala larga o riesgosa para coordinacion operativa.');
    score -= 15;
    policyScore -= 12;
  }

  if (offer.price > policy.maxBudgetMxn) {
    warnings.push('Costo por encima del umbral operativo.');
    score -= 12;
    policyScore -= 20;
    badges.push('Fuera de presupuesto');
  }

  if (isRedEye(offer.arrivalAt, policy) || isRedEye(offer.departureAt, policy)) {
    warnings.push('Horario de madrugada, revisar descanso y traslado.');
    score -= 8;
    policyScore -= 6;
  }

  if (referenceDate) {
    const bufferMinutes = Math.round((referenceDate.getTime() - arrivalDate.getTime()) / 60000);

    if (offer.leg === 'outbound') {
      if (bufferMinutes < 0) {
        warnings.push('Llega despues de la ventana del servicio.');
        score -= 40;
        policyScore -= 45;
      } else if (bufferMinutes < policy.warningBufferBeforeServiceMinutes) {
        warnings.push('Tiempo de llegada ajustado antes del servicio.');
        score -= 18;
        policyScore -= 16;
      } else if (bufferMinutes < policy.minBufferBeforeServiceMinutes) {
        warnings.push('Buffer operativo menor al recomendado.');
        score -= 10;
        policyScore -= 8;
      } else {
        badges.push('Compatible con servicio');
      }
    } else {
      const waitAfterService = Math.round((departureDate.getTime() - referenceDate.getTime()) / 60000);
      if (waitAfterService < 0) {
        warnings.push('El regreso sale antes de concluir la intervencion.');
        score -= 35;
        policyScore -= 40;
      } else if (waitAfterService < policy.minBufferAfterServiceMinutes) {
        warnings.push('Regreso muy ajustado despues del cierre del servicio.');
        score -= 15;
        policyScore -= 14;
      } else {
        badges.push('Regreso viable');
      }
    }
  }

  if (offer.stops > policy.maxRecommendedStops) {
    warnings.push('Mas escalas de las recomendadas por politica.');
    score -= 10;
    policyScore -= 15;
  }

  if (offer.durationMinutes >= 420) {
    warnings.push('Duracion total alta para este tipo de servicio.');
    score -= 8;
  }

  const riskLevel: FlightRiskLevel =
    policyScore < 55 || score < 55 ? 'red' : policyScore < 75 || score < 72 ? 'amber' : 'green';

  const recommendation: FlightRecommendation =
    policyScore < 50
      ? 'out_of_policy'
      : riskLevel === 'red'
        ? 'risky'
        : score >= 86
          ? 'recommended'
          : 'acceptable';

  return {
    convenienceScore: Math.max(Math.min(Math.round(score), 100), 0),
    policyScore: Math.max(Math.min(Math.round(policyScore), 100), 0),
    recommendation,
    riskLevel,
    warnings,
    badges,
  };
};

const buildOffer = (
  form: TravelFormData,
  policy: TravelPolicy,
  leg: FlightLeg,
  index: number,
): FlightOffer => {
  const seed = hashSeed(
    `${form.originAirport}${form.destinationAirport}${form.departureDate}${form.returnDate}${form.priority}${leg}`,
  );
  const isReturn = leg === 'return';
  const travelDate = isReturn ? form.returnDate || form.departureDate : form.departureDate;
  const originAirport = isReturn ? form.destinationAirport : form.originAirport;
  const destinationAirport = isReturn ? form.originAirport : form.destinationAirport;
  const preference = isReturn ? form.returnPreference : form.departurePreference;
  const routeAirlines = getRouteAirlines(originAirport, destinationAirport);
  const airline = routeAirlines[(seed + index) % routeAirlines.length];
  const stops = (seed + index * 3) % 3;
  const layoverMinutes = stops === 0 ? 0 : 45 + ((seed + index * 11) % 170);
  const departureHour = pickWindowHour(preference, seed, index);
  const departureMinute = ((seed + index * 13) % 4) * 15;
  const durationMinutes = 95 + ((seed + index * 17) % 140) + stops * (65 + layoverMinutes);
  const departureAt = buildDateTime(travelDate, departureHour, departureMinute);
  const arrivalAt = addMinutes(departureAt, durationMinutes);
  const price =
    3500 +
    ((seed + index * 29) % 4500) +
    (stops === 0 ? 1400 : 0) +
    (form.priority === 'critica' ? 1800 : form.priority === 'alta' ? 900 : 0) +
    (form.specialTools ? 650 : 0) +
    (form.checkedBag ? 420 : 0);
  const cabins = getCabinsForAirline(airline);
  const fareTypes = getFareTypesForAirline(airline);
  const cabin = cabins[(seed + index * 5) % cabins.length];
  const fareType = fareTypes[(seed + index * 7) % fareTypes.length];
  const offerToken = `${leg}-${seed}-${index}`;
  const baseOffer = {
    id: offerToken,
    leg,
    provider: SIMULATED_PROVIDER_ID,
    airline,
    flightNumber: `${getFlightNumberPrefix(airline)}${100 + ((seed + index * 19) % 899)}`,
    departureAirport: originAirport,
    arrivalAirport: destinationAirport,
    departureAt,
    arrivalAt,
    stops,
    durationMinutes,
    layoverMinutes,
    price,
    currency: 'MXN',
    fareType,
    cabin,
    deeplink: `https://www.google.com/travel/flights?q=${originAirport}%20${destinationAirport}%20${travelDate}`,
    offerToken,
    sessionToken: `sess-${hashSeed(`${travelDate}-${originAirport}-${destinationAirport}`)}`,
  };

  return {
    ...baseOffer,
    ...scoreOffer(baseOffer, form, policy),
  };
};

export const generateFlightSearchSession = (
  form: TravelFormData,
  policy: TravelPolicy = defaultTravelPolicy,
): FlightSearchSession => {
  const outbound = Array.from({ length: 6 }, (_, index) => buildOffer(form, policy, 'outbound', index))
    .sort((left, right) => right.convenienceScore - left.convenienceScore);
  const inbound =
    form.tripType === 'redondo'
      ? Array.from({ length: 6 }, (_, index) => buildOffer(form, policy, 'return', index + 7)).sort(
          (left, right) => right.convenienceScore - left.convenienceScore,
        )
      : [];

  return {
    id: `session-${hashSeed(`${form.originAirport}-${form.destinationAirport}-${Date.now()}`)}`,
    searchedAt: new Date().toISOString(),
    provider: SIMULATED_PROVIDER_ID,
    mode: 'simulated',
    criteria: {
      originAirport: form.originAirport,
      destinationAirport: form.destinationAirport,
      departureDate: form.departureDate,
      returnDate: form.returnDate,
      tripType: form.tripType,
    },
    outbound,
    inbound,
  };
};

export const sortFlightOffers = (offers: FlightOffer[], mode: FlightSortMode) => {
  const sorted = [...offers];
  const sorts: Record<FlightSortMode, (left: FlightOffer, right: FlightOffer) => number> = {
    cheapest: (left, right) => left.price - right.price,
    fastest: (left, right) => left.durationMinutes - right.durationMinutes,
    fewest_stops: (left, right) => left.stops - right.stops || left.durationMinutes - right.durationMinutes,
    earliest: (left, right) => new Date(left.departureAt).getTime() - new Date(right.departureAt).getTime(),
    most_convenient: (left, right) =>
      right.convenienceScore - left.convenienceScore ||
      riskWeight(left.riskLevel) - riskWeight(right.riskLevel) ||
      left.price - right.price,
  };

  sorted.sort(sorts[mode]);
  return sorted;
};

export const getStatusLabel = (status: TravelWorkflowStatus) => {
  const labels: Record<TravelWorkflowStatus, string> = {
    borrador: 'Borrador',
    buscando_vuelo: 'Buscando vuelo',
    vuelo_seleccionado: 'Vuelo seleccionado',
    solicitud_enviada: 'Solicitud enviada',
    en_revision_administrativa: 'En revision administrativa',
    reservado: 'Reservado',
    rechazado: 'Rechazado',
    requiere_cambios: 'Requiere cambios',
    cancelado: 'Cancelado',
  };

  return labels[status];
};

export const createEmptyTravelForm = (): TravelFormData => ({
  engineerId: '',
  engineerName: '',
  employeeNumber: '',
  serviceTicketId: '',
  serviceType: 'preventivo',
  clientName: '',
  clientId: null,
  originCity: '',
  destinationCity: '',
  originAirport: '',
  destinationAirport: '',
  departureDate: '',
  returnDate: '',
  departurePreference: 'manana',
  returnPreference: 'tarde',
  priority: 'media',
  justification: '',
  serviceReference: '',
  equipment: '',
  equipmentSerial: '',
  siteAddress: '',
  siteContact: '',
  sitePhone: '',
  checkedBag: false,
  specialTools: false,
  tripType: 'redondo',
  serviceStartDate: '',
  serviceStartTime: '09:00',
  serviceEndDate: '',
  serviceEndTime: '17:00',
  adminComments: '',
  requiresFlight: true,
  requiresCar: false,
  carPickupLocation: '',
  carPickupDate: '',
  carPickupTime: '',
  carDropoffLocation: '',
  carDropoffDate: '',
  carDropoffTime: '',
  carEstimatedKilometers: '',
  carRouteDescription: '',
  passengerNotes: '',
});

export const hydrateFormFromSelections = (
  form: TravelFormData,
  engineer: ProfileSummary | undefined,
  equipment: EquipmentSummary | undefined,
): TravelFormData => ({
  ...form,
  engineerId: engineer?.id || form.engineerId,
  engineerName: engineer?.nombre_completo || form.engineerName,
  employeeNumber: deriveEngineerIdentifier(engineer, form.employeeNumber),
  clientName: equipment?.clientes?.razon_social || form.clientName,
  clientId: equipment?.clientes?.id ?? form.clientId,
  equipment: equipment?.modelo || form.equipment,
  equipmentSerial: equipment?.numero_serie || form.equipmentSerial,
  destinationCity: resolveOperationalCity([equipment?.ciudad, equipment?.estado].filter(Boolean).join(', ')) || form.destinationCity,
  siteAddress:
    [
      equipment?.direccion,
      equipment?.colonia ? `Col. ${equipment.colonia}` : '',
      equipment?.codigo_postal ? `CP ${equipment.codigo_postal}` : '',
      equipment?.municipio,
      equipment?.ciudad,
      equipment?.estado,
      equipment?.pais,
    ]
      .filter(Boolean)
      .join(', ') || form.siteAddress,
});

export const validateTravelForm = (form: TravelFormData) => {
  const errors: string[] = [];

  if (!form.engineerName.trim()) errors.push('Captura el nombre del ingeniero.');
  if (!form.clientName.trim()) errors.push('Captura el cliente u hospital.');
  if (!form.originCity.trim() || !form.destinationCity.trim()) {
    errors.push('Debes capturar ciudad de origen y destino.');
  }
  if (form.requiresFlight && (!form.originAirport.trim() || !form.destinationAirport.trim())) {
    errors.push('Debes capturar aeropuerto de origen y destino.');
  }
  if ((form.requiresFlight || form.requiresCar) && !form.departureDate) {
    errors.push('La fecha de salida es obligatoria.');
  }
  if ((form.requiresFlight || form.requiresCar) && form.tripType === 'redondo' && !form.returnDate) {
    errors.push('La fecha de regreso es obligatoria.');
  }
  if (form.returnDate && form.departureDate && form.returnDate < form.departureDate) {
    errors.push('La fecha de regreso no puede ser anterior a la salida.');
  }
  if (!form.justification.trim()) errors.push('Debes capturar el motivo del viaje.');
  if (!form.siteContact.trim()) errors.push('El contacto en sitio es obligatorio.');
  if (!form.sitePhone.trim()) errors.push('El telefono del contacto es obligatorio.');
  if (form.requiresCar && !form.carPickupLocation.trim()) {
    errors.push('Debes capturar el lugar para recoger el auto.');
  }
  if (form.requiresCar && !form.carPickupDate) {
    errors.push('Debes capturar la fecha para recoger el auto.');
  }
  if (form.requiresCar && !form.carPickupTime) {
    errors.push('Debes capturar la hora para recoger el auto.');
  }
  if (form.requiresCar && !form.carDropoffLocation.trim()) {
    errors.push('Debes capturar el lugar para entregar el auto.');
  }
  if (form.requiresCar && !form.carDropoffDate) {
    errors.push('Debes capturar la fecha para entregar el auto.');
  }
  if (form.requiresCar && !form.carDropoffTime) {
    errors.push('Debes capturar la hora para entregar el auto.');
  }
  if (form.requiresCar && !form.carEstimatedKilometers.trim()) {
    errors.push('Debes capturar el kilometraje estimado.');
  }
  if (form.requiresCar && !form.carRouteDescription.trim()) {
    errors.push('Debes capturar el recorrido estimado para la renta de auto.');
  }
  if (
    form.requiresCar &&
    form.carPickupDate &&
    form.carPickupTime &&
    form.carDropoffDate &&
    form.carDropoffTime &&
    new Date(`${form.carDropoffDate}T${form.carDropoffTime}:00`).getTime() <
      new Date(`${form.carPickupDate}T${form.carPickupTime}:00`).getTime()
  ) {
    errors.push('La entrega del auto no puede ser anterior a la recoleccion.');
  }
  if (form.serviceEndDate && form.serviceStartDate && form.serviceEndDate < form.serviceStartDate) {
    errors.push('La fecha de cierre del servicio no puede ser anterior al inicio.');
  }

  return errors;
};

export const getServiceWindowCompatibilityNote = (form: TravelFormData) => {
  if (!form.serviceStartDate || !form.serviceStartTime) {
    return 'Sin ventana de inicio del servicio. El score de conveniencia se calculara solo con politica general.';
  }

  return `Ventana de inicio definida para ${form.serviceStartDate} a las ${form.serviceStartTime}.`;
};

const buildOfferBlock = (title: string, offer: FlightOffer | null) => {
  if (!offer) {
    return `${title}: Sin seleccion`;
  }

  const bookingLine = offer.selectedBookingOption?.bookWith
    ? `Reserva sugerida con: ${offer.selectedBookingOption.bookWith}${offer.selectedBookingOption.price ? ` | ${offer.currency} ${offer.selectedBookingOption.price.toLocaleString('es-MX')}` : ''}`
    : null;

  return [
    `${title}: ${offer.airline} ${offer.flightNumber}`,
    `${offer.departureAirport} ${formatDisplayDateTime(offer.departureAt)} -> ${offer.arrivalAirport} ${formatDisplayDateTime(offer.arrivalAt)}`,
    `Tarifa ${offer.fareType} | ${offer.cabin} | ${offer.currency} ${offer.price.toLocaleString('es-MX')}`,
    `Escalas: ${offer.stops} | Score conveniencia: ${offer.convenienceScore} | Riesgo: ${offer.riskLevel.toUpperCase()}`,
    bookingLine,
  ].join('\n');
};

const buildCarRentalBlock = (form: TravelFormData) => {
  if (!form.requiresCar) {
    return 'Renta automovil: No requerida.';
  }

  return [
    'RENTA DE AUTOMOVIL',
    'Datos para recoger auto:',
    `Lugar: ${form.carPickupLocation || 'Sin definir'}`,
    `Fecha: ${form.carPickupDate || 'Sin definir'}`,
    `Hora: ${form.carPickupTime || 'Sin definir'}`,
    'Datos para entregar auto:',
    `Lugar: ${form.carDropoffLocation || 'Sin definir'}`,
    `Fecha: ${form.carDropoffDate || 'Sin definir'}`,
    `Hora: ${form.carDropoffTime || 'Sin definir'}`,
    'Informacion:',
    `Kilometraje estimado: ${form.carEstimatedKilometers || 'Sin definir'}`,
    `Recorrido: ${form.carRouteDescription || 'Sin definir'}`,
  ].join('\n');
};

export const formatDisplayDateTime = (value: string) =>
  new Date(value).toLocaleString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export const formatDuration = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h ${remaining}m`;
};

export const findOfferById = (session: FlightSearchSession | null, offerId: string) => {
  if (!session || !offerId) return null;
  return [...session.outbound, ...session.inbound].find((offer) => offer.id === offerId) || null;
};

export const buildTravelSummary = (
  form: TravelFormData,
  session: FlightSearchSession | null,
  selections: FlightSelections,
): TravelSummary => {
  const outboundPreferred = session ? findOfferById(session, selections.preferredOutboundId) : null;
  const outboundBackup = session ? findOfferById(session, selections.backupOutboundId) : null;
  const returnPreferred =
    session && form.tripType === 'redondo' ? findOfferById(session, selections.preferredReturnId) : null;
  const returnBackup =
    session && form.tripType === 'redondo' ? findOfferById(session, selections.backupReturnId) : null;

  const compatibilityNotes = [
    ...(outboundPreferred?.warnings || []),
    ...(returnPreferred?.warnings || []),
  ];

  const riskSummary =
    !form.requiresFlight
      ? form.requiresCar
        ? 'Solicitud terrestre lista para coordinacion sin compra de vuelos.'
        : 'Solicitud sin vuelo. Se mantiene trazabilidad operativa del servicio.'
      :
    compatibilityNotes.length > 0
      ? compatibilityNotes[0]
      : outboundPreferred?.riskLevel === 'green' && (!returnPreferred || returnPreferred.riskLevel === 'green')
        ? 'Itinerario compatible con la ventana del servicio.'
        : 'Revisar detalles operativos antes de comprar.';

  const estimatedTotalCost =
    session?.pricingMode === 'round_trip_total'
      ? returnPreferred?.price || outboundPreferred?.price || 0
      : (outboundPreferred?.price || 0) + (returnPreferred?.price || 0);

  const simulatedNotice =
    form.requiresFlight && isSimulatedFlightProvider(session?.provider)
      ? 'IMPORTANTE: busqueda simulada de referencia. Validar inventario, aerolinea, horario y tarifa en proveedor real.'
      : null;

  const messageText = [
    `SOLICITUD DE LOGISTICA DE VIAJE - ${PRIORITY_LABELS[form.priority].toUpperCase()}`,
    simulatedNotice,
    `Ingeniero: ${form.engineerName} (${form.employeeNumber})`,
    `Servicio: ${SERVICE_LABELS[form.serviceType]} | Folio: ${resolveServiceReference(form)}`,
    `Cliente: ${form.clientName}`,
    `Equipo / Instrumento: ${form.equipment || form.equipmentSerial || 'No especificado'}`,
    form.requiresFlight
      ? `Ruta: ${form.originCity} (${form.originAirport}) -> ${form.destinationCity} (${form.destinationAirport})`
      : `Ruta operativa: ${form.originCity} -> ${form.destinationCity}`,
    form.serviceStartDate
      ? `Ventana servicio: ${form.serviceStartDate} ${form.serviceStartTime}${form.serviceEndDate ? ` a ${form.serviceEndDate} ${form.serviceEndTime}` : ''}`
      : 'Ventana servicio: Sin horario definido al momento',
    `Direccion: ${form.siteAddress}`,
    `Contacto: ${form.siteContact} | ${form.sitePhone}`,
    `Equipaje documentado: ${form.checkedBag ? 'Si' : 'No'} | Herramientas especiales: ${form.specialTools ? 'Si' : 'No'} | Renta automovil: ${form.requiresCar ? 'Si' : 'No'}`,
    `Justificacion: ${form.justification}`,
    form.requiresFlight ? buildOfferBlock('Vuelo preferido de ida', outboundPreferred) : 'Vuelo: No requerido para esta solicitud.',
    form.requiresFlight ? buildOfferBlock('Vuelo respaldo de ida', outboundBackup) : '',
    form.requiresFlight && form.tripType === 'redondo' ? buildOfferBlock('Vuelo preferido de regreso', returnPreferred) : '',
    form.requiresFlight && form.tripType === 'redondo' ? buildOfferBlock('Vuelo respaldo de regreso', returnBackup) : '',
    buildCarRentalBlock(form),
    `Comentarios para reserva: ${selections.adminMessage || 'Sin comentarios adicionales.'}`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    routeLabel: form.requiresFlight ? `${form.originAirport} -> ${form.destinationAirport}` : `${form.originCity} -> ${form.destinationCity}`,
    engineerLabel: `${form.engineerName} (${form.employeeNumber})`,
    serviceLabel: `${SERVICE_LABELS[form.serviceType]} | ${resolveServiceReference(form)}`,
    urgencyLabel: PRIORITY_LABELS[form.priority],
    riskSummary,
    outboundPreferred,
    outboundBackup,
    returnPreferred,
    returnBackup,
    messageText,
    compatibilityNotes,
    estimatedTotalCost,
    currency: returnPreferred?.currency || outboundPreferred?.currency || 'MXN',
    requiresCar: form.requiresCar,
  };
};

export const createRequestPayload = (
  form: TravelFormData,
  session: FlightSearchSession | null,
  summary: TravelSummary,
  selections: FlightSelections,
  createdBy: string | null,
) => ({
  engineer_id: form.engineerId || createdBy,
  client_id: form.clientId ?? null,
  service_ticket_id: form.serviceTicketId || null,
  employee_number: form.employeeNumber,
  engineer_name: form.engineerName,
  service_type: form.serviceType,
  workflow_status: 'solicitud_enviada' as TravelWorkflowStatus,
  priority: form.priority,
  trip_type: form.tripType,
  origin_city: form.originCity,
  destination_city: form.destinationCity,
  origin_airport: form.originAirport,
  destination_airport: form.destinationAirport,
  desired_departure_date: form.departureDate || null,
  desired_return_date: form.tripType === 'redondo' ? form.returnDate || null : null,
  preferred_departure_window: form.requiresFlight ? form.departurePreference : null,
  preferred_return_window: form.requiresFlight && form.tripType === 'redondo' ? form.returnPreference : null,
  service_start_at: form.serviceStartDate ? `${form.serviceStartDate}T${form.serviceStartTime}:00` : null,
  service_end_at:
    form.serviceEndDate && form.serviceEndTime ? `${form.serviceEndDate}T${form.serviceEndTime}:00` : null,
  client_name: form.clientName,
  site_address: form.siteAddress,
  site_contact: form.siteContact,
  site_phone: form.sitePhone,
  service_reference: resolveServiceReference(form),
  equipment_name: form.equipment,
  equipment_serial: form.equipmentSerial,
  justification: form.justification,
  admin_message: selections.adminMessage,
  comments: form.adminComments,
  requires_checked_bag: form.checkedBag,
  requires_special_tools: form.specialTools,
  requires_flight: form.requiresFlight,
  requires_car: form.requiresCar,
  risk_level:
    summary.outboundPreferred?.riskLevel === 'red' ||
    summary.returnPreferred?.riskLevel === 'red'
      ? 'red'
      : summary.outboundPreferred?.riskLevel === 'amber' ||
          summary.returnPreferred?.riskLevel === 'amber'
        ? 'amber'
        : 'green',
  convenience_score:
    Math.round(
      [
        summary.outboundPreferred?.convenienceScore || 0,
        summary.returnPreferred?.convenienceScore || 0,
      ]
        .filter(Boolean)
        .reduce((accumulator, value) => accumulator + value, 0) /
        (form.tripType === 'redondo' ? 2 : 1),
    ) || 0,
  policy_status:
    summary.outboundPreferred?.recommendation === 'out_of_policy' ||
    summary.returnPreferred?.recommendation === 'out_of_policy'
      ? 'out_of_policy'
      : 'within_policy',
  total_estimated_cost: summary.estimatedTotalCost,
  currency: summary.currency,
  request_payload: {
    form,
    sessionCriteria: session?.criteria || null,
  },
  request_snapshot: {
    summary,
    selections,
    session: session || null,
  },
  created_by: createdBy,
  updated_by: createdBy,
});

export const createOfferSnapshotPayload = (
  travelRequestId: string,
  session: FlightSearchSession,
  offer: FlightOffer,
  role: 'preferred' | 'backup',
) => ({
  travel_request_id: travelRequestId,
  search_session_id: null,
  leg_type: offer.leg,
  selection_role: role,
  offer_id: offer.id,
  provider: offer.provider,
  airline: offer.airline,
  flight_number: offer.flightNumber,
  origin_airport: offer.departureAirport,
  destination_airport: offer.arrivalAirport,
  departure_at: offer.departureAt,
  arrival_at: offer.arrivalAt,
  duration_minutes: offer.durationMinutes,
  stops: offer.stops,
  layover_minutes: offer.layoverMinutes,
  price_amount: offer.price,
  currency: offer.currency,
  cabin: offer.cabin,
  fare_type: offer.fareType,
  deeplink: offer.deeplink,
  provider_offer_id: offer.bookingToken || offer.offerToken,
  provider_session_id: session.id,
  convenience_score: offer.convenienceScore,
  policy_score: offer.policyScore,
  policy_status: offer.recommendation,
  risk_level: offer.riskLevel,
  consulted_at: session.searchedAt,
  raw_payload: offer,
});

export const buildStatusHistoryPayload = (
  travelRequestId: string,
  status: TravelWorkflowStatus,
  changedBy: string | null,
  reason: string,
) => ({
  travel_request_id: travelRequestId,
  status,
  changed_by: changedBy,
  reason,
  metadata: {
    source: 'travel_planner_modal',
  },
});

export const buildFlightSearchSessionPayload = (
  travelRequestId: string,
  session: FlightSearchSession,
  form: TravelFormData,
) => ({
  travel_request_id: travelRequestId,
  provider_name: session.provider,
  provider_session_id: session.id,
  search_origin_airport: form.originAirport,
  search_destination_airport: form.destinationAirport,
  search_departure_date: form.departureDate,
  search_return_date: form.tripType === 'redondo' ? form.returnDate : null,
  search_payload: {
    criteria: session.criteria,
    totals: {
      outbound: session.outbound.length,
      inbound: session.inbound.length,
    },
  },
  raw_results: session,
  searched_at: session.searchedAt,
  results_count: session.outbound.length + session.inbound.length,
});

export const getSelectionRequirementErrors = (form: TravelFormData, selections: FlightSelections) => {
  if (!form.requiresFlight) {
    return [] as string[];
  }

  const errors: string[] = [];

  if (!selections.preferredOutboundId) {
    errors.push('Selecciona una opcion preferida de ida.');
  }

  if (!selections.backupOutboundId) {
    errors.push('Selecciona una opcion de respaldo de ida.');
  }

  if (form.tripType === 'redondo' && !selections.preferredReturnId) {
    errors.push('Selecciona una opcion preferida de regreso.');
  }

  if (form.tripType === 'redondo' && !selections.backupReturnId) {
    errors.push('Selecciona una opcion de respaldo de regreso.');
  }

  return errors;
};

export const optionsNeedSelection = (form: TravelFormData, selections: FlightSelections) =>
  getSelectionRequirementErrors(form, selections).length > 0;

export const getRequestInitialValues = (
  engineers: ProfileSummary[],
  equipments: EquipmentSummary[],
  plannedTickets: PendingServiceTicket[],
  preferredEngineerId?: string,
): TravelFormData => {
  const defaultEngineer = engineers.find((engineer) => engineer.id === preferredEngineerId) || engineers[0];
  const closestPlanned = findClosestAssignedPlannedTicket(plannedTickets, defaultEngineer);
  const baseForm = hydrateFormFromSelections(createEmptyTravelForm(), defaultEngineer, undefined);

  if (!closestPlanned) {
    return baseForm;
  }

  return buildInitialValuesFromPlannedTicket(closestPlanned.ticket, defaultEngineer, equipments);
};
