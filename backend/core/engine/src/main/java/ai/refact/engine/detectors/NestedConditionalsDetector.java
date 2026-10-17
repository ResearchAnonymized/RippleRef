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
public class NestedConditionalsDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.nested-conditionals";
    private static final int MAX_NESTING_LEVEL = 3; // Maximum acceptable nesting level
    
    // Pattern to match method declarations
    private static final Pattern METHOD_PATTERN = Pattern.compile(
        "\\s*(public|private|protected|static|final|abstract)?\\s+" +
        "([\\w.<>\\[\\]]+)\\s+" + // return type
        "(\\w+)\\s*\\(" // method name
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
            .flatMap(sourceFile -> analyzeFileForNestedConditionals(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForNestedConditionals(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i);
                Matcher matcher = METHOD_PATTERN.matcher(line);
                
                if (matcher.find() && !line.contains("class ") && !line.contains("interface ")) {
                    String methodName = matcher.group(3);
                    int methodEndLine = findMethodEndLine(lines, i);
                    
                    // Analyze nesting in this method
                    int maxNesting = analyzeNestingLevel(lines, i, methodEndLine);
                    
                    if (maxNesting > MAX_NESTING_LEVEL) {
                        Severity severity = determineSeverity(maxNesting);
                        
                        ReasonEvidence evidence = new ReasonEvidence(
                            DETECTOR_ID,
                            new CodePointer(
                                projectRoot.relativize(sourceFile),
                                className,
                                methodName,
                                i + 1,
                                methodEndLine,
                                1,
                                1
                            ),
                            Map.of(
                                "maxNestingLevel", maxNesting,
                                "threshold", MAX_NESTING_LEVEL,
                                "methodName", methodName
                            ),
                            String.format("Method '%s' has deeply nested conditionals: %d levels (max recommended: %d)", 
                                         methodName, maxNesting, MAX_NESTING_LEVEL),
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
    
    private int analyzeNestingLevel(List<String> lines, int methodStartLine, int methodEndLine) {
        int maxNesting = 0;
        int currentNesting = 0;
        
        for (int i = methodStartLine; i < methodEndLine && i < lines.size(); i++) {
            String line = lines.get(i).trim();
            
            // Skip comments and empty lines
            if (line.isEmpty() || line.startsWith("//") || 
                line.startsWith("/*") || line.startsWith("*")) {
                continue;
            }
            
            // Check for conditional statements
            if (line.startsWith("if ") || line.startsWith("if(") ||
                line.startsWith("else if ") || line.startsWith("else if(") ||
                line.startsWith("for ") || line.startsWith("for(") ||
                line.startsWith("while ") || line.startsWith("while(") ||
                line.startsWith("switch ") || line.startsWith("switch(")) {
                currentNesting++;
                maxNesting = Math.max(maxNesting, currentNesting);
            }
            
            // Check for closing braces
            if (line.startsWith("}")) {
                if (currentNesting > 0) {
                    currentNesting--;
                }
            }
        }
        
        return maxNesting;
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
                        return i + 1;
                    }
                }
            }
        }
        
        return Math.min(methodStartLine + 50, lines.size());
    }
    
    private Severity determineSeverity(int nestingLevel) {
        if (nestingLevel >= 6) {
            return Severity.CRITICAL;
        } else if (nestingLevel >= 5) {
            return Severity.MAJOR;
        } else {
            return Severity.MINOR;
        }
    }
}
