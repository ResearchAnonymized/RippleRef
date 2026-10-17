package ai.refact.api;

/**
 * Categories of refactoring reasons.
 */
public enum ReasonCategory {
    DESIGN,      // Long method, god class, feature envy, data clumps
    SECURITY,    // Security vulnerabilities, unsafe practices
    PERFORMANCE, // Performance bottlenecks, inefficient patterns
    API,         // Deprecated APIs, breaking changes
    TESTING,     // Test coverage, test quality
    HOTSPOT      // High churn × complexity areas
}
