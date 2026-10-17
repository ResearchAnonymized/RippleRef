package ai.refact.server.service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

/**
 * Paths excluded from workspace file browser listings and counts.
 * Tooling under {@code .refactai/} (PMD cache, refactored copies, reports) must never
 * inflate the visible file count after Run Analysis.
 */
public final class WorkspacePathFilters {

    private WorkspacePathFilters() {}

    public static String toRelativePath(Path projectRoot, Path filePath) {
        return projectRoot.relativize(filePath.normalize()).toString().replace('\\', '/');
    }

    /**
     * @param relativePath workspace-relative path using forward slashes
     */
    public static boolean isExcludedFromFileListing(String relativePath) {
        if (relativePath == null || relativePath.isBlank()) {
            return true;
        }
        String rel = relativePath.startsWith("/") ? relativePath.substring(1) : relativePath;

        if (rel.equals(".refactai") || rel.startsWith(".refactai/")) {
            return true;
        }
        if (rel.startsWith(".git/") || rel.contains("/.git/")) {
            return true;
        }
        if (rel.startsWith("target/") || rel.contains("/target/")) {
            return true;
        }
        if (rel.startsWith("build/") || rel.contains("/build/")) {
            return true;
        }
        if (rel.startsWith("node_modules/") || rel.contains("/node_modules/")) {
            return true;
        }
        if (rel.endsWith(".class")) {
            return true;
        }
        return false;
    }

    public static boolean isExcludedFromFileListing(Path projectRoot, Path filePath) {
        return isExcludedFromFileListing(toRelativePath(projectRoot, filePath));
    }

    /**
     * Resolve workspace-relative source, falling back to saved artifacts when live sources are gone.
     */
    public static Optional<Path> resolveReadableSourcePath(Path projectRoot, String filePath) {
        if (projectRoot == null || filePath == null || filePath.isBlank()) {
            return Optional.empty();
        }
        Path root = projectRoot.normalize();
        String rel = filePath.startsWith("/") ? filePath.substring(1) : filePath;
        Path primary = root.resolve(rel).normalize();
        if (primary.startsWith(root) && Files.isRegularFile(primary)) {
            return Optional.of(primary);
        }
        for (String prefix : List.of(".refactai/originals", ".refactai/rejected", ".refactai/refactored")) {
            Path artifact = root.resolve(prefix).resolve(rel).normalize();
            if (artifact.startsWith(root) && Files.isRegularFile(artifact)) {
                return Optional.of(artifact);
            }
        }
        return Optional.empty();
    }
}
