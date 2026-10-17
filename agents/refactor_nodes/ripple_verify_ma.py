"""A5 Ripple Risk Verifier — same apply-and-verify endpoint as B0 measurement protocol."""
from __future__ import annotations

from agent_registry import agent_by_node_id

MA_VARIANT = "MA"


async def run_ripple_verify_ma(pipeline) -> None:
    agent = agent_by_node_id("ripple_verify")
    pipeline.current_node_id = "ripple_verify"

    if not getattr(pipeline, "ma_study_mode", False):
        return

    study_id = getattr(pipeline, "ma_study_id", None) or "ma_ref_master"
    model_id = pipeline.provider_model or pipeline.hooks.MODEL
    variant = MA_VARIANT

    await pipeline.ensure_client()
    pipeline.add_step(
        node_id="ripple_verify",
        name="Ripple Verify",
        agent=agent.display_name if agent else "Ripple Risk Verifier",
        status="running",
        startedAt=pipeline.hooks.now(),
    )
    await pipeline.publish_detail("Ripple Risk Verifier: L1–L2 apply-and-verify...", "info")

    run_meta = {
        "orchestration": "multi_agent",
        "graphVersion": getattr(pipeline, "ma_graph_version", "2.0"),
        "multiLlmAgentMode": "full",
        "agentStepCount": len(pipeline.steps_models),
        "cohortId": getattr(pipeline, "ma_cohort_id", None),
    }
    if pipeline.llm_plan_outcome is not None:
        run_meta["llmPlanStatus"] = "ok" if pipeline.llm_plan_outcome.ok else "failed"
    run_meta["staticVerifyAccept"] = bool(pipeline.accept)

    try:
        await pipeline.hooks.backend_post(
            pipeline.client,
            f"/ripple-ref/studies/{study_id}/live-candidate",
            {
                "workspaceId": pipeline.req.workspaceId,
                "filePath": pipeline.req.filePath,
                "modelId": model_id,
                "variant": variant,
                "phase": "ripple_verification",
            },
        )
        report = await pipeline.hooks.backend_post(
            pipeline.client,
            f"/ripple-ref/studies/{study_id}/apply-and-verify",
            {
                "workspaceId": pipeline.req.workspaceId,
                "filePath": pipeline.req.filePath,
                "modelId": model_id,
                "variant": variant,
                "candidateCode": pipeline.candidate or None,
                "runMeta": run_meta,
            },
        )
        pipeline.ripple_report = report if isinstance(report, dict) else {"raw": report}
        risk = pipeline.ripple_report.get("riskLevel") if isinstance(pipeline.ripple_report, dict) else None
        broken = pipeline.ripple_report.get("observedBrokenCallerCount") if isinstance(pipeline.ripple_report, dict) else None
        pipeline.steps_models[-1].status = "done"
        pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
        pipeline.steps_models[-1].details = {
            "riskLevel": risk,
            "observedBrokenCallerCount": broken,
            "verificationLevel": pipeline.ripple_report.get("verificationLevel") if isinstance(pipeline.ripple_report, dict) else None,
        }
        await pipeline.publish_detail(
            f"Ripple Risk Verifier: risk={risk}, broken_callers={broken}",
            "success" if risk != "High" else "warning",
        )
    except Exception as exc:
        pipeline.ripple_report = {"error": str(exc)}
        pipeline.steps_models[-1].status = "error"
        pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
        pipeline.steps_models[-1].error = str(exc)[:200]
        await pipeline.publish_detail(f"Ripple Risk Verifier error: {str(exc)[:100]}", "error")
