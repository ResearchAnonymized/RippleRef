package ai.refact.engine.model;

/**
 * Enumeration of code smell categories for organizing and analyzing
 * detected issues. Based on Martin Fowler's classification system.
 */
public enum SmellCategory {
    BLOATER("Bloater", "Code that has grown too large and complex"),
    OBJECT_ORIENTATION_ABUSER("Object-Orientation Abuser", "Violations of object-oriented principles"),
    CHANGE_PREVENTER("Change Preventer", "Code that makes changes difficult or risky"),
    DISPENSABLE("Dispensable", "Code that is unnecessary or redundant"),
    COUPLER("Coupler", "Code that creates tight coupling between components"),
    ENCAPSULATION_ISSUE("Encapsulation Issue", "Violations of encapsulation principles"),
    HIERARCHY_ISSUE("Hierarchy Issue", "Problems with class hierarchies and inheritance"),
    CONCURRENCY_ISSUE("Concurrency Issue", "Problems related to concurrent execution"),
    PERFORMANCE_ISSUE("Performance Issue", "Code that may cause performance problems"),
    TESTING_ISSUE("Testing Issue", "Problems related to testing and testability"),
    SECURITY_ISSUE("Security Issue", "Potential security vulnerabilities"),
    MAINTAINABILITY_ISSUE("Maintainability Issue", "Code that is difficult to maintain"),
    ENCAPSULATION("Encapsulation", "Violations of encapsulation principles"),
    CONCURRENCY("Concurrency", "Problems related to concurrent execution"),
    HIERARCHY_ARCHITECTURE("Hierarchy Architecture", "Problems with class hierarchies and architecture");
    
    private final String displayName;
    private final String description;
    
    SmellCategory(String displayName, String description) {
        this.displayName = displayName;
        this.description = description;
    }
    
    public String getDisplayName() {
        return displayName;
    }
    
    public String getDescription() {
        return description;
    }
    
    @Override
    public String toString() {
        return displayName;
    }
}
