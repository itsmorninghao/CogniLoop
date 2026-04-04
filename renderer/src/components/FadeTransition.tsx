import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";

interface FadeTransitionProps {
  /** The frame (relative to this sequence) where the fade starts */
  startFrame: number;
  /** Number of frames for the fade */
  duration: number;
  color?: string;
}

export const FadeTransition: React.FC<FadeTransitionProps> = ({
  startFrame,
  duration,
  color = "black",
}) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [startFrame, startFrame + duration], [0, 1], {
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
