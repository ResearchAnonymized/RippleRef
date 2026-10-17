package ai.refact.engine.analysis;

import java.util.List;

/**
 * Represents a class instantiation found in AST analysis.
 */
public class ClassInstantiationInfo {
    private String className;
    private List<String> arguments;
    private int lineNumber;
    
    // Getters and setters
    public String getClassName() { return className; }
    public void setClassName(String className) { this.className = className; }
    
    public List<String> getArguments() { return arguments; }
    public void setArguments(List<String> arguments) { this.arguments = arguments; }
    
    public int getLineNumber() { return lineNumber; }
    public void setLineNumber(int lineNumber) { this.lineNumber = lineNumber; }
    
    public int getArgumentCount() {
        return arguments != null ? arguments.size() : 0;
    }
    
    public String getSimpleClassName() {
        if (className == null) return null;
        int lastDot = className.lastIndexOf('.');
        return lastDot > 0 ? className.substring(lastDot + 1) : className;
    }
}
