package ai.refact.engine.detector.designlevel;

import ai.refact.engine.detector.HierarchicalCodeSmellDetector;
import ai.refact.engine.model.*;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Detects Cyclic Dependencies code smells.
 * A Cyclic Dependency occurs when two or more classes depend on each other,
 * creating a circular dependency that makes the system harder to understand and maintain.
 */
@Component
public class CyclicDependenciesDetector implements HierarchicalCodeSmellDetector {
    
    private boolean enabled = true;
    
    @Override
    public CodeSmellCluster getCluster() {
        return CodeSmellCluster.DESIGN_LEVEL;
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
        return "Cyclic Dependencies Detector";
    }
    
    @Override
    public String getDescription() {
        return "Detects circular dependencies between classes";
    }
    
    @Override
    public int getPriority() {
        return 9;
    }
    
    @Override
    public void setPriority(int priority) {
        // Priority is fixed
    }
    
    @Override
    public List<CodeSmell> detectClassLevelSmells(String content) {
        return new ArrayList<>(); // Not applicable for design-level detector
    }
    
    @Override
    public List<CodeSmell> detectMethodLevelSmells(String content) {
        return new ArrayList<>(); // Not applicable for design-level detector
    }
    
    @Override
    public List<CodeSmell> detectDesignLevelSmells(String content) {
        if (!enabled) return new ArrayList<>();
        
        List<CodeSmell> smells = new ArrayList<>();
        
        // Detect potential cyclic dependencies through import statements
        List<String> imports = extractImports(content);
        List<String> classes = extractClassNames(content);
        
        // Check for mutual imports (simplified detection)
        for (String importClass : imports) {
            String className = extractClassNameFromImport(importClass);
            if (classes.contains(className)) {
                // Check if this class imports the current class (potential cycle)
                if (content.contains("import") && content.contains(className)) {
                    smells.add(createCyclicDependencySmell(
                        "Potential Cyclic Dependency",
                        "Class may have cyclic dependency with " + className,
                        SmellSeverity.MAJOR,
                        "Break the cycle by introducing an interface or using dependency injection."
                    ));
                }
            }
        }
        
        // Detect circular references in method calls
        List<String> methodCalls = extractMethodCalls(content);
        for (String methodCall : methodCalls) {
            if (isCircularMethodCall(methodCall, content)) {
                smells.add(createCyclicDependencySmell(
                    "Circular Method Call",
                    "Circular method call detected: " + methodCall,
                    SmellSeverity.MINOR,
                    "Refactor to break the circular dependency."
                ));
            }
        }
        
        return smells;
    }
    
    @Override
    public List<CodeSmell> detectCodeLevelSmells(String content) {
        return new ArrayList<>(); // Not applicable for design-level detector
    }
    
    private List<String> extractImports(String content) {
        List<String> imports = new ArrayList<>();
        String[] lines = content.split("\n");
        
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.startsWith("import ")) {
                imports.add(trimmed);
            }
        }
        
        return imports;
    }
    
    private List<String> extractClassNames(String content) {
        List<String> classes = new ArrayList<>();
        Pattern classPattern = Pattern.compile("(public|private|protected)?\\s*class\\s+(\\w+)");
        Matcher matcher = classPattern.matcher(content);
        
        while (matcher.find()) {
            classes.add(matcher.group(2));
        }
        
        return classes;
    }
    
    private String extractClassNameFromImport(String importStatement) {
        // Extract class name from import statement
        String[] parts = importStatement.split("\\.");
        return parts[parts.length - 1].replace(";", "");
    }
    
    private List<String> extractMethodCalls(String content) {
        List<String> methodCalls = new ArrayList<>();
        Pattern methodCallPattern = Pattern.compile("\\w+\\.\\w+\\s*\\(");
        Matcher matcher = methodCallPattern.matcher(content);
        
        while (matcher.find()) {
            methodCalls.add(matcher.group());
        }
        
        return methodCalls;
    }
    
    private boolean isCircularMethodCall(String methodCall, String content) {
        // Simplified circular call detection
        // In a real implementation, this would analyze the actual call graph
        return methodCall.contains("this.") && content.contains("return");
    }
    
    private CodeSmell createCyclicDependencySmell(String title, String description, 
                                               SmellSeverity severity, String suggestion) {
        return new CodeSmell(
            SmellType.CYCLIC_DEPENDENCIES,
            SmellCategory.COUPLER,
            severity,
            title,
            description,
            suggestion,
            1, // startLine - Design-level smell
            1, // endLine
            List.of("Extract Interface", "Use Dependency Injection", "Break Circular Dependency")
        );
    }
}
