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
public class HardcodedCredentialsDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.hardcoded-credentials";
    
    // Patterns for common credential variable names
    private static final String[] CREDENTIAL_KEYWORDS = {
        "password", "passwd", "pwd", "secret", "apikey", "api_key", 
        "token", "auth", "credential", "private_key", "privatekey"
    };
    
    // Pattern to match variable assignments with string literals
    private static final Pattern ASSIGNMENT_PATTERN = Pattern.compile(
        "\\b(\\w+)\\s*=\\s*\"([^\"]+)\""
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
            .flatMap(sourceFile -> analyzeFileForHardcodedCredentials(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForHardcodedCredentials(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i);
                
                // Skip comments and empty lines
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("//") || 
                    trimmed.startsWith("/*") || trimmed.startsWith("*")) {
                    continue;
                }
                
                Matcher matcher = ASSIGNMENT_PATTERN.matcher(line);
                while (matcher.find()) {
                    String varName = matcher.group(1);
                    String value = matcher.group(2);
                    
                    // Check if variable name suggests it's a credential
                    if (isCredentialVariable(varName) && !isPlaceholder(value)) {
                        ReasonEvidence evidence = new ReasonEvidence(
                            DETECTOR_ID,
                            new CodePointer(
                                projectRoot.relativize(sourceFile),
                                className,
                                "variable",
                                i + 1, // 1-based line number
                                i + 1,
                                1,
                                1
                            ),
                            Map.of(
                                "variableName", varName,
                                "line", i + 1,
                                "valueLength", value.length()
                            ),
                            String.format("Potential hardcoded credential: '%s' at line %d. Consider using environment variables or configuration", 
                                         varName, i + 1),
                            Severity.CRITICAL // Security issue
                        );
                        
                        evidences.add(evidence);
                    }
                }
            }
            
            return evidences.stream();
        } catch (Exception e) {
            return Stream.empty();
        }
    }
    
    private boolean isCredentialVariable(String varName) {
        String lowerVarName = varName.toLowerCase();
        
        for (String keyword : CREDENTIAL_KEYWORDS) {
            if (lowerVarName.contains(keyword)) {
                return true;
            }
        }
        
        return false;
    }
    
    private boolean isPlaceholder(String value) {
        // Common placeholder patterns that are acceptable
        String lowerValue = value.toLowerCase();
        
        return value.isEmpty() ||
               lowerValue.contains("placeholder") ||
               lowerValue.contains("your_") ||
               lowerValue.contains("test") ||
               lowerValue.equals("****") ||
               lowerValue.equals("xxxx") ||
               lowerValue.equals("changeme") ||
               lowerValue.equals("change_me");
    }
}
