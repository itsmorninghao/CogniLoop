import React from "react";
import type { ConceptExplainData, ThemeConfig } from "../types";
import { SlideLayout } from "../components/SlideLayout";
import { AnimatedText } from "../components/AnimatedText";
import { Divider } from "../components/Divider";

interface Props {
  slide: ConceptExplainData;
  theme: ThemeConfig;
  slideIndex: number;
  totalSlides: number;
  background3d?: React.ReactNode;
}

export const ConceptExplain: React.FC<Props> = ({
  slide,
  theme,
  slideIndex,
  totalSlides,
  background3d,
}) => {
  const isDark = theme.name === "tech-dark";

  return (
    <SlideLayout
      theme={theme}
      slideIndex={slideIndex}
      totalSlides={totalSlides}
      background3d={background3d}
    >
      {/* Heading */}
      <AnimatedText delay={0} theme={theme.name} animation="fadeUp">
        <h2 style={{ fontSize: 48, fontWeight: 600, color: theme.textPrimary, margin: 0 }}>
          {slide.heading}
        </h2>
      </AnimatedText>

      <Divider theme={theme} delay={4} />

      {/* Definition card */}
      <AnimatedText delay={8} theme={theme.name} animation="fadeUp">
        <div
          style={{
            background: theme.cardBg,
            border: `1px solid ${theme.cardBorder}`,
            borderRadius: 16,
            padding: "32px 36px",
            marginTop: 8,
            boxShadow: theme.cardShadow,
            borderLeft: `4px solid ${theme.primary}`,
          }}
        >
          <p
            style={{
              fontSize: 28,
              color: theme.textPrimary,
              lineHeight: 1.7,
              margin: 0,
            }}
          >
            {slide.definition}
          </p>
        </div>
      </AnimatedText>

      {/* Analogy highlight box */}
      {slide.analogy && (
        <AnimatedText delay={16} theme={theme.name} animation="fadeUp">
          <div
            style={{
              marginTop: 24,
              padding: "24px 32px",
              borderRadius: 12,
              background: isDark
                ? "rgba(139, 92, 246, 0.08)"
                : "rgba(139, 92, 246, 0.06)",
              border: `1px solid ${isDark ? "rgba(139, 92, 246, 0.2)" : "rgba(139, 92, 246, 0.15)"}`,
              display: "flex",
              alignItems: "flex-start",
              gap: 16,
            }}
          >
            <span style={{ fontSize: 28, flexShrink: 0 }}>💡</span>
            <p
              style={{
                fontSize: 26,
                color: theme.textSecondary,
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {slide.analogy}
            </p>
          </div>
        </AnimatedText>
      )}
    </SlideLayout>
  );
};
