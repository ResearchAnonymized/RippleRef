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
public class DivergentChangeDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.divergent-change";
    private static final int MIN_RESPONSIBILITY_AREAS = 3; // Minimum different responsibility areas
    private static final int MIN_METHODS_PER_AREA = 2; // Minimum methods per responsibility area
    
    // Pattern to match method declarations
    private static final Pattern METHOD_PATTERN = Pattern.compile(
        "\\s*(public|private|protected|static|final|abstract)?\\s+" +
        "([\\w.<>\\[\\]]+)\\s+" + // return type
        "(\\w+)\\s*\\(" + // method name
        "([^)]*)\\)" // parameters
    );
    
    // Common responsibility prefixes/patterns
    private static final String[] RESPONSIBILITY_KEYWORDS = {
        "get", "set", "find", "search", "query", "fetch", "retrieve", // Data access
        "create", "build", "make", "generate", "construct", // Creation
        "update", "modify", "change", "edit", "alter", // Modification
        "delete", "remove", "clear", "destroy", // Deletion
        "save", "persist", "store", "write", // Persistence
        "load", "read", "open", // Loading
        "validate", "verify", "check", "ensure", // Validation
        "calculate", "compute", "process", "transform", // Computation
        "format", "render", "display", "show", // Presentation
        "parse", "decode", "encode", "serialize", // Serialization
        "send", "notify", "broadcast", "publish", // Communication
        "handle", "process", "execute", "perform" // Event handling
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
            .flatMap(sourceFile -> analyzeFileForDivergentChange(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForDivergentChange(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            // Analyze methods and categorize by responsibility
            ResponsibilityAnalysis analysis = analyzeClassResponsibilities(lines);
            
            if (analysis.hasDivergentChange()) {
                Severity severity = determineSeverity(
                    analysis.getResponsibilityCount(), 
                    analysis.getTotalMethods()
                );
                
                ReasonEvidence evidence = new ReasonEvidence(
                    DETECTOR_ID,
                    new CodePointer(
                        projectRoot.relativize(sourceFile),
                        className,
                        "class",
                        1,
                        Math.min(10, lines.size()),
                        1,
                        1
                    ),
                    Map.of(
                        "responsibilityCount", analysis.getResponsibilityCount(),
                        "totalMethods", analysis.getTotalMethods(),
                        "responsibilities", String.join(", ", analysis.getResponsibilities()),
                        "className", className
                    ),
                    String.format("Class '%s' has divergent change: %d different responsibilities detected (%s)", 
                                 className, analysis.getResponsibilityCount(), 
                                 String.join(", ", analysis.getResponsibilities())),
                    severity
                );
                
                evidences.add(evidence);
            }
            
            return evidences.stream();
        } catch (Exception e) {
            return Stream.empty();
        }
    }
    
    private ResponsibilityAnalysis analyzeClassResponsibilities(List<String> lines) {
        Set<String> responsibilities = new HashSet<>();
        int totalMethods = 0;
        
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            Matcher matcher = METHOD_PATTERN.matcher(line);
            
            if (matcher.find() && !line.contains("class ") && !line.contains("interface ")) {
                String methodName = matcher.group(3);
                totalMethods++;
                
                // Categorize method by responsibility based on name
                String responsibility = categorizeMethodResponsibility(methodName);
                if (responsibility != null) {
                    responsibilities.add(responsibility);
                }
            }
        }
        
        return new ResponsibilityAnalysis(responsibilities, totalMethods);
    }
    
    private String categorizeMethodResponsibility(String methodName) {
        String lowerMethodName = methodName.toLowerCase();
        
        // Check against responsibility keywords
        for (String keyword : RESPONSIBILITY_KEYWORDS) {
            if (lowerMethodName.startsWith(keyword)) {
                return keyword + "*"; // e.g., "get*", "set*", "calculate*"
            }
        }
        
        return null; // Uncategorized
    }
    
    private Severity determineSeverity(int responsibilityCount, int totalMethods) {
        if (responsibilityCount >= 6 || (responsibilityCount >= 4 && totalMethods >= 15)) {
            return Severity.CRITICAL;
        } else if (responsibilityCount >= 4 || (responsibilityCount >= 3 && totalMethods >= 10)) {
            return Severity.MAJOR;
        } else {
            return Severity.MINOR;
        }
    }
    
    // Helper class
    private static class ResponsibilityAnalysis {
        private final Set<String> responsibilities;
        private final int totalMethods;
        
        public ResponsibilityAnalysis(Set<String> responsibilities, int totalMethods) {
            this.responsibilities = responsibilities;
            this.totalMethods = totalMethods;
        }
        
        public boolean hasDivergentChange() {
            return responsibilities.size() >= MIN_RESPONSIBILITY_AREAS && 
                   totalMethods >= MIN_RESPONSIBILITY_AREAS * MIN_METHODS_PER_AREA;
        }
        
        public int getResponsibilityCount() { return responsibilities.size(); }
        public int getTotalMethods() { return totalMethods; }
        public Set<String> getResponsibilities() { return responsibilities; }
    }
}
