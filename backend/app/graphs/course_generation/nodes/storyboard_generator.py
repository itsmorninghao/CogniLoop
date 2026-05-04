"""
Node graph: Storyboard Generator.

This node upgrades the coarse slide script into a director-level storyboard.
The important shift is video-level visual identity: every slide should feel
like a different shot inside the same explainer world, not like the same PPT
template with different text.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from backend.app.core.database import async_session_factory
from backend.app.core.llm import get_chat_model
from backend.app.graphs.course_generation.state import NodeGenState

logger = logging.getLogger(__name__)

_SCENE_TYPES = {
    "concept_opening",
    "mechanism_build",
    "contrastive_explainer",
    "evidence_scan",
    "process_walkthrough",
    "system_map",
    "metric_inspection",
    "mistake_reveal",
    "analogy_bridge",
    "recap_synthesis",
}

_VISUAL_WORLDS = {
    "document_lab",
    "classroom_studio",
    "amplifier_factory",
    "data_observatory",
    "concept_kitchen",
    "systems_map",
}

_CAMERA_STYLES = {
    "slow_push",
    "scan_pan",
    "tabletop_track",
    "split_reveal",
    "orbit",
    "pullback",
}

_PROMPT = """\
你是一个 B 站 / YouTube 科普视频的动画导演，同时懂课程教学设计。
你的任务不是改写课程内容，而是把每页幻灯片升级成“动态图解故事板”。

## 课程信息
- 当前节点：{node_title}
- 节点位置：{node_position}
- 学员水平：{level}
- 内容边界：{scope_note}

## 课程大纲
{course_outline}

## 本节要点
{key_points_text}

## 知识库摘录
{rag_content}

## 已生成的讲解脚本 JSON
{script_json}

## 目标
做成接近 B 站 / YouTube 科普视频的动态图解，而不是 PPT 列表。
你必须先确定整支视频的视觉身份，再设计每页镜头：
1. 视频视觉身份：这支视频发生在哪个视觉世界，核心物件是什么，整支视频如何保持统一。
2. 分镜场景空间：每一页是资料墙、实验台、课堂黑板、机器剖面、地图、仪表盘还是对照舞台。
3. 每页独立构图：同一支视频内相邻页面不能只是换字，必须有明显不同的空间和构图。
4. 概念对象连续出现：核心对象要跨页复用和演化，例如“语料卡片 -> 筛选器 -> 输出风格”。
5. 真实/生成式视觉资产：每页给出 asset_prompt，让后续渲染器可接真实截图或生成式插图；当前没有资产时也要能用合成图形替代。
6. 镜头运动和节奏变化：每页指定 camera，不能只有元素淡入。

## 可用 visual_world
- document_lab：文档、资料、证据、语料、扫描、标注
- classroom_studio：课堂、黑板、规范、训练、回答被修正
- amplifier_factory：放大器、生产线、收益代价、规模化影响
- data_observatory：数据观测台、指标、趋势、仪表盘
- concept_kitchen：原料、配方、混合、风格生成
- systems_map：系统生态、网络关系、相互作用

## 可用 scene_type
- concept_opening：开场钩子/问题提出
- mechanism_build：机制逐层搭建
- contrastive_explainer：两种对象/方案对比
- evidence_scan：材料、证据、文档、案例扫描
- process_walkthrough：流程路径推进
- system_map：系统关系网络
- metric_inspection：指标、趋势、仪表盘解释
- mistake_reveal：误区揭示和纠偏
- analogy_bridge：用类比桥接抽象概念
- recap_synthesis：总结收束

## 输出 JSON，严格不要包含其他文字
{{
  "version": "storyboard.v2",
  "section_title": "本节标题",
  "visual_identity": {{
    "world": "document_lab",
    "art_direction": "一句话描述整支视频的美术方向",
    "visual_motif": "反复出现的视觉母题",
    "core_objects": ["跨页连续对象1", "跨页连续对象2", "跨页连续对象3"],
    "palette": ["#6d7cff", "#19c7d4", "#ffb020"],
    "camera_style": "scan_pan",
    "asset_strategy": "真实资料截图优先，缺失时使用合成文档和高亮标注"
  }},
  "slides": [
    {{
      "slide_id": "s1",
      "source_index": 0,
      "scene_type": "concept_opening",
      "scene_space": "资料扫描台",
      "composition": "大物件左侧占据画面，右侧保留问题和结论空间",
      "camera": {{
        "movement": "slow_push",
        "start_focus": "语料卡片",
        "end_focus": "输出风格"
      }},
      "continuity_objects": ["语料卡片", "筛选器", "输出风格"],
      "asset_prompt": "16:9 editorial explainer frame, concrete visual scene, no text blocks, topic-specific objects...",
      "teaching_intent": "这一页要让学员明白什么",
      "learner_obstacle": "学员可能卡在哪里",
      "visual_metaphor": "一句话描述画面隐喻",
      "beats": [
        {{
          "intent": "第一拍教学作用",
          "narration_anchor": "对应旁白里的短语",
          "visual_action": "画面具体怎么变化",
          "emphasis": "屏幕上最该被看见的词"
        }}
      ],
      "constraints": {{
        "density": "medium",
        "motion_level": "medium",
        "max_on_screen_text": 36,
        "avoid": ["不要大段文字", "不要装饰性动画", "不要相邻页面同构图"]
      }}
    }}
  ]
}}

## 关键规则
- slides 数量必须等于输入脚本的 slides 数量，source_index 从 0 递增。
- 每页 3-5 个 beats，每个 beat 对应一个新的视觉变化。
- beats 必须推进概念构建，不要只写“标题出现、文字出现”。
- visual_action 要具体到镜头/图形变化，例如“把原始文档压成证据卡片，再连到结论节点”。
- emphasis 必须短，尽量 2-8 个字。
- 每页 scene_space、composition、camera 要尽量不同，避免三个视频或五页视频只有文字不同。
- 不允许 emoji。
"""


async def storyboard_generator(state: NodeGenState) -> dict:
    """Generate a storyboard JSON for video slides."""
    script_json = state.get("script_json")
    if not script_json or not isinstance(script_json.get("slides"), list):
        return {
            "storyboard_json": None,
            "current_node": "storyboard_generator",
        }

    fallback = _fallback_storyboard(state, script_json)

    try:
        async with async_session_factory() as session:
            llm = await get_chat_model(session, temperature=0.55)

        node_key_points: list[str] = state.get("node_key_points", [])
        key_points_text = (
            "\n".join(f"- {point}" for point in node_key_points)
            if node_key_points else "（未指定，请根据脚本和知识库提炼）"
        )
        prompt = _PROMPT.format(
            node_title=state.get("node_title", ""),
            node_position=state.get("node_position", ""),
            level=state.get("level", "beginner"),
            scope_note=state.get("node_scope_note", "") or "（未指定）",
            course_outline=state.get("course_outline", "") or "（无大纲信息）",
            key_points_text=key_points_text,
            rag_content=_truncate(state.get("rag_content", ""), 7000),
            script_json=json.dumps(script_json, ensure_ascii=False),
        )

        response = await llm.ainvoke([
            SystemMessage(content=prompt),
            HumanMessage(content="请输出 storyboard JSON。"),
        ])
        raw = _strip_fences(str(response.content))
        storyboard = json.loads(raw)
        storyboard = _normalize_storyboard(storyboard, fallback)

        logger.info(
            "storyboard_generator: node='%s', world=%s, %d slides",
            state.get("node_title", ""),
            storyboard.get("visual_identity", {}).get("world"),
            len(storyboard.get("slides") or []),
        )
        return {
            "storyboard_json": storyboard,
            "current_node": "storyboard_generator",
        }
    except Exception as exc:
        logger.warning(
            "storyboard_generator: fallback used for node %s (%s)",
            state.get("node_id"),
            exc,
        )
        return {
            "storyboard_json": fallback,
            "current_node": "storyboard_generator",
        }


def _normalize_storyboard(storyboard: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    source_slides = fallback.get("slides") or []
    raw_slides = storyboard.get("slides")
    if not isinstance(raw_slides, list) or len(raw_slides) != len(source_slides):
        return fallback

    identity = _normalize_identity(storyboard.get("visual_identity"), fallback["visual_identity"])
    normalized: list[dict[str, Any]] = []
    for index, fallback_slide in enumerate(source_slides):
        raw = raw_slides[index] if isinstance(raw_slides[index], dict) else {}
        scene_type = raw.get("scene_type")
        if scene_type not in _SCENE_TYPES:
            scene_type = fallback_slide["scene_type"]

        beats = raw.get("beats")
        if not isinstance(beats, list):
            beats = []
        normalized_beats = []
        for beat in beats[:5]:
            if not isinstance(beat, dict):
                continue
            normalized_beats.append({
                "intent": _clean_text(beat.get("intent"), fallback_slide["beats"][0]["intent"]),
                "narration_anchor": _clean_text(beat.get("narration_anchor"), ""),
                "visual_action": _clean_text(beat.get("visual_action"), fallback_slide["beats"][0]["visual_action"]),
                "emphasis": _short_text(beat.get("emphasis"), fallback_slide["beats"][0]["emphasis"], 12),
            })
        if len(normalized_beats) < 3:
            normalized_beats = fallback_slide["beats"]

        camera = raw.get("camera") if isinstance(raw.get("camera"), dict) else {}
        movement = camera.get("movement")
        if movement not in _CAMERA_STYLES:
            movement = fallback_slide["camera"]["movement"]

        constraints = raw.get("constraints") if isinstance(raw.get("constraints"), dict) else {}
        normalized.append({
            "slide_id": _clean_text(raw.get("slide_id"), f"s{index + 1}"),
            "source_index": index,
            "scene_type": scene_type,
            "scene_space": _short_text(raw.get("scene_space"), fallback_slide["scene_space"], 18),
            "composition": _clean_text(raw.get("composition"), fallback_slide["composition"]),
            "camera": {
                "movement": movement,
                "start_focus": _short_text(camera.get("start_focus"), fallback_slide["camera"]["start_focus"], 16),
                "end_focus": _short_text(camera.get("end_focus"), fallback_slide["camera"]["end_focus"], 16),
            },
            "continuity_objects": _string_list(raw.get("continuity_objects"))[:5]
            or fallback_slide["continuity_objects"],
            "asset_prompt": _clean_text(raw.get("asset_prompt"), fallback_slide["asset_prompt"]),
            "teaching_intent": _clean_text(raw.get("teaching_intent"), fallback_slide["teaching_intent"]),
            "learner_obstacle": _clean_text(raw.get("learner_obstacle"), fallback_slide["learner_obstacle"]),
            "visual_metaphor": _clean_text(raw.get("visual_metaphor"), fallback_slide["visual_metaphor"]),
            "beats": normalized_beats,
            "constraints": {
                "density": constraints.get("density") if constraints.get("density") in {"low", "medium", "high"} else fallback_slide["constraints"]["density"],
                "motion_level": constraints.get("motion_level") if constraints.get("motion_level") in {"low", "medium", "high"} else fallback_slide["constraints"]["motion_level"],
                "max_on_screen_text": _clamp_int(constraints.get("max_on_screen_text"), 22, 52, fallback_slide["constraints"]["max_on_screen_text"]),
                "avoid": _string_list(constraints.get("avoid")) or fallback_slide["constraints"]["avoid"],
            },
        })

    return {
        "version": "storyboard.v2",
        "section_title": _clean_text(storyboard.get("section_title"), fallback.get("section_title", "")),
        "visual_identity": identity,
        "slides": normalized,
    }


def _normalize_identity(value: Any, fallback: dict[str, Any]) -> dict[str, Any]:
    raw = value if isinstance(value, dict) else {}
    world = raw.get("world")
    if world not in _VISUAL_WORLDS:
        world = fallback["world"]
    camera_style = raw.get("camera_style")
    if camera_style not in _CAMERA_STYLES:
        camera_style = fallback["camera_style"]
    palette = _string_list(raw.get("palette"))
    palette = [color for color in palette if re.match(r"^#[0-9a-fA-F]{6}$", color)]
    return {
        "world": world,
        "art_direction": _clean_text(raw.get("art_direction"), fallback["art_direction"]),
        "visual_motif": _short_text(raw.get("visual_motif"), fallback["visual_motif"], 22),
        "core_objects": _string_list(raw.get("core_objects"))[:5] or fallback["core_objects"],
        "palette": palette[:5] or fallback["palette"],
        "camera_style": camera_style,
        "asset_strategy": _clean_text(raw.get("asset_strategy"), fallback["asset_strategy"]),
    }


def _fallback_storyboard(state: NodeGenState, script_json: dict[str, Any]) -> dict[str, Any]:
    slides = script_json.get("slides") or []
    section_title = script_json.get("section_title") or state.get("node_title", "")
    identity = _fallback_identity(state, script_json)
    storyboard_slides = []

    for index, slide in enumerate(slides):
        title = _slide_title(slide, section_title)
        scene_type = _fallback_scene_type(slide)
        key_terms = _slide_terms(slide, title)
        scene_space = _fallback_scene_space(scene_type, identity["world"], index)
        storyboard_slides.append({
            "slide_id": f"s{index + 1}",
            "source_index": index,
            "scene_type": scene_type,
            "scene_space": scene_space,
            "composition": _fallback_composition(scene_type, index),
            "camera": {
                "movement": _fallback_camera(scene_type, index),
                "start_focus": key_terms[0],
                "end_focus": key_terms[-1],
            },
            "continuity_objects": identity["core_objects"][:3],
            "asset_prompt": (
                f"16:9 science explainer visual, {identity['world']}, {scene_space}, "
                f"topic: {title}, concrete objects, cinematic educational frame, no dense text"
            ),
            "teaching_intent": f"让学员理解：{title}",
            "learner_obstacle": "信息容易停留在文字层面，缺少结构化关系。",
            "visual_metaphor": _fallback_metaphor(scene_type, title, identity["world"]),
            "beats": [
                {
                    "intent": "建立问题对象",
                    "narration_anchor": key_terms[0],
                    "visual_action": f"镜头先对准“{key_terms[0]}”，把它做成可被观察的具体物件。",
                    "emphasis": key_terms[0],
                },
                {
                    "intent": "展开机制变化",
                    "narration_anchor": key_terms[min(1, len(key_terms) - 1)],
                    "visual_action": "核心物件进入场景装置，周围关系逐步亮起。",
                    "emphasis": key_terms[min(1, len(key_terms) - 1)],
                },
                {
                    "intent": "形成可迁移结论",
                    "narration_anchor": key_terms[-1],
                    "visual_action": "镜头拉开，前面出现过的对象收束成一个结论画面。",
                    "emphasis": key_terms[-1],
                },
            ],
            "constraints": {
                "density": "medium",
                "motion_level": "medium",
                "max_on_screen_text": 36,
                "avoid": ["不要大段文字", "不要纯装饰动画", "不要相邻页面同构图"],
            },
        })

    return {
        "version": "storyboard.v2",
        "section_title": section_title,
        "visual_identity": identity,
        "slides": storyboard_slides,
    }


def _fallback_identity(state: NodeGenState, script_json: dict[str, Any]) -> dict[str, Any]:
    text = " ".join([
        state.get("node_title", ""),
        script_json.get("section_title") or "",
        " ".join(state.get("node_key_points", []) or []),
        json.dumps(script_json, ensure_ascii=False)[:1600],
    ])
    world = _infer_world(text)
    presets = {
        "document_lab": {
            "art_direction": "像资料调查视频一样，用文档、扫描线和证据卡片推进概念。",
            "visual_motif": "高亮语料卡",
            "core_objects": ["语料卡片", "筛选器", "风格输出"],
            "palette": ["#6d7cff", "#19c7d4", "#ffb020", "#35d399"],
            "camera_style": "scan_pan",
            "asset_strategy": "真实资料截图优先，缺失时使用合成文档、批注和扫描线。",
        },
        "classroom_studio": {
            "art_direction": "像课堂黑板动画，把规则、示例和修正过程放在同一间教学空间。",
            "visual_motif": "黑板规则线",
            "core_objects": ["黑板规则", "学生回答", "修正箭头"],
            "palette": ["#19c7d4", "#35d399", "#ffb020", "#6d7cff"],
            "camera_style": "tabletop_track",
            "asset_strategy": "课堂场景插图优先，缺失时使用黑板、粉笔线和答题卡合成。",
        },
        "amplifier_factory": {
            "art_direction": "像工业剖面动画，用放大器和生产线展示技术如何扩大收益与代价。",
            "visual_motif": "放大光束",
            "core_objects": ["输入信号", "放大器", "双向输出"],
            "palette": ["#ffb020", "#ff5ca8", "#6d7cff", "#19c7d4"],
            "camera_style": "split_reveal",
            "asset_strategy": "机器剖面或放大器插图优先，缺失时使用合成透镜、光束和生产线。",
        },
        "data_observatory": {
            "art_direction": "像数据观测台，用仪表盘、趋势线和焦点镜头解释变化。",
            "visual_motif": "观测光标",
            "core_objects": ["观测镜", "指标面板", "趋势轨迹"],
            "palette": ["#6d7cff", "#35d399", "#19c7d4", "#ffb020"],
            "camera_style": "slow_push",
            "asset_strategy": "数据看板截图优先，缺失时使用合成仪表盘和趋势线。",
        },
        "concept_kitchen": {
            "art_direction": "像配方实验台，把抽象概念变成原料、混合和输出结果。",
            "visual_motif": "配方台",
            "core_objects": ["概念原料", "混合装置", "结果样本"],
            "palette": ["#35d399", "#ffb020", "#6d7cff", "#19c7d4"],
            "camera_style": "tabletop_track",
            "asset_strategy": "生成式实验台插图优先，缺失时使用合成容器、标签和路径。",
        },
        "systems_map": {
            "art_direction": "像系统生态图，用节点、路径和反馈环展示多方关系。",
            "visual_motif": "关系星图",
            "core_objects": ["核心节点", "连接路径", "反馈环"],
            "palette": ["#19c7d4", "#6d7cff", "#ff5ca8", "#35d399"],
            "camera_style": "orbit",
            "asset_strategy": "系统地图插图优先，缺失时使用合成节点网络和反馈线。",
        },
    }
    return {
        "world": world,
        **presets[world],
    }


def _infer_world(text: str) -> str:
    probes = [
        ("classroom_studio", ("课堂", "黑板", "教师", "学生", "规范", "标准答案", "语法", "教材")),
        ("amplifier_factory", ("放大", "双刃剑", "规模", "收益", "代价", "效率", "自动化", "生产")),
        ("concept_kitchen", ("喂养", "风格", "原料", "配方", "混合", "口味", "生成")),
        ("document_lab", ("语料", "文档", "文本", "材料", "证据", "论文", "资料")),
        ("data_observatory", ("指标", "趋势", "数据", "统计", "曲线", "变化")),
        ("systems_map", ("系统", "生态", "网络", "协作", "关系", "结构")),
    ]
    for world, words in probes:
        if any(word in text for word in words):
            return world
    return "systems_map"


def _fallback_scene_type(slide: dict[str, Any]) -> str:
    template = slide.get("template")
    if template == "TITLE_SLIDE":
        return "concept_opening"
    if template == "CONCEPT_EXPLAIN":
        return "analogy_bridge"
    if template == "COMPARISON":
        return "contrastive_explainer"
    if template == "DIAGRAM_TEXT":
        return "process_walkthrough"
    if template == "QUOTE_HIGHLIGHT":
        return "evidence_scan"
    if template == "SUMMARY":
        return "recap_synthesis"
    if template == "BULLET_POINTS":
        return "mechanism_build"
    return "system_map"


def _fallback_scene_space(scene_type: str, world: str, index: int) -> str:
    world_spaces = {
        "document_lab": ["资料扫描台", "证据墙", "筛选器剖面", "批注桌面", "结论板"],
        "classroom_studio": ["黑板讲台", "答题区", "规则修正板", "左右对照课堂", "复盘板"],
        "amplifier_factory": ["输入工位", "放大器剖面", "双输出轨道", "风险观察窗", "总控台"],
        "data_observatory": ["观测台", "指标仪表盘", "趋势地图", "焦点镜头", "结论屏"],
        "concept_kitchen": ["配方台", "混合容器", "流程传送带", "样本对照台", "成品展示台"],
        "systems_map": ["核心星图", "关系走廊", "反馈环地图", "双区生态", "总览地图"],
    }
    by_scene = {
        "concept_opening": 0,
        "analogy_bridge": 1,
        "mechanism_build": 2,
        "process_walkthrough": 2,
        "evidence_scan": 1,
        "contrastive_explainer": 3,
        "mistake_reveal": 3,
        "metric_inspection": 3,
        "system_map": 2,
        "recap_synthesis": 4,
    }
    spaces = world_spaces.get(world, world_spaces["systems_map"])
    return spaces[by_scene.get(scene_type, index % len(spaces))]


def _fallback_composition(scene_type: str, index: int) -> str:
    options = {
        "concept_opening": [
            "大物件居中，问题从暗处推近",
            "主体左侧压住画面，右侧留出解释空间",
        ],
        "analogy_bridge": [
            "左右两个岛，中间用桥接路径连接",
            "熟悉对象在前景，新概念在远景逐步靠近",
        ],
        "mechanism_build": [
            "剖面机器占中间，层级从左上进入",
            "三层结构纵向搭建，最后合成一个输出口",
        ],
        "process_walkthrough": [
            "路径横穿画面，概念对象沿路径移动",
            "前景节点逐步变亮，背景保留轨迹",
        ],
        "contrastive_explainer": [
            "左右世界对照，中间有转换装置",
            "错误模型在左侧塌缩，正确模型在右侧展开",
        ],
        "evidence_scan": [
            "资料卡片散落，扫描光线逐张提取证据",
            "证据墙从局部特写拉到整体关系",
        ],
        "recap_synthesis": [
            "镜头拉远，核心对象组成一张总结地图",
            "前面对象回到同一张复盘板",
        ],
    }
    variants = options.get(scene_type, ["中心对象加环形关系", "地图式展开"])
    return variants[index % len(variants)]


def _fallback_camera(scene_type: str, index: int) -> str:
    by_scene = {
        "concept_opening": "slow_push",
        "evidence_scan": "scan_pan",
        "analogy_bridge": "tabletop_track",
        "contrastive_explainer": "split_reveal",
        "mechanism_build": "slow_push",
        "process_walkthrough": "tabletop_track",
        "system_map": "orbit",
        "metric_inspection": "scan_pan",
        "mistake_reveal": "split_reveal",
        "recap_synthesis": "pullback",
    }
    return by_scene.get(scene_type, list(_CAMERA_STYLES)[index % len(_CAMERA_STYLES)])


def _fallback_metaphor(scene_type: str, title: str, world: str) -> str:
    metaphors = {
        "concept_opening": f"把“{title}”变成一个需要进入场景观察的问题。",
        "mechanism_build": f"像拆开装置一样逐层看清“{title}”。",
        "contrastive_explainer": f"用两个并排世界对照“{title}”。",
        "evidence_scan": f"从材料现场扫描出支撑“{title}”的证据。",
        "process_walkthrough": f"让核心对象沿路径走完“{title}”的变化。",
        "system_map": f"把“{title}”展开成一个会反馈的关系地图。",
        "metric_inspection": f"用观测面板检查“{title}”的变化。",
        "mistake_reveal": f"先让误区暴露，再切换到正确模型。",
        "analogy_bridge": f"用熟悉空间桥接“{title}”这个抽象概念。",
        "recap_synthesis": f"把前面出现过的对象收束成一张复盘地图。",
    }
    return f"{metaphors.get(scene_type, f'把“{title}”转成可视化结构。')} 视觉世界：{world}。"


def _slide_title(slide: dict[str, Any], fallback: str) -> str:
    for key in ("title", "heading", "quote", "definition", "description", "subtitle"):
        value = slide.get(key)
        if isinstance(value, str) and value.strip():
            return _short_text(value, fallback or "课程要点", 24)
    return fallback or "课程要点"


def _slide_terms(slide: dict[str, Any], fallback: str) -> list[str]:
    candidates: list[str] = []
    for key in ("title", "heading", "definition", "analogy", "description", "quote", "emphasis"):
        value = slide.get(key)
        if isinstance(value, str):
            candidates.append(value)
    for key in ("points", "left_items", "right_items"):
        value = slide.get(key)
        if isinstance(value, list):
            candidates.extend(str(item) for item in value if item)
    terms: list[str] = []
    for candidate in candidates:
        text = _short_text(candidate, "", 12)
        if text and text not in terms:
            terms.append(text)
    while len(terms) < 3:
        terms.append(_short_text(fallback, "核心概念", 12))
    return terms[:5]


def _strip_fences(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + "\n（后续内容已截断）"


def _clean_text(value: Any, fallback: str) -> str:
    if not isinstance(value, str):
        return fallback
    text = " ".join(value.split()).strip()
    return text or fallback


def _short_text(value: Any, fallback: str, limit: int) -> str:
    text = _clean_text(value, fallback).strip("「」“”\"'")
    if len(text) <= limit:
        return text
    return text[: max(1, limit - 1)] + "…"


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    result = []
    for item in value:
        if isinstance(item, str) and item.strip():
            result.append(" ".join(item.split()).strip())
    return result[:6]


def _clamp_int(value: Any, minimum: int, maximum: int, fallback: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return fallback
    return min(max(number, minimum), maximum)
