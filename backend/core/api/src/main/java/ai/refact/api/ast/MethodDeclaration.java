package ai.refact.api.ast;

import java.util.List;

/**
 * Represents a method declaration in Java.
 */
public interface MethodDeclaration {
    
    /**
     * Get the method name.
     */
    String getName();
    
    /**
     * Get the return type.
     */
    String getReturnType();
    
    /**
     * Get the method parameters.
     */
    List<Parameter> getParameters();
    
    /**
     * Get the method modifiers.
     */
    List<Modifier> getModifiers();
    
    /**
     * Get the method body.
     */
    String getBody();
    
    /**
     * Get the number of lines in the method.
     */
    int getLineCount();
    
    /**
     * Get the cyclomatic complexity.
     */
    int getComplexity();
    
    /**
     * Get the start position in the source file.
     */
    int getStartPosition();
    
    /**
     * Get the end position in the source file.
     */
    int getEndPosition();
    
    /**
     * Get the containing type.
     */
    TypeDeclaration getContainingType();
    
    /**
     * Check if this is a constructor.
     */
    boolean isConstructor();
    
    /**
     * Check if this is a static method.
     */
    boolean isStatic();
    
    /**
     * Check if this is an abstract method.
     */
    boolean isAbstract();
}
