package ai.refact.api;

import java.util.Map;

/**
 * Request parameters for generating a refactoring plan.
 */
public record PlanRequest(
    Map<String, Object> options,
    boolean includePreview,
    boolean includeConflicts
) {}
