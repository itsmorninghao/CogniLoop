"""exam_paper_generation_jobs 添加 trace_log 字段

Revision ID: 007
Revises: 006
Create Date: 2026-02-25
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "007"
down_revision: str = "006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "exam_paper_generation_jobs",
        sa.Column("trace_log", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("exam_paper_generation_jobs", "trace_log")
