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
public class FeatureEnvyDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.feature-envy";
    private static final double ENVY_THRESHOLD = 0.6; // 60% of calls are to other classes
    
    // Pattern to match method calls
    private static final Pattern METHOD_CALL_PATTERN = Pattern.compile(
        "\\b(\\w+)\\.(\\w+)\\s*\\("
    );
    
    // Pattern to match method declarations
    private static final Pattern METHOD_DECLARATION_PATTERN = Pattern.compile(
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
            .flatMap(sourceFile -> analyzeFileForFeatureEnvy(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForFeatureEnvy(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            // Read file content
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            // Find all method declarations
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i);
                Matcher methodMatcher = METHOD_DECLARATION_PATTERN.matcher(line);
                
                if (methodMatcher.find()) {
                    String methodName = methodMatcher.group(3);
                    
                    // Analyze method for feature envy
                    FeatureEnvyAnalysis analysis = analyzeMethodForEnvy(lines, i, className);
                    
                    if (analysis.hasFeatureEnvy()) {
                        Severity severity = determineSeverity(analysis.getEnvyRatio());
                        
                        ReasonEvidence evidence = new ReasonEvidence(
                            DETECTOR_ID,
                            new CodePointer(
                                projectRoot.relativize(sourceFile),
                                className,
                                methodName,
                                i + 1, // 1-based line number
                                findMethodEndLine(lines, i),
                                1,
                                1
                            ),
                            Map.of(
                                "envyRatio", analysis.getEnvyRatio(),
                                "internalCalls", analysis.getInternalCalls(),
                                "externalCalls", analysis.getExternalCalls(),
                                "totalCalls", analysis.getTotalCalls(),
                                "methodName", methodName
                            ),
                            String.format("Method '%s' shows feature envy: %.1f%% of calls are to other classes", 
                                         methodName, analysis.getEnvyRatio() * 100),
                            severity
                        );
                        
                        evidences.add(evidence);
                    }
                }
            }
            
            return evidences.stream();
        } catch (Exception e) {
            return Stream.empty();
        }
    }
    
    private FeatureEnvyAnalysis analyzeMethodForEnvy(List<String> lines, int methodStartLine, String currentClassName) {
        Map<String, Integer> classCallCounts = new HashMap<>();
        int totalCalls = 0;
        int methodEndLine = findMethodEndLine(lines, methodStartLine);
        
        // Analyze method body for method calls
        for (int i = methodStartLine; i < methodEndLine && i < lines.size(); i++) {
            String line = lines.get(i);
            Matcher callMatcher = METHOD_CALL_PATTERN.matcher(line);
            
            while (callMatcher.find()) {
                String calledClass = callMatcher.group(1);
                String calledMethod = callMatcher.group(2);
                
                // Skip if it's a primitive type or common utility
                if (isPrimitiveOrUtility(calledClass)) {
                    continue;
                }
                
                classCallCounts.put(calledClass, classCallCounts.getOrDefault(calledClass, 0) + 1);
                totalCalls++;
            }
        }
        
        // Calculate internal vs external calls
        int internalCalls = classCallCounts.getOrDefault(currentClassName, 0);
        int externalCalls = totalCalls - internalCalls;
        
        double envyRatio = totalCalls > 0 ? (double) externalCalls / totalCalls : 0.0;
        
        return new FeatureEnvyAnalysis(envyRatio, internalCalls, externalCalls, totalCalls);
    }
    
    private boolean isPrimitiveOrUtility(String className) {
        // Common primitive wrappers and utilities that don't indicate feature envy
        return className.equals("String") || 
               className.equals("Integer") || 
               className.equals("Long") || 
               className.equals("Double") || 
               className.equals("Boolean") ||
               className.equals("System") ||
               className.equals("Math") ||
               className.equals("Collections") ||
               className.equals("Arrays") ||
               className.equals("Objects") ||
               className.startsWith("java.lang.") ||
               className.startsWith("java.util.");
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
        
        return Math.min(methodStartLine + 10, lines.size()); // Fallback
    }
    
    private Severity determineSeverity(double envyRatio) {
        if (envyRatio >= 0.8) {
            return Severity.CRITICAL;
        } else if (envyRatio >= 0.6) {
            return Severity.MAJOR;
        } else {
            return Severity.MINOR;
        }
    }
    
    // Helper class to hold analysis results
    private static class FeatureEnvyAnalysis {
        private final double envyRatio;
        private final int internalCalls;
        private final int externalCalls;
        private final int totalCalls;
        
        public FeatureEnvyAnalysis(double envyRatio, int internalCalls, int externalCalls, int totalCalls) {
            this.envyRatio = envyRatio;
            this.internalCalls = internalCalls;
            this.externalCalls = externalCalls;
            this.totalCalls = totalCalls;
        }
        
        public boolean hasFeatureEnvy() {
            return envyRatio >= ENVY_THRESHOLD && totalCalls >= 3; // Need at least 3 calls to be meaningful
        }
        
        public double getEnvyRatio() { return envyRatio; }
        public int getInternalCalls() { return internalCalls; }
        public int getExternalCalls() { return externalCalls; }
        public int getTotalCalls() { return totalCalls; }
    }
}
