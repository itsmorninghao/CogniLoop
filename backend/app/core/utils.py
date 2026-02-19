"""公共工具函数"""

from datetime import UTC, datetime


def utc_now_naive() -> datetime:
    """获取当前 UTC 时间（naive，无时区信息），适配数据库 timestamp without tz 列。"""
    return datetime.now(UTC).replace(tzinfo=None)
