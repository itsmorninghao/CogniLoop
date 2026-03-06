"""add is_public to study_circles

Revision ID: 3
Revises: 2
Create Date: 2026-03-05 10:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3"
down_revision: Union[str, None] = "2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "study_circles",
        sa.Column("is_public", sa.Boolean(), server_default="false", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("study_circles", "is_public")
