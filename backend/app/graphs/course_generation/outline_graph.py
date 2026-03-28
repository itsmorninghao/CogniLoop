"""
Outline Generation Graph — Phase 1 of AI Course Studio.

Graph: kb_summarizer → outline_generator
Returns: course_title, nodes (list of node dicts)
"""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from backend.app.graphs.course_generation.nodes.kb_summarizer import kb_summarizer
from backend.app.graphs.course_generation.nodes.outline_generator import outline_generator
from backend.app.graphs.course_generation.state import OutlineGenState

_graph_builder = StateGraph(OutlineGenState)

_graph_builder.add_node("kb_summarizer", kb_summarizer)
_graph_builder.add_node("outline_generator", outline_generator)

_graph_builder.add_edge(START, "kb_summarizer")
_graph_builder.add_edge("kb_summarizer", "outline_generator")
_graph_builder.add_edge("outline_generator", END)

outline_generation_graph = _graph_builder.compile()
