"""System config service — runtime config from DB."""

from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from backend.app.core.exceptions import NotFoundError
from backend.app.models.system_config import SystemConfig

# Keys whose values are encrypted at rest
SENSITIVE_KEYS = {"OPENAI_API_KEY", "EMBEDDING_API_KEY", "LINUX_DO_CLIENT_SECRET", "OCR_API_KEY"}

SENSITIVE_PLACEHOLDER_PREFIX = "****"


def _is_sensitive(key: str) -> bool:
    """Check if a config key holds a sensitive value (exact match or PRO_NODE_*_API_KEY)."""
    return key in SENSITIVE_KEYS or (key.startswith("PRO_NODE_") and key.endswith("_API_KEY"))


def mask_value(value: str) -> str:
    """Return masked representation: ****<last4>. Empty string for empty/None values."""
    if not value:
        return ""
    suffix = value[-4:] if len(value) >= 4 else value
    return f"{SENSITIVE_PLACEHOLDER_PREFIX}{suffix}"


def is_masked(value: str) -> bool:
    """Check if value is a masked placeholder (starts with ****)."""
    return value.startswith(SENSITIVE_PLACEHOLDER_PREFIX)


async def get_config(key: str, session: AsyncSession) -> str | None:
    """Get a single config value by key (decrypted if sensitive)."""
    result = await session.execute(select(SystemConfig).where(SystemConfig.key == key))
    cfg = result.scalar_one_or_none()
    if cfg is None:
        return None
    if _is_sensitive(key) and cfg.value:
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
    if _is_sensitive(key):
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


async def list_configs(session: AsyncSession) -> list[dict]:
    """List all configs, masking sensitive values."""
    result = await session.execute(select(SystemConfig).order_by(SystemConfig.key))
    configs = list(result.scalars().all())
    out: list[dict] = []
    for c in configs:
        d = {
            "id": c.id,
            "key": c.key,
            "value": c.value,
            "description": c.description,
            "updated_at": c.updated_at,
        }
        if _is_sensitive(c.key) and c.value:
            from backend.app.core.encryption import decrypt

            try:
                plain = decrypt(c.value)
                d["value"] = mask_value(plain)
            except Exception:
                d["value"] = SENSITIVE_PLACEHOLDER_PREFIX
        out.append(d)
    return out


async def delete_config(key: str, session: AsyncSession) -> None:
    result = await session.execute(select(SystemConfig).where(SystemConfig.key == key))
    cfg = result.scalar_one_or_none()
    if not cfg:
        raise NotFoundError(f"System config '{key}'")
    await session.delete(cfg)
