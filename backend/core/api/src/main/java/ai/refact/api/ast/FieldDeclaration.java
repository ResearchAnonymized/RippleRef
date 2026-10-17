package ai.refact.api.ast;

import java.util.List;

/**
 * Represents a field declaration in Java.
 */
public interface FieldDeclaration {
    
    /**
     * Get the field name.
     */
    String getName();
    
    /**
     * Get the field type.
     */
    String getType();
    
    /**
     * Get the field modifiers.
     */
    List<Modifier> getModifiers();
    
    /**
     * Get the initializer expression, if any.
     */
    String getInitializer();
    
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
