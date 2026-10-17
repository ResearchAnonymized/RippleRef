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
 * Detects methods that are too long (Long Method code smell).
 * A method is considered too long if it exceeds the configured line count threshold.
 */
@Component
public class LongMethodDetector implements ReasonDetector {
    
    private static final Logger logger = LoggerFactory.getLogger(LongMethodDetector.class);
    private static final String DETECTOR_ID = "design.long-method";
    private static final int DEFAULT_MAX_LINES = 20;
    
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
        logger.debug("LongMethodDetector: analyzing project at {}", ctx.root());
        
        // Only analyze if we have source files
        if (ctx.sourceFiles().isEmpty()) {
            logger.debug("No source files found, skipping analysis");
            return Stream.empty();
        }
        
        logger.info("Analyzing {} source files for long methods", ctx.sourceFiles().size());
        
        // Analyze each Java source file
        return ctx.sourceFiles().stream()
            .flatMap(sourceFile -> analyzeFileForLongMethods(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForLongMethods(Path sourceFile, Path projectRoot) {
        try {
            logger.debug("Analyzing file: {}", sourceFile);
            
            // Read file content
            Path absolutePath = projectRoot != null ? projectRoot.resolve(sourceFile) : sourceFile;
            List<String> lines = java.nio.file.Files.readAllLines(absolutePath);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            // Simple method detection using regex patterns
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = absolutePath.getFileName().toString().replace(".java", "");
            
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
                    // If we were tracking a previous method, check its length
                    if (currentMethodStart >= 0 && currentMethodName != null) {
                        int methodLength = i - currentMethodStart;
                        if (methodLength > DEFAULT_MAX_LINES) {
                            evidences.add(createLongMethodEvidence(
                                absolutePath, projectRoot, className, currentMethodName, 
                                currentMethodStart + 1, i, methodLength
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
                int methodLength = lines.size() - currentMethodStart;
                if (methodLength > DEFAULT_MAX_LINES) {
                    evidences.add(createLongMethodEvidence(
                        absolutePath, projectRoot, className, currentMethodName, 
                        currentMethodStart + 1, lines.size(), methodLength
                    ));
                }
            }
            
            logger.debug("Found {} long methods in file: {}", evidences.size(), absolutePath);
            return evidences.stream();
            
        } catch (IOException e) {
            logger.warn("Failed to analyze file: {} (root: {})", sourceFile, projectRoot, e);
            return Stream.empty();
        }
    }
    
    private String extractMethodName(String methodLine) {
        // Extract method name from method declaration line
        // Example: "public void calculateTotal(int value) {" -> "calculateTotal"
        Pattern namePattern = Pattern.compile("\\w+\\s*\\(");
        Matcher matcher = namePattern.matcher(methodLine);
        if (matcher.find()) {
            String match = matcher.group();
            return match.substring(0, match.length() - 1).trim();
        }
        return "unknown";
    }
    
    private ReasonEvidence createLongMethodEvidence(Path sourceFile, Path projectRoot, String className, 
                                                   String methodName, int startLine, int endLine, int lineCount) {
        String relativePath = projectRoot.relativize(sourceFile).toString();
        
        return new ReasonEvidence(
            DETECTOR_ID,
            new CodePointer(
                sourceFile,
                className,
                methodName,
                startLine,
                endLine,
                1,
                1
            ),
            Map.of("lineCount", lineCount, "maxLines", DEFAULT_MAX_LINES),
            String.format("Method '%s' is too long (%d lines, exceeds limit of %d)", 
                         methodName, lineCount, DEFAULT_MAX_LINES),
            Severity.MAJOR
        );
    }
}
