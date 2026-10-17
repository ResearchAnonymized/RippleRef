package ai.refact.api;

import ai.refact.api.ast.CompilationUnit;
import ai.refact.api.ast.TypeDeclaration;
import ai.refact.api.ast.MethodDeclaration;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

/**
 * Abstract representation of code structure and AST.
 */
public interface CodeModel {
    
    /**
     * Get all compilation units in the model.
     */
    List<CompilationUnit> getCompilationUnits();
    
    /**
     * Get a compilation unit by file path.
     */
    Optional<CompilationUnit> getCompilationUnit(Path file);
    
    /**
     * Get all classes in the model.
     */
    List<TypeDeclaration> getClasses();
    
    /**
     * Get all methods in the model.
     */
    List<MethodDeclaration> getMethods();
    
    /**
     * Find a class by fully qualified name.
     */
    Optional<TypeDeclaration> findClass(String fullyQualifiedName);
    
    /**
     * Find a method by class and method name.
     */
    Optional<MethodDeclaration> findMethod(String className, String methodName);
    
    /**
     * Get the project root path.
     */
    Path getProjectRoot();
    
    /**
     * Get source files in the model.
     */
    List<Path> getSourceFiles();
    
    /**
     * Get test files in the model.
     */
    List<Path> getTestFiles();
}
