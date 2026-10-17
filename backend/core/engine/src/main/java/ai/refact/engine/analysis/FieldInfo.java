package ai.refact.engine.analysis;

/**
 * Represents a field declaration found in AST analysis.
 */
public class FieldInfo {
    private String name;
    private String type;
    private int modifiers;
    private int lineNumber;
    
    // Getters and setters
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    
    public int getModifiers() { return modifiers; }
    public void setModifiers(int modifiers) { this.modifiers = modifiers; }
    
    public int getLineNumber() { return lineNumber; }
    public void setLineNumber(int lineNumber) { this.lineNumber = lineNumber; }
    
    public boolean isPublic() {
        return (modifiers & 1) != 0; // Modifier.PUBLIC
    }
    
    public boolean isPrivate() {
        return (modifiers & 2) != 0; // Modifier.PRIVATE
    }
    
    public boolean isProtected() {
        return (modifiers & 4) != 0; // Modifier.PROTECTED
    }
    
    public boolean isFinal() {
        return (modifiers & 16) != 0; // Modifier.FINAL
    }
    
    public boolean isStatic() {
        return (modifiers & 8) != 0; // Modifier.STATIC
    }
    
    public boolean isVolatile() {
        return (modifiers & 64) != 0; // Modifier.VOLATILE
    }
    
    public boolean isTransient() {
        return (modifiers & 128) != 0; // Modifier.TRANSIENT
    }
}
