import { supabase } from '../supabaseClient';
import { getDisabledIntegrationMessage, runtimeFlags } from '../config/runtimeFlags';
import type {
  FulfillmentState,
  TrackingCarrier,
  TrackingStatus,
  TrackingTimelineEvent,
} from './orionTracking';

const TRACKING_LOOKUP_FUNCTION = 'resolve-shipping-tracking';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const DEFAULT_BROWSER_RELAY_URL = 'http://127.0.0.1:8788/lookup';
const RELAY_SUPPORTED_CARRIERS: TrackingCarrier[] = ['dhl', 'estafeta', 'tresguerras'];
const isLocalBrowserRuntime = () => {
  if (typeof window === 'undefined') {
    return import.meta.env.DEV;
  }

  return (
    import.meta.env.DEV ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === 'localhost'
  );
};
const TRACKING_BROWSER_RELAY_URL = (
  import.meta.env.VITE_TRACKING_BROWSER_RELAY_URL || (isLocalBrowserRuntime() ? DEFAULT_BROWSER_RELAY_URL : '')
).trim();
const TRACKING_EDGE_LOOKUP_FLAG = String(import.meta.env.VITE_ENABLE_TRACKING_EDGE_LOOKUP || '').trim().toLowerCase();
const USING_LOCAL_SUPABASE = /127\.0\.0\.1:54321|localhost:54321/.test(SUPABASE_URL);
const EDGE_LOOKUP_ENABLED =
  USING_LOCAL_SUPABASE || ['1', 'true', 'yes', 'on'].includes(TRACKING_EDGE_LOOKUP_FLAG);
const IS_LOCAL_BROWSER_RUNTIME = isLocalBrowserRuntime();
const IS_HOSTED_HTTPS_RUNTIME =
  typeof window !== 'undefined' && window.location.protocol === 'https:' && !IS_LOCAL_BROWSER_RUNTIME;
const IS_LOCALHOST_RELAY_URL = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(TRACKING_BROWSER_RELAY_URL);
const HOSTED_LOCAL_RELAY_BLOCKED_HINT =
  'La versión publicada por HTTPS no puede consultar el relay local http://127.0.0.1:8788. Para consulta viva sin API oficial usa Orion local en 127.0.0.1 o despliega un backend con navegador real.';
const HOSTED_STATIC_RUNTIME_HINT =
  'La versión publicada en GitHub Pages solo ejecuta el frontend estático. 127.0.0.1 sí funciona distinto porque Orion local puede levantar el relay del navegador.';
const LOCAL_EDGE_HINT =
  'Si estas trabajando en local, levanta tu carpeta externa de Supabase y ejecuta `cd "$SUPABASE_LOCAL_DIR" && supabase functions serve resolve-shipping-tracking --env-file functions/.env --no-verify-jwt`.';
const LOCAL_BROWSER_RELAY_HINT =
  'En local, `npm run dev` y `npm run preview` ya levantan el relay del navegador para DHL, Estafeta y Tresguerras. Si no aparece, reinicia Orion local.';
const HOSTED_EDGE_SERVICE_HINT =
  'La consulta viva hospedada depende de `resolve-shipping-tracking` y, para DHL, de un backend con navegador real o de la API oficial.';
const BROWSER_RELAY_HINT = IS_LOCAL_BROWSER_RUNTIME
  ? LOCAL_BROWSER_RELAY_HINT
  : IS_HOSTED_HTTPS_RUNTIME && IS_LOCALHOST_RELAY_URL
    ? HOSTED_LOCAL_RELAY_BLOCKED_HINT
    : HOSTED_EDGE_SERVICE_HINT;
const EDGE_LOOKUP_DISABLED_HINT =
  'La consulta viva fuera del relay local queda desactivada hasta desplegar `resolve-shipping-tracking` o habilitar `VITE_ENABLE_TRACKING_EDGE_LOOKUP=true`.';

const appendHostedLookupContext = (message: string, relayError?: string) => {
  if (!IS_HOSTED_HTTPS_RUNTIME) {
    return message;
  }

  if (
    IS_LOCALHOST_RELAY_URL &&
    relayError &&
    /failed to fetch/i.test(relayError) &&
    !message.includes(HOSTED_LOCAL_RELAY_BLOCKED_HINT)
  ) {
    return `${HOSTED_LOCAL_RELAY_BLOCKED_HINT} ${message}`.trim();
  }

  if (
    /DHL_API_KEY|demo-key oficial|backend con navegador real|API oficial|edge function/i.test(message) &&
    !message.includes(HOSTED_STATIC_RUNTIME_HINT)
  ) {
    return `${HOSTED_STATIC_RUNTIME_HINT} ${message}`.trim();
  }

  if (message.includes(HOSTED_LOCAL_RELAY_BLOCKED_HINT) || message.includes(HOSTED_STATIC_RUNTIME_HINT)) {
    return message;
  }

  return message;
};

export type TrackingLookupMode = 'live' | 'manual_only';

export interface TrackingLookupResponse {
  ok?: boolean;
  lookupMode?: TrackingLookupMode;
  carrier?: TrackingCarrier;
  trackingNumber?: string;
  status?: TrackingStatus;
  fulfillmentState?: FulfillmentState;
  portalStatusText?: string;
  lastEventLabel?: string;
  lastEventAt?: string;
  estimatedDelivery?: string;
  recipient?: string;
  origin?: string;
  destination?: string;
  serviceType?: string;
  deliveryProofName?: string;
  timeline?: TrackingTimelineEvent[];
  rawSummary?: string;
  error?: string;
  note?: string;
}

export const isTrackingLookupEnabled = () => runtimeFlags.trackingLookupEnabled;

export const getTrackingLookupDisabledMessage = () => getDisabledIntegrationMessage('trackingLookup');

const supportsRelayLookup = (carrier: TrackingCarrier | null) =>
  carrier !== null && Boolean(TRACKING_BROWSER_RELAY_URL) && RELAY_SUPPORTED_CARRIERS.includes(carrier);

const supportsEdgeLookup = (carrier: TrackingCarrier | null) =>
  EDGE_LOOKUP_ENABLED && (carrier === 'dhl' || carrier === 'estafeta');

export const supportsLivePortalLookup = (carrier: TrackingCarrier | null) =>
  supportsRelayLookup(carrier) || supportsEdgeLookup(carrier);

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
          // ignore parse errors and fall back below
        }
      }
    }
  }

  const fallback = error instanceof Error ? error.message : 'No fue posible consultar el portal de mensajería.';

  if (USING_LOCAL_SUPABASE && /non-2xx status code|failed to fetch|fetch failed|functions relay error/i.test(fallback)) {
    return `${fallback}. ${LOCAL_EDGE_HINT}`;
  }

  if (/requested function was not found|not_found|failed to send a request to the edge function/i.test(fallback)) {
    return EDGE_LOOKUP_DISABLED_HINT;
  }

  return fallback;
};

const extractRelayErrorMessage = async (response: Response) => {
  try {
    const payload = (await response.clone().json()) as TrackingLookupResponse & { error?: string };
    if (typeof payload?.error === 'string' && payload.error.trim()) {
      return payload.error.trim();
    }
  } catch {
    // ignore parse errors and fall back below
  }

  try {
    const text = await response.clone().text();
    if (text.trim()) {
      return text.trim();
    }
  } catch {
    // ignore parse errors and fall back below
  }

  return `El relay local devolvio HTTP ${response.status}.`;
};

const lookupTrackingViaBrowserRelay = async (
  carrier: TrackingCarrier,
  trackingNumber: string,
): Promise<TrackingLookupResponse> => {
  if (!TRACKING_BROWSER_RELAY_URL) {
    return {
      ok: false,
      lookupMode: 'manual_only',
      carrier,
      trackingNumber,
      error: `No hay relay de navegador configurado para consulta viva. ${BROWSER_RELAY_HINT}`,
    };
  }

  let response: Response;
  try {
    response = await fetch(TRACKING_BROWSER_RELAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        carrier,
        trackingNumber,
      }),
    });
  } catch (error) {
    const fallback = error instanceof Error ? error.message : 'No fue posible conectar con el relay local.';
    throw new Error(`${fallback}. ${BROWSER_RELAY_HINT}`);
  }

  if (!response.ok) {
    const message = await extractRelayErrorMessage(response);
    throw new Error(`${message} ${BROWSER_RELAY_HINT}`.trim());
  }

  const payload = (await response.json()) as TrackingLookupResponse;
  return payload;
};

export const lookupTrackingInCarrierPortal = async (
  carrier: TrackingCarrier,
  trackingNumber: string,
): Promise<TrackingLookupResponse> => {
  if (!isTrackingLookupEnabled()) {
    throw new Error(getTrackingLookupDisabledMessage());
  }

  let relayError = '';
  if (supportsRelayLookup(carrier)) {
    try {
      return await lookupTrackingViaBrowserRelay(carrier, trackingNumber);
    } catch (error) {
      relayError = error instanceof Error ? error.message : 'No fue posible conectar con el relay local.';
      if (!supportsEdgeLookup(carrier)) {
        throw error;
      }
    }
  }

  if (!supportsEdgeLookup(carrier)) {
    return {
      ok: false,
      lookupMode: 'manual_only',
      carrier,
      trackingNumber,
      error: appendHostedLookupContext(
        `${EDGE_LOOKUP_DISABLED_HINT} ${IS_LOCAL_BROWSER_RUNTIME ? LOCAL_BROWSER_RELAY_HINT : HOSTED_EDGE_SERVICE_HINT}`.trim(),
        relayError,
      ),
    };
  }

  if (!supportsLivePortalLookup(carrier)) {
    return {
      ok: false,
      lookupMode: 'manual_only',
      carrier,
      trackingNumber,
      error: appendHostedLookupContext(
        `La consulta viva de ${carrier.toUpperCase()} no está disponible en esta configuración. ${EDGE_LOOKUP_DISABLED_HINT}`,
        relayError,
      ),
    };
  }

  const { data, error } = await supabase.functions.invoke<TrackingLookupResponse>(TRACKING_LOOKUP_FUNCTION, {
    body: {
      carrier,
      trackingNumber,
    },
  });

  if (error) {
    const message = appendHostedLookupContext(await extractFunctionErrorMessage(error), relayError);
    throw new Error(message);
  }

  if (data?.error) {
    return {
      ...data,
      error: appendHostedLookupContext(data.error, relayError),
    };
  }

  return data || { ok: false, lookupMode: 'live', carrier, trackingNumber, error: 'El portal no devolvió datos utilizables.' };
};
