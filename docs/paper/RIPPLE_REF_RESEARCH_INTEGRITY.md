# RIPPLE-REF Research Integrity Plan

> **Package:** `TSE/` (IEEE TSE venue). Source snapshot of repo-root `RIPPLE_REF_RESEARCH_INTEGRITY.md`.

## Study objective (camera-ready)

> Evaluate ripple-effect risks in AI-assisted Java refactoring on a locked stratified cohort of 150 files across 15 open-source systems and five frontier LLMs. The study measures **pre-refactor dependency exposure** (RQ1), characterises risks from **dependency-aware single-prompt** refactoring (RQ2), tests whether **LangGraph multi-agent orchestration** reduces those risks versus the same single-prompt condition (RQ3), compares **model-specific** ripple behaviour (RQ4), and identifies **factors** associated with high ripple risk (RQ5). All candidates are verified with the same multi-level ripple protocol (L1–L5).

## Research questions (EMSE — locked 2026-07-03)

See `.run/EMSE_Research_Questions.md` for the authoritative RQ text and evidence map.

| RQ | Question | Primary evidence | Study / condition |
|----|----------|------------------|-------------------|
| **RQ1** | Dependency exposure before refactoring | Pre-refactor profiles, `selected_files.csv`, dependency contexts | Cohort setup (150 files) |
| **RQ2** | Risks in dependency-aware **single-prompt** refactoring | B0-V2 candidates: `risk_level`, caller breakage, adoption class | `ripple_ref_master` variant=V2 |
| **RQ3** | Effect of **multi-agent orchestration** vs dependency-aware single-prompt | **Paired** P-MA vs B0-V2 per file×model | `ma_ref_master` vs `ripple_ref_master` V2 |
| **RQ4** | **Model-specific** ripple-risk behaviour | Outcomes by model across B0-V2 and P-MA | Both studies × 5 models |
| **RQ5** | **Factors** associated with high ripple risk | Stratified / regression on file, model, orchestration, edit features | Unified results table |

**Note:** B0-V1 (file-only single-prompt) supports sensitivity analysis; RQ3 primary contrast is **multi-agent vs B0-V2**.

## Legacy RQ mapping (superseded)

| Old (ripple-only draft) | New EMSE RQ |
|-------------------------|-------------|
| RQ1 dependency context | **RQ1** exposure |
| RQ2 API/caller changes | Part of **RQ2** / **RQ5** |
| RQ3 V1 vs V2 | Subsumed by **RQ2** (V2) + ablation (V1) |
| RQ4 risk factors | **RQ5** |
| — | **RQ3** multi-agent (new primary) |
| — | **RQ4** models (explicit) |

## Operational definitions (report exactly this in the paper)

### Ripple exposure (before refactor, on target file T)

- **Fan-in / fan-out**: file-level dependency graph edges in production Java.
- **Public/protected API surface**: extracted method/constructor signatures on T.
- **Caller-used APIs**: public/protected methods on T that at least one other production file references via `ClassName.method(` (word-boundary match).
- **Downstream callers**: production files referencing T (may include same-package noise; report counts + manual audit sample).

### Ripple outcome (after candidate T′)

**Level 1 — Contract risk (static, target file only)**  
Compare profiles of T vs T′: removed/changed public APIs, signatures, constructors, annotations, extends/implements, imports, fan-out delta.

**Level 2 — Observed caller impact (repository sandbox)**  
1. Copy repository to an **isolated sandbox** (original workspace never modified).  
2. Replace **only** T with T′ in the sandbox.  
3. Re-read each **pre-identified caller file** unchanged in the sandbox.  
4. **Broken caller**: caller still contains a call to a **caller-used API** that no longer exists on T′.  
5. Record `observed_broken_caller_count`, `observed_broken_callers`, `observed_broken_references`.

**Level 3 — Build verification (best-effort, optional)**  
Run `mvn -DskipTests compile` (or `gradlew compileJava`) in sandbox with timeout. Record success/failure and error snippet. **Many OSS repos fail offline** — report as *attempted*, not hidden.

**Level 4 — Behavioral heuristics (target file)**  
Compare original vs candidate on the target file only:
- public method signature preservation
- exception handling constructs (try/catch/throws)
- framework contracts (`@Test`, `@Override`, `setName()`)
- conditional logic counts (if/ternary/switch)
- critical calls (`fail()`, `assert*`)

Record `behavioral_correct` and per-dimension flags in `behavioral_reports/`.

**Level 5 — Paired behavioral tests (primary for test-eligible cohort)**  
Discover tests via targeted class names or module-level `mvn test`; run **paired** probes on original then refactored file in sandbox. Record `test_probe_strategy` (`targeted` | `module` | `none`), paired statuses, `test_regression`. See **`L5_BEHAVIORAL_TESTING_PAPER_REFERENCE.md`** for final counts, skip reasons, and paper reporting rules.

**Backfill L5 on completed runs (no LLM):** `./scripts/backfill-ripple-ref-test-probe.sh ripple_ref_master` — replays saved `diffs/*_after.java` through `apply-and-verify` with `testProbe=true`. Unified MA→B0 pipeline: `scripts/run-ripple-ref-l5-pipeline-until-complete.sh`.

### Adoption class (report separately from ripple risk)

| Class | Rule |
|-------|------|
| `safe` | Low/Medium ripple + L2 no breakage + L4 pass + L5 tests pass |
| `ripple_and_behavior_ok_tests_skipped` | Ripple + L4 pass; tests not run or skipped |
| `ripple_safe_behavior_uncertain` | Ripple ok but L4 fail |
| `behavior_ok_tests_failed` | L4 pass but L5 fail |
| `risky` | High ripple or observed caller breakage |
| `rejected` | Parse/generation failure |

### Risk classification (transparent rules)

| Level | Rule |
|-------|------|
| **High** | Any observed broken caller **OR** caller-used API removed/changed **OR** public/protected signature change **OR** constructor/annotation/inheritance/package change **OR** large dependency delta |
| **Medium** | Internal/import/fan-out change only; no L2 breakage |
| **Low** | No contract change; no observed caller breakage |

Report **both** `contract_risk_level` and `observed_risk_level`; final `risk_level` = max(contract, observed).

## Experimental design

### Scale (APSEC full study)

- **15 repositories** (diverse Java OSS)
- **10 stratified production files** per repository
- **5 frontier models** (configurable IDs, not hard-coded)
- **2 variants**: V1 file-only, V2 dependency-aware
- **1,500 candidates** → **750 paired** file×model comparisons for RQ3

### Stratified file selection (seed = 42)

High fan-in, medium fan-in, low fan-in, high public API, high smell+dependency, random fill — as implemented in `RippleRefFileSelector`.

### Paired comparison (critical for integrity)

Every analysis row is keyed by `(project_id, file_path, model_id)` with both V1 and V2. Never compare unpaired candidates.

## Analysis plan (what you will run on `results_candidates.csv`)

1. **Completeness**: planned vs completed vs failed; exclude incomplete pairs from RQ3.
2. **RQ1**: descriptive stats + distributions per stratum.
3. **RQ2**: counts of each change type (V1 and V2).
4. **RQ3**: McNemar / Wilcoxon on paired High vs not-High; caller-used API preservation rate; **observed_broken_caller_count** V1 vs V2; effect sizes + 95% CI.
5. **RQ4**: logistic regression or stratified tables: fan-in, smells, LOC, model.
6. **Manual audit**: 10–15 cases (5 safe, 5 risky, 5 disputed) with dependency graphs in paper.

## Threats to validity (state openly)

1. Static dependency/caller extraction (regex) — mitigated by L2 caller re-check and manual audit sample.
2. LLM non-determinism — same model ID, temperature documented; optional repeat on 5% sample.
3. Smell detector (PMD) — version pinned in `SMELL_ENGINE_VERSION`.
4. Compile probe may fail for environmental reasons — reported separately, not conflated with ripple.
5. V2 prompt may increase tokens/latency without reducing risk — report cost metrics.

## Artifact integrity checklist (per candidate)

- [ ] `prompts/` saved before API call  
- [ ] `model_responses/` raw response  
- [ ] `generated_candidates/` candidate Java  
- [ ] `isolated_workspaces/` sandbox with patch applied  
- [ ] `before_profiles/` / `after_profiles/`  
- [ ] `ripple_reports/` with L1 + L2 fields  
- [ ] One row in `results_candidates.csv` even if failed  

## Implementation mapping

| Capability | Component |
|------------|-----------|
| Sandbox copy + apply | `RippleRefWorkspaceSandbox` |
| Caller breakage | `RippleRefCallerImpactAnalyzer` |
| Behavioral heuristics | `RippleRefBehavioralVerifier` |
| Targeted tests | `RippleRefTestProbe` |
| Contract diff + risk | `RippleRefRippleVerifier` |
| Orchestration | `RippleRefStudyService.applyAndVerify` |
| Optional compile | `RippleRefCompileProbe` |

## Execution order

1. PMD/smell analysis on all 15 repos  
2. Create study → scan → select (10/repo) → build contexts  
3. Run candidates repo-by-repo with **resume**  
4. Export `results_candidates.csv` + completeness report  
5. Statistical analysis (separate script; not in tool)  
6. Manual audit sample before submission  
