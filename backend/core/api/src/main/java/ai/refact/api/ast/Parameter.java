package ai.refact.api.ast;

import java.util.List;

/**
 * Represents a method parameter in Java.
 */
public interface Parameter {
    
    /**
     * Get the parameter name.
     */
    String getName();
    
    /**
     * Get the parameter type.
     */
    String getType();
    
    /**
     * Get the parameter modifiers.
     */
    List<Modifier> getModifiers();
    
    /**
     * Check if this is a varargs parameter.
     */
    boolean isVarargs();
    
    /**
     * Get the start position in the source file.
     */
    int getStartPosition();
    
    /**
     * Get the end position in the source file.
     */
    int getEndPosition();
}
