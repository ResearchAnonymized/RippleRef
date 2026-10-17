package ai.refact.engine.analysis;

/**
 * Represents an import statement found in AST analysis.
 */
public class ImportInfo {
    private String name;
    private boolean isStatic;
    private boolean isWildcard;
    private int lineNumber;
    
    // Getters and setters
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public boolean isStatic() { return isStatic; }
    public void setStatic(boolean isStatic) { this.isStatic = isStatic; }
    
    public boolean isWildcard() { return isWildcard; }
    public void setWildcard(boolean isWildcard) { this.isWildcard = isWildcard; }
    
    public int getLineNumber() { return lineNumber; }
    public void setLineNumber(int lineNumber) { this.lineNumber = lineNumber; }
    
    public String getPackageName() {
        if (name == null) return null;
        int lastDot = name.lastIndexOf('.');
        return lastDot > 0 ? name.substring(0, lastDot) : "";
    }
    
    public String getSimpleName() {
        if (name == null) return null;
        int lastDot = name.lastIndexOf('.');
        return lastDot > 0 ? name.substring(lastDot + 1) : name;
    }
}
