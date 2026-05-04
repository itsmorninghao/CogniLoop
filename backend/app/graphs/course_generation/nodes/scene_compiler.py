"""
Node graph: Scene Compiler.

The storyboard is creative but still model-shaped. This compiler converts it
into a renderer contract that is stable, layout-aware, and safe to persist in
script_json. V2 carries video-level visual identity so the renderer can build
different explainer worlds instead of reusing one PPT skeleton.
"""

from __future__ import annotations

import logging
from typing import Any

from backend.app.graphs.course_generation.state import NodeGenState

logger = logging.getLogger(__name__)

_LAYOUT_BY_SCENE_TYPE = {
    "concept_opening": "world_hook",
    "mechanism_build": "concept_lab",
    "contrastive_explainer": "split_world",
    "evidence_scan": "evidence_wall",
    "process_walkthrough": "spatial_process",
    "system_map": "system_landscape",
    "metric_inspection": "metric_story",
    "mistake_reveal": "split_world",
    "analogy_bridge": "object_bridge",
    "recap_synthesis": "recap_constellation",
}

_ACCENTS = ["#6d7cff", "#19c7d4", "#ffb020", "#35d399", "#ff5ca8"]

_WORLD_FALLBACKS = {
    "document_lab": {
        "art_direction": "资料调查式动态图解，文档、扫描、批注和证据卡片是主视觉。",
        "visual_motif": "高亮语料卡",
        "core_objects": ["语料卡片", "筛选器", "风格输出"],
        "palette": ["#6d7cff", "#19c7d4", "#ffb020", "#35d399"],
        "camera_style": "scan_pan",
        "asset_strategy": "真实资料截图优先，缺失时使用合成文档和扫描线。",
    },
    "classroom_studio": {
        "art_direction": "课堂黑板式动态图解，规则、示例和修正过程在同一个教学空间里演化。",
        "visual_motif": "黑板规则线",
        "core_objects": ["黑板规则", "学生回答", "修正箭头"],
        "palette": ["#19c7d4", "#35d399", "#ffb020", "#6d7cff"],
        "camera_style": "tabletop_track",
        "asset_strategy": "课堂插图优先，缺失时使用黑板、粉笔线和答题卡。",
    },
    "amplifier_factory": {
        "art_direction": "工业剖面式动态图解，用放大器和生产线表现技术扩散。",
        "visual_motif": "放大光束",
        "core_objects": ["输入信号", "放大器", "双向输出"],
        "palette": ["#ffb020", "#ff5ca8", "#6d7cff", "#19c7d4"],
        "camera_style": "split_reveal",
        "asset_strategy": "机器剖面或放大器插图优先，缺失时用透镜、光束和生产线。",
    },
    "data_observatory": {
        "art_direction": "数据观测台式动态图解，用仪表盘、趋势线和焦点镜头解释变化。",
        "visual_motif": "观测光标",
        "core_objects": ["观测镜", "指标面板", "趋势轨迹"],
        "palette": ["#6d7cff", "#35d399", "#19c7d4", "#ffb020"],
        "camera_style": "slow_push",
        "asset_strategy": "数据看板截图优先，缺失时使用合成仪表盘和趋势线。",
    },
    "concept_kitchen": {
        "art_direction": "配方实验台式动态图解，把抽象概念变成原料、混合和输出结果。",
        "visual_motif": "配方台",
        "core_objects": ["概念原料", "混合装置", "结果样本"],
        "palette": ["#35d399", "#ffb020", "#6d7cff", "#19c7d4"],
        "camera_style": "tabletop_track",
        "asset_strategy": "生成式实验台插图优先，缺失时用容器、标签和路径合成。",
    },
    "systems_map": {
        "art_direction": "系统生态图式动态图解，用节点、路径和反馈环展示多方关系。",
        "visual_motif": "关系星图",
        "core_objects": ["核心节点", "连接路径", "反馈环"],
        "palette": ["#19c7d4", "#6d7cff", "#ff5ca8", "#35d399"],
        "camera_style": "orbit",
        "asset_strategy": "系统地图插图优先，缺失时使用合成节点网络和反馈线。",
    },
}


async def scene_compiler(state: NodeGenState) -> dict:
    """Attach renderer-ready render_scene payloads to script_json slides."""
    script_json = state.get("script_json")
    storyboard_json = state.get("storyboard_json")

    if not script_json or not isinstance(script_json.get("slides"), list):
        return {
            "render_scene_json": None,
            "current_node": "scene_compiler",
        }

    slides: list[dict[str, Any]] = script_json.get("slides") or []
    storyboard_slides = []
    if isinstance(storyboard_json, dict) and isinstance(storyboard_json.get("slides"), list):
        storyboard_slides = storyboard_json["slides"]

    identity = _compile_visual_identity(state, storyboard_json, script_json)
    render_scenes = []
    for index, slide in enumerate(slides):
        storyboard_slide = (
            storyboard_slides[index]
            if index < len(storyboard_slides) and isinstance(storyboard_slides[index], dict)
            else _fallback_storyboard_slide(slide, index, identity)
        )
        render_scene = _compile_slide(slide, storyboard_slide, identity, index)
        slide["storyboard"] = storyboard_slide
        slide["render_scene"] = render_scene
        render_scenes.append(render_scene)

    compiled = {
        "version": "render_scene.v2",
        "section_title": script_json.get("section_title") or state.get("node_title", ""),
        "visual_identity": identity,
        "scenes": render_scenes,
    }

    logger.info(
        "scene_compiler: node='%s', world=%s, %d scenes",
        state.get("node_title", ""),
        identity.get("world"),
        len(render_scenes),
    )
    return {
        "script_json": script_json,
        "render_scene_json": compiled,
        "current_node": "scene_compiler",
    }


def _compile_slide(
    slide: dict[str, Any],
    storyboard: dict[str, Any],
    identity: dict[str, Any],
    index: int,
) -> dict[str, Any]:
    scene_type = storyboard.get("scene_type") or _fallback_scene_type(slide)
    layout = _LAYOUT_BY_SCENE_TYPE.get(scene_type, "system_landscape")
    title = _slide_title(slide, f"Scene {index + 1}")
    subtitle = _slide_subtitle(slide)
    beats = _compile_beats(storyboard, slide)
    keywords = _extract_keywords(slide, storyboard, title, identity)
    metaphor = _text(storyboard.get("visual_metaphor"), "")
    visual_kind = _infer_visual_kind(" ".join([
        title,
        subtitle,
        metaphor,
        _text(storyboard.get("teaching_intent"), ""),
        _text(storyboard.get("scene_space"), ""),
        " ".join(keywords),
        identity.get("world", ""),
    ]))
    camera = _compile_camera(storyboard, identity, scene_type, index)
    continuity_objects = _compile_continuity_objects(storyboard, identity, keywords)

    return {
        "version": "render_scene.v2",
        "scene_type": scene_type,
        "layout": layout,
        "variant": _choose_variant(scene_type, identity, visual_kind, index),
        "visual_kind": visual_kind,
        "visual_identity": identity,
        "scene_space": _short(storyboard.get("scene_space"), 18) or _fallback_scene_space(scene_type, identity, index),
        "composition": _text(storyboard.get("composition"), _fallback_composition(scene_type, index)),
        "camera": camera,
        "continuity_objects": continuity_objects,
        "assets": _compile_assets(slide, storyboard, identity, visual_kind, index),
        "title": title,
        "subtitle": subtitle,
        "intent": _text(storyboard.get("teaching_intent"), title),
        "obstacle": _text(storyboard.get("learner_obstacle"), ""),
        "metaphor": metaphor,
        "accent": _accent(identity, index),
        "keywords": keywords,
        "beats": beats,
        "objects": _compile_objects(slide, storyboard, beats, keywords),
        "constraints": _compile_constraints(storyboard),
    }


def _compile_visual_identity(
    state: NodeGenState,
    storyboard_json: Any,
    script_json: dict[str, Any],
) -> dict[str, Any]:
    raw = {}
    if isinstance(storyboard_json, dict) and isinstance(storyboard_json.get("visual_identity"), dict):
        raw = storyboard_json["visual_identity"]
    world = raw.get("world") if isinstance(raw.get("world"), str) else ""
    if world not in _WORLD_FALLBACKS:
        world = _infer_world(" ".join([
            state.get("node_title", ""),
            script_json.get("section_title") or "",
            " ".join(state.get("node_key_points", []) or []),
            str(script_json)[:1400],
        ]))
    fallback = _WORLD_FALLBACKS[world]
    palette = _list(raw.get("palette"))
    palette = [color for color in palette if color.startswith("#") and len(color) == 7]
    return {
        "world": world,
        "art_direction": _text(raw.get("art_direction"), fallback["art_direction"]),
        "visual_motif": _short(raw.get("visual_motif"), 22) or fallback["visual_motif"],
        "core_objects": _list(raw.get("core_objects"))[:5] or fallback["core_objects"],
        "palette": palette[:5] or fallback["palette"],
        "camera_style": raw.get("camera_style") if raw.get("camera_style") in {
            "slow_push",
            "scan_pan",
            "tabletop_track",
            "split_reveal",
            "orbit",
            "pullback",
        } else fallback["camera_style"],
        "asset_strategy": _text(raw.get("asset_strategy"), fallback["asset_strategy"]),
    }


def _compile_beats(storyboard: dict[str, Any], slide: dict[str, Any]) -> list[dict[str, Any]]:
    raw_beats = storyboard.get("beats")
    if not isinstance(raw_beats, list) or len(raw_beats) < 2:
        raw_beats = _fallback_beats(slide)

    beats: list[dict[str, Any]] = []
    for index, beat in enumerate(raw_beats[:5]):
        if not isinstance(beat, dict):
            continue
        label = _short(beat.get("emphasis") or beat.get("narration_anchor") or beat.get("intent"), 16)
        beats.append({
            "index": index,
            "label": label or f"步骤 {index + 1}",
            "intent": _text(beat.get("intent"), f"推进第 {index + 1} 个理解步骤"),
            "narration_anchor": _short(beat.get("narration_anchor"), 16),
            "visual_action": _text(beat.get("visual_action"), "推进画面结构"),
            "emphasis": label or f"步骤 {index + 1}",
        })

    if len(beats) < 3:
        for fallback in _fallback_beats(slide)[len(beats):3]:
            beats.append(fallback)
    return beats[:5]


def _compile_objects(
    slide: dict[str, Any],
    storyboard: dict[str, Any],
    beats: list[dict[str, Any]],
    keywords: list[str],
) -> list[dict[str, Any]]:
    scene_type = storyboard.get("scene_type") or _fallback_scene_type(slide)
    objects: list[dict[str, Any]] = []

    if scene_type in {"contrastive_explainer", "mistake_reveal"}:
        left_items = _list(slide.get("left_items")) or [beats[0]["label"]]
        right_items = _list(slide.get("right_items")) or [beat["label"] for beat in beats[1:]]
        objects.append({
            "kind": "lane",
            "label": _short(slide.get("left_label") or "常见理解", 14),
            "items": [_short(item, 24) for item in left_items[:4]],
            "tone": "muted",
        })
        objects.append({
            "kind": "lane",
            "label": _short(slide.get("right_label") or "更准确模型", 14),
            "items": [_short(item, 24) for item in right_items[:4]],
            "tone": "accent",
        })
        return objects

    if scene_type == "metric_inspection":
        values = [48, 64, 71, 86]
        objects.extend({
            "kind": "metric",
            "label": keyword,
            "value": values[index % len(values)],
        } for index, keyword in enumerate(keywords[:4]))
        return objects

    for index, beat in enumerate(beats):
        objects.append({
            "kind": "node",
            "label": beat["label"],
            "detail": _short(beat.get("intent"), 28),
            "role": "focus" if index == len(beats) - 1 else "support",
        })
    return objects


def _compile_camera(
    storyboard: dict[str, Any],
    identity: dict[str, Any],
    scene_type: str,
    index: int,
) -> dict[str, str]:
    raw = storyboard.get("camera") if isinstance(storyboard.get("camera"), dict) else {}
    movement = raw.get("movement")
    if movement not in {"slow_push", "scan_pan", "tabletop_track", "split_reveal", "orbit", "pullback"}:
        movement = _fallback_camera(scene_type, identity, index)
    core = identity.get("core_objects") or ["核心对象"]
    return {
        "movement": movement,
        "start_focus": _short(raw.get("start_focus"), 16) or core[0],
        "end_focus": _short(raw.get("end_focus"), 16) or core[min(index, len(core) - 1)],
    }


def _compile_continuity_objects(
    storyboard: dict[str, Any],
    identity: dict[str, Any],
    keywords: list[str],
) -> list[str]:
    objects = _list(storyboard.get("continuity_objects"))[:5]
    if not objects:
        objects = list(identity.get("core_objects") or [])[:5]
    for keyword in keywords:
        if len(objects) >= 5:
            break
        if keyword not in objects:
            objects.append(keyword)
    return [_short(item, 16) for item in objects[:5]]


def _compile_assets(
    slide: dict[str, Any],
    storyboard: dict[str, Any],
    identity: dict[str, Any],
    visual_kind: str,
    index: int,
) -> list[dict[str, Any]]:
    title = _slide_title(slide, f"Scene {index + 1}")
    prompt = _text(
        storyboard.get("asset_prompt"),
        (
            f"16:9 Bilibili YouTube science explainer frame, {identity.get('world')}, "
            f"{storyboard.get('scene_space') or ''}, topic: {title}, concrete objects, "
            "cinematic composition, no dense text"
        ),
    )
    return [
        {
            "id": f"scene-{index + 1}-primary",
            "role": "primary",
            "kind": visual_kind,
            "label": _short(title, 18),
            "prompt": prompt,
            "src": None,
            "fallback": "synthetic",
        },
        {
            "id": f"scene-{index + 1}-texture",
            "role": "texture",
            "kind": identity.get("world", "systems_map"),
            "label": _short(identity.get("visual_motif"), 18),
            "prompt": f"{identity.get('asset_strategy')}；视觉母题：{identity.get('visual_motif')}",
            "src": None,
            "fallback": "synthetic",
        },
    ]


def _choose_variant(scene_type: str, identity: dict[str, Any], visual_kind: str, index: int) -> str:
    world = identity.get("world", "systems_map")
    by_world = {
        "document_lab": ["scanner", "evidence_wall", "document_path"],
        "classroom_studio": ["blackboard", "answer_cards", "rule_rewrite"],
        "amplifier_factory": ["amplifier", "assembly_line", "dual_output"],
        "data_observatory": ["dashboard", "scope", "trend_map"],
        "concept_kitchen": ["recipe_table", "mixing_bowl", "sample_output"],
        "systems_map": ["constellation", "feedback_ring", "route_map"],
    }
    if scene_type == "contrastive_explainer":
        return "split_transform"
    if scene_type == "recap_synthesis":
        return "pullback_board"
    if scene_type == "analogy_bridge":
        return "bridge_transfer"
    if visual_kind == "metric":
        return "instrument_panel"
    variants = by_world.get(world, by_world["systems_map"])
    return variants[index % len(variants)]


def _infer_visual_kind(text: str) -> str:
    probes = {
        "recipe": ("食谱", "原料", "配料", "风味", "饭", "餐", "吸收", "喂养", "配方"),
        "classroom": ("课堂", "黑板", "教师", "学生", "语法", "课本", "教材", "规范"),
        "amplifier": ("放大", "双刃剑", "显微镜", "放大镜", "干道", "道路", "规模", "代价"),
        "filter": ("过滤", "筛选", "噪声", "保留", "弱化"),
        "document": ("文档", "材料", "证据", "文本", "语料", "论文", "资料"),
        "metric": ("指标", "趋势", "统计", "数据", "仪表盘"),
        "network": ("生态", "系统", "网络", "协作", "关系"),
    }
    for kind, words in probes.items():
        if any(word in text for word in words):
            return kind
    return "abstract"


def _compile_constraints(storyboard: dict[str, Any]) -> dict[str, Any]:
    constraints = storyboard.get("constraints")
    if not isinstance(constraints, dict):
        constraints = {}
    density = constraints.get("density")
    motion_level = constraints.get("motion_level")
    return {
        "density": density if density in {"low", "medium", "high"} else "medium",
        "motion_level": motion_level if motion_level in {"low", "medium", "high"} else "medium",
        "max_on_screen_text": _clamp_int(constraints.get("max_on_screen_text"), 22, 52, 36),
        "avoid": _list(constraints.get("avoid"))[:6] or ["long paragraphs", "same composition", "decorative-only motion"],
    }


def _fallback_storyboard_slide(
    slide: dict[str, Any],
    index: int,
    identity: dict[str, Any],
) -> dict[str, Any]:
    title = _slide_title(slide, f"Scene {index + 1}")
    scene_type = _fallback_scene_type(slide)
    terms = _extract_keywords(slide, {}, title, identity)
    return {
        "slide_id": f"s{index + 1}",
        "source_index": index,
        "scene_type": scene_type,
        "scene_space": _fallback_scene_space(scene_type, identity, index),
        "composition": _fallback_composition(scene_type, index),
        "camera": {
            "movement": _fallback_camera(scene_type, identity, index),
            "start_focus": terms[0],
            "end_focus": terms[-1],
        },
        "continuity_objects": identity.get("core_objects", [])[:3],
        "asset_prompt": f"16:9 science explainer frame, {identity.get('world')}, topic: {title}",
        "teaching_intent": title,
        "learner_obstacle": "",
        "visual_metaphor": "",
        "beats": _fallback_beats(slide),
        "constraints": {
            "density": "medium",
            "motion_level": "medium",
            "max_on_screen_text": 36,
            "avoid": ["long paragraphs"],
        },
    }


def _fallback_beats(slide: dict[str, Any]) -> list[dict[str, Any]]:
    title = _slide_title(slide, "核心概念")
    terms = _extract_keywords(slide, {}, title, {"core_objects": []})
    return [
        {
            "index": 0,
            "label": terms[0],
            "intent": "建立对象",
            "narration_anchor": terms[0],
            "visual_action": "先建立核心对象。",
            "emphasis": terms[0],
        },
        {
            "index": 1,
            "label": terms[min(1, len(terms) - 1)],
            "intent": "拆解关系",
            "narration_anchor": terms[min(1, len(terms) - 1)],
            "visual_action": "展开关键关系。",
            "emphasis": terms[min(1, len(terms) - 1)],
        },
        {
            "index": 2,
            "label": terms[-1],
            "intent": "收束结论",
            "narration_anchor": terms[-1],
            "visual_action": "收束到结论。",
            "emphasis": terms[-1],
        },
    ]


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


def _fallback_scene_space(scene_type: str, identity: dict[str, Any], index: int) -> str:
    world = identity.get("world", "systems_map")
    spaces = {
        "document_lab": ["资料扫描台", "证据墙", "筛选器剖面", "批注桌面", "结论板"],
        "classroom_studio": ["黑板讲台", "答题区", "规则修正板", "左右对照课堂", "复盘板"],
        "amplifier_factory": ["输入工位", "放大器剖面", "双输出轨道", "风险观察窗", "总控台"],
        "data_observatory": ["观测台", "指标仪表盘", "趋势地图", "焦点镜头", "结论屏"],
        "concept_kitchen": ["配方台", "混合容器", "流程传送带", "样本对照台", "成品展示台"],
        "systems_map": ["核心星图", "关系走廊", "反馈环地图", "双区生态", "总览地图"],
    }.get(world, ["核心场景", "关系场景", "过程场景", "对照场景", "总结场景"])
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
    return spaces[by_scene.get(scene_type, index % len(spaces))]


def _fallback_composition(scene_type: str, index: int) -> str:
    options = {
        "concept_opening": ["大物件居中，问题从暗处推近", "主体左侧压住画面，右侧留出解释空间"],
        "analogy_bridge": ["左右两个岛，中间用桥接路径连接", "熟悉对象在前景，新概念在远景逐步靠近"],
        "mechanism_build": ["剖面机器占中间，层级从左上进入", "三层结构纵向搭建，最后合成一个输出口"],
        "process_walkthrough": ["路径横穿画面，概念对象沿路径移动", "前景节点逐步变亮，背景保留轨迹"],
        "contrastive_explainer": ["左右世界对照，中间有转换装置", "错误模型在左侧塌缩，正确模型在右侧展开"],
        "evidence_scan": ["资料卡片散落，扫描光线逐张提取证据", "证据墙从局部特写拉到整体关系"],
        "recap_synthesis": ["镜头拉远，核心对象组成一张总结地图", "前面对象回到同一张复盘板"],
    }
    variants = options.get(scene_type, ["中心对象加环形关系", "地图式展开"])
    return variants[index % len(variants)]


def _fallback_camera(scene_type: str, identity: dict[str, Any], index: int) -> str:
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
    return by_scene.get(scene_type, identity.get("camera_style") or "slow_push")


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


def _slide_title(slide: dict[str, Any], fallback: str) -> str:
    for key in ("title", "heading", "quote", "definition", "description", "subtitle"):
        value = slide.get(key)
        if isinstance(value, str) and value.strip():
            return _short(value, 38)
    return fallback


def _slide_subtitle(slide: dict[str, Any]) -> str:
    for key in ("subtitle", "analogy", "description", "definition", "emphasis"):
        value = slide.get(key)
        if isinstance(value, str) and value.strip():
            return _short(value, 58)
    points = _list(slide.get("points"))
    if points:
        return _short(points[0], 58)
    return ""


def _extract_keywords(
    slide: dict[str, Any],
    storyboard: dict[str, Any],
    fallback: str,
    identity: dict[str, Any],
) -> list[str]:
    candidates: list[str] = []
    candidates.extend(identity.get("core_objects") or [])
    candidates.extend(_list(storyboard.get("continuity_objects")))
    beats = storyboard.get("beats")
    if isinstance(beats, list):
        for beat in beats:
            if isinstance(beat, dict):
                candidates.extend([
                    str(beat.get("emphasis") or ""),
                    str(beat.get("narration_anchor") or ""),
                ])
    for key in ("points", "left_items", "right_items"):
        candidates.extend(_list(slide.get(key)))
    for key in ("title", "heading", "definition", "quote", "emphasis", "analogy", "description"):
        value = slide.get(key)
        if isinstance(value, str):
            candidates.append(value)

    keywords: list[str] = []
    for candidate in candidates:
        text = _short(candidate, 16)
        if text and text not in keywords:
            keywords.append(text)
        if len(keywords) >= 7:
            break
    while len(keywords) < 3:
        keywords.append(_short(fallback, 12) or "核心概念")
    return keywords


def _accent(identity: dict[str, Any], index: int) -> str:
    palette = identity.get("palette")
    if isinstance(palette, list) and palette:
        return str(palette[index % len(palette)])
    return _ACCENTS[index % len(_ACCENTS)]


def _list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    result = []
    for item in value:
        if isinstance(item, str) and item.strip():
            result.append(" ".join(item.split()).strip())
    return result


def _text(value: Any, fallback: str) -> str:
    if not isinstance(value, str):
        return fallback
    text = " ".join(value.split()).strip()
    return text or fallback


def _short(value: Any, limit: int) -> str:
    text = _text(value, "").strip("「」“”\"'")
    if len(text) <= limit:
        return text
    return text[: max(1, limit - 1)] + "…"


def _clamp_int(value: Any, minimum: int, maximum: int, fallback: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return fallback
    return min(max(number, minimum), maximum)
