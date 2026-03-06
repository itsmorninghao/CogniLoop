"""System config service — runtime config from DB."""

from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from backend.app.core.exceptions import NotFoundError
from backend.app.models.system_config import SystemConfig

# Keys whose values are encrypted at rest
SENSITIVE_KEYS = {"OPENAI_API_KEY", "EMBEDDING_API_KEY"}


async def get_config(key: str, session: AsyncSession) -> str | None:
    """Get a single config value by key (decrypted if sensitive)."""
    result = await session.execute(select(SystemConfig).where(SystemConfig.key == key))
    cfg = result.scalar_one_or_none()
    if cfg is None:
        return None
    if key in SENSITIVE_KEYS and cfg.value:
        from backend.app.core.encryption import decrypt

        return decrypt(cfg.value)
    return cfg.value


async def get_config_required(key: str, session: AsyncSession) -> str:
    """Get a config value or raise an error."""
    value = await get_config(key, session)
    if value is None:
        raise NotFoundError(f"System config '{key}'")
    return value


async def set_config(
    key: str, value: str, description: str | None, session: AsyncSession
) -> SystemConfig:
    """Upsert a config entry (encrypts sensitive values)."""
    if key in SENSITIVE_KEYS:
        from backend.app.core.encryption import encrypt

        stored_value = encrypt(value)
    else:
        stored_value = value

    result = await session.execute(select(SystemConfig).where(SystemConfig.key == key))
    cfg = result.scalar_one_or_none()
    if cfg:
        cfg.value = stored_value
        if description is not None:
            cfg.description = description
        cfg.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    else:
        cfg = SystemConfig(key=key, value=stored_value, description=description)
    session.add(cfg)
    await session.flush()
    await session.refresh(cfg)
    return cfg


async def list_configs(session: AsyncSession) -> list[SystemConfig]:
    result = await session.execute(select(SystemConfig).order_by(SystemConfig.key))
    return list(result.scalars().all())


async def delete_config(key: str, session: AsyncSession) -> None:
    result = await session.execute(select(SystemConfig).where(SystemConfig.key == key))
    cfg = result.scalar_one_or_none()
    if not cfg:
        raise NotFoundError(f"System config '{key}'")
    await session.delete(cfg)
