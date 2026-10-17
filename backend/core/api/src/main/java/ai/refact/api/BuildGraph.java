package ai.refact.api;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Represents the build dependency graph of a project.
 */
public record BuildGraph(
    Path projectRoot,
    List<Module> modules,
    Map<String, Set<String>> dependencies,
    Map<String, Set<String>> reverseDependencies
) {
    
    /**
     * Represents a module in the build graph.
     */
    public record Module(
        String name,
        Path path,
        String type, // "main", "test", etc.
        List<Path> sourcePaths,
        List<Path> resourcePaths,
        List<String> dependencies,
        Map<String, String> properties
    ) {}
    
    /**
     * Get all modules that depend on the given module.
     */
    public Set<String> getDependents(String moduleName) {
        return reverseDependencies.getOrDefault(moduleName, Set.of());
    }
    
    /**
     * Get all modules that the given module depends on.
     */
    public Set<String> getDependencies(String moduleName) {
        return dependencies.getOrDefault(moduleName, Set.of());
    }
    
    /**
     * Check if there are any circular dependencies.
     */
    public boolean hasCircularDependencies() {
        // Simple check - could be enhanced with proper cycle detection
        for (String module : dependencies.keySet()) {
            if (hasCircularDependency(module, module, Set.of())) {
                return true;
            }
        }
        return false;
    }
    
    private boolean hasCircularDependency(String start, String current, Set<String> visited) {
        if (visited.contains(current)) {
            return start.equals(current);
        }
        
        Set<String> newVisited = new java.util.HashSet<>(visited);
        newVisited.add(current);
        
        for (String dep : getDependencies(current)) {
            if (hasCircularDependency(start, dep, newVisited)) {
                return true;
            }
        }
        return false;
    }
}
