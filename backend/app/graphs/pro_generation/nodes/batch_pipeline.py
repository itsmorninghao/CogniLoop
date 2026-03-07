"""Batch pipeline node — concurrent question generation engine.

Each entry in current_batch_types is a context key ("{qtype}_{local_index}").
The node looks up each generator's pre-assigned context package from
question_context_map and runs the pipeline: generate → quality(retry) → solve → difficulty(retry).
"""

import asyncio
import logging

from backend.app.core.sse import emit_node_complete, emit_node_start
from backend.app.graphs.pro_generation.nodes._progress import compute_batch_progress
from backend.app.graphs.pro_generation.nodes.difficulty_analyzer import (
    analyze_difficulty,
)
from backend.app.graphs.pro_generation.nodes.quality_checker import check_quality
from backend.app.graphs.pro_generation.nodes.question_generator import generate_question
from backend.app.graphs.pro_generation.nodes.solve_verifier import verify_solve
from backend.app.graphs.pro_generation.state import ProQuizState

logger = logging.getLogger(__name__)


async def batch_pipeline_node(state: ProQuizState) -> dict:
    """Run concurrent question generation pipelines for a batch of context keys."""
    batch_keys = state.get("current_batch_types", [])
    if not batch_keys:
        return {"batch_results": []}

    session_id = state.get("session_id", "")
    subject = state.get("subject_scope", "综合")
    difficulty = state.get("target_difficulty", "medium")
    question_context_map: dict[str, dict] = state.get("question_context_map", {})
    completed_count = len(state.get("completed_questions", []))
    total_q = sum(state.get("target_count", {}).values())
    batch_size = len(batch_keys)

    async def _run_single(ctx_key: str, index: int) -> dict | None:
        """Independent pipeline: generate → quality(retry) → solve → difficulty(retry)."""
        # Parse question type from context key, e.g. "single_choice_0" → "single_choice"
        qtype = ctx_key.rsplit("_", 1)[0]
        q_label = f"第 {index}/{total_q} 题"
        qi = index
        max_retry = 2

        pkg = question_context_map.get(ctx_key, {})
        ctx = {
            "subject": subject,
            "difficulty": difficulty,
            "rag_context": pkg.get("rag_context", ""),
            "hotspot": pkg.get("hotspot", ""),
        }
        examples = pkg.get("few_shot_examples", [])

        feedback = None
        question = None
        for attempt in range(max_retry + 1):
            # Step 1: Generate question
            await emit_node_start(
                session_id,
                "question_generator",
                f"原创命题（{q_label}）...",
                question_index=qi,
            )
            question, q_sys, q_usr, q_raw = await generate_question(qtype, ctx, examples, feedback)
            preview = (question.get("content") or "")[:80]
            await emit_node_complete(
                session_id,
                "question_generator",
                f"（{q_label}）命题完成",
                input_summary={
                    "subject": ctx.get("subject"),
                    "difficulty": ctx.get("difficulty"),
                    "rag_context_chars": len(ctx.get("rag_context", "")),
                    "hotspot_preview": ctx.get("hotspot", "")[:60],
                    "few_shot_count": len(examples),
                    "has_feedback": feedback is not None,
                    "system_prompt": q_sys[:3000],
                    "user_prompt": q_usr[:3000],
                },
                output_summary={"question_type": qtype, "content_preview": preview, "llm_output": q_raw[:2000]},
                progress=compute_batch_progress(
                    completed_count, total_q, batch_size, 0.2
                ),
                question_index=qi,
            )

            # Step 2: Quality check
            await emit_node_start(
                session_id,
                "quality_checker",
                f"质量快审（{q_label}）...",
                question_index=qi,
            )
            feedback, qc_sys, qc_usr, qc_reply = await check_quality(question, qtype)
            if feedback and attempt < max_retry:
                await emit_node_complete(
                    session_id,
                    "quality_checker",
                    f"（{q_label}）质量不合格，重试 {attempt + 1}/{max_retry}",
                    input_summary={"system_prompt": qc_sys[:3000], "user_prompt": qc_usr[:3000]},
                    output_summary={"result": "REJECT", "reason": feedback[:100], "llm_output": qc_reply[:2000]},
                    progress=compute_batch_progress(
                        completed_count, total_q, batch_size, 0.4
                    ),
                    question_index=qi,
                )
                continue
            await emit_node_complete(
                session_id,
                "quality_checker",
                f"（{q_label}）质量审查通过"
                if not feedback
                else f"（{q_label}）质量勉强接受（已达重试上限）",
                input_summary={"system_prompt": qc_sys[:3000], "user_prompt": qc_usr[:3000]},
                output_summary={
                    "result": "APPROVE" if not feedback else "FORCE_ACCEPT",
                    "llm_output": qc_reply[:2000],
                },
                progress=compute_batch_progress(
                    completed_count, total_q, batch_size, 0.4
                ),
                question_index=qi,
            )

            # Step 3: Solve verification
            await emit_node_start(
                session_id,
                "solve_verifier",
                f"AI学情模拟测算（{q_label}）...",
                question_index=qi,
            )
            solve_results = await verify_solve(question, subject)
            scores = [r["score"] for r in solve_results]
            await emit_node_complete(
                session_id,
                "solve_verifier",
                f"（{q_label}）3名模拟学生已作答",
                output_summary={
                    "scores": scores,
                    "student_traces": [
                        {
                            "name": r["student"],
                            "score": r["score"],
                            "system_prompt": r["system_prompt"],
                            "answer": r["answer"],
                            "grade_output": r["grade_output"],
                        }
                        for r in solve_results
                    ],
                },
                progress=compute_batch_progress(
                    completed_count, total_q, batch_size, 0.6
                ),
                question_index=qi,
            )

            # Step 4: Difficulty analysis
            await emit_node_start(
                session_id,
                "difficulty_analyzer",
                f"难度分析与调校（{q_label}）...",
                question_index=qi,
            )
            score, acceptable = analyze_difficulty(solve_results, difficulty)

            if acceptable or attempt >= max_retry:
                question["difficulty_score"] = score
                await emit_node_complete(
                    session_id,
                    "difficulty_analyzer",
                    f"（{q_label}）难度合格，已收录（得分 {score:.2f}）",
                    output_summary={"difficulty_score": score, "accepted": True},
                    progress=compute_batch_progress(
                        completed_count, total_q, batch_size, 0.8
                    ),
                    question_index=qi,
                )
                return question
            else:
                if difficulty == "easy":
                    feedback = (
                        "上道题太难了（即使是学霸也容易出错）。请出得更基础直白一点。"
                    )
                elif difficulty == "hard":
                    feedback = "上道题太简单了（连基础差的学生都能蒙对）。请增加思维陷阱、干扰项或考察更深层次的核心原理。"
                else:
                    feedback = "难度偏向了极端（太难或太简单），请调整到中等水平。"

                await emit_node_complete(
                    session_id,
                    "difficulty_analyzer",
                    f"（{q_label}）难度不合格（{score:.2f}），重试",
                    output_summary={
                        "difficulty_score": score,
                        "accepted": False,
                        "retry": attempt + 1,
                    },
                    progress=compute_batch_progress(
                        completed_count, total_q, batch_size, 0.8
                    ),
                    question_index=qi,
                )

        return question

    tasks = [
        _run_single(ctx_key, completed_count + i + 1)
        for i, ctx_key in enumerate(batch_keys)
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    accepted = []
    for r in results:
        if isinstance(r, dict):
            accepted.append(r)
        elif isinstance(r, Exception):
            logger.error("Batch pipeline task failed: %s", r)

    return {"batch_results": accepted}
