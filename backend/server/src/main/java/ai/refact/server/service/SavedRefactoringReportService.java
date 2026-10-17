package ai.refact.server.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;

/**
 * Persists full refactoring review bundles for research (before/after, metrics, report JSON).
 * Stored at {workspaceRoot}/.refactai/saved-reports/{encoded-file-path}.json
 */
@Service
public class SavedRefactoringReportService {
    private static final Logger logger = LoggerFactory.getLogger(SavedRefactoringReportService.class);

    private Path reportsDir(Path workspaceRoot) throws IOException {
        Path dir = workspaceRoot.resolve(".refactai").resolve("saved-reports");
        if (!Files.exists(dir)) {
            Files.createDirectories(dir);
        }
        return dir;
    }

    private String encodeFilePath(String filePath) {
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(filePath.getBytes(StandardCharsets.UTF_8));
    }

    private String decodeFilePath(String encodedBaseName) {
        byte[] decoded = Base64.getUrlDecoder().decode(encodedBaseName);
        return new String(decoded, StandardCharsets.UTF_8);
    }

    public record SavedReportIndex(
            String filePath,
            long savedAt,
            long sizeBytes
    ) {}

    /**
     * List all persisted full refactoring reports in a workspace (for bulk Excel export).
     */
    public synchronized List<SavedReportIndex> listAll(Path workspaceRoot) {
        List<SavedReportIndex> out = new ArrayList<>();
        try {
            Path dir = reportsDir(workspaceRoot);
            if (!Files.isDirectory(dir)) {
                return out;
            }
            try (Stream<Path> stream = Files.list(dir)) {
                stream.filter(p -> Files.isRegularFile(p) && p.getFileName().toString().endsWith(".json"))
                        .forEach(p -> {
                            try {
                                String name = p.getFileName().toString();
                                String encoded = name.substring(0, name.length() - 5);
                                String filePath = decodeFilePath(encoded);
                                long size = Files.size(p);
                                long savedAt = Files.getLastModifiedTime(p).toMillis();
                                String body = Files.readString(p, StandardCharsets.UTF_8);
                                var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                                @SuppressWarnings("unchecked")
                                Map<String, Object> doc = mapper.readValue(body, Map.class);
                                Object sa = doc.get("savedAt");
                                if (sa instanceof Number n) {
                                    savedAt = n.longValue();
                                }
                                out.add(new SavedReportIndex(filePath, savedAt, size));
                            } catch (Exception e) {
                                logger.warn("Skipping unreadable saved report {}: {}", p, e.toString());
                            }
                        });
            }
            out.sort(Comparator.comparing(SavedReportIndex::savedAt).reversed());
            return out;
        } catch (IOException e) {
            logger.warn("Failed to list saved reports: {}", e.toString());
            return out;
        }
    }

    private Path reportPath(Path workspaceRoot, String filePath) throws IOException {
        return reportsDir(workspaceRoot).resolve(encodeFilePath(filePath) + ".json");
    }

    public synchronized void save(Path workspaceRoot, String filePath, String jsonBody) {
        if (filePath == null || filePath.isBlank()) {
            throw new IllegalArgumentException("filePath is required");
        }
        if (jsonBody == null || jsonBody.isBlank()) {
            throw new IllegalArgumentException("report body is required");
        }
        try {
            Path target = reportPath(workspaceRoot, filePath);
            Files.writeString(target, jsonBody, StandardCharsets.UTF_8);
            logger.info("Saved full refactoring report for {} ({} bytes)", filePath, jsonBody.length());
        } catch (IOException e) {
            logger.error("Failed to save refactoring report for {}", filePath, e);
            throw new RuntimeException("Failed to save refactoring report: " + e.getMessage(), e);
        }
    }

    public synchronized Optional<String> load(Path workspaceRoot, String filePath) {
        if (filePath == null || filePath.isBlank()) {
            return Optional.empty();
        }
        try {
            Path target = reportPath(workspaceRoot, filePath);
            if (!Files.exists(target)) {
                return Optional.empty();
            }
            return Optional.of(Files.readString(target, StandardCharsets.UTF_8));
        } catch (IOException e) {
            logger.error("Failed to load refactoring report for {}", filePath, e);
            return Optional.empty();
        }
    }

    public synchronized boolean exists(Path workspaceRoot, String filePath) {
        try {
            return Files.exists(reportPath(workspaceRoot, filePath));
        } catch (IOException e) {
            return false;
        }
    }

    public synchronized void delete(Path workspaceRoot, String filePath) {
        try {
            Path target = reportPath(workspaceRoot, filePath);
            Files.deleteIfExists(target);
        } catch (IOException e) {
            logger.warn("Failed to delete saved report for {}", filePath, e);
        }
    }
}
