import { registerRoot } from "remotion";
import { Composition } from "remotion";
import React from "react";
import { SlideVideo, calculateTotalFrames } from "./compositions/SlideVideo";
import type { SlideVideoProps } from "./compositions/SlideVideo";
import { VIDEO_FPS, VIDEO_WIDTH, VIDEO_HEIGHT } from "./types";

const sampleSlides = [
  {
    template: "TITLE_SLIDE" as const,
    title: "Sample Course",
    subtitle: "Preview Mode",
    duration_ms: 4000,
  },
  {
    template: "BULLET_POINTS" as const,
    heading: "Key Points",
    points: ["First point", "Second point", "Third point"],
    duration_ms: 5000,
  },
];

const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="SlideVideo"
        component={SlideVideo}
        durationInFrames={calculateTotalFrames(sampleSlides)}
        fps={VIDEO_FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        defaultProps={{
          slides: sampleSlides,
          theme: "tech-dark" as const,
          lottieCache: {},
          manifest: { version: 1, assets: {} },
        }}
        calculateMetadata={async ({ props }) => {
          return {
            durationInFrames: calculateTotalFrames(
              (props as SlideVideoProps).slides
            ),
            fps: VIDEO_FPS,
            width: VIDEO_WIDTH,
            height: VIDEO_HEIGHT,
          };
        }}
      />
    </>
  );
};

registerRoot(Root);
