from backend.app.core.database import async_session_factory
from backend.app.core.sse import emit_node_complete, emit_node_start
from backend.app.graphs.pro_generation.state import ProQuizState


def parse_knowledge_scope(scope: dict) -> tuple[str, list[int]]:
    """Parse knowledge scope to get a subject string and kb_ids."""
    subject_parts = []
    kb_ids = []
    for type_name, items in scope.items():
        if not items:
            continue
        if type_name == "knowledge_bases":
            kb_ids.extend([item["id"] for item in items])
            subject_parts.append(
                f"知识库涵盖领域: {', '.join(item['name'] for item in items)}"
            )
        elif type_name == "folders":
            subject_parts.append(
                f"特定文件夹重点: {', '.join(item['name'] for item in items)}"
            )
        elif type_name == "documents":
            subject_parts.append(
                f"特定文档: {', '.join(item['name'] for item in items)}"
            )

    subject_scope = "；".join(subject_parts) if subject_parts else "通用综合领域"
    return subject_scope, kb_ids


async def scope_resolver_node(state: ProQuizState) -> dict:
    """Resolve user inputs into graph state properties."""
    session_id = state.get("session_id", "")
    await emit_node_start(session_id, "scope_resolver", "正在解析出题范围...")

    # Pre-flight: verify LLM is configured before kicking off any LLM calls
    async with async_session_factory() as _session:
        from backend.app.services.config_service import get_config
        api_key = await get_config("OPENAI_API_KEY", _session)
    if not api_key:
        msg = "LLM 未配置：请在管理后台 → 系统配置中设置 OPENAI_API_KEY"
        await emit_node_complete(session_id, "scope_resolver", msg, progress=0.0)
        raise RuntimeError(msg)

    scope = state.get("knowledge_scope", {})
    config = state.get("quiz_config", {})

    subject_scope, kb_ids = parse_knowledge_scope(scope)

    template_ids = config.get("template_ids", [])
    selected_slot_positions = config.get("selected_slot_positions", [])

    # Subject resolution priority: explicit config > template subject > KB names > default
    user_subject = config.get("subject", "").strip()
    if user_subject:
        subject_scope = user_subject
    else:
        template_subject = ""
        if template_ids:
            async with async_session_factory() as _s:
                from sqlalchemy import select as _select

                from backend.app.models.exam_template import ExamTemplate

                rows = (
                    await _s.execute(
                        _select(ExamTemplate.subject)
                        .where(ExamTemplate.id.in_(template_ids))
                        .order_by(ExamTemplate.id)
                    )
                ).scalars().all()
                for r in rows:
                    if r and r.strip():
                        template_subject = r.strip()
                        break

        if template_subject:
            subject_scope = template_subject
        else:
            # Fall back to KB names from database
            document_kb_ids_tmp = scope.get("document_kb_ids", [])
            all_kb_ids = list(set(document_kb_ids_tmp))
            if all_kb_ids:
                async with async_session_factory() as _s:
                    from sqlalchemy import select as _select

                    from backend.app.models.knowledge_base import KnowledgeBase

                    rows = (
                        await _s.execute(
                            _select(KnowledgeBase.name)
                            .where(KnowledgeBase.id.in_(all_kb_ids))
                            .order_by(KnowledgeBase.id)
                        )
                    ).scalars().all()
                if rows:
                    subject_scope = "、".join(rows)
            # else: keep subject_scope from parse_knowledge_scope ("通用综合领域")

    target_difficulty = config.get("difficulty", "medium")

    # KB IDs and doc IDs scoped for Pro mode RAG retrieval
    document_kb_ids = scope.get("document_kb_ids", [])
    doc_ids = scope.get("doc_ids", [])

    slot_count = len(selected_slot_positions) if selected_slot_positions else "全部"
    msg = f"已解析：{subject_scope[:60]}，{slot_count} 个题位"
    await emit_node_complete(
        session_id,
        "scope_resolver",
        msg,
        input_summary={
            "subject_scope": subject_scope[:200],
            "template_ids": template_ids,
            "selected_slot_positions": selected_slot_positions,
        },
        output_summary={
            "slot_count": slot_count,
            "difficulty": target_difficulty,
        },
        progress=0.05,
    )

    return {
        "subject_scope": subject_scope,
        "kb_ids": kb_ids,
        "document_kb_ids": document_kb_ids,
        "doc_ids": doc_ids,
        "target_difficulty": target_difficulty,
        "template_ids": template_ids,
        "selected_slot_positions": selected_slot_positions,
        "completed_questions": [],
        "retry_count": 0,
        "final_questions": [],
    }
