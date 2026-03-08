"""add circle_profiles table

Revision ID: 10
Revises: 9
Create Date: 2026-03-08 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "10"
down_revision: Union[str, None] = "9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "circle_profiles",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "circle_id",
            sa.Integer(),
            sa.ForeignKey("study_circles.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("profile_data", JSONB(), nullable=False, server_default="{}"),
        sa.Column("member_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_calculated_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_circle_profiles_circle_id", "circle_profiles", ["circle_id"])


def downgrade() -> None:
    op.drop_index("ix_circle_profiles_circle_id", table_name="circle_profiles")
    op.drop_table("circle_profiles")
