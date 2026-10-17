package ai.refact.api;

import java.util.List;

public record QualityImprovement(
    double maintainabilityImprovement,
    double readabilityImprovement,
    double performanceImprovement,
    double securityImprovement,
    int codeSmellsRemoved,
    int newCodeSmells,
    List<String> improvements,
    List<String> regressions
) {}
