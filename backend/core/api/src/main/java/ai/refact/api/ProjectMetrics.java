package ai.refact.api;

import java.util.Map;

/**
 * Metrics about a project.
 */
public record ProjectMetrics(
    int totalFiles,
    int totalLines,
    int totalFindings,
    Map<String, Long> findingsBySeverity,
    Map<String, Long> findingsByCategory,
    double maintainabilityIndex
) {}
