"""System config model — GUI-managed runtime configuration."""

from datetime import datetime

from sqlmodel import Field, SQLModel


class SystemConfig(SQLModel, table=True):
    __tablename__ = "system_configs"

    id: int | None = Field(default=None, primary_key=True)
    key: str = Field(max_length=100, unique=True, index=True)
    value: str | None = Field(default=None)
    description: str | None = Field(default=None, max_length=500)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
