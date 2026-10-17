package ai.refact.server.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

/**
 * Persists the latest batch refactor run (results, LLM passes) per workspace.
 * File: {workspaceRoot}/.refactai/batch-run-latest.json
 */
@Service
public class BatchRunArchiveService {
    private static final Logger logger = LoggerFactory.getLogger(BatchRunArchiveService.class);
    static final String BATCH_RUN_FILE = "batch-run-latest.json";

    private Path batchRunPath(Path workspaceRoot) throws IOException {
        Path dir = workspaceRoot.resolve(".refactai");
        if (!Files.exists(dir)) {
            Files.createDirectories(dir);
        }
        return dir.resolve(BATCH_RUN_FILE);
    }

    public synchronized void save(Path workspaceRoot, String jsonBody) throws IOException {
        if (jsonBody == null || jsonBody.isBlank()) {
            throw new IllegalArgumentException("batch run body is required");
        }
        Files.writeString(batchRunPath(workspaceRoot), jsonBody, StandardCharsets.UTF_8);
        logger.info("Saved batch run archive for workspace {}", workspaceRoot);
    }

    public synchronized Optional<String> load(Path workspaceRoot) {
        try {
            Path file = batchRunPath(workspaceRoot);
            if (!Files.isRegularFile(file)) {
                return Optional.empty();
            }
            return Optional.of(Files.readString(file, StandardCharsets.UTF_8));
        } catch (Exception e) {
            logger.warn("Failed to read batch run archive: {}", e.toString());
            return Optional.empty();
        }
    }

    public synchronized void clear(Path workspaceRoot) throws IOException {
        Path file = batchRunPath(workspaceRoot);
        if (Files.isRegularFile(file)) {
            Files.delete(file);
        }
    }
}
