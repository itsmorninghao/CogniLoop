"""新增验证码存储表

Revision ID: 003
Revises: 002
Create Date: 2026-02-13

本迁移创建 captcha_store 表，用于存储图形验证码的答案和过期时间。
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "captcha_store",
        sa.Column(
            "id",
            sqlmodel.sql.sqltypes.AutoString(length=36),
            nullable=False,
        ),
        sa.Column(
            "answer",
            sqlmodel.sql.sqltypes.AutoString(length=10),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_captcha_store_expires_at", "captcha_store", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_captcha_store_expires_at", table_name="captcha_store")
    op.drop_table("captcha_store")
