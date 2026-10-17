package ai.refact.api;

import java.util.List;

public record BuildResults(
    boolean buildSuccessful,
    String buildOutput,
    List<String> compilationWarnings,
    List<String> compilationErrors,
    int buildTimeSeconds,
    boolean ciCdCompatible
) {}
