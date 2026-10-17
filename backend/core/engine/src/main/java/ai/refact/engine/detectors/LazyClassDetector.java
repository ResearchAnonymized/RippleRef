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
public class LazyClassDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.lazy-class";
    private static final int MAX_METHODS = 3; // Maximum methods for a lazy class
    private static final int MAX_LINES = 50; // Maximum lines for a lazy class
    private static final int MAX_COMPLEXITY = 5; // Maximum cyclomatic complexity
    
    // Pattern to match class declarations
    private static final Pattern CLASS_PATTERN = Pattern.compile(
        "\\s*(public|private|protected|abstract|final)?\\s*class\\s+(\\w+)"
    );
    
    // Pattern to match method declarations
    private static final Pattern METHOD_PATTERN = Pattern.compile(
        "\\s*(public|private|protected|static|final|abstract)?\\s+" +
        "(\\w+\\s+)*" + // return type
        "(\\w+)\\s*\\(" + // method name
        "([^)]*)\\)" // parameters
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
            .flatMap(sourceFile -> analyzeFileForLazyClass(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForLazyClass(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            // Read file content
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            // Find class declaration
            int classLine = findClassDeclaration(lines);
            if (classLine == -1) {
                return Stream.empty(); // No class found
            }
            
            // Analyze class for laziness
            LazyClassAnalysis analysis = analyzeClassForLaziness(lines, classLine);
            
            if (analysis.isLazyClass()) {
                Severity severity = determineSeverity(analysis.getMethodCount(), analysis.getLineCount(), analysis.getComplexity());
                
                ReasonEvidence evidence = new ReasonEvidence(
                    DETECTOR_ID,
                    new CodePointer(
                        projectRoot.relativize(sourceFile),
                        className,
                        "class",
                        classLine + 1, // 1-based line number
                        Math.min(classLine + 10, lines.size()), // Highlight class declaration + a few lines
                        1,
                        1
                    ),
                    Map.of(
                        "methodCount", analysis.getMethodCount(),
                        "fieldCount", analysis.getFieldCount(),
                        "lineCount", analysis.getLineCount(),
                        "complexity", analysis.getComplexity(),
                        "className", className
                    ),
                    String.format("Class '%s' appears to be lazy: %d methods, %d lines, complexity %d", 
                                 className, analysis.getMethodCount(), analysis.getLineCount(), analysis.getComplexity()),
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
    
    private LazyClassAnalysis analyzeClassForLaziness(List<String> lines, int classLine) {
        int methodCount = 0;
        int fieldCount = 0;
        int lineCount = 0;
        int complexity = 0;
        
        // Count methods and fields within the class
        int braceCount = 0;
        boolean inClass = false;
        int classStartLine = classLine;
        int classEndLine = lines.size();
        
        // Find class boundaries
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
        
        // Analyze content within class boundaries
        for (int i = classStartLine; i < classEndLine && i < lines.size(); i++) {
            String line = lines.get(i);
            
            // Skip empty lines and comments
            if (line.trim().isEmpty() || line.trim().startsWith("//") || 
                line.trim().startsWith("/*") || line.trim().startsWith("*")) {
                continue;
            }
            
            lineCount++;
            
            // Count methods
            Matcher methodMatcher = METHOD_PATTERN.matcher(line);
            if (methodMatcher.find() && !line.contains("class ") && !line.contains("interface ")) {
                methodCount++;
            }
            
            // Count fields
            Matcher fieldMatcher = FIELD_PATTERN.matcher(line);
            if (fieldMatcher.find() && !line.contains("(") && !line.contains("class ")) {
                fieldCount++;
            }
            
            // Simple complexity calculation (count control structures)
            if (line.contains("if ") || line.contains("for ") || line.contains("while ") || 
                line.contains("switch ") || line.contains("catch ") || line.contains("&&") || 
                line.contains("||") || line.contains("?")) {
                complexity++;
            }
        }
        
        return new LazyClassAnalysis(methodCount, fieldCount, lineCount, complexity);
    }
    
    private Severity determineSeverity(int methodCount, int lineCount, int complexity) {
        if (methodCount <= 1 && lineCount <= 20) {
            return Severity.CRITICAL;
        } else if (methodCount <= 2 && lineCount <= 30) {
            return Severity.MAJOR;
        } else {
            return Severity.MINOR;
        }
    }
    
    // Helper class to hold analysis results
    private static class LazyClassAnalysis {
        private final int methodCount;
        private final int fieldCount;
        private final int lineCount;
        private final int complexity;
        
        public LazyClassAnalysis(int methodCount, int fieldCount, int lineCount, int complexity) {
            this.methodCount = methodCount;
            this.fieldCount = fieldCount;
            this.lineCount = lineCount;
            this.complexity = complexity;
        }
        
        public boolean isLazyClass() {
            return methodCount <= MAX_METHODS && lineCount <= MAX_LINES && complexity <= MAX_COMPLEXITY;
        }
        
        public int getMethodCount() { return methodCount; }
        public int getFieldCount() { return fieldCount; }
        public int getLineCount() { return lineCount; }
        public int getComplexity() { return complexity; }
    }
}
