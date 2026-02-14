"""验证码存储模型"""

from datetime import UTC, datetime

from sqlmodel import Field, SQLModel


def utc_now_naive() -> datetime:
    """获取当前 UTC 时间（naive，无时区信息）"""
    return datetime.now(UTC).replace(tzinfo=None)


class CaptchaStore(SQLModel, table=True):
    """验证码存储表 —— 存储生成的图形验证码答案"""

    __tablename__ = "captcha_store"

    id: str = Field(primary_key=True, max_length=36, description="验证码唯一标识(UUID)")
    answer: str = Field(max_length=10, description="验证码答案")
    expires_at: datetime = Field(nullable=False, index=True, description="过期时间")
    created_at: datetime = Field(default_factory=utc_now_naive, description="创建时间")
