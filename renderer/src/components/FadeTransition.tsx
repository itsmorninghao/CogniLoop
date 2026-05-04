import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";

interface FadeTransitionProps {
  startFrame: number;
  duration: number;
  color?: string;
}

export const FadeTransition: React.FC<FadeTransitionProps> = ({
  startFrame,
  duration,
  color = "black",
}) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [startFrame, startFrame + duration], [0, 0.34], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (opacity <= 0) return null;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: color,
        opacity,
        zIndex: 100,
      }}
    />
  );
};
