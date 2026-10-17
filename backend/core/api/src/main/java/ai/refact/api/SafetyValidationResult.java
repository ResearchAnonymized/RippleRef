package ai.refact.api;

import java.util.List;

public record SafetyValidationResult(
    boolean isSafe,
    double riskScore,
    List<String> warnings,
    List<String> errors,
    List<String> recommendations
) {}
