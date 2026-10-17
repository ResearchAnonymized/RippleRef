package ai.refact.engine.detector.methodlevel;

import ai.refact.engine.detector.HierarchicalCodeSmellDetector;
import ai.refact.engine.model.*;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Detects Long Parameter List code smells.
 * A Long Parameter List occurs when a method has too many parameters,
 * making it hard to understand and maintain.
 */
@Component("hierarchicalLongParameterListDetector")
public class LongParameterListDetector implements HierarchicalCodeSmellDetector {
    
    private static final int LONG_PARAMETER_THRESHOLD = 4; // parameters
    private static final int VERY_LONG_PARAMETER_THRESHOLD = 7; // parameters
    private static final int EXTREMELY_LONG_PARAMETER_THRESHOLD = 10; // parameters
    
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
        return "Long Parameter List Detector";
    }
    
    @Override
    public String getDescription() {
        return "Detects methods with too many parameters";
    }
    
    @Override
    public int getPriority() {
        return 6;
    }
    
    @Override
    public void setPriority(int priority) {
        // Priority is fixed
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
            if (method.parameterCount >= EXTREMELY_LONG_PARAMETER_THRESHOLD) {
                smells.add(createLongParameterListSmell(
                    "Extremely Long Parameter List: " + method.name,
                    "Method '" + method.name + "' has " + method.parameterCount + " parameters (extremely long)",
                    method.parameterCount,
                    SmellSeverity.CRITICAL,
                    "Introduce Parameter Object or use Builder pattern. Consider breaking into multiple methods."
                ));
            } else if (method.parameterCount >= VERY_LONG_PARAMETER_THRESHOLD) {
                smells.add(createLongParameterListSmell(
                    "Very Long Parameter List: " + method.name,
                    "Method '" + method.name + "' has " + method.parameterCount + " parameters (very long)",
                    method.parameterCount,
                    SmellSeverity.MAJOR,
                    "Introduce Parameter Object or use Builder pattern to reduce parameter count."
                ));
            } else if (method.parameterCount >= LONG_PARAMETER_THRESHOLD) {
                smells.add(createLongParameterListSmell(
                    "Long Parameter List: " + method.name,
                    "Method '" + method.name + "' has " + method.parameterCount + " parameters",
                    method.parameterCount,
                    SmellSeverity.MINOR,
                    "Consider introducing a Parameter Object or using Builder pattern."
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
    
    private CodeSmell createLongParameterListSmell(String title, String description, int parameterCount, 
                                                  SmellSeverity severity, String suggestion) {
        return new CodeSmell(
            SmellType.LONG_PARAMETER_LIST,
            SmellCategory.BLOATER,
            severity,
            title,
            description,
            suggestion,
            1, // startLine - Method-level smell
            1, // endLine
            List.of("Introduce Parameter Object", "Preserve Whole Object", "Replace Parameter with Method Call")
        );
    }
    
    private List<MethodInfo> extractMethods(String content) {
        List<MethodInfo> methods = new ArrayList<>();
        String[] lines = content.split("\n");
        
        for (String line : lines) {
            String trimmed = line.trim();
            if (isMethodDeclaration(trimmed)) {
                String methodName = extractMethodName(trimmed);
                int parameterCount = countParameters(trimmed);
                methods.add(new MethodInfo(methodName, parameterCount));
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
    
    private int countParameters(String line) {
        // Extract parameter list from method signature
        int startParen = line.indexOf('(');
        int endParen = line.indexOf(')');
        
        if (startParen == -1 || endParen == -1) return 0;
        
        String params = line.substring(startParen + 1, endParen).trim();
        if (params.isEmpty()) return 0;
        
        // Count parameters by splitting on commas, but be careful with generic types
        String[] paramArray = params.split(",");
        return paramArray.length;
    }
    
    /**
     * Method information holder
     */
    private static class MethodInfo {
        final String name;
        final int parameterCount;
        
        MethodInfo(String name, int parameterCount) {
            this.name = name;
            this.parameterCount = parameterCount;
        }
    }
}
