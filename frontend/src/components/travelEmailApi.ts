import { supabase } from '../supabaseClient';
import { getDisabledIntegrationMessage, runtimeFlags } from '../config/runtimeFlags';
import type { FlightSearchSession, FlightSelections, TravelFormData, TravelSummary } from './travelPlanner';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const USING_LOCAL_SUPABASE = /127\.0\.0\.1:54321|localhost:54321/.test(SUPABASE_URL);

interface SendTravelRequestEmailResponse {
  ok?: boolean;
  to?: string;
  subject?: string;
  error?: string;
}

const LOCAL_EDGE_HINT =
  'Si estas trabajando en local, verifica que Supabase este levantado y ejecuta `supabase functions serve send-travel-request-email --env-file supabase/functions/.env --no-verify-jwt`.';

export const isTravelRequestEmailEnabled = () => runtimeFlags.travelRequestEmailEnabled;

export const getTravelRequestEmailDisabledMessage = () => getDisabledIntegrationMessage('travelRequestEmail');

const extractFunctionErrorMessage = async (error: unknown) => {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json();
        if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
          return payload.error;
        }
      } catch {
        try {
          const text = await context.clone().text();
          if (text.trim()) {
            return text.trim();
          }
        } catch {
          // ignore parse errors and fall back to generic message
        }
      }
    }
  }

  const fallback = error instanceof Error ? error.message : 'No fue posible enviar el correo de solicitud.';
  if (
    USING_LOCAL_SUPABASE &&
    /non-2xx status code|failed to fetch|fetch failed|functions relay error/i.test(fallback)
  ) {
    return `${fallback}. ${LOCAL_EDGE_HINT}`;
  }

  return fallback;
};

export const sendTravelRequestEmail = async (payload: {
  travelRequestId: string;
  form: TravelFormData;
  summary: TravelSummary;
  selections: FlightSelections;
  searchSession: FlightSearchSession | null;
}) => {
  if (!isTravelRequestEmailEnabled()) {
    throw new Error(getTravelRequestEmailDisabledMessage());
  }

  const { data, error } = await supabase.functions.invoke<SendTravelRequestEmailResponse>('send-travel-request-email', {
    body: payload,
  });

  if (error) {
    const message = await extractFunctionErrorMessage(error);
    throw new Error(message);
  }

  if (!data?.ok) {
    throw new Error(data?.error || 'La funcion de correo no confirmo el envio.');
  }

  return data;
};
