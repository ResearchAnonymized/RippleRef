"""LLM Verification Agent node."""
from __future__ import annotations

from agent_registry import agent_by_node_id
from verification_gates import apply_llm_verifier_to_accept


async def run_llm_verify(pipeline) -> None:
    agent = agent_by_node_id("llm_verify")
    pipeline.current_node_id = "llm_verify"

    if not pipeline.hooks.is_multi_llm_agent_mode():
        return

    if pipeline.candidate.strip() == pipeline.original.strip():
        return

    await pipeline.ensure_client()
    pipeline.add_step(
        node_id="llm_verify",
        name="Verify",
        agent=agent.display_name if agent else "LLM Verification Agent",
        status="running",
        startedAt=pipeline.hooks.now(),
    )
    await pipeline.publish_detail("LLM Verification Agent: reviewing candidate...", "info")

    rejection_reasons: list[str] = []
    if pipeline.verify_step_details and isinstance(pipeline.verify_step_details.get("verification"), dict):
        rr = pipeline.verify_step_details["verification"].get("rejectionReason")
        if rr:
            rejection_reasons = [x.strip() for x in str(rr).split(",") if x.strip()]

    try:
        verify_out = await pipeline.hooks.call_llm_verification_agent(
            pipeline.original,
            pipeline.candidate,
            pipeline.req.filePath,
            smells_before=pipeline.before_count,
            smells_after=pipeline.after_count,
            static_gates_passed=pipeline.accept,
            rejection_reasons=rejection_reasons,
            model=pipeline.provider_model,
            provider_id=pipeline.provider_id,
        )
        pipeline.llm_verify_outcome = verify_out
        parsed = verify_out.parsed if verify_out.ok else None
        pipeline.accept, merged_reasons = apply_llm_verifier_to_accept(
            pipeline.accept,
            rejection_reasons,
            parsed if isinstance(parsed, dict) else None,
        )

        if isinstance(parsed, dict) and parsed.get("approved") is False and pipeline.accept is False:
            await pipeline.publish_detail(
                "LLM Verification Agent rejected candidate (overrides static pass)",
                "warning",
            )
        elif isinstance(parsed, dict) and parsed.get("approved") is True:
            await pipeline.publish_detail("LLM Verification Agent approved candidate", "success")
        elif not verify_out.ok:
            await pipeline.publish_detail(
                f"LLM Verification Agent unavailable — static gates only ({verify_out.message[:60]})",
                "warning",
            )

        if pipeline.verify_step_details and isinstance(pipeline.verify_step_details.get("verification"), dict):
            pipeline.verify_step_details["verification"]["llmVerifier"] = verify_out.to_experiment_dict()
            pipeline.verify_step_details["verification"]["rejectionReason"] = (
                None if pipeline.accept else ", ".join(merged_reasons)
            )
            pipeline.verify_step_details["accepted"] = pipeline.accept

        pipeline.steps_models[-1].status = "done"
        pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
        pipeline.steps_models[-1].details = {
            "llmVerifier": verify_out.to_experiment_dict(),
            "accepted": pipeline.accept,
        }
    except Exception as exc:
        pipeline.steps_models[-1].status = "error"
        pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
        pipeline.steps_models[-1].error = str(exc)[:200]
        await pipeline.publish_detail(f"LLM Verification Agent error: {str(exc)[:80]}", "warning")
