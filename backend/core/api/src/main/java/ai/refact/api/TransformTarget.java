package ai.refact.api;

import ai.refact.api.ast.MethodDeclaration;
import ai.refact.api.ast.TypeDeclaration;
import java.nio.file.Path;

/**
 * Represents a target for a refactoring transform.
 */
public record TransformTarget(
    TargetType type,
    Path file,
    TypeDeclaration typeDeclaration,
    MethodDeclaration methodDeclaration,
    String symbolName,
    int startPosition,
    int endPosition
) {
    
    /**
     * Types of transform targets.
     */
    public enum TargetType {
        METHOD,
        CLASS,
        FIELD,
        PARAMETER,
        VARIABLE,
        IMPORT,
        PACKAGE
    }
    
    /**
     * Create a target for a method.
     */
    public static TransformTarget forMethod(MethodDeclaration method) {
        return new TransformTarget(
            TargetType.METHOD,
            method.getContainingType().getCompilationUnit().getFilePath(),
            method.getContainingType(),
            method,
            method.getName(),
            method.getStartPosition(),
            method.getEndPosition()
        );
    }
    
    /**
     * Create a target for a class.
     */
    public static TransformTarget forClass(TypeDeclaration type) {
        return new TransformTarget(
            TargetType.CLASS,
            type.getCompilationUnit().getFilePath(),
            type,
            null,
            type.getSimpleName(),
            type.getStartPosition(),
            type.getEndPosition()
        );
    }
    
    /**
     * Create a target for a symbol at a specific position.
     */
    public static TransformTarget forSymbol(Path file, String symbolName, int startPosition, int endPosition) {
        return new TransformTarget(
            TargetType.VARIABLE,
            file,
            null,
            null,
            symbolName,
            startPosition,
            endPosition
        );
    }
}
