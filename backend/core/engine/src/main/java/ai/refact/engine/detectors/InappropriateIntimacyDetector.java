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
public class InappropriateIntimacyDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.inappropriate-intimacy";
    private static final double INTIMACY_THRESHOLD = 0.7; // 70% of calls are to one other class
    private static final int MIN_CALLS = 5; // Minimum calls to be considered intimate
    
    // Pattern to match method calls
    private static final Pattern METHOD_CALL_PATTERN = Pattern.compile(
        "\\b(\\w+)\\.(\\w+)\\s*\\("
    );
    
    // Pattern to match field access
    private static final Pattern FIELD_ACCESS_PATTERN = Pattern.compile(
        "\\b(\\w+)\\.(\\w+)(?!\\s*\\()"
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
        
        // Analyze each Java source file
        return ctx.sourceFiles().stream()
            .flatMap(sourceFile -> analyzeFileForInappropriateIntimacy(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForInappropriateIntimacy(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            // Read file content
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            // Find class boundaries
            int classStartLine = findClassDeclaration(lines);
            if (classStartLine == -1) {
                return Stream.empty();
            }
            
            int classEndLine = findClassEndLine(lines, classStartLine);
            
            // Analyze class for inappropriate intimacy
            IntimacyAnalysis analysis = analyzeClassForIntimacy(lines, classStartLine, classEndLine, className);
            
            if (analysis.hasInappropriateIntimacy()) {
                Severity severity = determineSeverity(analysis.getIntimacyRatio(), analysis.getTotalCalls());
                
                ReasonEvidence evidence = new ReasonEvidence(
                    DETECTOR_ID,
                    new CodePointer(
                        projectRoot.relativize(sourceFile),
                        className,
                        "class",
                        classStartLine + 1, // 1-based line number
                        Math.min(classStartLine + 10, lines.size()), // Highlight class declaration + a few lines
                        1,
                        1
                    ),
                    Map.of(
                        "intimateClass", analysis.getMostIntimateClass(),
                        "intimacyRatio", analysis.getIntimacyRatio(),
                        "totalCalls", analysis.getTotalCalls(),
                        "intimateCalls", analysis.getIntimateCalls(),
                        "className", className
                    ),
                    String.format("Class '%s' shows inappropriate intimacy with '%s': %.1f%% of calls (%d/%d)", 
                                 className, analysis.getMostIntimateClass(), 
                                 analysis.getIntimacyRatio() * 100, analysis.getIntimateCalls(), analysis.getTotalCalls()),
                    severity
                );
                
                evidences.add(evidence);
            }
            
            return evidences.stream();
        } catch (Exception e) {
            return Stream.empty();
        }
    }
    
    private int findClassDeclaration(List<String> lines) {
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            Matcher matcher = CLASS_PATTERN.matcher(line);
            if (matcher.find()) {
                return i;
            }
        }
        return -1;
    }
    
    private int findClassEndLine(List<String> lines, int classStartLine) {
        int braceCount = 0;
        boolean inClass = false;
        
        for (int i = classStartLine; i < lines.size(); i++) {
            String line = lines.get(i);
            
            for (char c : line.toCharArray()) {
                if (c == '{') {
                    braceCount++;
                    inClass = true;
                } else if (c == '}') {
                    braceCount--;
                    if (inClass && braceCount == 0) {
                        return i + 1; // 1-based line number
                    }
                }
            }
        }
        
        return lines.size(); // Fallback
    }
    
    private IntimacyAnalysis analyzeClassForIntimacy(List<String> lines, int classStartLine, int classEndLine, String currentClassName) {
        Map<String, Integer> classCallCounts = new HashMap<>();
        int totalCalls = 0;
        
        // Analyze class body for external calls
        for (int i = classStartLine; i < classEndLine && i < lines.size(); i++) {
            String line = lines.get(i);
            
            // Skip comments and empty lines
            if (line.trim().startsWith("//") || line.trim().startsWith("/*") || 
                line.trim().startsWith("*") || line.trim().isEmpty()) {
                continue;
            }
            
            // Count method calls to other classes
            Matcher callMatcher = METHOD_CALL_PATTERN.matcher(line);
            while (callMatcher.find()) {
                String calledClass = callMatcher.group(1);
                String calledMethod = callMatcher.group(2);
                
                // Skip if it's a call to the same class or primitive types
                if (calledClass.equals(currentClassName) || isPrimitiveOrUtility(calledClass)) {
                    continue;
                }
                
                classCallCounts.put(calledClass, classCallCounts.getOrDefault(calledClass, 0) + 1);
                totalCalls++;
            }
            
            // Count field access to other classes
            Matcher fieldMatcher = FIELD_ACCESS_PATTERN.matcher(line);
            while (fieldMatcher.find()) {
                String accessedClass = fieldMatcher.group(1);
                String accessedField = fieldMatcher.group(2);
                
                // Skip if it's access to the same class or primitive types
                if (accessedClass.equals(currentClassName) || isPrimitiveOrUtility(accessedClass)) {
                    continue;
                }
                
                classCallCounts.put(accessedClass, classCallCounts.getOrDefault(accessedClass, 0) + 1);
                totalCalls++;
            }
        }
        
        // Find the most intimate class
        String mostIntimateClass = "";
        int maxCalls = 0;
        for (Map.Entry<String, Integer> entry : classCallCounts.entrySet()) {
            if (entry.getValue() > maxCalls) {
                maxCalls = entry.getValue();
                mostIntimateClass = entry.getKey();
            }
        }
        
        double intimacyRatio = totalCalls > 0 ? (double) maxCalls / totalCalls : 0.0;
        
        return new IntimacyAnalysis(mostIntimateClass, intimacyRatio, totalCalls, maxCalls);
    }
    
    private boolean isPrimitiveOrUtility(String className) {
        // Common primitive wrappers and utilities that don't indicate inappropriate intimacy
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
    
    private Severity determineSeverity(double intimacyRatio, int totalCalls) {
        if (intimacyRatio >= 0.9 || totalCalls >= 20) {
            return Severity.CRITICAL;
        } else if (intimacyRatio >= 0.8 || totalCalls >= 15) {
            return Severity.MAJOR;
        } else {
            return Severity.MINOR;
        }
    }
    
    // Helper class to hold analysis results
    private static class IntimacyAnalysis {
        private final String mostIntimateClass;
        private final double intimacyRatio;
        private final int totalCalls;
        private final int intimateCalls;
        
        public IntimacyAnalysis(String mostIntimateClass, double intimacyRatio, int totalCalls, int intimateCalls) {
            this.mostIntimateClass = mostIntimateClass;
            this.intimacyRatio = intimacyRatio;
            this.totalCalls = totalCalls;
            this.intimateCalls = intimateCalls;
        }
        
        public boolean hasInappropriateIntimacy() {
            return intimacyRatio >= INTIMACY_THRESHOLD && totalCalls >= MIN_CALLS;
        }
        
        public String getMostIntimateClass() { return mostIntimateClass; }
        public double getIntimacyRatio() { return intimacyRatio; }
        public int getTotalCalls() { return totalCalls; }
        public int getIntimateCalls() { return intimateCalls; }
    }
}
