"""Knowledge-chat LangGraph.

The graph is stateless across invocations. We do NOT use a checkpointer here:
each request is a self-contained turn whose history is loaded from Postgres
(``kb_chat_messages``), so the LangGraph state is fully reconstructed on every
``ainvoke``. Avoiding a checkpointer also avoids a multi-worker hazard where
each uvicorn worker would have its own ``InMemorySaver`` and threads
issued from worker A would not be visible to worker B.
"""

from __future__ import annotations

from langgraph.graph import END, StateGraph

from backend.app.graphs.knowledge_chat.nodes.generate_answer import generate_answer
from backend.app.graphs.knowledge_chat.nodes.retrieve_knowledge import retrieve_knowledge
from backend.app.graphs.knowledge_chat.nodes.rewrite_query import rewrite_query
from backend.app.graphs.knowledge_chat.state import KnowledgeChatState


def build_knowledge_chat_graph() -> StateGraph:
    graph = StateGraph(KnowledgeChatState)
    graph.add_node("rewrite_query", rewrite_query)
    graph.add_node("retrieve_knowledge", retrieve_knowledge)
    graph.add_node("generate_answer", generate_answer)

    graph.set_entry_point("rewrite_query")
    graph.add_edge("rewrite_query", "retrieve_knowledge")
    graph.add_edge("retrieve_knowledge", "generate_answer")
    graph.add_edge("generate_answer", END)
    return graph.compile()


knowledge_chat_graph = build_knowledge_chat_graph()
