package ai.refact.api;

import java.util.Map;

/**
 * Request parameters for performing an assessment.
 */
public record AssessmentRequest(
    Map<String, Object> options,
    boolean includeMetrics,
    boolean includeDetails
) {}
