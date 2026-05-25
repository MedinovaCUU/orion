import { supabase } from '../supabaseClient';
import { getDisabledIntegrationMessage, runtimeFlags } from '../config/runtimeFlags';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const USING_LOCAL_SUPABASE = /127\.0\.0\.1:54321|localhost:54321/.test(SUPABASE_URL);

interface SparePartRequestLinePayload {
  code: string;
  description: string;
  quantity: number;
  equipmentFamily?: string;
  notes?: string;
}

export interface SparePartRequestEmailPayload {
  requestId: string;
  engineerName: string;
  employeeNumber: string;
  engineerPhone?: string;
  ticketReference?: string;
  equipmentSerial?: string;
  equipmentModel?: string;
  clientName?: string;
  clientContact?: string;
  clientPhone?: string;
  siteAddress?: string;
  destinationCity?: string;
  destinationState?: string;
  priority?: string;
  neededByDate?: string;
  destinationMode?: string;
  destinationDetail?: string;
  reason?: string;
  observations?: string;
  items: SparePartRequestLinePayload[];
}

interface SendSparePartRequestEmailResponse {
  ok?: boolean;
  to?: string;
  subject?: string;
  error?: string;
}

const LOCAL_EDGE_HINT =
  'Si estas trabajando en local, verifica que Supabase este levantado y ejecuta `supabase functions serve send-spare-parts-request-email --env-file supabase/functions/.env --no-verify-jwt`.';

export const isSparePartsRequestEmailEnabled = () => runtimeFlags.sparePartsRequestEmailEnabled;

export const getSparePartsRequestEmailDisabledMessage = () => getDisabledIntegrationMessage('sparePartsRequestEmail');

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
          // ignore and fall back
        }
      }
    }
  }

  const fallback = error instanceof Error ? error.message : 'No fue posible enviar el correo de refacciones.';
  if (
    USING_LOCAL_SUPABASE &&
    /non-2xx status code|failed to fetch|fetch failed|functions relay error/i.test(fallback)
  ) {
    return `${fallback}. ${LOCAL_EDGE_HINT}`;
  }

  return fallback;
};

export const sendSparePartRequestEmail = async (payload: SparePartRequestEmailPayload) => {
  if (!isSparePartsRequestEmailEnabled()) {
    throw new Error(getSparePartsRequestEmailDisabledMessage());
  }

  const { data, error } = await supabase.functions.invoke<SendSparePartRequestEmailResponse>(
    'send-spare-parts-request-email',
    {
      body: payload,
    },
  );

  if (error) {
    const message = await extractFunctionErrorMessage(error);
    throw new Error(message);
  }

  if (!data?.ok) {
    throw new Error(data?.error || 'La funcion de correo no confirmo el envio de refacciones.');
  }

  return data;
};
