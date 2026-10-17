package ai.refact.api.ast;

import java.util.List;

/**
 * Represents a constructor declaration in Java.
 */
public interface ConstructorDeclaration {
    
    /**
     * Get the constructor name (same as class name).
     */
    String getName();
    
    /**
     * Get the constructor parameters.
     */
    List<Parameter> getParameters();
    
    /**
     * Get the constructor modifiers.
     */
    List<Modifier> getModifiers();
    
    /**
     * Get the constructor body.
     */
    String getBody();
    
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
}
