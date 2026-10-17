package ai.refact.api;

import java.nio.file.Path;

/**
 * Pointer to a specific location in code.
 */
public record CodePointer(
    Path file,
    String className,
    String methodName,
    int startLine,
    int endLine,
    int startColumn,
    int endColumn
) {}
