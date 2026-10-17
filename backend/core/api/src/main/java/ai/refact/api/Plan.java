package ai.refact.api;

import java.util.List;

/**
 * Represents a refactoring plan.
 */
public record Plan(
    String projectId,
    List<PlannedTransform> transforms,
    PlanSummary summary,
    long timestamp
) {}
