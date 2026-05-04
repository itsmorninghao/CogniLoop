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
- narration 要自然流畅，像真人授课一样，每张 35-90 字
- 幻灯片数量由内容决定，不要人为压缩；长解释拆成更多短页，每页只推进一个清晰小节奏
- 第一张必须是 TITLE_SLIDE，最后一张必须是 SUMMARY
- 注意与前后节点的衔接，不要重复其他节点已覆盖的内容
- 幻灯片上的文字要精炼（标题、要点），详细解释放在 narration 里
- points 必须是完整短句，不能只写“最后给方案：”“原因：”这类没有结论的半句话
- 每页只保留一个视觉主旨：画面文字负责提示结构，解释细节放到 narration
- 不要把所有内容都写成 BULLET_POINTS；概念定义优先 CONCEPT_EXPLAIN，机制/流程优先 DIAGRAM_TEXT，权衡和差异优先 COMPARISON
- 每一节至少尝试使用 2 种以上页面结构，让标题页、解释页、过程页、对比页、总结页的视觉节奏明显不同
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
      "narration": "旁白文字35-90字……",
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
- 每张必须有 narration(35-90字) 和 visual_events 数组
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
    """Generate timeline events from slide content."""
    template = slide.get("template", "")
    events: list[dict] = []
    t = 0.0

    if template == "TITLE_SLIDE":
        title = _clean_display_text(slide.get("title", ""))
        subtitle = _clean_display_text(slide.get("subtitle", ""))
        labels = _spotlight_labels([title, subtitle, "目标", "拆解", "回顾"], 4)
        asset_kind = _scene_asset_kind(title, template)
        events.append({"at": t, "type": "scene-stage",
                        "position": {"x": 110, "y": 120, "w": 1700, "h": 830},
                        "stageKind": "hero",
                        "sceneFamily": _scene_family_for_slide(template, "hero", asset_kind, title, [subtitle]),
                        "title": title,
                        "subtitle": subtitle,
                        "assetKind": asset_kind,
                        "assetPrompt": _asset_prompt_for_scene(title, subtitle, asset_kind),
                        "labels": labels,
                        "focus": "先建立对象，再拆成可验证的路径。",
                        "duration": 7})

    elif template == "BULLET_POINTS":
        heading = _clean_display_text(slide.get("heading", ""))
        points = _clean_display_items(slide.get("points", []), 4)
        stage_kind = _stage_kind_for_slide(template, heading, points)
        asset_kind = _scene_asset_kind(" ".join([heading, *points]), template)
        events.append({"at": t, "type": "scene-stage",
                        "position": {"x": 100, "y": 125, "w": 1720, "h": 835},
                        "stageKind": stage_kind,
                        "sceneFamily": _scene_family_for_slide(template, stage_kind, asset_kind, heading, points),
                        "title": heading,
                        "subtitle": _caption_from_items(points),
                        "assetKind": asset_kind,
                        "assetPrompt": _asset_prompt_for_scene(heading, _caption_from_items(points), asset_kind),
                        "labels": _visual_labels([heading, *points], 5),
                        "focus": _caption_from_items(points),
                        "duration": 7})

    elif template == "CONCEPT_EXPLAIN":
        heading = _clean_display_text(slide.get("heading", ""))
        definition = _clean_display_text(slide.get("definition", ""))
        analogy = _clean_display_text(slide.get("analogy", ""))
        asset_kind = _scene_asset_kind(f"{heading} {definition} {analogy}", template)
        events.append({"at": t, "type": "scene-stage",
                        "position": {"x": 100, "y": 125, "w": 1720, "h": 835},
                        "stageKind": "deep-dive",
                        "sceneFamily": _scene_family_for_slide(template, "deep-dive", asset_kind, heading, [definition, analogy]),
                        "title": heading,
                        "subtitle": _truncate_display(definition, 70),
                        "assetKind": asset_kind,
                        "assetPrompt": _asset_prompt_for_scene(heading, definition or analogy, asset_kind),
                        "labels": _visual_labels([heading, definition, analogy], 5),
                        "focus": _truncate_display(analogy or definition, 58),
                        "duration": 7})

    elif template == "COMPARISON":
        heading = _clean_display_text(slide.get("heading", ""))
        left_label = _clean_display_text(slide.get("left_label", "左侧"))
        right_label = _clean_display_text(slide.get("right_label", "右侧"))
        left_items = _clean_display_items(slide.get("left_items", []), 3)
        right_items = _clean_display_items(slide.get("right_items", []), 3)
        asset_kind = _scene_asset_kind(f"{heading} {' '.join(left_items + right_items)}", template)
        events.append({"at": t, "type": "scene-stage",
                        "position": {"x": 100, "y": 125, "w": 1720, "h": 835},
                        "stageKind": "comparison",
                        "sceneFamily": _scene_family_for_slide(template, "comparison", asset_kind, heading, [*left_items, *right_items]),
                        "title": heading,
                        "subtitle": f"{left_label} 与 {right_label} 的关键差异",
                        "assetKind": asset_kind,
                        "assetPrompt": _asset_prompt_for_scene(heading, f"{left_label} versus {right_label}", asset_kind),
                        "labels": _comparison_stage_labels(left_label, left_items, right_label, right_items),
                        "focus": "先看判断维度，再看两侧取舍。",
                        "duration": 7})

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
        asset_kind = _scene_asset_kind(" ".join([heading, *points]), template)
        events.append({"at": t, "type": "scene-stage",
                        "position": {"x": 100, "y": 125, "w": 1720, "h": 835},
                        "stageKind": "recap",
                        "sceneFamily": _scene_family_for_slide(template, "recap", asset_kind, heading, points),
                        "title": heading,
                        "subtitle": "把本节内容收束成一条可复用路径。",
                        "assetKind": asset_kind,
                        "assetPrompt": _asset_prompt_for_scene(heading, _caption_from_items(points), asset_kind),
                        "labels": _visual_labels([heading, *points], 5),
                        "focus": _caption_from_items(points),
                        "duration": 7})

    elif template == "DIAGRAM_TEXT":
        heading = _clean_display_text(slide.get("heading", ""))
        description = _clean_display_text(slide.get("description", ""))
        stage_kind = _stage_kind_for_slide(template, heading, [description])
        asset_kind = _scene_asset_kind(f"{heading} {description}", template)
        events.append({"at": t, "type": "scene-stage",
                        "position": {"x": 100, "y": 125, "w": 1720, "h": 835},
                        "stageKind": stage_kind,
                        "sceneFamily": _scene_family_for_slide(template, stage_kind, asset_kind, heading, [description]),
                        "title": heading,
                        "subtitle": _truncate_display(description, 70),
                        "assetKind": asset_kind,
                        "assetPrompt": _asset_prompt_for_scene(heading, description, asset_kind),
                        "labels": _visual_labels([heading, description], 5),
                        "focus": _truncate_display(description, 58),
                        "duration": 7})

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
    if any(word in text for word in ("评价", "质量", "清晰度", "可信度", "参与感", "维度", "量化", "判断", "评估")):
        return "dashboard"
    if any(word in text for word in ("机制", "因果", "影响", "动机", "体验", "认知", "反馈", "关系", "链条")):
        return "network"
    if any(word in text for word in ("流程", "步骤", "节奏", "路径", "阶段", "递进")) or template == "BULLET_POINTS":
        return "timeline"
    if any(word in text for word in ("语言", "文本", "词汇", "句式", "语用", "文体", "文章", "正式英语", "资料", "知识库")):
        return "document"
    if any(word in text for word in ("网络", "连接", "节点", "关系", "传播", "链路")):
        return "network"
    if any(word in text for word in ("文档", "文章", "资料", "笔记", "知识库", "课程大纲")):
        return "document"
    if any(word in text for word in ("实验", "测试", "验证", "观察", "质检")):
        return "lab"
    if any(word in text for word in ("波动", "趋势", "信号", "变化")):
        return "signal"
    return "network"


def _scene_family_for_slide(
    template: str,
    stage_kind: str,
    asset_kind: str,
    heading: str,
    items: list[str],
) -> str:
    merged = " ".join([_clean_display_text(heading), *(_clean_display_text(item) for item in items)])

    if template == "TITLE_SLIDE" or stage_kind == "hero":
        if asset_kind == "document":
            return "document-scan"
        if asset_kind in {"dashboard", "signal"}:
            return "data-dashboard"
        if asset_kind == "timeline":
            return "process-board"
        if asset_kind in {"lab", "code", "network"}:
            return "mechanism-map"
        return "cinematic-hero"
    if template == "COMPARISON" or stage_kind == "comparison":
        return "split-compare"
    if template == "SUMMARY" or stage_kind == "recap":
        return "recap-map"
    if stage_kind == "metric" or asset_kind in {"dashboard", "signal"}:
        return "data-dashboard"
    if stage_kind == "process" or asset_kind == "timeline":
        return "process-board"
    if asset_kind == "document" or any(word in merged for word in ("语言", "文本", "词汇", "句式", "文章", "文档", "资料")):
        return "document-scan"
    if asset_kind == "lab" or template in {"CONCEPT_EXPLAIN", "DIAGRAM_TEXT"}:
        return "mechanism-map"
    return "mechanism-map"


def _asset_prompt_for_scene(title: str, description: str, asset_kind: str) -> str:
    """Metadata for future image generation/asset retrieval; renderer falls back to code-native visuals."""
    title = _clean_display_text(title)
    description = _truncate_display(description or title, 80)
    styles = {
        "document": "editorial document close-up, highlighted sentences, clean educational annotation",
        "timeline": "cinematic process board, layered arrows, progressive construction",
        "dashboard": "data dashboard, animated metrics, performance chart",
        "signal": "signal waveform, trend line, analytical overlay",
        "lab": "science lab visualization, experiment table, concept model",
        "code": "code editor and system diagram, modern technical tutorial",
        "network": "knowledge network map, connected nodes, educational explainer",
    }
    return f"{styles.get(asset_kind, styles['network'])}; topic: {title}; detail: {description}"


def _stage_kind_for_slide(template: str, heading: str, items: list[str]) -> str:
    if template == "TITLE_SLIDE":
        return "hero"
    if template == "COMPARISON":
        return "comparison"
    if template == "SUMMARY":
        return "recap"

    mode = _concept_mode(heading, items, "concept")
    if mode == "metric":
        return "metric"
    if mode == "process":
        return "process"
    if mode == "summary":
        return "recap"
    return "deep-dive"


def _comparison_stage_labels(
    left_label: str,
    left_items: list[str],
    right_label: str,
    right_items: list[str],
) -> list[str]:
    left = _visual_labels([left_label, *left_items], 3)
    right = _visual_labels([right_label, *right_items], 3)
    while len(left) < 3:
        left.append(["方案 A", "优势", "代价"][len(left)])
    while len(right) < 3:
        right.append(["方案 B", "收益", "边界"][len(right)])
    return [*left[:3], *right[:3]]


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

    else:
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
