"""Add exam template tables.

Revision ID: 12
Revises: 11
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "12"
down_revision: Union[str, None] = "11"
branch_labels: Union[str, tuple[str, ...], None] = None
depends_on: Union[str, tuple[str, ...], None] = None


def upgrade() -> None:
    op.create_table(
        "exam_templates",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("subject", sa.String(100), nullable=True),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("source_template_id", sa.Integer(), sa.ForeignKey("exam_templates.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "exam_template_slots",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("template_id", sa.Integer(), sa.ForeignKey("exam_templates.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("question_type", sa.String(30), nullable=False),
        sa.Column("label", sa.String(200), nullable=True),
        sa.Column("difficulty_hint", sa.String(20), nullable=True),
        sa.UniqueConstraint("template_id", "position", name="uq_template_slot_position"),
    )

    op.create_table(
        "exam_template_slot_questions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("slot_id", sa.Integer(), sa.ForeignKey("exam_template_slots.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("analysis", sa.Text(), nullable=True),
        sa.Column("difficulty", sa.String(20), nullable=True),
        sa.Column("knowledge_points", sa.JSON(), nullable=True),
        sa.Column("source_label", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("exam_template_slot_questions")
    op.drop_table("exam_template_slots")
    op.drop_table("exam_templates")
