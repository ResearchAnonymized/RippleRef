package ai.refact.engine.detectors;

import ai.refact.api.CodePointer;
import ai.refact.api.ReasonEvidence;
import ai.refact.api.Severity;
import ai.refact.api.ProjectContext;
import ai.refact.api.ReasonDetector;
import ai.refact.api.ReasonCategory;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

@Component
public class CircularDependenciesDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.circular-dependencies";
    
    // Pattern to match field declarations
    private static final Pattern FIELD_PATTERN = Pattern.compile(
        "\\s*private\\s+(\\w+)\\s+(\\w+)\\s*;"
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
        
        // Build dependency graph
        Map<String, Set<String>> dependencies = new HashMap<>();
        Map<String, java.nio.file.Path> classToFile = new HashMap<>();
        
        for (java.nio.file.Path sourceFile : ctx.sourceFiles()) {
            try {
                List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
                if (lines.isEmpty()) continue;
                
                String className = sourceFile.getFileName().toString().replace(".java", "");
                classToFile.put(className, sourceFile);
                
                Set<String> classDeps = new HashSet<>();
                
                for (String line : lines) {
                    Matcher matcher = FIELD_PATTERN.matcher(line);
                    if (matcher.find()) {
                        String fieldType = matcher.group(1);
                        classDeps.add(fieldType);
                    }
                }
                
                dependencies.put(className, classDeps);
            } catch (Exception e) {
                continue;
            }
        }
        
        // Detect circular dependencies
        List<ReasonEvidence> evidences = new ArrayList<>();
        Set<String> visited = new HashSet<>();
        
        for (String className : dependencies.keySet()) {
            if (!visited.contains(className)) {
                List<String> cycle = findCycle(className, dependencies, new HashSet<>(), new ArrayList<>());
                if (cycle != null && cycle.size() >= 2) {
                    visited.addAll(cycle);
                    
                    java.nio.file.Path sourceFile = classToFile.get(className);
                    if (sourceFile != null) {
                        ReasonEvidence evidence = new ReasonEvidence(
                            DETECTOR_ID,
                            new CodePointer(
                                ctx.root().relativize(sourceFile),
                                className,
                                "class",
                                1,
                                10,
                                1,
                                1
                            ),
                            Map.of(
                                "className", className,
                                "cycleLength", cycle.size(),
                                "cycle", String.join(" -> ", cycle)
                            ),
                            String.format("Circular dependency detected: %s", String.join(" -> ", cycle)),
                            Severity.MAJOR
                        );
                        
                        evidences.add(evidence);
                    }
                }
            }
        }
        
        return evidences.stream();
    }
    
    private List<String> findCycle(String current, Map<String, Set<String>> dependencies, 
                                   Set<String> visiting, List<String> path) {
        if (visiting.contains(current)) {
            // Found a cycle
            int cycleStart = path.indexOf(current);
            if (cycleStart != -1) {
                List<String> cycle = new ArrayList<>(path.subList(cycleStart, path.size()));
                cycle.add(current);
                return cycle;
            }
        }
        
        visiting.add(current);
        path.add(current);
        
        Set<String> deps = dependencies.get(current);
        if (deps != null) {
            for (String dep : deps) {
                if (dependencies.containsKey(dep)) {
                    List<String> cycle = findCycle(dep, dependencies, visiting, path);
                    if (cycle != null) {
                        return cycle;
                    }
                }
            }
        }
        
        visiting.remove(current);
        path.remove(path.size() - 1);
        
        return null;
    }
}
