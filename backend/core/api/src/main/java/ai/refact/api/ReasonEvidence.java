package ai.refact.api;

import java.util.Map;

/**
 * Evidence of a refactoring reason found by a detector.
 */
public record ReasonEvidence(
    String detectorId,
    CodePointer pointer,
    Map<String, Object> metrics,
    String summary,
    Severity severity
) {}
