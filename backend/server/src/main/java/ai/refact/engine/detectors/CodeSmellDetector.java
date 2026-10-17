package ai.refact.engine.detectors;

import ai.refact.engine.model.CodeSmell;
import ai.refact.engine.model.SmellType;
import ai.refact.engine.model.SmellSeverity;
import ai.refact.engine.model.SmellCategory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Comprehensive code smell detector following Martin Fowler's principles
 * and SOLID design principles for identifying technical debt.
 */
@Component
public class CodeSmellDetector {
    
    private static final int LONG_METHOD_THRESHOLD = 20;
    private static final int LARGE_CLASS_THRESHOLD = 300;
    private static final int LONG_PARAMETER_LIST_THRESHOLD = 5;
    private static final int CYCLOMATIC_COMPLEXITY_THRESHOLD = 10;
    private static final int COGNITIVE_COMPLEXITY_THRESHOLD = 15;
    
    /**
     * Analyze a Java file for code smells and technical debt
     */
    public List<CodeSmell> detectCodeSmells(Path filePath) throws IOException {
        List<CodeSmell> smells = new ArrayList<>();
        
        if (!Files.exists(filePath) || !filePath.toString().endsWith(".java")) {
            return smells;
        }
        
        List<String> lines = Files.readAllLines(filePath);
        String content = String.join("\n", lines);
        
        // Detect various types of code smells
        smells.addAll(detectBloaters(lines, content));
        smells.addAll(detectObjectOrientationAbusers(lines, content));
        smells.addAll(detectChangePreventers(lines, content));
        smells.addAll(detectDispensables(lines, content));
        smells.addAll(detectCouplers(lines, content));
        smells.addAll(detectEncapsulationIssues(lines, content));
        smells.addAll(detectHierarchyIssues(lines, content));
        smells.addAll(detectConcurrencyIssues(lines, content));
        
        return smells;
    }
    
    /**
     * Detect bloater code smells (Long Method, Large Class, etc.)
     */
    private List<CodeSmell> detectBloaters(List<String> lines, String content) {
        List<CodeSmell> smells = new ArrayList<>();
        
        // Long Method detection
        List<MethodInfo> methods = extractMethods(lines);
        for (MethodInfo method : methods) {
            if (method.lineCount > LONG_METHOD_THRESHOLD) {
                smells.add(new CodeSmell(
                    SmellType.LONG_METHOD,
                    SmellCategory.BLOATER,
                    SmellSeverity.MAJOR,
                    "Long Method: " + method.name,
                    "Method '" + method.name + "' has " + method.lineCount + " lines",
                    "Extract smaller methods to improve readability and maintainability",
                    method.startLine,
                    method.endLine,
                    List.of("Extract Method", "Decompose Conditional", "Replace Method with Method Object")
                ));
            }
            
            if (method.parameterCount > LONG_PARAMETER_LIST_THRESHOLD) {
                smells.add(new CodeSmell(
                    SmellType.LONG_PARAMETER_LIST,
                    SmellCategory.BLOATER,
                    SmellSeverity.MAJOR,
                    "Long Parameter List: " + method.name,
                    "Method '" + method.name + "' has " + method.parameterCount + " parameters",
                    "Introduce Parameter Object or use Builder pattern",
                    method.startLine,
                    method.endLine,
                    List.of("Introduce Parameter Object", "Preserve Whole Object", "Replace Parameter with Method Call")
                ));
            }
            
            if (method.complexity > CYCLOMATIC_COMPLEXITY_THRESHOLD) {
                smells.add(new CodeSmell(
                    SmellType.HIGH_COMPLEXITY,
                    SmellCategory.BLOATER,
                    SmellSeverity.MAJOR,
                    "High Cyclomatic Complexity: " + method.name,
                    "Method '" + method.name + "' has complexity " + method.complexity,
                    "Extract methods to reduce complexity and improve testability",
                    method.startLine,
                    method.endLine,
                    List.of("Extract Method", "Decompose Conditional", "Replace Conditional with Polymorphism")
                ));
            }
        }
        
        // Large Class detection
        int classLineCount = countClassLines(lines);
        if (classLineCount > LARGE_CLASS_THRESHOLD) {
            smells.add(new CodeSmell(
                SmellType.LARGE_CLASS,
                SmellCategory.BLOATER,
                SmellSeverity.MAJOR,
                "Large Class",
                "Class has " + classLineCount + " lines",
                "Extract classes to follow Single Responsibility Principle",
                1,
                lines.size(),
                List.of("Extract Class", "Extract Subclass", "Extract Interface")
            ));
        }
        
        return smells;
    }
    
    /**
     * Detect object-oriented design abuses
     */
    private List<CodeSmell> detectObjectOrientationAbusers(List<String> lines, String content) {
        List<CodeSmell> smells = new ArrayList<>();
        
        // Switch statement detection
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i).trim();
            if (line.startsWith("switch") && !line.contains("//")) {
                smells.add(new CodeSmell(
                    SmellType.SWITCH_STATEMENTS,
                    SmellCategory.OBJECT_ORIENTATION_ABUSER,
                    SmellSeverity.MINOR,
                    "Switch Statement",
                    "Switch statement found at line " + (i + 1),
                    "Consider using polymorphism or strategy pattern",
                    i + 1,
                    i + 1,
                    List.of("Replace Conditional with Polymorphism", "Extract Method", "Introduce Strategy")
                ));
            }
        }
        
        // Temporary field detection
        if (content.contains("private") && content.contains("public") && 
            Pattern.compile("private\\s+\\w+\\s+\\w+;").matcher(content).find()) {
            smells.add(new CodeSmell(
                SmellType.TEMPORARY_FIELD,
                SmellCategory.OBJECT_ORIENTATION_ABUSER,
                SmellSeverity.MINOR,
                "Temporary Field",
                "Class may have temporary fields that are only used in certain methods",
                "Extract method or use parameter passing instead",
                1,
                lines.size(),
                List.of("Extract Method", "Introduce Parameter Object", "Replace Method with Method Object")
            ));
        }
        
        return smells;
    }
    
    /**
     * Detect change preventers
     */
    private List<CodeSmell> detectChangePreventers(List<String> lines, String content) {
        List<CodeSmell> smells = new ArrayList<>();
        
        // Divergent change detection (multiple responsibilities)
        if (content.contains("public class") && 
            (content.contains("public void") || content.contains("public String") || content.contains("public int")) &&
            Pattern.compile("public\\s+\\w+\\s+\\w+\\s*\\(").matcher(content).find()) {
            
            long methodCount = Pattern.compile("public\\s+\\w+\\s+\\w+\\s*\\(").matcher(content).results().count();
            if (methodCount > 8) {
                smells.add(new CodeSmell(
                    SmellType.DIVERGENT_CHANGE,
                    SmellCategory.CHANGE_PREVENTER,
                    SmellSeverity.MAJOR,
                    "Divergent Change",
                    "Class has " + methodCount + " public methods indicating multiple responsibilities",
                    "Extract classes to follow Single Responsibility Principle",
                    1,
                    lines.size(),
                    List.of("Extract Class", "Extract Interface", "Move Method")
                ));
            }
        }
        
        return smells;
    }
    
    /**
     * Detect dispensable code
     */
    private List<CodeSmell> detectDispensables(List<String> lines, String content) {
        List<CodeSmell> smells = new ArrayList<>();
        
        // Duplicate code detection
        if (hasDuplicateCode(content)) {
            smells.add(new CodeSmell(
                SmellType.DUPLICATE_CODE,
                SmellCategory.DISPENSABLE,
                SmellSeverity.MAJOR,
                "Duplicate Code",
                "Duplicate code patterns detected",
                "Extract common functionality into methods or classes",
                1,
                lines.size(),
                List.of("Extract Method", "Extract Class", "Form Template Method")
            ));
        }
        
        // Dead code detection
        if (content.contains("// TODO") || content.contains("// FIXME")) {
            smells.add(new CodeSmell(
                SmellType.DEAD_CODE,
                SmellCategory.DISPENSABLE,
                SmellSeverity.MINOR,
                "Dead Code / TODO Comments",
                "TODO or FIXME comments found",
                "Address technical debt or remove outdated comments",
                1,
                lines.size(),
                List.of("Remove Dead Code", "Implement TODO", "Clean up comments")
            ));
        }
        
        return smells;
    }
    
    /**
     * Detect coupling issues
     */
    private List<CodeSmell> detectCouplers(List<String> lines, String content) {
        List<CodeSmell> smells = new ArrayList<>();
        
        // Feature envy detection
        if (content.contains("this.") && content.contains(".") && 
            Pattern.compile("\\w+\\.\\w+\\s*\\(").matcher(content).find()) {
            smells.add(new CodeSmell(
                SmellType.FEATURE_ENVY,
                SmellCategory.COUPLER,
                SmellSeverity.MINOR,
                "Feature Envy",
                "Methods may be more interested in other classes than their own",
                "Consider moving methods to the class they use most",
                1,
                lines.size(),
                List.of("Move Method", "Extract Method", "Introduce Local Extension")
            ));
        }
        
        return smells;
    }
    
    /**
     * Detect encapsulation and abstraction issues
     */
    private List<CodeSmell> detectEncapsulationIssues(List<String> lines, String content) {
        List<CodeSmell> smells = new ArrayList<>();
        
        // Public fields detection
        if (Pattern.compile("public\\s+\\w+\\s+\\w+;").matcher(content).find()) {
            smells.add(new CodeSmell(
                SmellType.PUBLIC_FIELDS,
                SmellCategory.ENCAPSULATION_ISSUE,
                SmellSeverity.MAJOR,
                "Public Fields",
                "Public fields found, violating encapsulation",
                "Use private fields with getter/setter methods",
                1,
                lines.size(),
                List.of("Encapsulate Field", "Make Field Private", "Introduce Getter/Setter")
            ));
        }
        
        return smells;
    }
    
    /**
     * Detect hierarchy and architecture issues
     */
    private List<CodeSmell> detectHierarchyIssues(List<String> lines, String content) {
        List<CodeSmell> smells = new ArrayList<>();
        
        // God object detection
        if (content.contains("public class") && 
            countClassLines(lines) > LARGE_CLASS_THRESHOLD &&
            Pattern.compile("public\\s+\\w+\\s+\\w+\\s*\\(").matcher(content).results().count() > 15) {
            smells.add(new CodeSmell(
                SmellType.GOD_OBJECT,
                SmellCategory.HIERARCHY_ISSUE,
                SmellSeverity.CRITICAL,
                "God Object",
                "Class has too many responsibilities and methods",
                "Break down into smaller, focused classes",
                1,
                lines.size(),
                List.of("Extract Class", "Extract Interface", "Apply Facade Pattern")
            ));
        }
        
        return smells;
    }
    
    /**
     * Detect concurrency and performance issues
     */
    private List<CodeSmell> detectConcurrencyIssues(List<String> lines, String content) {
        List<CodeSmell> smells = new ArrayList<>();
        
        // Global mutable state detection
        if (content.contains("static") && content.contains("public") && 
            Pattern.compile("public\\s+static\\s+\\w+\\s+\\w+").matcher(content).find()) {
            smells.add(new CodeSmell(
                SmellType.GLOBAL_MUTABLE_STATE,
                SmellCategory.CONCURRENCY_ISSUE,
                SmellSeverity.MAJOR,
                "Global Mutable State",
                "Public static fields found, potential concurrency issues",
                "Use dependency injection or make fields immutable",
                1,
                lines.size(),
                List.of("Remove Static", "Make Immutable", "Use Dependency Injection")
            ));
        }
        
        return smells;
    }
    
    /**
     * Extract method information from Java code
     */
    private List<MethodInfo> extractMethods(List<String> lines) {
        List<MethodInfo> methods = new ArrayList<>();
        boolean inMethod = false;
        int startLine = 0;
        int braceCount = 0;
        String methodName = "";
        
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i).trim();
            
            if (!inMethod && line.matches(".*\\w+\\s+\\w+\\s*\\(.*\\)\\s*\\{?")) {
                inMethod = true;
                startLine = i + 1;
                methodName = extractMethodName(line);
                braceCount = countBraces(line);
            } else if (inMethod) {
                braceCount += countBraces(line);
                
                if (braceCount == 0) {
                    methods.add(new MethodInfo(
                        methodName,
                        startLine,
                        i + 1,
                        i + 1 - startLine,
                        countParameters(lines.get(startLine - 1)),
                        calculateComplexity(lines.subList(startLine - 1, i + 1))
                    ));
                    inMethod = false;
                }
            }
        }
        
        return methods;
    }
    
    private String extractMethodName(String line) {
        // Extract method name from method signature
        String[] parts = line.split("\\(")[0].split("\\s+");
        return parts[parts.length - 1];
    }
    
    private int countBraces(String line) {
        return (int) line.chars().filter(ch -> ch == '{').count() -
               (int) line.chars().filter(ch -> ch == '}').count();
    }
    
    private int countParameters(String line) {
        String params = line.substring(line.indexOf('(') + 1, line.indexOf(')'));
        if (params.trim().isEmpty()) return 0;
        return params.split(",").length;
    }
    
    private int calculateComplexity(List<String> methodLines) {
        int complexity = 1; // Base complexity
        
        for (String line : methodLines) {
            String trimmed = line.trim();
            if (trimmed.contains("if") || trimmed.contains("while") || 
                trimmed.contains("for") || trimmed.contains("case") ||
                trimmed.contains("&&") || trimmed.contains("||")) {
                complexity++;
            }
        }
        
        return complexity;
    }
    
    private int countClassLines(List<String> lines) {
        int count = 0;
        boolean inClass = false;
        int braceCount = 0;
        
        for (String line : lines) {
            if (line.trim().startsWith("public class") || line.trim().startsWith("class")) {
                inClass = true;
                braceCount = countBraces(line);
            } else if (inClass) {
                braceCount += countBraces(line);
                if (braceCount == 0) break;
            }
            if (inClass) count++;
        }
        
        return count;
    }
    
    private boolean hasDuplicateCode(String content) {
        // Simple duplicate code detection - look for repeated patterns
        String[] lines = content.split("\n");
        for (int i = 0; i < lines.length - 2; i++) {
            String pattern = lines[i].trim();
            if (pattern.length() > 20) {
                int occurrences = 0;
                for (String line : lines) {
                    if (line.trim().contains(pattern)) {
                        occurrences++;
                    }
                }
                if (occurrences > 2) return true;
            }
        }
        return false;
    }
    
    /**
     * Method information holder
     */
    private static class MethodInfo {
        final String name;
        final int startLine;
        final int endLine;
        final int lineCount;
        final int parameterCount;
        final int complexity;
        
        MethodInfo(String name, int startLine, int endLine, int lineCount, int parameterCount, int complexity) {
            this.name = name;
            this.startLine = startLine;
            this.endLine = endLine;
            this.lineCount = lineCount;
            this.parameterCount = parameterCount;
            this.complexity = complexity;
        }
    }
}
