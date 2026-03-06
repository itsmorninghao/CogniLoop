"""Auth endpoint tests — register, login, /auth/me."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_and_login(client: AsyncClient):
    """Registering a new user and logging in should succeed."""
    reg = await client.post(
        "/api/v2/auth/register",
        json={
            "username": "authtest",
            "email": "authtest@example.com",
            "password": "password123",
            "full_name": "Auth Test",
        },
    )
    assert reg.status_code in (200, 201, 409)  # 409 if already exists

    login = await client.post(
        "/api/v2/auth/login",
        json={
            "username": "authtest",
            "password": "password123",
        },
    )
    assert login.status_code == 200
    data = login.json()
    assert "access_token" in data


@pytest.mark.asyncio
async def test_me_requires_auth(client: AsyncClient):
    """/auth/me without token should return 401."""
    resp = await client.get("/api/v2/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_with_valid_token(client: AsyncClient, auth_headers: dict):
    """/auth/me with valid token should return user info."""
    resp = await client.get("/api/v2/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "username" in data
    assert "email" in data
