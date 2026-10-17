# Agentic systems

RippleRef supports **two generation modes**. They share dependency context up front and the **same** L1–L5 verifier at the end.

## Side-by-side

<p align="center">
  <img src="../docs/assets/flow-single-prompt.gif" alt="Single-prompt V2" width="100%"/>
</p>

<p align="center">
  <img src="../docs/assets/flow-multi-agent.gif" alt="Multi-agent MA" width="100%"/>
</p>

| | Single-prompt (B0-V2) | Multi-agent (P-MA) |
|--|----------------------|--------------------|
| Idea | One dependency-aware prompt, one rewrite | Distinct Planner / Editor / Verifier LLM agents + static agents |
| Runner | `agents/ripple_ref_study.py` | `agents/ma_ref_study.py` |
| Orchestration | Direct LLM call | `refactor_graph.py` LangGraph (`build_ma_ref_graph`) |
| Revision | None inside the generator | Verifier → `prepare_revise` → Editor (≤ `MA_MAX_REVISE_LOOPS`) |
| Final check | Shared apply-and-verify | Shared apply-and-verify (`ripple_verify` node) |

---

## 1. Single-prompt (B0) — dependency-aware

| Variant | Role |
|---------|------|
| `V1` | Ablation — lighter packaging |
| `V2` | Primary — dependency context + smells + full file in one prompt |

**Steps**

1. Load target file + smell listing  
2. Fetch **dependency context package** from the Study API  
3. Build V2 user prompt (`llm_prompts` / `ripple_ref_study`)  
4. **One** OpenRouter completion (`RIPPLE_REF_MAX_OUTPUT_TOKENS`, default 2500)  
5. Extract Java from Markdown · sanitize · store prompt/response/candidate  
6. **apply-and-verify** (L1–L5)

---

## 2. Multi-agent (P-MA) — LangGraph

| Piece | Path |
|-------|------|
| Runner | `agents/ma_ref_study.py` |
| Graph | `agents/refactor_graph.py` |
| Nodes | `agents/refactor_nodes/` (`llm_plan`, edit, `llm_verify`, `ripple_verify_ma`, …) |
| Registry | `agents/agent_registry.py` |

**Steps (real multi-agent — separate LLM calls)**

1. Same cohort file + dependency context as B0 (`dependency_context` node)  
2. **Rule planner** then **LLM Planning Agent** → JSON refactor plan  
3. **LLM Refactoring Agent** produces Java  
4. **Static quality gates** + **Ripple Risk Verifier** (apply-and-verify)  
5. **LLM Verification Agent** approves/rejects — on reject, **revise loop** back to the editor  
6. Persist agent-step traces / candidate  

Env (defaults in `start.sh` / `ma_ref_study.py`):

```bash
MULTI_LLM_AGENT_MODE=full
REFACTOR_ORCHESTRATOR=langgraph
MA_MAX_REVISE_LOOPS=2
```

See `agents/AGENT_ARCHITECTURE.md` for the full node table.

---

## Providers

```text
OPENROUTER_API_KEY=...
OPENROUTER_MODEL_*=provider/model-slug
LLM_ROUTING=openrouter
```

Pin exact model slugs for any scientific claim.
