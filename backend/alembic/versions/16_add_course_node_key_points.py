"""Add key_points and scope_note to course_nodes.

Revision ID: 16
Revises: 15
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "16"
down_revision: Union[str, None] = "15"
branch_labels: Union[str, tuple[str, ...], None] = None
depends_on: Union[str, tuple[str, ...], None] = None


def upgrade() -> None:
    op.add_column("course_nodes", sa.Column("key_points", sa.JSON(), nullable=True))
    op.add_column("course_nodes", sa.Column("scope_note", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("course_nodes", "scope_note")
    op.drop_column("course_nodes", "key_points")
