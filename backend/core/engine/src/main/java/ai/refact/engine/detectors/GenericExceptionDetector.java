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
public class GenericExceptionDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.generic-exception";
    
    // Pattern to match catch blocks with generic exceptions
    private static final Pattern CATCH_EXCEPTION_PATTERN = Pattern.compile(
        "catch\\s*\\(\\s*(Exception|Throwable|Error|RuntimeException)\\s+\\w+\\s*\\)"
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
            .flatMap(sourceFile -> analyzeFileForGenericExceptions(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForGenericExceptions(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i);
                
                Matcher matcher = CATCH_EXCEPTION_PATTERN.matcher(line);
                if (matcher.find()) {
                    String exceptionType = matcher.group(1);
                    
                    Severity severity = determineSeverity(exceptionType);
                    
                    ReasonEvidence evidence = new ReasonEvidence(
                        DETECTOR_ID,
                        new CodePointer(
                            projectRoot.relativize(sourceFile),
                            className,
                            "catch-block",
                            i + 1, // 1-based line number
                            i + 1,
                            1,
                            1
                        ),
                        Map.of(
                            "exceptionType", exceptionType,
                            "line", i + 1
                        ),
                        String.format("Generic exception caught: %s at line %d. Consider catching specific exception types", 
                                     exceptionType, i + 1),
                        severity
                    );
                    
                    evidences.add(evidence);
                }
            }
            
            return evidences.stream();
        } catch (Exception e) {
            return Stream.empty();
        }
    }
    
    private Severity determineSeverity(String exceptionType) {
        if (exceptionType.equals("Throwable") || exceptionType.equals("Error")) {
            return Severity.MAJOR; // These are very broad
        } else if (exceptionType.equals("Exception")) {
            return Severity.MINOR; // Common but not recommended
        } else {
            return Severity.MINOR;
        }
    }
}
