import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import type { ThemeConfig } from "../types";

interface DividerProps {
  theme: ThemeConfig;
  delay?: number;
  width?: number;
}

export const Divider: React.FC<DividerProps> = ({
  theme,
  delay = 4,
  width = 80,
}) => {
  const frame = useCurrentFrame();
  const adjustedFrame = Math.max(0, frame - delay);

  const currentWidth = interpolate(adjustedFrame, [0, 12], [0, width], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        height: 3,
        width: currentWidth,
        background: theme.accentBarGradient,
        borderRadius: 2,
        marginTop: 12,
        marginBottom: 20,
      }}
    />
  );
};
