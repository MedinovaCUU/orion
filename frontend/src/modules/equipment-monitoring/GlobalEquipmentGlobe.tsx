import { Billboard, Html, Line, OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import worldAtlasRaw from 'world-atlas/countries-110m.json?raw';
import { getPublicAssetUrl } from '../../components/publicAssetUrl';

export type GlobeNodeTone = 'ok' | 'warning' | 'fatal' | 'muted' | 'supremo';

export interface GlobeEquipmentNode {
  id: string;
  serial: string;
  clientName: string;
  model: string;
  status: 'ok' | 'warning' | 'fatal';
  tone: GlobeNodeTone;
  heartbeat: boolean;
  country: string | null;
  city: string | null;
  municipality: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
}

interface GlobalEquipmentGlobeProps {
  equipments: GlobeEquipmentNode[];
  countryEquipments: GlobeEquipmentNode[];
  selectedEquipmentId: string | null;
  onSelectEquipment: (equipmentId: string | null) => void;
}

interface CityClusterData {
  id: string;
  city: string;
  municipality: string | null;
  state: string | null;
  country: string;
  latitude: number;
  longitude: number;
  count: number;
  tone: GlobeNodeTone;
  tones: GlobeNodeTone[];
  heartbeat: boolean;
  simulated: boolean;
  equipments: GlobeEquipmentNode[];
}

interface SimulatedCity {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  count: number;
  tone: GlobeNodeTone;
}

interface CountryView {
  key: string;
  label: string;
  cameraPosition: [number, number, number];
}

const GLOBE_RADIUS = 2;
const WORLD_POINT_RADIUS = GLOBE_RADIUS + 0.002;
const MEXICO_POINT_RADIUS = GLOBE_RADIUS + 0.003;
const COUNTRY_BORDER_RADIUS = GLOBE_RADIUS + 0.004;
const STATE_BORDER_RADIUS = GLOBE_RADIUS + 0.005;
const MUNICIPAL_BORDER_RADIUS = GLOBE_RADIUS + 0.006;
const CITY_MARKER_RADIUS = GLOBE_RADIUS + 0.007;
const EQUIPMENT_MARKER_RADIUS = GLOBE_RADIUS + 0.008;
const NETWORK_ANCHOR_RADIUS = GLOBE_RADIUS + 0.009;
const AUTOMATIC_EQUIPMENT_DISTANCE = 2.085;
const CITY_FOCUS_DISTANCE = 2.075;
const FOCUS_COLLAPSE_DISTANCE = 4.15;
const MIN_CAMERA_DISTANCE = 2.018;
const STATE_VIEW_DISTANCE = 6.45;
const MUNICIPAL_VIEW_DISTANCE = 2.72;
const MEXICO_CAMERA_POSITION: [number, number, number] = [-0.521, 1.051, 2.285];
const EQUIPMENT_NODE_RADIUS_PIXELS = {
  near: 9.4,
  far: 6.6,
  selectedBoost: 1.6,
  hit: 28,
  selectedHit: 32,
};
const CITY_NODE_RADIUS_PIXELS = {
  near: 8.2,
  baseFar: 6,
  countBoost: 3.2,
  hit: 24,
};
const STATUS_TONE_ORDER: GlobeNodeTone[] = ['fatal', 'warning', 'ok', 'supremo', 'muted'];

const TONE_COLORS: Record<GlobeNodeTone, string> = {
  fatal: '#ff667c',
  warning: '#ffca68',
  ok: '#38d8bd',
  supremo: '#63a9ff',
  muted: '#9eb4c4',
};

const HEARTBEAT_TIME_UNIFORM = { value: 0 };
const SELECTED_BILLBOARD_PROJECTED = new THREE.Vector3();

const HEARTBEAT_PULSE_VERTEX_SHADER = `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uPhaseOffset;
  uniform float uMinScale;
  uniform float uMaxScale;
  varying float vWave;
  varying float vShimmer;

  float hash(vec3 value) {
    return fract(sin(dot(value, vec3(12.9898, 78.233, 37.719))) * 43758.5453123);
  }

  void main() {
    float phase = fract(hash(modelMatrix[3].xyz) + uPhaseOffset);
    float wave = fract(uTime * uSpeed + phase);
    float easedWave = smoothstep(0.0, 1.0, wave);
    float scale = mix(uMinScale, uMaxScale, easedWave);
    vec3 transformed = position * scale;

    vWave = wave;
    vShimmer = 0.82 + sin((uTime * 1.8 + phase * 6.28318)) * 0.18;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const HEARTBEAT_PULSE_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vWave;
  varying float vShimmer;

  void main() {
    float fade = pow(1.0 - vWave, 1.35);
    float ignition = smoothstep(0.0, 0.14, vWave);
    float alpha = uOpacity * fade * ignition * vShimmer;
    if (alpha < 0.015) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

const TONE_LABELS: Record<GlobeNodeTone, string> = {
  fatal: 'Error fatal',
  warning: 'Warning activo',
  ok: 'Monitoreo en línea',
  supremo: 'Supremo disponible',
  muted: 'Sin señal',
};

const SIMULATED_CITIES: SimulatedCity[] = [
  { city: 'Barcelona', country: 'Espana', latitude: 41.3874, longitude: 2.1686, count: 42, tone: 'ok' },
  { city: 'Madrid', country: 'Espana', latitude: 40.4168, longitude: -3.7038, count: 31, tone: 'ok' },
  { city: 'Berlin', country: 'Alemania', latitude: 52.52, longitude: 13.405, count: 38, tone: 'supremo' },
  { city: 'Paris', country: 'Francia', latitude: 48.8566, longitude: 2.3522, count: 47, tone: 'ok' },
  { city: 'Londres', country: 'Reino Unido', latitude: 51.5072, longitude: -0.1276, count: 51, tone: 'warning' },
  { city: 'Milan', country: 'Italia', latitude: 45.4642, longitude: 9.19, count: 29, tone: 'ok' },
  { city: 'Estambul', country: 'Turquia', latitude: 41.0082, longitude: 28.9784, count: 35, tone: 'ok' },
  { city: 'Dubai', country: 'Emiratos Arabes', latitude: 25.2048, longitude: 55.2708, count: 24, tone: 'supremo' },
  { city: 'Johannesburgo', country: 'Sudafrica', latitude: -26.2041, longitude: 28.0473, count: 18, tone: 'ok' },
  { city: 'El Cairo', country: 'Egipto', latitude: 30.0444, longitude: 31.2357, count: 16, tone: 'muted' },
  { city: 'Nairobi', country: 'Kenia', latitude: -1.2921, longitude: 36.8219, count: 12, tone: 'ok' },
  { city: 'Mumbai', country: 'India', latitude: 19.076, longitude: 72.8777, count: 45, tone: 'warning' },
  { city: 'Nueva Delhi', country: 'India', latitude: 28.6139, longitude: 77.209, count: 37, tone: 'ok' },
  { city: 'Singapur', country: 'Singapur', latitude: 1.3521, longitude: 103.8198, count: 33, tone: 'ok' },
  { city: 'Bangkok', country: 'Tailandia', latitude: 13.7563, longitude: 100.5018, count: 22, tone: 'supremo' },
  { city: 'Shanghai', country: 'China', latitude: 31.2304, longitude: 121.4737, count: 58, tone: 'ok' },
  { city: 'Pekin', country: 'China', latitude: 39.9042, longitude: 116.4074, count: 41, tone: 'muted' },
  { city: 'Seul', country: 'Corea del Sur', latitude: 37.5665, longitude: 126.978, count: 36, tone: 'ok' },
  { city: 'Tokio', country: 'Japon', latitude: 35.6762, longitude: 139.6503, count: 63, tone: 'ok' },
  { city: 'Sidney', country: 'Australia', latitude: -33.8688, longitude: 151.2093, count: 27, tone: 'warning' },
  { city: 'Melbourne', country: 'Australia', latitude: -37.8136, longitude: 144.9631, count: 21, tone: 'ok' },
  { city: 'Auckland', country: 'Nueva Zelanda', latitude: -36.8509, longitude: 174.7645, count: 13, tone: 'supremo' },
  { city: 'Vancouver', country: 'Canada', latitude: 49.2827, longitude: -123.1207, count: 26, tone: 'ok' },
  { city: 'Toronto', country: 'Canada', latitude: 43.6532, longitude: -79.3832, count: 34, tone: 'ok' },
  { city: 'Nueva York', country: 'Estados Unidos', latitude: 40.7128, longitude: -74.006, count: 69, tone: 'warning' },
  { city: 'Chicago', country: 'Estados Unidos', latitude: 41.8781, longitude: -87.6298, count: 39, tone: 'ok' },
  { city: 'Miami', country: 'Estados Unidos', latitude: 25.7617, longitude: -80.1918, count: 28, tone: 'supremo' },
  { city: 'Los Angeles', country: 'Estados Unidos', latitude: 34.0522, longitude: -118.2437, count: 52, tone: 'ok' },
  { city: 'Bogota', country: 'Colombia', latitude: 4.711, longitude: -74.0721, count: 25, tone: 'ok' },
  { city: 'Lima', country: 'Peru', latitude: -12.0464, longitude: -77.0428, count: 20, tone: 'muted' },
  { city: 'Santiago', country: 'Chile', latitude: -33.4489, longitude: -70.6693, count: 23, tone: 'ok' },
  { city: 'Buenos Aires', country: 'Argentina', latitude: -34.6037, longitude: -58.3816, count: 32, tone: 'supremo' },
  { city: 'Sao Paulo', country: 'Brasil', latitude: -23.5505, longitude: -46.6333, count: 54, tone: 'warning' },
];
const SIMULATED_MODELS = ['BA400', 'BA200', 'A25', 'BTS-350'] as const;

interface CountryProperties {
  name?: string;
}

interface AdministrativeProperties {
  cve_ent?: string;
  cve_mun?: string;
  nomgeo?: string;
}

interface AdministrativeTopologyObjects {
  [key: string]: GeometryCollection<AdministrativeProperties>;
}

type AdministrativeTopology = Topology<AdministrativeTopologyObjects>;
type AdministrativeFeatures = FeatureCollection<Polygon | MultiPolygon, AdministrativeProperties>;

interface WorldAtlasObjects {
  [key: string]: GeometryCollection<CountryProperties>;
  countries: GeometryCollection<CountryProperties>;
  land: GeometryCollection<CountryProperties>;
}

const WORLD_TOPOLOGY = JSON.parse(worldAtlasRaw) as Topology<WorldAtlasObjects>;
const WORLD_COUNTRIES = WORLD_TOPOLOGY.objects.countries;
const COUNTRY_FEATURES = feature<CountryProperties>(WORLD_TOPOLOGY, WORLD_COUNTRIES) as unknown as FeatureCollection<
  Polygon | MultiPolygon,
  CountryProperties
>;
const WORLD_BORDER_LINES = mesh(WORLD_TOPOLOGY, WORLD_COUNTRIES).coordinates;
const MEXICO_FEATURE = COUNTRY_FEATURES.features.find((country) => String(country.id) === '484');
const countryFeatureCache = new Map<string, Feature<Polygon | MultiPolygon, CountryProperties> | null>();

const normalizeGroupKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

const latLngToVector = (latitude: number, longitude: number, radius = GLOBE_RADIUS) => {
  const phi = THREE.MathUtils.degToRad(90 - latitude);
  const theta = THREE.MathUtils.degToRad(longitude + 180);

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
};

const getWorldUnitsPerPixel = (camera: THREE.Camera, position: THREE.Vector3, viewportHeight: number) => {
  if (!(camera instanceof THREE.PerspectiveCamera)) {
    return 0.001;
  }

  const distance = Math.max(camera.position.distanceTo(position), 0.0001);
  const visibleHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return visibleHeight / Math.max(viewportHeight, 1);
};

const calculateSelectedBillboardPosition = (
  object: THREE.Object3D,
  camera: THREE.Camera,
  size: { width: number; height: number },
): [number, number] => {
  const projected = SELECTED_BILLBOARD_PROJECTED.setFromMatrixPosition(object.matrixWorld).project(camera);
  const nodeX = projected.x * (size.width / 2) + size.width / 2;
  const nodeY = -projected.y * (size.height / 2) + size.height / 2;
  const placeLeft = nodeX > size.width * 0.68;
  const placeBelow = nodeY < size.height * 0.18;
  const billboardX = nodeX + (placeLeft ? -118 : 118);
  const billboardY = nodeY + (placeBelow ? 58 : -58);

  return [
    THREE.MathUtils.clamp(billboardX, 104, Math.max(size.width - 104, 104)),
    THREE.MathUtils.clamp(billboardY, 44, Math.max(size.height - 44, 44)),
  ];
};

const pointInRing = (longitude: number, latitude: number, ring: Position[]) => {
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [currentLongitude, currentLatitude] = ring[index];
    const [previousLongitude, previousLatitude] = ring[previous];
    const intersects =
      currentLatitude > latitude !== previousLatitude > latitude &&
      longitude <
        ((previousLongitude - currentLongitude) * (latitude - currentLatitude)) /
          (previousLatitude - currentLatitude || Number.EPSILON) +
          currentLongitude;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

const pointInPolygon = (longitude: number, latitude: number, polygon: Position[][]) =>
  Boolean(polygon[0]?.length) &&
  pointInRing(longitude, latitude, polygon[0]) &&
  !polygon.slice(1).some((hole) => pointInRing(longitude, latitude, hole));

const getFeaturePolygons = <Properties,>(geography: Feature<Polygon | MultiPolygon, Properties>) =>
  geography.geometry.type === 'Polygon' ? [geography.geometry.coordinates] : geography.geometry.coordinates;

const isPointInMexico = (longitude: number, latitude: number) =>
  Boolean(
    MEXICO_FEATURE &&
      getFeaturePolygons(MEXICO_FEATURE).some((polygon) => pointInPolygon(longitude, latitude, polygon)),
  );

const getCountryFeatureAtPoint = (longitude: number, latitude: number) => {
  const cacheKey = `${longitude.toFixed(4)}:${latitude.toFixed(4)}`;
  if (countryFeatureCache.has(cacheKey)) {
    return countryFeatureCache.get(cacheKey) || null;
  }

  const countryFeature = COUNTRY_FEATURES.features.find((country) =>
    getFeaturePolygons(country).some((polygon) => pointInPolygon(longitude, latitude, polygon)),
  ) || null;
  countryFeatureCache.set(cacheKey, countryFeature);
  return countryFeature;
};

const getCountryView = (equipments: GlobeEquipmentNode[]): CountryView => {
  const countryGroups = new Map<
    string,
    { feature: Feature<Polygon | MultiPolygon, CountryProperties>; equipments: GlobeEquipmentNode[] }
  >();

  equipments.forEach((equipment) => {
    const countryFeature = getCountryFeatureAtPoint(equipment.longitude, equipment.latitude);
    if (!countryFeature) {
      return;
    }

    const key = String(countryFeature.id ?? countryFeature.properties?.name ?? equipment.country ?? 'country');
    const group = countryGroups.get(key) || { feature: countryFeature, equipments: [] };
    group.equipments.push(equipment);
    countryGroups.set(key, group);
  });

  const defaultGroup = [...countryGroups.entries()].sort(
    (left, right) => right[1].equipments.length - left[1].equipments.length,
  )[0];
  if (!defaultGroup) {
    return {
      key: String(MEXICO_FEATURE?.id || 'mexico'),
      label: 'México',
      cameraPosition: MEXICO_CAMERA_POSITION,
    };
  }

  const [key, group] = defaultGroup;
  if (key === String(MEXICO_FEATURE?.id)) {
    return {
      key,
      label: group.equipments.find((equipment) => equipment.country)?.country || 'México',
      cameraPosition: MEXICO_CAMERA_POSITION,
    };
  }

  const countryPolygons = getFeaturePolygons(group.feature);
  const primaryPolygon = countryPolygons
    .map((polygon) => ({
      polygon,
      equipmentCount: group.equipments.filter((equipment) =>
        pointInPolygon(equipment.longitude, equipment.latitude, polygon),
      ).length,
    }))
    .sort(
      (left, right) =>
        right.equipmentCount - left.equipmentCount || right.polygon[0].length - left.polygon[0].length,
    )[0]?.polygon;
  const boundaryVectors = (primaryPolygon?.[0] || []).map(([longitude, latitude]) =>
    latLngToVector(latitude, longitude, 1),
  );
  const centerDirection = boundaryVectors.length
    ? boundaryVectors.reduce((center, point) => center.add(point), new THREE.Vector3()).normalize()
    : latLngToVector(group.equipments[0].latitude, group.equipments[0].longitude, 1).normalize();
  const angularRadius = boundaryVectors.reduce(
    (largestAngle, point) => Math.max(largestAngle, Math.acos(THREE.MathUtils.clamp(centerDirection.dot(point), -1, 1))),
    0,
  );
  const targetHalfAngle = THREE.MathUtils.degToRad(17.5);
  const cameraDistance = THREE.MathUtils.clamp(
    GLOBE_RADIUS * Math.cos(angularRadius) +
      (GLOBE_RADIUS * Math.sin(angularRadius)) / Math.tan(targetHalfAngle),
    2.85,
    7.8,
  );
  const countryLabel =
    group.equipments.find((equipment) => equipment.country)?.country ||
    group.feature.properties?.name ||
    'País';
  const cameraPosition = centerDirection.multiplyScalar(cameraDistance);

  return {
    key,
    label: countryLabel,
    cameraPosition: [cameraPosition.x, cameraPosition.y, cameraPosition.z],
  };
};

const getRingBounds = (ring: Position[]) =>
  ring.reduce(
    (bounds, [longitude, latitude]) => ({
      minLongitude: Math.min(bounds.minLongitude, longitude),
      maxLongitude: Math.max(bounds.maxLongitude, longitude),
      minLatitude: Math.min(bounds.minLatitude, latitude),
      maxLatitude: Math.max(bounds.maxLatitude, latitude),
    }),
    {
      minLongitude: 180,
      maxLongitude: -180,
      minLatitude: 90,
      maxLatitude: -90,
    },
  );

const createBorderGeometry = (lines: Position[][], radius: number) => {
  const positions: number[] = [];

  lines.forEach((line) => {
    for (let index = 1; index < line.length; index += 1) {
      const [previousLongitude, previousLatitude] = line[index - 1];
      const [longitude, latitude] = line[index];
      if (Math.abs(longitude - previousLongitude) > 180) {
        continue;
      }

      const start = latLngToVector(previousLatitude, previousLongitude, radius);
      const end = latLngToVector(latitude, longitude, radius);
      positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
};

const getAdministrativeObject = (topology: AdministrativeTopology) => Object.values(topology.objects)[0];

const createAdministrativeBorderGeometry = (topology: AdministrativeTopology, radius: number) => {
  const administrativeObject = getAdministrativeObject(topology);
  const internalBorders = mesh(topology, administrativeObject, (left, right) => left !== right).coordinates;
  return createBorderGeometry(internalBorders, radius);
};

const getAdministrativeFeatures = (topology: AdministrativeTopology) =>
  feature<AdministrativeProperties>(topology, getAdministrativeObject(topology)) as unknown as FeatureCollection<
    Polygon | MultiPolygon,
    AdministrativeProperties
  >;

const getStatusTones = (equipments: GlobeEquipmentNode[]) => {
  const presentStatuses = new Set<GlobeNodeTone>(equipments.map((equipment) => equipment.tone));
  return STATUS_TONE_ORDER.filter((tone) => presentStatuses.has(tone));
};

const buildCityClusters = (equipments: GlobeEquipmentNode[]): CityClusterData[] => {
  const groups = new Map<string, GlobeEquipmentNode[]>();

  equipments.forEach((equipment) => {
    const locality = equipment.municipality || equipment.city;
    const country = equipment.country || 'Mexico';
    const key = locality
      ? `${normalizeGroupKey(country)}:${normalizeGroupKey(equipment.state || 'sin-estado')}:${normalizeGroupKey(locality)}`
      : `${normalizeGroupKey(country)}:${equipment.latitude.toFixed(3)}:${equipment.longitude.toFixed(3)}`;
    const current = groups.get(key) || [];
    current.push(equipment);
    groups.set(key, current);
  });

  return Array.from(groups.entries()).map(([key, cityEquipments]) => {
    const anchor = cityEquipments[0];
    const latitude = cityEquipments.reduce((sum, equipment) => sum + equipment.latitude, 0) / cityEquipments.length;
    const longitude = cityEquipments.reduce((sum, equipment) => sum + equipment.longitude, 0) / cityEquipments.length;
    const localityNames = new Set(
      cityEquipments.map((equipment) => equipment.municipality || equipment.city || equipment.state).filter(Boolean),
    );
    const tones = getStatusTones(cityEquipments);

    return {
      id: `real-${key}`,
      city:
        localityNames.size === 1
      ? anchor.municipality || anchor.city || anchor.state || 'México'
          : anchor.state || 'Ubicacion agrupada',
      municipality: anchor.municipality || null,
      state: anchor.state || null,
      country: anchor.country || 'Mexico',
      latitude,
      longitude,
      count: cityEquipments.length,
      tone: tones[0] || 'ok',
      tones: tones.length ? tones : ['ok'],
      heartbeat: cityEquipments.some((equipment) => equipment.heartbeat),
      simulated: false,
      equipments: cityEquipments,
    };
  });
};

const buildSimulatedClusters = (realEquipments: GlobeEquipmentNode[]): CityClusterData[] => {
  const realCountryIds = new Set(
    realEquipments
      .map((equipment) => getCountryFeatureAtPoint(equipment.longitude, equipment.latitude)?.id)
      .filter((countryId): countryId is string | number => countryId !== undefined),
  );

  return SIMULATED_CITIES.filter((city) => {
    const countryId = getCountryFeatureAtPoint(city.longitude, city.latitude)?.id;
    return countryId === undefined || !realCountryIds.has(countryId);
  }).map((city) => {
    const clusterKey = normalizeGroupKey(`${city.country}-${city.city}`);
    const equipments = Array.from({ length: Math.min(city.count, 24) }, (_, index): GlobeEquipmentNode => ({
      id: `simulated-equipment-${clusterKey}-${index}`,
      serial: `SIM-${clusterKey.replaceAll('-', '').slice(0, 8).toUpperCase()}-${String(index + 1).padStart(3, '0')}`,
      clientName: `Cobertura simulada · ${city.city}`,
      model: SIMULATED_MODELS[index % SIMULATED_MODELS.length],
      status: city.tone === 'warning' && index === 0 ? 'warning' : 'ok',
      tone: index === 0 ? city.tone : index % 5 === 0 ? 'supremo' : 'ok',
      heartbeat: false,
      country: city.country,
      city: city.city,
      municipality: city.city,
      state: null,
      latitude: city.latitude,
      longitude: city.longitude,
    }));

    return {
      id: `demo-${clusterKey}`,
      city: city.city,
      municipality: city.city,
      state: null,
      country: city.country,
      latitude: city.latitude,
      longitude: city.longitude,
      count: city.count,
      tone: city.tone,
      tones: city.tone === 'warning' ? ['ok', 'warning'] : [city.tone],
      heartbeat: false,
      simulated: true,
      equipments,
    };
  });
};

function WorldGeography() {
  const { worldPoints, mexicoPoints, worldBorders } = useMemo(() => {
    const worldPositions: number[] = [];
    const mexicoPositions: number[] = [];

    COUNTRY_FEATURES.features.forEach((country) => {
      if (country.properties?.name === 'Antarctica') {
        return;
      }

      const isMexico = String(country.id) === '484';
      getFeaturePolygons(country).forEach((polygon) => {
        const outerRing = polygon[0];
        if (!outerRing?.length) {
          return;
        }

        const bounds = getRingBounds(outerRing);
        const latitudeStep = isMexico ? 0.62 : 1.7;
        for (let latitude = Math.ceil(bounds.minLatitude / latitudeStep) * latitudeStep; latitude <= bounds.maxLatitude; latitude += latitudeStep) {
          const longitudeStep = latitudeStep / Math.max(Math.cos(THREE.MathUtils.degToRad(latitude)), 0.38);
          for (let longitude = Math.ceil(bounds.minLongitude / longitudeStep) * longitudeStep; longitude <= bounds.maxLongitude; longitude += longitudeStep) {
            if (!pointInPolygon(longitude, latitude, polygon)) {
              continue;
            }

            const point = latLngToVector(
              latitude,
              longitude,
              isMexico ? MEXICO_POINT_RADIUS : WORLD_POINT_RADIUS,
            );
            const target = isMexico ? mexicoPositions : worldPositions;
            target.push(point.x, point.y, point.z);
          }
        }
      });
    });

    const createPointGeometry = (positions: number[]) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      return geometry;
    };

    return {
      worldPoints: createPointGeometry(worldPositions),
      mexicoPoints: createPointGeometry(mexicoPositions),
      worldBorders: createBorderGeometry(WORLD_BORDER_LINES, COUNTRY_BORDER_RADIUS),
    };
  }, []);

  useEffect(
    () => () => {
      worldPoints.dispose();
      mexicoPoints.dispose();
      worldBorders.dispose();
    },
    [mexicoPoints, worldBorders, worldPoints],
  );

  return (
    <>
      <GlobePointCloud geometry={worldPoints} color="#75b9c3" pixelSize={2.4} opacity={0.78} />
      <GlobePointCloud geometry={mexicoPoints} color="#38e2c5" pixelSize={3.8} opacity={1} />
      <lineSegments geometry={worldBorders} renderOrder={4}>
        <lineBasicMaterial color="#a1e4e8" transparent opacity={0.82} depthWrite={false} toneMapped={false} />
      </lineSegments>
    </>
  );
}

async function loadAdministrativeTopology(path: string, signal: AbortSignal) {
  const response = await fetch(getPublicAssetUrl(path), { signal });
  if (!response.ok) {
    throw new Error(`No fue posible cargar la geografía administrativa: ${response.status}`);
  }

  return (await response.json()) as AdministrativeTopology;
}

function MexicoAdministrativeGeography({
  focusedCluster,
  onMunicipalityFeaturesChange,
}: {
  focusedCluster: CityClusterData | null;
  onMunicipalityFeaturesChange: (features: AdministrativeFeatures | null) => void;
}) {
  const { camera } = useThree();
  const stateLayerRef = useRef<THREE.LineSegments | null>(null);
  const municipalLayerRef = useRef<THREE.LineSegments | null>(null);
  const municipalityLayerCacheRef = useRef(
    new Map<string, { geometry: THREE.BufferGeometry; features: AdministrativeFeatures }>(),
  );
  const [stateGeometry, setStateGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [stateFeatures, setStateFeatures] = useState<AdministrativeFeatures | null>(null);
  const [municipalityLayer, setMunicipalityLayer] = useState<{
    stateCode: string;
    geometry: THREE.BufferGeometry;
    features: AdministrativeFeatures;
  } | null>(null);

  const focusedStateCode = useMemo(() => {
    if (!focusedCluster || focusedCluster.simulated || !stateFeatures) {
      return null;
    }

    const stateFeature = stateFeatures.features.find((state) =>
      getFeaturePolygons(state).some((polygon) =>
        pointInPolygon(focusedCluster.longitude, focusedCluster.latitude, polygon),
      ),
    );

    return stateFeature?.properties?.cve_ent || null;
  }, [focusedCluster, stateFeatures]);

  useEffect(() => {
    const controller = new AbortController();

    loadAdministrativeTopology('geography/mexico/states.json', controller.signal)
      .then((topology) => {
        setStateGeometry(createAdministrativeBorderGeometry(topology, STATE_BORDER_RADIUS));
        setStateFeatures(getAdministrativeFeatures(topology));
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.warn('No fue posible mostrar las divisiones estatales.', error);
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => () => stateGeometry?.dispose(), [stateGeometry]);

  useEffect(() => {
    if (!focusedStateCode) {
      return;
    }

    const cachedLayer = municipalityLayerCacheRef.current.get(focusedStateCode);
    if (cachedLayer) {
      let active = true;
      queueMicrotask(() => {
        if (active) {
          setMunicipalityLayer({ stateCode: focusedStateCode, ...cachedLayer });
        }
      });
      return () => {
        active = false;
      };
    }

    const controller = new AbortController();
    loadAdministrativeTopology(
      `geography/mexico/municipalities/${focusedStateCode}.json`,
      controller.signal,
    )
      .then((topology) => {
        const geometry = createAdministrativeBorderGeometry(topology, MUNICIPAL_BORDER_RADIUS);
        const features = getAdministrativeFeatures(topology);
        municipalityLayerCacheRef.current.set(focusedStateCode, { geometry, features });
        setMunicipalityLayer({ stateCode: focusedStateCode, geometry, features });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.warn(`No fue posible mostrar los municipios del estado ${focusedStateCode}.`, error);
        }
      });

    return () => controller.abort();
  }, [focusedStateCode]);

  useEffect(() => {
    onMunicipalityFeaturesChange(
      municipalityLayer?.stateCode === focusedStateCode ? municipalityLayer.features : null,
    );
  }, [focusedStateCode, municipalityLayer, onMunicipalityFeaturesChange]);

  useEffect(
    () => () => {
      municipalityLayerCacheRef.current.forEach(({ geometry }) => geometry.dispose());
      municipalityLayerCacheRef.current.clear();
    },
    [],
  );

  useFrame(() => {
    const cameraDistance = camera.position.length();
    if (stateLayerRef.current) {
      stateLayerRef.current.visible = cameraDistance <= STATE_VIEW_DISTANCE;
    }
    if (municipalLayerRef.current) {
      municipalLayerRef.current.visible = Boolean(
        focusedStateCode && cameraDistance <= MUNICIPAL_VIEW_DISTANCE,
      );
    }
  });

  return (
    <>
      {stateGeometry ? (
        <lineSegments ref={stateLayerRef} geometry={stateGeometry} renderOrder={6}>
          <lineBasicMaterial
            color="#55c8cf"
            transparent
            opacity={0.72}
            depthWrite={false}
            toneMapped={false}
          />
        </lineSegments>
      ) : null}
      {municipalityLayer?.stateCode === focusedStateCode ? (
        <lineSegments ref={municipalLayerRef} geometry={municipalityLayer.geometry} renderOrder={7}>
          <lineBasicMaterial
            color="#b4f3ea"
            transparent
            opacity={0.62}
            depthWrite={false}
            toneMapped={false}
          />
        </lineSegments>
      ) : null}
    </>
  );
}

function GlobePointCloud({
  geometry,
  color,
  pixelSize,
  opacity,
}: {
  geometry: THREE.BufferGeometry;
  color: string;
  pixelSize: number;
  opacity: number;
}) {
  return (
    <points geometry={geometry} renderOrder={2}>
      <shaderMaterial
        transparent
        depthWrite={false}
        toneMapped={false}
        uniforms={{
          uColor: { value: new THREE.Color(color) },
          uOpacity: { value: opacity },
          uPixelSize: { value: pixelSize },
        }}
        vertexShader={`
          uniform float uPixelSize;
          void main() {
            gl_PointSize = uPixelSize;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform vec3 uColor;
          uniform float uOpacity;
          void main() {
            float distanceFromCenter = length(gl_PointCoord - vec2(0.5));
            float alpha = smoothstep(0.5, 0.34, distanceFromCenter) * uOpacity;
            if (alpha < 0.02) discard;
            gl_FragColor = vec4(uColor, alpha);
          }
        `}
      />
    </points>
  );
}

function Atmosphere() {
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.elapsedTime;
    }
  });

  return (
    <mesh scale={1.006}>
      <sphereGeometry args={[GLOBE_RADIUS, 96, 96]} />
      <shaderMaterial
        ref={materialRef}
        transparent
        side={THREE.BackSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{ uTime: { value: 0 } }}
        vertexShader={`
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vNormal = normalize(mat3(modelMatrix) * normal);
            vView = normalize(cameraPosition - worldPosition.xyz);
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
          }
        `}
        fragmentShader={`
          uniform float uTime;
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.1);
            float pulse = 0.82 + sin(uTime * 0.7) * 0.08;
            gl_FragColor = vec4(0.12, 0.78, 0.73, rim * 0.42 * pulse);
          }
        `}
      />
    </mesh>
  );
}

function HeartbeatClock() {
  useFrame(({ clock }) => {
    HEARTBEAT_TIME_UNIFORM.value = clock.elapsedTime;
  });

  return null;
}

function HeartbeatPulse({
  innerRadius,
  outerRadius,
  opacity,
  speed,
  phaseOffset,
  minScale,
  maxScale,
}: {
  innerRadius: number;
  outerRadius: number;
  opacity: number;
  speed: number;
  phaseOffset: number;
  minScale: number;
  maxScale: number;
}) {
  const uniforms = useMemo(
    () => ({
      uTime: HEARTBEAT_TIME_UNIFORM,
      uColor: { value: new THREE.Color(TONE_COLORS.ok) },
      uOpacity: { value: opacity },
      uSpeed: { value: speed },
      uPhaseOffset: { value: phaseOffset },
      uMinScale: { value: minScale },
      uMaxScale: { value: maxScale },
    }),
    [maxScale, minScale, opacity, phaseOffset, speed],
  );

  return (
    <mesh renderOrder={12}>
      <ringGeometry args={[innerRadius, outerRadius, 44]} />
      <shaderMaterial
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        uniforms={uniforms}
        vertexShader={HEARTBEAT_PULSE_VERTEX_SHADER}
        fragmentShader={HEARTBEAT_PULSE_FRAGMENT_SHADER}
      />
    </mesh>
  );
}

function EquipmentPulseNode({
  equipment,
  position,
  selected,
  onHoverChange,
  onSelect,
}: {
  equipment: GlobeEquipmentNode | null;
  position: THREE.Vector3;
  selected: boolean;
  onHoverChange: (hovered: boolean) => void;
  onSelect: () => void;
}) {
  const visualRef = useRef<THREE.Group | null>(null);
  const hitTargetRef = useRef<THREE.Mesh | null>(null);
  const tone = equipment?.tone || 'muted';

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = equipment ? 'pointer' : '';
    onHoverChange(true);
  };

  const handlePointerOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = '';
    onHoverChange(false);
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect();
  };

  useFrame(({ camera, size }) => {
    if (!visualRef.current || !hitTargetRef.current) {
      return;
    }

    const worldUnitsPerPixel = getWorldUnitsPerPixel(camera, position, size.height);
    const altitudeFactor = THREE.MathUtils.clamp(
      (camera.position.length() - MIN_CAMERA_DISTANCE) / 1.3,
      0,
      1,
    );
    const visualRadiusPixels =
      THREE.MathUtils.lerp(
        EQUIPMENT_NODE_RADIUS_PIXELS.near,
        EQUIPMENT_NODE_RADIUS_PIXELS.far,
        altitudeFactor,
      ) + (selected ? EQUIPMENT_NODE_RADIUS_PIXELS.selectedBoost : 0);
    visualRef.current.scale.setScalar(worldUnitsPerPixel * visualRadiusPixels);
    hitTargetRef.current.scale.setScalar(
      worldUnitsPerPixel *
        (selected ? EQUIPMENT_NODE_RADIUS_PIXELS.selectedHit : EQUIPMENT_NODE_RADIUS_PIXELS.hit),
    );
  });

  return (
    <group position={position}>
      <mesh
        ref={hitTargetRef}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <sphereGeometry args={[1, 14, 14]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      <group ref={visualRef}>
        <mesh scale={selected ? 1.18 : 1}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial color={TONE_COLORS[tone]} toneMapped={false} />
        </mesh>
        {equipment?.heartbeat ? (
          <Billboard follow>
            <HeartbeatPulse
              innerRadius={1.04}
              outerRadius={1.82}
              opacity={0.9}
              speed={0.72}
              phaseOffset={0}
              minScale={0.84}
              maxScale={2.72}
            />
            <HeartbeatPulse
              innerRadius={1.36}
              outerRadius={2.14}
              opacity={0.42}
              speed={0.52}
              phaseOffset={0.38}
              minScale={0.98}
              maxScale={3.16}
            />
          </Billboard>
        ) : null}
      </group>
      {selected && equipment ? (
        <Html
          center
          zIndexRange={[48, 0]}
          pointerEvents="none"
          calculatePosition={calculateSelectedBillboardPosition}
        >
          <div className="equipment-globe__selected-billboard">
            <span data-tone={equipment.tone}>{TONE_LABELS[equipment.tone]}</span>
            <strong>{equipment.serial}</strong>
            <small>{equipment.model} · {equipment.clientName}</small>
          </div>
        </Html>
      ) : null}
    </group>
  );
}

function CityCluster({
  cluster,
  expansionMode,
  selectedEquipmentId,
  municipalityFeatures,
  onHover,
  onFocus,
  onSelectEquipment,
}: {
  cluster: CityClusterData;
  expansionMode: 'none' | 'preview' | 'automatic' | 'focused';
  selectedEquipmentId: string | null;
  municipalityFeatures: AdministrativeFeatures | null;
  onHover: (clusterId: string | null) => void;
  onFocus: (clusterId: string) => void;
  onSelectEquipment: (equipmentId: string | null) => void;
}) {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group | null>(null);
  const markerGroupRef = useRef<THREE.Group | null>(null);
  const nodeVisualRef = useRef<THREE.Group | null>(null);
  const nodeHitTargetRef = useRef<THREE.Mesh | null>(null);
  const nodeMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const hoverLeaveTimeoutRef = useRef<number | null>(null);
  const position = useMemo(
    () => latLngToVector(cluster.latitude, cluster.longitude, CITY_MARKER_RADIUS),
    [cluster.latitude, cluster.longitude],
  );
  const municipalityPolygons = useMemo(() => {
    if (cluster.simulated || expansionMode !== 'focused' || !municipalityFeatures) {
      return null;
    }

    const localityKeys = [cluster.municipality, cluster.city]
      .filter((value): value is string => Boolean(value))
      .map(normalizeGroupKey);
    const namedFeature = municipalityFeatures.features.find((municipality) =>
      localityKeys.includes(normalizeGroupKey(municipality.properties?.nomgeo || '')),
    );
    const containingFeature = municipalityFeatures.features.find((municipality) =>
      getFeaturePolygons(municipality).some((polygon) =>
        pointInPolygon(cluster.longitude, cluster.latitude, polygon),
      ),
    );
    // The coordinate is authoritative when locality labels disagree with the
    // administrative dataset or refer to a neighboring metropolitan area.
    const municipalityFeature = containingFeature || namedFeature;
    return municipalityFeature ? getFeaturePolygons(municipalityFeature) : null;
  }, [cluster.city, cluster.latitude, cluster.longitude, cluster.municipality, cluster.simulated, expansionMode, municipalityFeatures]);
  const equipmentLayout = useMemo(() => {
    const visibleCount = Math.min(cluster.equipments.length || cluster.count, 72);
    const clusterIsInMexico = isPointInMexico(cluster.longitude, cluster.latitude);
    const coordinateOccurrences = new Map<string, number>();
    const coordinateCounts = cluster.equipments.slice(0, visibleCount).reduce((counts, equipment) => {
      const key = `${equipment.latitude.toFixed(5)}:${equipment.longitude.toFixed(5)}`;
      counts.set(key, (counts.get(key) || 0) + 1);
      return counts;
    }, new Map<string, number>());

    return Array.from({ length: visibleCount }, (_, index) => {
      const equipment = cluster.equipments[index];
      const latitude = equipment?.latitude ?? cluster.latitude;
      const longitude = equipment?.longitude ?? cluster.longitude;
      const anchor = latLngToVector(latitude, longitude, EQUIPMENT_MARKER_RADIUS);
      const coordinateKey = `${latitude.toFixed(5)}:${longitude.toFixed(5)}`;
      const occurrenceIndex = coordinateOccurrences.get(coordinateKey) || 0;
      coordinateOccurrences.set(coordinateKey, occurrenceIndex + 1);
      const duplicateCount = coordinateCounts.get(coordinateKey) || 0;
      if (duplicateCount === 1) {
        return { anchor, position: anchor.clone() };
      }

      // Repeated city-level coordinates are geocoding anchors, not distinct
      // physical positions. Keep the group centered on that anchor while
      // separating every device enough to remain selectable at close zoom.
      const centeredIndex = occurrenceIndex - (duplicateCount - 1) / 2;
      const baseAngle = centeredIndex * Math.PI * (3 - Math.sqrt(5));
      const distanceKm = Math.sqrt(Math.abs(centeredIndex) + 0.42) * 2.15;
      let visualLatitude = latitude;
      let visualLongitude = longitude;

      for (let attempt = 0; attempt < 24; attempt += 1) {
        const angle = baseAngle + attempt * (Math.PI / 12);
        const candidateDistanceKm = distanceKm * (1 - Math.floor(attempt / 12) * 0.28);
        const candidateLatitude = latitude + (Math.cos(angle) * candidateDistanceKm) / 111.32;
        const candidateLongitude =
          longitude +
          (Math.sin(angle) * candidateDistanceKm) /
            (111.32 * Math.max(Math.cos(THREE.MathUtils.degToRad(latitude)), 0.25));

        const insideMunicipality = municipalityPolygons?.some((polygon) =>
          pointInPolygon(candidateLongitude, candidateLatitude, polygon),
        );
        if (
          cluster.simulated ||
          !clusterIsInMexico ||
          (municipalityPolygons?.length ? insideMunicipality : isPointInMexico(candidateLongitude, candidateLatitude))
        ) {
          visualLatitude = candidateLatitude;
          visualLongitude = candidateLongitude;
          break;
        }
      }

      const visualPosition = latLngToVector(visualLatitude, visualLongitude, EQUIPMENT_MARKER_RADIUS);

      return { anchor, position: visualPosition };
    });
  }, [cluster.count, cluster.equipments, cluster.latitude, cluster.longitude, cluster.simulated, municipalityPolygons]);
  const toneColors = useMemo(
    () => cluster.tones.map((tone) => new THREE.Color(TONE_COLORS[tone])),
    [cluster.tones],
  );
  const nodeSize =
    expansionMode === 'focused' || expansionMode === 'automatic'
      ? 0.016
      : 0.026 + Math.min(Math.sqrt(cluster.count) * 0.0022, 0.028);
  const selected = cluster.equipments.some((equipment) => equipment.id === selectedEquipmentId);

  useFrame(({ clock, size }) => {
    if (!groupRef.current) {
      return;
    }

    const cameraDirection = camera.position.clone().normalize();
    groupRef.current.visible = position.clone().normalize().dot(cameraDirection) > 0.035;
    if (nodeVisualRef.current && nodeHitTargetRef.current) {
      const worldUnitsPerPixel = getWorldUnitsPerPixel(camera, position, size.height);
      const distanceFactor = THREE.MathUtils.clamp(
        (camera.position.length() - MIN_CAMERA_DISTANCE) / (8.4 - MIN_CAMERA_DISTANCE),
        0,
        1,
      );
      const farRadiusPixels =
        CITY_NODE_RADIUS_PIXELS.baseFar +
        Math.min(Math.sqrt(cluster.count) * 0.24, CITY_NODE_RADIUS_PIXELS.countBoost);
      const visualRadiusPixels = THREE.MathUtils.lerp(
        CITY_NODE_RADIUS_PIXELS.near,
        farRadiusPixels,
        distanceFactor,
      );
      nodeVisualRef.current.scale.setScalar((worldUnitsPerPixel * visualRadiusPixels) / nodeSize);
      nodeHitTargetRef.current.scale.setScalar(
        (worldUnitsPerPixel * CITY_NODE_RADIUS_PIXELS.hit) / (nodeSize * 1.65),
      );
    }
    if (nodeMaterialRef.current && toneColors.length) {
      if (toneColors.length === 1) {
        nodeMaterialRef.current.color.copy(toneColors[0]);
      } else {
        const cycle = (clock.elapsedTime * 0.65 + Math.abs(cluster.latitude) * 0.03) % toneColors.length;
        const currentIndex = Math.floor(cycle);
        const nextIndex = (currentIndex + 1) % toneColors.length;
        const blend = THREE.MathUtils.smoothstep(cycle - currentIndex, 0.18, 0.82);
        nodeMaterialRef.current.color.lerpColors(toneColors[currentIndex], toneColors[nextIndex], blend);
      }
    }
  });

  const detailed = expansionMode === 'focused' || expansionMode === 'automatic';
  const expansionCount = detailed ? 72 : expansionMode === 'preview' ? 7 : 0;
  const displayEquipments = (cluster.equipments.length
    ? cluster.equipments.slice(0, equipmentLayout.length)
    : equipmentLayout.map(() => null as GlobeEquipmentNode | null)
  ).slice(0, expansionCount);

  const keepHover = () => {
    if (hoverLeaveTimeoutRef.current !== null) {
      window.clearTimeout(hoverLeaveTimeoutRef.current);
      hoverLeaveTimeoutRef.current = null;
    }
    onHover(cluster.id);
  };

  const releaseHover = () => {
    if (hoverLeaveTimeoutRef.current !== null) {
      window.clearTimeout(hoverLeaveTimeoutRef.current);
    }
    hoverLeaveTimeoutRef.current = window.setTimeout(() => {
      onHover(null);
      hoverLeaveTimeoutRef.current = null;
    }, 140);
  };

  useEffect(
    () => () => {
      if (hoverLeaveTimeoutRef.current !== null) {
        window.clearTimeout(hoverLeaveTimeoutRef.current);
      }
    },
    [],
  );

  return (
    <group ref={groupRef}>
      <group ref={markerGroupRef} position={position}>
        {!detailed ? (
          <>
            <mesh
              ref={nodeHitTargetRef}
              onPointerOver={(event: ThreeEvent<PointerEvent>) => {
                event.stopPropagation();
                document.body.style.cursor = 'pointer';
                keepHover();
              }}
              onPointerOut={(event: ThreeEvent<PointerEvent>) => {
                event.stopPropagation();
                document.body.style.cursor = '';
                releaseHover();
              }}
              onClick={(event: ThreeEvent<MouseEvent>) => {
                event.stopPropagation();
                onFocus(cluster.id);
                const preferred =
                  cluster.equipments.find((equipment) => equipment.status === 'fatal') ||
                  cluster.equipments.find((equipment) => equipment.status === 'warning') ||
                  cluster.equipments[0];
                if (preferred) {
                  onSelectEquipment(preferred.id);
                }
              }}
            >
              <sphereGeometry args={[nodeSize * 1.65, 22, 22]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <group ref={nodeVisualRef}>
              <mesh>
                <sphereGeometry args={[nodeSize, 22, 22]} />
                <meshBasicMaterial ref={nodeMaterialRef} color={TONE_COLORS[cluster.tone]} toneMapped={false} />
              </mesh>
              <Billboard follow>
                {cluster.heartbeat ? (
                  <>
                    <HeartbeatPulse
                      innerRadius={nodeSize * 1.08}
                      outerRadius={nodeSize * 1.86}
                      opacity={0.92}
                      speed={0.66}
                      phaseOffset={0}
                      minScale={0.9}
                      maxScale={2.7}
                    />
                    <HeartbeatPulse
                      innerRadius={nodeSize * 1.42}
                      outerRadius={nodeSize * 2.18}
                      opacity={0.38}
                      speed={0.48}
                      phaseOffset={0.42}
                      minScale={1.02}
                      maxScale={3.2}
                    />
                  </>
                ) : null}
                <mesh scale={selected ? 1.9 : 1.45}>
                  <ringGeometry args={[nodeSize * 1.08, nodeSize * 1.18, 32]} />
                  <meshBasicMaterial
                    color={selected ? '#ffffff' : '#b8e6e7'}
                    transparent
                    opacity={selected ? 0.92 : 0.42}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                  />
                </mesh>
              </Billboard>
            </group>
          </>
        ) : null}
        {expansionMode === 'preview' && !selected ? (
          <Html center className="equipment-globe__city-tooltip" zIndexRange={[20, 0]}>
            <strong>{cluster.city}</strong>
            <span>{cluster.country} · {cluster.count} equipos</span>
            <small>
              {cluster.simulated ? 'Cobertura simulada' : 'Haz clic para fijar la ciudad'}
            </small>
            {cluster.tones.length > 1 ? <small>Estado mixto · colores en ciclo</small> : null}
          </Html>
        ) : null}
      </group>

      {expansionMode === 'focused'
        ? equipmentLayout.slice(0, expansionCount).map((layout, index) =>
            layout.anchor.distanceToSquared(layout.position) < 1e-12 ? null : (
              <Line
                key={`${cluster.id}-anchor-${index}`}
                points={[layout.anchor, layout.position]}
                color="#9bdfe1"
                lineWidth={0.42}
                transparent
                opacity={0.38}
                depthWrite={false}
              />
            ),
          )
        : null}

      {expansionMode !== 'none'
        ? displayEquipments.map((equipment, index) => (
            <EquipmentPulseNode
              key={equipment?.id || `${cluster.id}-simulated-${index}`}
              equipment={equipment}
              position={equipmentLayout[index].position}
              selected={Boolean(equipment && equipment.id === selectedEquipmentId)}
              onHoverChange={(hovered) => {
                if (hovered) {
                  keepHover();
                } else {
                  releaseHover();
                }
              }}
              onSelect={() => {
                if (equipment) {
                  onSelectEquipment(equipment.id === selectedEquipmentId ? null : equipment.id);
                }
              }}
            />
          ))
        : null}
    </group>
  );
}

function NetworkArcs({ clusters }: { clusters: CityClusterData[] }) {
  const groupRef = useRef<THREE.Group | null>(null);
  const arcs = useMemo(() => {
    const mexicoClusters = clusters.filter((cluster) => !cluster.simulated).slice(0, 6);
    const globalClusters = clusters.filter((cluster) => cluster.simulated);

    return mexicoClusters.flatMap((origin, originIndex) =>
      [globalClusters[(originIndex * 5 + 2) % globalClusters.length], globalClusters[(originIndex * 7 + 9) % globalClusters.length]]
        .filter(Boolean)
        .map((destination, destinationIndex) => {
          const start = latLngToVector(origin.latitude, origin.longitude, NETWORK_ANCHOR_RADIUS);
          const end = latLngToVector(destination.latitude, destination.longitude, NETWORK_ANCHOR_RADIUS);
          const midpoint = start.clone().add(end).normalize().multiplyScalar(GLOBE_RADIUS + 0.34 + destinationIndex * 0.08);
          const curve = new THREE.QuadraticBezierCurve3(start, midpoint, end);
          return {
            id: `${origin.id}-${destination.id}`,
            points: curve.getPoints(42),
          };
        }),
    );
  }, [clusters]);

  useFrame(({ camera }) => {
    if (groupRef.current) {
      groupRef.current.visible = camera.position.length() > STATE_VIEW_DISTANCE;
    }
  });

  return (
    <group ref={groupRef}>
      {arcs.map((arc, index) => (
        <Line
          key={arc.id}
          points={arc.points}
          color={index % 3 === 0 ? '#47dec4' : '#5f9fe5'}
          lineWidth={0.55}
          transparent
          opacity={0.2}
          depthWrite={false}
        />
      ))}
    </group>
  );
}

function GlobeScene({
  clusters,
  initialView,
  selectedEquipmentId,
  hoveredClusterId,
  focusedClusterId,
  cameraDistance,
  resetVersion,
  zoomRequest,
  onHoverCluster,
  onFocusCluster,
  onSelectEquipment,
  onDistanceChange,
  onCollapseFocus,
}: {
  clusters: CityClusterData[];
  initialView: CountryView;
  selectedEquipmentId: string | null;
  hoveredClusterId: string | null;
  focusedClusterId: string | null;
  cameraDistance: number;
  resetVersion: number;
  zoomRequest: { version: number; direction: 1 | -1 };
  onHoverCluster: (clusterId: string | null) => void;
  onFocusCluster: (clusterId: string) => void;
  onSelectEquipment: (equipmentId: string | null) => void;
  onDistanceChange: (distance: number) => void;
  onCollapseFocus: () => void;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const [municipalityFeatures, setMunicipalityFeatures] = useState<AdministrativeFeatures | null>(null);
  const focusedCluster = useMemo(
    () => clusters.find((cluster) => cluster.id === focusedClusterId) || null,
    [clusters, focusedClusterId],
  );
  const [initialCameraX, initialCameraY, initialCameraZ] = initialView.cameraPosition;

  useFrame(() => {
    if (!controlsRef.current) {
      return;
    }

    const altitude = Math.max(camera.position.length() - GLOBE_RADIUS, 0);
    const altitudeFactor = THREE.MathUtils.clamp((altitude - 0.12) / 3.8, 0, 1);
    controlsRef.current.rotateSpeed = THREE.MathUtils.lerp(0.004, 0.48, altitudeFactor);
    controlsRef.current.zoomSpeed = THREE.MathUtils.lerp(0.08, 0.85, altitudeFactor);
    controlsRef.current.dampingFactor = THREE.MathUtils.lerp(0.2, 0.055, altitudeFactor);
  });

  useEffect(() => {
    camera.position.set(initialCameraX, initialCameraY, initialCameraZ);
    controlsRef.current?.target.set(0, 0, 0);
    controlsRef.current?.update();
    onDistanceChange(camera.position.length());
  }, [camera, initialCameraX, initialCameraY, initialCameraZ, initialView.key, onDistanceChange, resetVersion]);

  useEffect(() => {
    if (!zoomRequest.version) {
      return;
    }

    const direction = camera.position.clone().normalize();
    const altitude = Math.max(camera.position.length() - GLOBE_RADIUS, MIN_CAMERA_DISTANCE - GLOBE_RADIUS);
    const nextAltitude = zoomRequest.direction < 0 ? altitude * 0.58 : altitude * 1.65;
    const nextDistance = THREE.MathUtils.clamp(GLOBE_RADIUS + nextAltitude, MIN_CAMERA_DISTANCE, 8.4);
    camera.position.copy(direction.multiplyScalar(nextDistance));
    controlsRef.current?.update();
    onDistanceChange(nextDistance);
  }, [camera, onDistanceChange, zoomRequest]);

  useEffect(() => {
    if (!focusedClusterId) {
      return;
    }

    if (!focusedCluster) {
      return;
    }

    const cameraDirection = latLngToVector(focusedCluster.latitude, focusedCluster.longitude, 1).normalize();
    camera.position.copy(cameraDirection.multiplyScalar(CITY_FOCUS_DISTANCE));
    controlsRef.current?.target.set(0, 0, 0);
    controlsRef.current?.update();
    onDistanceChange(CITY_FOCUS_DISTANCE);
  }, [camera, focusedCluster, focusedClusterId, onDistanceChange]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 6]} intensity={1.6} color="#ccefff" />
      <HeartbeatClock />
      <mesh>
        <sphereGeometry args={[GLOBE_RADIUS, 96, 96]} />
        <meshPhysicalMaterial
          color="#0c2436"
          roughness={0.52}
          metalness={0.16}
          transparent
          opacity={0.94}
          clearcoat={0.32}
          clearcoatRoughness={0.38}
        />
      </mesh>
      <WorldGeography />
      <MexicoAdministrativeGeography
        focusedCluster={focusedCluster}
        onMunicipalityFeaturesChange={setMunicipalityFeatures}
      />
      <Atmosphere />
      {focusedCluster ? null : <NetworkArcs clusters={clusters} />}
      {clusters.filter((cluster) => !focusedClusterId || cluster.id === focusedClusterId).map((cluster) => (
        <CityCluster
          key={cluster.id}
          cluster={cluster}
          expansionMode={
            focusedClusterId === cluster.id
              ? 'focused'
              : !focusedClusterId && cameraDistance <= AUTOMATIC_EQUIPMENT_DISTANCE
                ? 'automatic'
                : hoveredClusterId === cluster.id
                  ? 'preview'
                  : 'none'
          }
          selectedEquipmentId={selectedEquipmentId}
          municipalityFeatures={focusedClusterId === cluster.id ? municipalityFeatures : null}
          onHover={onHoverCluster}
          onFocus={onFocusCluster}
          onSelectEquipment={onSelectEquipment}
        />
      ))}
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableDamping
        dampingFactor={0.055}
        rotateSpeed={0.48}
        zoomSpeed={0.85}
        minDistance={MIN_CAMERA_DISTANCE}
        maxDistance={8.4}
        onChange={() => {
          const distance = camera.position.length();
          onDistanceChange(distance);
          if (focusedClusterId && distance >= FOCUS_COLLAPSE_DISTANCE) {
            onCollapseFocus();
          }
        }}
      />
    </>
  );
}

export default function GlobalEquipmentGlobe({
  equipments,
  countryEquipments,
  selectedEquipmentId,
  onSelectEquipment,
}: GlobalEquipmentGlobeProps) {
  const defaultCountryView = useMemo(() => getCountryView(countryEquipments), [countryEquipments]);
  const [resetVersion, setResetVersion] = useState(0);
  const [cameraDistance, setCameraDistance] = useState(() =>
    new THREE.Vector3(...defaultCountryView.cameraPosition).length(),
  );
  const [hoveredClusterId, setHoveredClusterId] = useState<string | null>(null);
  const [focusedClusterId, setFocusedClusterId] = useState<string | null>(null);
  const [selectedSimulatedEquipmentId, setSelectedSimulatedEquipmentId] = useState<string | null>(null);
  const [zoomRequest, setZoomRequest] = useState<{ version: number; direction: 1 | -1 }>({
    version: 0,
    direction: 1,
  });
  const clusters = useMemo(
    () => [...buildCityClusters(equipments), ...buildSimulatedClusters(countryEquipments)],
    [countryEquipments, equipments],
  );
  const realLocationCount = clusters.filter((cluster) => !cluster.simulated).length;
  const effectiveSelectedEquipmentId = selectedSimulatedEquipmentId || selectedEquipmentId;
  const selectedEquipment = effectiveSelectedEquipmentId
    ? clusters
        .flatMap((cluster) => cluster.equipments)
        .find((equipment) => equipment.id === effectiveSelectedEquipmentId) || null
    : null;
  const selectedEquipmentLocation = selectedEquipment
    ? Array.from(
        new Set(
          [selectedEquipment.city, selectedEquipment.municipality, selectedEquipment.state, selectedEquipment.country].filter(
            (value): value is string => Boolean(value),
          ),
        ),
      ).join(' · ')
    : '';
  const focusedCluster = focusedClusterId
    ? clusters.find((cluster) => cluster.id === focusedClusterId) || null
    : null;
  const focusedSelectedEquipment =
    focusedCluster?.equipments.find((equipment) => equipment.id === effectiveSelectedEquipmentId) || null;
  const geographyLevel =
    defaultCountryView.key === String(MEXICO_FEATURE?.id) &&
    focusedCluster &&
    !focusedCluster.simulated &&
    cameraDistance <= MUNICIPAL_VIEW_DISTANCE
      ? 'División municipal'
      : defaultCountryView.key === String(MEXICO_FEATURE?.id) && cameraDistance <= STATE_VIEW_DISTANCE
        ? 'División estatal'
        : 'División por países';

  const handleSelectEquipment = (equipmentId: string | null) => {
    if (equipmentId?.startsWith('simulated-equipment-')) {
      setSelectedSimulatedEquipmentId(equipmentId);
      return;
    }

    setSelectedSimulatedEquipmentId(null);
    onSelectEquipment(equipmentId);
  };

  return (
    <div className={`equipment-globe${selectedEquipment ? ' equipment-globe--has-selection' : ''}`}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: MEXICO_CAMERA_POSITION, fov: 44, near: 0.001, far: 100 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onPointerMissed={() => {
          document.body.style.cursor = '';
          setHoveredClusterId(null);
          handleSelectEquipment(null);
        }}
      >
        <GlobeScene
          clusters={clusters}
          initialView={defaultCountryView}
          selectedEquipmentId={effectiveSelectedEquipmentId}
          hoveredClusterId={hoveredClusterId}
          focusedClusterId={focusedClusterId}
          cameraDistance={cameraDistance}
          resetVersion={resetVersion}
          zoomRequest={zoomRequest}
          onHoverCluster={setHoveredClusterId}
          onFocusCluster={setFocusedClusterId}
          onSelectEquipment={handleSelectEquipment}
          onDistanceChange={setCameraDistance}
          onCollapseFocus={() => {
            setFocusedClusterId(null);
            setHoveredClusterId(null);
            handleSelectEquipment(null);
          }}
        />
      </Canvas>

      {selectedEquipment ? (
        <aside className="equipment-globe__selected-panel" aria-live="polite">
          <div className="equipment-globe__selected-panel-head">
            <div>
              <span className="equipment-globe__selected-eyebrow">Equipo seleccionado</span>
              <strong>{selectedEquipment.serial}</strong>
            </div>
            <button type="button" aria-label="Cerrar detalle del equipo" onClick={() => handleSelectEquipment(null)}>
              ×
            </button>
          </div>
          <div className="equipment-globe__selected-status" data-tone={selectedEquipment.tone}>
            <i aria-hidden="true" />
            <div>
              <strong>{TONE_LABELS[selectedEquipment.tone]}</strong>
              <span>{selectedEquipment.heartbeat ? 'Pulso Orion activo' : 'Sin pulso remoto'}</span>
            </div>
          </div>
          <dl className="equipment-globe__selected-facts">
            <div>
              <dt>Modelo</dt>
              <dd>{selectedEquipment.model}</dd>
            </div>
            <div>
              <dt>Cliente</dt>
              <dd>{selectedEquipment.clientName}</dd>
            </div>
            <div>
              <dt>Ubicación</dt>
              <dd>{selectedEquipmentLocation || 'Sin ubicación registrada'}</dd>
            </div>
          </dl>
        </aside>
      ) : null}

      <div className="equipment-globe__hud equipment-globe__hud--left">
        <span className="equipment-globe__scope-dot" />
        <div>
          <strong>{defaultCountryView.label} en vivo</strong>
          <span>{realLocationCount} ubicaciones · {equipments.length} equipos</span>
          <small className="equipment-globe__geo-level">{geographyLevel}</small>
        </div>
      </div>

      <div className="equipment-globe__hud equipment-globe__hud--right">
        <span>
          Vista {focusedCluster || cameraDistance <= AUTOMATIC_EQUIPMENT_DISTANCE ? 'por equipo' : 'por ciudad'}
        </span>
        <button
          type="button"
          aria-label="Alejar globo"
          onClick={() => setZoomRequest((current) => ({ version: current.version + 1, direction: 1 }))}
        >
          -
        </button>
        <button
          type="button"
          onClick={() => {
            setFocusedClusterId(null);
            setHoveredClusterId(null);
            setSelectedSimulatedEquipmentId(null);
            onSelectEquipment(null);
            setResetVersion((current) => current + 1);
          }}
        >
          {defaultCountryView.label}
        </button>
        {effectiveSelectedEquipmentId ? (
          <button type="button" aria-label="Deseleccionar equipo" onClick={() => handleSelectEquipment(null)}>
            Limpiar
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Acercar globo"
          onClick={() => setZoomRequest((current) => ({ version: current.version + 1, direction: -1 }))}
        >
          +
        </button>
      </div>

      {focusedCluster ? (
        <div className="equipment-globe__equipment-dock">
          <div className="equipment-globe__equipment-dock-header">
            <div>
              <strong>{focusedCluster.city}</strong>
              <span>
                {focusedSelectedEquipment
                  ? `${focusedSelectedEquipment.serial} · ${focusedSelectedEquipment.model} · ${
                      TONE_LABELS[focusedSelectedEquipment.tone]
                    }`
                  : `${focusedCluster.state ? `${focusedCluster.state} · ` : ''}${focusedCluster.latitude.toFixed(
                      5,
                    )}, ${focusedCluster.longitude.toFixed(5)} · ancla geocodificada`}
              </span>
              {focusedSelectedEquipment ? <small>{focusedSelectedEquipment.clientName}</small> : null}
            </div>
            <small>{focusedCluster.count} equipos</small>
          </div>
          <div className="equipment-globe__equipment-dock-list" role="list" aria-label={`Equipos en ${focusedCluster.city}`}>
            {focusedCluster.equipments.map((equipment) => (
              <button
                key={equipment.id}
                type="button"
                role="listitem"
                className={equipment.id === effectiveSelectedEquipmentId ? 'is-selected' : ''}
                onClick={() => handleSelectEquipment(equipment.id === effectiveSelectedEquipmentId ? null : equipment.id)}
              >
                <i
                  data-tone={equipment.tone}
                  data-heartbeat={equipment.heartbeat ? 'true' : 'false'}
                  title={TONE_LABELS[equipment.tone]}
                />
                <strong>{equipment.serial}</strong>
                <span>{equipment.model}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="equipment-globe__hint">
        {focusedCluster
          ? 'Cada línea vuelve a la coordenada real · selecciona en el mapa o en la bandeja'
          : 'Arrastra para recorrer el mundo · acerca para ver equipos en su ubicación real'}
      </div>
      <div className="equipment-globe__demo-label">Cobertura mundial simulada</div>
    </div>
  );
}
