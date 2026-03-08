"""
pattern_analyzer node — uses LLM to analyze wrong questions and update weakness analysis.
"""

from __future__ import annotations

import json
import logging

from backend.app.core.database import async_session_factory
from backend.app.core.llm import get_chat_model
from backend.app.graphs.assistant.state import AssistantState

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """你是一位专业的学习分析师。你会收到：
1. 用户本次答错题目的详情（题目原文、用户作答、正确答案、批改反馈、知识点标签）
2. 用户的旧画像（含历史知识点准确率、上次的薄弱分析、上次的总结）

请完成三件事：

1. updated_weakness_analysis
   对本次出现的薄弱知识点，结合答错原因给出具体分析（1-2句话，说明根本原因）。
   若该知识点在旧画像中已有分析，结合新表现更新它；没有则新增。
   格式：{"知识点名": "原因描述"}

2. insight_summary
   与旧画像对比，说明用户近期哪些知识点有进步、哪些持续薄弱。2-3句话，自然语言。

3. patterns
   识别学习模式，供通知使用。格式：
   [{"domain": "...", "issue": "...", "detail": "...", "severity": "low|medium|high"}]

返回 JSON：{"updated_weakness_analysis": {}, "insight_summary": "...", "patterns": []}
只返回 JSON，不要其他文字。"""


async def pattern_analyzer(state: AssistantState) -> dict:
    """Analyze learning patterns using LLM with full wrong-question details."""
    recent_sessions = state.get("recent_sessions", [])
    current_profile = state.get("current_profile", {})

    if not recent_sessions:
        return {
            "patterns_found": [],
            "updated_weakness_analysis": {},
            "insight_summary": "",
            "current_node": "pattern_analyzer",
            "progress": 0.4,
            "status_message": "无近期做题记录，跳过模式分析",
        }

    wrong_questions = []
    for s in recent_sessions:
        for q in s.get("questions", []):
            if q.get("is_correct") is False:
                wrong_questions.append({
                    "content": q.get("content", "")[:300],
                    "user_answer": q.get("user_answer") or "",
                    "correct_answer": q.get("correct_answer", "")[:200],
                    "ai_feedback": q.get("ai_feedback") or "",
                    "knowledge_points": q.get("knowledge_points", []),
                })

    if not wrong_questions:
        return {
            "patterns_found": [],
            "updated_weakness_analysis": {},
            "insight_summary": "近期做题全部正确，表现出色！",
            "current_node": "pattern_analyzer",
            "progress": 0.4,
            "status_message": "近期全部答对，跳过薄弱点分析",
        }

    # Build old profile context (cap sizes for context window)
    old_kp_profiles = current_profile.get("knowledge_point_profiles", {})
    old_weakness = current_profile.get("weakness_analysis", {})
    old_insight = current_profile.get("insight_summary", "")

    wrong_questions_for_llm = wrong_questions[:20]

    user_content = (
        f"【本次答错题目（共 {len(wrong_questions_for_llm)} 道）】\n"
        + json.dumps(wrong_questions_for_llm, ensure_ascii=False, indent=None)
        + f"\n\n【旧画像 - 知识点准确率】\n"
        + json.dumps(old_kp_profiles, ensure_ascii=False)
        + f"\n\n【旧画像 - 上次薄弱分析】\n"
        + json.dumps(old_weakness, ensure_ascii=False)
        + f"\n\n【旧画像 - 上次总结】\n{old_insight}"
    )

    patterns: list[dict] = []
    updated_weakness_analysis: dict = {}
    insight_summary = ""

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

        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        parsed = json.loads(raw.strip())
        updated_weakness_analysis = parsed.get("updated_weakness_analysis", {})
        insight_summary = parsed.get("insight_summary", "")
        patterns = parsed.get("patterns", [])
        patterns = patterns[:5]

    except Exception as e:
        logger.warning("Pattern analysis LLM call failed: %s", e)
        patterns = []
        updated_weakness_analysis = {}
        insight_summary = ""

    logger.info(
        "AssistantGraph: found %d patterns, %d weakness updates for user %d",
        len(patterns),
        len(updated_weakness_analysis),
        state.get("user_id"),
    )

    return {
        "patterns_found": patterns,
        "updated_weakness_analysis": updated_weakness_analysis,
        "insight_summary": insight_summary,
        "current_node": "pattern_analyzer",
        "progress": 0.45,
        "status_message": f"发现 {len(patterns)} 个学习模式，更新 {len(updated_weakness_analysis)} 个薄弱点分析",
    }
