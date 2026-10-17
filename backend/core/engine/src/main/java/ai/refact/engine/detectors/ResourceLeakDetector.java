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
public class ResourceLeakDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.resource-leak";
    
    // Resources that need to be closed
    private static final String[] RESOURCE_TYPES = {
        "FileInputStream", "FileOutputStream", "FileReader", "FileWriter",
        "BufferedReader", "BufferedWriter", "PrintWriter",
        "Socket", "ServerSocket", "Connection", "Statement", "ResultSet",
        "InputStream", "OutputStream", "Reader", "Writer",
        "Scanner", "Formatter", "Channel"
    };
    
    // Pattern to match resource creation
    private static final Pattern RESOURCE_CREATION_PATTERN = Pattern.compile(
        "\\b(" + String.join("|", RESOURCE_TYPES) + ")\\s+(\\w+)\\s*="
    );
    
    // Pattern to match try-with-resources
    private static final Pattern TRY_WITH_RESOURCES_PATTERN = Pattern.compile(
        "try\\s*\\([^)]+(" + String.join("|", RESOURCE_TYPES) + ")"
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
            .flatMap(sourceFile -> analyzeFileForResourceLeaks(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForResourceLeaks(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            Set<String> resourceVariables = new HashSet<>();
            Set<String> closedResources = new HashSet<>();
            Set<String> tryWithResourcesVars = new HashSet<>();
            
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i);
                
                // Check for try-with-resources (these are safe)
                Matcher tryWithResourcesMatcher = TRY_WITH_RESOURCES_PATTERN.matcher(line);
                if (tryWithResourcesMatcher.find()) {
                    // Extract variable name from try-with-resources
                    String[] parts = line.split("\\s+");
                    for (String part : parts) {
                        if (part.matches("\\w+")) {
                            tryWithResourcesVars.add(part);
                        }
                    }
                }
                
                // Check for resource creation
                Matcher resourceMatcher = RESOURCE_CREATION_PATTERN.matcher(line);
                if (resourceMatcher.find()) {
                    String resourceType = resourceMatcher.group(1);
                    String varName = resourceMatcher.group(2);
                    
                    // Skip if it's in try-with-resources
                    if (tryWithResourcesVars.contains(varName)) {
                        continue;
                    }
                    
                    resourceVariables.add(varName);
                    
                    // Check if resource is closed within reasonable scope
                    boolean isClosed = isResourceClosed(lines, i, varName);
                    
                    if (!isClosed) {
                        ReasonEvidence evidence = new ReasonEvidence(
                            DETECTOR_ID,
                            new CodePointer(
                                projectRoot.relativize(sourceFile),
                                className,
                                "resource",
                                i + 1, // 1-based line number
                                i + 1,
                                1,
                                1
                            ),
                            Map.of(
                                "resourceType", resourceType,
                                "variableName", varName,
                                "line", i + 1
                            ),
                            String.format("Potential resource leak: %s '%s' at line %d may not be closed", 
                                         resourceType, varName, i + 1),
                            Severity.MAJOR
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
    
    private boolean isResourceClosed(List<String> lines, int resourceLine, String varName) {
        // Check next 50 lines for .close() call on this variable
        int endLine = Math.min(resourceLine + 50, lines.size());
        
        for (int i = resourceLine + 1; i < endLine; i++) {
            String line = lines.get(i);
            
            // Check for explicit close
            if (line.contains(varName + ".close()")) {
                return true;
            }
            
            // Check for finally block with close
            if (line.trim().startsWith("finally")) {
                for (int j = i; j < Math.min(i + 20, lines.size()); j++) {
                    if (lines.get(j).contains(varName + ".close()")) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    }
}
