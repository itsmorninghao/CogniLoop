"""系统配置管理 API"""

import asyncio
import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from backend.app.api.v1.deps import CurrentAdmin, SessionDep
from backend.app.core.config import settings
from backend.app.services.config_service import (
    CONFIG_DEFINITIONS,
    EMBEDDING_CONFIG_KEYS,
    ConfigService,
    load_config_cache,
)

router = APIRouter()
logger = logging.getLogger(__name__)


class ConfigUpdateRequest(BaseModel):
    """配置更新请求 —— key:value 的字典"""

    configs: dict[str, str]


@router.get("/config")
async def get_all_configs(
    session: SessionDep,
    admin: CurrentAdmin,
) -> dict:
    """获取所有系统配置"""
    config_service = ConfigService(session)
    groups = await config_service.get_all_grouped()
    return {"groups": groups}


@router.put("/config")
async def update_configs(
    data: ConfigUpdateRequest,
    background_tasks: BackgroundTasks,
    session: SessionDep,
    admin: CurrentAdmin,
) -> dict:
    """
    批量更新系统配置。

    如果 Embedding 相关配置发生变更，会自动触发后台任务对所有已处理的文档进行重新向量化。
    """
    if not data.configs:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请提供要更新的配置项",
        )

    # 过滤掉非法 key，避免前端误传
    valid_configs = {k: v for k, v in data.configs.items() if k in CONFIG_DEFINITIONS}
    if not valid_configs:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="没有有效的配置项需要更新",
        )

    config_service = ConfigService(session)
    try:
        changed_keys = await config_service.update_configs(
            updates=valid_configs,
            admin_id=admin.id,
            admin_username=admin.username,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    # 如果 Embedding 相关配置发生了变更，触发后台重新向量化
    embedding_changed = changed_keys & EMBEDDING_CONFIG_KEYS
    revectorize_triggered = False
    if embedding_changed:
        logger.info(f"Embedding 配置变更: {embedding_changed}，将触发重新向量化")
        background_tasks.add_task(_run_revectorize_sync)
        revectorize_triggered = True

    return {
        "message": "配置更新成功",
        "changed_keys": sorted(changed_keys),
        "revectorize_triggered": revectorize_triggered,
    }


@router.get("/config/audit-logs")
async def get_audit_logs(
    session: SessionDep,
    admin: CurrentAdmin,
    skip: int = 0,
    limit: int = 50,
) -> dict:
    """获取配置变更审计日志"""
    config_service = ConfigService(session)
    logs, total = await config_service.get_audit_logs(skip, limit)
    return {
        "items": [
            {
                "id": log.id,
                "admin_id": log.admin_id,
                "admin_username": log.admin_username,
                "config_key": log.config_key,
                "old_value": log.old_value,
                "new_value": log.new_value,
                "created_at": log.created_at.isoformat(),
            }
            for log in logs
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


def _run_revectorize_sync() -> None:
    """
    在新事件循环中运行重新向量化任务（同步包装器）。

    Starlette 的 BackgroundTasks 在线程池中执行同步函数，所以需要创建独立的事件循环来运行异步代码。
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(_run_revectorize_async())
    finally:
        loop.close()


async def _run_revectorize_async() -> None:
    """
    重新向量化所有已完成处理的文档。

    当 Embedding 模型配置变更后触发，流程：
    1. 获取所有状态为 COMPLETED 的文档
    2. 逐个删除旧向量 → 重新处理（解析+分块+向量化+存储）
    3. 使用独立的数据库连接，避免影响主应用的请求处理
    """
    # 不与主应用共享连接池
    engine = create_async_engine(
        settings.database_url,
        echo=False,
        pool_pre_ping=True,
    )
    async_session_factory = sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with async_session_factory() as session:
        try:
            # 确保后台任务使用最新的配置缓存
            await load_config_cache(session)

            from backend.app.models.document import Document, DocumentStatus
            from backend.app.models.knowledge_chunk import KnowledgeChunk
            from backend.app.rag.processor import DocumentProcessor

            # 获取所有已完成处理的文档
            stmt = select(Document).where(Document.status == DocumentStatus.COMPLETED)
            result = await session.execute(stmt)
            documents = list(result.scalars().all())

            if not documents:
                logger.info("没有需要重新向量化的文档")
                return

            logger.info(f"开始重新向量化，共 {len(documents)} 个文档")

            success_count = 0
            fail_count = 0
            processor = DocumentProcessor(session)

            for document in documents:
                try:
                    # 删除旧的知识块
                    delete_stmt = delete(KnowledgeChunk).where(
                        KnowledgeChunk.document_id == document.id
                    )
                    await session.execute(delete_stmt)

                    # 标记为处理中
                    document.status = DocumentStatus.PROCESSING
                    document.chunk_count = 0
                    await session.commit()

                    # 重新处理文档
                    success = await processor.process_document(document.id)
                    await session.commit()

                    if success:
                        success_count += 1
                        logger.info(
                            f"文档 {document.id} ({document.filename}) 重新向量化成功"
                        )
                    else:
                        fail_count += 1
                        logger.warning(
                            f"文档 {document.id} ({document.filename}) 重新向量化失败"
                        )
                except Exception as e:
                    fail_count += 1
                    logger.error(
                        f"文档 {document.id} 重新向量化异常: {e}",
                        exc_info=True,
                    )
                    await session.rollback()

            logger.info(f"重新向量化任务完成：成功 {success_count}，失败 {fail_count}")

        except Exception as e:
            logger.error(f"重新向量化任务异常: {e}", exc_info=True)
            await session.rollback()
        finally:
            await engine.dispose()
