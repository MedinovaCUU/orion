import { Billboard, Html, Line, OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import worldAtlasRaw from 'world-atlas/countries-110m.json?raw';
import { getPublicAssetUrl } from '../../components/publicAssetUrl';
import './globalEquipmentGlobe.css';

/**
 * Visualización geográfica 3D del monitoreo con React Three Fiber y Three.js.
 * Recibe equipos ya preparados por EquipmentMonitoring: aquí no se consultan
 * tablas de Supabase ni se leen logs. Agrupa ubicaciones, dibuja marcadores y
 * comunica la selección al componente padre. También incluye cobertura simulada
 * identificada como tal, que no debe interpretarse como telemetría de la flota.
 *
 * El globo llena todo el escenario (el padre fija su altura) y el HUD flota encima en cristal
 * oscuro. Con `paused` (explorador 3D abierto sobre el globo) el bucle de render pasa a demanda,
 * el lienzo sigue montado y visible —el padre lo difumina— y ningún clic en el vacío deselecciona.
 */
export type GlobeNodeTone = 'ok' | 'warning' | 'fatal' | 'muted' | 'supremo';

/** Contrato de entrada: identidad, estado visual, ubicación y señal reciente calculada por el padre. */
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

/**
 * equipments es la lista filtrada; countryEquipments conserva el contexto general para encuadre y demos.
 * `paused` lo activa el escenario mientras el explorador 3D va sobre el globo (render bajo demanda,
 * sin deselección por clic en el vacío); `showSimulatedCoverage` controla la cobertura de demostración
 * (la gobierna el padre desde el menú Acciones). La antigua banda de contexto (`inspecting`) ya no existe.
 */
interface GlobalEquipmentGlobeProps {
  equipments: GlobeEquipmentNode[];
  countryEquipments: GlobeEquipmentNode[];
  selectedEquipmentId: string | null;
  onSelectEquipment: (equipmentId: string | null) => void;
  paused?: boolean;
  showSimulatedCoverage?: boolean;
}

/** Agrupación visual de localidad, con centro promedio, estados presentes y equipos seleccionables. */
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

/** Datos de demostración: cantidades y estados predefinidos, no leídos desde analizadores. */
interface SimulatedCity {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  count: number;
  tone: GlobeNodeTone;
}

/** País y posición de cámara que se recuperan al restablecer la vista. */
interface CountryView {
  key: string;
  label: string;
  cameraPosition: [number, number, number];
}

/** Margen seguro del HUD (px) leído de las custom properties --hud-safe-* del contenedor. */
interface HudSafeFrame {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Función de posicionamiento de una etiqueta HTML de drei: proyecta el objeto y devuelve [x, y] en píxeles. */
type HtmlPositioner = (
  object: THREE.Object3D,
  camera: THREE.Camera,
  size: { width: number; height: number },
) => [number, number];

// Radios en unidades de escena: pequeñas diferencias separan capas y evitan solapamiento de superficies.
const GLOBE_RADIUS = 2;
const WORLD_POINT_RADIUS = GLOBE_RADIUS + 0.002;
const MEXICO_POINT_RADIUS = GLOBE_RADIUS + 0.003;
const COUNTRY_BORDER_RADIUS = GLOBE_RADIUS + 0.004;
const STATE_BORDER_RADIUS = GLOBE_RADIUS + 0.005;
const MUNICIPAL_BORDER_RADIUS = GLOBE_RADIUS + 0.006;
const CITY_MARKER_RADIUS = GLOBE_RADIUS + 0.007;
const EQUIPMENT_MARKER_RADIUS = GLOBE_RADIUS + 0.008;
const DISCONNECTED_EQUIPMENT_MARKER_RADIUS = GLOBE_RADIUS + 0.0065;
const NETWORK_ANCHOR_RADIUS = GLOBE_RADIUS + 0.009;
// Umbrales de cámara para pasar de países a estados, municipios y equipos individuales.
const AUTOMATIC_EQUIPMENT_DISTANCE = 2.085;
const CITY_FOCUS_DISTANCE = 2.075;
const FOCUS_COLLAPSE_DISTANCE = 4.15;
const MIN_CAMERA_DISTANCE = 2.018;
const STATE_VIEW_DISTANCE = 6.45;
const MUNICIPAL_VIEW_DISTANCE = 2.72;
const MEXICO_CAMERA_POSITION: [number, number, number] = [-0.4850, 1.12019, 2.48659];
// Tamaños visuales y áreas de clic en píxeles; se convierten a unidades 3D según la cámara.
const EQUIPMENT_NODE_RADIUS_PIXELS = {
  near: 9.4,
  far: 6.6,
  selectedBoost: 1.6,
  hit: 28,
  selectedHit: 32,
};
const CITY_NODE_RADIUS_PIXELS = {
  near: 6.4,
  baseFar: 4.8,
  countBoost: 2.1,
  hit: 24,
};
// Prioridad del estado representativo de una ciudad; los estados mixtos también alternan colores.
const STATUS_TONE_ORDER: GlobeNodeTone[] = ['fatal', 'warning', 'ok', 'supremo', 'muted'];

// Tonos del lienzo profundo a plena saturación: los mismos valores que --mon-cyan/--mon-warn/--mon-risk/--mon-graphite.
// Supremo comparte el cian y se dibuja como anillo hueco; el rojo solo aparece en riesgo (fatal).
const TONE_COLORS: Record<GlobeNodeTone, string> = {
  fatal: '#f32735',
  warning: '#ffc45e',
  ok: '#69dde0',
  supremo: '#69dde0',
  muted: '#7c8895',
};

// Entorno de entrada y preferencias: se leen una vez y se observan sin re-renderizar el lienzo.
const COARSE_POINTER_QUERY = '(pointer: coarse)';
const LANDSCAPE_COMPACT_QUERY = '(orientation: landscape) and (max-height: 520px)';
// Umbral horizontal (px) para decidir que un gesto táctil gira el globo en lugar de desplazar la página.
const TOUCH_ROTATE_THRESHOLD_PX = 8;
const DPR_FINE_POINTER: [number, number] = [1, 1.75];
const DPR_COARSE_POINTER: [number, number] = [1, 1.5];
// El envoltorio de React Three Fiber se coloca por estilo (no por !important) dentro del lienzo aislado.
const CANVAS_WRAPPER_STYLE: CSSProperties = { position: 'absolute', inset: 0, zIndex: 1 };
// Espejo de los valores de escritorio de globalEquipmentGlobe.css (riel flotante de 288 px + márgenes de 16 px).
const DEFAULT_HUD_SAFE_FRAME: HudSafeFrame = { top: 68, right: 176, bottom: 88, left: 320 };
// Mitades aproximadas (px) de la ficha y del tooltip para que su caja completa quede dentro del margen seguro.
const BILLBOARD_HALF_SIZE = { width: 116, height: 86 };
const TOOLTIP_HALF_SIZE = { width: 88, height: 34 };
// Separación (px) entre el nodo seleccionado y la esquina más cercana de su ficha.
const BILLBOARD_NODE_OFFSET = { x: 18, y: 12 };
// Reloj compartido por las animaciones: el pulso es visual, no un paquete recibido ni una consulta de red.
const HEARTBEAT_TIME_UNIFORM = { value: 0 };
const HEARTBEAT_HIGHLIGHT_COLOR = new THREE.Color('#d9fff8');
const SELECTED_BILLBOARD_PROJECTED = new THREE.Vector3();

// Shaders del halo: transforman el anillo y calculan brillo/transparencia en la GPU.
const HEARTBEAT_RING_VERTEX_SHADER = `
  varying vec2 vLocalPosition;

  void main() {
    vLocalPosition = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const HEARTBEAT_RING_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uBeat;
  uniform float uInnerRadius;
  uniform float uOuterRadius;
  varying vec2 vLocalPosition;

  void main() {
    float radius = length(vLocalPosition);
    float radialPosition = clamp(
      (radius - uInnerRadius) / max(uOuterRadius - uInnerRadius, 0.0001),
      0.0,
      1.0
    );
    float softEdge = pow(sin(radialPosition * 3.14159265), 0.72);
    float angle = atan(vLocalPosition.y, vLocalPosition.x);
    float orbit = angle - uTime * 2.6;
    float primarySpark = pow(0.5 + 0.5 * cos(orbit), 26.0);
    float secondarySpark = pow(0.5 + 0.5 * cos(orbit + 2.35), 42.0) * 0.56;
    float shimmer = 0.82 + 0.18 * sin(angle * 11.0 - uTime * 5.2);
    float energy = clamp(primarySpark + secondarySpark + uBeat * 0.24, 0.0, 1.0);
    vec3 turquoise = vec3(0.41, 0.87, 0.88);
    vec3 hotLight = vec3(0.86, 1.0, 0.97);
    vec3 color = mix(turquoise, hotLight, energy);
    float alpha = uOpacity * softEdge * (0.7 + energy * 0.52) * shimmer;
    if (alpha < 0.012) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

const TONE_LABELS: Record<GlobeNodeTone, string> = {
  fatal: 'Error fatal',
  warning: 'Warning activo',
  ok: 'Monitoreo en línea',
  supremo: 'Supremo disponible',
  muted: 'Sin señal',
};

/** Ubicación legible de la ficha: localidad y estado; sin ellos, el país o un guion. */
const formatEquipmentPlace = (equipment: GlobeEquipmentNode) =>
  [equipment.municipality || equipment.city, equipment.state].filter(Boolean).join(', ') || equipment.country || '—';

// Cobertura mundial ficticia para demostrar la navegación. Se excluyen países con equipos reales.
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

// Contratos de los archivos cartográficos TopoJSON; no contienen información clínica ni de equipos.
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

// Convierte el atlas empaquetado en polígonos y líneas; 484 es el identificador de México en el atlas.
const WORLD_TOPOLOGY = JSON.parse(worldAtlasRaw) as Topology<WorldAtlasObjects>;
const WORLD_COUNTRIES = WORLD_TOPOLOGY.objects.countries;
const COUNTRY_FEATURES = feature<CountryProperties>(WORLD_TOPOLOGY, WORLD_COUNTRIES) as unknown as FeatureCollection<
  Polygon | MultiPolygon,
  CountryProperties
>;
const WORLD_BORDER_LINES = mesh(WORLD_TOPOLOGY, WORLD_COUNTRIES).coordinates;
const MEXICO_FEATURE = COUNTRY_FEATURES.features.find((country) => String(country.id) === '484');
const countryFeatureCache = new Map<string, Feature<Polygon | MultiPolygon, CountryProperties> | null>();

/** Genera claves de agrupación consistentes pese a diferencias de acentos, signos o mayúsculas. */
const normalizeGroupKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

/** Convierte grados geográficos a una posición cartesiana sobre la esfera de radio indicado. */
const latLngToVector = (latitude: number, longitude: number, radius = GLOBE_RADIUS) => {
  const phi = THREE.MathUtils.degToRad(90 - latitude);
  const theta = THREE.MathUtils.degToRad(longitude + 180);

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
};

/** Transformación inversa para saber qué región apunta la dirección de la cámara. */
const vectorToLatLng = (vector: THREE.Vector3) => {
  const direction = vector.clone().normalize();

  return {
    latitude: THREE.MathUtils.radToDeg(
      Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1)),
    ),
    longitude: THREE.MathUtils.radToDeg(Math.atan2(-direction.z, direction.x)),
  };
};

/** Mantiene los marcadores legibles en pantalla aunque cambie la distancia de la cámara. */
const getWorldUnitsPerPixel = (camera: THREE.Camera, position: THREE.Vector3, viewportHeight: number) => {
  if (!(camera instanceof THREE.PerspectiveCamera)) {
    return 0.001;
  }

  const distance = Math.max(camera.position.distanceTo(position), 0.0001);
  const visibleHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return visibleHeight / Math.max(viewportHeight, 1);
};

/** Proyecta un objeto 3D a píxeles del lienzo (origen arriba-izquierda). */
const projectToPixels = (
  object: THREE.Object3D,
  camera: THREE.Camera,
  size: { width: number; height: number },
) => {
  const projected = SELECTED_BILLBOARD_PROJECTED.setFromMatrixPosition(object.matrixWorld).project(camera);
  return {
    x: projected.x * (size.width / 2) + size.width / 2,
    y: -projected.y * (size.height / 2) + size.height / 2,
  };
};

/** Limita un centro de etiqueta al margen seguro del HUD, descontando la mitad de su caja. */
const clampToSafeFrame = (
  x: number,
  y: number,
  size: { width: number; height: number },
  frame: HudSafeFrame,
  half: { width: number; height: number },
): [number, number] => {
  const minX = frame.left + half.width;
  const minY = frame.top + half.height;
  return [
    THREE.MathUtils.clamp(x, minX, Math.max(size.width - frame.right - half.width, minX)),
    THREE.MathUtils.clamp(y, minY, Math.max(size.height - frame.bottom - half.height, minY)),
  ];
};

/**
 * Coloca la ficha del nodo seleccionado junto a él y la limita al margen seguro (custom properties
 * --hud-safe-* del contenedor) para que nunca quede bajo el HUD, la bandeja ni fuera del lienzo.
 */
const createBillboardPositioner =
  (frame: HudSafeFrame): HtmlPositioner =>
  (object, camera, size) => {
    const node = projectToPixels(object, camera, size);
    // La ficha va en diagonal (arriba-derecha por defecto); cambia de lado cerca del borde derecho o superior.
    const placeLeft = node.x > size.width - frame.right - BILLBOARD_HALF_SIZE.width * 2 - BILLBOARD_NODE_OFFSET.x;
    const placeBelow = node.y < frame.top + BILLBOARD_HALF_SIZE.height * 2 + BILLBOARD_NODE_OFFSET.y;
    const offsetX = BILLBOARD_HALF_SIZE.width + BILLBOARD_NODE_OFFSET.x;
    const offsetY = BILLBOARD_HALF_SIZE.height + BILLBOARD_NODE_OFFSET.y;
    return clampToSafeFrame(
      node.x + (placeLeft ? -offsetX : offsetX),
      node.y + (placeBelow ? offsetY : -offsetY),
      size,
      frame,
      BILLBOARD_HALF_SIZE,
    );
  };

/** Ancla el tooltip de ciudad encima del marcador y lo mantiene dentro del rect del lienzo. */
const createTooltipPositioner =
  (frame: HudSafeFrame): HtmlPositioner =>
  (object, camera, size) => {
    const node = projectToPixels(object, camera, size);
    const placeBelow = node.y < frame.top + TOOLTIP_HALF_SIZE.height * 2 + 18;
    return clampToSafeFrame(node.x + 24, node.y + (placeBelow ? 46 : -46), size, frame, TOOLTIP_HALF_SIZE);
  };

/** Lee el margen seguro del HUD desde las custom properties del contenedor; sin valor válido usa el predeterminado. */
const readHudSafeFrame = (element: HTMLElement): HudSafeFrame => {
  const style = getComputedStyle(element);
  const read = (name: keyof HudSafeFrame) => {
    const value = Number.parseFloat(style.getPropertyValue(`--hud-safe-${name}`));
    return Number.isFinite(value) ? value : DEFAULT_HUD_SAFE_FRAME[name];
  };
  return { top: read('top'), right: read('right'), bottom: read('bottom'), left: read('left') };
};

/** Desplazamiento horizontal del encuadre (px, positivo = contenido a la derecha) leído de --globe-view-shift. */
const readViewShift = (element: HTMLElement) => {
  const value = Number.parseFloat(getComputedStyle(element).getPropertyValue('--globe-view-shift'));
  return Number.isFinite(value) ? value : 0;
};

const isSameSafeFrame = (left: HudSafeFrame, right: HudSafeFrame) =>
  left.top === right.top && left.right === right.right && left.bottom === right.bottom && left.left === right.left;

/** Único punto que toca el cursor del documento: así siempre se restaura al salir, desmontar o pausar. */
const setBodyCursor = (cursor: 'pointer' | '') => {
  if (typeof document !== 'undefined' && document.body.style.cursor !== cursor) {
    document.body.style.cursor = cursor;
  }
};
const restoreBodyCursor = () => setBodyCursor('');

/** Observa una media query sin re-renderizar más que al cambiar su resultado. */
function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
      }
      const media = window.matchMedia(query);
      media.addEventListener('change', notify);
      return () => media.removeEventListener('change', notify);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false),
    () => false,
  );
}


/** Prueba de punto dentro de un contorno contando cruces de un rayo con sus segmentos. */
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

/** Exige estar dentro del contorno exterior y fuera de los huecos interiores del polígono. */
const pointInPolygon = (longitude: number, latitude: number, polygon: Position[][]) =>
  Boolean(polygon[0]?.length) &&
  pointInRing(longitude, latitude, polygon[0]) &&
  !polygon.slice(1).some((hole) => pointInRing(longitude, latitude, hole));

/** Unifica Polygon y MultiPolygon en una lista para reutilizar los recorridos geográficos. */
const getFeaturePolygons = <Properties,>(geography: Feature<Polygon | MultiPolygon, Properties>) =>
  geography.geometry.type === 'Polygon' ? [geography.geometry.coordinates] : geography.geometry.coordinates;

/** Verifica pertenencia al contorno de México del atlas para limitar la dispersión de nodos. */
const isPointInMexico = (longitude: number, latitude: number) =>
  Boolean(
    MEXICO_FEATURE &&
      getFeaturePolygons(MEXICO_FEATURE).some((polygon) => pointInPolygon(longitude, latitude, polygon)),
  );

/** Resuelve país por geometría y guarda el resultado en memoria con coordenadas redondeadas. */
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

/** Encuadra el país con más equipos ubicables; sin candidatos conserva la vista predeterminada de México. */
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

/** Caja mínima del contorno para recorrer solo su extensión al generar puntos de tierra. */
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

/** Construye segmentos 3D; omite saltos mayores a 180 grados para no cruzar el globo por el antimeridiano. */
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

// Los archivos administrativos usados aquí contienen su colección en el primer objeto TopoJSON.
const getAdministrativeObject = (topology: AdministrativeTopology) => Object.values(topology.objects)[0];

/** Extrae fronteras compartidas entre regiones para dibujar divisiones internas sin duplicarlas. */
const createAdministrativeBorderGeometry = (topology: AdministrativeTopology, radius: number) => {
  const administrativeObject = getAdministrativeObject(topology);
  const internalBorders = mesh(
    topology,
    administrativeObject,
    (left, right) => Boolean(left && right && left !== right),
  ).coordinates;
  return createBorderGeometry(internalBorders, radius);
};

/** Expone los polígonos administrativos para búsquedas de estado/municipio por coordenadas. */
const getAdministrativeFeatures = (topology: AdministrativeTopology) =>
  feature<AdministrativeProperties>(topology, getAdministrativeObject(topology)) as unknown as FeatureCollection<
    Polygon | MultiPolygon,
    AdministrativeProperties
  >;

/** Obtiene los tonos presentes sin repetirlos y respeta la prioridad de gravedad definida arriba. */
const getStatusTones = (equipments: GlobeEquipmentNode[]) => {
  const presentStatuses = new Set<GlobeNodeTone>(equipments.map((equipment) => equipment.tone));
  return STATUS_TONE_ORDER.filter((tone) => presentStatuses.has(tone));
};

/**
 * Agrupa equipos reales por país, estado y municipio (o ciudad si falta municipio).
 * Sin localidad usa coordenadas redondeadas. El centro es un promedio visual;
 * un pulso de ciudad indica que al menos uno de sus equipos tiene señal reciente.
 */
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

/** Crea nodos SIM locales, sin escritura en Supabase ni pulso remoto, fuera de países con datos reales. */
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

/** Dibuja tierra como nubes de puntos y fronteras; usa mayor densidad en México y libera geometrías al salir. */
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

/** Descarga un recurso cartográfico estático; permite cancelar la petición al cambiar de vista o desmontar. */
async function loadAdministrativeTopology(path: string, signal: AbortSignal) {
  const response = await fetch(getPublicAssetUrl(path), { signal });
  if (!response.ok) {
    throw new Error(`No fue posible cargar la geografía administrativa: ${response.status}`);
  }

  return (await response.json()) as AdministrativeTopology;
}

/**
 * Añade divisiones estatales y carga municipios por estado bajo demanda.
 * Mantiene una caché local de geometrías, ajusta visibilidad según zoom y entrega
 * polígonos al grupo enfocado para mantener dentro de ellos la separación visual.
 */
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
  const lastInspectedDirectionRef = useRef<THREE.Vector3 | null>(null);
  const viewedStateCodeRef = useRef<string | null>(null);
  const municipalityLayerCacheRef = useRef(
    new Map<string, { geometry: THREE.BufferGeometry; features: AdministrativeFeatures }>(),
  );
  const [stateGeometry, setStateGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [stateFeatures, setStateFeatures] = useState<AdministrativeFeatures | null>(null);
  const [viewedStateCode, setViewedStateCode] = useState<string | null>(null);
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
  // La ciudad fijada tiene prioridad sobre el estado al que apunta actualmente la cámara.
  const activeStateCode = focusedStateCode || viewedStateCode;

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
    if (!activeStateCode) {
      return;
    }

    // Reutiliza municipios ya descargados durante esta sesión en lugar de pedirlos en cada acercamiento.
    const cachedLayer = municipalityLayerCacheRef.current.get(activeStateCode);
    if (cachedLayer) {
      let active = true;
      queueMicrotask(() => {
        if (active) {
          setMunicipalityLayer({ stateCode: activeStateCode, ...cachedLayer });
        }
      });
      return () => {
        active = false;
      };
    }

    const controller = new AbortController();
    loadAdministrativeTopology(
      `geography/mexico/municipalities/${activeStateCode}.json`,
      controller.signal,
    )
      .then((topology) => {
        const geometry = createAdministrativeBorderGeometry(topology, MUNICIPAL_BORDER_RADIUS);
        const features = getAdministrativeFeatures(topology);
        municipalityLayerCacheRef.current.set(activeStateCode, { geometry, features });
        setMunicipalityLayer({ stateCode: activeStateCode, geometry, features });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.warn(`No fue posible mostrar los municipios del estado ${activeStateCode}.`, error);
        }
      });

    return () => controller.abort();
  }, [activeStateCode]);

  useEffect(() => {
    onMunicipalityFeaturesChange(
      municipalityLayer?.stateCode === activeStateCode ? municipalityLayer.features : null,
    );
  }, [activeStateCode, municipalityLayer, onMunicipalityFeaturesChange]);

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

    if (!focusedStateCode && stateFeatures) {
      if (cameraDistance > MUNICIPAL_VIEW_DISTANCE) {
        lastInspectedDirectionRef.current = null;
        if (viewedStateCodeRef.current !== null) {
          viewedStateCodeRef.current = null;
          setViewedStateCode(null);
        }
      } else {
        const cameraDirection = camera.position.clone().normalize();
        const lastDirection = lastInspectedDirectionRef.current;

        if (!lastDirection || lastDirection.distanceToSquared(cameraDirection) > 0.000001) {
          lastInspectedDirectionRef.current = cameraDirection;
          const center = vectorToLatLng(cameraDirection);
          const viewedState = stateFeatures.features.find((state) =>
            getFeaturePolygons(state).some((polygon) =>
              pointInPolygon(center.longitude, center.latitude, polygon),
            ),
          );
          const nextStateCode = viewedState?.properties?.cve_ent || null;

          if (nextStateCode && viewedStateCodeRef.current !== nextStateCode) {
            viewedStateCodeRef.current = nextStateCode;
            setViewedStateCode(nextStateCode);
          }
        }
      }
    }

    if (municipalLayerRef.current) {
      municipalLayerRef.current.visible = Boolean(
        activeStateCode && cameraDistance <= MUNICIPAL_VIEW_DISTANCE,
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
      {municipalityLayer?.stateCode === activeStateCode ? (
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

/** Renderiza los puntos del relieve cartográfico con material propio; no son marcadores de equipos. */
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

/** Capa decorativa de brillo alrededor de la esfera, sin significado de estado operativo. */
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
            gl_FragColor = vec4(0.41, 0.87, 0.88, rim * 0.4 * pulse);
          }
        `}
      />
    </mesh>
  );
}

/** Actualiza el reloj compartido una vez por cuadro; no ejecuta sondeos ni envíos de telemetría. */
function HeartbeatClock() {
  useFrame(({ clock }) => {
    HEARTBEAT_TIME_UNIFORM.value = clock.elapsedTime;
  });

  return null;
}

/** Halo animado orientado hacia la cámara para equipos o ciudades con señal reciente. */
function HeartbeatBeacon({
  radius,
  intensity = 'equipment',
}: {
  radius: number;
  intensity?: 'equipment' | 'cluster';
}) {
  const isCluster = intensity === 'cluster';
  const ringRef = useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const innerRadius = radius * 1.01;
  const outerRadius = radius * 1.3;
  const uniforms = useMemo(
    () => ({
      uTime: HEARTBEAT_TIME_UNIFORM,
      uOpacity: { value: 0 },
      uBeat: { value: 0 },
      uInnerRadius: { value: innerRadius },
      uOuterRadius: { value: outerRadius },
    }),
    [innerRadius, outerRadius],
  );

  useFrame(() => {
    if (!ringRef.current || !materialRef.current) {
      return;
    }

    const wave = getHeartbeatWave(
      HEARTBEAT_TIME_UNIFORM.value,
      isCluster ? 0.07 : 0,
    );
    const travel = 1 - Math.pow(1 - wave.progress, 1.8);
    const scale = 0.92 + travel * (isCluster ? 2.62 : 2.82);
    ringRef.current.scale.setScalar(scale);
    ringRef.current.visible = wave.opacity > 0.01;
    materialRef.current.uniforms.uOpacity.value = wave.opacity;
    materialRef.current.uniforms.uBeat.value = getHeartbeatImpulse(
      HEARTBEAT_TIME_UNIFORM.value,
      isCluster ? 0.07 : 0,
    );
  });

  return (
    <Billboard follow>
      <mesh ref={ringRef} renderOrder={12}>
        <ringGeometry args={[innerRadius, outerRadius, 64]} />
        <shaderMaterial
          ref={materialRef}
          transparent
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          uniforms={uniforms}
          vertexShader={HEARTBEAT_RING_VERTEX_SHADER}
          fragmentShader={HEARTBEAT_RING_FRAGMENT_SHADER}
        />
      </mesh>
    </Billboard>
  );
}

/** Patrón visual de doble latido que modula el tamaño y el brillo del núcleo. */
function getHeartbeatImpulse(time: number, phaseOffset = 0) {
  const cycle = ((time * 0.58 + phaseOffset) % 1 + 1) % 1;
  const firstBeat = Math.exp(-Math.pow((cycle - 0.035) / 0.044, 2));
  const secondBeat = Math.exp(-Math.pow((cycle - 0.315) / 0.058, 2)) * 0.72;
  return Math.min(1, firstBeat + secondBeat);
}

/** Expansión y desvanecimiento del anillo en dos ondas por ciclo de animación. */
function getHeartbeatWave(time: number, phaseOffset = 0) {
  const cycle = ((time * 0.58 + phaseOffset) % 1 + 1) % 1;
  if (cycle < 0.25) {
    const progress = cycle / 0.25;
    return { progress, opacity: Math.pow(1 - progress, 0.58) };
  }
  if (cycle >= 0.29 && cycle < 0.57) {
    const progress = (cycle - 0.29) / 0.28;
    return { progress, opacity: Math.pow(1 - progress, 0.62) * 0.78 };
  }
  return { progress: 1, opacity: 0 };
}

/** Nodo individual: área invisible de clic, color de estado, pulso opcional y etiqueta de selección. */
const EquipmentPulseNode = memo(function EquipmentPulseNode({
  equipment,
  position,
  selected,
  billboardPosition,
  onHoverChange,
  onSelect,
}: {
  equipment: GlobeEquipmentNode | null;
  position: THREE.Vector3;
  selected: boolean;
  billboardPosition: HtmlPositioner;
  onHoverChange: (hovered: boolean) => void;
  onSelect: (equipmentId: string, selected: boolean) => void;
}) {
  const visualRef = useRef<THREE.Group | null>(null);
  const hitTargetRef = useRef<THREE.Mesh | null>(null);
  const coreRef = useRef<THREE.Mesh | null>(null);
  const coreMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const tone = equipment?.tone || 'muted';
  const disconnected = tone === 'muted';
  // Supremo se dibuja como anillo cian hueco orientado a la cámara; el resto como esfera sólida.
  const hollow = tone === 'supremo';
  const toneColor = useMemo(() => new THREE.Color(TONE_COLORS[tone]), [tone]);

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setBodyCursor(equipment ? 'pointer' : '');
    onHoverChange(true);
  };

  const handlePointerOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    restoreBodyCursor();
    onHoverChange(false);
  };

  // Lo comparten el área de clic 3D y el botón × de la ficha: ambos alternan la selección del equipo.
  const handleClick = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    if (equipment) {
      onSelect(equipment.id, selected);
    }
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
    const baseScale = worldUnitsPerPixel * visualRadiusPixels;
    const heartbeatImpulse = equipment?.heartbeat
      ? getHeartbeatImpulse(HEARTBEAT_TIME_UNIFORM.value)
      : 0;
    const heartbeatPulse = 1 + (0.27 + (selected ? 0.05 : 0)) * heartbeatImpulse;
    visualRef.current.scale.setScalar(baseScale);
    hitTargetRef.current.scale.setScalar(
      worldUnitsPerPixel *
        (selected ? EQUIPMENT_NODE_RADIUS_PIXELS.selectedHit : EQUIPMENT_NODE_RADIUS_PIXELS.hit),
    );
    if (coreRef.current) {
      coreRef.current.scale.setScalar((selected ? 1.18 : 1) * heartbeatPulse);
    }
    if (coreMaterialRef.current) {
      coreMaterialRef.current.color
        .copy(toneColor)
        .lerp(HEARTBEAT_HIGHLIGHT_COLOR, heartbeatImpulse * 0.64);
    }
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
      <group ref={visualRef} renderOrder={disconnected ? 8 : 16}>
        {hollow ? (
          <Billboard follow>
            <mesh ref={coreRef} scale={selected ? 1.18 : 1} renderOrder={16}>
              <ringGeometry args={[0.62, 1, 32]} />
              <meshBasicMaterial
                ref={coreMaterialRef}
                color={TONE_COLORS[tone]}
                side={THREE.DoubleSide}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          </Billboard>
        ) : (
          <mesh ref={coreRef} scale={selected ? 1.18 : 1} renderOrder={disconnected ? 8 : 16}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshBasicMaterial
              ref={coreMaterialRef}
              color={TONE_COLORS[tone]}
              transparent={disconnected}
              opacity={disconnected ? 0.5 : 1}
              depthWrite={!disconnected}
              toneMapped={false}
            />
          </mesh>
        )}
        {equipment?.heartbeat ? <HeartbeatBeacon radius={1} intensity="equipment" /> : null}
      </group>
      {selected && equipment ? (
        <Html
          center
          zIndexRange={[48, 0]}
          pointerEvents="auto"
          calculatePosition={billboardPosition}
        >
          {/* Ficha del equipo seleccionado: cristal oscuro con eyebrow, serie grande, estado y filas de contexto. */}
          <div className="equipment-globe__selected-billboard" data-tone={equipment.tone}>
            <div className="equipment-globe__selected-billboard-head">
              <span className="equipment-globe__eyebrow">Equipo seleccionado</span>
              <button
                type="button"
                className="equipment-globe__selected-billboard-close"
                aria-label={`Deseleccionar ${equipment.serial}`}
                onClick={handleClick}
              >
                ×
              </button>
            </div>
            <strong>{equipment.serial}</strong>
            <span className="equipment-globe__selected-billboard-status">
              <i aria-hidden="true" />
              {TONE_LABELS[equipment.tone]}
            </span>
            <dl>
              <div>
                <dt>Modelo</dt>
                <dd>{equipment.model}</dd>
              </div>
              <div>
                <dt>Cliente</dt>
                <dd title={equipment.clientName}>{equipment.clientName}</dd>
              </div>
              <div>
                <dt>Ubicación</dt>
                <dd title={formatEquipmentPlace(equipment)}>{formatEquipmentPlace(equipment)}</dd>
              </div>
            </dl>
          </div>
        </Html>
      ) : null}
    </group>
  );
});

/**
 * Cambia entre un marcador de localidad y sus equipos según foco, zoom o puntero.
 * La vista previa muestra hasta siete nodos y la vista detallada hasta 72;
 * la bandeja del componente principal permite consultar el resto de la agrupación.
 */
const CityCluster = memo(function CityCluster({
  cluster,
  expansionMode,
  selectedEquipmentId,
  municipalityFeatures,
  billboardPosition,
  tooltipPosition,
  onHover,
  onFocus,
  onSelectEquipment,
}: {
  cluster: CityClusterData;
  expansionMode: 'none' | 'preview' | 'automatic' | 'focused';
  selectedEquipmentId: string | null;
  municipalityFeatures: AdministrativeFeatures | null;
  billboardPosition: HtmlPositioner;
  tooltipPosition: HtmlPositioner;
  onHover: (clusterId: string | null) => void;
  onFocus: (clusterId: string) => void;
  onSelectEquipment: (equipmentId: string | null) => void;
}) {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group | null>(null);
  const markerGroupRef = useRef<THREE.Group | null>(null);
  const nodeVisualRef = useRef<THREE.Group | null>(null);
  const nodeHitTargetRef = useRef<THREE.Mesh | null>(null);
  const nodeCoreRef = useRef<THREE.Mesh | null>(null);
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
    // La coordenada prevalece si el nombre de localidad difiere del catálogo
    // administrativo o corresponde a una zona metropolitana vecina.
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
      const markerRadius = equipment?.tone === 'muted'
        ? DISCONNECTED_EQUIPMENT_MARKER_RADIUS
        : EQUIPMENT_MARKER_RADIUS;
      const anchor = latLngToVector(latitude, longitude, markerRadius);
      const coordinateKey = `${latitude.toFixed(5)}:${longitude.toFixed(5)}`;
      const occurrenceIndex = coordinateOccurrences.get(coordinateKey) || 0;
      coordinateOccurrences.set(coordinateKey, occurrenceIndex + 1);
      const duplicateCount = coordinateCounts.get(coordinateKey) || 0;
      if (duplicateCount === 1) {
        return { anchor, position: anchor.clone() };
      }

      // Las coordenadas de localidad repetidas son anclas, no domicilios distintos.
      // Se separan visualmente los equipos alrededor del ancla para poder elegirlos;
      // el desplazamiento no se guarda como ubicación física del analizador.
      const centeredIndex = occurrenceIndex - (duplicateCount - 1) / 2;
      const baseAngle = centeredIndex * Math.PI * (3 - Math.sqrt(5));
      const distanceKm = Math.sqrt(Math.abs(centeredIndex) + 0.42) * 2.15;
      let visualLatitude = latitude;
      let visualLongitude = longitude;

      // Prueba hasta 24 posiciones, evitando salir del municipio o de México cuando aplica.
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

      const visualPosition = latLngToVector(visualLatitude, visualLongitude, markerRadius);

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
  const disconnectedCluster = cluster.tones.every((tone) => tone === 'muted');

  useFrame(({ clock, size }) => {
    if (!groupRef.current) {
      return;
    }

    const cameraDirection = camera.position.clone().normalize();
    // Oculta ciudades del hemisferio posterior para que no se vean a través de la esfera.
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
      if (nodeCoreRef.current) {
        const heartbeatPulse = cluster.heartbeat
          ? 1 + (selected ? 0.28 : 0.24) * getHeartbeatImpulse(HEARTBEAT_TIME_UNIFORM.value, 0.07)
          : 1;
        nodeCoreRef.current.scale.setScalar(heartbeatPulse);
      }
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
      if (cluster.heartbeat) {
        const heartbeatImpulse = getHeartbeatImpulse(HEARTBEAT_TIME_UNIFORM.value, 0.07);
        nodeMaterialRef.current.color.lerp(
          HEARTBEAT_HIGHLIGHT_COLOR,
          heartbeatImpulse * 0.58,
        );
      }
    }
  });

  const detailed = expansionMode === 'focused' || expansionMode === 'automatic';
  const expansionCount = detailed ? 72 : expansionMode === 'preview' ? 7 : 0;
  const displayEquipments = (cluster.equipments.length
    ? cluster.equipments.slice(0, equipmentLayout.length)
    : equipmentLayout.map(() => null as GlobeEquipmentNode | null)
  ).slice(0, expansionCount);

  const keepHover = useCallback(() => {
    if (hoverLeaveTimeoutRef.current !== null) {
      window.clearTimeout(hoverLeaveTimeoutRef.current);
      hoverLeaveTimeoutRef.current = null;
    }
    onHover(cluster.id);
  }, [cluster.id, onHover]);

  // Una espera breve evita cerrar la vista previa al cruzar entre marcadores de la misma ciudad.
  const releaseHover = useCallback(() => {
    if (hoverLeaveTimeoutRef.current !== null) {
      window.clearTimeout(hoverLeaveTimeoutRef.current);
    }
    hoverLeaveTimeoutRef.current = window.setTimeout(() => {
      onHover(null);
      hoverLeaveTimeoutRef.current = null;
    }, 140);
  }, [onHover]);

  const handleNodeHover = useCallback(
    (hovered: boolean) => {
      if (hovered) {
        keepHover();
      } else {
        releaseHover();
      }
    },
    [keepHover, releaseHover],
  );

  const handleNodeSelect = useCallback(
    (equipmentId: string, isSelected: boolean) => onSelectEquipment(isSelected ? null : equipmentId),
    [onSelectEquipment],
  );

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
                setBodyCursor('pointer');
                keepHover();
              }}
              onPointerOut={(event: ThreeEvent<PointerEvent>) => {
                event.stopPropagation();
                restoreBodyCursor();
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
              <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
            </mesh>
            <group ref={nodeVisualRef}>
              <mesh ref={nodeCoreRef} renderOrder={disconnectedCluster ? 8 : 16}>
                <sphereGeometry args={[nodeSize, 22, 22]} />
                <meshBasicMaterial
                  ref={nodeMaterialRef}
                  color={TONE_COLORS[cluster.tone]}
                  transparent={disconnectedCluster}
                  opacity={disconnectedCluster ? 0.5 : 1}
                  depthWrite={!disconnectedCluster}
                  toneMapped={false}
                />
              </mesh>
              {cluster.heartbeat ? <HeartbeatBeacon radius={nodeSize} intensity="cluster" /> : null}
              <Billboard follow>
                <mesh scale={selected ? 1.62 : 1.22}>
                  <ringGeometry args={[nodeSize * 1.08, nodeSize * 1.18, 32]} />
                  <meshBasicMaterial
                    color={selected ? '#ffffff' : '#b8e6e7'}
                    transparent
                    opacity={selected ? 0.88 : 0.26}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                  />
                </mesh>
              </Billboard>
            </group>
          </>
        ) : null}
        {expansionMode === 'preview' && !selected ? (
          <Html
            center
            className="equipment-globe__city-tooltip"
            zIndexRange={[20, 0]}
            pointerEvents="none"
            calculatePosition={tooltipPosition}
          >
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
              billboardPosition={billboardPosition}
              onHoverChange={handleNodeHover}
              onSelect={handleNodeSelect}
            />
          ))
        : null}
    </group>
  );
});

/** Arcos decorativos hacia ciudades simuladas: no representan conexiones ni tráfico real de red. */
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
          color={index % 3 === 0 ? '#69dde0' : '#9bdfe1'}
          lineWidth={0.55}
          transparent
          opacity={index % 3 === 0 ? 0.24 : 0.16}
          depthWrite={false}
        />
      ))}
    </group>
  );
}

/** Compone las capas 3D y controla cámara, zoom, enfoque de ciudad y expansión de equipos. */
function GlobeScene({
  clusters,
  initialView,
  selectedEquipmentId,
  hoveredClusterId,
  focusedClusterId,
  cameraDistance,
  resetVersion,
  zoomRequest,
  paused,
  viewShift,
  showNetworkArcs,
  billboardPosition,
  tooltipPosition,
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
  paused: boolean;
  /** Desplazamiento horizontal del encuadre en px (positivo = país a la derecha). */
  viewShift: number;
  showNetworkArcs: boolean;
  billboardPosition: HtmlPositioner;
  tooltipPosition: HtmlPositioner;
  onHoverCluster: (clusterId: string | null) => void;
  onFocusCluster: (clusterId: string) => void;
  onSelectEquipment: (equipmentId: string | null) => void;
  onDistanceChange: (distance: number) => void;
  onCollapseFocus: () => void;
}) {
  const { camera } = useThree();
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  // Encuadre desplazado: el frustum se corre a la izquierda y el país aparece centrado en la zona visible
  // (el riel cubre la franja izquierda). Se vuelve a aplicar al redimensionar porque usa el tamaño completo.
  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    if (viewShift) perspective.setViewOffset(size.width, size.height, -viewShift, 0, size.width, size.height);
    else perspective.clearViewOffset();
    perspective.updateProjectionMatrix();
    invalidate();
  }, [camera, invalidate, size.height, size.width, viewShift]);
  // En pausa (explorador sobre el globo) los efectos de cámara no se ejecutan: el lienzo rinde bajo demanda.
  const pausedRef = useRef(paused);
  const cameraInitializedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
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

    // Reduce la sensibilidad cerca de la superficie para facilitar la selección de equipos.
    const altitude = Math.max(camera.position.length() - GLOBE_RADIUS, 0);
    const altitudeFactor = THREE.MathUtils.clamp((altitude - 0.12) / 3.8, 0, 1);
    controlsRef.current.rotateSpeed = THREE.MathUtils.lerp(0.004, 0.48, altitudeFactor);
    controlsRef.current.zoomSpeed = THREE.MathUtils.lerp(0.08, 0.85, altitudeFactor);
    controlsRef.current.dampingFactor = THREE.MathUtils.lerp(0.2, 0.055, altitudeFactor);
  });

  useEffect(() => {
    if (pausedRef.current && cameraInitializedRef.current) {
      return;
    }
    cameraInitializedRef.current = true;
    camera.position.set(initialCameraX, initialCameraY, initialCameraZ);
    controlsRef.current?.target.set(0, 0, 0);
    controlsRef.current?.update();
    onDistanceChange(camera.position.length());
  }, [camera, initialCameraX, initialCameraY, initialCameraZ, initialView.key, onDistanceChange, resetVersion]);

  useEffect(() => {
    if (!zoomRequest.version || pausedRef.current) {
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
    if (!focusedClusterId || !focusedCluster || pausedRef.current) {
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
      {showNetworkArcs && !focusedCluster ? <NetworkArcs clusters={clusters} /> : null}
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
          billboardPosition={billboardPosition}
          tooltipPosition={tooltipPosition}
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

/** Combina grupos reales y de demostración; se memoiza por clave estructural para que un corte igual no reconstruya nada. */
const buildClusters = (
  equipments: GlobeEquipmentNode[],
  countryEquipments: GlobeEquipmentNode[],
  simulatedCoverage: boolean,
) => [...buildCityClusters(equipments), ...(simulatedCoverage ? buildSimulatedClusters(countryEquipments) : [])];

const clustersStructuralKey = (
  equipments: GlobeEquipmentNode[],
  countryEquipments: GlobeEquipmentNode[],
  simulatedCoverage: boolean,
) =>
  `${equipments.map((equipment) => `${equipment.id}|${equipment.tone}|${equipment.heartbeat ? 1 : 0}`).join(',')}#${
    countryEquipments.length
  }#${simulatedCoverage ? 1 : 0}`;

const pluralize = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;

/** Contenedor público: combina grupos reales/demostración y coordina lienzo, controles y ficha HTML. */
function GlobalEquipmentGlobe({
  equipments,
  countryEquipments,
  selectedEquipmentId,
  onSelectEquipment,
  paused = false,
  showSimulatedCoverage = true,
}: GlobalEquipmentGlobeProps) {
  const coarsePointer = useMediaQuery(COARSE_POINTER_QUERY);
  const landscapeCompact = useMediaQuery(LANDSCAPE_COMPACT_QUERY);
  const defaultCountryView = useMemo(() => getCountryView(countryEquipments), [countryEquipments]);
  const [resetVersion, setResetVersion] = useState(0);
  const [cameraDistance, setCameraDistance] = useState(() =>
    new THREE.Vector3(...defaultCountryView.cameraPosition).length(),
  );
  // La distancia de cámara cambia en cada frame de órbita; solo se publica al cruzar un umbral útil
  // (niveles geográficos, expansión automática) o un salto apreciable, no por cada píxel.
  const lastPublishedDistanceRef = useRef(cameraDistance);
  const publishCameraDistance = useCallback((distance: number) => {
    const previous = lastPublishedDistanceRef.current;
    const crossed = [MUNICIPAL_VIEW_DISTANCE, STATE_VIEW_DISTANCE, AUTOMATIC_EQUIPMENT_DISTANCE, FOCUS_COLLAPSE_DISTANCE]
      .some((threshold) => (previous <= threshold) !== (distance <= threshold));
    if (!crossed && Math.abs(distance - previous) < 0.035) return;
    lastPublishedDistanceRef.current = distance;
    setCameraDistance(distance);
  }, []);
  // Fuera de pantalla o con la pestaña oculta el lienzo pasa a renderizar bajo demanda.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [inViewport, setInViewport] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(() => (typeof document === 'undefined' ? true : !document.hidden));
  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => setInViewport(entries[0]?.isIntersecting ?? true), { threshold: 0.05 });
    observer.observe(element);
    const onVisibility = () => setDocumentVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  const liveFrameloop = !paused && inViewport && documentVisible;

  // Margen seguro del HUD: se lee de las custom properties del contenedor y se actualiza con su tamaño.
  // El contenedor no fija su altura (la da el escenario padre): el envoltorio del lienzo es absolute/inset 0
  // y React Three Fiber observa ese envoltorio, así que el globo sigue cualquier cambio de alto sin saltos.
  const [hudSafeFrame, setHudSafeFrame] = useState<HudSafeFrame>(DEFAULT_HUD_SAFE_FRAME);
  const [viewShift, setViewShift] = useState(0);
  const refreshHudSafeFrame = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;
    const next = readHudSafeFrame(element);
    setHudSafeFrame((previous) => (isSameSafeFrame(previous, next) ? previous : next));
    setViewShift(readViewShift(element));
  }, []);
  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      // Los anillos de alcance se dibujan en píxeles sobre el lado menor del lienzo (sin viewBox escalado).
      const box = entries[0]?.contentRect;
      if (box) {
        element.style.setProperty('--globe-ring-size', `${Math.round(Math.min(box.width, box.height))}px`);
      }
      refreshHudSafeFrame();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [refreshHudSafeFrame]);
  const billboardPosition = useMemo(() => createBillboardPositioner(hudSafeFrame), [hudSafeFrame]);
  const tooltipPosition = useMemo(() => createTooltipPositioner(hudSafeFrame), [hudSafeFrame]);

  // Cobertura simulada: la decide el padre (menú Acciones) y se persiste allí.
  const simulatedCoverage = showSimulatedCoverage;

  const [hoveredClusterId, setHoveredClusterId] = useState<string | null>(null);
  const [focusedClusterId, setFocusedClusterId] = useState<string | null>(null);
  const [selectedSimulatedEquipmentId, setSelectedSimulatedEquipmentId] = useState<string | null>(null);
  const [zoomRequest, setZoomRequest] = useState<{ version: number; direction: 1 | -1 }>({
    version: 0,
    direction: 1,
  });
  // Clusters memoizados por clave estructural (ids + tono + latido + contexto): un corte con los mismos
  // valores conserva la identidad y no vuelve a construir las 33 ciudades simuladas ni sus nodos.
  const clustersKey = clustersStructuralKey(equipments, countryEquipments, simulatedCoverage);
  const [clusterCache, setClusterCache] = useState(() => ({
    key: clustersKey,
    clusters: buildClusters(equipments, countryEquipments, simulatedCoverage),
  }));
  if (clusterCache.key !== clustersKey) {
    setClusterCache({ key: clustersKey, clusters: buildClusters(equipments, countryEquipments, simulatedCoverage) });
  }
  const clusters = clusterCache.clusters;

  // Los indicadores de equipos y ubicaciones reales no suman la cobertura de demostración.
  // La fila de ciudades (camino accesible a los marcadores) ordena por gravedad y luego por tamaño.
  const realClusters = useMemo(
    () =>
      clusters
        .filter((cluster) => !cluster.simulated)
        .sort(
          (left, right) =>
            STATUS_TONE_ORDER.indexOf(left.tone) - STATUS_TONE_ORDER.indexOf(right.tone) || right.count - left.count,
        ),
    [clusters],
  );
  const realLocationCount = realClusters.length;
  const effectiveSelectedEquipmentId = selectedSimulatedEquipmentId || selectedEquipmentId;
  const selectedEquipment = useMemo(
    () =>
      effectiveSelectedEquipmentId
        ? clusters
            .flatMap((cluster) => cluster.equipments)
            .find((equipment) => equipment.id === effectiveSelectedEquipmentId) || null
        : null,
    [clusters, effectiveSelectedEquipmentId],
  );
  const focusedCluster = focusedClusterId
    ? clusters.find((cluster) => cluster.id === focusedClusterId) || null
    : null;
  const focusedSelectedEquipment =
    focusedCluster?.equipments.find((equipment) => equipment.id === effectiveSelectedEquipmentId) || null;
  // La bandeja cambia el margen seguro (clase --has-dock) sin redimensionar el contenedor: se vuelve a leer aquí.
  const hasDock = Boolean(focusedCluster);
  useEffect(() => {
    refreshHudSafeFrame();
  }, [hasDock, refreshHudSafeFrame]);
  // En pausa no hay vista previa de ciudad: el padre bloquea el puntero sobre el globo.
  const effectiveHoveredClusterId = paused ? null : hoveredClusterId;
  const geographyLevel =
    defaultCountryView.key === String(MEXICO_FEATURE?.id) &&
    cameraDistance <= MUNICIPAL_VIEW_DISTANCE
      ? 'División municipal'
      : defaultCountryView.key === String(MEXICO_FEATURE?.id) && cameraDistance <= STATE_VIEW_DISTANCE
        ? 'División estatal'
        : 'División por países';

  // La selección simulada permanece aquí; solo los IDs reales se propagan a la ficha del padre.
  const handleSelectEquipment = useCallback(
    (equipmentId: string | null) => {
      if (equipmentId?.startsWith('simulated-equipment-')) {
        setSelectedSimulatedEquipmentId(equipmentId);
        return;
      }

      setSelectedSimulatedEquipmentId(null);
      onSelectEquipment(equipmentId);
    },
    [onSelectEquipment],
  );

  const handleCollapseFocus = useCallback(() => {
    setFocusedClusterId(null);
    setHoveredClusterId(null);
    handleSelectEquipment(null);
  }, [handleSelectEquipment]);

  // Fila de ciudades: fija la ciudad (misma acción que el marcador) o, si ya estaba fijada, reencuadra el país.
  // Gestos táctiles: el lienzo deja pasar el desplazamiento vertical (pan-y); un arrastre claramente
  // horizontal (umbral de 8 px) o el chip "Girar libremente" bloquean el desplazamiento para girar.
  const touchGestureRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [gestureRotate, setGestureRotate] = useState(false);
  const [freeRotate, setFreeRotate] = useState(false);
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    touchGestureRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = touchGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const deltaX = Math.abs(event.clientX - gesture.x);
    const deltaY = Math.abs(event.clientY - gesture.y);
    if (deltaX >= TOUCH_ROTATE_THRESHOLD_PX && deltaX > deltaY * 1.5) {
      touchGestureRef.current = null;
      setGestureRotate(true);
    }
  };
  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    touchGestureRef.current = null;
    setGestureRotate(false);
  };
  useEffect(() => {
    if (!freeRotate) return;
    // Tocar fuera del globo devuelve el desplazamiento normal de la página.
    const onDocumentPointerDown = (event: PointerEvent) => {
      const element = containerRef.current;
      if (element && event.target instanceof Node && !element.contains(event.target)) {
        setFreeRotate(false);
      }
    };
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    return () => document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  }, [freeRotate]);
  const touchAction: 'pan-y' | 'none' = freeRotate || gestureRotate ? 'none' : 'pan-y';
  // OrbitControls escribe touch-action:none en línea sobre el lienzo al conectarse; aquí se impone pan-y
  // (o none bajo demanda del gesto/chip) y se vigila el atributo por si el control vuelve a escribirlo.
  useEffect(() => {
    const canvas = containerRef.current?.querySelector('canvas');
    if (!canvas) return;
    const apply = () => {
      if (canvas.style.touchAction !== touchAction) {
        canvas.style.touchAction = touchAction;
      }
    };
    apply();
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(apply);
    observer.observe(canvas, { attributes: true, attributeFilter: ['style'] });
    return () => observer.disconnect();
  }, [touchAction]);

  // El cursor del documento se restaura al pausar y al desmontar, no solo al salir de un nodo.
  useEffect(() => {
    if (paused) restoreBodyCursor();
  }, [paused]);
  useEffect(() => () => restoreBodyCursor(), []);

  const countryLabel = defaultCountryView.label;
  // Pista corta para horizontal compacto (el escenario oculta ahí el pie del mapa): cabe en una línea del HUD.
  const hintText = focusedCluster
    ? 'Las líneas vuelven a la coordenada real · elige en el mapa o en la bandeja'
    : 'Arrastra para girar · acerca para ver equipos en su ubicación';
  const className = [
    'equipment-globe',
    selectedEquipment ? 'equipment-globe--has-selection' : '',
    focusedCluster ? 'equipment-globe--has-dock' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={containerRef}
      className={className}
      data-paused={paused ? 'true' : undefined}
      // Bajo el explorador el globo queda difuminado y sin puntero; inert lo saca también del teclado y del lector.
      inert={paused ? true : undefined}
      data-free-rotate={freeRotate ? 'true' : undefined}
      data-gesture={gestureRotate ? 'rotate' : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      {/* Lienzo WebGL: limita la densidad de píxeles para equilibrar nitidez y carga de renderizado. */}
      <Canvas
        className="equipment-globe__canvas"
        style={CANVAS_WRAPPER_STYLE}
        // En pausa, fuera de pantalla o con la pestaña oculta el mapa solo responde a los controles.
        frameloop={liveFrameloop ? 'always' : 'demand'}
        dpr={coarsePointer ? DPR_COARSE_POINTER : DPR_FINE_POINTER}
        camera={{ position: MEXICO_CAMERA_POSITION, fov: 44, near: 0.001, far: 100 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onPointerMissed={() => {
          restoreBodyCursor();
          setHoveredClusterId(null);
          // Mientras el explorador va sobre el globo (pausa), un clic en el vacío no pierde la selección.
          if (!paused) handleSelectEquipment(null);
        }}
      >
        <GlobeScene
          clusters={clusters}
          initialView={defaultCountryView}
          selectedEquipmentId={effectiveSelectedEquipmentId}
          hoveredClusterId={effectiveHoveredClusterId}
          focusedClusterId={focusedClusterId}
          cameraDistance={cameraDistance}
          resetVersion={resetVersion}
          zoomRequest={zoomRequest}
          paused={paused}
          viewShift={viewShift}
          showNetworkArcs={simulatedCoverage}
          billboardPosition={billboardPosition}
          tooltipPosition={tooltipPosition}
          onHoverCluster={setHoveredClusterId}
          onFocusCluster={setFocusedClusterId}
          onSelectEquipment={handleSelectEquipment}
          onDistanceChange={publishCameraDistance}
          onCollapseFocus={handleCollapseFocus}
        />
      </Canvas>

      {/* Marco instrumental: brackets de esquina y anillos de alcance, sin interacción. */}
      <div className="equipment-globe__frame mon-brackets" aria-hidden="true">
        <i className="mon-brackets__i" />
      </div>
      <svg className="equipment-globe__ring" aria-hidden="true" focusable="false">
        {/* Gira solo el grupo interior: la caja del svg nunca sale del lienzo. Radios por CSS (--globe-ring-size). */}
        <g className="equipment-globe__ring-orbit">
          <circle cx="50%" cy="50%" r="120" />
          <circle cx="50%" cy="50%" r="100" />
        </g>
      </svg>


      <div className="equipment-globe__hud equipment-globe__hud--left">
        <span className="equipment-globe__scope-dot mon-beat" />
        <div>
          <strong>{countryLabel} en vivo</strong>
          <span>
            {pluralize(realLocationCount, 'ubicación', 'ubicaciones')} ·{' '}
            {pluralize(equipments.length, 'equipo', 'equipos')}
          </span>
          <small className="equipment-globe__geo-level">{geographyLevel}</small>
          {landscapeCompact ? <small className="equipment-globe__hint">{hintText}</small> : null}
        </div>
      </div>

      <div className="equipment-globe__hud equipment-globe__hud--right" role="group" aria-label="Controles del globo">
        <span>
          Vista {focusedCluster || cameraDistance <= AUTOMATIC_EQUIPMENT_DISTANCE ? 'por equipo' : 'por ciudad'}
        </span>
        <button
          type="button"
          aria-label="Alejar globo"
          onClick={() => setZoomRequest((current) => ({ version: current.version + 1, direction: 1 }))}
        >
          −
        </button>
        <button
          type="button"
          aria-label={`Reencuadrar ${countryLabel}`}
          onClick={() => {
            setFocusedClusterId(null);
            setHoveredClusterId(null);
            setSelectedSimulatedEquipmentId(null);
            onSelectEquipment(null);
            setResetVersion((current) => current + 1);
          }}
        >
          {countryLabel}
        </button>
        {selectedEquipment ? (
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

      {/* Bandeja de todos los equipos de la ciudad fijada, incluso los no dibujados por el límite visual. */}
      {focusedCluster ? (
        <section className="equipment-globe__equipment-dock" aria-label={`Equipos en ${focusedCluster.city}`}>
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
            <small>{pluralize(focusedCluster.count, 'equipo', 'equipos')}</small>
          </div>
          <ul className="equipment-globe__equipment-dock-list">
            {focusedCluster.equipments.map((equipment) => {
              const isSelected = equipment.id === effectiveSelectedEquipmentId;
              return (
                <li key={equipment.id}>
                  <button
                    type="button"
                    className={isSelected ? 'is-selected' : undefined}
                    aria-pressed={isSelected}
                    onClick={() => handleSelectEquipment(isSelected ? null : equipment.id)}
                  >
                    <i
                      data-tone={equipment.tone}
                      data-heartbeat={equipment.heartbeat ? 'true' : 'false'}
                      title={TONE_LABELS[equipment.tone]}
                    />
                    <strong>{equipment.serial}</strong>
                    <span>{equipment.model}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {coarsePointer ? (
        <div className="equipment-globe__chips">
          <button
            type="button"
            className="equipment-globe__gesture-toggle mon-chip"
            data-tone={freeRotate ? 'ok' : 'muted'}
            aria-pressed={freeRotate}
            onClick={() => setFreeRotate((current) => !current)}
          >
            Girar libremente
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default memo(GlobalEquipmentGlobe);
