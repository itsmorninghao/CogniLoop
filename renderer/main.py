"""
Renderer Service — Playwright + Jinja2 slide rendering worker.

Listens to Redis queue `renderer:tasks`, renders HTML slides to frame images,
and pushes results back to `renderer:result:{task_id}`.

Each task:
  1. Render each slide template to HTML (Jinja2)
  2. Screenshot each slide at 30fps with Playwright (CSS animation frames)
  3. Save frame images to /tmp/frames/{task_id}/
  4. Push result {status, frames_dir} back to Redis
  (ffmpeg + TTS are handled by the main app service)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import uuid
from pathlib import Path

import redis.asyncio as aioredis
from jinja2 import Environment, FileSystemLoader
from playwright.async_api import async_playwright

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
FRAMES_BASE = Path("/tmp/renderer_frames")
SLIDE_WIDTH = 1280
SLIDE_HEIGHT = 720
FPS = 30
DEFAULT_SLIDE_DURATION_MS = 4000  # 4 seconds per slide default

# Jinja2 template environment
TEMPLATES_DIR = Path(__file__).parent / "templates"
jinja_env = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)))


def render_slide_html(slide: dict, slide_index: int, total_slides: int) -> str:
    """Render a single slide dict to HTML string."""
    template_name = slide.get("template", "BULLET_POINTS")
    try:
        tmpl = jinja_env.get_template(f"{template_name}.html")
    except Exception:
        logger.warning("Template %s not found, falling back to BULLET_POINTS", template_name)
        tmpl = jinja_env.get_template("BULLET_POINTS.html")

    return tmpl.render(
        slide_index=slide_index,
        total_slides=total_slides,
        **{k: v for k, v in slide.items() if k != "template"},
    )


async def screenshot_slide(page, html: str, frames_dir: Path, frame_offset: int, duration_ms: int) -> int:
    """
    Load an HTML slide and capture frames at 30fps.
    Returns number of frames captured.
    """
    await page.set_content(html, wait_until="networkidle")

    # Pause all CSS animations so we can manually advance them
    await page.add_init_script("""
        document.addEventListener('DOMContentLoaded', () => {
            document.getAnimations().forEach(a => a.pause());
        });
    """)
    await page.set_content(html, wait_until="networkidle")

    total_frames = int(duration_ms / 1000 * FPS)
    for frame_i in range(total_frames):
        current_time_ms = frame_i * (1000 / FPS)
        await page.evaluate(
            f"document.getAnimations().forEach(a => {{ try {{ a.currentTime = {current_time_ms}; }} catch(e) {{}} }});"
        )
        frame_path = frames_dir / f"frame_{frame_offset + frame_i:05d}.png"
        await page.screenshot(path=str(frame_path), clip={"x": 0, "y": 0, "width": SLIDE_WIDTH, "height": SLIDE_HEIGHT})

    return total_frames


async def process_task(task: dict, redis_client) -> None:
    task_id = task["task_id"]
    node_id = task["node_id"]
    script_json = task.get("script_json") or {}
    slides = script_json.get("slides", [])

    if not slides:
        await redis_client.set(
            f"renderer:result:{task_id}",
            json.dumps({"status": "failed", "error": "No slides in script_json"}),
            ex=3600,
        )
        return

    frames_dir = FRAMES_BASE / task_id
    frames_dir.mkdir(parents=True, exist_ok=True)

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
            )
            page = await browser.new_page(viewport={"width": SLIDE_WIDTH, "height": SLIDE_HEIGHT})

            total_slides = len(slides)
            frame_offset = 0

            for i, slide in enumerate(slides):
                html = render_slide_html(slide, i, total_slides)
                duration_ms = slide.get("duration_ms", DEFAULT_SLIDE_DURATION_MS)
                frames_captured = await screenshot_slide(page, html, frames_dir, frame_offset, duration_ms)
                frame_offset += frames_captured
                logger.info("Task %s: rendered slide %d/%d (%d frames)", task_id, i + 1, total_slides, frames_captured)

            await browser.close()

        result = {
            "status": "frames_ready",
            "task_id": task_id,
            "node_id": node_id,
            "frames_dir": str(frames_dir),
            "total_frames": frame_offset,
        }
        await redis_client.set(
            f"renderer:result:{task_id}",
            json.dumps(result),
            ex=3600,
        )
        logger.info("Task %s complete: %d frames in %s", task_id, frame_offset, frames_dir)

    except Exception as e:
        logger.error("Task %s failed: %s", task_id, e, exc_info=True)
        # Cleanup partial frames
        shutil.rmtree(frames_dir, ignore_errors=True)
        await redis_client.set(
            f"renderer:result:{task_id}",
            json.dumps({"status": "failed", "error": str(e)}),
            ex=3600,
        )


async def worker_loop() -> None:
    """Main worker loop: pull tasks from Redis queue and process them."""
    logger.info("Renderer worker starting, connecting to Redis: %s", REDIS_URL)
    r = aioredis.from_url(REDIS_URL, decode_responses=True)

    FRAMES_BASE.mkdir(parents=True, exist_ok=True)

    logger.info("Renderer worker ready, listening on renderer:tasks")

    while True:
        try:
            # Heartbeat: let the main app know renderer is alive
            await r.set("renderer:alive", "1", ex=120)

            # Blocking pop with 5s timeout
            item = await r.blpop("renderer:tasks", timeout=5)
            if item is None:
                continue

            _, raw = item
            task = json.loads(raw)
            logger.info("Received task: task_id=%s node_id=%s", task.get("task_id"), task.get("node_id"))

            await process_task(task, r)

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Worker loop error: %s", e, exc_info=True)
            await asyncio.sleep(2)

    await r.aclose()
    logger.info("Renderer worker stopped")


if __name__ == "__main__":
    asyncio.run(worker_loop())
