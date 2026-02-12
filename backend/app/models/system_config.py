"""系统配置与配置变更审计日志模型"""

from datetime import datetime

from sqlmodel import Field, SQLModel

from backend.app.models.base import utc_now_naive


class SystemConfig(SQLModel, table=True):
    """系统配置表"""

    __tablename__ = "system_configs"

    id: int | None = Field(default=None, primary_key=True)
    key: str = Field(unique=True, index=True, max_length=100)
    value: str = Field(max_length=2000)
    group: str = Field(max_length=50, index=True)
    description: str = Field(default="", max_length=200)
    updated_at: datetime = Field(default_factory=utc_now_naive)


class ConfigAuditLog(SQLModel, table=True):
    """配置变更审计日志"""

    __tablename__ = "config_audit_logs"

    id: int | None = Field(default=None, primary_key=True)
    admin_id: int = Field(index=True)
    admin_username: str = Field(max_length=50)
    config_key: str = Field(max_length=100, index=True)
    old_value: str | None = Field(default=None, max_length=2000)
    new_value: str = Field(max_length=2000)
    created_at: datetime = Field(default_factory=utc_now_naive)
