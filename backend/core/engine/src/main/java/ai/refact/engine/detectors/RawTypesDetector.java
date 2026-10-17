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
public class RawTypesDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.raw-types";
    
    // Common generic types
    private static final String[] GENERIC_TYPES = {
        "List", "ArrayList", "LinkedList", "Set", "HashSet", "TreeSet",
        "Map", "HashMap", "TreeMap", "LinkedHashMap",
        "Collection", "Queue", "Deque", "Stack", "Vector",
        "Optional", "Stream", "Iterator", "Iterable"
    };
    
    // Pattern to match raw type usage (e.g., List list = instead of List<String> list =)
    private static final Pattern RAW_TYPE_PATTERN = Pattern.compile(
        "\\b(" + String.join("|", GENERIC_TYPES) + ")\\s+(\\w+)\\s*="
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
            .flatMap(sourceFile -> analyzeFileForRawTypes(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForRawTypes(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i);
                
                // Skip comments, imports, and empty lines
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("//") || 
                    trimmed.startsWith("/*") || trimmed.startsWith("*") ||
                    trimmed.startsWith("import ")) {
                    continue;
                }
                
                Matcher matcher = RAW_TYPE_PATTERN.matcher(line);
                if (matcher.find()) {
                    String type = matcher.group(1);
                    String varName = matcher.group(2);
                    
                    // Check if it's actually a raw type (no angle brackets before the variable name)
                    String beforeVar = line.substring(0, matcher.start(2));
                    if (!beforeVar.contains("<")) {
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
                                "rawType", type,
                                "variableName", varName,
                                "line", i + 1
                            ),
                            String.format("Raw type usage: %s '%s' at line %d should use generics (e.g., %s<?>)", 
                                         type, varName, i + 1, type),
                            Severity.MINOR
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
}
