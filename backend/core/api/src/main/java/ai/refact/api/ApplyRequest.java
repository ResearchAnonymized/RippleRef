package ai.refact.api;

import java.util.List;

/**
 * Request parameters for applying a refactoring plan.
 */
public record ApplyRequest(
    List<String> selectedTransforms,
    boolean dryRun,
    boolean verifyResults
) {}
