/**
 * LottieElement — Positioned Lottie animation player for Remotion.
 * Loads from bundled assets via AssetLoader.
 */
import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { Lottie, getLottieMetadata } from "@remotion/lottie";
import { getAssetUrl, getAssetMeta } from "./AssetLoader";
import type { ThemeConfig } from "../types";

interface Props {
  assetId: string;
  startFrame: number;
  durationFrames?: number;
  loop?: boolean;
  playbackRate?: number;
  width?: number;
  height?: number;
  theme: ThemeConfig;
  /** Pre-fetched animation data (avoids async load in render) */
  animationData?: object;
}

export const LottieElement: React.FC<Props> = ({
  assetId,
  startFrame,
  durationFrames,
  loop = true,
  playbackRate = 1,
  width,
  height,
  theme,
  animationData,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = frame - startFrame;
  const meta = getAssetMeta(assetId);

  const w = width ?? meta?.defaultSize.w ?? 200;
  const h = height ?? meta?.defaultSize.h ?? 200;

  if (localFrame < 0) return null;
  if (!animationData) {
    // Fallback: show a placeholder
    return (
      <div style={{
        width: w, height: h,
        borderRadius: 12,
        backgroundColor: theme.cardBg,
        border: `2px dashed ${theme.primary}40`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        color: theme.textMuted,
      }}>
        {assetId}
      </div>
    );
  }

  // Entrance animation
  const entranceProgress = spring({
    frame: localFrame,
    fps,
    config: { damping: 14, stiffness: 120 },
  });
  const opacity = interpolate(entranceProgress, [0, 1], [0, 1]);
  const scale = interpolate(entranceProgress, [0, 1], [0.7, 1]);

  return (
    <div style={{
      width: w,
      height: h,
      opacity,
      transform: `scale(${scale})`,
    }}>
      <Lottie
        animationData={animationData}
        playbackRate={playbackRate}
        loop={loop}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
};
