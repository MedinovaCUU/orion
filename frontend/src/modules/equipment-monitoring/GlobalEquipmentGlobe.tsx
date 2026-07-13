import { Billboard, Html, Line, OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import worldAtlasRaw from 'world-atlas/countries-110m.json?raw';

export type GlobeNodeTone = 'ok' | 'warning' | 'fatal' | 'muted' | 'supremo';

export interface GlobeEquipmentNode {
  id: string;
  serial: string;
  clientName: string;
  model: string;
  status: 'ok' | 'warning' | 'fatal';
  tone: GlobeNodeTone;
  heartbeat: boolean;
  city: string | null;
  municipality: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
}

interface GlobalEquipmentGlobeProps {
  equipments: GlobeEquipmentNode[];
  selectedEquipmentId: string | null;
  onSelectEquipment: (equipmentId: string | null) => void;
}

interface CityClusterData {
  id: string;
  city: string;
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

const GLOBE_RADIUS = 2;
const CLOSE_VIEW_DISTANCE = 3.65;
const FOCUS_COLLAPSE_DISTANCE = 4.15;
const MIN_CAMERA_DISTANCE = 2.018;
const MEXICO_CAMERA_POSITION: [number, number, number] = [-1.15, 2.42, 5.42];
const STATUS_TONE_ORDER: GlobeNodeTone[] = ['ok', 'warning', 'fatal'];

const TONE_COLORS: Record<GlobeNodeTone, string> = {
  fatal: '#ff667c',
  warning: '#ffca68',
  ok: '#38d8bd',
  supremo: '#63a9ff',
  muted: '#9eb4c4',
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
const MEXICO_GEOMETRY = WORLD_COUNTRIES.geometries.find((geometry) => String(geometry.id) === '484');
const MEXICO_BORDER_LINES = MEXICO_GEOMETRY ? mesh(WORLD_TOPOLOGY, MEXICO_GEOMETRY).coordinates : [];
const MEXICO_FEATURE = COUNTRY_FEATURES.features.find((country) => String(country.id) === '484');

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

const getFeaturePolygons = (country: Feature<Polygon | MultiPolygon, CountryProperties>) =>
  country.geometry.type === 'Polygon' ? [country.geometry.coordinates] : country.geometry.coordinates;

const isPointInMexico = (longitude: number, latitude: number) =>
  Boolean(
    MEXICO_FEATURE &&
      getFeaturePolygons(MEXICO_FEATURE).some((polygon) => pointInPolygon(longitude, latitude, polygon)),
  );

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

const getStatusTones = (equipments: GlobeEquipmentNode[]) => {
  const presentStatuses = new Set<GlobeNodeTone>(equipments.map((equipment) => equipment.status));
  return STATUS_TONE_ORDER.filter((tone) => presentStatuses.has(tone));
};

const buildCityClusters = (equipments: GlobeEquipmentNode[]): CityClusterData[] => {
  const groups = new Map<string, GlobeEquipmentNode[]>();

  equipments.forEach((equipment) => {
    const locality = equipment.city || equipment.municipality;
    const key = locality
      ? `${normalizeGroupKey(equipment.state || 'sin-estado')}:${normalizeGroupKey(locality)}`
      : `${equipment.latitude.toFixed(3)}:${equipment.longitude.toFixed(3)}`;
    const current = groups.get(key) || [];
    current.push(equipment);
    groups.set(key, current);
  });

  return Array.from(groups.entries()).map(([key, cityEquipments]) => {
    const anchor = cityEquipments[0];
    const latitude = cityEquipments.reduce((sum, equipment) => sum + equipment.latitude, 0) / cityEquipments.length;
    const longitude = cityEquipments.reduce((sum, equipment) => sum + equipment.longitude, 0) / cityEquipments.length;
    const localityNames = new Set(
      cityEquipments.map((equipment) => equipment.city || equipment.municipality || equipment.state).filter(Boolean),
    );
    const tones = getStatusTones(cityEquipments);

    return {
      id: `mx-${key}`,
      city:
        localityNames.size === 1
          ? anchor.city || anchor.municipality || anchor.state || 'Mexico'
          : anchor.state || 'Ubicacion agrupada',
      country: 'Mexico',
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

const buildSimulatedClusters = (): CityClusterData[] =>
  SIMULATED_CITIES.map((city) => {
    const clusterKey = normalizeGroupKey(`${city.country}-${city.city}`);
    const equipments = Array.from({ length: Math.min(city.count, 24) }, (_, index): GlobeEquipmentNode => ({
      id: `simulated-equipment-${clusterKey}-${index}`,
      serial: `SIM-${clusterKey.replaceAll('-', '').slice(0, 8).toUpperCase()}-${String(index + 1).padStart(3, '0')}`,
      clientName: `Cobertura simulada · ${city.city}`,
      model: SIMULATED_MODELS[index % SIMULATED_MODELS.length],
      status: city.tone === 'warning' && index === 0 ? 'warning' : 'ok',
      tone: index === 0 ? city.tone : index % 5 === 0 ? 'supremo' : 'ok',
      heartbeat: false,
      city: city.city,
      municipality: city.city,
      state: null,
      latitude: city.latitude,
      longitude: city.longitude,
    }));

    return {
      id: `demo-${clusterKey}`,
      city: city.city,
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

function WorldGeography() {
  const { worldPoints, mexicoPoints, worldBorders, mexicoBorders } = useMemo(() => {
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

            const point = latLngToVector(latitude, longitude, GLOBE_RADIUS + (isMexico ? 0.04 : 0.025));
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
      worldBorders: createBorderGeometry(WORLD_BORDER_LINES, GLOBE_RADIUS + 0.075),
      mexicoBorders: createBorderGeometry(MEXICO_BORDER_LINES, GLOBE_RADIUS + 0.1),
    };
  }, []);

  useEffect(
    () => () => {
      worldPoints.dispose();
      mexicoPoints.dispose();
      worldBorders.dispose();
      mexicoBorders.dispose();
    },
    [mexicoBorders, mexicoPoints, worldBorders, worldPoints],
  );

  return (
    <>
      <GlobePointCloud geometry={worldPoints} color="#75b9c3" pixelSize={2.4} opacity={0.78} />
      <GlobePointCloud geometry={mexicoPoints} color="#38e2c5" pixelSize={3.8} opacity={1} />
      <lineSegments geometry={worldBorders} renderOrder={4}>
        <lineBasicMaterial color="#a1e4e8" transparent opacity={0.82} depthWrite={false} toneMapped={false} />
      </lineSegments>
      <lineSegments geometry={mexicoBorders} renderOrder={5}>
        <lineBasicMaterial color="#6ffff0" transparent opacity={1} depthWrite={false} toneMapped={false} />
      </lineSegments>
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
    <mesh scale={1.045}>
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
  const groupRef = useRef<THREE.Group | null>(null);
  const ringRef = useRef<THREE.Mesh | null>(null);
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

  useFrame(({ camera, clock }) => {
    if (!groupRef.current) {
      return;
    }

    const markerScale = THREE.MathUtils.clamp(camera.position.distanceTo(position) / 3.2, 0.008, 1.05);
    groupRef.current.scale.setScalar(markerScale);
    if (!ringRef.current) {
      return;
    }

    const seed = equipment?.serial.charCodeAt(equipment.serial.length - 1) || 3;
    const wave = (clock.elapsedTime * 0.8 + seed * 0.11) % 1;
    ringRef.current.scale.setScalar(0.7 + wave * 1.6);
    const ringMaterial = ringRef.current.material as THREE.MeshBasicMaterial;
    ringMaterial.opacity = (1 - wave) * (equipment?.heartbeat ? 0.72 : 0.24);
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <sphereGeometry args={[selected ? 0.032 : 0.026, 14, 14]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[selected ? 0.019 : 0.014, 16, 16]} />
        <meshBasicMaterial color={TONE_COLORS[tone]} toneMapped={false} />
      </mesh>
      {equipment?.heartbeat ? (
        <Billboard follow>
          <mesh ref={ringRef}>
            <ringGeometry args={[0.022, 0.029, 24]} />
            <meshBasicMaterial
              color={TONE_COLORS.ok}
              transparent
              opacity={0.5}
              side={THREE.DoubleSide}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </Billboard>
      ) : null}
      {selected && equipment ? (
        <Html center className="equipment-globe__equipment-tooltip" zIndexRange={[30, 0]}>
          <strong>{equipment.serial}</strong>
          <span>{equipment.model}</span>
          <small>{equipment.clientName}</small>
        </Html>
      ) : null}
    </group>
  );
}

function CityCluster({
  cluster,
  expansionMode,
  selectedEquipmentId,
  onHover,
  onFocus,
  onSelectEquipment,
}: {
  cluster: CityClusterData;
  expansionMode: 'none' | 'preview' | 'focused';
  selectedEquipmentId: string | null;
  onHover: (clusterId: string | null) => void;
  onFocus: (clusterId: string) => void;
  onSelectEquipment: (equipmentId: string | null) => void;
}) {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group | null>(null);
  const markerGroupRef = useRef<THREE.Group | null>(null);
  const pulseRef = useRef<THREE.Mesh | null>(null);
  const nodeMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const hoverLeaveTimeoutRef = useRef<number | null>(null);
  const position = useMemo(
    () => latLngToVector(cluster.latitude, cluster.longitude, GLOBE_RADIUS + 0.035),
    [cluster.latitude, cluster.longitude],
  );
  const equipmentLayout = useMemo(() => {
    const visibleCount = Math.min(cluster.equipments.length || cluster.count, 72);
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
      const anchor = latLngToVector(latitude, longitude, GLOBE_RADIUS + 0.058);
      const coordinateKey = `${latitude.toFixed(5)}:${longitude.toFixed(5)}`;
      const occurrenceIndex = coordinateOccurrences.get(coordinateKey) || 0;
      coordinateOccurrences.set(coordinateKey, occurrenceIndex + 1);
      if ((coordinateCounts.get(coordinateKey) || 0) === 1 || occurrenceIndex === 0) {
        return { anchor, position: anchor.clone() };
      }

      const ring = Math.floor(Math.sqrt(occurrenceIndex));
      const slot = occurrenceIndex - ring * ring;
      const slots = ring * 2 + 1;
      const baseAngle = (slot / slots) * Math.PI * 2 + ring * 0.58;
      const distanceKm = 0.18 + ring * 0.22;
      let visualLatitude = latitude;
      let visualLongitude = longitude;

      for (let attempt = 0; attempt < 12; attempt += 1) {
        const angle = baseAngle + attempt * (Math.PI / 6);
        const candidateLatitude = latitude + (Math.cos(angle) * distanceKm) / 111.32;
        const candidateLongitude =
          longitude +
          (Math.sin(angle) * distanceKm) /
            (111.32 * Math.max(Math.cos(THREE.MathUtils.degToRad(latitude)), 0.25));

        if (cluster.simulated || isPointInMexico(candidateLongitude, candidateLatitude)) {
          visualLatitude = candidateLatitude;
          visualLongitude = candidateLongitude;
          break;
        }
      }

      const visualPosition = latLngToVector(visualLatitude, visualLongitude, GLOBE_RADIUS + 0.058);

      return { anchor, position: visualPosition };
    });
  }, [cluster.count, cluster.equipments, cluster.latitude, cluster.longitude, cluster.simulated]);
  const toneColors = useMemo(
    () => cluster.tones.map((tone) => new THREE.Color(TONE_COLORS[tone])),
    [cluster.tones],
  );

  useFrame(({ clock }) => {
    if (!groupRef.current) {
      return;
    }

    const cameraDirection = camera.position.clone().normalize();
    groupRef.current.visible = position.clone().normalize().dot(cameraDirection) > 0.035;
    if (markerGroupRef.current) {
      const markerScale = THREE.MathUtils.clamp(camera.position.distanceTo(position) / 3.6, 0.06, 1.05);
      markerGroupRef.current.scale.setScalar(markerScale);
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
    if (!pulseRef.current) {
      return;
    }

    const wave = (clock.elapsedTime * 0.62 + cluster.latitude * 0.01) % 1;
    pulseRef.current.scale.setScalar(0.85 + wave * 1.75);
    const pulseMaterial = pulseRef.current.material as THREE.MeshBasicMaterial;
    pulseMaterial.opacity = (1 - wave) * 0.66;
  });

  const nodeSize =
    expansionMode === 'focused' ? 0.016 : 0.026 + Math.min(Math.sqrt(cluster.count) * 0.0022, 0.028);
  const selected = cluster.equipments.some((equipment) => equipment.id === selectedEquipmentId);
  const expansionCount = expansionMode === 'focused' ? 72 : expansionMode === 'preview' ? 7 : 0;
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
        {expansionMode !== 'focused' ? (
          <>
            <mesh
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
            <mesh>
              <sphereGeometry args={[nodeSize, 22, 22]} />
              <meshBasicMaterial ref={nodeMaterialRef} color={TONE_COLORS[cluster.tone]} toneMapped={false} />
            </mesh>
            <Billboard follow>
              {cluster.heartbeat ? (
                <mesh ref={pulseRef}>
                  <ringGeometry args={[nodeSize * 1.2, nodeSize * 1.38, 32]} />
                  <meshBasicMaterial
                    color={TONE_COLORS.ok}
                    transparent
                    opacity={0.5}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                    toneMapped={false}
                  />
                </mesh>
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
          </>
        ) : null}
        {expansionMode !== 'none' ? (
          <Html center className="equipment-globe__city-tooltip" zIndexRange={[20, 0]}>
            <strong>{cluster.city}</strong>
            <span>{cluster.country} · {cluster.count} equipos</span>
            <small>
              {cluster.simulated
                ? 'Cobertura simulada'
                : expansionMode === 'focused'
                  ? 'Ubicación exacta · selecciona un equipo'
                  : 'Haz clic para fijar la ciudad'}
            </small>
            {cluster.tones.length > 1 ? <small>Estado mixto · colores en ciclo</small> : null}
          </Html>
        ) : null}
      </group>

      {expansionMode === 'focused'
        ? equipmentLayout.slice(0, expansionCount).map((layout, index) =>
            index === 0 ? null : (
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
  const arcs = useMemo(() => {
    const mexicoClusters = clusters.filter((cluster) => !cluster.simulated).slice(0, 6);
    const globalClusters = clusters.filter((cluster) => cluster.simulated);

    return mexicoClusters.flatMap((origin, originIndex) =>
      [globalClusters[(originIndex * 5 + 2) % globalClusters.length], globalClusters[(originIndex * 7 + 9) % globalClusters.length]]
        .filter(Boolean)
        .map((destination, destinationIndex) => {
          const start = latLngToVector(origin.latitude, origin.longitude, GLOBE_RADIUS + 0.02);
          const end = latLngToVector(destination.latitude, destination.longitude, GLOBE_RADIUS + 0.02);
          const midpoint = start.clone().add(end).normalize().multiplyScalar(GLOBE_RADIUS + 0.34 + destinationIndex * 0.08);
          const curve = new THREE.QuadraticBezierCurve3(start, midpoint, end);
          return {
            id: `${origin.id}-${destination.id}`,
            points: curve.getPoints(42),
          };
        }),
    );
  }, [clusters]);

  return (
    <>
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
    </>
  );
}

function GlobeScene({
  clusters,
  selectedEquipmentId,
  hoveredClusterId,
  focusedClusterId,
  resetVersion,
  zoomRequest,
  onHoverCluster,
  onFocusCluster,
  onSelectEquipment,
  onDistanceChange,
  onCollapseFocus,
}: {
  clusters: CityClusterData[];
  selectedEquipmentId: string | null;
  hoveredClusterId: string | null;
  focusedClusterId: string | null;
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
    camera.position.set(...MEXICO_CAMERA_POSITION);
    controlsRef.current?.target.set(0, 0, 0);
    controlsRef.current?.update();
    onDistanceChange(camera.position.length());
  }, [camera, onDistanceChange, resetVersion]);

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

    const focusedCluster = clusters.find((cluster) => cluster.id === focusedClusterId);
    if (!focusedCluster) {
      return;
    }

    const cameraDirection = latLngToVector(focusedCluster.latitude, focusedCluster.longitude, 1).normalize();
    camera.position.copy(cameraDirection.multiplyScalar(3.2));
    controlsRef.current?.target.set(0, 0, 0);
    controlsRef.current?.update();
    onDistanceChange(3.2);
  }, [camera, clusters, focusedClusterId, onDistanceChange]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 6]} intensity={1.6} color="#ccefff" />
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
      <Atmosphere />
      <NetworkArcs clusters={clusters} />
      {clusters.filter((cluster) => !focusedClusterId || cluster.id === focusedClusterId).map((cluster) => (
        <CityCluster
          key={cluster.id}
          cluster={cluster}
          expansionMode={
            focusedClusterId === cluster.id
              ? 'focused'
              : hoveredClusterId === cluster.id
                ? 'preview'
                : 'none'
          }
          selectedEquipmentId={selectedEquipmentId}
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
  selectedEquipmentId,
  onSelectEquipment,
}: GlobalEquipmentGlobeProps) {
  const [resetVersion, setResetVersion] = useState(0);
  const [cameraDistance, setCameraDistance] = useState(6.05);
  const [hoveredClusterId, setHoveredClusterId] = useState<string | null>(null);
  const [focusedClusterId, setFocusedClusterId] = useState<string | null>(null);
  const [selectedSimulatedEquipmentId, setSelectedSimulatedEquipmentId] = useState<string | null>(null);
  const [zoomRequest, setZoomRequest] = useState<{ version: number; direction: 1 | -1 }>({
    version: 0,
    direction: 1,
  });
  const clusters = useMemo(
    () => [...buildCityClusters(equipments), ...buildSimulatedClusters()],
    [equipments],
  );
  const mexicoLocationCount = clusters.filter((cluster) => !cluster.simulated).length;
  const effectiveSelectedEquipmentId = selectedSimulatedEquipmentId || selectedEquipmentId;
  const focusedCluster = focusedClusterId
    ? clusters.find((cluster) => cluster.id === focusedClusterId) || null
    : null;

  const handleSelectEquipment = (equipmentId: string | null) => {
    if (equipmentId?.startsWith('simulated-equipment-')) {
      setSelectedSimulatedEquipmentId(equipmentId);
      return;
    }

    setSelectedSimulatedEquipmentId(null);
    onSelectEquipment(equipmentId);
  };

  return (
    <div className="equipment-globe">
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: MEXICO_CAMERA_POSITION, fov: 44, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onPointerMissed={() => {
          document.body.style.cursor = '';
          setHoveredClusterId(null);
          handleSelectEquipment(null);
        }}
      >
        <GlobeScene
          clusters={clusters}
          selectedEquipmentId={effectiveSelectedEquipmentId}
          hoveredClusterId={hoveredClusterId}
          focusedClusterId={focusedClusterId}
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

      <div className="equipment-globe__hud equipment-globe__hud--left">
        <span className="equipment-globe__scope-dot" />
        <div>
          <strong>México en vivo</strong>
          <span>{mexicoLocationCount} ubicaciones · {equipments.length} equipos</span>
        </div>
      </div>

      <div className="equipment-globe__hud equipment-globe__hud--right">
        <span>Vista {cameraDistance <= CLOSE_VIEW_DISTANCE ? 'por equipo' : 'por ciudad'}</span>
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
          México
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
                {focusedCluster.latitude.toFixed(5)}, {focusedCluster.longitude.toFixed(5)} · coordenadas sin desplazar
              </span>
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
                <i data-status={equipment.status} />
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
