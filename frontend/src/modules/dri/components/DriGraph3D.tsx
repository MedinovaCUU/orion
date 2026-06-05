import { Billboard, Line, OrbitControls, Text } from '@react-three/drei';
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
  const baseNodeRadius = selected ? 0.46 : 0.35 + node.emphasis * 0.024;
  const glowNodeRadius = selected ? 0.62 : 0.52 + node.emphasis * 0.028;
  const coreOpacity = selected ? 0.96 : 0.34 + associationStrength * 0.42;
  const wireOpacity = (selected ? 0.18 : 0.06) + associationStrength * 0.14;
  const glowOpacity = (selected ? 0.1 : 0.025) + associationStrength * 0.05;
  const coreFillColor = mixColors('#dfe6eb', node.color, 0.12 + associationStrength * 0.56);

  useFrame(({ clock }) => {
    if (!meshRef.current || !groupRef.current || !glowRef.current) {
      return;
    }

    const elapsed = clock.getElapsedTime();
    const pulse = 1 + Math.sin(elapsed * 2.2 + floatOffset) * 0.035;
    groupRef.current.position.y = node.position[1] + Math.sin(elapsed * 0.72 + floatOffset) * 0.09;
    meshRef.current.rotation.x += 0.002;
    meshRef.current.rotation.y += 0.0036;
    glowRef.current.scale.setScalar((selected ? 1.34 : 1.22) * pulse);
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
          emissiveIntensity={(selected ? 0.2 : 0.03) + associationStrength * 0.15}
          roughness={0.16}
          metalness={0.84}
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
      <Billboard follow position={[0, selected ? -0.85 : -0.72, 0]}>
        <Text
          color="#263640"
          fontSize={selected ? 0.28 : 0.22}
          maxWidth={2.4}
          lineHeight={1.1}
          textAlign="center"
          anchorX="center"
          anchorY="middle"
          renderOrder={100}
          outlineWidth={0.018}
          outlineColor="#f5f8fb"
          material-depthTest={false}
          material-depthWrite={false}
          material-toneMapped={false}
        >
          {node.label}
        </Text>
        <Text
          position={[0, selected ? -0.33 : -0.28, 0]}
          color="#718390"
          fontSize={0.14}
          maxWidth={2.7}
          lineHeight={1.05}
          textAlign="center"
          anchorX="center"
          anchorY="middle"
          renderOrder={101}
          outlineWidth={0.01}
          outlineColor="#f5f8fb"
          material-depthTest={false}
          material-depthWrite={false}
          material-toneMapped={false}
        >
          {node.subtitle}
        </Text>
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
  const positionedNodes = useMemo<PositionedNode[]>(() => {
    const failedNodes = nodes.filter((node) => node.type === 'failed_reagent');
    const correctNodes = nodes.filter((node) => node.type === 'correct_reagent');
    const factorNodes = nodes.filter((node) => node.type === 'factor');

    const layout: PositionedNode[] = [];
    const placeSideArc = (items: DriGraphNode[], x: number, direction: 1 | -1) => {
      const radiusY = Math.max(2.7, items.length * 0.82);
      const radiusZ = Math.max(1.6, items.length * 0.44);
      const radiusX = 0.46;
      const arcSpan = Math.min(Math.PI * 0.98, 1.05 + items.length * 0.32);
      const startAngle = Math.PI / 2 + arcSpan / 2;

      return items.map<PositionedNode>((item, index) => ({
        ...item,
        position: (() => {
          const progress = items.length === 1 ? 0.5 : index / Math.max(items.length - 1, 1);
          const angle = startAngle - progress * arcSpan;
          return [
            x + Math.cos(angle) * radiusX * direction,
            Math.sin(angle) * radiusY,
            Math.cos(angle) * radiusZ,
          ] as [number, number, number];
        })(),
      }));
    };

    const factorRadiusX = 4.05;
    const factorRadiusY = 2.55;
    const factorRadiusZ = 1.55;
    const factorPlaced = factorNodes.map<PositionedNode>((item, index) => {
      const angle = (index / Math.max(factorNodes.length, 1)) * Math.PI * 2;
      return {
        ...item,
        position: [
          Math.cos(angle) * factorRadiusX * 0.76,
          Math.sin(angle) * factorRadiusY,
          Math.sin(angle) * factorRadiusZ + Math.cos(angle * 2) * 0.42,
        ],
      };
    });

    layout.push(...placeSideArc(failedNodes, -5.35, -1));
    layout.push(...factorPlaced);
    layout.push(...placeSideArc(correctNodes, 5.35, 1));
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
      {edges.map((edge) => {
        const start = positionLookup.get(edge.sourceId);
        const end = positionLookup.get(edge.targetId);
        if (!start || !end) {
          return null;
        }

        return (
          <Line
            key={edge.id}
            points={[start, end]}
            color={edge.color}
            lineWidth={Math.max(1.5, edge.weight * 2.4)}
            transparent
            opacity={selectedNodeId && edge.sourceId !== selectedNodeId && edge.targetId !== selectedNodeId ? 0.28 : 0.78}
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
      <OrbitControls
        enablePan={false}
        minDistance={8}
        maxDistance={24}
        autoRotate
        autoRotateSpeed={0.24}
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
      <Canvas camera={{ position: [0, 1.2, 12], fov: 42 }}>
        <color attach="background" args={['#edf2f5']} />
        <fog attach="fog" args={['#edf2f5', 13.5, 30]} />
        <GraphScene {...props} />
      </Canvas>
    </div>
  );
}
