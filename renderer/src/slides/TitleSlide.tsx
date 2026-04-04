import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import type { TitleSlideData, ThemeConfig } from "../types";
import { SlideLayout } from "../components/SlideLayout";
import { AnimatedText } from "../components/AnimatedText";

interface Props {
  slide: TitleSlideData;
  theme: ThemeConfig;
  slideIndex: number;
  totalSlides: number;
  background3d?: React.ReactNode;
}

export const TitleSlide: React.FC<Props> = ({
  slide,
  theme,
  slideIndex,
  totalSlides,
  background3d,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const isDark = theme.name === "tech-dark";

  // Title glow effect for tech-dark
  const glowIntensity = isDark
    ? interpolate(Math.sin(frame * 0.08), [-1, 1], [15, 30])
    : 0;

  return (
    <SlideLayout
      theme={theme}
      slideIndex={slideIndex}
      totalSlides={totalSlides}
      background3d={background3d}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          gap: 24,
        }}
      >
        {/* Badge */}
        {slide.badge && (
          <AnimatedText delay={0} theme={theme.name} animation="scaleIn">
            <div
              style={{
                display: "inline-block",
                padding: "8px 24px",
                borderRadius: 20,
                fontSize: 22,
                fontWeight: 500,
                color: theme.primary,
                background: isDark
                  ? "rgba(99, 102, 241, 0.15)"
                  : "rgba(99, 102, 241, 0.1)",
                border: `1px solid ${isDark ? "rgba(99, 102, 241, 0.3)" : "rgba(99, 102, 241, 0.2)"}`,
              }}
            >
              {slide.badge}
            </div>
          </AnimatedText>
        )}

        {/* Title */}
        <AnimatedText delay={4} theme={theme.name} animation="fadeUp">
          <h1
            style={{
              fontSize: 72,
              fontWeight: 600,
              lineHeight: 1.2,
              color: theme.textPrimary,
              textShadow: isDark
                ? `0 0 ${glowIntensity}px ${theme.accentGlow}`
                : "none",
              background: isDark
                ? `linear-gradient(135deg, ${theme.textPrimary}, ${theme.primaryLight})`
                : `linear-gradient(135deg, ${theme.primary}, ${theme.accent})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              margin: 0,
            }}
          >
            {slide.title}
          </h1>
        </AnimatedText>

        {/* Divider line */}
        <AnimatedText delay={10} theme={theme.name} animation="scaleIn">
          <div
            style={{
              width: 80,
              height: 3,
              background: theme.accentBarGradient,
              borderRadius: 2,
            }}
          />
        </AnimatedText>

        {/* Subtitle */}
        {slide.subtitle && (
          <AnimatedText delay={14} theme={theme.name} animation="fadeUp">
            <p
              style={{
                fontSize: 32,
                color: theme.textSecondary,
                margin: 0,
                fontWeight: 400,
              }}
            >
              {slide.subtitle}
            </p>
          </AnimatedText>
        )}
      </div>
    </SlideLayout>
  );
};
