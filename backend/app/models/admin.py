"""管理员模型"""

from datetime import datetime

from sqlmodel import Field, SQLModel

from backend.app.models.base import utc_now_naive


class Admin(SQLModel, table=True):
    """管理员模型"""

    __tablename__ = "admins"

    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True, max_length=50)
    email: str = Field(unique=True, index=True, max_length=100)
    hashed_password: str = Field(max_length=200)
    full_name: str = Field(max_length=100)
    is_active: bool = Field(default=True)
    is_super_admin: bool = Field(default=False)  # 超级管理员标识
    created_at: datetime = Field(default_factory=utc_now_naive)
    updated_at: datetime = Field(default_factory=utc_now_naive)
