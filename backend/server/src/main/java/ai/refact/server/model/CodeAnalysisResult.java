package ai.refact.server.model;

import java.util.List;
import java.util.Map;

/**
 * Represents the overall code analysis results for a workspace,
 * including aggregated statistics and recommendations.
 */
public class CodeAnalysisResult {
    private final String workspaceId;
    private final List<FileAnalysis> fileAnalyses;
    private final Map<String, Integer> smellSummary;
    private final Map<String, Integer> categorySummary;
    private final Map<String, Integer> severitySummary;
    private final int totalSmells;
    private final double totalTechnicalDebt;
    private final int analyzedFiles;
    private final List<String> recommendations;
    
    public CodeAnalysisResult(String workspaceId, List<FileAnalysis> fileAnalyses,
                            Map<String, Integer> smellSummary, Map<String, Integer> categorySummary,
                            Map<String, Integer> severitySummary, int totalSmells,
                            double totalTechnicalDebt, int analyzedFiles, List<String> recommendations) {
        this.workspaceId = workspaceId;
        this.fileAnalyses = fileAnalyses;
        this.smellSummary = smellSummary;
        this.categorySummary = categorySummary;
        this.severitySummary = severitySummary;
        this.totalSmells = totalSmells;
        this.totalTechnicalDebt = totalTechnicalDebt;
        this.analyzedFiles = analyzedFiles;
        this.recommendations = recommendations;
    }
    
    // Getters
    public String getWorkspaceId() { return workspaceId; }
    public List<FileAnalysis> getFileAnalyses() { return fileAnalyses; }
    public Map<String, Integer> getSmellSummary() { return smellSummary; }
    public Map<String, Integer> getCategorySummary() { return categorySummary; }
    public Map<String, Integer> getSeveritySummary() { return severitySummary; }
    public int getTotalSmells() { return totalSmells; }
    public double getTotalTechnicalDebt() { return totalTechnicalDebt; }
    public int getAnalyzedFiles() { return analyzedFiles; }
    public List<String> getRecommendations() { return recommendations; }
    
    // Helper methods
    public double getAverageTechnicalDebt() {
        return analyzedFiles > 0 ? totalTechnicalDebt / analyzedFiles : 0.0;
    }
    
    public double getSmellDensity() {
        return analyzedFiles > 0 ? (double) totalSmells / analyzedFiles : 0.0;
    }
    
    public boolean hasCriticalIssues() {
        return severitySummary.getOrDefault("Critical", 0) > 0;
    }
    
    public boolean hasMajorIssues() {
        return severitySummary.getOrDefault("Major", 0) > 0;
    }
    
    public String getOverallHealth() {
        double avgDebt = getAverageTechnicalDebt();
        if (avgDebt >= 80) return "Critical";
        if (avgDebt >= 60) return "Poor";
        if (avgDebt >= 40) return "Fair";
        if (avgDebt >= 20) return "Good";
        return "Excellent";
    }
    
    public String getPriorityRecommendation() {
        if (hasCriticalIssues()) {
            return "Address critical code smells immediately";
        } else if (hasMajorIssues()) {
            return "Focus on major code smells in next iteration";
        } else if (getAverageTechnicalDebt() > 50) {
            return "Consider refactoring to reduce technical debt";
        } else {
            return "Code quality is good, maintain current standards";
        }
    }
    
    @Override
    public String toString() {
        return String.format("CodeAnalysisResult{workspaceId='%s', files=%d, smells=%d, avgDebt=%.1f%%}",
                           workspaceId, analyzedFiles, totalSmells, getAverageTechnicalDebt());
    }
}
