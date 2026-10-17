package ai.refact.engine.detector.classlevel;

import ai.refact.engine.detector.HierarchicalCodeSmellDetector;
import ai.refact.engine.model.*;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Detects God Class / Large Class code smells.
 * A God Class is a class that has grown too large and is doing too much,
 * violating the Single Responsibility Principle (SRP).
 */
@Component("hierarchicalGodClassDetector")
public class GodClassDetector implements HierarchicalCodeSmellDetector {
    
    private static final int LARGE_CLASS_THRESHOLD = 500; // lines of code
    private static final int GOD_CLASS_THRESHOLD = 1000; // lines of code
    private static final int MAX_METHODS_THRESHOLD = 20; // number of methods
    private static final int MAX_FIELDS_THRESHOLD = 15; // number of fields
    
    private boolean enabled = true;
    private int priority = 8; // High priority
    
    @Override
    public CodeSmellCluster getCluster() {
        return CodeSmellCluster.CLASS_LEVEL;
    }
    
    @Override
    public String getDetectorName() {
        return "God Class Detector";
    }
    
    @Override
    public String getDescription() {
        return "Detects classes that have grown too large and violate the Single Responsibility Principle";
    }
    
    @Override
    public boolean isEnabled() {
        return enabled;
    }
    
    @Override
    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }
    
    @Override
    public int getPriority() {
        return 8; // High priority for class-level smells
    }
    
    @Override
    public void setPriority(int priority) {
        // Priority is fixed for this detector
    }
    
    
    @Override
    public List<CodeSmell> detectClassLevelSmells(String content) {
        return detectGodClass(content, "");
    }
    
    @Override
    public List<CodeSmell> detectMethodLevelSmells(String content) {
        return new ArrayList<>();
    }
    
    @Override
    public List<CodeSmell> detectDesignLevelSmells(String content) {
        return new ArrayList<>();
    }
    
    @Override
    public List<CodeSmell> detectCodeLevelSmells(String content) {
        return new ArrayList<>();
    }
    
    /**
     * Detect God Class smells in the given content
     * @param content the Java source code content
     * @param filePath the file path
     * @return list of detected code smells
     */
    public List<CodeSmell> detectGodClass(String content, String filePath) {
        List<CodeSmell> smells = new ArrayList<>();
        
        if (!enabled) {
            return smells;
        }
        
        try {
            // Analyze class structure
            ClassAnalysis analysis = analyzeClass(content);
            
            // Check for God Class indicators
            if (analysis.getLinesOfCode() > GOD_CLASS_THRESHOLD) {
                smells.add(createGodClassSmell(
                    "God Class: " + analysis.getClassName(),
                    "Class '" + analysis.getClassName() + "' has " + analysis.getLinesOfCode() + 
                    " lines, which exceeds the God Class threshold of " + GOD_CLASS_THRESHOLD + 
                    " lines. This violates the Single Responsibility Principle.",
                    analysis.getLinesOfCode(),
                    SmellSeverity.CRITICAL,
                    "Break this class into smaller, more focused classes. Each class should have a single responsibility."
                ));
            } else if (analysis.getLinesOfCode() > LARGE_CLASS_THRESHOLD) {
                smells.add(createGodClassSmell(
                    "Large Class: " + analysis.getClassName(),
                    "Class '" + analysis.getClassName() + "' has " + analysis.getLinesOfCode() + 
                    " lines, which exceeds the recommended threshold of " + LARGE_CLASS_THRESHOLD + 
                    " lines. Consider refactoring to improve maintainability.",
                    analysis.getLinesOfCode(),
                    SmellSeverity.MAJOR,
                    "Consider breaking this class into smaller classes or extracting related functionality."
                ));
            }
            
            // Check for too many methods
            if (analysis.getMethodCount() > MAX_METHODS_THRESHOLD) {
                smells.add(createGodClassSmell(
                    "Too Many Methods: " + analysis.getClassName(),
                    "Class '" + analysis.getClassName() + "' has " + analysis.getMethodCount() + 
                    " methods, which exceeds the recommended threshold of " + MAX_METHODS_THRESHOLD + 
                    " methods. This suggests the class is doing too much.",
                    analysis.getMethodCount(),
                    SmellSeverity.MAJOR,
                    "Consider extracting some methods into separate classes or interfaces."
                ));
            }
            
            // Check for too many fields
            if (analysis.getFieldCount() > MAX_FIELDS_THRESHOLD) {
                smells.add(createGodClassSmell(
                    "Too Many Fields: " + analysis.getClassName(),
                    "Class '" + analysis.getClassName() + "' has " + analysis.getFieldCount() + 
                    " fields, which exceeds the recommended threshold of " + MAX_FIELDS_THRESHOLD + 
                    " fields. This suggests the class is managing too much state.",
                    analysis.getFieldCount(),
                    SmellSeverity.MINOR,
                    "Consider grouping related fields into separate classes or using composition."
                ));
            }
            
        } catch (Exception e) {
            // Log error but don't fail the entire analysis
            System.err.println("Error in GodClassDetector: " + e.getMessage());
        }
        
        return smells;
    }
    
    private CodeSmell createGodClassSmell(String title, String description, int metric, 
                                         SmellSeverity severity, String suggestion) {
        return new CodeSmell(
            SmellType.GOD_OBJECT,
            SmellCategory.BLOATER,
            severity,
            title,
            description,
            suggestion,
            1, // startLine - Class-level smell
            1, // endLine
            List.of(suggestion)
        );
    }
    
    private ClassAnalysis analyzeClass(String content) {
        String[] lines = content.split("\n");
        String className = extractClassName(content);
        int linesOfCode = countNonEmptyLines(lines);
        int methodCount = countMethods(content);
        int fieldCount = countFields(content);
        
        return new ClassAnalysis(className, linesOfCode, methodCount, fieldCount);
    }
    
    private String extractClassName(String content) {
        Pattern classPattern = Pattern.compile("(?:public\\s+)?class\\s+(\\w+)");
        Matcher matcher = classPattern.matcher(content);
        if (matcher.find()) {
            return matcher.group(1);
        }
        return "Unknown";
    }
    
    private int countNonEmptyLines(String[] lines) {
        int count = 0;
        for (String line : lines) {
            if (!line.trim().isEmpty() && !line.trim().startsWith("//") && !line.trim().startsWith("/*")) {
                count++;
            }
        }
        return count;
    }
    
    private int countMethods(String content) {
        Pattern methodPattern = Pattern.compile("(?:public|private|protected|static|final|abstract|synchronized|native|strictfp)?\\s*(?:<[^>]+>\\s*)?\\s*\\w+\\s+(\\w+)\\s*\\([^)]*\\)\\s*(?:throws\\s+[\\w\\.]+)?\\s*\\{");
        Matcher matcher = methodPattern.matcher(content);
        int count = 0;
        while (matcher.find()) {
            count++;
        }
        return count;
    }
    
    private int countFields(String content) {
        Pattern fieldPattern = Pattern.compile("(?:public|private|protected|static|final|volatile|transient)?\\s+\\w+\\s+\\w+\\s*[=;]");
        Matcher matcher = fieldPattern.matcher(content);
        int count = 0;
        while (matcher.find()) {
            count++;
        }
        return count;
    }
    
    private static class ClassAnalysis {
        private final String className;
        private final int linesOfCode;
        private final int methodCount;
        private final int fieldCount;
        
        public ClassAnalysis(String className, int linesOfCode, int methodCount, int fieldCount) {
            this.className = className;
            this.linesOfCode = linesOfCode;
            this.methodCount = methodCount;
            this.fieldCount = fieldCount;
        }
        
        public String getClassName() { return className; }
        public int getLinesOfCode() { return linesOfCode; }
        public int getMethodCount() { return methodCount; }
        public int getFieldCount() { return fieldCount; }
    }
}
