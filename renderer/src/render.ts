import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { RenderRequest, SlideData, AssetManifest } from "./types.js";
import { VIDEO_FPS, VIDEO_WIDTH, VIDEO_HEIGHT, FADE_DURATION_FRAMES } from "./types.js";

const OUTPUT_DIR = "/tmp/renderer_output";

let bundlePath: string | null = null;
let assetManifest: AssetManifest | null = null;
/** Directory where public/ assets live (for reading Lottie JSON at render time) */
let publicAssetsDir: string | null = null;

/** Calculate total frames for a list of slides */
function calculateTotalFrames(slides: SlideData[]): number {
  let total = 0;
  for (let i = 0; i < slides.length; i++) {
    const durationFrames = Math.ceil((slides[i].duration_ms / 1000) * VIDEO_FPS);
    const fadeFrames = i < slides.length - 1 ? FADE_DURATION_FRAMES : 0;
    total += durationFrames + fadeFrames;
  }
  return Math.max(1, total);
}

/** Load the asset manifest from a directory */
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

/** Initialize the Remotion bundle (called once on startup) */
export async function initBundle(): Promise<void> {
  // Check if pre-built bundle exists (Docker build)
  const prebuiltBundle = path.resolve("/app/bundle");
  if (fs.existsSync(prebuiltBundle)) {
    bundlePath = prebuiltBundle;
    console.log(`Using pre-built bundle at ${prebuiltBundle}`);
    // In Docker, public/ assets are at /app/public/assets/
    publicAssetsDir = path.resolve("/app/public/assets");
    assetManifest = loadManifest(publicAssetsDir);
    if (assetManifest) {
      console.log(`Loaded asset manifest: ${Object.keys(assetManifest.assets).length} assets`);
    }
    return;
  }

  // Development: bundle on the fly
  const entryPoint = path.resolve(__dirname, "../src/index.tsx");
  console.log("Bundling Remotion compositions...");
  bundlePath = await bundle({
    entryPoint,
    onProgress: (pct) => {
      if (pct % 25 === 0) console.log(`Bundle progress: ${pct}%`);
    },
  });
  console.log(`Bundle ready at ${bundlePath}`);

  // Development: assets in public/assets/
  publicAssetsDir = path.resolve(__dirname, "../public/assets");
  assetManifest = loadManifest(publicAssetsDir);
  if (assetManifest) {
    console.log(`Loaded asset manifest: ${Object.keys(assetManifest.assets).length} assets`);
  }
}

/** Collect all unique Lottie asset IDs referenced in slides */
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

/** Build lottieCache by reading JSON files for referenced assets */
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

/** Render a slide video to MP4 */
export async function renderSlideVideo(
  req: RenderRequest,
  onProgress?: (pct: number) => void
): Promise<string> {
  if (!bundlePath) {
    throw new Error("Bundle not initialized. Call initBundle() first.");
  }

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const slides = req.script_json.slides;
  const totalFrames = calculateTotalFrames(slides);
  const theme = req.theme || "tech-dark";
  const outputPath = path.join(OUTPUT_DIR, `${req.task_id}.mp4`);

  // Build Lottie cache for referenced assets
  const lottieAssetIds = collectLottieAssetIds(slides);
  const lottieCache = buildLottieCache(lottieAssetIds);
  const manifest = assetManifest ?? { version: 1, assets: {} };

  const inputProps = { slides, theme, lottieCache, manifest };

  // Resolve composition with calculated metadata
  const composition = await selectComposition({
    serveUrl: bundlePath,
    id: "SlideVideo",
    inputProps,
  });

  // Determine concurrency
  const cpuCount = os.cpus().length;
  const concurrency = Math.max(2, Math.min(8, Math.floor(cpuCount / 2)));

  console.log(
    `Rendering task ${req.task_id}: ${slides.length} slides, ${totalFrames} frames, ` +
    `theme=${theme}, concurrency=${concurrency}`
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
    crf: 18,
    pixelFormat: "yuv420p",
    onProgress: ({ progress }) => {
      const pct = Math.round(progress * 100);
      onProgress?.(pct);
    },
    chromiumOptions: {
      gl: "swangle",
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

/** Clean up a rendered output file */
export function cleanupOutput(videoPath: string): void {
  try {
    if (fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
  } catch (e) {
    console.warn(`Failed to cleanup ${videoPath}:`, e);
  }
}
