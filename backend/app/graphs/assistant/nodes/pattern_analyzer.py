"""
pattern_analyzer node — uses LLM to identify learning patterns and weaknesses.
"""

from __future__ import annotations

import json
import logging

from backend.app.core.database import async_session_factory
from backend.app.core.llm import get_chat_model
from backend.app.graphs.assistant.state import AssistantState

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """你是一位专业的学习分析师。根据用户的近期做题记录和当前画像，识别学习模式和知识盲区。

请返回 JSON 格式的分析结果，包含 patterns 数组，每项格式：
{
  "domain": "领域/科目",
  "issue": "问题类型（如：知识盲区、正确率下降、答题速度慢等）",
  "detail": "具体描述（1-2句话）",
  "severity": "low|medium|high"
}

只返回 JSON，不要其他文字。最多识别 5 个模式。"""


async def pattern_analyzer(state: AssistantState) -> dict:
    """Analyze learning patterns using LLM."""
    recent_sessions = state.get("recent_sessions", [])
    current_profile = state.get("current_profile", {})

    if not recent_sessions:
        return {
            "patterns_found": [],
            "current_node": "pattern_analyzer",
            "progress": 0.4,
            "status_message": "无近期做题记录，跳过模式分析",
        }

    summary_lines = []
    for s in recent_sessions:
        acc = s.get("accuracy")
        acc_str = f"{acc:.0%}" if acc is not None else "N/A"
        config = s.get("quiz_config", {})
        subject = config.get("subject", "未知科目")
        wrong_items = [
            q for q in s.get("questions", []) if q.get("is_correct") is False
        ]
        summary_lines.append(
            f"- {subject}，准确率 {acc_str}，"
            f"错误 {len(wrong_items)}/{len(s.get('questions', []))} 题"
        )

    profile_summary = {
        "overall_level": current_profile.get("overall_level", "未知"),
        "overall_accuracy": current_profile.get("overall_accuracy"),
        "domain_profiles": current_profile.get("domain_profiles", {}),
    }

    user_content = (
        f"近期 {len(recent_sessions)} 次做题记录：\n"
        + "\n".join(summary_lines)
        + f"\n\n当前画像摘要：{json.dumps(profile_summary, ensure_ascii=False)}"
    )

    patterns: list[dict] = []
    try:
        async with async_session_factory() as db:
            llm = await get_chat_model(db, temperature=0.3)

        from langchain_core.messages import HumanMessage, SystemMessage
        messages = [
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(content=user_content),
        ]
        response = await llm.ainvoke(messages)
        raw = response.content.strip()

        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        parsed = json.loads(raw.strip())
        if isinstance(parsed, dict) and "patterns" in parsed:
            patterns = parsed["patterns"]
        elif isinstance(parsed, list):
            patterns = parsed

        patterns = patterns[:5]  # cap at 5

    except Exception as e:
        logger.warning("Pattern analysis LLM call failed: %s", e)
        patterns = []

    logger.info(
        "AssistantGraph: found %d patterns for user %d",
        len(patterns),
        state.get("user_id"),
    )

    return {
        "patterns_found": patterns,
        "current_node": "pattern_analyzer",
        "progress": 0.45,
        "status_message": f"发现 {len(patterns)} 个学习模式",
    }
