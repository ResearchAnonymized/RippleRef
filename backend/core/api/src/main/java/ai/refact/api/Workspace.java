package ai.refact.api;

/**
 * Represents a workspace containing a Java project.
 */
public record Workspace(
    String id,
    String name,
    int sourceFiles,
    int testFiles,
    long createdAt
) {}
