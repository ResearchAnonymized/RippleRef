# EMSE Multi-Agent Architecture — `ma_ref_master`

**Study ID:** `ma_ref_master`  
**Cohort:** Same 150 files as `ripple_ref_master` (locked export)  
**Comparison:** P-MA (this system) vs B0-V2 (dependency-aware single-prompt)  
**Orchestration:** LangGraph v2.0 (`refactor_graph.py` + 2 new nodes)  
**Locked:** 2026-07-04

---

## 1. What “real multi-agent” means here

| Property | Single-prompt B0-V2 | Multi-agent P-MA |
|----------|---------------------|------------------|
| Agents | 0 (one LLM call) | **10 coordinated agents** (6 headline + 4 support) |
| Separation of concerns | All in one prompt | Analyse → context → plan → edit → verify (split) |
| Machine-checkable steps | Prompt + response only | **JSON artefact per agent** |
| Ripple risk | Post-hoc backend call | **Ripple Risk Verifier** inside workflow |
| Trace | None | `agent_traces/{pair_key}/` |

---

## 2. Agent roster — roles (paper Table 1)

### Headline agents (6) — define the contribution

#### A1. Code Smell Detector *(static)*

| | |
|--|--|
| **Role** | *Analyst* — identifies refactor targets before any LLM edit |
| **Mission** | Run static smell analysis on the frozen baseline file; produce a ranked smell list for downstream agents |
| **Inputs** | `workspace_id`, `file_path`, frozen Java source |
| **Outputs** | `smells[]` (PMD), `smell_count_before`, severity/location per smell |
| **Mechanism** | Backend `ComprehensiveCodeSmellDetector` / PMD API — **no LLM** |
| **Must not** | Generate code or change the workspace |
| **RQ** | Feeds RQ1 (exposure context), RQ2–5 (before metrics) |
| **Code** | `refactor_pipeline.run_analyze` |

---

#### A2. Dependency Context Agent *(static)* **NEW**

| | |
|--|--|
| **Role** | *Ripple cartographer* — maps dependency exposure around the target file |
| **Mission** | Extract structured pre-refactor dependency facts: callers, caller-used APIs, fan-in/out, public/protected surface |
| **Inputs** | `workspace_id`, `file_path` |
| **Outputs** | `dependency_context.json` + `context_text` (same schema as B0-V2 `dependency_contexts/`) |
| **Mechanism** | Backend ripple dependency scan / `RippleRefDependencyContextBuilder` — **no LLM** |
| **Must not** | Invent dependencies; must match B0-V2 facts for fair RQ3 comparison |
| **Consumers** | Rule Planner, LLM Planner, LLM Refactorer, Ripple Risk Verifier |
| **RQ** | **RQ1** (primary), constrains RQ3–5 |
| **Code** | `refactor_nodes/dependency_context.py`  |

---

#### A3. LLM Planning Agent *(LLM)*

| | |
|--|--|
| **Role** | *Architect* — turns smells + dependency constraints into an ordered refactor plan |
| **Mission** | Produce a JSON plan (≤8 items): smell → technique → action, respecting caller-used APIs |
| **Inputs** | Smells (A1), rule draft plan, `dependency_context.json` (A2), public API signatures |
| **Outputs** | `llm_plan.json` — array of `{smellId, technique, action, priority}` |
| **Mechanism** | Dedicated OpenRouter call (`call_llm_planning_agent`) — **does not edit code** |
| **Must not** | Output Java source; must not plan removal of caller-used APIs |
| **RQ** | RQ3 (orchestration value), RQ5 (plan complexity) |
| **Code** | `refactor_nodes/llm_plan.py`, `multi_llm_agents.call_llm_planning_agent` |

---

#### A4. LLM Refactoring Agent *(LLM)*

| | |
|--|--|
| **Role** | *Implementer* — executes the plan and produces candidate Java |
| **Mission** | Generate a complete refactored file that implements the LLM plan under dependency constraints |
| **Inputs** | Original source, smells (top-N), `llm_plan.json` (A3), dependency constraints (A2), public API list |
| **Outputs** | `candidate.java`, token usage, latency |
| **Mechanism** | `call_llm_refactor` — **only agent that writes code** |
| **Must not** | Re-plan from scratch (plan is fixed input); must not change package |
| **RQ** | RQ3–5 |
| **Code** | `refactor_pipeline.run_refactor` |

---

#### A5. Ripple Risk Verifier *(static)* **NEW**

| | |
|--|--|
| **Role** | *Safety engineer* — measures repository-level ripple impact of the candidate |
| **Mission** | Apply candidate in isolated sandbox; diff profiles; detect caller breakage (L1–L2) |
| **Inputs** | Original, candidate, `workspace_id`, `file_path`, pre-built caller list (A2) |
| **Outputs** | `ripple_report.json`: `risk_level`, `contract_risk_level`, `observed_risk_level`, `observed_broken_caller_count`, `risk_reasons[]`, adoption hints |
| **Mechanism** | `RippleRefRippleVerifier` + `RippleRefCallerImpactAnalyzer` — **no LLM** |
| **Must not** | Accept/reject on its own in isolation — feeds A6 + Reporter |
| **RQ** | **RQ2–RQ5** (core dependent variable) |
| **Code** | `refactor_nodes/ripple_verify_ma.py`  |

---

#### A6. LLM Verification Agent *(LLM)*

| | |
|--|--|
| **Role** | *Reviewer* — holistic accept/reject judgement on plan compliance and ripple safety |
| **Mission** | Review baseline vs candidate vs plan vs ripple report; return structured approve/reject + rationale |
| **Inputs** | Original, candidate, smell before/after, static gate results (A8), `ripple_report.json` (A5), `llm_plan.json` (A3) |
| **Outputs** | `llm_verify.json`: `{approved, rationale, concerns[]}` |
| **Mechanism** | `call_llm_verification_agent` — can **override** static pass to reject |
| **Must not** | Regenerate code |
| **RQ** | RQ3 (orchestration), RQ4 (model behaviour) |
| **Code** | `refactor_nodes/llm_verify.py` |

---

### Supporting agents (4) — infrastructure; appendix in paper

#### S1. File Loader *(static)*

| **Role** | *Librarian* — loads immutable baseline for the locked cohort file |
| **Outputs** | `original` source string, line count |
| **Code** | `run_load` |

#### S2. Refactoring Planner — rule-based *(static)*

| **Role** | *Draft strategist* — maps smells to Fowler techniques before LLM planning |
| **Outputs** | `rule_plan.json` (feeds A3; A3 may replace or refine) |
| **Code** | `refactor_nodes/rule_plan.py`, `planning.py` |

#### S3. Size Advisor *(static)*

| **Role** | *Gatekeeper* — blocks LLM calls on files exceeding token/LOC policy |
| **Outputs** | `invokeLlm: bool`, size metrics |
| **Code** | `file_size_policy.py`, `run_feasibility` |

#### S4. Quality Verifier *(static)*

| **Role** | *Code-quality inspector* — fast static gates before expensive ripple check |
| **Checks** | API preservation, smell delta, similarity, empty catch, method count, size ratio |
| **Outputs** | `verification_gates.json`, `accept` (preliminary) |
| **Code** | `verification_gates.py`, `run_verify` |

#### S5. Analysis Reporter *(static)*

| **Role** | *Archivist* — aggregates metrics, agent trace, research CSV row |
| **Outputs** | `report.json`, persistence to backend / `ma_ref_master` study dir |
| **Code** | `run_report_finalize` |

---

### Excluded from research runs

| Agent | Reason |
|--------|--------|
| File Applier | Never mutate workspace in study mode |
| Compilation Verifier | Optional; high false-failure rate on OSS offline |

---

## 3. LangGraph execution order

```
S1 Load
 → A1 Smell Detector
 → A2 Dependency Context
 → S2 Rule Planner
 → A3 LLM Planner
 → S3 Size Advisor ──(skip LLM)──→ S5 Reporter
 → A4 LLM Refactorer
 → S4 Quality Verifier
 → A5 Ripple Risk Verifier
 → A6 LLM Verifier
 → S5 Reporter
```

**Branching:**
- Size Advisor → if `!invokeLlm` → Reporter (reject early)
- LLM Verifier → research mode always → Reporter (no apply)

---

## 4. Study configuration

```bash
# agents/.env for ma_ref_master runs
REFACTOR_ORCHESTRATOR=langgraph
MULTI_LLM_AGENT_MODE=full
MA_STUDY_MODE=ripple_cohort
```

| Parameter | Value |
|-----------|--------|
| Files | 150 (exported from `ripple_ref_master`) |
| Models | Same 5 frontier LLMs |
| Runs | 750 (150 × 5; no V1/V2) |
| Endpoint | `POST /agents/refactor` |
| Study ID | `ma_ref_master` |

---

## 5. RQ mapping

| RQ | Agents |
|----|--------|
| **RQ1** | A2 Dependency Context (+ A1 smells on same files) |
| **RQ2** | B0-V2 only (baseline, finishing) |
| **RQ3** | A3–A6 pipeline vs B0-V2; paired on A5 outputs |
| **RQ4** | Same graph × 5 models |
| **RQ5** | A1+A2 features + A5 outcomes + orchestration flag |

---

## 6. Implementation phases

| Phase | Work | Duration |
|-------|------|----------|
| **0** | Finish B0 + export cohort | When B0 = 1500/1500 |
| **1** | `export-ripple-ref-cohort.sh` + import research-sample | 1 day |
| **2** | Build A2 + A5 nodes; register in graph | 2–3 days |
| **3** | Extend A3, A4, A6 prompts with dependency/ripple | 1–2 days |
| **4** | Pilot: 10 JUnit files × 1 model | 1 day |
| **5** | `run-ma-ref-master-system.sh` — 750 runs | 1–2 weeks |
| **6** | `unified_results.csv` + stats | After data |

---

## 7. Per-candidate proof bundle

```
ma_ref_master/agent_traces/{pair_key}/
  01_smell_detector.json      # A1
  02_dependency_context.json  # A2
  03_rule_plan.json           # S2
  04_llm_plan.json            # A3
  05_candidate.java           # A4
  06_quality_verifier.json    # S4
  07_ripple_risk_verifier.json # A5
  08_llm_verify.json          # A6
  09_report.json              # S5
```

---

## 8. Paper contribution sentence

> We present a LangGraph-orchestrated multi-agent refactoring workflow comprising six specialised agents—three static (smell detection, dependency context extraction, ripple-risk verification) and three LLM-based (planning, implementation, review)—evaluated against dependency-aware single-prompt refactoring on an identical stratified cohort of 150 Java files and five frontier language models.
