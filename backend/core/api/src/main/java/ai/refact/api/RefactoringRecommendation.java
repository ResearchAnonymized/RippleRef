package ai.refact.api;

import java.util.List;

public record RefactoringRecommendation(
    String type,
    String description,
    double impact,
    double effort,
    List<String> benefits,
    List<String> risks
) {}
