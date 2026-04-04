/**
 * AnimatedSlide — Renders a slide driven by visual_events timeline.
 *
 * Each VisualEvent becomes a positioned element that appears at its `at` time.
 * Elements persist until cleared by a ClearEvent or the slide ends.
 */
import React, { useMemo } from "react";
import { Sequence, useVideoConfig } from "remotion";
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
