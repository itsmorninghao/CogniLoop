/**
 * ChartBuilder — Animated bar/line/pie/progress-ring charts in pure React+SVG.
 */
import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import type { ThemeConfig } from "../types";

interface ChartData {
  labels: string[];
  values: number[];
  colors?: string[];
}

interface Props {
  chartType: "bar" | "line" | "pie" | "progress-ring";
  data: ChartData;
  startFrame: number;
  durationFrames?: number;
  width?: number;
  height?: number;
  title?: string;
  theme: ThemeConfig;
}

const DEFAULT_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#10b981", "#f59e0b", "#ef4444", "#06b6d4"];

export const ChartBuilder: React.FC<Props> = ({
  chartType, data, startFrame, durationFrames = 36,
  width = 600, height = 400, title, theme,
}) => {
  const frame = useCurrentFrame();
  const localFrame = frame - startFrame;

  if (localFrame < 0) return null;

  const progress = interpolate(localFrame, [0, durationFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const colors = data.colors ?? DEFAULT_COLORS;
  const opacity = interpolate(localFrame, [0, 8], [0, 1], { extrapolateRight: "clamp" });

  return (
    <div style={{ width, height, opacity }}>
      {title && (
        <div style={{
          fontSize: 24, fontWeight: 600, color: theme.textPrimary,
          marginBottom: 12, fontFamily: "'Noto Sans SC', sans-serif",
        }}>
          {title}
        </div>
      )}
      <svg width={width} height={height - (title ? 40 : 0)} viewBox={`0 0 ${width} ${height - (title ? 40 : 0)}`}>
        {chartType === "bar" && <BarChart data={data} colors={colors} progress={progress} w={width} h={height - (title ? 40 : 0)} theme={theme} />}
        {chartType === "line" && <LineChart data={data} colors={colors} progress={progress} w={width} h={height - (title ? 40 : 0)} theme={theme} />}
        {chartType === "pie" && <PieChart data={data} colors={colors} progress={progress} w={width} h={height - (title ? 40 : 0)} theme={theme} />}
        {chartType === "progress-ring" && <ProgressRing data={data} colors={colors} progress={progress} w={width} h={height - (title ? 40 : 0)} theme={theme} />}
      </svg>
    </div>
  );
};

// ─── Bar Chart ──────────────────────────────────────────────────────

const BarChart: React.FC<{
  data: ChartData; colors: string[]; progress: number; w: number; h: number; theme: ThemeConfig;
}> = ({ data, colors, progress, w, h, theme }) => {
  const maxVal = Math.max(...data.values, 1);
  const padding = 60;
  const barWidth = (w - padding * 2) / data.values.length * 0.7;
  const gap = (w - padding * 2) / data.values.length * 0.3;
  const chartH = h - padding;

  return (
    <g>
      {/* Axis */}
      <line x1={padding} y1={chartH} x2={w - padding / 2} y2={chartH} stroke={theme.textMuted} strokeWidth={1} opacity={0.3} />
      {/* Bars */}
      {data.values.map((val, i) => {
        const barH = (val / maxVal) * (chartH - 20) * progress;
        const x = padding + i * (barWidth + gap) + gap / 2;
        const y = chartH - barH;
        return (
          <g key={i}>
            <rect
              x={x} y={y}
              width={barWidth} height={barH}
              rx={6} ry={6}
              fill={colors[i % colors.length]}
            />
            {/* Label */}
            <text
              x={x + barWidth / 2} y={chartH + 20}
              textAnchor="middle"
              fill={theme.textMuted}
              fontSize={14}
              fontFamily="'Noto Sans SC', sans-serif"
            >
              {data.labels[i] ?? ""}
            </text>
            {/* Value on top */}
            {progress > 0.5 && (
              <text
                x={x + barWidth / 2} y={y - 8}
                textAnchor="middle"
                fill={theme.textPrimary}
                fontSize={16}
                fontWeight={600}
                fontFamily="'Inter', sans-serif"
                opacity={interpolate(progress, [0.5, 0.8], [0, 1], { extrapolateRight: "clamp" })}
              >
                {Math.round(val * progress)}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
};

// ─── Line Chart ─────────────────────────────────────────────────────

const LineChart: React.FC<{
  data: ChartData; colors: string[]; progress: number; w: number; h: number; theme: ThemeConfig;
}> = ({ data, colors, progress, w, h, theme }) => {
  const maxVal = Math.max(...data.values, 1);
  const padding = 60;
  const chartH = h - padding;
  const stepX = (w - padding * 2) / Math.max(data.values.length - 1, 1);

  const points = data.values.map((val, i) => ({
    x: padding + i * stepX,
    y: chartH - (val / maxVal) * (chartH - 20),
  }));

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const pathLength = points.reduce((sum, p, i) => {
    if (i === 0) return 0;
    const prev = points[i - 1];
    return sum + Math.sqrt((p.x - prev.x) ** 2 + (p.y - prev.y) ** 2);
  }, 0);

  return (
    <g>
      <line x1={padding} y1={chartH} x2={w - padding / 2} y2={chartH} stroke={theme.textMuted} strokeWidth={1} opacity={0.3} />
      <path
        d={pathD} fill="none"
        stroke={colors[0]} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={pathLength}
        strokeDashoffset={pathLength * (1 - progress)}
      />
      {/* Dots */}
      {points.map((p, i) => {
        const dotProgress = interpolate(progress, [i / points.length, (i + 0.5) / points.length], [0, 1], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp",
        });
        return (
          <circle key={i} cx={p.x} cy={p.y} r={5 * dotProgress} fill={colors[0]} />
        );
      })}
      {/* Labels */}
      {data.labels.map((label, i) => (
        <text key={i}
          x={padding + i * stepX} y={chartH + 20}
          textAnchor="middle" fill={theme.textMuted} fontSize={14}
          fontFamily="'Noto Sans SC', sans-serif"
        >
          {label}
        </text>
      ))}
    </g>
  );
};

// ─── Pie Chart ──────────────────────────────────────────────────────

const PieChart: React.FC<{
  data: ChartData; colors: string[]; progress: number; w: number; h: number; theme: ThemeConfig;
}> = ({ data, colors, progress, w, h }) => {
  const total = data.values.reduce((s, v) => s + v, 0) || 1;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2 - 40;

  let startAngle = -Math.PI / 2;
  const slices = data.values.map((val, i) => {
    const angle = (val / total) * Math.PI * 2 * progress;
    const endAngle = startAngle + angle;
    const large = angle > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    startAngle = endAngle;
    return <path key={i} d={d} fill={colors[i % colors.length]} />;
  });

  return <g>{slices}</g>;
};

// ─── Progress Ring ──────────────────────────────────────────────────

const ProgressRing: React.FC<{
  data: ChartData; colors: string[]; progress: number; w: number; h: number; theme: ThemeConfig;
}> = ({ data, colors, progress, w, h, theme }) => {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2 - 40;
  const circumference = 2 * Math.PI * r;
  const value = data.values[0] ?? 0;
  const maxVal = data.values[1] ?? 100;
  const pct = (value / maxVal) * progress;

  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={theme.cardBorder} strokeWidth={12} />
      <circle
        cx={cx} cy={cy} r={r}
        fill="none" stroke={colors[0]} strokeWidth={12}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - pct)}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text
        x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        fontSize={48} fontWeight={700} fill={theme.textPrimary}
        fontFamily="'Inter', sans-serif"
      >
        {Math.round(pct * 100)}%
      </text>
    </g>
  );
};
