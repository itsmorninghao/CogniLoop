import express from "express";
import { initBundle, renderSlideVideo } from "./render.js";
import type { RenderRequest, RenderResponse } from "./types.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3100", 10);

app.use(express.json({ limit: "10mb" }));

// Track active renders for health reporting
let activeRenders = 0;
const startTime = Date.now();

/** Health check endpoint */
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    activeRenders,
  });
});

/** Render endpoint — synchronous (blocks until render completes) */
app.post("/render", async (req, res) => {
  const body = req.body as RenderRequest;

  if (!body.task_id || !body.script_json?.slides?.length) {
    res.status(400).json({
      status: "failed",
      error: "Missing task_id or script_json.slides",
    } satisfies RenderResponse);
    return;
  }

  activeRenders++;
  console.log(
    `[${body.task_id}] Render request: node=${body.node_id}, ` +
    `${body.script_json.slides.length} slides, theme=${body.theme || "tech-dark"}`
  );

  try {
    const startMs = Date.now();
    const videoPath = await renderSlideVideo(body, (pct) => {
      // Log progress at 25% intervals
      if (pct % 25 === 0) {
        console.log(`[${body.task_id}] Progress: ${pct}%`);
      }
    });
    const durationMs = Date.now() - startMs;

    res.json({
      status: "done",
      video_path: videoPath,
      duration_ms: durationMs,
    } satisfies RenderResponse);
  } catch (error: any) {
    console.error(`[${body.task_id}] Render failed:`, error.message);
    res.status(500).json({
      status: "failed",
      error: error.message || "Unknown render error",
    } satisfies RenderResponse);
  } finally {
    activeRenders--;
  }
});

/** Start server */
async function main() {
  console.log("Initializing Remotion bundle...");
  await initBundle();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Renderer service listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start renderer:", err);
  process.exit(1);
});
