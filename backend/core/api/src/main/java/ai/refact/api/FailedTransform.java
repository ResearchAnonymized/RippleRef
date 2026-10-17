package ai.refact.api;

/**
 * Represents a failed transform.
 */
public record FailedTransform(
    String transformId,
    String error,
    long timestamp
) {}
