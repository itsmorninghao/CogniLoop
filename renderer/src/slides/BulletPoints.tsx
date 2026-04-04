import React from "react";
import type { BulletPointsData, ThemeConfig } from "../types";
import { SlideLayout } from "../components/SlideLayout";
import { AnimatedText } from "../components/AnimatedText";
import { AnimatedList } from "../components/AnimatedList";
import { Divider } from "../components/Divider";

interface Props {
  slide: BulletPointsData;
  theme: ThemeConfig;
  slideIndex: number;
  totalSlides: number;
}

export const BulletPoints: React.FC<Props> = ({
  slide,
  theme,
  slideIndex,
  totalSlides,
}) => {
  const isDark = theme.name === "tech-dark";

  return (
    <SlideLayout theme={theme} slideIndex={slideIndex} totalSlides={totalSlides}>
      {/* Heading */}
      <AnimatedText delay={0} theme={theme.name} animation="fadeUp">
        <h2
          style={{
            fontSize: 48,
            fontWeight: 600,
            color: theme.textPrimary,
            margin: 0,
          }}
        >
          {slide.heading}
        </h2>
      </AnimatedText>

      <Divider theme={theme} delay={4} />

      {/* Bullet list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 16 }}>
        <AnimatedList
          items={slide.points}
          baseDelay={10}
          staggerDelay={6}
          theme={theme.name}
          renderItem={(item, i) => (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 20,
                padding: "18px 24px",
                borderRadius: 12,
                background: isDark
                  ? "rgba(255, 255, 255, 0.03)"
                  : "rgba(99, 102, 241, 0.04)",
                border: `1px solid ${theme.cardBorder}`,
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: theme.primary,
                  marginTop: 10,
                  flexShrink: 0,
                  boxShadow: isDark ? `0 0 8px ${theme.accentGlow}` : "none",
                }}
              />
              <span
                style={{
                  fontSize: 28,
                  color: theme.textPrimary,
                  lineHeight: 1.5,
                }}
              >
                {item}
              </span>
            </div>
          )}
        />
      </div>
    </SlideLayout>
  );
};
