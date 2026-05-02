"""
Node 2 (node graph): Content Generator — LLM generates slide JSON (video) or text article.
"""

from __future__ import annotations

import json
import logging
import re

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
- points 必须是完整短句，不能只写“最后给方案：”“原因：”这类没有结论的半句话
- 每页只保留一个视觉主旨：画面文字负责提示结构，解释细节放到 narration
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

    if template == "TITLE_SLIDE":
        title = _clean_display_text(slide.get("title", ""))
        subtitle = _clean_display_text(slide.get("subtitle", ""))
        labels = _spotlight_labels([title, subtitle, "目标", "拆解", "回顾"], 4)
        events.append({"at": t, "type": "text", "text": title, "animation": "fade-up",
                        "position": {"x": 120, "y": 150, "w": 900},
                        "style": "heading", "fontSize": _heading_font_size(title, 68)})
        t += 1.5
        if subtitle:
            events.append({"at": t, "type": "text", "text": subtitle, "animation": "fade-up",
                            "position": {"x": 126, "y": 350, "w": 760}, "style": "subheading"})
            t += 0.5
        events.append({"at": t, "type": "svg-draw", "shape": "underline",
                        "from": {"x": 126, "y": 490}, "to": {"x": 620, "y": 490},
                        "strokeWidth": 3})
        events.append({"at": 0.5, "type": "scene-asset",
                        "position": {"x": 1030, "y": 210, "w": 720, "h": 560},
                        "assetKind": _scene_asset_kind(title, template),
                        "title": _short_label(title, 14),
                        "labels": labels,
                        "duration": 5})
        events.append({"at": 3.0, "type": "callout-card",
                        "position": {"x": 126, "y": 620, "w": 760, "h": 138},
                        "title": "这一节只抓核心",
                        "body": "先建立概念，再看节奏，最后回到可验证的结论。",
                        "index": 1,
                        "tone": "accent"})

    elif template == "BULLET_POINTS":
        heading = _clean_display_text(slide.get("heading", ""))
        points = _clean_display_items(slide.get("points", []), 4)
        events.append({"at": t, "type": "text", "text": heading, "animation": "fade-up",
                        "position": {"x": 120, "y": 80, "w": 1180}, "style": "heading"})
        t += 1.0
        if points:
            events.append({"at": t, "type": "concept-build",
                            "mode": _concept_mode(heading, points, "process"),
                            "position": {"x": 1010, "y": 300, "w": 760, "h": 460},
                            "title": _short_label(heading, 14),
                            "labels": _visual_labels([heading, *points], 5),
                            "caption": _caption_from_items(points),
                            "duration": 6})
        for i, point in enumerate(points):
            card_title, card_body = _split_card_text(point)
            y = 190 + i * 154
            events.append({"at": t + i * 0.45, "type": "callout-card",
                            "position": {"x": 120, "y": y, "w": 780, "h": 124},
                            "title": card_title,
                            "body": card_body,
                            "index": i + 1,
                            "tone": _tone_for_index(i)})

    elif template == "CONCEPT_EXPLAIN":
        heading = _clean_display_text(slide.get("heading", ""))
        definition = _clean_display_text(slide.get("definition", ""))
        analogy = _clean_display_text(slide.get("analogy", ""))
        events.append({"at": t + 0.3, "type": "text", "text": heading, "animation": "scale-in",
                        "position": {"x": 120, "y": 88, "w": 980},
                        "style": "heading", "fontSize": _heading_font_size(heading, 62)})
        t += 1.0
        events.append({"at": t, "type": "svg-draw", "shape": "line",
                        "from": {"x": 124, "y": 170}, "to": {"x": 210, "y": 170},
                        "strokeWidth": 5})
        if definition:
            card_title, card_body = _split_card_text(definition)
            events.append({"at": 1.4, "type": "callout-card",
                            "position": {"x": 120, "y": 220, "w": 800, "h": 150},
                            "title": card_title,
                            "body": card_body,
                            "index": 1,
                            "tone": "primary"})
        if analogy:
            card_title, card_body = _split_card_text(analogy)
            events.append({"at": 2.2, "type": "callout-card",
                            "position": {"x": 120, "y": 410, "w": 800, "h": 150},
                            "title": card_title,
                            "body": card_body or "用熟悉场景降低理解成本。",
                            "index": 2,
                            "tone": "accent"})
        events.append({"at": 1.0, "type": "concept-build",
                        "mode": _concept_mode(heading, [definition, analogy], "concept"),
                        "position": {"x": 1040, "y": 280, "w": 760, "h": 500},
                        "title": _short_label(heading, 14),
                        "labels": _visual_labels([heading, definition, analogy], 5),
                        "caption": _truncate_display(definition or analogy, 54),
                        "duration": 6})

    elif template == "COMPARISON":
        heading = _clean_display_text(slide.get("heading", ""))
        left_label = _clean_display_text(slide.get("left_label", "左侧"))
        right_label = _clean_display_text(slide.get("right_label", "右侧"))
        left_items = _clean_display_items(slide.get("left_items", []), 3)
        right_items = _clean_display_items(slide.get("right_items", []), 3)
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
        events.append({"at": 1.0, "type": "concept-build",
                        "mode": "comparison",
                        "position": {"x": 520, "y": 270, "w": 880, "h": 520},
                        "title": _short_label(heading, 14),
                        "labels": _visual_labels([*left_items, *right_items], 6),
                        "caption": "左右对照时，画面先建立判断维度，再揭示差异。",
                        "duration": 6})
        t += 0.5
        for i, (li, ri) in enumerate(zip(left_items, right_items)):
            y = 260 + i * 100
            events.append({"at": t, "type": "text", "text": _truncate_display(li, 25), "animation": "word-reveal",
                            "position": {"x": 120, "y": y}, "style": "body", "duration": 1.5})
            events.append({"at": t + 0.3, "type": "text", "text": _truncate_display(ri, 25), "animation": "word-reveal",
                            "position": {"x": 1000, "y": y}, "style": "body", "duration": 1.5})
            t += 2.5
        events.append({"at": t, "type": "lottie", "assetId": "char:thinking",
                        "position": {"x": 880, "y": 700, "w": 200, "h": 200}})

    elif template == "QUOTE_HIGHLIGHT":
        quote = _clean_display_text(slide.get("quote", ""))
        emphasis = _clean_display_text(slide.get("emphasis", ""))
        events.append({"at": t, "type": "lottie", "assetId": "icon:star",
                        "position": {"x": 960, "y": 200, "w": 80, "h": 80, "anchor": "center"}})
        t += 0.5
        for i, chunk in enumerate(_chunk_text(quote, 25)):
            events.append({"at": t, "type": "text", "text": chunk, "animation": "typewriter",
                            "position": {"x": 960, "y": 320 + i * 60, "anchor": "center"},
                            "style": "heading" if i == 0 else "body"})
            t += 2.0
        if emphasis:
            events.append({"at": t, "type": "text", "text": _truncate_display(emphasis, 30), "animation": "highlight",
                            "position": {"x": 960, "y": 600, "anchor": "center"}, "style": "emphasis"})
            t += 1.0
        events.append({"at": t, "type": "lottie", "assetId": "char:teacher-pointing",
                        "position": {"x": 1500, "y": 600, "w": 300, "h": 300}})

    elif template == "SUMMARY":
        heading = _clean_display_text(slide.get("heading", "本节回顾"))
        points = _clean_display_items(slide.get("points", []), 4)
        events.append({"at": t, "type": "text", "text": heading, "animation": "scale-in",
                        "position": {"x": 120, "y": 80, "w": 980}, "style": "heading"})
        t += 1.0
        if points:
            events.append({"at": 1.0, "type": "concept-build",
                            "mode": "summary",
                            "position": {"x": 1060, "y": 260, "w": 700, "h": 520},
                            "title": "本节结论",
                            "labels": _spotlight_labels(points, 4),
                            "caption": "回顾不是重复文字，而是把本节内容收束成一条可复用路径。",
                            "duration": 6})
        for i, point in enumerate(points):
            card_title, card_body = _split_card_text(point)
            y = 210 + i * 142
            events.append({"at": t + i * 0.45, "type": "callout-card",
                            "position": {"x": 120, "y": y, "w": 780, "h": 112},
                            "title": card_title,
                            "body": card_body,
                            "index": i + 1,
                            "tone": "success"})

    elif template == "DIAGRAM_TEXT":
        heading = _clean_display_text(slide.get("heading", ""))
        description = _clean_display_text(slide.get("description", ""))
        events.append({"at": t + 0.3, "type": "text", "text": heading, "animation": "fade-up",
                        "position": {"x": 120, "y": 85, "w": 980}, "style": "heading"})
        card_title, card_body = _split_card_text(description)
        events.append({"at": 1.4, "type": "callout-card",
                        "position": {"x": 120, "y": 230, "w": 820, "h": 170},
                        "title": card_title,
                        "body": card_body,
                        "index": 1,
                        "tone": "primary"})
        events.append({"at": 1.0, "type": "scene-asset",
                        "position": {"x": 1040, "y": 260, "w": 720, "h": 520},
                        "assetKind": _scene_asset_kind(f"{heading} {description}", template),
                        "title": _short_label(heading, 14),
                        "labels": _spotlight_labels([heading, description], 4),
                        "duration": 6})

    return events


def _clean_display_text(text: str | None) -> str:
    """Normalize short on-slide text and remove dangling prompt fragments."""
    text = re.sub(r"\s+", " ", (text or "").strip())
    text = re.sub(r"^[\-•·\s]+", "", text)
    text = re.sub(r"^[一二三四五六七八九十0-9]+[、.．]\s*", "", text)
    text = text.strip("「」“”\"'")
    text = text.rstrip()
    if text.endswith(("：", ":")):
        text = text[:-1].strip()
    replacements = {
        "最后给方案": "给出可执行方案",
        "最后给出方案": "给出可执行方案",
        "给方案": "给出可执行方案",
    }
    return replacements.get(text, text)


def _clean_display_items(items: list[str], max_items: int) -> list[str]:
    cleaned: list[str] = []
    for item in items:
        text = _clean_display_text(str(item))
        if not text:
            continue
        if len(text) <= 2:
            continue
        if text not in cleaned:
            cleaned.append(text)
        if len(cleaned) >= max_items:
            break
    return cleaned


def _truncate_display(text: str, max_len: int) -> str:
    text = _clean_display_text(text)
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rstrip("，。；：、,.!?！？") + "…"


def _split_card_text(text: str) -> tuple[str, str]:
    text = _clean_display_text(text)
    if not text:
        return "抓住核心", "把细节放进旁白，画面只保留判断路径。"

    for sep in ("：", ":", "，", "。", "；", ";", " - ", "—"):
        if sep in text:
            head, tail = text.split(sep, 1)
            head = _clean_display_text(head)
            tail = _clean_display_text(tail)
            if 2 <= len(head) <= 16 and tail:
                return head, _truncate_display(tail, 42)

    chunks = _chunk_text(text, 18)
    title = _truncate_display(chunks[0] if chunks else text, 18)
    body_source = "".join(chunks[1:]).strip() if len(chunks) > 1 else ""
    body = _truncate_display(body_source, 42) if body_source else ""
    return title, body


def _tone_for_index(index: int) -> str:
    return ["primary", "accent", "warning", "success"][index % 4]


def _spotlight_labels(items: list[str], max_items: int) -> list[str]:
    labels: list[str] = []
    for item in items:
        label = _short_label(_clean_display_text(item), 10)
        if label and label not in labels:
            labels.append(label)
        if len(labels) >= max_items:
            break
    return labels


def _visual_labels(items: list[str], max_items: int) -> list[str]:
    labels: list[str] = []
    for item in items:
        text = _clean_display_text(item)
        if not text:
            continue
        card_title, card_body = _split_card_text(text)
        candidates = [card_title, _short_label(card_body, 10), _short_label(text, 10)]
        for candidate in candidates:
            label = _clean_display_text(candidate)
            if 2 <= len(label) <= 12 and label not in labels:
                labels.append(label)
                break
        if len(labels) >= max_items:
            break
    return labels or ["概念", "拆解", "验证"]


def _caption_from_items(items: list[str]) -> str:
    for item in items:
        text = _clean_display_text(item)
        if len(text) >= 10:
            return _truncate_display(text, 54)
    return "画面会按讲解顺序逐步搭起概念关系，而不是一次性堆出全部文字。"


def _scene_asset_kind(text: str, template: str) -> str:
    text = _clean_display_text(text)
    lowered = text.lower()
    if any(word in lowered for word in ("代码", "编程", "api", "接口", "python", "typescript", "javascript")):
        return "code"
    if any(word in text for word in ("GPU", "渲染", "性能", "耗时", "毫秒", "帧", "卡顿", "指标")):
        return "dashboard"
    if any(word in text for word in ("网络", "连接", "节点", "关系", "传播", "链路")):
        return "network"
    if any(word in text for word in ("文档", "文章", "资料", "笔记", "知识库", "课程大纲")):
        return "document"
    if any(word in text for word in ("实验", "测试", "验证", "观察", "质检")):
        return "lab"
    if any(word in text for word in ("流程", "步骤", "节奏", "路径", "阶段", "递进")) or template == "BULLET_POINTS":
        return "timeline"
    if any(word in text for word in ("波动", "趋势", "信号", "变化")):
        return "signal"
    return "network"


def _concept_mode(text: str, items: list[str], fallback: str) -> str:
    merged = " ".join([_clean_display_text(text), *(_clean_display_text(item) for item in items)])
    if any(word in merged for word in ("对比", "差异", "方案A", "方案 B", "优缺点")):
        return "comparison"
    if any(word in merged for word in ("耗时", "性能", "毫秒", "帧", "卡顿", "指标", "瓶颈", "波动")):
        return "metric"
    if any(word in merged for word in ("步骤", "流程", "节奏", "路径", "阶段", "递进")):
        return "process"
    if any(word in merged for word in ("回顾", "总结", "结论")):
        return "summary"
    return fallback


def _chunk_text(text: str, max_len: int) -> list[str]:
    """Split text into chunks of roughly max_len characters at word boundaries."""
    text = re.sub(r"\s+", " ", (text or "").strip())
    if len(text) <= max_len:
        return [text] if text else []

    # CJK-heavy text usually has no spaces, so split near punctuation before
    # falling back to a hard character boundary.
    if " " not in text:
        chunks: list[str] = []
        current = ""
        punctuation = "，。；：、,.!?！？"
        for ch in text:
            current += ch
            if len(current) >= max_len:
                cut = max(current.rfind(p) for p in punctuation)
                if cut >= int(max_len * 0.55):
                    chunks.append(current[: cut + 1].strip())
                    current = current[cut + 1 :].strip()
                else:
                    chunks.append(current.strip())
                    current = ""
        if current:
            chunks.append(current)
        return chunks

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


def _display_lines(text: str, max_len: int, max_lines: int) -> list[str]:
    """Return a compact set of complete-looking lines for on-slide text."""
    chunks = _chunk_text(text, max_len)
    if len(chunks) <= max_lines:
        return chunks
    visible = chunks[:max_lines]
    visible[-1] = visible[-1].rstrip("，。；：、,.!?！？") + "..."
    return visible


def _short_label(text: str, max_len: int = 10) -> str:
    text = re.sub(r"\s+", "", (text or "").strip())
    text = re.sub(r"^[一二三四五六七八九十0-9]+[、.．]", "", text)
    for sep in ("：", ":", "-", "—"):
        head = text.split(sep, 1)[0]
        if 2 <= len(head) <= max_len:
            return head
    for sep in ("中的", "里的", "的"):
        if sep in text:
            tail = text.rsplit(sep, 1)[-1]
            if 2 <= len(tail) <= max_len:
                return tail
    pieces = [
        piece for piece in re.split(r"[，。；、,.!?！？]|以及|并且|同时|是否|符合|负责|检查", text)
        if piece
    ]
    for piece in pieces:
        if 2 <= len(piece) <= max_len:
            return piece
    if pieces:
        text = pieces[0]
    if len(text) <= max_len:
        return text
    return text[:max_len]


def _heading_font_size(text: str, base_size: int) -> int:
    visual_len = len(re.sub(r"\s+", "", text or ""))
    if visual_len >= 34:
        return max(46, base_size - 16)
    if visual_len >= 24:
        return max(50, base_size - 10)
    return base_size


def _diagram_nodes_from_items(items: list[str], max_nodes: int) -> list[dict]:
    nodes = []
    for i, item in enumerate(items[:max_nodes]):
        nodes.append({"id": f"n{i + 1}", "label": _short_label(item, 12)})
    return nodes


def _concept_diagram_nodes(heading: str, definition: str, analogy: str | None) -> list[dict]:
    labels = [_short_label(heading, 10)]
    source = "。".join(part for part in [definition, analogy or ""] if part)
    for chunk in re.split(r"[，。；、,.!?！？]", source or heading):
        label = _short_label(chunk, 8)
        if label and label not in labels:
            labels.append(label)
        if len(labels) >= 5:
            break
    if analogy and len(labels) < 5:
        labels.append(_short_label(analogy, 8))
    return [{"id": f"n{i + 1}", "label": label} for i, label in enumerate(labels)]


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
