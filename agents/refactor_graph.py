"""
LangGraph orchestration for smell-aware multi-agent refactoring (canonical path).

Two compiled graphs
-------------------
1. ``build_refactor_graph`` (v1.1) — interactive / general UI path
   load → analyze → plan → llm_plan → feasibility → refactor → verify →
   llm_verify → [apply → compile | report] → report

2. ``build_ma_ref_graph`` (v2.0) — P-MA study arm (``ma_ref_master``)
   load → analyze → dependency_context → plan → llm_plan → feasibility →
   refactor → verify → ripple_verify → llm_verify ⟲ prepare_revise → refactor
   → report

Real multi-agent (not a single prompt in disguise)
--------------------------------------------------
When ``MULTI_LLM_AGENT_MODE=full`` **or** ``ma_study_mode`` is set, three
*distinct* LLM agents run via separate OpenRouter calls:

- LLM Planning Agent   (``refactor_nodes/llm_plan.py``)
- LLM Refactoring Agent (``run_refactor`` → ``main.call_llm_refactor``)
- LLM Verification Agent (``refactor_nodes/llm_verify.py``)

Plus static agents (smell detector, rule planner, size advisor, quality gates,
ripple verifier). See ``agent_registry.py``.

The MA graph may loop **verifier → prepare_revise → refactor** up to
``MA_MAX_REVISE_LOOPS`` times (default 2) when the LLM verifier rejects.
"""

from __future__ import annotations

import os
from typing import Any, Callable, Dict, Literal, Optional, TypedDict

try:
    from langgraph.graph import END, StateGraph

    LANGGRAPH_AVAILABLE = True
except ImportError:
    LANGGRAPH_AVAILABLE = False
    END = "__end__"  # type: ignore

from refactor_pipeline import PipelineExecution, PipelineHooks, enrich_response_for_langgraph

GRAPH_VERSION = "1.1"
MA_GRAPH_VERSION = "2.0"
ORCHESTRATOR_ENV = "REFACTOR_ORCHESTRATOR"
MA_STUDY_MODE_ENV = "MA_STUDY_MODE"
MA_MAX_REVISE_ENV = "MA_MAX_REVISE_LOOPS"


class GraphState(TypedDict, total=False):
    pipeline: PipelineExecution
    error: str


def _max_revise_loops() -> int:
    try:
        return max(0, int(os.environ.get(MA_MAX_REVISE_ENV, "2") or "2"))
    except ValueError:
        return 2


def _route_after_feasibility(state: GraphState) -> Literal["refactor", "report"]:
    pipeline = state["pipeline"]
    feas = pipeline.file_feasibility or {}
    if feas.get("invokeLlm"):
        return "refactor"
    return "report"


def _route_after_llm_verify(state: GraphState) -> Literal["revise", "apply", "report"]:
    """After LLM verify: apply, finish report, or loop back to the editor (MA)."""
    pipeline = state["pipeline"]
    if getattr(pipeline, "ma_study_mode", False):
        # Study mode never writes the workspace; may revise then report.
        can_revise = (
            not pipeline.accept
            and int(getattr(pipeline, "revise_count", 0) or 0) < _max_revise_loops()
            and (pipeline.candidate or "").strip() != (pipeline.original or "").strip()
            and not getattr(pipeline, "llm_pipeline_failed", False)
        )
        if can_revise:
            return "revise"
        return "report"
    if pipeline.accept and not pipeline.research_independent:
        return "apply"
    return "report"


def build_ma_ref_graph():
    """LangGraph v2.0 for ma_ref_master — plan/edit/verify (+ revise) + ripple; no workspace write."""
    if not LANGGRAPH_AVAILABLE:
        raise RuntimeError("langgraph is not installed")

    from refactor_nodes.dependency_context import run_dependency_context
    from refactor_nodes.llm_plan import run_llm_plan
    from refactor_nodes.llm_verify import run_llm_verify
    from refactor_nodes.prepare_revise import run_prepare_revise
    from refactor_nodes.ripple_verify_ma import run_ripple_verify_ma
    from refactor_pipeline import (
        run_analyze,
        run_feasibility,
        run_load,
        run_plan,
        run_refactor,
        run_report_finalize,
        run_verify,
    )

    g: StateGraph = StateGraph(GraphState)
    g.add_node("load", _make_node("load", run_load))
    g.add_node("analyze", _make_node("analyze", run_analyze))
    g.add_node("dependency_context", _make_node("dependency_context", run_dependency_context))
    g.add_node("plan", _make_node("plan", run_plan))
    g.add_node("llm_plan", _make_node("llm_plan", run_llm_plan))
    g.add_node("feasibility", _make_node("feasibility", run_feasibility))
    g.add_node("refactor", _make_node("refactor", run_refactor))
    g.add_node("verify", _make_node("verify", run_verify))
    g.add_node("ripple_verify", _make_node("ripple_verify", run_ripple_verify_ma))
    g.add_node("llm_verify", _make_node("llm_verify", run_llm_verify))
    g.add_node("prepare_revise", _make_node("prepare_revise", run_prepare_revise))
    g.add_node("report", _make_node("report", run_report_finalize))

    g.set_entry_point("load")
    g.add_edge("load", "analyze")
    g.add_edge("analyze", "dependency_context")
    g.add_edge("dependency_context", "plan")
    g.add_edge("plan", "llm_plan")
    g.add_edge("llm_plan", "feasibility")
    g.add_conditional_edges("feasibility", _route_after_feasibility, {
        "refactor": "refactor",
        "report": "report",
    })
    g.add_edge("refactor", "verify")
    g.add_edge("verify", "ripple_verify")
    g.add_edge("ripple_verify", "llm_verify")
    g.add_conditional_edges("llm_verify", _route_after_llm_verify, {
        "revise": "prepare_revise",
        "apply": "report",
        "report": "report",
    })
    g.add_edge("prepare_revise", "refactor")
    g.add_edge("report", END)
    return g.compile()


def _make_node(phase: str, runner: Callable):
    async def _node(state: GraphState) -> GraphState:
        pipeline = state["pipeline"]
        if pipeline.response_data is not None:
            return state
        try:
            await runner(pipeline)
        except Exception as exc:
            state["error"] = str(exc)
            pipeline.response_data = await pipeline.run_fatal(exc)
        return state

    _node.__name__ = f"node_{phase}"
    return _node


def build_refactor_graph():
    if not LANGGRAPH_AVAILABLE:
        raise RuntimeError("langgraph is not installed")

    from refactor_nodes.llm_plan import run_llm_plan
    from refactor_nodes.llm_verify import run_llm_verify
    from refactor_pipeline import (
        run_analyze,
        run_apply,
        run_compile,
        run_feasibility,
        run_load,
        run_plan,
        run_refactor,
        run_report_finalize,
        run_verify,
    )

    g: StateGraph = StateGraph(GraphState)
    g.add_node("load", _make_node("load", run_load))
    g.add_node("analyze", _make_node("analyze", run_analyze))
    g.add_node("plan", _make_node("plan", run_plan))
    g.add_node("llm_plan", _make_node("llm_plan", run_llm_plan))
    g.add_node("feasibility", _make_node("feasibility", run_feasibility))
    g.add_node("refactor", _make_node("refactor", run_refactor))
    g.add_node("verify", _make_node("verify", run_verify))
    g.add_node("llm_verify", _make_node("llm_verify", run_llm_verify))
    g.add_node("apply", _make_node("apply", run_apply))
    g.add_node("compile", _make_node("compile", run_compile))
    g.add_node("report", _make_node("report", run_report_finalize))

    g.set_entry_point("load")
    g.add_edge("load", "analyze")
    g.add_edge("analyze", "plan")
    g.add_edge("plan", "llm_plan")
    g.add_edge("llm_plan", "feasibility")
    g.add_conditional_edges("feasibility", _route_after_feasibility, {
        "refactor": "refactor",
        "report": "report",
    })
    g.add_edge("refactor", "verify")
    g.add_edge("verify", "llm_verify")
    g.add_conditional_edges("llm_verify", _route_after_llm_verify, {
        "revise": "report",  # interactive path does not revise; finish via report
        "apply": "apply",
        "report": "report",
    })
    g.add_edge("apply", "compile")
    g.add_edge("compile", "report")
    g.add_edge("report", END)
    return g.compile()


_compiled_graph = None
_compiled_provider_graph = None
_compiled_ma_graph = None


def get_ma_compiled_graph():
    global _compiled_ma_graph
    if _compiled_ma_graph is None:
        _compiled_ma_graph = build_ma_ref_graph()
    return _compiled_ma_graph


def is_ma_study_mode(req) -> bool:
    if getattr(req, "maStudyMode", False):
        return True
    return os.environ.get(MA_STUDY_MODE_ENV, "").lower() in ("ripple_cohort", "1", "true", "full")


def get_compiled_graph():
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_refactor_graph()
    return _compiled_graph


def build_provider_subgraph():
    """Per-provider subgraph: LLM plan → refactor → static verify → LLM verify."""
    if not LANGGRAPH_AVAILABLE:
        raise RuntimeError("langgraph is not installed")

    from refactor_nodes.llm_plan import run_llm_plan
    from refactor_nodes.llm_verify import run_llm_verify
    from refactor_pipeline import run_refactor, run_verify

    g: StateGraph = StateGraph(GraphState)
    g.add_node("llm_plan", _make_node("llm_plan", run_llm_plan))
    g.add_node("refactor", _make_node("refactor", run_refactor))
    g.add_node("verify", _make_node("verify", run_verify))
    g.add_node("llm_verify", _make_node("llm_verify", run_llm_verify))
    g.set_entry_point("llm_plan")
    g.add_edge("llm_plan", "refactor")
    g.add_edge("refactor", "verify")
    g.add_edge("verify", "llm_verify")
    g.add_edge("llm_verify", END)
    return g.compile()


def get_provider_subgraph():
    global _compiled_provider_graph
    if _compiled_provider_graph is None:
        _compiled_provider_graph = build_provider_subgraph()
    return _compiled_provider_graph


async def orchestrate_independent_provider(
    hooks: PipelineHooks,
    *,
    workspace_id: str,
    file_path: str,
    goals,
    research_batch_mode: bool,
    baseline: str,
    smells: list,
    refactoring_plan: list,
    file_feasibility: dict,
    provider_model: str,
    provider_id: Optional[str] = None,
    client,
    job_id: str = "",
) -> "PipelineExecution":
    """Run LangGraph provider subgraph for one independent LLM pass."""
    from types import SimpleNamespace

    from refactor_pipeline import PipelineExecution

    req = SimpleNamespace(
        workspaceId=workspace_id,
        filePath=file_path,
        goals=goals,
        researchBatchMode=research_batch_mode,
        multiLlmChain=False,
        content=None,
        providedSmells=None,
        selectedSmells=None,
        sampleId=None,
    )
    pipeline = PipelineExecution(req, job_id, hooks)
    pipeline.client = client
    pipeline._client_started = True
    pipeline.original = baseline
    pipeline.candidate = baseline
    pipeline.smells = list(smells)
    pipeline.refactoring_plan = list(refactoring_plan)
    pipeline.file_feasibility = dict(file_feasibility)
    pipeline.provider_model = provider_model
    pipeline.provider_id = provider_id

    graph = get_provider_subgraph()
    state: GraphState = {"pipeline": pipeline}
    async for chunk in graph.astream(state, stream_mode="updates"):
        for _node, update in chunk.items():
            if isinstance(update, dict) and update.get("pipeline") is not None:
                pipeline = update["pipeline"]
    return pipeline


def use_langgraph_orchestrator() -> bool:
    return os.environ.get(ORCHESTRATOR_ENV, "langgraph").lower() != "legacy"


async def orchestrate_refactor(req, job_id: str, hooks: PipelineHooks) -> Dict[str, Any]:
    """Run refactor via LangGraph (default) or legacy monolith."""
    if not use_langgraph_orchestrator() or not LANGGRAPH_AVAILABLE:
        from refactor_pipeline_execute import execute_refactor_pipeline

        result = await execute_refactor_pipeline(req, job_id, hooks)
        return enrich_response_for_langgraph(result, graph_version=GRAPH_VERSION, node_trace=[])

    if job_id:
        hooks.ensure_queue(job_id)

    pipeline = PipelineExecution(req, job_id, hooks)
    if is_ma_study_mode(req):
        pipeline.ma_study_mode = True
        pipeline.ma_study_id = getattr(req, "maStudyId", None) or "ma_ref_master"
        pipeline.ma_cohort_id = getattr(req, "maCohortId", None)
        pipeline.ma_graph_version = MA_GRAPH_VERSION
        if getattr(req, "maModelId", None):
            pipeline.provider_model = req.maModelId
        # Guarantee real multi-agent LLM roles for the published MA arm.
        os.environ.setdefault("MULTI_LLM_AGENT_MODE", "full")
    state: GraphState = {"pipeline": pipeline}

    graph = get_ma_compiled_graph() if pipeline.ma_study_mode else get_compiled_graph()
    node_trace: list[str] = []

    async for chunk in graph.astream(state, stream_mode="updates"):
        for node_name, update in chunk.items():
            if node_name not in node_trace:
                node_trace.append(node_name)
            if isinstance(update, dict) and update.get("pipeline") is not None:
                pipeline = update["pipeline"]
                state["pipeline"] = pipeline
            if job_id:
                hooks.publish_progress(job_id, {
                    "type": "graph_node",
                    "nodeId": node_name,
                    "framework": "langgraph",
                    "graphVersion": MA_GRAPH_VERSION if pipeline.ma_study_mode else GRAPH_VERSION,
                    "timestamp": hooks.now(),
                })
        if pipeline.response_data is not None:
            break

    if pipeline.response_data is None:
        pipeline.response_data = await pipeline.run_fatal(
            RuntimeError(state.get("error") or "Pipeline finished without response")
        )

    await pipeline.close_client()
    return enrich_response_for_langgraph(
        pipeline.response_data,
        graph_version=MA_GRAPH_VERSION if getattr(pipeline, "ma_study_mode", False) else GRAPH_VERSION,
        node_trace=node_trace,
    )


async def orchestrate_refactor_with_events(req, job_id: str, hooks: PipelineHooks) -> Dict[str, Any]:
    return await orchestrate_refactor(req, job_id, hooks)
