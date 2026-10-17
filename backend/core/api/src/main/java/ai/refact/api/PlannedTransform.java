package ai.refact.api;

import java.util.Map;

/**
 * Represents a planned refactoring transformation.
 */
public record PlannedTransform(
    String id,
    String name,
    String description,
    TransformTarget target,
    CodePointer location,
    Map<String, Object> metadata,
    double priority,
    long timestamp
) {}
