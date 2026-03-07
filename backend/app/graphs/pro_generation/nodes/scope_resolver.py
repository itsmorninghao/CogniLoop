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

    # Target counts from {"question_counts": {"single_choice": 5}} or legacy {"question_types": ["single_choice"], "count": 5}
    target_count = config.get("question_counts", {})
    if not target_count and config.get("question_types"):
        types = config["question_types"]
        count_per_type = config.get("count", 5) // max(len(types), 1)
        target_count = {t: count_per_type for t in types}

    target_difficulty = config.get("difficulty", "medium")

    # Parse separated KB IDs for Pro mode
    document_kb_ids = scope.get("document_kb_ids", [])
    bank_kb_ids = scope.get("bank_kb_ids", [])
    doc_ids = scope.get("doc_ids", [])

    total_questions = sum(target_count.values())
    msg = f"已解析：{subject_scope[:60]}，共 {total_questions} 道题"
    await emit_node_complete(
        session_id,
        "scope_resolver",
        msg,
        input_summary={
            "subject_scope": subject_scope[:200],
            "target_count": target_count,
        },
        output_summary={
            "total_questions": total_questions,
            "difficulty": target_difficulty,
        },
        progress=0.05,
    )

    return {
        "subject_scope": subject_scope,
        "kb_ids": kb_ids,
        "document_kb_ids": document_kb_ids,
        "bank_kb_ids": bank_kb_ids,
        "doc_ids": doc_ids,
        "target_count": target_count,
        "target_difficulty": target_difficulty,
        "completed_questions": [],
        "retry_count": 0,
        "final_questions": [],
    }
