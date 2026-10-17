package ai.refact.server.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

/**
 * Persists refactoring history per workspace in a JSON file located under
 * {workspaceRoot}/.refactai/history.json
 */
@Service
public class RefactoringHistoryService {
    private static final Logger logger = LoggerFactory.getLogger(RefactoringHistoryService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static class ChangeSummary {
        public Integer added;
        public Integer removed;
        public Integer modified;
        public Integer linesChanged;
    }

    public static class HistoryEntry {
        public String id;
        public long timestamp;
        public String workspaceId;
        public String filePath;
        public String operationType;
        public boolean success;
        public String backupPath;
        public String originalContent;
        public String refactoredContent;
        public ChangeSummary changes;
        public String userId;
        public String userName;
    }

    private Path ensureHistoryFile(Path workspaceRoot) throws IOException {
        Path dir = workspaceRoot.resolve(".refactai");
        if (!Files.exists(dir)) {
            Files.createDirectories(dir);
        }
        Path file = dir.resolve("history.json");
        if (!Files.exists(file)) {
            Files.write(file, "[]".getBytes(StandardCharsets.UTF_8));
        }
        return file;
    }

    public synchronized void addEntry(Path workspaceRoot, HistoryEntry entry) {
        try {
            Path file = ensureHistoryFile(workspaceRoot);
            List<HistoryEntry> list = readAll(workspaceRoot);
            if (entry.id == null || entry.id.isEmpty()) {
                entry.id = UUID.randomUUID().toString();
            }
            entry.timestamp = entry.timestamp == 0 ? System.currentTimeMillis() : entry.timestamp;
            list.add(0, entry);
            // cap to last 200 entries to avoid runaway growth
            if (list.size() > 200) {
                list = list.subList(0, 200);
            }
            MAPPER.writerWithDefaultPrettyPrinter().writeValue(file.toFile(), list);
        } catch (IOException e) {
            logger.error("Failed to add refactoring history entry", e);
        }
    }

    public synchronized List<HistoryEntry> readAll(Path workspaceRoot) {
        try {
            Path file = ensureHistoryFile(workspaceRoot);
            byte[] bytes = Files.readAllBytes(file);
            return MAPPER.readValue(bytes, new TypeReference<List<HistoryEntry>>() {});
        } catch (IOException e) {
            logger.error("Failed to read refactoring history", e);
            return Collections.emptyList();
        }
    }

    public synchronized Optional<HistoryEntry> findById(Path workspaceRoot, String id) {
        return readAll(workspaceRoot).stream().filter(h -> Objects.equals(h.id, id)).findFirst();
    }

    public synchronized void clear(Path workspaceRoot, String filePath) {
        try {
            List<HistoryEntry> list = readAll(workspaceRoot);
            if (filePath != null && !filePath.isBlank()) {
                list.removeIf(h -> Objects.equals(h.filePath, filePath));
            } else {
                list.clear();
            }
            Path file = ensureHistoryFile(workspaceRoot);
            MAPPER.writerWithDefaultPrettyPrinter().writeValue(file.toFile(), list);
        } catch (IOException e) {
            logger.error("Failed to clear refactoring history", e);
        }
    }
}

