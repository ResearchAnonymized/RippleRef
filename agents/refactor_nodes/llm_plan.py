"""LLM Planning Agent node."""
from __future__ import annotations

from agent_registry import agent_by_node_id


async def run_llm_plan(pipeline) -> None:
    agent = agent_by_node_id("llm_plan")
    pipeline.current_node_id = "llm_plan"

    if not pipeline.hooks.is_multi_llm_agent_mode():
        return

    if not pipeline.refactoring_plan or not pipeline.original.strip():
        return

    await pipeline.ensure_client()
    pipeline.add_step(
        node_id="llm_plan",
        name="Smell Analysis",
        agent=agent.display_name if agent else "LLM Planning Agent",
        status="running",
        startedAt=pipeline.hooks.now(),
    )
    await pipeline.publish_detail("LLM Planning Agent: building smell-aware plan...", "analysis")

    try:
        plan_out = await pipeline.hooks.call_llm_planning_agent(
            pipeline.original,
            pipeline.req.filePath,
            pipeline.smells,
            pipeline.refactoring_plan,
            model=pipeline.provider_model,
            provider_id=pipeline.provider_id,
        )
        pipeline.llm_plan_outcome = plan_out
        details = {"llmPlanner": plan_out.to_experiment_dict(), "planSource": "rule_fallback"}

        if plan_out.ok and isinstance(plan_out.parsed, list) and plan_out.parsed:
            pipeline.refactoring_plan = plan_out.parsed
            details["planSource"] = "llm"
            details["smellsAnalyzed"] = len(pipeline.refactoring_plan)
            await pipeline.publish_detail(
                f"LLM Planning Agent: {len(pipeline.refactoring_plan)} prioritized items",
                "success",
            )
        elif not plan_out.ok:
            await pipeline.publish_detail(
                f"LLM Planning Agent failed — using rule-based plan ({plan_out.message[:80]})",
                "warning",
            )

        pipeline.steps_models[-1].status = "done"
        pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
        pipeline.steps_models[-1].details = details
    except Exception as exc:
        pipeline.steps_models[-1].status = "error"
        pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
        pipeline.steps_models[-1].error = str(exc)[:200]
        await pipeline.publish_detail(f"LLM Planning Agent error: {str(exc)[:100]}", "warning")
