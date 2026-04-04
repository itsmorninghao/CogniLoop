/**
 * ClearAnimation — Wraps children with exit animations (fade-out, slide-out).
 */
import React from "react";
import { useCurrentFrame, interpolate } from "remotion";

interface Props {
  startFrame: number;
  durationFrames?: number;
  animation?: "fade-out" | "slide-out" | "instant";
  children: React.ReactNode;
}

export const ClearAnimation: React.FC<Props> = ({
  startFrame,
  durationFrames = 8,
  animation = "fade-out",
  children,
}) => {
  const frame = useCurrentFrame();
  const localFrame = frame - startFrame;

  if (animation === "instant" && localFrame >= 0) return null;
  if (localFrame >= durationFrames) return null;
  if (localFrame < 0) return <>{children}</>;

  const progress = interpolate(localFrame, [0, durationFrames], [0, 1], {
    extrapolateRight: "clamp",
  });

  let style: React.CSSProperties = {};

  switch (animation) {
    case "fade-out":
      style = { opacity: 1 - progress };
      break;
    case "slide-out":
      style = {
        opacity: 1 - progress,
        transform: `translateY(${-30 * progress}px)`,
      };
      break;
  }

  return <div style={style}>{children}</div>;
};
