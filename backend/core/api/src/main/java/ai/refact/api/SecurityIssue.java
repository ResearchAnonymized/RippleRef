package ai.refact.api;

public record SecurityIssue(
    String type,
    String description,
    int line,
    int column,
    String severity,
    String recommendation
) {}
