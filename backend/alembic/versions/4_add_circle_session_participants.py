"""add circle_session_participants table

Revision ID: 4
Revises: 3
Create Date: 2026-03-06 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = '4'
down_revision: Union[str, None] = '3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'circle_session_participants',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('session_id', UUID(as_uuid=False), sa.ForeignKey('quiz_sessions.id'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='in_progress'),
        sa.Column('accuracy', sa.Float(), nullable=True),
        sa.Column('total_score', sa.Float(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('session_id', 'user_id', name='uq_circle_session_participants_session_user'),
    )
    op.create_index('ix_circle_session_participants_session_id', 'circle_session_participants', ['session_id'])
    op.create_index('ix_circle_session_participants_user_id', 'circle_session_participants', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_circle_session_participants_user_id', table_name='circle_session_participants')
    op.drop_index('ix_circle_session_participants_session_id', table_name='circle_session_participants')
    op.drop_table('circle_session_participants')
