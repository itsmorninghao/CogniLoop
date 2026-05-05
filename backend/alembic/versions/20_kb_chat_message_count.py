"""Denormalize kb_chat_sessions.message_count and add (user_id, last_message_at desc) index.

Revision ID: 20
Revises: 19
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20"
down_revision: Union[str, None] = "19"
branch_labels: Union[str, tuple[str, ...], None] = None
depends_on: Union[str, tuple[str, ...], None] = None


def upgrade() -> None:
    op.add_column(
        "kb_chat_sessions",
        sa.Column(
            "message_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    # Backfill from messages table (cheap; chat is brand-new, low volume).
    op.execute(
        """
        UPDATE kb_chat_sessions s
        SET message_count = COALESCE(c.cnt, 0)
        FROM (
            SELECT session_id, COUNT(*) AS cnt
            FROM kb_chat_messages
            GROUP BY session_id
        ) c
        WHERE c.session_id = s.id
        """
    )
    op.create_index(
        "ix_kb_chat_sessions_user_last_message_at",
        "kb_chat_sessions",
        ["user_id", sa.text("last_message_at DESC")],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_kb_chat_sessions_user_last_message_at",
        table_name="kb_chat_sessions",
    )
    op.drop_column("kb_chat_sessions", "message_count")
