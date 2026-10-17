package ai.refact.engine.detectors;

import ai.refact.api.CodePointer;
import ai.refact.api.ReasonEvidence;
import ai.refact.api.Severity;
import ai.refact.api.ProjectContext;
import ai.refact.api.ReasonDetector;
import ai.refact.api.ReasonCategory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

@Component
public class SingleLetterVariablesDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.single-letter-vars";
    private static final int MIN_VIOLATIONS = 3; // Minimum violations to report
    
    // Pattern to match variable declarations
    private static final Pattern VARIABLE_PATTERN = Pattern.compile(
        "\\s+([\\w.<>\\[\\]]+)\\s+([a-z])\\s*[;=]"
    );
    
    // Acceptable single letter variables (commonly used in loops and math)
    private static final Set<String> ACCEPTABLE_SINGLE_LETTERS = Set.of(
        "i", "j", "k", "x", "y", "z", "n", "m"
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
            .flatMap(sourceFile -> analyzeFileForSingleLetterVars(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForSingleLetterVars(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            List<String> violations = new ArrayList<>();
            
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i);
                
                // Skip comments, empty lines, and loop declarations
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("//") || 
                    trimmed.startsWith("/*") || trimmed.startsWith("*") ||
                    trimmed.startsWith("for ") || trimmed.startsWith("for(")) {
                    continue;
                }
                
                Matcher matcher = VARIABLE_PATTERN.matcher(line);
                while (matcher.find()) {
                    String varName = matcher.group(2);
                    
                    // Skip acceptable single letters (loop counters, coordinates)
                    if (!ACCEPTABLE_SINGLE_LETTERS.contains(varName)) {
                        violations.add(varName + " (line " + (i + 1) + ")");
                    }
                }
            }
            
            if (violations.size() >= MIN_VIOLATIONS) {
                Severity severity = determineSeverity(violations.size());
                
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
                        "violationCount", violations.size(),
                        "examples", String.join(", ", violations.subList(0, Math.min(5, violations.size())))
                    ),
                    String.format("File '%s' has %d single-letter variables outside loops. Examples: %s", 
                                 className, violations.size(),
                                 String.join(", ", violations.subList(0, Math.min(3, violations.size())))),
                    severity
                );
                
                evidences.add(evidence);
            }
            
            return evidences.stream();
        } catch (Exception e) {
            return Stream.empty();
        }
    }
    
    private Severity determineSeverity(int violationCount) {
        if (violationCount >= 10) {
            return Severity.MINOR;
        } else {
            return Severity.MINOR;
        }
    }
}
