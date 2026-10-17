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
public class ShotgunSurgeryDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.shotgun-surgery";
    private static final int MIN_AFFECTED_CLASSES = 3; // Minimum classes affected to be considered shotgun surgery
    private static final int MIN_CHANGES_PER_CLASS = 2; // Minimum changes per class
    
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
        
        // Collect all class dependencies across all files
        Map<String, Map<String, Integer>> classDependencies = new HashMap<>();
        Map<String, String> classNameToFile = new HashMap<>();
        
        // First pass: collect all classes and their dependencies
        for (java.nio.file.Path sourceFile : ctx.sourceFiles()) {
            try {
                List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
                if (lines.isEmpty()) continue;
                
                String className = sourceFile.getFileName().toString().replace(".java", "");
                classNameToFile.put(className, sourceFile.toString());
                
                Map<String, Integer> dependencies = analyzeClassDependencies(lines, className);
                classDependencies.put(className, dependencies);
            } catch (Exception e) {
                continue;
            }
        }
        
        // Second pass: find shotgun surgery patterns
        List<ReasonEvidence> evidences = new ArrayList<>();
        for (Map.Entry<String, Map<String, Integer>> entry : classDependencies.entrySet()) {
            String className = entry.getKey();
            Map<String, Integer> dependencies = entry.getValue();
            
            ShotgunSurgeryAnalysis analysis = analyzeForShotgunSurgery(className, dependencies, classDependencies);
            
            if (analysis.hasShotgunSurgery()) {
                Severity severity = determineSeverity(analysis.getAffectedClassesCount(), analysis.getTotalChanges());
                
                ReasonEvidence evidence = new ReasonEvidence(
                    DETECTOR_ID,
                    new CodePointer(
                        ctx.root().relativize(java.nio.file.Paths.get(classNameToFile.get(className))),
                        className,
                        "class",
                        1, // Line number (simplified)
                        Math.min(10, 50), // Highlight first 10 lines
                        1,
                        1
                    ),
                    Map.of(
                        "affectedClassesCount", analysis.getAffectedClassesCount(),
                        "totalChanges", analysis.getTotalChanges(),
                        "averageChangesPerClass", analysis.getAverageChangesPerClass(),
                        "className", className
                    ),
                    String.format("Class '%s' causes shotgun surgery: affects %d classes with %d total changes", 
                                 className, analysis.getAffectedClassesCount(), analysis.getTotalChanges()),
                    severity
                );
                
                evidences.add(evidence);
            }
        }
        
        return evidences.stream();
    }
    
    private Map<String, Integer> analyzeClassDependencies(List<String> lines, String currentClassName) {
        Map<String, Integer> dependencies = new HashMap<>();
        
        // Find class boundaries
        int classStartLine = findClassDeclaration(lines);
        if (classStartLine == -1) {
            return dependencies;
        }
        
        int classEndLine = findClassEndLine(lines, classStartLine);
        
        // Analyze class body for external dependencies
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
                
                dependencies.put(calledClass, dependencies.getOrDefault(calledClass, 0) + 1);
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
                
                dependencies.put(accessedClass, dependencies.getOrDefault(accessedClass, 0) + 1);
            }
        }
        
        return dependencies;
    }
    
    private ShotgunSurgeryAnalysis analyzeForShotgunSurgery(String className, Map<String, Integer> dependencies, 
                                                           Map<String, Map<String, Integer>> allClassDependencies) {
        int affectedClassesCount = 0;
        int totalChanges = 0;
        
        // Count how many classes this class affects
        for (String dependentClass : dependencies.keySet()) {
            int changeCount = dependencies.get(dependentClass);
            if (changeCount >= MIN_CHANGES_PER_CLASS) {
                affectedClassesCount++;
                totalChanges += changeCount;
            }
        }
        
        // Also check if this class is heavily depended upon by others (reverse analysis)
        int reverseDependencies = 0;
        for (Map.Entry<String, Map<String, Integer>> entry : allClassDependencies.entrySet()) {
            String otherClassName = entry.getKey();
            Map<String, Integer> otherDependencies = entry.getValue();
            
            if (otherDependencies.containsKey(className)) {
                int changeCount = otherDependencies.get(className);
                if (changeCount >= MIN_CHANGES_PER_CLASS) {
                    reverseDependencies++;
                    totalChanges += changeCount;
                }
            }
        }
        
        // Use the maximum of forward and reverse dependencies
        affectedClassesCount = Math.max(affectedClassesCount, reverseDependencies);
        
        double averageChangesPerClass = affectedClassesCount > 0 ? (double) totalChanges / affectedClassesCount : 0.0;
        
        return new ShotgunSurgeryAnalysis(affectedClassesCount, totalChanges, averageChangesPerClass);
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
    
    private boolean isPrimitiveOrUtility(String className) {
        // Common primitive wrappers and utilities that don't indicate shotgun surgery
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
    
    private Severity determineSeverity(int affectedClassesCount, int totalChanges) {
        if (affectedClassesCount >= 8 || totalChanges >= 30) {
            return Severity.CRITICAL;
        } else if (affectedClassesCount >= 5 || totalChanges >= 20) {
            return Severity.MAJOR;
        } else {
            return Severity.MINOR;
        }
    }
    
    // Helper class to hold analysis results
    private static class ShotgunSurgeryAnalysis {
        private final int affectedClassesCount;
        private final int totalChanges;
        private final double averageChangesPerClass;
        
        public ShotgunSurgeryAnalysis(int affectedClassesCount, int totalChanges, double averageChangesPerClass) {
            this.affectedClassesCount = affectedClassesCount;
            this.totalChanges = totalChanges;
            this.averageChangesPerClass = averageChangesPerClass;
        }
        
        public boolean hasShotgunSurgery() {
            return affectedClassesCount >= MIN_AFFECTED_CLASSES;
        }
        
        public int getAffectedClassesCount() { return affectedClassesCount; }
        public int getTotalChanges() { return totalChanges; }
        public double getAverageChangesPerClass() { return averageChangesPerClass; }
    }
}
