"""Add theme column to courses table.

Revision ID: 17
Revises: 16
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "17"
down_revision: Union[str, None] = "16"
branch_labels: Union[str, tuple[str, ...], None] = None
depends_on: Union[str, tuple[str, ...], None] = None


def upgrade() -> None:
    op.add_column(
        "courses",
        sa.Column("theme", sa.String(30), server_default="tech-dark", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("courses", "theme")
