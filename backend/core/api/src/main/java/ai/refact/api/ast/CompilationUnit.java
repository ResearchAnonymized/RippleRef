package ai.refact.api.ast;

import java.nio.file.Path;
import java.util.List;

/**
 * Represents a Java compilation unit (source file).
 */
public interface CompilationUnit {
    
    /**
     * Get the file path of this compilation unit.
     */
    Path getFilePath();
    
    /**
     * Get the package declaration.
     */
    String getPackageName();
    
    /**
     * Get all imports in this compilation unit.
     */
    List<ImportDeclaration> getImports();
    
    /**
     * Get all type declarations in this compilation unit.
     */
    List<TypeDeclaration> getTypes();
    
    /**
     * Get the source code content.
     */
    String getSource();
    
    /**
     * Get the line number for a given character offset.
     */
    int getLineNumber(int offset);
    
    /**
     * Get the column number for a given character offset.
     */
    int getColumnNumber(int offset);
}
