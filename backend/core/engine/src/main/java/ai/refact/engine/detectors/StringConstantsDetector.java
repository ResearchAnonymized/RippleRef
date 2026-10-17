package ai.refact.engine.detectors;

import ai.refact.api.CodePointer;
import ai.refact.api.ReasonEvidence;
import ai.refact.api.Severity;
import ai.refact.api.ProjectContext;
import ai.refact.api.ReasonDetector;
import ai.refact.api.ReasonCategory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

@Component
public class StringConstantsDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.string-constants";
    private static final int MIN_DUPLICATE_STRINGS = 3; // Minimum duplicate string literals
    private static final int MIN_STRING_LENGTH = 3; // Minimum string length to consider
    
    // Pattern to match string literals
    private static final Pattern STRING_LITERAL_PATTERN = Pattern.compile(
        "\"([^\"]{3,})\""
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
            .flatMap(sourceFile -> analyzeFileForStringConstants(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForStringConstants(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            Map<String, Integer> stringCounts = new HashMap<>();
            
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i);
                
                // Skip comments and empty lines
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("//") || 
                    trimmed.startsWith("/*") || trimmed.startsWith("*")) {
                    continue;
                }
                
                // Skip constant declarations (final static)
                if (trimmed.contains("static") && trimmed.contains("final")) {
                    continue;
                }
                
                // Find string literals
                Matcher matcher = STRING_LITERAL_PATTERN.matcher(line);
                while (matcher.find()) {
                    String stringValue = matcher.group(1);
                    
                    // Skip very short strings and common patterns
                    if (stringValue.length() < MIN_STRING_LENGTH || 
                        isCommonPattern(stringValue)) {
                        continue;
                    }
                    
                    stringCounts.put(stringValue, stringCounts.getOrDefault(stringValue, 0) + 1);
                }
            }
            
            // Find duplicated strings
            List<String> duplicateStrings = new ArrayList<>();
            int totalDuplicates = 0;
            
            for (Map.Entry<String, Integer> entry : stringCounts.entrySet()) {
                if (entry.getValue() >= 2) {
                    duplicateStrings.add(entry.getKey() + " (x" + entry.getValue() + ")");
                    totalDuplicates += entry.getValue();
                }
            }
            
            if (duplicateStrings.size() >= MIN_DUPLICATE_STRINGS) {
                Severity severity = determineSeverity(duplicateStrings.size(), totalDuplicates);
                
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
                        "duplicateStringCount", duplicateStrings.size(),
                        "totalOccurrences", totalDuplicates,
                        "examples", String.join(", ", duplicateStrings.subList(0, Math.min(3, duplicateStrings.size()))),
                        "className", className
                    ),
                    String.format("File '%s' has %d duplicate string constants (%d total occurrences). Examples: %s", 
                                 className, duplicateStrings.size(), totalDuplicates,
                                 String.join(", ", duplicateStrings.subList(0, Math.min(3, duplicateStrings.size())))),
                    severity
                );
                
                evidences.add(evidence);
            }
            
            return evidences.stream();
        } catch (Exception e) {
            return Stream.empty();
        }
    }
    
    private boolean isCommonPattern(String str) {
        // Skip common patterns that are acceptable
        return str.matches("^\\s*$") ||  // Whitespace
               str.matches("^[,;:.!?]+$") ||  // Punctuation
               str.equals("") ||
               str.equals(" ") ||
               str.equals("  ") ||
               str.matches("^\\d+$");  // Pure numbers
    }
    
    private Severity determineSeverity(int duplicateCount, int totalOccurrences) {
        if (duplicateCount >= 10 || totalOccurrences >= 30) {
            return Severity.MAJOR;
        } else if (duplicateCount >= 5 || totalOccurrences >= 15) {
            return Severity.MINOR;
        } else {
            return Severity.MINOR;
        }
    }
}
