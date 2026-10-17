package ai.refact.api;

import java.util.List;

/**
 * Code quality metrics for before/after comparison.
 */
public record CodeQualityMetrics(
    int linesOfCode,
    int cyclomaticComplexity,
    int cognitiveComplexity,
    int methodCount,
    int classCount,
    int commentLines,
    int blankLines,
    double maintainabilityIndex,
    int codeSmells,
    List<String> staticAnalysisWarnings
) {}
