package ai.refact.engine.analysis;

import java.util.List;

/**
 * Represents a method declaration found in AST analysis.
 */
public class MethodDeclaration {
    private String name;
    private int lineNumber;
    private int modifiers;
    private String returnType;
    private List<ParameterInfo> parameters;
    private List<String> annotations;
    private int complexity;
    
    // Getters and setters
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public int getLineNumber() { return lineNumber; }
    public void setLineNumber(int lineNumber) { this.lineNumber = lineNumber; }
    
    public int getModifiers() { return modifiers; }
    public void setModifiers(int modifiers) { this.modifiers = modifiers; }
    
    public String getReturnType() { return returnType; }
    public void setReturnType(String returnType) { this.returnType = returnType; }
    
    public List<ParameterInfo> getParameters() { return parameters; }
    public void setParameters(List<ParameterInfo> parameters) { this.parameters = parameters; }
    
    public List<String> getAnnotations() { return annotations; }
    public void setAnnotations(List<String> annotations) { this.annotations = annotations; }
    
    public int getComplexity() { return complexity; }
    public void setComplexity(int complexity) { this.complexity = complexity; }
    
    public boolean isPublic() {
        return (modifiers & 1) != 0; // Modifier.PUBLIC
    }
    
    public boolean isPrivate() {
        return (modifiers & 2) != 0; // Modifier.PRIVATE
    }
    
    public boolean isProtected() {
        return (modifiers & 4) != 0; // Modifier.PROTECTED
    }
    
    public boolean isAbstract() {
        return (modifiers & 1024) != 0; // Modifier.ABSTRACT
    }
    
    public boolean isFinal() {
        return (modifiers & 16) != 0; // Modifier.FINAL
    }
    
    public boolean isStatic() {
        return (modifiers & 8) != 0; // Modifier.STATIC
    }
    
    public int getParameterCount() {
        return parameters != null ? parameters.size() : 0;
    }
    
    public boolean isLongMethod(int threshold) {
        return complexity > threshold;
    }
    
    public boolean hasTooManyParameters(int threshold) {
        return getParameterCount() > threshold;
    }
}
