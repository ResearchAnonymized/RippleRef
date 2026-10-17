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
import java.nio.file.Path;
import java.io.IOException;

/**
 * Detects duplicate code blocks (code duplication code smell).
 */
@Component
public class DuplicateCodeDetector implements ReasonDetector {
    
    private static final Logger logger = LoggerFactory.getLogger(DuplicateCodeDetector.class);
    private static final String DETECTOR_ID = "design.duplicate-code";
    private static final int MIN_DUPLICATE_LINES = 5;
    
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
        logger.debug("DuplicateCodeDetector: analyzing project at {}", ctx.root());
        
        if (ctx.sourceFiles().isEmpty()) {
            logger.debug("No source files found, skipping analysis");
            return Stream.empty();
        }
        
        logger.info("Analyzing {} source files for duplicate code", ctx.sourceFiles().size());
        
        return ctx.sourceFiles().stream()
            .flatMap(sourceFile -> analyzeFileForDuplicates(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForDuplicates(Path sourceFile, Path projectRoot) {
        try {
            logger.debug("Analyzing file: {}", sourceFile);
            
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.size() < MIN_DUPLICATE_LINES * 2) {
                return Stream.empty();
            }
            
            String className = sourceFile.getFileName().toString().replace(".java", "");
            List<ReasonEvidence> evidences = new ArrayList<>();
            
            // Look for duplicate code blocks
            for (int i = 0; i < lines.size() - MIN_DUPLICATE_LINES; i++) {
                for (int j = i + MIN_DUPLICATE_LINES; j < lines.size() - MIN_DUPLICATE_LINES; j++) {
                    int duplicateLength = findDuplicateLength(lines, i, j);
                    if (duplicateLength >= MIN_DUPLICATE_LINES) {
                        evidences.add(new ReasonEvidence(
                            DETECTOR_ID,
                            new CodePointer(
                                sourceFile,
                                className,
                                "duplicate-block",
                                i + 1,
                                i + duplicateLength,
                                1,
                                1
                            ),
                            Map.of("duplicateLength", duplicateLength, "startLine1", i + 1, "startLine2", j + 1),
                            String.format("Duplicate code block found (%d lines starting at line %d and %d)", 
                                         duplicateLength, i + 1, j + 1),
                            duplicateLength > 10 ? Severity.MAJOR : Severity.MINOR
                        ));
                        
                        // Skip ahead to avoid overlapping duplicates
                        i += duplicateLength;
                        break;
                    }
                }
            }
            
            logger.debug("Found {} duplicate code blocks in file: {}", evidences.size(), sourceFile);
            return evidences.stream();
            
        } catch (IOException e) {
            logger.warn("Failed to analyze file: {}", sourceFile, e);
            return Stream.empty();
        }
    }
    
    private int findDuplicateLength(List<String> lines, int start1, int start2) {
        int length = 0;
        int maxLength = Math.min(lines.size() - start1, lines.size() - start2);
        
        for (int i = 0; i < maxLength; i++) {
            String line1 = lines.get(start1 + i).trim();
            String line2 = lines.get(start2 + i).trim();
            
            if (line1.equals(line2) && !line1.isEmpty()) {
                length++;
            } else {
                break;
            }
        }
        
        return length;
    }
}
