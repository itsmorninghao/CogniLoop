"""Knowledge-chat LangGraph."""

from __future__ import annotations

from langgraph.graph import END, StateGraph
from langgraph.checkpoint.memory import InMemorySaver

from backend.app.graphs.knowledge_chat.nodes.generate_answer import generate_answer
from backend.app.graphs.knowledge_chat.nodes.retrieve_knowledge import retrieve_knowledge
from backend.app.graphs.knowledge_chat.nodes.rewrite_query import rewrite_query
from backend.app.graphs.knowledge_chat.state import KnowledgeChatState

_checkpointer = InMemorySaver()


def build_knowledge_chat_graph() -> StateGraph:
    graph = StateGraph(KnowledgeChatState)
    graph.add_node("rewrite_query", rewrite_query)
    graph.add_node("retrieve_knowledge", retrieve_knowledge)
    graph.add_node("generate_answer", generate_answer)

    graph.set_entry_point("rewrite_query")
    graph.add_edge("rewrite_query", "retrieve_knowledge")
    graph.add_edge("retrieve_knowledge", "generate_answer")
    graph.add_edge("generate_answer", END)
    return graph.compile(checkpointer=_checkpointer)


knowledge_chat_graph = build_knowledge_chat_graph()
knowledge_chat_checkpointer = _checkpointer
