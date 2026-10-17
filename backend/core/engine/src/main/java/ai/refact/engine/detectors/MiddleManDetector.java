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
public class MiddleManDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.middle-man";
    private static final double DELEGATION_RATIO_THRESHOLD = 0.8; // 80% of methods are delegations
    private static final int MIN_METHODS = 3; // Minimum methods to analyze
    
    // Pattern to match method declarations
    private static final Pattern METHOD_PATTERN = Pattern.compile(
        "\\s*(public|private|protected|static|final|abstract)?\\s+" +
        "(\\w+\\s+)*" + // return type
        "(\\w+)\\s*\\(" + // method name
        "([^)]*)\\)" // parameters
    );
    
    // Pattern to match method calls
    private static final Pattern METHOD_CALL_PATTERN = Pattern.compile(
        "\\b(\\w+)\\.(\\w+)\\s*\\("
    );
    
    // Pattern to match field declarations
    private static final Pattern FIELD_PATTERN = Pattern.compile(
        "\\s*(public|private|protected|static|final|volatile|transient)?\\s+" +
        "(\\w+\\s+)*" + // type
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
            .flatMap(sourceFile -> analyzeFileForMiddleMan(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForMiddleMan(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            // Read file content
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            // Find all methods in the class
            List<MethodInfo> methods = findMethods(lines);
            
            if (methods.size() < MIN_METHODS) {
                return Stream.empty(); // Not enough methods to analyze
            }
            
            // Find fields (potential delegation targets)
            List<String> fields = findFields(lines);
            
            // Analyze each method for delegation patterns
            int delegationCount = 0;
            int totalMethods = methods.size();
            
            for (MethodInfo method : methods) {
                if (isDelegationMethod(method, fields, lines)) {
                    delegationCount++;
                }
            }
            
            double delegationRatio = (double) delegationCount / totalMethods;
            
            if (delegationRatio >= DELEGATION_RATIO_THRESHOLD) {
                Severity severity = determineSeverity(delegationRatio, delegationCount);
                
                ReasonEvidence evidence = new ReasonEvidence(
                    DETECTOR_ID,
                    new CodePointer(
                        projectRoot.relativize(sourceFile),
                        className,
                        "class",
                        1, // Start from beginning of class
                        Math.min(10, lines.size()), // Highlight first 10 lines
                        1,
                        1
                    ),
                    Map.of(
                        "delegationCount", delegationCount,
                        "totalMethods", totalMethods,
                        "delegationRatio", delegationRatio,
                        "fieldCount", fields.size(),
                        "className", className
                    ),
                    String.format("Class '%s' appears to be a middle man: %.1f%% of methods are delegations (%d/%d)", 
                                 className, delegationRatio * 100, delegationCount, totalMethods),
                    severity
                );
                
                evidences.add(evidence);
            }
            
            return evidences.stream();
        } catch (Exception e) {
            return Stream.empty();
        }
    }
    
    private List<MethodInfo> findMethods(List<String> lines) {
        List<MethodInfo> methods = new ArrayList<>();
        
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            Matcher matcher = METHOD_PATTERN.matcher(line);
            
            if (matcher.find() && !line.contains("class ") && !line.contains("interface ")) {
                String methodName = matcher.group(3);
                int endLine = findMethodEndLine(lines, i);
                methods.add(new MethodInfo(methodName, i + 1, endLine));
            }
        }
        
        return methods;
    }
    
    private List<String> findFields(List<String> lines) {
        List<String> fields = new ArrayList<>();
        
        for (String line : lines) {
            Matcher matcher = FIELD_PATTERN.matcher(line);
            if (matcher.find() && !line.contains("(") && !line.contains("class ")) {
                String fieldName = matcher.group(3);
                fields.add(fieldName);
            }
        }
        
        return fields;
    }
    
    private boolean isDelegationMethod(MethodInfo method, List<String> fields, List<String> lines) {
        int totalCalls = 0;
        int delegationCalls = 0;
        
        // Analyze method body for delegation patterns
        for (int i = method.getStartLine() - 1; i < method.getEndLine() && i < lines.size(); i++) {
            String line = lines.get(i);
            
            // Skip comments and empty lines
            if (line.trim().startsWith("//") || line.trim().startsWith("/*") || 
                line.trim().startsWith("*") || line.trim().isEmpty()) {
                continue;
            }
            
            // Count method calls
            Matcher callMatcher = METHOD_CALL_PATTERN.matcher(line);
            while (callMatcher.find()) {
                String calledObject = callMatcher.group(1);
                String calledMethod = callMatcher.group(2);
                
                totalCalls++;
                
                // Check if this is a delegation to a field
                if (fields.contains(calledObject)) {
                    delegationCalls++;
                }
            }
        }
        
        // A method is considered a delegation if:
        // 1. It has calls to field methods
        // 2. Most of its calls are delegations
        // 3. It doesn't have much other logic
        return totalCalls > 0 && (double) delegationCalls / totalCalls >= 0.7;
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
    
    private Severity determineSeverity(double delegationRatio, int delegationCount) {
        if (delegationRatio >= 0.95 || delegationCount >= 10) {
            return Severity.CRITICAL;
        } else if (delegationRatio >= 0.9 || delegationCount >= 7) {
            return Severity.MAJOR;
        } else {
            return Severity.MINOR;
        }
    }
    
    // Helper class to hold method information
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
}
