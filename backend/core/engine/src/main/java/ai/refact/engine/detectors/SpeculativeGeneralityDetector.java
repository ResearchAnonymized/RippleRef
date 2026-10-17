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
public class SpeculativeGeneralityDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.speculative-generality";
    private static final int MIN_USAGE_COUNT = 1; // Minimum usage to not be considered speculative
    private static final double USAGE_RATIO_THRESHOLD = 0.1; // 10% usage ratio threshold
    
    // Pattern to match method declarations
    private static final Pattern METHOD_PATTERN = Pattern.compile(
        "\\s*(public|private|protected|static|final|abstract)?\\s+" +
        "(\\w+\\s+)*" + // return type
        "(\\w+)\\s*\\(" + // method name
        "([^)]*)\\)" // parameters
    );
    
    // Pattern to match method calls
    private static final Pattern METHOD_CALL_PATTERN = Pattern.compile(
        "\\b(\\w+)\\s*\\("
    );
    
    // Pattern to match class declarations
    private static final Pattern CLASS_PATTERN = Pattern.compile(
        "\\s*(public|private|protected|abstract|final)?\\s*class\\s+(\\w+)"
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
        
        // Collect all method usage across all files
        Map<String, Integer> methodUsageCount = new HashMap<>();
        Map<String, String> methodToClass = new HashMap<>();
        
        // First pass: collect all method declarations and their classes
        for (java.nio.file.Path sourceFile : ctx.sourceFiles()) {
            try {
                List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
                if (lines.isEmpty()) continue;
                
                String className = sourceFile.getFileName().toString().replace(".java", "");
                
                for (int i = 0; i < lines.size(); i++) {
                    String line = lines.get(i);
                    Matcher matcher = METHOD_PATTERN.matcher(line);
                    
                    if (matcher.find() && !line.contains("class ") && !line.contains("interface ")) {
                        String methodName = matcher.group(3);
                        String fullMethodName = className + "." + methodName;
                        methodToClass.put(fullMethodName, className);
                        methodUsageCount.put(fullMethodName, 0); // Initialize usage count
                    }
                }
            } catch (Exception e) {
                continue;
            }
        }
        
        // Second pass: count method usage across all files
        for (java.nio.file.Path sourceFile : ctx.sourceFiles()) {
            try {
                List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
                if (lines.isEmpty()) continue;
                
                for (String line : lines) {
                    Matcher callMatcher = METHOD_CALL_PATTERN.matcher(line);
                    while (callMatcher.find()) {
                        String calledMethod = callMatcher.group(1);
                        
                        // Check if this method exists in our collected methods
                        for (String fullMethodName : methodUsageCount.keySet()) {
                            if (fullMethodName.endsWith("." + calledMethod)) {
                                methodUsageCount.put(fullMethodName, methodUsageCount.get(fullMethodName) + 1);
                            }
                        }
                    }
                }
            } catch (Exception e) {
                continue;
            }
        }
        
        // Find speculative methods
        List<ReasonEvidence> evidences = new ArrayList<>();
        for (Map.Entry<String, Integer> entry : methodUsageCount.entrySet()) {
            String fullMethodName = entry.getKey();
            int usageCount = entry.getValue();
            String className = methodToClass.get(fullMethodName);
            
            if (usageCount <= MIN_USAGE_COUNT) {
                Severity severity = determineSeverity(usageCount);
                
                ReasonEvidence evidence = new ReasonEvidence(
                    DETECTOR_ID,
                    new CodePointer(
                        ctx.root().relativize(findSourceFileForClass(ctx, className)),
                        className,
                        fullMethodName.split("\\.")[1], // method name
                        1, // Line number (simplified)
                        1,
                        1,
                        1
                    ),
                    Map.of(
                        "methodName", fullMethodName.split("\\.")[1],
                        "className", className,
                        "usageCount", usageCount,
                        "fullMethodName", fullMethodName
                    ),
                    String.format("Method '%s' appears to be speculative generality: used only %d times", 
                                 fullMethodName.split("\\.")[1], usageCount),
                    severity
                );
                
                evidences.add(evidence);
            }
        }
        
        return evidences.stream();
    }
    
    private java.nio.file.Path findSourceFileForClass(ProjectContext ctx, String className) {
        for (java.nio.file.Path sourceFile : ctx.sourceFiles()) {
            if (sourceFile.getFileName().toString().equals(className + ".java")) {
                return sourceFile;
            }
        }
        return ctx.sourceFiles().iterator().next(); // Fallback
    }
    
    private Severity determineSeverity(int usageCount) {
        if (usageCount == 0) {
            return Severity.CRITICAL;
        } else if (usageCount == 1) {
            return Severity.MAJOR;
        } else {
            return Severity.MINOR;
        }
    }
}
