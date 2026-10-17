"""
Static verification gates (Quality Verifier agent) — pure functions, no LLM.
"""
from __future__ import annotations

import difflib
import re
from dataclasses import dataclass, field
from typing import Callable, List, Optional, Set


@dataclass
class VerificationGateResult:
    accept: bool
    rejection_reasons: List[str] = field(default_factory=list)
    is_different: bool = False
    similarity: float = 1.0
    smell_improved: bool = False
    smell_ok: bool = False
    api_preserved: bool = True
    missing_api: List[str] = field(default_factory=list)
    dangerous_empty_catch: bool = False
    reasonable_size: bool = True
    line_ratio: float = 1.0
    orig_lines: int = 0
    candidate_lines: int = 0
    original_methods: int = 0
    candidate_methods: int = 0
    methods_preserved: bool = True
    new_methods: int = 0
    research_batch_accept: bool = False


def evaluate_verification_gates(
    *,
    original: str,
    candidate: str,
    before_count: int,
    after_count: int,
    build_public_api_signature: Callable[[str], List[str]],
    has_empty_catch: Callable[[str], bool],
    research_batch: bool = False,
    truncated_output: bool = False,
    method_preservation_threshold: float = 0.85,
) -> VerificationGateResult:
    """Run all static gates; returns accept decision and diagnostic fields."""
    original_normalized = re.sub(r"\s+", " ", original.strip())
    candidate_normalized = re.sub(r"\s+", " ", candidate.strip())
    similarity = difflib.SequenceMatcher(None, original_normalized, candidate_normalized).ratio()
    is_different = similarity < 0.995
    smell_improved = after_count < before_count

    smell_tolerance = min(10, max(2, before_count // 20)) if before_count > 0 else 2
    if research_batch and before_count > 5:
        smell_ok = after_count <= before_count and is_different
    elif before_count > 5:
        smell_ok = after_count < before_count
        if not smell_ok and after_count == before_count and similarity < 0.90:
            smell_ok = True
    else:
        smell_ok = after_count <= before_count + smell_tolerance

    original_api = set(build_public_api_signature(original))
    candidate_api = set(build_public_api_signature(candidate))
    missing_api = sorted(original_api - candidate_api)
    api_preserved = len(missing_api) == 0

    dangerous_empty_catch = has_empty_catch(candidate)

    orig_lines = len(original.splitlines())
    candidate_lines = len(candidate.splitlines())
    line_ratio = candidate_lines / max(1, orig_lines)
    reasonable_size = 0.4 <= line_ratio <= 2.5
    if research_batch and truncated_output and line_ratio >= 0.15:
        reasonable_size = True

    original_methods = len(re.findall(
        r"\b(public|private|protected)?\s+\w+\s+\w+\s*\([^)]*\)\s*\{", original
    ))
    candidate_methods = len(re.findall(
        r"\b(public|private|protected)?\s+\w+\s+\w+\s*\([^)]*\)\s*\{", candidate
    ))
    methods_preserved = candidate_methods >= original_methods * method_preservation_threshold

    original_method_names = set(re.findall(
        r"\b(?:public|private|protected)\s+\w+\s+(\w+)\s*\(", original
    ))
    candidate_method_names = set(re.findall(
        r"\b(?:public|private|protected)\s+\w+\s+(\w+)\s*\(", candidate
    ))
    new_methods = len(candidate_method_names - original_method_names)

    rejection_reasons: List[str] = []
    if not is_different and not smell_improved:
        rejection_reasons.append("too_similar")
    if not smell_ok:
        rejection_reasons.append(f"no_smell_reduction({before_count}→{after_count})")
    if dangerous_empty_catch:
        rejection_reasons.append("empty_catch")
    if not reasonable_size:
        rejection_reasons.append(f"size_change({line_ratio:.2f})")
    if not methods_preserved:
        rejection_reasons.append(f"methods_lost({candidate_methods}/{original_methods})")
    if not api_preserved:
        rejection_reasons.append(f"api_broken({len(missing_api)} removed)")

    accept = len(rejection_reasons) == 0
    research_batch_accept = False

    if research_batch and not accept and original.strip() != candidate.strip():
        if (
            is_different
            and after_count <= before_count
            and api_preserved
            and not dangerous_empty_catch
            and reasonable_size
            and methods_preserved
        ):
            accept = True
            rejection_reasons = []
            research_batch_accept = True

    return VerificationGateResult(
        accept=accept,
        rejection_reasons=rejection_reasons,
        is_different=is_different,
        similarity=similarity,
        smell_improved=smell_improved,
        smell_ok=smell_ok,
        api_preserved=api_preserved,
        missing_api=missing_api,
        dangerous_empty_catch=dangerous_empty_catch,
        reasonable_size=reasonable_size,
        line_ratio=line_ratio,
        orig_lines=orig_lines,
        candidate_lines=candidate_lines,
        original_methods=original_methods,
        candidate_methods=candidate_methods,
        methods_preserved=methods_preserved,
        new_methods=new_methods,
        research_batch_accept=research_batch_accept,
    )


def apply_llm_verifier_to_accept(
    static_accept: bool,
    rejection_reasons: List[str],
    verifier_parsed: Optional[dict],
) -> tuple[bool, List[str]]:
    """Combine static gates with LLM Verification Agent JSON verdict."""
    if not isinstance(verifier_parsed, dict):
        return static_accept, rejection_reasons

    approved = verifier_parsed.get("approved")
    reasons = list(rejection_reasons)
    accept = static_accept

    if approved is False and accept:
        accept = False
        reasons.append("llm_verifier_rejected")
    elif approved is True and not accept and not reasons:
        accept = True

    return accept, reasons
