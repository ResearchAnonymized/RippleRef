package ai.refact.server.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * User-profile research archive: persists cross-project and full-metric Excel exports
 * under ~/.refactai/users/{userId}/research-archive/ until explicitly deleted.
 */
@Service
public class UserResearchArchiveService {
    private static final Logger logger = LoggerFactory.getLogger(UserResearchArchiveService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private final Path usersRoot;

    public UserResearchArchiveService() {
        this(Path.of(System.getProperty("user.home"), ".refactai", "users"));
    }

    /** Package-visible for tests. */
    UserResearchArchiveService(Path usersRoot) {
        this.usersRoot = usersRoot;
    }

    public record ArchiveIndex(
            String exportId,
            String filename,
            long savedAt,
            long sizeBytes,
            int fileCount,
            int exportedCount,
            int skippedCount,
            String exportKind,
            List<String> projectLabels,
            List<String> workspaceIds
    ) {}

    private Path userDir(String userId) throws IOException {
        Path dir = usersRoot.resolve(userId).resolve("research-archive");
        if (!Files.exists(dir)) {
            Files.createDirectories(dir);
        }
        return dir;
    }

    private Path exportDir(Path userDir, String exportId) throws IOException {
        Path dir = userDir.resolve(exportId);
        if (!Files.exists(dir)) {
            Files.createDirectories(dir);
        }
        return dir;
    }

    private String newExportId() {
        String ts = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")
                .withZone(ZoneOffset.UTC)
                .format(Instant.now());
        return ts + "-" + UUID.randomUUID().toString().substring(0, 8);
    }

    @SuppressWarnings("unchecked")
    public synchronized ArchiveIndex save(
            String userId,
            byte[] xlsxBytes,
            byte[] indexJsonBytes,
            Map<String, Object> metadata) throws IOException {
        if (xlsxBytes == null || xlsxBytes.length == 0) {
            throw new IllegalArgumentException("xlsx content is required");
        }
        Path base = userDir(userId);
        String exportId = newExportId();
        Path dir = exportDir(base, exportId);
        String filename = metadata != null && metadata.get("filename") instanceof String f && !f.isBlank()
                ? f
                : exportId + ".xlsx";
        long savedAt = metadata != null && metadata.get("savedAt") instanceof Number n
                ? n.longValue()
                : System.currentTimeMillis();

        Map<String, Object> manifest = new LinkedHashMap<>();
        if (metadata != null) {
            manifest.putAll(metadata);
        }
        manifest.put("exportId", exportId);
        manifest.put("filename", filename);
        manifest.put("savedAt", savedAt);
        manifest.put("userId", userId);

        Files.write(dir.resolve("workbook.xlsx"), xlsxBytes);
        Files.writeString(dir.resolve("manifest.json"), MAPPER.writeValueAsString(manifest), StandardCharsets.UTF_8);
        if (indexJsonBytes != null && indexJsonBytes.length > 0) {
            Files.write(dir.resolve("files_index.json"), indexJsonBytes);
        }

        int fileCount = metadata != null && metadata.get("fileCount") instanceof Number fc ? fc.intValue() : 0;
        int exportedCount = metadata != null && metadata.get("exportedCount") instanceof Number ec ? ec.intValue() : 0;
        int skippedCount = metadata != null && metadata.get("skippedCount") instanceof Number sc ? sc.intValue() : 0;
        String exportKind = metadata != null ? String.valueOf(metadata.getOrDefault("exportKind", "manual")) : "manual";

        logger.info("Saved user research archive {} for user {} ({} bytes)", exportId, userId, xlsxBytes.length);

        return new ArchiveIndex(
                exportId,
                filename,
                savedAt,
                xlsxBytes.length,
                fileCount,
                exportedCount,
                skippedCount,
                exportKind,
                stringList(metadata != null ? metadata.get("sourceProjectLabels") : null),
                stringList(metadata != null ? metadata.get("sourceWorkspaceIds") : null));
    }

    @SuppressWarnings("unchecked")
    private static List<String> stringList(Object raw) {
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        for (Object o : list) {
            if (o != null) {
                out.add(String.valueOf(o));
            }
        }
        return out;
    }

    public synchronized List<ArchiveIndex> listAll(String userId) {
        List<ArchiveIndex> out = new ArrayList<>();
        try {
            Path base = userDir(userId);
            if (!Files.isDirectory(base)) {
                return out;
            }
            try (Stream<Path> stream = Files.list(base)) {
                stream.filter(Files::isDirectory).forEach(dir -> {
                    try {
                        Path manifestPath = dir.resolve("manifest.json");
                        Path xlsx = dir.resolve("workbook.xlsx");
                        if (!Files.isRegularFile(manifestPath) || !Files.isRegularFile(xlsx)) {
                            return;
                        }
                        Map<String, Object> doc = MAPPER.readValue(
                                Files.readString(manifestPath, StandardCharsets.UTF_8), Map.class);
                        String exportId = String.valueOf(doc.getOrDefault("exportId", dir.getFileName().toString()));
                        out.add(new ArchiveIndex(
                                exportId,
                                String.valueOf(doc.getOrDefault("filename", "workbook.xlsx")),
                                doc.get("savedAt") instanceof Number n ? n.longValue() : 0L,
                                Files.size(xlsx),
                                doc.get("fileCount") instanceof Number fc ? fc.intValue() : 0,
                                doc.get("exportedCount") instanceof Number ec ? ec.intValue() : 0,
                                doc.get("skippedCount") instanceof Number sc ? sc.intValue() : 0,
                                String.valueOf(doc.getOrDefault("exportKind", "manual")),
                                stringList(doc.get("sourceProjectLabels")),
                                stringList(doc.get("sourceWorkspaceIds"))));
                    } catch (Exception e) {
                        logger.warn("Skipping unreadable archive {}: {}", dir, e.toString());
                    }
                });
            }
            out.sort(Comparator.comparingLong(ArchiveIndex::savedAt).reversed());
        } catch (Exception e) {
            logger.warn("Failed to list research archive for {}: {}", userId, e.toString());
        }
        return out;
    }

    public synchronized Optional<byte[]> loadXlsx(String userId, String exportId) {
        try {
            Path file = userDir(userId).resolve(exportId).resolve("workbook.xlsx");
            if (!Files.isRegularFile(file)) {
                return Optional.empty();
            }
            return Optional.of(Files.readAllBytes(file));
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    public synchronized Optional<byte[]> loadIndex(String userId, String exportId) {
        try {
            Path file = userDir(userId).resolve(exportId).resolve("files_index.json");
            if (!Files.isRegularFile(file)) {
                return Optional.empty();
            }
            return Optional.of(Files.readAllBytes(file));
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    public synchronized Optional<String> loadFilename(String userId, String exportId) {
        try {
            Path manifestPath = userDir(userId).resolve(exportId).resolve("manifest.json");
            if (!Files.isRegularFile(manifestPath)) {
                return Optional.of("workbook.xlsx");
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> doc = MAPPER.readValue(
                    Files.readString(manifestPath, StandardCharsets.UTF_8), Map.class);
            return Optional.of(String.valueOf(doc.getOrDefault("filename", "workbook.xlsx")));
        } catch (Exception e) {
            return Optional.of("workbook.xlsx");
        }
    }

    public synchronized boolean delete(String userId, String exportId) {
        try {
            Path dir = userDir(userId).resolve(exportId);
            if (!Files.isDirectory(dir)) {
                return false;
            }
            try (Stream<Path> walk = Files.walk(dir)) {
                walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                    try {
                        Files.deleteIfExists(p);
                    } catch (IOException ignored) {
                    }
                });
            }
            return true;
        } catch (Exception e) {
            logger.warn("Failed to delete archive {} for {}: {}", exportId, userId, e.toString());
            return false;
        }
    }
}
