"""
Node 3 (node graph, video path): Video Pipeline — renderer dispatch + TTS + ffmpeg.

Only executed for content_type == "video" nodes.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from pathlib import Path

from backend.app.core.database import async_session_factory
from backend.app.graphs.course_generation.state import NodeGenState
from backend.app.services import tts_service, video_service

logger = logging.getLogger(__name__)

_RENDERER_TIMEOUT = 1800  # CPU rendering ~4fps, 3000 frames ≈ 12min
_ANIMATION_PADDING_MS = 800  # extra time for slide entrance animation
_RENDERER_URL = "http://renderer:3100"


async def video_pipeline(state: NodeGenState) -> dict:
    """
    1. Call TTS per-slide for narration audio (parallel).
    2. Dispatch slide rendering to Remotion renderer via HTTP.
    3. Mux silent video + audio with ffmpeg.
    4. Save to uploads, return video_url.

    If renderer is unavailable, the node is still marked done but with video_url=None.
    """
    node_id: int = state["node_id"]
    course_id: int = state["course_id"]
    script_json: dict | None = state.get("script_json")
    voice_id: str | None = state.get("voice_id")
    theme: str = state.get("theme", "tech-dark")

    if not script_json:
        logger.warning("video_pipeline: no script_json for node %d, skipping", node_id)
        return {"video_url": None, "current_node": "video_pipeline"}

    slides = script_json.get("slides", [])
    if not slides:
        logger.warning("video_pipeline: no slides for node %d, skipping", node_id)
        return {"video_url": None, "current_node": "video_pipeline"}

    # Step 1: Per-slide TTS (parallel, each task gets its own DB session)
    audio_results = await _synthesize_per_slide(slides, voice_id, node_id)

    if not audio_results:
        logger.warning("video_pipeline: TTS failed for all slides of node %d", node_id)
        return {"video_url": None, "current_node": "video_pipeline"}

    for slide, (_audio_path, duration) in zip(slides, audio_results, strict=False):
        slide["duration_ms"] = int(duration * 1000) + _ANIMATION_PADDING_MS

    # Step 2: Dispatch to Remotion renderer via HTTP
    try:
        silent_video_path = await _dispatch_to_renderer(
            node_id, course_id, script_json, theme
        )
    except Exception as e:
        logger.warning("video_pipeline: renderer failed for node %d (%s), skipping video", node_id, e)
        _cleanup_audio_files(audio_results)
        return {"video_url": None, "current_node": "video_pipeline"}

    if not silent_video_path:
        logger.warning("video_pipeline: renderer unavailable for node %d", node_id)
        _cleanup_audio_files(audio_results)
        return {"video_url": None, "current_node": "video_pipeline"}

    silent_video = Path(silent_video_path)

    # Step 3: Concat per-slide audio files into single track
    audio_paths = [ap for ap, _ in audio_results]
    combined_audio = silent_video.parent / f"narration_{node_id}.mp3"
    await video_service.concat_audio_files(audio_paths, combined_audio)

    # Step 4: Mux silent video + audio
    output_path = silent_video.parent / f"node_{node_id}.mp4"
    await video_service.mux_audio(silent_video, combined_audio, output_path)

    # Step 5: Save to uploads
    video_url = await video_service.save_video_to_storage(output_path, course_id, node_id)

    # Cleanup
    video_service.cleanup_render_output(silent_video)
    combined_audio.unlink(missing_ok=True)
    output_path.unlink(missing_ok=True)
    _cleanup_audio_files(audio_results)

    logger.info("video_pipeline: node %d → %s", node_id, video_url)
    return {
        "video_url": video_url,
        "current_node": "video_pipeline",
    }


async def _synthesize_per_slide(
    slides: list[dict],
    voice_id: str | None,
    node_id: int,
) -> list[tuple[Path, float]]:
    """
    Generate TTS audio for each slide's narration in parallel.
    Each task opens its own DB session to avoid concurrent session errors.
    Returns list of (audio_path, duration_seconds).
    """
    import tempfile

    tmp_dir = Path(tempfile.mkdtemp(prefix=f"tts_node_{node_id}_"))

    async def synth_one(idx: int, slide: dict) -> tuple[Path, float]:
        narration = slide.get("narration", "")
        if not narration:
            narration = slide.get("title") or slide.get("heading") or "..."
        audio_path = tmp_dir / f"slide_{idx:03d}.mp3"
        async with async_session_factory() as session:
            await tts_service.synthesize_speech(
                text=narration,
                voice_config_id=voice_id,
                session=session,
                output_path=audio_path,
            )
        duration = await tts_service.get_audio_duration(audio_path)
        return audio_path, duration

    results = await asyncio.gather(
        *[synth_one(i, s) for i, s in enumerate(slides)],
        return_exceptions=True,
    )

    valid: list[tuple[Path, float]] = []
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            logger.warning("TTS failed for slide %d of node %d: %s", i, node_id, r)
            valid.append((tmp_dir / f"slide_{i:03d}.mp3", 3.0))
        else:
            valid.append(r)

    return valid


def _cleanup_audio_files(audio_results: list[tuple[Path, float]]) -> None:
    """Clean up temporary per-slide audio files."""
    import shutil
    dirs_seen: set[str] = set()
    for audio_path, _ in audio_results:
        parent = str(audio_path.parent)
        if parent not in dirs_seen:
            dirs_seen.add(parent)
            shutil.rmtree(parent, ignore_errors=True)


async def _dispatch_to_renderer(
    node_id: int,
    course_id: int,
    script_json: dict,
    theme: str,
) -> str | None:
    """
    Send render request to Remotion renderer service via HTTP.
    Returns the video file path on success, or None if renderer is unavailable.
    """
    try:
        import httpx

        task_id = uuid.uuid4().hex
        payload = {
            "task_id": task_id,
            "node_id": node_id,
            "course_id": course_id,
            "theme": theme,
            "script_json": script_json,
        }

        # Health check first
        async with httpx.AsyncClient(timeout=5) as client:
            try:
                health = await client.get(f"{_RENDERER_URL}/health")
                if health.status_code != 200:
                    logger.warning("video_pipeline: renderer health check failed (status %d)", health.status_code)
                    return None
            except httpx.ConnectError:
                logger.warning("video_pipeline: renderer not reachable at %s", _RENDERER_URL)
                return None

        # Send render request
        async with httpx.AsyncClient(timeout=_RENDERER_TIMEOUT) as client:
            response = await client.post(
                f"{_RENDERER_URL}/render",
                json=payload,
                timeout=_RENDERER_TIMEOUT,
            )

        if response.status_code != 200:
            error_detail = response.json().get("error", response.text)
            raise RuntimeError(f"Renderer returned {response.status_code}: {error_detail}")

        result = response.json()
        if result.get("status") == "done":
            video_path = result.get("video_path")
            duration_ms = result.get("duration_ms", 0)
            logger.info(
                "Renderer completed for node %d: %s (%.1fs)",
                node_id, video_path, duration_ms / 1000,
            )
            return video_path

        raise RuntimeError(f"Renderer failed: {result.get('error', 'unknown')}")

    except ImportError:
        logger.warning("httpx package not available, renderer dispatch skipped for node %d", node_id)
        return None
    except Exception as e:
        logger.error("Renderer dispatch failed for node %d: %s", node_id, e)
        return None
