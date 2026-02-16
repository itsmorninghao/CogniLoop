"""添加题目广场相关字段

Revision ID: 005
Revises: 004
Create Date: 2026-02-15

- question_sets 表新增 shared_to_plaza_at 字段（广场上架时间）
- answers 表 student_id 改为 nullable（支持教师做题）
- answers 表新增 teacher_id 字段（教师做广场题时写入）
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "005"
down_revision: str = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """添加广场相关字段"""
    # QuestionSet: 新增 shared_to_plaza_at
    op.add_column(
        "question_sets",
        sa.Column("shared_to_plaza_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_question_sets_shared_to_plaza_at",
        "question_sets",
        ["shared_to_plaza_at"],
    )

    # Answer: student_id 改为 nullable
    op.alter_column(
        "answers",
        "student_id",
        existing_type=sa.Integer(),
        nullable=True,
    )

    # Answer: 新增 teacher_id
    op.add_column(
        "answers",
        sa.Column("teacher_id", sa.Integer(), sa.ForeignKey("teachers.id"), nullable=True),
    )
    op.create_index("ix_answers_teacher_id", "answers", ["teacher_id"])


def downgrade() -> None:
    """回滚广场相关字段"""
    op.drop_index("ix_answers_teacher_id", table_name="answers")
    op.drop_column("answers", "teacher_id")

    op.alter_column(
        "answers",
        "student_id",
        existing_type=sa.Integer(),
        nullable=False,
    )

    op.drop_index("ix_question_sets_shared_to_plaza_at", table_name="question_sets")
    op.drop_column("question_sets", "shared_to_plaza_at")
