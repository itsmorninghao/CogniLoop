"""Circle endpoint tests — H-5 regression (delete sets is_active=False)."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_circle(client: AsyncClient, auth_headers: dict):
    """Creating a circle should return the new circle with is_active=True."""
    resp = await client.post("/api/v2/circles/", json={
        "name": "Test Circle",
        "description": "A test study circle",
    }, headers=auth_headers)
    assert resp.status_code in (200, 201)
    data = resp.json()
    assert data["name"] == "Test Circle"
    assert data["is_active"] is True
    return data["id"]


@pytest.mark.asyncio
async def test_delete_circle_sets_inactive(client: AsyncClient, auth_headers: dict):
    """Deleting a circle should set is_active=False, not hard-delete it."""
    # Create circle
    create_resp = await client.post("/api/v2/circles/", json={
        "name": "Circle To Delete",
    }, headers=auth_headers)
    assert create_resp.status_code in (200, 201)
    circle_id = create_resp.json()["id"]

    # Delete circle
    del_resp = await client.delete(f"/api/v2/circles/{circle_id}", headers=auth_headers)
    assert del_resp.status_code == 204

    # The circle should no longer appear in the user's list
    list_resp = await client.get("/api/v2/circles/", headers=auth_headers)
    assert list_resp.status_code == 200
    circle_ids = [c["id"] for c in list_resp.json()]
    assert circle_id not in circle_ids
