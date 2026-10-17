"""
Canonical registry of agents in the RefactAI multi-agent refactoring system.

Orchestration: LangGraph (`refactor_graph.py`).
LLM calls go through OpenRouter (`llm_agent_core.py`).

Agent kinds:
  static  — rules, backend APIs, or heuristics (no LLM)
  llm     — OpenRouter chat completion per invocation
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Literal

AgentKind = Literal["static", "llm"]


@dataclass(frozen=True)
class AgentDefinition:
    agent_id: str
    display_name: str
    node_id: str
    kind: AgentKind
    description: str


# Order matches the main LangGraph pipeline.
PIPELINE_AGENTS: List[AgentDefinition] = [
    AgentDefinition("load", "File Loader", "load", "static", "Load frozen baseline or workspace Java source"),
    AgentDefinition("analyze", "Code Smell Detector", "analyze", "static", "PMD-style smell detection via backend API"),
    AgentDefinition("dependency_context", "Dependency Context Agent", "dependency_context", "static", "Structured caller/API exposure (same backend as B0-V2)"),
    AgentDefinition("rule_planner", "Refactoring Planner", "plan", "static", "Rule-based smell prioritization and technique mapping"),
    AgentDefinition("llm_planner", "LLM Planning Agent", "llm_plan", "llm", "LLM produces JSON refactoring plan from smells"),
    AgentDefinition("feasibility", "Size Advisor", "feasibility", "static", "File size / token preflight before LLM refactor"),
    AgentDefinition("llm_refactorer", "LLM Refactoring Agent", "refactor", "llm", "LLM generates refactored Java source"),
    AgentDefinition("static_verifier", "Quality Verifier", "verify", "static", "Automated gates: API, smells, size, methods"),
    AgentDefinition("ripple_verify", "Ripple Risk Verifier", "ripple_verify", "static", "Repository ripple L1–L2 via apply-and-verify"),
    AgentDefinition("llm_verifier", "LLM Verification Agent", "llm_verify", "llm", "LLM reviews diff and approves/rejects candidate"),
    AgentDefinition("prepare_revise", "Revise Coordinator", "prepare_revise", "static", "Pack verifier feedback and loop back to the editor (MA only)"),
    AgentDefinition("apply", "File Applier", "apply", "static", "Write accepted refactor to workspace"),
    AgentDefinition("compile", "Compilation Verifier", "compile", "static", "Informational compile check via backend"),
    AgentDefinition("report", "Analysis Reporter", "report", "static", "researchMetrics, scoring, behavioral heuristics"),
]

LLM_AGENT_IDS = [a.agent_id for a in PIPELINE_AGENTS if a.kind == "llm"]
STATIC_AGENT_IDS = [a.agent_id for a in PIPELINE_AGENTS if a.kind == "static"]

PROVIDER_SUBGRAPH_AGENTS = ["llm_planner", "llm_refactorer", "static_verifier", "llm_verifier"]


def agent_by_node_id(node_id: str) -> AgentDefinition | None:
    for a in PIPELINE_AGENTS:
        if a.node_id == node_id:
            return a
    return None


def llm_agents_for_mode(mode: str) -> List[str]:
    """Which LLM agents run for a given MULTI_LLM_AGENT_MODE value."""
    if mode == "full":
        return list(LLM_AGENT_IDS)
    return ["llm_refactorer"]
