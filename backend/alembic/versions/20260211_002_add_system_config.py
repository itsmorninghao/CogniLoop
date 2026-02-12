"""新增系统配置表和审计日志表，向量列移除固定维度约束

Revision ID: 002
Revises: 001
Create Date: 2026-02-11

本迁移执行三项操作：
1. 创建 system_configs 表 —— 存储可在线管理的配置项
2. 创建 config_audit_logs 表 —— 记录配置变更审计日志
3. 将 knowledge_chunks.embedding 列从固定维度改为可变维度
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op
from pgvector.sqlalchemy import Vector

# revision identifiers, used by Alembic.
revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. 创建系统配置表
    op.create_table(
        "system_configs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "key",
            sqlmodel.sql.sqltypes.AutoString(length=100),
            nullable=False,
        ),
        sa.Column(
            "value",
            sqlmodel.sql.sqltypes.AutoString(length=2000),
            nullable=False,
        ),
        sa.Column(
            "group",
            sqlmodel.sql.sqltypes.AutoString(length=50),
            nullable=False,
        ),
        sa.Column(
            "description",
            sqlmodel.sql.sqltypes.AutoString(length=200),
            nullable=False,
            server_default="",
        ),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_system_configs_key", "system_configs", ["key"], unique=True)
    op.create_index("ix_system_configs_group", "system_configs", ["group"])

    # 2. 创建配置变更审计日志表
    op.create_table(
        "config_audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("admin_id", sa.Integer(), nullable=False),
        sa.Column(
            "admin_username",
            sqlmodel.sql.sqltypes.AutoString(length=50),
            nullable=False,
        ),
        sa.Column(
            "config_key",
            sqlmodel.sql.sqltypes.AutoString(length=100),
            nullable=False,
        ),
        sa.Column(
            "old_value",
            sqlmodel.sql.sqltypes.AutoString(length=2000),
            nullable=True,
        ),
        sa.Column(
            "new_value",
            sqlmodel.sql.sqltypes.AutoString(length=2000),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_config_audit_logs_admin_id", "config_audit_logs", ["admin_id"])
    op.create_index(
        "ix_config_audit_logs_config_key", "config_audit_logs", ["config_key"]
    )

    # 3. 将 embedding 列从固定维度改为可变维度
    # 这样更换 Embedding 模型（维度变化）时无需 ALTER 列，只需重新向量化
    op.alter_column(
        "knowledge_chunks",
        "embedding",
        type_=Vector(),
        existing_type=Vector(768),
        existing_nullable=True,
    )


def downgrade() -> None:
    # 恢复 embedding 列为固定维度
    op.alter_column(
        "knowledge_chunks",
        "embedding",
        type_=Vector(768),
        existing_type=Vector(),
        existing_nullable=True,
    )

    op.drop_index("ix_config_audit_logs_config_key", table_name="config_audit_logs")
    op.drop_index("ix_config_audit_logs_admin_id", table_name="config_audit_logs")
    op.drop_table("config_audit_logs")

    op.drop_index("ix_system_configs_group", table_name="system_configs")
    op.drop_index("ix_system_configs_key", table_name="system_configs")
    op.drop_table("system_configs")
