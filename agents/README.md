# RippleRef Agents Service

LangGraph multi-agent orchestrator for Java refactoring experiments.

**Two generation modes** (shared L1–L5 ripple verifier at the end):

| Mode | Entry | LLM calls |
|------|-------|-----------|
| Single-prompt (B0) | `ripple_ref_study.py` | One rewrite |
| Multi-agent (P-MA) | `ma_ref_study.py` → `build_ma_ref_graph` | Planner + Editor + Verifier (+ revise) |

Architecture details: [AGENT_ARCHITECTURE.md](AGENT_ARCHITECTURE.md)

## Run

```bash
cp .env.example .env   # set OPENROUTER_API_KEY
./start.sh             # creates .venv, defaults MULTI_LLM_AGENT_MODE=full
```

Or manually:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
export OPENROUTER_API_KEY=...
export MULTI_LLM_AGENT_MODE=full
export REFACTOR_ORCHESTRATOR=langgraph
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8091
```

## Endpoint

`POST /agents/refactor-file`

```json
{
  "workspaceId": "project-xxx",
  "filePath": "src/main/java/.../MyClass.java",
  "goals": ["reduce smells", "improve readability"],
  "maStudyMode": false
}
```

Set `"maStudyMode": true` (or use `ma_ref_study`) to run the P-MA graph with
dependency context, ripple verify, and revise loops.

## Tests (no API key required)

```bash
.venv/bin/pytest test_refactor_graph.py test_multi_llm_agents.py test_planning_and_gates.py -q
```
