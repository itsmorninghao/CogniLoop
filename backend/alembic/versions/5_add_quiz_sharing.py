"""add quiz sharing fields and quiz_acquisitions table

Revision ID: 5
Revises: 4
Create Date: 2026-03-06 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = "5"
down_revision: Union[str, None] = "4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "quiz_sessions", sa.Column("share_code", sa.String(length=16), nullable=True)
    )
    op.add_column(
        "quiz_sessions", sa.Column("shared_to_plaza_at", sa.DateTime(), nullable=True)
    )
    op.create_index(
        "ix_quiz_sessions_share_code", "quiz_sessions", ["share_code"], unique=True
    )

    op.create_table(
        "quiz_acquisitions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "session_id",
            UUID(as_uuid=False),
            sa.ForeignKey("quiz_sessions.id"),
            nullable=False,
        ),
        sa.Column(
            "acquired_at", sa.DateTime(), nullable=False, server_default=sa.func.now()
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "session_id", name="uq_quiz_acquisitions_user_session"
        ),
    )
    op.create_index("ix_quiz_acquisitions_user_id", "quiz_acquisitions", ["user_id"])
    op.create_index(
        "ix_quiz_acquisitions_session_id", "quiz_acquisitions", ["session_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_quiz_acquisitions_session_id", table_name="quiz_acquisitions")
    op.drop_index("ix_quiz_acquisitions_user_id", table_name="quiz_acquisitions")
    op.drop_table("quiz_acquisitions")
    op.drop_index("ix_quiz_sessions_share_code", table_name="quiz_sessions")
    op.drop_column("quiz_sessions", "shared_to_plaza_at")
    op.drop_column("quiz_sessions", "share_code")
