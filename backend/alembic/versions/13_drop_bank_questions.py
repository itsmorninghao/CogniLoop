"""Drop bank_questions table — replaced by exam template system.

Revision ID: 13
Revises: 12
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "13"
down_revision: Union[str, None] = "12"
branch_labels: Union[str, tuple[str, ...], None] = None
depends_on: Union[str, tuple[str, ...], None] = None


def upgrade() -> None:
    op.drop_table("bank_questions")


def downgrade() -> None:
    op.create_table(
        "bank_questions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("knowledge_base_id", sa.Integer(), sa.ForeignKey("knowledge_bases.id"), nullable=False),
        sa.Column("question_type", sa.String(30), nullable=False),
        sa.Column("subject", sa.String(100)),
        sa.Column("difficulty", sa.String(20)),
        sa.Column("knowledge_points", sa.JSON()),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("analysis", sa.Text()),
        sa.Column("source_info", sa.JSON()),
        sa.Column("embedding", sa.LargeBinary()),
        sa.Column("created_at", sa.DateTime()),
    )
    op.create_index("ix_bank_questions_knowledge_base_id", "bank_questions", ["knowledge_base_id"])
