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

    case "scene-stage":
      return (
        <Positioned pos={event.position}>
          <SceneStageRenderer
            stageKind={event.stageKind}
            sceneFamily={event.sceneFamily}
            title={event.title}
            subtitle={event.subtitle}
            labels={event.labels}
            focus={event.focus}
            assetKind={event.assetKind}
            assetSrc={event.assetSrc}
            assetPrompt={event.assetPrompt}
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
  width?: number | string;
  height?: number | string;
}> = ({ src, animation = "fade-in", startFrame, durationFrames, width, height }) => {
  const frame = useCurrentFrame();
  const progress = Math.max(0, Math.min(1, frame / Math.max(1, durationFrames)));
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const scale = animation === "ken-burns"
    ? interpolate(progress, [0, 1], [1.06, 1.16])
    : animation === "scale-in"
      ? interpolate(progress, [0, 1], [0.94, 1])
      : 1;
  const translateX = animation === "slide-left"
    ? interpolate(progress, [0, 1], [42, 0])
    : animation === "slide-right"
      ? interpolate(progress, [0, 1], [-42, 0])
      : animation === "ken-burns"
        ? interpolate(progress, [0, 1], [-18, 18])
        : 0;
  const translateY = animation === "ken-burns"
    ? interpolate(progress, [0, 1], [10, -12])
    : 0;

  return (
    <div style={{
      width: width ?? 400,
      height: height ?? 300,
      borderRadius: 8,
      overflow: "hidden",
      opacity,
      position: "relative",
      background: "rgba(15, 23, 42, 0.24)",
      border: "1px solid rgba(148, 163, 184, 0.24)",
      boxShadow: "0 18px 48px rgba(15, 23, 42, 0.18)",
    }}>
      <img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
          transformOrigin: "center",
        }}
      />
      <div style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(180deg, rgba(2,6,23,0.02), rgba(2,6,23,0.16))",
      }} />
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
type AssetKind = "dashboard" | "lab" | "code" | "network" | "document" | "timeline" | "signal";
type StageKind = "hero" | "deep-dive" | "process" | "metric" | "comparison" | "recap";
type SceneFamily =
  | "cinematic-hero"
  | "document-scan"
  | "mechanism-map"
  | "process-board"
  | "data-dashboard"
  | "split-compare"
  | "recap-map";

function toneAt(index: number): ToneKey {
  return (["primary", "accent", "warning", "success"] as const)[index % 4];
}

function visualLength(text: string | undefined): number {
  if (!text) return 0;
  return Array.from(text).reduce((sum, char) => sum + (/[\x00-\x7F]/.test(char) ? 0.55 : 1), 0);
}

function fitText(text: string | undefined, baseSize: number, minSize: number): number {
  const len = visualLength(text);
  if (len > 50) return Math.max(minSize, baseSize - 16);
  if (len > 38) return Math.max(minSize, baseSize - 12);
  if (len > 28) return Math.max(minSize, baseSize - 8);
  if (len > 20) return Math.max(minSize, baseSize - 4);
  return baseSize;
}

function clampLines(lines: number): React.CSSProperties {
  return {
    display: "-webkit-box",
    WebkitLineClamp: lines,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } as React.CSSProperties;
}

function shortText(text: string | undefined, maxLen = 14): string {
  const chars = Array.from((text || "").trim());
  if (chars.length <= maxLen) return chars.join("");
  return `${chars.slice(0, Math.max(1, maxLen - 1)).join("")}…`;
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
            fontSize: fitText(title, 34, 25),
            fontWeight: 760,
            lineHeight: 1.18,
            textRendering: "geometricPrecision",
            ...clampLines(body ? 2 : 3),
          }}>
            {title}
          </div>
          {body && (
            <div style={{
              color: theme.textSecondary,
              fontSize: fitText(body, 24, 19),
              fontWeight: 420,
              lineHeight: 1.42,
              marginTop: 10,
              textRendering: "geometricPrecision",
              ...clampLines(3),
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
          fontSize: fitText(title, 46, 34),
          fontWeight: 820,
          lineHeight: 1.12,
          marginTop: 12,
          textRendering: "geometricPrecision",
          textShadow: isDark ? "0 2px 18px rgba(0,0,0,0.38)" : "none",
          ...clampLines(3),
        }}>
          {title}
        </div>
        {subtitle && (
          <div style={{
            color: theme.textSecondary,
            fontSize: fitText(subtitle, 24, 19),
            lineHeight: 1.35,
            marginTop: 14,
            maxWidth: 560,
            ...clampLines(2),
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
              overflow: "hidden",
            }}>
              <div style={{ color: TONE_COLORS[toneAt(i)], fontSize: 16, fontWeight: 800 }}>
                0{i + 1}
              </div>
              <div style={{
                marginTop: 8,
                fontSize: fitText(label, 20, 16),
                lineHeight: 1.25,
                fontWeight: 740,
                ...clampLines(2),
              }}>
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
  assetKind: AssetKind;
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
          fontSize: fitText(title, 30, 23),
          lineHeight: 1.2,
          fontWeight: 780,
          textRendering: "geometricPrecision",
          ...clampLines(2),
        }}>
          {title}
        </div>
      )}

      <GeneratedAsset kind={assetKind} labels={safeLabels} progress={progress} theme={theme} />
    </div>
  );
};

const STAGE_META: Record<StageKind, {
  eyebrow: string;
  assetLabel: string;
  lensLabel: string;
}> = {
  hero: { eyebrow: "课程主场景", assetLabel: "核心对象", lensLabel: "观看重点" },
  "deep-dive": { eyebrow: "概念剖面", assetLabel: "结构主体", lensLabel: "局部放大" },
  process: { eyebrow: "过程搭建", assetLabel: "步骤路径", lensLabel: "关键转折" },
  metric: { eyebrow: "指标观察", assetLabel: "变化曲线", lensLabel: "瓶颈信号" },
  comparison: { eyebrow: "对照推演", assetLabel: "判断矩阵", lensLabel: "差异焦点" },
  recap: { eyebrow: "结论回收", assetLabel: "知识闭环", lensLabel: "可复用结论" },
};

function normalizeStageLabels(labels: string[], stageKind: StageKind): string[] {
  const defaults: Record<StageKind, string[]> = {
    hero: ["目标", "结构", "练习", "回顾"],
    "deep-dive": ["定义", "边界", "机制", "例子"],
    process: ["输入", "拆解", "处理", "输出"],
    metric: ["采样", "波动", "瓶颈", "优化"],
    comparison: ["方案 A", "成本", "风险", "方案 B", "收益", "边界"],
    recap: ["理解", "拆解", "验证", "迁移"],
  };
  const normalized = labels
    .filter(Boolean)
    .map((label) => label.trim())
    .filter((label, index, arr) => label.length > 0 && arr.indexOf(label) === index);
  const merged = normalized.length ? normalized : defaults[stageKind];
  return merged.slice(0, stageKind === "comparison" ? 6 : 5);
}

const StageShell: React.FC<{
  opacity: number;
  scale: number;
  progress: number;
  scanX: number;
  theme: ThemeConfig;
  children: React.ReactNode;
}> = ({ opacity, scale, progress, scanX, theme, children }) => {
  const isDark = theme.name === "tech-dark";
  const sweepOpacity = Math.max(0.04, Math.min(0.12, progress * 0.16));

  return (
    <div style={{
      width: "100%",
      height: "100%",
      opacity,
      transform: `scale(${scale})`,
      position: "relative",
      overflow: "hidden",
      borderRadius: 8,
      background: isDark
        ? "linear-gradient(135deg, rgba(10, 18, 42, 0.92), rgba(21, 32, 62, 0.82) 52%, rgba(6, 12, 30, 0.88))"
        : "linear-gradient(135deg, rgba(255,255,255,0.94), rgba(241,245,249,0.86) 54%, rgba(236,254,255,0.72))",
      border: `1px solid ${isDark ? "rgba(148, 163, 184, 0.18)" : "rgba(15, 23, 42, 0.1)"}`,
      boxShadow: isDark ? "0 30px 90px rgba(0,0,0,0.34)" : "0 26px 64px rgba(15,23,42,0.11)",
      fontFamily: "'Noto Sans SC', 'Inter', sans-serif",
    }}>
      <svg width="100%" height="100%" viewBox="0 0 1720 820" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id="stage-sweep" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor={theme.primary} stopOpacity="0.24" />
            <stop offset="52%" stopColor={theme.accent} stopOpacity="0.12" />
            <stop offset="100%" stopColor={theme.success} stopOpacity="0.1" />
          </linearGradient>
          <pattern id="stage-grid" width="54" height="54" patternUnits="userSpaceOnUse">
            <path d="M 54 0 L 0 0 0 54" fill="none" stroke={isDark ? "rgba(148,163,184,0.07)" : "rgba(15,23,42,0.055)"} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="1720" height="820" fill="url(#stage-grid)" opacity="0.86" />
        <path d="M 80 650 C 380 420, 560 760, 870 470 S 1240 260, 1640 350"
          fill="none"
          stroke={theme.textMuted}
          strokeWidth="2"
          strokeDasharray="12 18"
          opacity="0.18" />
        <rect x={scanX} y="-60" width="180" height="950" fill="url(#stage-sweep)" opacity={sweepOpacity} transform="skewX(-18)" />
        <path d="M 0 0 H 1720 V 120 C 1280 132, 820 108, 0 180 Z" fill={isDark ? "rgba(2,6,23,0.34)" : "rgba(255,255,255,0.36)"} />
      </svg>
      {children}
    </div>
  );
};

const StageHeader: React.FC<{
  eyebrow: string;
  title: string;
  subtitle?: string;
  progress: number;
  theme: ThemeConfig;
  maxWidth?: number;
}> = ({ eyebrow, title, subtitle, progress, theme, maxWidth = 900 }) => (
  <div style={{
    position: "absolute",
    left: 54,
    top: 42,
    maxWidth,
    transform: `translateY(${interpolate(Math.min(progress * 3, 1), [0, 1], [18, 0])}px)`,
    opacity: Math.min(1, progress * 4),
  }}>
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      color: theme.textMuted,
      fontSize: 17,
      fontWeight: 800,
      letterSpacing: 0,
    }}>
      <span style={{
        display: "inline-block",
        width: 38,
        height: 3,
        borderRadius: 3,
        background: theme.accent,
      }} />
      {eyebrow}
    </div>
    <div style={{
      color: theme.textPrimary,
      fontSize: fitText(title, 46, 34),
      lineHeight: 1.12,
      fontWeight: 860,
      marginTop: 14,
      textRendering: "geometricPrecision",
      textShadow: theme.name === "tech-dark" ? "0 2px 18px rgba(0,0,0,0.32)" : "none",
      ...clampLines(3),
    }}>
      {title}
    </div>
    {subtitle && (
      <div style={{
        color: theme.textSecondary,
        fontSize: fitText(subtitle, 23, 18),
        lineHeight: 1.38,
        marginTop: 14,
        maxWidth: Math.min(720, maxWidth),
        ...clampLines(2),
      }}>
        {subtitle}
      </div>
    )}
  </div>
);

const StageConnectors: React.FC<{
  stageKind: StageKind;
  progress: number;
  theme: ThemeConfig;
}> = ({ stageKind, progress, theme }) => {
  if (stageKind === "hero") {
    const reveal = itemProgress(progress, 1, 5);
    return (
      <svg width="100%" height="100%" viewBox="0 0 1720 820" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <path d="M 820 470 C 660 486, 590 514, 500 526"
          fill="none"
          stroke={theme.accent}
          strokeWidth="3"
          strokeDasharray="340"
          strokeDashoffset={340 * (1 - reveal)}
          opacity="0.58" />
        <path d="M 840 560 C 680 600, 590 620, 500 620"
          fill="none"
          stroke={theme.success}
          strokeWidth="3"
          strokeDasharray="340"
          strokeDashoffset={340 * (1 - reveal)}
          opacity="0.48" />
      </svg>
    );
  }

  const points = [
    { x1: 1040, y1: 332, x2: 1230, y2: 292, tone: "primary" as ToneKey, index: 0 },
    { x1: 1048, y1: 440, x2: 1230, y2: 414, tone: "accent" as ToneKey, index: 1 },
    { x1: 1036, y1: 548, x2: 1230, y2: 536, tone: stageKind === "metric" ? "warning" as ToneKey : "success" as ToneKey, index: 2 },
  ];

  return (
    <svg width="100%" height="100%" viewBox="0 0 1720 820" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {points.map((point) => {
        const reveal = itemProgress(progress, point.index, 5);
        return (
          <path
            key={point.index}
            d={`M ${point.x1} ${point.y1} C ${point.x1 + 58} ${point.y1}, ${point.x2 - 82} ${point.y2}, ${point.x2} ${point.y2}`}
            fill="none"
            stroke={TONE_COLORS[point.tone]}
            strokeWidth="3"
            strokeDasharray="360"
            strokeDashoffset={360 * (1 - reveal)}
            opacity="0.54"
          />
        );
      })}
    </svg>
  );
};

const StageAnnotation: React.FC<{
  label: string;
  kicker: string;
  top?: number | string;
  bottom?: number | string;
  right?: number | string;
  left?: number | string;
  progress: number;
  tone: ToneKey;
  theme: ThemeConfig;
}> = ({ label, kicker, top, bottom, right, left, progress, tone, theme }) => (
  <div style={{
    position: "absolute",
    top,
    bottom,
    right,
    left,
    width: 330,
    height: 108,
    opacity: progress,
    transform: `translateY(${interpolate(progress, [0, 1], [18, 0])}px)`,
    borderRadius: 8,
    padding: "15px 18px",
    background: theme.name === "tech-dark" ? "rgba(10, 18, 40, 0.82)" : "rgba(255,255,255,0.92)",
    border: `1px solid ${TONE_COLORS[tone]}66`,
    boxShadow: theme.name === "tech-dark" ? "0 14px 34px rgba(0,0,0,0.24)" : "0 14px 30px rgba(15,23,42,0.08)",
    overflow: "hidden",
    boxSizing: "border-box",
  }}>
    <div style={{
      color: TONE_COLORS[tone],
      fontSize: 15,
      fontWeight: 860,
      marginBottom: 8,
    }}>
      {kicker}
    </div>
    <div style={{
      color: theme.textPrimary,
      fontSize: fitText(label, 25, 18),
      lineHeight: 1.2,
      fontWeight: 780,
      textRendering: "geometricPrecision",
      ...clampLines(2),
    }}>
      {label}
    </div>
  </div>
);

const StageLens: React.FC<{
  label: string;
  text: string;
  progress: number;
  theme: ThemeConfig;
}> = ({ label, text, progress, theme }) => (
  <div style={{
    position: "absolute",
    right: "7%",
    bottom: "20%",
    width: 330,
    height: 148,
    opacity: progress,
    transform: `translateY(${interpolate(progress, [0, 1], [20, 0])}px)`,
    borderRadius: 8,
    overflow: "hidden",
    background: theme.name === "tech-dark" ? "rgba(15, 23, 42, 0.72)" : "rgba(255,255,255,0.9)",
    border: `1px solid ${theme.name === "tech-dark" ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.1)"}`,
    boxShadow: theme.name === "tech-dark" ? "0 16px 40px rgba(0,0,0,0.22)" : "0 16px 34px rgba(15,23,42,0.08)",
    boxSizing: "border-box",
  }}>
    <svg width="120" height="132" viewBox="0 0 120 132" style={{ position: "absolute", left: 0, top: 0 }}>
      <circle cx="52" cy="56" r="31" fill={theme.primary} opacity="0.16" stroke={theme.primary} strokeWidth="3" />
      <line x1="74" y1="78" x2="102" y2="108" stroke={theme.primary} strokeWidth="7" strokeLinecap="round" opacity="0.72" />
      <line x1="36" y1="56" x2="68" y2="56" stroke={theme.accent} strokeWidth="3" opacity="0.6" />
      <line x1="52" y1="40" x2="52" y2="72" stroke={theme.accent} strokeWidth="3" opacity="0.6" />
    </svg>
    <div style={{ position: "absolute", left: 118, top: 20, right: 20 }}>
      <div style={{ color: theme.textMuted, fontSize: 15, fontWeight: 820 }}>
        {label}
      </div>
      <div style={{
        color: theme.textPrimary,
        fontSize: fitText(text, 21, 17),
        lineHeight: 1.28,
        fontWeight: 760,
        marginTop: 8,
        ...clampLines(3),
      }}>
        {text}
      </div>
    </div>
  </div>
);

const StageTimeline: React.FC<{
  labels: string[];
  progress: number;
  theme: ThemeConfig;
}> = ({ labels, progress, theme }) => {
  const items = labels.length ? labels.slice(0, 4) : ["提出", "拆解", "验证", "收束"];
  return (
    <div style={{
      position: "absolute",
      left: 70,
      right: 70,
      bottom: 26,
      height: 122,
      overflow: "hidden",
    }}>
      <div style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 31,
        height: 4,
        borderRadius: 4,
        background: theme.name === "tech-dark" ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.1)",
      }} />
      <div style={{
        position: "absolute",
        left: 0,
        top: 31,
        width: `${Math.min(100, progress * 116)}%`,
        height: 4,
        borderRadius: 4,
        background: `linear-gradient(90deg, ${theme.primary}, ${theme.accent}, ${theme.success})`,
      }} />
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${items.length}, 1fr)`,
        gap: 18,
        position: "relative",
      }}>
        {items.map((label, i) => {
          const reveal = itemProgress(progress, i, items.length);
          return (
            <div key={`${label}-${i}`} style={{ opacity: Math.max(0.35, reveal), transform: `translateY(${interpolate(reveal, [0, 1], [10, 0])}px)` }}>
              <div style={{
                width: 18,
                height: 18,
                borderRadius: 18,
                background: TONE_COLORS[toneAt(i)],
                border: `3px solid ${theme.name === "tech-dark" ? "#020617" : "#ffffff"}`,
                boxShadow: `0 0 0 ${8 * reveal}px ${TONE_COLORS[toneAt(i)]}22`,
                marginTop: 22,
                marginBottom: 14,
              }} />
              <div style={{
                color: theme.textPrimary,
                fontSize: fitText(label, 19, 15),
                fontWeight: 760,
                lineHeight: 1.2,
                maxWidth: 280,
                ...clampLines(2),
              }}>
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const StageComparison: React.FC<{
  labels: string[];
  progress: number;
  theme: ThemeConfig;
}> = ({ labels, progress, theme }) => {
  const left = (labels.slice(0, 3).length ? labels.slice(0, 3) : ["方案 A", "优势", "代价"]).slice(0, 3);
  const right = (labels.slice(3, 6).length ? labels.slice(3, 6) : ["方案 B", "收益", "边界"]).slice(0, 3);
  const isDark = theme.name === "tech-dark";

  return (
    <div style={{
      position: "absolute",
      left: 72,
      right: 72,
      top: 220,
      bottom: 138,
    }}>
      <svg width="100%" height="100%" viewBox="0 0 1576 462" style={{ position: "absolute", inset: 0 }}>
        <line x1="788" y1="24" x2="788" y2="418" stroke={theme.textMuted} strokeWidth="2" strokeDasharray="10 12" opacity="0.28" />
        <path d="M 132 380 C 330 170, 504 290, 720 132" fill="none" stroke={theme.primary} strokeWidth="5" strokeLinecap="round" strokeDasharray="760" strokeDashoffset={760 * (1 - Math.min(progress * 1.2, 1))} opacity="0.58" />
        <path d="M 852 132 C 1048 330, 1190 142, 1446 330" fill="none" stroke={theme.accent} strokeWidth="5" strokeLinecap="round" strokeDasharray="760" strokeDashoffset={760 * (1 - Math.min(progress * 1.2, 1))} opacity="0.58" />
      </svg>
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 46,
        height: "100%",
        position: "relative",
      }}>
        {[
          { title: "路径 A", items: left, tone: "primary" as ToneKey },
          { title: "路径 B", items: right, tone: "accent" as ToneKey },
        ].map((group, side) => (
          <div key={group.title} style={{
            borderRadius: 8,
            padding: "26px 30px",
            background: isDark ? "rgba(2, 6, 23, 0.5)" : "rgba(255,255,255,0.78)",
            border: `1px solid ${TONE_COLORS[group.tone]}55`,
            overflow: "hidden",
            boxSizing: "border-box",
          }}>
            <div style={{
              color: TONE_COLORS[group.tone],
              fontSize: 22,
              fontWeight: 860,
              marginBottom: 24,
            }}>
              {group.title}
            </div>
            {group.items.map((label, i) => {
              const reveal = itemProgress(progress, i + side * 3, 6);
              return (
                <div key={`${label}-${i}`} style={{
                  opacity: reveal,
                  transform: `translateY(${interpolate(reveal, [0, 1], [18, 0])}px)`,
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  minHeight: 82,
                  borderTop: i === 0 ? "none" : `1px solid ${isDark ? "rgba(148,163,184,0.14)" : "rgba(15,23,42,0.08)"}`,
                }}>
                  <div style={{
                    width: 38,
                    height: 38,
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: TONE_COLORS[group.tone],
                    background: `${TONE_COLORS[group.tone]}22`,
                    fontSize: 18,
                    fontWeight: 860,
                  }}>
                    {i + 1}
                  </div>
                  <div style={{
                    color: theme.textPrimary,
                    fontSize: fitText(label, 27, 20),
                    fontWeight: 780,
                    lineHeight: 1.22,
                    flex: 1,
                    minWidth: 0,
                    ...clampLines(2),
                  }}>
                    {label}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

function defaultSceneFamily(stageKind: StageKind, assetKind: AssetKind): SceneFamily {
  if (stageKind === "hero") return "cinematic-hero";
  if (stageKind === "comparison") return "split-compare";
  if (stageKind === "recap") return "recap-map";
  if (stageKind === "metric" || assetKind === "dashboard" || assetKind === "signal") return "data-dashboard";
  if (stageKind === "process" || assetKind === "timeline") return "process-board";
  if (assetKind === "document") return "document-scan";
  return "mechanism-map";
}

const SceneFrame: React.FC<{
  opacity: number;
  scale: number;
  theme: ThemeConfig;
  background: string;
  children: React.ReactNode;
}> = ({ opacity, scale, theme, background, children }) => (
  <div style={{
    width: "100%",
    height: "100%",
    position: "relative",
    overflow: "hidden",
    opacity,
    transform: `scale(${scale})`,
    borderRadius: 8,
    background,
    border: `1px solid ${theme.name === "tech-dark" ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.1)"}`,
    boxShadow: theme.name === "tech-dark" ? "0 30px 90px rgba(0,0,0,0.34)" : "0 24px 58px rgba(15,23,42,0.1)",
    fontFamily: "'Noto Sans SC', 'Inter', sans-serif",
  }}>
    {children}
  </div>
);

const SceneTitleBlock: React.FC<{
  eyebrow: string;
  title: string;
  subtitle?: string;
  progress: number;
  theme: ThemeConfig;
  left?: number;
  top?: number;
  width?: number;
  titleSize?: number;
}> = ({ eyebrow, title, subtitle, progress, theme, left = 64, top = 50, width = 760, titleSize = 48 }) => (
  <div style={{
    position: "absolute",
    left,
    top,
    width,
    opacity: Math.min(1, progress * 4),
    transform: `translateY(${interpolate(Math.min(progress * 3, 1), [0, 1], [18, 0])}px)`,
  }}>
    <div style={{
      color: theme.textMuted,
      fontSize: 16,
      fontWeight: 860,
      letterSpacing: 0,
      display: "flex",
      alignItems: "center",
      gap: 10,
    }}>
      <span style={{ width: 34, height: 3, borderRadius: 3, background: theme.accent }} />
      {eyebrow}
    </div>
    <div style={{
      color: theme.textPrimary,
      fontSize: fitText(title, titleSize, Math.max(34, titleSize - 16)),
      lineHeight: 1.1,
      fontWeight: 880,
      marginTop: 14,
      textRendering: "geometricPrecision",
      textShadow: theme.name === "tech-dark" ? "0 2px 20px rgba(0,0,0,0.32)" : "none",
      ...clampLines(3),
    }}>
      {title}
    </div>
    {subtitle && (
      <div style={{
        color: theme.textSecondary,
        fontSize: fitText(subtitle, 22, 18),
        lineHeight: 1.38,
        marginTop: 14,
        ...clampLines(2),
      }}>
        {subtitle}
      </div>
    )}
  </div>
);

const CinematicHeroScene: React.FC<{
  title: string;
  subtitle?: string;
  labels: string[];
  assetKind: AssetKind;
  assetSrc?: string;
  assetPrompt?: string;
  progress: number;
  opacity: number;
  scale: number;
  theme: ThemeConfig;
}> = ({ title, subtitle, labels, assetKind, assetSrc, assetPrompt, progress, opacity, scale, theme }) => {
  const isDark = theme.name === "tech-dark";
  const titleProgress = itemProgress(progress, 0, 4);
  const visualProgress = itemProgress(progress, 1, 4);
  const safeLabels = labels.length ? labels.slice(0, 4) : ["对象", "路径", "问题", "结论"];

  return (
    <SceneFrame
      opacity={opacity}
      scale={scale}
      theme={theme}
      background={isDark
        ? "radial-gradient(circle at 72% 36%, rgba(6,182,212,0.22), transparent 30%), linear-gradient(145deg, #020617 0%, #101827 48%, #08111f 100%)"
        : "radial-gradient(circle at 72% 36%, rgba(6,182,212,0.18), transparent 30%), linear-gradient(145deg, #f8fafc 0%, #eef6ff 48%, #ffffff 100%)"}
    >
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 74, background: "rgba(2,6,23,0.28)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 78, background: "rgba(2,6,23,0.32)" }} />
      <svg width="100%" height="100%" viewBox="0 0 1720 835" style={{ position: "absolute", inset: 0 }}>
        <path d="M 52 678 C 352 466, 602 740, 906 450 S 1308 214, 1662 332"
          fill="none" stroke={theme.accent} strokeWidth="3" strokeDasharray="12 18" opacity="0.28" />
        <rect x="1006" y="116" width="556" height="556" rx="278" fill={theme.primary} opacity="0.08" />
        <rect x="1052" y="162" width="464" height="464" rx="232" fill={theme.accent} opacity="0.08" />
      </svg>

      <div style={{
        position: "absolute",
        left: 68,
        top: 116,
        width: 780,
        opacity: titleProgress,
        transform: `translateY(${interpolate(titleProgress, [0, 1], [32, 0])}px)`,
      }}>
        <div style={{ color: theme.accent, fontSize: 18, fontWeight: 880, marginBottom: 22 }}>课程开场</div>
        <div style={{
          color: theme.textPrimary,
          fontSize: fitText(title, 72, 52),
          lineHeight: 1.04,
          fontWeight: 900,
          textRendering: "geometricPrecision",
          textShadow: isDark ? "0 4px 28px rgba(0,0,0,0.42)" : "none",
          ...clampLines(3),
        }}>
          {title}
        </div>
        {subtitle && (
          <div style={{
            color: theme.textSecondary,
            fontSize: fitText(subtitle, 28, 21),
            lineHeight: 1.38,
            marginTop: 24,
            maxWidth: 660,
            ...clampLines(2),
          }}>
            {subtitle}
          </div>
        )}
      </div>

      <div style={{
        position: "absolute",
        right: 94,
        top: 106,
        width: 650,
        height: 500,
        opacity: visualProgress,
        transform: `translateX(${interpolate(visualProgress, [0, 1], [34, 0])}px)`,
      }}>
        <div style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: `1px solid ${isDark ? "rgba(148,163,184,0.2)" : "rgba(15,23,42,0.1)"}`,
          background: isDark ? "rgba(15,23,42,0.34)" : "rgba(255,255,255,0.52)",
        }} />
        {assetSrc ? (
          <ImageReveal src={assetSrc} animation="ken-burns" startFrame={0} durationFrames={168} width="100%" height="100%" />
        ) : (
          <GeneratedAsset kind={assetKind} labels={[]} progress={progress} theme={theme} />
        )}
      </div>

      <div style={{
        position: "absolute",
        left: 70,
        right: 70,
        bottom: 102,
        display: "grid",
        gridTemplateColumns: `repeat(${safeLabels.length}, 1fr)`,
        gap: 16,
      }}>
        {safeLabels.map((label, i) => {
          const p = itemProgress(progress, i, safeLabels.length);
          return (
            <div key={`${label}-${i}`} style={{
              opacity: p,
              transform: `translateY(${interpolate(p, [0, 1], [18, 0])}px)`,
              height: 94,
              borderRadius: 8,
              padding: "14px 16px",
              background: isDark ? "rgba(2,6,23,0.58)" : "rgba(255,255,255,0.76)",
              border: `1px solid ${TONE_COLORS[toneAt(i)]}55`,
              overflow: "hidden",
              boxSizing: "border-box",
            }}>
              <div style={{ color: TONE_COLORS[toneAt(i)], fontSize: 15, fontWeight: 860 }}>镜头 {i + 1}</div>
              <div style={{
                color: theme.textPrimary,
                fontSize: fitText(label, 22, 17),
                fontWeight: 780,
                lineHeight: 1.22,
                marginTop: 8,
                ...clampLines(2),
              }}>
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </SceneFrame>
  );
};

const DocumentScanVisual: React.FC<{
  progress: number;
  theme: ThemeConfig;
}> = ({ progress, theme }) => {
  const frame = useCurrentFrame();
  const isDark = theme.name === "tech-dark";
  const sweep = (frame % 128) / 128;
  const paperOpacity = Math.min(1, progress * 2.2);

  return (
    <svg width="100%" height="100%" viewBox="0 0 760 680" style={{ position: "absolute", inset: 0 }}>
      <rect
        x="74"
        y="70"
        width="612"
        height="540"
        rx="20"
        fill={isDark ? "rgba(2,6,23,0.34)" : "rgba(248,250,252,0.56)"}
        stroke={isDark ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.1)"}
      />

      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <line
          key={`grid-h-${i}`}
          x1="76"
          y1={118 + i * 70}
          x2="684"
          y2={118 + i * 70}
          stroke={isDark ? "rgba(148,163,184,0.1)" : "rgba(15,23,42,0.07)"}
          strokeWidth="1"
        />
      ))}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <line
          key={`grid-v-${i}`}
          x1={118 + i * 70}
          y1="72"
          x2={118 + i * 70}
          y2="610"
          stroke={isDark ? "rgba(148,163,184,0.08)" : "rgba(15,23,42,0.055)"}
          strokeWidth="1"
        />
      ))}

      <rect
        x="122"
        y="162"
        width="410"
        height="366"
        rx="18"
        fill={isDark ? "rgba(71,85,105,0.34)" : "rgba(255,255,255,0.7)"}
        opacity={paperOpacity}
      />
      <rect x="122" y="162" width="410" height="80" rx="18" fill={theme.primary} opacity="0.08" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const p = itemProgress(progress, i, 8);
        const widths = [326, 270, 342, 226, 304, 252, 292, 224];
        return (
          <rect
            key={`doc-line-${i}`}
            x="156"
            y={198 + i * 34}
            width={widths[i] * p}
            height={i % 3 === 0 ? 13 : 10}
            rx="6"
            fill={i === 3 ? theme.accent : "rgba(226,232,240,0.42)"}
            opacity={i === 3 ? 0.68 : 0.56}
          />
        );
      })}

      <rect
        x={90 + 438 * sweep}
        y="88"
        width="82"
        height="502"
        rx="26"
        fill={theme.primary}
        opacity="0.16"
      />
      <rect
        x="74"
        y="438"
        width="612"
        height="116"
        rx="20"
        fill={isDark ? "rgba(2,6,23,0.26)" : "rgba(255,255,255,0.24)"}
      />
    </svg>
  );
};

const DocumentScanScene: React.FC<{
  title: string;
  subtitle?: string;
  labels: string[];
  focus: string;
  assetKind: AssetKind;
  assetSrc?: string;
  progress: number;
  opacity: number;
  scale: number;
  theme: ThemeConfig;
}> = ({ title, subtitle, labels, focus, assetKind, assetSrc, progress, opacity, scale, theme }) => {
  const isDark = theme.name === "tech-dark";
  const safeLabels = labels.length ? labels.slice(0, 5) : ["文本", "证据", "特征", "结论"];
  const useImageAsset = Boolean(assetSrc && !assetSrc.startsWith("data:image/svg+xml"));

  return (
    <SceneFrame
      opacity={opacity}
      scale={scale}
      theme={theme}
      background={isDark
        ? "linear-gradient(135deg, rgba(2,6,23,0.94), rgba(30,41,59,0.86))"
        : "linear-gradient(135deg, #f8fafc, #eff6ff)"}
    >
      <SceneTitleBlock eyebrow="文档分析" title={title} subtitle={subtitle} progress={progress} theme={theme} left={940} top={58} width={670} titleSize={44} />

      <div style={{
        position: "absolute",
        left: 76,
        top: 70,
        width: 760,
        height: 680,
        borderRadius: 8,
        background: isDark ? "rgba(15,23,42,0.56)" : "rgba(255,255,255,0.82)",
        border: `1px solid ${isDark ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.1)"}`,
        boxShadow: isDark ? "0 28px 70px rgba(0,0,0,0.32)" : "0 24px 58px rgba(15,23,42,0.1)",
        overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, opacity: useImageAsset ? 0.28 : 1 }}>
          <DocumentScanVisual progress={progress} theme={theme} />
        </div>
        {useImageAsset && assetSrc && <ImageReveal src={assetSrc} animation="ken-burns" startFrame={0} durationFrames={150} width="100%" height="100%" />}
        <svg width="100%" height="100%" viewBox="0 0 760 680" style={{ position: "absolute", inset: 0 }}>
          {[0, 1, 2, 3].map((i) => {
            const p = itemProgress(progress, i, 4);
            return (
              <g key={i} opacity={p}>
                <rect x="114" y={154 + i * 98} width={300 + (i % 2) * 72} height="16" rx="8" fill={i === 1 ? theme.accent : "rgba(226,232,240,0.34)"} />
                <rect x="114" y={186 + i * 98} width={238 + (i % 3) * 48} height="11" rx="6" fill="rgba(148,163,184,0.28)" />
                <rect x="92" y={144 + i * 98} width="6" height="54" rx="3" fill={TONE_COLORS[toneAt(i)]} />
              </g>
            );
          })}
          <circle cx="486" cy={304 + 54 * progress} r="54" fill="none" stroke={theme.accent} strokeWidth="5" opacity="0.62" />
          <line x1="526" y1={344 + 54 * progress} x2="604" y2={422 + 54 * progress} stroke={theme.accent} strokeWidth="9" strokeLinecap="round" opacity="0.46" />
        </svg>
      </div>

      <div style={{ position: "absolute", right: 78, top: 276, width: 650 }}>
        {safeLabels.slice(0, 3).map((label, i) => {
          const p = itemProgress(progress, i, 4);
          return (
            <div key={`${label}-${i}`} style={{
              opacity: p,
              transform: `translateX(${interpolate(p, [0, 1], [30, 0])}px)`,
              marginBottom: 18,
              borderRadius: 8,
              height: 110,
              padding: "18px 22px",
              background: isDark ? "rgba(2,6,23,0.58)" : "rgba(255,255,255,0.84)",
              border: `1px solid ${TONE_COLORS[toneAt(i)]}55`,
              overflow: "hidden",
              boxSizing: "border-box",
            }}>
              <div style={{ color: TONE_COLORS[toneAt(i)], fontSize: 15, fontWeight: 860 }}>证据层 {i + 1}</div>
              <div style={{
                color: theme.textPrimary,
                fontSize: fitText(label, 28, 20),
                fontWeight: 800,
                lineHeight: 1.22,
                marginTop: 8,
                ...clampLines(2),
              }}>
                {label}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        position: "absolute",
        right: 78,
        bottom: 68,
        width: 650,
        borderRadius: 8,
        padding: "20px 24px",
        background: isDark ? "rgba(8,13,26,0.72)" : "rgba(255,255,255,0.9)",
        border: `1px solid ${isDark ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.1)"}`,
        color: theme.textSecondary,
        fontSize: fitText(focus, 22, 18),
        lineHeight: 1.36,
        maxHeight: 132,
        overflow: "hidden",
        boxSizing: "border-box",
        ...clampLines(3),
      }}>
        {focus}
      </div>
    </SceneFrame>
  );
};

const MechanismMapScene: React.FC<{
  title: string;
  subtitle?: string;
  labels: string[];
  focus: string;
  assetKind: AssetKind;
  progress: number;
  opacity: number;
  scale: number;
  theme: ThemeConfig;
}> = ({ title, subtitle, labels, focus, assetKind, progress, opacity, scale, theme }) => {
  const isDark = theme.name === "tech-dark";
  const safeLabels = labels.length ? labels.slice(0, 5) : ["定义", "边界", "机制", "例子"];

  return (
    <SceneFrame
      opacity={opacity}
      scale={scale}
      theme={theme}
      background={isDark
        ? "radial-gradient(circle at 50% 48%, rgba(99,102,241,0.18), transparent 34%), linear-gradient(135deg, #06111f, #111827)"
        : "radial-gradient(circle at 50% 48%, rgba(99,102,241,0.14), transparent 34%), linear-gradient(135deg, #ffffff, #ecfeff)"}
    >
      <SceneTitleBlock eyebrow="机制剖面" title={title} subtitle={subtitle} progress={progress} theme={theme} left={66} top={48} width={760} titleSize={46} />

      <div style={{
        position: "absolute",
        left: 500,
        top: 188,
        width: 720,
        height: 520,
        borderRadius: 8,
        overflow: "hidden",
      }}>
        <GeneratedAsset kind={assetKind === "timeline" ? "network" : assetKind} labels={[]} progress={progress} theme={theme} />
      </div>

      {safeLabels.slice(0, 4).map((label, i) => {
        const p = itemProgress(progress, i, 4);
        const positions: Array<{ left?: number; right?: number; top?: number; bottom?: number }> = [
          { left: 128, top: 288 },
          { right: 112, top: 238 },
          { left: 168, bottom: 150 },
          { right: 158, bottom: 132 },
        ];
        const pos = positions[i];
        return (
          <StageAnnotation
            key={`${label}-${i}`}
            label={label}
            kicker={["先定义", "看边界", "拆机制", "落例子"][i] ?? "观察"}
            top={pos.top}
            bottom={pos.bottom}
            left={pos.left}
            right={pos.right}
            progress={p}
            tone={toneAt(i)}
            theme={theme}
          />
        );
      })}

      <div style={{
        position: "absolute",
        left: 610,
        bottom: 64,
        width: 500,
        borderRadius: 8,
        padding: "17px 20px",
        background: isDark ? "rgba(2,6,23,0.64)" : "rgba(255,255,255,0.86)",
        border: `1px solid ${theme.accent}55`,
        color: theme.textSecondary,
        fontSize: fitText(focus, 21, 17),
        lineHeight: 1.34,
        maxHeight: 118,
        overflow: "hidden",
        boxSizing: "border-box",
        ...clampLines(3),
      }}>
        {focus}
      </div>
    </SceneFrame>
  );
};

const ProcessBoardScene: React.FC<{
  title: string;
  subtitle?: string;
  labels: string[];
  focus: string;
  progress: number;
  opacity: number;
  scale: number;
  theme: ThemeConfig;
}> = ({ title, subtitle, labels, focus, progress, opacity, scale, theme }) => {
  const isDark = theme.name === "tech-dark";
  const safeLabels = labels.length ? labels.slice(0, 4) : ["输入", "拆解", "处理", "输出"];

  return (
    <SceneFrame
      opacity={opacity}
      scale={scale}
      theme={theme}
      background={isDark
        ? "linear-gradient(135deg, rgba(8,13,28,0.96), rgba(25,39,62,0.88))"
        : "linear-gradient(135deg, #f8fafc, #f0fdfa)"}
    >
      <SceneTitleBlock eyebrow="过程搭建" title={title} subtitle={subtitle} progress={progress} theme={theme} left={66} top={46} width={930} titleSize={44} />
      <div style={{
        position: "absolute",
        left: 78,
        right: 78,
        top: 250,
        height: 360,
        display: "grid",
        gridTemplateColumns: `repeat(${safeLabels.length}, 1fr)`,
        gap: 20,
      }}>
        {safeLabels.map((label, i) => {
          const p = itemProgress(progress, i, safeLabels.length);
          return (
            <div key={`${label}-${i}`} style={{
              position: "relative",
              opacity: p,
              transform: `translateY(${interpolate(p, [0, 1], [28, 0])}px)`,
              borderRadius: 8,
              padding: "26px 24px",
              background: isDark ? "rgba(2,6,23,0.58)" : "rgba(255,255,255,0.86)",
              border: `1px solid ${TONE_COLORS[toneAt(i)]}55`,
              boxShadow: isDark ? "0 20px 48px rgba(0,0,0,0.22)" : "0 18px 38px rgba(15,23,42,0.08)",
            }}>
              <div style={{ color: TONE_COLORS[toneAt(i)], fontSize: 18, fontWeight: 880 }}>STEP {i + 1}</div>
              <div style={{
                color: theme.textPrimary,
                fontSize: fitText(label, 34, 23),
                fontWeight: 840,
                lineHeight: 1.15,
                marginTop: 24,
                ...clampLines(3),
              }}>
                {label}
              </div>
              <div style={{
                position: "absolute",
                left: 24,
                right: 24,
                bottom: 26,
                height: 7,
                borderRadius: 7,
                background: isDark ? "rgba(148,163,184,0.14)" : "rgba(15,23,42,0.08)",
                overflow: "hidden",
              }}>
                <div style={{ width: `${Math.min(100, p * 110)}%`, height: "100%", background: TONE_COLORS[toneAt(i)] }} />
              </div>
              {i < safeLabels.length - 1 && (
                <div style={{
                  position: "absolute",
                  right: -31,
                  top: "50%",
                  width: 42,
                  height: 4,
                  borderRadius: 4,
                  background: theme.accent,
                  opacity: p,
                }} />
              )}
            </div>
          );
        })}
      </div>
      <StageTimeline labels={safeLabels} progress={progress} theme={theme} />
      <div style={{
        position: "absolute",
        right: 86,
        top: 84,
        width: 470,
        borderRadius: 8,
        padding: "18px 22px",
        background: isDark ? "rgba(2,6,23,0.48)" : "rgba(255,255,255,0.78)",
        border: `1px solid ${theme.accent}44`,
        color: theme.textSecondary,
        fontSize: fitText(focus, 21, 17),
        lineHeight: 1.36,
        maxHeight: 132,
        overflow: "hidden",
        boxSizing: "border-box",
        ...clampLines(3),
      }}>
        {focus}
      </div>
    </SceneFrame>
  );
};

const DataDashboardScene: React.FC<{
  title: string;
  subtitle?: string;
  labels: string[];
  focus: string;
  assetKind: AssetKind;
  progress: number;
  opacity: number;
  scale: number;
  theme: ThemeConfig;
}> = ({ title, subtitle, labels, focus, assetKind, progress, opacity, scale, theme }) => {
  const isDark = theme.name === "tech-dark";
  const safeLabels = labels.length ? labels.slice(0, 4) : ["采样", "波动", "瓶颈", "优化"];

  return (
    <SceneFrame
      opacity={opacity}
      scale={scale}
      theme={theme}
      background={isDark
        ? "linear-gradient(135deg, #020617, #101827 48%, #111827)"
        : "linear-gradient(135deg, #f8fafc, #eef2ff)"}
    >
      <SceneTitleBlock eyebrow="指标观察" title={title} subtitle={subtitle} progress={progress} theme={theme} left={64} top={48} width={760} titleSize={42} />
      <div style={{ position: "absolute", left: 74, top: 252, width: 1010, height: 470 }}>
        <GeneratedAsset kind={assetKind === "signal" ? "signal" : "dashboard"} labels={[]} progress={progress} theme={theme} />
      </div>
      <div style={{
        position: "absolute",
        right: 76,
        top: 110,
        width: 470,
        display: "grid",
        gap: 18,
      }}>
        {safeLabels.slice(0, 3).map((label, i) => {
          const p = itemProgress(progress, i, 4);
          const values = ["82%", "3.4x", "12fps"];
          return (
            <div key={`${label}-${i}`} style={{
              opacity: p,
              borderRadius: 8,
              padding: "20px 22px",
              background: isDark ? "rgba(2,6,23,0.62)" : "rgba(255,255,255,0.86)",
              border: `1px solid ${TONE_COLORS[toneAt(i)]}55`,
            }}>
              <div style={{
                color: theme.textMuted,
                fontSize: fitText(label, 15, 12),
                fontWeight: 820,
                ...clampLines(1),
              }}>
                {label}
              </div>
              <div style={{ color: TONE_COLORS[toneAt(i)], fontSize: 42, fontWeight: 900, lineHeight: 1.05, marginTop: 8 }}>{values[i]}</div>
            </div>
          );
        })}
      </div>
      <div style={{
        position: "absolute",
        right: 76,
        bottom: 72,
        width: 470,
        color: theme.textSecondary,
        fontSize: fitText(focus, 21, 17),
        lineHeight: 1.36,
        padding: "18px 22px",
        borderRadius: 8,
        background: isDark ? "rgba(15,23,42,0.62)" : "rgba(255,255,255,0.82)",
        border: `1px solid ${isDark ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.1)"}`,
        maxHeight: 132,
        overflow: "hidden",
        boxSizing: "border-box",
        ...clampLines(3),
      }}>
        {focus}
      </div>
    </SceneFrame>
  );
};

const RecapMapScene: React.FC<{
  title: string;
  subtitle?: string;
  labels: string[];
  focus: string;
  progress: number;
  opacity: number;
  scale: number;
  theme: ThemeConfig;
}> = ({ title, subtitle, labels, focus, progress, opacity, scale, theme }) => {
  const isDark = theme.name === "tech-dark";
  const safeLabels = labels.length ? labels.slice(0, 4) : ["理解", "拆解", "验证", "迁移"];

  return (
    <SceneFrame
      opacity={opacity}
      scale={scale}
      theme={theme}
      background={isDark
        ? "radial-gradient(circle at 48% 52%, rgba(16,185,129,0.16), transparent 34%), linear-gradient(135deg, #020617, #101827)"
        : "radial-gradient(circle at 48% 52%, rgba(16,185,129,0.12), transparent 34%), linear-gradient(135deg, #ffffff, #ecfdf5)"}
    >
      <SceneTitleBlock eyebrow="结论回收" title={title} subtitle={subtitle} progress={progress} theme={theme} left={72} top={52} width={720} titleSize={46} />
      <div style={{ position: "absolute", left: 560, top: 156, width: 620, height: 560 }}>
        <GeneratedAsset kind="timeline" labels={[]} progress={progress} theme={theme} />
      </div>
      {safeLabels.map((label, i) => {
        const p = itemProgress(progress, i, safeLabels.length);
        const positions: Array<{ left?: number; right?: number; top?: number; bottom?: number }> = [
          { left: 118, top: 290 },
          { right: 138, top: 230 },
          { left: 176, bottom: 142 },
          { right: 180, bottom: 132 },
        ];
        const pos = positions[i];
        return (
          <StageAnnotation
            key={`${label}-${i}`}
            label={label}
            kicker={["带走", "复用", "检查", "迁移"][i] ?? "回顾"}
            top={pos.top}
            bottom={pos.bottom}
            left={pos.left}
            right={pos.right}
            progress={p}
            tone={toneAt(i)}
            theme={theme}
          />
        );
      })}
      <div style={{
        position: "absolute",
        left: 72,
        right: 72,
        bottom: 56,
        height: 4,
        borderRadius: 4,
        background: `linear-gradient(90deg, ${theme.primary}, ${theme.accent}, ${theme.success})`,
        transformOrigin: "left",
        transform: `scaleX(${Math.min(1, progress * 1.1)})`,
      }} />
      <div style={{
        position: "absolute",
        left: 72,
        bottom: 86,
        width: 520,
        color: theme.textSecondary,
        fontSize: fitText(focus, 21, 17),
        lineHeight: 1.34,
        padding: "14px 18px",
        borderRadius: 8,
        background: isDark ? "rgba(2,6,23,0.48)" : "rgba(255,255,255,0.78)",
        border: `1px solid ${isDark ? "rgba(148,163,184,0.14)" : "rgba(15,23,42,0.08)"}`,
        maxHeight: 112,
        overflow: "hidden",
        boxSizing: "border-box",
        ...clampLines(3),
      }}>
        {focus}
      </div>
    </SceneFrame>
  );
};

const SceneStageRenderer: React.FC<{
  stageKind: StageKind;
  sceneFamily?: SceneFamily;
  title: string;
  subtitle?: string;
  labels?: string[];
  focus?: string;
  assetKind?: AssetKind;
  assetSrc?: string;
  assetPrompt?: string;
  durationFrames?: number;
  theme: ThemeConfig;
}> = ({
  stageKind,
  sceneFamily,
  title,
  subtitle,
  labels = [],
  focus,
  assetKind = "network",
  assetSrc,
  assetPrompt,
  durationFrames,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = durationFrames ?? (stageKind === "hero" ? 168 : 156);
  const enter = spring({ frame, fps, config: { damping: 20, stiffness: 92 } });
  const opacity = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" });
  const scale = interpolate(enter, [0, 1], [0.985, 1]);
  const progress = Math.max(0, Math.min(1, frame / Math.max(1, dur * 0.78)));
  const assetProgress = Math.max(0, Math.min(1, (progress - 0.04) / 0.74));
  const isDark = theme.name === "tech-dark";
  const meta = STAGE_META[stageKind];
  const safeLabels = normalizeStageLabels(labels, stageKind);
  const focusText = focus || subtitle || safeLabels[1] || safeLabels[0] || "抓住可验证的核心";
  const scanX = interpolate(frame % 120, [0, 120], [-220, 1820]);
  const family = sceneFamily ?? defaultSceneFamily(stageKind, assetKind);

  if (family === "cinematic-hero") {
    return (
      <CinematicHeroScene
        title={title}
        subtitle={subtitle}
        labels={safeLabels}
        assetKind={assetKind}
        assetSrc={assetSrc}
        assetPrompt={assetPrompt}
        progress={progress}
        opacity={opacity}
        scale={scale}
        theme={theme}
      />
    );
  }

  if (family === "document-scan") {
    return (
      <DocumentScanScene
        title={title}
        subtitle={subtitle}
        labels={safeLabels}
        focus={focusText}
        assetKind={assetKind}
        assetSrc={assetSrc}
        progress={progress}
        opacity={opacity}
        scale={scale}
        theme={theme}
      />
    );
  }

  if (family === "process-board") {
    return (
      <ProcessBoardScene
        title={title}
        subtitle={subtitle}
        labels={safeLabels}
        focus={focusText}
        progress={progress}
        opacity={opacity}
        scale={scale}
        theme={theme}
      />
    );
  }

  if (family === "data-dashboard") {
    return (
      <DataDashboardScene
        title={title}
        subtitle={subtitle}
        labels={safeLabels}
        focus={focusText}
        assetKind={assetKind}
        progress={progress}
        opacity={opacity}
        scale={scale}
        theme={theme}
      />
    );
  }

  if (family === "mechanism-map") {
    return (
      <MechanismMapScene
        title={title}
        subtitle={subtitle}
        labels={safeLabels}
        focus={focusText}
        assetKind={assetKind}
        progress={progress}
        opacity={opacity}
        scale={scale}
        theme={theme}
      />
    );
  }

  if (family === "recap-map") {
    return (
      <RecapMapScene
        title={title}
        subtitle={subtitle}
        labels={safeLabels}
        focus={focusText}
        progress={progress}
        opacity={opacity}
        scale={scale}
        theme={theme}
      />
    );
  }

  if (stageKind === "comparison" || family === "split-compare") {
    return (
      <StageShell
        opacity={opacity}
        scale={scale}
        progress={progress}
        scanX={scanX}
        theme={theme}
      >
        <StageHeader
          eyebrow={meta.eyebrow}
          title={title}
          subtitle={subtitle || "先建立判断维度，再让两侧差异逐项显形。"}
          progress={progress}
          theme={theme}
        />
        <StageComparison
          labels={safeLabels}
          progress={progress}
          theme={theme}
        />
        <StageTimeline labels={safeLabels.slice(0, 4)} progress={progress} theme={theme} />
      </StageShell>
    );
  }

  const hero = stageKind === "hero";
  const assetLeft = hero ? "43%" : "5%";
  const assetTop = hero ? "18%" : "20%";
  const assetWidth = hero ? "52%" : "58%";
  const assetHeight = hero ? "64%" : "63%";
  const visualLabels = hero ? [] : safeLabels;

  return (
    <StageShell
      opacity={opacity}
      scale={scale}
      progress={progress}
      scanX={scanX}
      theme={theme}
    >
      <StageHeader
        eyebrow={meta.eyebrow}
        title={title}
        subtitle={subtitle}
        progress={progress}
        theme={theme}
        maxWidth={hero ? 720 : 900}
      />

      <div style={{
        position: "absolute",
        left: assetLeft,
        top: assetTop,
        width: assetWidth,
        height: assetHeight,
        borderRadius: 8,
        overflow: "hidden",
        background: isDark
          ? "linear-gradient(135deg, rgba(8, 16, 38, 0.7), rgba(20, 32, 58, 0.46))"
          : "linear-gradient(135deg, rgba(255,255,255,0.7), rgba(226,232,240,0.34))",
        border: `1px solid ${isDark ? "rgba(148, 163, 184, 0.2)" : "rgba(15, 23, 42, 0.08)"}`,
      }}>
        {assetSrc && (
          <div style={{ position: "absolute", inset: 0 }}>
            <ImageReveal
              src={assetSrc}
              animation="ken-burns"
              startFrame={0}
              durationFrames={dur}
              width="100%"
              height="100%"
            />
          </div>
        )}
        <div style={{
          position: "absolute",
          inset: 0,
          opacity: assetSrc ? 0.72 : 1,
          mixBlendMode: assetSrc ? "screen" : "normal",
        }}>
          <GeneratedAsset kind={assetKind} labels={visualLabels} progress={assetProgress} theme={theme} />
        </div>
        <div style={{
          position: "absolute",
          left: 26,
          bottom: 22,
          padding: "10px 13px",
          borderRadius: 8,
          background: isDark ? "rgba(2, 6, 23, 0.68)" : "rgba(255,255,255,0.86)",
          border: `1px solid ${isDark ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.1)"}`,
          color: theme.textSecondary,
          fontSize: 17,
          fontWeight: 720,
        }}>
          {meta.assetLabel}
        </div>
      </div>

      <StageConnectors stageKind={stageKind} progress={progress} theme={theme} />

      <StageAnnotation
        label={safeLabels[0] || "建立对象"}
        kicker="第一层"
        top={hero ? "51%" : "24%"}
        right={hero ? "57%" : "7%"}
        progress={itemProgress(progress, 0, 5)}
        tone="primary"
        theme={theme}
      />
      <StageAnnotation
        label={safeLabels[1] || "观察变化"}
        kicker="第二层"
        top={hero ? "63%" : "39%"}
        right={hero ? "57%" : "7%"}
        progress={itemProgress(progress, 1, 5)}
        tone="accent"
        theme={theme}
      />
      <StageAnnotation
        label={safeLabels[2] || "验证结论"}
        kicker="第三层"
        top={hero ? "75%" : "54%"}
        right={hero ? "57%" : "7%"}
        progress={itemProgress(progress, 2, 5)}
        tone={stageKind === "metric" ? "warning" : "success"}
        theme={theme}
      />

      {!hero && (
        <StageLens
          label={meta.lensLabel}
          text={focusText}
          progress={itemProgress(progress, 3, 5)}
          theme={theme}
        />
      )}

      <StageTimeline
        labels={safeLabels.slice(0, 4)}
        progress={progress}
        theme={theme}
      />
    </StageShell>
  );
};

const GeneratedAsset: React.FC<{
  kind: AssetKind;
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
    width: 142,
    maxHeight: 88,
    borderRadius: 8,
    padding: "12px 14px",
    background: theme.name === "tech-dark" ? "rgba(2, 6, 23, 0.58)" : "rgba(255,255,255,0.86)",
    border: `1px solid ${TONE_COLORS[tone]}66`,
    color: theme.textPrimary,
    fontSize: fitText(label, 20, 15),
    fontWeight: 720,
    lineHeight: 1.2,
    boxShadow: theme.name === "tech-dark" ? "0 10px 26px rgba(0,0,0,0.18)" : "0 10px 22px rgba(15,23,42,0.07)",
    overflow: "hidden",
    boxSizing: "border-box",
  }}>
    <div style={{ color: TONE_COLORS[tone], fontSize: 14, fontWeight: 860, marginBottom: 7 }}>
      0{index + 1}
    </div>
    <div style={clampLines(2)}>
      {label}
    </div>
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
            <text x={x - 42} y={i % 2 === 0 ? 206 : 364} fill={theme.textPrimary} fontSize="18" fontWeight="700">{shortText(label, 7)}</text>
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
          fontSize: fitText(title, 34, 26),
          fontWeight: 820,
          lineHeight: 1.18,
          marginTop: 8,
          textRendering: "geometricPrecision",
          ...clampLines(2),
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
          fontSize: fitText(caption, 22, 18),
          lineHeight: 1.35,
          padding: "15px 18px",
          borderRadius: 8,
          background: isDark ? "rgba(2, 6, 23, 0.46)" : "rgba(255,255,255,0.82)",
          border: `1px solid ${isDark ? "rgba(148, 163, 184, 0.14)" : "rgba(15,23,42,0.08)"}`,
          maxHeight: 108,
          overflow: "hidden",
          boxSizing: "border-box",
          ...clampLines(3),
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
            <text x={x - 50} y={254 + (i % 2) * 122} fill={theme.textPrimary} fontSize="22" fontWeight="760">{shortText(label, 8)}</text>
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
      <text x={cx - 44} y={cy + 7} fill={theme.textPrimary} fontSize="24" fontWeight="820">{shortText(center, 5)}</text>
      {branches.map((label, i) => {
        const angle = (i / branches.length) * Math.PI * 2 - Math.PI / 2;
        const p = itemProgress(progress, i, branches.length);
        const x = cx + Math.cos(angle) * 190;
        const y = cy + Math.sin(angle) * 142;
        return (
          <g key={label} opacity={p}>
            <line x1={cx} y1={cy} x2={cx + (x - cx) * p} y2={cy + (y - cy) * p} stroke={TONE_COLORS[toneAt(i)]} strokeWidth="3" opacity="0.5" />
            <rect x={x - 70} y={y - 34} width="140" height="68" rx="12" fill="rgba(2,6,23,0.54)" stroke={TONE_COLORS[toneAt(i)]} strokeOpacity="0.48" />
            <text x={x - 42} y={y + 7} fill={theme.textPrimary} fontSize="21" fontWeight="760">{shortText(label, 6)}</text>
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
            <text x={140 + i * 190} y={226 + i * 52} fill={theme.textPrimary} fontSize="22" fontWeight="780">{shortText(items[i] || `指标${i + 1}`, 8)}</text>
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
                <text x={side === 0 ? 126 : 446} y={230 + i * 76} fill={theme.textPrimary} fontSize="20" fontWeight="720">{shortText(label, 9)}</text>
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
            <text x={x - 43} y={y + 66} fill={theme.textPrimary} fontSize="20" fontWeight="720">{shortText(label, 6)}</text>
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
