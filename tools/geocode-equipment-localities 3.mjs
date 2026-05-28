const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const REST_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

const LOCALITY_QUERY_OVERRIDES = {
  'acatalan de juarez|jalisco': 'Acatlán de Juárez, Jalisco, Mexico',
  'chapoton|campeche': 'Champotón, Campeche, Mexico',
  'paracho de veruzco|michoacan': 'Paracho de Verduzco, Michoacán, Mexico',
  'quechutenanago|guerrero': 'Quechultenango, Guerrero, Mexico',
  'queretrao|queretaro': 'Querétaro, Querétaro, Mexico',
  'salud g cepeda|coahuila': 'General Cepeda, Coahuila, Mexico',
  'san luis ayuca, jilotzingo|estado de mexico': 'San Luis Ayucan, Jilotzingo, Estado de México, Mexico',
  'tecomna|colima': 'Tecomán, Colima, Mexico',
  'tepexpan, mpio. acolman|estado de mexico': 'Tepexpan, Estado de México, Mexico',
  'uriagato|guanajuato': 'Uriangato, Guanajuato, Mexico',
  'villa hermosa|tabasco': 'Villahermosa, Tabasco, Mexico',
  'zapopa jalisco|jalisco': 'Zapopan, Jalisco, Mexico',
  'zapopann|jalisco': 'Zapopan, Jalisco, Mexico',
};

const normalizeLocationLabel = (value) => {
  const normalized = (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || null;
};

const buildLocalityQuery = (city, municipality, state) => {
  const locality = (city || municipality || '').trim();
  const stateLabel = (state || '').trim();

  if (!locality) {
    return null;
  }

  return stateLabel ? `${locality}, ${stateLabel}, Mexico` : `${locality}, Mexico`;
};

const buildCacheKey = (city, municipality, state) => {
  const locality = normalizeLocationLabel(city || municipality);
  const stateLabel = normalizeLocationLabel(state);

  if (!locality) {
    return null;
  }

  return stateLabel ? `${locality}|${stateLabel}` : locality;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchAllRows = async (path) => {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: REST_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`Supabase fetch failed for ${path}: ${response.status} ${await response.text()}`);
  }

  return response.json();
};

const upsertRows = async (path, rows) => {
  if (!rows.length) {
    return;
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      ...REST_HEADERS,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    throw new Error(`Supabase upsert failed for ${path}: ${response.status} ${await response.text()}`);
  }
};

const geocodeLocality = async (query) => {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'mx');
  url.searchParams.set('accept-language', 'es');

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Biosystems-Orion-Monitor/1.0 (equipment locality geocoder)',
      Referer: 'https://medinovacuu.github.io/orion/',
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim failed for ${query}: ${response.status}`);
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload[0] || null : null;
};

const run = async () => {
  const equipments = await fetchAllRows(
    "equipos?select=id,estado,ciudad,municipio&or=(ciudad.not.is.null,municipio.not.is.null)",
  );
  const existing = await fetchAllRows('equipment_location_geocodes?select=cache_key');
  const existingKeys = new Set(existing.map((row) => row.cache_key));
  const uniqueLocalities = new Map();

  equipments.forEach((equipment) => {
    const query = buildLocalityQuery(equipment.ciudad, equipment.municipio, equipment.estado);
    const cacheKey = buildCacheKey(equipment.ciudad, equipment.municipio, equipment.estado);

    if (!query || !cacheKey || uniqueLocalities.has(cacheKey)) {
      return;
    }

    uniqueLocalities.set(cacheKey, {
      cache_key: cacheKey,
      query: LOCALITY_QUERY_OVERRIDES[cacheKey] || query,
      precision: 'locality',
    });
  });

  const pending = [...uniqueLocalities.values()].filter((row) => !existingKeys.has(row.cache_key));
  const inserted = [];
  let failed = 0;

  console.log(`Localidades únicas detectadas: ${uniqueLocalities.size}`);
  console.log(`Localidades pendientes de geocodificar: ${pending.length}`);

  for (const [index, locality] of pending.entries()) {
    try {
      const result = await geocodeLocality(locality.query);
      if (!result?.lat || !result?.lon) {
        failed += 1;
        console.log(`[${index + 1}/${pending.length}] sin match: ${locality.query}`);
        await wait(1100);
        continue;
      }

      inserted.push({
        ...locality,
        latitude: Number.parseFloat(result.lat),
        longitude: Number.parseFloat(result.lon),
        boundingbox: Array.isArray(result.boundingbox) ? result.boundingbox : [],
        display_name: result.display_name || locality.query,
        provider: 'nominatim',
        updated_at: new Date().toISOString(),
      });

      console.log(`[${index + 1}/${pending.length}] ok: ${locality.query}`);

      if (inserted.length >= 25) {
        await upsertRows('equipment_location_geocodes', inserted.splice(0, inserted.length));
      }
    } catch (error) {
      failed += 1;
      console.log(
        `[${index + 1}/${pending.length}] error: ${locality.query} :: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await wait(1100);
  }

  if (inserted.length) {
    await upsertRows('equipment_location_geocodes', inserted);
  }

  const refreshed = await fetchAllRows('equipment_location_geocodes?select=cache_key');
  console.log(`Geocodes totales en cache: ${refreshed.length}`);
  console.log(`Localidades sin match o con error: ${failed}`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
