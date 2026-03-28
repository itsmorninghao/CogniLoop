"""
Node Generation Graph — Phase 2 of AI Course Studio (per-leaf-node).

Graph:
  rag_retriever → content_generator → [route_by_type]
    video → video_pipeline → quiz_generator → END
    text  → quiz_generator → END
"""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from backend.app.graphs.course_generation.nodes.content_generator import content_generator
from backend.app.graphs.course_generation.nodes.quiz_generator import quiz_generator
from backend.app.graphs.course_generation.nodes.rag_retriever import rag_retriever
from backend.app.graphs.course_generation.nodes.video_pipeline import video_pipeline
from backend.app.graphs.course_generation.state import NodeGenState


def _route_by_content_type(state: NodeGenState) -> str:
    """Route to video_pipeline for video nodes, skip to quiz_generator for text nodes."""
    if state.get("content_type") == "video":
        return "video_pipeline"
    return "quiz_generator"


_graph_builder = StateGraph(NodeGenState)

_graph_builder.add_node("rag_retriever", rag_retriever)
_graph_builder.add_node("content_generator", content_generator)
_graph_builder.add_node("video_pipeline", video_pipeline)
_graph_builder.add_node("quiz_generator", quiz_generator)

_graph_builder.add_edge(START, "rag_retriever")
_graph_builder.add_edge("rag_retriever", "content_generator")
_graph_builder.add_conditional_edges(
    "content_generator",
    _route_by_content_type,
    {
        "video_pipeline": "video_pipeline",
        "quiz_generator": "quiz_generator",
    },
)
_graph_builder.add_edge("video_pipeline", "quiz_generator")
_graph_builder.add_edge("quiz_generator", END)

node_generation_graph = _graph_builder.compile()
