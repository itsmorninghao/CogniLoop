"""
Grading LangGraph — 4 sequential nodes.

answer_parser → rule_grader → llm_grader → feedback_generator
"""

from __future__ import annotations

from langgraph.graph import END, StateGraph

from backend.app.graphs.grading.nodes.grading_nodes import (
    answer_parser,
    feedback_generator,
    llm_grader,
    rule_grader,
)
from backend.app.graphs.grading.state import GradingState


def build_grading_graph() -> StateGraph:
    graph = StateGraph(GradingState)

    graph.add_node("answer_parser", answer_parser)
    graph.add_node("rule_grader", rule_grader)
    graph.add_node("llm_grader", llm_grader)
    graph.add_node("feedback_generator", feedback_generator)

    graph.set_entry_point("answer_parser")
    graph.add_edge("answer_parser", "rule_grader")
    graph.add_edge("rule_grader", "llm_grader")
    graph.add_edge("llm_grader", "feedback_generator")
    graph.add_edge("feedback_generator", END)

    return graph.compile()


grading_graph = build_grading_graph()
