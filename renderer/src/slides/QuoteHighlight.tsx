import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import type { QuoteHighlightData, ThemeConfig } from "../types";
import { SlideLayout } from "../components/SlideLayout";
import { AnimatedText } from "../components/AnimatedText";

interface Props {
  slide: QuoteHighlightData;
  theme: ThemeConfig;
  slideIndex: number;
  totalSlides: number;
  background3d?: React.ReactNode;
}

export const QuoteHighlight: React.FC<Props> = ({
  slide,
  theme,
  slideIndex,
  totalSlides,
  background3d,
}) => {
  const frame = useCurrentFrame();
  const isDark = theme.name === "tech-dark";

  // Subtle floating effect for the quote card
  const floatY = interpolate(Math.sin(frame * 0.05), [-1, 1], [-4, 4]);

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
        }}
      >
        {/* Quote card */}
        <AnimatedText delay={4} theme={theme.name} animation="scaleIn">
          <div
            style={{
              maxWidth: 1400,
              background: theme.cardBg,
              border: `1px solid ${theme.cardBorder}`,
              borderRadius: 20,
              padding: "48px 56px",
              boxShadow: isDark
                ? `0 8px 40px rgba(0,0,0,0.4), 0 0 30px ${theme.accentGlow}`
                : theme.cardShadow,
              transform: `translateY(${floatY}px)`,
              position: "relative",
            }}
          >
            {/* Large quote mark */}
            <div
              style={{
                position: "absolute",
                top: -20,
                left: 30,
                fontSize: 120,
                lineHeight: 1,
                color: isDark ? theme.primaryLight : theme.primary,
                opacity: 0.2,
                fontFamily: "Georgia, serif",
              }}
            >
              &ldquo;
            </div>

            <p
              style={{
                fontSize: 34,
                color: theme.textPrimary,
                lineHeight: 1.7,
                margin: 0,
                fontStyle: "italic",
                position: "relative",
                zIndex: 1,
              }}
            >
              {slide.quote}
            </p>
          </div>
        </AnimatedText>

        {/* Emphasis text */}
        {slide.emphasis && (
          <AnimatedText delay={14} theme={theme.name} animation="fadeIn">
            <p
              style={{
                marginTop: 32,
                fontSize: 26,
                color: theme.accent,
                fontWeight: 500,
              }}
            >
              {slide.emphasis}
            </p>
          </AnimatedText>
        )}
      </div>
    </SlideLayout>
  );
};
