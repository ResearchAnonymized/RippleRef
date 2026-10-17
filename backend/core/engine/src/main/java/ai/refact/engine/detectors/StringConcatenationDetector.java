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
public class StringConcatenationDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.string-concatenation";
    
    // Pattern to match method declarations
    private static final Pattern METHOD_PATTERN = Pattern.compile(
        "\\s*(public|private|protected|static|final)?\\s+" +
        "([\\w.<>\\[\\]]+)\\s+" + // return type
        "(\\w+)\\s*\\(" // method name
    );
    
    // Pattern to match string concatenation with +
    private static final Pattern STRING_CONCAT_PATTERN = Pattern.compile(
        "\\w+\\s*\\+\\s*[\"']|[\"']\\s*\\+\\s*\\w+"
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
            .flatMap(sourceFile -> analyzeFileForStringConcatenation(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForStringConcatenation(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i);
                Matcher methodMatcher = METHOD_PATTERN.matcher(line);
                
                if (methodMatcher.find() && !line.contains("class ")) {
                    String methodName = methodMatcher.group(3);
                    int methodEndLine = findMethodEndLine(lines, i);
                    
                    // Check for string concatenation in loops
                    int concatInLoopCount = countStringConcatInLoops(lines, i, methodEndLine);
                    
                    if (concatInLoopCount > 0) {
                        Severity severity = determineSeverity(concatInLoopCount);
                        
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
                                "concatenationCount", concatInLoopCount,
                                "methodName", methodName
                            ),
                            String.format("Method '%s' uses string concatenation (+) in loops (%d occurrences). Consider using StringBuilder", 
                                         methodName, concatInLoopCount),
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
    
    private int countStringConcatInLoops(List<String> lines, int methodStartLine, int methodEndLine) {
        int count = 0;
        boolean inLoop = false;
        
        for (int i = methodStartLine; i < methodEndLine && i < lines.size(); i++) {
            String line = lines.get(i).trim();
            
            // Check for loop start
            if (line.startsWith("for ") || line.startsWith("for(") ||
                line.startsWith("while ") || line.startsWith("while(")) {
                inLoop = true;
            }
            
            // Count string concatenations inside loops
            if (inLoop) {
                Matcher matcher = STRING_CONCAT_PATTERN.matcher(line);
                while (matcher.find()) {
                    // Make sure it's not using StringBuilder
                    if (!line.contains("StringBuilder") && !line.contains("StringBuffer")) {
                        count++;
                    }
                }
            }
            
            // Check for loop end (simplified - count braces)
            if (line.equals("}")) {
                inLoop = false;
            }
        }
        
        return count;
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
    
    private Severity determineSeverity(int count) {
        if (count >= 10) {
            return Severity.MAJOR;
        } else if (count >= 5) {
            return Severity.MINOR;
        } else {
            return Severity.MINOR;
        }
    }
}
