import React from "react";
import type { SummaryData, ThemeConfig } from "../types";
import { SlideLayout } from "../components/SlideLayout";
import { AnimatedText } from "../components/AnimatedText";
import { AnimatedList } from "../components/AnimatedList";
import { Divider } from "../components/Divider";

interface Props {
  slide: SummaryData;
  theme: ThemeConfig;
  slideIndex: number;
  totalSlides: number;
}

export const Summary: React.FC<Props> = ({
  slide,
  theme,
  slideIndex,
  totalSlides,
}) => {
  const isDark = theme.name === "tech-dark";

  return (
    <SlideLayout theme={theme} slideIndex={slideIndex} totalSlides={totalSlides}>
      {/* Heading with badge */}
      <AnimatedText delay={0} theme={theme.name} animation="fadeUp">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h2 style={{ fontSize: 48, fontWeight: 600, color: theme.textPrimary, margin: 0 }}>
            {slide.heading}
          </h2>
          <div
            style={{
              padding: "6px 16px",
              borderRadius: 16,
              fontSize: 18,
              fontWeight: 500,
              color: isDark ? theme.primaryLight : theme.primary,
              background: isDark
                ? "rgba(99, 102, 241, 0.15)"
                : "rgba(99, 102, 241, 0.1)",
            }}
          >
            Summary
          </div>
        </div>
      </AnimatedText>

      <Divider theme={theme} delay={4} />

      {/* Summary cards grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: slide.points.length <= 2 ? "1fr 1fr" : "1fr 1fr",
          gap: 24,
          marginTop: 16,
          flex: 1,
          alignContent: "start",
        }}
      >
        <AnimatedList
          items={slide.points}
          baseDelay={10}
          staggerDelay={6}
          theme={theme.name}
          renderItem={(item, i) => (
            <div
              style={{
                background: theme.cardBg,
                border: `1px solid ${theme.cardBorder}`,
                borderRadius: 16,
                padding: "24px 28px",
                boxShadow: theme.cardShadow,
                display: "flex",
                alignItems: "flex-start",
                gap: 16,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </div>
              <span
                style={{
                  fontSize: 24,
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
