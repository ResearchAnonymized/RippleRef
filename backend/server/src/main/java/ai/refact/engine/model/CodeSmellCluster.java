package ai.refact.engine.model;

/**
 * Enumeration of code smell clusters for hierarchical organization.
 * Based on Martin Fowler's classification system and industry standards.
 */
public enum CodeSmellCluster {
    CLASS_LEVEL("Class-Level", "Structural class issues affecting class design and responsibilities"),
    METHOD_LEVEL("Method-Level", "Method design problems affecting readability and maintainability"),
    DESIGN_LEVEL("Design-Level", "Architectural issues affecting system structure"),
    CODE_LEVEL("Code-Level", "Implementation issues affecting code quality"),
    ARCHITECTURAL("Architectural", "System-wide problems affecting overall architecture");
    
    private final String displayName;
    private final String description;
    
    CodeSmellCluster(String displayName, String description) {
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
