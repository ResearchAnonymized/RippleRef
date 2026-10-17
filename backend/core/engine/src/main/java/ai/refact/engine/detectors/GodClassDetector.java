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
 * Detects God Class code smell - classes that are too large and have too many responsibilities.
 */
@Component
public class GodClassDetector implements ReasonDetector {
    
    private static final Logger logger = LoggerFactory.getLogger(GodClassDetector.class);
    private static final String DETECTOR_ID = "design.god-class";
    private static final int DEFAULT_MAX_METHODS = 15;
    private static final int DEFAULT_MAX_LINES = 200;
    
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
        logger.debug("GodClassDetector: analyzing project at {}", ctx.root());
        
        if (ctx.sourceFiles().isEmpty()) {
            logger.debug("No source files found, skipping analysis");
            return Stream.empty();
        }
        
        logger.info("Analyzing {} source files for god classes", ctx.sourceFiles().size());
        
        return ctx.sourceFiles().stream()
            .flatMap(sourceFile -> analyzeFileForGodClass(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForGodClass(Path sourceFile, Path projectRoot) {
        try {
            logger.debug("Analyzing file: {}", sourceFile);
            
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            // Count methods in the class
            int methodCount = countMethods(lines);
            int totalLines = lines.size();
            
            // Check if this is a god class
            boolean isGodClass = methodCount > DEFAULT_MAX_METHODS || totalLines > DEFAULT_MAX_LINES;
            
            if (isGodClass) {
                // Find the class declaration line to highlight that specific area
                int classDeclarationLine = findClassDeclarationLine(lines);
                
                ReasonEvidence evidence = new ReasonEvidence(
                    DETECTOR_ID,
                    new CodePointer(
                        sourceFile,
                        className,
                        "class",
                        classDeclarationLine,
                        Math.min(classDeclarationLine + 5, totalLines), // Highlight class declaration + a few lines
                        1,
                        1
                    ),
                    Map.of("methodCount", methodCount, "totalLines", totalLines, 
                           "maxMethods", DEFAULT_MAX_METHODS, "maxLines", DEFAULT_MAX_LINES),
                    String.format("Class '%s' is too large (%d methods, %d lines) - consider splitting responsibilities", 
                                 className, methodCount, totalLines),
                    methodCount > DEFAULT_MAX_METHODS * 2 || totalLines > DEFAULT_MAX_LINES * 2 ? Severity.CRITICAL : Severity.MAJOR
                );
                
                logger.debug("Found god class in file: {} ({} methods, {} lines)", sourceFile, methodCount, totalLines);
                return Stream.of(evidence);
            }
            
            return Stream.empty();
            
        } catch (IOException e) {
            logger.warn("Failed to analyze file: {}", sourceFile, e);
            return Stream.empty();
        }
    }
    
    private int countMethods(List<String> lines) {
        Pattern methodPattern = Pattern.compile(
            "\\s*(public|private|protected|static|final|native|synchronized|abstract|transient|volatile)?\\s+" +
            "\\w+\\s+\\w+\\s*\\("
        );
        
        int count = 0;
        for (String line : lines) {
            if (methodPattern.matcher(line.trim()).find()) {
                count++;
            }
        }
        return count;
    }
    
    private int findClassDeclarationLine(List<String> lines) {
        Pattern classPattern = Pattern.compile(
            "\\s*(public|private|protected|static|final|abstract)?\\s*class\\s+\\w+"
        );
        
        for (int i = 0; i < lines.size(); i++) {
            if (classPattern.matcher(lines.get(i).trim()).find()) {
                return i + 1; // Convert to 1-based line number
            }
        }
        return 1; // Fallback to first line
    }
}
