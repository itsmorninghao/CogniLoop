"""
Node 2 (outline graph): Outline Generator — LLM generates course outline JSON.
"""

from __future__ import annotations

import json
import logging

from langchain_core.messages import HumanMessage, SystemMessage

from backend.app.core.database import async_session_factory
from backend.app.core.llm import get_chat_model
from backend.app.graphs.course_generation.state import OutlineGenState

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
你是一位专业的课程设计专家。根据以下知识库内容，为目标学员设计一套结构清晰、教学逻辑连贯的课程大纲。

## 知识库摘要
{kb_summary}

## 学员水平
{level_desc}

## 设计原则
- 每个叶节点应聚焦一个独立的知识点，做到"一节讲透一件事"
- 节点数量由知识内容的广度和复杂度决定，不要人为压缩或膨胀
- 节点之间应有清晰的知识边界，避免内容重叠
- 按照学习的逻辑递进顺序排列：先基础后进阶，先概念后应用

## 输出要求
请严格按以下 JSON 格式返回课程大纲，不要包含其他文字：

{{
  "course_title": "课程标题（简洁、吸引人，不超过20字）",
  "nodes": [
    {{
      "temp_id": "n1",
      "parent_temp_id": null,
      "title": "第一章 章节名称",
      "depth": 1,
      "order": 1,
      "is_leaf": false,
      "content_type": null,
      "key_points": null,
      "scope_note": null
    }},
    {{
      "temp_id": "n2",
      "parent_temp_id": "n1",
      "title": "1.1 小节名称（适合视觉演示的内容）",
      "depth": 2,
      "order": 1,
      "is_leaf": true,
      "content_type": "video",
      "key_points": ["要点1", "要点2", "要点3"],
      "scope_note": "本节只讲XX，YY在下一节展开"
    }},
    {{
      "temp_id": "n3",
      "parent_temp_id": "n1",
      "title": "1.2 小节名称（适合深度阅读的内容）",
      "depth": 2,
      "order": 2,
      "is_leaf": true,
      "content_type": "text",
      "key_points": ["要点1", "要点2"],
      "scope_note": "本节聚焦XX的理论背景"
    }}
  ]
}}

## 层级与节点规则
- 支持 1-3 级层级，由内容复杂度决定
- 非叶节点（章节分组）is_leaf=false, content_type=null, key_points=null, scope_note=null
- 叶节点是生成内容的最小单元，is_leaf=true
- 叶节点必须提供 key_points（2-4 个该节点要讲解的核心要点）和 scope_note（划定边界，说明讲什么、不讲什么）
- content_type: "video"（视频讲解，含幻灯片动画 + 旁白配音）或 "text"（图文长文阅读）。请根据该节点知识的特点自行判断最合适的呈现形式，两种类型都应有合理的分布
- temp_id 使用简短唯一字符串（n1, n2...）"""


def _level_desc(level: str) -> str:
    if level == "advanced":
        return "老手（已有该领域基础，希望深入理解原理和高阶用法）"
    return "新手（零基础或入门阶段，需要通俗解释和生动类比）"


def _strip_fences(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        end = -1 if lines[-1].strip() == "```" else len(lines)
        raw = "\n".join(lines[1:end])
    return raw.strip()


async def outline_generator(state: OutlineGenState) -> dict:
    """
    Call LLM to generate a structured course outline from KB summary.
    Returns course_title and nodes list.
    """
    kb_summary = state.get("kb_summary", "")
    level = state.get("level", "beginner")

    prompt = _SYSTEM_PROMPT.format(
        kb_summary=kb_summary or "（知识库内容为空）",
        level_desc=_level_desc(level),
    )

    async with async_session_factory() as session:
        llm = await get_chat_model(session, temperature=0.5)

    response = await llm.ainvoke([
        SystemMessage(content=prompt),
        HumanMessage(content="请根据以上要求生成课程大纲。"),
    ])

    raw = _strip_fences(str(response.content))

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error("Outline generator: invalid JSON from LLM: %s\nRaw: %s", e, raw[:500])
        raise RuntimeError(f"大纲生成失败，LLM 返回格式错误: {e}") from e

    course_title = data.get("course_title", "未命名课程")
    raw_nodes = data.get("nodes", [])

    # Normalise nodes: ensure required fields have defaults
    nodes = [
        {
            "temp_id": n.get("temp_id", f"n{i}"),
            "parent_temp_id": n.get("parent_temp_id"),
            "title": n.get("title", ""),
            "depth": n.get("depth", 1),
            "order": n.get("order", i),
            "is_leaf": bool(n.get("is_leaf", True)),
            "content_type": n.get("content_type"),
            "key_points": n.get("key_points"),
            "scope_note": n.get("scope_note"),
        }
        for i, n in enumerate(raw_nodes)
    ]

    logger.info(
        "Outline generator: title=%r, %d nodes (%d leaf)",
        course_title,
        len(nodes),
        sum(1 for n in nodes if n["is_leaf"]),
    )

    return {
        "course_title": course_title,
        "nodes": nodes,
        "current_node": "outline_generator",
    }
