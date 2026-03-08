"""add linux_do_id to users

Revision ID: 9
Revises: 8
Create Date: 2026-03-08 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "9"
down_revision: Union[str, None] = "8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("linux_do_id", sa.String(64), nullable=True),
    )
    op.create_unique_constraint("uq_users_linux_do_id", "users", ["linux_do_id"])
    op.create_index("ix_users_linux_do_id", "users", ["linux_do_id"])


def downgrade() -> None:
    op.drop_index("ix_users_linux_do_id", table_name="users")
    op.drop_constraint("uq_users_linux_do_id", "users", type_="unique")
    op.drop_column("users", "linux_do_id")
