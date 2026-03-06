"""Application-layer encryption for sensitive config values (API keys)."""

import logging

from cryptography.fernet import Fernet, InvalidToken

from backend.app.core.config import settings

logger = logging.getLogger(__name__)
_cipher: Fernet | None = None


def _get_cipher() -> Fernet | None:
    if not settings.ENCRYPTION_KEY:
        return None
    global _cipher
    if _cipher is None:
        try:
            _cipher = Fernet(settings.ENCRYPTION_KEY.encode())
        except (ValueError, Exception):
            logger.warning(
                "ENCRYPTION_KEY is set but invalid (not a Fernet key) — "
                "encryption disabled. Set ENCRYPTION_KEY= to suppress this warning, "
                'or generate a valid key: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
            )
            return None
    return _cipher


def encrypt(value: str) -> str:
    """Encrypt a string value. Returns plaintext unchanged if no key configured."""
    cipher = _get_cipher()
    return cipher.encrypt(value.encode()).decode() if cipher else value


def decrypt(value: str) -> str:
    """Decrypt a Fernet-encrypted string. Returns value unchanged if no key or decryption fails."""
    cipher = _get_cipher()
    if not cipher:
        return value
    try:
        return cipher.decrypt(value.encode()).decode()
    except (InvalidToken, Exception):
        return value  # backwards-compatible: unencrypted legacy values pass through
