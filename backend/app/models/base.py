"""基础模型定义"""

from datetime import UTC, datetime

from sqlmodel import Field, SQLModel


def utc_now_naive() -> datetime:
    """获取当前 UTC 时间[naive，无时区信息]"""
    return datetime.now(UTC).replace(tzinfo=None)


class TimestampMixin(SQLModel):
    """时间戳混入类"""

    created_at: datetime = Field(
        default_factory=utc_now_naive,
        nullable=False,
    )
    updated_at: datetime = Field(
        default_factory=utc_now_naive,
        nullable=False,
        sa_column_kwargs={"onupdate": utc_now_naive},
    )
