package ai.refact.api;

import java.nio.file.Path;
import java.util.List;

/**
 * Result of compiling a project.
 */
public record CompileResult(
    boolean success,
    List<CompileError> errors,
    List<CompileWarning> warnings,
    List<Path> compiledFiles,
    long compileTime
) {
    
    /**
     * Represents a compilation error.
     */
    public record CompileError(
        Path file,
        int line,
        int column,
        String message,
        String code
    ) {}
    
    /**
     * Represents a compilation warning.
     */
    public record CompileWarning(
        Path file,
        int line,
        int column,
        String message,
        String code
    ) {}
    
    /**
     * Check if compilation was successful.
     */
    public boolean isSuccessful() {
        return success && errors.isEmpty();
    }
    
    /**
     * Get the number of errors.
     */
    public int getErrorCount() {
        return errors.size();
    }
    
    /**
     * Get the number of warnings.
     */
    public int getWarningCount() {
        return warnings.size();
    }
    
    /**
     * Get all issues (errors and warnings combined).
     */
    public List<Object> getAllIssues() {
        return java.util.stream.Stream.concat(
            errors.stream().map(e -> (Object) e),
            warnings.stream().map(w -> (Object) w)
        ).toList();
    }
}
