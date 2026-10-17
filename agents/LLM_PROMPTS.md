# LLM prompts used in REFINE

**Authoritative source (live code):** `agents/main.py` → `call_llm_refactor()` (approx. lines 809–930).

## Multi-LLM agent mode (`MULTI_LLM_AGENT_MODE=full`)

When enabled in `agents/.env`, **three LLM agents** run per refactoring pass (via OpenRouter):

| Agent | Module | Role |
|-------|--------|------|
| **LLM Planning Agent** | `agents/multi_llm_agents.py` → `call_llm_planning_agent()` | Reads smells + rule draft plan → JSON refactoring plan |
| **LLM Refactoring Agent** | `agents/main.py` → `call_llm_refactor()` | Generates refactored Java |
| **LLM Verification Agent** | `agents/multi_llm_agents.py` → `call_llm_verification_agent()` | Reviews diff + smell counts → JSON approve/reject |

Default `MULTI_LLM_AGENT_MODE=off` keeps **only the Refactorer** on LLM (legacy reproducibility mode).

Non-LLM agents (Load, Analyze/smell API, Size Advisor, static Quality Verifier gates, Report) still use rules and backend APIs.

---

## 1. API and model settings

| Setting | Value |
|--------|--------|
| Provider | OpenRouter (`https://openrouter.ai/api/v1/chat/completions`) |
| Default single-LLM model | `OPENROUTER_MODEL` (default `anthropic/claude-opus-4.8`) |
| Research OpenAI | `OPENROUTER_MODEL_OPENAI` (default `openai/gpt-5.5`) |
| Research Google | `OPENROUTER_MODEL_GOOGLE` (default `google/gemini-3.1-pro-preview`) |
| Research Anthropic | `OPENROUTER_MODEL_CLAUDE` (default `anthropic/claude-opus-4.8`) |
| **temperature** | `0.4` |
| **max_tokens** | Scaled from file size (min 8192; up to 200000 cap) |
| Smells in prompt | Max **8** after `prioritize_smells()` |

Env template: `agents/.env.example`

---

## 2. Prompt assembly (before the LLM call)

Inputs are built from the pipeline, not from a separate planner LLM:

1. **PMD smells** (or refactoring plan items) from the analyze/plan steps.
2. **`prioritize_smells(..., max_total=8)`** — `agents/smell_prioritizer.py` (impact × safety catalog; Fowler-style techniques).
3. **`build_refactoring_instructions(selected)`** — grouped by method; inserted in user prompt.
4. **`build_public_api_signature(original)`** — public method signatures; “do not change” list.
5. **Smell listing** — per smell: line range, severity, id, description, `→ FIX WITH: {technique}`.

---

## 3. System prompt (verbatim)

```
You are an expert Java refactoring engine. You make REAL structural changes that eliminate code smells detected by a static analyzer.

CRITICAL RULES:
1. Keep ALL public method signatures EXACTLY the same (name, params, return type, throws)
2. Keep the class name, package, and imports unchanged unless removing unused imports
3. Return the COMPLETE file — every line, every method, every import. NEVER truncate or use "..."
4. Output must compile
5. Your changes must be STRUCTURAL, not cosmetic. Simply adding comments does NOT fix smells.

WHAT ACTUALLY FIXES SMELLS (the static analyzer checks for these):
- LONG_METHOD (>30 lines): Extract a chunk of logic into a new private method. The original method must become shorter.
- COMPLEX_METHOD (high cyclomatic complexity): Replace nested if/else with guard clauses (early return). Extract conditional branches into separate methods.
- MAGIC_NUMBER: Replace literal numbers (0, 1, 100, etc.) with `private static final` constants. The literal must DISAPPEAR from the method body.
- EMPTY_CATCH_BLOCK: Add at minimum `logger.warn(...)` or `throw new RuntimeException(e)` inside catch blocks.
- LONG_PARAMETER_LIST (>4 params): Group related params into a new inner class or record.
- NESTED_CONDITIONALS (depth >3): Flatten with guard clauses or extract the inner block to a method.
- DUPLICATE_CODE: Extract the duplicated block into a shared private method called from both locations.
- STRING_CONCATENATION in loops: Replace `+` with `StringBuilder`.
- GOD_CLASS / LARGE_CLASS (>300 lines): Extract a cohesive group of fields+methods into a new inner class or separate them out.

FOR EACH CHANGE: Add a brief inline comment: // REFACTORED: [what] - [why]

Return the complete refactored code in a single ```java block.
```

---

## 4. User prompt (template)

Placeholders: `{file_path}`, `{original_lines}`, `{smell_listing}`, `{instructions}`, `{public_api}`, `{prior_notes}`, `{original}`.

```
Refactor this Java file to eliminate the code smells listed below.

File: {file_path} ({original_lines} lines)

DETECTED SMELLS (from static analyzer — you must fix these):
{smell_listing}

PRIORITIZED REFACTORING INSTRUCTIONS:
{instructions}

PUBLIC API (DO NOT change these signatures):
{public_api lines, or "(no public methods detected)"}

{optional: CONTEXT FROM PRIOR ATTEMPTS: {prior_notes}}

```java
{original}
```

REQUIREMENTS:
1. Each smell listed above MUST be addressed. The static analyzer will re-check the output.
2. For LONG_METHOD smells: physically move lines of code out of the flagged method into a new private helper.
3. For MAGIC_NUMBER smells: declare `private static final` constants at class level and replace every occurrence.
4. For EMPTY_CATCH_BLOCK smells: add real error handling (at minimum logging).
5. Do NOT just add comments — the analyzer does not count comments as fixes.
6. Return the COMPLETE refactored file in a ```java block.
```

### Example `smell_listing` line

```
  Line 42-88 [MAJOR] long-method: Method too long
    → FIX WITH: Extract Method
```

### Example `instructions` block (from `build_refactoring_instructions`)

```
TARGET: Fix 3 prioritized code smells.

In method `processOrder`:
  [MAJOR] Method too long (line 42-88)
    → Apply: Extract Method — Break long method into smaller, well-named helper methods
```

---

## 5. Retry prompt augmentation (not a separate system prompt)

If the LLM returns **identical code**, the pipeline retries up to **2** times (`max_retries = 2` in `refactor_pipeline.py` / `main.py` multi-LLM path).

Each retry **appends** to `prior_notes` / `pass_prior`:

```
[RETRY {n}: Previous attempt returned identical code. You MUST make structural changes!]
```

(multi-LLM path uses a variant with provider name: `[RETRY {n} {provider}: identical code — make structural changes]`)

This text is injected under **CONTEXT FROM PRIOR ATTEMPTS** in the user message.

---

## 6. Agents without LLM prompts

| Agent / node | Prompt? | Mechanism |
|--------------|---------|-----------|
| load | No | Read file / frozen baseline |
| analyze | No | PMD + backend metrics |
| plan | No | Rule-based smell → technique map |
| feasibility | No | Line/token size policy |
| **refactor** | **Yes** | `call_llm_refactor()` |
| verify | No | Automated gates + re-analysis |
| apply | No | Filesystem write |
| compile | No | Compiler check |
| report | No | Metrics aggregation |

---

## 7. Paper / replication notes

- For empirical studies: cite **one fixed system prompt + one user template**; smells and instructions are **instance-specific** per file.
- Prompts are **not** chained across providers in independent parallel mode — each provider gets the same template on the **frozen baseline**.
- Older docs (`REFACTORING_PROMPT.md`, `CURRENT_REFACTORING_PROMPT.md`) describe **superseded** prompts; use **this file** for the current study.

**Last synced with code:** 2026-06-23 (`agents/main.py`).
