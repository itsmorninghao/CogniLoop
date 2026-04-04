import React, { useMemo } from "react";
import { ThreeCanvas } from "@remotion/three";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import * as THREE from "three";

interface GlowOrbProps {
  color?: string;
  size?: number;
  opacity?: number;
}

const Orb: React.FC<{ color: string; size: number; opacity: number }> = ({
  color,
  size,
  opacity,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;

  // Pulsing scale
  const scale = 1 + Math.sin(time * 1.2) * 0.08;
  const scaledSize = (size / 200) * scale;

  // Position offset — gentle drift
  const x = Math.sin(time * 0.3) * 0.5 + 2;
  const y = Math.cos(time * 0.4) * 0.3 + 0.5;

  return (
    <group position={[x, y, -3]}>
      {/* Core sphere */}
      <mesh scale={[scaledSize, scaledSize, scaledSize]}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity * 0.8}
        />
      </mesh>
      {/* Outer glow (larger, more transparent) */}
      <mesh scale={[scaledSize * 1.8, scaledSize * 1.8, scaledSize * 1.8]}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity * 0.15}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

export const GlowOrb: React.FC<GlowOrbProps> = ({
  color = "#8b5cf6",
  size = 200,
  opacity = 0.15,
}) => {
  return (
    <ThreeCanvas
      width={1920}
      height={1080}
      style={{ position: "absolute", top: 0, left: 0 }}
      camera={{ position: [0, 0, 5], fov: 60 }}
      gl={{ antialias: false }}
    >
      <Orb color={color} size={size} opacity={opacity} />
    </ThreeCanvas>
  );
};
