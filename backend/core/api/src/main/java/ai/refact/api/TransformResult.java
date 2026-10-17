package ai.refact.api;

import java.util.List;

/**
 * Result of applying a single transform.
 */
public record TransformResult(
    String transformId,
    List<FileChange> changes,
    VerificationResult verification,
    long timestamp
) {}
