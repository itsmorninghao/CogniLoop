"""数据库连接和会话管理"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from backend.app.core.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=settings.log_level == "DEBUG",
    pool_size=settings.db_pool_min_size,
    max_overflow=settings.db_pool_max_size - settings.db_pool_min_size,
    pool_recycle=settings.db_pool_max_inactive_time,
    pool_pre_ping=True,
)

async_session_factory = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """依赖注入：获取数据库会话"""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
