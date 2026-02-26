"""数据库连接和会话管理"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from backend.app.core.config import settings

_POOL_SIZE = 5
_MAX_OVERFLOW = 15
_POOL_RECYCLE_SECONDS = 300
_POOL_TIMEOUT_SECONDS = 10       # 等待连接池空闲最多 10s，超时抛 TimeoutError
_CONNECT_TIMEOUT_SECONDS = 10    # asyncpg 建立 TCP 连接超时 10s
_COMMAND_TIMEOUT_SECONDS = 30    # asyncpg 单条 SQL 执行超时 30s

engine = create_async_engine(
    settings.database_url,
    echo=settings.log_level == "DEBUG",
    pool_size=_POOL_SIZE,
    max_overflow=_MAX_OVERFLOW,
    pool_recycle=_POOL_RECYCLE_SECONDS,
    pool_pre_ping=True,
    pool_timeout=_POOL_TIMEOUT_SECONDS,
    connect_args={
        "timeout": _CONNECT_TIMEOUT_SECONDS,
        "command_timeout": _COMMAND_TIMEOUT_SECONDS,
    },
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
