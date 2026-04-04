import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import type { ThemeConfig } from "../types";
import { VIDEO_WIDTH, VIDEO_HEIGHT } from "../types";

interface SlideLayoutProps {
  theme: ThemeConfig;
  slideIndex: number;
  totalSlides: number;
  children: React.ReactNode;
  /** Optional 3D background layer rendered behind content */
  background3d?: React.ReactNode;
}

export const SlideLayout: React.FC<SlideLayoutProps> = ({
  theme,
  slideIndex,
  totalSlides,
  children,
  background3d,
}) => {
  const frame = useCurrentFrame();

  // Accent bar expand animation
  const barWidth = interpolate(frame, [0, 18], [0, VIDEO_WIDTH], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: theme.bgGradient,
        fontFamily:
          '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
        overflow: "hidden",
      }}
    >
      {/* Decorative circles */}
      <div
        style={{
          position: "absolute",
          top: -120,
          right: -120,
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: theme.decorCircle1,
          filter: "blur(60px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -100,
          left: -100,
          width: 320,
          height: 320,
          borderRadius: "50%",
          background: theme.decorCircle2,
          filter: "blur(50px)",
        }}
      />

      {/* 3D background layer */}
      {background3d && (
        <AbsoluteFill style={{ zIndex: 0 }}>{background3d}</AbsoluteFill>
      )}

      {/* Accent bar at top */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: 4,
          width: barWidth,
          background: theme.accentBarGradient,
          zIndex: 10,
        }}
      />

      {/* Content area */}
      <div
        style={{
          position: "relative",
          zIndex: 5,
          padding: "80px 120px",
          width: VIDEO_WIDTH,
          height: VIDEO_HEIGHT,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>

      {/* Slide number */}
      <div
        style={{
          position: "absolute",
          bottom: 30,
          right: 40,
          fontSize: 20,
          color: theme.textMuted,
          zIndex: 10,
        }}
      >
        {slideIndex + 1} / {totalSlides}
      </div>
    </AbsoluteFill>
  );
};
