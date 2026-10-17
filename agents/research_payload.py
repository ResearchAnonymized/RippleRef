#!/usr/bin/env python3
"""
Assemble a single researchMetrics JSON object with full before/after comparison data
for the UI and CSV export (controlled experiments).
"""

from __future__ import annotations

import json
import time
from typing import Any, Dict, List, Optional

_BEHAVIORAL_CHECK_SPECS = [
    (
        "behavioral_correct",
        "Overall behavioral correctness",
        "All heuristic behavioral checks passed.",
        "At least one behavioral heuristic failed — review diff and run tests.",
    ),
    (
        "method_signatures_preserved",
        "Public method signatures preserved",
        "Public method signatures match the original.",
        "Public methods removed or signatures changed.",
    ),
    (
        "exception_handling_preserved",
        "Exception handling preserved",
        "try/catch/finally structure appears consistent.",
        "Exception handling changed — error paths may differ.",
    ),
    (
        "framework_contracts_preserved",
        "Framework contracts preserved",
        "Framework annotations and hooks appear unchanged.",
        "Framework contracts were altered.",
    ),
    (
        "conditional_logic_preserved",
        "Conditional logic preserved",
        "Control-flow constructs (if/switch/ternary) appear stable.",
        "Conditional logic was removed or simplified.",
    ),
    (
        "critical_method_calls_preserved",
        "Critical method calls preserved",
        "Assert/fail and critical calls were not removed.",
        "Critical assert/fail calls were removed.",
    ),
]


def _build_behavioral_export(behavioral: Dict) -> Dict:
    """Behavioral booleans + per-check pass/fail explanations for research export."""
    checks: List[Dict] = []
    for check_id, label, why_pass, why_fail in _BEHAVIORAL_CHECK_SPECS:
        val = behavioral.get(check_id)
        if check_id == "critical_method_calls_preserved" and val is None:
            val = True
        if val is True:
            status = "pass"
        elif val is False:
            status = "fail"
        else:
            status = "unknown"
        checks.append(
            {
                "check_id": check_id,
                "label": label,
                "passed": val if isinstance(val, bool) else None,
                "status": status,
                "why_pass": why_pass if val is True else "",
                "why_fail": why_fail if val is False else "",
            }
        )
    changes = behavioral.get("behavioral_changes") or []
    return {
        "behavioral_correct": behavioral.get("behavioral_correct"),
        "method_signatures_preserved": behavioral.get("method_signatures_preserved"),
        "exception_handling_preserved": behavioral.get("exception_handling_preserved"),
        "framework_contracts_preserved": behavioral.get("framework_contracts_preserved"),
        "conditional_logic_preserved": behavioral.get("conditional_logic_preserved"),
        "critical_method_calls_preserved": behavioral.get("critical_method_calls_preserved", True),
        "checks": checks,
        "behavioral_changes_json": json.dumps(changes, ensure_ascii=False) if changes else "",
        "warnings": "; ".join(behavioral.get("warnings") or []),
        "errors": "; ".join(behavioral.get("errors") or []),
    }


def _ba(before: Any, after: Any, higher_is_better: bool = True) -> Dict:
    try:
        bv = float(before) if before is not None else 0
        av = float(after) if after is not None else 0
    except (TypeError, ValueError):
        bv, av = 0, 0
    change = round(av - bv, 4)
    if higher_is_better:
        improved = change > 0
    else:
        improved = change < 0
    return {"before": bv, "after": av, "change": change, "improved": improved}


def _empty_severity() -> Dict[str, int]:
    return {"CRITICAL": 0, "MAJOR": 0, "MINOR": 0, "INFO": 0, "OTHER": 0}


def _severity_counts(smells: List[Dict]) -> Dict[str, int]:
    counts = _empty_severity()
    for s in smells or []:
        sev = str(s.get("severity", "OTHER")).upper()
        if sev in counts:
            counts[sev] += 1
        elif sev in ("HIGH", "ERROR"):
            counts["CRITICAL"] += 1
        elif sev in ("MEDIUM", "WARNING"):
            counts["MAJOR"] += 1
        else:
            counts["OTHER"] += 1
    return counts


def _severity_from_delta_dict(d: Optional[Dict]) -> Dict[str, int]:
    """Map deltas.smellsBefore/After (critical/major/minor) or PMD-style keys."""
    counts = _empty_severity()
    if not d or not isinstance(d, dict):
        return counts
    key_map = {
        "critical": "CRITICAL",
        "major": "MAJOR",
        "minor": "MINOR",
        "info": "INFO",
        "other": "OTHER",
        "CRITICAL": "CRITICAL",
        "MAJOR": "MAJOR",
        "MINOR": "MINOR",
        "INFO": "INFO",
        "OTHER": "OTHER",
    }
    for k, v in d.items():
        target = key_map.get(str(k))
        if target:
            try:
                counts[target] += int(v or 0)
            except (TypeError, ValueError):
                pass
    return counts


def build_research_metrics(
    *,
    file_path: str,
    original: str,
    refactored: str,
    analysis_result: Optional[Dict],
    deltas: Optional[Dict],
    verify_accepted: bool,
    before_smell_count: int,
    after_smell_count: int,
    quality_before: Optional[Dict] = None,
    quality_after: Optional[Dict] = None,
) -> Dict:
    """Full research payload: nested metric groups + flat comparison summary."""
    analysis_result = analysis_result or {}
    deltas = deltas or {}
    metrics = analysis_result.get("metrics") or {}
    improvements = analysis_result.get("improvements") or {}
    smell_block = improvements.get("code_smells") or {}
    structural = improvements.get("structural_changes") or {}
    behavioral = analysis_result.get("behavioral_correctness") or {}
    practices = analysis_result.get("refactoring_practices") or {}
    summary = analysis_result.get("summary") or {}
    smell_resolution = analysis_result.get("smell_resolution") or {}

    qb = quality_before or {}
    qa = quality_after or {}

    before_sev = _severity_from_delta_dict(deltas.get("smellsBefore"))
    if not any(before_sev.values()):
        before_sev = _severity_counts(deltas.get("before_reanalysis_smells") or [])
    after_sev = _severity_from_delta_dict(deltas.get("smellsAfter"))
    if not any(after_sev.values()):
        after_sev = _severity_counts(deltas.get("after_reanalysis_smells") or [])

    comparison: Dict[str, Dict] = {
        "pmd_smell_total": _ba(before_smell_count, after_smell_count, higher_is_better=False),
        "complexity": _ba(
            metrics.get("complexity", {}).get("before", qb.get("complexity", 0)),
            metrics.get("complexity", {}).get("after", qa.get("complexity", 0)),
            higher_is_better=False,
        ),
        "maintainability": _ba(
            metrics.get("maintainability", {}).get("before", qb.get("maintainability", 0)),
            metrics.get("maintainability", {}).get("after", qa.get("maintainability", 0)),
            higher_is_better=True,
        ),
        "testability": _ba(
            qb.get("testability", 0),
            qa.get("testability", 0),
            higher_is_better=True,
        ),
        "lines_of_code": _ba(
            metrics.get("lines_of_code", {}).get("before", len(original.splitlines())),
            metrics.get("lines_of_code", {}).get("after", len(refactored.splitlines())),
            higher_is_better=False,
        ),
        "method_count": _ba(
            metrics.get("methods", {}).get("before", 0),
            metrics.get("methods", {}).get("after", 0),
            higher_is_better=True,
        ),
    }

    for sev in ("CRITICAL", "MAJOR", "MINOR", "INFO", "OTHER"):
        comparison[f"smells_{sev.lower()}"] = _ba(
            before_sev.get(sev, 0), after_sev.get(sev, 0), higher_is_better=False
        )

    return {
        "meta": {
            "file": file_path,
            "analyzedAt": int(time.time() * 1000),
            "verifyAccepted": verify_accepted,
            "overallScore": summary.get("overall_score"),
            "refactoringSuccessful": summary.get("refactoring_successful"),
            "orchestration": "langgraph",
            "graphVersion": "1.1",
        },
        "comparison": comparison,
        "code_smells": {
            "total": _ba(
                smell_block.get("before", before_smell_count),
                smell_block.get("after", after_smell_count),
                higher_is_better=False,
            ),
            "improvement_percent": smell_block.get("improvement_percent", 0),
            "reduced": smell_block.get("reduced", before_smell_count - after_smell_count),
            "by_severity": {
                sev: _ba(before_sev.get(sev, 0), after_sev.get(sev, 0), higher_is_better=False)
                for sev in ("CRITICAL", "MAJOR", "MINOR", "INFO", "OTHER")
            },
        },
        "structural": {
            "methods_extracted": structural.get("methods_extracted", 0),
            "methods_renamed": structural.get("methods_renamed", 0),
            "classes_split": structural.get("classes_split", 0),
            "duplicate_code_removed": structural.get("duplicate_code_removed", False),
            "naming_improved": structural.get("naming_improved", False),
        },
        "behavioral": _build_behavioral_export(behavioral),
        "practices_applied": practices.get("practices_applied") or [],
        "quality": {
            "complexity": metrics.get("complexity"),
            "maintainability": metrics.get("maintainability"),
            "lines_of_code": metrics.get("lines_of_code"),
            "methods": metrics.get("methods"),
            "testability": _ba(qb.get("testability", 0), qa.get("testability", 0), higher_is_better=True),
        },
        "halstead": metrics.get("halstead"),
        "method_lengths": metrics.get("method_lengths"),
        "nesting_depth": metrics.get("nesting_depth"),
        "coupling": metrics.get("coupling"),
        "cohesion": metrics.get("cohesion"),
        "diff_churn": metrics.get("diff_churn"),
        "semantic_preservation": metrics.get("semantic_preservation"),
        "token_efficiency": metrics.get("token_efficiency"),
        "smell_resolution": smell_resolution,
        "summary": {
            "key_achievements": summary.get("key_achievements") or [],
            "concerns": summary.get("concerns") or [],
        },
        "deltas": {
            "before": deltas.get("before"),
            "after": deltas.get("after"),
            "improvement": deltas.get("improvement"),
        },
    }


def _count_smells_by_severity(smell_list: List[Dict]) -> Dict[str, int]:
    counts = {"critical": 0, "major": 0, "minor": 0}
    for s in smell_list or []:
        sev = str(s.get("severity", "MINOR")).upper()
        if sev in ("CRITICAL", "HIGH", "ERROR"):
            counts["critical"] += 1
        elif sev in ("MAJOR", "MEDIUM", "WARNING"):
            counts["major"] += 1
        else:
            counts["minor"] += 1
    return counts


def build_pass_research_metrics(
    *,
    file_path: str,
    pass_input: str,
    pass_output: str,
    analysis_result: Dict,
    original_smells: List[Dict],
    refactored_smells: List[Dict],
    before_smell_count: int,
    after_smell_count: int,
    quality_before: Optional[Dict] = None,
    quality_after: Optional[Dict] = None,
    provider: str,
    model: str,
    pass_index: int,
    verify_accepted: bool = True,
) -> Dict:
    """
    Full 15-section researchMetrics for one multi-LLM chain pass (OpenAI / Google / Anthropic).
    pass_input → pass_output is the before/after for this provider only.
    """
    before_sev = _count_smells_by_severity(original_smells)
    after_sev = _count_smells_by_severity(refactored_smells)
    deltas = {
        "before": before_smell_count,
        "after": after_smell_count,
        "improvement": max(0, before_smell_count - after_smell_count),
        "smellsBefore": before_sev,
        "smellsAfter": after_sev,
    }
    metrics = build_research_metrics(
        file_path=file_path,
        original=pass_input,
        refactored=pass_output,
        analysis_result=analysis_result,
        deltas=deltas,
        verify_accepted=verify_accepted,
        before_smell_count=before_smell_count,
        after_smell_count=after_smell_count,
        quality_before=quality_before,
        quality_after=quality_after,
    )
    meta = metrics.get("meta") or {}
    meta["llmProvider"] = provider
    meta["llmModel"] = model
    meta["passIndex"] = pass_index
    meta["passScope"] = "multi_llm_chain"
    meta.setdefault("orchestration", "langgraph")
    meta.setdefault("graphVersion", "1.0")
    metrics["meta"] = meta
    return metrics
