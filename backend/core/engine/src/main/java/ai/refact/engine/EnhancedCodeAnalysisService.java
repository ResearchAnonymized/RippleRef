package ai.refact.engine;

import ai.refact.api.EnhancedFileMetrics;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.regex.Pattern;

@Service
public class EnhancedCodeAnalysisService {
    
    private static final Logger logger = LoggerFactory.getLogger(EnhancedCodeAnalysisService.class);
    
    /**
     * Code smell analysis result with severity classification
     */
    private static record SmellAnalysis(int totalSmells, int criticalIssues, int majorIssues, int minorIssues) {}
    
    private final FileMetricsService fileMetricsService;
    
    public EnhancedCodeAnalysisService(FileMetricsService fileMetricsService) {
        this.fileMetricsService = fileMetricsService;
    }
    
    /**
     * Perform comprehensive code analysis on a single file
     */
    public EnhancedFileMetrics analyzeFile(Path filePath) {
        try {
            if (filePath == null || !Files.exists(filePath) || !Files.isRegularFile(filePath)) {
                logger.debug("File does not exist or is not a regular file: {}", filePath);
                return createEmptyEnhancedMetrics();
            }
            
            List<String> lines = Files.readAllLines(filePath);
            if (lines.isEmpty()) {
                logger.debug("File is empty: {}", filePath);
                return createEmptyEnhancedMetrics();
            }
            
            // Get basic metrics
            var basicMetrics = fileMetricsService.calculateFileMetrics(filePath);
            
            // Calculate advanced metrics
            double maintainabilityIndex = calculateMaintainabilityIndex(
                basicMetrics.linesOfCode(), 
                basicMetrics.cyclomaticComplexity(), 
                basicMetrics.commentLines()
            );
            
            double technicalDebtRatio = calculateTechnicalDebtRatio(
                basicMetrics.linesOfCode(), 
                basicMetrics.cyclomaticComplexity()
            );
            
            String qualityGrade = calculateQualityGrade(maintainabilityIndex, technicalDebtRatio, basicMetrics.cyclomaticComplexity());
            
            // Analyze code smells in detail
            var smellAnalysis = analyzeCodeSmells(lines, filePath);
            
            // Calculate coverage metrics
            double codeCoverage = calculateCodeCoverage(filePath);
            double documentationCoverage = calculateDocumentationCoverage(basicMetrics.commentLines(), basicMetrics.linesOfCode());
            boolean hasTests = hasTestFile(filePath);
            boolean hasDocumentation = basicMetrics.commentLines() > 0;
            
            return new EnhancedFileMetrics(
                basicMetrics.linesOfCode(),
                basicMetrics.cyclomaticComplexity(),
                basicMetrics.cognitiveComplexity(),
                basicMetrics.methodCount(),
                basicMetrics.classCount(),
                basicMetrics.commentLines(),
                basicMetrics.blankLines(),
                maintainabilityIndex,
                technicalDebtRatio,
                qualityGrade,
                smellAnalysis.totalSmells(),
                smellAnalysis.criticalIssues(),
                smellAnalysis.majorIssues(),
                smellAnalysis.minorIssues(),
                codeCoverage,
                documentationCoverage,
                hasTests,
                hasDocumentation
            );
            
        } catch (Exception e) {
            logger.error("Failed to analyze file: {}", filePath, e);
            return createEmptyEnhancedMetrics();
        }
    }
    
    private SmellAnalysis analyzeCodeSmells(List<String> lines, Path filePath) {
        String fileName = filePath.getFileName().toString().toLowerCase();
        if (!fileName.endsWith(".java")) {
            return new SmellAnalysis(0, 0, 0, 0);
        }
        
        int criticalIssues = 0;
        int majorIssues = 0;
        int minorIssues = 0;
        
        // Critical: Very long methods (>100 lines)
        if (lines.size() > 100) {
            criticalIssues++;
        }
        
        // Critical: Very high complexity (>20)
        int complexity = calculateCyclomaticComplexity(lines);
        if (complexity > 20) {
            criticalIssues++;
        }
        
        // Major: Long methods (50-100 lines)
        if (lines.size() > 50) {
            majorIssues++;
        }
        
        // Major: High complexity (10-20)
        if (complexity > 10) {
            majorIssues++;
        }
        
        // Major: Magic numbers
        Pattern magicNumberPattern = Pattern.compile("\\b\\d{3,}\\b");
        for (String line : lines) {
            if (magicNumberPattern.matcher(line).find()) {
                majorIssues++;
                break;
            }
        }
        
        // Minor: Duplicate code
        for (int i = 0; i < lines.size() - 1; i++) {
            for (int j = i + 1; j < lines.size(); j++) {
                if (lines.get(i).trim().equals(lines.get(j).trim())) {
                    minorIssues++;
                    break;
                }
            }
        }
        
        // Minor: Empty catch blocks
        for (String line : lines) {
            String trimmedLine = line.trim();
            if (trimmedLine.startsWith("catch") && trimmedLine.endsWith("{}")) {
                minorIssues++;
            }
        }
        
        int totalSmells = criticalIssues + majorIssues + minorIssues;
        return new SmellAnalysis(totalSmells, criticalIssues, majorIssues, minorIssues);
    }
    
    /**
     * Calculate cyclomatic complexity
     */
    private int calculateCyclomaticComplexity(List<String> lines) {
        int complexity = 1;
        
        for (String line : lines) {
            String trimmedLine = line.trim();
            
            if (trimmedLine.contains("if ") || trimmedLine.contains("else if ")) {
                complexity++;
            }
            if (trimmedLine.contains("for ") || trimmedLine.contains("while ")) {
                complexity++;
            }
            if (trimmedLine.contains("case ") || trimmedLine.contains("default:")) {
                complexity++;
            }
            if (trimmedLine.contains("&&") || trimmedLine.contains("||")) {
                complexity++;
            }
            if (trimmedLine.contains("catch ")) {
                complexity++;
            }
        }
        
        return complexity;
    }
    
    /**
     * Calculate maintainability index
     */
    private double calculateMaintainabilityIndex(int codeLines, int cyclomaticComplexity, int commentLines) {
        if (codeLines == 0) return 100.0;
        
        double halsteadVolume = Math.log(codeLines) * Math.log(cyclomaticComplexity + 1);
        double mi = 171 - 5.2 * Math.log(halsteadVolume) - 0.23 * cyclomaticComplexity - 16.2 * Math.log(codeLines);
        
        double commentRatio = (double) commentLines / codeLines;
        if (commentRatio > 0.1 && commentRatio < 0.3) {
            mi += 5.0;
        }
        
        return Math.max(0.0, Math.min(100.0, mi));
    }
    
    /**
     * Calculate technical debt ratio
     */
    private double calculateTechnicalDebtRatio(int codeLines, int cyclomaticComplexity) {
        if (codeLines == 0) return 0.0;
        
        double baseRatio = (double) cyclomaticComplexity / Math.max(1, codeLines / 50);
        return Math.min(1.0, baseRatio / 10.0);
    }
    
    /**
     * Calculate quality grade
     */
    private String calculateQualityGrade(double maintainabilityIndex, double technicalDebtRatio, int cyclomaticComplexity) {
        double score = 0.0;
        
        score += (maintainabilityIndex / 100.0) * 40.0;
        score += (1.0 - technicalDebtRatio) * 30.0;
        
        if (cyclomaticComplexity <= 5) {
            score += 30.0;
        } else if (cyclomaticComplexity <= 10) {
            score += 20.0;
        } else if (cyclomaticComplexity <= 15) {
            score += 10.0;
        }
        
        if (score >= 90) return "A";
        if (score >= 80) return "B";
        if (score >= 70) return "C";
        if (score >= 60) return "D";
        if (score >= 50) return "E";
        return "F";
    }
    
    /**
     * Calculate code coverage (simplified - would integrate with actual coverage tools)
     */
    private double calculateCodeCoverage(Path filePath) {
        // This would integrate with actual coverage tools like JaCoCo
        // For now, return a placeholder value
        return 75.0; // Placeholder: 75% coverage
    }
    
    /**
     * Calculate documentation coverage
     */
    private double calculateDocumentationCoverage(int commentLines, int codeLines) {
        if (codeLines == 0) return 100.0;
        double ratio = (double) commentLines / codeLines;
        return Math.min(100.0, ratio * 100.0);
    }
    
    /**
     * Check if test file exists
     */
    private boolean hasTestFile(Path filePath) {
        String fileName = filePath.getFileName().toString();
        if (fileName.endsWith("Test.java") || fileName.endsWith("Tests.java")) {
            return true;
        }
        
        // Check for corresponding test file
        Path testPath = filePath.getParent().resolve("test").resolve(fileName.replace(".java", "Test.java"));
        return Files.exists(testPath);
    }
    
    /**
     * Create empty enhanced metrics
     */
    private EnhancedFileMetrics createEmptyEnhancedMetrics() {
        return new EnhancedFileMetrics(
            0, 0, 0, 0, 0, 0, 0,  // Basic metrics
            100.0, 0.0, "A",       // Advanced metrics
            0, 0, 0, 0,            // Code smells
            100.0, 100.0, true, true  // Performance indicators
        );
    }
}
