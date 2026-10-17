"""
Structured refactoring report for smell-driven refactors (JSON + UI).

Separates smell-driven changes from cosmetic/formatting-only edits using
heuristics; aligns line metrics with the web client's simple line diff.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# --- Line diff (ported from web/app/app/lib/lineDiff.ts computeSimpleDiffRows) ---

DiffRow = Dict[str, Any]


def _compute_simple_diff_rows(before: str, after: str) -> List[DiffRow]:
    a = (before or "").split("\n")
    b = (after or "").split("\n")
    rows: List[DiffRow] = []
    i, j = 0, 0
    lookahead = 3
    while i < len(a) or j < len(b):
        if i < len(a) and j < len(b) and a[i].strip() == b[j].strip():
            rows.append({"type": "same", "before": a[i], "after": b[j], "bi": i + 1, "ai": j + 1})
            i += 1
            j += 1
            continue
        if i < len(a) and j < len(b):
            bt = a[i].strip()
            at = b[j].strip()
            if (
                bt
                and at
                and len(bt) > 10
                and len(at) > 10
                and bt[: min(20, len(bt))] == at[: min(20, len(at))]
            ):
                rows.append({"type": "add", "before": a[i], "after": b[j], "bi": i + 1, "ai": j + 1})
                i += 1
                j += 1
                continue
        added = False
        for k in range(1, lookahead + 1):
            if j + k < len(b) and i < len(a) and a[i].strip() == b[j + k].strip():
                rows.append({"type": "add", "after": b[j], "ai": j + 1})
                j += 1
                added = True
                break
        if added:
            continue
        deleted = False
        for k in range(1, lookahead + 1):
            if i + k < len(a) and j < len(b) and a[i + k].strip() == b[j].strip():
                rows.append({"type": "del", "before": a[i], "bi": i + 1})
                i += 1
                deleted = True
                break
        if deleted:
            continue
        if i < len(a) and j < len(b):
            rows.append({"type": "add", "before": a[i], "after": b[j], "bi": i + 1, "ai": j + 1})
            i += 1
            j += 1
        elif i < len(a):
            rows.append({"type": "del", "before": a[i], "bi": i + 1})
            i += 1
        elif j < len(b):
            rows.append({"type": "add", "after": b[j], "ai": j + 1})
            j += 1
    return rows


def _line_stats(rows: List[DiffRow]) -> Tuple[int, int, int, int]:
    added = removed = modified = 0
    for r in rows:
        if r["type"] == "del":
            removed += 1
        elif r["type"] == "add":
            if r.get("before") is not None and r.get("after") is not None:
                modified += 1
            else:
                added += 1
    lc = added + removed + modified
    return added, removed, modified, lc


def _collapse_ws(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def _text_similarity(a: str, b: str) -> float:
    ca, cb = _collapse_ws(a), _collapse_ws(b)
    if not ca and not cb:
        return 1.0
    return SequenceMatcher(None, ca, cb).ratio()


def _benefit_line(smell_label: str, technique: str) -> str:
    t = technique.lower()
    if "extract method" in t:
        return "Reduces method complexity and improves readability and reuse."
    if "extract class" in t:
        return "Improves separation of responsibilities and modularity."
    if "move method" in t:
        return "Places behavior closer to the data it uses, improving cohesion."
    if "rename" in t:
        return "Improves understandability through clearer naming."
    if "simplify" in t or "conditional" in t:
        return "Makes decision logic easier to read and maintain."
    if "duplication" in t or "duplicate" in smell_label.lower():
        return "Removes repeated logic and improves reuse."
    if "encapsulate" in t:
        return "Hides implementation details and clarifies access boundaries."
    if "constant" in t or "magic" in smell_label.lower():
        return "Replaces magic values with named constants for clarity."
    return "Addresses the reported smell and supports maintainability."


def _location_from_smell(smell: Dict[str, Any]) -> str:
    ptr = smell.get("pointer") if isinstance(smell.get("pointer"), dict) else {}
    parts: List[str] = []
    for key in ("className", "methodName", "fieldName", "name"):
        v = ptr.get(key) or smell.get(key)
        if v:
            parts.append(str(v))
    sl = smell.get("startLine") or ptr.get("startLine")
    el = smell.get("endLine") or ptr.get("endLine")
    if sl and el:
        parts.append(f"lines {sl}-{el}")
    elif sl:
        parts.append(f"line {sl}")
    if not parts:
        parts.append("see file / detector region")
    return ", ".join(parts)


def _smell_label(smell: Dict[str, Any]) -> str:
    det = smell.get("detectorId") or smell.get("type") or "Code smell"
    if isinstance(det, str):
        return det.replace("-", " ").replace("_", " ").title()
    return str(det)


def _evidence_snippet(smell: Dict[str, Any], max_len: int = 220) -> str:
    text = (
        smell.get("summary")
        or smell.get("description")
        or smell.get("title")
        or smell.get("message")
        or ""
    )
    text = str(text).strip().replace("\n", " ")
    if len(text) > max_len:
        return text[: max_len - 1] + "…"
    return text or "(no detector message)"


def _new_method_names(original: str, refactored: str) -> List[str]:
    def names(code: str) -> set:
        return set(
            m[1]
            for m in re.findall(
                r"\b(?:public|private|protected)?\s+\w+\s+(\w+)\s*\(",
                code or "",
            )
        )

    return sorted(names(refactored) - names(original))[:12]


def _cleanup_hints(original: str, refactored: str, rows: List[DiffRow]) -> List[str]:
    hints: List[str] = []
    if original.strip() == refactored.strip():
        return hints

    # Whitespace-only line changes
    ws_only = 0
    non_ws = 0
    for r in rows:
        if r["type"] == "same":
            continue
        if r["type"] == "add" and "before" in r and "after" in r:
            if r["before"].strip() == r["after"].strip():
                ws_only += 1
            else:
                non_ws += 1
        elif r["type"] == "add" and r.get("after") is not None:
            non_ws += 1
        elif r["type"] == "del":
            non_ws += 1
    if ws_only > 0 and non_ws == 0:
        hints.append("Whitespace / indentation changes only on edited lines")

    if _collapse_ws(original) == _collapse_ws(refactored):
        hints.append("Formatting / whitespace normalization (semantic text unchanged under whitespace collapse)")

    # Diamond operator style (Java)
    if re.search(r"new\s+\w+(?:<[^>]+>)?\s*\(\s*\)", original) and re.search(
        r"new\s+\w+<>(?:\s*\(|\s*\{)", refactored
    ):
        hints.append("Diamond operator (<>) modernization")

    # Import lines churn
    o_imp = [ln.strip() for ln in original.splitlines() if ln.strip().startswith("import ")]
    r_imp = [ln.strip() for ln in refactored.splitlines() if ln.strip().startswith("import ")]
    if o_imp and r_imp and sorted(o_imp) == sorted(r_imp) and o_imp != r_imp:
        hints.append("Import reordering")

    # Comment-only edits
    comment_edits = 0
    for r in rows:
        if r["type"] == "add" and "before" in r and "after" in r:
            b, a = r["before"].strip(), r["after"].strip()
            if (b.startswith("//") or b.startswith("*") or b.startswith("/*")) and (
                a.startswith("//") or a.startswith("*") or a.startswith("/*")
            ):
                comment_edits += 1
    if comment_edits >= 2:
        hints.append("Comment text changes")

    return hints


def build_refactoring_report(
    *,
    file_path: str,
    original: str,
    candidate: str,
    smells: List[Dict[str, Any]],
    refactoring_plan: List[Dict[str, Any]],
    accept: bool,
    analysis: Optional[Dict[str, Any]],
    verify_details: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Build the user-facing refactoring report dict (matches UI/export JSON contract).
    `candidate` is the post-refactor text produced by the pipeline (even if not accepted).
    """
    file_name = Path(file_path or "unknown").name
    # Full relative path disambiguates same basenames and matches the web client's selectedFile.
    file_key = (file_path or "").replace("\\", "/").strip() or file_name
    rows = _compute_simple_diff_rows(original, candidate)
    added, removed, modified, lines_changed = _line_stats(rows)
    sim = _text_similarity(original, candidate)
    identical = original.strip() == candidate.strip()
    semantic_ws_only = (not identical) and _collapse_ws(original) == _collapse_ws(candidate)

    cleanup = _cleanup_hints(original, candidate, rows)
    new_methods = _new_method_names(original, candidate)

    # Smells: exclude synthetic "no smells" plan-only entry from detected list when we have real smells
    real_smells = [s for s in smells if (s.get("detectorId") or s.get("type") or "") != "general-improvements"]

    detected_smells: List[Dict[str, str]] = []
    for s in real_smells:
        label = _smell_label(s)
        detected_smells.append(
            {
                "smell": label,
                "location": _location_from_smell(s),
                "evidence": _evidence_snippet(s),
            }
        )

    applied_refactorings: List[Dict[str, str]] = []
    smell_mapping: List[Dict[str, str]] = []

    behavioral_note = ""
    if analysis:
        bc = analysis.get("behavioral_correctness") or {}
        if bc.get("behavioral_correct"):
            behavioral_note = (
                "The external behavior appears preserved based on heuristic checks "
                "(signatures, key control flow, and common contracts). Automated checks are not a substitute for tests."
            )
        else:
            behavioral_note = (
                "Potential behavior-impacting differences were flagged by heuristic analysis; "
                "review the diff and run tests before relying on equivalence."
            )
            if bc.get("note"):
                behavioral_note += " " + str(bc["note"])
    else:
        behavioral_note = (
            "Behavior preservation was not fully analyzed; assume review and tests are required."
        )

    quality: List[str] = []
    if analysis:
        imp = analysis.get("improvements") or {}
        st = imp.get("structural_changes") or {}
        if st.get("methods_extracted", 0) > 0:
            quality.append("Improved modularity (new methods / extraction)")
        if st.get("duplicate_code_removed"):
            quality.append("Reduced duplication")
        if st.get("naming_improved"):
            quality.append("Better naming clarity")
        met = analysis.get("metrics") or {}
        if met.get("complexity", {}).get("improved"):
            quality.append("Reduced method / control-flow complexity (estimate)")
        if met.get("maintainability", {}).get("improved"):
            quality.append("Improved maintainability (estimate)")
    if not quality:
        quality = ["Improved readability", "Improved maintainability"]

    # --- No meaningful refactor ---
    if identical:
        summary = (
            "No smell-driven refactoring detected. The before and after versions are identical "
            "or only contain formatting-level changes."
        )
        return {
            "file": file_key,
            "summary": summary,
            "detected_smells": detected_smells,
            "applied_refactorings": [],
            "smell_refactoring_mapping": [],
            "change_metrics": {
                "lines_added": 0,
                "lines_removed": 0,
                "lines_modified": 0,
                "refactoring_operations": 0,
            },
            "additional_cleanup_changes": [],
            "behavior_preservation": "No code changes were applied; behavior is unchanged.",
            "quality_improvement": [],
            "meta": {
                "identical": True,
                "formatting_only": False,
                "verification_accepted": accept,
                "text_similarity": round(sim, 4),
            },
        }

    if semantic_ws_only:
        summary = (
            "No smell-driven refactoring detected. The before and after versions are identical "
            "or only contain formatting-level changes."
        )
        return {
            "file": file_key,
            "summary": summary,
            "detected_smells": detected_smells,
            "applied_refactorings": [],
            "smell_refactoring_mapping": [],
            "change_metrics": {
                "lines_added": added,
                "lines_removed": removed,
                "lines_modified": modified,
                "refactoring_operations": 0,
            },
            "additional_cleanup_changes": cleanup
            or ["Whitespace / formatting normalization"],
            "behavior_preservation": (
                "Whitespace and formatting changes do not alter observable program behavior "
                "when semantics are unchanged."
            ),
            "quality_improvement": ["Minor formatting consistency only (no smell-driven refactor claimed)"],
            "meta": {
                "identical": False,
                "formatting_only": True,
                "verification_accepted": accept,
                "text_similarity": round(sim, 4),
            },
        }

    # Meaningful text change: build plan-driven report
    meaningful_plan = [
        p
        for p in refactoring_plan
        if p.get("smellId") not in (None, "general-improvements")
    ]
    if not meaningful_plan and refactoring_plan:
        meaningful_plan = list(refactoring_plan)

    after_loc_hint = ""
    if new_methods:
        after_loc_hint = "New or extracted members: " + ", ".join(new_methods)
    elif lines_changed:
        after_loc_hint = "Edits distributed across the file; see IDE Diff / unified patch for exact hunks."

    for p in meaningful_plan:
        sid = p.get("smellId", "")
        technique = p.get("technique") or "General Refactoring"
        before_loc = p.get("location") or "see smell location"
        action = p.get("action") or p.get("description") or ""
        applied_refactorings.append(
            {
                "type": technique,
                "before_location": before_loc,
                "after_location": after_loc_hint or "Refactored file",
                "description": action[:500],
            }
        )
        smell_title = sid.replace("-", " ").replace("_", " ").title() if isinstance(sid, str) else str(sid)
        smell_mapping.append(
            {
                "smell": smell_title,
                "refactoring": technique,
                "benefit": _benefit_line(smell_title, technique),
            }
        )

    if not applied_refactorings and analysis:
        practices = (analysis.get("refactoring_practices") or {}).get("practices_applied") or []
        for pr in practices:
            applied_refactorings.append(
                {
                    "type": pr,
                    "before_location": "Inferred from diff (no smell-specific plan entry)",
                    "after_location": after_loc_hint or "Refactored file",
                    "description": f"Detected pattern consistent with {pr} in the refactored source.",
                }
            )
            smell_mapping.append(
                {
                    "smell": "Structural / heuristic",
                    "refactoring": pr,
                    "benefit": _benefit_line("structural", pr),
                }
            )

    ops_count = len(meaningful_plan) if meaningful_plan else len(smell_mapping)
    if ops_count == 0 and applied_refactorings:
        ops_count = len(applied_refactorings)

    v = verify_details or {}
    ver = v.get("verification") or {}
    if not accept:
        gate = v.get("rejectionReason") or ver.get("rejectionReason")
        summary = (
            f"A refactor was generated ({lines_changed} line-level hunks) but was not saved: verification gate `{gate}`. "
            "Review the proposed diff manually."
        )
    else:
        summary = (
            f"Refactoring applied with {lines_changed} line-level changes ("
            f"+{added} / -{removed} / ~{modified}). "
            f"Targeted {len(meaningful_plan)} planned smell-related operation(s); "
            f"similarity to original ~{sim * 100:.1f}%."
        )
        if len(real_smells) == 0 and meaningful_plan:
            summary += " General improvement pass (no detector smells in scope)."

    # Pull extra cleanup not tied to smells
    extra_cleanup = list(cleanup)
    low_signal = sim > 0.97 and not new_methods and added + removed + modified < 4
    if low_signal:
        extra_cleanup.append("Possible minor edits only — confirm structural intent in diff")

    # Refinement: verifier said no meaningful changes
    if ver.get("hasMeaningfulChanges") is False and ver.get("hasStructuralChanges") is False:
        summary = (
            "No smell-driven refactoring detected. The before and after versions are identical "
            "or only contain formatting-level changes."
        )
        applied_refactorings = []
        smell_mapping = []
        ops_count = 0
        extra_cleanup.extend(cleanup or ["Edits did not pass meaningful-change heuristics"])
        quality = [
            "No smell-driven improvement claimed under automatic verification heuristics (minor or cosmetic edits only)."
        ]

    return {
        "file": file_key,
        "summary": summary,
        "detected_smells": detected_smells,
        "applied_refactorings": applied_refactorings,
        "smell_refactoring_mapping": smell_mapping,
        "change_metrics": {
            "lines_added": added,
            "lines_removed": removed,
            "lines_modified": modified,
            "refactoring_operations": ops_count,
        },
        "additional_cleanup_changes": extra_cleanup,
        "behavior_preservation": behavioral_note,
        "quality_improvement": quality,
        "meta": {
            "identical": False,
            "formatting_only": False,
            "verification_accepted": accept,
            "text_similarity": round(sim, 4),
            "lines_changed_total": lines_changed,
        },
    }
