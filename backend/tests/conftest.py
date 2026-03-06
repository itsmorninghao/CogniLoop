"""Test fixtures for CogniLoop backend tests."""

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel

TEST_DB_URL = "postgresql+asyncpg://cogniloop:test@localhost:5432/cogniloop_test"


@pytest_asyncio.fixture(scope="session")
async def engine() -> AsyncEngine:
    e = create_async_engine(TEST_DB_URL, echo=False)
    async with e.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield e
    async with e.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await e.dispose()


@pytest_asyncio.fixture
async def client(engine: AsyncEngine):
    """HTTP test client with app's DB overridden to the test DB."""
    from backend.app.core import config as cfg_module

    original_url = cfg_module.settings.DATABASE_URL
    cfg_module.settings.DATABASE_URL = TEST_DB_URL  # type: ignore[misc]

    # Override the session factory used by the app
    from backend.app.core import database as db_module

    test_factory = async_sessionmaker(engine, expire_on_commit=False)
    original_factory = db_module.async_session_factory
    db_module.async_session_factory = test_factory

    from backend.app.main import app

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c

    db_module.async_session_factory = original_factory
    cfg_module.settings.DATABASE_URL = original_url  # type: ignore[misc]


@pytest_asyncio.fixture
async def auth_headers(client: AsyncClient) -> dict[str, str]:
    """Register a test user and return Authorization headers."""
    payload = {
        "username": "testuser",
        "email": "test@example.com",
        "password": "testpassword123",
        "full_name": "Test User",
    }
    # Register (may already exist)
    await client.post("/api/v2/auth/register", json=payload)
    # Login
    resp = await client.post(
        "/api/v2/auth/login",
        json={
            "username": payload["username"],
            "password": payload["password"],
        },
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
