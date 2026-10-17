package ai.refact.api;

import java.util.Map;

public record RefactoringOperation(
    String type,
    Map<String, Object> parameters,
    int priority,
    boolean isRequired
) {}
