package ai.refact.api;

/**
 * Summary information about a refactoring plan.
 */
public record PlanSummary(
    int totalTransforms,
    double estimatedPayoff,
    double estimatedRisk,
    double estimatedCost,
    long timestamp
) {}
