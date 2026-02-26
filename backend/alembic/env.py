"""Alembic 迁移环境配置"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlmodel import SQLModel

from backend.app.core.config import settings

# 导入所有模型以确保它们被注册
from backend.app.models import (  # noqa: F401
    Answer,
    ConfigAuditLog,
    Course,
    Document,
    ExamPaper,
    ExamPaperGenerationJob,
    ExamQuestion,
    ExamQuestionDraftLog,
    KnowledgeChunk,
    QuestionSet,
    Student,
    StudentCourse,
    StudentQuestionSet,
    SystemConfig,
    Teacher,
    TeacherExamPermission,
)

# 目标元数据
target_metadata = SQLModel.metadata


def get_config() -> object:
    """获取 Alembic 配置对象"""
    config = context.config
    # 设置数据库 URL
    config.set_main_option("sqlalchemy.url", settings.database_url)
    # 配置日志
    if config.config_file_name is not None:
        fileConfig(config.config_file_name)
    return config


def run_migrations_offline() -> None:
    """以离线模式运行迁移"""
    config = get_config()
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    """执行迁移"""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """以异步模式运行迁移"""
    config = get_config()
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """以在线模式运行迁移"""
    asyncio.run(run_async_migrations())


# Alembic 执行逻辑
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
