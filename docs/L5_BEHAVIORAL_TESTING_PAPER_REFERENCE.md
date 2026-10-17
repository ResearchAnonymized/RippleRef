# L5 Behavioral Testing — Paper Reference (Ripple REF / MA-REF)

**Purpose:** Authoritative reference for writing the behavioral-verification section of the EMSE / ICSE paper.  
**Status:** L5 v2 backfill **complete** (2026-07-05 UTC).  
**Studies:** `ripple_ref_master` (B0) · `ma_ref_master` (P-MA)  
**Related docs:** `RIPPLE_REF_RESEARCH_INTEGRITY.md` · `MA_RESEARCH_INTEGRITY.md` · `.run/EMSE_Research_Questions.md`

---

## 1. Role in the research design

### Verification stack (L1–L5)

| Level | Name | Scope | Role in paper |
|-------|------|-------|----------------|
| **L1** | Contract risk | Target file static profile | Ripple exposure outcome |
| **L2** | Observed caller impact | Pre-identified callers in sandbox | Primary ripple metric |
| **L3** | Compile probe | Module build (`mvn compile`) | Best-effort; many OSS repos fail offline |
| **L4** | Behavioral heuristics | Target file only (signatures, control flow, exceptions) | **Advisory** — not sufficient alone for “behavior preserved” |
| **L5** | Paired behavioral tests | Same Maven tests on **original** then **refactored** file in sandbox | **Primary behavioral metric** for test-eligible cohort |

### Link to research questions

| RQ | How L5 supports it |
|----|-------------------|
| **RQ2** (B0-V2 single-prompt risks) | L5 on B0-V2 rows: preserved vs regression vs inconclusive |
| **RQ3** (P-MA vs B0-V2) | **Paired comparison** on `(project_id, file_path, model_id)` within the **test-eligible subset** |
| **RQ4** (model-specific) | L5 outcomes stratified by `model_id` within eligible cohort |
| **RQ5** (risk factors) | L5 regression / inconclusive as dependent or explanatory variables |

**Primary RQ3 contrast:** P-MA (`variant=MA`) vs B0-V2 (`variant=V2`) — same 150 files, same models, same L5 protocol.

---

## 2. L5 v2 methodology (what we actually ran)

### Design: paired before/after probe

For each completed candidate with a saved diff:

1. Copy workspace to an **isolated sandbox** (production tree never modified).
2. **Discover tests** for the target class (see below).
3. **Run A (baseline):** replace target file with **original** content → execute Maven tests.
4. **Run B (candidate):** replace target file with **refactored** content → execute **same** test plan.
5. Record paired fields: `test_probe_before_status`, `test_probe_status`, `tests_passed_before`, `tests_passed`, `test_regression`.

Implementation: `RippleRefTestProbe.java` → `probePaired()`; backfill via `scripts/backfill_ripple_ref_test_probe.py` + `POST .../apply-and-verify` with `runMeta.testProbe=true` and `backfillReplay=true` (**no LLM re-run**).

### Test discovery (v2 — replaces v1 “447 wrong skips”)

| Step | Strategy label | Rule |
|------|----------------|------|
| 1 | **`targeted`** | Find test classes by filename patterns (`FooTest`, `FooTests`, `TestFoo`) and content references to the target class |
| 2 | **`module`** | If no targeted tests: run **`mvn test`** in the file’s Maven module (walk up to nearest `pom.xml`) |
| 3 | **`none`** | Skip — no Maven module and/or no runnable tests discovered |

Additional rules:

- **Maven root resolution:** walk up from file path to nearest `pom.xml` (multi-module repos e.g. JHotDraw, ArgoUML).
- **Timeout:** 900 s per probe (`BACKFILL_TEST_TIMEOUT_SEC`, `ripple.ref.test.timeout.sec`).
- **Sandbox cleanup:** discard isolated copy after backfill batch (`discardSandbox()`).
- **Original file for backfill:** uses `diffs/{pair}_before.java` when present (paired integrity).

### Pipeline execution order (2026-07-05)

| Phase | Study | Rows | Script / supervisor |
|-------|-------|------|---------------------|
| 1 | `ma_ref_master` | 750 | `run-ma-l5-backfill-until-complete.sh` then unified pipeline |
| 2 | `ripple_ref_master` | 1182 completed | `run-ripple-ref-l5-pipeline-until-complete.sh` |

Unified supervisor: `scripts/run-ripple-ref-l5-pipeline-until-complete.sh` (MA → B0, posts progress to `ripple_ref_master/pipeline_status.json`).

**Completion:** 2026-07-05 ~05:30 UTC — `l5Pending=0` for both studies.

---

## 3. Outcome taxonomy (report exactly these definitions)

### Probe strategy (`test_probe_strategy`)

| Value | Meaning | Counted as “test-eligible”? |
|-------|---------|----------------------------|
| `targeted` | Named test class(es) selected | **Yes** |
| `module` | Full module `mvn test` | **Yes** |
| `none` | No Maven module and/or no tests found | **No** — **skipped** |

### L5 outcome classes (for paper tables)

Derived in `RippleRefStudyService.verificationCounts()` from CSV + paired fields:

| Outcome | Operational rule | Interpretation |
|---------|------------------|----------------|
| **Preserved** | `before=success` AND `after=success` AND `test_regression=false` AND `tests_failed=0` | Strongest behavioral evidence: baseline tests pass and refactor does not break them |
| **Regression** | `test_regression=true` (baseline passed, candidate run failed) | Refactor broke passing tests |
| **Inconclusive** | Tests **attempted** (`strategy` ≠ `none`) but baseline did **not** pass (`before` ≠ success, not skipped) | Cannot claim preservation — **legacy repo tests already failing** in sandbox |
| **Skipped** | `strategy=none` OR `test_probe_status=skipped` | No test could be run — **not** a refactor failure |
| **Failed / timeout** | `test_probe_status=failed` or `timeout` without regression classification | Test run executed but did not succeed (distinct from skip) |
| **Pending** | Empty `test_probe_strategy` | Not yet backfilled (currently **0** for both studies) |

### Critical distinction for reviewers

> **Skipped ≠ “we did not test.”**  
> **Inconclusive = we tested the original and it already failed** — the refactor cannot be validated on that baseline.

Always report **two denominators**:

1. **All completed candidates** (750 MA / 1182 B0-V2 completed rows)
2. **Test-eligible cohort** (`strategy ∈ {targeted, module}`)

---

## 4. Final results (locked snapshot — 2026-07-05)

### Summary table — all completed candidates

| Metric | P-MA (`ma_ref_master`) | B0 (`ripple_ref_master`, completed rows) |
|--------|--------------------------|------------------------------------------|
| Completed candidates | **750** | **1182** |
| L4 pass (heuristic) | 598 | 950 |
| L4 fail | 152 | 232 |
| **L5 preserved** | **60** | **81** |
| **L5 regression** | **5** | **21** |
| **L5 inconclusive** | **330** | **519** |
| **L5 skipped** | **355** | **561** |
| L5 failed (non-regression) | 334 status `failed` + 1 `timeout` among probed | 540 status `failed` among probed |
| L5 pending | **0** | **0** |

### Probe strategy breakdown

| Strategy | P-MA | B0 |
|----------|------|-----|
| `targeted` | 300 | 470 |
| `module` | 95 | 151 |
| `none` (skipped) | 355 | 561 |
| **Test-eligible total** | **395** (52.7% of 750) | **621** (52.5% of 1182) |

### Test-eligible cohort only (denominator for primary L5 claims)

| Metric | P-MA (n=395) | B0 (n=621) |
|--------|--------------|------------|
| Baseline tests passed (`before=success`) | 65 (16.5%) | 102 (16.4%) |
| Baseline tests failed (`before=failed`) | 330 (83.5%) | 519 (83.6%) |
| **Preserved** | **60** (15.2% of eligible; **92.3%** of those with passing baseline) | **81** (13.0% of eligible; **79.4%** of passing baseline) |
| **Regression** | **5** (1.3% of eligible; **7.7%** of passing baseline) | **21** (3.4% of eligible; **20.6%** of passing baseline) |

*Preserved / regression rates conditional on passing baseline are optional sensitivity rows — use with clear denominator.*

---

## 5. Why tests were skipped (355 MA / 561 B0)

Skip reasons are stored in `test_reports/*.json` → field `notes` (not exported to CSV column today).

### Skip reason counts (from test reports)

| Skip reason | P-MA | B0 | Share of skips |
|-------------|------|-----|----------------|
| **`no_maven_project`** | 300 | 476 | ~84–85% |
| **`no_module_tests_found`** | 55 | 85 | ~15–16% |
| **Total skipped** | **355** | **561** | 100% |

### Meaning of each skip reason

| Reason | Technical cause | Paper wording |
|--------|-----------------|---------------|
| **`no_maven_project`** | No `pom.xml` found walking up from the target file in the sandbox | File lies in a non-Maven or non-build subtree (Ant, Gradle-only, or extracted source without module POM) |
| **`no_module_tests_found`** | Maven module exists but neither targeted discovery nor module-level test plan found runnable tests | Module present but no discoverable unit tests for L5 protocol |

### Repositories contributing most skipped files

Skips cluster in OSS systems **not built as Maven modules** at the sampled file paths:

| Repository (top) | P-MA skips | B0 skips |
|------------------|------------|----------|
| ganttproject-master | 50 | 80 |
| mockito-main | 50 | 80 |
| jabref-main | 50 | 80 |
| xerces-j-main | 50 | 79 |
| jEdit-master | 50 | 79 |
| ant-master | 50 | 78 |
| jhotdraw-develop | 20 | 32 |
| argouml-master | 20 | 31 |
| eclipse-collections-master | 10 | 16 |
| guava-master | 5 | 6 |

**Why this happened:** The cohort was stratified for **dependency exposure and smell density** (RQ1/RQ5), **not** for “has green Maven unit tests at this path.” Skips reflect **ecological validity** of real OSS layouts, not a pipeline bug.

### v1 → v2 fix (methods section footnote)

- **v1:** Many rows marked `skipped` despite nearby tests (e.g. `TextFigureTest.java`) because backfill did not re-run rows with existing `test_probe_status=skipped`, and discovery was narrow.
- **v2:** Filename + content discovery, module fallback, `L5_PROBE_V2=1` re-probe on empty `test_probe_strategy`, paired before/after on `diffs/*_before.java`.

---

## 6. Inconclusive rows (330 MA / 519 B0)

Among **test-eligible** rows only:

- **P-MA:** 330 / 395 baseline runs did not pass (83.5%).
- **B0:** 519 / 621 baseline runs did not pass (83.6%).

**Interpretation:** In isolated sandboxes, legacy tests often fail before any refactoring (environment, dependencies, flaky tests, partial checkouts). These rows support **negative evidence** (“cannot confirm preservation”) but must **not** be counted as refactor regressions.

**Suggested paper sentence:**

> For the test-eligible subset, baseline tests passed in the sandbox for 16.5% (P-MA) and 16.4% (B0) of candidates; the remainder are inconclusive for behavioral preservation because pre-refactor tests did not succeed under our probe conditions.

---

## 7. What to claim — and what not to claim

### Defensible claims

| Claim | Condition |
|-------|-----------|
| L5 is the **primary automated behavioral check** where tests exist | Always |
| Paired protocol avoids conflating legacy test failure with refactor regression | Methods |
| P-MA vs B0-V2 comparison on **test-eligible** rows with **passing baseline** | RQ3 sensitivity / primary behavioral subset |
| Skip rate (~47%) documents **Maven-centric L5 limitation** | Threats to validity |
| L4 supports ripple/adoption narrative but is **advisory** | Throughout |

### Do NOT claim

| Forbidden claim | Why |
|-----------------|-----|
| “L5 verified all 750 / 1182 candidates” | Only ~53% were test-eligible; rest skipped |
| “Inconclusive = refactor broke tests” | Baseline failed before candidate run |
| “Skipped = no behavioral risk” | Means no test oracle available |
| “L5 proves functional correctness” | Module/targeted tests are partial oracles |
| Compare preserved counts across all 750 without denominator | Must use test-eligible + passing-baseline subset |

---

## 8. Suggested paper tables (copy-ready structure)

### Table A — L5 coverage

| Cohort | Completed | Test-eligible | Skipped | % eligible |
|--------|-----------|---------------|---------|------------|
| P-MA | 750 | 395 | 355 | 52.7% |
| B0-V2 | 1182 | 621 | 561 | 52.5% |

### Table B — L5 outcomes (all completed)

| Outcome | P-MA | B0-V2 |
|---------|------|-------|
| Preserved | 60 | 81 |
| Regression | 5 | 21 |
| Inconclusive | 330 | 519 |
| Skipped | 355 | 561 |

### Table C — L5 outcomes (test-eligible, passing baseline only)

| Outcome | P-MA (n=65) | B0-V2 (n=102) |
|---------|-------------|---------------|
| Preserved | 60 | 81 |
| Regression | 5 | 21 |

### Table D — Skip reasons

| Reason | P-MA | B0-V2 |
|--------|------|-------|
| No Maven module | 300 | 476 |
| No tests in module | 55 | 85 |

---

## 9. Artifacts and replication

### Study directories

```
{TMPDIR}/refactai/workspaces/ripple_study_runs/ma_ref_master/
{TMPDIR}/refactai/workspaces/ripple_study_runs/ripple_ref_master/
```

Resolve at runtime: `GET /api/ripple-ref/studies/{studyId}?view=summary` → `studyDir`.

### Key files

| Artifact | Content |
|----------|---------|
| `results_candidates.csv` | Per-candidate L4/L5 columns (see below) |
| `test_reports/{pair}.json` | Full L5 probe result incl. `notes`, `probeStrategy`, paired fields |
| `diffs/{pair}_before.java` / `*_after.java` | Code replayed in backfill |
| `ripple_reports/` | L1–L4 ripple + adoption class |
| `pipeline_status.json` | L5 pipeline phase (on `ripple_ref_master`) |

### CSV columns (L5-related)

`test_probe_status`, `test_probe_before_status`, `test_probe_strategy`, `tests_passed`, `tests_failed`, `tests_passed_before`, `tests_failed_before`, `test_regression`, `behavioral_correct` (L4)

### API

| Endpoint | Use |
|----------|-----|
| `GET .../verification-summary` | Aggregate L4/L5 counts |
| `GET .../pipeline-status` | Pipeline phase + embedded `verificationMa` / `verificationB0` |
| `POST .../apply-and-verify` | Single-candidate L5 replay (backfill) |

### Replication commands

```bash
# Master Excel workbook (RQ1–RQ5 raw sheets + summary)
bash scripts/export-emse-ripple-master-excel.sh
# Output: .run/EMSE_RIPPLE_MASTER_DATA.xlsx

# Status
bash start_daemon.sh backfill-l5-status

# Re-run unified pipeline (if needed)
bash scripts/run-ripple-ref-l5-pipeline-until-complete.sh

# Manual single-study backfill
L5_PROBE_V2=1 bash scripts/backfill-ripple-ref-test-probe.sh ma_ref_master
L5_PROBE_V2=1 bash scripts/backfill-ripple-ref-test-probe.sh ripple_ref_master
```

### GUI

**RIPPLE-REF Study** panel → tab **L5 Behavioral** — live metrics, phase progress, skip-reason explanation.  
Banner **View details** opens that tab (fixed 2026-07-05).

---

## 10. Threats to validity (L5-specific)

| Threat | Mitigation / honest reporting |
|--------|------------------------------|
| **Maven-only** | ~47% skip; report skip reasons; do not extrapolate to Gradle/Ant |
| **Sandbox baseline failure** | Large inconclusive bucket; report passing-baseline subset separately |
| **Partial test oracle** | Targeted tests may not cover all behavior; module tests are coarse |
| **Timeout (900s)** | 1 MA timeout observed; report as failed run not skip |
| **Offline OSS builds** | Compile (L3) and tests may fail for environmental reasons |
| **Cohort not test-stratified** | Skips correlate with repo build system — not random missing data |

---

## 11. Adoption class interaction (L4 + L5)

`RippleRefBehavioralVerifier.computeAdoptionClass()` combines ripple + L4 + L5:

| Class | Typical L5 role |
|-------|-----------------|
| `safe` | L5 preserved |
| `behavior_ok_tests_failed` / `behavior_ok_tests_inconclusive` | L4 pass; L5 fail or inconclusive |
| `ripple_and_behavior_ok_tests_skipped` | L4 pass; L5 skipped (`strategy=none`) |

Report adoption classes **alongside** L5 outcomes — do not collapse into a single “success rate.”

---

## 12. Code map (for methods appendix)

| Component | Path |
|-----------|------|
| Paired test probe | `backend/.../RippleRefTestProbe.java` |
| L4 heuristics | `backend/.../RippleRefBehavioralVerifier.java` |
| Apply + verify API | `backend/.../RippleRefStudyService.java` |
| Verification aggregates | `verificationSummary()`, `verificationCounts()` |
| Backfill script | `scripts/backfill_ripple_ref_test_probe.py` |
| Unified L5 pipeline | `scripts/run-ripple-ref-l5-pipeline-until-complete.sh` |
| UI panel | `web/app/app/components/RippleRefL5PipelinePanel.tsx` |

---

## 13. Changelog

| Date | Change |
|------|--------|
| 2026-07-04 | L5 v1 paired backfill complete (750/750); high skip rate identified |
| 2026-07-04 | L5 v2: targeted + module fallback, `test_probe_strategy`, re-backfill |
| 2026-07-05 | Unified MA→B0 pipeline; both studies `l5Pending=0` |
| 2026-07-05 | GUI L5 tab + skip explanation; View-details tab fix |
| 2026-07-05 | This document — paper reference locked |

---

## 14. Open items for paper writing (when you return)

- [ ] Export **skip-reason CSV** per `pair_key` for appendix (optional script)
- [ ] **RQ3 paired test** on test-eligible + passing-baseline subset (P-MA vs B0-V2)
- [ ] Manual audit sample: 10 regression cases + 10 inconclusive cases
- [ ] Sensitivity: targeted-only vs module-included eligible cohort
- [ ] Align wording with `wiki/ESEM_Research_Methodology.tex` L5 paragraph (currently describes v1 targeted-only)

---

*Last updated: 2026-07-05. Regenerate skip counts from `test_reports/*.json` if backfill is re-run.*
