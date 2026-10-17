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
public class LongParameterListDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.long-parameter-list";
    private static final int MAX_PARAMETERS = 5;
    
    // Pattern to match method declarations with parameters
    private static final Pattern METHOD_PATTERN = Pattern.compile(
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
            .flatMap(sourceFile -> analyzeFileForLongParameterLists(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForLongParameterLists(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            // Read file content
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i);
                Matcher matcher = METHOD_PATTERN.matcher(line);
                
                if (matcher.find()) {
                    String methodName = matcher.group(3);
                    String parameters = matcher.group(4);
                    
                    if (parameters != null && !parameters.trim().isEmpty()) {
                        int parameterCount = countParameters(parameters);
                        
                        if (parameterCount > MAX_PARAMETERS) {
                            // Determine severity based on parameter count
                            Severity severity = determineSeverity(parameterCount);
                            
                            // Create evidence
                            ReasonEvidence evidence = new ReasonEvidence(
                                DETECTOR_ID,
                            new CodePointer(
                                projectRoot.relativize(sourceFile),
                                className,
                                methodName,
                                i + 1, // 1-based line number
                                i + 1,
                                1,
                                1
                            ),
                                Map.of(
                                    "parameterCount", parameterCount,
                                    "maxAllowed", MAX_PARAMETERS,
                                    "methodName", methodName
                                ),
                                String.format("Method '%s' has %d parameters, exceeding the maximum of %d", 
                                             methodName, parameterCount, MAX_PARAMETERS),
                                severity
                            );
                            
                            evidences.add(evidence);
                        }
                    }
                }
            }
            
            return evidences.stream();
        } catch (Exception e) {
            return Stream.empty();
        }
    }
    
    private int countParameters(String parameters) {
        if (parameters == null || parameters.trim().isEmpty()) {
            return 0;
        }
        
        // Remove comments and handle generics
        String cleanParams = parameters
            .replaceAll("//.*", "") // Remove line comments
            .replaceAll("/\\*.*?\\*/", "") // Remove block comments
            .trim();
        
        if (cleanParams.isEmpty()) {
            return 0;
        }
        
        // Count commas + 1, but handle nested generics and arrays
        int count = 1;
        int depth = 0;
        boolean inString = false;
        boolean inChar = false;
        
        for (char c : cleanParams.toCharArray()) {
            if (inString && c == '"' && (cleanParams.indexOf(c) == 0 || cleanParams.charAt(cleanParams.indexOf(c) - 1) != '\\')) {
                inString = false;
            } else if (!inString && c == '"') {
                inString = true;
            } else if (inChar && c == '\'' && (cleanParams.indexOf(c) == 0 || cleanParams.charAt(cleanParams.indexOf(c) - 1) != '\\')) {
                inChar = false;
            } else if (!inChar && c == '\'') {
                inChar = true;
            } else if (!inString && !inChar) {
                if (c == '<' || c == '[' || c == '(') {
                    depth++;
                } else if (c == '>' || c == ']' || c == ')') {
                    depth--;
                } else if (c == ',' && depth == 0) {
                    count++;
                }
            }
        }
        
        return count;
    }
    
    
    private Severity determineSeverity(int parameterCount) {
        if (parameterCount >= 10) {
            return Severity.CRITICAL;
        } else if (parameterCount >= 7) {
            return Severity.MAJOR;
        } else {
            return Severity.MINOR;
        }
    }
}
