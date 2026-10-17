package ai.refact.api;

import java.nio.file.Path;

public record RollbackResult(
    boolean success,
    String message,
    Path restoredFile,
    long timestamp
) {}
