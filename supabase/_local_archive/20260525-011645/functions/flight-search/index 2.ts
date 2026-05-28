const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type TravelTripType = 'redondo' | 'solo_ida';
type TravelTimePreference =
  | 'muy_temprano'
  | 'manana'
  | 'mediodia'
  | 'tarde'
  | 'noche'
  | 'flexible';
type TravelPriority = 'baja' | 'media' | 'alta' | 'critica';
type FlightLeg = 'outbound' | 'return';
type FlightRecommendation = 'recommended' | 'acceptable' | 'risky' | 'out_of_policy';
type FlightRiskLevel = 'green' | 'amber' | 'red';

interface TravelPolicy {
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

interface TravelFormData {
  originAirport: string;
  destinationAirport: string;
  departureDate: string;
  returnDate: string;
  tripType: TravelTripType;
  departurePreference: TravelTimePreference;
  returnPreference: TravelTimePreference;
  priority: TravelPriority;
  checkedBag: boolean;
  specialTools: boolean;
  serviceStartDate: string;
  serviceStartTime: string;
  serviceEndDate: string;
  serviceEndTime: string;
}

interface FlightBookingOption {
  bookWith: string;
  price: number | null;
  currency: string;
  url: string | null;
  airline: boolean;
  separateTickets: boolean;
}

interface FlightOffer {
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

interface FlightSearchSession {
  id: string;
  searchedAt: string;
  provider: string;
  mode: 'live';
  pricingMode: 'per_leg' | 'round_trip_total';
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

interface SearchBody {
  action?: 'search' | 'returns' | 'booking_options';
  provider?: string;
  form?: TravelFormData;
  policy?: TravelPolicy;
  departureToken?: string;
  bookingToken?: string;
}

interface SerpApiResponse {
  data: Record<string, unknown>;
  searchUrl: string;
  sessionId: string;
  currency: string;
}

const PROVIDER_LABEL = 'SerpApi Google Flights';
const SERPAPI_RETRY_DELAYS_MS = [900, 1800];
const DOMESTIC_MX_MAX_DURATION_MINUTES = 960;
const DOMESTIC_MX_MAX_LAYOVER_MINUTES = 540;
const MX_AIRPORTS = new Set([
  'TIJ',
  'MXL',
  'HMO',
  'CJS',
  'CUU',
  'MTY',
  'GDL',
  'MEX',
  'NLU',
  'TLC',
  'QRO',
  'BJX',
  'PBC',
  'VER',
  'MID',
  'CUN',
  'VSA',
  'TGZ',
  'OAX',
  'PVR',
  'SJD',
  'LAP',
  'CUL',
  'MZT',
  'TRC',
  'AGU',
  'SLP',
  'ZCL',
  'MLM',
  'DGO',
  'TAM',
  'REX',
  'MAM',
  'CZM',
]);

const TIME_RANGES: Record<TravelTimePreference, [number, number]> = {
  muy_temprano: [5, 8],
  manana: [7, 12],
  mediodia: [11, 15],
  tarde: [14, 19],
  noche: [18, 23],
  flexible: [0, 23],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const parseJsonBody = async (request: Request) => {
  try {
    return (await request.json()) as SearchBody;
  } catch {
    return null;
  }
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const toRecord = (value: unknown) => (value && typeof value === 'object' ? (value as Record<string, unknown>) : null);

const toStringValue = (value: unknown) => (typeof value === 'string' ? value : '');

const isTransientNoFlightsMessage = (message: string) =>
  /google flights hasn.?t returned any flights for this query/i.test(message);

const normalizeProviderMessage = (message: string) => {
  if (isTransientNoFlightsMessage(message)) {
    return 'Google Flights todavia no confirma resultados para esta consulta. Intenta nuevamente en unos segundos.';
  }

  return message;
};

const toIsoLocal = (value: string | undefined) => {
  if (!value) return '';
  if (value.includes('T')) {
    return value.length === 16 ? `${value}:00` : value;
  }

  const normalized = value.replace(' ', 'T');
  return normalized.length === 16 ? `${normalized}:00` : normalized;
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

const scoreOffer = (
  offer: Omit<
    FlightOffer,
    | 'convenienceScore'
    | 'policyScore'
    | 'recommendation'
    | 'riskLevel'
    | 'warnings'
    | 'badges'
    | 'bookingOptions'
    | 'selectedBookingOption'
  >,
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

const getTimePenalty = (dateTimeIso: string, preference: TravelTimePreference) => {
  const date = new Date(dateTimeIso);
  const hour = date.getHours();
  const [start, end] = TIME_RANGES[preference];
  return hour >= start && hour <= end ? 0 : 6;
};

const withOperationalPenalty = (
  offer: Omit<
    FlightOffer,
    | 'convenienceScore'
    | 'policyScore'
    | 'recommendation'
    | 'riskLevel'
    | 'warnings'
    | 'badges'
    | 'bookingOptions'
    | 'selectedBookingOption'
  >,
  form: TravelFormData,
  policy: TravelPolicy,
) => {
  const scored = scoreOffer(offer, form, policy);
  const preference = offer.leg === 'outbound' ? form.departurePreference : form.returnPreference;
  const penalty = getTimePenalty(offer.departureAt, preference);

  return {
    ...scored,
    convenienceScore: Math.max(scored.convenienceScore - penalty, 0),
  };
};

const getTotalLayoverMinutes = (layovers: Array<Record<string, unknown>>) =>
  layovers.reduce((total, layover) => total + (typeof layover.duration === 'number' ? layover.duration : 0), 0);

const uniqueStrings = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const buildSearchUrl = () => 'https://www.google.com/travel/flights';

const buildOfferReferenceUrl = (
  originAirport: string,
  destinationAirport: string,
  departureAt: string,
  fallbackUrl?: string,
) => {
  const travelDate = departureAt.split('T')[0] || '';
  const query = [originAirport, destinationAirport, travelDate].filter(Boolean).join(' ');
  const googleFlightsUrl = `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}`;

  if (!fallbackUrl) {
    return googleFlightsUrl;
  }

  try {
    const parsed = new URL(fallbackUrl);
    if (parsed.hostname.toLowerCase().includes('google.') && parsed.pathname.includes('/travel/flights')) {
      return googleFlightsUrl;
    }
  } catch {
    return googleFlightsUrl;
  }

  return fallbackUrl;
};

const flattenResults = (data: Record<string, unknown>) => {
  const best = Array.isArray(data.best_flights) ? (data.best_flights as Array<Record<string, unknown>>) : [];
  const other = Array.isArray(data.other_flights) ? (data.other_flights as Array<Record<string, unknown>>) : [];
  return [...best, ...other];
};

const toNumber = (value: unknown) => (typeof value === 'number' ? value : Number(value || 0));

const isDomesticMexicoRoute = (originAirport: string, destinationAirport: string) =>
  MX_AIRPORTS.has(originAirport.toUpperCase()) && MX_AIRPORTS.has(destinationAirport.toUpperCase());

const getSharedSearchParams = () => {
  const apiKey = Deno.env.get('SERPAPI_API_KEY');
  if (!apiKey) {
    throw new Error('Falta configurar SERPAPI_API_KEY en Supabase Edge Functions.');
  }

  return new URLSearchParams({
    engine: 'google_flights',
    api_key: apiKey,
    currency: Deno.env.get('SERPAPI_CURRENCY') || 'MXN',
    hl: Deno.env.get('SERPAPI_HL') || 'es',
    gl: Deno.env.get('SERPAPI_GL') || 'mx',
    travel_class: Deno.env.get('SERPAPI_TRAVEL_CLASS') || '1',
    sort_by: '1',
    show_hidden: Deno.env.get('SERPAPI_SHOW_HIDDEN') || 'true',
    deep_search: Deno.env.get('SERPAPI_DEEP_SEARCH') || 'true',
    no_cache: Deno.env.get('SERPAPI_NO_CACHE') || 'true',
    adults: '1',
  });
};

const buildFlightSearchParams = (
  form: TravelFormData,
  options?: {
    oneWay?: boolean;
    departureToken?: string;
  },
) => {
  const params = getSharedSearchParams();
  params.set('departure_id', form.originAirport);
  params.set('arrival_id', form.destinationAirport);
  params.set('outbound_date', form.departureDate);

  const isRoundTrip = !options?.oneWay && form.tripType === 'redondo' && Boolean(form.returnDate);
  params.set('type', isRoundTrip ? '1' : '2');

  if (isRoundTrip && form.returnDate) {
    params.set('return_date', form.returnDate);
  }

  if (options?.departureToken) {
    params.set('departure_token', options.departureToken);
  }

  return params;
};

const buildBookingOptionsParams = (bookingToken: string, form?: TravelFormData) => {
  const params = getSharedSearchParams();
  params.set('booking_token', bookingToken);

  if (form) {
    params.set('departure_id', form.originAirport);
    params.set('arrival_id', form.destinationAirport);
    params.set('outbound_date', form.departureDate);
    params.set('type', form.tripType === 'redondo' && form.returnDate ? '1' : '2');

    if (form.tripType === 'redondo' && form.returnDate) {
      params.set('return_date', form.returnDate);
    }
  }

  return params;
};

const fetchSerpApi = async (params: URLSearchParams): Promise<SerpApiResponse> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= SERPAPI_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
            ? data.error
            : response.statusText;
        throw new Error(`SerpApi respondio ${response.status}: ${message}`);
      }

      if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
        throw new Error(data.error);
      }

      const record = (data || {}) as Record<string, unknown>;
      const searchMetadata = toRecord(record.search_metadata) || {};
      const searchParameters = toRecord(record.search_parameters) || {};

      return {
        data: record,
        searchUrl:
          typeof searchMetadata.google_flights_url === 'string' ? searchMetadata.google_flights_url : buildSearchUrl(),
        sessionId: typeof searchMetadata.id === 'string' ? searchMetadata.id : crypto.randomUUID(),
        currency:
          typeof searchParameters.currency === 'string'
            ? searchParameters.currency
            : Deno.env.get('SERPAPI_CURRENCY') || 'MXN',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = new Error(normalizeProviderMessage(message));

      if (attempt < SERPAPI_RETRY_DELAYS_MS.length && isTransientNoFlightsMessage(message)) {
        await wait(SERPAPI_RETRY_DELAYS_MS[attempt]);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error('No fue posible consultar Google Flights.');
};

const getAirportCode = (airport: unknown) => {
  const airportRecord = toRecord(airport);
  return toStringValue(airportRecord?.id).toUpperCase();
};

const getFirstAndLastFlights = (item: Record<string, unknown>) => {
  const flights = Array.isArray(item.flights) ? (item.flights as Array<Record<string, unknown>>) : [];
  return {
    flights,
    firstFlight: flights[0] || null,
    lastFlight: flights[flights.length - 1] || null,
  };
};

const shouldKeepOffer = (
  item: Record<string, unknown>,
  expectedOriginAirport: string,
  expectedDestinationAirport: string,
) => {
  const { flights, firstFlight, lastFlight } = getFirstAndLastFlights(item);
  if (!firstFlight || !lastFlight) {
    return false;
  }

  const firstDepartureAirport = getAirportCode(toRecord(firstFlight)?.departure_airport);
  const lastArrivalAirport = getAirportCode(toRecord(lastFlight)?.arrival_airport);

  if (firstDepartureAirport !== expectedOriginAirport.toUpperCase()) {
    return false;
  }

  if (lastArrivalAirport !== expectedDestinationAirport.toUpperCase()) {
    return false;
  }

  if (!isDomesticMexicoRoute(expectedOriginAirport, expectedDestinationAirport)) {
    return true;
  }

  const segmentAirports = uniqueStrings(
    flights.flatMap((flight) => [
      getAirportCode(toRecord(flight)?.departure_airport),
      getAirportCode(toRecord(flight)?.arrival_airport),
    ]),
  );

  if (segmentAirports.some((airport) => !MX_AIRPORTS.has(airport))) {
    return false;
  }

  const layovers = Array.isArray(item.layovers) ? (item.layovers as Array<Record<string, unknown>>) : [];
  const layoverMinutes = getTotalLayoverMinutes(layovers);
  const durationMinutes = toNumber(item.total_duration) || 0;

  if (layoverMinutes > DOMESTIC_MX_MAX_LAYOVER_MINUTES) {
    return false;
  }

  if (durationMinutes > DOMESTIC_MX_MAX_DURATION_MINUTES) {
    return false;
  }

  return true;
};

const normalizeOffer = (
  item: Record<string, unknown>,
  leg: FlightLeg,
  form: TravelFormData,
  policy: TravelPolicy,
  sessionId: string,
  searchUrl: string,
  currency: string,
  expectedOriginAirport: string,
  expectedDestinationAirport: string,
) => {
  if (!shouldKeepOffer(item, expectedOriginAirport, expectedDestinationAirport)) {
    return null;
  }

  const flights = Array.isArray(item.flights) ? (item.flights as Array<Record<string, unknown>>) : [];
  if (flights.length === 0) {
    return null;
  }

  const firstFlight = flights[0];
  const lastFlight = flights[flights.length - 1];
  const layovers = Array.isArray(item.layovers) ? (item.layovers as Array<Record<string, unknown>>) : [];
  const airlines = uniqueStrings(flights.map((flight) => toStringValue(flight.airline)));
  const flightNumbers = uniqueStrings(flights.map((flight) => toStringValue(flight.flight_number)));
  const extensions = Array.isArray(item.extensions) ? (item.extensions as string[]) : [];
  const price = toNumber(item.price);
  const departureAt = toIsoLocal(toStringValue(toRecord(firstFlight.departure_airport)?.time));
  const arrivalAt = toIsoLocal(toStringValue(toRecord(lastFlight.arrival_airport)?.time));

  if (!departureAt || !arrivalAt) {
    return null;
  }

  const bookingToken = toStringValue(item.booking_token) || undefined;
  const departureToken = toStringValue(item.departure_token) || undefined;
  const offerId =
    `${leg}-${bookingToken || departureToken || `${toStringValue(firstFlight.flight_number)}-${departureAt}`}`.replaceAll(
      ' ',
      '-',
    );

  const baseOffer = {
    id: offerId,
    leg,
    provider: PROVIDER_LABEL,
    airline: airlines.join(' / ') || 'Google Flights',
    flightNumber: flightNumbers.join(' / ') || 'Sin numero',
    departureAirport: getAirportCode(toRecord(firstFlight)?.departure_airport) || expectedOriginAirport,
    arrivalAirport: getAirportCode(toRecord(lastFlight)?.arrival_airport) || expectedDestinationAirport,
    departureAt,
    arrivalAt,
    stops: layovers.length > 0 ? layovers.length : Math.max(flights.length - 1, 0),
    durationMinutes: toNumber(item.total_duration) || 0,
    layoverMinutes: getTotalLayoverMinutes(layovers),
    price,
    currency,
    fareType: extensions[0] || 'Tarifa Google Flights',
    cabin: toStringValue(firstFlight.travel_class) || 'Economy',
    deeplink: buildOfferReferenceUrl(expectedOriginAirport, expectedDestinationAirport, departureAt, searchUrl),
    offerToken: bookingToken || departureToken || offerId,
    departureToken,
    bookingToken,
    sessionToken: sessionId,
  };

  return {
    ...baseOffer,
    ...withOperationalPenalty(baseOffer, form, policy),
    bookingOptions: [],
    selectedBookingOption: null,
  } satisfies FlightOffer;
};

const preferOffer = (current: FlightOffer, candidate: FlightOffer) => {
  if (candidate.price !== current.price) {
    return candidate.price < current.price ? candidate : current;
  }

  if (candidate.stops !== current.stops) {
    return candidate.stops < current.stops ? candidate : current;
  }

  if (candidate.durationMinutes !== current.durationMinutes) {
    return candidate.durationMinutes < current.durationMinutes ? candidate : current;
  }

  return candidate.convenienceScore > current.convenienceScore ? candidate : current;
};

const dedupeOffers = (offers: FlightOffer[]) => {
  const deduped = new Map<string, FlightOffer>();

  for (const offer of offers) {
    const key =
      offer.departureToken ||
      offer.bookingToken ||
      `${offer.flightNumber}-${offer.departureAt}-${offer.arrivalAt}-${offer.price}`;
    const current = deduped.get(key);

    if (!current) {
      deduped.set(key, offer);
      continue;
    }

    deduped.set(key, preferOffer(current, offer));
  }

  return Array.from(deduped.values());
};

const normalizeOfferList = (
  data: Record<string, unknown>,
  leg: FlightLeg,
  form: TravelFormData,
  policy: TravelPolicy,
  sessionId: string,
  searchUrl: string,
  currency: string,
  expectedOriginAirport: string,
  expectedDestinationAirport: string,
) =>
  dedupeOffers(
    flattenResults(data)
      .map((item) =>
        normalizeOffer(
          item,
          leg,
          form,
          policy,
          sessionId,
          searchUrl,
          currency,
          expectedOriginAirport,
          expectedDestinationAirport,
        ),
      )
      .filter(Boolean) as FlightOffer[],
  );

const searchOneWay = async (form: TravelFormData, policy: TravelPolicy) => {
  const response = await fetchSerpApi(buildFlightSearchParams(form, { oneWay: true }));
  return normalizeOfferList(
    response.data,
    'outbound',
    form,
    policy,
    response.sessionId,
    response.searchUrl,
    response.currency,
    form.originAirport,
    form.destinationAirport,
  );
};

const searchRoundTripDepartures = async (form: TravelFormData, policy: TravelPolicy) => {
  const response = await fetchSerpApi(buildFlightSearchParams(form));
  return {
    outbound: normalizeOfferList(
      response.data,
      'outbound',
      form,
      policy,
      response.sessionId,
      response.searchUrl,
      response.currency,
      form.originAirport,
      form.destinationAirport,
    ),
    response,
  };
};

const searchReturnOptions = async (form: TravelFormData, policy: TravelPolicy, departureToken: string) => {
  const response = await fetchSerpApi(buildFlightSearchParams(form, { departureToken }));
  return normalizeOfferList(
    response.data,
    'return',
    form,
    policy,
    response.sessionId,
    response.searchUrl,
    response.currency,
    form.destinationAirport,
    form.originAirport,
  );
};

const getBookingUrl = (option: Record<string, unknown>, searchUrl: string) => {
  const directUrl =
    toStringValue(option.url) ||
    toStringValue(option.link) ||
    toStringValue(toRecord(option.booking_request)?.url) ||
    toStringValue(toRecord(option.booking_request)?.link);

  if (directUrl) {
    return directUrl;
  }

  const together = toRecord(option.together);
  const departing = toRecord(option.departing);

  return (
    toStringValue(together?.url) ||
    toStringValue(together?.link) ||
    toStringValue(departing?.url) ||
    toStringValue(departing?.link) ||
    searchUrl
  );
};

const normalizeBookingOptions = (data: Record<string, unknown>, currency: string, searchUrl: string) => {
  const rawOptions = Array.isArray(data.booking_options)
    ? (data.booking_options as Array<Record<string, unknown>>)
    : [];

  return rawOptions.map((option) => {
    const together = toRecord(option.together);
    const departing = toRecord(option.departing);
    const bookWith =
      toStringValue(option.book_with) ||
      toStringValue(together?.book_with) ||
      toStringValue(departing?.book_with) ||
      'Proveedor externo';
    const priceCandidate = together?.price ?? departing?.price ?? option.price ?? null;

    return {
      bookWith,
      price: priceCandidate === null ? null : toNumber(priceCandidate),
      currency,
      url: getBookingUrl(option, searchUrl),
      airline: Boolean(option.airline ?? together?.airline ?? departing?.airline),
      separateTickets: Boolean(option.separate_tickets),
    } satisfies FlightBookingOption;
  });
};

const fetchBookingOptions = async (bookingToken: string, form?: TravelFormData) => {
  const response = await fetchSerpApi(buildBookingOptionsParams(bookingToken, form));
  return normalizeBookingOptions(response.data, response.currency, response.searchUrl);
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Metodo no permitido.' }, 405);
  }

  const body = await parseJsonBody(request);
  if (!body || typeof body !== 'object') {
    return json({ error: 'Body invalido.' }, 400);
  }

  const provider = String(body.provider || 'serpapi_google_flights');
  const action = body.action || 'search';

  if (provider !== 'serpapi_google_flights' && provider !== 'serpapi' && provider !== 'google_flights') {
    return json({ error: `Proveedor no soportado: ${provider}.` }, 400);
  }

  try {
    if (action === 'booking_options') {
      if (!body.bookingToken) {
        return json({ error: 'Falta bookingToken para consultar opciones de reserva.' }, 400);
      }

      const bookingOptions = await fetchBookingOptions(body.bookingToken, body.form);
      return json({ bookingOptions });
    }

    if (!body.form || !body.policy) {
      return json({ error: 'Faltan datos de busqueda o politica.' }, 400);
    }

    const form = body.form;
    const policy = body.policy;

    if (action === 'returns') {
      if (!body.departureToken) {
        return json({ error: 'Falta departureToken para consultar regresos compatibles.' }, 400);
      }

      const offers = await searchReturnOptions(form, policy, body.departureToken);
      return json({ offers });
    }

    if (form.tripType === 'redondo' && form.returnDate) {
      const { outbound, response } = await searchRoundTripDepartures(form, policy);
      const session: FlightSearchSession = {
        id: `serpapi-${crypto.randomUUID()}`,
        searchedAt: new Date().toISOString(),
        provider: PROVIDER_LABEL,
        mode: 'live',
        pricingMode: 'round_trip_total',
        criteria: {
          originAirport: form.originAirport,
          destinationAirport: form.destinationAirport,
          departureDate: form.departureDate,
          returnDate: form.returnDate,
          tripType: form.tripType,
        },
        outbound: outbound.map((offer) => ({
          ...offer,
          deeplink: response.searchUrl,
        })),
        inbound: [],
      };

      return json({ session });
    }

    const outbound = await searchOneWay(form, policy);
    const session: FlightSearchSession = {
      id: `serpapi-${crypto.randomUUID()}`,
      searchedAt: new Date().toISOString(),
      provider: PROVIDER_LABEL,
      mode: 'live',
      pricingMode: 'per_leg',
      criteria: {
        originAirport: form.originAirport,
        destinationAirport: form.destinationAirport,
        departureDate: form.departureDate,
        returnDate: form.returnDate,
        tripType: form.tripType,
      },
      outbound,
      inbound: [],
    };

    return json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fallo la busqueda con SerpApi Google Flights.';
    return json({ error: message }, 500);
  }
});
