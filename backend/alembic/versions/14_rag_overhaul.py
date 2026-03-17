"""RAG overhaul — Parent-Child chunking columns + kb_document_outlines table.

Revision ID: 14
Revises: 13
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "14"
down_revision: Union[str, None] = "13"
branch_labels: Union[str, tuple[str, ...], None] = None
depends_on: Union[str, tuple[str, ...], None] = None


def upgrade() -> None:
    # KBChunk — new structural columns
    op.add_column("kb_chunks", sa.Column("parent_chunk_id", sa.Integer(), nullable=True))
    op.add_column(
        "kb_chunks",
        sa.Column("chunk_level", sa.String(10), nullable=False, server_default="child"),
    )
    op.add_column("kb_chunks", sa.Column("document_title", sa.String(500), nullable=True))
    op.add_column("kb_chunks", sa.Column("section_path", sa.String(1000), nullable=True))
    op.add_column("kb_chunks", sa.Column("heading", sa.String(500), nullable=True))

    op.create_index("ix_kb_chunks_section_path", "kb_chunks", ["section_path"])
    op.create_index("ix_kb_chunks_parent_chunk_id", "kb_chunks", ["parent_chunk_id"])
    op.create_foreign_key(
        "fk_kb_chunks_parent",
        "kb_chunks",
        "kb_chunks",
        ["parent_chunk_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Data migration: promote section_path and heading from metadata JSON to dedicated columns
    op.execute("""
        UPDATE kb_chunks
        SET section_path = metadata->>'section_path',
            heading      = metadata->>'heading'
        WHERE metadata IS NOT NULL
    """)

    # New table: kb_document_outlines
    op.create_table(
        "kb_document_outlines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "document_id",
            sa.Integer(),
            sa.ForeignKey("kb_documents.id", ondelete="CASCADE"),
            unique=True,
            nullable=False,
        ),
        sa.Column(
            "knowledge_base_id",
            sa.Integer(),
            sa.ForeignKey("knowledge_bases.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("outline", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("extracted_at", sa.DateTime(), nullable=False),
        sa.Column("model_used", sa.String(100), nullable=True),
    )
    op.create_index(
        "ix_kb_document_outlines_kb_id", "kb_document_outlines", ["knowledge_base_id"]
    )


def downgrade() -> None:
    op.drop_table("kb_document_outlines")
    op.drop_constraint("fk_kb_chunks_parent", "kb_chunks", type_="foreignkey")
    op.drop_index("ix_kb_chunks_section_path", "kb_chunks")
    op.drop_index("ix_kb_chunks_parent_chunk_id", "kb_chunks")
    for col in ["parent_chunk_id", "chunk_level", "document_title", "section_path", "heading"]:
        op.drop_column("kb_chunks", col)
