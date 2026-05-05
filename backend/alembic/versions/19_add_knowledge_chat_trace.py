"""Add persisted execution trace to knowledge-chat messages.

Revision ID: 19
Revises: 18
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "19"
down_revision: Union[str, None] = "18"
branch_labels: Union[str, tuple[str, ...], None] = None
depends_on: Union[str, tuple[str, ...], None] = None


def upgrade() -> None:
    op.add_column(
        "kb_chat_messages",
        sa.Column("trace", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("kb_chat_messages", "trace")
