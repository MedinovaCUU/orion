interface MexicoStateGeo {
  label: string;
  lat: number;
  lng: number;
  mapX: number;
  mapY: number;
  spreadX?: number;
  spreadY?: number;
}

export interface EquipmentLocationInput {
  numeroSerie: string;
  pais?: string | null;
  estado?: string | null;
  ciudad?: string | null;
  municipio?: string | null;
  direccion?: string | null;
  geoLatitude?: number | null;
  geoLongitude?: number | null;
  geoBoundingBox?: unknown;
  geoPrecision?: string | null;
  geoLocationKey?: string | null;
}

export interface EquipmentMapPoint {
  x: number;
  y: number;
  normalizedState: string;
}

export interface EquipmentGeoPoint {
  latitude: number;
  longitude: number;
  normalizedState: string;
}

const MAP_BOUNDS = {
  north: 32.9,
  south: 14.2,
  west: -118.9,
  east: -86.2,
};

const MAP_PADDING = {
  left: 6.5,
  right: 10.6,
  top: 4.5,
  bottom: 8.2,
};

const GOLDEN_ANGLE = 2.399963229728653;

interface ProjectionControlPoint {
  lat: number;
  lng: number;
  dx: number;
  dy: number;
}

const MEXICO_STATE_GEO: Record<string, MexicoStateGeo> = {
  'aguascalientes': { label: 'Aguascalientes', lat: 21.8853, lng: -102.2916, mapX: 47.99, mapY: 61.35, spreadX: 0.7, spreadY: 0.55 },
  'baja california': { label: 'Baja California', lat: 30.8406, lng: -115.2838, mapX: 16.7, mapY: 13.18, spreadX: 1.25, spreadY: 0.95 },
  'baja california sur': { label: 'Baja California Sur', lat: 25.4674, lng: -111.9711, mapX: 22.22, mapY: 40.2, spreadX: 0.95, spreadY: 1.1 },
  'campeche': { label: 'Campeche', lat: 19.8301, lng: -90.5349, mapX: 80.18, mapY: 75.04, spreadX: 0.95, spreadY: 0.85 },
  'chiapas': { label: 'Chiapas', lat: 16.7569, lng: -93.1292, mapX: 77.08, mapY: 91.04, spreadX: 1.05, spreadY: 0.95 },
  'chihuahua': { label: 'Chihuahua', lat: 28.632, lng: -106.0691, mapX: 38.71, mapY: 24.69, spreadX: 1.45, spreadY: 1.15 },
  'ciudad de mexico': { label: 'Ciudad de México', lat: 19.4326, lng: -99.1332, mapX: 57.22, mapY: 76.09, spreadX: 0.65, spreadY: 0.55 },
  'coahuila': { label: 'Coahuila', lat: 27.0587, lng: -101.7068, mapX: 49.67, mapY: 33.79, spreadX: 1.25, spreadY: 0.95 },
  'colima': { label: 'Colima', lat: 19.2452, lng: -103.7241, mapX: 43.17, mapY: 76.96, spreadX: 0.7, spreadY: 0.6 },
  'durango': { label: 'Durango', lat: 24.0277, lng: -104.6532, mapX: 41.85, mapY: 47.1, spreadX: 1.1, spreadY: 0.95 },
  'estado de mexico': { label: 'Estado de México', lat: 19.285, lng: -99.6557, mapX: 56.13, mapY: 75.71, spreadX: 0.95, spreadY: 0.7 },
  'guanajuato': { label: 'Guanajuato', lat: 21.019, lng: -101.2574, mapX: 52.12, mapY: 67.42, spreadX: 1, spreadY: 0.7 },
  'guerrero': { label: 'Guerrero', lat: 17.4392, lng: -99.5451, mapX: 54.52, mapY: 85.22, spreadX: 1.05, spreadY: 0.85 },
  'hidalgo': { label: 'Hidalgo', lat: 20.0911, lng: -98.7624, mapX: 57.77, mapY: 69.41, spreadX: 0.9, spreadY: 0.7 },
  'jalisco': { label: 'Jalisco', lat: 20.6597, lng: -103.3496, mapX: 44.73, mapY: 67.2, spreadX: 1.1, spreadY: 0.85 },
  'michoacan': { label: 'Michoacán', lat: 19.7008, lng: -101.1844, mapX: 49.32, mapY: 76.74, spreadX: 1.15, spreadY: 0.95 },
  'morelos': { label: 'Morelos', lat: 18.9242, lng: -99.2216, mapX: 57.34, mapY: 78.99, spreadX: 0.7, spreadY: 0.6 },
  'nayarit': { label: 'Nayarit', lat: 21.7514, lng: -104.8455, mapX: 41.19, mapY: 61.68, spreadX: 0.9, spreadY: 0.75 },
  'nuevo leon': { label: 'Nuevo León', lat: 25.5922, lng: -99.9962, mapX: 55.09, mapY: 43.02, spreadX: 1.05, spreadY: 0.8 },
  'oaxaca': { label: 'Oaxaca', lat: 17.0732, lng: -96.7266, mapX: 65.7, mapY: 86.88, spreadX: 1.25, spreadY: 1.05 },
  'puebla': { label: 'Puebla', lat: 19.0414, lng: -98.2063, mapX: 60.59, mapY: 75.52, spreadX: 1, spreadY: 0.8 },
  'queretaro': { label: 'Querétaro', lat: 20.5888, lng: -100.3899, mapX: 55.18, mapY: 67.68, spreadX: 0.75, spreadY: 0.6 },
  'quintana roo': { label: 'Quintana Roo', lat: 19.1817, lng: -88.4791, mapX: 87.63, mapY: 71.26, spreadX: 0.95, spreadY: 1.2 },
  'san luis potosi': { label: 'San Luis Potosí', lat: 22.1565, lng: -100.9855, mapX: 53.76, mapY: 56.91, spreadX: 1.05, spreadY: 0.8 },
  'sinaloa': { label: 'Sinaloa', lat: 24.8091, lng: -107.394, mapX: 34.73, mapY: 46.12, spreadX: 1.1, spreadY: 0.95 },
  'sonora': { label: 'Sonora', lat: 29.0729, lng: -110.9559, mapX: 25.16, mapY: 19.34, spreadX: 1.45, spreadY: 1.05 },
  'tabasco': { label: 'Tabasco', lat: 17.9895, lng: -92.9475, mapX: 75.81, mapY: 81.51, spreadX: 0.9, spreadY: 0.75 },
  'tamaulipas': { label: 'Tamaulipas', lat: 24.2669, lng: -98.8363, mapX: 58.26, mapY: 45.93, spreadX: 1.15, spreadY: 0.95 },
  'tlaxcala': { label: 'Tlaxcala', lat: 19.3139, lng: -98.2404, mapX: 60.05, mapY: 75.1, spreadX: 0.6, spreadY: 0.5 },
  'veracruz': { label: 'Veracruz', lat: 19.1738, lng: -96.1342, mapX: 65.74, mapY: 72.82, spreadX: 1.3, spreadY: 1.1 },
  'yucatan': { label: 'Yucatán', lat: 20.9674, lng: -89.5926, mapX: 84.99, mapY: 66.21, spreadX: 0.95, spreadY: 0.75 },
  'zacatecas': { label: 'Zacatecas', lat: 22.7709, lng: -102.5832, mapX: 47.7, mapY: 55.37, spreadX: 1.05, spreadY: 0.75 },
};

const STATE_ALIASES: Record<string, string> = {
  'bc': 'baja california',
  'bcs': 'baja california sur',
  'cdmx': 'ciudad de mexico',
  'ciudad de mexico': 'ciudad de mexico',
  'coahuila de zaragoza': 'coahuila',
  'edomex': 'estado de mexico',
  'estado de mexico': 'estado de mexico',
  'jal': 'jalisco',
  'michoacan': 'michoacan',
  'monterrey': 'nuevo leon',
  'nuevo leon': 'nuevo leon',
  'q roo': 'quintana roo',
  'queretaro': 'queretaro',
  'quintana roo': 'quintana roo',
  'san luis potosi': 'san luis potosi',
  's l p': 'san luis potosi',
  'ver': 'veracruz',
  'veracruz de ignacio de la llave': 'veracruz',
  'yucatan': 'yucatan',
};

const PROJECTION_CONTROL_POINTS: ProjectionControlPoint[] = [
  { lat: 32.5149, lng: -117.0382, dx: 0, dy: 0 },
  { lat: 24.1426, lng: -110.3128, dx: 0, dy: 0 },
  { lat: 29.0729, lng: -110.9559, dx: 0, dy: 0 },
  { lat: 28.632, lng: -106.0691, dx: 0, dy: 0 },
  { lat: 25.6866, lng: -100.3161, dx: 0, dy: 0 },
  { lat: 20.6597, lng: -103.3496, dx: 0, dy: 0 },
  { lat: 19.4326, lng: -99.1332, dx: 0, dy: 0 },
  { lat: 16.7528, lng: -93.1167, dx: 0.8, dy: 0.5 },
  { lat: 19.1738, lng: -96.1342, dx: 2.3, dy: 1.1 },
  { lat: 17.9895, lng: -92.9475, dx: 1.2, dy: 0.6 },
  { lat: 19.8301, lng: -90.5349, dx: 2.1, dy: 2.2 },
  { lat: 20.9671, lng: -89.6237, dx: 5.1, dy: 2.8 },
  { lat: 20.6903, lng: -88.2017, dx: 4.8, dy: 3.1 },
  { lat: 21.1619, lng: -86.8515, dx: 4.3, dy: 2.9 },
  { lat: 18.5141, lng: -88.3038, dx: 3.8, dy: 2.5 },
];

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const hashString = (value: string) => {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
};

const parseBoundingBox = (value: unknown) => {
  if (!Array.isArray(value) || value.length < 4) {
    return null;
  }

  const [southRaw, northRaw, westRaw, eastRaw] = value;
  const south = Number.parseFloat(String(southRaw));
  const north = Number.parseFloat(String(northRaw));
  const west = Number.parseFloat(String(westRaw));
  const east = Number.parseFloat(String(eastRaw));

  if ([south, north, west, east].some((coordinate) => Number.isNaN(coordinate))) {
    return null;
  }

  return { south, north, west, east };
};

const detectStateKey = (rawValue?: string | null) => {
  const normalizedValue = normalizeText(rawValue || '');

  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue in MEXICO_STATE_GEO) {
    return normalizedValue;
  }

  if (normalizedValue in STATE_ALIASES) {
    return STATE_ALIASES[normalizedValue];
  }

  const aliasEntry = Object.entries(STATE_ALIASES).find(([alias]) => normalizedValue.includes(alias));
  if (aliasEntry) {
    return aliasEntry[1];
  }

  const stateEntry = Object.keys(MEXICO_STATE_GEO).find((stateKey) => normalizedValue.includes(stateKey));
  return stateEntry || null;
};

const projectLatLngToMapRaw = (lat: number, lng: number) => {
  const usableWidth = 100 - MAP_PADDING.left - MAP_PADDING.right;
  const usableHeight = 100 - MAP_PADDING.top - MAP_PADDING.bottom;
  const xRatio = (lng - MAP_BOUNDS.west) / (MAP_BOUNDS.east - MAP_BOUNDS.west);
  const yRatio = (MAP_BOUNDS.north - lat) / (MAP_BOUNDS.north - MAP_BOUNDS.south);

  return {
    x: MAP_PADDING.left + usableWidth * xRatio,
    y: MAP_PADDING.top + usableHeight * yRatio,
  };
};

const getProjectionCorrection = (lat: number, lng: number) => {
  const weighted = PROJECTION_CONTROL_POINTS.map((point) => {
    const distance = Math.sqrt(((lat - point.lat) / 4.8) ** 2 + ((lng - point.lng) / 5.8) ** 2);
    const weight = 1 / (distance ** 4 + 0.0001);

    return {
      weight,
      dx: point.dx,
      dy: point.dy,
    };
  });

  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    return { dx: 0, dy: 0 };
  }

  return weighted.reduce(
    (accumulator, entry) => {
      accumulator.dx += (entry.dx * entry.weight) / totalWeight;
      accumulator.dy += (entry.dy * entry.weight) / totalWeight;
      return accumulator;
    },
    { dx: 0, dy: 0 },
  );
};

const projectLatLngToMap = (lat: number, lng: number, stateKey?: string | null) => {
  const state = stateKey ? MEXICO_STATE_GEO[stateKey] : null;
  if (state) {
    const rawPoint = projectLatLngToMapRaw(lat, lng);
    const rawStateCenter = projectLatLngToMapRaw(state.lat, state.lng);

    return {
      x: state.mapX + rawPoint.x - rawStateCenter.x,
      y: state.mapY + rawPoint.y - rawStateCenter.y,
    };
  }

  const basePoint = projectLatLngToMapRaw(lat, lng);
  const correction = getProjectionCorrection(lat, lng);

  return {
    x: basePoint.x + correction.dx,
    y: basePoint.y + correction.dy,
  };
};

const buildClusterOffset = (
  seed: string,
  indexInCluster: number,
  spreadX: number,
  spreadY: number,
  baseRadius = 0.2,
) => {
  if (indexInCluster === 0) {
    return { x: 0, y: 0 };
  }

  const hash = hashString(seed);
  const slot = indexInCluster - 1;
  const angle = ((hash % 360) * Math.PI) / 180 + slot * GOLDEN_ANGLE;
  const radius = baseRadius + Math.sqrt(slot + 1) * 0.34 + ((hash >>> 8) % 17) * 0.018;

  return {
    x: Math.cos(angle) * radius * spreadX,
    y: Math.sin(angle) * radius * spreadY,
  };
};

const getPreciseSpread = (lat: number, lng: number, boundingBox: unknown) => {
  const bounds = parseBoundingBox(boundingBox);

  if (!bounds) {
    return { spreadX: 0.82, spreadY: 0.72 };
  }

  const northWest = projectLatLngToMap(bounds.north, bounds.west);
  const southEast = projectLatLngToMap(bounds.south, bounds.east);
  const projectedWidth = Math.abs(southEast.x - northWest.x);
  const projectedHeight = Math.abs(southEast.y - northWest.y);
  const latClamp = clamp(lat, MAP_BOUNDS.south, MAP_BOUNDS.north);
  const lngClamp = clamp(lng, MAP_BOUNDS.west, MAP_BOUNDS.east);
  const center = projectLatLngToMap(latClamp, lngClamp);
  const northPoint = projectLatLngToMap(bounds.north, lngClamp);
  const eastPoint = projectLatLngToMap(latClamp, bounds.east);
  const verticalReach = Math.abs(northPoint.y - center.y);
  const horizontalReach = Math.abs(eastPoint.x - center.x);

  return {
    spreadX: clamp(projectedWidth * 0.88 + horizontalReach * 0.7 + 0.38, 0.42, 1.28),
    spreadY: clamp(projectedHeight * 0.88 + verticalReach * 0.7 + 0.34, 0.4, 1.14),
  };
};

export const resolveEquipmentMapPoint = (
  equipment: EquipmentLocationInput,
  indexInCluster: number,
): EquipmentMapPoint | null => {
  const stateKey =
    detectStateKey(equipment.estado) ||
    detectStateKey(equipment.direccion) ||
    detectStateKey(equipment.municipio) ||
    detectStateKey(equipment.ciudad);
  const normalizedState = stateKey ? MEXICO_STATE_GEO[stateKey].label : null;

  if (
    typeof equipment.geoLatitude === 'number' &&
    Number.isFinite(equipment.geoLatitude) &&
    typeof equipment.geoLongitude === 'number' &&
    Number.isFinite(equipment.geoLongitude)
  ) {
    const basePoint = projectLatLngToMap(equipment.geoLatitude, equipment.geoLongitude, stateKey);
    const offset = buildClusterOffset(
      [
        equipment.geoLocationKey,
        equipment.numeroSerie,
        equipment.estado,
        equipment.ciudad,
        equipment.municipio,
        equipment.geoPrecision,
      ]
        .filter(Boolean)
        .join('|'),
      indexInCluster,
      getPreciseSpread(equipment.geoLatitude, equipment.geoLongitude, equipment.geoBoundingBox).spreadX,
      getPreciseSpread(equipment.geoLatitude, equipment.geoLongitude, equipment.geoBoundingBox).spreadY,
      0.38,
    );

    return {
      x: clamp(basePoint.x + offset.x, 3.4, 97.2),
      y: clamp(basePoint.y + offset.y, 4.1, 96.2),
      normalizedState: normalizedState || equipment.estado || 'Sin estado',
    };
  }

  if (!stateKey) {
    return null;
  }

  const state = MEXICO_STATE_GEO[stateKey];
  const basePoint = { x: state.mapX, y: state.mapY };
  const seed = [
    equipment.numeroSerie,
    equipment.estado,
    equipment.ciudad,
    equipment.municipio,
    equipment.direccion,
  ]
    .filter(Boolean)
    .join('|');
  const spreadX = state.spreadX ?? 1;
  const spreadY = state.spreadY ?? 0.9;
  const offset = buildClusterOffset(seed, indexInCluster, spreadX, spreadY, 0.58);

  return {
    x: clamp(basePoint.x + offset.x, 3.4, 97.2),
    y: clamp(basePoint.y + offset.y, 4.1, 96.2),
    normalizedState: state.label,
  };
};

export const resolveEquipmentGeoPoint = (equipment: EquipmentLocationInput): EquipmentGeoPoint | null => {
  const stateKey =
    detectStateKey(equipment.estado) ||
    detectStateKey(equipment.direccion) ||
    detectStateKey(equipment.municipio) ||
    detectStateKey(equipment.ciudad);
  const normalizedState = stateKey ? MEXICO_STATE_GEO[stateKey].label : null;

  if (
    typeof equipment.geoLatitude === 'number' &&
    Number.isFinite(equipment.geoLatitude) &&
    equipment.geoLatitude >= -90 &&
    equipment.geoLatitude <= 90 &&
    typeof equipment.geoLongitude === 'number' &&
    Number.isFinite(equipment.geoLongitude) &&
    equipment.geoLongitude >= -180 &&
    equipment.geoLongitude <= 180
  ) {
    return {
      latitude: equipment.geoLatitude,
      longitude: equipment.geoLongitude,
      normalizedState: normalizedState || equipment.estado || 'Sin estado',
    };
  }

  if (!stateKey) {
    return null;
  }

  const state = MEXICO_STATE_GEO[stateKey];
  return {
    latitude: state.lat,
    longitude: state.lng,
    normalizedState: state.label,
  };
};

export const getNormalizedStateLabel = (rawValue?: string | null) => {
  const stateKey = detectStateKey(rawValue);
  return stateKey ? MEXICO_STATE_GEO[stateKey].label : null;
};
