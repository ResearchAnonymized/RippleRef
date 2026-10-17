"""Prepare a revise loop: pack verifier feedback for the next editor pass."""
from __future__ import annotations

from agent_registry import agent_by_node_id


def _feedback_from_verifier(pipeline) -> str:
    outcome = getattr(pipeline, "llm_verify_outcome", None)
    if outcome is None:
        return "Previous candidate was rejected. Improve structural quality while preserving public API."
    parsed = getattr(outcome, "parsed", None)
    if not isinstance(parsed, dict):
        msg = getattr(outcome, "message", "") or ""
        return f"Verifier rejected the candidate. {msg}".strip()
    concerns = parsed.get("concerns") or []
    if isinstance(concerns, list):
        concern_txt = "; ".join(str(c) for c in concerns[:6] if c)
    else:
        concern_txt = str(concerns)
    reasoning = str(parsed.get("reasoning") or "").strip()
    parts = [
        f"[REVISE PASS {getattr(pipeline, 'revise_count', 0)}] LLM Verification Agent rejected the candidate.",
    ]
    if concern_txt:
        parts.append(f"Concerns: {concern_txt}")
    if reasoning:
        parts.append(f"Reasoning: {reasoning}")
    parts.append("Produce a revised Java file that addresses these issues. Keep public API signatures unchanged.")
    return "\n".join(parts)


async def run_prepare_revise(pipeline) -> None:
    """Increment revise counter and stash feedback used by the next refactor node."""
    agent = agent_by_node_id("prepare_revise")
    pipeline.current_node_id = "prepare_revise"
    pipeline.revise_count = int(getattr(pipeline, "revise_count", 0) or 0) + 1
    pipeline.revise_feedback = _feedback_from_verifier(pipeline)

    pipeline.add_step(
        node_id="prepare_revise",
        name="Revise",
        agent=agent.display_name if agent else "Revise Coordinator",
        status="running",
        startedAt=pipeline.hooks.now(),
    )
    await pipeline.publish_detail(
        f"Revise loop {pipeline.revise_count}: sending verifier feedback back to the editor",
        "warning",
    )
    pipeline.steps_models[-1].status = "done"
    pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
    pipeline.steps_models[-1].details = {
        "reviseCount": pipeline.revise_count,
        "feedbackPreview": (pipeline.revise_feedback or "")[:240],
    }
