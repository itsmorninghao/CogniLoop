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
你是一位专业的课程讲师。根据以下信息，为课程节点生成演示幻灯片，每张幻灯片附带对应的旁白脚本。

## 课程大纲
{course_outline}

## 当前节点
{node_title}（{node_position}）

## 本节要讲解的要点
{key_points_text}

## 内容边界
{scope_note}

## 学员水平
{level_desc}

## 参考知识内容
{rag_content}

## 输出要求
严格按以下 JSON 格式返回，不要包含其他文字：

{{
  "section_title": "{node_title}",
  "slides": [
    {{"template": "TITLE_SLIDE", "title": "节点标题", "subtitle": "副标题", "narration": "大家好，欢迎来到本节课程……"}},
    {{"template": "CONCEPT_EXPLAIN", "heading": "概念名", "definition": "定义", "analogy": "类比说明", "narration": "首先我们来理解一下什么是……"}},
    {{"template": "BULLET_POINTS", "heading": "要点标题", "points": ["要点1", "要点2", "要点3"], "narration": "接下来看几个核心要点……"}},
    {{"template": "SUMMARY", "heading": "本节回顾", "points": ["关键点1", "关键点2"], "narration": "最后我们来回顾一下……"}}
  ]
}}

## 关键规则
- 每张幻灯片必须包含 narration 字段，内容是讲师面向学员的口语化讲解，与该张幻灯片的视觉内容对应
- narration 要自然流畅，像真人授课一样，每张 50-150 字
- 幻灯片数量由内容决定，不要人为压缩，确保每个要点都有对应的幻灯片
- 第一张必须是 TITLE_SLIDE，最后一张必须是 SUMMARY
- 注意与前后节点的衔接，不要重复其他节点已覆盖的内容
- 幻灯片上的文字要精炼（标题、要点），详细解释放在 narration 里
- 严禁使用任何 emoji 或表情符号

## 可用 Slide 模板
- TITLE_SLIDE: {{title, subtitle?}} — 节标题页
- BULLET_POINTS: {{heading, points[3-5]}} — 要点列表
- CONCEPT_EXPLAIN: {{heading, definition, analogy}} — 概念解释
- COMPARISON: {{heading, left_label, left_items[], right_label, right_items[]}} — 对比
- QUOTE_HIGHLIGHT: {{quote, emphasis?}} — 重点引用
- SUMMARY: {{heading, points[2-4]}} — 回顾总结
- DIAGRAM_TEXT: {{heading, description}} — 文字描述"""

_SLIDE_PROMPT_V2 = """\
你是课程讲师兼动画导演。为课程节点生成带动画时间线的幻灯片脚本。

## 课程大纲
{course_outline}

## 当前节点
{node_title}（{node_position}）

## 要点
{key_points_text}

## 内容边界
{scope_note}

## 学员水平
{level_desc}

## 参考内容
{rag_content}

## 可用资产 assetId
角色(放右侧x≥1300,每张最多1个): char:teacher-explaining, char:teacher-pointing, char:thinking, char:celebrating, char:questioning, char:scientist, char:student
图标(放文字左侧x=80,w/h=50): icon:lightbulb, icon:book, icon:graduation, icon:atom, icon:flask, icon:code, icon:chart, icon:gear, icon:puzzle, icon:target, icon:rocket, icon:shield, icon:globe, icon:clock, icon:star, icon:checkmark, icon:warning, icon:magnifier, icon:network, icon:brain
装饰: deco:sparkle, deco:arrow-right, deco:checkmark, deco:confetti

## 输出 JSON（严格格式，无其他文字）

示例：
{{
  "section_title": "标题",
  "slides": [
    {{
      "template": "BULLET_POINTS",
      "narration": "旁白文字50-150字……",
      "visual_events": [
        {{"at": 0, "type": "text", "text": "标题", "animation": "typewriter", "position": {{"x": 120, "y": 80}}, "style": "heading"}},
        {{"at": 1.5, "type": "lottie", "assetId": "icon:target", "position": {{"x": 80, "y": 200, "w": 50, "h": 50}}}},
        {{"at": 1.8, "type": "text", "text": "要点描述不超25字", "animation": "word-reveal", "position": {{"x": 150, "y": 210}}, "style": "body", "duration": 2}},
        {{"at": 4.0, "type": "svg-draw", "shape": "underline", "from": {{"x": 150, "y": 245}}, "to": {{"x": 500, "y": 245}}}},
        {{"at": 5.0, "type": "lottie", "assetId": "char:teacher-explaining", "position": {{"x": 1450, "y": 500, "w": 350, "h": 350}}, "loop": true}}
      ]
    }}
  ]
}}

## 规则
- 每张必须有 narration(50-150字) 和 visual_events 数组
- 第一张 TITLE_SLIDE，最后一张 SUMMARY
- 每3-5秒至少1个视觉事件，at按升序，与旁白内容同步
- text事件≤25字，style: heading/body/emphasis/subheading
- animation: typewriter(标题)/word-reveal(正文)/highlight(重点)/fade-up(列表)
- 画布1920x1080，安全区(120,80)-(1800,1000)
- 角色放右侧(x≥1300)，图标放文字左侧(x=80)，文字在左(x:120-1200)
- 居中用 anchor:"center"
- 可用事件: text, lottie, svg-draw(shape:arrow/underline/circle/line), chart(chartType:bar/line/pie, data:{{labels,values}}), diagram(diagramType:flowchart/mindmap/timeline-steps), number(from/to)
- 严禁emoji"""

_TEXT_PROMPT_BEGINNER = """\
你是一位经验丰富的课程讲师，擅长将复杂概念讲解得清晰易懂。请根据以下信息，为零基础或入门阶段的学员生成一篇高质量的课程讲解文章。

## 课程大纲
{course_outline}

## 当前节点
{node_title}（{node_position}）

## 本节要讲解的要点
{key_points_text}

## 内容边界
{scope_note}

## 参考知识内容
{rag_content}

## 写作指南

围绕上述要点组织文章，确保每个要点都讲解透彻。文章结构由你根据内容特点自由决定，以下是一些可选的组织方式（不强制）：
- 概念讲解：先定义，再用生活类比帮助理解，最后给出示例
- 流程说明：按步骤拆解，每步说清"做什么"和"为什么"
- 对比分析：用表格呈现异同

每篇文章末尾需要一个简短的**本节小结**，用列表回顾核心要点。

## 写作要求

- 语气亲切、鼓励，适当口语化，避免堆砌术语
- 每个知识点讲透再推进，不跳跃；重要术语和结论用 **加粗** 标出
- 多用类比和具体例子，少用抽象描述
- 篇幅不限，以讲清楚为准——不水字数，也不刻意压缩
- 注意与前后节点的衔接，不要重复其他节点已覆盖的内容
- 使用 Markdown 格式，适当使用列表和表格增强可读性
- 严禁使用任何 emoji 或表情符号"""

_TEXT_PROMPT_ADVANCED = """\
你是一位经验丰富的技术讲师，面向已有该领域基础的学员。请根据以下信息，生成一篇深度课程讲解文章，侧重原理、边界条件与最佳实践。

## 课程大纲
{course_outline}

## 当前节点
{node_title}（{node_position}）

## 本节要讲解的要点
{key_points_text}

## 内容边界
{scope_note}

## 参考知识内容
{rag_content}

## 写作指南

围绕上述要点组织文章，确保每个要点都有深度讲解。文章结构由你根据内容特点自由决定，以下是一些可选的组织方式（不强制）：
- 原理讲解：直接切入机制本身，重点解释"为什么这样设计"和"内部如何运作"
- 方案对比：使用 Markdown 表格呈现权衡取舍
- 边界与陷阱：说明在哪些场景下会出问题以及原因
- 最佳实践：具体可落地的建议，说明何时该用、何时不该用

每篇文章末尾需要一个简短的**本节小结**，用列表回顾核心要点。

## 写作要求

- 语气专业、直接，不过度解释基础知识
- 使用准确的技术术语，呈现多角度权衡而非唯一答案；重要术语和结论用 **加粗** 标出
- 鼓励批判性思考，说明某些设计决策背后的取舍
- 篇幅不限，以讲清楚为准——不水字数，也不刻意压缩
- 注意与前后节点的衔接，不要重复其他节点已覆盖的内容
- 使用 Markdown 格式，对比类内容优先使用表格，技术内容适当使用代码块
- 严禁使用任何 emoji 或表情符号"""


def _generate_visual_events(slide: dict) -> list[dict]:
    """Auto-generate visual_events from V1 slide data for animated rendering."""
    template = slide.get("template", "")
    events: list[dict] = []
    t = 0.0  # current time in seconds

    TEMPLATE_CHARS = {
        "TITLE_SLIDE": "char:teacher-explaining",
        "CONCEPT_EXPLAIN": "char:teacher-pointing",
        "BULLET_POINTS": "char:teacher-explaining",
        "COMPARISON": "char:thinking",
        "QUOTE_HIGHLIGHT": "char:teacher-pointing",
        "SUMMARY": "char:celebrating",
        "DIAGRAM_TEXT": "char:scientist",
    }
    TEMPLATE_ICONS = {
        "CONCEPT_EXPLAIN": "icon:lightbulb",
        "BULLET_POINTS": "icon:target",
        "COMPARISON": "icon:puzzle",
        "QUOTE_HIGHLIGHT": "icon:star",
        "SUMMARY": "deco:checkmark",
        "DIAGRAM_TEXT": "icon:gear",
    }

    if template == "TITLE_SLIDE":
        title = slide.get("title", "")
        subtitle = slide.get("subtitle", "")
        events.append({"at": t, "type": "text", "text": title, "animation": "typewriter",
                        "position": {"x": 960, "y": 380, "anchor": "center"}, "style": "heading"})
        t += 1.5
        if subtitle:
            events.append({"at": t, "type": "text", "text": subtitle, "animation": "fade-up",
                            "position": {"x": 960, "y": 480, "anchor": "center"}, "style": "subheading"})
            t += 0.5
        events.append({"at": t, "type": "svg-draw", "shape": "underline",
                        "from": {"x": 660, "y": 420}, "to": {"x": 1260, "y": 420}})
        t += 1.0
        events.append({"at": t, "type": "lottie", "assetId": "char:teacher-explaining",
                        "position": {"x": 1500, "y": 600, "w": 350, "h": 350}, "loop": True})

    elif template == "BULLET_POINTS":
        heading = slide.get("heading", "")
        points = slide.get("points", [])
        events.append({"at": t, "type": "text", "text": heading, "animation": "fade-up",
                        "position": {"x": 120, "y": 80}, "style": "heading"})
        t += 1.0
        icons_cycle = ["icon:target", "icon:gear", "icon:star", "icon:rocket", "icon:lightbulb"]
        for i, point in enumerate(points):
            icon = icons_cycle[i % len(icons_cycle)]
            y = 200 + i * 120
            events.append({"at": t, "type": "lottie", "assetId": icon,
                            "position": {"x": 80, "y": y, "w": 50, "h": 50}})
            events.append({"at": t + 0.2, "type": "text", "text": point[:25],
                            "animation": "word-reveal", "position": {"x": 150, "y": y + 5},
                            "style": "body", "duration": 2})
            if len(point) > 25:
                events.append({"at": t + 1.5, "type": "text", "text": point[25:50],
                                "animation": "word-reveal", "position": {"x": 150, "y": y + 45},
                                "style": "body", "duration": 1.5})
            t += 3.0
        events.append({"at": t, "type": "lottie", "assetId": "char:teacher-explaining",
                        "position": {"x": 1450, "y": 500, "w": 350, "h": 350}, "loop": True})

    elif template == "CONCEPT_EXPLAIN":
        heading = slide.get("heading", "")
        definition = slide.get("definition", "")
        analogy = slide.get("analogy", "")
        events.append({"at": t, "type": "lottie", "assetId": "icon:lightbulb",
                        "position": {"x": 120, "y": 80, "w": 60, "h": 60}})
        events.append({"at": t + 0.3, "type": "text", "text": heading, "animation": "scale-in",
                        "position": {"x": 200, "y": 85}, "style": "heading"})
        t += 1.0
        events.append({"at": t, "type": "svg-draw", "shape": "underline",
                        "from": {"x": 200, "y": 145}, "to": {"x": 600, "y": 145}})
        t += 0.5
        for i, chunk in enumerate(_chunk_text(definition, 25)):
            events.append({"at": t, "type": "text", "text": chunk, "animation": "word-reveal",
                            "position": {"x": 120, "y": 200 + i * 50, "w": 1000},
                            "style": "body", "duration": 2})
            t += 2.5
        events.append({"at": t, "type": "lottie", "assetId": "char:teacher-pointing",
                        "position": {"x": 1450, "y": 500, "w": 400, "h": 400}})
        t += 0.5
        if analogy:
            events.append({"at": t, "type": "text", "text": analogy[:50],
                            "animation": "highlight", "position": {"x": 120, "y": 500, "w": 1000},
                            "style": "emphasis"})
            events.append({"at": t + 0.5, "type": "lottie", "assetId": "deco:sparkle",
                            "position": {"x": 100, "y": 490, "w": 40, "h": 40}, "loop": False})

    elif template == "COMPARISON":
        heading = slide.get("heading", "")
        left_label = slide.get("left_label", "")
        right_label = slide.get("right_label", "")
        left_items = slide.get("left_items", [])
        right_items = slide.get("right_items", [])
        events.append({"at": t, "type": "text", "text": heading, "animation": "typewriter",
                        "position": {"x": 960, "y": 80, "anchor": "center"}, "style": "heading"})
        t += 1.5
        events.append({"at": t, "type": "text", "text": left_label, "animation": "fade-up",
                        "position": {"x": 300, "y": 180, "anchor": "center"}, "style": "subheading"})
        events.append({"at": t, "type": "text", "text": right_label, "animation": "fade-up",
                        "position": {"x": 1620, "y": 180, "anchor": "center"}, "style": "subheading"})
        t += 1.0
        events.append({"at": t, "type": "svg-draw", "shape": "line",
                        "from": {"x": 960, "y": 160}, "to": {"x": 960, "y": 900}})
        t += 0.5
        for i, (li, ri) in enumerate(zip(left_items, right_items)):
            y = 260 + i * 100
            events.append({"at": t, "type": "text", "text": li[:25], "animation": "word-reveal",
                            "position": {"x": 120, "y": y}, "style": "body", "duration": 1.5})
            events.append({"at": t + 0.3, "type": "text", "text": ri[:25], "animation": "word-reveal",
                            "position": {"x": 1000, "y": y}, "style": "body", "duration": 1.5})
            t += 2.5
        events.append({"at": t, "type": "lottie", "assetId": "char:thinking",
                        "position": {"x": 880, "y": 700, "w": 200, "h": 200}})

    elif template == "QUOTE_HIGHLIGHT":
        quote = slide.get("quote", "")
        emphasis = slide.get("emphasis", "")
        events.append({"at": t, "type": "lottie", "assetId": "icon:star",
                        "position": {"x": 960, "y": 200, "w": 80, "h": 80, "anchor": "center"}})
        t += 0.5
        for i, chunk in enumerate(_chunk_text(quote, 25)):
            events.append({"at": t, "type": "text", "text": chunk, "animation": "typewriter",
                            "position": {"x": 960, "y": 320 + i * 60, "anchor": "center"},
                            "style": "heading" if i == 0 else "body"})
            t += 2.0
        if emphasis:
            events.append({"at": t, "type": "text", "text": emphasis[:30], "animation": "highlight",
                            "position": {"x": 960, "y": 600, "anchor": "center"}, "style": "emphasis"})
            t += 1.0
        events.append({"at": t, "type": "lottie", "assetId": "char:teacher-pointing",
                        "position": {"x": 1500, "y": 600, "w": 300, "h": 300}})

    elif template == "SUMMARY":
        heading = slide.get("heading", "本节回顾")
        points = slide.get("points", [])
        events.append({"at": t, "type": "text", "text": heading, "animation": "scale-in",
                        "position": {"x": 960, "y": 80, "anchor": "center"}, "style": "heading"})
        t += 1.0
        for i, point in enumerate(points):
            y = 200 + i * 110
            events.append({"at": t, "type": "lottie", "assetId": "deco:checkmark",
                            "position": {"x": 100, "y": y, "w": 40, "h": 40}})
            events.append({"at": t + 0.2, "type": "text", "text": point[:30],
                            "animation": "fade-up", "position": {"x": 160, "y": y + 5},
                            "style": "body"})
            t += 2.5
        events.append({"at": t, "type": "lottie", "assetId": "char:celebrating",
                        "position": {"x": 1400, "y": 550, "w": 400, "h": 400}})
        events.append({"at": t + 0.5, "type": "lottie", "assetId": "deco:confetti",
                        "position": {"x": 960, "y": 100, "w": 200, "h": 200}, "loop": False})

    elif template == "DIAGRAM_TEXT":
        heading = slide.get("heading", "")
        description = slide.get("description", "")
        events.append({"at": t, "type": "lottie", "assetId": "icon:gear",
                        "position": {"x": 120, "y": 80, "w": 60, "h": 60}})
        events.append({"at": t + 0.3, "type": "text", "text": heading, "animation": "fade-up",
                        "position": {"x": 200, "y": 85}, "style": "heading"})
        t += 1.5
        for i, chunk in enumerate(_chunk_text(description, 30)):
            events.append({"at": t, "type": "text", "text": chunk, "animation": "word-reveal",
                            "position": {"x": 120, "y": 200 + i * 50, "w": 1000},
                            "style": "body", "duration": 2})
            t += 2.5
        events.append({"at": t, "type": "lottie", "assetId": "char:scientist",
                        "position": {"x": 1450, "y": 500, "w": 350, "h": 350}, "loop": True})

    return events


def _chunk_text(text: str, max_len: int) -> list[str]:
    """Split text into chunks of roughly max_len characters at word boundaries."""
    if len(text) <= max_len:
        return [text]
    words = text.split()
    chunks: list[str] = []
    current = ""
    for word in words:
        if len(current) + len(word) + 1 > max_len and current:
            chunks.append(current)
            current = word
        else:
            current = f"{current} {word}".strip()
    if current:
        chunks.append(current)
    return chunks


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

    course_outline: str = state.get("course_outline", "")
    node_key_points: list[str] = state.get("node_key_points", [])
    node_position: str = state.get("node_position", "")
    key_points_text = "\n".join(f"- {p}" for p in node_key_points) if node_key_points else "（未指定，请根据参考内容自行提炼）"
    scope_note = state.get("node_scope_note", "（未指定）") or "（未指定）"

    if content_type == "video":
        prompt = _SLIDE_PROMPT.format(
            node_title=node_title,
            level_desc=_level_desc(level),
            rag_content=rag_content,
            course_outline=course_outline or "（无大纲信息）",
            node_position=node_position or "",
            key_points_text=key_points_text,
            scope_note=scope_note,
        )
        response = await llm.ainvoke([
            SystemMessage(content=prompt),
            HumanMessage(content="请生成幻灯片 JSON。"),
        ])
        raw = _strip_fences(str(response.content))
        script_json = json.loads(raw)

        slides = script_json.get("slides", [])
        for slide in slides:
            if "visual_events" not in slide:
                slide["visual_events"] = _generate_visual_events(slide)
        narration_text = "\n\n".join(
            s.get("narration", "") for s in slides if s.get("narration")
        ) or node_title

        logger.info(
            "Content generator (video): node='%s', %d slides",
            node_title, len(slides),
        )
        return {
            "script_json": script_json,
            "text_content": None,
            "narration_text": narration_text,
            "current_node": "content_generator",
        }

    else:  # text
        from backend.app.core.redis_pubsub import publish

        node_id = state.get("node_id")
        template = _TEXT_PROMPT_ADVANCED if level == "advanced" else _TEXT_PROMPT_BEGINNER
        prompt = template.format(
            node_title=node_title,
            rag_content=rag_content,
            course_outline=course_outline or "（无大纲信息）",
            node_position=node_position or "",
            key_points_text=key_points_text,
            scope_note=scope_note,
        )

        text_content = ""
        channel = f"course:node:{node_id}:stream"

        async for chunk in llm.astream([
            SystemMessage(content=prompt),
            HumanMessage(content="请生成课程内容文章。"),
        ]):
            token = chunk.content or ""
            if token:
                text_content += token
                if node_id:
                    await publish(channel, {"type": "token", "t": token})

        text_content = text_content.strip()

        if node_id:
            await publish(channel, {"type": "done", "text": text_content})

        logger.info(
            "Content generator (text): node='%s', %d chars",
            node_title, len(text_content),
        )
        return {
            "script_json": None,
            "text_content": text_content,
            "narration_text": text_content,
            "current_node": "content_generator",
        }
