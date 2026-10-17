"""Prompt builders for LLM agents in the refactoring pipeline."""
from __future__ import annotations

import os
from typing import Dict, List, Optional

REFACTOR_SYSTEM_PROMPT = """You are an expert Java refactoring engine. You make REAL structural changes that eliminate code smells detected by a static analyzer.

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

Return the complete refactored code in a single ```java block."""


def build_refactor_smell_listing(selected: List[Dict]) -> str:
    smell_lines = []
    for s in selected:
        sid = s.get("_smell_id") or s.get("detectorId") or s.get("type", "unknown")
        sev = s.get("severity", "UNKNOWN")
        sl = s.get("startLine") or s.get("lineNumber") or "?"
        el = s.get("endLine") or sl
        desc = s.get("summary") or s.get("description") or s.get("title") or sid
        cat = s.get("_catalog", {})
        technique = cat.get("technique", "General Refactoring")
        smell_lines.append(f"  Line {sl}-{el} [{sev}] {sid}: {desc}\n    → FIX WITH: {technique}")
    return "\n".join(smell_lines) if smell_lines else "No specific smells detected."


def build_refactor_user_prompt(
    *,
    file_path: str,
    original: str,
    smell_listing: str,
    instructions: str,
    public_api: List[str],
    prior_notes: Optional[str] = None,
) -> str:
    original_lines = len(original.splitlines())
    return f"""Refactor this Java file to eliminate the code smells listed below.

File: {file_path} ({original_lines} lines)

DETECTED SMELLS (from static analyzer — you must fix these):
{smell_listing}

PRIORITIZED REFACTORING INSTRUCTIONS:
{instructions}

PUBLIC API (DO NOT change these signatures):
{chr(10).join(public_api) if public_api else "(no public methods detected)"}

{f"CONTEXT FROM PRIOR ATTEMPTS: {prior_notes}" if prior_notes else ""}

```java
{original}
```

REQUIREMENTS:
1. Each smell listed above MUST be addressed. The static analyzer will re-check the output.
2. For LONG_METHOD smells: physically move lines of code out of the flagged method into a new private helper.
3. For MAGIC_NUMBER smells: declare `private static final` constants at class level and replace every occurrence.
4. For EMPTY_CATCH_BLOCK smells: add real error handling (at minimum logging).
5. Do NOT just add comments — the analyzer does not count comments as fixes.
6. Return the COMPLETE refactored file in a ```java block."""


def compute_refactor_max_tokens(original_lines: int, original_tokens: int) -> int:
    if original_lines > 3000:
        max_tokens = min(32000, max(16000, int(original_tokens * 1.5)))
    elif original_lines > 1500:
        max_tokens = min(24000, max(12000, int(original_tokens * 1.5)))
    elif original_lines > 800:
        max_tokens = min(20000, max(10000, original_tokens * 2))
    elif original_lines > 400:
        max_tokens = max(12000, int(original_tokens * 2))
    elif original_lines > 200:
        max_tokens = max(10000, int(original_tokens * 2))
    else:
        max_tokens = max(8192, original_tokens * 2)
    max_tokens = min(200000, int(max_tokens))
    cap = int(os.environ.get("RIPPLE_REF_MAX_OUTPUT_TOKENS", "2500") or "2500")
    return min(max_tokens, cap)


def compute_refactor_timeout(original_lines: int) -> int:
    if original_lines > 10000:
        return 3600
    if original_lines > 5000:
        return 2700
    if original_lines > 1000:
        return 1500
    if original_lines > 800:
        return 1200
    if original_lines > 400:
        return 900
    return 480
