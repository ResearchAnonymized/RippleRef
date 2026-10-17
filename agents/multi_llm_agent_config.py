"""Feature flag for multi-LLM agent mode (Planner + Refactorer + Verifier).

Modes
-----
off   — only the Refactoring Agent calls an LLM (planner/verifier nodes no-op).
full  — Planner, Refactorer, and Verifier each make a distinct LLM call.

MA study (``ma_ref_master`` / ``ma_study_mode``) **always** runs in ``full`` mode
so the published P-MA arm is a real multi-agent system, even if the env is unset.
"""
from __future__ import annotations

import os

MULTI_LLM_AGENT_MODE_ENV = "MULTI_LLM_AGENT_MODE"


def multi_llm_agent_mode() -> str:
    raw = (os.environ.get(MULTI_LLM_AGENT_MODE_ENV) or "off").strip().lower()
    if raw in ("1", "true", "on", "yes", "full"):
        return "full"
    return "off"


def is_multi_llm_agent_full() -> bool:
    return multi_llm_agent_mode() == "full"


def should_run_llm_plan_and_verify(pipeline=None) -> bool:
    """Whether LangGraph should invoke the LLM Planner and LLM Verifier nodes.

    Returns True when:
    - ``MULTI_LLM_AGENT_MODE=full``, or
    - the pipeline is running the MA study arm (``ma_study_mode``).
    """
    if pipeline is not None and getattr(pipeline, "ma_study_mode", False):
        return True
    return is_multi_llm_agent_full()
