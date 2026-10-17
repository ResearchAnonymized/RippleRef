# REFINE — Multi-Agent Architecture

## Overview

REFINE coordinates **specialized agents** through a structured refactoring workflow. Each agent is either:

- **Static** — rules, backend APIs, or heuristics (no LLM)
- **LLM** — OpenRouter or direct OpenAI / Google / Anthropic (`llm_client.py`, `llm_provider_config.py`)

Orchestration is implemented with **LangGraph** (`refactor_graph.py`, version **1.1**).  
Canonical agent registry: `agent_registry.py`

## Agent pipeline (main graph)

```
load → analyze → plan → llm_plan → feasibility
  → refactor → verify → llm_verify → [apply → compile] → report
```

| Node | Agent | Kind | Module |
|------|-------|------|--------|
| `load` | File Loader | static | `refactor_pipeline.run_load` |
| `analyze` | Code Smell Detector | static | `refactor_pipeline.run_analyze` |
| `plan` | Refactoring Planner | static | `refactor_nodes/rule_plan.py` + `planning.py` |
| `llm_plan` | LLM Planning Agent | **llm** | `refactor_nodes/llm_plan.py` |
| `feasibility` | Size Advisor | static | `refactor_pipeline.run_feasibility` |
| `refactor` | LLM Refactoring Agent | **llm** | `refactor_pipeline.run_refactor` → `main.call_llm_refactor` |
| `verify` | Quality Verifier | static | `refactor_pipeline.run_verify` + `verification_gates.py` |
| `llm_verify` | LLM Verification Agent | **llm** | `refactor_nodes/llm_verify.py` |
| `apply` | File Applier | static | `refactor_pipeline.run_apply` |
| `compile` | Compilation Verifier | static | `refactor_pipeline.run_compile` |
| `report` | Analysis Reporter | static | `refactor_pipeline.run_report_finalize` |

## LLM provider integration

All LLM agents route through **`llm_client.chat_completion()`**:

| Provider | Direct API | OpenRouter slug |
|----------|------------|-----------------|
| OpenAI | `OPENAI_API_KEY` + `OPENAI_MODEL` | `OPENROUTER_MODEL_OPENAI` (e.g. `openai/gpt-5.5`) |
| Google | `GOOGLE_API_KEY` + `GOOGLE_MODEL` | `OPENROUTER_MODEL_GOOGLE` |
| Anthropic | `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL` | `OPENROUTER_MODEL_CLAUDE` |

**Routing** (`LLM_ROUTING` in `agents/.env`):

| Mode | Behavior |
|------|----------|
| `auto` (default) | Direct API when provider key exists; else OpenRouter |
| `openrouter` | Always OpenRouter (one key, all models) |
| `direct` | Always native APIs (requires per-provider keys) |

Research chain config: `llm_provider_config.research_provider_chain()` → OpenAI → Google → Anthropic.

## Multi-LLM agent mode

Set in `agents/.env`:

```bash
# off (default) — only refactor node calls LLM; llm_plan / llm_verify no-op
MULTI_LLM_AGENT_MODE=off

# full — Planner + Refactorer + Verifier each call OpenRouter per pass
MULTI_LLM_AGENT_MODE=full
```

| Mode | LLM agents active |
|------|-------------------|
| `off` | Refactoring Agent only |
| `full` | Planning + Refactoring + Verification |

## Research: independent parallel providers

Protocol `A_frontier_parallel` uses `multi_llm_independent.py`:

1. Rule plan on frozen baseline (shared)
2. Per provider LangGraph subgraph:

```
llm_plan → refactor → verify → llm_verify
```

## What “rules” means (static agents)

Static agents do **not** call an LLM. Examples:

- **Planner (rule)** — `planning.py` selects smells by severity and maps to Fowler techniques
- **Size Advisor** — line/token thresholds in `file_size_policy.py`
- **Quality Verifier** — `verification_gates.py` (API, smells, size, methods, empty catch)
- **Smell Detector** — Java backend `ComprehensiveCodeSmellDetector`

## Extension points

- Add a new LLM agent: implement in `multi_llm_agents.py`, add node in `refactor_graph.py`, register in `agent_registry.py`
- Add a new static gate: extend `verification_gates.py`
- Prompts: `agents/LLM_PROMPTS.md` and `main.py` (`call_llm_refactor`)

## Not yet migrated (known)

- `refactor_pipeline_execute.py` — legacy monolith when `REFACTOR_ORCHESTRATOR=legacy`
- `main._run_multi_llm_chain` — sequential chain (older path)

Use **LangGraph** (`REFACTOR_ORCHESTRATOR=langgraph`, default) for the proper agent system.
