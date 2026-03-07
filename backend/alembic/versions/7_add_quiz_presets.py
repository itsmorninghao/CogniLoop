"""add quiz_presets table

Revision ID: 7
Revises: 6
Create Date: 2026-03-07 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "7"
down_revision: Union[str, None] = "6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "quiz_presets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column(
            "difficulty", sa.String(), nullable=False, server_default="medium"
        ),
        sa.Column(
            "question_counts", sa.JSON(), nullable=False, server_default="{}"
        ),
        sa.Column("subject", sa.String(), nullable=True),
        sa.Column("custom_prompt", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_quiz_presets_user_id", "quiz_presets", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_quiz_presets_user_id", table_name="quiz_presets")
    op.drop_table("quiz_presets")
