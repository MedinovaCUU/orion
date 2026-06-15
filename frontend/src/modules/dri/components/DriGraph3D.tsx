import { Billboard, CubicBezierLine, OrbitControls, Text } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { AdditiveBlending, type Group, type Mesh } from 'three';
import type { DriGraphEdge, DriGraphNode } from '../driTypes';

interface DriGraph3DProps {
  nodes: DriGraphNode[];
  edges: DriGraphEdge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
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

const addVec = ([ax, ay, az]: Vec3, [bx, by, bz]: Vec3): Vec3 => [ax + bx, ay + by, az + bz];

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

const directionFromAngles = (azimuth: number, elevation: number): Vec3 =>
  normalizeVec([Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth)]);

function GraphScaffold() {
  const ringARef = useRef<Group>(null);
  const ringBRef = useRef<Group>(null);
  const spineRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    if (ringARef.current) {
      ringARef.current.rotation.z = elapsed * 0.018;
      ringARef.current.rotation.x = Math.PI / 2.82 + Math.sin(elapsed * 0.14) * 0.04;
    }
    if (ringBRef.current) {
      ringBRef.current.rotation.z = -elapsed * 0.014;
      ringBRef.current.rotation.y = Math.PI / 5.5 + Math.cos(elapsed * 0.18) * 0.04;
    }
    if (spineRef.current) {
      spineRef.current.rotation.y = elapsed * 0.01;
    }
  });

  return (
    <group position={[0, 0.08, -1.75]}>
      <group ref={ringARef}>
        <mesh rotation={[Math.PI / 2.84, 0.06, 0]}>
          <torusGeometry args={[5.8, 0.01, 8, 144]} />
          <meshBasicMaterial color="#dde6ed" transparent opacity={0.16} toneMapped={false} />
        </mesh>
      </group>
      <group ref={ringBRef}>
        <mesh rotation={[Math.PI / 2.16, 0.22, 0]}>
          <torusGeometry args={[8.05, 0.008, 8, 160]} />
          <meshBasicMaterial color="#e2e9ef" transparent opacity={0.08} toneMapped={false} />
        </mesh>
      </group>
      <group ref={spineRef}>
        <mesh rotation={[Math.PI / 2.04, 0, 0]} position={[0, 0, -0.18]}>
          <torusGeometry args={[3.15, 0.008, 8, 128]} />
          <meshBasicMaterial color="#f2c3bb" transparent opacity={0.09} blending={AdditiveBlending} toneMapped={false} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2.3]} position={[0, 0.1, -0.08]}>
          <torusGeometry args={[2.45, 0.006, 8, 112]} />
          <meshBasicMaterial color="#d7e0e7" transparent opacity={0.08} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

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

function FloatingNode({
  node,
  selected,
  onSelect,
}: {
  node: PositionedNode;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const groupRef = useRef<Group>(null);
  const meshRef = useRef<Mesh>(null);
  const glowRef = useRef<Mesh>(null);
  const floatOffset = useMemo(() => Math.random() * Math.PI * 2, []);
  const associationStrength = Math.max(0, Math.min(1, node.associationStrength));
  const ambient = node.type === 'ambient_factor';
  const factor = node.type === 'factor';
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
    : selected
      ? 0.98
      : 0.34 + associationStrength * 0.42;
  const wireOpacity = ambient
    ? (selected ? 0.14 : 0.04 + associationStrength * 0.08)
    : (selected ? 0.18 : 0.06) + associationStrength * 0.14;
  const glowOpacity = ambient
    ? (selected ? 0.05 : 0.012 + associationStrength * 0.022)
    : (selected ? 0.1 : 0.025) + associationStrength * 0.05;
  const coreFillColor = mixColors('#dfe6eb', node.color, 0.12 + associationStrength * 0.56);
  const labelOffset = ambient ? (selected ? -0.46 : -0.38) : selected ? -0.85 : -0.72;
  const showSubtitle = selected;
  const factorLabelOpacity = factor ? (selected ? 1 : 0.24 + associationStrength * 0.68) : ambient ? (selected ? 0.82 : 0.48) : 1;
  const subtitleOpacity = factor ? (selected ? 0.76 : 0.18 + associationStrength * 0.28) : 0.74;

  useFrame(({ clock }) => {
    if (!meshRef.current || !groupRef.current || !glowRef.current) {
      return;
    }

    const elapsed = clock.getElapsedTime();
    const pulse = 1 + Math.sin(elapsed * (ambient ? 1.4 : 2.2) + floatOffset) * (ambient ? 0.018 : 0.035);
    groupRef.current.position.y = node.position[1] + Math.sin(elapsed * (ambient ? 0.46 : 0.72) + floatOffset) * (ambient ? 0.05 : 0.09);
    meshRef.current.rotation.x += ambient ? 0.0012 : 0.002;
    meshRef.current.rotation.y += ambient ? 0.0018 : 0.0036;
    glowRef.current.scale.setScalar((selected ? (ambient ? 1.18 : 1.34) : ambient ? 1.08 : 1.22) * pulse);
  });

  return (
    <group ref={groupRef} position={node.position}>
      <mesh ref={glowRef}>
        <icosahedronGeometry args={[glowNodeRadius, 1]} />
        <meshBasicMaterial
          color={node.color}
          transparent
          opacity={glowOpacity}
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <mesh
        ref={meshRef}
        onClick={() => onSelect(node.id)}
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
          emissive={node.color}
          emissiveIntensity={(selected ? (ambient ? 0.06 : 0.2) : ambient ? 0.012 : 0.03) + associationStrength * (ambient ? 0.06 : 0.15)}
          roughness={ambient ? 0.2 : 0.16}
          metalness={ambient ? 0.92 : factor ? 0.88 : 0.84}
          transparent
          opacity={coreOpacity}
        />
      </mesh>
      <mesh scale={1.02}>
        <icosahedronGeometry args={[baseNodeRadius, 1]} />
        <meshBasicMaterial
          color={node.color}
          transparent
          opacity={wireOpacity}
          wireframe
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <Billboard follow position={[0, labelOffset, 0]}>
        <Text
          color="#263640"
          fontSize={ambient ? (selected ? 0.16 : 0.13) : selected ? 0.28 : factor ? 0.18 : 0.22}
          maxWidth={ambient ? 1.8 : 2.4}
          lineHeight={1.1}
          textAlign="center"
          anchorX="center"
          anchorY="middle"
          renderOrder={100}
          outlineWidth={0.018}
          outlineColor="#f5f8fb"
          material-transparent
          material-opacity={factorLabelOpacity}
          material-depthTest={false}
          material-depthWrite={false}
          material-toneMapped={false}
        >
          {node.label}
        </Text>
        {showSubtitle ? (
          <Text
            position={[0, ambient ? -0.2 : selected ? -0.33 : -0.28, 0]}
            color="#718390"
            fontSize={ambient ? 0.1 : 0.14}
            maxWidth={ambient ? 2.1 : 2.7}
            lineHeight={1.05}
            textAlign="center"
            anchorX="center"
            anchorY="middle"
            renderOrder={101}
            outlineWidth={0.01}
            outlineColor="#f5f8fb"
            material-transparent
            material-opacity={subtitleOpacity}
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
  selectedNodeId,
  onSelectNode,
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
    const ambientNodes = nodes.filter((node) => node.orbit === 'ambient' || node.type === 'ambient_factor');

    const layout: PositionedNode[] = [];

    const shellRadii = {
      factorCore: 3.12,
      factorMid: 4.46,
      factorOuter: 5.59,
      ambient: 1.05,
      reagents: 9.6,
    };

    const factorShellByCategory: Record<string, keyof typeof shellRadii> = {
      reaction: 'factorCore',
      technique: 'factorCore',
      trend: 'factorCore',
      scheme: 'factorMid',
      r2: 'factorMid',
      wavelength: 'factorMid',
      blank: 'factorMid',
      temperature: 'factorOuter',
      storage: 'factorOuter',
      water: 'factorOuter',
      contamination: 'factorOuter',
      dilution: 'factorOuter',
      volume: 'factorOuter',
      service: 'factorOuter',
      control: 'factorOuter',
      subsystem: 'factorOuter',
      default: 'factorMid',
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

    const placeSphericalShell = (items: DriGraphNode[], radius: number, rotationYPhase: number, rotationXPhase: number) => {
      return items.map<PositionedNode>((item, index) => {
        const count = Math.max(items.length, 1);
        const t = count === 1 ? 0.5 : index / Math.max(count - 1, 1);
        const y = 1 - t * 2;
        const radial = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = index * goldenAngle + rotationYPhase;
        let point: Vec3 = [Math.cos(theta) * radial, y, Math.sin(theta) * radial];
        point = rotateY(point, rotationYPhase);
        point = rotateX(point, rotationXPhase);
        const direction = normalizeVec(point);

        return {
          ...item,
          position: scaleVec(direction, radius),
        };
      });
    };

    const placeFactorClusters = (items: DriGraphNode[]) => {
      const shells = new Map<keyof typeof shellRadii, DriGraphNode[]>();
      items.forEach((item) => {
        const shellKey = factorShellByCategory[item.clusterKey || 'default'] || factorShellByCategory.default;
        shells.set(shellKey, [...(shells.get(shellKey) || []), item]);
      });

      return [
        ...placeSphericalShell(shells.get('factorCore') || [], shellRadii.factorCore, 0.32, 0.22),
        ...placeSphericalShell(shells.get('factorMid') || [], shellRadii.factorMid, 0.84, -0.12),
        ...placeSphericalShell(shells.get('factorOuter') || [], shellRadii.factorOuter, 1.36, 0.28),
      ];
    };

    const ambientAnchors: Record<string, Vec3> = {
      ambient_optics: directionFromAngles(Math.PI * 1.02, 0.24),
      ambient_rotor: directionFromAngles(Math.PI * 0.08, 0.18),
      ambient_fluidics: directionFromAngles(Math.PI * 1.56, -0.22),
      ambient_dilution: directionFromAngles(Math.PI * 0.56, -0.16),
    };

    const placeAmbientNodes = (items: DriGraphNode[]) =>
      items.map<PositionedNode>((item, index) => {
        const anchor = ambientAnchors[item.clusterKey || ''] || directionFromAngles(Math.PI * 1.5, 0.92);
        const drift = index % 2 === 0 ? 0.08 : -0.08;
        const drifted = normalizeVec(addVec(anchor, [drift * 0.12, drift * 0.12, drift * 0.12]));
        return {
          ...item,
          position: scaleVec(drifted, shellRadii.ambient),
        };
      });

    layout.push(...placeHemisphereShell(failedNodes, 'left', shellRadii.reagents));
    layout.push(...placeFactorClusters(factorNodes));
    layout.push(...placeHemisphereShell(correctNodes, 'right', shellRadii.reagents));
    layout.push(...placeAmbientNodes(ambientNodes));
    return layout;
  }, [nodes]);

  const positionLookup = useMemo(
    () => new Map(positionedNodes.map((node) => [node.id, node.position])),
    [positionedNodes],
  );

  return (
    <>
      <ambientLight intensity={1.08} />
      <pointLight position={[0, 7, 8]} intensity={0.92} color="#a9dfe7" />
      <pointLight position={[-6, 2, 6]} intensity={0.42} color="#eab2a5" />
      <pointLight position={[6, -1, 6]} intensity={0.44} color="#83d8c2" />
      <group ref={sceneRef}>
        <GraphScaffold />
        {edges.map((edge) => {
          const start = positionLookup.get(edge.sourceId);
          const end = positionLookup.get(edge.targetId);
          if (!start || !end) {
            return null;
          }

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
              color={edge.color}
              lineWidth={Math.max(0.9, edge.weight * 1.55)}
              transparent
              opacity={
                selectedNodeId && edge.sourceId !== selectedNodeId && edge.targetId !== selectedNodeId
                  ? Math.min(0.12, edge.opacity ?? 0.18)
                  : edge.opacity ?? 0.62
              }
            />
          );
        })}
        {positionedNodes.map((node) => (
          <FloatingNode
            key={node.id}
            node={node}
            selected={selectedNodeId === node.id}
            onSelect={onSelectNode}
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
        <fog attach="fog" args={['#eff4f7', 28, 46]} />
        <GraphScene {...props} />
      </Canvas>
    </div>
  );
}
