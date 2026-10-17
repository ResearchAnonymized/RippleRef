package ai.refact.api;

public record PerformanceIssue(
    String type,
    String description,
    int line,
    int column,
    String impact,
    String optimization
) {}
