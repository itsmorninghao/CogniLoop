import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import type { ThemeName } from "../types";

interface AnimatedTextProps {
  children: React.ReactNode;
  delay?: number; // delay in frames
  style?: React.CSSProperties;
  theme: ThemeName;
  animation?: "fadeUp" | "fadeIn" | "scaleIn" | "slideLeft" | "slideRight";
}

export const AnimatedText: React.FC<AnimatedTextProps> = ({
  children,
  delay = 0,
  style,
  theme,
  animation = "fadeUp",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const adjustedFrame = Math.max(0, frame - delay);

  const useSpring = theme === "clean-bright";

  let opacity: number;
  let transform: string;

  if (useSpring) {
    const progress = spring({ frame: adjustedFrame, fps, config: { damping: 14, stiffness: 120 } });
    opacity = progress;
    switch (animation) {
      case "fadeUp":
        transform = `translateY(${interpolate(progress, [0, 1], [30, 0])}px)`;
        break;
      case "scaleIn":
        transform = `scale(${interpolate(progress, [0, 1], [0.9, 1])})`;
        break;
      case "slideLeft":
        transform = `translateX(${interpolate(progress, [0, 1], [-50, 0])}px)`;
        break;
      case "slideRight":
        transform = `translateX(${interpolate(progress, [0, 1], [50, 0])}px)`;
        break;
      default:
        transform = "none";
    }
  } else {
    // tech-dark: smooth ease-out
    opacity = interpolate(adjustedFrame, [0, 18], [0, 1], { extrapolateRight: "clamp" });
    switch (animation) {
      case "fadeUp":
        transform = `translateY(${interpolate(adjustedFrame, [0, 18], [40, 0], { extrapolateRight: "clamp" })}px)`;
        break;
      case "scaleIn":
        transform = `scale(${interpolate(adjustedFrame, [0, 15], [0.9, 1], { extrapolateRight: "clamp" })})`;
        break;
      case "slideLeft":
        transform = `translateX(${interpolate(adjustedFrame, [0, 18], [-50, 0], { extrapolateRight: "clamp" })}px)`;
        break;
      case "slideRight":
        transform = `translateX(${interpolate(adjustedFrame, [0, 18], [50, 0], { extrapolateRight: "clamp" })}px)`;
        break;
      default:
        transform = "none";
    }
  }

  return (
    <div style={{ opacity, transform, ...style }}>
      {children}
    </div>
  );
};
