package ai.refact.engine.model;

/**
 * Enumeration of code smell impacts for prioritizing fixes.
 * Helps developers understand the business and technical impact of each smell.
 */
public enum SmellImpact {
    MAINTAINABILITY("Maintainability", "Affects code maintenance and future changes", "HIGH"),
    PERFORMANCE("Performance", "Affects system performance and efficiency", "MEDIUM"),
    SECURITY("Security", "Potential security vulnerabilities and risks", "CRITICAL"),
    TESTABILITY("Testability", "Affects testing ability and code coverage", "MEDIUM"),
    READABILITY("Readability", "Affects code readability and understanding", "LOW"),
    SCALABILITY("Scalability", "Affects system scalability and growth", "HIGH"),
    RELIABILITY("Reliability", "Affects system stability and reliability", "HIGH");
    
    private final String displayName;
    private final String description;
    private final String priority;
    
    SmellImpact(String displayName, String description, String priority) {
        this.displayName = displayName;
        this.description = description;
        this.priority = priority;
    }
    
    public String getDisplayName() {
        return displayName;
    }
    
    public String getDescription() {
        return description;
    }
    
    public String getPriority() {
        return priority;
    }
    
    @Override
    public String toString() {
        return displayName;
    }
}
