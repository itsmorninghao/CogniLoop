"""add knowledge_points to quiz_questions

Revision ID: 8
Revises: 7
Create Date: 2026-03-07 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "8"
down_revision: Union[str, None] = "7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "quiz_questions",
        sa.Column("knowledge_points", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("quiz_questions", "knowledge_points")
