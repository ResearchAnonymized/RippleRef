package ai.refact.server.model;

import ai.refact.engine.model.CodeSmell;
import java.util.List;
import java.util.Map;

/**
 * Represents the analysis results for a single file,
 * including detected code smells, metrics, and recommendations.
 */
public class FileAnalysis {
    private final String filePath;
    private final List<CodeSmell> smells;
    private final Map<String, Object> metrics;
    private final double technicalDebtScore;
    private final Map<String, List<String>> refactoringPlan;
    private final boolean hasError;
    private final String errorMessage;
    
    public FileAnalysis(String filePath, List<CodeSmell> smells, Map<String, Object> metrics,
                       double technicalDebtScore, Map<String, List<String>> refactoringPlan) {
        this.filePath = filePath;
        this.smells = smells;
        this.metrics = metrics;
        this.technicalDebtScore = technicalDebtScore;
        this.refactoringPlan = refactoringPlan;
        this.hasError = false;
        this.errorMessage = null;
    }
    
    private FileAnalysis(String filePath, String errorMessage) {
        this.filePath = filePath;
        this.smells = List.of();
        this.metrics = Map.of();
        this.technicalDebtScore = 0.0;
        this.refactoringPlan = Map.of();
        this.hasError = true;
        this.errorMessage = errorMessage;
    }
    
    public static FileAnalysis error(String filePath, String errorMessage) {
        return new FileAnalysis(filePath, errorMessage);
    }
    
    // Getters
    public String getFilePath() { return filePath; }
    public List<CodeSmell> getSmells() { return smells; }
    public Map<String, Object> getMetrics() { return metrics; }
    public double getTechnicalDebtScore() { return technicalDebtScore; }
    public Map<String, List<String>> getRefactoringPlan() { return refactoringPlan; }
    public boolean hasError() { return hasError; }
    public String getErrorMessage() { return errorMessage; }
    
    // Helper methods
    public int getSmellCount() { return smells.size(); }
    public boolean hasSmells() { return !smells.isEmpty(); }
    
    public long getSmellCountBySeverity(String severity) {
        return smells.stream()
            .filter(smell -> smell.getSeverity().getDisplayName().equals(severity))
            .count();
    }
    
    public long getSmellCountByCategory(String category) {
        return smells.stream()
            .filter(smell -> smell.getCategory().getDisplayName().equals(category))
            .count();
    }
    
    @Override
    public String toString() {
        return String.format("FileAnalysis{filePath='%s', smells=%d, technicalDebt=%.1f%%}",
                           filePath, smells.size(), technicalDebtScore);
    }
}
