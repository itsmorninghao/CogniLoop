import React from "react";
import type { ComparisonData, ThemeConfig } from "../types";
import { SlideLayout } from "../components/SlideLayout";
import { AnimatedText } from "../components/AnimatedText";
import { Divider } from "../components/Divider";

interface Props {
  slide: ComparisonData;
  theme: ThemeConfig;
  slideIndex: number;
  totalSlides: number;
  background3d?: React.ReactNode;
}

export const Comparison: React.FC<Props> = ({
  slide,
  theme,
  slideIndex,
  totalSlides,
  background3d,
}) => {
  const isDark = theme.name === "tech-dark";

  const columnStyle: React.CSSProperties = {
    flex: 1,
    background: theme.cardBg,
    border: `1px solid ${theme.cardBorder}`,
    borderRadius: 16,
    padding: "28px 32px",
    boxShadow: theme.cardShadow,
  };

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

      {/* Two columns */}
      <div style={{ display: "flex", gap: 32, marginTop: 16, flex: 1 }}>
        {/* Left column */}
        <AnimatedText delay={10} theme={theme.name} animation="slideLeft" style={{ flex: 1 }}>
          <div style={{ ...columnStyle, borderTop: `3px solid ${theme.primary}` }}>
            <h3
              style={{
                fontSize: 30,
                fontWeight: 600,
                color: theme.primary,
                margin: "0 0 20px 0",
              }}
            >
              {slide.left_label}
            </h3>
            {slide.left_items.map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  marginBottom: 14,
                }}
              >
                <span style={{ color: theme.primary, fontSize: 22, marginTop: 4 }}>●</span>
                <span style={{ fontSize: 24, color: theme.textPrimary, lineHeight: 1.5 }}>
                  {item}
                </span>
              </div>
            ))}
          </div>
        </AnimatedText>

        {/* VS divider */}
        <AnimatedText delay={14} theme={theme.name} animation="scaleIn">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              alignSelf: "center",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: isDark
                  ? "rgba(139, 92, 246, 0.15)"
                  : "rgba(99, 102, 241, 0.1)",
                border: `2px solid ${theme.accent}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                fontWeight: 700,
                color: theme.accent,
              }}
            >
              VS
            </div>
          </div>
        </AnimatedText>

        {/* Right column */}
        <AnimatedText delay={10} theme={theme.name} animation="slideRight" style={{ flex: 1 }}>
          <div style={{ ...columnStyle, borderTop: `3px solid ${theme.accent}` }}>
            <h3
              style={{
                fontSize: 30,
                fontWeight: 600,
                color: theme.accent,
                margin: "0 0 20px 0",
              }}
            >
              {slide.right_label}
            </h3>
            {slide.right_items.map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  marginBottom: 14,
                }}
              >
                <span style={{ color: theme.accent, fontSize: 22, marginTop: 4 }}>●</span>
                <span style={{ fontSize: 24, color: theme.textPrimary, lineHeight: 1.5 }}>
                  {item}
                </span>
              </div>
            ))}
          </div>
        </AnimatedText>
      </div>
    </SlideLayout>
  );
};
