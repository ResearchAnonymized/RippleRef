package ai.refact.api;

import java.util.List;

/**
 * Results of applying a refactoring plan.
 */
public record ApplyResult(
    String projectId,
    List<TransformResult> results,
    List<FailedTransform> failures,
    VerificationResult verification,
    long timestamp
) {}
