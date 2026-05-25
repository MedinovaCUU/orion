import { supabase } from '../supabaseClient';
import { getDisabledIntegrationMessage, runtimeFlags } from '../config/runtimeFlags';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const USING_LOCAL_SUPABASE = /127\.0\.0\.1:54321|localhost:54321/.test(SUPABASE_URL);

const LOCAL_EDGE_HINT =
  'Si estas trabajando en local, verifica que Supabase este levantado y ejecuta `supabase functions serve supremo-launch --env-file supabase/functions/.env --no-verify-jwt`.';

interface SupremoLaunchFunctionResponse {
  ok?: boolean;
  launchUrl?: string;
  equipmentLabel?: string;
  supremoId?: string;
  manualPasswordRequired?: boolean;
  launchPassword?: string | null;
  usedOtp?: boolean;
  otpError?: string | null;
  error?: string;
}

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
          // ignore parse issues
        }
      }
    }
  }

  const fallback = error instanceof Error ? error.message : 'No fue posible abrir la sesion remota con Supremo.';
  if (
    USING_LOCAL_SUPABASE &&
    /non-2xx status code|failed to fetch|fetch failed|functions relay error/i.test(fallback)
  ) {
    return `${fallback}. ${LOCAL_EDGE_HINT}`;
  }

  return fallback;
};

export const isSupremoLaunchEnabled = () => runtimeFlags.supremoLaunchEnabled;

export const getSupremoLaunchDisabledMessage = () => getDisabledIntegrationMessage('supremoLaunch');

export const createSupremoLaunchSession = async (equipmentId: string) => {
  if (!isSupremoLaunchEnabled()) {
    throw new Error(getSupremoLaunchDisabledMessage());
  }

  const { data, error } = await supabase.functions.invoke<SupremoLaunchFunctionResponse>('supremo-launch', {
    body: { equipmentId },
  });

  if (error) {
    const message = await extractFunctionErrorMessage(error);
    throw new Error(message);
  }

  if (!data?.ok || !data.launchUrl) {
    throw new Error(data?.error || 'La funcion de Supremo no devolvio una URL valida.');
  }

  return data;
};
