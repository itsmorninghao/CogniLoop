import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import type { TextAnimation, TextStyle, ThemeConfig } from "../types";

interface Props {
  text: string;
  animation: TextAnimation;
  startFrame: number;
  durationFrames?: number;
  style?: TextStyle;
  fontSize?: number;
  color?: string;
  theme: ThemeConfig;
}

const STYLE_DEFAULTS: Record<TextStyle, { fontSize: number; fontWeight: number; lineHeight: number }> = {
  heading: { fontSize: 64, fontWeight: 700, lineHeight: 1.2 },
  subheading: { fontSize: 44, fontWeight: 600, lineHeight: 1.3 },
  body: { fontSize: 32, fontWeight: 400, lineHeight: 1.5 },
  caption: { fontSize: 24, fontWeight: 400, lineHeight: 1.4 },
  label: { fontSize: 28, fontWeight: 600, lineHeight: 1.3 },
  emphasis: { fontSize: 36, fontWeight: 700, lineHeight: 1.4 },
  stat: { fontSize: 80, fontWeight: 800, lineHeight: 1.1 },
};

export const KineticText: React.FC<Props> = ({
  text,
  animation,
  startFrame,
  durationFrames,
  style = "body",
  fontSize: fontSizeOverride,
  color,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = frame - startFrame;
  const defaults = STYLE_DEFAULTS[style];
  const fs = fontSizeOverride ?? defaults.fontSize;
  const textColor = color ?? theme.textPrimary;
  const dur = durationFrames ?? Math.max(30, Math.ceil(text.length * 1.5));
  const shouldShadow = theme.name === "tech-dark" && (
    style === "heading" || style === "subheading" || style === "emphasis" || style === "stat"
  );

  if (localFrame < 0) return null;

  const baseStyle: React.CSSProperties = {
    fontSize: fs,
    fontWeight: defaults.fontWeight,
    lineHeight: defaults.lineHeight,
    color: textColor,
    fontFamily: "'Noto Sans SC', 'Inter', sans-serif",
    letterSpacing: 0,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    textShadow: shouldShadow ? "0 2px 18px rgba(0, 0, 0, 0.52)" : "none",
    textRendering: "geometricPrecision",
  };

  switch (animation) {
    case "typewriter":
      return <Typewriter text={text} frame={localFrame} dur={dur} style={baseStyle} theme={theme} />;
    case "word-reveal":
      return <WordReveal text={text} frame={localFrame} dur={dur} style={baseStyle} fps={fps} />;
    case "highlight":
      return <Highlight text={text} frame={localFrame} dur={dur} style={baseStyle} theme={theme} />;
    case "glow-pulse":
      return <GlowPulse text={text} frame={localFrame} style={baseStyle} theme={theme} />;
    case "underline-draw":
      return <UnderlineDraw text={text} frame={localFrame} dur={dur} style={baseStyle} theme={theme} />;
    case "fade-up":
      return <FadeUp text={text} frame={localFrame} style={baseStyle} fps={fps} />;
    case "scale-in":
      return <ScaleIn text={text} frame={localFrame} style={baseStyle} fps={fps} />;
    default:
      return <span style={baseStyle}>{text}</span>;
  }
};

const Typewriter: React.FC<{
  text: string; frame: number; dur: number;
  style: React.CSSProperties; theme: ThemeConfig;
}> = ({ text, frame, dur, style, theme }) => {
  const charsToShow = Math.floor(
    interpolate(frame, [0, dur], [0, text.length], { extrapolateRight: "clamp" })
  );
  const showCursor = frame < dur + 12;
  const cursorOpacity = showCursor ? (Math.floor(frame / 6) % 2 === 0 ? 1 : 0) : 0;

  return (
    <span style={style}>
      {text.slice(0, charsToShow)}
      <span style={{
        display: "inline-block",
        width: 3,
        height: "0.9em",
        backgroundColor: theme.primary,
        marginLeft: 2,
        opacity: cursorOpacity,
        verticalAlign: "text-bottom",
      }} />
    </span>
  );
};

const WordReveal: React.FC<{
  text: string; frame: number; dur: number;
  style: React.CSSProperties; fps: number;
}> = ({ text, frame, dur, style, fps }) => {
  const units = getRevealUnits(text);
  if (units.length === 0) {
    return <span style={style}>{text}</span>;
  }
  const staggerDelay = Math.max(1, Math.floor(dur / units.length));

  return (
    <span style={style}>
      {units.map((unit, i) => {
        const wordStart = i * staggerDelay;
        const opacity = interpolate(frame, [wordStart, wordStart + 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const translateY = spring({
          frame: Math.max(0, frame - wordStart),
          fps,
          config: { damping: 14, stiffness: 150 },
        });
        const y = interpolate(translateY, [0, 1], [15, 0]);

        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity,
              transform: `translateY(${y}px)`,
              marginRight: unit.compact ? 0 : "0.3em",
            }}
          >
            {unit.text}
            {unit.suffix}
          </span>
        );
      })}
    </span>
  );
};

function getRevealUnits(text: string): { text: string; suffix: string; compact: boolean }[] {
  const units: { text: string; suffix: string; compact: boolean }[] = [];
  const cjk = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/;
  const punctuation = /[，。；：、！？,.!?]/;
  let buffer = "";
  let cjkBuffer = "";

  const flushWord = () => {
    if (buffer) {
      units.push({ text: buffer, suffix: "", compact: false });
      buffer = "";
    }
  };
  const flushCjk = () => {
    if (cjkBuffer) {
      units.push({ text: cjkBuffer, suffix: "", compact: true });
      cjkBuffer = "";
    }
  };

  for (const ch of Array.from(text)) {
    if (/\s/.test(ch)) {
      flushWord();
      flushCjk();
      if (units.length > 0) {
        units[units.length - 1].suffix += ch;
      }
      continue;
    }

    if (cjk.test(ch)) {
      flushWord();
      cjkBuffer += ch;
      if (cjkBuffer.length >= 2) {
        flushCjk();
      }
      continue;
    }

    if (punctuation.test(ch) && cjkBuffer) {
      cjkBuffer += ch;
      flushCjk();
      continue;
    }

    flushCjk();
    buffer += ch;
  }

  flushWord();
  flushCjk();
  return units;
}

const Highlight: React.FC<{
  text: string; frame: number; dur: number;
  style: React.CSSProperties; theme: ThemeConfig;
}> = ({ text, frame, dur, style, theme }) => {
  const highlightWidth = interpolate(frame, [6, dur * 0.6], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const textOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });

  return (
    <span style={{ ...style, position: "relative", opacity: textOpacity }}>
      <span
        style={{
          position: "absolute",
          left: 0, bottom: 0,
          width: `${highlightWidth}%`,
          height: "35%",
          backgroundColor: theme.primary,
          opacity: 0.2,
          borderRadius: 4,
          zIndex: -1,
        }}
      />
      {text}
    </span>
  );
};

const GlowPulse: React.FC<{
  text: string; frame: number;
  style: React.CSSProperties; theme: ThemeConfig;
}> = ({ text, frame, style, theme }) => {
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const glowIntensity = interpolate(
    Math.sin(frame * 0.15),
    [-1, 1],
    [8, 25]
  );

  return (
    <span
      style={{
        ...style,
        opacity,
        textShadow: `0 0 ${glowIntensity}px ${theme.primary}, 0 0 ${glowIntensity * 2}px ${theme.accentGlow}`,
      }}
    >
      {text}
    </span>
  );
};

const UnderlineDraw: React.FC<{
  text: string; frame: number; dur: number;
  style: React.CSSProperties; theme: ThemeConfig;
}> = ({ text, frame, dur, style, theme }) => {
  const textOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const underlineWidth = interpolate(frame, [8, dur * 0.5], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <span style={{ ...style, position: "relative", display: "inline-block", opacity: textOpacity }}>
      {text}
      <span
        style={{
          position: "absolute",
          left: 0,
          bottom: -4,
          width: `${underlineWidth}%`,
          height: 4,
          borderRadius: 2,
          background: `linear-gradient(90deg, ${theme.primary}, ${theme.accent})`,
        }}
      />
    </span>
  );
};

const FadeUp: React.FC<{
  text: string; frame: number;
  style: React.CSSProperties; fps: number;
}> = ({ text, frame, style, fps }) => {
  const progress = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const translateY = interpolate(progress, [0, 1], [40, 0]);

  return (
    <span style={{ ...style, opacity, transform: `translateY(${translateY}px)`, display: "inline-block" }}>
      {text}
    </span>
  );
};

const ScaleIn: React.FC<{
  text: string; frame: number;
  style: React.CSSProperties; fps: number;
}> = ({ text, frame, style, fps }) => {
  const progress = spring({ frame, fps, config: { damping: 12, stiffness: 200, mass: 0.8 } });
  const scale = interpolate(progress, [0, 1], [0.3, 1]);
  const opacity = interpolate(progress, [0, 0.5], [0, 1], { extrapolateRight: "clamp" });

  return (
    <span style={{
      ...style,
      opacity,
      transform: `scale(${scale})`,
      display: "inline-block",
      transformOrigin: "center",
    }}>
      {text}
    </span>
  );
};
