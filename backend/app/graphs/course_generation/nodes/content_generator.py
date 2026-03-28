"""
Node 2 (node graph): Content Generator — LLM generates slide JSON (video) or text article.
"""

from __future__ import annotations

import json
import logging

from langchain_core.messages import HumanMessage, SystemMessage

from backend.app.core.database import async_session_factory
from backend.app.core.llm import get_chat_model
from backend.app.graphs.course_generation.state import NodeGenState

logger = logging.getLogger(__name__)

_SLIDE_PROMPT = """\
你是一位专业的课程讲师。根据以下知识内容，为课程节点生成演示幻灯片和旁白脚本。

## 节点标题
{node_title}

## 学员水平
{level_desc}

## 参考知识内容
{rag_content}

## 输出要求
严格按以下 JSON 格式返回，不要包含其他文字：

{{
  "section_title": "{node_title}",
  "narration_script": "完整旁白脚本（面向学员的讲解，3-5分钟，约500-800字）",
  "slides": [
    {{"template": "TITLE_SLIDE", "title": "节点标题", "subtitle": "副标题（可选）"}},
    {{"template": "CONCEPT_EXPLAIN", "heading": "概念名", "definition": "定义", "analogy": "类比说明"}},
    {{"template": "BULLET_POINTS", "heading": "要点标题", "points": ["要点1", "要点2", "要点3"]}},
    {{"template": "SUMMARY", "heading": "本节回顾", "points": ["关键点1", "关键点2"]}}
  ]
}}

## 可用 Slide 模板
- TITLE_SLIDE: {{title, subtitle?}} — 节标题页
- BULLET_POINTS: {{heading, points[3-5]}} — 要点列表
- CONCEPT_EXPLAIN: {{heading, definition, analogy}} — 概念解释
- COMPARISON: {{heading, left_label, left_items[], right_label, right_items[]}} — 对比
- QUOTE_HIGHLIGHT: {{quote, emphasis?}} — 重点引用
- SUMMARY: {{heading, points[2-4]}} — 回顾总结
- DIAGRAM_TEXT: {{heading, description}} — 文字描述

slides 共 4-8 张，末尾必须是 SUMMARY。"""

_TEXT_PROMPT = """\
你是一位专业的课程讲师。根据以下知识内容，为课程节点生成结构化文章。

## 节点标题
{node_title}

## 学员水平
{level_desc}

## 参考知识内容
{rag_content}

## 输出要求
生成结构清晰的 Markdown 格式文章，包含：
- 引言（1段）
- 核心内容（分段，每段有小标题）
- 关键要点总结
- 适合学员水平：{level_note}
文章长度 600-1000 字。"""


def _level_desc(level: str) -> str:
    if level == "advanced":
        return "老手（已有该领域基础，希望深入理解原理和高阶用法）"
    return "新手（零基础或入门阶段，需要通俗解释和生动类比）"


def _level_note(level: str) -> str:
    if level == "advanced":
        return "不用过多解释基础概念，直接讲核心原理和深度内容"
    return "多用类比和具体例子，避免专业术语堆砌"


def _strip_fences(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        end = -1 if lines[-1].strip() == "```" else len(lines)
        raw = "\n".join(lines[1:end])
    return raw.strip()


async def content_generator(state: NodeGenState) -> dict:
    """
    Generate slide JSON (for video nodes) or Markdown text (for text nodes).
    """
    content_type: str = state.get("content_type", "text")
    node_title: str = state.get("node_title", "")
    level: str = state.get("level", "beginner")
    rag_content: str = state.get("rag_content", "")

    async with async_session_factory() as session:
        llm = await get_chat_model(session, temperature=0.7)

    if content_type == "video":
        prompt = _SLIDE_PROMPT.format(
            node_title=node_title,
            level_desc=_level_desc(level),
            rag_content=rag_content,
        )
        response = await llm.ainvoke([
            SystemMessage(content=prompt),
            HumanMessage(content="请生成幻灯片 JSON。"),
        ])
        raw = _strip_fences(str(response.content))
        script_json = json.loads(raw)
        narration_text = script_json.get("narration_script", node_title)

        logger.info(
            "Content generator (video): node='%s', %d slides",
            node_title, len(script_json.get("slides", [])),
        )
        return {
            "script_json": script_json,
            "text_content": None,
            "narration_text": narration_text,
            "current_node": "content_generator",
        }

    else:  # text
        prompt = _TEXT_PROMPT.format(
            node_title=node_title,
            level_desc=_level_desc(level),
            rag_content=rag_content,
            level_note=_level_note(level),
        )
        response = await llm.ainvoke([
            SystemMessage(content=prompt),
            HumanMessage(content="请生成课程内容文章。"),
        ])
        text_content = str(response.content).strip()

        logger.info(
            "Content generator (text): node='%s', %d chars",
            node_title, len(text_content),
        )
        return {
            "script_json": None,
            "text_content": text_content,
            "narration_text": text_content[:800],  # summary for quiz generation
            "current_node": "content_generator",
        }
