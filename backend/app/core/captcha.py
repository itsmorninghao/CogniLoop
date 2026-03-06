"""Self-hosted SVG captcha — no external image library required."""
import random
import string
import uuid

from backend.app.core.redis_pubsub import get_redis

_CAPTCHA_TTL = 300  # 5 minutes
_CHARS = [c for c in string.ascii_uppercase + string.digits if c not in ('0', 'O', 'I', '1')]


def _color(light: bool = False) -> str:
    if light:
        v = lambda: random.randint(190, 240)
    else:
        v = lambda: random.randint(30, 140)
    return f"rgb({v()},{v()},{v()})"


def generate_captcha_svg(text: str) -> str:
    W, H = 120, 40
    p = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}">',
        f'<rect width="{W}" height="{H}" fill="#f0f0f0" rx="4"/>',
    ]
    for _ in range(4):  # noise lines
        p.append(
            f'<line x1="{random.randint(0, W)}" y1="{random.randint(0, H)}" '
            f'x2="{random.randint(0, W)}" y2="{random.randint(0, H)}" '
            f'stroke="{_color(True)}" stroke-width="1.5"/>'
        )
    for _ in range(25):  # noise dots
        p.append(
            f'<circle cx="{random.randint(0, W)}" cy="{random.randint(0, H)}" '
            f'r="1.2" fill="{_color(True)}"/>'
        )
    cw = W / len(text)
    for i, ch in enumerate(text):
        x = cw * i + cw / 2
        y = H / 2 + random.randint(-4, 4)
        ang = random.randint(-18, 18)
        p.append(
            f'<text x="{x:.1f}" y="{y:.1f}" font-family="monospace" font-size="20" '
            f'font-weight="bold" fill="{_color()}" text-anchor="middle" '
            f'dominant-baseline="middle" transform="rotate({ang},{x:.1f},{y:.1f})">'
            f'{ch}</text>'
        )
    p.append('</svg>')
    return ''.join(p)


async def issue_captcha() -> tuple[str, str]:
    text = ''.join(random.choices(_CHARS, k=4))
    cid = str(uuid.uuid4())
    await get_redis().set(f"captcha:{cid}", text, ex=_CAPTCHA_TTL)
    return cid, generate_captcha_svg(text)


async def verify_captcha(captcha_id: str, answer: str) -> bool:
    r = get_redis()
    key = f"captcha:{captcha_id}"
    stored = await r.get(key)
    await r.delete(key)  # single-use
    return bool(stored) and answer.strip().upper() == stored.strip().upper()
