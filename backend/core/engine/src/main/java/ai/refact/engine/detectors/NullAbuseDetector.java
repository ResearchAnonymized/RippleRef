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
public class NullAbuseDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.null-abuse";
    private static final int MAX_NULL_CHECKS = 5; // Maximum null checks per method
    
    // Pattern to match method declarations
    private static final Pattern METHOD_PATTERN = Pattern.compile(
        "\\s*(public|private|protected|static|final|abstract)?\\s+" +
        "([\\w.<>\\[\\]]+)\\s+" + // return type
        "(\\w+)\\s*\\(" // method name
    );
    
    // Patterns for null checks
    private static final Pattern NULL_CHECK_PATTERN = Pattern.compile(
        "\\b(\\w+)\\s*[!=]=\\s*null|null\\s*[!=]=\\s*(\\w+)|" +
        "\\.isNull\\(|Objects\\.isNull\\(|Objects\\.nonNull\\(|" +
        "Optional\\.ofNullable\\(|Optional\\.empty\\(|" +
        "if\\s*\\(\\s*!(\\w+)\\s*\\)|" +
        "return\\s+null"
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
            .flatMap(sourceFile -> analyzeFileForNullAbuse(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForNullAbuse(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
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
                
                if (methodMatcher.find() && !line.contains("class ") && !line.contains("interface ")) {
                    String methodName = methodMatcher.group(3);
                    int methodEndLine = findMethodEndLine(lines, i);
                    
                    // Count null checks in this method
                    int nullCheckCount = countNullChecks(lines, i, methodEndLine);
                    
                    if (nullCheckCount > MAX_NULL_CHECKS) {
                        Severity severity = determineSeverity(nullCheckCount);
                        
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
                                "nullCheckCount", nullCheckCount,
                                "threshold", MAX_NULL_CHECKS,
                                "methodName", methodName
                            ),
                            String.format("Method '%s' has excessive null checks: %d checks (max recommended: %d)", 
                                         methodName, nullCheckCount, MAX_NULL_CHECKS),
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
    
    private int countNullChecks(List<String> lines, int methodStartLine, int methodEndLine) {
        int nullCheckCount = 0;
        
        for (int i = methodStartLine; i < methodEndLine && i < lines.size(); i++) {
            String line = lines.get(i);
            
            // Skip comments and empty lines
            String trimmed = line.trim();
            if (trimmed.isEmpty() || trimmed.startsWith("//") || 
                trimmed.startsWith("/*") || trimmed.startsWith("*")) {
                continue;
            }
            
            // Count null checks
            Matcher matcher = NULL_CHECK_PATTERN.matcher(line);
            while (matcher.find()) {
                nullCheckCount++;
            }
        }
        
        return nullCheckCount;
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
    
    private Severity determineSeverity(int nullCheckCount) {
        if (nullCheckCount >= 15) {
            return Severity.CRITICAL;
        } else if (nullCheckCount >= 10) {
            return Severity.MAJOR;
        } else {
            return Severity.MINOR;
        }
    }
}
