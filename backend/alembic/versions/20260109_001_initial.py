"""CogniLoop 初始化数据库结构

Revision ID: 001
Revises:
Create Date: 2026-01-09

本迁移脚本创建 CogniLoop 系统所需的全部数据库表结构。
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op
from pgvector.sqlalchemy import Vector

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """创建所有数据库表"""

    # 创建 pgvector 扩展
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # ==================== 用户表 ====================

    # 管理员表
    op.create_table(
        "admins",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("email", sa.String(length=100), nullable=False),
        sa.Column("hashed_password", sa.String(length=200), nullable=False),
        sa.Column("full_name", sa.String(length=100), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "is_super_admin", sa.Boolean(), nullable=False, server_default="false"
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_admins_username", "admins", ["username"], unique=True)
    op.create_index("ix_admins_email", "admins", ["email"], unique=True)

    # 教师表
    op.create_table(
        "teachers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "username", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False
        ),
        sa.Column(
            "email", sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False
        ),
        sa.Column(
            "hashed_password",
            sqlmodel.sql.sqltypes.AutoString(length=255),
            nullable=False,
        ),
        sa.Column(
            "full_name", sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_teachers_username", "teachers", ["username"], unique=True)
    op.create_index("ix_teachers_email", "teachers", ["email"], unique=True)

    # 学生表
    op.create_table(
        "students",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "username", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False
        ),
        sa.Column(
            "email", sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False
        ),
        sa.Column(
            "hashed_password",
            sqlmodel.sql.sqltypes.AutoString(length=255),
            nullable=False,
        ),
        sa.Column(
            "full_name", sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_students_username", "students", ["username"], unique=True)
    op.create_index("ix_students_email", "students", ["email"], unique=True)

    # ==================== 课程相关表 ====================

    # 课程表
    op.create_table(
        "courses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=200), nullable=False),
        sa.Column("code", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column(
            "invite_code", sqlmodel.sql.sqltypes.AutoString(length=6), nullable=False
        ),
        sa.Column("teacher_id", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["teacher_id"], ["teachers.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_courses_code", "courses", ["code"], unique=True)
    op.create_index("ix_courses_invite_code", "courses", ["invite_code"], unique=True)
    op.create_index("ix_courses_name", "courses", ["name"])
    op.create_index("ix_courses_teacher_id", "courses", ["teacher_id"])

    # 学生课程关联表
    op.create_table(
        "student_courses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("joined_at", sa.DateTime(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"]),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_student_courses_student_id", "student_courses", ["student_id"])
    op.create_index("ix_student_courses_course_id", "student_courses", ["course_id"])

    # ==================== 知识库相关表 ====================

    # 文档表
    op.create_table(
        "documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "filename", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False
        ),
        sa.Column(
            "original_filename",
            sqlmodel.sql.sqltypes.AutoString(length=255),
            nullable=False,
        ),
        sa.Column("file_type", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column(
            "file_path", sqlmodel.sql.sqltypes.AutoString(length=500), nullable=False
        ),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column(
            "subject", sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True
        ),
        sa.Column("chapter_id", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
            server_default="processing",
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("chunk_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_documents_course_id", "documents", ["course_id"])
    op.create_index("ix_documents_chapter_id", "documents", ["chapter_id"])

    # 知识块表
    embedding_dims = 768  # 初始部署时的向量维度
    op.create_table(
        "knowledge_chunks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(embedding_dims), nullable=True),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "subject", sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True
        ),
        sa.Column("chapter_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_knowledge_chunks_document_id", "knowledge_chunks", ["document_id"]
    )
    op.create_index("ix_knowledge_chunks_course_id", "knowledge_chunks", ["course_id"])
    op.create_index(
        "ix_knowledge_chunks_chapter_id", "knowledge_chunks", ["chapter_id"]
    )

    # ==================== 试题相关表 ====================

    # 试题集表
    op.create_table(
        "question_sets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "title", sqlmodel.sql.sqltypes.AutoString(length=200), nullable=False
        ),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "markdown_path",
            sqlmodel.sql.sqltypes.AutoString(length=500),
            nullable=False,
        ),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("teacher_id", sa.Integer(), nullable=False),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "status",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"]),
        sa.ForeignKeyConstraint(["teacher_id"], ["teachers.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_question_sets_course_id", "question_sets", ["course_id"])
    op.create_index("ix_question_sets_teacher_id", "question_sets", ["teacher_id"])

    # 学生试题集分配表
    op.create_table(
        "student_question_sets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("question_set_id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("assigned_by_teacher_id", sa.Integer(), nullable=False),
        sa.Column("assigned_at", sa.DateTime(), nullable=False),
        sa.Column("deadline", sa.DateTime(), nullable=True),  # 可为空
        sa.Column("is_completed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"]),
        sa.ForeignKeyConstraint(["question_set_id"], ["question_sets.id"]),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"]),
        sa.ForeignKeyConstraint(["assigned_by_teacher_id"], ["teachers.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_student_question_sets_student_id", "student_question_sets", ["student_id"]
    )
    op.create_index(
        "ix_student_question_sets_question_set_id",
        "student_question_sets",
        ["question_set_id"],
    )
    op.create_index(
        "ix_student_question_sets_course_id", "student_question_sets", ["course_id"]
    )

    # ==================== 答案表 ====================

    op.create_table(
        "answers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("question_set_id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("student_answers", sa.JSON(), nullable=True),
        sa.Column("grading_results", sa.JSON(), nullable=True),
        sa.Column("total_score", sa.Float(), nullable=True),
        sa.Column(
            "status",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("saved_at", sa.DateTime(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"]),
        sa.ForeignKeyConstraint(["question_set_id"], ["question_sets.id"]),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_answers_question_set_id", "answers", ["question_set_id"])
    op.create_index("ix_answers_student_id", "answers", ["student_id"])
    op.create_index("ix_answers_course_id", "answers", ["course_id"])


def downgrade() -> None:
    """删除所有数据库表"""
    op.drop_table("answers")
    op.drop_table("student_question_sets")
    op.drop_table("question_sets")
    op.drop_table("knowledge_chunks")
    op.drop_table("documents")
    op.drop_table("student_courses")
    op.drop_table("courses")
    op.drop_table("students")
    op.drop_table("teachers")
    op.drop_table("admins")
    op.execute("DROP EXTENSION IF EXISTS vector")
