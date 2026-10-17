"""A2 Dependency Context Agent — same backend data as B0-V2 prompt injection."""
from __future__ import annotations

from agent_registry import agent_by_node_id


async def run_dependency_context(pipeline) -> None:
    agent = agent_by_node_id("dependency_context")
    pipeline.current_node_id = "dependency_context"

    if not getattr(pipeline, "ma_study_mode", False):
        return

    study_id = getattr(pipeline, "ma_study_id", None) or "ma_ref_master"
    await pipeline.ensure_client()
    pipeline.add_step(
        node_id="dependency_context",
        name="Dependency Context",
        agent=agent.display_name if agent else "Dependency Context Agent",
        status="running",
        startedAt=pipeline.hooks.now(),
    )
    await pipeline.publish_detail("Dependency Context Agent: loading caller/API exposure...", "analysis")

    try:
        ctx = await pipeline.hooks.backend_get(
            pipeline.client,
            f"/ripple-ref/studies/{study_id}/dependency-context",
            params={
                "workspaceId": pipeline.req.workspaceId,
                "filePath": pipeline.req.filePath,
            },
        )
        pipeline.dependency_context = ctx if isinstance(ctx, dict) else {"contextText": str(ctx or "")}
        text = pipeline.dependency_context.get("contextText") or ""
        pipeline.dependency_context_text = text
        fan_in = pipeline.dependency_context.get("fanIn")
        callers = pipeline.dependency_context.get("callerFiles") or []
        pipeline.steps_models[-1].status = "done"
        pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
        pipeline.steps_models[-1].details = {
            "fanIn": fan_in,
            "callerFileCount": len(callers) if isinstance(callers, list) else 0,
            "contextBytes": len(text),
            "studyId": study_id,
        }
        await pipeline.publish_detail(
            f"Dependency Context Agent: fan-in={fan_in}, callers={len(callers) if isinstance(callers, list) else 0}",
            "success",
        )
    except Exception as exc:
        pipeline.steps_models[-1].status = "error"
        pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
        pipeline.steps_models[-1].error = str(exc)[:200]
        pipeline.dependency_context = {}
        pipeline.dependency_context_text = ""
        await pipeline.publish_detail(f"Dependency Context Agent error: {str(exc)[:100]}", "warning")
