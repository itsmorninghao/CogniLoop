"""add cascade deletes for bank_questions and kb_acquisitions

Revision ID: 11
Revises: 10
Create Date: 2026-03-08 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "11"
down_revision: Union[str, None] = "10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # bank_questions.knowledge_base_id → knowledge_bases.id
    op.drop_constraint(
        "bank_questions_knowledge_base_id_fkey", "bank_questions", type_="foreignkey"
    )
    op.create_foreign_key(
        "bank_questions_knowledge_base_id_fkey",
        "bank_questions",
        "knowledge_bases",
        ["knowledge_base_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # kb_acquisitions.knowledge_base_id → knowledge_bases.id
    op.drop_constraint(
        "kb_acquisitions_knowledge_base_id_fkey",
        "kb_acquisitions",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "kb_acquisitions_knowledge_base_id_fkey",
        "kb_acquisitions",
        "knowledge_bases",
        ["knowledge_base_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        "kb_acquisitions_knowledge_base_id_fkey",
        "kb_acquisitions",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "kb_acquisitions_knowledge_base_id_fkey",
        "kb_acquisitions",
        "knowledge_bases",
        ["knowledge_base_id"],
        ["id"],
    )

    op.drop_constraint(
        "bank_questions_knowledge_base_id_fkey", "bank_questions", type_="foreignkey"
    )
    op.create_foreign_key(
        "bank_questions_knowledge_base_id_fkey",
        "bank_questions",
        "knowledge_bases",
        ["knowledge_base_id"],
        ["id"],
    )
