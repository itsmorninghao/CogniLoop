"""
Assistant LangGraph — 4 sequential nodes.

data_collector → pattern_analyzer → profile_rewriter → recommendation_engine
"""

from __future__ import annotations

from langgraph.graph import END, StateGraph

from backend.app.graphs.assistant.nodes.data_collector import data_collector
from backend.app.graphs.assistant.nodes.pattern_analyzer import pattern_analyzer
from backend.app.graphs.assistant.nodes.profile_rewriter import profile_rewriter
from backend.app.graphs.assistant.nodes.recommendation_engine import recommendation_engine
from backend.app.graphs.assistant.state import AssistantState


def build_assistant_graph() -> StateGraph:
    graph = StateGraph(AssistantState)

    graph.add_node("data_collector", data_collector)
    graph.add_node("pattern_analyzer", pattern_analyzer)
    graph.add_node("profile_rewriter", profile_rewriter)
    graph.add_node("recommendation_engine", recommendation_engine)

    graph.set_entry_point("data_collector")
    graph.add_edge("data_collector", "pattern_analyzer")
    graph.add_edge("pattern_analyzer", "profile_rewriter")
    graph.add_edge("profile_rewriter", "recommendation_engine")
    graph.add_edge("recommendation_engine", END)

    return graph.compile()


assistant_graph = build_assistant_graph()
