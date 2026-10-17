package ai.refact.engine.detector.designlevel;

import ai.refact.engine.detector.HierarchicalCodeSmellDetector;
import ai.refact.engine.model.*;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Detects Tight Coupling code smells.
 * Tight Coupling occurs when classes are highly dependent on each other,
 * making the system rigid and hard to change.
 */
@Component
public class TightCouplingDetector implements HierarchicalCodeSmellDetector {
    
    private static final int HIGH_COUPLING_THRESHOLD = 5; // number of dependencies
    private static final int VERY_HIGH_COUPLING_THRESHOLD = 10; // number of dependencies
    private static final int EXTREMELY_HIGH_COUPLING_THRESHOLD = 15; // number of dependencies
    
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
        return "Tight Coupling Detector";
    }
    
    @Override
    public String getDescription() {
        return "Detects high coupling between classes";
    }
    
    @Override
    public int getPriority() {
        return 8;
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
        
        // Analyze coupling through imports
        List<String> imports = extractImports(content);
        int importCount = imports.size();
        
        if (importCount >= EXTREMELY_HIGH_COUPLING_THRESHOLD) {
            smells.add(createTightCouplingSmell(
                "Extremely High Coupling",
                "Class has " + importCount + " imports (extremely high coupling)",
                importCount,
                SmellSeverity.CRITICAL,
                "Reduce dependencies by using interfaces, dependency injection, or breaking into smaller classes."
            ));
        } else if (importCount >= VERY_HIGH_COUPLING_THRESHOLD) {
            smells.add(createTightCouplingSmell(
                "Very High Coupling",
                "Class has " + importCount + " imports (very high coupling)",
                importCount,
                SmellSeverity.MAJOR,
                "Consider using interfaces and dependency injection to reduce coupling."
            ));
        } else if (importCount >= HIGH_COUPLING_THRESHOLD) {
            smells.add(createTightCouplingSmell(
                "High Coupling",
                "Class has " + importCount + " imports (high coupling)",
                importCount,
                SmellSeverity.MINOR,
                "Consider reducing dependencies for better maintainability."
            ));
        }
        
        // Analyze coupling through field dependencies
        List<String> fieldDependencies = extractFieldDependencies(content);
        if (fieldDependencies.size() >= HIGH_COUPLING_THRESHOLD) {
            smells.add(createTightCouplingSmell(
                "High Field Coupling",
                "Class has " + fieldDependencies.size() + " field dependencies",
                fieldDependencies.size(),
                SmellSeverity.MINOR,
                "Consider using dependency injection to reduce field coupling."
            ));
        }
        
        // Analyze coupling through method parameters
        List<String> parameterDependencies = extractParameterDependencies(content);
        if (parameterDependencies.size() >= HIGH_COUPLING_THRESHOLD) {
            smells.add(createTightCouplingSmell(
                "High Parameter Coupling",
                "Methods have high parameter coupling with " + parameterDependencies.size() + " dependencies",
                parameterDependencies.size(),
                SmellSeverity.MINOR,
                "Consider using parameter objects or reducing method dependencies."
            ));
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
    
    private List<String> extractFieldDependencies(String content) {
        List<String> dependencies = new ArrayList<>();
        Pattern fieldPattern = Pattern.compile("(private|protected|public)\\s+\\w+\\s+(\\w+)\\s*;");
        Matcher matcher = fieldPattern.matcher(content);
        
        while (matcher.find()) {
            dependencies.add(matcher.group(2));
        }
        
        return dependencies;
    }
    
    private List<String> extractParameterDependencies(String content) {
        List<String> dependencies = new ArrayList<>();
        Pattern methodPattern = Pattern.compile("\\w+\\s+\\w+\\s*\\([^)]*\\)");
        Matcher matcher = methodPattern.matcher(content);
        
        while (matcher.find()) {
            String methodSignature = matcher.group();
            // Extract parameter types
            String params = methodSignature.substring(methodSignature.indexOf('(') + 1, methodSignature.indexOf(')'));
            if (!params.trim().isEmpty()) {
                String[] paramTypes = params.split(",");
                for (String paramType : paramTypes) {
                    String type = paramType.trim().split("\\s+")[0];
                    if (!type.isEmpty()) {
                        dependencies.add(type);
                    }
                }
            }
        }
        
        return dependencies;
    }
    
    private CodeSmell createTightCouplingSmell(String title, String description, int couplingLevel, 
                                             SmellSeverity severity, String suggestion) {
        return new CodeSmell(
            SmellType.TIGHT_COUPLING,
            SmellCategory.COUPLER,
            severity,
            title,
            description,
            suggestion,
            1, // startLine - Design-level smell
            1, // endLine
            List.of("Extract Interface", "Use Dependency Injection", "Reduce Dependencies")
        );
    }
}
