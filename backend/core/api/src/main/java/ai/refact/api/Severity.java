package ai.refact.api;

/**
 * Severity levels for refactoring reasons.
 */
public enum Severity {
    INFO,     // Informational, no action required
    MINOR,    // Minor improvement opportunity
    MAJOR,    // Significant improvement opportunity
    CRITICAL, // Important improvement, should address soon
    BLOCKER   // Critical issue, should address immediately
}
