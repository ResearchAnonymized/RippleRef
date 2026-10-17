package ai.refact.engine;

import ai.refact.api.FileInfo.FileMetrics;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

@Service
public class FileMetricsService {
    
    private static final Logger logger = LoggerFactory.getLogger(FileMetricsService.class);
    
    public FileMetrics calculateFileMetrics(Path filePath) {
        try {
            if (!Files.exists(filePath) || !Files.isRegularFile(filePath)) {
                return createEmptyMetrics();
            }
            
            List<String> lines = Files.readAllLines(filePath);
            if (lines.isEmpty()) {
                return createEmptyMetrics();
            }
            
            int totalLines = lines.size();
            int commentLines = countCommentLines(lines, filePath);
            int blankLines = countBlankLines(lines);
            int codeLines = totalLines - commentLines - blankLines;
            
            int methodCount = countMethods(lines, filePath);
            int classCount = countClasses(lines, filePath);
            int cyclomaticComplexity = calculateCyclomaticComplexity(lines, filePath);
            int cognitiveComplexity = calculateCognitiveComplexity(lines, filePath);
            int codeSmells = countCodeSmells(lines, filePath);
            
            // Calculate advanced metrics
            double maintainabilityIndex = calculateMaintainabilityIndex(codeLines, cyclomaticComplexity, commentLines);
            double technicalDebtRatio = calculateTechnicalDebtRatio(codeSmells, codeLines);
            String qualityGrade = calculateQualityGrade(maintainabilityIndex, technicalDebtRatio, cyclomaticComplexity);
            
            return new FileMetrics(
                codeLines,
                cyclomaticComplexity,
                cognitiveComplexity,
                methodCount,
                classCount,
                commentLines,
                blankLines
            );
            
        } catch (IOException e) {
            logger.warn("Failed to calculate metrics for file: {}", filePath, e);
            return createEmptyMetrics();
        }
    }
    
    private FileMetrics createEmptyMetrics() {
        return new FileMetrics(0, 0, 0, 0, 0, 0, 0);
    }
    
    private int countCommentLines(List<String> lines, Path filePath) {
        String fileName = filePath.getFileName().toString().toLowerCase();
        boolean isJavaFile = fileName.endsWith(".java");
        
        int commentLines = 0;
        boolean inMultiLineComment = false;
        
        for (String line : lines) {
            String trimmedLine = line.trim();
            
            if (isJavaFile) {
                if (inMultiLineComment) {
                    commentLines++;
                    if (trimmedLine.contains("*/")) {
                        inMultiLineComment = false;
                    }
                } else if (trimmedLine.startsWith("//")) {
                    commentLines++;
                } else if (trimmedLine.startsWith("/*")) {
                    commentLines++;
                    if (!trimmedLine.contains("*/")) {
                        inMultiLineComment = true;
                    }
                }
            }
        }
        
        return commentLines;
    }
    
    private int countBlankLines(List<String> lines) {
        int blankLines = 0;
        for (String line : lines) {
            if (line.trim().isEmpty()) {
                blankLines++;
            }
        }
        return blankLines;
    }
    
    private int countMethods(List<String> lines, Path filePath) {
        String fileName = filePath.getFileName().toString().toLowerCase();
        if (!fileName.endsWith(".java")) {
            return 0;
        }
        
        int methodCount = 0;
        for (String line : lines) {
            String trimmedLine = line.trim();
            if ((trimmedLine.startsWith("public ") || trimmedLine.startsWith("private ") || 
                 trimmedLine.startsWith("protected ") || trimmedLine.startsWith("static ")) &&
                trimmedLine.contains("(") && trimmedLine.contains(")") && 
                (trimmedLine.contains("void") || trimmedLine.contains("String") || 
                 trimmedLine.contains("int") || trimmedLine.contains("boolean") ||
                 trimmedLine.contains("double") || trimmedLine.contains("float") ||
                 trimmedLine.contains("long") || trimmedLine.contains("char"))) {
                methodCount++;
            }
        }
        return methodCount;
    }
    
    private int countClasses(List<String> lines, Path filePath) {
        String fileName = filePath.getFileName().toString().toLowerCase();
        if (!fileName.endsWith(".java")) {
            return 0;
        }
        
        int classCount = 0;
        for (String line : lines) {
            String trimmedLine = line.trim();
            if (trimmedLine.startsWith("public class ") || trimmedLine.startsWith("class ") ||
                trimmedLine.startsWith("public abstract class ") || trimmedLine.startsWith("public final class ")) {
                classCount++;
            }
        }
        return classCount;
    }
    
    private int calculateCyclomaticComplexity(List<String> lines, Path filePath) {
        String fileName = filePath.getFileName().toString().toLowerCase();
        if (!fileName.endsWith(".java")) {
            return 1;
        }
        
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
    
    private int countCodeSmells(List<String> lines, Path filePath) {
        String fileName = filePath.getFileName().toString().toLowerCase();
        if (!fileName.endsWith(".java")) {
            return 0;
        }
        
        int codeSmells = 0;
        
        if (lines.size() > 20) {
            codeSmells++;
        }
        
        if (lines.size() > 500) {
            codeSmells++;
        }
        
        int complexity = calculateCyclomaticComplexity(lines, filePath);
        if (complexity > 10) {
            codeSmells++;
        }
        
        Pattern magicNumberPattern = Pattern.compile("\\b\\d{3,}\\b");
        for (String line : lines) {
            if (magicNumberPattern.matcher(line).find()) {
                codeSmells++;
                break;
            }
        }
        
        for (int i = 0; i < lines.size() - 1; i++) {
            for (int j = i + 1; j < lines.size(); j++) {
                if (lines.get(i).trim().equals(lines.get(j).trim())) {
                    codeSmells++;
                    break;
                }
            }
        }
        
        return codeSmells;
    }

    /**
     * Calculate cognitive complexity based on nested structures and logical operators
     */
    private int calculateCognitiveComplexity(List<String> lines, Path filePath) {
        String fileName = filePath.getFileName().toString().toLowerCase();
        if (!fileName.endsWith(".java")) {
            return 1;
        }
        
        int complexity = 0;
        int nestingLevel = 0;
        
        for (String line : lines) {
            String trimmedLine = line.trim();
            
            // Increment for control flow statements
            if (trimmedLine.startsWith("if ") || trimmedLine.startsWith("else if ")) {
                complexity++;
                nestingLevel++;
            }
            if (trimmedLine.startsWith("for ") || trimmedLine.startsWith("while ")) {
                complexity++;
                nestingLevel++;
            }
            if (trimmedLine.startsWith("switch ")) {
                complexity++;
                nestingLevel++;
            }
            if (trimmedLine.startsWith("catch ")) {
                complexity++;
                nestingLevel++;
            }
            
            // Increment for logical operators
            if (trimmedLine.contains("&&") || trimmedLine.contains("||")) {
                complexity++;
            }
            
            // Increment for nested structures
            if (trimmedLine.contains("{")) {
                nestingLevel++;
            }
            if (trimmedLine.contains("}")) {
                nestingLevel = Math.max(0, nestingLevel - 1);
            }
            
            // Penalty for deep nesting
            if (nestingLevel > 3) {
                complexity += (nestingLevel - 3);
            }
        }
        
        return complexity;
    }

    /**
     * Calculate maintainability index (0-100, higher is better)
     */
    private double calculateMaintainabilityIndex(int codeLines, int cyclomaticComplexity, int commentLines) {
        if (codeLines == 0) return 100.0;
        
        // Halstead volume approximation
        double halsteadVolume = Math.log(codeLines) * Math.log(cyclomaticComplexity + 1);
        
        // Maintainability index formula
        double mi = 171 - 5.2 * Math.log(halsteadVolume) - 0.23 * cyclomaticComplexity - 16.2 * Math.log(codeLines);
        
        // Add bonus for good documentation
        double commentRatio = (double) commentLines / codeLines;
        if (commentRatio > 0.1 && commentRatio < 0.3) {
            mi += 5.0;
        }
        
        return Math.max(0.0, Math.min(100.0, mi));
    }

    /**
     * Calculate technical debt ratio (0-1, lower is better)
     */
    private double calculateTechnicalDebtRatio(int codeSmells, int codeLines) {
        if (codeLines == 0) return 0.0;
        
        // Base ratio from code smells
        double baseRatio = (double) codeSmells / Math.max(1, codeLines / 50);
        
        // Normalize to 0-1 range
        return Math.min(1.0, baseRatio / 10.0);
    }

    /**
     * Calculate quality grade (A-F) based on metrics
     */
    private String calculateQualityGrade(double maintainabilityIndex, double technicalDebtRatio, int cyclomaticComplexity) {
        double score = 0.0;
        
        // Maintainability index contribution (40%)
        score += (maintainabilityIndex / 100.0) * 40.0;
        
        // Technical debt contribution (30%)
        score += (1.0 - technicalDebtRatio) * 30.0;
        
        // Complexity contribution (30%)
        if (cyclomaticComplexity <= 5) {
            score += 30.0;
        } else if (cyclomaticComplexity <= 10) {
            score += 20.0;
        } else if (cyclomaticComplexity <= 15) {
            score += 10.0;
        } else {
            score += 0.0;
        }
        
        // Convert to grade
        if (score >= 90) return "A";
        if (score >= 80) return "B";
        if (score >= 70) return "C";
        if (score >= 60) return "D";
        if (score >= 50) return "E";
        return "F";
    }
}
