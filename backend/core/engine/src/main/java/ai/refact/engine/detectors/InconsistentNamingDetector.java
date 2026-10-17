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
public class InconsistentNamingDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.inconsistent-naming";
    
    // Pattern to match method declarations
    private static final Pattern METHOD_PATTERN = Pattern.compile(
        "\\s*(public|private|protected|static|final)?\\s+" +
        "([\\w.<>\\[\\]]+)\\s+" + // return type
        "(\\w+)\\s*\\(" // method name
    );
    
    // Pattern to match field declarations
    private static final Pattern FIELD_PATTERN = Pattern.compile(
        "\\s*(public|private|protected|static|final)?\\s+" +
        "([\\w.<>\\[\\]]+)\\s+" + // type
        "(\\w+)\\s*[;=]" // field name
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
            .flatMap(sourceFile -> analyzeFileForInconsistentNaming(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForInconsistentNaming(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            Map<String, List<String>> namingStyles = new HashMap<>();
            namingStyles.put("camelCase", new ArrayList<>());
            namingStyles.put("snake_case", new ArrayList<>());
            namingStyles.put("PascalCase", new ArrayList<>());
            namingStyles.put("UPPER_CASE", new ArrayList<>());
            
            // Analyze method and field naming
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i);
                
                // Check methods
                Matcher methodMatcher = METHOD_PATTERN.matcher(line);
                if (methodMatcher.find() && !line.contains("class ")) {
                    String methodName = methodMatcher.group(3);
                    String style = detectNamingStyle(methodName);
                    namingStyles.get(style).add(methodName);
                }
                
                // Check fields
                Matcher fieldMatcher = FIELD_PATTERN.matcher(line);
                if (fieldMatcher.find() && !line.contains("(")) {
                    String fieldName = fieldMatcher.group(3);
                    // Skip constants (all uppercase)
                    if (!fieldName.equals(fieldName.toUpperCase())) {
                        String style = detectNamingStyle(fieldName);
                        namingStyles.get(style).add(fieldName);
                    }
                }
            }
            
            // Check for mixed naming styles
            int stylesUsed = 0;
            List<String> usedStyles = new ArrayList<>();
            
            for (Map.Entry<String, List<String>> entry : namingStyles.entrySet()) {
                if (entry.getValue().size() > 1) {
                    stylesUsed++;
                    usedStyles.add(entry.getKey() + " (" + entry.getValue().size() + ")");
                }
            }
            
            if (stylesUsed >= 2) {
                Severity severity = determineSeverity(stylesUsed);
                
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
                        "stylesUsed", stylesUsed,
                        "styles", String.join(", ", usedStyles),
                        "className", className
                    ),
                    String.format("File '%s' has inconsistent naming: %d different naming styles used (%s)", 
                                 className, stylesUsed, String.join(", ", usedStyles)),
                    severity
                );
                
                evidences.add(evidence);
            }
            
            return evidences.stream();
        } catch (Exception e) {
            return Stream.empty();
        }
    }
    
    private String detectNamingStyle(String name) {
        if (name.equals(name.toUpperCase()) && name.contains("_")) {
            return "UPPER_CASE";
        } else if (name.contains("_")) {
            return "snake_case";
        } else if (Character.isUpperCase(name.charAt(0))) {
            return "PascalCase";
        } else {
            return "camelCase";
        }
    }
    
    private Severity determineSeverity(int stylesUsed) {
        if (stylesUsed >= 3) {
            return Severity.MAJOR;
        } else {
            return Severity.MINOR;
        }
    }
}
