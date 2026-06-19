import { Billboard, CubicBezierLine, OrbitControls, Text } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
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
    return [
      [0, 0, 1] as Vec3,
      [0, 0, -1] as Vec3,
    ];
  }

  return Array.from({ length: count }, (_, index) => {
    const y = 1 - (2 * (index + 0.5)) / count;
    const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
    const azimuth = index * goldenAngle;
    return normalizeVec([Math.cos(azimuth) * ringRadius, y, Math.sin(azimuth) * ringRadius]);
  });
};

const relaxDirectionsOnSphere = (seed: Vec3[], iterations = 80) => {
  let points = seed.map((point) => normalizeVec(point));

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = points.map(([x, y, z]) => [x, y, z] as Vec3);
    const step = 0.085 * (1 - iteration / iterations);

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
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
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

  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
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

const routePresence = (distance: number | undefined, disconnected = 0.03, floor = 0.55) => {
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
  const distanceNodeFactor = selectionActive ? routePresence(graphDistance, 0.025, 0.62) : 1;
  const distanceTextFactor = selectionActive ? routePresence(graphDistance, 0.02, 0.58) : 1;
  const mutedFactor = muted ? 0.025 : distanceNodeFactor;
  const mutedTextFactor = muted ? 0.02 : distanceTextFactor;
  const connectedOnRoute = selectionActive && graphDistance !== undefined && !muted;
  const connectedTextContrast = connectedOnRoute ? clamp(0.9 - graphDistance * 0.035, 0.76, 0.92) : 0;
  const connectedSubtitleContrast = connectedOnRoute ? clamp(0.74 - graphDistance * 0.04, 0.58, 0.8) : 0;
  const ambient = node.type === 'ambient_factor';
  const factor = node.type === 'factor';
  const reagent = !ambient && !factor;
  const baseNodeRadius = ambient
    ? selected
      ? 0.34
      : 0.24 + node.emphasis * 0.02
    : selected
      ? 0.5
      : 0.34 + node.emphasis * 0.026;
  const glowNodeRadius = ambient
    ? selected
      ? 0.44
      : 0.34 + node.emphasis * 0.03
    : selected
      ? 0.74
      : 0.5 + node.emphasis * 0.03;
  const coreOpacity = ambient
    ? (selected ? 0.5 : 0.18 + associationStrength * 0.18)
    : reagent
      ? selected
        ? 0.98
        : 0.56 + associationStrength * 0.28
      : selected
        ? 0.98
        : 0.34 + associationStrength * 0.42;
  const wireOpacity = ambient
    ? (selected ? 0.14 : 0.04 + associationStrength * 0.08)
    : reagent
      ? (selected ? 0.24 : 0.12) + associationStrength * 0.16
      : (selected ? 0.18 : 0.06) + associationStrength * 0.14;
  const glowOpacity = ambient
    ? (selected ? 0.05 : 0.012 + associationStrength * 0.022)
    : reagent
      ? (selected ? 0.12 : 0.05) + associationStrength * 0.08
      : (selected ? 0.1 : 0.025) + associationStrength * 0.05;
  const highlightColor = reagent
    ? saturateColor(node.color, boosted ? 1.28 : 1.18)
    : boosted
      ? saturateColor(node.color, 1.2)
      : node.color;
  const coreFillColor = reagent
    ? mixColors('#e9eff3', highlightColor, 0.28 + visualAssociationStrength * 0.68)
    : mixColors('#dfe6eb', highlightColor, 0.12 + visualAssociationStrength * 0.56);
  const labelOffset = ambient ? (selected ? -0.46 : -0.38) : selected ? -0.85 : -0.72;
  const showSubtitle = selected;
  const labelColor = mixColors(
    '#eef4f7',
    '#263640',
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
    '#eef4f7',
    '#718390',
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
  const labelOutlineWidth = muted ? 0 : selected ? 0.018 : ambient ? 0.004 + distanceTextFactor * 0.006 : 0.005 + distanceTextFactor * 0.008;
  const subtitleOutlineWidth = muted ? 0 : 0.003 + distanceTextFactor * 0.004;
  const labelOutlineColor = '#f5f8fb';
  const factorLabelOpacity = factor
    ? (selected ? 1 : 0.18 + visualAssociationStrength * 0.58)
    : ambient
      ? (selected ? 0.82 : 0.08 + visualAssociationStrength * 0.42)
      : 1;
  const subtitleOpacity = factor ? (selected ? 0.76 : 0.18 + visualAssociationStrength * 0.28) : 0.74;
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

  useFrame(({ clock, camera }) => {
    if (!meshRef.current || !groupRef.current || !glowRef.current) {
      return;
    }

    const elapsed = clock.getElapsedTime();
    const pulse = 1 + Math.sin(elapsed * (ambient ? 1.4 : 2.2) + floatOffset) * (ambient ? 0.018 : 0.035);
    groupRef.current.position.y = node.position[1] + Math.sin(elapsed * (ambient ? 0.46 : 0.72) + floatOffset) * (ambient ? 0.05 : 0.09);
    meshRef.current.rotation.x += ambient ? 0.0012 : 0.002;
    meshRef.current.rotation.y += ambient ? 0.0018 : 0.0036;
    groupRef.current.getWorldPosition(worldPosition);
    nodeDirection.copy(worldPosition).normalize();
    cameraDirection.copy(camera.position).normalize();
    const facingDot = nodeDirection.dot(cameraDirection);
    const visibilityFactor = ambient
      ? clamp((facingDot + 0.22) / 1.22, 0.06, 1)
      : clamp((facingDot + 0.1) / 1.1, 0.08, 1);
    const scaleFactor = 0.88 + visibilityFactor * 0.12;
    glowRef.current.scale.setScalar(((selected ? (ambient ? 1.18 : 1.34) : ambient ? 1.08 : 1.22) * pulse) * scaleFactor);

    const glowMaterial = glowRef.current.material;
    if (!Array.isArray(glowMaterial) && 'opacity' in glowMaterial) {
      glowMaterial.opacity = Math.max(glowOpacity * visibilityFactor * mutedFactor, connectedGlowOpacityFloor * visibilityFactor);
    }

    const coreMaterial = meshRef.current.material;
    if (!Array.isArray(coreMaterial) && 'opacity' in coreMaterial && 'emissiveIntensity' in coreMaterial) {
      coreMaterial.opacity = Math.max(
        coreOpacity * (0.5 + visibilityFactor * 0.5) * mutedFactor,
        connectedNodeOpacityFloor * (0.4 + visibilityFactor * 0.6),
      );
      coreMaterial.emissiveIntensity =
        (((selected ? (ambient ? 0.06 : 0.2) : ambient ? 0.012 : 0.03) + visualAssociationStrength * (ambient ? 0.06 : 0.15)) *
          (boosted ? 1.2 : 1)) *
        (0.38 + visibilityFactor * 0.62);
    }

    const wireMaterial = wireRef.current?.material;
    if (wireMaterial && !Array.isArray(wireMaterial) && 'opacity' in wireMaterial) {
      wireMaterial.opacity = Math.max(wireOpacity * visibilityFactor * mutedFactor, connectedWireOpacityFloor * visibilityFactor);
    }

  });

  return (
    <group ref={groupRef} position={node.position}>
      <mesh ref={glowRef}>
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
        onClick={() => onToggle(node.id)}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'default';
        }}
      >
        <icosahedronGeometry args={[baseNodeRadius, 1]} />
        <meshStandardMaterial
          color={coreFillColor}
          emissive={highlightColor}
          emissiveIntensity={
            ((selected ? (ambient ? 0.06 : reagent ? 0.26 : 0.2) : ambient ? 0.012 : reagent ? 0.08 : 0.03) +
              visualAssociationStrength * (ambient ? 0.06 : reagent ? 0.22 : 0.15))
          }
          roughness={ambient ? 0.2 : 0.16}
          metalness={ambient ? 0.92 : factor ? 0.88 : 0.84}
          transparent
          opacity={coreOpacity * mutedFactor}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={wireRef} scale={1.02} renderOrder={13}>
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
          fontSize={ambient ? (selected ? 0.16 : 0.13) : selected ? 0.28 : factor ? 0.18 : 0.22}
          maxWidth={ambient ? 1.8 : 2.4}
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
            position={[0, ambient ? -0.2 : selected ? -0.33 : -0.28, 0]}
            color={subtitleColor}
            fontSize={ambient ? 0.1 : 0.14}
            maxWidth={ambient ? 2.1 : 2.7}
            lineHeight={1.05}
            textAlign="center"
            anchorX="center"
            anchorY="middle"
            renderOrder={121}
            outlineWidth={subtitleOutlineWidth}
            outlineColor={labelOutlineColor}
            outlineOpacity={subtitleOutlineOpacity}
            fillOpacity={subtitleFillOpacity}
            depthOffset={-10}
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

function GraphScene({
  nodes,
  edges,
  selectedNodeIds,
  onToggleNode,
  focusedSystemKey,
  shellControls,
}: DriGraph3DProps) {
  const sceneRef = useRef<Group>(null);
  const HERO_ROTATION_X = 0.26;
  const HERO_ROTATION_Y = -0.54;

  useFrame(({ clock }) => {
    if (!sceneRef.current) {
      return;
    }
    const elapsed = clock.getElapsedTime();
    sceneRef.current.rotation.y = HERO_ROTATION_Y + Math.sin(elapsed * 0.18) * 0.055;
    sceneRef.current.rotation.x = HERO_ROTATION_X + Math.sin(elapsed * 0.11) * 0.014;
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

    const systemCore = shellControls?.systemCoreRadius ?? 0.98;
    const systemStep = shellControls?.systemStep ?? 0.98;
    const systemMicro = systemCore + systemStep * 3;
    const factorBase = Math.max(shellControls?.factorBaseRadius ?? 4.18, systemMicro + 0.54);
    const factorStep = shellControls?.factorStep ?? 1.18;
    const factorOuter = factorBase + factorStep * 2;
    const reagentRadius = Math.max(shellControls?.reagentRadius ?? 8.88, factorOuter + 1.5);

    const shellRadii = {
      systemCore,
      systemAssembly: systemCore + systemStep,
      systemComponent: systemCore + systemStep * 2,
      systemMicro,
      factorCore: factorBase,
      factorMid: factorBase + factorStep,
      factorOuter,
      reagents: reagentRadius,
    };

    const placeHemisphereShell = (items: DriGraphNode[], side: 'left' | 'right', radius: number) =>
      items.map<PositionedNode>((item, index) => {
        const count = Math.max(items.length, 1);
        const t = (index + 0.5) / count;
        const diskRadius = Math.sqrt(t) * 0.92;
        const angle = index * goldenAngle;
        const localY = Math.cos(angle) * diskRadius * 0.84;
        const localZ = Math.sin(angle) * diskRadius * 0.76;
        const localX = Math.sqrt(Math.max(0, 1 - localY * localY - localZ * localZ));
        const facing: Vec3 = side === 'left' ? [-localX, localY, localZ] : [localX, localY, localZ];
        const opened = rotateX(rotateY(facing, side === 'left' ? 0.2 : -0.2), -0.08);
        return {
          ...item,
          position: scaleVec(opened, radius),
        };
      });

    const placePolyhedralShell = (items: DriGraphNode[], radius: number, rotationY: number, rotationX: number) => {
      const count = items.length;
      if (count === 0) {
        return [];
      }

      const directions = rotateDirectionSet(getStableShellDirections(count), rotationY, rotationX);

      return items.map<PositionedNode>((item, index) => {
        return {
          ...item,
          position: scaleVec(directions[index], radius),
        };
      });
    };

    const placeFactorClusters = (items: DriGraphNode[]) => {
      const shells = new Map<number, DriGraphNode[]>();
      items.forEach((item) => {
        const shellKey = item.tier || 2;
        shells.set(shellKey, [...(shells.get(shellKey) || []), item]);
      });

      return [
        ...placePolyhedralShell(shells.get(1) || [], shellRadii.factorCore, -0.24, 0.18),
        ...placePolyhedralShell(shells.get(2) || [], shellRadii.factorMid, 0.14, 0.02),
        ...placePolyhedralShell(shells.get(3) || [], shellRadii.factorOuter, 0.52, -0.14),
      ];
    };

    const placeAmbientNodes = (items: DriGraphNode[]) => {
      const tiers = new Map<number, DriGraphNode[]>();
      items.forEach((item) => {
        const tier = item.tier || 1;
        tiers.set(tier, [...(tiers.get(tier) || []), item]);
      });

      return [
        ...placePolyhedralShell(tiers.get(1) || [], shellRadii.systemCore, -0.18, 0.16),
        ...placePolyhedralShell(tiers.get(2) || [], shellRadii.systemAssembly, -0.18, 0.16),
        ...placePolyhedralShell(tiers.get(3) || [], shellRadii.systemComponent, -0.18, 0.16),
        ...placePolyhedralShell(tiers.get(4) || [], shellRadii.systemMicro, -0.18, 0.16),
      ];
    };

    layout.push(...placeHemisphereShell(failedNodes, 'left', shellRadii.reagents));
    layout.push(...placeFactorClusters(factorNodes));
    layout.push(...placeHemisphereShell(correctNodes, 'right', shellRadii.reagents));
    layout.push(...placeAmbientNodes(ambientNodes));
    return layout;
  }, [nodes]);

  const selectedNodeSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);

  const positionLookup = useMemo(
    () => new Map(positionedNodes.map((node) => [node.id, node.position])),
    [positionedNodes],
  );
  const graphDistanceMap = useMemo(() => buildGraphDistanceMap(selectedNodeIds, edges), [edges, selectedNodeIds]);

  const focusGraph = useMemo(() => {
    if (!focusedSystemKey) {
      return null;
    }

    const rootCluster = `ambient:${focusedSystemKey}`;
    const ambientNodeIds = new Set(
      nodes
        .filter((node) => node.type === 'ambient_factor' && node.clusterKey === rootCluster)
        .map((node) => node.id),
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
        edge.relationType === 'ambient_hierarchy' &&
        ambientNodeIds.has(edge.sourceId) &&
        ambientNodeIds.has(edge.targetId);
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
      <ambientLight intensity={1.08} />
      <pointLight position={[0, 7, 8]} intensity={0.92} color="#a9dfe7" />
      <pointLight position={[-6, 2, 6]} intensity={0.42} color="#eab2a5" />
      <pointLight position={[6, -1, 6]} intensity={0.44} color="#83d8c2" />
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
            ? mixColors(
                '#dde5eb',
                edgeColorBase,
                disconnectedFromSelection ? 0.02 : 0.12 + edgeColorDistanceWeight * 0.88,
              )
            : edgeColorBase;

          const xSpan = end[0] - start[0];
          const zSpan = end[2] - start[2];
          const arcBias = edge.arcBias ?? 0;
          const controlLift = clamp(Math.abs(xSpan) * 0.055 + Math.abs(arcBias) * 0.58, 0.28, 1.72);
          const controlZ = clamp(zSpan * 0.2 + arcBias * 0.78, -2.6, 2.6);
          const midA: [number, number, number] = [
            start[0] + xSpan * 0.32,
            start[1] + controlLift,
            start[2] + controlZ,
          ];
          const midB: [number, number, number] = [
            start[0] + xSpan * 0.68,
            end[1] + controlLift * 0.68,
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
                disconnectedFromSelection ? 0.24 : 0.8,
                edge.weight * (edgeFocused ? 1.85 : disconnectedFromSelection ? 0.36 : 1.22) * (0.9 + edgeCaseStrength * 0.14),
              )}
              transparent
              opacity={(() => {
                let nextOpacity = (edge.opacity ?? (0.44 + edgeCaseStrength * 0.34)) * (0.9 + edgeCaseStrength * 0.14);
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
        dampingFactor={0.08}
        minDistance={7.8}
        maxDistance={36}
        target={[0.25, 0.3, 0]}
        autoRotate
        autoRotateSpeed={0.12}
        rotateSpeed={0.72}
        zoomSpeed={0.9}
      />
    </>
  );
}

export default function DriGraph3D(props: DriGraph3DProps) {
  if (props.nodes.length === 0) {
    return (
      <div className="dri-graph-empty">
        Selecciona reactivos fallidos y correctos para construir el grafo relacional.
      </div>
    );
  }

  return (
    <div className="dri-graph-canvas">
      <Canvas camera={{ position: [3.2, 2.1, 17.6], fov: 34 }}>
        <color attach="background" args={['#eff4f7']} />
        <fog attach="fog" args={['#eff4f7', 38, 62]} />
        <GraphScene {...props} />
      </Canvas>
    </div>
  );
}
