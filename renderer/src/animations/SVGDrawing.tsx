/**
 * SVGDrawing — Animated SVG path reveal.
 * Supports arrow, underline, circle, bracket, line, box, curved-arrow.
 */
import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import type { ThemeConfig } from "../types";

interface Props {
  shape: "arrow" | "circle" | "underline" | "bracket" | "line" | "box" | "curved-arrow";
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startFrame: number;
  durationFrames?: number;
  strokeColor?: string;
  strokeWidth?: number;
  theme: ThemeConfig;
}

export const SVGDrawing: React.FC<Props> = ({
  shape,
  fromX, fromY, toX, toY,
  startFrame,
  durationFrames = 18,
  strokeColor,
  strokeWidth = 4,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = frame - startFrame;

  if (localFrame < 0) return null;

  const color = strokeColor ?? theme.primary;
  const progress = interpolate(localFrame, [0, durationFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const pathD = getPath(shape, fromX, fromY, toX, toY);
  const pathLength = estimatePathLength(shape, fromX, fromY, toX, toY);

  return (
    <svg
      width="1920"
      height="1080"
      viewBox="0 0 1920 1080"
      style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
    >
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={pathLength}
        strokeDashoffset={pathLength * (1 - progress)}
      />
      {/* Arrowhead for arrow shapes */}
      {(shape === "arrow" || shape === "curved-arrow") && progress > 0.8 && (
        <ArrowHead
          toX={toX} toY={toY}
          fromX={fromX} fromY={fromY}
          color={color}
          size={strokeWidth * 3}
          opacity={interpolate(progress, [0.8, 1], [0, 1], { extrapolateRight: "clamp" })}
        />
      )}
    </svg>
  );
};

function getPath(shape: string, x1: number, y1: number, x2: number, y2: number): string {
  switch (shape) {
    case "line":
    case "underline":
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    case "arrow":
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    case "curved-arrow": {
      const cx = (x1 + x2) / 2;
      const cy = Math.min(y1, y2) - Math.abs(x2 - x1) * 0.3;
      return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
    }
    case "circle": {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx - rx} ${cy}`;
    }
    case "box":
      return `M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2} L ${x1} ${y2} Z`;
    case "bracket":
      const indent = 15;
      return `M ${x1 + indent} ${y1} L ${x1} ${y1} L ${x1} ${y2} L ${x1 + indent} ${y2}`;
    default:
      return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
}

function estimatePathLength(shape: string, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const straight = Math.sqrt(dx * dx + dy * dy);

  switch (shape) {
    case "circle":
      return Math.PI * (Math.abs(dx) + Math.abs(dy)) / 2;
    case "box":
      return 2 * (Math.abs(dx) + Math.abs(dy));
    case "bracket":
      return Math.abs(dy) + 30;
    case "curved-arrow":
      return straight * 1.4;
    default:
      return straight;
  }
}

const ArrowHead: React.FC<{
  toX: number; toY: number; fromX: number; fromY: number;
  color: string; size: number; opacity: number;
}> = ({ toX, toY, fromX, fromY, color, size, opacity }) => {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const a1 = angle + Math.PI * 0.85;
  const a2 = angle - Math.PI * 0.85;

  return (
    <polygon
      points={`${toX},${toY} ${toX + Math.cos(a1) * size},${toY + Math.sin(a1) * size} ${toX + Math.cos(a2) * size},${toY + Math.sin(a2) * size}`}
      fill={color}
      opacity={opacity}
    />
  );
};
