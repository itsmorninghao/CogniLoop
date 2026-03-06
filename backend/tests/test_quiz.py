"""Quiz session tests — creation returns status=generating."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_quiz_session_returns_generating(client: AsyncClient, auth_headers: dict):
    """Creating a quiz session should immediately return status=generating."""
    resp = await client.post("/api/v2/quiz-sessions/", json={
        "knowledge_scope": {},
        "quiz_config": {"question_count": 5, "question_types": ["single_choice"]},
    }, headers=auth_headers)
    # 201 Created
    assert resp.status_code == 201
    data = resp.json()
    assert "id" in data
    assert data["status"] == "generating"


@pytest.mark.asyncio
async def test_list_quiz_sessions(client: AsyncClient, auth_headers: dict):
    """List quiz sessions should return a list."""
    resp = await client.get("/api/v2/quiz-sessions/", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
