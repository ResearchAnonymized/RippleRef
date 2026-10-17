# RIPPLE-REF Technical Setup (read-only inspection)

**Date:** 2026-10-03  
**Scope:** Internal architecture, source, configuration, and data flow only.  
**Constraints honored:** no code/config changes; no experiment re-runs; no LLM calls; no new results or sample review.

**Primary code roots**
- Backend: `backend/server/src/main/java/ai/refact/server/service/rippleref/`
- API: `backend/server/src/main/java/ai/refact/server/controller/RippleRefStudyController.java`
- Agents: `agents/ripple_ref_study.py`, `agents/ma_ref_study.py`, `agents/refactor_graph.py`
- Scripts: `scripts/run-ripple-ref-*.sh`, `scripts/ripple-ref-lib.sh`, `scripts/export-emse-ripple-master-excel.sh`
- Study data root (runtime): `{workspaceTempDir}/ripple_study_runs/{studyId}/` (typically `~/.refactai/workspaces/ripple_study_runs/`)

---

## 1. Executive technical summary

RIPPLE-REF is a **study harness** layered on the RefactAI backend + agents service. It:

1. Scans a Java workspace for **production** files and builds regex-based **profiles** and a **dependency/caller index**.
2. Selects a stratified sample of smell-bearing files (seeded RNG).
3. Builds a **dependency-context package** for V2 / MA prompts.
4. Generates candidates via either **single-prompt** (`agents/ripple_ref_study.py`, variants V1/V2) or **LangGraph multi-agent** (`ma_ref_study.py` → `build_ma_ref_graph()`).
5. Verifies every candidate through shared **`applyAndVerify`** (L1 contract, L2 caller text check, optional L3 compile, L4 behavioral heuristics, optional L5 paired Maven tests).
6. Classifies **contract / observed / final risk** as `Low|Medium|High` and an **adoption_class** string; appends a row to `results_candidates.csv`.

Profiling and signature comparison are **regex / textual**, not JavaParser/JDT. Fan-in/out reuse `DependencyAnalysisService` (also regex/import-based). Baseline smells use **PMD** via `ComprehensiveCodeSmellDetector` (with cache; large-repo selection may short-circuit).

Paper labels such as `UNSAFE` / `LOW-RISK` / `REVIEW-NEEDED` are **not** implemented as enums in the RippleRef Java package; the code emits `risk_level` ∈ {Low, Medium, High} plus `adoption_class`.

---

## 2. System architecture

### 2.1 Component table

| Component | Path | Class / function | Purpose | Input | Output | Caller | Downstream |
|-----------|------|------------------|---------|-------|--------|--------|------------|
| Study API | `…/controller/RippleRefStudyController.java` | REST `/api/ripple-ref/*` | Create/scan/select/context/verify/artifacts | HTTP JSON | DTOs / maps | UI, bash scripts, agents | `RippleRefStudyService` |
| Study orchestrator | `…/rippleref/RippleRefStudyService.java` | `scanRepository`, `selectFiles`, `buildDependencyContexts`, `applyAndVerify`, artifact writers | Persist study state + CSV | workspaceId, paths, candidate | `StudyState`, reports, CSV rows | Controller | Disk under `ripple_study_runs/` |
| Production filter | `RippleRefProductionClassifier.java` | `classify` | PRODUCTION / TEST / EXCLUDED | relative path | enum | Scanner, scanRepository | Eligible pool |
| Repo dependency scan | `RippleRefDependencyScanner.java` | `scan` | Profiles + graphs + callers | `ProjectContext` | `RepositoryDependencyScan` | StudyService | Context builder, L1/L2 |
| Fan-in/out graph | `DependencyAnalysisService.java` | `analyzeProjectDependencies` | Import/type edge graph | project files | file deps + reverse | DependencyScanner | Profile fanIn/fanOut |
| Java profiling | `RippleRefJavaProfileExtractor.java` | `extract` | Package, APIs, imports, inheritance, calls | path + source text | `JavaFileProfile` | Scanner, applyAndVerify | Context, L1, L2, L4 |
| Eligibility + sample | `RippleRefFileSelector.java` | `computeEligible`, `stratifiedSample` | Filter + stratified pick | scan + smells + contents | `EligibleFile` / `SelectedFile` | StudyService.selectFiles | `selected_files.csv`, state |
| Context package | `RippleRefContextBuilder.java` | `build`, `toPromptText` | Prompt-ready dependency package | profile | `DependencyContextPackage` | StudyService | V2/MA prompts |
| Single-prompt runner | `agents/ripple_ref_study.py` | `run_ripple_ref_candidate` | V1/V2 one LLM call + artifacts | `RippleRefRunRequest` | pair status | `POST /agents/ripple-ref/run-candidate` | apply-and-verify |
| Multi-agent runner | `agents/ma_ref_study.py` | `run_ma_ref_candidate` | LangGraph MA pipeline | `MaRefRunRequest` | pair status | MA agents endpoints / scripts | apply-and-verify via node |
| MA graph | `agents/refactor_graph.py` | `build_ma_ref_graph` | Node DAG for P-MA | pipeline state | candidate + steps | orchestrate when `maStudyMode` | ripple_verify_ma |
| Dep-context node | `agents/refactor_nodes/dependency_context.py` | `run_dependency_context` | Fetch context into pipeline | studyId, file | `dependency_context_text` | MA graph | refactor prompt path |
| Ripple verify node | `agents/refactor_nodes/ripple_verify_ma.py` | `run_ripple_verify_ma` | Call apply-and-verify | candidate | `ripple_report` | MA graph | CSV via StudyService |
| L1 risk | `RippleRefRippleVerifier.java` | `verify` / `verifyWithContent`, `classifyContractRisk` | Contract + dep delta risk | before/after profiles | report + riskLevel | applyAndVerify | CSV `risk_*` |
| L2 callers | `RippleRefCallerImpactAnalyzer.java` | `analyze` | Broken caller detection | profiles + root | `CallerImpactResult` | applyAndVerify | `applyObservedImpact` |
| L3 compile | `RippleRefCompileProbe.java` | `probe` | Maven/Gradle compile | sandbox path | status | applyAndVerify (opt) | observed risk bump |
| L4 behavior | `RippleRefBehavioralVerifier.java` | `verify`, `computeAdoptionClass` | Heuristic behavioral checks | original/candidate | flags + adoption | applyAndVerify | CSV |
| L5 tests | `RippleRefTestProbe.java` | `probePaired` | Paired Maven tests | sandbox + contents | TestProbeResult | applyAndVerify (opt) | adoption_class |
| Sandbox | `RippleRefWorkspaceSandbox.java` | `ensureSandbox`, `applyTargetFile` | Isolated copy for L3/L5 | project root | sandbox path | applyAndVerify | compile/test |
| Export | `scripts/export-emse-ripple-master-excel.sh` + `web/app/.../buildEmseRippleMasterExcel.ts` | npm `export:emse-ripple-master` | Workbooks from CSVs | study CSVs | `.run/EMSE_*.xlsx` | Operator | Paper analysis |

### 2.2 End-to-end technical flow

```text
Workspace (OSS checkout)
→ Production classify + list
→ Dependency scan (profiles + fan-in/out + caller index)
→ PMD smell counts (eligibility)
→ Stratified select (seeded)
→ Dependency-context packages (JSON + prompt text)
→ Generate candidate (single-prompt V1/V2 XOR LangGraph MA)
→ Parse ```java``` / sanitize
→ Persist prompt / response / candidate (keyed artifacts)
→ applyAndVerify:
     before/after profiles → L1 contract risk
     L2 caller text check (live workspace roots)
     optional sandbox → L3 compile / L5 paired tests
     L4 behavioral heuristics
     merge risk + adoption_class
→ Append results_candidates.csv + ripple_reports/*.json
→ Enrich / export Excel (offline scripts)
```

---

## 3. Entry points and execution flow

### 3.1 Backend endpoints (`RippleRefStudyController`, prefix `/api/ripple-ref`)

| Endpoint | Launches |
|----------|----------|
| `POST /studies` | Create study dir + `config.json` |
| `POST /studies/{id}/scan/{workspaceId}` | Repository profiling |
| `POST /studies/{id}/select-files` | Eligibility + stratified selection |
| `POST /studies/{id}/build-contexts` | Dependency-context packages for selected files |
| `GET …/dependency-context` | Fetch one context package |
| `POST …/artifacts/prompt\|response\|candidate` | Persist generation artifacts |
| `POST …/apply-and-verify` | L1–L5 verification + CSV row |
| `POST …/import-cohort` / `import-cohort-manifest` | Lock MA cohort from B0 |
| `POST …/record-candidate-outcome` | MA terminal failure / retry accounting |
| `GET …/completeness`, streams, live-status | Ops / GUI |

### 3.2 Agent HTTP entry points (`agents/main.py`)

| Route | Role |
|-------|------|
| `POST /agents/ripple-ref/run-candidate` | Single-prompt V1/V2 candidate |
| `POST /agents/ripple-ref/run-batch` | Batch over selected × models × variants |
| MA path | `ma_ref_study.run_ma_ref_candidate` via refactor with `maStudyMode=True` (wired from MA scripts / main) |

LLM call for B0: `call_ripple_ref_llm` ≈ L2015–2030 (`temperature=0.4`, size-scaled `max_tokens` capped by `RIPPLE_REF_MAX_OUTPUT_TOKENS`).

### 3.3 Shell scripts (do not execute for this audit)

| Script | Role |
|--------|------|
| `scripts/ripple-ref-lib.sh` | Ports, models JSON, curl helpers, create/scan/select helpers |
| `scripts/run-ripple-ref-master-system.sh` | Per-repo setup + B0 candidate run |
| `scripts/run-ripple-ref-master-overnight.sh` / `continue` / `finish-all` | Multi-repo orchestration |
| `scripts/run-ripple-ref-batch.sh`, `trial`, `pilot`, `phase1-gap-fill`, `final-7` | Other B0 runners |
| `scripts/bootstrap-ripple-ref-from-cohort.sh` | Cohort bootstrap |
| `scripts/backfill-ripple-ref-test-probe.sh` (+ `.py`) | L5 backfill without LLM |
| `scripts/run-ripple-ref-l5-pipeline-until-complete.sh` | L5 pipeline |
| `scripts/export-emse-ripple-master-excel.sh` | Enrich CSV → Excel |
| `scripts/export-ripple-ref-cohort.sh` | Cohort export |
| MA overnight scripts | `scripts/run-ma-ref-*` / `.run/ma-ref-*` (MA arm) |

### 3.4 Configuration / env (high level)

| Variable / config | Default / note | Consumed by |
|-------------------|----------------|-------------|
| `ports.env` → `BACKEND_PORT`, `AGENTS_PORT` | 8083 / 8091 | `ripple-ref-lib.sh` |
| `RIPPLE_REF_COMPILE_PROBE` | `0` | `ripple_ref_study.py` → runMeta |
| `RIPPLE_REF_TEST_PROBE` | `0` | same |
| `RIPPLE_REF_MAX_OUTPUT_TOKENS` | `2500` | `llm_prompts.compute_refactor_max_tokens` |
| `RIPPLE_REF_CURL_TIMEOUT_SEC` | `3600` | lib curl |
| `MULTI_LLM_AGENT_MODE` | `full` for MA | `ma_ref_study`, agent registry |
| `MA_MAX_ATTEMPTS_PER_PAIR` | `3` | `ma_ref_study` |
| `ripple.ref.test.timeout.sec` | `900` (system property) | `RippleRefTestProbe` |
| Study `config.json` | seed 42, files/repo, models, scale | StudyService |
| Docker | Not RippleRef-specific; stack via `./start_daemon.sh` / refine start scripts | Ops |

### 3.5 Which entry launches which stage

| Stage | Entry |
|-------|--------|
| Profiling | `POST …/scan/{workspaceId}` (scripts: master-system setup) |
| Single-prompt experiments | `POST /agents/ripple-ref/run-*` or master-system `RUN=1` |
| Multi-agent experiments | `ma_ref_study` + LangGraph `maStudyMode` |
| Verification | Always `POST …/apply-and-verify` (B0 after LLM; MA via `ripple_verify` node) |
| Compilation | Only if `runMeta.compileProbe=true` (env `RIPPLE_REF_COMPILE_PROBE=1` on B0) |
| Testing | Only if `runMeta.testProbe=true` (env `RIPPLE_REF_TEST_PROBE=1`) or L5 backfill scripts |
| Export | `export-emse-ripple-master-excel.sh` → `npm run export:emse-ripple-master` |

---

## 4. Repository profiling

### 4.1 Pipeline (`RippleRefStudyService.scanRepository` ≈ L174+)

1. Walk project sources; classify each path (`RippleRefProductionClassifier`).
2. Record production vs excluded lists / LOC / commit hash.
3. Call `RippleRefDependencyScanner.scan` for production files only.

### 4.2 Extracted fields (`RippleRefJavaProfileExtractor.extract` ≈ L35–108)

| Field | Mechanism |
|-------|-----------|
| package | Regex `package\s+([\w.]+)\s*;` |
| declared classes | Regex class/interface/enum/record |
| imports / typeDependencies | Regex `import` (non-wildcard → both lists) |
| annotations | Regex `@([\w.]+)` |
| extends / implements | Regex on declaration |
| public/protected APIs | Regex method signatures → `formatMethod` |
| constructors | Regex public/protected ctor |
| methodCalls | Regex `Ident.method(` |
| loc | line split |
| parseSuccess | declared class or content contains `class `/`interface ` |

### 4.3 Fan-in / fan-out / callers (`RippleRefDependencyScanner`)

- **Fan-out / fan-in:** from `DependencyAnalysisService` (import regex + same-package `Type.method(` heuristics) — **not** AST/symbol resolution (`DependencyAnalysisService.java` ≈ L27–157).
- **Caller files / caller-used APIs:** textual: caller content contains class name (or FQN); then `isCallerUsingApi` / `isCallerUsingApiInKnownCaller` regex (`JavaProfileExtractor` ≈ L189–214).
- **Downstream callers:** `profile.callerFiles` / `scan.callerIndex`.

### 4.4 Baseline PMD

- Eligibility / before-smell: `StudyService.smellCount` → `ComprehensiveCodeSmellDetector` + `pmdPersistence` cache (`SMELL_ENGINE_VERSION`) ≈ L1626–1640.
- Large repos (`paths.size() > 400`) may return **smell count 1** without full PMD during selection (fast path).
- After-smell on candidate: temp file under `generated_candidates/*_verify.java` then `detectAllCodeSmells` (`applyAndVerify` ≈ L498–509).

### 4.5 Confirmed non-use

| Technology | Used in RippleRef profiling? |
|------------|------------------------------|
| Regular expressions | **Yes** (primary) |
| Textual search / `contains` | **Yes** (callers) |
| PMD | **Yes** (smells) |
| Maven tooling | Only L3/L5 probes, not profiling |
| JavaParser / Spoon / JDT | **No** (comment in extractor: “JDT/Spoon-ready interface; no external parser”) |
| True symbol resolution | **No** |

---

## 5. Target-file selection

### 5.1 Production vs test / exclusions (`RippleRefProductionClassifier` ≈ L22–132)

- **TEST:** `/src/test/`, `/test/java/`, `*Test.java`, `/tests/`, IT paths, etc.
- **EXCLUDED:** non-`.java`, `WorkspacePathFilters.isExcludedFromFileListing`, `/generated/`, `/gen/`, vendor/third_party, examples/samples.
- **PRODUCTION:** `/src/main/java/`, flat `…/org/…` layouts, `/src/*/java/`, etc.

### 5.2 Eligibility (`RippleRefFileSelector.computeEligible` ≈ L26–80)

Requires: `parseSuccess`; within token budget (≤25k lines, ≤160k est tokens); `smellCount ≥ minSmellCount` (default 1); not zero-dependency empty; has at least one “ripple signal” (public/protected API, callers, annotations, extends/implements).

Scores (for metadata, not hard filters):
- `valueScore` ≈ L179–185  
- `dependencyRiskScore` ≈ L188–194  

### 5.3 Stratified sample (`stratifiedSample` ≈ L83–146)

- **Seed:** `config.randomSeed` or `DEFAULT_SEED=42`; effective seed `seed + workspaceId.hashCode()` (`StudyService.selectFiles` ≈ L241–276).
- **Deterministic** given same eligible pool + seed + JVM `Random` shuffle.
- **Buckets:** high/medium/low fan-in, high public API (≥5), high smell+dep, random_eligible; then `random_fill`.
- **Count:** `config.filesPerRepository` — scale `full`/`apsec` → **10** (`applyScaleDefaults` ≈ L1555–1561). Pilot default 5.
- **Storage:** `selectedByRepo` in `study_state.json`; CSV under study dir (`selected_files` write ≈ L282); cohort manifests for MA import.

*This audit does not inspect or evaluate the realized sample.*

---

## 6. Dependency-context construction

**Builder:** `RippleRefContextBuilder.build` ≈ L15–36; text `toPromptText` ≈ L55–108.

| Included? | Field |
|-----------|--------|
| Yes | package, public/protected APIs, caller-used APIs, downstream callers, imports, typeDependencies, annotations, extends, implements, fanIn/fanOut |
| Yes | `dependencyConstraints` + ripple-safety ALLOWED/NOT ALLOWED rules |
| No (in package DTO) | Full file source (source is added separately in prompts) |
| No | PMD violation list (smells added by prompt builders, not ContextBuilder) |
| Serialized | `contextText` string + JSON fields; `generatedAt` |

**Insertion**
- B0 V2: `build_v2_user_prompt` embeds `DEPENDENCY CONTEXT PACKAGE:` (`ripple_ref_study.py` ≈ L98–131, fetch ≈ L213–221).
- MA: `dependency_context` node GETs `/dependency-context`, sets `pipeline.dependency_context_text` (`dependency_context.py`).

---

## 7. Single-prompt generation

**File:** `agents/ripple_ref_study.py`

| Aspect | Implementation |
|--------|----------------|
| Variants | **V1** file-only; **V2** + dependency context |
| System | `V1_SYSTEM` / `V2_SYSTEM` = `REFACTOR_SYSTEM_PROMPT` + ripple rules (L22–38) |
| User | Smells listing, plan instructions, public API, full ```java``` source; V2 adds context |
| Client | `call_ripple_ref_llm` → OpenRouter chat (`main.py` ≈ L2015+, `temperature=0.4`) |
| Models | Study `config.models` / `ripple_ref_default_models_json` (5 OpenRouter IDs) |
| Tokens | `compute_refactor_max_tokens` then **cap** `RIPPLE_REF_MAX_OUTPUT_TOKENS` (default 2500) |
| Retry | Resume skips `completedCandidates`; no in-prompt auto-repair loop in B0 runner |
| Response format | Complete file in ```java```; `_extract_java_block` + `sanitize_llm_output` |
| Storage | `artifacts/prompt`, `response`, `candidate` then `apply-and-verify` |
| Identity | `pair_key = workspaceId\|filePath\|modelId\|variant` |

---

## 8. Multi-agent generation

**Runner:** `agents/ma_ref_study.py`  
**Graph:** `refactor_graph.build_ma_ref_graph` ≈ L48–98  
**Registry:** `agents/agent_registry.py` `PIPELINE_AGENTS`

### 8.1 LangGraph: yes

Nodes (MA study graph):  
`load → analyze → dependency_context → plan → llm_plan → feasibility → (refactor|report) → verify → ripple_verify → llm_verify → report`  
**No** `apply` / workspace write / compile nodes on MA graph (integrity: artifacts-only).

| Node | Kind | Role |
|------|------|------|
| load / analyze | static | Source + PMD smells |
| dependency_context | static | Same backend context as B0-V2 |
| plan | static | Rule planner |
| llm_plan | LLM | JSON plan |
| feasibility | static | Size gate |
| refactor | LLM | Generate candidate |
| verify | static | In-pipeline quality gates |
| ripple_verify | static | Shared `apply-and-verify` |
| llm_verify | LLM | Approve/reject review |
| report | static | Finalize metrics |

**State:** `pipeline` object (original, smells, candidate, dependency_context_text, steps, ripple_report, accept flags).  
**Retries:** `MA_MAX_ATTEMPTS_PER_PAIR` (default 3) via `record-candidate-outcome`.  
**Stop:** feasibility→report; llm_verify routes to report (not apply).  
**Variant:** fixed `MA` (no V1/V2).

### 8.2 Shared vs different

| Shared | Different |
|--------|-----------|
| Cohort files (MA imports from B0) | Generation: 1 chat vs LangGraph multi-LLM |
| Dependency context API | Prompt construction path |
| `applyAndVerify` measurement | MA adds agent_traces, llm_plan/verify meta |
| Models list (5 frontier) | MA orchestration=`multi_agent`, variant=`MA` |
| Risk / adoption logic | B0 also runs V1 ablation |

---

## 9. Candidate identity and artifact storage

### 9.1 Identity fields

| Field | Source |
|-------|--------|
| `study_id` | Study config |
| `project_id` | workspaceId |
| `file_path` | relative Java path |
| `model_id` | OpenRouter model string |
| `variant` | `V1` / `V2` / `MA` |
| `pair_key` | `workspaceId\|filePath\|modelId\|variant` (`candidateKey` ≈ L421–423) |
| Status | `completed`, `failed_parsing`, `failed_generation`, … |
| Attempt | MA: attempts in outcome recorder / `logs/ma_ref_attempts.jsonl` (integrity docs) |
| Artifact basename | `safeArtifactName` = sanitized `ws__path__model__variant` (≈ L2008–2014) |

No separate opaque `candidateId` UUID; **pair_key + artifact basename** isolate records.

### 9.2 Artifact directories (`createStudyLayout` ≈ L1545–1552)

Under `{studyRunsBase}/{studyId}/`:

| Dir / file | Content |
|------------|---------|
| `original_files/` | Original Java (once) |
| `prompts/` | Full SYSTEM+USER text (B0) |
| `model_responses/` | Raw LLM JSON/text |
| `generated_candidates/` | Candidate `.java` |
| `diffs/*_before.java`, `*_after.java` | Pair for audit / L5 backfill |
| `before_profiles/`, `after_profiles/` | Profile JSON |
| `ripple_reports/` | Full verification report |
| `behavioral_reports/`, `test_reports/` | L4 / L5 |
| `isolated_workspaces/{pairKey}/` | Sandbox for L3/L5 |
| `agent_traces/` | MA step logs |
| `dependency_contexts/` | Context packages |
| `results_candidates.csv` | Primary tabular export |
| `results_candidates.json` | JSON mirror |
| `config.json`, `study_state.json` | Config + selection + completed keys |

Mixing prevention: unique `pair_key` / basename; CSV append + reconcile `completedCandidates`/`failedCandidates`; MA refuses overwrite of completed rows (`recordCandidateOutcome` comment ≈ L688–691).

---

## 10. L1–L5 verification architecture

**Orchestrator:** `RippleRefStudyService.applyAndVerify` ≈ L457–686.

### L1 — Contract / dependency (`RippleRefRippleVerifier`)

Compares before/after profiles (and content for churn/changeStatus in `verifyWithContent` ≈ L216–244):

- public methods removed; public/protected signature changes; constructors; caller-used API removed/changed  
- imports / typeDependencies added/removed; fanOutDelta  
- annotations / extends / implements symmetric diff; packageChanged  
- smell before/after counts  

See §11 for risk Boolean logic.

### L2 — Caller impact (`RippleRefCallerImpactAnalyzer` ≈ L30–87)

- Callers = `beforeProfile.callerFiles`  
- For each caller file under **live workspace root** (not necessarily sandbox — comment ≈ L528–532): if caller still references a caller-used API method **and** that API key is missing on after profile → broken.  
- Matching: regex `Class.method(` or (known caller) `.method(` if class name present — **textual/regex**, not compile-based.

### L3 — Compilation (`RippleRefCompileProbe` ≈ L32–57)

- **Exists** in code.  
- Enabled only when `runMeta.compileProbe == true`.  
- Tools: `mvn -q -DskipTests compile` or `gradle(w) compileJava -q`.  
- Timeout 180s; statuses: `skipped|success|failed|timeout|error`.  
- Failure/timeout → `observedRiskLevel` at least Medium (`applyObservedImpact` ≈ L116–129).  
- Candidate applied into sandbox via `RippleRefWorkspaceSandbox`.

### L4 — Behavioral (`RippleRefBehavioralVerifier` ≈ L34–237)

Checks (regex counts / public API set): signature preservation; try/catch/throws; setName/@Override/@Test/ctors; if/ternary/switch; fail()/assert*.  
`behavioralCorrect` = all flags true and no errors.

### L5 — Targeted tests (`RippleRefTestProbe`)

- Discover: `{Class}Test`, `{Class}Tests`, `Test{Class}`, else module `mvn test`.  
- **Paired:** write original → run tests → write candidate → run tests (`probePaired` ≈ L106–159).  
- Maven only (`resolveMavenRoot`); timeout default 900s (`ripple.ref.test.timeout.sec`).  
- Statuses: success/failed/timeout/error/skipped; paired flags: regression, behaviorPreserved, baselineInconclusive.  
- **Not MA-only:** shared applyAndVerify; B0 uses env flag; MA `ripple_verify_ma` currently does **not** set `testProbe`/`compileProbe` in runMeta (L30–36) — L5 for MA typically via **backfill** scripts.

---

## 11. Risk-classification implementation

### 11.1 Labels that exist in code

| Label family | Values |
|--------------|--------|
| `riskLevel` / `contractRiskLevel` / `observedRiskLevel` | `Low`, `Medium`, `High` |
| `adoption_class` | `safe`, `risky`, `rejected`, `ripple_safe_behavior_uncertain`, `ripple_and_behavior_ok_tests_skipped`, `behavior_ok_tests_failed`, `behavior_ok_tests_inconclusive` |

### 11.2 Labels **not** implemented in RippleRef Java

`LOW-RISK`, `REVIEW-NEEDED`, `UNSAFE`, `INCONCLUSIVE` as risk enums — **not found** in `rippleref` package. Paper/export layers may map High→unsafe conceptually; code stores `High` / adoption strings.

### 11.3 Dependency delta and threshold `5`

```java
// RippleRefRippleVerifier.java L16, L172–177
private static final int LARGE_DEPENDENCY_DELTA = 5;

int depDelta = importsAdded.size() + importsRemoved.size()
    + typeDependenciesAdded.size() + typeDependenciesRemoved.size()
    + Math.abs(fanOutDelta);
if (depDelta >= LARGE_DEPENDENCY_DELTA) {
    reasons.add("large_dependency_delta:" + depDelta);
}
```

- **Hard-coded** constant `LARGE_DEPENDENCY_DELTA = 5`  
- **Not** env-configurable  
- Documented only as constant name / reason string prefix  
- Contributes a reason that is treated as **High** (see below)

### 11.4 Contract risk (`classifyContractRisk` ≈ L148–208) — faithful logic

```
reasons = []
if caller-used API removed or changed → reasons += caller_used_api_affected
if public/protected signature changed → …
if public API removed → …
if constructors changed → …
if annotations changed → …
if inheritance/interface changed → …
if package changed → …
if depDelta >= 5 → large_dependency_delta

if reasons non-empty:
  high = any reason starts with
    caller_used | public_or_protected | public_api | constructor |
    annotation | inheritance | package | large_dependency
  riskLevel = High if high else Medium
  return
else if imports changed or fanOutDelta≠0 or churn>0:
  riskLevel = Medium  # internal_dependency_or_import_change
else:
  riskLevel = Low
```

Note: with the current reason vocabulary, **any non-empty `reasons` list from the first block is High** (the Medium branch in that block is effectively unreachable).

### 11.5 Observed + final risk

```
# applyObservedImpact ≈ L94–133
if brokenCallerCount > 0 → observedRiskLevel = High
else → Low
if compile failed/timeout → observed at least Medium

# mergeFinalRisk ≈ L135–146
final = High if contract or observed is High
     else Medium if either Medium
     else Low
```

### 11.6 Relationship chain

```text
depDelta ≥ 5 → reason large_dependency_delta → contract High → final risk High
(no UNSAFE string; High is the terminal risk label in code)
```

### 11.7 Adoption class (related to “unsafe”)

`computeAdoptionClass` ≈ L240–281: High risk **or** broken callers → `risky`; parse fail → `rejected`; else behavior/tests refine `safe` / skip / fail classes.

---

## 12. Java extraction and normalization

**Class:** `RippleRefJavaProfileExtractor`

| Concern | Behavior |
|---------|----------|
| Visibility | Only `public` / `protected` methods & ctors extracted for APIs |
| Method names / return / params | Regex groups; params via `normalizeParams` (drop param names & annotations; keep type tokens) |
| Overloads | Distinct normalized signature strings |
| Generics | Kept in return type token; stripped from extends/implements type list (`replaceAll("<.*>","")`) |
| Arrays / varargs | Whatever appears in regex `[\w.<>\[\]]+`; varargs not specially modeled |
| Multiline signatures | **Fragile** — `[^)]*` assumes `)` on same pattern span |
| Nested classes | Declared names collected; primary class = first declared or filename |
| Inherited methods | **Not** resolved — only text in file |
| FQN vs simple | Imports as FQN strings; caller match uses simple class name / contains |
| Comparison | **Normalized text equality** of signature strings; “changed” = same method name key, different full string (`changedSignatures` ≈ L269–280) |
| AST / symbols | **No** |

---

## 13. Compilation and testing implementation

| Capability | Present? | Gate |
|------------|----------|------|
| L3 compile probe | **Yes** (`RippleRefCompileProbe`) | `runMeta.compileProbe` |
| L5 paired Maven tests | **Yes** (`RippleRefTestProbe.probePaired`) | `runMeta.testProbe` |
| B0 default | Both **off** (`RIPPLE_REF_*_PROBE` default `0`) | |
| MA graph default | runMeta **omits** both flags → L3/L5 not in-graph | Backfill scripts for L5 |
| Build tools | Maven preferred; Gradle compileJava supported for L3; L5 Maven-only | |

---

## 14. Export pipeline and schemas

### 14.1 Raw

- Per-candidate JSON under `ripple_reports/`, profiles, diffs  
- `results_candidates.csv` header (`StudyService` ≈ L2085):  
  `study_id,project_id,file_path,model_id,variant,pair_key,status,risk_level,contract_risk_level,observed_risk_level,verification_level,callers_checked,observed_broken_caller_count,compile_probe_status,behavioral_correct,adoption_class,test_probe_status,tests_passed,tests_failed,risk_reasons,…` plus MA columns (`orchestration`, `graph_version`, `multi_llm_agent_mode`, `agent_step_count`, `llm_plan_status`, `llm_verify_approved`, `static_verify_accept`, `cohort_id`, L5 before/after fields, churn, …)

### 14.2 Processed / workbooks

- Enrich: `scripts/enrich-ripple-study-csv-from-artifacts.py`  
- Export: `scripts/export-emse-ripple-master-excel.sh` → `web/app` `export:emse-ripple-master` → `.run/EMSE_*.xlsx`  
- Plan: `EMSE_EXCEL_EXPORT_PLAN.md` / `TSE/Excel_Export_Plan.md`

### 14.3 Missing / failed treatment

- Failed generation: status `failed_generation` / `failed_parsing`; risk fields may be empty or partial  
- L3/L5 skipped: null/empty probe status; adoption often `*_tests_skipped`  
- SP vs MA: MA rows carry orchestration/agent meta; B0 may lack those columns filled; `risk_reasons` JSON list vs export stringification can differ by enricher version — **schema drift possible across arms**

---

## 15. Configuration inventory

| Name | Default | Source | Env? | Consumed |
|------|---------|--------|------|----------|
| `randomSeed` | 42 | `StudyConfig` | script `RANDOM_SEED` | `selectFiles` |
| `filesPerRepository` | 5 pilot / 10 full | `applyScaleDefaults` | `FILES_PER_REPO` | selection |
| `minSmellCount` | 1 | StudyConfig | `MIN_SMELL_COUNT` | eligibility |
| `scale` | pilot \| full \| … | StudyConfig | create-study | defaults |
| `orchestration` | single_pass / multi_agent | StudyConfig | — | CSV meta, MA ensure |
| `models[]` | 5 OpenRouter IDs | StudyService.defaultModels / lib | — | runners |
| `LARGE_DEPENDENCY_DELTA` | **5** | Java constant | **no** | contract High |
| `RIPPLE_REF_COMPILE_PROBE` | 0 | env | yes | B0 runMeta |
| `RIPPLE_REF_TEST_PROBE` | 0 | env | yes | B0 runMeta |
| `RIPPLE_REF_MAX_OUTPUT_TOKENS` | 2500 | env | yes | max_tokens cap |
| LLM temperature (B0) | 0.4 | `call_ripple_ref_llm` | no | OpenRouter |
| `MULTI_LLM_AGENT_MODE` | full (MA) | env | yes | which LLM agents |
| `MA_MAX_ATTEMPTS_PER_PAIR` | 3 | env | yes | MA retries |
| Compile timeout | 180s | CompileProbe constant | no | L3 |
| Test timeout | 900s | system prop | `ripple.ref.test.timeout.sec` | L5 |
| Token budget | 25k LOC / 160k est tokens | ProductionClassifier | no | eligibility |
| Resume | true | runners | `RESUME` | skip completed keys |
| Study base path | `{workspaceTemp}/ripple_study_runs` | StudyService ctor | workspace temp | all artifacts |
| Ports | 8083/8091 | ports.env | yes | scripts |

---

## 16. Technical limitations visible from the implementation

1. Regex profiling misses many Java constructs (multiline signatures, nested visibility, true overloads with FQNs, inheritance).  
2. Caller detection has false positives/negatives (class name `contains`, instance `.method(`).  
3. L2 reads **live** workspace callers while candidate is not applied there — assumes callers unchanged; breakage inferred from API absence on candidate profile.  
4. `verify()` without content leaves churn at 0 (`splitLines` returns empty) — production path uses `verifyWithContent`.  
5. Large-repo smell fast-path can set smell=1 without PMD during selection.  
6. Candidate after-smell uses generic detector on temp file — path/context may differ from workspace analyze-live.  
7. L3/L5 off by default; MA graph does not enable them in `run_meta`.  
8. Contract “Medium” branch in first reason-block is effectively dead given reason prefixes.  
9. Output token cap 2500 may truncate large-file candidates.  
10. No JavaParser — paper claims of structural analysis must match regex semantics.

---

## 17. Questions that cannot be answered from the code alone

1. Which probe flags were set for each historical `ripple_ref_master` / `ma_ref_master` row (need CSV/`runMeta` audit).  
2. Exact PMD ruleset version and findings for every selected file at selection time (cache may have aged).  
3. Whether live workspace trees still match the frozen `diffs/*_before.java` used at verification.  
4. Completeness of CSV vs planned 150×5×variants / 150×5 MA (needs data reconcile, not code).  
5. How paper taxonomies `UNSAFE`/`LOW-RISK` map onto exported sheets (export TS may add derived columns — confirm in workbook builder, not RippleRef verifier).  
6. Empirical rate of Verify/graph failures and empty after-lists (runtime logs).  
7. OpenRouter actual model revisions behind model IDs at run time.

---

## Concise technical flow

```text
Repository
→ Profile (regex + DependencyAnalysisService + PMD counts)
→ Select files (stratified, seed 42 + workspace hash)
→ Construct dependency context (ContextBuilder → contextText)
→ Generate candidate (B0 single-prompt V1/V2 XOR LangGraph MA)
→ Parse candidate (```java``` extract + sanitize)
→ Build before/after profiles
→ Apply L1–L5 verification (applyAndVerify; L3/L5 optional)
→ Calculate risk labels (Low/Medium/High + adoption_class)
→ Export results (results_candidates.csv → enrich → EMSE/TSE Excel)
```

---

*End of read-only technical inspection.*
