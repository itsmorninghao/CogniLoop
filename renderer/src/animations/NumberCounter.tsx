/**
 * NumberCounter — Animated counting number from/to with optional prefix/suffix.
 */
import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import type { ThemeConfig } from "../types";

interface Props {
  from: number;
  to: number;
  startFrame: number;
  durationFrames?: number;
  prefix?: string;
  suffix?: string;
  fontSize?: number;
  color?: string;
  theme: ThemeConfig;
}

export const NumberCounter: React.FC<Props> = ({
  from,
  to,
  startFrame,
  durationFrames = 36,
  prefix = "",
  suffix = "",
  fontSize = 72,
  color,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = frame - startFrame;

  if (localFrame < 0) return null;

  const entranceProgress = spring({
    frame: localFrame,
    fps,
    config: { damping: 14, stiffness: 120 },
  });
  const opacity = interpolate(entranceProgress, [0, 1], [0, 1]);
  const scale = interpolate(entranceProgress, [0, 1], [0.5, 1]);

  const value = interpolate(localFrame, [0, durationFrames], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Determine decimal places from the target value
  const decimals = Number.isInteger(to) ? 0 : 1;
  const displayValue = value.toFixed(decimals);

  return (
    <span
      style={{
        fontSize,
        fontWeight: 800,
        fontFamily: "'Inter', 'Noto Sans SC', monospace",
        color: color ?? theme.primary,
        opacity,
        transform: `scale(${scale})`,
        display: "inline-block",
        transformOrigin: "center",
        lineHeight: 1.1,
      }}
    >
      {prefix}{displayValue}{suffix}
    </span>
  );
};
