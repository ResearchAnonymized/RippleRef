package ai.refact.api;

import java.nio.file.Path;

/**
 * Represents a change made to a file.
 */
public record FileChange(
    Path file,
    ChangeType type,
    String description,
    long timestamp
) {
    
    /**
     * Type of file change.
     */
    public enum ChangeType {
        MODIFY,
        CREATE,
        DELETE,
        RENAME
    }
}
