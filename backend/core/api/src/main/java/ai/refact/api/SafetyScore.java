package ai.refact.api;

public record SafetyScore(
    double overallScore,
    double functionalityPreservation,
    double testCoverage,
    double buildStability,
    double rippleEffectRisk,
    String riskLevel
) {}
