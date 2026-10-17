package ai.refact.engine.analysis;

import java.util.List;

/**
 * Represents a class declaration found in AST analysis.
 */
public class ClassDeclaration {
    private String name;
    private int lineNumber;
    private int modifiers;
    private String superclass;
    private List<String> interfaces;
    private List<String> annotations;
    
    // Getters and setters
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public int getLineNumber() { return lineNumber; }
    public void setLineNumber(int lineNumber) { this.lineNumber = lineNumber; }
    
    public int getModifiers() { return modifiers; }
    public void setModifiers(int modifiers) { this.modifiers = modifiers; }
    
    public String getSuperclass() { return superclass; }
    public void setSuperclass(String superclass) { this.superclass = superclass; }
    
    public List<String> getInterfaces() { return interfaces; }
    public void setInterfaces(List<String> interfaces) { this.interfaces = interfaces; }
    
    public List<String> getAnnotations() { return annotations; }
    public void setAnnotations(List<String> annotations) { this.annotations = annotations; }
    
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
}
