/**
 * DiagramBuilder — Progressive reveal flowcharts, mindmaps, timelines, cycles.
 */
import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import type { ThemeConfig } from "../types";

interface DiagramNode {
  id: string;
  label: string;
  children?: string[];
}

interface Props {
  diagramType: "flowchart" | "mindmap" | "timeline-steps" | "cycle";
  nodes: DiagramNode[];
  startFrame: number;
  durationFrames?: number;
  width?: number;
  height?: number;
  theme: ThemeConfig;
}

export const DiagramBuilder: React.FC<Props> = ({
  diagramType, nodes, startFrame, durationFrames,
  width = 800, height = 500, theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = frame - startFrame;
  const dur = durationFrames ?? nodes.length * 12;

  if (localFrame < 0) return null;

  const opacity = interpolate(localFrame, [0, 8], [0, 1], { extrapolateRight: "clamp" });

  return (
    <div style={{ width, height, opacity, position: "relative" }}>
      {diagramType === "flowchart" && <Flowchart nodes={nodes} frame={localFrame} dur={dur} w={width} h={height} theme={theme} fps={fps} />}
      {diagramType === "mindmap" && <Mindmap nodes={nodes} frame={localFrame} dur={dur} w={width} h={height} theme={theme} fps={fps} />}
      {diagramType === "timeline-steps" && <TimelineSteps nodes={nodes} frame={localFrame} dur={dur} w={width} h={height} theme={theme} fps={fps} />}
      {diagramType === "cycle" && <Cycle nodes={nodes} frame={localFrame} dur={dur} w={width} h={height} theme={theme} fps={fps} />}
    </div>
  );
};

// ─── Shared ─────────────────────────────────────────────────────────

const NodeBox: React.FC<{
  x: number; y: number; label: string; progress: number;
  theme: ThemeConfig; isPrimary?: boolean;
}> = ({ x, y, label, progress, theme, isPrimary }) => (
  <div style={{
    position: "absolute",
    left: x, top: y,
    transform: `translate(-50%, -50%) scale(${interpolate(progress, [0, 1], [0.5, 1])})`,
    opacity: progress,
    backgroundColor: isPrimary ? theme.primary : theme.cardBg,
    color: isPrimary ? "#fff" : theme.textPrimary,
    border: `2px solid ${isPrimary ? theme.primary : theme.cardBorder}`,
    borderRadius: 12,
    padding: "10px 20px",
    fontSize: 18,
    fontWeight: 600,
    fontFamily: "'Noto Sans SC', sans-serif",
    textAlign: "center",
    maxWidth: 200,
    boxShadow: isPrimary ? `0 4px 20px ${theme.primary}40` : theme.cardShadow,
    whiteSpace: "nowrap",
  }}>
    {label}
  </div>
);

// ─── Flowchart (top to bottom) ──────────────────────────────────────

const Flowchart: React.FC<{
  nodes: DiagramNode[]; frame: number; dur: number;
  w: number; h: number; theme: ThemeConfig; fps: number;
}> = ({ nodes, frame, dur, w, h, theme, fps }) => {
  const stagger = dur / nodes.length;
  const rowH = h / nodes.length;

  return (
    <>
      <svg width={w} height={h} style={{ position: "absolute", top: 0, left: 0 }}>
        {nodes.map((_, i) => {
          if (i === 0) return null;
          const connStart = (i - 0.5) * stagger;
          const connProgress = interpolate(frame, [connStart, connStart + 8], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          const x = w / 2;
          const y1 = (i - 1) * rowH + rowH * 0.65;
          const y2 = i * rowH + rowH * 0.35;
          return (
            <g key={`conn-${i}`}>
              <line
                x1={x} y1={y1} x2={x} y2={y1 + (y2 - y1) * connProgress}
                stroke={theme.primary} strokeWidth={2} opacity={0.5}
              />
              {connProgress > 0.9 && (
                <polygon
                  points={`${x},${y2} ${x - 6},${y2 - 10} ${x + 6},${y2 - 10}`}
                  fill={theme.primary} opacity={connProgress}
                />
              )}
            </g>
          );
        })}
      </svg>
      {nodes.map((node, i) => {
        const nodeProgress = spring({
          frame: Math.max(0, frame - i * stagger),
          fps,
          config: { damping: 14, stiffness: 150 },
        });
        return (
          <NodeBox
            key={node.id}
            x={w / 2} y={i * rowH + rowH / 2}
            label={node.label}
            progress={nodeProgress}
            theme={theme}
            isPrimary={i === 0}
          />
        );
      })}
    </>
  );
};

// ─── Mindmap (center + radial) ──────────────────────────────────────

const Mindmap: React.FC<{
  nodes: DiagramNode[]; frame: number; dur: number;
  w: number; h: number; theme: ThemeConfig; fps: number;
}> = ({ nodes, frame, dur, w, h, theme, fps }) => {
  if (nodes.length === 0) return null;
  const center = nodes[0];
  const branches = nodes.slice(1);
  const stagger = dur / nodes.length;
  const cx = w / 2;
  const cy = h / 2;

  const centerProgress = spring({
    frame, fps, config: { damping: 12, stiffness: 180 },
  });

  return (
    <>
      <svg width={w} height={h} style={{ position: "absolute", top: 0, left: 0 }}>
        {branches.map((_, i) => {
          const angle = (i / branches.length) * Math.PI * 2 - Math.PI / 2;
          const radius = Math.min(w, h) * 0.35;
          const bx = cx + Math.cos(angle) * radius;
          const by = cy + Math.sin(angle) * radius;
          const connProgress = interpolate(frame, [(i + 1) * stagger, (i + 1) * stagger + 10], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          return (
            <line key={i}
              x1={cx} y1={cy}
              x2={cx + (bx - cx) * connProgress}
              y2={cy + (by - cy) * connProgress}
              stroke={theme.primary} strokeWidth={2} opacity={0.4}
            />
          );
        })}
      </svg>
      <NodeBox x={cx} y={cy} label={center.label} progress={centerProgress} theme={theme} isPrimary />
      {branches.map((node, i) => {
        const angle = (i / branches.length) * Math.PI * 2 - Math.PI / 2;
        const radius = Math.min(w, h) * 0.35;
        const bx = cx + Math.cos(angle) * radius;
        const by = cy + Math.sin(angle) * radius;
        const nodeProgress = spring({
          frame: Math.max(0, frame - (i + 1) * stagger),
          fps, config: { damping: 14, stiffness: 150 },
        });
        return (
          <NodeBox key={node.id} x={bx} y={by} label={node.label} progress={nodeProgress} theme={theme} />
        );
      })}
    </>
  );
};

// ─── Timeline Steps (horizontal) ────────────────────────────────────

const TimelineSteps: React.FC<{
  nodes: DiagramNode[]; frame: number; dur: number;
  w: number; h: number; theme: ThemeConfig; fps: number;
}> = ({ nodes, frame, dur, w, h, theme, fps }) => {
  const stagger = dur / nodes.length;
  const stepW = w / nodes.length;
  const lineY = h / 2;

  return (
    <>
      <svg width={w} height={h} style={{ position: "absolute", top: 0, left: 0 }}>
        {/* Baseline */}
        <line x1={stepW / 2} y1={lineY} x2={w - stepW / 2} y2={lineY}
          stroke={theme.textMuted} strokeWidth={2} opacity={0.2} />
        {/* Progress line */}
        {nodes.map((_, i) => {
          if (i === 0) return null;
          const lineProgress = interpolate(frame, [(i - 0.5) * stagger, i * stagger], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          const x1 = (i - 1) * stepW + stepW / 2;
          const x2 = i * stepW + stepW / 2;
          return (
            <line key={i}
              x1={x1} y1={lineY}
              x2={x1 + (x2 - x1) * lineProgress} y2={lineY}
              stroke={theme.primary} strokeWidth={3}
            />
          );
        })}
        {/* Dots */}
        {nodes.map((_, i) => {
          const dotProgress = interpolate(frame, [i * stagger, i * stagger + 6], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          return (
            <circle key={i}
              cx={i * stepW + stepW / 2} cy={lineY}
              r={8 * dotProgress}
              fill={theme.primary}
            />
          );
        })}
      </svg>
      {nodes.map((node, i) => {
        const labelProgress = spring({
          frame: Math.max(0, frame - i * stagger),
          fps, config: { damping: 14, stiffness: 150 },
        });
        const isAbove = i % 2 === 0;
        return (
          <div key={node.id} style={{
            position: "absolute",
            left: i * stepW + stepW / 2,
            top: isAbove ? lineY - 60 : lineY + 30,
            transform: `translate(-50%, ${isAbove ? "-100%" : "0"}) scale(${interpolate(labelProgress, [0, 1], [0.5, 1])})`,
            opacity: labelProgress,
            fontSize: 16, fontWeight: 600,
            color: theme.textPrimary,
            fontFamily: "'Noto Sans SC', sans-serif",
            textAlign: "center",
            maxWidth: stepW - 20,
            backgroundColor: theme.cardBg,
            border: `1px solid ${theme.cardBorder}`,
            borderRadius: 8,
            padding: "6px 12px",
          }}>
            {node.label}
          </div>
        );
      })}
    </>
  );
};

// ─── Cycle (circular) ───────────────────────────────────────────────

const Cycle: React.FC<{
  nodes: DiagramNode[]; frame: number; dur: number;
  w: number; h: number; theme: ThemeConfig; fps: number;
}> = ({ nodes, frame, dur, w, h, theme, fps }) => {
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.35;
  const stagger = dur / nodes.length;

  return (
    <>
      <svg width={w} height={h} style={{ position: "absolute", top: 0, left: 0 }}>
        {nodes.map((_, i) => {
          const angle1 = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
          const nextI = (i + 1) % nodes.length;
          const angle2 = (nextI / nodes.length) * Math.PI * 2 - Math.PI / 2;
          const connProgress = interpolate(frame, [(i + 0.5) * stagger, (i + 1) * stagger], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          const x1 = cx + Math.cos(angle1) * radius;
          const y1 = cy + Math.sin(angle1) * radius;
          const x2 = cx + Math.cos(angle2) * radius;
          const y2 = cy + Math.sin(angle2) * radius;
          const midAngle = (angle1 + angle2) / 2 + (angle2 < angle1 ? Math.PI : 0);
          const cpx = cx + Math.cos(midAngle) * radius * 1.3;
          const cpy = cy + Math.sin(midAngle) * radius * 1.3;
          const arcD = `M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`;
          const arcLen = radius * 1.5;
          return (
            <path key={i} d={arcD} fill="none"
              stroke={theme.primary} strokeWidth={2} opacity={0.4}
              strokeDasharray={arcLen}
              strokeDashoffset={arcLen * (1 - connProgress)}
              markerEnd={connProgress > 0.9 ? "url(#arrowhead)" : undefined}
            />
          );
        })}
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill={theme.primary} opacity={0.6} />
          </marker>
        </defs>
      </svg>
      {nodes.map((node, i) => {
        const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
        const nx = cx + Math.cos(angle) * radius;
        const ny = cy + Math.sin(angle) * radius;
        const nodeProgress = spring({
          frame: Math.max(0, frame - i * stagger),
          fps, config: { damping: 14, stiffness: 150 },
        });
        return (
          <NodeBox key={node.id} x={nx} y={ny} label={node.label} progress={nodeProgress} theme={theme} isPrimary={i === 0} />
        );
      })}
    </>
  );
};
