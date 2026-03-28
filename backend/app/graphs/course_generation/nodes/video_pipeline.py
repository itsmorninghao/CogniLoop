"""
Node 3 (node graph, video path): Video Pipeline — renderer dispatch + TTS + ffmpeg.

Only executed for content_type == "video" nodes.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from pathlib import Path

from backend.app.core.database import async_session_factory
from backend.app.graphs.course_generation.state import NodeGenState
from backend.app.services import tts_service, video_service

logger = logging.getLogger(__name__)

_RENDERER_TIMEOUT = 300  # 5 minutes
_POLL_INTERVAL = 2.0


async def video_pipeline(state: NodeGenState) -> dict:
    """
    1. Dispatch slide rendering to renderer service via Redis.
    2. Call TTS for narration audio.
    3. Merge frames + audio with ffmpeg.
    4. Save to uploads, return video_url.

    If renderer is unavailable (no Redis / container not running),
    the node is still marked done but with video_url=None.
    """
    node_id: int = state["node_id"]
    course_id: int = state["course_id"]
    script_json: dict | None = state.get("script_json")
    narration_text: str = state.get("narration_text", "")
    voice_id: str | None = state.get("voice_id")

    if not script_json:
        logger.warning("video_pipeline: no script_json for node %d, skipping", node_id)
        return {"video_url": None, "current_node": "video_pipeline"}

    # Step 1: dispatch to renderer
    try:
        frames_dir_str = await _dispatch_to_renderer(node_id, course_id, script_json)
    except Exception as e:
        logger.warning("video_pipeline: renderer failed for node %d (%s), skipping video", node_id, e)
        return {"video_url": None, "current_node": "video_pipeline"}

    if not frames_dir_str:
        logger.warning("video_pipeline: renderer unavailable for node %d", node_id)
        return {"video_url": None, "current_node": "video_pipeline"}

    frames_dir = Path(frames_dir_str)

    # Step 2: TTS
    audio_dir = frames_dir / "audio"
    audio_dir.mkdir(exist_ok=True)
    audio_path = audio_dir / "narration.mp3"

    async with async_session_factory() as session:
        await tts_service.synthesize_speech(
            text=narration_text,
            voice_config_id=voice_id,
            session=session,
            output_path=audio_path,
        )

    audio_duration = await tts_service.get_audio_duration(audio_path)

    # Distribute slide durations proportional to total audio length
    slides = script_json.get("slides", [])
    if slides:
        per_slide_ms = int((audio_duration * 1000) / len(slides))
        for slide in slides:
            slide.setdefault("duration_ms", per_slide_ms)

    # Step 3: merge frames + audio with ffmpeg
    output_path = frames_dir / f"node_{node_id}.mp4"
    await video_service.frames_to_video(
        frames_dir=frames_dir,
        audio_path=audio_path,
        output_path=output_path,
        fps=30,
        audio_duration=audio_duration,
    )

    # Step 4: save to uploads
    video_url = await video_service.save_video_to_storage(output_path, course_id, node_id)
    video_service.cleanup_frames(frames_dir)

    logger.info("video_pipeline: node %d → %s", node_id, video_url)
    return {
        "video_url": video_url,
        "current_node": "video_pipeline",
    }


async def _dispatch_to_renderer(node_id: int, course_id: int, script_json: dict) -> str | None:
    """
    Push render task to renderer service via Redis.
    Returns the frames_dir path on success, or None if renderer is unavailable.
    """
    try:
        import redis.asyncio as aioredis
        from backend.app.core.config import settings

        task_id = uuid.uuid4().hex
        payload = {
            "task_id": task_id,
            "node_id": node_id,
            "course_id": course_id,
            "script_json": script_json,
        }

        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        try:
            # Fast check: if renderer heartbeat is missing, skip immediately
            if not await r.exists("renderer:alive"):
                logger.warning("video_pipeline: renderer not running, skipping node %d", node_id)
                return None

            await r.rpush("renderer:tasks", json.dumps(payload))

            result_key = f"renderer:result:{task_id}"
            elapsed = 0.0
            while elapsed < _RENDERER_TIMEOUT:
                raw = await r.get(result_key)
                if raw:
                    await r.delete(result_key)
                    result = json.loads(raw)
                    if result.get("status") == "frames_ready":
                        return result.get("frames_dir")
                    raise RuntimeError(f"Renderer failed: {result.get('error')}")
                await asyncio.sleep(_POLL_INTERVAL)
                elapsed += _POLL_INTERVAL

            raise TimeoutError(f"Renderer timed out after {_RENDERER_TIMEOUT}s")
        finally:
            await r.aclose()

    except ImportError:
        logger.warning("redis package not available, renderer dispatch skipped for node %d", node_id)
        return None
    except Exception as e:
        logger.error("Renderer dispatch failed for node %d: %s", node_id, e)
        return None
