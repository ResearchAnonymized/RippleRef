package ai.refact.server.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.Optional;
import java.util.stream.Stream;

/**
 * Restores pre-refactor source from the earliest {@code *.backup.<timestamp>} sibling
 * so research re-runs measure PMD smells on the true baseline, not an already-refactored file.
 */
@Service
public class ResearchBaselineService {

    private static final Logger logger = LoggerFactory.getLogger(ResearchBaselineService.class);
    public static final String RESEARCH_BASELINE_DIR = ".refactai/research-baseline";

    private final PersistedCodeSmellAnalysisService persistedCodeSmellAnalysisService;
    private final PmdAnalysisPersistence pmdAnalysisPersistence;

    public ResearchBaselineService(PersistedCodeSmellAnalysisService persistedCodeSmellAnalysisService,
                                   PmdAnalysisPersistence pmdAnalysisPersistence) {
        this.persistedCodeSmellAnalysisService = persistedCodeSmellAnalysisService;
        this.pmdAnalysisPersistence = pmdAnalysisPersistence;
    }

    public record RestoreResult(
            boolean restored,
            String reason,
            int smellsBeforeRestore,
            int smellsAfterRestore,
            String backupUsed
    ) {}

    public record BaselineSnapshot(
            String filePath,
            String baselinePath,
            boolean created,
            int smellCount
    ) {}

    /**
     * If live file has fewer PMD smells than the research manifest expects, copy the oldest
     * {@code file.backup.<ts>} over the live source (research re-run baseline).
     */
    public RestoreResult restoreIfNeeded(Path workspaceRoot, String filePath, int manifestSmellCount) {
        if (workspaceRoot == null || filePath == null || filePath.isBlank() || manifestSmellCount <= 0) {
            return new RestoreResult(false, "no_manifest_baseline", 0, 0, null);
        }
        try {
            String rel = RefactoredArtifactsService.normalizeRelativePath(filePath);
            Path live = workspaceRoot.resolve(rel).normalize();
            if (!live.startsWith(workspaceRoot.normalize()) || !Files.isRegularFile(live)) {
                return new RestoreResult(false, "live_file_missing", 0, 0, null);
            }

            int current = persistedCodeSmellAnalysisService.count(workspaceRoot, live);
            if (current >= manifestSmellCount) {
                return new RestoreResult(false, "already_at_baseline", current, current, null);
            }

            Optional<Path> oldestBackup = findOldestBackup(live);
            if (oldestBackup.isEmpty()) {
                return new RestoreResult(false, "no_backup_found", current, current, null);
            }

            String backupContent = Files.readString(oldestBackup.get(), StandardCharsets.UTF_8);
            Files.writeString(live, backupContent, StandardCharsets.UTF_8);
            invalidatePmdCache(workspaceRoot, rel);

            int after = persistedCodeSmellAnalysisService.count(workspaceRoot, live);
            String backupRel = workspaceRoot.relativize(oldestBackup.get()).toString().replace('\\', '/');
            logger.info("Research baseline restored {} from {} (smells {} → {})",
                    rel, backupRel, current, after);
            return new RestoreResult(true, "restored_from_backup", current, after, backupRel);
        } catch (Exception e) {
            logger.warn("Research baseline restore failed for {}: {}", filePath, e.toString());
            return new RestoreResult(false, "error:" + e.getMessage(), 0, 0, null);
        }
    }

    /** Visible for tests in the same package. */
    Optional<Path> findOldestBackup(Path liveFile) throws IOException {
        if (liveFile == null || !Files.isRegularFile(liveFile)) {
            return Optional.empty();
        }
        Path dir = liveFile.getParent();
        if (dir == null || !Files.isDirectory(dir)) {
            return Optional.empty();
        }
        String prefix = liveFile.getFileName().toString() + ".backup.";
        try (Stream<Path> stream = Files.list(dir)) {
            return stream
                    .filter(p -> Files.isRegularFile(p)
                            && p.getFileName().toString().startsWith(prefix))
                    .min(Comparator.comparingLong(ResearchBaselineService::backupSortKey));
        }
    }

    private static long backupSortKey(Path backup) {
        String name = backup.getFileName().toString();
        int dot = name.lastIndexOf('.');
        if (dot >= 0) {
            try {
                return Long.parseLong(name.substring(dot + 1));
            } catch (NumberFormatException ignored) {
                // fall through
            }
        }
        try {
            return Files.getLastModifiedTime(backup).toMillis();
        } catch (IOException e) {
            return Long.MAX_VALUE;
        }
    }

    private void invalidatePmdCache(Path workspaceRoot, String relativePath) {
        pmdAnalysisPersistence.invalidateFile(workspaceRoot, relativePath);
    }

    /**
     * Freeze live source under {@code .refactai/research-baseline/{sampleId}/} for independent multi-LLM runs.
     * Does not overwrite an existing snapshot (idempotent per sample + file).
     */
    public BaselineSnapshot snapshotForSample(Path workspaceRoot, String sampleId, String filePath)
            throws IOException {
        if (sampleId == null || sampleId.isBlank()) {
            throw new IllegalArgumentException("sampleId is required");
        }
        String rel = RefactoredArtifactsService.normalizeRelativePath(filePath);
        Path live = workspaceRoot.resolve(rel).normalize();
        if (!live.startsWith(workspaceRoot.normalize()) || !Files.isRegularFile(live)) {
            throw new IOException("Live file missing: " + rel);
        }
        String safeSample = sampleId.replaceAll("[^a-zA-Z0-9._-]", "_");
        Path baselineFile = workspaceRoot.resolve(RESEARCH_BASELINE_DIR)
                .resolve(safeSample)
                .resolve(rel)
                .normalize();
        if (!baselineFile.startsWith(workspaceRoot.resolve(RESEARCH_BASELINE_DIR).normalize())) {
            throw new IllegalArgumentException("Invalid baseline path");
        }
        Files.createDirectories(baselineFile.getParent());
        boolean created = !Files.exists(baselineFile);
        if (created) {
            Files.copy(live, baselineFile);
            invalidatePmdCache(workspaceRoot, rel);
        }
        int smellCount = persistedCodeSmellAnalysisService.count(workspaceRoot, live);
        String baselineRel = workspaceRoot.relativize(baselineFile).toString().replace('\\', '/');
        logger.info("Research baseline snapshot {} → {} (created={})", rel, baselineRel, created);
        return new BaselineSnapshot(rel, baselineRel, created, smellCount);
    }

    public Optional<String> readBaselineContent(Path workspaceRoot, String sampleId, String filePath) {
        try {
            String rel = RefactoredArtifactsService.normalizeRelativePath(filePath);
            String safeSample = sampleId.replaceAll("[^a-zA-Z0-9._-]", "_");
            Path baselineFile = workspaceRoot.resolve(RESEARCH_BASELINE_DIR)
                    .resolve(safeSample)
                    .resolve(rel);
            if (Files.isRegularFile(baselineFile)) {
                return Optional.of(Files.readString(baselineFile, StandardCharsets.UTF_8));
            }
        } catch (Exception e) {
            logger.warn("Failed to read baseline snapshot: {}", e.toString());
        }
        return Optional.empty();
    }
}
