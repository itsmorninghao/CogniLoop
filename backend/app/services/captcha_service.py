"""验证码服务"""

import asyncio
import base64
import logging
import random
import string
import uuid
from datetime import UTC, datetime, timedelta
from io import BytesIO

from captcha.image import ImageCaptcha
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.captcha_store import CaptchaStore

logger = logging.getLogger(__name__)

# 验证码配置
CAPTCHA_LENGTH = 4
CAPTCHA_EXPIRE_MINUTES = 5
CAPTCHA_CHARS = string.digits.replace("0", "").replace("1", "")

# 图片生成器
_image_captcha = ImageCaptcha(width=160, height=60)


def _generate_code(length: int = CAPTCHA_LENGTH) -> str:
    """生成随机数字验证码"""
    return "".join(random.choices(CAPTCHA_CHARS, k=length))


def _generate_image_base64(code: str) -> str:
    """将验证码文本渲染为 base64 图片"""
    image = _image_captcha.generate_image(code)
    buf = BytesIO()
    image.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def _utc_now_naive() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class CaptchaService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def generate(self) -> dict[str, str]:
        """生成验证码，返回 {captcha_id, image_base64}"""
        # 顺带清理过期记录
        await self._cleanup_expired()

        code = _generate_code()
        captcha_id = str(uuid.uuid4())
        expires_at = _utc_now_naive() + timedelta(minutes=CAPTCHA_EXPIRE_MINUTES)

        record = CaptchaStore(
            id=captcha_id,
            answer=code,
            expires_at=expires_at,
        )
        self.session.add(record)
        await self.session.flush()

        loop = asyncio.get_event_loop()
        image_base64 = await loop.run_in_executor(None, _generate_image_base64, code)

        logger.debug("验证码已生成: captcha_id=%s", captcha_id)
        return {
            "captcha_id": captcha_id,
            "image_base64": image_base64,
        }

    async def verify(self, captcha_id: str, user_input: str) -> None:
        """校验验证码，失败则抛出 ValueError。

        无论对错，校验后都会删除该验证码（一次性使用）。
        """
        stmt = select(CaptchaStore).where(CaptchaStore.id == captcha_id)
        result = await self.session.execute(stmt)
        record = result.scalar_one_or_none()

        if record is None:
            raise ValueError("验证码已过期或不存在，请刷新重试")

        # 取出后立刻删除
        await self.session.delete(record)
        await self.session.flush()

        # 检查过期
        if record.expires_at < _utc_now_naive():
            raise ValueError("验证码已过期，请刷新重试")

        # 比对答案
        if record.answer.lower() != user_input.strip().lower():
            raise ValueError("验证码错误")

    async def _cleanup_expired(self) -> None:
        """清理所有已过期的验证码记录"""
        now = _utc_now_naive()
        stmt = delete(CaptchaStore).where(CaptchaStore.expires_at < now)
        result = await self.session.execute(stmt)
        if result.rowcount:
            logger.debug("已清理 %d 条过期验证码", result.rowcount)
