"""
Per-node course content generation graph.

Video nodes pass through storyboard planning, scene compilation, asset
resolution, rendering, and quiz generation. Text nodes skip the video-only
steps and go directly from content generation to quiz generation.
"""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from backend.app.graphs.course_generation.nodes.asset_generator import asset_generator
from backend.app.graphs.course_generation.nodes.content_generator import content_generator
from backend.app.graphs.course_generation.nodes.quiz_generator import quiz_generator
from backend.app.graphs.course_generation.nodes.rag_retriever import rag_retriever
from backend.app.graphs.course_generation.nodes.scene_compiler import scene_compiler
from backend.app.graphs.course_generation.nodes.storyboard_generator import storyboard_generator
from backend.app.graphs.course_generation.nodes.video_pipeline import video_pipeline
from backend.app.graphs.course_generation.state import NodeGenState


def _route_by_content_type(state: NodeGenState) -> str:
    if state.get("content_type") == "video":
        return "storyboard_generator"
    return "quiz_generator"


_graph_builder = StateGraph(NodeGenState)

_graph_builder.add_node("rag_retriever", rag_retriever)
_graph_builder.add_node("content_generator", content_generator)
_graph_builder.add_node("storyboard_generator", storyboard_generator)
_graph_builder.add_node("scene_compiler", scene_compiler)
_graph_builder.add_node("asset_generator", asset_generator)
_graph_builder.add_node("video_pipeline", video_pipeline)
_graph_builder.add_node("quiz_generator", quiz_generator)

_graph_builder.add_edge(START, "rag_retriever")
_graph_builder.add_edge("rag_retriever", "content_generator")
_graph_builder.add_conditional_edges(
    "content_generator",
    _route_by_content_type,
    {
        "storyboard_generator": "storyboard_generator",
        "quiz_generator": "quiz_generator",
    },
)
_graph_builder.add_edge("storyboard_generator", "scene_compiler")
_graph_builder.add_edge("scene_compiler", "asset_generator")
_graph_builder.add_edge("asset_generator", "video_pipeline")
_graph_builder.add_edge("video_pipeline", "quiz_generator")
_graph_builder.add_edge("quiz_generator", END)

node_generation_graph = _graph_builder.compile()
