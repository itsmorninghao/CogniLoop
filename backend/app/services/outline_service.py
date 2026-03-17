"""
Outline extraction service — LLM extracts knowledge structure from parsed documents.

The extracted outline (chapters, key concepts, subject tags) is stored in
kb_document_outlines and serves as the data foundation for course generation.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from backend.app.core.llm import get_chat_model
from backend.app.models.knowledge_base import KBDocument, KBDocumentOutline
from backend.app.rag.parser import ParsedSection, ParseResult

logger = logging.getLogger(__name__)

OUTLINE_EXTRACTION_PROMPT = """\
你是一位专业的知识结构分析师。请分析以下文档的章节结构，提取结构化大纲。

文档标题：{title}
章节摘要：
{sections_summary}

请输出 JSON，严格遵循以下格式：
{{
  "title": "文档完整标题",
  "chapters": [
    {{
      "title": "章节标题",
      "level": 1,
      "key_concepts": ["核心知识点1", "核心知识点2"],
      "summary": "本章一句话概述（不超过30字）",
      "children": []
    }}
  ],
  "all_concepts": ["所有知识点平铺去重列表，不超过50个"],
  "subject_tags": ["学科标签，如：物理、高等数学"],
  "difficulty_level": "beginner|intermediate|advanced"
}}

要求：
- key_concepts 每节 3-5 个，用名词术语，不用长句
- all_concepts 是 chapters 中所有 key_concepts 的合集去重
- 只返回 JSON，不要 markdown 代码块，不要其他文字
"""


def _build_sections_summary(
    sections: list[ParsedSection], max_chars: int = 6000
) -> str:
    """
    Build a compact summary of document structure for the LLM prompt:
    - All heading nodes (with level indentation)
    - First body paragraph after each heading (up to 100 chars)
    Stays within max_chars to avoid token limit issues.
    """
    lines: list[str] = []
    total = 0
    last_level = 0
    first_body_after_heading = True

    for sec in sections:
        if sec.heading_level > 0:
            indent = "  " * (sec.heading_level - 1)
            line = f"{indent}{'#' * sec.heading_level} {sec.content}"
            last_level = sec.heading_level
            first_body_after_heading = True
        elif first_body_after_heading:
            indent = "  " * last_level
            line = f"{indent}  → {sec.content[:100]}"
            first_body_after_heading = False
        else:
            continue

        total += len(line) + 1
        if total > max_chars:
            break
        lines.append(line)

    return "\n".join(lines)


async def extract_and_store_outline(
    document_id: int,
    parse_result: ParseResult,
    db: AsyncSession,
) -> None:
    """
    Extract knowledge structure from a parsed document and store in kb_document_outlines.

    Called asynchronously after embedding completes (via asyncio.create_task).
    Failures are logged and silently swallowed — outline extraction is non-critical.
    """
    sections_summary = _build_sections_summary(parse_result.sections)

    if not sections_summary.strip():
        logger.info("Outline extraction skipped for doc %d: no sections", document_id)
        return

    llm = await get_chat_model(db)
    prompt = OUTLINE_EXTRACTION_PROMPT.format(
        title=parse_result.title or "未知标题",
        sections_summary=sections_summary,
    )

    try:
        response = await llm.ainvoke(prompt)
        content = response.content.strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        outline_data = json.loads(content)
    except json.JSONDecodeError as e:
        logger.warning("Outline JSON parse failed for doc %d: %s", document_id, e)
        return
    except Exception as e:
        logger.warning("Outline extraction failed for doc %d: %s", document_id, e)
        return

    doc = await db.get(KBDocument, document_id)
    if not doc:
        return

    stmt = select(KBDocumentOutline).where(KBDocumentOutline.document_id == document_id)
    existing = (await db.execute(stmt)).scalar_one_or_none()

    model_name = getattr(llm, "model_name", None) or getattr(llm, "model", None)

    if existing:
        existing.outline = outline_data
        existing.extracted_at = datetime.now(UTC).replace(tzinfo=None)
        existing.model_used = model_name
    else:
        db.add(
            KBDocumentOutline(
                document_id=document_id,
                knowledge_base_id=doc.knowledge_base_id,
                outline=outline_data,
                model_used=model_name,
            )
        )

    await db.commit()
    logger.info(
        "Outline extracted for doc %d: %d concepts",
        document_id,
        len(outline_data.get("all_concepts", [])),
    )
