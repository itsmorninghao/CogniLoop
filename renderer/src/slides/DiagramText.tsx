import React from "react";
import type { DiagramTextData, ThemeConfig } from "../types";
import { SlideLayout } from "../components/SlideLayout";
import { AnimatedText } from "../components/AnimatedText";
import { Divider } from "../components/Divider";

interface Props {
  slide: DiagramTextData;
  theme: ThemeConfig;
  slideIndex: number;
  totalSlides: number;
}

export const DiagramText: React.FC<Props> = ({
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
        <h2 style={{ fontSize: 48, fontWeight: 600, color: theme.textPrimary, margin: 0 }}>
          {slide.heading}
        </h2>
      </AnimatedText>

      <Divider theme={theme} delay={4} />

      {/* Description card */}
      <AnimatedText delay={8} theme={theme.name} animation="fadeUp">
        <div
          style={{
            background: theme.cardBg,
            border: `1px solid ${theme.cardBorder}`,
            borderRadius: 16,
            padding: "36px 40px",
            boxShadow: theme.cardShadow,
            marginTop: 8,
          }}
        >
          <p
            style={{
              fontSize: 28,
              color: theme.textPrimary,
              lineHeight: 1.8,
              margin: 0,
              whiteSpace: "pre-line",
            }}
          >
            {slide.description}
          </p>
        </div>
      </AnimatedText>
    </SlideLayout>
  );
};
