import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import type { SlideData, ThemeName, AssetManifest } from "../types";
import { VIDEO_FPS, FADE_DURATION_FRAMES } from "../types";
import { getTheme } from "../themes";
import { setManifest } from "../animations/AssetLoader";
import { FadeTransition } from "../components/FadeTransition";

// V1: Static slide components
import { TitleSlide } from "../slides/TitleSlide";
import { BulletPoints } from "../slides/BulletPoints";
import { ConceptExplain } from "../slides/ConceptExplain";
import { Comparison } from "../slides/Comparison";
import { QuoteHighlight } from "../slides/QuoteHighlight";
import { Summary } from "../slides/Summary";
import { DiagramText } from "../slides/DiagramText";

// V2: Animated slide composition
import { AnimatedSlide } from "./AnimatedSlide";

// 3D backgrounds (disabled — WebGL not available in Docker)
import { get3dBackground } from "../three/backgrounds";

export interface SlideVideoProps {
  slides: SlideData[];
  theme: ThemeName;
  lottieCache?: Record<string, object>;
  manifest?: AssetManifest;
}

/** Calculate total duration in frames for a list of slides */
export function calculateTotalFrames(slides: SlideData[]): number {
  let total = 0;
  for (let i = 0; i < slides.length; i++) {
    const durationFrames = Math.ceil(
      (slides[i].duration_ms / 1000) * VIDEO_FPS
    );
    const fadeFrames = i < slides.length - 1 ? FADE_DURATION_FRAMES : 0;
    total += durationFrames + fadeFrames;
  }
  return Math.max(1, total);
}

/** Route a slide to its component */
function renderSlide(
  slide: SlideData,
  themeConfig: ReturnType<typeof getTheme>,
  index: number,
  total: number,
  lottieCache: Record<string, object>,
): React.ReactNode {
  // V2 path: If slide has visual_events, use AnimatedSlide
  if (slide.visual_events && slide.visual_events.length > 0) {
    return (
      <AnimatedSlide
        slide={slide}
        theme={themeConfig}
        slideIndex={index}
        totalSlides={total}
        lottieCache={lottieCache}
      />
    );
  }

  // V1 path: Static template rendering
  const bg3d = get3dBackground(slide.template, themeConfig);

  switch (slide.template) {
    case "TITLE_SLIDE":
      return (
        <TitleSlide
          slide={slide}
          theme={themeConfig}
          slideIndex={index}
          totalSlides={total}
          background3d={bg3d}
        />
      );
    case "BULLET_POINTS":
      return (
        <BulletPoints
          slide={slide}
          theme={themeConfig}
          slideIndex={index}
          totalSlides={total}
        />
      );
    case "CONCEPT_EXPLAIN":
      return (
        <ConceptExplain
          slide={slide}
          theme={themeConfig}
          slideIndex={index}
          totalSlides={total}
          background3d={bg3d}
        />
      );
    case "COMPARISON":
      return (
        <Comparison
          slide={slide}
          theme={themeConfig}
          slideIndex={index}
          totalSlides={total}
          background3d={bg3d}
        />
      );
    case "QUOTE_HIGHLIGHT":
      return (
        <QuoteHighlight
          slide={slide}
          theme={themeConfig}
          slideIndex={index}
          totalSlides={total}
          background3d={bg3d}
        />
      );
    case "SUMMARY":
      return (
        <Summary
          slide={slide}
          theme={themeConfig}
          slideIndex={index}
          totalSlides={total}
        />
      );
    case "DIAGRAM_TEXT":
      return (
        <DiagramText
          slide={slide}
          theme={themeConfig}
          slideIndex={index}
          totalSlides={total}
        />
      );
    default:
      return (
        <BulletPoints
          slide={slide as any}
          theme={themeConfig}
          slideIndex={index}
          totalSlides={total}
        />
      );
  }
}

export const SlideVideo: React.FC<SlideVideoProps> = ({ slides, theme, lottieCache = {}, manifest }) => {
  const themeConfig = getTheme(theme);
  const totalSlides = slides.length;

  // Initialize asset manifest in browser context so getAssetMeta() works
  if (manifest) {
    setManifest(manifest);
  }

  let frameOffset = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: themeConfig.bg }}>
      {slides.map((slide, i) => {
        const durationFrames = Math.ceil(
          (slide.duration_ms / 1000) * VIDEO_FPS
        );
        const isLast = i === totalSlides - 1;
        const fadeFrames = isLast ? 0 : FADE_DURATION_FRAMES;
        const totalSequenceFrames = durationFrames + fadeFrames;

        const currentOffset = frameOffset;
        frameOffset += totalSequenceFrames;

        return (
          <Sequence
            key={i}
            from={currentOffset}
            durationInFrames={totalSequenceFrames}
          >
            {renderSlide(slide, themeConfig, i, totalSlides, lottieCache)}
            {fadeFrames > 0 && (
              <FadeTransition
                startFrame={durationFrames}
                duration={fadeFrames}
                color={themeConfig.bg}
              />
            )}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
