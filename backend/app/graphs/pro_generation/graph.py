from langgraph.graph import END, StateGraph

from backend.app.graphs.pro_generation.nodes.batch_pipeline import batch_pipeline_node
from backend.app.graphs.pro_generation.nodes.distributor import distributor_node
from backend.app.graphs.pro_generation.nodes.template_resolver import (
    template_resolver_node,
)
from backend.app.graphs.pro_generation.nodes.orchestrator import orchestrator_node
from backend.app.graphs.pro_generation.nodes.hotspot_searcher import (
    hotspot_searcher_node,
)
from backend.app.graphs.pro_generation.nodes.paper_assembler import paper_assembler_node
from backend.app.graphs.pro_generation.nodes.rag_retriever import rag_retriever_node
from backend.app.graphs.pro_generation.nodes.scope_resolver import scope_resolver_node
from backend.app.graphs.pro_generation.state import ProQuizState


def route_after_orchestrator(state: ProQuizState) -> str:
    """If no batch keys remaining, all questions are done."""
    if not state.get("current_batch_types"):
        return "paper_assembler"
    return "batch_pipeline"


def build_pro_graph():
    builder = StateGraph(ProQuizState)

    builder.add_node("scope_resolver", scope_resolver_node)
    builder.add_node("template_resolver", template_resolver_node)
    builder.add_node("rag_retriever", rag_retriever_node)
    builder.add_node("hotspot_searcher", hotspot_searcher_node)
    builder.add_node("distributor", distributor_node)
    builder.add_node("orchestrator", orchestrator_node)
    builder.add_node("batch_pipeline", batch_pipeline_node)
    builder.add_node("paper_assembler", paper_assembler_node)

    builder.set_entry_point("scope_resolver")
    builder.add_edge("scope_resolver", "template_resolver")
    builder.add_edge("template_resolver", "rag_retriever")
    builder.add_edge("rag_retriever", "hotspot_searcher")
    builder.add_edge("hotspot_searcher", "distributor")
    builder.add_edge("distributor", "orchestrator")

    builder.add_conditional_edges(
        "orchestrator",
        route_after_orchestrator,
        {
            "batch_pipeline": "batch_pipeline",
            "paper_assembler": "paper_assembler",
        },
    )

    builder.add_edge("batch_pipeline", "orchestrator")
    builder.add_edge("paper_assembler", END)

    return builder.compile()


pro_generation_graph = build_pro_graph()
