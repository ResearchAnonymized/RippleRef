# MA-REF Research Integrity (`ma_ref_master`)

**Status:** Active — P-MA arm of EMSE controlled experiment  
**Baseline:** `ripple_ref_master` (B0) — must be complete before MA cohort import  
**Primary contrast (RQ3):** P-MA vs **B0-V2** on `(project_id, file_path, model_id)`

---

## Non-negotiable rules

1. **Same 150 files** — imported from `ripple_ref_master.selectedByRepo`; no re-sampling, no new `select-files` on MA study.
2. **Same smell detector** — PMD via `GET /workspaces/{id}/files/analysis` inside LangGraph `analyze` node (`SMELL_ENGINE_VERSION=5`).
3. **Same dependency data** — `RippleRefDependencyScanner` / `dependency-context` API; A2 agent wraps B0-V2 facts, does not reimplement.
4. **Same ripple verifier** — `POST /ripple-ref/studies/ma_ref_master/apply-and-verify` (L1–L4); A5 agent calls this in-graph.
5. **True multi-agent** — LangGraph v2.0 with `MULTI_LLM_AGENT_MODE=full` (Planning + Refactoring + Verification LLM agents).
6. **No workspace writes** — MA graph skips `apply`/`compile`; candidates never touch production trees.
7. **Single variant `MA`** — no V1/V2 split; 750 candidates (150 × 5 models).
8. **Immediate persistence** — every candidate writes `results_candidates.csv`, `agent_traces/`, `ripple_reports/` before next run.
9. **Single pipeline owner** — at most one MA wrapper (`ma-ref-master-wrapper.lockdir`). Duplicate runners waste API spend; run `scripts/dedupe-ma-ref-runners.sh` only when no wrapper is active.
10. **Terminal failures documented** — after `MA_MAX_ATTEMPTS_PER_PAIR` (default 3), `record-candidate-outcome` writes `failed_*` to CSV + `failedCandidates` (never overwrites `completed`). Attempts logged in `logs/ma_ref_attempts.jsonl`.
11. **CSV ↔ state reconcile** — `completedCandidates` / `failedCandidates` rebuild from `results_candidates.csv` on load (prevents false 0/750 progress and duplicate re-runs).

---

## What we do NOT claim

| Claim | Why forbidden |
|-------|----------------|
| B0 is multi-agent | B0 = 1 `chat_completion` per candidate |
| MA re-sampled files | Cohort manifest must show 150 files from `ripple_ref_master` |
| RQ3 uses B0-V1 | V1 is ablation only; primary pair is B0-V2 |
| Different ripple metric for MA | Same `apply-and-verify` code path |

---

## Preflight checklist (automated)

`GET /api/ripple-ref/studies/ma_ref_master/integrity-preflight`

| Check | Pass condition |
|-------|----------------|
| `cohortFileCount` | 150 |
| `cohortSourceStudyId` | `ripple_ref_master` |
| `cohort_manifest.json` | Present under study `cohort/` |
| `variantCount` | 1 |
| `orchestration` | `multi_agent` |
| Agents `multiLlmAgentMode` | `full` |

---

## Agent trace requirements (paper evidence)

Each candidate must persist `agent_traces/{pair_key}.json` with:

- `steps[]` — every graph node with agent display name
- `graphVersion` — `2.0` for MA graph
- `nodeTrace` — ordered LangGraph nodes including `dependency_context`, `ripple_verify`
- `orchestration` — `multi_agent`

Minimum headline agents (Tier A): Code Smell Detector, Dependency Context, LLM Planning, LLM Refactoring, Ripple Risk Verifier, LLM Verification.

---

## CSV schema extensions (vs B0)

Additional columns on `results_candidates.csv`:

`orchestration`, `graph_version`, `multi_llm_agent_mode`, `agent_step_count`, `llm_plan_status`, `llm_verify_approved`, `static_verify_accept`, `cohort_id`

B0 rows leave MA columns empty; unified export joins on `(project_id, file_path, model_id)` with B0 `variant=V2`.

---

## Execution discipline

- One system batch at a time (`run-ma-ref-master-system.sh`)
- Resume skips `completedCandidates` only
- Failed candidates may be retried explicitly (infrastructure failures)
- Setup: `./scripts/setup-ma-ref-master.sh` before any runs

### Autonomous overnight pipeline (GUI-aligned)

| Phase | What |
|-------|------|
| **1 · MA generation** | Systems 1→15 until 750/750 |
| **2 · L5 backfill B0** | Auto replay tests on saved `ripple_ref_master` diffs (no LLM) |
| **3 · L5 backfill MA** | Auto replay tests on saved `ma_ref_master` diffs |
| **Done** | MA + L5 complete |

Start via GUI **Autonomous Pipeline → Start** or `./scripts/start-ma-ref-overnight-daemon.sh`.

| Component | Role |
|-----------|------|
| `scripts/run-ma-ref-master-supervisor-wrapper.sh` | MA loop then auto B0→MA L5 backfill |
| `scripts/backfill-ripple-ref-test-probe.sh` | Manual backfill if needed |
| GUI tab | **Autonomous Pipeline** + **L4/L5 metrics** on Collection/Results |

**Metrics in GUI:** L4 = advisory heuristic; L5 = paired Maven tests (paper primary).

**Paper reference (L5 outcomes, skips, reporting rules):** `L5_BEHAVIORAL_TESTING_PAPER_REFERENCE.md`

---

## Artifact layout

```
{studyDir}/ma_ref_master/
  cohort/cohort_manifest.json
  results_candidates.csv
  agent_traces/
  ripple_reports/
  dependency_contexts/
  study_state.json
```

Study dir: `{temp}/ripple_study_runs/ma_ref_master/`
