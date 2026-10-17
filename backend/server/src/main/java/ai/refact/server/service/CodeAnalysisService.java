package ai.refact.server.service;

import ai.refact.engine.detectors.CodeSmellDetector;
import ai.refact.engine.model.CodeSmell;
import ai.refact.server.model.CodeAnalysisResult;
import ai.refact.server.model.FileAnalysis;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Comprehensive code analysis service that identifies code smells,
 * technical debt, and provides refactoring recommendations.
 */
@Service
public class CodeAnalysisService {
    
    private static final Logger logger = LoggerFactory.getLogger(CodeAnalysisService.class);
    
    @Autowired
    private CodeSmellDetector codeSmellDetector;
    
    @Autowired
    private ComprehensiveCodeSmellDetector comprehensiveDetector;
    
    /**
     * Analyze a specific file for code smells and technical debt
     */
    public FileAnalysis analyzeFile(Path filePath) {
        try {
            logger.info("Analyzing file: {}", filePath);
            
            List<CodeSmell> smells = comprehensiveDetector.detectAllCodeSmells(filePath);
            Map<String, Object> metrics = calculateFileMetrics(filePath);
            
            return new FileAnalysis(
                filePath.toString(),
                smells,
                metrics,
                calculateTechnicalDebtScore(smells),
                generateRefactoringPlan(smells)
            );
            
        } catch (IOException e) {
            logger.error("Failed to analyze file: {}", filePath, e);
            return FileAnalysis.error(filePath.toString(), e.getMessage());
        }
    }
    
    /**
     * Analyze multiple files in a workspace
     */
    public CodeAnalysisResult analyzeWorkspace(String workspaceId, List<Path> files) {
        logger.info("Analyzing workspace: {} with {} files", workspaceId, files.size());
        
        List<FileAnalysis> fileAnalyses = new ArrayList<>();
        Map<String, Integer> smellSummary = new HashMap<>();
        Map<String, Integer> categorySummary = new HashMap<>();
        Map<String, Integer> severitySummary = new HashMap<>();
        
        int totalSmells = 0;
        double totalTechnicalDebt = 0.0;
        
        for (Path file : files) {
            if (file.toString().endsWith(".java")) {
                FileAnalysis analysis = analyzeFile(file);
                fileAnalyses.add(analysis);
                
                // Aggregate statistics
                totalSmells += analysis.getSmells().size();
                totalTechnicalDebt += analysis.getTechnicalDebtScore();
                
                // Count by smell type
                for (CodeSmell smell : analysis.getSmells()) {
                    smellSummary.merge(smell.getType().getDisplayName(), 1, Integer::sum);
                    categorySummary.merge(smell.getCategory().getDisplayName(), 1, Integer::sum);
                    severitySummary.merge(smell.getSeverity().getDisplayName(), 1, Integer::sum);
                }
            }
        }
        
        return new CodeAnalysisResult(
            workspaceId,
            fileAnalyses,
            smellSummary,
            categorySummary,
            severitySummary,
            totalSmells,
            totalTechnicalDebt,
            fileAnalyses.size(),
            generateWorkspaceRecommendations(fileAnalyses)
        );
    }
    
    /**
     * Calculate comprehensive file metrics
     */
    private Map<String, Object> calculateFileMetrics(Path filePath) throws IOException {
        Map<String, Object> metrics = new HashMap<>();
        
        List<String> lines = Files.readAllLines(filePath);
        String content = String.join("\n", lines);
        
        // Basic metrics
        metrics.put("totalLines", lines.size());
        metrics.put("codeLines", countCodeLines(lines));
        metrics.put("commentLines", countCommentLines(lines));
        metrics.put("blankLines", countBlankLines(lines));
        
        // Complexity metrics
        metrics.put("cyclomaticComplexity", calculateCyclomaticComplexity(content));
        metrics.put("cognitiveComplexity", calculateCognitiveComplexity(content));
        
        // Object-oriented metrics
        metrics.put("classCount", countClasses(content));
        metrics.put("methodCount", countMethods(content));
        metrics.put("fieldCount", countFields(content));
        
        // Quality metrics
        metrics.put("commentRatio", calculateCommentRatio(lines));
        metrics.put("codeDensity", calculateCodeDensity(lines));
        
        return metrics;
    }
    
    /**
     * Calculate technical debt score based on detected smells
     */
    private double calculateTechnicalDebtScore(List<CodeSmell> smells) {
        if (smells.isEmpty()) return 0.0;
        
        double score = 0.0;
        for (CodeSmell smell : smells) {
            switch (smell.getSeverity()) {
                case CRITICAL:
                    score += 10.0;
                    break;
                case MAJOR:
                    score += 5.0;
                    break;
                case MINOR:
                    score += 2.0;
                    break;
                case INFO:
                    score += 0.5;
                    break;
            }
        }
        
        return Math.min(100.0, score); // Cap at 100%
    }
    
    /**
     * Generate refactoring plan for detected smells
     */
    private Map<String, List<String>> generateRefactoringPlan(List<CodeSmell> smells) {
        Map<String, List<String>> plan = new HashMap<>();
        
        for (CodeSmell smell : smells) {
            String category = smell.getCategory().getDisplayName();
            if (!plan.containsKey(category)) {
                plan.put(category, new ArrayList<>());
            }
            
            // Add unique refactoring suggestions
            for (String suggestion : smell.getRefactoringSuggestions()) {
                if (!plan.get(category).contains(suggestion)) {
                    plan.get(category).add(suggestion);
                }
            }
        }
        
        return plan;
    }
    
    /**
     * Generate workspace-level recommendations
     */
    private List<String> generateWorkspaceRecommendations(List<FileAnalysis> analyses) {
        List<String> recommendations = new ArrayList<>();
        
        // Analyze patterns across files
        Map<String, Integer> smellTypeCounts = new HashMap<>();
        for (FileAnalysis analysis : analyses) {
            for (CodeSmell smell : analysis.getSmells()) {
                smellTypeCounts.merge(smell.getType().getDisplayName(), 1, Integer::sum);
            }
        }
        
        // Generate recommendations based on common patterns
        if (smellTypeCounts.getOrDefault("Long Method", 0) > 5) {
            recommendations.add("Consider implementing Extract Method refactoring across multiple files");
        }
        
        if (smellTypeCounts.getOrDefault("Large Class", 0) > 3) {
            recommendations.add("Review class responsibilities and consider Extract Class refactoring");
        }
        
        if (smellTypeCounts.getOrDefault("Duplicate Code", 0) > 2) {
            recommendations.add("Identify common patterns and extract shared functionality");
        }
        
        if (smellTypeCounts.getOrDefault("Switch Statements", 0) > 4) {
            recommendations.add("Consider replacing switch statements with polymorphism");
        }
        
        if (smellTypeCounts.getOrDefault("Public Fields", 0) > 3) {
            recommendations.add("Encapsulate public fields with getter/setter methods");
        }
        
        return recommendations;
    }
    
    // Helper methods for metric calculations
    private int countCodeLines(List<String> lines) {
        return (int) lines.stream()
            .map(String::trim)
            .filter(line -> !line.isEmpty() && !line.startsWith("//") && !line.startsWith("/*"))
            .count();
    }
    
    private int countCommentLines(List<String> lines) {
        return (int) lines.stream()
            .map(String::trim)
            .filter(line -> line.startsWith("//") || line.startsWith("/*") || line.startsWith("*"))
            .count();
    }
    
    private int countBlankLines(List<String> lines) {
        return (int) lines.stream()
            .map(String::trim)
            .filter(String::isEmpty)
            .count();
    }
    
    private int calculateCyclomaticComplexity(String content) {
        int complexity = 1; // Base complexity
        
        String[] complexityKeywords = {"if", "while", "for", "case", "catch", "&&", "||", "?"};
        for (String keyword : complexityKeywords) {
            complexity += countOccurrences(content, keyword);
        }
        
        return complexity;
    }
    
    private int calculateCognitiveComplexity(String content) {
        int complexity = 0;
        
        String[] cognitiveKeywords = {"if", "else if", "for", "while", "catch", "switch", "case"};
        for (String keyword : cognitiveKeywords) {
            complexity += countOccurrences(content, keyword);
        }
        
        return complexity;
    }
    
    private int countClasses(String content) {
        // Count class declarations (including inner classes)
        int classCount = 0;
        String[] lines = content.split("\n");
        for (String line : lines) {
            String trimmed = line.trim();
            // Match class declarations: [modifiers] class ClassName [extends/implements]
            if (trimmed.matches(".*\\b(public|private|protected|static|final|abstract)?\\s+class\\s+\\w+.*")) {
                classCount++;
            }
            // Also match inner classes and interfaces
            else if (trimmed.matches(".*\\b(public|private|protected|static|final|abstract)?\\s+(interface|enum)\\s+\\w+.*")) {
                classCount++;
            }
        }
        return classCount;
    }
    
    private int countMethods(String content) {
        // Count method declarations (including constructors)
        int methodCount = 0;
        String[] lines = content.split("\n");
        for (String line : lines) {
            String trimmed = line.trim();
            // Match method declarations: [modifiers] returnType methodName( or [modifiers] methodName(
            if (trimmed.matches(".*\\b(public|private|protected|static|final|abstract|synchronized)\\s+\\w+\\s+\\w+\\s*\\(.*")) {
                methodCount++;
            }
            // Match constructors: [modifiers] ClassName(
            else if (trimmed.matches(".*\\b(public|private|protected)\\s+\\w+\\s*\\(.*")) {
                // Check if it's a constructor (no return type, just class name)
                if (!trimmed.contains("=") && !trimmed.contains(";") && !trimmed.contains("void") && 
                    !trimmed.contains("int") && !trimmed.contains("String") && !trimmed.contains("boolean") &&
                    !trimmed.contains("double") && !trimmed.contains("float") && !trimmed.contains("long") &&
                    !trimmed.contains("char") && !trimmed.contains("byte") && !trimmed.contains("short")) {
                    methodCount++;
                }
            }
        }
        return methodCount;
    }
    
    private int countFields(String content) {
        // Count field declarations
        int fieldCount = 0;
        String[] lines = content.split("\n");
        for (String line : lines) {
            String trimmed = line.trim();
            // Match field declarations: [modifiers] type fieldName [= value];
            if (trimmed.matches(".*\\b(public|private|protected|static|final)\\s+\\w+\\s+\\w+\\s*[=;].*")) {
                fieldCount++;
            }
            // Also match fields without explicit access modifier
            else if (trimmed.matches(".*\\b(static|final)\\s+\\w+\\s+\\w+\\s*[=;].*")) {
                fieldCount++;
            }
        }
        return fieldCount;
    }
    
    private double calculateCommentRatio(List<String> lines) {
        int totalLines = lines.size();
        int commentLines = countCommentLines(lines);
        return totalLines > 0 ? (double) commentLines / totalLines : 0.0;
    }
    
    private double calculateCodeDensity(List<String> lines) {
        int totalLines = lines.size();
        int codeLines = countCodeLines(lines);
        return totalLines > 0 ? (double) codeLines / totalLines : 0.0;
    }
    
    private int countOccurrences(String content, String keyword) {
        // Escape regex special characters to avoid PatternSyntaxException
        String escapedKeyword = keyword.replaceAll("[\\[\\](){}.*+?^$\\\\|]", "\\\\$0");
        return content.split(escapedKeyword, -1).length - 1;
    }
}
