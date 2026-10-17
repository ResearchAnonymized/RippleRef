package ai.refact.api;

import java.nio.file.Path;
import java.util.Map;
import java.util.Set;
import ai.refact.api.BuildSystemType;

/**
 * Context information about a Java project.
 */
public record ProjectContext(
    Path root,
    Set<Path> sourceFiles,
    Set<Path> testFiles,
    Map<String, Object> properties,
    BuildSystemType buildSystem
) {
    
    /**
     * Get a property value with a default.
     */
    @SuppressWarnings("unchecked")
    public <T> T getProperty(String key, T defaultValue) {
        return (T) properties.getOrDefault(key, defaultValue);
    }
    
    /**
     * Check if the project has tests.
     */
    public boolean hasTests() {
        return !testFiles.isEmpty();
    }
    
    /**
     * Get the number of source files.
     */
    public int getSourceFileCount() {
        return sourceFiles.size();
    }
    
    /**
     * Get the number of test files.
     */
    public int getTestFileCount() {
        return testFiles.size();
    }
}
