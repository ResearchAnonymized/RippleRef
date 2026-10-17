"""
Multi-LLM agent roles: Planner, Refactorer (wrapper), Verifier.

When MULTI_LLM_AGENT_MODE=full, each refactoring pass uses three LLM calls:
  1. LLM Planning Agent   — smell-aware refactoring plan (JSON)
  2. LLM Refactoring Agent — code generation (existing call_llm_refactor)
  3. LLM Verification Agent — review candidate vs baseline (JSON accept/reject)
"""
from __future__ import annotations

import difflib
from typing import Any, Dict, List, Optional

from llm_agent_core import LLMAgentOutcome, call_openrouter_agent
from smell_prioritizer import build_public_api_signature

PLANNER_AGENT = "LLM Planning Agent"
REFACTORER_AGENT = "LLM Refactoring Agent"
VERIFIER_AGENT = "LLM Verification Agent"


async def call_llm_refactoring_agent(
    original: str,
    file_path: str,
    smells: List[Dict],
    goals: Optional[List[str]],
    prior_notes: Optional[str] = None,
    refactoring_plan: Optional[List[Dict]] = None,
    model: Optional[str] = None,
    provider_id: Optional[str] = None,
):
    """LLM Refactoring Agent — routes through unified llm_client."""
    from main import call_llm_refactor

    return await call_llm_refactor(
        original,
        file_path,
        smells,
        goals,
        prior_notes,
        refactoring_plan,
        model=model,
        provider_id=provider_id,
    )


def _smell_summary(smells: List[Dict], limit: int = 20) -> str:
    lines: List[str] = []
    for s in smells[:limit]:
        sid = s.get("detectorId") or s.get("type") or "unknown"
        sev = s.get("severity", "?")
        sl = s.get("startLine") or s.get("lineNumber") or "?"
        desc = (s.get("summary") or s.get("description") or s.get("title") or "")[:120]
        lines.append(f"- [{sev}] {sid} @ line {sl}: {desc}")
    if len(smells) > limit:
        lines.append(f"... and {len(smells) - limit} more smells")
    return "\n".join(lines) if lines else "(no smells)"


def _normalize_plan_items(raw: Any, fallback: List[Dict]) -> List[Dict]:
    if not isinstance(raw, list):
        return fallback
    out: List[Dict] = []
    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            continue
        smell_id = str(item.get("smellId") or item.get("smell_id") or f"llm-plan-{i}")
        out.append({
            "smellId": smell_id,
            "severity": str(item.get("severity") or "MAJOR"),
            "location": str(item.get("location") or item.get("lines") or "see file"),
            "description": str(item.get("description") or item.get("rationale") or ""),
            "technique": str(item.get("technique") or item.get("refactoring") or "Extract Method"),
            "action": str(item.get("action") or item.get("steps") or ""),
            "priority": str(item.get("priority") or "HIGH"),
            "source": "llm_planner",
        })
    return out if out else fallback


async def call_llm_planning_agent(
    original: str,
    file_path: str,
    smells: List[Dict],
    rule_plan: List[Dict],
    *,
    model: Optional[str] = None,
    provider_id: Optional[str] = None,
) -> LLMAgentOutcome:
    """LLM agent: produce a prioritized refactoring plan from detected smells."""
    line_count = len(original.splitlines())
    public_api = build_public_api_signature(original)
    rule_summary = "\n".join(
        f"  - [{p.get('severity')}] {p.get('smellId')} → {p.get('technique')}"
        for p in (rule_plan or [])[:12]
    ) or "  (none)"

    system = """You are the Planning Agent in a multi-agent Java refactoring system.
Your job is to read static-analyzer smells and produce a concrete, ordered refactoring plan.
Output ONLY valid JSON — an array of plan objects. Do not write Java code.

Each plan object must have:
  smellId, severity, location, description, technique, action, priority (HIGH|MEDIUM|LOW)

Use Fowler-style techniques: Extract Method, Replace Magic Number, Introduce Parameter Object,
Replace Nested Conditional with Guard Clauses, Extract Class, Rename Method, etc.
Keep public API signatures unchanged. Prioritize high-severity smells first. Max 8 items."""

    user = f"""File: {file_path} ({line_count} lines)

DETECTED SMELLS:
{_smell_summary(smells)}

RULE-BASED DRAFT PLAN (improve or replace):
{rule_summary}

PUBLIC API (must not change):
{chr(10).join(public_api[:20]) if public_api else "(none detected)"}

Return JSON array of refactoring plan items."""

    outcome = await call_openrouter_agent(
        agent=PLANNER_AGENT,
        system=system,
        user=user,
        model=model,
        provider_id=provider_id,
        temperature=0.2,
        max_tokens=4096,
        expect_json=True,
        timeout_seconds=120,
    )
    if outcome.ok:
        outcome.parsed = _normalize_plan_items(outcome.parsed, rule_plan)
    return outcome


def _unified_diff_excerpt(a: str, b: str, max_lines: int = 120) -> str:
    diff = list(difflib.unified_diff(
        a.splitlines(), b.splitlines(), lineterm="", n=1
    ))
    if len(diff) <= max_lines:
        return "\n".join(diff)
    return "\n".join(diff[:max_lines] + [f"... ({len(diff) - max_lines} more diff lines)"])


async def call_llm_verification_agent(
    original: str,
    candidate: str,
    file_path: str,
    *,
    smells_before: int,
    smells_after: int,
    static_gates_passed: bool,
    rejection_reasons: List[str],
    model: Optional[str] = None,
    provider_id: Optional[str] = None,
) -> LLMAgentOutcome:
    """LLM agent: review refactor quality and behavioral preservation risk."""
    public_before = build_public_api_signature(original)
    public_after = build_public_api_signature(candidate)
    removed_api = sorted(set(public_before) - set(public_after))

    system = """You are the Verification Agent in a multi-agent Java refactoring system.
Review the proposed refactor against the original. You do NOT rewrite code.

Output ONLY valid JSON:
{
  "approved": true|false,
  "confidence": 0.0-1.0,
  "concerns": ["..."],
  "reasoning": "one short paragraph"
}

Approve when: public API preserved, smells did not increase materially, changes look structural not cosmetic,
no obvious behavioral regressions (removed catches, changed signatures, swallowed errors).
Reject when: API broken, cosmetic-only edits, likely behavior change, or smells clearly worse."""

    user = f"""File: {file_path}

SMELL COUNTS: {smells_before} → {smells_after}
STATIC GATES PASSED: {static_gates_passed}
STATIC REJECTION REASONS: {", ".join(rejection_reasons) if rejection_reasons else "(none)"}
PUBLIC API REMOVED: {", ".join(removed_api[:8]) if removed_api else "(none)"}
LINES: {len(original.splitlines())} → {len(candidate.splitlines())}

DIFF EXCERPT:
{_unified_diff_excerpt(original, candidate)}

Return JSON verdict."""

    outcome = await call_openrouter_agent(
        agent=VERIFIER_AGENT,
        system=system,
        user=user,
        model=model,
        provider_id=provider_id,
        temperature=0.1,
        max_tokens=2048,
        expect_json=True,
        timeout_seconds=120,
    )
    return outcome


def verifier_approved(outcome: Optional[LLMAgentOutcome]) -> Optional[bool]:
    if not outcome or not outcome.ok or not isinstance(outcome.parsed, dict):
        return None
    return bool(outcome.parsed.get("approved"))


def inject_llm_agent_meta(meta: Dict[str, Any], *, mode: str, planner, verifier) -> Dict[str, Any]:
    """Attach multi-LLM agent experiments to researchMetrics.meta."""
    meta = dict(meta or {})
    meta["multiLlmAgentMode"] = mode
    meta["llmAgentsUsed"] = ["planner", "refactorer", "verifier"] if mode == "full" else ["refactorer"]
    if planner is not None:
        meta["llmPlanner"] = planner.to_experiment_dict() if hasattr(planner, "to_experiment_dict") else planner
    if verifier is not None:
        meta["llmVerifier"] = verifier.to_experiment_dict() if hasattr(verifier, "to_experiment_dict") else verifier
    return meta
