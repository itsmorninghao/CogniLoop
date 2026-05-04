"""
Node graph: Bitmap Asset Generator.

This node turns scene-level asset plans into real bitmap files before Remotion
renders the video. It is intentionally provider-shaped: an external image
service can be plugged in through env vars, while the default local generator
still produces stable PNGs so the course pipeline remains testable offline.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import math
import os
import random
import re
import shutil
from pathlib import Path
from typing import Any

import httpx

from backend.app.core.config import settings
from backend.app.graphs.course_generation.state import NodeGenState

logger = logging.getLogger(__name__)

_ASSET_VERSION = "course_asset_bitmap.v3"
_ASSET_WIDTH = 1280
_ASSET_HEIGHT = 720
_HTTP_TIMEOUT_SECONDS = 55.0
_RENDER_BASE_URL = "http://app:8000"

_WORLD_PALETTES = {
    "document_lab": ["#6d7cff", "#19c7d4", "#ffb020", "#35d399"],
    "classroom_studio": ["#19c7d4", "#35d399", "#ffb020", "#6d7cff"],
    "amplifier_factory": ["#ffb020", "#ff5ca8", "#6d7cff", "#19c7d4"],
    "data_observatory": ["#6d7cff", "#35d399", "#19c7d4", "#ffb020"],
    "concept_kitchen": ["#35d399", "#ffb020", "#6d7cff", "#19c7d4"],
    "systems_map": ["#19c7d4", "#6d7cff", "#ff5ca8", "#35d399"],
}

async def asset_generator(state: NodeGenState) -> dict:
    """Generate bitmap assets and attach renderer-accessible URLs to scenes."""
    script_json = state.get("script_json")
    if not script_json or not isinstance(script_json.get("slides"), list):
        return {
            "asset_manifest_json": None,
            "current_node": "asset_generator",
        }

    course_id = int(state.get("course_id") or 0)
    node_id = int(state.get("node_id") or 0)
    slides: list[dict[str, Any]] = script_json.get("slides") or []
    manifest: dict[str, Any] = {
        "version": _ASSET_VERSION,
        "course_id": course_id,
        "node_id": node_id,
        "assets": [],
    }

    for slide_index, slide in enumerate(slides):
        scene = slide.get("render_scene")
        if not isinstance(scene, dict):
            continue
        assets = scene.get("assets")
        if not isinstance(assets, list):
            continue

        for asset_index, asset in enumerate(assets):
            if not isinstance(asset, dict):
                continue
            if asset.get("src"):
                manifest["assets"].append(_manifest_entry(slide_index, asset, reused=True))
                continue

            try:
                resolved = await _resolve_asset(
                    state=state,
                    slide=slide,
                    scene=scene,
                    asset=asset,
                    slide_index=slide_index,
                    asset_index=asset_index,
                )
                asset.update(resolved)
                manifest["assets"].append(_manifest_entry(slide_index, asset, reused=resolved["metadata"].get("reused", False)))
            except Exception as exc:
                logger.warning(
                    "asset_generator: failed asset node=%s slide=%s asset=%s: %s",
                    node_id,
                    slide_index,
                    asset.get("id") or asset_index,
                    exc,
                )
                asset["provider"] = "none"
                asset["metadata"] = {"error": str(exc)}

    logger.info(
        "asset_generator: node=%s generated/reused %d bitmap assets",
        node_id,
        len(manifest["assets"]),
    )
    return {
        "script_json": script_json,
        "asset_manifest_json": manifest,
        "current_node": "asset_generator",
    }


async def _resolve_asset(
    *,
    state: NodeGenState,
    slide: dict[str, Any],
    scene: dict[str, Any],
    asset: dict[str, Any],
    slide_index: int,
    asset_index: int,
) -> dict[str, Any]:
    cache_key = _cache_key(state, slide, scene, asset)
    course_id = int(state.get("course_id") or 0)
    node_id = int(state.get("node_id") or 0)
    asset_id = _safe_slug(str(asset.get("id") or f"asset-{asset_index}"))
    filename = f"node_{node_id}_s{slide_index + 1}_{asset_id}_{cache_key[:12]}.png"
    course_asset_dir = settings.upload_path / "courses" / str(course_id) / "assets"
    cache_dir = settings.upload_path / "_course_asset_cache"
    course_asset_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)
    dest_path = course_asset_dir / filename
    cache_path = cache_dir / f"{cache_key}.png"

    reused = False
    if dest_path.exists() and _looks_like_png(dest_path):
        reused = True
    elif cache_path.exists() and _looks_like_png(cache_path):
        shutil.copy2(cache_path, dest_path)
        reused = True
    else:
        provider = await _generate_bitmap_to_path(cache_path, state, slide, scene, asset, cache_key)
        if not _looks_like_png(cache_path):
            raise RuntimeError("bitmap provider did not produce a valid PNG")
        shutil.copy2(cache_path, dest_path)
        reused = False

    provider = _provider_for_scene(state, scene, asset)
    if not reused:
        provider = _read_provider_marker(cache_path) or provider

    public_src = f"/uploads/courses/{course_id}/assets/{filename}"
    render_base_url = os.getenv("COURSE_ASSET_RENDER_BASE_URL", _RENDER_BASE_URL).rstrip("/")
    return {
        "src": f"{render_base_url}{public_src}",
        "public_src": public_src,
        "provider": provider,
        "cache_key": cache_key,
        "metadata": {
            "width": _ASSET_WIDTH,
            "height": _ASSET_HEIGHT,
            "format": "png",
            "reused": reused,
            "path": str(dest_path),
        },
    }


async def _generate_bitmap_to_path(
    path: Path,
    state: NodeGenState,
    slide: dict[str, Any],
    scene: dict[str, Any],
    asset: dict[str, Any],
    cache_key: str,
) -> str:
    provider = os.getenv("COURSE_ASSET_PROVIDER", "").strip().lower()
    endpoint = os.getenv("COURSE_ASSET_HTTP_ENDPOINT", "").strip()

    if endpoint and provider not in {"local", "synthetic", "none"}:
        try:
            await _request_http_bitmap(path, endpoint, state, slide, scene, asset, cache_key)
            _write_provider_marker(path, "http_bitmap")
            return "http_bitmap"
        except Exception as exc:
            logger.warning("asset_generator: HTTP bitmap provider failed, using local fallback: %s", exc)

    local_provider = _provider_for_scene(state, scene, asset)
    _draw_local_bitmap(path, state, slide, scene, asset, cache_key, local_provider)
    _write_provider_marker(path, local_provider)
    return local_provider


async def _request_http_bitmap(
    path: Path,
    endpoint: str,
    state: NodeGenState,
    slide: dict[str, Any],
    scene: dict[str, Any],
    asset: dict[str, Any],
    cache_key: str,
) -> None:
    headers: dict[str, str] = {}
    api_key = os.getenv("COURSE_ASSET_HTTP_API_KEY", "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "version": _ASSET_VERSION,
        "cache_key": cache_key,
        "width": _ASSET_WIDTH,
        "height": _ASSET_HEIGHT,
        "prompt": asset.get("prompt") or scene.get("title") or state.get("node_title", ""),
        "negative_prompt": "dense text, watermark, logo, UI screenshot chrome, low resolution, blurry",
        "course_id": state.get("course_id"),
        "node_id": state.get("node_id"),
        "slide_title": scene.get("title") or slide.get("title") or slide.get("heading"),
        "world": (scene.get("visual_identity") or {}).get("world"),
        "scene_type": scene.get("scene_type"),
        "layout": scene.get("layout"),
        "asset": asset,
    }

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
        response = await client.post(endpoint, json=payload, headers=headers)
        response.raise_for_status()
        content_type = response.headers.get("content-type", "")
        if content_type.startswith("image/"):
            _write_image_bytes_as_png(path, response.content)
            return

        data = response.json()
        image_b64 = data.get("b64_json") or data.get("image_base64") or data.get("data")
        image_url = data.get("url") or data.get("image_url")
        if image_b64:
            _write_image_bytes_as_png(path, base64.b64decode(str(image_b64)))
            return
        if image_url:
            image_response = await client.get(str(image_url))
            image_response.raise_for_status()
            _write_image_bytes_as_png(path, image_response.content)
            return

    raise RuntimeError("HTTP bitmap provider returned no image bytes")


def _draw_local_bitmap(
    path: Path,
    state: NodeGenState,
    slide: dict[str, Any],
    scene: dict[str, Any],
    asset: dict[str, Any],
    cache_key: str,
    provider: str,
) -> None:
    try:
        from PIL import Image, ImageDraw, ImageFilter
    except ImportError as exc:
        raise RuntimeError("Pillow is required for local bitmap assets") from exc

    identity = scene.get("visual_identity") if isinstance(scene.get("visual_identity"), dict) else {}
    world = str(identity.get("world") or "systems_map")
    palette = _scene_palette(scene)
    rng = random.Random(cache_key)
    img = _gradient_image(Image, palette, world)
    draw = ImageDraw.Draw(img, "RGBA")
    _draw_grid(draw, palette, world, rng)
    _draw_world_bitmap(draw, img, state, slide, scene, asset, world, palette, rng, provider)
    _draw_asset_finish(draw, scene, asset, palette, rng)
    img = img.filter(ImageFilter.UnsharpMask(radius=1.1, percent=115, threshold=4))
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="PNG", optimize=True)


def _draw_world_bitmap(
    draw: Any,
    img: Any,
    state: NodeGenState,
    slide: dict[str, Any],
    scene: dict[str, Any],
    asset: dict[str, Any],
    world: str,
    palette: list[str],
    rng: random.Random,
    provider: str,
) -> None:
    if provider == "kb_reference_bitmap" or world == "document_lab":
        _draw_document_lab(draw, state, slide, scene, asset, palette, rng)
    elif world == "classroom_studio":
        _draw_classroom_studio(draw, scene, palette, rng)
    elif world == "amplifier_factory":
        _draw_amplifier_factory(draw, scene, palette, rng)
    elif world == "data_observatory":
        _draw_data_observatory(draw, scene, palette, rng)
    elif world == "concept_kitchen":
        _draw_concept_kitchen(draw, scene, palette, rng)
    else:
        _draw_systems_map(draw, scene, palette, rng)


def _draw_document_lab(
    draw: Any,
    state: NodeGenState,
    slide: dict[str, Any],
    scene: dict[str, Any],
    asset: dict[str, Any],
    palette: list[str],
    rng: random.Random,
) -> None:
    accent = palette[0]
    secondary = palette[1]
    snippet_count = max(3, min(6, len(_snippet_lines(state.get("rag_content") or slide.get("narration") or scene.get("subtitle") or "", 8))))
    _rounded(draw, (118, 96, 718, 610), 28, fill=(245, 249, 255, 210), outline=_rgba(accent, 0.55), width=3)
    _rounded(draw, (164, 144, 672, 566), 18, fill=(19, 26, 42, 204), outline=_rgba("#ffffff", 0.12), width=2)
    for i in range(8):
        y = 190 + i * 42
        width = rng.randint(270, 420)
        color = _rgba("#ffffff", 0.28 if i % 3 else 0.46)
        draw.rounded_rectangle((206, y, 206 + width, y + 13), radius=7, fill=color)
    for i in range(3):
        y = 245 + i * 94
        draw.rounded_rectangle((206, y, 610, y + 22), radius=11, fill=_rgba(palette[(i + 2) % len(palette)], 0.52))
    draw.rectangle((142, 154, 154, 552), fill=_rgba(accent, 0.72))
    draw.rectangle((658, 140, 668, 558), fill=_rgba(secondary, 0.38))
    draw.line((92, 406, 742, 406), fill=_rgba("#ffffff", 0.22), width=8)
    draw.line((92, 406, 742, 406), fill=_rgba(secondary, 0.78), width=3)

    for idx in range(4):
        x = 790
        y = 132 + idx * 116
        active = idx < snippet_count
        color = palette[idx % len(palette)]
        _rounded(
            draw,
            (x, y, 1160, y + 82),
            18,
            fill=(12, 18, 34, 224 if active else 150),
            outline=_rgba(color, 0.56 if active else 0.24),
            width=2,
        )
        draw.rounded_rectangle((x + 24, y + 20, x + 78, y + 28), radius=4, fill=_rgba(color, 0.76 if active else 0.28))
        for row in range(2):
            line_y = y + 40 + row * 18
            line_width = rng.randint(146, 286) if active else rng.randint(88, 182)
            draw.rounded_rectangle(
                (x + 24, line_y, x + 24 + line_width, line_y + 8),
                radius=4,
                fill=_rgba("#ffffff", 0.34 if active else 0.14),
            )

    draw.ellipse((548, 350, 762, 564), outline=_rgba(secondary, 0.9), width=14)
    draw.line((720, 522, 870, 672), fill=_rgba(secondary, 0.9), width=24)
    draw.line((724, 522, 870, 672), fill=_rgba("#ffffff", 0.18), width=8)
    _draw_particles(draw, palette, rng, count=30, x_range=(650, 1200), y_range=(80, 650))


def _draw_classroom_studio(draw: Any, scene: dict[str, Any], palette: list[str], rng: random.Random) -> None:
    accent = palette[0]
    _rounded(draw, (96, 72, 1040, 532), 34, fill=(7, 53, 52, 235), outline=_rgba(accent, 0.58), width=4)
    draw.rectangle((140, 118, 996, 488), fill=(5, 37, 38, 210))
    for i in range(5):
        y = 168 + i * 58
        draw.arc((180, y, 700, y + 120), 192, 338, fill=_rgba("#ffffff", 0.26), width=6)
    for i, x in enumerate((704, 798, 892)):
        _rounded(draw, (x, 170 + i * 54, x + 230, 230 + i * 54), 14, fill=_rgba(palette[(i + 1) % len(palette)], 0.18), outline=_rgba(palette[(i + 1) % len(palette)], 0.56), width=3)
        draw.line((x + 28, 198 + i * 54, x + 178, 198 + i * 54), fill=_rgba("#ffffff", 0.42), width=8)
    draw.line((126, 572, 1130, 572), fill=_rgba("#ffffff", 0.18), width=22)
    draw.line((206, 616, 976, 616), fill=_rgba(palette[2], 0.55), width=9)
    _draw_equation_blocks(draw, palette, rng)


def _draw_amplifier_factory(draw: Any, scene: dict[str, Any], palette: list[str], rng: random.Random) -> None:
    accent = palette[0]
    secondary = palette[1]
    draw.polygon([(94, 458), (1188, 330), (1188, 494), (94, 642)], fill=_rgba("#ffffff", 0.10))
    draw.line((92, 548, 1188, 414), fill=_rgba(accent, 0.72), width=20)
    draw.line((92, 594, 1188, 460), fill=_rgba("#ffffff", 0.16), width=12)
    _rounded(draw, (468, 174, 790, 516), 34, fill=(24, 28, 44, 232), outline=_rgba(accent, 0.74), width=4)
    draw.ellipse((516, 222, 742, 448), outline=_rgba(accent, 0.9), width=18)
    draw.ellipse((574, 280, 684, 390), fill=_rgba(secondary, 0.18), outline=_rgba(secondary, 0.62), width=8)
    for i in range(4):
        y = 204 + i * 78
        draw.line((150, y, 474, 284 + i * 34), fill=_rgba(palette[i % len(palette)], 0.62), width=8)
        draw.line((784, 284 + i * 34, 1130, y + 70), fill=_rgba(palette[(i + 1) % len(palette)], 0.64), width=10)
    for i in range(5):
        x = 184 + i * 160
        _rounded(draw, (x, 570 - i * 18, x + 86, 632 - i * 18), 12, fill=_rgba(palette[i % len(palette)], 0.28), outline=_rgba("#ffffff", 0.16), width=2)
    _draw_particles(draw, palette, rng, count=44, x_range=(350, 1020), y_range=(120, 580))


def _draw_data_observatory(draw: Any, scene: dict[str, Any], palette: list[str], rng: random.Random) -> None:
    accent = palette[0]
    _rounded(draw, (86, 86, 1192, 612), 34, fill=(11, 18, 38, 224), outline=_rgba(accent, 0.45), width=3)
    for i, rect in enumerate(((128, 132, 498, 322), (540, 132, 1128, 322), (128, 358, 448, 570), (488, 358, 1128, 570))):
        _rounded(draw, rect, 20, fill=_rgba("#ffffff", 0.065), outline=_rgba(palette[i % len(palette)], 0.32), width=2)
    points = []
    for i in range(9):
        x = 580 + i * 58
        y = 280 - math.sin(i * 0.82 + rng.random()) * 42 - i * 8
        points.append((x, int(y)))
    draw.line(points, fill=_rgba(palette[1], 0.9), width=8, joint="curve")
    for x, y in points:
        draw.ellipse((x - 8, y - 8, x + 8, y + 8), fill=_rgba(palette[1], 0.95))
    for i in range(5):
        x = 170 + i * 54
        h = 54 + i * 28 + rng.randint(-12, 16)
        draw.rounded_rectangle((x, 282 - h, x + 34, 282), radius=8, fill=_rgba(palette[i % len(palette)], 0.68))
    draw.ellipse((194, 392, 376, 554), outline=_rgba(palette[2], 0.8), width=12)
    draw.arc((210, 408, 360, 540), 210, 332, fill=_rgba(palette[3], 0.85), width=16)
    draw.line((805, 414, 1056, 526), fill=_rgba("#ffffff", 0.2), width=3)
    for i in range(8):
        draw.line((820 + i * 28, 526, 820 + i * 28, 408 + rng.randint(-20, 34)), fill=_rgba(palette[i % len(palette)], 0.52), width=12)


def _draw_concept_kitchen(draw: Any, scene: dict[str, Any], palette: list[str], rng: random.Random) -> None:
    accent = palette[0]
    draw.polygon([(118, 510), (1110, 392), (1190, 560), (186, 674)], fill=_rgba("#ffffff", 0.13))
    _rounded(draw, (440, 220, 814, 506), 40, fill=(34, 42, 56, 230), outline=_rgba(accent, 0.58), width=4)
    draw.ellipse((500, 250, 758, 424), fill=_rgba(palette[1], 0.22), outline=_rgba(palette[1], 0.76), width=10)
    draw.arc((520, 252, 738, 472), 18, 162, fill=_rgba("#ffffff", 0.28), width=12)
    for i, (x, y) in enumerate(((178, 186), (218, 412), (908, 164), (930, 414), (366, 104))):
        _rounded(draw, (x, y, x + 190, y + 86), 22, fill=_rgba(palette[i % len(palette)], 0.22), outline=_rgba(palette[i % len(palette)], 0.72), width=3)
        draw.line((x + 30, y + 32, x + 148, y + 32), fill=_rgba("#ffffff", 0.34), width=8)
        draw.line((x + 30, y + 58, x + 116, y + 58), fill=_rgba("#ffffff", 0.20), width=7)
        draw.line((x + 190, y + 44, 500 + rng.randint(-30, 30), 328 + rng.randint(-24, 24)), fill=_rgba(palette[i % len(palette)], 0.58), width=6)
    for i in range(28):
        x = rng.randint(500, 760)
        y = rng.randint(270, 410)
        draw.ellipse((x - 5, y - 5, x + 5, y + 5), fill=_rgba(palette[i % len(palette)], 0.68))
    draw.line((812, 362, 1058, 286), fill=_rgba(palette[2], 0.75), width=14)
    draw.polygon([(1058, 286), (1016, 278), (1030, 320)], fill=_rgba(palette[2], 0.9))


def _draw_systems_map(draw: Any, scene: dict[str, Any], palette: list[str], rng: random.Random) -> None:
    nodes = []
    center = (640, 354)
    for i in range(11):
        angle = (math.tau / 11) * i + rng.random() * 0.16
        radius = 160 + (i % 3) * 70 + rng.randint(-20, 20)
        nodes.append((int(center[0] + math.cos(angle) * radius), int(center[1] + math.sin(angle) * radius)))
    for i, (x1, y1) in enumerate(nodes):
        for j in (i + 2, i + 5):
            x2, y2 = nodes[j % len(nodes)]
            draw.line((x1, y1, x2, y2), fill=_rgba(palette[(i + j) % len(palette)], 0.24), width=4)
    draw.ellipse((center[0] - 96, center[1] - 96, center[0] + 96, center[1] + 96), fill=_rgba(palette[0], 0.24), outline=_rgba(palette[0], 0.88), width=8)
    for i, (x, y) in enumerate(nodes):
        r = 28 + (i % 3) * 8
        draw.ellipse((x - r, y - r, x + r, y + r), fill=_rgba(palette[i % len(palette)], 0.28), outline=_rgba(palette[i % len(palette)], 0.84), width=5)
        draw.ellipse((x - 7, y - 7, x + 7, y + 7), fill=_rgba("#ffffff", 0.68))
    draw.arc((270, 80, 1010, 650), 18, 322, fill=_rgba(palette[1], 0.44), width=7)
    draw.arc((340, 130, 940, 600), 206, 488, fill=_rgba(palette[2], 0.32), width=5)


def _draw_equation_blocks(draw: Any, palette: list[str], rng: random.Random) -> None:
    for i in range(3):
        x = 132 + i * 300
        y = 592 + rng.randint(-8, 8)
        _rounded(draw, (x, y, x + 210, y + 58), 16, fill=_rgba(palette[i % len(palette)], 0.18), outline=_rgba(palette[i % len(palette)], 0.52), width=2)
        draw.line((x + 28, y + 28, x + 176, y + 28), fill=_rgba("#ffffff", 0.38), width=8)


def _draw_asset_finish(draw: Any, scene: dict[str, Any], asset: dict[str, Any], palette: list[str], rng: random.Random) -> None:
    draw.rectangle((0, 0, _ASSET_WIDTH, _ASSET_HEIGHT), outline=_rgba("#ffffff", 0.10), width=2)
    draw.rounded_rectangle((44, 42, 226, 52), radius=5, fill=_rgba(palette[0], 0.82))
    draw.rounded_rectangle((44, 64, 148, 72), radius=4, fill=_rgba(palette[1], 0.42))
    for i in range(3):
        x = 1010 + i * 42
        y = 54
        draw.ellipse((x, y, x + 16, y + 16), fill=_rgba(palette[i % len(palette)], 0.72))


def _gradient_image(Image: Any, palette: list[str], world: str) -> Any:
    c1 = _hex_to_rgb("#07101f" if world != "classroom_studio" else "#061d1d")
    c2 = _hex_to_rgb("#101831")
    c3 = _hex_to_rgb(palette[0])
    img = Image.new("RGB", (_ASSET_WIDTH, _ASSET_HEIGHT), c1)
    px = img.load()
    for y in range(_ASSET_HEIGHT):
        t = y / max(1, _ASSET_HEIGHT - 1)
        row = _mix_rgb(c1, c2, t)
        glow = max(0.0, 1.0 - abs(t - 0.34) * 3.2) * 0.16
        row = _mix_rgb(row, c3, glow)
        for x in range(_ASSET_WIDTH):
            side = (x / _ASSET_WIDTH) * 0.08
            px[x, y] = _mix_rgb(row, (0, 0, 0), side)
    return img.convert("RGBA")


def _draw_grid(draw: Any, palette: list[str], world: str, rng: random.Random) -> None:
    step = 58 if world != "data_observatory" else 48
    for x in range(0, _ASSET_WIDTH, step):
        draw.line((x, 0, x, _ASSET_HEIGHT), fill=(255, 255, 255, 20), width=1)
    for y in range(0, _ASSET_HEIGHT, step):
        draw.line((0, y, _ASSET_WIDTH, y), fill=(255, 255, 255, 18), width=1)
    for i in range(3):
        color = _rgba(palette[i % len(palette)], 0.12)
        cx = rng.randint(120, 1160)
        cy = rng.randint(80, 650)
        r = rng.randint(120, 260)
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)


def _draw_particles(
    draw: Any,
    palette: list[str],
    rng: random.Random,
    *,
    count: int,
    x_range: tuple[int, int],
    y_range: tuple[int, int],
) -> None:
    for i in range(count):
        x = rng.randint(*x_range)
        y = rng.randint(*y_range)
        r = rng.randint(2, 7)
        draw.ellipse((x - r, y - r, x + r, y + r), fill=_rgba(palette[i % len(palette)], rng.uniform(0.25, 0.76)))


def _rounded(draw: Any, box: tuple[int, int, int, int], radius: int, *, fill: Any, outline: Any, width: int = 1) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def _provider_for_scene(state: NodeGenState, scene: dict[str, Any], asset: dict[str, Any]) -> str:
    role = str(asset.get("role") or "")
    kind = str(asset.get("kind") or "")
    world = str((scene.get("visual_identity") or {}).get("world") or "")
    layout = str(scene.get("layout") or "")
    text = " ".join([
        role,
        kind,
        world,
        layout,
        str(scene.get("scene_type") or ""),
        str(scene.get("title") or ""),
        str(asset.get("prompt") or ""),
    ])
    if role == "reference" or world == "document_lab" or layout == "evidence_wall" or any(word in text for word in ("document", "filter", "evidence", "资料", "文档", "证据", "语料")):
        return "kb_reference_bitmap"
    return "synthetic_bitmap"


def _scene_palette(scene: dict[str, Any]) -> list[str]:
    identity = scene.get("visual_identity") if isinstance(scene.get("visual_identity"), dict) else {}
    raw_palette = identity.get("palette") if isinstance(identity, dict) else None
    palette = [str(item) for item in raw_palette or [] if isinstance(item, str) and re.match(r"^#[0-9a-fA-F]{6}$", item)]
    world = str(identity.get("world") or "systems_map")
    return palette[:5] or _WORLD_PALETTES.get(world, _WORLD_PALETTES["systems_map"])


def _cache_key(state: NodeGenState, slide: dict[str, Any], scene: dict[str, Any], asset: dict[str, Any]) -> str:
    payload = {
        "version": _ASSET_VERSION,
        "node_title": state.get("node_title"),
        "slide_title": scene.get("title") or slide.get("title") or slide.get("heading"),
        "world": (scene.get("visual_identity") or {}).get("world"),
        "layout": scene.get("layout"),
        "scene_type": scene.get("scene_type"),
        "asset_id": asset.get("id"),
        "role": asset.get("role"),
        "kind": asset.get("kind"),
        "prompt": asset.get("prompt"),
        "rag_sample": (state.get("rag_content") or "")[:900],
    }
    return hashlib.sha256(repr(payload).encode("utf-8")).hexdigest()


def _manifest_entry(slide_index: int, asset: dict[str, Any], *, reused: bool) -> dict[str, Any]:
    return {
        "slide_index": slide_index,
        "id": asset.get("id"),
        "role": asset.get("role"),
        "kind": asset.get("kind"),
        "provider": asset.get("provider"),
        "src": asset.get("src"),
        "public_src": asset.get("public_src"),
        "cache_key": asset.get("cache_key"),
        "reused": reused,
    }


def _safe_slug(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_.-]+", "-", value.strip()).strip("-")
    return slug[:64] or "asset"


def _snippet_lines(text: str, limit: int) -> list[str]:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if not cleaned:
        return []
    return [cleaned[index:index + 18] for index in range(0, min(len(cleaned), limit * 18), 18)]


def _short_text(text: str, limit: int) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    return text[: max(1, limit - 1)] + "…"


def _hex_to_rgb(color: str) -> tuple[int, int, int]:
    color = color.strip().lstrip("#")
    if len(color) != 6:
        return (255, 255, 255)
    return (int(color[0:2], 16), int(color[2:4], 16), int(color[4:6], 16))


def _rgba(color: str, alpha: float) -> tuple[int, int, int, int]:
    r, g, b = _hex_to_rgb(color)
    return (r, g, b, max(0, min(255, int(alpha * 255))))


def _mix_rgb(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    t = max(0.0, min(1.0, t))
    return (
        int(a[0] * (1 - t) + b[0] * t),
        int(a[1] * (1 - t) + b[1] * t),
        int(a[2] * (1 - t) + b[2] * t),
    )


def _looks_like_png(path: Path) -> bool:
    try:
        return path.exists() and path.stat().st_size > 1024 and path.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"
    except OSError:
        return False


def _write_image_bytes_as_png(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        path.write_bytes(data)
        return
    try:
        from io import BytesIO

        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("non-PNG bitmap provider response requires Pillow conversion") from exc

    with Image.open(BytesIO(data)) as img:
        img.convert("RGBA").save(path, format="PNG", optimize=True)


def _marker_path(path: Path) -> Path:
    return path.with_suffix(path.suffix + ".provider")


def _write_provider_marker(path: Path, provider: str) -> None:
    try:
        _marker_path(path).write_text(provider, encoding="utf-8")
    except OSError:
        pass


def _read_provider_marker(path: Path) -> str | None:
    try:
        provider = _marker_path(path).read_text(encoding="utf-8").strip()
        return provider or None
    except OSError:
        return None
