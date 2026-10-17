package ai.refact.engine.detectors;

import ai.refact.api.ReasonDetector;
import ai.refact.api.ReasonEvidence;
import ai.refact.api.ProjectContext;
import ai.refact.api.ReasonCategory;
import ai.refact.api.CodePointer;
import ai.refact.api.Severity;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.List;
import java.util.ArrayList;
import java.util.stream.Stream;
import java.util.regex.Pattern;
import java.util.regex.Matcher;
import java.nio.file.Path;
import java.io.IOException;

/**
 * Detects complex methods with high cyclomatic complexity.
 */
@Component
public class ComplexMethodDetector implements ReasonDetector {
    
    private static final Logger logger = LoggerFactory.getLogger(ComplexMethodDetector.class);
    private static final String DETECTOR_ID = "design.complex-method";
    private static final int DEFAULT_MAX_COMPLEXITY = 10;
    
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
        return true;
    }
    
    @Override
    public Stream<ReasonEvidence> detect(ProjectContext ctx) {
        logger.debug("ComplexMethodDetector: analyzing project at {}", ctx.root());
        
        if (ctx.sourceFiles().isEmpty()) {
            logger.debug("No source files found, skipping analysis");
            return Stream.empty();
        }
        
        logger.info("Analyzing {} source files for complex methods", ctx.sourceFiles().size());
        
        return ctx.sourceFiles().stream()
            .flatMap(sourceFile -> analyzeFileForComplexMethods(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForComplexMethods(Path sourceFile, Path projectRoot) {
        try {
            logger.debug("Analyzing file: {}", sourceFile);
            
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            // Pattern to detect method declarations
            Pattern methodPattern = Pattern.compile(
                "\\s*(public|private|protected|static|final|native|synchronized|abstract|transient|volatile)?\\s+" +
                "\\w+\\s+\\w+\\s*\\("
            );
            
            int currentMethodStart = -1;
            String currentMethodName = "";
            
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i);
                String trimmedLine = line.trim();
                
                // Check if this line starts a new method
                if (methodPattern.matcher(trimmedLine).find()) {
                    // If we were tracking a previous method, check its complexity
                    if (currentMethodStart >= 0 && currentMethodName != null) {
                        int complexity = calculateComplexity(lines, currentMethodStart, i);
                        if (complexity > DEFAULT_MAX_COMPLEXITY) {
                            evidences.add(new ReasonEvidence(
                                DETECTOR_ID,
                                new CodePointer(
                                    sourceFile,
                                    className,
                                    currentMethodName,
                                    currentMethodStart + 1,
                                    i,
                                    1,
                                    1
                                ),
                                Map.of("complexity", complexity, "maxComplexity", DEFAULT_MAX_COMPLEXITY),
                                String.format("Method '%s' is too complex (complexity: %d, limit: %d)", 
                                             currentMethodName, complexity, DEFAULT_MAX_COMPLEXITY),
                                complexity > DEFAULT_MAX_COMPLEXITY * 2 ? Severity.CRITICAL : Severity.MAJOR
                            ));
                        }
                    }
                    
                    // Start tracking new method
                    currentMethodStart = i;
                    currentMethodName = extractMethodName(trimmedLine);
                }
            }
            
            // Check the last method
            if (currentMethodStart >= 0 && currentMethodName != null) {
                int complexity = calculateComplexity(lines, currentMethodStart, lines.size());
                if (complexity > DEFAULT_MAX_COMPLEXITY) {
                    evidences.add(new ReasonEvidence(
                        DETECTOR_ID,
                        new CodePointer(
                            sourceFile,
                            className,
                            currentMethodName,
                            currentMethodStart + 1,
                            lines.size(),
                            1,
                            1
                        ),
                        Map.of("complexity", complexity, "maxComplexity", DEFAULT_MAX_COMPLEXITY),
                        String.format("Method '%s' is too complex (complexity: %d, limit: %d)", 
                                     currentMethodName, complexity, DEFAULT_MAX_COMPLEXITY),
                        complexity > DEFAULT_MAX_COMPLEXITY * 2 ? Severity.CRITICAL : Severity.MAJOR
                    ));
                }
            }
            
            logger.debug("Found {} complex methods in file: {}", evidences.size(), sourceFile);
            return evidences.stream();
            
        } catch (IOException e) {
            logger.warn("Failed to analyze file: {}", sourceFile, e);
            return Stream.empty();
        }
    }
    
    private String extractMethodName(String methodLine) {
        Pattern namePattern = Pattern.compile("\\w+\\s*\\(");
        Matcher matcher = namePattern.matcher(methodLine);
        if (matcher.find()) {
            String match = matcher.group();
            return match.substring(0, match.length() - 1).trim();
        }
        return "unknown";
    }
    
    private int calculateComplexity(List<String> lines, int start, int end) {
        int complexity = 1; // Base complexity
        
        // Patterns that increase complexity
        Pattern[] complexityPatterns = {
            Pattern.compile("\\bif\\b"),
            Pattern.compile("\\bwhile\\b"),
            Pattern.compile("\\bfor\\b"),
            Pattern.compile("\\bswitch\\b"),
            Pattern.compile("\\bcase\\b"),
            Pattern.compile("\\bcatch\\b"),
            Pattern.compile("\\b&&\\b"),
            Pattern.compile("\\b\\|\\|\\b"),
            Pattern.compile("\\?.*:")
        };
        
        for (int i = start; i < end && i < lines.size(); i++) {
            String line = lines.get(i);
            for (Pattern pattern : complexityPatterns) {
                Matcher matcher = pattern.matcher(line);
                while (matcher.find()) {
                    complexity++;
                }
            }
        }
        
        return complexity;
    }
}
