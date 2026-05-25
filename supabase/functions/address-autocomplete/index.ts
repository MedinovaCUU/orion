const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

interface SuggestionBody {
  action?: 'suggest' | 'details';
  input?: string;
  sessionToken?: string;
  cityHint?: string;
  placeId?: string;
}

interface AddressSuggestion {
  placeId: string;
  fullText: string;
  primaryText: string;
  secondaryText: string;
}

interface AddressPlaceDetails {
  formattedAddress: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  latitude?: number | null;
  longitude?: number | null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const toRecord = (value: unknown) => (value && typeof value === 'object' ? (value as Record<string, unknown>) : null);
const toStringValue = (value: unknown) => (typeof value === 'string' ? value : '');

const normalizeLookup = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const mergeInputWithCity = (input: string, cityHint: string) => {
  const trimmedInput = input.trim();
  const trimmedCity = cityHint.trim();
  if (!trimmedCity) {
    return trimmedInput;
  }

  if (normalizeLookup(trimmedInput).includes(normalizeLookup(trimmedCity))) {
    return trimmedInput;
  }

  return `${trimmedInput}, ${trimmedCity}`;
};

const fetchGoogleAutocomplete = async (input: string, sessionToken: string, cityHint: string) => {
  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!apiKey) {
    throw new Error('missing_google_maps_env');
  }

  const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text',
    },
    body: JSON.stringify({
      input: mergeInputWithCity(input, cityHint),
      includedRegionCodes: ['mx'],
      languageCode: 'es-MX',
      regionCode: 'mx',
      sessionToken,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`google_places_autocomplete_failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  const record = toRecord(payload);
  const suggestionsRaw = Array.isArray(record?.suggestions) ? record.suggestions : [];

  const suggestions: AddressSuggestion[] = suggestionsRaw
    .map((item) => {
      const suggestion = toRecord(item);
      const placePrediction = toRecord(suggestion?.placePrediction);
      const text = toRecord(placePrediction?.text);
      const structuredFormat = toRecord(placePrediction?.structuredFormat);
      const mainText = toRecord(structuredFormat?.mainText);
      const secondaryText = toRecord(structuredFormat?.secondaryText);

      const placeId = toStringValue(placePrediction?.placeId);
      const fullText = toStringValue(text?.text);

      if (!placeId || !fullText) {
        return null;
      }

      return {
        placeId,
        fullText,
        primaryText: toStringValue(mainText?.text) || fullText,
        secondaryText: toStringValue(secondaryText?.text),
      };
    })
    .filter((item): item is AddressSuggestion => Boolean(item))
    .slice(0, 5);

  return suggestions;
};

const pickComponent = (components: unknown[], preferredTypes: string[]) => {
  for (const componentValue of components) {
    const component = toRecord(componentValue);
    const types = Array.isArray(component?.types) ? component.types : [];
    const longText = toStringValue(component?.longText);

    if (!longText) {
      continue;
    }

    if (preferredTypes.some((type) => types.includes(type))) {
      return longText;
    }
  }

  return '';
};

const fetchGooglePlaceDetails = async (placeId: string, sessionToken: string) => {
  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!apiKey) {
    throw new Error('missing_google_maps_env');
  }

  const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'formattedAddress,addressComponents,location',
      'X-Goog-Session-Token': sessionToken,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`google_place_details_failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  const record = toRecord(payload);
  const components = Array.isArray(record?.addressComponents) ? record.addressComponents : [];
  const location = toRecord(record?.location);

  const details: AddressPlaceDetails = {
    formattedAddress: toStringValue(record?.formattedAddress),
    city:
      pickComponent(components, ['locality']) ||
      pickComponent(components, ['postal_town']) ||
      pickComponent(components, ['administrative_area_level_2']),
    state: pickComponent(components, ['administrative_area_level_1']),
    country: pickComponent(components, ['country']),
    postalCode: pickComponent(components, ['postal_code']),
    latitude: typeof location?.latitude === 'number' ? location.latitude : null,
    longitude: typeof location?.longitude === 'number' ? location.longitude : null,
  };

  return details;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const body = (await request.json().catch(() => null)) as SuggestionBody | null;
    const action = body?.action || 'suggest';

    if (action === 'suggest') {
      const input = toStringValue(body?.input).trim();
      const sessionToken = toStringValue(body?.sessionToken).trim();
      const cityHint = toStringValue(body?.cityHint).trim();

      if (input.length < 4) {
        return json({ suggestions: [] });
      }

      if (!sessionToken) {
        return json({ error: 'missing_session_token' }, 400);
      }

      const suggestions = await fetchGoogleAutocomplete(input, sessionToken, cityHint);
      return json({ suggestions });
    }

    if (action === 'details') {
      const placeId = toStringValue(body?.placeId).trim();
      const sessionToken = toStringValue(body?.sessionToken).trim();

      if (!placeId) {
        return json({ error: 'missing_place_id' }, 400);
      }

      const details = await fetchGooglePlaceDetails(placeId, sessionToken);
      return json({ details });
    }

    return json({ error: 'unsupported_action' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unexpected_address_autocomplete_error';
    return json({ error: message }, 500);
  }
});
