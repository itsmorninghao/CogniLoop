/**
 * AnimatedSlide — Renders a slide driven by visual_events timeline.
 *
 * Each VisualEvent becomes a positioned element that appears at its `at` time.
 * Elements persist until cleared by a ClearEvent or the slide ends.
 */
import React, { useMemo } from "react";
import { Sequence, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import {
  KineticText,
  LottieElement,
  SVGDrawing,
  NumberCounter,
  ChartBuilder,
  DiagramBuilder,
} from "../animations/index";
import type {
  SlideData, VisualEvent, ThemeConfig, CanvasPosition,
  TextEvent, LottieEvent, SVGDrawEvent, ChartEvent,
  DiagramEvent, NumberEvent, ClearEvent, VIDEO_FPS,
} from "../types";

interface Props {
  slide: SlideData;
  theme: ThemeConfig;
  slideIndex: number;
  totalSlides: number;
  /** Pre-loaded Lottie animation data keyed by assetId */
  lottieCache?: Record<string, object>;
}

export const AnimatedSlide: React.FC<Props> = ({
  slide, theme, slideIndex, totalSlides, lottieCache = {},
}) => {
  const { fps } = useVideoConfig();
  const events = slide.visual_events ?? [];
  const bg = getBackground(slide.background, theme);

  // Sort events by time
  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => a.at - b.at),
    [events]
  );

  return (
    <div style={{
      width: 1920,
      height: 1080,
      position: "relative",
      overflow: "hidden",
      background: bg,
      fontFamily: "'Noto Sans SC', 'Inter', sans-serif",
    }}>
      <SlideBackdrop slide={slide} theme={theme} />

      {/* Slide number indicator */}
      <div style={{
        position: "absolute",
        bottom: 30,
        right: 40,
        fontSize: 16,
        color: theme.textMuted,
        opacity: 0.5,
      }}>
        {slideIndex + 1} / {totalSlides}
      </div>

      {/* Accent bar at top */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0,
        height: 4,
        background: theme.accentBarGradient,
      }} />

      {/* Render each visual event as a positioned Sequence */}
      {sortedEvents.map((event, i) => {
        const startFrame = Math.round(event.at * fps);
        const durFrames = event.duration ? Math.round(event.duration * fps) : undefined;
        const key = event.id ?? `event-${i}`;

        return (
          <Sequence key={key} from={startFrame} layout="none">
            <EventRenderer
              event={event}
              startFrame={0}
              durationFrames={durFrames}
              theme={theme}
              lottieCache={lottieCache}
            />
          </Sequence>
        );
      })}
    </div>
  );
};

// ─── Visual stage ───────────────────────────────────────────────────

const SlideBackdrop: React.FC<{
  slide: SlideData;
  theme: ThemeConfig;
}> = ({ slide, theme }) => {
  const isTitle = slide.template === "TITLE_SLIDE";
  const isSummary = slide.template === "SUMMARY";
  const isDark = theme.name === "tech-dark";
  const panelColor = isDark ? "rgba(15, 23, 42, 0.36)" : "rgba(255, 255, 255, 0.72)";
  const panelBorder = isDark ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.08)";

  return (
    <>
      <div style={{
        position: "absolute",
        inset: 0,
        background: isDark
          ? "linear-gradient(140deg, rgba(6, 182, 212, 0.08), transparent 38%, rgba(245, 158, 11, 0.052) 78%, transparent)"
          : "linear-gradient(140deg, rgba(6, 182, 212, 0.08), transparent 38%, rgba(245, 158, 11, 0.08) 76%, transparent)",
        opacity: isTitle ? 0.75 : 1,
      }} />

      <div style={{
        position: "absolute",
        left: isTitle ? 300 : 70,
        top: isTitle ? 250 : 132,
        width: isTitle ? 1320 : 1010,
        height: isTitle ? 520 : 760,
        border: `1px solid ${panelBorder}`,
        background: panelColor,
        clipPath: isTitle
          ? "polygon(8% 0, 100% 0, 92% 100%, 0 100%)"
          : "polygon(0 0, 96% 0, 100% 100%, 4% 100%)",
        opacity: isTitle ? 0.22 : 0.18,
      }} />

      {!isTitle && (
        <div style={{
          position: "absolute",
          left: 82,
          top: 174,
          width: 4,
          height: isSummary ? 370 : 440,
          background: `linear-gradient(180deg, ${theme.primaryLight}, ${theme.success}, transparent)`,
          opacity: 0.42,
          borderRadius: 4,
        }} />
      )}

      <div style={{
        position: "absolute",
        inset: 0,
        background: isDark
          ? "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.16) 100%)"
          : "linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(15,23,42,0.035) 100%)",
        pointerEvents: "none",
      }} />
    </>
  );
};

// ─── Event Renderer ─────────────────────────────────────────────────

const EventRenderer: React.FC<{
  event: VisualEvent;
  startFrame: number;
  durationFrames?: number;
  theme: ThemeConfig;
  lottieCache: Record<string, object>;
}> = ({ event, startFrame, durationFrames, theme, lottieCache }) => {
  switch (event.type) {
    case "text":
      return (
        <Positioned pos={event.position}>
          <KineticText
            text={event.text}
            animation={event.animation}
            startFrame={startFrame}
            durationFrames={durationFrames}
            style={event.style}
            fontSize={event.fontSize}
            color={event.color}
            theme={theme}
          />
        </Positioned>
      );

    case "lottie":
      return (
        <Positioned pos={event.position}>
          <LottieElement
            assetId={event.assetId}
            startFrame={startFrame}
            durationFrames={durationFrames}
            loop={event.loop}
            playbackRate={event.playbackRate}
            width={event.position.w}
            height={event.position.h}
            theme={theme}
            animationData={lottieCache[event.assetId]}
          />
        </Positioned>
      );

    case "svg-draw":
      return (
        <SVGDrawing
          shape={event.shape}
          fromX={event.from.x}
          fromY={event.from.y}
          toX={event.to.x}
          toY={event.to.y}
          startFrame={startFrame}
          durationFrames={durationFrames}
          strokeColor={event.strokeColor}
          strokeWidth={event.strokeWidth}
          theme={theme}
        />
      );

    case "chart":
      return (
        <Positioned pos={event.position}>
          <ChartBuilder
            chartType={event.chartType}
            data={event.data}
            startFrame={startFrame}
            durationFrames={durationFrames}
            width={event.position.w}
            height={event.position.h}
            title={event.title}
            theme={theme}
          />
        </Positioned>
      );

    case "diagram":
      return (
        <Positioned pos={event.position}>
          <DiagramBuilder
            diagramType={event.diagramType}
            nodes={event.nodes}
            startFrame={startFrame}
            durationFrames={durationFrames}
            width={event.position.w}
            height={event.position.h}
            theme={theme}
          />
        </Positioned>
      );

    case "number":
      return (
        <Positioned pos={event.position}>
          <NumberCounter
            from={event.from}
            to={event.to}
            startFrame={startFrame}
            durationFrames={durationFrames}
            prefix={event.prefix}
            suffix={event.suffix}
            fontSize={event.fontSize}
            theme={theme}
          />
        </Positioned>
      );

    case "clear":
      // ClearEvent is a no-op in rendering — handled by Sequence `durationInFrames`
      return null;

    case "transition":
      // Transitions are handled at the SlideVideo level
      return null;

    case "image":
      return (
        <Positioned pos={event.position}>
          <ImageReveal
            src={event.src}
            animation={event.animation}
            startFrame={startFrame}
            durationFrames={durationFrames ?? 12}
            width={event.position.w}
            height={event.position.h}
          />
        </Positioned>
      );

    case "icon-grid":
      return (
        <Positioned pos={event.position}>
          <IconGridRenderer
            icons={event.icons}
            columns={event.columns ?? 3}
            startFrame={startFrame}
            theme={theme}
            lottieCache={lottieCache}
          />
        </Positioned>
      );

    case "callout-card":
      return (
        <Positioned pos={event.position}>
          <CalloutCardRenderer
            title={event.title}
            body={event.body}
            index={event.index}
            tone={event.tone}
            theme={theme}
          />
        </Positioned>
      );

    case "spotlight":
      return (
        <Positioned pos={event.position}>
          <SpotlightRenderer
            title={event.title}
            subtitle={event.subtitle}
            labels={event.labels}
            variant={event.variant}
            theme={theme}
          />
        </Positioned>
      );

    case "scene-asset":
      return (
        <Positioned pos={event.position}>
          <SceneAssetRenderer
            assetKind={event.assetKind}
            title={event.title}
            labels={event.labels}
            durationFrames={durationFrames}
            theme={theme}
          />
        </Positioned>
      );

    case "concept-build":
      return (
        <Positioned pos={event.position}>
          <ConceptBuildRenderer
            mode={event.mode}
            title={event.title}
            labels={event.labels}
            caption={event.caption}
            durationFrames={durationFrames}
            theme={theme}
          />
        </Positioned>
      );

    default:
      return null;
  }
};

// ─── Positioning wrapper ────────────────────────────────────────────

const Positioned: React.FC<{
  pos: CanvasPosition;
  children: React.ReactNode;
}> = ({ pos, children }) => {
  const anchor = pos.anchor ?? "top-left";
  let transform = "";

  switch (anchor) {
    case "center":
      transform = "translate(-50%, -50%)";
      break;
    case "top-right":
      transform = "translate(-100%, 0)";
      break;
    case "bottom-right":
      transform = "translate(-100%, -100%)";
      break;
    case "bottom-left":
      transform = "translate(0, -100%)";
      break;
    default:
      transform = "";
  }

  return (
    <div style={{
      position: "absolute",
      left: pos.x,
      top: pos.y,
      width: pos.w,
      height: pos.h,
      transform,
    }}>
      {children}
    </div>
  );
};

// ─── Image reveal ───────────────────────────────────────────────────

const ImageReveal: React.FC<{
  src: string;
  animation?: string;
  startFrame: number;
  durationFrames: number;
  width?: number;
  height?: number;
}> = ({ src, animation = "fade-in", startFrame, durationFrames, width, height }) => {
  // Image rendering is a placeholder — in practice images would be bundled or fetched
  return (
    <div style={{
      width: width ?? 400,
      height: height ?? 300,
      borderRadius: 12,
      overflow: "hidden",
    }}>
      <img
        src={src}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </div>
  );
};

// ─── Icon Grid ──────────────────────────────────────────────────────

import { Sequence as Seq } from "remotion";

const IconGridRenderer: React.FC<{
  icons: { assetId: string; label: string }[];
  columns: number;
  startFrame: number;
  theme: ThemeConfig;
  lottieCache: Record<string, object>;
}> = ({ icons, columns, startFrame, theme, lottieCache }) => {
  const { fps } = useVideoConfig();
  const stagger = 6; // frames between each icon

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gap: 20,
    }}>
      {icons.map((icon, i) => (
        <Seq key={i} from={i * stagger} layout="none">
          <div style={{ textAlign: "center" }}>
            <LottieElement
              assetId={icon.assetId}
              startFrame={0}
              width={80}
              height={80}
              theme={theme}
              animationData={lottieCache[icon.assetId]}
              loop={false}
            />
            <div style={{
              fontSize: 14,
              color: theme.textSecondary,
              marginTop: 4,
              fontFamily: "'Noto Sans SC', sans-serif",
            }}>
              {icon.label}
            </div>
          </div>
        </Seq>
      ))}
    </div>
  );
};

// ─── Explainer Visuals ─────────────────────────────────────────────

const TONE_COLORS = {
  primary: "#6366f1",
  accent: "#06b6d4",
  success: "#10b981",
  warning: "#f59e0b",
};

type ToneKey = keyof typeof TONE_COLORS;

function toneAt(index: number): ToneKey {
  return (["primary", "accent", "warning", "success"] as const)[index % 4];
}

const CalloutCardRenderer: React.FC<{
  title: string;
  body?: string;
  index?: number;
  tone?: "primary" | "accent" | "success" | "warning";
  theme: ThemeConfig;
}> = ({ title, body, index, tone = "primary", theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 120 } });
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const y = interpolate(enter, [0, 1], [22, 0]);
  const color = TONE_COLORS[tone];
  const isDark = theme.name === "tech-dark";

  return (
    <div style={{
      width: "100%",
      height: "100%",
      opacity,
      transform: `translateY(${y}px)`,
      position: "relative",
      borderRadius: 8,
      overflow: "hidden",
      background: isDark
        ? "linear-gradient(135deg, rgba(15, 23, 42, 0.82), rgba(2, 6, 23, 0.68))"
        : "linear-gradient(135deg, rgba(255, 255, 255, 0.94), rgba(248, 250, 252, 0.88))",
      border: `1px solid ${isDark ? "rgba(148, 163, 184, 0.16)" : "rgba(15, 23, 42, 0.1)"}`,
      boxShadow: isDark
        ? "0 18px 44px rgba(0, 0, 0, 0.22)"
        : "0 16px 34px rgba(15, 23, 42, 0.08)",
      fontFamily: "'Noto Sans SC', 'Inter', sans-serif",
    }}>
      <div style={{
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: 7,
        background: `linear-gradient(180deg, ${color}, ${theme.accent})`,
      }} />
      <div style={{
        position: "absolute",
        inset: 0,
        background: `linear-gradient(110deg, ${color}18, transparent 44%)`,
      }} />
      <div style={{
        position: "relative",
        height: "100%",
        padding: "24px 30px 24px 34px",
        display: "flex",
        gap: 20,
        alignItems: "flex-start",
      }}>
        {index !== undefined && (
          <div style={{
            flex: "0 0 auto",
            width: 48,
            height: 48,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `${color}22`,
            border: `1px solid ${color}66`,
            color,
            fontSize: 24,
            fontWeight: 800,
            lineHeight: 1,
          }}>
            {index}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            color: theme.textPrimary,
            fontSize: 34,
            fontWeight: 760,
            lineHeight: 1.18,
            textRendering: "geometricPrecision",
          }}>
            {title}
          </div>
          {body && (
            <div style={{
              color: theme.textSecondary,
              fontSize: 24,
              fontWeight: 420,
              lineHeight: 1.42,
              marginTop: 10,
              textRendering: "geometricPrecision",
            }}>
              {body}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const SpotlightRenderer: React.FC<{
  title: string;
  subtitle?: string;
  labels?: string[];
  variant?: "orbit" | "stack" | "signal";
  theme: ThemeConfig;
}> = ({ title, subtitle, labels = [], variant = "stack", theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 90 } });
  const opacity = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" });
  const lift = interpolate(enter, [0, 1], [32, 0]);
  const scanX = interpolate(frame % 96, [0, 96], [-160, 760]);
  const isDark = theme.name === "tech-dark";
  const safeLabels = labels.filter(Boolean).slice(0, 4);
  const cardLabels = safeLabels.length > 0 ? safeLabels : ["目标", "拆解", "验证"];

  return (
    <div style={{
      width: "100%",
      height: "100%",
      position: "relative",
      opacity,
      transform: `translateY(${lift}px)`,
      borderRadius: 8,
      overflow: "hidden",
      background: isDark
        ? "linear-gradient(135deg, rgba(15, 23, 42, 0.78), rgba(2, 6, 23, 0.52))"
        : "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(240,249,255,0.85))",
      border: `1px solid ${isDark ? "rgba(148, 163, 184, 0.18)" : "rgba(15, 23, 42, 0.1)"}`,
      boxShadow: isDark ? "0 24px 70px rgba(0, 0, 0, 0.28)" : "0 22px 48px rgba(15, 23, 42, 0.1)",
      fontFamily: "'Noto Sans SC', 'Inter', sans-serif",
    }}>
      <svg width="100%" height="100%" viewBox="0 0 760 500" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id={`spotline-${variant}`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor={theme.primary} stopOpacity="0.88" />
            <stop offset="55%" stopColor={theme.accent} stopOpacity="0.72" />
            <stop offset="100%" stopColor={theme.success} stopOpacity="0.62" />
          </linearGradient>
        </defs>
        <path d="M 70 365 C 220 210, 330 420, 510 245 S 660 215, 710 120"
          fill="none" stroke={`url(#spotline-${variant})`} strokeWidth="4" opacity="0.45" />
        <path d="M 58 392 C 240 320, 356 140, 706 188"
          fill="none" stroke={theme.textMuted} strokeWidth="1.5" strokeDasharray="9 12" opacity="0.22" />
        <rect x={scanX} y="0" width="110" height="500" fill={theme.primary} opacity="0.055" />
      </svg>

      <div style={{
        position: "absolute",
        left: 48,
        top: 42,
        right: 48,
      }}>
        <div style={{
          color: theme.textMuted,
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: 0,
        }}>
          视觉主线
        </div>
        <div style={{
          color: theme.textPrimary,
          fontSize: 46,
          fontWeight: 820,
          lineHeight: 1.12,
          marginTop: 12,
          textRendering: "geometricPrecision",
          textShadow: isDark ? "0 2px 18px rgba(0,0,0,0.38)" : "none",
        }}>
          {title}
        </div>
        {subtitle && (
          <div style={{
            color: theme.textSecondary,
            fontSize: 24,
            lineHeight: 1.35,
            marginTop: 14,
            maxWidth: 560,
          }}>
            {subtitle}
          </div>
        )}
      </div>

      <div style={{
        position: "absolute",
        left: 72,
        right: 72,
        bottom: 56,
        display: "grid",
        gridTemplateColumns: `repeat(${Math.min(cardLabels.length, 4)}, 1fr)`,
        gap: 14,
      }}>
        {cardLabels.map((label, i) => {
          const cardProgress = spring({
            frame: Math.max(0, frame - 10 - i * 6),
            fps,
            config: { damping: 18, stiffness: 130 },
          });
          return (
            <div key={label} style={{
              transform: `translateY(${interpolate(cardProgress, [0, 1], [18, 0])}px)`,
              opacity: interpolate(cardProgress, [0, 1], [0, 1]),
              borderRadius: 8,
              padding: "16px 14px",
              minHeight: 86,
              background: isDark ? "rgba(2, 6, 23, 0.56)" : "rgba(255, 255, 255, 0.82)",
              border: `1px solid ${isDark ? "rgba(148, 163, 184, 0.16)" : "rgba(15, 23, 42, 0.1)"}`,
              color: theme.textPrimary,
              boxShadow: isDark ? "0 10px 30px rgba(0,0,0,0.18)" : "0 10px 24px rgba(15,23,42,0.07)",
            }}>
              <div style={{ color: TONE_COLORS[toneAt(i)], fontSize: 16, fontWeight: 800 }}>
                0{i + 1}
              </div>
              <div style={{ marginTop: 8, fontSize: 20, lineHeight: 1.25, fontWeight: 740 }}>
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SceneAssetRenderer: React.FC<{
  assetKind: "dashboard" | "lab" | "code" | "network" | "document" | "timeline" | "signal";
  title?: string;
  labels?: string[];
  durationFrames?: number;
  theme: ThemeConfig;
}> = ({ assetKind, title, labels = [], durationFrames, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = durationFrames ?? 120;
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 95 } });
  const opacity = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" });
  const y = interpolate(enter, [0, 1], [28, 0]);
  const isDark = theme.name === "tech-dark";
  const safeLabels = (labels.length ? labels : ["输入", "处理", "输出"]).filter(Boolean).slice(0, 4);
  const progress = Math.max(0, Math.min(1, frame / dur));

  return (
    <div style={{
      width: "100%",
      height: "100%",
      position: "relative",
      opacity,
      transform: `translateY(${y}px)`,
      borderRadius: 8,
      overflow: "hidden",
      background: isDark
        ? "linear-gradient(135deg, rgba(15, 23, 42, 0.76), rgba(2, 6, 23, 0.58))"
        : "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(241,245,249,0.86))",
      border: `1px solid ${isDark ? "rgba(148, 163, 184, 0.16)" : "rgba(15, 23, 42, 0.1)"}`,
      boxShadow: isDark ? "0 24px 70px rgba(0, 0, 0, 0.28)" : "0 22px 48px rgba(15, 23, 42, 0.1)",
      fontFamily: "'Noto Sans SC', 'Inter', sans-serif",
    }}>
      <div style={{
        position: "absolute",
        inset: 0,
        background: isDark
          ? `linear-gradient(120deg, ${theme.primary}16, transparent 38%, ${theme.accent}10), repeating-linear-gradient(0deg, rgba(148,163,184,0.035) 0 1px, transparent 1px 54px)`
          : `linear-gradient(120deg, ${theme.primary}12, transparent 38%, ${theme.accent}0f), repeating-linear-gradient(0deg, rgba(15,23,42,0.032) 0 1px, transparent 1px 54px)`,
      }} />

      {title && (
        <div style={{
          position: "absolute",
          left: 38,
          top: 32,
          right: 38,
          color: theme.textPrimary,
          fontSize: 30,
          lineHeight: 1.2,
          fontWeight: 780,
          textRendering: "geometricPrecision",
        }}>
          {title}
        </div>
      )}

      <GeneratedAsset kind={assetKind} labels={safeLabels} progress={progress} theme={theme} />
    </div>
  );
};

const GeneratedAsset: React.FC<{
  kind: "dashboard" | "lab" | "code" | "network" | "document" | "timeline" | "signal";
  labels: string[];
  progress: number;
  theme: ThemeConfig;
}> = ({ kind, labels, progress, theme }) => {
  if (kind === "code") return <CodeAsset labels={labels} progress={progress} theme={theme} />;
  if (kind === "network") return <NetworkAsset labels={labels} progress={progress} theme={theme} />;
  if (kind === "document") return <DocumentAsset labels={labels} progress={progress} theme={theme} />;
  if (kind === "timeline") return <TimelineAsset labels={labels} progress={progress} theme={theme} />;
  if (kind === "signal") return <SignalAsset labels={labels} progress={progress} theme={theme} />;
  if (kind === "lab") return <LabAsset labels={labels} progress={progress} theme={theme} />;
  return <DashboardAsset labels={labels} progress={progress} theme={theme} />;
};

const SceneLabel: React.FC<{
  x: number;
  y: number;
  label: string;
  progress: number;
  theme: ThemeConfig;
  tone?: ToneKey;
  index?: number;
}> = ({ x, y, label, progress, theme, tone = "primary", index = 0 }) => (
  <div style={{
    position: "absolute",
    left: x,
    top: y,
    transform: `translateY(${interpolate(progress, [0, 1], [16, 0])}px)`,
    opacity: progress,
    minWidth: 120,
    borderRadius: 8,
    padding: "12px 14px",
    background: theme.name === "tech-dark" ? "rgba(2, 6, 23, 0.58)" : "rgba(255,255,255,0.86)",
    border: `1px solid ${TONE_COLORS[tone]}66`,
    color: theme.textPrimary,
    fontSize: 20,
    fontWeight: 720,
    lineHeight: 1.2,
    boxShadow: theme.name === "tech-dark" ? "0 10px 26px rgba(0,0,0,0.18)" : "0 10px 22px rgba(15,23,42,0.07)",
  }}>
    <div style={{ color: TONE_COLORS[tone], fontSize: 14, fontWeight: 860, marginBottom: 7 }}>
      0{index + 1}
    </div>
    {label}
  </div>
);

function itemProgress(progress: number, index: number, total: number): number {
  const start = index / Math.max(1, total + 1);
  const end = start + 0.28;
  return Math.max(0, Math.min(1, (progress - start) / (end - start)));
}

const DashboardAsset: React.FC<{ labels: string[]; progress: number; theme: ThemeConfig }> = ({ labels, progress, theme }) => {
  const lineProgress = Math.max(0, Math.min(1, (progress - 0.16) / 0.58));
  const bars = [0.32, 0.62, 0.46, 0.78, 0.56];
  return (
    <>
      <svg width="100%" height="100%" viewBox="0 0 720 520" style={{ position: "absolute", inset: 0 }}>
        <rect x="58" y="112" width="604" height="336" rx="16" fill="rgba(2,6,23,0.36)" stroke="rgba(148,163,184,0.22)" />
        <rect x="58" y="112" width="604" height="44" rx="16" fill="rgba(15,23,42,0.62)" />
        {[0, 1, 2].map((i) => (
          <circle key={i} cx={86 + i * 24} cy="134" r="6" fill={TONE_COLORS[toneAt(i)]} opacity="0.75" />
        ))}
        <path d="M 100 355 C 170 286, 230 386, 306 292 S 430 310, 510 236 S 596 220, 626 176"
          fill="none" stroke={theme.primary} strokeWidth="5" strokeLinecap="round"
          strokeDasharray="620" strokeDashoffset={620 * (1 - lineProgress)} opacity="0.82" />
        {bars.map((height, i) => {
          const p = itemProgress(progress, i, bars.length);
          return (
            <rect key={i} x={112 + i * 72} y={380 - 150 * height * p}
              width="36" height={150 * height * p} rx="8" fill={TONE_COLORS[toneAt(i)]} opacity="0.74" />
          );
        })}
      </svg>
      {labels.map((label, i) => (
        <SceneLabel key={label} x={86 + i * 140} y={452} label={label} progress={itemProgress(progress, i, labels.length)} theme={theme} tone={toneAt(i)} index={i} />
      ))}
    </>
  );
};

const CodeAsset: React.FC<{ labels: string[]; progress: number; theme: ThemeConfig }> = ({ labels, progress, theme }) => {
  const lines = [0.84, 0.62, 0.74, 0.48, 0.9, 0.58, 0.7];
  return (
    <>
      <svg width="100%" height="100%" viewBox="0 0 720 520" style={{ position: "absolute", inset: 0 }}>
        <rect x="56" y="116" width="608" height="318" rx="14" fill="rgba(2,6,23,0.44)" stroke="rgba(148,163,184,0.22)" />
        <rect x="56" y="116" width="608" height="48" rx="14" fill="rgba(15,23,42,0.74)" />
        <text x="92" y="148" fill={theme.textMuted} fontSize="17" fontWeight="700">render.pipeline.ts</text>
        {lines.map((w, i) => {
          const p = itemProgress(progress, i, lines.length);
          return (
            <g key={i} opacity={p}>
              <rect x="94" y={196 + i * 30} width={28 + i * 4} height="8" rx="4" fill={TONE_COLORS[toneAt(i)]} opacity="0.62" />
              <rect x="144" y={192 + i * 30} width={360 * w * p} height="12" rx="6" fill="rgba(226,232,240,0.42)" />
            </g>
          );
        })}
      </svg>
      {labels.slice(0, 3).map((label, i) => (
        <SceneLabel key={label} x={96 + i * 190} y={446} label={label} progress={itemProgress(progress, i, labels.length)} theme={theme} tone={toneAt(i)} index={i} />
      ))}
    </>
  );
};

const NetworkAsset: React.FC<{ labels: string[]; progress: number; theme: ThemeConfig }> = ({ labels, progress, theme }) => {
  const nodes = [
    { x: 156, y: 218 },
    { x: 326, y: 164 },
    { x: 518, y: 246 },
    { x: 274, y: 352 },
    { x: 534, y: 374 },
  ];
  return (
    <>
      <svg width="100%" height="100%" viewBox="0 0 720 520" style={{ position: "absolute", inset: 0 }}>
        {nodes.slice(1).map((node, i) => {
          const p = itemProgress(progress, i, nodes.length);
          return <line key={i} x1={nodes[0].x} y1={nodes[0].y} x2={nodes[0].x + (node.x - nodes[0].x) * p} y2={nodes[0].y + (node.y - nodes[0].y) * p} stroke={theme.primary} strokeWidth="3" opacity="0.45" />;
        })}
        {nodes.map((node, i) => {
          const p = itemProgress(progress, i, nodes.length);
          return (
            <g key={i} opacity={p}>
              <circle cx={node.x} cy={node.y} r={30 + 12 * p} fill={TONE_COLORS[toneAt(i)]} opacity="0.12" />
              <circle cx={node.x} cy={node.y} r="20" fill={TONE_COLORS[toneAt(i)]} opacity="0.82" />
            </g>
          );
        })}
      </svg>
      {labels.slice(0, 4).map((label, i) => (
        <SceneLabel key={label} x={90 + i * 140} y={438} label={label} progress={itemProgress(progress, i, labels.length)} theme={theme} tone={toneAt(i)} index={i} />
      ))}
    </>
  );
};

const DocumentAsset: React.FC<{ labels: string[]; progress: number; theme: ThemeConfig }> = ({ labels, progress, theme }) => (
  <>
    <svg width="100%" height="100%" viewBox="0 0 720 520" style={{ position: "absolute", inset: 0 }}>
      <rect x="170" y="86" width="380" height="370" rx="18" fill="rgba(248,250,252,0.08)" stroke="rgba(148,163,184,0.22)" />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const p = itemProgress(progress, i, 6);
        return <rect key={i} x="220" y={146 + i * 45} width={(220 + (i % 3) * 40) * p} height="14" rx="7" fill={i % 2 ? "rgba(226,232,240,0.34)" : TONE_COLORS[toneAt(i)]} opacity={i % 2 ? 0.8 : 0.56} />;
      })}
      <rect x="220" y="368" width={260 * Math.max(0, Math.min(1, (progress - 0.58) / 0.28))} height="28" rx="8" fill={theme.primary} opacity="0.64" />
    </svg>
    {labels.slice(0, 3).map((label, i) => (
      <SceneLabel key={label} x={88 + i * 180} y={442} label={label} progress={itemProgress(progress, i, labels.length)} theme={theme} tone={toneAt(i)} index={i} />
    ))}
  </>
);

const TimelineAsset: React.FC<{ labels: string[]; progress: number; theme: ThemeConfig }> = ({ labels, progress, theme }) => (
  <>
    <svg width="100%" height="100%" viewBox="0 0 720 520" style={{ position: "absolute", inset: 0 }}>
      <line x1="96" y1="286" x2="624" y2="286" stroke="rgba(148,163,184,0.22)" strokeWidth="5" strokeLinecap="round" />
      <line x1="96" y1="286" x2={96 + 528 * progress} y2="286" stroke={theme.primary} strokeWidth="6" strokeLinecap="round" />
      {labels.slice(0, 4).map((label, i) => {
        const x = 116 + i * 160;
        const p = itemProgress(progress, i, labels.length);
        return (
          <g key={label} opacity={p}>
            <circle cx={x} cy="286" r="18" fill={TONE_COLORS[toneAt(i)]} opacity="0.9" />
            <rect x={x - 62} y={i % 2 === 0 ? 168 : 326} width="124" height="70" rx="10" fill="rgba(2,6,23,0.42)" stroke="rgba(148,163,184,0.2)" />
            <text x={x - 42} y={i % 2 === 0 ? 206 : 364} fill={theme.textPrimary} fontSize="18" fontWeight="700">{label.slice(0, 7)}</text>
          </g>
        );
      })}
    </svg>
  </>
);

const SignalAsset: React.FC<{ labels: string[]; progress: number; theme: ThemeConfig }> = ({ labels, progress, theme }) => (
  <>
    <svg width="100%" height="100%" viewBox="0 0 720 520" style={{ position: "absolute", inset: 0 }}>
      <path d="M 82 302 C 146 216, 198 384, 258 286 S 376 212, 438 284 S 536 374, 636 178"
        fill="none" stroke={theme.primary} strokeWidth="6" strokeLinecap="round"
        strokeDasharray="760" strokeDashoffset={760 * (1 - progress)} opacity="0.82" />
      <path d="M 82 356 C 186 330, 238 246, 330 292 S 470 394, 638 264"
        fill="none" stroke={theme.accent} strokeWidth="3" strokeLinecap="round"
        strokeDasharray="620" strokeDashoffset={620 * (1 - Math.max(0, progress - 0.16) / 0.84)} opacity="0.48" />
      {[0, 1, 2].map((i) => {
        const p = itemProgress(progress, i, 3);
        return <rect key={i} x={118 + i * 168} y={110 + i * 28} width={112 * p} height="38" rx="10" fill={TONE_COLORS[toneAt(i)]} opacity="0.22" />;
      })}
    </svg>
    {labels.slice(0, 3).map((label, i) => (
      <SceneLabel key={label} x={100 + i * 176} y={428} label={label} progress={itemProgress(progress, i, labels.length)} theme={theme} tone={toneAt(i)} index={i} />
    ))}
  </>
);

const LabAsset: React.FC<{ labels: string[]; progress: number; theme: ThemeConfig }> = ({ labels, progress, theme }) => (
  <>
    <svg width="100%" height="100%" viewBox="0 0 720 520" style={{ position: "absolute", inset: 0 }}>
      <rect x="112" y="366" width="496" height="28" rx="14" fill="rgba(148,163,184,0.16)" />
      {[0, 1, 2].map((i) => {
        const p = itemProgress(progress, i, 3);
        return (
          <g key={i} opacity={p}>
            <path d={`M ${190 + i * 150} 174 L ${154 + i * 150} 354 L ${226 + i * 150} 354 Z`} fill={TONE_COLORS[toneAt(i)]} opacity="0.16" stroke={TONE_COLORS[toneAt(i)]} strokeWidth="3" />
            <rect x={166 + i * 150} y={312 - 70 * p} width="48" height={42 + 70 * p} rx="14" fill={TONE_COLORS[toneAt(i)]} opacity="0.36" />
            <circle cx={190 + i * 150} cy={250 - i * 16} r={8 + 8 * p} fill={TONE_COLORS[toneAt(i)]} opacity="0.58" />
          </g>
        );
      })}
    </svg>
    {labels.slice(0, 3).map((label, i) => (
      <SceneLabel key={label} x={96 + i * 170} y={420} label={label} progress={itemProgress(progress, i, labels.length)} theme={theme} tone={toneAt(i)} index={i} />
    ))}
  </>
);

const ConceptBuildRenderer: React.FC<{
  mode: "concept" | "process" | "metric" | "comparison" | "summary";
  title: string;
  labels: string[];
  caption?: string;
  durationFrames?: number;
  theme: ThemeConfig;
}> = ({ mode, title, labels, caption, durationFrames, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = durationFrames ?? 144;
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 96 } });
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const scale = interpolate(enter, [0, 1], [0.97, 1]);
  const progress = Math.max(0, Math.min(1, frame / dur));
  const isDark = theme.name === "tech-dark";
  const safeLabels = labels.filter(Boolean).slice(0, mode === "comparison" ? 6 : 5);

  return (
    <div style={{
      width: "100%",
      height: "100%",
      opacity,
      transform: `scale(${scale})`,
      position: "relative",
      borderRadius: 8,
      overflow: "hidden",
      background: isDark
        ? "linear-gradient(135deg, rgba(15, 23, 42, 0.84), rgba(2, 6, 23, 0.64))"
        : "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(240,249,255,0.84))",
      border: `1px solid ${isDark ? "rgba(148, 163, 184, 0.18)" : "rgba(15, 23, 42, 0.1)"}`,
      boxShadow: isDark ? "0 24px 70px rgba(0,0,0,0.28)" : "0 20px 44px rgba(15,23,42,0.1)",
      fontFamily: "'Noto Sans SC', 'Inter', sans-serif",
    }}>
      <div style={{
        position: "absolute",
        left: 42,
        top: 34,
        right: 42,
      }}>
        <div style={{ color: theme.textMuted, fontSize: 18, fontWeight: 760 }}>
          概念构建
        </div>
        <div style={{
          color: theme.textPrimary,
          fontSize: 34,
          fontWeight: 820,
          lineHeight: 1.18,
          marginTop: 8,
          textRendering: "geometricPrecision",
        }}>
          {title}
        </div>
      </div>

      <ConceptBuildSvg mode={mode} labels={safeLabels} progress={progress} theme={theme} />

      {caption && (
        <div style={{
          position: "absolute",
          left: 48,
          right: 48,
          bottom: 34,
          color: theme.textSecondary,
          fontSize: 22,
          lineHeight: 1.35,
          padding: "15px 18px",
          borderRadius: 8,
          background: isDark ? "rgba(2, 6, 23, 0.46)" : "rgba(255,255,255,0.82)",
          border: `1px solid ${isDark ? "rgba(148, 163, 184, 0.14)" : "rgba(15,23,42,0.08)"}`,
        }}>
          {caption}
        </div>
      )}
    </div>
  );
};

const ConceptBuildSvg: React.FC<{
  mode: "concept" | "process" | "metric" | "comparison" | "summary";
  labels: string[];
  progress: number;
  theme: ThemeConfig;
}> = ({ mode, labels, progress, theme }) => {
  if (mode === "metric") return <MetricBuild labels={labels} progress={progress} theme={theme} />;
  if (mode === "comparison") return <ComparisonBuild labels={labels} progress={progress} theme={theme} />;
  if (mode === "summary") return <SummaryBuild labels={labels} progress={progress} theme={theme} />;
  if (mode === "process") return <ProcessBuild labels={labels} progress={progress} theme={theme} />;
  return <ConceptMapBuild labels={labels} progress={progress} theme={theme} />;
};

const ProcessBuild: React.FC<{ labels: string[]; progress: number; theme: ThemeConfig }> = ({ labels, progress, theme }) => {
  const items = labels.length ? labels.slice(0, 4) : ["输入", "拆解", "处理", "输出"];
  return (
    <svg width="100%" height="100%" viewBox="0 0 760 520" style={{ position: "absolute", inset: 0 }}>
      <line x1="96" y1="292" x2="664" y2="292" stroke="rgba(148,163,184,0.18)" strokeWidth="8" strokeLinecap="round" />
      <line x1="96" y1="292" x2={96 + 568 * progress} y2="292" stroke={theme.primary} strokeWidth="8" strokeLinecap="round" />
      {items.map((label, i) => {
        const p = itemProgress(progress, i, items.length);
        const x = 112 + i * (536 / Math.max(1, items.length - 1));
        return (
          <g key={label} opacity={p}>
            <rect x={x - 74} y={190 + (i % 2) * 122} width="148" height="82" rx="12" fill="rgba(2,6,23,0.48)" stroke={TONE_COLORS[toneAt(i)]} strokeOpacity="0.5" />
            <text x={x - 50} y={224 + (i % 2) * 122} fill={TONE_COLORS[toneAt(i)]} fontSize="15" fontWeight="800">阶段 {i + 1}</text>
            <text x={x - 50} y={254 + (i % 2) * 122} fill={theme.textPrimary} fontSize="22" fontWeight="760">{label.slice(0, 8)}</text>
            <circle cx={x} cy="292" r={18 + 8 * p} fill={TONE_COLORS[toneAt(i)]} opacity="0.16" />
            <circle cx={x} cy="292" r="9" fill={TONE_COLORS[toneAt(i)]} />
          </g>
        );
      })}
    </svg>
  );
};

const ConceptMapBuild: React.FC<{ labels: string[]; progress: number; theme: ThemeConfig }> = ({ labels, progress, theme }) => {
  const center = labels[0] || "核心概念";
  const branches = (labels.slice(1, 5).length ? labels.slice(1, 5) : ["定义", "类比", "边界"]).slice(0, 4);
  const cx = 380;
  const cy = 282;
  return (
    <svg width="100%" height="100%" viewBox="0 0 760 520" style={{ position: "absolute", inset: 0 }}>
      <circle cx={cx} cy={cy} r={72 + 12 * Math.min(progress, 1)} fill={theme.primary} opacity="0.12" />
      <circle cx={cx} cy={cy} r="64" fill="rgba(2,6,23,0.58)" stroke={theme.primary} strokeWidth="3" />
      <text x={cx - 44} y={cy + 7} fill={theme.textPrimary} fontSize="24" fontWeight="820">{center.slice(0, 5)}</text>
      {branches.map((label, i) => {
        const angle = (i / branches.length) * Math.PI * 2 - Math.PI / 2;
        const p = itemProgress(progress, i, branches.length);
        const x = cx + Math.cos(angle) * 190;
        const y = cy + Math.sin(angle) * 142;
        return (
          <g key={label} opacity={p}>
            <line x1={cx} y1={cy} x2={cx + (x - cx) * p} y2={cy + (y - cy) * p} stroke={TONE_COLORS[toneAt(i)]} strokeWidth="3" opacity="0.5" />
            <rect x={x - 70} y={y - 34} width="140" height="68" rx="12" fill="rgba(2,6,23,0.54)" stroke={TONE_COLORS[toneAt(i)]} strokeOpacity="0.48" />
            <text x={x - 42} y={y + 7} fill={theme.textPrimary} fontSize="21" fontWeight="760">{label.slice(0, 6)}</text>
          </g>
        );
      })}
    </svg>
  );
};

const MetricBuild: React.FC<{ labels: string[]; progress: number; theme: ThemeConfig }> = ({ labels, progress, theme }) => {
  const items = labels.length ? labels.slice(0, 3) : ["采样", "波动", "瓶颈"];
  return (
    <svg width="100%" height="100%" viewBox="0 0 760 520" style={{ position: "absolute", inset: 0 }}>
      <path d="M 108 354 C 176 280, 230 392, 298 304 S 430 214, 512 286 S 606 386, 660 180"
        fill="none" stroke={theme.primary} strokeWidth="7" strokeLinecap="round"
        strokeDasharray="760" strokeDashoffset={760 * (1 - progress)} opacity="0.82" />
      {[0, 1, 2].map((i) => {
        const p = itemProgress(progress, i, 3);
        return (
          <g key={i} opacity={p}>
            <rect x={116 + i * 190} y={184 + i * 52} width="142" height="76" rx="12" fill="rgba(2,6,23,0.5)" stroke={TONE_COLORS[toneAt(i)]} strokeOpacity="0.48" />
            <text x={140 + i * 190} y={226 + i * 52} fill={theme.textPrimary} fontSize="22" fontWeight="780">{items[i] || `指标${i + 1}`}</text>
          </g>
        );
      })}
    </svg>
  );
};

const ComparisonBuild: React.FC<{ labels: string[]; progress: number; theme: ThemeConfig }> = ({ labels, progress, theme }) => {
  const left = labels.slice(0, 3);
  const right = labels.slice(3, 6);
  return (
    <svg width="100%" height="100%" viewBox="0 0 760 520" style={{ position: "absolute", inset: 0 }}>
      <line x1="380" y1="142" x2="380" y2="408" stroke={theme.textMuted} strokeWidth="2" opacity="0.24" />
      {[left, right].map((group, side) => (
        <g key={side}>
          <text x={side === 0 ? 124 : 444} y="160" fill={TONE_COLORS[toneAt(side)]} fontSize="20" fontWeight="820">{side === 0 ? "方案 A" : "方案 B"}</text>
          {group.map((label, i) => {
            const p = itemProgress(progress, i + side * 3, 6);
            return (
              <g key={label} opacity={p}>
                <rect x={side === 0 ? 104 : 424} y={196 + i * 76} width="220" height="54" rx="10" fill="rgba(2,6,23,0.48)" stroke={TONE_COLORS[toneAt(i + side)]} strokeOpacity="0.42" />
                <text x={side === 0 ? 126 : 446} y={230 + i * 76} fill={theme.textPrimary} fontSize="20" fontWeight="720">{label.slice(0, 9)}</text>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
};

const SummaryBuild: React.FC<{ labels: string[]; progress: number; theme: ThemeConfig }> = ({ labels, progress, theme }) => {
  const items = labels.length ? labels.slice(0, 4) : ["理解", "拆解", "验证"];
  const cx = 380;
  const cy = 278;
  const radius = 150;
  return (
    <svg width="100%" height="100%" viewBox="0 0 760 520" style={{ position: "absolute", inset: 0 }}>
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke={theme.primary} strokeWidth="4" strokeDasharray={`${2 * Math.PI * radius * progress} ${2 * Math.PI * radius}`} opacity="0.58" transform={`rotate(-90 ${cx} ${cy})`} />
      {items.map((label, i) => {
        const angle = (i / items.length) * Math.PI * 2 - Math.PI / 2;
        const p = itemProgress(progress, i, items.length);
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        return (
          <g key={label} opacity={p}>
            <circle cx={x} cy={y} r="26" fill={TONE_COLORS[toneAt(i)]} opacity="0.82" />
            <rect x={x - 70} y={y + 36} width="140" height="46" rx="10" fill="rgba(2,6,23,0.5)" stroke="rgba(148,163,184,0.18)" />
            <text x={x - 43} y={y + 66} fill={theme.textPrimary} fontSize="20" fontWeight="720">{label.slice(0, 6)}</text>
          </g>
        );
      })}
    </svg>
  );
};

// ─── Background helpers ─────────────────────────────────────────────

function getBackground(bg: string | undefined, theme: ThemeConfig): string {
  switch (bg) {
    case "gradient-warm":
      return `linear-gradient(135deg, ${theme.bg} 0%, #1a1020 100%)`;
    case "gradient-cool":
      return `linear-gradient(135deg, ${theme.bg} 0%, #0a1525 100%)`;
    case "dark-emphasis":
      return "#050508";
    case "light-emphasis":
      return "#f8f9fc";
    default:
      return theme.bgGradient || theme.bg;
  }
}
