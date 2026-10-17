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
public class TypeEmbeddedNameDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.type-embedded-name";
    private static final int MIN_VIOLATIONS = 2; // Minimum violations to report
    
    // Pattern to match variable/field declarations
    private static final Pattern VARIABLE_PATTERN = Pattern.compile(
        "\\s*([\\w.<>\\[\\]]+)\\s+(\\w+)\\s*[;=]"
    );
    
    // Common type prefixes that shouldn't be in names
    private static final String[] TYPE_PREFIXES = {
        "str", "int", "bool", "float", "double", "long", "char", "byte",
        "arr", "list", "map", "set", "obj", "num"
    };
    
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
            .flatMap(sourceFile -> analyzeFileForTypeEmbeddedNames(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForTypeEmbeddedNames(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
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
                
                // Skip comments and empty lines
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("//") || 
                    trimmed.startsWith("/*") || trimmed.startsWith("*") ||
                    trimmed.startsWith("import ") || trimmed.startsWith("package ")) {
                    continue;
                }
                
                // Skip class declarations and method declarations
                if (trimmed.contains("class ") || trimmed.contains("interface ") ||
                    trimmed.contains("(") && trimmed.contains(")")) {
                    continue;
                }
                
                Matcher matcher = VARIABLE_PATTERN.matcher(line);
                if (matcher.find()) {
                    String type = matcher.group(1);
                    String varName = matcher.group(2);
                    
                    // Check if variable name has type embedded
                    if (hasTypeEmbedded(varName)) {
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
                        "examples", String.join(", ", violations.subList(0, Math.min(5, violations.size()))),
                        "className", className
                    ),
                    String.format("File '%s' has %d variables with type embedded in name. Examples: %s", 
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
    
    private boolean hasTypeEmbedded(String varName) {
        String lowerName = varName.toLowerCase();
        
        for (String prefix : TYPE_PREFIXES) {
            // Check if name starts with type prefix followed by uppercase letter or underscore
            if (lowerName.startsWith(prefix)) {
                if (varName.length() > prefix.length()) {
                    char nextChar = varName.charAt(prefix.length());
                    if (Character.isUpperCase(nextChar) || nextChar == '_') {
                        return true;
                    }
                }
            }
        }
        
        return false;
    }
    
    private Severity determineSeverity(int violationCount) {
        if (violationCount >= 10) {
            return Severity.MAJOR;
        } else if (violationCount >= 5) {
            return Severity.MINOR;
        } else {
            return Severity.MINOR;
        }
    }
}
