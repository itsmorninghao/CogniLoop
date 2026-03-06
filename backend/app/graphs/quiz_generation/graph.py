"""
Quiz Generation LangGraph — standard mode.

6 nodes in sequence with conditional retry loop:

  scope_resolver → rag_retriever → profile_analyzer →
  question_designer → question_generator → quality_checker
       ↑                                          │
       └──── retry (if quality < threshold) ──────┘

Usage:
    graph = build_quiz_generation_graph()
    result = await graph.ainvoke(initial_state)
"""

from __future__ import annotations

import logging

from langgraph.graph import END, StateGraph

from backend.app.graphs.quiz_generation.nodes.scope_resolver import scope_resolver
from backend.app.graphs.quiz_generation.nodes.rag_retriever import rag_retriever
from backend.app.graphs.quiz_generation.nodes.profile_analyzer import profile_analyzer
from backend.app.graphs.quiz_generation.nodes.question_designer import question_designer
from backend.app.graphs.quiz_generation.nodes.question_generator import question_generator
from backend.app.graphs.quiz_generation.nodes.quality_checker import quality_checker
from backend.app.graphs.quiz_generation.state import QuizGenState

logger = logging.getLogger(__name__)


def _should_retry(state: QuizGenState) -> str:
    """Conditional edge: retry question generation if quality checker says so."""
    if state.get("is_complete", False):
        return "end"
    return "retry"


def build_quiz_generation_graph() -> StateGraph:
    """Build and compile the quiz generation LangGraph."""
    graph = StateGraph(QuizGenState)

    graph.add_node("scope_resolver", scope_resolver)
    graph.add_node("rag_retriever", rag_retriever)
    graph.add_node("profile_analyzer", profile_analyzer)
    graph.add_node("question_designer", question_designer)
    graph.add_node("question_generator", question_generator)
    graph.add_node("quality_checker", quality_checker)

    graph.set_entry_point("scope_resolver")

    graph.add_edge("scope_resolver", "rag_retriever")
    graph.add_edge("rag_retriever", "profile_analyzer")
    graph.add_edge("profile_analyzer", "question_designer")
    graph.add_edge("question_designer", "question_generator")
    graph.add_edge("question_generator", "quality_checker")

    # Conditional edge: quality_checker → END or → question_designer (retry)
    graph.add_conditional_edges(
        "quality_checker",
        _should_retry,
        {
            "end": END,
            "retry": "question_designer",
        },
    )

    return graph.compile()


quiz_generation_graph = build_quiz_generation_graph()
