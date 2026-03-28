"""
TTS service — OpenAI-compatible speech synthesis for course narration.

Credential resolution order:
  1. TTS_API_KEY  / TTS_BASE_URL  (dedicated TTS credentials, stored encrypted)
  2. OPENAI_API_KEY / OPENAI_BASE_URL  (global LLM credentials, fallback)

Voice list is stored in COURSE_VOICES (system_configs, JSON array):
  [{"id": "...", "name": "温柔女声", "voice_id": "nova", "model": "tts-1"}]
  • id       — auto-generated on save, do not set manually
  • voice_id — provider-side identifier (e.g. "alloy", "FunAudioLLM/CosyVoice2-0.5B")
  • model    — optional, defaults to "tts-1"

Works with any provider that exposes an OpenAI-compatible /audio/speech endpoint
(OpenAI, SiliconFlow, Ark/Volcano, etc.).
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.services.config_service import get_config

logger = logging.getLogger(__name__)


async def get_available_voices(session: AsyncSession) -> list[dict]:
    """Return configured voice list from COURSE_VOICES system config."""
    raw = await get_config("COURSE_VOICES", session)
    if raw:
        try:
            voices = json.loads(raw)
            if isinstance(voices, list):
                return voices
        except json.JSONDecodeError:
            pass

    # Built-in defaults — work out of the box with any OpenAI-compatible key
    return [
        {"id": "openai_alloy", "name": "标准配音（AI）", "voice_id": "alloy", "model": "tts-1"},
        {"id": "openai_nova",  "name": "温柔女声（AI）", "voice_id": "nova",  "model": "tts-1"},
        {"id": "openai_echo",  "name": "专业男声（AI）", "voice_id": "echo",  "model": "tts-1"},
    ]


async def synthesize_speech(
    text: str,
    voice_config_id: str | None,
    session: AsyncSession,
    output_path: Path,
) -> Path:
    """
    Synthesize speech using an OpenAI-compatible /audio/speech endpoint.

    Credentials: TTS_API_KEY / TTS_BASE_URL take precedence;
    falls back to global OPENAI_API_KEY / OPENAI_BASE_URL.
    """
    from openai import AsyncOpenAI

    voices = await get_available_voices(session)
    voice = next((v for v in voices if v["id"] == voice_config_id), None)
    if not voice:
        voice = voices[0] if voices else {}

    # Dedicated TTS credentials → global LLM credentials
    api_key  = (await get_config("TTS_API_KEY",  session)
                or await get_config("OPENAI_API_KEY",  session))
    base_url = (await get_config("TTS_BASE_URL", session)
                or await get_config("OPENAI_BASE_URL", session))
    model    = voice.get("model")    or "tts-1"
    voice_id = voice.get("voice_id", "alloy")

    if not api_key:
        raise RuntimeError(
            "TTS API key not configured — set TTS_API_KEY or global OPENAI_API_KEY"
        )

    client = AsyncOpenAI(api_key=api_key, base_url=base_url or None)
    response = await client.audio.speech.create(
        model=model,
        voice=voice_id,  # type: ignore[arg-type]
        input=text,
        response_format="mp3",
    )
    output_path.write_bytes(response.content)
    logger.info(
        "TTS synthesized %d chars → %s (model=%s, voice=%s)",
        len(text), output_path.name, model, voice_id,
    )
    return output_path


async def get_audio_duration(audio_path: Path) -> float:
    """Get audio duration in seconds using ffprobe (async subprocess)."""
    proc = None
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_streams", str(audio_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30.0)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            logger.warning("ffprobe timed out for %s", audio_path)
            return 30.0
        data = json.loads(stdout.decode())
        for stream in data.get("streams", []):
            dur = stream.get("duration")
            if dur:
                return float(dur)
    except Exception as e:
        logger.warning("ffprobe failed for %s: %s", audio_path, e)
        if proc is not None and proc.returncode is None:
            proc.kill()
    return 30.0  # safe fallback: ~30 s per node
