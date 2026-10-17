package ai.refact.api;

import java.nio.file.Path;
import java.util.Collection;

/**
 * SPI for build system integration (Maven, Gradle, etc.).
 */
public interface BuildSystem {
    
    /**
     * Check if this build system is applicable to the given project root.
     */
    boolean isApplicable(Path root);
    
    /**
     * Build the dependency graph for the project.
     */
    BuildGraph graph(Path root);
    
    /**
     * Compile the project, optionally only changed files.
     */
    CompileResult compile(Path root, Collection<Path> changedFiles);
    
    /**
     * Run tests with the given scope.
     */
    TestResult test(Path root, TestScope scope);
}
