import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import type { SlideData, ThemeName, AssetManifest } from "../types";
import { VIDEO_FPS, FADE_DURATION_FRAMES } from "../types";
import { getTheme } from "../themes";
import { setManifest } from "../animations/AssetLoader";
import { FadeTransition } from "../components/FadeTransition";

import { TitleSlide } from "../slides/TitleSlide";
import { BulletPoints } from "../slides/BulletPoints";
import { ConceptExplain } from "../slides/ConceptExplain";
import { Comparison } from "../slides/Comparison";
import { QuoteHighlight } from "../slides/QuoteHighlight";
import { Summary } from "../slides/Summary";
import { DiagramText } from "../slides/DiagramText";

import { AnimatedSlide } from "./AnimatedSlide";
import { CinematicSceneSlide } from "./CinematicSceneSlide";
import { RenderSceneSlide } from "./RenderSceneSlide";

import { get3dBackground } from "../three/backgrounds";

export interface SlideVideoProps {
  slides: SlideData[];
  theme: ThemeName;
  lottieCache?: Record<string, object>;
  manifest?: AssetManifest;
}

export function calculateTotalFrames(slides: SlideData[]): number {
  let total = 0;
  for (let i = 0; i < slides.length; i++) {
    const durationFrames = Math.ceil(
      (slides[i].duration_ms / 1000) * VIDEO_FPS
    );
    total += durationFrames;
  }
  return Math.max(1, total);
}

function renderSlide(
  slide: SlideData,
  themeConfig: ReturnType<typeof getTheme>,
  index: number,
  total: number,
  lottieCache: Record<string, object>,
): React.ReactNode {
  if (slide.render_scene) {
    if (slide.render_scene.version === "render_scene.v2" || slide.render_scene.visual_identity) {
      return (
        <CinematicSceneSlide
          slide={slide}
          scene={slide.render_scene}
          theme={themeConfig}
          slideIndex={index}
          totalSlides={total}
        />
      );
    }
    return (
      <RenderSceneSlide
        slide={slide}
        scene={slide.render_scene}
        theme={themeConfig}
        slideIndex={index}
        totalSlides={total}
      />
    );
  }

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
        const usesRenderScene = Boolean(slide.render_scene);
        const fadeFrames = isLast || usesRenderScene
          ? 0
          : Math.min(FADE_DURATION_FRAMES, Math.max(0, durationFrames - 1));

        const currentOffset = frameOffset;
        frameOffset += durationFrames;

        return (
          <Sequence
            key={i}
            from={currentOffset}
            durationInFrames={durationFrames}
          >
            {renderSlide(slide, themeConfig, i, totalSlides, lottieCache)}
            {fadeFrames > 0 && (
              <FadeTransition
                startFrame={durationFrames - fadeFrames}
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
