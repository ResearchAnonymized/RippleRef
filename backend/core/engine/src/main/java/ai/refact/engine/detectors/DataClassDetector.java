package ai.refact.engine.detectors;

import ai.refact.api.CodePointer;
import ai.refact.api.ReasonEvidence;
import ai.refact.api.Severity;
import ai.refact.api.ProjectContext;
import ai.refact.api.ReasonDetector;
import ai.refact.api.ReasonCategory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

@Component
public class DataClassDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.data-class";
    private static final double GETTER_SETTER_RATIO_THRESHOLD = 0.8; // 80% or more are getters/setters
    private static final int MIN_METHODS = 3; // Minimum methods to analyze
    
    // Pattern to match method declarations
    private static final Pattern METHOD_PATTERN = Pattern.compile(
        "\\s*(public|private|protected|static|final)?\\s+" +
        "([\\w.<>\\[\\]]+)\\s+" + // return type
        "(\\w+)\\s*\\(" + // method name
        "([^)]*)\\)" // parameters
    );
    
    // Pattern to match field declarations
    private static final Pattern FIELD_PATTERN = Pattern.compile(
        "\\s*(public|private|protected|static|final)?\\s+" +
        "([\\w.<>\\[\\]]+)\\s+" + // type
        "(\\w+)\\s*[;=]" // field name
    );
    
    @Override
    public String id() {
        return DETECTOR_ID;
    }
    
    @Override
    public ReasonCategory category() {
        return ReasonCategory.DESIGN;
    }
    
    @Override
    public boolean isApplicable(ProjectContext ctx) {
        return true; // Always applicable for Java projects
    }
    
    @Override
    public Stream<ReasonEvidence> detect(ProjectContext ctx) {
        if (ctx.sourceFiles().isEmpty()) {
            return Stream.empty();
        }
        
        return ctx.sourceFiles().stream()
            .flatMap(sourceFile -> analyzeFileForDataClass(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForDataClass(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            // Skip DTOs, POJOs, entities (commonly data classes by design)
            if (className.endsWith("DTO") || className.endsWith("Entity") || 
                className.endsWith("Model") || className.endsWith("Bean")) {
                return Stream.empty();
            }
            
            // Analyze class methods
            DataClassAnalysis analysis = analyzeClassMethods(lines);
            
            if (analysis.isDataClass()) {
                Severity severity = determineSeverity(
                    analysis.getGetterSetterRatio(), 
                    analysis.getFieldCount()
                );
                
                ReasonEvidence evidence = new ReasonEvidence(
                    DETECTOR_ID,
                    new CodePointer(
                        projectRoot.relativize(sourceFile),
                        className,
                        "class",
                        1,
                        Math.min(10, lines.size()),
                        1,
                        1
                    ),
                    Map.of(
                        "totalMethods", analysis.getTotalMethods(),
                        "getterSetterCount", analysis.getGetterSetterCount(),
                        "fieldCount", analysis.getFieldCount(),
                        "getterSetterRatio", analysis.getGetterSetterRatio(),
                        "className", className
                    ),
                    String.format("Data class '%s': %.1f%% of methods are getters/setters (%d/%d methods, %d fields)", 
                                 className, analysis.getGetterSetterRatio() * 100, 
                                 analysis.getGetterSetterCount(), analysis.getTotalMethods(), 
                                 analysis.getFieldCount()),
                    severity
                );
                
                evidences.add(evidence);
            }
            
            return evidences.stream();
        } catch (Exception e) {
            return Stream.empty();
        }
    }
    
    private DataClassAnalysis analyzeClassMethods(List<String> lines) {
        int totalMethods = 0;
        int getterSetterCount = 0;
        int fieldCount = 0;
        
        for (String line : lines) {
            // Count fields
            Matcher fieldMatcher = FIELD_PATTERN.matcher(line);
            if (fieldMatcher.find() && !line.contains("(")) {
                fieldCount++;
            }
            
            // Count methods
            Matcher methodMatcher = METHOD_PATTERN.matcher(line);
            if (methodMatcher.find() && !line.contains("class ") && !line.contains("interface ")) {
                String methodName = methodMatcher.group(3);
                String parameters = methodMatcher.group(4);
                
                totalMethods++;
                
                // Check if it's a getter or setter
                if (isGetterOrSetter(methodName, parameters)) {
                    getterSetterCount++;
                }
            }
        }
        
        double getterSetterRatio = totalMethods > 0 ? (double) getterSetterCount / totalMethods : 0.0;
        
        return new DataClassAnalysis(totalMethods, getterSetterCount, fieldCount, getterSetterRatio);
    }
    
    private boolean isGetterOrSetter(String methodName, String parameters) {
        String lowerMethodName = methodName.toLowerCase();
        
        // Getter: starts with "get" or "is", no parameters
        if ((lowerMethodName.startsWith("get") || lowerMethodName.startsWith("is")) && 
            (parameters == null || parameters.trim().isEmpty())) {
            return true;
        }
        
        // Setter: starts with "set", has one parameter
        if (lowerMethodName.startsWith("set") && parameters != null && 
            !parameters.trim().isEmpty() && !parameters.contains(",")) {
            return true;
        }
        
        return false;
    }
    
    private Severity determineSeverity(double getterSetterRatio, int fieldCount) {
        if (getterSetterRatio >= 0.95 || fieldCount >= 15) {
            return Severity.CRITICAL;
        } else if (getterSetterRatio >= 0.9 || fieldCount >= 10) {
            return Severity.MAJOR;
        } else {
            return Severity.MINOR;
        }
    }
    
    // Helper class
    private static class DataClassAnalysis {
        private final int totalMethods;
        private final int getterSetterCount;
        private final int fieldCount;
        private final double getterSetterRatio;
        
        public DataClassAnalysis(int totalMethods, int getterSetterCount, int fieldCount, double getterSetterRatio) {
            this.totalMethods = totalMethods;
            this.getterSetterCount = getterSetterCount;
            this.fieldCount = fieldCount;
            this.getterSetterRatio = getterSetterRatio;
        }
        
        public boolean isDataClass() {
            return totalMethods >= MIN_METHODS && 
                   getterSetterRatio >= GETTER_SETTER_RATIO_THRESHOLD && 
                   fieldCount >= 3;
        }
        
        public int getTotalMethods() { return totalMethods; }
        public int getGetterSetterCount() { return getterSetterCount; }
        public int getFieldCount() { return fieldCount; }
        public double getGetterSetterRatio() { return getterSetterRatio; }
    }
}
