package ai.refact.api;

/**
 * Enhanced file metrics including advanced code quality indicators
 */
public record EnhancedFileMetrics(
    // Basic metrics
    int linesOfCode,
    int cyclomaticComplexity,
    int cognitiveComplexity,
    int methodCount,
    int classCount,
    int commentLines,
    int blankLines,
    
    // Advanced metrics
    double maintainabilityIndex,
    double technicalDebtRatio,
    String qualityGrade,
    
    // Code smell details
    int codeSmells,
    int criticalIssues,
    int majorIssues,
    int minorIssues,
    
    // Performance indicators
    double codeCoverage,
    double documentationCoverage,
    boolean hasTests,
    boolean hasDocumentation
) {
    
    /**
     * Get overall quality score (0-100)
     */
    public double getOverallScore() {
        double score = 0.0;
        
        // Maintainability index (40%)
        score += (maintainabilityIndex / 100.0) * 40.0;
        
        // Technical debt (30%)
        score += (1.0 - technicalDebtRatio) * 30.0;
        
        // Code coverage (20%)
        score += (codeCoverage / 100.0) * 20.0;
        
        // Documentation (10%)
        score += (documentationCoverage / 100.0) * 10.0;
        
        return Math.round(score * 100.0) / 100.0;
    }
    
    /**
     * Get quality category based on overall score
     */
    public String getQualityCategory() {
        double score = getOverallScore();
        if (score >= 90) return "Excellent";
        if (score >= 80) return "Good";
        if (score >= 70) return "Fair";
        if (score >= 60) return "Poor";
        return "Critical";
    }
    
    /**
     * Check if file needs immediate attention
     */
    public boolean needsImmediateAttention() {
        return qualityGrade.equals("F") || 
               maintainabilityIndex < 30 || 
               technicalDebtRatio > 0.7 ||
               criticalIssues > 0;
    }
    
    /**
     * Get refactoring priority (1-5, 1 being highest)
     */
    public int getRefactoringPriority() {
        if (needsImmediateAttention()) return 1;
        if (qualityGrade.equals("E") || maintainabilityIndex < 50) return 2;
        if (qualityGrade.equals("D") || maintainabilityIndex < 70) return 3;
        if (qualityGrade.equals("C") || maintainabilityIndex < 85) return 4;
        return 5;
    }
}
