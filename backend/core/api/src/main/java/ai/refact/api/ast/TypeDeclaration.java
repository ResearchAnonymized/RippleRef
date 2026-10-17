package ai.refact.api.ast;

import java.util.List;

/**
 * Represents a type declaration (class, interface, enum) in Java.
 */
public interface TypeDeclaration {
    
    /**
     * Get the simple name of this type.
     */
    String getSimpleName();
    
    /**
     * Get the fully qualified name of this type.
     */
    String getQualifiedName();
    
    /**
     * Get the kind of type (CLASS, INTERFACE, ENUM, ANNOTATION).
     */
    TypeKind getKind();
    
    /**
     * Get all fields in this type.
     */
    List<FieldDeclaration> getFields();
    
    /**
     * Get all methods in this type.
     */
    List<MethodDeclaration> getMethods();
    
    /**
     * Get all constructors in this type.
     */
    List<ConstructorDeclaration> getConstructors();
    
    /**
     * Get the superclass name, if any.
     */
    String getSuperclass();
    
    /**
     * Get all implemented interfaces.
     */
    List<String> getInterfaces();
    
    /**
     * Get the start position in the source file.
     */
    int getStartPosition();
    
    /**
     * Get the end position in the source file.
     */
    int getEndPosition();
    
    /**
     * Get the compilation unit containing this type.
     */
    CompilationUnit getCompilationUnit();
}
