package ai.refact.api;

import java.nio.file.Path;
import java.util.List;

/**
 * Preview of what a refactoring transform would do.
 */
public record TransformPreview(
    String description,
    List<FileChange> changes,
    List<String> warnings,
    double risk,
    double payoff,
    double cost
) {
    
    /**
     * Represents a change to a file.
     */
    public record FileChange(
        Path file,
        String before,
        String after,
        String diff,
        ChangeType type
    ) {
        public enum ChangeType {
            MODIFY,
            CREATE,
            DELETE,
            RENAME
        }
    }
    
    /**
     * Check if this preview has any warnings.
     */
    public boolean hasWarnings() {
        return !warnings.isEmpty();
    }
    
    /**
     * Get the priority score based on risk, payoff, and cost.
     */
    public double getPriorityScore() {
        // Simple priority calculation: payoff - risk - cost
        return payoff - risk - cost;
    }
    
    /**
     * Check if this transform is safe to apply.
     */
    public boolean isSafe() {
        return risk < 0.5 && warnings.isEmpty();
    }
}
