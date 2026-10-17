package ai.refact.api.ast;

/**
 * Represents an import declaration in Java.
 */
public interface ImportDeclaration {
    
    /**
     * Get the fully qualified name being imported.
     */
    String getQualifiedName();
    
    /**
     * Check if this is a static import.
     */
    boolean isStatic();
    
    /**
     * Check if this is a wildcard import (ends with .*).
     */
    boolean isWildcard();
    
    /**
     * Get the start position in the source file.
     */
    int getStartPosition();
    
    /**
     * Get the end position in the source file.
     */
    int getEndPosition();
}
