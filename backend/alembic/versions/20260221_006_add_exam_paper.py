"""新增仿高考组卷相关表

Revision ID: 006
Revises: 005
Create Date: 2026-02-21

新增 5 张表：
- teacher_exam_permissions  教师仿高考组卷授权
- exam_papers               历年试卷元数据
- exam_questions            历年试题（含 pgvector embedding）
- exam_paper_generation_jobs  组卷任务
- exam_question_draft_logs    单题生成过程日志
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: str = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 确保 pgvector 扩展已启用
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # ------------------------------------------------------------------ #
    # teacher_exam_permissions
    # ------------------------------------------------------------------ #
    op.create_table(
        "teacher_exam_permissions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "teacher_id", sa.Integer(), sa.ForeignKey("teachers.id"), nullable=False
        ),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "granted_by", sa.Integer(), sa.ForeignKey("admins.id"), nullable=True
        ),
        sa.Column("granted_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column("token_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("monthly_quota", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "teacher_id", name="uq_teacher_exam_permissions_teacher_id"
        ),
    )
    op.create_index(
        "ix_teacher_exam_permissions_teacher_id",
        "teacher_exam_permissions",
        ["teacher_id"],
    )

    # ------------------------------------------------------------------ #
    # exam_papers
    # ------------------------------------------------------------------ #
    op.create_table(
        "exam_papers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("subject", sa.String(50), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("region", sa.String(100), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("total_score", sa.Float(), nullable=True),
        sa.Column("question_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "source", sa.String(50), nullable=False, server_default="gaokao_bench"
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_exam_papers_subject", "exam_papers", ["subject"])
    op.create_index("ix_exam_papers_year", "exam_papers", ["year"])
    op.create_index("ix_exam_papers_region", "exam_papers", ["region"])

    # ------------------------------------------------------------------ #
    # exam_questions
    # ------------------------------------------------------------------ #
    op.create_table(
        "exam_questions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "exam_paper_id",
            sa.Integer(),
            sa.ForeignKey("exam_papers.id"),
            nullable=True,
        ),
        sa.Column("subject", sa.String(50), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("region", sa.String(100), nullable=False),
        sa.Column("question_type", sa.String(50), nullable=False),
        sa.Column("position_index", sa.Integer(), nullable=False),
        sa.Column("position_label", sa.String(100), nullable=False),
        sa.Column("knowledge_points", sa.Text(), nullable=True),
        sa.Column(
            "difficulty_level", sa.String(20), nullable=False, server_default="medium"
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("analysis", sa.Text(), nullable=True),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    # pgvector 类型须通过原始 SQL 添加，SQLAlchemy DDL 不直接支持
    op.execute("ALTER TABLE exam_questions ADD COLUMN embedding vector")

    op.create_index("ix_exam_questions_subject", "exam_questions", ["subject"])
    op.create_index("ix_exam_questions_year", "exam_questions", ["year"])
    op.create_index("ix_exam_questions_region", "exam_questions", ["region"])
    op.create_index(
        "ix_exam_questions_question_type", "exam_questions", ["question_type"]
    )
    op.create_index(
        "ix_exam_questions_position_index", "exam_questions", ["position_index"]
    )
    op.create_index(
        "ix_exam_questions_exam_paper_id", "exam_questions", ["exam_paper_id"]
    )

    # ------------------------------------------------------------------ #
    # exam_paper_generation_jobs
    # ------------------------------------------------------------------ #
    op.create_table(
        "exam_paper_generation_jobs",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column(
            "teacher_id", sa.Integer(), sa.ForeignKey("teachers.id"), nullable=False
        ),
        sa.Column(
            "course_id", sa.Integer(), sa.ForeignKey("courses.id"), nullable=False
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("requirement", sa.Text(), nullable=False),
        sa.Column("progress", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("warnings", sa.Text(), nullable=False, server_default="[]"),
        sa.Column(
            "completed_questions", sa.Text(), nullable=False, server_default="{}"
        ),
        sa.Column(
            "question_set_id",
            sa.Integer(),
            sa.ForeignKey("question_sets.id"),
            nullable=True,
        ),
        sa.Column("token_consumed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("resume_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_exam_paper_generation_jobs_teacher_id",
        "exam_paper_generation_jobs",
        ["teacher_id"],
    )
    op.create_index(
        "ix_exam_paper_generation_jobs_course_id",
        "exam_paper_generation_jobs",
        ["course_id"],
    )

    # ------------------------------------------------------------------ #
    # exam_question_draft_logs
    # ------------------------------------------------------------------ #
    op.create_table(
        "exam_question_draft_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "job_id",
            sa.String(36),
            sa.ForeignKey("exam_paper_generation_jobs.id"),
            nullable=False,
        ),
        sa.Column("position_index", sa.Integer(), nullable=False),
        sa.Column("question_type", sa.String(50), nullable=False),
        sa.Column("knowledge_point", sa.String(200), nullable=True),
        sa.Column("final_content", sa.Text(), nullable=True),
        sa.Column("difficulty_coefficient", sa.Float(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("retry_history", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("skipped", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("finalized_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_exam_question_draft_logs_job_id", "exam_question_draft_logs", ["job_id"]
    )


def downgrade() -> None:
    op.drop_table("exam_question_draft_logs")
    op.drop_table("exam_paper_generation_jobs")
    op.drop_table("exam_questions")
    op.drop_table("exam_papers")
    op.drop_table("teacher_exam_permissions")
