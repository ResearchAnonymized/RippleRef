package ai.refact.api;

import java.util.List;

/**
 * Represents the results of a code assessment.
 */
public record Assessment(
    String projectId,
    List<ReasonEvidence> evidences,
    AssessmentSummary summary,
    ProjectMetrics metrics,
    long timestamp
) {}
