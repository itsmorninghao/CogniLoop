import React from "react";
import { ThreeCanvas } from "@remotion/three";
import { useCurrentFrame, useVideoConfig } from "remotion";

interface GridPlaneProps {
  color?: string;
  opacity?: number;
}

const Grid: React.FC<{ color: string; opacity: number }> = ({ color, opacity }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;

  // Slow scroll effect
  const offsetZ = (time * 0.3) % 1;

  return (
    <group position={[0, -3, -2]} rotation={[-Math.PI / 3, 0, 0]}>
      <gridHelper
        args={[30, 30, color, color]}
        position={[0, 0, offsetZ]}
        material-transparent
        material-opacity={opacity}
      />
    </group>
  );
};

export const GridPlane: React.FC<GridPlaneProps> = ({
  color = "#818cf8",
  opacity = 0.08,
}) => {
  return (
    <ThreeCanvas
      width={1920}
      height={1080}
      style={{ position: "absolute", top: 0, left: 0 }}
      camera={{ position: [0, 1, 5], fov: 60 }}
      gl={{ antialias: false }}
    >
      <Grid color={color} opacity={opacity} />
    </ThreeCanvas>
  );
};
