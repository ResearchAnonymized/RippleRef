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
public class MagicNumbersDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.magic-numbers";
    private static final int MIN_MAGIC_NUMBERS = 3; // Minimum magic numbers to report
    
    // Pattern to match numeric literals (excluding common values like 0, 1, -1, 2)
    private static final Pattern MAGIC_NUMBER_PATTERN = Pattern.compile(
        "\\b(\\d{2,}|\\d+\\.\\d+)\\b"
    );
    
    // Common acceptable numbers that are not magic
    private static final Set<String> ACCEPTABLE_NUMBERS = Set.of(
        "0", "1", "-1", "2", "10", "100", "1000"
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
            .flatMap(sourceFile -> analyzeFileForMagicNumbers(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForMagicNumbers(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            Set<String> magicNumbers = new HashSet<>();
            int totalMagicNumberOccurrences = 0;
            
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i);
                
                // Skip comments, empty lines, and import statements
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("//") || 
                    trimmed.startsWith("/*") || trimmed.startsWith("*") ||
                    trimmed.startsWith("import ") || trimmed.startsWith("package ")) {
                    continue;
                }
                
                // Skip constant declarations (final static)
                if (trimmed.contains("static") && trimmed.contains("final")) {
                    continue;
                }
                
                // Find magic numbers
                Matcher matcher = MAGIC_NUMBER_PATTERN.matcher(line);
                while (matcher.find()) {
                    String number = matcher.group(1);
                    
                    // Skip acceptable numbers
                    if (ACCEPTABLE_NUMBERS.contains(number)) {
                        continue;
                    }
                    
                    // Skip if it's part of a version number or date
                    if (isVersionOrDate(line, number)) {
                        continue;
                    }
                    
                    magicNumbers.add(number);
                    totalMagicNumberOccurrences++;
                }
            }
            
            if (magicNumbers.size() >= MIN_MAGIC_NUMBERS) {
                Severity severity = determineSeverity(magicNumbers.size(), totalMagicNumberOccurrences);
                
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
                        "uniqueMagicNumbers", magicNumbers.size(),
                        "totalOccurrences", totalMagicNumberOccurrences,
                        "examples", String.join(", ", new ArrayList<>(magicNumbers).subList(0, Math.min(5, magicNumbers.size()))),
                        "className", className
                    ),
                    String.format("File '%s' contains %d unique magic numbers (%d total occurrences). Examples: %s", 
                                 className, magicNumbers.size(), totalMagicNumberOccurrences,
                                 String.join(", ", new ArrayList<>(magicNumbers).subList(0, Math.min(3, magicNumbers.size())))),
                    severity
                );
                
                evidences.add(evidence);
            }
            
            return evidences.stream();
        } catch (Exception e) {
            return Stream.empty();
        }
    }
    
    private boolean isVersionOrDate(String line, String number) {
        // Check if the number is part of a version string (e.g., "1.2.3") or date (e.g., "2024-01-01")
        return line.contains("\"") && 
               (line.matches(".*\"[^\"]*" + number + "[^\"]*\".*") || 
                line.contains("version") || 
                line.contains("date") ||
                line.contains("year"));
    }
    
    private Severity determineSeverity(int uniqueCount, int totalOccurrences) {
        if (uniqueCount >= 10 || totalOccurrences >= 20) {
            return Severity.MAJOR;
        } else if (uniqueCount >= 5 || totalOccurrences >= 10) {
            return Severity.MINOR;
        } else {
            return Severity.MINOR;
        }
    }
}
