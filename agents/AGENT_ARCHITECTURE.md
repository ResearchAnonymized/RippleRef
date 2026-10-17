# RippleRef — Multi-Agent Architecture

## Overview

RippleRef coordinates **specialized agents** through a **LangGraph** state machine
(`refactor_graph.py`). Each agent is either:

- **Static** — rules, backend APIs, or heuristics (no LLM)
- **LLM** — a separate OpenRouter (or direct provider) chat completion

Canonical registry: `agent_registry.py`  
LLM roles: `multi_llm_agents.py` (Planner / Refactorer / Verifier)

This is a **real multi-agent system**: three LLM roles with different prompts and
JSON contracts, plus static agents, wired by LangGraph edges — not one prompt
relabeled as “agents.”

## Graphs

### Interactive / general (v1.1)

```
load → analyze → plan → llm_plan → feasibility
  → refactor → verify → llm_verify → [apply → compile] → report
```

### P-MA study arm `ma_ref_master` (v2.0)

```
load → analyze → dependency_context → plan → llm_plan → feasibility
  → refactor → verify → ripple_verify → llm_verify
       ↑__________________________________|
              prepare_revise (≤ MA_MAX_REVISE_LOOPS)
  → report   (never writes the live workspace)
```

| Node | Agent | Kind | Module |
|------|-------|------|--------|
| `load` | File Loader | static | `refactor_pipeline.run_load` |
| `analyze` | Code Smell Detector | static | `refactor_pipeline.run_analyze` |
| `dependency_context` | Dependency Context | static | `refactor_nodes/dependency_context.py` |
| `plan` | Rule Planner | static | `planning.py` |
| `llm_plan` | LLM Planning Agent | **llm** | `refactor_nodes/llm_plan.py` |
| `feasibility` | Size Advisor | static | `file_size_policy.py` |
| `refactor` | LLM Refactoring Agent | **llm** | `run_refactor` → `main.call_llm_refactor` |
| `verify` | Quality Verifier | static | `verification_gates.py` |
| `ripple_verify` | Ripple Risk Verifier | static | `refactor_nodes/ripple_verify_ma.py` |
| `llm_verify` | LLM Verification Agent | **llm** | `refactor_nodes/llm_verify.py` |
| `prepare_revise` | Revise Coordinator | static | `refactor_nodes/prepare_revise.py` |
| `apply` / `compile` | Applier / Compile | static | interactive graph only |
| `report` | Analysis Reporter | static | `run_report_finalize` |

## Enabling the three LLM agents

```bash
# agents/.env
MULTI_LLM_AGENT_MODE=full          # Planner + Refactorer + Verifier
REFACTOR_ORCHESTRATOR=langgraph    # default
MA_MAX_REVISE_LOOPS=2              # MA verifier→editor loops (0 = off)
```

| Mode | LLM agents active |
|------|-------------------|
| `off` | Refactoring Agent only (planner/verifier nodes no-op) |
| `full` | Planning + Refactoring + Verification |

**MA study always runs Planner + Verifier**, even if the env is unset
(`should_run_llm_plan_and_verify` / `ma_ref_study` setdefault).

## LLM provider routing

All LLM agents go through `llm_client.chat_completion()` / `llm_agent_core.py`.

| `LLM_ROUTING` | Behavior |
|---------------|----------|
| `openrouter` | One OpenRouter key for all model slugs (recommended for replication) |
| `auto` | Direct API when a provider key exists; else OpenRouter |
| `direct` | Native OpenAI / Google / Anthropic keys only |

## What “rules” means (static agents)

Static agents do **not** call an LLM. Examples: severity-based technique mapping
(`planning.py`), size/token preflight (`file_size_policy.py`), API/smell gates
(`verification_gates.py`), backend smell detection, apply-and-verify ripple.

## Extension points

- New LLM role: implement in `multi_llm_agents.py`, add a LangGraph node, register in `agent_registry.py`
- New static gate: extend `verification_gates.py`
- Prompts: `LLM_PROMPTS.md`, `ripple_ref_study.py`, `main.call_llm_refactor`

## Legacy

- `refactor_pipeline_execute.py` — monolith when `REFACTOR_ORCHESTRATOR=legacy`
- Prefer LangGraph for any scientific or demo run
