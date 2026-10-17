package ai.refact.engine.detector.methodlevel;

import ai.refact.engine.detector.HierarchicalCodeSmellDetector;
import ai.refact.engine.model.*;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Detects Long Method code smells.
 * A Long Method is a method that has grown too large and is doing too much,
 * violating the Single Responsibility Principle (SRP).
 */
@Component("hierarchicalLongMethodDetector")
public class LongMethodDetector implements HierarchicalCodeSmellDetector {
    
    private static final int LONG_METHOD_THRESHOLD = 20; // lines of code
    private static final int VERY_LONG_METHOD_THRESHOLD = 50; // lines of code
    private static final int EXTREMELY_LONG_METHOD_THRESHOLD = 100; // lines of code
    
    private boolean enabled = true;
    
    @Override
    public CodeSmellCluster getCluster() {
        return CodeSmellCluster.METHOD_LEVEL;
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
    public String getDetectorName() {
        return "Long Method Detector";
    }
    
    @Override
    public String getDescription() {
        return "Detects methods that have grown too large and are doing too much";
    }
    
    @Override
    public int getPriority() {
        return 7; // High priority for method-level smells
    }
    
    @Override
    public void setPriority(int priority) {
        // Priority is fixed for this detector
    }
    
    @Override
    public List<CodeSmell> detectClassLevelSmells(String content) {
        return new ArrayList<>(); // Not applicable for method-level detector
    }
    
    @Override
    public List<CodeSmell> detectMethodLevelSmells(String content) {
        if (!enabled) return new ArrayList<>();
        
        List<CodeSmell> smells = new ArrayList<>();
        List<MethodInfo> methods = extractMethods(content);
        
        for (MethodInfo method : methods) {
            if (method.lineCount >= EXTREMELY_LONG_METHOD_THRESHOLD) {
                smells.add(createLongMethodSmell(
                    "Extremely Long Method: " + method.name,
                    "Method '" + method.name + "' has " + method.lineCount + " lines (extremely long)",
                    method.lineCount,
                    SmellSeverity.CRITICAL,
                    "Break this method into smaller, focused methods. Consider extracting multiple methods or using the Strategy pattern."
                ));
            } else if (method.lineCount >= VERY_LONG_METHOD_THRESHOLD) {
                smells.add(createLongMethodSmell(
                    "Very Long Method: " + method.name,
                    "Method '" + method.name + "' has " + method.lineCount + " lines (very long)",
                    method.lineCount,
                    SmellSeverity.MAJOR,
                    "Extract methods to reduce complexity. Consider breaking into logical chunks."
                ));
            } else if (method.lineCount >= LONG_METHOD_THRESHOLD) {
                smells.add(createLongMethodSmell(
                    "Long Method: " + method.name,
                    "Method '" + method.name + "' has " + method.lineCount + " lines",
                    method.lineCount,
                    SmellSeverity.MINOR,
                    "Consider extracting smaller methods to improve readability and maintainability."
                ));
            }
        }
        
        return smells;
    }
    
    @Override
    public List<CodeSmell> detectDesignLevelSmells(String content) {
        return new ArrayList<>(); // Not applicable for method-level detector
    }
    
    @Override
    public List<CodeSmell> detectCodeLevelSmells(String content) {
        return new ArrayList<>(); // Not applicable for method-level detector
    }
    
    private CodeSmell createLongMethodSmell(String title, String description, int lineCount, 
                                          SmellSeverity severity, String suggestion) {
        return new CodeSmell(
            SmellType.LONG_METHOD,
            SmellCategory.BLOATER,
            severity,
            title,
            description,
            suggestion,
            1, // startLine - Method-level smell
            1, // endLine
            List.of("Extract Method", "Decompose Conditional", "Replace Method with Method Object")
        );
    }
    
    private List<MethodInfo> extractMethods(String content) {
        List<MethodInfo> methods = new ArrayList<>();
        String[] lines = content.split("\n");
        
        boolean inMethod = false;
        int startLine = 0;
        int braceCount = 0;
        String methodName = "";
        int methodStartLine = 0;
        
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            
            // Check for method declaration
            if (!inMethod && isMethodDeclaration(line)) {
                inMethod = true;
                startLine = i + 1;
                methodStartLine = i + 1;
                methodName = extractMethodName(line);
                braceCount = countBraces(line);
            } else if (inMethod) {
                braceCount += countBraces(line);
                
                if (braceCount == 0) {
                    // Method ended
                    int lineCount = i + 1 - methodStartLine;
                    methods.add(new MethodInfo(methodName, methodStartLine, i + 1, lineCount));
                    inMethod = false;
                }
            }
        }
        
        return methods;
    }
    
    private boolean isMethodDeclaration(String line) {
        // Match method declarations (public/private/protected + return type + method name + parameters)
        Pattern methodPattern = Pattern.compile(
            "^(public|private|protected|static|final|synchronized|abstract)\\s+" +
            "(\\w+\\s+)*\\w+\\s+\\w+\\s*\\([^)]*\\)\\s*\\{?\\s*$"
        );
        return methodPattern.matcher(line).matches() && !line.contains("class") && !line.contains("interface");
    }
    
    private String extractMethodName(String line) {
        // Extract method name from method signature
        String[] parts = line.split("\\(")[0].trim().split("\\s+");
        return parts[parts.length - 1];
    }
    
    private int countBraces(String line) {
        return (int) line.chars().filter(ch -> ch == '{').count() -
               (int) line.chars().filter(ch -> ch == '}').count();
    }
    
    /**
     * Method information holder
     */
    private static class MethodInfo {
        final String name;
        final int startLine;
        final int endLine;
        final int lineCount;
        
        MethodInfo(String name, int startLine, int endLine, int lineCount) {
            this.name = name;
            this.startLine = startLine;
            this.endLine = endLine;
            this.lineCount = lineCount;
        }
    }
}
