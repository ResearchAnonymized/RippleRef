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
import java.util.stream.Stream;

@Component
public class LongLineDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.long-line";
    private static final int MAX_LINE_LENGTH = 120; // Standard line length limit
    private static final int MIN_LONG_LINES = 5; // Minimum long lines to report
    
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
            .flatMap(sourceFile -> analyzeFileForLongLines(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForLongLines(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            List<Integer> longLineNumbers = new ArrayList<>();
            int maxLength = 0;
            
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i);
                int lineLength = line.length();
                
                // Skip import statements (they can be long legitimately)
                if (line.trim().startsWith("import ") || line.trim().startsWith("package ")) {
                    continue;
                }
                
                if (lineLength > MAX_LINE_LENGTH) {
                    longLineNumbers.add(i + 1);
                    maxLength = Math.max(maxLength, lineLength);
                }
            }
            
            if (longLineNumbers.size() >= MIN_LONG_LINES) {
                Severity severity = determineSeverity(longLineNumbers.size(), maxLength);
                
                String examples = longLineNumbers.size() > 5 ? 
                    "Lines: " + String.join(", ", longLineNumbers.subList(0, 5).stream().map(String::valueOf).toArray(String[]::new)) + "..." :
                    "Lines: " + String.join(", ", longLineNumbers.stream().map(String::valueOf).toArray(String[]::new));
                
                ReasonEvidence evidence = new ReasonEvidence(
                    DETECTOR_ID,
                    new CodePointer(
                        projectRoot.relativize(sourceFile),
                        className,
                        "file",
                        1,
                        Math.min(10, lines.size()),
                        1,
                        1
                    ),
                    Map.of(
                        "longLineCount", longLineNumbers.size(),
                        "maxLength", maxLength,
                        "limit", MAX_LINE_LENGTH,
                        "examples", examples
                    ),
                    String.format("File '%s' has %d lines exceeding %d characters (max: %d). %s", 
                                 className, longLineNumbers.size(), MAX_LINE_LENGTH, maxLength, examples),
                    severity
                );
                
                evidences.add(evidence);
            }
            
            return evidences.stream();
        } catch (Exception e) {
            return Stream.empty();
        }
    }
    
    private Severity determineSeverity(int longLineCount, int maxLength) {
        if (longLineCount >= 20 || maxLength >= 200) {
            return Severity.MAJOR;
        } else if (longLineCount >= 10 || maxLength >= 150) {
            return Severity.MINOR;
        } else {
            return Severity.MINOR;
        }
    }
}
