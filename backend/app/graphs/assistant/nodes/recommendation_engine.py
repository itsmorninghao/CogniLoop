"""
recommendation_engine node — generates learning recommendations and creates notifications.
"""

from __future__ import annotations

import json
import logging

from backend.app.core.database import async_session_factory
from backend.app.core.llm import get_chat_model
from backend.app.graphs.assistant.state import AssistantState

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """你是一位贴心的学习助教。根据用户的学习画像和发现的模式，生成 2-3 条具体、可执行的学习建议。

请返回 JSON 格式，包含 recommendations 数组，每项格式：
{
  "title": "建议标题（不超过20字）",
  "content": "建议内容（2-3句话，具体可操作）",
  "action_url": "/quiz/create-smart"
}

action_url 可选值："/quiz/create-smart"（自测练习）或 "/knowledge"（知识库管理）。
只返回 JSON，不要其他文字。"""


async def recommendation_engine(state: AssistantState) -> dict:
    """Generate recommendations and create ai_suggestion notifications."""
    user_id = state["user_id"]
    patterns = state.get("patterns_found", [])
    new_profile = state.get("new_profile", state.get("current_profile", {}))

    recommendations: list[dict] = []

    if not patterns and not new_profile:
        return {
            "recommendations": [],
            "current_node": "recommendation_engine",
            "progress": 1.0,
            "status_message": "暂无足够数据生成建议",
        }

    profile_summary = {
        "overall_level": new_profile.get("overall_level", "未知"),
        "overall_accuracy": new_profile.get("overall_accuracy"),
        "total_questions_answered": new_profile.get("total_questions_answered", 0),
        "domain_profiles": new_profile.get("domain_profiles", {}),
    }
    patterns_str = json.dumps(patterns, ensure_ascii=False) if patterns else "[]"

    user_content = (
        f"用户画像：{json.dumps(profile_summary, ensure_ascii=False)}\n"
        f"发现的学习模式：{patterns_str}"
    )

    try:
        async with async_session_factory() as db:
            llm = await get_chat_model(db, temperature=0.5)

        from langchain_core.messages import HumanMessage, SystemMessage
        messages = [
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(content=user_content),
        ]
        response = await llm.ainvoke(messages)
        raw = response.content.strip()

        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        parsed = json.loads(raw.strip())
        if isinstance(parsed, dict) and "recommendations" in parsed:
            recommendations = parsed["recommendations"]
        elif isinstance(parsed, list):
            recommendations = parsed

        recommendations = recommendations[:3]

    except Exception as e:
        logger.warning("Recommendation LLM call failed: %s", e)

    # Create ai_suggestion notifications in DB
    if recommendations:
        try:
            from backend.app.services import notification_service
            async with async_session_factory() as db:
                for rec in recommendations:
                    await notification_service.create_notification(
                        user_id=user_id,
                        type="ai_suggestion",
                        title=rec.get("title", "AI 学习建议"),
                        content=rec.get("content"),
                        category="info",
                        action_url=rec.get("action_url", "/quiz/create-smart"),
                        db=db,
                    )
            logger.info(
                "AssistantGraph: created %d notifications for user %d",
                len(recommendations),
                user_id,
            )
        except Exception as e:
            logger.warning("AssistantGraph: notification creation failed: %s", e)

    return {
        "recommendations": recommendations,
        "current_node": "recommendation_engine",
        "progress": 1.0,
        "status_message": f"已生成 {len(recommendations)} 条学习建议",
    }
