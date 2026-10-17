"""
Unified rule-based refactoring plan builder (Refactoring Planner agent).
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional


def select_smells_for_plan(
    smells: List[Dict],
    *,
    selected_smell_ids: Optional[List[str]] = None,
    normalize_severity: Callable[[Dict], str],
) -> tuple[List[Dict], Dict[str, Any]]:
    """Choose which smells enter the refactoring plan."""
    meta: Dict[str, Any] = {}

    if selected_smell_ids:
        ids = set(selected_smell_ids)
        picked = [s for s in smells if (s.get("detectorId") or s.get("type")) in ids]
        meta["mode"] = "using_pre_selected"
        meta["count"] = len(picked)
        return picked, meta

    critical = [s for s in smells if normalize_severity(s) == "CRITICAL"]
    major = [s for s in smells if normalize_severity(s) == "MAJOR"]
    minor = [s for s in smells if normalize_severity(s) == "MINOR"]

    selected: List[Dict] = []
    selected.extend(critical)
    max_major = min(30 if len(smells) > 50 else (20 if len(smells) > 20 else 10), len(major))
    selected.extend(major[:max_major])

    minor_kw = [
        "duplicate", "long-method", "complex", "nested", "god-class", "large-class",
        "feature-envy", "temporary-field", "message-chains", "data-class", "lazy-class",
    ]
    impactful_minor = [
        s for s in minor
        if any(kw in (s.get("detectorId") or s.get("type") or "").lower() for kw in minor_kw)
    ]
    remaining = 15 - len(selected)
    if remaining > 0:
        selected.extend(impactful_minor[:remaining])
    remaining = 15 - len(selected)
    if remaining > 0:
        for s in minor:
            if s in selected:
                continue
            selected.append(s)
            remaining -= 1
            if remaining <= 0:
                break

    if not selected and smells:
        prioritized = sorted(
            smells,
            key=lambda s: (
                0 if normalize_severity(s) == "CRITICAL" else (
                    1 if normalize_severity(s) == "MAJOR" else 2
                ),
                s.get("startLine", 0) or 0,
            ),
        )
        selected = prioritized[: min(20, len(prioritized))]
        meta["mode"] = "auto_selected_fallback"
        meta["note"] = "No severity-matched picks; using top smells by severity/lines"
    else:
        meta["mode"] = "auto_selected"

    meta["count"] = len(selected)
    return selected, meta


def build_rule_refactoring_plan(
    smells: List[Dict],
    *,
    map_smell_to_refactoring: Callable[[str, str], Dict[str, str]],
    normalize_severity: Callable[[Dict], str],
    selected_smell_ids: Optional[List[str]] = None,
) -> tuple[List[Dict], Dict[str, Any]]:
    """Build rule-based refactoring plan items from smell list."""
    if not smells:
        plan = [{
            "smellId": "general-improvements",
            "severity": "MINOR",
            "location": "entire file",
            "description": "Apply general code improvements: readability, structure, best practices",
            "technique": "General Refactoring",
            "action": "Improve code structure, readability, and maintainability",
            "priority": "MEDIUM",
            "source": "rule_planner",
        }]
        return plan, {"mode": "general_improvements", "count": 1}

    selected, meta = select_smells_for_plan(
        smells,
        selected_smell_ids=selected_smell_ids,
        normalize_severity=normalize_severity,
    )
    plan: List[Dict] = []
    for smell in selected:
        detector_id = smell.get("detectorId") or smell.get("type", "unknown")
        sev_norm = normalize_severity(smell)
        severity = smell.get("severity", sev_norm)
        summary = smell.get("summary") or smell.get("description", "")
        start_line = smell.get("startLine", 0)
        end_line = smell.get("endLine", 0)
        technique = map_smell_to_refactoring(detector_id, summary)
        plan.append({
            "smellId": detector_id,
            "severity": severity,
            "location": f"lines {start_line}-{end_line}",
            "description": summary,
            "technique": technique["technique"],
            "action": technique["action"],
            "priority": "HIGH" if sev_norm in ("CRITICAL", "MAJOR") else "MEDIUM",
            "source": "rule_planner",
        })

    meta["smellsAnalyzed"] = len(plan)
    meta["highPriority"] = len([p for p in plan if p.get("priority") == "HIGH"])
    meta["plan"] = plan
    return plan, meta
