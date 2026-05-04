import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  selectComposition,
  type FfmpegOverrideFn,
  type OpenGlRenderer,
} from "@remotion/renderer";
import type { RenderRequest, SlideData, AssetManifest } from "./types.js";
import { VIDEO_FPS, VIDEO_WIDTH, VIDEO_HEIGHT } from "./types.js";
import { countSceneAssets, enrichSlidesWithVisualAssets } from "./visualAssets.js";

const OUTPUT_DIR = "/tmp/renderer_output";
const VALID_GL_RENDERERS: ReadonlySet<OpenGlRenderer> = new Set([
  "swangle",
  "angle",
  "egl",
  "swiftshader",
  "vulkan",
  "angle-egl",
]);
const VALID_X264_PRESETS = new Set([
  "ultrafast",
  "superfast",
  "veryfast",
  "faster",
  "fast",
  "medium",
  "slow",
  "slower",
  "veryslow",
  "placebo",
] as const);
type X264Preset = (typeof VALID_X264_PRESETS extends ReadonlySet<infer T> ? T : never);
const REMOTION_NVENC_BINARIES_DIR = "/opt/remotion-nvenc-bin";

let bundlePath: string | null = null;
let assetManifest: AssetManifest | null = null;
let publicAssetsDir: string | null = null;

function calculateTotalFrames(slides: SlideData[]): number {
  let total = 0;
  for (let i = 0; i < slides.length; i++) {
    const durationFrames = Math.ceil((slides[i].duration_ms / 1000) * VIDEO_FPS);
    total += durationFrames;
  }
  return Math.max(1, total);
}

function loadManifest(dir: string): AssetManifest | null {
  const manifestPath = path.join(dir, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    try {
      return JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    } catch (e) {
      console.warn(`Failed to parse manifest at ${manifestPath}:`, e);
    }
  }
  return null;
}

export async function initBundle(): Promise<void> {
  const prebuiltBundle = path.resolve("/app/bundle");
  if (fs.existsSync(prebuiltBundle)) {
    bundlePath = prebuiltBundle;
    console.log(`Using pre-built bundle at ${prebuiltBundle}`);
    publicAssetsDir = path.resolve("/app/public/assets");
    assetManifest = loadManifest(publicAssetsDir);
    if (assetManifest) {
      console.log(`Loaded asset manifest: ${Object.keys(assetManifest.assets).length} assets`);
    }
    return;
  }

  const entryPoint = path.resolve(__dirname, "../src/index.tsx");
  console.log("Bundling Remotion compositions...");
  bundlePath = await bundle({
    entryPoint,
    onProgress: (pct) => {
      if (pct % 25 === 0) console.log(`Bundle progress: ${pct}%`);
    },
  });
  console.log(`Bundle ready at ${bundlePath}`);

  publicAssetsDir = path.resolve(__dirname, "../public/assets");
  assetManifest = loadManifest(publicAssetsDir);
  if (assetManifest) {
    console.log(`Loaded asset manifest: ${Object.keys(assetManifest.assets).length} assets`);
  }
}

function collectLottieAssetIds(slides: SlideData[]): Set<string> {
  const ids = new Set<string>();
  for (const slide of slides) {
    if (!slide.visual_events) continue;
    for (const event of slide.visual_events) {
      if (event.type === "lottie" && event.assetId) {
        ids.add(event.assetId);
      }
      if (event.type === "icon-grid" && event.icons) {
        for (const icon of event.icons) {
          if (icon.assetId) ids.add(icon.assetId);
        }
      }
    }
  }
  return ids;
}

function buildLottieCache(assetIds: Set<string>): Record<string, object> {
  const cache: Record<string, object> = {};
  if (!assetManifest || !publicAssetsDir) return cache;

  for (const id of assetIds) {
    const meta = assetManifest.assets[id];
    if (!meta) {
      console.warn(`Asset not found in manifest: ${id}`);
      continue;
    }
    const filePath = path.join(publicAssetsDir, meta.path);
    try {
      if (fs.existsSync(filePath)) {
        cache[id] = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      } else {
        console.warn(`Asset file missing: ${filePath}`);
      }
    } catch (e) {
      console.warn(`Failed to load asset ${id} from ${filePath}:`, e);
    }
  }
  console.log(`Loaded ${Object.keys(cache).length}/${assetIds.size} Lottie assets`);
  return cache;
}

function getChromiumGlRenderer(): OpenGlRenderer {
  const configured = process.env.REMOTION_GL?.trim();
  if (!configured) {
    return "swangle";
  }
  if (VALID_GL_RENDERERS.has(configured as OpenGlRenderer)) {
    return configured as OpenGlRenderer;
  }
  console.warn(
    `Invalid REMOTION_GL="${configured}", falling back to swangle. ` +
      `Allowed values: ${Array.from(VALID_GL_RENDERERS).join(", ")}`
  );
  return "swangle";
}

function getRenderConcurrency(cpuCount: number): number {
  const configured = process.env.REMOTION_CONCURRENCY?.trim();
  if (configured) {
    const parsed = Number.parseInt(configured, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    console.warn(`Invalid REMOTION_CONCURRENCY="${configured}", using automatic concurrency.`);
  }
  return Math.max(2, Math.min(8, Math.floor(cpuCount / 2)));
}

function getX264Preset(): X264Preset | undefined {
  const configured = process.env.REMOTION_X264_PRESET?.trim();
  if (!configured) {
    return undefined;
  }
  if (VALID_X264_PRESETS.has(configured as X264Preset)) {
    return configured as X264Preset;
  }
  console.warn(
    `Invalid REMOTION_X264_PRESET="${configured}", ignoring. ` +
      `Allowed values: ${Array.from(VALID_X264_PRESETS).join(", ")}`
  );
  return undefined;
}

function replaceArgPair(args: string[], flag: string, replacement: string[]): string[] {
  const next: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) {
      next.push(...replacement);
      i++;
      continue;
    }
    next.push(args[i]);
  }
  return next;
}

function removeArgPair(args: string[], flag: string): string[] {
  const next: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) {
      i++;
      continue;
    }
    next.push(args[i]);
  }
  return next;
}

function getNvencOverride(): FfmpegOverrideFn {
  const preset = process.env.REMOTION_NVENC_PRESET?.trim() || "p4";
  const cq = process.env.REMOTION_NVENC_CQ?.trim() || "21";

  return ({ args }) => {
    let next = replaceArgPair(args, "-c:v", [
      "-c:v",
      "h264_nvenc",
      "-preset",
      preset,
      "-rc",
      "vbr",
      "-cq",
      cq,
      "-b:v",
      "0",
    ]);
    next = removeArgPair(next, "-crf");
    next = replaceArgPair(next, "-c:a", ["-c:a", "aac"]);
    return next;
  };
}

function getEncodingOptions(): {
  label: string;
  crf: number | null;
  x264Preset?: X264Preset;
  ffmpegOverride?: FfmpegOverrideFn;
  binariesDirectory?: string;
} {
  const encoder = process.env.REMOTION_ENCODER?.trim().toLowerCase() || "libx264";
  if (encoder === "h264_nvenc" || encoder === "nvenc") {
    const binariesDirectory =
      process.env.REMOTION_BINARIES_DIR?.trim() || REMOTION_NVENC_BINARIES_DIR;
    if (!fs.existsSync(path.join(binariesDirectory, "ffmpeg"))) {
      throw new Error(
        `REMOTION_ENCODER=${encoder} requires ffmpeg at ${binariesDirectory}/ffmpeg`
      );
    }
    return {
      label: `h264_nvenc(cq=${process.env.REMOTION_NVENC_CQ?.trim() || "21"},preset=${
        process.env.REMOTION_NVENC_PRESET?.trim() || "p4"
      })`,
      crf: null,
      ffmpegOverride: getNvencOverride(),
      binariesDirectory,
    };
  }

  if (encoder !== "libx264" && encoder !== "cpu") {
    console.warn(`Invalid REMOTION_ENCODER="${encoder}", falling back to libx264.`);
  }
  const x264Preset = getX264Preset();
  return {
    label: x264Preset ? `libx264(preset=${x264Preset},crf=18)` : "libx264(crf=18)",
    crf: 18,
    x264Preset,
  };
}

export async function renderSlideVideo(
  req: RenderRequest,
  onProgress?: (pct: number) => void
): Promise<string> {
  if (!bundlePath) {
    throw new Error("Bundle not initialized. Call initBundle() first.");
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const slides = enrichSlidesWithVisualAssets(req.script_json.slides);
  const totalFrames = calculateTotalFrames(slides);
  const theme = req.theme || "tech-dark";
  const outputPath = path.join(OUTPUT_DIR, `${req.task_id}.mp4`);
  const glRenderer = getChromiumGlRenderer();
  const encoding = getEncodingOptions();

  const lottieAssetIds = collectLottieAssetIds(slides);
  const lottieCache = buildLottieCache(lottieAssetIds);
  const manifest = assetManifest ?? { version: 1, assets: {} };

  const inputProps = { slides, theme, lottieCache, manifest };
  const sceneAssetCount = countSceneAssets(slides);

  const composition = await selectComposition({
    serveUrl: bundlePath,
    id: "SlideVideo",
    inputProps,
  });

  const cpuCount = os.cpus().length;
  const concurrency = getRenderConcurrency(cpuCount);

  console.log(
    `Rendering task ${req.task_id}: ${slides.length} slides, ${totalFrames} frames, ` +
    `theme=${theme}, sceneAssets=${sceneAssetCount}, concurrency=${concurrency}, ` +
    `gl=${glRenderer}, encoder=${encoding.label}`
  );

  const startTime = Date.now();

  await renderMedia({
    composition: {
      ...composition,
      width: VIDEO_WIDTH,
      height: VIDEO_HEIGHT,
      fps: VIDEO_FPS,
      durationInFrames: totalFrames,
    },
    serveUrl: bundlePath,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
    concurrency,
    crf: encoding.crf,
    x264Preset: encoding.x264Preset,
    ffmpegOverride: encoding.ffmpegOverride,
    binariesDirectory: encoding.binariesDirectory,
    pixelFormat: "yuv420p",
    onProgress: ({ progress }) => {
      const pct = Math.round(progress * 100);
      onProgress?.(pct);
    },
    chromiumOptions: {
      gl: glRenderer,
    },
  });

  const durationMs = Date.now() - startTime;
  const fps = totalFrames / (durationMs / 1000);
  console.log(
    `Render complete: ${outputPath} (${totalFrames} frames in ${(durationMs / 1000).toFixed(1)}s, ` +
    `${fps.toFixed(1)} effective fps)`
  );

  return outputPath;
}

export function cleanupOutput(videoPath: string): void {
  try {
    if (fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
  } catch (e) {
    console.warn(`Failed to cleanup ${videoPath}:`, e);
  }
}
