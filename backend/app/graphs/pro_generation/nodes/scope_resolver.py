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

    # Parse bank_kb_subjects early — JSON keys are strings; convert to int
    bank_kb_subjects_raw = scope.get("bank_kb_subjects", {})
    bank_kb_subjects = {int(k): v for k, v in bank_kb_subjects_raw.items()}

    # 优先级 1：用户手动指定的科目
    user_subject = config.get("subject", "").strip()
    if user_subject:
        subject_scope = user_subject
    else:
        # 优先级 2：从已解析的 bank_kb_subjects 提取科目列表
        all_subjects: list[str] = []
        for subjects in bank_kb_subjects.values():
            for s in subjects:
                if s and s not in all_subjects:
                    all_subjects.append(s)

        if all_subjects:
            subject_scope = "、".join(all_subjects)
        else:
            # 优先级 3：查 DB 获取 KB 名称
            document_kb_ids_tmp = scope.get("document_kb_ids", [])
            bank_kb_ids_tmp = scope.get("bank_kb_ids", [])
            all_kb_ids = list(set(document_kb_ids_tmp + bank_kb_ids_tmp))
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
            # 优先级4：保持 parse_knowledge_scope 的返回值（"通用综合领域"）

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
        "bank_kb_subjects": bank_kb_subjects,
        "doc_ids": doc_ids,
        "target_count": target_count,
        "target_difficulty": target_difficulty,
        "completed_questions": [],
        "retry_count": 0,
        "final_questions": [],
    }
