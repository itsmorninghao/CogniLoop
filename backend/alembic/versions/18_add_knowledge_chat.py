"""Add knowledge-chat sessions and messages.

Revision ID: 18
Revises: 17
"""

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "18"
down_revision: Union[str, None] = "17"
branch_labels: Union[str, tuple[str, ...], None] = None
depends_on: Union[str, tuple[str, ...], None] = None


def upgrade() -> None:
    op.create_table(
        "kb_chat_sessions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=False),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "knowledge_base_id",
            sa.Integer(),
            sa.ForeignKey("knowledge_bases.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("scope", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="idle"),
        sa.Column("last_message_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_kb_chat_sessions_user_id", "kb_chat_sessions", ["user_id"])
    op.create_index(
        "ix_kb_chat_sessions_knowledge_base_id",
        "kb_chat_sessions",
        ["knowledge_base_id"],
    )

    op.create_table(
        "kb_chat_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("kb_chat_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="complete",
        ),
        sa.Column("citations", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("retrieval_query", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_kb_chat_messages_session_id", "kb_chat_messages", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_kb_chat_messages_session_id", table_name="kb_chat_messages")
    op.drop_table("kb_chat_messages")

    op.drop_index(
        "ix_kb_chat_sessions_knowledge_base_id", table_name="kb_chat_sessions"
    )
    op.drop_index("ix_kb_chat_sessions_user_id", table_name="kb_chat_sessions")
    op.drop_table("kb_chat_sessions")
