package ai.refact.api;

import java.util.stream.Stream;

/**
 * SPI for detecting refactoring reasons in code.
 */
public interface ReasonDetector {
    
    /**
     * Unique identifier for this detector.
     * Format: category.specific-name (e.g., "design.long-method")
     */
    String id();
    
    /**
     * Category of refactoring reasons this detector identifies.
     */
    ReasonCategory category();
    
    /**
     * Check if this detector is applicable to the given project context.
     */
    boolean isApplicable(ProjectContext ctx);
    
    /**
     * Detect refactoring reasons in the given project context.
     */
    Stream<ReasonEvidence> detect(ProjectContext ctx);
}
