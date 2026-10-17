"""Rule-based Refactoring Planner agent node."""
from __future__ import annotations

from planning import build_rule_refactoring_plan


async def run_rule_plan(pipeline) -> None:
    from file_size_policy import assess_refactor_feasibility

    pipeline.current_node_id = "plan"
    await pipeline.ensure_client()
    pipeline.add_step(
        node_id="plan",
        name="Smell Analysis",
        agent="Refactoring Planner",
        status="running",
        startedAt=pipeline.hooks.now(),
    )
    await pipeline.publish_detail(
        "Prioritizing smells by impact and safety (Fowler's catalog)...",
        "analysis",
    )
    pipeline.refactoring_plan = []

    try:
        selected_ids = None
        if hasattr(pipeline.req, "selectedSmells") and pipeline.req.selectedSmells:
            selected_ids = list(pipeline.req.selectedSmells)

        pipeline.refactoring_plan, meta = build_rule_refactoring_plan(
            pipeline.smells,
            map_smell_to_refactoring=pipeline.hooks.map_smell_to_refactoring,
            normalize_severity=pipeline.hooks.normalize_smell_severity,
            selected_smell_ids=selected_ids,
        )
        pipeline.steps_models[-1].status = "done"
        pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
        pipeline.steps_models[-1].details = meta

        high_p = [p for p in pipeline.refactoring_plan if p.get("priority") == "HIGH"]
        await pipeline.publish_detail(
            f"Selected {len(pipeline.refactoring_plan)} smells to fix ({len(high_p)} high priority)",
            "analysis",
        )
        for p in pipeline.refactoring_plan[:6]:
            await pipeline.publish_detail(
                f"  [{p['severity']}] {p['smellId']} → {p['technique']}",
                "smell",
            )
    except Exception as exc:
        pipeline.steps_models[-1].status = "error"
        pipeline.steps_models[-1].endedAt = pipeline.hooks.now()
        pipeline.steps_models[-1].error = str(exc)
        pipeline.refactoring_plan = []

    pipeline.file_feasibility = assess_refactor_feasibility(
        pipeline.original,
        smell_count=len(pipeline.smells) if pipeline.smells else 0,
    )
    pipeline.file_failure_outcome = None
