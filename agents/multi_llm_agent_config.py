"""Feature flag for multi-LLM agent mode (Planner + Refactorer + Verifier)."""
from __future__ import annotations

import os

# off     — only Refactorer uses an LLM (legacy default; reproducible research)
# full    — Planner, Refactorer, and Verifier each call an LLM per pass
MULTI_LLM_AGENT_MODE_ENV = "MULTI_LLM_AGENT_MODE"


def multi_llm_agent_mode() -> str:
    raw = (os.environ.get(MULTI_LLM_AGENT_MODE_ENV) or "off").strip().lower()
    if raw in ("1", "true", "on", "yes", "full"):
        return "full"
    return "off"


def is_multi_llm_agent_full() -> bool:
    return multi_llm_agent_mode() == "full"
