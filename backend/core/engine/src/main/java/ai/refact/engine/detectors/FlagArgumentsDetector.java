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
public class FlagArgumentsDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.flag-arguments";
    
    // Pattern to match method declarations with boolean parameters
    private static final Pattern METHOD_WITH_BOOLEAN_PATTERN = Pattern.compile(
        "\\s*(public|private|protected|static|final)?\\s+" +
        "([\\w.<>\\[\\]]+)\\s+" + // return type
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
        return true; // Always applicable for Java projects
    }
    
    @Override
    public Stream<ReasonEvidence> detect(ProjectContext ctx) {
        if (ctx.sourceFiles().isEmpty()) {
            return Stream.empty();
        }
        
        return ctx.sourceFiles().stream()
            .flatMap(sourceFile -> analyzeFileForFlagArguments(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForFlagArguments(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i);
                Matcher matcher = METHOD_WITH_BOOLEAN_PATTERN.matcher(line);
                
                if (matcher.find() && !line.contains("class ") && !line.contains("interface ")) {
                    String methodName = matcher.group(3);
                    String parameters = matcher.group(4);
                    
                    if (parameters != null && !parameters.trim().isEmpty()) {
                        int booleanCount = countBooleanParameters(parameters);
                        
                        if (booleanCount > 0) {
                            Severity severity = determineSeverity(booleanCount);
                            
                            ReasonEvidence evidence = new ReasonEvidence(
                                DETECTOR_ID,
                                new CodePointer(
                                    projectRoot.relativize(sourceFile),
                                    className,
                                    methodName,
                                    i + 1,
                                    i + 1,
                                    1,
                                    1
                                ),
                                Map.of(
                                    "booleanParameterCount", booleanCount,
                                    "methodName", methodName,
                                    "parameters", parameters.trim()
                                ),
                                String.format("Method '%s' has %d boolean flag parameter(s) which can make the code harder to understand", 
                                             methodName, booleanCount),
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
    
    private int countBooleanParameters(String parameters) {
        int count = 0;
        String[] params = parameters.split(",");
        
        for (String param : params) {
            String trimmed = param.trim();
            // Check if parameter type is boolean or Boolean
            if (trimmed.startsWith("boolean ") || trimmed.startsWith("Boolean ")) {
                count++;
            }
        }
        
        return count;
    }
    
    private Severity determineSeverity(int booleanCount) {
        if (booleanCount >= 3) {
            return Severity.MAJOR;
        } else if (booleanCount >= 2) {
            return Severity.MINOR;
        } else {
            return Severity.MINOR;
        }
    }
}
