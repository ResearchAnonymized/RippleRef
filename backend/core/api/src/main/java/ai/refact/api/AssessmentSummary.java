package ai.refact.api;

/**
 * Summary information about an assessment.
 */
public record AssessmentSummary(
    int totalFindings,
    int blockerFindings,
    int criticalFindings,
    int majorFindings,
    int minorFindings,
    double maintainabilityIndex,
    int totalFiles,
    int totalLines
) {}
