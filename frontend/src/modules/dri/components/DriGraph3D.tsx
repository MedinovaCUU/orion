import { Billboard, CubicBezierLine, OrbitControls, Text } from '@react-three/drei';
import { Canvas, type ThreeEvent, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { AdditiveBlending, Vector3, type Group, type Mesh } from 'three';
import type { DriGraphEdge, DriGraphNode } from '../driTypes';

interface DriGraph3DProps {
  nodes: DriGraphNode[];
  edges: DriGraphEdge[];
  selectedNodeIds: string[];
  onToggleNode: (nodeId: string) => void;
  focusedSystemKey?: string | null;
  shellControls?: {
    systemCoreRadius: number;
    systemStep: number;
    factorBaseRadius: number;
    factorStep: number;
    reagentRadius: number;
  };
}

interface PositionedNode extends DriGraphNode {
  position: [number, number, number];
}

/**
 * =============================================================================
 * ZONA DE EDICION RAPIDA DEL GRAFICO DRI
 * =============================================================================
 * Esta es la unica seccion que necesitas tocar para cambiar su aspecto general.
 * Los valores actuales reproducen exactamente el diseno que ya estaba en uso.
 *
 * GUIA:
 * - layout: radios, separacion y orientacion de las capas de la esfera.
 * - nodes: tamano, texto, movimiento y material de cada nodo.
 * - connections: curvatura y grosor de las lineas.
 * - scene: inclinacion, luces, camara, fondo y controles del usuario.
 *
 * Regla practica: cambia un valor, guarda el archivo y revisa DRI Preview.
 * Si el resultado no te gusta, devuelve solamente ese valor al numero original.
 */
export const DRI_GRAPH_CONFIG = {
  layout: {
    // Radios usados cuando el panel de controles no envia un valor propio.
    defaultRadii: {
      systemCoreRadius: 2.5,
      systemStep: 1.16,
      factorBaseRadius: 4.18,
      factorStep: 1.34,
      reagentRadius: 8.88,
    },
    // Multiplicadores de systemStep para las cuatro capas del sistema.
    systemShells: {
      // Nivel 2: aumenta para separar ensambles del nucleo.
      assemblyStep: 4,
      // Nivel 3: aumenta para separar componentes de los ensambles.
      componentStep: 5.5,
      // Nivel 4: se conserva para no abrir mas el ultimo estrato.
      microStep: 6.4,
    },
    factorShells: {
      middleStep: 1,
      outerStep: 2,
    },
    // Espacio minimo que impide que una familia invada la siguiente.
    minimumGap: {
      systemToFactor: 2.54,
      factorToReagents: 1.5,
    },
    // Distribucion de reactivos fallidos (izquierda) y correctos (derecha).
    reagentHemispheres: {
      // Aumenta este valor para llevar ambos grupos mas hacia los lados.
      horizontalOffset: 2.8,
      startOffset: 1.5,
      diskRadius: 0.92,
      verticalSpread: 0.84,
      depthSpread: 0.76,
      openingAngle: 0.2,
      tiltX: -0.08,
    },
    // Organizacion interna sin romper las capas esfericas.
    organizedShells: {
      // Rotacion [Y, X] de las posiciones uniformes de todos los estratos.
      anchorRotation: [-0.18, 0.16],
      // Influencia de sistemas secundarios al elegir una posicion libre dentro de la esfera.
      secondaryConnectionBlend: 0.24,
    },
    // Calidad del reparto uniforme de nodos sobre cada esfera.
    relaxation: {
      iterations: 80,
      initialStep: 0.085,
    },
  },
  nodes: {
    size: {
      ambient: {
        base: 0.24,
        selected: 0.34,
        emphasis: 0.02,
        glow: 0.34,
        selectedGlow: 0.44,
        glowEmphasis: 0.03,
      },
      regular: {
        base: 0.34,
        selected: 0.5,
        emphasis: 0.026,
        glow: 0.5,
        selectedGlow: 0.74,
        glowEmphasis: 0.03,
      },
      wireScale: 1.02,
    },
    labels: {
      colorLight: '#eef4f7',
      colorDark: '#263640',
      subtitleColor: '#718390',
      outlineColor: '#f5f8fb',
      ambientOffset: { normal: -0.38, selected: -0.46 },
      regularOffset: { normal: -0.72, selected: -0.85 },
      fontSize: {
        ambient: 0.13,
        ambientSelected: 0.16,
        factor: 0.18,
        regular: 0.22,
        selected: 0.28,
      },
      maxWidth: { ambient: 1.8, regular: 2.4 },
      subtitleFontSize: { ambient: 0.1, regular: 0.14 },
      subtitleMaxWidth: { ambient: 2.1, regular: 2.7 },
      subtitleOffset: { ambient: -0.2, regular: -0.28, selected: -0.33 },
    },
    motion: {
      pulseSpeed: { ambient: 1.4, regular: 2.2 },
      pulseAmount: { ambient: 0.018, regular: 0.035 },
      floatSpeed: { ambient: 0.46, regular: 0.72 },
      floatAmount: { ambient: 0.05, regular: 0.09 },
      rotationX: { ambient: 0.0012, regular: 0.002 },
      rotationY: { ambient: 0.0018, regular: 0.0036 },
    },
    material: {
      ambientRoughness: 0.2,
      regularRoughness: 0.16,
      ambientMetalness: 0.92,
      factorMetalness: 0.88,
      reagentMetalness: 0.84,
      reagentFillBase: '#e9eff3',
      factorFillBase: '#dfe6eb',
    },
    // El brillo de factores escala con la cantidad de reactivos asociados.
    factorIllumination: {
      // Tamano: el balance fallidas - correctas controla el radio del factor.
      radiusBase: 0.28,
      glowRadiusBase: 0.38,
      // Escala maxima respecto al radio base: 3 = 300%.
      maximumScale: 3,
      // Al seleccionar se conserva el score y solo se agrega un realce moderado.
      selectedScale: 1.12,
      // Una curva menor que 1 hace evidente antes el cambio visual.
      responseCurve: 0.65,
      // Saturacion HSL absoluta: evita depender de que el color original sea grisaceo.
      saturationBase: 0.14,
      saturationStrength: 0.8,
      // Participacion del color frente al relleno gris del material.
      colorMixBase: 0.16,
      colorMixStrength: 0.8,
      // Opacidad y emision siguen el mismo balance diferencial.
      coreOpacityBase: 0.16,
      coreOpacityStrength: 0.82,
      wireOpacityBase: 0.03,
      wireOpacityStrength: 0.28,
      glowOpacityBase: 0.01,
      glowOpacityStrength: 0.2,
      emissiveBase: 0.015,
      emissiveStrength: 0.38,
      emissiveSelected: 0.48,
    },
  },
  connections: {
    arc: {
      horizontalLift: 0.055,
      biasLift: 0.58,
      minLift: 0.28,
      maxLift: 1.72,
      depthSpan: 0.2,
      depthBias: 0.78,
      maxDepth: 2.6,
      startHandle: 0.32,
      endHandle: 0.68,
      endLift: 0.68,
    },
    width: {
      normalMinimum: 0.8,
      disconnectedMinimum: 0.24,
      focusedMultiplier: 1.85,
      normalMultiplier: 1.22,
      disconnectedMultiplier: 0.36,
    },
  },
  scene: {
    rotation: {
      x: 0.26,
      y: -0.54,
      // Giro de nivelacion visto de frente. Positivo = antihorario.
      z: 0.09,
      ySpeed: 0.18,
      yAmount: 0.055,
      xSpeed: 0.11,
      xAmount: 0.014,
    },
    background: '#eff4f7',
    fog: { near: 53, far: 100 },
    ambientLight: 1.08,
    pointLights: [
      { position: [0, 7, 8], intensity: 0.92, color: '#a9dfe7' },
      { position: [-6, 2, 6], intensity: 0.42, color: '#eab2a5' },
      { position: [6, -1, 6], intensity: 0.44, color: '#83d8c2' },
    ],
    camera: { position: [3.2, 10, 54], fov: 34 },
    controls: {
      dampingFactor: 0.08,
      minDistance: 7.8,
      maxDistance: 100,
      target: [0.05, -1.5, 0],
      autoRotateSpeed: 0.12,
      rotateSpeed: 3.72,
      zoomSpeed: 0.9,
    },
  },
} as const;

const goldenAngle = Math.PI * (3 - Math.sqrt(5));
type Vec3 = [number, number, number];

const normalizeVec = ([x, y, z]: Vec3): Vec3 => {
  const magnitude = Math.hypot(x, y, z) || 1;
  return [x / magnitude, y / magnitude, z / magnitude];
};

const scaleVec = ([x, y, z]: Vec3, scalar: number): Vec3 => [x * scalar, y * scalar, z * scalar];

const rotateY = ([x, y, z]: Vec3, angle: number): Vec3 => [
  x * Math.cos(angle) + z * Math.sin(angle),
  y,
  -x * Math.sin(angle) + z * Math.cos(angle),
];

const rotateX = ([x, y, z]: Vec3, angle: number): Vec3 => [
  x,
  y * Math.cos(angle) - z * Math.sin(angle),
  y * Math.sin(angle) + z * Math.cos(angle),
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const createSeedDirections = (count: number) => {
  if (count <= 0) {
    return [] as Vec3[];
  }
  if (count === 1) {
    return [[0, 0, 1] as Vec3];
  }
  if (count === 2) {
    return [[0, 0, 1] as Vec3, [0, 0, -1] as Vec3];
  }

  return Array.from({ length: count }, (_, index) => {
    const y = 1 - (2 * (index + 0.5)) / count;
    const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
    const azimuth = index * goldenAngle;
    return normalizeVec([Math.cos(azimuth) * ringRadius, y, Math.sin(azimuth) * ringRadius]);
  });
};

const relaxDirectionsOnSphere = (seed: Vec3[], iterations = DRI_GRAPH_CONFIG.layout.relaxation.iterations) => {
  let points = seed.map((point) => normalizeVec(point));

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = points.map(([x, y, z]) => [x, y, z] as Vec3);
    const step = DRI_GRAPH_CONFIG.layout.relaxation.initialStep * (1 - iteration / iterations);

    for (let i = 0; i < points.length; i += 1) {
      let fx = 0;
      let fy = 0;
      let fz = 0;

      for (let j = 0; j < points.length; j += 1) {
        if (i === j) {
          continue;
        }
        const dx = points[i][0] - points[j][0];
        const dy = points[i][1] - points[j][1];
        const dz = points[i][2] - points[j][2];
        const distanceSq = Math.max(0.0001, dx * dx + dy * dy + dz * dz);
        const inv = 1 / distanceSq;
        fx += dx * inv;
        fy += dy * inv;
        fz += dz * inv;
      }

      next[i] = normalizeVec([points[i][0] + fx * step, points[i][1] + fy * step, points[i][2] + fz * step]);
    }

    points = next;
  }

  return points;
};

const getStableShellDirections = (count: number) => relaxDirectionsOnSphere(createSeedDirections(count));

const rotateDirectionSet = (directions: Vec3[], rotationY: number, rotationX: number) =>
  directions.map((direction) => rotateX(rotateY(direction, rotationY), rotationX));

const blendDirections = (from: Vec3, to: Vec3, ratio: number): Vec3 =>
  normalizeVec([
    from[0] * (1 - ratio) + to[0] * ratio,
    from[1] * (1 - ratio) + to[1] * ratio,
    from[2] * (1 - ratio) + to[2] * ratio,
  ]);

const directionSimilarity = (left: Vec3, right: Vec3) => left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

const hexToRgb = (hex: string) => {
  const sanitized = hex.replace('#', '');
  const normalized =
    sanitized.length === 3
      ? sanitized
          .split('')
          .map((char) => char + char)
          .join('')
      : sanitized;

  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }) =>
  `#${[r, g, b]
    .map((channel) =>
      Math.max(0, Math.min(255, Math.round(channel)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

const mixColors = (from: string, to: string, ratio: number) => {
  const safeRatio = Math.max(0, Math.min(1, ratio));
  const start = hexToRgb(from);
  const end = hexToRgb(to);

  return rgbToHex({
    r: start.r + (end.r - start.r) * safeRatio,
    g: start.g + (end.g - start.g) * safeRatio,
    b: start.b + (end.b - start.b) * safeRatio,
  });
};

const rgbToHsl = ({ r, g, b }: { r: number; g: number; b: number }) => {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) {
    return { h: 0, s: 0, l: lightness };
  }

  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;

  switch (max) {
    case red:
      hue = (green - blue) / delta + (green < blue ? 6 : 0);
      break;
    case green:
      hue = (blue - red) / delta + 2;
      break;
    default:
      hue = (red - green) / delta + 4;
      break;
  }

  return { h: hue / 6, s: saturation, l: lightness };
};

const hslToRgb = ({ h, s, l }: { h: number; s: number; l: number }) => {
  if (s === 0) {
    const channel = l * 255;
    return { r: channel, g: channel, b: channel };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    let next = t;
    if (next < 0) next += 1;
    if (next > 1) next -= 1;
    if (next < 1 / 6) return p + (q - p) * 6 * next;
    if (next < 1 / 2) return q;
    if (next < 2 / 3) return p + (q - p) * (2 / 3 - next) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: hue2rgb(p, q, h + 1 / 3) * 255,
    g: hue2rgb(p, q, h) * 255,
    b: hue2rgb(p, q, h - 1 / 3) * 255,
  };
};

const saturateColor = (hex: string, amount: number) => {
  const hsl = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb({ ...hsl, s: clamp(hsl.s * amount, 0, 1) }));
};

const setColorSaturation = (hex: string, saturation: number) => {
  const hsl = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb({ ...hsl, s: clamp(saturation, 0, 1) }));
};

const buildGraphDistanceMap = (startIds: string[], edges: DriGraphEdge[]) => {
  if (!startIds.length) {
    return null;
  }

  const adjacency = new Map<string, Set<string>>();
  edges.forEach((edge) => {
    adjacency.set(edge.sourceId, new Set([...(adjacency.get(edge.sourceId) || []), edge.targetId]));
    adjacency.set(edge.targetId, new Set([...(adjacency.get(edge.targetId) || []), edge.sourceId]));
  });

  const distances = new Map<string, number>();
  const queue = [...startIds];

  startIds.forEach((startId) => {
    distances.set(startId, 0);
  });

  while (queue.length) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    const nextDistance = (distances.get(current) || 0) + 1;
    (adjacency.get(current) || []).forEach((neighbor) => {
      if (distances.has(neighbor)) {
        return;
      }
      distances.set(neighbor, nextDistance);
      queue.push(neighbor);
    });
  }

  return distances;
};

const routePresence = (distance: number | undefined, disconnected = 0.01, floor = 0.45) => {
  if (distance === undefined) return disconnected;
  if (distance <= 0) return 1;
  return clamp(1 - distance * 0.05, floor, 1);
};

const normalizeEdgeCaseStrength = (weight: number) => clamp((weight - 0.6) / 1.35, 0, 1);

function FloatingNode({
  node,
  selected,
  onToggle,
  muted,
  boosted,
  selectionActive,
  graphDistance,
}: {
  node: PositionedNode;
  selected: boolean;
  onToggle: (id: string) => void;
  muted: boolean;
  boosted: boolean;
  selectionActive: boolean;
  graphDistance: number | undefined;
}) {
  const groupRef = useRef<Group>(null);
  const meshRef = useRef<Mesh>(null);
  const glowRef = useRef<Mesh>(null);
  const wireRef = useRef<Mesh>(null);
  const labelRef = useRef<Mesh>(null);
  const subtitleRef = useRef<Mesh>(null);
  const floatOffset = useMemo(() => Math.random() * Math.PI * 2, []);
  const worldPosition = useMemo(() => new Vector3(), []);
  const nodeDirection = useMemo(() => new Vector3(), []);
  const cameraDirection = useMemo(() => new Vector3(), []);
  const associationStrength = Math.max(0, Math.min(1, node.associationStrength));
  const visualAssociationStrength = boosted ? Math.min(1, associationStrength * 1.2 + 0.12) : associationStrength;
  const distanceNodeFactor = selectionActive ? routePresence(graphDistance, 0.008, 0.12) : 1;
  const distanceTextFactor = selectionActive ? routePresence(graphDistance, 0.02, 0.58) : 1;
  const mutedFactor = muted ? 0.025 : distanceNodeFactor;
  const mutedTextFactor = muted ? 0.02 : distanceTextFactor;
  const connectedOnRoute = selectionActive && graphDistance !== undefined && !muted;
  const connectedTextContrast = connectedOnRoute ? clamp(0.9 - graphDistance * 0.035, 0.76, 0.92) : 0;
  const connectedSubtitleContrast = connectedOnRoute ? clamp(0.74 - graphDistance * 0.04, 0.58, 0.8) : 0;
  const ambient = node.type === 'ambient_factor';
  const factor = node.type === 'factor';
  const reagent = !ambient && !factor;
  const nodeConfig = DRI_GRAPH_CONFIG.nodes;
  const factorLight = nodeConfig.factorIllumination;
  const sizeConfig = ambient ? nodeConfig.size.ambient : nodeConfig.size.regular;
  const differentialVisualImpact = factor
    ? Math.pow(visualAssociationStrength, factorLight.responseCurve)
    : visualAssociationStrength;
  const factorScale = Math.min(
    factorLight.maximumScale,
    1 + differentialVisualImpact * (factorLight.maximumScale - 1),
  );
  const selectedFactorScale = Math.min(factorLight.maximumScale, factorScale * factorLight.selectedScale);
  const baseNodeRadius = ambient
    ? selected
      ? sizeConfig.selected
      : sizeConfig.base + node.emphasis * sizeConfig.emphasis
    : factor
      ? selected
        ? factorLight.radiusBase * selectedFactorScale
        : factorLight.radiusBase * factorScale
      : selected
        ? sizeConfig.selected
        : sizeConfig.base + node.emphasis * sizeConfig.emphasis;
  const glowNodeRadius = ambient
    ? selected
      ? sizeConfig.selectedGlow
      : sizeConfig.glow + node.emphasis * sizeConfig.glowEmphasis
    : factor
      ? selected
        ? factorLight.glowRadiusBase * selectedFactorScale
        : factorLight.glowRadiusBase * factorScale
      : selected
        ? sizeConfig.selectedGlow
        : sizeConfig.glow + node.emphasis * sizeConfig.glowEmphasis;
  const coreOpacity = ambient
    ? selected
      ? 0.5
      : 0.18 + associationStrength * 0.18
    : reagent
      ? selected
        ? 0.98
        : 0.56 + associationStrength * 0.28
      : selected
        ? 0.98
        : factorLight.coreOpacityBase + differentialVisualImpact * factorLight.coreOpacityStrength;
  const wireOpacity = ambient
    ? selected
      ? 0.14
      : 0.04 + associationStrength * 0.08
    : reagent
      ? (selected ? 0.24 : 0.12) + associationStrength * 0.16
      : selected
        ? 0.32
        : factorLight.wireOpacityBase + differentialVisualImpact * factorLight.wireOpacityStrength;
  const glowOpacity = ambient
    ? selected
      ? 0.05
      : 0.012 + associationStrength * 0.022
    : reagent
      ? (selected ? 0.12 : 0.05) + associationStrength * 0.08
      : selected
        ? 0.24
        : factorLight.glowOpacityBase + differentialVisualImpact * factorLight.glowOpacityStrength;
  const highlightColor = factor
    ? setColorSaturation(node.color, factorLight.saturationBase + differentialVisualImpact * factorLight.saturationStrength)
    : reagent
      ? saturateColor(node.color, boosted ? 1.28 : 1.18)
      : boosted
        ? saturateColor(node.color, 1.2)
        : node.color;
  const coreFillColor = reagent
    ? mixColors(nodeConfig.material.reagentFillBase, highlightColor, 0.28 + visualAssociationStrength * 0.68)
    : mixColors(
        nodeConfig.material.factorFillBase,
        highlightColor,
        factor
          ? factorLight.colorMixBase + differentialVisualImpact * factorLight.colorMixStrength
          : 0.12 + visualAssociationStrength * 0.56,
      );
  const emissiveIntensity = factor
    ? selected
      ? factorLight.emissiveSelected
      : factorLight.emissiveBase + differentialVisualImpact * factorLight.emissiveStrength
    : selected
      ? ambient
        ? 0.06
        : 0.26
      : ambient
        ? 0.012 + visualAssociationStrength * 0.06
        : 0.08 + visualAssociationStrength * 0.22;
  const labelOffset = ambient
    ? selected
      ? nodeConfig.labels.ambientOffset.selected
      : nodeConfig.labels.ambientOffset.normal
    : selected
      ? nodeConfig.labels.regularOffset.selected
      : nodeConfig.labels.regularOffset.normal;
  const showSubtitle = selected;
  const labelColor = mixColors(
    nodeConfig.labels.colorLight,
    nodeConfig.labels.colorDark,
    muted
      ? 0.015
      : selected
        ? 0.98
        : connectedOnRoute
          ? connectedTextContrast
          : ambient
            ? 0.18 + distanceTextFactor * 0.56
            : 0.24 + distanceTextFactor * 0.62,
  );
  const subtitleColor = mixColors(
    nodeConfig.labels.colorLight,
    nodeConfig.labels.subtitleColor,
    muted
      ? 0.015
      : selected
        ? 0.9
        : connectedOnRoute
          ? connectedSubtitleContrast
          : ambient
            ? 0.12 + distanceTextFactor * 0.42
            : 0.18 + distanceTextFactor * 0.46,
  );
  const labelOutlineWidth = muted
    ? 0
    : selected
      ? 0.018
      : ambient
        ? 0.004 + distanceTextFactor * 0.006
        : 0.005 + distanceTextFactor * 0.008;
  const subtitleOutlineWidth = muted ? 0 : 0.003 + distanceTextFactor * 0.004;
  const labelOutlineColor = nodeConfig.labels.outlineColor;
  const factorLabelOpacity = factor
    ? selected
      ? 1
      : 0.18 + differentialVisualImpact * 0.76
    : ambient
      ? selected
        ? 0.82
        : 0.08 + visualAssociationStrength * 0.42
      : 1;
  const subtitleOpacity = factor ? (selected ? 0.76 : 0.18 + differentialVisualImpact * 0.46) : 0.74;
  const connectedNodeOpacityFloor =
    selectionActive && graphDistance !== undefined && !muted
      ? ambient
        ? 0.18 * distanceNodeFactor
        : reagent
          ? 0.34 * distanceNodeFactor
          : 0.28 * distanceNodeFactor
      : 0;
  const connectedWireOpacityFloor =
    selectionActive && graphDistance !== undefined && !muted
      ? ambient
        ? 0.08 * distanceNodeFactor
        : reagent
          ? 0.14 * distanceNodeFactor
          : 0.11 * distanceNodeFactor
      : 0;
  const connectedGlowOpacityFloor =
    selectionActive && graphDistance !== undefined && !muted
      ? ambient
        ? 0.018 * distanceNodeFactor
        : reagent
          ? 0.032 * distanceNodeFactor
          : 0.026 * distanceNodeFactor
      : 0;
  const labelPresenceFloor =
    selectionActive && graphDistance !== undefined && !muted
      ? ambient
        ? Math.max(0.52, 0.66 * distanceTextFactor)
        : Math.max(0.72, 0.82 * distanceTextFactor)
      : 0;
  const subtitlePresenceFloor =
    selectionActive && graphDistance !== undefined && !muted
      ? ambient
        ? Math.max(0.22, 0.34 * distanceTextFactor)
        : Math.max(0.3, 0.42 * distanceTextFactor)
      : 0;
  const labelFillOpacity = clamp(Math.max(factorLabelOpacity * mutedTextFactor, labelPresenceFloor), 0.008, 1);
  const subtitleFillOpacity = clamp(Math.max(subtitleOpacity * mutedTextFactor, subtitlePresenceFloor), 0.006, 0.9);
  const labelOutlineOpacity = muted
    ? 0
    : selected
      ? 0.92
      : connectedOnRoute
        ? clamp(0.48 - graphDistance * 0.035, 0.24, 0.46)
        : clamp((ambient ? 0.08 : 0.12) + distanceTextFactor * 0.28, 0.03, 0.44);
  const subtitleOutlineOpacity = muted
    ? 0
    : connectedOnRoute
      ? clamp(0.16 - graphDistance * 0.02, 0.08, 0.14)
      : clamp(0.02 + distanceTextFactor * 0.12, 0.015, 0.22);

  const stopNodeEvent = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    event.stopPropagation();
  };

  const handleNodeClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onToggle(node.id);
  };

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = 'pointer';
  };

  const handlePointerOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = 'default';
  };

  useFrame(({ clock, camera }) => {
    if (!meshRef.current || !groupRef.current || !glowRef.current) {
      return;
    }

    const elapsed = clock.getElapsedTime();
    const pulseSpeed = ambient ? nodeConfig.motion.pulseSpeed.ambient : nodeConfig.motion.pulseSpeed.regular;
    const pulseAmount = ambient ? nodeConfig.motion.pulseAmount.ambient : nodeConfig.motion.pulseAmount.regular;
    const floatSpeed = ambient ? nodeConfig.motion.floatSpeed.ambient : nodeConfig.motion.floatSpeed.regular;
    const floatAmount = ambient ? nodeConfig.motion.floatAmount.ambient : nodeConfig.motion.floatAmount.regular;
    const pulse = 1 + Math.sin(elapsed * pulseSpeed + floatOffset) * pulseAmount;
    groupRef.current.position.y = node.position[1] + Math.sin(elapsed * floatSpeed + floatOffset) * floatAmount;
    meshRef.current.rotation.x += ambient ? nodeConfig.motion.rotationX.ambient : nodeConfig.motion.rotationX.regular;
    meshRef.current.rotation.y += ambient ? nodeConfig.motion.rotationY.ambient : nodeConfig.motion.rotationY.regular;
    groupRef.current.getWorldPosition(worldPosition);
    nodeDirection.copy(worldPosition).normalize();
    cameraDirection.copy(camera.position).normalize();
    const facingDot = nodeDirection.dot(cameraDirection);
    const visibilityFactor = ambient ? clamp((facingDot + 0.22) / 1.22, 0.06, 1) : clamp((facingDot + 0.1) / 1.1, 0.08, 1);
    // La evidencia diferencial protege a los factores importantes de la neblina trasera.
    const protectedVisibilityFactor = factor
      ? visibilityFactor + (1 - visibilityFactor) * differentialVisualImpact
      : visibilityFactor;
    const scaleFactor = 0.88 + protectedVisibilityFactor * 0.12;
    glowRef.current.scale.setScalar((selected ? (ambient ? 1.18 : 1.34) : ambient ? 1.08 : 1.22) * pulse * scaleFactor);

    const glowMaterial = glowRef.current.material;
    if (!Array.isArray(glowMaterial) && 'opacity' in glowMaterial) {
      glowMaterial.opacity = Math.max(
        glowOpacity * protectedVisibilityFactor * mutedFactor,
        connectedGlowOpacityFloor * protectedVisibilityFactor,
      );
    }

    const coreMaterial = meshRef.current.material;
    if (!Array.isArray(coreMaterial) && 'opacity' in coreMaterial && 'emissiveIntensity' in coreMaterial) {
      coreMaterial.opacity = Math.max(
        coreOpacity * (0.5 + protectedVisibilityFactor * 0.5) * mutedFactor,
        connectedNodeOpacityFloor * (0.4 + protectedVisibilityFactor * 0.6),
      );
      coreMaterial.emissiveIntensity =
        emissiveIntensity * (boosted ? 1.2 : 1) * (0.38 + protectedVisibilityFactor * 0.62);
    }

    const wireMaterial = wireRef.current?.material;
    if (wireMaterial && !Array.isArray(wireMaterial) && 'opacity' in wireMaterial) {
      wireMaterial.opacity = Math.max(
        wireOpacity * protectedVisibilityFactor * mutedFactor,
        connectedWireOpacityFloor * protectedVisibilityFactor,
      );
    }
  });

  return (
    <group ref={groupRef} position={node.position}>
      <mesh ref={glowRef} raycast={() => null}>
        <icosahedronGeometry args={[glowNodeRadius, 1]} />
        <meshBasicMaterial
          color={highlightColor}
          transparent
          opacity={glowOpacity}
          depthWrite={false}
          depthTest={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <mesh
        ref={meshRef}
        renderOrder={12}
        onPointerDown={stopNodeEvent}
        onClick={handleNodeClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <icosahedronGeometry args={[baseNodeRadius, 1]} />
        <meshStandardMaterial
          color={coreFillColor}
          emissive={highlightColor}
          emissiveIntensity={emissiveIntensity}
          roughness={ambient ? nodeConfig.material.ambientRoughness : nodeConfig.material.regularRoughness}
          metalness={
            ambient
              ? nodeConfig.material.ambientMetalness
              : factor
                ? nodeConfig.material.factorMetalness
                : nodeConfig.material.reagentMetalness
          }
          transparent
          opacity={coreOpacity * mutedFactor}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={wireRef} scale={nodeConfig.size.wireScale} renderOrder={13} raycast={() => null}>
        <icosahedronGeometry args={[baseNodeRadius, 1]} />
        <meshBasicMaterial
          color={highlightColor}
          transparent
          opacity={wireOpacity * mutedFactor}
          wireframe
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      <Billboard follow position={[0, labelOffset, 0]}>
        <Text
          ref={labelRef}
          color={labelColor}
          fontSize={
            ambient
              ? selected
                ? nodeConfig.labels.fontSize.ambientSelected
                : nodeConfig.labels.fontSize.ambient
              : selected
                ? nodeConfig.labels.fontSize.selected
                : factor
                  ? nodeConfig.labels.fontSize.factor
                  : nodeConfig.labels.fontSize.regular
          }
          maxWidth={ambient ? nodeConfig.labels.maxWidth.ambient : nodeConfig.labels.maxWidth.regular}
          lineHeight={1.1}
          textAlign="center"
          anchorX="center"
          anchorY="middle"
          renderOrder={120}
          outlineWidth={labelOutlineWidth}
          outlineColor={labelOutlineColor}
          outlineOpacity={labelOutlineOpacity}
          fillOpacity={labelFillOpacity}
          depthOffset={-10}
          material-transparent
          material-opacity={1}
          material-depthTest={false}
          material-depthWrite={false}
          material-toneMapped={false}
        >
          {node.label}
        </Text>
        {showSubtitle ? (
          <Text
            ref={subtitleRef}
            position={[
              0,
              ambient
                ? nodeConfig.labels.subtitleOffset.ambient
                : selected
                  ? nodeConfig.labels.subtitleOffset.selected
                  : nodeConfig.labels.subtitleOffset.regular,
              0,
            ]}
            color={subtitleColor}
            fontSize={ambient ? nodeConfig.labels.subtitleFontSize.ambient : nodeConfig.labels.subtitleFontSize.regular}
            maxWidth={ambient ? nodeConfig.labels.subtitleMaxWidth.ambient : nodeConfig.labels.subtitleMaxWidth.regular}
            lineHeight={1.05}
            textAlign="center"
            anchorX="center"
            anchorY="middle"
            renderOrder={121}
            outlineWidth={subtitleOutlineWidth}
            outlineColor={labelOutlineColor}
            outlineOpacity={subtitleOutlineOpacity}
            fillOpacity={subtitleFillOpacity}
            depthOffset={-5}
            material-transparent
            material-opacity={1}
            material-depthTest={false}
            material-depthWrite={false}
            material-toneMapped={false}
          >
            {node.subtitle}
          </Text>
        ) : null}
      </Billboard>
    </group>
  );
}

function GraphScene({ nodes, edges, selectedNodeIds, onToggleNode, focusedSystemKey, shellControls }: DriGraph3DProps) {
  const sceneRef = useRef<Group>(null);
  const sceneConfig = DRI_GRAPH_CONFIG.scene;

  useFrame(({ clock }) => {
    if (!sceneRef.current) {
      return;
    }
    const elapsed = clock.getElapsedTime();
    sceneRef.current.rotation.y = sceneConfig.rotation.y + Math.sin(elapsed * sceneConfig.rotation.ySpeed) * sceneConfig.rotation.yAmount;
    sceneRef.current.rotation.x = sceneConfig.rotation.x + Math.sin(elapsed * sceneConfig.rotation.xSpeed) * sceneConfig.rotation.xAmount;
    sceneRef.current.rotation.z = sceneConfig.rotation.z;
  });

  const positionedNodes = useMemo<PositionedNode[]>(() => {
    const failedNodes = [...nodes.filter((node) => node.orbit === 'failed' || node.type === 'failed_reagent')].sort((a, b) =>
      a.label.localeCompare(b.label),
    );
    const correctNodes = [...nodes.filter((node) => node.orbit === 'correct' || node.type === 'correct_reagent')].sort((a, b) =>
      a.label.localeCompare(b.label),
    );
    const factorNodes = [...nodes.filter((node) => node.orbit === 'diagnostic' || node.type === 'factor')].sort((a, b) => {
      if ((b.associationStrength ?? 0) !== (a.associationStrength ?? 0)) {
        return (b.associationStrength ?? 0) - (a.associationStrength ?? 0);
      }
      return b.emphasis - a.emphasis;
    });
    const ambientNodes = [...nodes.filter((node) => node.orbit === 'ambient' || node.type === 'ambient_factor')].sort((a, b) => {
      const tierDelta = (a.tier || 0) - (b.tier || 0);
      if (tierDelta !== 0) {
        return tierDelta;
      }
      const clusterDelta = String(a.clusterKey || '').localeCompare(String(b.clusterKey || ''));
      if (clusterDelta !== 0) {
        return clusterDelta;
      }
      return a.label.localeCompare(b.label);
    });

    const layout: PositionedNode[] = [];
    const layoutConfig = DRI_GRAPH_CONFIG.layout;

    const systemCore = shellControls?.systemCoreRadius ?? layoutConfig.defaultRadii.systemCoreRadius;
    const systemStep = shellControls?.systemStep ?? layoutConfig.defaultRadii.systemStep;
    const systemMicro = systemCore + systemStep * layoutConfig.systemShells.microStep;
    const factorBase = Math.max(
      shellControls?.factorBaseRadius ?? layoutConfig.defaultRadii.factorBaseRadius,
      systemMicro + layoutConfig.minimumGap.systemToFactor,
    );
    const factorStep = shellControls?.factorStep ?? layoutConfig.defaultRadii.factorStep;
    const factorOuter = factorBase + factorStep * layoutConfig.factorShells.outerStep;
    const reagentRadius = Math.max(
      shellControls?.reagentRadius ?? layoutConfig.defaultRadii.reagentRadius,
      factorOuter + layoutConfig.minimumGap.factorToReagents,
    );

    const shellRadii = {
      systemCore,
      systemAssembly: systemCore + systemStep * layoutConfig.systemShells.assemblyStep,
      systemComponent: systemCore + systemStep * layoutConfig.systemShells.componentStep,
      systemMicro,
      factorCore: factorBase,
      factorMid: factorBase + factorStep * layoutConfig.factorShells.middleStep,
      factorOuter,
      reagents: reagentRadius,
    };

    const placeHemisphereShell = (items: DriGraphNode[], side: 'left' | 'right', radius: number) =>
      items.map<PositionedNode>((item, index) => {
        const count = Math.max(items.length, 1);
        const hemisphere = layoutConfig.reagentHemispheres;
        const t = (index + hemisphere.startOffset) / count;
        const diskRadius = Math.sqrt(t) * hemisphere.diskRadius;
        const angle = index * goldenAngle;
        const localY = Math.cos(angle) * diskRadius * hemisphere.verticalSpread;
        const localZ = Math.sin(angle) * diskRadius * hemisphere.depthSpread;
        const localX = Math.sqrt(Math.max(0, 1 - localY * localY - localZ * localZ));
        const facing: Vec3 = side === 'left' ? [-localX, localY, localZ] : [localX, localY, localZ];
        const opened = rotateX(rotateY(facing, side === 'left' ? hemisphere.openingAngle : -hemisphere.openingAngle), hemisphere.tiltX);
        const position = scaleVec(opened, radius);
        position[0] += side === 'left' ? -hemisphere.horizontalOffset : hemisphere.horizontalOffset;
        return {
          ...item,
          position,
        };
      });

    const shellOrganization = layoutConfig.organizedShells;
    const systemClusterKeys = [...new Set(ambientNodes.map((node) => node.clusterKey).filter((key): key is string => Boolean(key)))].sort();
    const systemAnchorDirections = rotateDirectionSet(
      getStableShellDirections(systemClusterKeys.length),
      ...shellOrganization.anchorRotation,
    );
    const systemAnchors = new Map<string, Vec3>(
      systemClusterKeys.map((clusterKey, index) => [clusterKey, systemAnchorDirections[index]]),
    );
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const factorNodeIds = new Set(factorNodes.map((node) => node.id));
    const factorSystemWeights = new Map<string, Map<string, number>>();

    edges.forEach((edge) => {
      const factorId = factorNodeIds.has(edge.sourceId) ? edge.sourceId : factorNodeIds.has(edge.targetId) ? edge.targetId : null;
      if (!factorId) return;
      const relatedNodeId = factorId === edge.sourceId ? edge.targetId : edge.sourceId;
      const relatedNode = nodeById.get(relatedNodeId);
      const clusterKey = relatedNode?.type === 'ambient_factor' ? relatedNode.clusterKey : null;
      if (!clusterKey || !systemAnchors.has(clusterKey)) return;
      const weights = factorSystemWeights.get(factorId) || new Map<string, number>();
      weights.set(clusterKey, (weights.get(clusterKey) || 0) + Math.max(0.1, edge.weight));
      factorSystemWeights.set(factorId, weights);
    });

    const getFactorPlacement = (factor: DriGraphNode) => {
      const weights = factorSystemWeights.get(factor.id);
      if (!weights?.size) {
        return {
          primaryCluster: systemClusterKeys[0] || 'unassigned',
          connectedDirection: systemAnchorDirections[0] || ([0, 0, 1] as Vec3),
        };
      }

      const ranked = [...weights.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
      const primaryCluster = ranked[0][0];
      const weightedDirection = ranked.reduce<Vec3>(
        (total, [clusterKey, weight]) => {
          const anchor = systemAnchors.get(clusterKey) || [0, 0, 1];
          return [total[0] + anchor[0] * weight, total[1] + anchor[1] * weight, total[2] + anchor[2] * weight];
        },
        [0, 0, 0],
      );
      return { primaryCluster, connectedDirection: normalizeVec(weightedDirection) };
    };

    const assignUniformShellPositions = (
      items: DriGraphNode[],
      radius: number,
      getPreferredDirection: (item: DriGraphNode) => Vec3,
    ) => {
      if (!items.length) return [];

      const sortedItems = [...items].sort(
        (left, right) =>
          (right.associationStrength ?? 0) - (left.associationStrength ?? 0) ||
          right.emphasis - left.emphasis ||
          left.label.localeCompare(right.label),
      );

      if (sortedItems.length === 1) {
        const item = sortedItems[0];
        return [{ ...item, position: scaleVec(getPreferredDirection(item), radius) }];
      }

      const availableDirections = rotateDirectionSet(
        getStableShellDirections(sortedItems.length),
        ...shellOrganization.anchorRotation,
      );

      return sortedItems.map<PositionedNode>((item) => {
        const preferredDirection = getPreferredDirection(item);
        let bestDirectionIndex = 0;
        let bestSimilarity = Number.NEGATIVE_INFINITY;

        availableDirections.forEach((direction, index) => {
          const similarity = directionSimilarity(direction, preferredDirection);
          if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestDirectionIndex = index;
          }
        });

        const [direction] = availableDirections.splice(bestDirectionIndex, 1);
        return { ...item, position: scaleVec(direction || preferredDirection, radius) };
      });
    };

    const getPreferredFactorDirection = (factor: DriGraphNode) => {
      const { primaryCluster, connectedDirection } = getFactorPlacement(factor);
      const primaryDirection = systemAnchors.get(primaryCluster) || connectedDirection;
      return blendDirections(primaryDirection, connectedDirection, shellOrganization.secondaryConnectionBlend);
    };

    const placeFactorTier = (items: DriGraphNode[], radius: number) =>
      assignUniformShellPositions(items, radius, getPreferredFactorDirection);

    const placeFactorClusters = (items: DriGraphNode[]) => {
      const shells = new Map<number, DriGraphNode[]>();
      items.forEach((item) => {
        const tier = item.tier || 2;
        shells.set(tier, [...(shells.get(tier) || []), item]);
      });
      return [
        ...placeFactorTier(shells.get(1) || [], shellRadii.factorCore),
        ...placeFactorTier(shells.get(2) || [], shellRadii.factorMid),
        ...placeFactorTier(shells.get(3) || [], shellRadii.factorOuter),
      ];
    };

    const placeAmbientTier = (items: DriGraphNode[], radius: number) =>
      assignUniformShellPositions(items, radius, (item) => {
        const clusterKey = item.clusterKey || systemClusterKeys[0] || 'unassigned';
        return systemAnchors.get(clusterKey) || ([0, 0, 1] as Vec3);
      });

    const placeAmbientNodes = (items: DriGraphNode[]) => {
      const tiers = new Map<number, DriGraphNode[]>();
      items.forEach((item) => {
        const tier = item.tier || 1;
        tiers.set(tier, [...(tiers.get(tier) || []), item]);
      });
      return [
        ...placeAmbientTier(tiers.get(1) || [], shellRadii.systemCore),
        ...placeAmbientTier(tiers.get(2) || [], shellRadii.systemAssembly),
        ...placeAmbientTier(tiers.get(3) || [], shellRadii.systemComponent),
        ...placeAmbientTier(tiers.get(4) || [], shellRadii.systemMicro),
      ];
    };

    layout.push(...placeHemisphereShell(failedNodes, 'left', shellRadii.reagents));
    layout.push(...placeFactorClusters(factorNodes));
    layout.push(...placeHemisphereShell(correctNodes, 'right', shellRadii.reagents));
    layout.push(...placeAmbientNodes(ambientNodes));
    return layout;
  }, [edges, nodes, shellControls]);

  const selectedNodeSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);

  const positionLookup = useMemo(() => new Map(positionedNodes.map((node) => [node.id, node.position])), [positionedNodes]);
  const graphDistanceMap = useMemo(() => buildGraphDistanceMap(selectedNodeIds, edges), [edges, selectedNodeIds]);

  const focusGraph = useMemo(() => {
    if (!focusedSystemKey) {
      return null;
    }

    const rootCluster = `ambient:${focusedSystemKey}`;
    const ambientNodeIds = new Set(
      nodes.filter((node) => node.type === 'ambient_factor' && node.clusterKey === rootCluster).map((node) => node.id),
    );

    if (!ambientNodeIds.size) {
      return null;
    }

    const signalNodeIds = new Set<string>();
    const reagentNodeIds = new Set<string>();

    edges.forEach((edge) => {
      if (!edge.relationType.startsWith('signal_hierarchy:')) {
        return;
      }

      if (ambientNodeIds.has(edge.sourceId) && edge.targetId.startsWith('signal:')) {
        signalNodeIds.add(edge.targetId);
      }
      if (ambientNodeIds.has(edge.targetId) && edge.sourceId.startsWith('signal:')) {
        signalNodeIds.add(edge.sourceId);
      }
    });

    edges.forEach((edge) => {
      if (signalNodeIds.has(edge.sourceId) && edge.targetId.startsWith('reagent:')) {
        reagentNodeIds.add(edge.targetId);
      }
      if (signalNodeIds.has(edge.targetId) && edge.sourceId.startsWith('reagent:')) {
        reagentNodeIds.add(edge.sourceId);
      }
    });

    const nodeIds = new Set<string>([...ambientNodeIds, ...signalNodeIds, ...reagentNodeIds]);
    const edgeIds = new Set<string>();

    edges.forEach((edge) => {
      const ambientHierarchy =
        edge.relationType === 'ambient_hierarchy' && ambientNodeIds.has(edge.sourceId) && ambientNodeIds.has(edge.targetId);
      const signalBridge =
        edge.relationType.startsWith('signal_hierarchy:') &&
        ((ambientNodeIds.has(edge.sourceId) && signalNodeIds.has(edge.targetId)) ||
          (ambientNodeIds.has(edge.targetId) && signalNodeIds.has(edge.sourceId)));
      const reagentBridge =
        (signalNodeIds.has(edge.sourceId) && reagentNodeIds.has(edge.targetId)) ||
        (signalNodeIds.has(edge.targetId) && reagentNodeIds.has(edge.sourceId));

      if (ambientHierarchy || signalBridge || reagentBridge) {
        edgeIds.add(edge.id);
      }
    });

    return { nodeIds, edgeIds };
  }, [edges, focusedSystemKey, nodes]);

  return (
    <>
      <ambientLight intensity={sceneConfig.ambientLight} />
      {sceneConfig.pointLights.map((light) => (
        <pointLight
          key={`${light.position.join(':')}:${light.color}`}
          position={[...light.position] as [number, number, number]}
          intensity={light.intensity}
          color={light.color}
        />
      ))}
      <group ref={sceneRef}>
        {edges.map((edge) => {
          const start = positionLookup.get(edge.sourceId);
          const end = positionLookup.get(edge.targetId);
          if (!start || !end) {
            return null;
          }
          const edgeFocused = Boolean(focusGraph?.edgeIds.has(edge.id));
          const sourceDistance = graphDistanceMap?.get(edge.sourceId);
          const targetDistance = graphDistanceMap?.get(edge.targetId);
          const disconnectedFromSelection = selectedNodeIds.length > 0 && sourceDistance === undefined && targetDistance === undefined;
          const nearestDistance =
            sourceDistance === undefined
              ? targetDistance
              : targetDistance === undefined
                ? sourceDistance
                : Math.min(sourceDistance, targetDistance);
          const furthestDistance =
            sourceDistance === undefined
              ? targetDistance
              : targetDistance === undefined
                ? sourceDistance
                : Math.max(sourceDistance, targetDistance);
          const edgeColorDistanceWeight = selectedNodeIds.length ? routePresence(nearestDistance, 0.02, 0.6) : 1;
          const edgeOpacityDistanceWeight = selectedNodeIds.length ? routePresence(furthestDistance, 0.02, 0.58) : 1;
          const edgeCaseStrength = normalizeEdgeCaseStrength(edge.weight);
          const edgeColorBase = focusGraph
            ? edgeFocused
              ? saturateColor(edge.color, 1.12 + edgeCaseStrength * 0.2)
              : mixColors('#d8e0e6', edge.color, 0.22)
            : disconnectedFromSelection
              ? mixColors('#e6edf2', edge.color, 0.02)
              : saturateColor(edge.color, 0.9 + edgeColorDistanceWeight * 0.18 + edgeCaseStrength * 0.2);
          const edgeColor = selectedNodeIds.length
            ? mixColors('#dde5eb', edgeColorBase, disconnectedFromSelection ? 0.02 : 0.12 + edgeColorDistanceWeight * 0.88)
            : edgeColorBase;

          const xSpan = end[0] - start[0];
          const zSpan = end[2] - start[2];
          const arcBias = edge.arcBias ?? 0;
          const connectionConfig = DRI_GRAPH_CONFIG.connections;
          const controlLift = clamp(
            Math.abs(xSpan) * connectionConfig.arc.horizontalLift + Math.abs(arcBias) * connectionConfig.arc.biasLift,
            connectionConfig.arc.minLift,
            connectionConfig.arc.maxLift,
          );
          const controlZ = clamp(
            zSpan * connectionConfig.arc.depthSpan + arcBias * connectionConfig.arc.depthBias,
            -connectionConfig.arc.maxDepth,
            connectionConfig.arc.maxDepth,
          );
          const midA: [number, number, number] = [
            start[0] + xSpan * connectionConfig.arc.startHandle,
            start[1] + controlLift,
            start[2] + controlZ,
          ];
          const midB: [number, number, number] = [
            start[0] + xSpan * connectionConfig.arc.endHandle,
            end[1] + controlLift * connectionConfig.arc.endLift,
            end[2] - controlZ,
          ];

          return (
            <CubicBezierLine
              key={edge.id}
              start={start}
              end={end}
              midA={midA}
              midB={midB}
              color={edgeColor}
              lineWidth={Math.max(
                disconnectedFromSelection ? connectionConfig.width.disconnectedMinimum : connectionConfig.width.normalMinimum,
                edge.weight *
                  (edgeFocused
                    ? connectionConfig.width.focusedMultiplier
                    : disconnectedFromSelection
                      ? connectionConfig.width.disconnectedMultiplier
                      : connectionConfig.width.normalMultiplier) *
                  (0.9 + edgeCaseStrength * 0.14),
              )}
              transparent
              opacity={(() => {
                let nextOpacity = (edge.opacity ?? 0.44 + edgeCaseStrength * 0.34) * (0.9 + edgeCaseStrength * 0.14);
                if (focusGraph) {
                  nextOpacity = edgeFocused
                    ? Math.min(1, nextOpacity * (1.14 + edgeCaseStrength * 0.18) + 0.06)
                    : Math.min(0.012, nextOpacity * 0.045);
                }
                if (disconnectedFromSelection) {
                  return focusGraph ? 0.008 : 0.01;
                }
                if (selectedNodeIds.length) {
                  nextOpacity = Math.min(1, nextOpacity * (0.06 + edgeOpacityDistanceWeight * 0.94));
                }
                if (selectedNodeSet.has(edge.sourceId) || selectedNodeSet.has(edge.targetId)) {
                  return Math.max(nextOpacity, 0.82 + edgeCaseStrength * 0.12);
                }
                if (selectedNodeIds.length && !focusGraph && !selectedNodeSet.has(edge.sourceId) && !selectedNodeSet.has(edge.targetId)) {
                  return Math.max(0.18, Math.min(0.88, nextOpacity));
                }
                return nextOpacity;
              })()}
            />
          );
        })}
        {positionedNodes.map((node) => (
          <FloatingNode
            key={node.id}
            node={node}
            selected={selectedNodeSet.has(node.id)}
            onToggle={onToggleNode}
            muted={Boolean(focusGraph && !focusGraph.nodeIds.has(node.id) && !selectedNodeSet.has(node.id))}
            boosted={Boolean(focusGraph?.nodeIds.has(node.id)) || selectedNodeSet.has(node.id)}
            selectionActive={selectedNodeIds.length > 0}
            graphDistance={graphDistanceMap?.get(node.id)}
          />
        ))}
      </group>
      <OrbitControls
        enablePan
        enableDamping
        dampingFactor={sceneConfig.controls.dampingFactor}
        minDistance={sceneConfig.controls.minDistance}
        maxDistance={sceneConfig.controls.maxDistance}
        target={[...sceneConfig.controls.target] as [number, number, number]}
        autoRotate
        autoRotateSpeed={sceneConfig.controls.autoRotateSpeed}
        rotateSpeed={sceneConfig.controls.rotateSpeed}
        zoomSpeed={sceneConfig.controls.zoomSpeed}
      />
    </>
  );
}

export default function DriGraph3D(props: DriGraph3DProps) {
  if (props.nodes.length === 0) {
    return <div className="dri-graph-empty">Selecciona reactivos fallidos y correctos para construir el grafo relacional.</div>;
  }

  return (
    <div className="dri-graph-canvas">
      <Canvas
        camera={{
          position: [...DRI_GRAPH_CONFIG.scene.camera.position] as [number, number, number],
          fov: DRI_GRAPH_CONFIG.scene.camera.fov,
        }}
      >
        <color attach="background" args={[DRI_GRAPH_CONFIG.scene.background]} />
        <fog attach="fog" args={[DRI_GRAPH_CONFIG.scene.background, DRI_GRAPH_CONFIG.scene.fog.near, DRI_GRAPH_CONFIG.scene.fog.far]} />
        <GraphScene {...props} />
      </Canvas>
    </div>
  );
}
