"""
Render video nodes from slide scripts.

The pipeline synthesizes per-slide narration, renders a silent Remotion video,
muxes audio, and stores the final MP4.
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

_RENDERER_TIMEOUT = 1800
_TTS_TIMEOUT = 90.0
_MIN_SLIDE_DURATION_MS = 1000
_BEAT_INTERVAL_SECONDS = 5.0
_MAX_TIMED_BEATS = 5
_RENDERER_URL = "http://renderer:3100"

AudioResult = tuple[Path, float, bool]


async def video_pipeline(state: NodeGenState) -> dict:
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

    audio_results = await _synthesize_per_slide(slides, voice_id, node_id)

    if not audio_results:
        logger.warning("video_pipeline: TTS failed for all slides of node %d", node_id)
        return {"video_url": None, "current_node": "video_pipeline"}

    for slide, (_audio_path, duration, _tts_ok) in zip(slides, audio_results, strict=False):
        slide["duration_ms"] = max(_MIN_SLIDE_DURATION_MS, int(duration * 1000))
        _pace_visual_events_for_audio(slide, duration)

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

    audio_paths = [ap for ap, _duration, _tts_ok in audio_results]
    combined_audio = silent_video.parent / f"narration_{node_id}.mp3"
    await video_service.concat_audio_files(audio_paths, combined_audio)

    output_path = silent_video.parent / f"node_{node_id}.mp4"
    await video_service.mux_audio(silent_video, combined_audio, output_path)

    video_url = await video_service.save_video_to_storage(output_path, course_id, node_id)

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
) -> list[AudioResult]:
    """
    Generate TTS audio for each slide's narration in parallel.
    Each task opens its own DB session to avoid concurrent session errors.
    Returns list of (audio_path, duration_seconds, tts_succeeded).
    """
    import tempfile

    tmp_dir = Path(tempfile.mkdtemp(prefix=f"tts_node_{node_id}_"))

    async def synth_one(idx: int, slide: dict) -> AudioResult:
        narration = slide.get("narration", "")
        if not narration:
            narration = slide.get("title") or slide.get("heading") or "..."
        audio_path = tmp_dir / f"slide_{idx:03d}.mp3"
        try:
            async with async_session_factory() as session:
                await asyncio.wait_for(
                    tts_service.synthesize_speech(
                        text=narration,
                        voice_config_id=voice_id,
                        session=session,
                        output_path=audio_path,
                    ),
                    timeout=_TTS_TIMEOUT,
                )
            duration = await tts_service.get_audio_duration(audio_path)
            return audio_path, duration, True
        except Exception as exc:
            logger.warning(
                "TTS failed or timed out for slide %d of node %d: %s",
                idx,
                node_id,
                exc,
            )
            fallback_duration = 3.0
            await _create_silent_audio(audio_path, fallback_duration)
            return audio_path, fallback_duration, False

    results = await asyncio.gather(
        *[synth_one(i, s) for i, s in enumerate(slides)],
        return_exceptions=True,
    )

    valid: list[AudioResult] = []
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            logger.warning("TTS failed for slide %d of node %d: %s", i, node_id, r)
            _cleanup_audio_dir(tmp_dir)
            return []
        else:
            valid.append(r)

    if len(valid) != len(slides):
        logger.warning(
            "TTS produced %d/%d slide audio files for node %d",
            len(valid),
            len(slides),
            node_id,
        )
        _cleanup_audio_dir(tmp_dir)
        return []

    if valid and not any(tts_ok for _audio_path, _duration, tts_ok in valid):
        logger.error("TTS failed for every slide of node %d; refusing to render a silent video", node_id)
        _cleanup_audio_dir(tmp_dir)
        return []

    return valid


async def _create_silent_audio(audio_path: Path, duration_seconds: float) -> None:
    """Create a short silent MP3 so one flaky TTS call does not block a video."""
    audio_path.parent.mkdir(parents=True, exist_ok=True)
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-t",
        str(max(1.0, duration_seconds)),
        "-q:a",
        "9",
        "-acodec",
        "libmp3lame",
        str(audio_path),
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"failed to create silent audio: {stderr.decode()[-300:]}")


def _pace_visual_events_for_audio(slide: dict, duration_seconds: float) -> None:
    """
    Keep slide visuals paced against the measured TTS duration.

    The content generator can only guess timings before TTS. Once we know the
    real narration length, stretch the main scene over the spoken segment and
    add lightweight timed marks every few seconds so long slides keep changing.
    """
    events = slide.get("visual_events")
    if not isinstance(events, list):
        return

    duration = max(1.0, duration_seconds)
    for event in events:
        if event.get("type") == "scene-stage":
            event["duration"] = round(max(float(event.get("duration") or 0), duration), 2)

    target_beats = _target_beat_count(duration)
    if target_beats <= 0:
        return

    existing_beats = [
        event for event in events
        if event.get("type") not in {"scene-stage", "transition", "clear"}
        and float(event.get("at") or 0) >= 3.0
    ]
    missing = target_beats - len(existing_beats)
    if missing <= 0:
        return

    start_index = len(existing_beats)
    labels = _slide_beat_labels(slide)
    for offset, at in enumerate(_beat_times(duration, target_beats)[start_index:target_beats]):
        index = start_index + offset
        events.append(_make_visual_beat(index, at, labels))

    events.sort(key=lambda event: float(event.get("at") or 0))


def _target_beat_count(duration_seconds: float) -> int:
    if duration_seconds < 8:
        return 0
    return min(_MAX_TIMED_BEATS, max(1, int(duration_seconds // _BEAT_INTERVAL_SECONDS)))


def _beat_times(duration_seconds: float, count: int) -> list[float]:
    if count <= 0:
        return []
    start = min(4.0, max(2.4, duration_seconds * 0.22))
    end = max(start, duration_seconds - 3.0)
    if count == 1:
        return [round((start + end) / 2, 2)]
    step = (end - start) / (count - 1)
    return [round(start + step * index, 2) for index in range(count)]


def _slide_beat_labels(slide: dict) -> list[str]:
    candidates: list[str] = []
    for key in ("title", "heading", "definition", "analogy", "description", "quote", "emphasis"):
        value = slide.get(key)
        if isinstance(value, str):
            candidates.append(value)
    for key in ("points", "left_items", "right_items"):
        value = slide.get(key)
        if isinstance(value, list):
            candidates.extend(str(item) for item in value if item)
    labels = []
    for candidate in candidates:
        text = " ".join(str(candidate).split()).strip("「」“”\"'")
        if not text:
            continue
        if len(text) > 18:
            text = text[:17] + "…"
        if text not in labels:
            labels.append(text)
        if len(labels) >= _MAX_TIMED_BEATS:
            break
    return labels or ["建立对象", "拆解关系", "验证结论"]


def _make_visual_beat(index: int, at: float, labels: list[str]) -> dict:
    label = labels[index % len(labels)]
    tone_colors = ["#6366f1", "#06b6d4", "#f59e0b", "#10b981"]
    color = tone_colors[index % len(tone_colors)]
    # Keep auto-added beats in the visual/diagram area. The right lane is
    # reserved for scene annotations and text, so drawing there causes overlap.
    patterns = [
        ("underline", {"x": 380, "y": 552}, {"x": 920, "y": 552}),
        ("box", {"x": 360, "y": 302}, {"x": 940, "y": 430}),
        ("box", {"x": 384, "y": 516}, {"x": 900, "y": 680}),
        ("curved-arrow", {"x": 682, "y": 742}, {"x": 976, "y": 620}),
        ("circle", {"x": 604, "y": 410}, {"x": 852, "y": 658}),
    ]
    shape, start, end = patterns[index % len(patterns)]
    return {
        "at": at,
        "type": "svg-draw",
        "shape": shape,
        "from": start,
        "to": end,
        "duration": 1.0,
        "strokeColor": color,
        "strokeWidth": 3,
        "id": f"beat-{index + 1}-{label}",
    }


def _cleanup_audio_files(audio_results: list[AudioResult]) -> None:
    """Clean up temporary per-slide audio files."""
    dirs_seen: set[str] = set()
    for audio_path, _duration, _tts_ok in audio_results:
        parent = str(audio_path.parent)
        if parent not in dirs_seen:
            dirs_seen.add(parent)
            _cleanup_audio_dir(audio_path.parent)


def _cleanup_audio_dir(path: Path) -> None:
    import shutil

    shutil.rmtree(path, ignore_errors=True)


async def _dispatch_to_renderer(
    node_id: int,
    course_id: int,
    script_json: dict,
    theme: str,
) -> str | None:
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

        async with httpx.AsyncClient(timeout=5) as client:
            try:
                health = await client.get(f"{_RENDERER_URL}/health")
                if health.status_code != 200:
                    logger.warning("video_pipeline: renderer health check failed (status %d)", health.status_code)
                    return None
            except httpx.ConnectError:
                logger.warning("video_pipeline: renderer not reachable at %s", _RENDERER_URL)
                return None

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
