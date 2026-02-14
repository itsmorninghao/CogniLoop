"""为课程表添加 description 字段

Revision ID: 004
Revises: 003
Create Date: 2026-02-14

新增课程描述字段，允许教师在创建课程时填写可选的课程描述（最多 200 字）。
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "004"
down_revision: str = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """添加 description 列"""
    op.add_column(
        "courses",
        sa.Column(
            "description",
            sqlmodel.sql.sqltypes.AutoString(length=200),
            nullable=True,
        ),
    )


def downgrade() -> None:
    """移除 description 列"""
    op.drop_column("courses", "description")
