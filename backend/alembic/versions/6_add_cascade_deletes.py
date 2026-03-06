"""add cascade deletes to foreign keys

Revision ID: 6
Revises: 5
Create Date: 2026-03-06 14:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = '6'
down_revision: Union[str, None] = '5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # kb_folders.knowledge_base_id → knowledge_bases.id
    op.drop_constraint('kb_folders_knowledge_base_id_fkey', 'kb_folders', type_='foreignkey')
    op.create_foreign_key(
        'kb_folders_knowledge_base_id_fkey', 'kb_folders', 'knowledge_bases',
        ['knowledge_base_id'], ['id'], ondelete='CASCADE',
    )

    # kb_documents.knowledge_base_id → knowledge_bases.id
    op.drop_constraint('kb_documents_knowledge_base_id_fkey', 'kb_documents', type_='foreignkey')
    op.create_foreign_key(
        'kb_documents_knowledge_base_id_fkey', 'kb_documents', 'knowledge_bases',
        ['knowledge_base_id'], ['id'], ondelete='CASCADE',
    )

    # kb_documents.folder_id → kb_folders.id
    op.drop_constraint('kb_documents_folder_id_fkey', 'kb_documents', type_='foreignkey')
    op.create_foreign_key(
        'kb_documents_folder_id_fkey', 'kb_documents', 'kb_folders',
        ['folder_id'], ['id'], ondelete='SET NULL',
    )

    # kb_chunks.document_id → kb_documents.id
    op.drop_constraint('kb_chunks_document_id_fkey', 'kb_chunks', type_='foreignkey')
    op.create_foreign_key(
        'kb_chunks_document_id_fkey', 'kb_chunks', 'kb_documents',
        ['document_id'], ['id'], ondelete='CASCADE',
    )

    # kb_chunks.knowledge_base_id → knowledge_bases.id
    op.drop_constraint('kb_chunks_knowledge_base_id_fkey', 'kb_chunks', type_='foreignkey')
    op.create_foreign_key(
        'kb_chunks_knowledge_base_id_fkey', 'kb_chunks', 'knowledge_bases',
        ['knowledge_base_id'], ['id'], ondelete='CASCADE',
    )

    # notifications.user_id → users.id
    op.drop_constraint('notifications_user_id_fkey', 'notifications', type_='foreignkey')
    op.create_foreign_key(
        'notifications_user_id_fkey', 'notifications', 'users',
        ['user_id'], ['id'], ondelete='CASCADE',
    )

    # user_profiles.user_id → users.id
    op.drop_constraint('user_profiles_user_id_fkey', 'user_profiles', type_='foreignkey')
    op.create_foreign_key(
        'user_profiles_user_id_fkey', 'user_profiles', 'users',
        ['user_id'], ['id'], ondelete='CASCADE',
    )

    # profile_shares.user_id → users.id
    op.drop_constraint('profile_shares_user_id_fkey', 'profile_shares', type_='foreignkey')
    op.create_foreign_key(
        'profile_shares_user_id_fkey', 'profile_shares', 'users',
        ['user_id'], ['id'], ondelete='CASCADE',
    )

    # quiz_questions.session_id → quiz_sessions.id
    op.drop_constraint('quiz_questions_session_id_fkey', 'quiz_questions', type_='foreignkey')
    op.create_foreign_key(
        'quiz_questions_session_id_fkey', 'quiz_questions', 'quiz_sessions',
        ['session_id'], ['id'], ondelete='CASCADE',
    )

    # quiz_responses.session_id → quiz_sessions.id
    op.drop_constraint('quiz_responses_session_id_fkey', 'quiz_responses', type_='foreignkey')
    op.create_foreign_key(
        'quiz_responses_session_id_fkey', 'quiz_responses', 'quiz_sessions',
        ['session_id'], ['id'], ondelete='CASCADE',
    )

    # circle_members.circle_id → study_circles.id
    op.drop_constraint('circle_members_circle_id_fkey', 'circle_members', type_='foreignkey')
    op.create_foreign_key(
        'circle_members_circle_id_fkey', 'circle_members', 'study_circles',
        ['circle_id'], ['id'], ondelete='CASCADE',
    )

    # circle_session_participants.session_id → quiz_sessions.id
    op.drop_constraint('circle_session_participants_session_id_fkey', 'circle_session_participants', type_='foreignkey')
    op.create_foreign_key(
        'circle_session_participants_session_id_fkey', 'circle_session_participants', 'quiz_sessions',
        ['session_id'], ['id'], ondelete='CASCADE',
    )


def downgrade() -> None:
    # Reverse: remove CASCADE from all constraints

    op.drop_constraint('circle_session_participants_session_id_fkey', 'circle_session_participants', type_='foreignkey')
    op.create_foreign_key(
        'circle_session_participants_session_id_fkey', 'circle_session_participants', 'quiz_sessions',
        ['session_id'], ['id'],
    )

    op.drop_constraint('circle_members_circle_id_fkey', 'circle_members', type_='foreignkey')
    op.create_foreign_key(
        'circle_members_circle_id_fkey', 'circle_members', 'study_circles',
        ['circle_id'], ['id'],
    )

    op.drop_constraint('quiz_responses_session_id_fkey', 'quiz_responses', type_='foreignkey')
    op.create_foreign_key(
        'quiz_responses_session_id_fkey', 'quiz_responses', 'quiz_sessions',
        ['session_id'], ['id'],
    )

    op.drop_constraint('quiz_questions_session_id_fkey', 'quiz_questions', type_='foreignkey')
    op.create_foreign_key(
        'quiz_questions_session_id_fkey', 'quiz_questions', 'quiz_sessions',
        ['session_id'], ['id'],
    )

    op.drop_constraint('profile_shares_user_id_fkey', 'profile_shares', type_='foreignkey')
    op.create_foreign_key(
        'profile_shares_user_id_fkey', 'profile_shares', 'users',
        ['user_id'], ['id'],
    )

    op.drop_constraint('user_profiles_user_id_fkey', 'user_profiles', type_='foreignkey')
    op.create_foreign_key(
        'user_profiles_user_id_fkey', 'user_profiles', 'users',
        ['user_id'], ['id'],
    )

    op.drop_constraint('notifications_user_id_fkey', 'notifications', type_='foreignkey')
    op.create_foreign_key(
        'notifications_user_id_fkey', 'notifications', 'users',
        ['user_id'], ['id'],
    )

    op.drop_constraint('kb_chunks_knowledge_base_id_fkey', 'kb_chunks', type_='foreignkey')
    op.create_foreign_key(
        'kb_chunks_knowledge_base_id_fkey', 'kb_chunks', 'knowledge_bases',
        ['knowledge_base_id'], ['id'],
    )

    op.drop_constraint('kb_chunks_document_id_fkey', 'kb_chunks', type_='foreignkey')
    op.create_foreign_key(
        'kb_chunks_document_id_fkey', 'kb_chunks', 'kb_documents',
        ['document_id'], ['id'],
    )

    op.drop_constraint('kb_documents_folder_id_fkey', 'kb_documents', type_='foreignkey')
    op.create_foreign_key(
        'kb_documents_folder_id_fkey', 'kb_documents', 'kb_folders',
        ['folder_id'], ['id'],
    )

    op.drop_constraint('kb_documents_knowledge_base_id_fkey', 'kb_documents', type_='foreignkey')
    op.create_foreign_key(
        'kb_documents_knowledge_base_id_fkey', 'kb_documents', 'knowledge_bases',
        ['knowledge_base_id'], ['id'],
    )

    op.drop_constraint('kb_folders_knowledge_base_id_fkey', 'kb_folders', type_='foreignkey')
    op.create_foreign_key(
        'kb_folders_knowledge_base_id_fkey', 'kb_folders', 'knowledge_bases',
        ['knowledge_base_id'], ['id'],
    )
