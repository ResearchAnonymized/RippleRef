package ai.refact.api;

import java.util.Map;

/**
 * Result of verifying refactoring changes.
 */
public record VerificationResult(
    boolean success,
    String message,
    Map<String, Object> metrics
) {}
