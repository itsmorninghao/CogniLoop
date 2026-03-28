"""
Video synthesis service — ffmpeg integration.

Assembles frame sequences + audio into MP4 video files.
"""

from __future__ import annotations

import asyncio
import logging
import shutil
import subprocess
import uuid
from pathlib import Path

from backend.app.core.config import settings

logger = logging.getLogger(__name__)


def _run_ffmpeg(args: list[str]) -> None:
    """Run ffmpeg command, raising RuntimeError on failure."""
    cmd = ["ffmpeg", "-y"] + args
    logger.debug("Running: %s", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr[-500:]}")


async def frames_to_video(
    frames_dir: Path,
    audio_path: Path,
    output_path: Path,
    fps: int = 30,
    audio_duration: float | None = None,
    slides: list[dict] | None = None,
) -> Path:
    """
    Convert frame sequence + audio to MP4.

    Args:
        frames_dir: Directory containing frame_NNNNN.png files
        audio_path: Path to narration audio (.mp3)
        output_path: Output .mp4 path
        fps: Frames per second
        audio_duration: Total audio duration in seconds (for timing calculation)
        slides: Slide list (used to calculate per-slide timing)
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    silent_video = frames_dir / "_silent.mp4"

    # Step 1: frames → silent video
    await asyncio.get_event_loop().run_in_executor(
        None,
        _run_ffmpeg,
        [
            "-framerate", str(fps),
            "-i", str(frames_dir / "frame_%05d.png"),
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-vf", "scale=1280:720",
            str(silent_video),
        ],
    )

    # Step 2: add audio
    await asyncio.get_event_loop().run_in_executor(
        None,
        _run_ffmpeg,
        [
            "-i", str(silent_video),
            "-i", str(audio_path),
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "128k",
            "-shortest",
            str(output_path),
        ],
    )

    # Cleanup silent video
    silent_video.unlink(missing_ok=True)

    return output_path


async def save_video_to_storage(
    source_path: Path,
    course_id: int,
    node_id: int,
) -> str:
    """
    Move the generated video to the uploads directory.
    Returns the public URL path.
    """
    dest_dir = settings.upload_path / "courses" / str(course_id)
    dest_dir.mkdir(parents=True, exist_ok=True)

    filename = f"node_{node_id}_{uuid.uuid4().hex[:8]}.mp4"
    dest_path = dest_dir / filename

    # Move (or copy+delete) to uploads
    shutil.move(str(source_path), str(dest_path))

    return f"/uploads/courses/{course_id}/{filename}"


def cleanup_frames(frames_dir: Path) -> None:
    """Delete temporary frame directory."""
    try:
        shutil.rmtree(frames_dir, ignore_errors=True)
    except Exception as e:
        logger.warning("Failed to cleanup frames at %s: %s", frames_dir, e)
