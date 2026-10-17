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
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

@Component
public class RefusedBequestDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.refused-bequest";
    private static final double USAGE_THRESHOLD = 0.3; // Less than 30% of inherited methods used
    
    // Pattern to match class declarations with extends
    private static final Pattern CLASS_EXTENDS_PATTERN = Pattern.compile(
        "\\s*(?:public|private|protected)?\\s*class\\s+(\\w+)\\s+extends\\s+(\\w+)"
    );
    
    // Pattern to match method declarations
    private static final Pattern METHOD_PATTERN = Pattern.compile(
        "\\s*(public|private|protected|static|final|abstract)?\\s+" +
        "([\\w.<>\\[\\]]+)\\s+" + // return type
        "(\\w+)\\s*\\(" // method name
    );
    
    // Pattern to match method calls
    private static final Pattern METHOD_CALL_PATTERN = Pattern.compile(
        "\\bsuper\\.(\\w+)\\s*\\(|\\b(\\w+)\\s*\\("
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
        
        // First pass: collect all class hierarchies and their methods
        Map<String, ClassInfo> classInfoMap = new HashMap<>();
        
        for (java.nio.file.Path sourceFile : ctx.sourceFiles()) {
            try {
                List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
                if (lines.isEmpty()) continue;
                
                String className = sourceFile.getFileName().toString().replace(".java", "");
                ClassInfo info = analyzeClass(lines, className, sourceFile);
                if (info != null) {
                    classInfoMap.put(className, info);
                }
            } catch (Exception e) {
                continue;
            }
        }
        
        // Second pass: detect refused bequest
        List<ReasonEvidence> evidences = new ArrayList<>();
        
        for (Map.Entry<String, ClassInfo> entry : classInfoMap.entrySet()) {
            ClassInfo childClass = entry.getValue();
            
            if (childClass.parentClass != null && classInfoMap.containsKey(childClass.parentClass)) {
                ClassInfo parentClass = classInfoMap.get(childClass.parentClass);
                
                BequestAnalysis analysis = analyzeBequestUsage(childClass, parentClass);
                
                if (analysis.hasRefusedBequest()) {
                    Severity severity = determineSeverity(analysis.getUsageRatio());
                    
                    ReasonEvidence evidence = new ReasonEvidence(
                        DETECTOR_ID,
                        new CodePointer(
                            ctx.root().relativize(childClass.sourceFile),
                            childClass.className,
                            "class",
                            1,
                            Math.min(10, 50),
                            1,
                            1
                        ),
                        Map.of(
                            "childClass", childClass.className,
                            "parentClass", parentClass.className,
                            "parentMethods", parentClass.methods.size(),
                            "usedMethods", analysis.getUsedMethodsCount(),
                            "usageRatio", analysis.getUsageRatio()
                        ),
                        String.format("Class '%s' refuses bequest from '%s': only %.1f%% of inherited methods used (%d/%d)", 
                                     childClass.className, parentClass.className,
                                     analysis.getUsageRatio() * 100, 
                                     analysis.getUsedMethodsCount(), parentClass.methods.size()),
                        severity
                    );
                    
                    evidences.add(evidence);
                }
            }
        }
        
        return evidences.stream();
    }
    
    private ClassInfo analyzeClass(List<String> lines, String className, java.nio.file.Path sourceFile) {
        String parentClass = null;
        Set<String> methods = new HashSet<>();
        Set<String> calledMethods = new HashSet<>();
        
        // Find parent class
        for (String line : lines) {
            Matcher extendsMatcher = CLASS_EXTENDS_PATTERN.matcher(line);
            if (extendsMatcher.find()) {
                parentClass = extendsMatcher.group(2);
            }
            
            // Collect methods
            Matcher methodMatcher = METHOD_PATTERN.matcher(line);
            if (methodMatcher.find() && !line.contains("class ")) {
                String methodName = methodMatcher.group(3);
                methods.add(methodName);
            }
            
            // Collect method calls
            Matcher callMatcher = METHOD_CALL_PATTERN.matcher(line);
            while (callMatcher.find()) {
                String calledMethod = callMatcher.group(1) != null ? callMatcher.group(1) : callMatcher.group(2);
                if (calledMethod != null) {
                    calledMethods.add(calledMethod);
                }
            }
        }
        
        return new ClassInfo(className, parentClass, methods, calledMethods, sourceFile);
    }
    
    private BequestAnalysis analyzeBequestUsage(ClassInfo childClass, ClassInfo parentClass) {
        int usedMethodsCount = 0;
        
        // Count how many parent methods are used by child
        for (String parentMethod : parentClass.methods) {
            // Check if child calls this parent method
            if (childClass.calledMethods.contains(parentMethod)) {
                usedMethodsCount++;
            }
            // Or if child overrides it (which counts as using it)
            else if (childClass.methods.contains(parentMethod)) {
                usedMethodsCount++;
            }
        }
        
        double usageRatio = parentClass.methods.size() > 0 ? 
            (double) usedMethodsCount / parentClass.methods.size() : 1.0;
        
        return new BequestAnalysis(usedMethodsCount, parentClass.methods.size(), usageRatio);
    }
    
    private Severity determineSeverity(double usageRatio) {
        if (usageRatio <= 0.1) { // 10% or less used
            return Severity.CRITICAL;
        } else if (usageRatio <= 0.2) { // 20% or less used
            return Severity.MAJOR;
        } else {
            return Severity.MINOR;
        }
    }
    
    // Helper classes
    private static class ClassInfo {
        String className;
        String parentClass;
        Set<String> methods;
        Set<String> calledMethods;
        java.nio.file.Path sourceFile;
        
        ClassInfo(String className, String parentClass, Set<String> methods, 
                 Set<String> calledMethods, java.nio.file.Path sourceFile) {
            this.className = className;
            this.parentClass = parentClass;
            this.methods = methods;
            this.calledMethods = calledMethods;
            this.sourceFile = sourceFile;
        }
    }
    
    private static class BequestAnalysis {
        private final int usedMethodsCount;
        private final int totalParentMethods;
        private final double usageRatio;
        
        BequestAnalysis(int usedMethodsCount, int totalParentMethods, double usageRatio) {
            this.usedMethodsCount = usedMethodsCount;
            this.totalParentMethods = totalParentMethods;
            this.usageRatio = usageRatio;
        }
        
        boolean hasRefusedBequest() {
            return totalParentMethods >= 3 && usageRatio < USAGE_THRESHOLD;
        }
        
        int getUsedMethodsCount() { return usedMethodsCount; }
        double getUsageRatio() { return usageRatio; }
    }
}
