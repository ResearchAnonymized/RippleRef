"""
Preflight assessment for single-shot LLM refactoring by file size.

RefactAI always runs load → smell analysis → (optional LLM) → verify → research metrics.
For files beyond model/context limits we skip the LLM call but return a structured failure reason.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

# Conservative limits for one-shot "return the whole file" refactoring.
MAX_LINES_RECOMMENDED = 5_000
MAX_LINES_ATTEMPT = 25_000
MAX_LINES_HARD_BLOCK = 100_000
MAX_ESTIMATED_INPUT_TOKENS = 160_000


class SizeTier:
    SMALL = "small"  # < 800 lines
    MEDIUM = "medium"  # 800–5000
    LARGE = "large"  # 5001–25000 (attempt, partial output likely)
    EXTREME = "extreme"  # > 25000 (no LLM)


def estimate_tokens(text: str) -> int:
    """Rough token estimate (~4 chars per token for Java)."""
    if not text:
        return 0
    return max(1, len(text) // 4)


def assess_refactor_feasibility(
    original: str,
    *,
    smell_count: int = 0,
) -> Dict[str, Any]:
    lines = len((original or "").splitlines())
    chars = len(original or "")
    est_tokens = estimate_tokens(original or "")

    if lines <= 800:
        tier = SizeTier.SMALL
    elif lines <= MAX_LINES_RECOMMENDED:
        tier = SizeTier.MEDIUM
    elif lines <= MAX_LINES_ATTEMPT:
        tier = SizeTier.LARGE
    else:
        tier = SizeTier.EXTREME

    block_codes: List[str] = []
    warnings: List[str] = []

    if lines > MAX_LINES_HARD_BLOCK:
        block_codes.append("FILE_EXCEEDS_HARD_LINE_LIMIT")
    if lines > MAX_LINES_ATTEMPT:
        block_codes.append("FILE_EXCEEDS_SINGLE_SHOT_LINE_LIMIT")
    if est_tokens > MAX_ESTIMATED_INPUT_TOKENS:
        block_codes.append("INPUT_EXCEEDS_CONTEXT_WINDOW")

    if tier == SizeTier.LARGE and not block_codes:
        warnings.append(
            f"File has {lines:,} lines — single-shot LLM refactor may return partial or truncated output."
        )
    if tier == SizeTier.MEDIUM and lines > 2000:
        warnings.append(
            f"File has {lines:,} lines — expect long runtimes (20–60+ minutes) and possible verification rejection."
        )
    if smell_count > 80:
        warnings.append(
            f"{smell_count} smells detected — only a prioritized subset is sent to the LLM."
        )

    invoke_llm = len(block_codes) == 0

    return {
        "tier": tier,
        "lines": lines,
        "characters": chars,
        "estimatedInputTokens": est_tokens,
        "smellCount": smell_count,
        "invokeLlm": invoke_llm,
        "blockCodes": block_codes,
        "warnings": warnings,
        "limits": {
            "maxLinesRecommended": MAX_LINES_RECOMMENDED,
            "maxLinesAttempt": MAX_LINES_ATTEMPT,
            "maxLinesHardBlock": MAX_LINES_HARD_BLOCK,
            "maxEstimatedInputTokens": MAX_ESTIMATED_INPUT_TOKENS,
        },
    }


def user_message_for_block(codes: List[str], lines: int, est_tokens: int) -> str:
    if "FILE_EXCEEDS_HARD_LINE_LIMIT" in codes:
        return (
            f"This file has {lines:,} lines, which exceeds the maximum ({MAX_LINES_HARD_BLOCK:,}) for "
            "automated whole-file refactoring in one request. The pipeline completed smell analysis and "
            "verification on the original file only."
        )
    if "FILE_EXCEEDS_SINGLE_SHOT_LINE_LIMIT" in codes:
        return (
            f"This file has {lines:,} lines. Current RefactAI uses a single-shot LLM pass (entire file in one prompt). "
            f"That is not reliable above ~{MAX_LINES_ATTEMPT:,} lines (~{MAX_ESTIMATED_INPUT_TOKENS:,} estimated input tokens). "
            "Smell detection and research metrics were still computed."
        )
    if "INPUT_EXCEEDS_CONTEXT_WINDOW" in codes:
        return (
            f"Estimated input size (~{est_tokens:,} tokens) exceeds the safe context budget "
            f"({MAX_ESTIMATED_INPUT_TOKENS:,} tokens) for one-shot refactoring."
        )
    return "Refactoring was not attempted for this file size."


def recommendations_for_block(codes: List[str]) -> List[str]:
    recs = [
        "Refactor smaller compilation units (split class, or select a method-scoped experiment).",
        "For research, record this run as 'not attempted — exceeds single-shot limit' rather than a failed refactor.",
    ]
    if "FILE_EXCEEDS_HARD_LINE_LIMIT" in codes or "FILE_EXCEEDS_SINGLE_SHOT_LINE_LIMIT" in codes:
        recs.append(
            "Future work: method-level or chunked refactoring (not yet enabled in this build)."
        )
    return recs


def build_failure_outcome(
    *,
    feasibility: Optional[Dict[str, Any]] = None,
    llm_error_code: Optional[str] = None,
    llm_message: Optional[str] = None,
    truncated: bool = False,
    original_lines: int = 0,
) -> Dict[str, Any]:
    """Structured failure for UI and papers."""
    primary = None
    user_message = ""
    recommendations: List[str] = []
    attempted = True
    llm_invoked = False

    if feasibility and not feasibility.get("invokeLlm"):
        codes = feasibility.get("blockCodes") or []
        primary = codes[0] if codes else "FILE_TOO_LARGE"
        user_message = user_message_for_block(
            codes, feasibility.get("lines", 0), feasibility.get("estimatedInputTokens", 0)
        )
        recommendations = recommendations_for_block(codes)
        llm_invoked = False
    elif llm_error_code:
        llm_invoked = True
        primary = llm_error_code
        user_message = llm_message or f"LLM step failed: {llm_error_code}"
        if llm_error_code == "context_length_exceeded":
            user_message = (
                f"The model context window was exceeded (~{original_lines:,} lines in file). "
                "Whole-file refactor is not possible in one request at this size."
            )
            recommendations = recommendations_for_block(["INPUT_EXCEEDS_CONTEXT_WINDOW"])
        elif llm_error_code == "llm_timeout":
            user_message = (
                f"LLM request timed out for this file ({original_lines:,} lines). "
                "Try again or use a smaller scope."
            )
            recommendations = ["Retry during off-peak hours.", "Reduce file scope for the experiment."]
        elif llm_error_code == "output_truncated_max_tokens":
            primary = "OUTPUT_TRUNCATED"
            user_message = (
                "The model hit the output token limit before finishing the full file. "
                "The result was incomplete and rejected by verification."
            )
            recommendations = recommendations_for_block(["FILE_EXCEEDS_SINGLE_SHOT_LINE_LIMIT"])
        else:
            recommendations = ["Check agents/.env API key and OpenRouter status.", "See agent step details."]
    elif truncated:
        llm_invoked = True
        primary = "OUTPUT_TRUNCATED"
        user_message = (
            "Model output was truncated (max_tokens). Full-file refactor could not be completed."
        )
        recommendations = recommendations_for_block(["FILE_EXCEEDS_SINGLE_SHOT_LINE_LIMIT"])

    return {
        "attempted": attempted,
        "llmInvoked": llm_invoked,
        "primaryReason": primary,
        "userMessage": user_message,
        "recommendations": recommendations,
        "feasibility": feasibility,
    }
