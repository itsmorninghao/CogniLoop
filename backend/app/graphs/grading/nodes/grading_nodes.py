"""
Grading Graph nodes — answer_parser, rule_grader, llm_grader, feedback_generator.
Combined into a single file for simplicity.
"""

from __future__ import annotations

import json
import logging

from backend.app.core.database import async_session_factory
from backend.app.core.llm import get_chat_model
from backend.app.graphs.grading.state import GradingState

logger = logging.getLogger(__name__)

# Objective question types that can be rule-graded
OBJECTIVE_TYPES = {"single_choice", "multiple_choice", "true_false"}


async def answer_parser(state: GradingState) -> dict:
    """Parse and normalize user answers for comparison."""
    responses = state.get("responses", [])
    questions = state.get("questions", [])

    q_map = {q["id"]: q for q in questions}
    parsed = []

    for resp in responses:
        q = q_map.get(resp["question_id"])
        if not q:
            continue

        parsed.append(
            {
                "question_id": resp["question_id"],
                "question_type": q.get("question_type", ""),
                "user_answer": (resp.get("user_answer") or "").strip(),
                "correct_answer": (q.get("correct_answer") or "").strip(),
                "max_score": q.get("score", 1.0),
                "content": q.get("content", ""),
                "analysis": q.get("analysis", ""),
            }
        )

    return {
        "parsed_responses": parsed,
        "current_node": "answer_parser",
        "progress": 0.2,
        "status_message": f"已解析 {len(parsed)} 道答案",
    }


async def rule_grader(state: GradingState) -> dict:
    """Rule-based grading for objective questions (exact match)."""
    parsed = state.get("parsed_responses", [])
    graded = []

    for item in parsed:
        q_type = item["question_type"]

        if q_type in OBJECTIVE_TYPES:
            user_ans = item["user_answer"].upper().strip()
            correct_ans = item["correct_answer"].upper().strip()

            if q_type == "multiple_choice":
                # Multiple choice: compare sorted sets
                user_set = set(user_ans.replace(",", "").replace(" ", ""))
                correct_set = set(correct_ans.replace(",", "").replace(" ", ""))
                is_correct = user_set == correct_set
                # Partial credit: half score for partial match
                if (
                    not is_correct
                    and user_set.issubset(correct_set)
                    and len(user_set) > 0
                ):
                    score = item["max_score"] * 0.5
                    feedback = f"部分正确。你选了 {''.join(sorted(user_set))}，正确答案是 {''.join(sorted(correct_set))}。"
                elif is_correct:
                    score = item["max_score"]
                    feedback = "正确！"
                else:
                    score = 0
                    feedback = f"错误。正确答案是 {''.join(sorted(correct_set))}。{item.get('analysis', '')}"
            else:
                is_correct = user_ans == correct_ans
                score = item["max_score"] if is_correct else 0
                feedback = (
                    "正确！"
                    if is_correct
                    else f"错误。正确答案是 {correct_ans}。{item.get('analysis', '')}"
                )

            graded.append(
                {
                    **item,
                    "is_correct": is_correct
                    if q_type != "multiple_choice"
                    else score == item["max_score"],
                    "score": score,
                    "ai_feedback": feedback,
                    "grading_method": "rule",
                    "correctness_weight": score / item["max_score"] if item["max_score"] > 0 else 0,
                }
            )
        else:
            # Pass subjective questions through to llm_grader
            graded.append(
                {
                    **item,
                    "is_correct": None,
                    "score": None,
                    "ai_feedback": None,
                    "grading_method": "pending_llm",
                    "correctness_weight": 0,
                }
            )

    return {
        "graded_results": graded,
        "current_node": "rule_grader",
        "progress": 0.5,
        "status_message": "客观题批改完成",
    }


async def llm_grader(state: GradingState) -> dict:
    """LLM-based grading for subjective questions (fill_blank, short_answer)."""
    graded = state.get("graded_results", [])

    subjective = [g for g in graded if g["grading_method"] == "pending_llm"]
    if not subjective:
        return {
            "current_node": "llm_grader",
            "progress": 0.7,
            "status_message": "无主观题需要AI批改",
        }

    async with async_session_factory() as session:
        llm = await get_chat_model(session, temperature=0)

        for item in subjective:
            try:
                prompt = f"""你是一位评分老师。请根据参考答案为学生的答案评分。

题目：{item["content"]}
学生答案：{item["user_answer"]}
参考答案：{item["correct_answer"]}
满分分值：{item["max_score"]}

请返回 JSON 格式（不要其他文字）:
{{"score": <得分>, "is_correct": <true/false>, "feedback": "<评语>"}}"""

                response = await llm.ainvoke(prompt)
                content = response.content.strip()

                if content.startswith("```"):
                    content = content.split("```")[1]
                    if content.startswith("json"):
                        content = content[4:]

                result = json.loads(content)
                item["score"] = min(float(result.get("score", 0)), item["max_score"])
                item["is_correct"] = result.get(
                    "is_correct", item["score"] >= item["max_score"] * 0.6
                )
                item["ai_feedback"] = result.get("feedback", "")
                item["grading_method"] = "llm"
                item["correctness_weight"] = item["score"] / item["max_score"] if item["max_score"] > 0 else 0

            except Exception as e:
                logger.error(
                    "LLM grading failed for question %s: %s", item["question_id"], e
                )
                item["score"] = 0
                item["is_correct"] = False
                item["ai_feedback"] = f"AI批改出错：{str(e)[:100]}"
                item["grading_method"] = "llm_error"
                item["correctness_weight"] = 0

    return {
        "graded_results": graded,
        "current_node": "llm_grader",
        "progress": 0.8,
        "status_message": f"已完成 {len(subjective)} 道主观题AI批改",
    }


async def feedback_generator(state: GradingState) -> dict:
    """Generate overall feedback and compute scores."""
    graded = state.get("graded_results", [])

    total_score = sum(g.get("score", 0) or 0 for g in graded)
    max_score = sum(g.get("max_score", 1) for g in graded)
    # Use weighted accuracy: sum of correctness_weight / count
    total_weight = sum(g.get("correctness_weight", 1 if g.get("is_correct") else 0) for g in graded)
    accuracy = total_weight / len(graded) if graded else 0

    # Generate summary
    weak_areas = []
    for g in graded:
        if not g.get("is_correct"):
            weak_areas.append(g.get("content", "")[:50])

    summary = f"总分: {total_score}/{max_score}，正确率: {accuracy:.0%}。"
    if weak_areas:
        summary += f"\n薄弱知识点: {'; '.join(weak_areas[:3])}"

    return {
        "total_score": total_score,
        "max_score": max_score,
        "accuracy": accuracy,
        "feedback_summary": summary,
        "current_node": "feedback_generator",
        "progress": 1.0,
        "status_message": f"批改完成！得分 {total_score}/{max_score}",
    }
