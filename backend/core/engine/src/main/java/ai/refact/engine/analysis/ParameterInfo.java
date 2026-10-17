package ai.refact.engine.analysis;

/**
 * Represents a method parameter found in AST analysis.
 */
public class ParameterInfo {
    private String name;
    private String type;
    private int modifiers;
    
    // Getters and setters
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    
    public int getModifiers() { return modifiers; }
    public void setModifiers(int modifiers) { this.modifiers = modifiers; }
    
    public boolean isFinal() {
        return (modifiers & 16) != 0; // Modifier.FINAL
    }
}
