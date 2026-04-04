import React, { useMemo } from "react";
import { ThreeCanvas } from "@remotion/three";
import { useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";

interface GeometricShapesProps {
  color?: string;
  count?: number;
}

type ShapeType = "box" | "octahedron" | "torus" | "dodecahedron";

interface ShapeData {
  type: ShapeType;
  position: [number, number, number];
  scale: number;
  rotationSpeed: [number, number, number];
}

const Shape: React.FC<{
  data: ShapeData;
  color: string;
  time: number;
}> = ({ data, color, time }) => {
  const rotation: [number, number, number] = [
    time * data.rotationSpeed[0],
    time * data.rotationSpeed[1],
    time * data.rotationSpeed[2],
  ];

  // Gentle floating
  const y = data.position[1] + Math.sin(time * 0.5 + data.position[0]) * 0.2;

  const geometry = useMemo(() => {
    switch (data.type) {
      case "box":
        return <boxGeometry args={[1, 1, 1]} />;
      case "octahedron":
        return <octahedronGeometry args={[0.7]} />;
      case "torus":
        return <torusGeometry args={[0.5, 0.2, 16, 32]} />;
      case "dodecahedron":
        return <dodecahedronGeometry args={[0.6]} />;
    }
  }, [data.type]);

  return (
    <mesh
      position={[data.position[0], y, data.position[2]]}
      rotation={rotation}
      scale={data.scale}
    >
      {geometry}
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.12}
        wireframe
      />
    </mesh>
  );
};

const Shapes: React.FC<{ color: string; count: number }> = ({ color, count }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;

  const shapes = useMemo((): ShapeData[] => {
    const types: ShapeType[] = ["box", "octahedron", "torus", "dodecahedron"];
    return Array.from({ length: count }, (_, i) => ({
      type: types[i % types.length],
      position: [
        (Math.sin(i * 2.1) * 6),
        (Math.cos(i * 1.7) * 3),
        -4 - Math.random() * 3,
      ] as [number, number, number],
      scale: 0.4 + (i % 3) * 0.2,
      rotationSpeed: [
        0.2 + (i % 5) * 0.1,
        0.3 + (i % 4) * 0.08,
        0.1 + (i % 3) * 0.12,
      ] as [number, number, number],
    }));
  }, [count]);

  return (
    <>
      {shapes.map((shape, i) => (
        <Shape key={i} data={shape} color={color} time={time} />
      ))}
    </>
  );
};

export const GeometricShapes: React.FC<GeometricShapesProps> = ({
  color = "#c4b5fd",
  count = 8,
}) => {
  return (
    <ThreeCanvas
      width={1920}
      height={1080}
      style={{ position: "absolute", top: 0, left: 0 }}
      camera={{ position: [0, 0, 5], fov: 60 }}
      gl={{ antialias: false }}
    >
      <Shapes color={color} count={count} />
    </ThreeCanvas>
  );
};
