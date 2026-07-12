import { supabase } from '../supabaseClient';
import { getDisabledIntegrationMessage, runtimeFlags } from '../config/runtimeFlags';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const USING_LOCAL_SUPABASE = /127\.0\.0\.1:54321|localhost:54321/.test(SUPABASE_URL);

interface AdvisoryWhatsAppNotificationFailure {
  profileId?: string;
  phone?: string;
  recipientName?: string;
  reason: string;
}

interface AdvisoryWhatsAppNotificationResponse {
  ok?: boolean;
  advisoryId?: string;
  sentCount?: number;
  skippedCount?: number;
  failures?: AdvisoryWhatsAppNotificationFailure[];
  deliveryMode?: 'test_override' | 'assigned_auth_phone';
  deliveryTargetLabel?: string;
  warning?: string;
  error?: string;
}

const LOCAL_EDGE_HINT =
  'Si estas trabajando en local, levanta tu carpeta externa de Supabase y ejecuta `cd "$SUPABASE_LOCAL_DIR" && supabase functions serve send-advisory-whatsapp-notification --env-file functions/.env`.';

export const isAdvisoryWhatsAppEnabled = () => runtimeFlags.advisoryWhatsappEnabled;

export const getAdvisoryWhatsAppDisabledMessage = () => getDisabledIntegrationMessage('advisoryWhatsapp');

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
          // ignore parse issues and fall through
        }
      }
    }
  }

  const fallback = error instanceof Error ? error.message : 'No fue posible enviar la notificacion de WhatsApp.';
  if (
    USING_LOCAL_SUPABASE &&
    /non-2xx status code|failed to fetch|fetch failed|functions relay error/i.test(fallback)
  ) {
    return `${fallback}. ${LOCAL_EDGE_HINT}`;
  }

  return fallback;
};

export const sendAdvisoryWhatsAppNotification = async (payload: { advisoryId: string }) => {
  if (!isAdvisoryWhatsAppEnabled()) {
    throw new Error(getAdvisoryWhatsAppDisabledMessage());
  }

  const { data, error } = await supabase.functions.invoke<AdvisoryWhatsAppNotificationResponse>(
    'send-advisory-whatsapp-notification',
    {
      body: payload,
    },
  );

  if (error) {
    const message = await extractFunctionErrorMessage(error);
    throw new Error(message);
  }

  if (!data?.ok) {
    throw new Error(data?.error || 'La funcion de WhatsApp no confirmo el envio de la notificacion.');
  }

  return data;
};
