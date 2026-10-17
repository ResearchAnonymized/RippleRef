# Metric and smell computation reference (RefactAI)

This document is for **research reporting** and **reproducibility**. It describes **how numbers in the UI and in refactoring reports are produced**, which components implement them, and **known limitations** of heuristic detectors.

**Related code (authoritative sources):**

| Concern | Primary implementation |
|--------|-------------------------|
| Java code smells (dashboard, `analyze-file`, `analyze-live`) | `backend/server/.../ComprehensiveCodeSmellDetector.java` |
| File-level quality metrics in enhanced analysis API | `backend/server/.../EnhancedAnalysisService.java` |
| Refactoring report: smell counts, score, research metrics | `agents/refactoring_analysis.py`, `agents/code_metrics.py`, `agents/main.py` |

---

## 1. Code smells (Java static detector)

### 1.1 Where smells come from

For a workspace Java file, smells are produced by **`ComprehensiveCodeSmellDetector.detectAllCodeSmells(Path, boolean capped)`**. The detector reads the file as text, runs several **layered** strategies, merges results, then optionally **filters and caps** them.

- **`capped = true` (default for normal workspace analysis):** After detection, `validateAndCleanSmells` may **drop some types entirely as false positives**, then **keep at most 3–5 instances per smell type** (by severity), and apply a **hard cap** on total smells (see §1.5).
- **`capped = false` (used for independent before/after comparison via `analyze-live`):** Skips per-type and hard caps so **totals reflect all heuristic hits** (still subject to false-positive filtering in step 1).

The UI **“Detected Code Smells”** table shows **type, location, evidence** derived from each `CodeSmell`’s title, description, and line metadata. When the backend cannot infer a line, the frontend may show a generic location placeholder.

### 1.2 Layers of detection

1. **Class-level** (`detectClassLevelSmells`): e.g. large class (line count vs threshold), feature envy (ratio of method calls to field accesses), data class (fields vs methods), lazy class (small file + few methods).
2. **Method-level** (`detectMethodLevelSmells`): long methods, many parameters, complexity hints, etc. (see source for thresholds).
3. **Structure / design / concurrency / testability** blocks: aggregate patterns (comments ratio, dead code markers, switches, magic numbers, thread safety heuristics, etc.).
4. **Line-by-line heuristics** (`detectIndividualLineSmells` / comprehensive line scan): many smells are raised **per line** when a **regular expression** or keyword matches that line.

Layer 4 is **high recall, lower precision**: it is intended to surface many candidate issues for tooling and research, not to match a canonical Fowler catalog one-to-one.

### 1.3 Examples of line-level rules (as implemented)

These are **directly tied** to strings you may see in the **Evidence** column:

| UI label / type (typical) | Trigger (simplified) | Evidence text pattern |
|---------------------------|----------------------|-------------------------|
| **Unused import** (`UNUSED_IMPORT`) | Line matches `import ...;` | “Line *n* has import statement” — **Note:** this flags the **presence** of an import line, not a separate unused-symbol analysis against the compilation unit. Treat as **heuristic**, not definitive unused-import analysis. |
| **Message chains** (`MESSAGE_CHAINS`) | Line matches `\w+\.\w+` (two identifiers separated by a dot) | “Line *n* contains static access” — **Note:** this pattern matches **many** benign Java forms (e.g. `obj.method()`, package-qualified names). The smell type name does not strictly match classic “message chains”; the implementation uses **broad dot access** as a proxy. |
| **Primitive obsession** (`PRIMITIVE_OBSESSION`) | Line matches arithmetic operators among other rules | “Line *n* contains arithmetic operation” — **Note:** arithmetic is used as a **weak proxy** for primitive-heavy logic, not a full data-modeling assessment. |
| **Logical operation** (stored under types such as `SWITCH_STATEMENTS` in some branches) | `&&` or `\|\|` on the line | “contains logical operation” |
| **Array access**, **casts**, **`instanceof`**, **`new`**, **null checks** | Regex on line | Various “Line *n* contains …” strings |

Always cite in the paper that **detector labels are implementation-defined** and that **several rules are intentionally coarse** for coverage in an LLM-assisted workflow.

### 1.4 Testability: “Missing test coverage” / hard-to-test

In **`detectTestabilitySmells`**:

- **“Hard-to-Test Code”** (`MISSING_COVERAGE` / `SmellType.MISSING_COVERAGE`): Raised when `isHardToTest(content)` is true: **`static` appears anywhere in the file** **OR** the count of `new` object creations (pattern-based) **exceeds 5**. Description: *“Code has characteristics that make it difficult to test.”*
- **“Missing Unit Tests”**: `isMissingUnitTests` is currently implemented to **always return false** (placeholder: would need cross-file test corpus linkage). If you see “Missing Unit Tests” in older builds, verify the version; in current code the second branch is inactive.

### 1.5 Post-processing: false positives and caps (`validateAndCleanSmells`)

1. **Filter:** Removes some types entirely (e.g. certain field/annotation patterns listed as false positives in code).
2. **If `capped`:** Groups by smell **type string**, keeps up to **3** (default) or **5** instances for CRITICAL/MAJOR, then applies a **hard cap** on total count related to file length.

**Implication for the paper:** Report whether tables use **capped** analysis (shorter lists, comparable across UI) or **uncapped** (`analyze-live` for A/B), and **do not equate** raw smell counts with industrial Sonar-type “issues” without qualification.

---

## 2. Quality metrics in the backend (`EnhancedAnalysisService`)

Used when the Spring service analyzes file content for the enhanced analysis response (complexity, maintainability, testability on the **same file text**).

### 2.1 Cyclomatic-style complexity (`calculateComplexity`)

Starts at **1**, then **adds counts** of substring occurrences (not a full CFG):

- `if(`
- `for(`
- `while(`
- `catch(`
- `switch(`
- `&&`
- `||`

So it is a **textual approximation** of branching/decision density.

### 2.2 Maintainability index (`calculateMaintainability`)

\[
\text{MI} = \max\left(0,\; 100 - 5 \times \text{complexity} - \min\left(20,\; \frac{\text{lines}}{10}\right)\right)
\]

Where **lines** = `fileContent.split("\n").length` (physical lines, not logical SLOC).

### 2.3 Testability score (`calculateTestability`)

1. Count **total methods** and **public methods** with regexes on method signatures.
2. If **no methods**, return **10.0**.
3. Otherwise:

\[
\text{testability} = (\text{publicRatio} \times 40) + \min(50,\; \text{totalMethods} \times 3) - \min(40,\; \text{complexity} \times 2) + 10
\]

Clamped to **[5, 100]**.

**Note:** This is **not** code coverage; it rewards public surface and method count and penalizes the same complexity proxy as §2.1.

---

## 3. Metrics inside the refactoring report (Python agents)

After a refactor, **`RefactoringAnalyzer`** in `agents/refactoring_analysis.py` recomputes several quantities on the **original vs LLM candidate** strings. These can **differ numerically** from the Java `EnhancedAnalysisService` formulas for the same file.

### 3.1 Complexity (`calc_complexity` in `_calculate_metrics`)

Starts at **1**, adds counts of regex matches: `\bif\s*(`, `\bwhile\s*(`, `\bfor\s*(`, `\bswitch\s*(`, `\bcatch\s*(`. **Does not** count `&&` / `||` unlike the Java version.

### 3.2 Maintainability (`calc_maintainability` in `_calculate_metrics`)

\[
\text{MI} = \mathrm{clamp}_{[0,100]}\left(100 - \min(50,\frac{\text{lines}}{10}) - \min(30,\text{complexity}\times 2) + \min(20,\text{methods}\times 0.5)\right)
\]

Where **methods** = count of a broad “method-like” regex on the whole file.

### 3.3 Lines of code and method count

- **LOC:** `len(code.splitlines())`
- **Method count:** `len(re.findall(r'\b(public|private|protected)?\s+\w+\s+\w+\s*\(', code))` — heuristic; may **mis-count** or **double-count** some constructs.

### 3.4 Research metrics bundle (`agents/code_metrics.py`)

Computed on **original** and **refactored** source strings, plus optional LLM token usage:

| Group | Computation (summary) |
|-------|------------------------|
| **Halstead** | Strips comments/strings; tokenizes operators vs operands; \(n_1,n_2,N_1,N_2\); vocabulary \(n=n_1+n_2\), length \(N=N_1+N_2\); volume \(N\log_2 n\); difficulty \((n_1/2)\times(N_2/n_2)\); effort \(=\) volume × difficulty; estimated bugs \(=\) volume/3000. **Simplified** vs classical Halstead (Java-specific tokenizer). |
| **Method lengths** | Regex-based extraction of method bodies; stats: count, mean, median, max, stdev, long-method count. |
| **Nesting depth** | Brace-based scan per method / file regions; max depth, average, count of deep nests. |
| **Coupling (CBO-style)** | Import lines, distinct type-like references — **lightweight static** proxy, not full type resolution. |
| **Cohesion (LCOM-style)** | Field/method sets and overlap heuristics — **approximate**. |
| **Diff churn** | `difflib` line diff: added/removed/modified lines, hunks, churn rate %. |
| **Semantic preservation** | Compares public **class / method / field** surfaces via regex extraction; reports preservation % and removed names. |
| **Token efficiency** | From OpenRouter-style usage: total/prompt/completion tokens; relates to meaningful line changes and optional cost estimate. |
| **Smell resolution (by type)** | Compares smell lists keyed by type (and related fields) before vs after agent pipeline. |

Exact formulas and edge cases: read **`code_metrics.py`** functions named `compute_*`.

### 3.5 Overall refactoring score (0–100)

From **`_generate_summary`** in `refactoring_analysis.py` (weights are explicit in code):

| Block | Max points | Basis |
|-------|------------|--------|
| Behavioral correctness | **35** | Boolean checks (signatures, exceptions, framework contracts, conditionals, critical calls). |
| Code smell change | **30** | Smell reduction % vs original count; penalties if smells increase beyond a noise margin. |
| Structural changes | **20** | New methods, split classes, duplicate removal, naming — **reduced if behavioral failures** stack. |
| Quality metrics | **10** | Complexity / maintainability improved or flat. |
| Refactoring practices | **5** | Count of inferred practices (extract method, etc.). |

**Acceptance heuristic:** `overall_score >= 40`, smell regression bounded (`reduced >= -3`), and `behavioral_failures <= 1` (see code for exact gate).

---

## 4. UI “Before / After Metrics Comparison”

The panel **`RefactoringEvidencePanel`** merges:

- **Smell counts** from `deltas.before` / `deltas.after` and/or `improvements.code_smells` inside `applyResult.deltas.comprehensiveAnalysis`.
- **Cyclomatic complexity, maintainability, testability** from `deltas.qualityMetrics` when present (from the agents pipeline), else from nested `metrics` in comprehensive analysis.

**Research rows** (Halstead, nesting, coupling, etc.) come from **`applyResult.researchMetrics`**, populated by **`agents/main.py`** from `analysis_result["metrics"]` after analysis.

---

## 5. How to describe this honestly in a paper

Suggested wording themes:

1. **Tool-defined metrics:** Smells and several metrics are **custom heuristics** tuned for an LLM refactoring study, not a claim of equivalence to SonarQube, PMD, or textbook definitions.
2. **Two analysis contexts:** **Workspace file analysis** (Java) vs **post-refactor report** (Python) may use **different** complexity/maintainability formulas; always state which table is which.
3. **Independent validation:** Before/after smell comparison should use **`analyze-live`** with **`capped=false`** when reporting totals, and still clarify that detectors are heuristic.
4. **Threats to validity:** High recall line rules inflate counts; **semantic** quality may improve while **counts** worsen; human adjudication remains valuable for RQ3-style claims.

---

## 6. Exporting results for analysis (CSV)

The dashboard offers **“Export report (CSV)”** after a refactoring run (controlled refactoring view). The file is **UTF-8 CSV** with `\r\n` line endings (Excel-compatible on Windows).

**Column layout (six columns):** `section`, `field_1`, `field_2`, `field_3`, `field_4`, `field_5`

**Row types (value of `section`):**

| `section` | Meaning |
|-----------|--------|
| *(first line)* | Comment line starting with `#` pointing to this wiki. |
| `meta` | Run context: `workspaceId`, `filePath`, `exportedAt`. |
| `summary` | High-level outcome: `success`, `rejected`, `rejectionReason`, optional diff `diff_*` from line-change stats. |
| `deltas` | Aggregates from `applyResult.deltas`: smell totals, `smellsBefore_json` / `smellsAfter_json` (severity buckets). |
| `comprehensive_summary` | One row per key in `comprehensiveAnalysis.summary` (score, achievements, concerns, etc.). |
| `pipeline` | `pipelineMetadata` key/value pairs (model, retries, rejection category). |
| `research_header` | Header row before flattened research metrics. |
| `research_metric` | Before/after metric leaf: path, before, after, change, improved. |
| `research_detail` | Scalar or JSON fragment (e.g. diff churn fields, nested semantic preservation). |
| `smell_compare` | Independent comparison totals (`beforeTotal`, `afterTotal`). |
| `smell_compare_by_type` | Per-type counts when `typeSummary` exists. |
| `smell_removed` / `smell_added` | Instance rows from smell comparison (index, type, severity, location, description). |
| `detected_smell` | Smells from the current file list in the UI (`codeSmells` prop) when present. |
| `agent_step` | Pipeline steps (index, name, status, agent, error). |
| `rejected_meta` | Rejection UI state if set. |

For **Excel:** use **Data → From Text/CSV** or open the `.csv` directly; for statistical scripts use the `section` column to filter blocks.

**Native `.xlsx`:** not generated by default (keeps dependencies zero); CSV is sufficient for most paper appendices. If you need true XLSX, import CSV in Excel once and save as workbook, or add a small server-side export later.

---

## 7. Versioning

When you freeze a study artifact, record:

- Git commit SHA of `refactai`
- Whether smell tables used **capped** or **uncapped** analysis
- Model id and temperature (from `agents` config / `pipelineMetadata.model`)

Update this wiki if detector thresholds or score weights change.
