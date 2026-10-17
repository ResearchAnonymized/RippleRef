package ai.refact.api;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Comprehensive context for refactoring operations.
 * Ensures all refactoring rules and checklist items are considered.
 */
public record RefactoringContext(
    // Project Information
    String projectId,
    Path projectRoot,
    Path targetFile,
    
    // Original Code State
    String originalCode,
    String originalHash,
    List<String> originalLines,
    
    // Dependencies & Impact Analysis
    Set<Path> dependentFiles,
    Set<String> importedClasses,
    Set<String> usedMethods,
    Map<String, String> methodSignatures,
    
    // Test Coverage
    List<Path> testFiles,
    Map<String, Integer> testCoverage,
    List<String> failingTests,
    
    // Code Quality Metrics
    CodeQualityMetrics originalMetrics,
    CodeQualityMetrics targetMetrics,
    
    // Refactoring Rules & Constraints
    RefactoringConstraints constraints,
    
    // Safety Checks
    boolean hasBackup,
    boolean testsPassing,
    boolean buildSuccessful,
    
    // Timestamp
    long timestamp
) {
    
    /**
     * Code quality metrics for before/after comparison.
     */
    public record CodeQualityMetrics(
        int linesOfCode,
        int cyclomaticComplexity,
        int cognitiveComplexity,
        int methodCount,
        int classCount,
        int commentLines,
        int blankLines,
        double maintainabilityIndex,
        int codeSmells,
        List<String> staticAnalysisWarnings
    ) {}
    
    /**
     * Constraints and rules for the refactoring operation.
     */
    public record RefactoringConstraints(
        boolean preserveFunctionality,
        boolean improvePerformance,
        boolean enhanceSecurity,
        boolean maintainTestCoverage,
        boolean updateDocumentation,
        boolean checkRippleEffects,
        List<String> forbiddenPatterns,
        List<String> requiredPatterns,
        int maxMethodLength,
        int maxClassLength,
        int maxCyclomaticComplexity
    ) {}
    
    /**
     * Check if the refactoring context meets all safety requirements.
     */
    public boolean isSafeToProceed() {
        return hasBackup && 
               testsPassing && 
               buildSuccessful && 
               !originalCode.isEmpty() &&
               targetFile != null;
    }
    
    /**
     * Get a summary of the refactoring context for logging.
     */
    public String getSummary() {
        return String.format(
            "Refactoring %s in project %s: %d lines, %d methods, complexity %.2f",
            targetFile.getFileName(),
            projectId,
            originalLines.size(),
            originalMetrics.methodCount(),
            originalMetrics.cyclomaticComplexity()
        );
    }
}
