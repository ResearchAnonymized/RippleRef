# Agentic systems

RippleRef supports **two generation modes**. They share dependency context up front and the **same** L1–L5 verifier at the end.

## Side-by-side

<p align="center">
  <img src="../docs/assets/flow-single-prompt.svg" alt="Single-prompt V2" width="100%"/>
</p>

<p align="center">
  <img src="../docs/assets/flow-multi-agent.svg" alt="Multi-agent MA" width="100%"/>
</p>

| | Single-prompt (B0-V2) | Multi-agent (P-MA) |
|--|----------------------|--------------------|
| Idea | One dependency-aware prompt, one rewrite | Specialized agents collaborate |
| Runner | `agents/ripple_ref_study.py` | `agents/ma_ref_study.py` |
| Orchestration | Direct LLM call | `refactor_graph.py` (LangGraph) |
| Revision | None inside the generator | Optional revise loop |
| Final check | Shared apply-and-verify | Shared apply-and-verify |

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

**Steps**

1. Same cohort file + dependency context as B0  
2. **Planner** proposes a refactor strategy  
3. **Editor** produces / revises Java  
4. **Agent verify** (static / LLM gates) — may send work back to the editor  
5. Persist artifacts / traces  
6. **apply-and-verify** — identical ripple path as B0  

Typical env: `MULTI_LLM_AGENT_MODE=full`, `REFACTOR_ORCHESTRATOR=langgraph`.

---

## Providers

```text
OPENROUTER_API_KEY=...
OPENROUTER_MODEL_*=provider/model-slug
LLM_ROUTING=openrouter
```

Pin exact model slugs for any scientific claim.
