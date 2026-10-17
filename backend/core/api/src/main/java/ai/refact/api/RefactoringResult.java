package ai.refact.api;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

public record RefactoringResult(
    String refactoringId,
    boolean success,
    String message,
    Path sourceFile,
    List<CodeChange> changes,
    CodeQualityMetrics beforeMetrics,
    CodeQualityMetrics afterMetrics,
    QualityImprovement qualityImprovement,
    SafetyScore safetyScore,
    List<String> warnings,
    List<String> errors,
    Map<String, Object> metadata
) {
    public record CodeChange(
        int startLine,
        int endLine,
        String oldCode,
        String newCode,
        String description,
        ChangeType type,
        String reason
    ) {}
    
    public enum ChangeType {
        ADD,
        REMOVE,
        MODIFY,
        MOVE,
        RENAME
    }
}
