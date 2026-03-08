"""
Node 3: Profile Analyzer — loads target user's learning profile and uses LLM
to plan question "挑刺" angles, outputting question_plans for each slot.
"""

from __future__ import annotations

import json
import logging

from backend.app.core.database import async_session_factory
from backend.app.graphs.quiz_generation.state import QuizGenState

logger = logging.getLogger(__name__)

PLAN_PROMPT = """你是一位教育出题策略专家，擅长针对学生薄弱点设计考题。

## 知识内容（RAG 片段）
{knowledge_context}

## 答题人画像
{profile_info}

## 出题配置
- 科目：{subject}
- 难度：{difficulty}
- 附加要求：{custom_prompt}

## 待规划的题目列表
以下每道题的题型和编号已固定，请为每道题填写：
- chunk_indices：建议使用的知识片段编号列表（从上方 [编号] 中选，可多选）
- core_point：核心考点（结合画像薄弱点针对性出题）
- challenge_angle：出题角度/挑刺方向（具体说明如何让这道题能暴露薄弱点）

{skeleton_list}

## 要求
- 不同题目尽量覆盖不同的知识点，避免重复
- 针对答题人薄弱知识点重点安排题目
- chunk_indices 必须是上方存在的编号（0 到 {max_chunk_idx}）
- 严格按题目数量返回，不要增减

只返回 JSON 数组：
[{{"chunk_indices": [0, 1], "core_point": "...", "challenge_angle": "..."}}, ...]"""

TYPE_LABEL = {
    "single_choice": "单选题",
    "multiple_choice": "多选题",
    "true_false": "判断题",
    "fill_blank": "填空题",
    "short_answer": "简答题",
}


async def profile_analyzer(state: QuizGenState) -> dict:
    """
    Load the target user's profile and plan question 挑刺 angles via LLM.
    """
    from backend.app.core.sse import emit_node_complete, emit_node_start

    session_id = state.get("session_id", "")
    await emit_node_start(session_id, "profile_analyzer", "正在分析画像并规划出题方向...")

    target_user_id = state.get("target_user_id") or state.get("user_id")
    circle_id = state.get("circle_id")
    quiz_config = state.get("quiz_config", {})
    rag_chunks = state.get("rag_chunks", [])

    target_profile: dict | None = None

    # Circle mode: load circle profile instead of individual profile
    if circle_id:
        try:
            from sqlmodel import select

            from backend.app.models.circle_profile import CircleProfile

            async with async_session_factory() as session:
                result = await session.execute(
                    select(CircleProfile).where(CircleProfile.circle_id == circle_id)
                )
                cp = result.scalar_one_or_none()
                if cp and cp.profile_data:
                    data: dict = cp.profile_data if isinstance(cp.profile_data, dict) else {}
                    kp_profiles = data.get("knowledge_point_profiles", {})
                    weak_points = [
                        kp for kp, stats in kp_profiles.items()
                        if stats.get("avg_accuracy", 1.0) < 0.6
                        and stats.get("member_coverage", 0) >= 2
                    ]
                    strong_points = [
                        kp for kp, stats in kp_profiles.items()
                        if stats.get("avg_accuracy", 0.0) >= 0.8
                    ]
                    target_profile = {
                        "user_id": None,
                        "circle_id": circle_id,
                        "overall_level": "intermediate",
                        "avg_accuracy": data.get("overall_accuracy"),
                        "weak_points": weak_points[:10],
                        "strong_points": strong_points[:5],
                        "weakness_analysis": {},
                        "insight_summary": f"圈子集体画像（{data.get('member_count', 0)} 位成员）",
                    }
                    logger.info(
                        "Loaded circle profile for circle %d: weak=%d, strong=%d",
                        circle_id,
                        len(weak_points),
                        len(strong_points),
                    )
        except Exception as e:
            logger.warning("Could not load circle profile: %s (continuing without)", e)

    if not target_profile and target_user_id:
        try:
            from sqlmodel import select

            from backend.app.models.profile import UserProfile

            async with async_session_factory() as session:
                result = await session.execute(
                    select(UserProfile).where(UserProfile.user_id == target_user_id)
                )
                profile = result.scalar_one_or_none()
                if profile and profile.profile_data:
                    data: dict = (
                        profile.profile_data
                        if isinstance(profile.profile_data, dict)
                        else {}
                    )

                    kp_profiles = data.get("knowledge_point_profiles", {})
                    weak_points = [
                        kp for kp, stats in kp_profiles.items()
                        if stats.get("accuracy", 1.0) < 0.6 and stats.get("attempts", 0) >= 2
                    ]
                    strong_points = [
                        kp for kp, stats in kp_profiles.items()
                        if stats.get("accuracy", 0.0) >= 0.8
                    ]

                    # Also pull LLM-generated weakness analysis for richer context
                    weakness_analysis = data.get("weakness_analysis", {})
                    insight_summary = data.get("insight_summary", "")

                    target_profile = {
                        "user_id": target_user_id,
                        "overall_level": data.get("overall_level", "beginner"),
                        "avg_accuracy": data.get("overall_accuracy"),
                        "weak_points": weak_points[:10],
                        "strong_points": strong_points[:5],
                        "weakness_analysis": weakness_analysis,
                        "insight_summary": insight_summary,
                    }
                    logger.info(
                        "Loaded profile for user %d: level=%s, weak=%d, strong=%d",
                        target_user_id,
                        target_profile["overall_level"],
                        len(weak_points),
                        len(strong_points),
                    )
        except Exception as e:
            logger.warning("Could not load target profile: %s (continuing without)", e)

    # Build skeleton from question_counts (LLM cannot change this)
    question_counts: dict[str, int] = {}
    if "question_counts" in quiz_config:
        question_counts = {k: v for k, v in quiz_config["question_counts"].items() if v > 0}

    skeleton: list[dict] = []
    for qtype, count in question_counts.items():
        for _ in range(count):
            skeleton.append({"slot_index": len(skeleton), "question_type": qtype})

    if not skeleton:
        # Fallback: no question_counts → single_choice x5
        skeleton = [{"slot_index": i, "question_type": "single_choice"} for i in range(5)]

    total_slots = len(skeleton)

    knowledge_parts = []
    for i, chunk in enumerate(rag_chunks[:15]):
        section = chunk.get("section_path", "")
        prefix = f"[{i}] {section}: " if section else f"[{i}] "
        knowledge_parts.append(prefix + chunk["content"][:300])
    knowledge_context = "\n\n".join(knowledge_parts) if knowledge_parts else "（无知识片段）"
    max_chunk_idx = max(len(rag_chunks[:15]) - 1, 0)

    if target_profile:
        weak = target_profile.get("weak_points", [])
        strong = target_profile.get("strong_points", [])
        wa = target_profile.get("weakness_analysis", {})
        insight = target_profile.get("insight_summary", "")
        profile_info = (
            f"- 整体水平：{target_profile.get('overall_level', '未知')}\n"
            f"- 总体正确率：{target_profile.get('avg_accuracy', '未知')}\n"
            f"- 薄弱知识点：{', '.join(weak) if weak else '暂无数据'}\n"
            f"- 掌握较好：{', '.join(strong) if strong else '暂无数据'}\n"
        )
        if wa:
            profile_info += f"- 薄弱原因分析：{json.dumps(wa, ensure_ascii=False)[:500]}\n"
        if insight:
            profile_info += f"- 近期总结：{insight}\n"
    else:
        profile_info = "新用户，无历史数据，使用标准难度出题"

    skeleton_lines = [
        f"{s['slot_index'] + 1}. 题型：{TYPE_LABEL.get(s['question_type'], s['question_type'])}"
        for s in skeleton
    ]
    skeleton_list = "\n".join(skeleton_lines)

    difficulty = quiz_config.get("difficulty", "medium")
    subject = quiz_config.get("subject", "综合")
    custom_prompt = quiz_config.get("custom_prompt", "") or ""

    llm_plans: list[dict] = []
    try:
        from backend.app.core.llm import get_chat_model

        prompt = PLAN_PROMPT.format(
            knowledge_context=knowledge_context,
            profile_info=profile_info,
            subject=subject,
            difficulty=difficulty,
            custom_prompt=custom_prompt or "无",
            skeleton_list=skeleton_list,
            max_chunk_idx=max_chunk_idx,
        )

        async with async_session_factory() as session:
            llm = await get_chat_model(session, temperature=0.3)
        response = await llm.ainvoke(prompt)
        raw = response.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        llm_plans = json.loads(raw.strip())
        if not isinstance(llm_plans, list):
            llm_plans = []
    except Exception as e:
        logger.warning("Profile analyzer LLM planning failed: %s", e)
        llm_plans = []

    # Merge skeleton (authoritative) + LLM fills
    question_plans: list[dict] = []
    for i, slot in enumerate(skeleton):
        fill = llm_plans[i] if i < len(llm_plans) and isinstance(llm_plans[i], dict) else {}

        # Validate chunk_indices
        raw_indices = fill.get("chunk_indices", [i % max(len(rag_chunks[:15]), 1)])
        if not isinstance(raw_indices, list):
            raw_indices = [raw_indices]
        chunk_indices = [
            idx for idx in raw_indices
            if isinstance(idx, int) and 0 <= idx <= max_chunk_idx
        ]
        if not chunk_indices:
            chunk_indices = [i % max(len(rag_chunks[:15]), 1)]

        question_plans.append({
            "slot_index": slot["slot_index"],
            "question_type": slot["question_type"],   # always from skeleton
            "chunk_indices": chunk_indices,
            "core_point": str(fill.get("core_point", f"知识点{i + 1}"))[:100],
            "challenge_angle": str(fill.get("challenge_angle", "综合理解"))[:200],
        })

    msg = f"已规划 {total_slots} 道题目方向"
    await emit_node_complete(
        session_id,
        "profile_analyzer",
        msg,
        input_summary={
            "target_user_id": target_user_id,
            "has_profile": target_profile is not None,
            "total_slots": total_slots,
        },
        output_summary={
            "plans": [
                {
                    "type": p["question_type"],
                    "core_point": p["core_point"][:40],
                    "challenge_angle": p["challenge_angle"][:60],
                }
                for p in question_plans
            ],
        },
        progress=0.45,
    )

    return {
        "target_profile": target_profile,
        "question_plans": question_plans,
        "current_node": "profile_analyzer",
        "progress": 0.45,
        "status_message": msg,
    }
