package ai.refact.engine.model;

/**
 * Enumeration of code smell severity levels for prioritizing
 * refactoring efforts and understanding impact.
 */
public enum SmellSeverity {
    CRITICAL("Critical", "Immediate attention required - high risk of bugs or maintenance issues", 1),
    MAJOR("Major", "Significant impact on code quality and maintainability", 2),
    MINOR("Minor", "Minor issues that should be addressed when convenient", 3),
    INFO("Info", "Informational - suggestions for improvement", 4);
    
    private final String displayName;
    private final String description;
    private final int priority;
    
    SmellSeverity(String displayName, String description, int priority) {
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
    
    public int getPriority() {
        return priority;
    }
    
    @Override
    public String toString() {
        return displayName;
    }
}
