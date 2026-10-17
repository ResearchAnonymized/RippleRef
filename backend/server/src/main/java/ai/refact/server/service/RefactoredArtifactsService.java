package ai.refact.server.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Persists refactored (and pre-refactor) source copies under the project tree:
 * <ul>
 *   <li>{@code .refactai/refactored/} — last accepted refactored source (mirror of project paths)</li>
 *   <li>{@code .refactai/rejected/} — last rejected LLM candidate (verification failed; not applied)</li>
 *   <li>{@code .refactai/originals/} — source snapshot taken at apply or reject time</li>
 * </ul>
 */
@Service
public class RefactoredArtifactsService {

    private static final Logger logger = LoggerFactory.getLogger(RefactoredArtifactsService.class);

    public static final String REFACTORED_DIR = ".refactai/refactored";
    public static final String REJECTED_DIR = ".refactai/rejected";
    public static final String ORIGINALS_DIR = ".refactai/originals";

    public record SavedArtifacts(
            String refactoredArtifactPath,
            String originalArtifactPath,
            long savedAt
    ) {}

    /**
     * Save copies and return workspace-relative paths to stored files.
     */
    public SavedArtifacts saveRefactored(Path workspaceRoot, String filePath,
                                         String originalContent, String refactoredContent) throws IOException {
        String rel = normalizeRelativePath(filePath);
        Path refactoredFile = safeResolve(workspaceRoot, REFACTORED_DIR, rel);
        Path originalFile = safeResolve(workspaceRoot, ORIGINALS_DIR, rel);

        Files.createDirectories(refactoredFile.getParent());
        Files.createDirectories(originalFile.getParent());

        Files.writeString(refactoredFile, refactoredContent != null ? refactoredContent : "", StandardCharsets.UTF_8);
        // Keep the first pre-refactor snapshot — later applies must not overwrite research baseline.
        if (!Files.exists(originalFile)) {
            Files.writeString(originalFile, originalContent != null ? originalContent : "", StandardCharsets.UTF_8);
        }

        String refRel = REFACTORED_DIR + "/" + rel;
        String origRel = ORIGINALS_DIR + "/" + rel;
        long savedAt = System.currentTimeMillis();
        logger.info("Saved refactored artifacts for {} → {}", rel, refRel);
        return new SavedArtifacts(refRel, origRel, savedAt);
    }

    /**
     * Persist original source and rejected LLM candidate for research replay (not applied to live tree).
     */
    public SavedArtifacts saveRejectedAttempt(Path workspaceRoot, String filePath,
                                              String originalContent, String candidateContent) throws IOException {
        String rel = normalizeRelativePath(filePath);
        Path rejectedFile = safeResolve(workspaceRoot, REJECTED_DIR, rel);
        Path originalFile = safeResolve(workspaceRoot, ORIGINALS_DIR, rel);

        Files.createDirectories(rejectedFile.getParent());
        Files.createDirectories(originalFile.getParent());

        Files.writeString(rejectedFile, candidateContent != null ? candidateContent : "", StandardCharsets.UTF_8);
        if (!Files.exists(originalFile)) {
            Files.writeString(originalFile, originalContent != null ? originalContent : "", StandardCharsets.UTF_8);
        }

        String rejRel = REJECTED_DIR + "/" + rel;
        String origRel = ORIGINALS_DIR + "/" + rel;
        long savedAt = System.currentTimeMillis();
        logger.info("Saved rejected refactor attempt for {} → {}", rel, rejRel);
        return new SavedArtifacts(rejRel, origRel, savedAt);
    }

    public String readArtifact(Path workspaceRoot, String artifactRelativePath) throws IOException {
        if (artifactRelativePath == null || artifactRelativePath.isBlank()) {
            return null;
        }
        String rel = normalizeRelativePath(artifactRelativePath);
        if (!rel.startsWith(".refactai/")) {
            throw new IllegalArgumentException("Not an artifact path");
        }
        Path file = workspaceRoot.resolve(rel).normalize();
        if (!file.startsWith(workspaceRoot.normalize())) {
            throw new IllegalArgumentException("Invalid artifact path");
        }
        if (!Files.isRegularFile(file)) {
            return null;
        }
        return Files.readString(file, StandardCharsets.UTF_8);
    }

    public static String normalizeRelativePath(String filePath) {
        String rel = filePath.replace('\\', '/').trim();
        while (rel.startsWith("/")) {
            rel = rel.substring(1);
        }
        if (rel.contains("..")) {
            throw new IllegalArgumentException("Invalid file path");
        }
        return rel;
    }

    private static Path safeResolve(Path workspaceRoot, String subDir, String relativeFile) throws IOException {
        Path base = workspaceRoot.resolve(subDir).normalize();
        Path target = base.resolve(relativeFile).normalize();
        if (!target.startsWith(base) || !base.startsWith(workspaceRoot.normalize())) {
            throw new IllegalArgumentException("Path escapes workspace: " + relativeFile);
        }
        return target;
    }
}
