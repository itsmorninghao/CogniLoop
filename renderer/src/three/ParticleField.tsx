import React, { useMemo, useRef } from "react";
import { ThreeCanvas } from "@remotion/three";
import { useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";

interface ParticleFieldProps {
  color?: string;
  count?: number;
  speed?: number;
}

const Particles: React.FC<{ color: string; count: number; speed: number }> = ({
  color,
  count,
  speed,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;

  // Generate deterministic particle positions
  const particles = useMemo(() => {
    const positions: [number, number, number][] = [];
    for (let i = 0; i < count; i++) {
      // Use golden ratio distribution for even spacing
      const phi = i * 2.39996; // golden angle
      const r = Math.sqrt(i / count) * 8;
      positions.push([
        Math.cos(phi) * r,
        (Math.sin(i * 1.7) * 2 - 1) * 4,
        Math.sin(phi) * r - 5,
      ]);
    }
    return positions;
  }, [count]);

  const positionArray = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const [baseX, baseY, baseZ] = particles[i];
      // Gentle floating motion
      arr[i * 3] = baseX + Math.sin(time * speed + i * 0.5) * 0.3;
      arr[i * 3 + 1] = baseY + Math.cos(time * speed * 0.7 + i * 0.3) * 0.2;
      arr[i * 3 + 2] = baseZ;
    }
    return arr;
  }, [particles, time, speed, count]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positionArray}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={0.06}
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
};

export const ParticleField: React.FC<ParticleFieldProps> = ({
  color = "#818cf8",
  count = 60,
  speed = 0.3,
}) => {
  return (
    <ThreeCanvas
      width={1920}
      height={1080}
      style={{ position: "absolute", top: 0, left: 0 }}
      camera={{ position: [0, 0, 5], fov: 60 }}
      gl={{ antialias: false }}
    >
      <Particles color={color} count={count} speed={speed} />
    </ThreeCanvas>
  );
};
