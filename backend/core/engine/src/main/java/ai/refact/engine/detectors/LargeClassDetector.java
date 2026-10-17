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
public class LargeClassDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.large-class";
    private static final int MAX_LINES = 300; // Maximum lines for a class
    private static final int MAX_FIELDS = 15; // Maximum fields
    private static final int MAX_METHODS = 20; // Maximum methods
    
    // Pattern to match class declarations
    private static final Pattern CLASS_PATTERN = Pattern.compile(
        "\\s*(public|private|protected|abstract|final)?\\s*class\\s+(\\w+)"
    );
    
    // Pattern to match method declarations
    private static final Pattern METHOD_PATTERN = Pattern.compile(
        "\\s*(public|private|protected|static|final|abstract)?\\s+" +
        "([\\w.<>\\[\\]]+)\\s+" + // return type
        "(\\w+)\\s*\\(" // method name
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
            .flatMap(sourceFile -> analyzeFileForLargeClass(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForLargeClass(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            // Find class declaration
            int classLine = findClassDeclaration(lines);
            if (classLine == -1) {
                return Stream.empty();
            }
            
            // Analyze class size
            ClassSizeAnalysis analysis = analyzeClassSize(lines, classLine);
            
            if (analysis.isLargeClass()) {
                Severity severity = determineSeverity(
                    analysis.getTotalLines(), 
                    analysis.getMethodCount(), 
                    analysis.getFieldCount()
                );
                
                ReasonEvidence evidence = new ReasonEvidence(
                    DETECTOR_ID,
                    new CodePointer(
                        projectRoot.relativize(sourceFile),
                        className,
                        "class",
                        classLine + 1,
                        Math.min(classLine + 10, lines.size()),
                        1,
                        1
                    ),
                    Map.of(
                        "totalLines", analysis.getTotalLines(),
                        "methodCount", analysis.getMethodCount(),
                        "fieldCount", analysis.getFieldCount(),
                        "className", className
                    ),
                    String.format("Large class '%s': %d lines, %d methods, %d fields", 
                                 className, analysis.getTotalLines(), 
                                 analysis.getMethodCount(), analysis.getFieldCount()),
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
    
    private ClassSizeAnalysis analyzeClassSize(List<String> lines, int classLine) {
        int totalLines = 0;
        int methodCount = 0;
        int fieldCount = 0;
        
        // Find class boundaries
        int braceCount = 0;
        boolean inClass = false;
        int classStartLine = classLine;
        int classEndLine = lines.size();
        
        for (int i = classLine; i < lines.size(); i++) {
            String line = lines.get(i);
            
            for (char c : line.toCharArray()) {
                if (c == '{') {
                    braceCount++;
                    if (braceCount == 1) {
                        inClass = true;
                        classStartLine = i;
                    }
                } else if (c == '}') {
                    braceCount--;
                    if (inClass && braceCount == 0) {
                        classEndLine = i;
                        break;
                    }
                }
            }
            if (inClass && braceCount == 0) {
                break;
            }
        }
        
        // Count lines, methods, and fields within class
        for (int i = classStartLine; i < classEndLine && i < lines.size(); i++) {
            String line = lines.get(i);
            
            // Skip empty lines and comments
            if (line.trim().isEmpty() || line.trim().startsWith("//") || 
                line.trim().startsWith("/*") || line.trim().startsWith("*")) {
                continue;
            }
            
            totalLines++;
            
            // Count methods
            Matcher methodMatcher = METHOD_PATTERN.matcher(line);
            if (methodMatcher.find() && !line.contains("class ")) {
                methodCount++;
            }
            
            // Count fields
            Matcher fieldMatcher = FIELD_PATTERN.matcher(line);
            if (fieldMatcher.find() && !line.contains("(")) {
                fieldCount++;
            }
        }
        
        return new ClassSizeAnalysis(totalLines, methodCount, fieldCount);
    }
    
    private Severity determineSeverity(int totalLines, int methodCount, int fieldCount) {
        if (totalLines >= 500 || methodCount >= 30 || fieldCount >= 25) {
            return Severity.CRITICAL;
        } else if (totalLines >= 400 || methodCount >= 25 || fieldCount >= 20) {
            return Severity.MAJOR;
        } else {
            return Severity.MINOR;
        }
    }
    
    // Helper class
    private static class ClassSizeAnalysis {
        private final int totalLines;
        private final int methodCount;
        private final int fieldCount;
        
        public ClassSizeAnalysis(int totalLines, int methodCount, int fieldCount) {
            this.totalLines = totalLines;
            this.methodCount = methodCount;
            this.fieldCount = fieldCount;
        }
        
        public boolean isLargeClass() {
            return totalLines >= MAX_LINES || methodCount >= MAX_METHODS || fieldCount >= MAX_FIELDS;
        }
        
        public int getTotalLines() { return totalLines; }
        public int getMethodCount() { return methodCount; }
        public int getFieldCount() { return fieldCount; }
    }
}
