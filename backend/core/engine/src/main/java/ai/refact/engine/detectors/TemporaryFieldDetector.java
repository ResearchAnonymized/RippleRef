package ai.refact.engine.detectors;

import ai.refact.api.CodePointer;
import ai.refact.api.ReasonEvidence;
import ai.refact.api.Severity;
import ai.refact.api.ProjectContext;
import ai.refact.api.ReasonDetector;
import ai.refact.api.ReasonCategory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

@Component
public class TemporaryFieldDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.temporary-field";
    private static final double USAGE_RATIO_THRESHOLD = 0.3; // 30% of methods use the field
    private static final int MIN_METHODS = 3; // Minimum methods to analyze
    
    // Pattern to match field declarations
    private static final Pattern FIELD_PATTERN = Pattern.compile(
        "\\s*(public|private|protected|static|final|volatile|transient)?\\s+" +
        "(\\w+\\s+)*" + // type
        "(\\w+)\\s*[;=]" // field name
    );
    
    // Pattern to match method declarations
    private static final Pattern METHOD_PATTERN = Pattern.compile(
        "\\s*(public|private|protected|static|final|abstract)?\\s+" +
        "(\\w+\\s+)*" + // return type
        "(\\w+)\\s*\\(" + // method name
        "([^)]*)\\)" // parameters
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
        // This detector is always applicable for Java projects
        return true;
    }
    
    @Override
    public Stream<ReasonEvidence> detect(ProjectContext ctx) {
        // Only analyze if we have source files
        if (ctx.sourceFiles().isEmpty()) {
            return Stream.empty();
        }
        
        // Analyze each Java source file
        return ctx.sourceFiles().stream()
            .flatMap(sourceFile -> analyzeFileForTemporaryFields(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForTemporaryFields(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            // Read file content
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            // Find all field declarations
            List<FieldInfo> fields = findFields(lines);
            
            // Find all method declarations
            List<MethodInfo> methods = findMethods(lines);
            
            if (methods.size() < MIN_METHODS) {
                return Stream.empty(); // Not enough methods to analyze
            }
            
            // Analyze each field for temporary usage
            for (FieldInfo field : fields) {
                TemporaryFieldAnalysis analysis = analyzeFieldUsage(field, methods, lines);
                
                if (analysis.isTemporaryField()) {
                    Severity severity = determineSeverity(analysis.getUsageRatio(), analysis.getUsageCount());
                    
                    ReasonEvidence evidence = new ReasonEvidence(
                        DETECTOR_ID,
                        new CodePointer(
                            projectRoot.relativize(sourceFile),
                            className,
                            field.getName(),
                            field.getLineNumber(),
                            field.getLineNumber(),
                            1,
                            1
                        ),
                        Map.of(
                            "fieldName", field.getName(),
                            "fieldType", field.getType(),
                            "usageCount", analysis.getUsageCount(),
                            "totalMethods", analysis.getTotalMethods(),
                            "usageRatio", analysis.getUsageRatio(),
                            "className", className
                        ),
                        String.format("Field '%s' appears to be temporary: used in only %.1f%% of methods (%d/%d)", 
                                     field.getName(), analysis.getUsageRatio() * 100, 
                                     analysis.getUsageCount(), analysis.getTotalMethods()),
                        severity
                    );
                    
                    evidences.add(evidence);
                }
            }
            
            return evidences.stream();
        } catch (Exception e) {
            return Stream.empty();
        }
    }
    
    private List<FieldInfo> findFields(List<String> lines) {
        List<FieldInfo> fields = new ArrayList<>();
        
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            Matcher matcher = FIELD_PATTERN.matcher(line);
            
            if (matcher.find()) {
                String type = matcher.group(2) != null ? matcher.group(2).trim() : "unknown";
                String name = matcher.group(3);
                
                // Skip if it's a method declaration (has parentheses)
                if (!line.contains("(")) {
                    fields.add(new FieldInfo(name, type, i + 1));
                }
            }
        }
        
        return fields;
    }
    
    private List<MethodInfo> findMethods(List<String> lines) {
        List<MethodInfo> methods = new ArrayList<>();
        
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            Matcher matcher = METHOD_PATTERN.matcher(line);
            
            if (matcher.find()) {
                String methodName = matcher.group(3);
                int endLine = findMethodEndLine(lines, i);
                methods.add(new MethodInfo(methodName, i + 1, endLine));
            }
        }
        
        return methods;
    }
    
    private TemporaryFieldAnalysis analyzeFieldUsage(FieldInfo field, List<MethodInfo> methods, List<String> lines) {
        int usageCount = 0;
        
        for (MethodInfo method : methods) {
            if (isFieldUsedInMethod(field.getName(), method, lines)) {
                usageCount++;
            }
        }
        
        double usageRatio = (double) usageCount / methods.size();
        
        return new TemporaryFieldAnalysis(usageCount, methods.size(), usageRatio);
    }
    
    private boolean isFieldUsedInMethod(String fieldName, MethodInfo method, List<String> lines) {
        // Check if field is used in the method body
        for (int i = method.getStartLine() - 1; i < method.getEndLine() && i < lines.size(); i++) {
            String line = lines.get(i);
            
            // Look for field usage (simple pattern matching)
            if (line.contains(fieldName) && 
                !line.contains("//") && // Not in comment
                !line.contains("/*") && // Not in comment
                !line.contains("*") && // Not in comment
                !line.trim().startsWith("//")) { // Not comment line
                return true;
            }
        }
        
        return false;
    }
    
    private int findMethodEndLine(List<String> lines, int methodStartLine) {
        int braceCount = 0;
        boolean inMethod = false;
        
        for (int i = methodStartLine; i < lines.size(); i++) {
            String line = lines.get(i);
            
            for (char c : line.toCharArray()) {
                if (c == '{') {
                    braceCount++;
                    inMethod = true;
                } else if (c == '}') {
                    braceCount--;
                    if (inMethod && braceCount == 0) {
                        return i + 1; // 1-based line number
                    }
                }
            }
        }
        
        return Math.min(methodStartLine + 20, lines.size()); // Fallback
    }
    
    private Severity determineSeverity(double usageRatio, int usageCount) {
        if (usageRatio <= 0.1 || usageCount <= 1) {
            return Severity.CRITICAL;
        } else if (usageRatio <= 0.2 || usageCount <= 2) {
            return Severity.MAJOR;
        } else {
            return Severity.MINOR;
        }
    }
    
    // Helper classes
    private static class FieldInfo {
        private final String name;
        private final String type;
        private final int lineNumber;
        
        public FieldInfo(String name, String type, int lineNumber) {
            this.name = name;
            this.type = type;
            this.lineNumber = lineNumber;
        }
        
        public String getName() { return name; }
        public String getType() { return type; }
        public int getLineNumber() { return lineNumber; }
    }
    
    private static class MethodInfo {
        private final String name;
        private final int startLine;
        private final int endLine;
        
        public MethodInfo(String name, int startLine, int endLine) {
            this.name = name;
            this.startLine = startLine;
            this.endLine = endLine;
        }
        
        public String getName() { return name; }
        public int getStartLine() { return startLine; }
        public int getEndLine() { return endLine; }
    }
    
    private static class TemporaryFieldAnalysis {
        private final int usageCount;
        private final int totalMethods;
        private final double usageRatio;
        
        public TemporaryFieldAnalysis(int usageCount, int totalMethods, double usageRatio) {
            this.usageCount = usageCount;
            this.totalMethods = totalMethods;
            this.usageRatio = usageRatio;
        }
        
        public boolean isTemporaryField() {
            return usageRatio <= USAGE_RATIO_THRESHOLD && totalMethods >= MIN_METHODS;
        }
        
        public int getUsageCount() { return usageCount; }
        public int getTotalMethods() { return totalMethods; }
        public double getUsageRatio() { return usageRatio; }
    }
}
