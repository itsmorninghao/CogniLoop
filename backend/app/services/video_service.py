"""
Video synthesis service — ffmpeg integration.

Muxes silent video from Remotion renderer with TTS audio into final MP4.
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


async def concat_audio_files(audio_paths: list[Path], output_path: Path) -> Path:
    """
    Concatenate multiple audio files into a single MP3 using ffmpeg concat demuxer.
    """
    if len(audio_paths) == 1:
        # Single file, just copy
        shutil.copy2(str(audio_paths[0]), str(output_path))
        return output_path

    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Write concat list file
    list_file = output_path.parent / "_concat_list.txt"
    with open(list_file, "w") as f:
        for ap in audio_paths:
            f.write(f"file '{ap}'\n")

    await asyncio.get_event_loop().run_in_executor(
        None,
        _run_ffmpeg,
        [
            "-f", "concat",
            "-safe", "0",
            "-i", str(list_file),
            "-c", "copy",
            str(output_path),
        ],
    )

    list_file.unlink(missing_ok=True)
    return output_path


async def mux_audio(
    silent_video: Path,
    audio_path: Path,
    output_path: Path,
) -> Path:
    """
    Mux a silent MP4 video with an audio track.
    Uses -c:v copy (no video re-encoding) for speed.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    await asyncio.get_event_loop().run_in_executor(
        None,
        _run_ffmpeg,
        [
            "-i", str(silent_video),
            "-i", str(audio_path),
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "192k",
            "-shortest",
            str(output_path),
        ],
    )

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

    shutil.move(str(source_path), str(dest_path))

    return f"/uploads/courses/{course_id}/{filename}"


def cleanup_render_output(video_path: Path) -> None:
    """Delete a rendered video file from /tmp/renderer_output/."""
    try:
        if video_path.exists():
            video_path.unlink()
    except Exception as e:
        logger.warning("Failed to cleanup render output %s: %s", video_path, e)
