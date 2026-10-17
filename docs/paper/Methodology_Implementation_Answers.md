# TSE Methodology — Implementation Answers (Compiled)

> **Package:** `TSE/` (IEEE TSE venue). Source snapshot of `.run/EMSE_METHODOLOGY_IMPLEMENTATION_ANSWERS.md`.

**Purpose.** Single reference file for rewriting the Methodology section of the TSE empirical paper on repository-level safety of LLM-generated Java refactoring candidates.

**Scope of inspection.** Project code, scripts, configs, prompts, integrity docs, and generated study outputs under `~/.refactai/workspaces/ripple_study_runs/` and `.run/`.

**Study naming (use consistently in the paper).**

| Paper term | Study condition | Study ID | Variant |
|------------|-----------------|----------|---------|
| Single-prompt (SP), dependency-aware | B0-V2 | `ripple_ref_master` | `V2` |
| Single-prompt ablation | B0-V1 | `ripple_ref_master` | `V1` |
| Multi-agent (MA) | P-MA | `ma_ref_master` | `MA` |

**Primary RQ3 contrast:** P-MA vs B0-V2 on `(project_id, file_path, model_id)`.

**Analysis workbook:** `.run/EMSE_RAW_MASTER_ALL_RQs.xlsx` (local study output; not shipped in this package)  
**Desktop export folder (when copied):** `$HOME/Desktop/EMSE-Data/EMSE_Master/`

For every question below, answers follow the required structure:
1. Implementation detail  
2. File / script / function  
3. Relevant output column names  
4. Limitations or missing data  

---

# 1. Repository profiling

## 1.1 Which parser / static-analysis tools are used to parse Java files?

### Implementation detail
Ripple-REF repository profiling does **not** use JavaParser, Spoon, or Eclipse JDT. Profiling is performed by a **custom regex-based static analyser** over raw Java source text. **PMD** is used only for **code-smell detection** (eligibility and smell counts), not for extracting packages, APIs, or dependency graphs.

### File / script / function
- `backend/server/src/main/java/ai/refact/server/service/rippleref/RippleRefJavaProfileExtractor.java` — `extract(...)`
- `backend/server/src/main/java/ai/refact/server/service/rippleref/RippleRefDependencyScanner.java` — `scan(...)`, `buildCallerIndex(...)`
- `backend/server/src/main/java/ai/refact/server/service/DependencyAnalysisService.java` — `analyzeProjectDependencies(...)`, `analyzeFileContent(...)`
- Smell path: `ComprehensiveCodeSmellDetector` (PMD), version pinned as `SMELL_ENGINE_VERSION = 5`
- Docs: `wiki/EMSE_Experimental_Setting.md` §5.2; `RIPPLE_REF_RESEARCH_INTEGRITY.md`

### Relevant output column names
Profile artifacts under `repository_profiles/`, `before_profiles/`, `after_profiles/`. Export fields derived from profiles include `public_api_count`, `fan_in`, `fan_out`, `caller_used_api_count`, `downstream_caller_count`, `has_inheritance`, `has_interface`.

### Limitations or missing data
No AST-accurate parser on the study path. Class comments mention “JDT/Spoon-ready” but that path is **not** wired into `RippleRefDependencyScanner`. Reflection, DI frameworks, and name collisions can produce false positives/negatives.

---

## 1.2 How are package declarations, classes, methods, constructors, imports, type dependencies, annotations, inheritance, interfaces, and method calls extracted?

### Implementation detail
`RippleRefJavaProfileExtractor.extract(filePath, content)` applies regular expressions:

| Construct | Extraction approach |
|-----------|---------------------|
| Package | `package …;` |
| Classes / interfaces / enums / records | Regex on `class` / `interface` / `enum` / `record` identifiers |
| Imports | `import …;` (wildcard imports skipped for type-dependency lists) |
| Annotations | Every `@Name` occurrence |
| Inheritance | `extends …` type list |
| Interfaces | `implements …` type list |
| Public / protected methods | Visibility + return type + name + parameters → signature strings |
| Constructors | `public` / `protected` constructor signatures |
| Method calls | Patterns `Receiver.method(` recorded as `"Receiver.method()"` |
| LOC | Counted via production-classifier helpers |
| `parseSuccess` | Non-empty declared types, **or** content contains `class` / `interface` |

**File-level type / dependency edges** (separate path in `DependencyAnalysisService.analyzeFileContent`):
1. Resolved imports → project `.java` paths (else synthetic `external/…` edges)
2. Extends / implements
3. Annotation types when resolvable in-project
4. Same-package qualifier types matching `\b([A-Z][A-Za-z0-9_]*)\s*\.`

### File / script / function
- `RippleRefJavaProfileExtractor.extract`
- Helpers: `primaryClassName`, `methodNameFromApi`, `formatMethod`, `normalizeParams`, `splitTypes`
- `DependencyAnalysisService.analyzeFileContent`, `findClassDependencies`, `findAnnotationDependencies`, `findQualifierTypeDependencies`

### Relevant output column names
Profile JSON fields: `packageName`, `declaredClasses`, `imports`, `annotations`, `extendsTypes`, `implementsTypes`, `publicApis`, `protectedApis`, `constructors`, `methodCalls`, `typeDependencies`, `parseSuccess`, `loc`.  
CSV / Excel: `public_api_count_before`, `caller_used_api_count_before`, and RQ1 sheet columns `public_api_count`, `has_inheritance`, `has_interface`, `loc`, `smell_count`.

### Limitations or missing data
Parameter names are stripped; annotation parameters on method params are simplified. Wildcard imports are ignored for type deps. Unresolved imports may inflate fan-out via synthetic external edges. Not a full semantic type resolution.

---

## 1.3 How are fan-in, fan-out, downstream callers, and caller-used APIs computed?

### Implementation detail

**Fan-out.**  
Size of the target file’s **outgoing** dependency set (imports + inheritance + annotation/qualifier type deps) from `FileDependencyAnalysis.getOutgoingDependencies()`.

**Fan-in.**  
Prefer `|reverseDependencyGraph.get(path)|`; otherwise incoming dependency count. Reverse graph is built by inverting A→B edges in `DependencyAnalysisService.analyzeProjectDependencies`.

**Downstream callers.**  
`RippleRefDependencyScanner.buildCallerIndex`:
1. Map primary class name (and FQN / simple name) → target file.
2. For each other production file, require that content mentions the class name.
3. For each public/protected API, test call-site regex match.
4. If any API matches, add the caller path to `callerFiles`.  
`downstreamCallerCount = callerFiles.size()`.

**Caller-used APIs.**  
Public/protected APIs of the target for which ≥1 other production file matches:
- always: `\bClassName\s*\.\s*method\s*\(` (word-boundary)
- if already a known caller: also instance-style `\.\s*method\s*\(`

Documented definition (`RIPPLE_REF_RESEARCH_INTEGRITY.md`): caller-used APIs are public/protected methods on T referenced via `ClassName.method(`; downstream callers may include same-package noise.

### File / script / function
- `RippleRefDependencyScanner.scan`, `buildCallerIndex`
- `RippleRefJavaProfileExtractor.isCallerUsingApi`, `isCallerUsingApiInKnownCaller`
- `RippleRefFileSelector.computeEligible` (copies counts onto eligible records)

### Relevant output column names
`fan_in`, `fan_in_before`, `fan_in_graph`, `fan_in_graph_corrected`, `fan_in_cohort_snapshot`;  
`fan_out`, `fan_out_before`, `fan_out_after`, `fan_out_delta`;  
`downstream_caller_count`, `downstream_caller_count_before`;  
`caller_used_api_count`, `caller_used_api_count_before`;  
profile fields `callerFiles`, `callerUsedApis`.

### Limitations or missing data
These are **file-level dependency edges + text-match callers**, not a precise AST call graph. No pointer analysis. Same-package noise possible. `fan_out_after` is often **0** in exports (known backfill gap: after-profiles do not reliably recompute fan-out). Prefer `fan_in_graph_corrected` for RQ1 where cohort snapshot fan-in was historically all zeros.

---

## 1.4 How is dependency-risk score computed?

### Implementation detail
In `RippleRefFileSelector.computeDependencyRisk(EligibleFile ef)`:

```text
dependencyRiskScore =
    fanIn × 0.4
  + callerUsedApiCount × 0.35
  + publicApiCount × 0.15
  + (hasInheritance ? 0.05 : 0)
  + (hasInterface ? 0.05 : 0)
```

Related **value score** (selection ranking, distinct from dependency risk), `computeValueScore`:

```text
valueScore =
    smellCount × 0.3
  + fanIn × 0.25
  + fanOut × 0.15
  + publicApiCount × 0.1
  + callerUsedApiCount × 0.15
  + downstreamCallerCount × 0.05
```

### File / script / function
`RippleRefFileSelector.computeDependencyRisk`, `computeValueScore`

### Relevant output column names
`file_dependency_risk_score`, `file_value_score` (sheet `8_RQ5_Raw_Factors`); also on eligible-file / selected-file records (`dependencyRiskScore`, `valueScore`).

### Limitations or missing data
Heuristic linear score for sampling priority, not a validated causal risk model. Weights are fixed in code, not data-driven.

---

# 2. Target selection

## 2.1 How are eligible production Java files identified?

### Implementation detail
Pipeline:
1. Classify paths as production vs excluded (`RippleRefProductionClassifier`).
2. Run dependency scan → per-file profiles + graph (`RippleRefDependencyScanner`).
3. Attach PMD smell counts per file.
4. Apply eligibility gates in `RippleRefFileSelector.computeEligible`.

**Eligibility gates.**
- `parseSuccess == true`
- Content within token budget (`withinTokenBudget`)
- Smell count ≥ **1** (`DEFAULT_MIN_SMELLS = 1`)
- Not completely inert: not (`fanIn + fanOut == 0` and empty public APIs and empty callers)
- Has at least one ripple signal: public/protected APIs, callers, annotations, or inheritance/interfaces

### File / script / function
- `RippleRefProductionClassifier`
- `RippleRefDependencyScanner.scan`
- `RippleRefFileSelector.computeEligible`
- Smell counts via workspace file analysis API / PMD detector

### Relevant output column names
`eligible_files.csv`; fields `parseable`, `withinTokenBudget`, `smellCount`, `fanIn`, `fanOut`, `publicApiCount`, `callerUsedApiCount`, `downstreamCallerCount`, `dependencyRiskScore`, `valueScore`.

### Limitations or missing data
Eligibility is smell-gated (≥1 PMD smell), so files with ripple exposure but zero detected smells are excluded by design.

---

## 2.2 Which files are excluded (tests, generated, build outputs, unparsable)?

### Implementation detail
`RippleRefProductionClassifier` excludes (among others):
- Test sources: `/src/test/`, `/test/java/`, `/tests/`, `*Test.java`, `*Tests.java`, Android test paths
- Generated: `/generated/`, `/gen/`
- Build outputs: `/build/`, `/target/`, similar build trees
- Default keep: under `/src/` and not classified as test

Unparsable files: `parseSuccess == false` → skipped in `computeEligible`.

### File / script / function
`RippleRefProductionClassifier` (`isProductionPath`, exclusion reason helpers such as `test_source`, `generated`)

### Relevant output column names
Repository scan summaries: `java_file_count`, `production_file_count`, `excluded_file_count` (`repositories.csv` / sheet `1_Selected_Systems`).

### Limitations or missing data
Path heuristics can misclassify unusual layouts. Exclusion reasons are not always joined onto every analysis row in the RQ Excel sheets.

---

## 2.3 How are the final 10 files per repository selected?

### Implementation detail
Fully automated **stratified sampling**:
- **10 files per repository**
- **15 repositories → 150 files**
- Random seed **`DEFAULT_SEED = 42`** (per-repo seed may include workspace hash offset as documented in experimental setting)

**Strata / buckets** (`stratifiedSample`):
- `high_fan_in` (fan-in ≥ 5)
- `medium_fan_in` (2–4)
- `low_fan_in` (0–1)
- `high_public_api` (public API count ≥ 5)
- `high_smell_high_dep` (smells ≥ 10 and fan-in+fan-out ≥ 3)
- Remaining slots: `random_eligible` / `random_fill`

For P-MA, the same 150 `(project_id, file_path)` pairs are imported from B0 via `cohort_manifest.json` with **no re-sampling**.

### File / script / function
- `RippleRefFileSelector.stratifiedSample`, `DEFAULT_SEED`
- Cohort freeze: `scripts/export-ripple-ref-cohort.sh`, `scripts/import-cohort-manifest-local.py`, `scripts/setup-ma-ref-master.sh`
- Integrity: `MA_RESEARCH_INTEGRITY.md` rule 1

### Relevant output column names
`selected_files.csv`: `project_id`, `file_path`, `sampling_group`, `selection_reason`, plus exposure fields.  
Excel: `2_Selected_Files`, `0_Project_ID_Map`.

### Limitations or missing data
Not a uniform random sample of all Java files; deliberately biased toward refactoring-relevant, ripple-exposed files. State this as intentional sampling for the study goal.

---

## 2.4 Is selection fully automated, manually inspected, or both?

### Implementation detail
**File selection is fully automated.** There is no human-in-the-loop step inside `stratifiedSample` / cohort import.

**Manual inspection** appears only as a planned **post-hoc audit** (≈10–15 cases: safe / risky / disputed) for validity checking of caller-used APIs and labels (`RIPPLE_REF_RESEARCH_INTEGRITY.md` analysis plan), not for choosing the 150 targets.

### File / script / function
`RippleRefFileSelector`; integrity docs; audit described as planned paper procedure (not an automated gate).

### Relevant output column names
`sampling_group`, `selection_reason`.

### Limitations or missing data
If a manual audit was not yet completed for the submission, say so explicitly; do not claim human selection of the cohort.

---

## 2.5 What ranking / scoring criteria are used?

### Implementation detail
1. Hard eligibility filters (parseable, smells, token budget, ripple signal).  
2. Stratification buckets (fan-in / public API / smell+dep).  
3. Within / across fill logic, **value score** and **dependency-risk score** support prioritisation (formulas in §1.4).

### File / script / function
`RippleRefFileSelector.computeEligible`, `computeValueScore`, `computeDependencyRisk`, `stratifiedSample`

### Relevant output column names
`valueScore` / `file_value_score`; `dependencyRiskScore` / `file_dependency_risk_score`; `sampling_group`; `selection_reason`.

### Limitations or missing data
Scores are heuristic. Exact per-bucket quotas are defined in selector code; report them as “stratified sampling with fixed seed 42” rather than claiming optimality.

---

# 3. Refactoring strategies

## 3.1 What exactly is the single-prompt strategy?

### Implementation detail
**One** OpenRouter chat completion per candidate, then the shared ripple verifier (`apply-and-verify`).

- **B0-V1:** original file + PMD smells + technique plan + preservation instructions; **no** dependency-context package (ablation).
- **B0-V2:** same as V1 **plus** serialized dependency-context package in the user prompt. This is the primary **single-prompt (SP)** arm for RQ2 and RQ3 pairing.

Orchestration label: `single_pass` / export `orchestration_label = single_prompt`.

### File / script / function
- `agents/ripple_ref_study.py` — `run_ripple_ref_candidate`, `build_v1_user_prompt`, `build_v2_user_prompt`
- `agents/main.py` — `call_ripple_ref_llm`
- `agents/llm_prompts.py` — `REFACTOR_SYSTEM_PROMPT`, V1/V2 system addenda
- HTTP: `POST /agents/ripple-ref/run-candidate`

### Relevant output column names
`variant` (`V1`/`V2`), `orchestration`, `study_arm`, `pair_key`, `status`, `prompt_tokens`, `completion_tokens`, `latency_ms`.

### Limitations or missing data
B0 is **not** multi-agent. Do not describe B0 as an agent workflow. `CURRENT_REFACTORING_PROMPT.md` is superseded; live prompts are the ripple-ref builders above.

---

## 3.2 What information is included in the prompt?

### Implementation detail
**V1 and V2 both include:**
- Detected smells and prioritised refactoring-technique instructions
- Full original Java source in a fenced code block
- Public API signatures to preserve
- Instruction to return one complete Java file in a single ` ```java ` block

**V2 additionally includes:**
- Dependency context package: target path, package, public/protected APIs, caller-used APIs, downstream callers, imports/type dependencies, annotations, inheritance/interfaces, fan-in/fan-out, and explicit preservation constraints

### File / script / function
`build_v1_user_prompt`, `build_v2_user_prompt`; smell listing helpers (`build_refactor_smell_listing`); dependency context from backend dependency-context API / `dependency_contexts/*.txt` (or JSON equivalents).

### Relevant output column names
Artifacts: `prompts/`, `dependency_contexts/`. Columns: `prompt_tokens`; MA has richer `agent_traces/` instead of a single prompt file pattern.

### Limitations or missing data
Prompt text length varies with file size and context size; truncated/long contexts are gated partly by Size Advisor in MA and by token-budget eligibility for selection.

---

## 3.3 What preservation constraints are given to the model?

### Implementation detail
Shared system expectations (`REFACTOR_SYSTEM_PROMPT`): preserve public method signatures; keep class/package/imports coherent; emit a complete file; prefer structural over cosmetic edits.

**V2 (and strong V1 language):** preserve public/protected APIs and behaviour; do not change package.  
**V2 “not allowed” constraints (implementation):** remove caller-used public/protected APIs; change public/protected signatures; change constructors used elsewhere; remove/change framework annotations; change package / extends / implements; introduce unnecessary dependency changes.  
**Allowed:** private helpers / internal simplification.

### File / script / function
`agents/llm_prompts.py`; V1/V2 system strings in `agents/ripple_ref_study.py`

### Relevant output column names
Not a separate column; enforced/checked post hoc via L1–L2 (`risk_reasons`, `risk_level`) and L4 (`behavioral_correct`).

### Limitations or missing data
Constraints are prompt-level instructions, not hard compiler-enforced contracts. Violation detection is static ripple verification after generation.

---

## 3.4 What exactly is the multi-agent / LangGraph workflow?

### Implementation detail
LangGraph state machine with `MULTI_LLM_AGENT_MODE=full`, graph version **2.0**, study `ma_ref_master`, single variant **`MA`**. Uses the **same** PMD smell detector, **same** dependency scanner data as B0-V2, and **same** `apply-and-verify` ripple path. Does not write into production workspaces (sandbox / no apply-to-live tree in study mode).

### File / script / function
- `agents/refactor_graph.py` — `build_ma_ref_graph`, `MA_GRAPH_VERSION = "2.0"`
- `agents/ma_ref_study.py` — `run_ma_ref_candidate`
- `agents/multi_llm_agent_config.py` — `MULTI_LLM_AGENT_MODE`
- `MA_RESEARCH_INTEGRITY.md`

### Relevant output column names
`orchestration` (`multi_agent`), `graph_version`, `multi_llm_agent_mode`, `agent_step_count`, `llm_plan_status`, `llm_verify_approved`, `static_verify_accept`, `cohort_id`.

### Limitations or missing data
MA has three LLM agents (plan, refactor, verify) plus static agents; token/latency cost is higher than B0. Do not claim MA re-samples files.

---

## 3.5 What are the agent / stage names and responsibilities?

### Implementation detail

| Stage (`node_id`) | Display name | Kind | Responsibility |
|-------------------|--------------|------|----------------|
| `load` | File Loader | static | Load frozen baseline file |
| `analyze` | Code Smell Detector | static | PMD smells (same path as B0) |
| `dependency_context` | Dependency Context Agent | static | Same dependency facts as B0-V2 |
| `plan` | Refactoring Planner | static | Rule-based smell → technique mapping |
| `llm_plan` | LLM Planning Agent | llm | JSON plan (no code) |
| `feasibility` | Size Advisor | static | Size / token gate |
| `refactor` | LLM Refactoring Agent | llm | Generate candidate Java |
| `verify` | Quality Verifier | static | Static verification gates |
| `ripple_verify` | Ripple Risk Verifier | static | Shared L1–L2(+L4) apply-and-verify |
| `llm_verify` | LLM Verification Agent | llm | Approve/reject with rationale (JSON) |
| `report` | Analysis Reporter | static | Persist metrics / traces |

**Flow:**  
`load → analyze → dependency_context → plan → llm_plan → feasibility → refactor → verify → ripple_verify → llm_verify → report`

### File / script / function
`agents/agent_registry.py` (`PIPELINE_AGENTS`); node runners under `agents/refactor_nodes/` (including `ripple_verify_ma.py`); graph wiring in `refactor_graph.py`.

### Relevant output column names
`agent_traces/{pair_key}.json` with `steps[]`, `nodeTrace`, `graphVersion`; CSV fields listed in §3.4.

### Limitations or missing data
On disk after TMPDIR recovery, many MA candidates have CSV metrics restored from Excel while only a subset retain full `agent_traces/` / `ripple_reports/` files. For the paper, treat CSV as primary outcome store; traces support process claims for candidates that retain artifacts.

---

## 3.6 Does the multi-agent workflow revise candidates after verification? How many retries?

### Implementation detail
- **No in-graph revision loop** after `llm_verify`. Rejection flips acceptance; it does **not** automatically re-invoke `refactor`.
- **Identical-output generation retries** inside the refactor step: `max_retries = 2` → up to **3 generation attempts** (appends retry notes).
- **Study-level pair retries** for non-terminal failures: `MA_MAX_ATTEMPTS_PER_PAIR` default **3**, logged in `logs/ma_ref_attempts.jsonl`. Terminal `failed_*` is written after max attempts; **completed rows are never overwritten**.

### File / script / function
- `agents/refactor_pipeline.py` — `run_refactor` retries
- `agents/ma_ref_study.py` — `MA_MAX_ATTEMPTS_PER_PAIR`
- Backend: `RippleRefStudyService.recordCandidateOutcome`

### Relevant output column names
`status`, `error`, `llm_verify_approved`, `static_verify_accept`; attempt log JSONL fields (`pairKey`, `at`, …).

### Limitations or missing data
Do not claim “iterative repair until ripple-safe.” Claims should be: separate verification stage + limited generation retries + study-level re-attempts, without graph-level repair loops.

---

# 4. Model and run settings

## 4.1 Which five LLMs are used? Exact model identifiers

### Implementation detail
1. `google/gemini-3.1-pro-preview`  
2. `openai/gpt-5.5`  
3. `anthropic/claude-opus-4.8`  
4. `deepseek/deepseek-v4-pro`  
5. `qwen/qwen3.6-plus`  

Older alias `qwen/qwen-3.6-plus` is normalized to `qwen/qwen3.6-plus`.

### File / script / function
`scripts/ripple-ref-lib.sh` — `ripple_ref_default_models_json()`, `ripple_ref_model_ids()`  
`agents/llm_provider_config.py` — `normalize_openrouter_model()`

### Relevant output column names
`model_id`, `model_short`.

### Limitations or missing data
Model IDs are provider-routed OpenRouter slugs; availability can change over time. Use the exact strings from the study config / CSV.

---

## 4.2 Which provider / router is used?

### Implementation detail
**OpenRouter** (`https://openrouter.ai/api/v1/chat/completions`). Each study model entry sets `apiRoute: "openrouter"`. Routing controlled by `LLM_ROUTING` (`openrouter` / `auto` / `direct`).

### File / script / function
`agents/llm_client.py` — `chat_completion`  
`agents/llm_provider_config.py` — `openrouter_url()`, `routing_mode()`, `resolve_transport()`  
Docs: `agents/OPENROUTER_SETUP.md`, `agents/.env.example`

### Relevant output column names
Not a dedicated CSV column; implied by `model_id` OpenRouter-style IDs and study config.

### Limitations or missing data
API keys and account quotas are environment secrets; do not put keys in the paper. Rate limits caused some historical failures (e.g., Qwen slug / quota issues), later repaired.

---

## 4.3 Temperature, max tokens, retry policy, timeout, and output format

### Implementation detail

| Setting | Value |
|---------|--------|
| Refactor temperature (B0 + MA refactorer) | **0.4** |
| MA planner temperature | **0.2** |
| MA verifier temperature | **0.1** |
| Refactor max tokens | LOC-scaled via `compute_refactor_max_tokens`, capped by env `RIPPLE_REF_MAX_OUTPUT_TOKENS` (default **2500**) |
| Planner / verifier max tokens | 4096 / 2048 |
| Refactor timeout | LOC-banded via `compute_refactor_timeout` (typically 480–3600 s) |
| Planner / verifier timeout | 120 s |
| Identical-output retries | max 2 → **3** generation attempts |
| MA pair attempts | default **3** |
| Candidate HTTP timeout | `CANDIDATE_TIMEOUT_SEC` default **600** |
| Study curl timeout | `RIPPLE_REF_CURL_TIMEOUT_SEC` default **3600** |
| Refactor output format | Complete Java file in one ` ```java ` fence |
| Planner / verifier format | JSON only |

### File / script / function
`call_ripple_ref_llm`, `call_llm_refactor`, `call_llm_planning_agent`, `call_llm_verification_agent`; helpers `compute_refactor_max_tokens`, `compute_refactor_timeout`; `ripple_ref_run_candidate` in `scripts/ripple-ref-lib.sh`.

### Relevant output column names
`latency_ms`, `prompt_tokens`, `completion_tokens`, `error`, `status`.

### Limitations or missing data
Env overrides (e.g., lowered `RIPPLE_REF_MAX_OUTPUT_TOKENS`) were used during recovery; report the study defaults and note any documented overrides if claiming exact token caps for all runs.

---

## 4.4 Are the same settings used for all models and both strategies?

### Implementation detail
- **All five models:** same refactor temperature (0.4), same OpenRouter routing, same max-token/timeout helpers for the refactor call.
- **Both strategies:** refactor LLM call settings are aligned (0.4, shared helpers).
- **Not identical end-to-end:** P-MA adds planner (0.2) and verifier (0.1) LLM calls plus static/ripple agents; B0 is one LLM call then verify.

### File / script / function
Same as §4.3; contrast documented in `wiki/EMSE_Experimental_Setting.md` and `MA_RESEARCH_INTEGRITY.md`.

### Relevant output column names
`variant`, `orchestration`, `agent_step_count`, token/latency columns.

### Limitations or missing data
Do not claim “identical compute cost” across strategies; claim “same models, same verifier, comparable refactor generation settings.”

---

# 5. Candidate generation and storage

## 5.1 Where are originals, candidates, prompts, responses, metadata, diffs, profiles, and verification reports stored?

### Implementation detail
Study root (persistent EMSE layout):

```text
~/.refactai/workspaces/ripple_study_runs/{ripple_ref_master|ma_ref_master}/
```

| Content | Path |
|---------|------|
| Master table | `results_candidates.csv`, `results_candidates.json` |
| Config / state | `config.json`, `study_state.json`, `completeness_report.json` |
| Original / generated | `original_files/`, `generated_candidates/` |
| Diffs | `diffs/*_before.java`, `diffs/*_after.java` |
| Prompts / responses (B0) | `prompts/`, `model_responses/` |
| MA traces | `agent_traces/`, `planner_json/`, `verifier_json/` |
| Profiles | `before_profiles/`, `after_profiles/`, `repository_profiles/` |
| Dependency contexts | `dependency_contexts/` |
| Ripple / L4 / L5 reports | `ripple_reports/`, `behavioral_reports/`, `test_reports/` |
| Sandboxes (L3/L5) | `isolated_workspaces/` |
| MA cohort lock | `cohort/cohort_manifest.json` |
| MA attempts | `logs/ma_ref_attempts.jsonl` |

Paper export: `.run/EMSE_RAW_MASTER_ALL_RQs.xlsx` (+ Desktop `EMSE-Data/EMSE_Master/` when copied).

### File / script / function
`RippleRefStudyService.createStudyLayout`, `applyAndVerify`, CSV writers; export `scripts/export-emse-ripple-master-excel.sh`, `web/app/app/lib/buildEmseRippleMasterExcel.ts`.

### Relevant output column names
Full CSV header (`RippleRefStudyService.CANDIDATE_CSV_HEADER`):

```text
study_id, project_id, file_path, model_id, variant, pair_key, status,
risk_level, contract_risk_level, observed_risk_level, verification_level,
callers_checked, observed_broken_caller_count, compile_probe_status,
behavioral_correct, adoption_class, test_probe_status, tests_passed, tests_failed,
risk_reasons, smell_before, smell_after, fan_in_before, fan_out_before,
fan_out_after, fan_out_delta, caller_used_api_count_before, public_api_count_before,
latency_ms, prompt_tokens, completion_tokens, error, completed_at,
orchestration, graph_version, multi_llm_agent_mode, agent_step_count,
llm_plan_status, llm_verify_approved, static_verify_accept, cohort_id,
test_probe_before_status, tests_passed_before, tests_failed_before,
test_regression, test_probe_strategy, downstream_caller_count_before,
lines_added, lines_removed, churn, methods_added, methods_removed
```

### Limitations or missing data
After TMPDIR wipe / restore, CSV outcomes were restored for MA (750 rows) even when many per-candidate artifact files were missing. Prefer CSV + Excel for outcome analysis; disclose incomplete artifact retention if claiming full replication of every JSON report.

---

## 5.2 How many candidates were planned and completed for each strategy?

### Implementation detail
Planned formula: `files × models × variantCount`.

| Arm | Planned | Completed (`status=completed`) in persistent CSV |
|-----|---------|--------------------------------------------------|
| B0-V2 (SP primary) | 150 × 5 = **750** | **750** |
| B0-V1 (ablation) | 750 | **583** completed (593 rows total; some `failed_parsing`) |
| P-MA | 150 × 5 = **750** | **750** |

### File / script / function
`RippleRefStudyService.completeness` / `plannedRuns`; CSVs under study dirs; Excel `Completeness_Summary`.

### Relevant output column names
`status`, `variant`; completeness metrics in export sheets.

### Limitations or missing data
B0-V1 is incomplete relative to plan; it is **not** required for the headline RQ3 contrast. Report attrition honestly for V1 if used as sensitivity analysis.

---

## 5.3 How many complete paired SP-vs-MA cases exist?

### Implementation detail
Pairing key: `(project_id, file_path, model_id)` with B0-V2 completed **and** MA completed.  
**Complete pairs: 750 / 750.**

Use Excel sheet **`RQ3_Paired_750_Stats`** (includes `delta_high_risk`, `delta_broken_callers`).

### File / script / function
Export builder: `loadStudyData` RQ3 join in `buildEmseRippleMasterExcel.ts`; integrity pairing rule in `RIPPLE_REF_RESEARCH_INTEGRITY.md` / `MA_RESEARCH_INTEGRITY.md`.

### Relevant output column names
`paired_complete`, `b0_status`, `ma_status`, `b0_risk_level`, `ma_risk_level`, `b0_high_risk`, `ma_high_risk`, `b0_broken_callers`, `ma_broken_callers`, `delta_high_risk`, `delta_broken_callers`, `pair_key_b0`, `pair_key_ma`.

### Limitations or missing data
Earlier exports briefly had 749 pairs until the last DeepSeek B0-V2 `MyTokenizer.java` failure was re-run. Current persistent data is 750/750.

---

## 5.4 How are failed, incomplete, unparsable, or rejected candidates handled?

### Implementation detail
- Prefer writing a CSV row even on failure.
- Parse / bad generation → `status=failed_parsing` (or related `failed_*`); adoption often `rejected`.
- MA: retry up to `MA_MAX_ATTEMPTS_PER_PAIR` (default 3); then terminal failure; **never overwrite `completed`**.
- Resume skips completed pair keys only.
- Incomplete pairs excluded from RQ3 inferential tests; retained in raw exports and completeness reporting.
- Lists `completedCandidates` / `failedCandidates` reconciled from CSV on load.

### File / script / function
`RippleRefStudyService.recordCandidateOutcome`, `reconcileCandidateListsFromCsv`, `completeness`; MA attempt logging.

### Relevant output column names
`status`, `error`, `adoption_class`, `completed_at`.

### Limitations or missing data
Some infrastructure failures may have been retried later; treat final CSV status as ground truth for analysis inclusion rules.

---

# 6. Safety and verification

## 6.1 What exact checks define contract risk?

### Implementation detail
**Level 1 (L1):** static before/after profile diff on the target file only.

**High contract reasons** (any one suffices) include:
- `caller_used_api_affected`
- `public_or_protected_signature_changed`
- `public_api_removed`
- `constructor_signature_changed`
- `annotation_changed`
- `inheritance_or_interface_changed`
- `package_changed`
- `large_dependency_delta` — imports ± typeDeps ± |fanOutDelta| ≥ **5**

**Medium:** internal import / fan-out / churn-style dependency change only (`internal_dependency_or_import_change`).  
**Low:** no caller-API change / small dependency delta (`no_caller_api_change`, `small_dependency_delta`).

### File / script / function
`RippleRefRippleVerifier.verify` / `verifyWithContent` / `classifyContractRisk`

### Relevant output column names
`contract_risk_level`, `risk_reasons`, edit metrics `lines_added`, `lines_removed`, `churn`, `methods_added`, `methods_removed`.

### Limitations or missing data
Contract risk is static and target-file-centric; it does not prove behavioural equivalence.

---

## 6.2 What exact checks define observed / caller-impact risk?

### Implementation detail
**Level 2 (L2):** for each pre-identified downstream caller file, if the caller still references a **caller-used API** that is **absent** from the after profile’s public/protected API keys, count a broken caller.

- `observedBrokenCallerCount > 0` → `observed_risk_level = High` (+ reason `observed_caller_breakage:N`)
- else → `observed_risk_level = Low`

### File / script / function
`RippleRefCallerImpactAnalyzer.analyze`; applied in `RippleRefRippleVerifier.applyObservedImpact`

### Relevant output column names
`observed_risk_level`, `observed_broken_caller_count`, `callers_checked`, `verification_level`.

### Limitations or missing data
Integrity documentation describes applying the candidate in an isolated full-repo sandbox for L2. In the implementation, L2 uses pre-identified callers and after-profile API presence; full sandboxes are primarily created when compile/test probes are enabled. Disclose this construct-validity nuance.

---

## 6.3 How are Low, Medium, and High risk assigned?

### Implementation detail
```text
risk_level = max(contract_risk_level, observed_risk_level)
```
with ordering **High > Medium > Low** (`mergeFinalRisk`).

Integrity summary table:
- **High:** broken caller OR caller-used API removed/changed OR public/protected signature / constructor / annotation / inheritance / package change OR large dependency delta
- **Medium:** internal/import/fan-out only; no L2 breakage
- **Low:** no contract change; no observed caller breakage

Optional L3 compile failure can raise observed risk to Medium (unless already High); it does not alone define High ripple in the primary rules.

### File / script / function
`RippleRefRippleVerifier.mergeFinalRisk`; rules also in `RIPPLE_REF_RESEARCH_INTEGRITY.md`

### Relevant output column names
`risk_level`, `contract_risk_level`, `observed_risk_level`, `is_high_risk` (export 0/1).

### Limitations or missing data
Always report both contract and observed levels; final `risk_level` alone hides which evidence dominated.

---

## 6.4 What exact rules define Low-risk, Review-needed, Unsafe, and Inconclusive adoption labels?

### Implementation detail
**Important:** those four informal names are **not** the CSV enums. The implementation uses the following labels in `RippleRefBehavioralVerifier.computeAdoptionClass` (priority order):

| Implementation label | Rule |
|----------------------|------|
| `rejected` | `!parseSuccess` or change status failed |
| `risky` | `risk_level == High` **or** `observedBrokenCallerCount > 0` |
| `ripple_safe_behavior_uncertain` | Ripple not high/broken; L4 `behavioralCorrect == false` |
| `ripple_and_behavior_ok_tests_skipped` | L4 OK; tests null / not attempted / skipped / no tests |
| `behavior_ok_tests_inconclusive` | Paired L5 baseline/after inconclusive |
| `behavior_ok_tests_failed` | L5 regression / fail / non-preserved |
| `safe` | L4 OK and L5 preserved (or applicable non-paired success) |

**Suggested paper mapping (if informal terms are kept in prose):**
- Low-risk → `safe`
- Review-needed → `ripple_safe_behavior_uncertain` and/or `ripple_and_behavior_ok_tests_skipped`
- Unsafe → `risky`
- Inconclusive → `rejected` and/or `behavior_ok_tests_inconclusive`

**Always publish the code labels as primary.**

### File / script / function
`RippleRefBehavioralVerifier.computeAdoptionClass`; L4 heuristics in `verify`; docs in `RIPPLE_REF_RESEARCH_INTEGRITY.md` and `L5_BEHAVIORAL_TESTING_PAPER_REFERENCE.md`

### Relevant output column names
`adoption_class`, `behavioral_correct`.

### Limitations or missing data
Integrity doc’s adoption table omits `behavior_ok_tests_inconclusive`, which exists in code. L5 outcome taxonomies (Preserved / Regression / Skipped) are separate from `adoption_class`—report both when discussing tests.

---

## 6.5 Which verification levels are uniformly available, and which are supplementary only?

### Implementation detail

| Level | Name | Uniform on completed candidates? | Role |
|-------|------|----------------------------------|------|
| L1 | Contract / dependency diff | **Yes** | Primary for RQ2–RQ5 |
| L2 | Caller-impact | **Yes** (when parse succeeds) | Primary |
| L3 | Compile probe | **No** (opt-in) | Supplementary |
| L4 | Behavioural heuristics | **Yes** | Advisory / screening |
| L5 | Paired Maven tests | **No** (opt-in / backfill) | Supplementary / eligible cohort |

### File / script / function
`RippleRefStudyService.applyAndVerify`; experimental setting docs.

### Relevant output column names
`verification_level`; L3 `compile_probe_status`; L4 `behavioral_correct`; L5 `test_probe_*`, `l5_preserved`, `l5_regression`, `l5_test_eligible`.

### Limitations or missing data
Do not claim L3/L5 for every candidate. Primary inferential claims should rest on L1–L2 (+ report L4/L5 coverage).

---

## 6.6 Are compile / build / test checks actually run? If yes, how and when?

### Implementation detail
**Yes, but not uniformly at generation time.**

- **L3 compile:** `RippleRefCompileProbe.probe` runs `mvn -q -DskipTests compile` or Gradle `compileJava` (timeout ~180s) when `compileProbe=true`. B0/MA generation defaults leave this **off** unless env flags (`RIPPLE_REF_COMPILE_PROBE=1`) are set.
- **L5 tests:** `RippleRefTestProbe.probePaired` runs Maven tests (`targeted` with `-Dtest=…`, or module-level, or `none`) when `testProbe=true` (timeout ~900s), paired original→candidate in sandbox. Often applied later via **backfill** (`scripts/backfill-ripple-ref-test-probe.sh`) replaying saved `diffs/*_after.java` **without** re-calling the LLM.

Many OSS repositories fail offline builds; such failures are recorded and must not be conflated as the sole definition of High ripple risk.

### File / script / function
`RippleRefCompileProbe`, `RippleRefTestProbe`, `RippleRefWorkspaceSandbox`; backfill scripts and `L5_BEHAVIORAL_TESTING_PAPER_REFERENCE.md`.

### Relevant output column names
`compile_probe_status`, `test_probe_strategy`, `test_probe_status`, `test_probe_before_status`, `test_regression`, `tests_passed`, `tests_failed`, `tests_passed_before`, `tests_failed_before`.

### Limitations or missing data
Large fractions may have `test_probe_strategy=none` (no discoverable tests / no Maven module). Treat L5 as available for an eligible subset.

---

# 7. RQ5 modelling support

## 7.1 Which columns / features are available?

### Implementation detail
Best sheet: **`8_RQ5_Raw_Factors`** in `EMSE_RAW_MASTER_ALL_RQs.xlsx` (built from completed B0-V2 + MA rows plus file metadata).

| Category | Columns / features |
|----------|-------------------|
| Nesting IDs | `project_id`, `repository_name`, `repo_folder`, `file_path`, `file_name`, `pair_key` |
| Model | `model_id`, `model_short` |
| Strategy / orchestration | `variant` (`V2`/`MA`), `orchestration`, `orchestration_label` (`single_prompt`/`multi_agent`), `study_arm`, `study_id` |
| File-level exposure | `file_fan_in_graph`, `file_fan_in_cohort`, `file_fan_out`, `file_public_api_count`, `file_caller_used_api_count`, `file_downstream_caller_count`, `file_dependency_risk_score`, `file_value_score`, `file_loc`, `file_smell_count`, `sampling_group` |
| Edit magnitude | `lines_added`, `lines_removed`, `churn`, `methods_added`, `methods_removed`, `net_loc_delta` |
| Smell delta | `smell_before`, `smell_after`, `smell_delta` |
| API / dependency change | `fan_in_before`, `fan_out_before`, `fan_out_after`, `fan_out_delta`, `caller_used_api_count_before`, `public_api_count_before`, `downstream_caller_count_before`, `risk_reasons` |
| Behavioural / L5 indicators | `behavioral_correct`, `l5_test_eligible`, `l5_preserved`, `l5_regression`, `test_probe_strategy`, `test_probe_status`, `test_regression` |
| Unsafe / risk labels | `risk_level`, `is_high_risk`, `adoption_class`, `observed_broken_caller_count`, `contract_risk_level`, `observed_risk_level` |
| Cost | `latency_ms`, `prompt_tokens`, `completion_tokens` |

### File / script / function
`web/app/app/lib/buildEmseRippleMasterExcel.ts` — RQ5 enrichment in `loadStudyData`; CSV from `RippleRefStudyService`.

### Relevant output column names
See table above (75 columns on `8_RQ5_Raw_Factors` in the current export).

### Limitations or missing data
RQ5 is **exploratory** by study design. `fan_out_after` often 0. L3 often empty. L5 often skipped. Prefer `is_high_risk` or `risk_level` as primary outcomes; interpret `adoption_class` carefully.

---

## 7.2 Are candidates nested by project / file for grouped or mixed-effects analysis?

### Implementation detail
**Yes.** Natural hierarchy:

```text
project_id
  └── file_path
        └── candidate (model_id × orchestration/variant)
```

Multiple candidates share projects and files. RQ3 pairs align on `(project_id, file_path, model_id)`. This supports:
- Cluster-robust SEs by `project_id` or `file_path`
- GEE / mixed-effects models with random intercepts for project and/or file
- Stratification by `sampling_group` and repository

### File / script / function
Study design docs; export keys in RQ3/RQ4/RQ5 sheets; integrity pairing rules.

### Relevant output column names
`project_id`, `file_path`, `model_id`, `variant`, `orchestration_label`, `sampling_group`, `pair_key`.

### Limitations or missing data
With 15 projects, project-level random effects are estimable but clusters are few; report ICC/sensitivity. Do not treat candidates as fully i.i.d.

---

# Appendix A — Recommended paper wording guards

1. Profiling tool = **custom regex analyser + PMD smells**; not JavaParser/Spoon/JDT.  
2. SP primary = **B0-V2**; MA = **P-MA**; V1 = ablation only.  
3. MA does **not** re-sample the 150 files.  
4. Same ripple verifier for both arms.  
5. L1–L2 primary; L3/L5 supplementary.  
6. Adoption labels = **code enums**, not invented Low-risk/Unsafe strings.  
7. Complete SP–MA pairs = **750**.  
8. State regex caller/dependency limitations + planned/completed manual audit honestly.

---

# Appendix B — Key source index

| Topic | Primary sources |
|-------|-----------------|
| Profiling | `RippleRefJavaProfileExtractor.java`, `RippleRefDependencyScanner.java`, `DependencyAnalysisService.java` |
| Selection | `RippleRefFileSelector.java`, `RippleRefProductionClassifier.java` |
| SP prompts | `agents/ripple_ref_study.py`, `agents/llm_prompts.py` |
| MA graph | `agents/refactor_graph.py`, `agents/agent_registry.py`, `agents/ma_ref_study.py` |
| Models | `scripts/ripple-ref-lib.sh` |
| Verify / risk / adoption | `RippleRefRippleVerifier.java`, `RippleRefCallerImpactAnalyzer.java`, `RippleRefBehavioralVerifier.java` |
| Compile / tests | `RippleRefCompileProbe.java`, `RippleRefTestProbe.java` |
| Integrity | `RIPPLE_REF_RESEARCH_INTEGRITY.md`, `MA_RESEARCH_INTEGRITY.md`, `.run/EMSE_Research_Questions.md` |
| Experimental setting | `wiki/EMSE_Experimental_Setting.md` |
| L5 paper notes | `L5_BEHAVIORAL_TESTING_PAPER_REFERENCE.md` |
| Analysis export | `.run/EMSE_RAW_MASTER_ALL_RQs.xlsx` |

---

# Appendix C — Sheet map for analysis

| RQ | Sheet in `EMSE_RAW_MASTER_ALL_RQs.xlsx` |
|----|----------------------------------------|
| Project names | `0_Project_ID_Map` |
| RQ1 | `3_RQ1_Raw_Exposure` |
| RQ2 | `4_RQ2_Raw_B0_V2` |
| MA arm | `5_MA_Raw_PMA` |
| RQ3 stats | `RQ3_Paired_750_Stats` |
| RQ4 | `7_RQ4_Raw_By_Model` |
| RQ5 | `8_RQ5_Raw_Factors` |
| Completeness | `Completeness_Summary` |

---

*Compiled for TSE Methodology rewriting from the RefactAI Ripple-REF / MA-REF implementation and persistent study exports.*
