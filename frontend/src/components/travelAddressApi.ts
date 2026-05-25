import { supabase } from '../supabaseClient';
import { getDisabledIntegrationMessage, runtimeFlags } from '../config/runtimeFlags';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const USING_LOCAL_SUPABASE = /127\.0\.0\.1:54321|localhost:54321/.test(SUPABASE_URL);

const LOCAL_EDGE_HINT =
  'Si estas trabajando en local, verifica que Supabase este levantado y ejecuta `supabase functions serve address-autocomplete --env-file supabase/functions/.env --no-verify-jwt`.';

export const isAddressAutocompleteEnabled = () => runtimeFlags.addressAutocompleteEnabled;

export const getAddressAutocompleteDisabledMessage = () => getDisabledIntegrationMessage('addressAutocomplete');

export interface AddressSuggestion {
  placeId: string;
  fullText: string;
  primaryText: string;
  secondaryText: string;
}

export interface AddressPlaceDetails {
  formattedAddress: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  latitude?: number | null;
  longitude?: number | null;
}

interface AddressAutocompleteResponse {
  suggestions?: AddressSuggestion[];
  details?: AddressPlaceDetails;
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
          // ignore parse errors
        }
      }
    }
  }

  const fallback =
    error instanceof Error ? error.message : 'No fue posible consultar el proveedor de direcciones.';

  if (
    USING_LOCAL_SUPABASE &&
    /non-2xx status code|failed to fetch|fetch failed|functions relay error/i.test(fallback)
  ) {
    return `${fallback}. ${LOCAL_EDGE_HINT}`;
  }

  return fallback;
};

const invokeAddressAutocomplete = async (body: Record<string, unknown>) => {
  if (!isAddressAutocompleteEnabled()) {
    throw new Error(getAddressAutocompleteDisabledMessage());
  }

  const { data, error } = await supabase.functions.invoke<AddressAutocompleteResponse>('address-autocomplete', {
    body,
  });

  if (error) {
    const message = await extractFunctionErrorMessage(error);
    throw new Error(message);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
};

export const searchAddressSuggestions = async ({
  input,
  sessionToken,
  cityHint,
}: {
  input: string;
  sessionToken: string;
  cityHint?: string;
}): Promise<AddressSuggestion[]> => {
  const data = await invokeAddressAutocomplete({
    action: 'suggest',
    input,
    sessionToken,
    cityHint: cityHint || '',
  });

  return data?.suggestions || [];
};

export const fetchAddressPlaceDetails = async (
  placeId: string,
  sessionToken: string,
): Promise<AddressPlaceDetails | null> => {
  const data = await invokeAddressAutocomplete({
    action: 'details',
    placeId,
    sessionToken,
  });

  return data?.details || null;
};
