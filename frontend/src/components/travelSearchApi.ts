import { supabase } from '../supabaseClient';
import { getDisabledIntegrationMessage, runtimeFlags } from '../config/runtimeFlags';
import type {
  FlightBookingOption,
  FlightOffer,
  FlightSearchSession,
  TravelFormData,
  TravelPolicy,
} from './travelPlanner';

const DEFAULT_PROVIDER = import.meta.env.VITE_FLIGHT_SEARCH_PROVIDER || 'serpapi_google_flights';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const USING_LOCAL_SUPABASE = /127\.0\.0\.1:54321|localhost:54321/.test(SUPABASE_URL);

interface FlightSearchFunctionResponse {
  session?: FlightSearchSession;
  offers?: FlightOffer[];
  bookingOptions?: FlightBookingOption[];
  error?: string;
}

const LOCAL_EDGE_HINT =
  'Si estas trabajando en local, verifica que Supabase este levantado y ejecuta `supabase functions serve flight-search --env-file supabase/functions/.env --no-verify-jwt`.';

const normalizeFlightProviderMessage = (message: string) => {
  if (/google flights hasn.?t returned any flights for this query/i.test(message)) {
    return 'Google Flights todavia no confirma resultados para esta consulta. Espera unos segundos y vuelve a intentar.';
  }

  return message;
};

export const isFlightSearchEnabled = () => runtimeFlags.flightSearchEnabled;

export const getFlightSearchDisabledMessage = () => getDisabledIntegrationMessage('flightSearch');

const extractFunctionErrorMessage = async (error: unknown) => {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json();
        if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
          return normalizeFlightProviderMessage(payload.error);
        }
      } catch {
        try {
          const text = await context.clone().text();
          if (text.trim()) {
            return normalizeFlightProviderMessage(text.trim());
          }
        } catch {
          // ignore parse errors and fall back to the generic message below
        }
      }
    }
  }

  const fallback =
    error instanceof Error ? error.message : 'No fue posible consultar el proveedor de vuelos.';

  if (
    USING_LOCAL_SUPABASE &&
    /non-2xx status code|failed to fetch|fetch failed|functions relay error/i.test(fallback)
  ) {
    return `${fallback}. ${LOCAL_EDGE_HINT}`;
  }

  return normalizeFlightProviderMessage(fallback);
};

const invokeFlightSearch = async (body: Record<string, unknown>) => {
  if (!isFlightSearchEnabled()) {
    throw new Error(getFlightSearchDisabledMessage());
  }

  const { data, error } = await supabase.functions.invoke<FlightSearchFunctionResponse>('flight-search', {
    body: {
      provider: DEFAULT_PROVIDER,
      ...body,
    },
  });

  if (error) {
    const message = await extractFunctionErrorMessage(error);
    throw new Error(message);
  }

  if (data?.error) {
    throw new Error(normalizeFlightProviderMessage(data.error));
  }

  return data;
};

export const searchLiveFlights = async (
  form: TravelFormData,
  policy: TravelPolicy,
): Promise<FlightSearchSession> => {
  const data = await invokeFlightSearch({
    action: 'search',
    form,
    policy,
  });

  if (!data?.session) {
    throw new Error('El proveedor no devolvio resultados utilizables.');
  }

  return data.session;
};

export const searchReturnFlights = async (
  form: TravelFormData,
  policy: TravelPolicy,
  departureToken: string,
): Promise<FlightOffer[]> => {
  const data = await invokeFlightSearch({
    action: 'returns',
    form,
    policy,
    departureToken,
  });

  if (!data?.offers) {
    throw new Error('No fue posible obtener opciones de regreso compatibles.');
  }

  return data.offers;
};

export const fetchBookingOptions = async (
  bookingToken: string,
  form: Pick<TravelFormData, 'originAirport' | 'destinationAirport' | 'departureDate' | 'returnDate' | 'tripType'>,
): Promise<FlightBookingOption[]> => {
  const data = await invokeFlightSearch({
    action: 'booking_options',
    bookingToken,
    form,
  });

  if (!data?.bookingOptions) {
    throw new Error('No fue posible resolver opciones de reserva para el vuelo seleccionado.');
  }

  return data.bookingOptions;
};
