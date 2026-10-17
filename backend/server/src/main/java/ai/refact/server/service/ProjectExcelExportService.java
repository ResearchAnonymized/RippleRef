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
 * Persists project-level Excel refactoring exports for later download.
 * Layout: {workspaceRoot}/.refactai/exports/excel/{exportId}.xlsx + {exportId}.meta.json
 */
@Service
public class ProjectExcelExportService {
    private static final Logger logger = LoggerFactory.getLogger(ProjectExcelExportService.class);
    static final String EXPORTS_DIR = ".refactai/exports/excel";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public record ExcelExportIndex(
            String exportId,
            String filename,
            long savedAt,
            long sizeBytes,
            int fileCount,
            int exportedCount,
            int skippedCount,
            String projectLabel,
            String exportKind,
            String researchSampleId,
            List<String> sourceWorkspaceIds
    ) {}

    private Path exportsDir(Path workspaceRoot) throws IOException {
        Path dir = workspaceRoot.resolve(EXPORTS_DIR);
        if (!Files.exists(dir)) {
            Files.createDirectories(dir);
        }
        return dir;
    }

    private Path metaPath(Path dir, String exportId) {
        return dir.resolve(exportId + ".meta.json");
    }

    private Path xlsxPath(Path dir, String exportId) {
        return dir.resolve(exportId + ".xlsx");
    }

    private String newExportId() {
        String ts = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")
                .withZone(ZoneOffset.UTC)
                .format(Instant.now());
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        return ts + "-" + suffix;
    }

    @SuppressWarnings("unchecked")
    public synchronized ExcelExportIndex save(
            Path workspaceRoot,
            byte[] xlsxBytes,
            Map<String, Object> metadata) throws IOException {
        if (xlsxBytes == null || xlsxBytes.length == 0) {
            throw new IllegalArgumentException("xlsx content is required");
        }
        Path dir = exportsDir(workspaceRoot);
        String exportId = newExportId();
        String filename = metadata != null && metadata.get("filename") instanceof String f && !f.isBlank()
                ? f
                : exportId + ".xlsx";
        long savedAt = metadata != null && metadata.get("savedAt") instanceof Number n
                ? n.longValue()
                : System.currentTimeMillis();
        int fileCount = metadata != null && metadata.get("fileCount") instanceof Number fc
                ? fc.intValue()
                : 0;
        int exportedCount = metadata != null && metadata.get("exportedCount") instanceof Number ec
                ? ec.intValue()
                : 0;
        int skippedCount = metadata != null && metadata.get("skippedCount") instanceof Number sc
                ? sc.intValue()
                : 0;
        String projectLabel = metadata != null && metadata.get("projectLabel") instanceof String pl
                ? pl
                : "";

        Map<String, Object> metaDoc = new LinkedHashMap<>();
        metaDoc.put("exportId", exportId);
        metaDoc.put("filename", filename);
        metaDoc.put("savedAt", savedAt);
        metaDoc.put("fileCount", fileCount);
        metaDoc.put("exportedCount", exportedCount);
        metaDoc.put("skippedCount", skippedCount);
        metaDoc.put("projectLabel", projectLabel);
        metaDoc.put("filePaths", metadata != null ? metadata.getOrDefault("filePaths", List.of()) : List.of());
        metaDoc.put("exportKind", metadata != null ? metadata.getOrDefault("exportKind", "manual") : "manual");
        if (metadata != null) {
            for (String key : List.of(
                    "researchSampleId",
                    "researchSampleSeed",
                    "batchRunAt",
                    "sourceWorkspaceIds",
                    "sourceProjectLabels")) {
                if (metadata.containsKey(key)) {
                    metaDoc.put(key, metadata.get(key));
                }
            }
        }

        Files.write(xlsxPath(dir, exportId), xlsxBytes);
        Files.writeString(metaPath(dir, exportId), MAPPER.writeValueAsString(metaDoc), StandardCharsets.UTF_8);
        logger.info("Saved Excel export {} ({} bytes, {} files) under {}", exportId, xlsxBytes.length, fileCount, dir);

        return new ExcelExportIndex(
                exportId,
                filename,
                savedAt,
                xlsxBytes.length,
                fileCount,
                exportedCount,
                skippedCount,
                projectLabel,
                String.valueOf(metaDoc.getOrDefault("exportKind", "manual")),
                metaDoc.get("researchSampleId") != null ? String.valueOf(metaDoc.get("researchSampleId")) : "",
                stringList(metaDoc.get("sourceWorkspaceIds"))
        );
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

    private static ExcelExportIndex indexFromMeta(Path xlsx, Map<String, Object> doc) throws IOException {
        String exportId = String.valueOf(doc.getOrDefault("exportId", ""));
        long savedAt = doc.get("savedAt") instanceof Number n ? n.longValue() : 0L;
        String filename = String.valueOf(doc.getOrDefault("filename", exportId + ".xlsx"));
        int fileCount = doc.get("fileCount") instanceof Number fc ? fc.intValue() : 0;
        int exportedCount = doc.get("exportedCount") instanceof Number ec ? ec.intValue() : 0;
        int skippedCount = doc.get("skippedCount") instanceof Number sc ? sc.intValue() : 0;
        String projectLabel = String.valueOf(doc.getOrDefault("projectLabel", ""));
        String exportKind = String.valueOf(doc.getOrDefault("exportKind", "manual"));
        String researchSampleId = doc.get("researchSampleId") != null
                ? String.valueOf(doc.get("researchSampleId"))
                : "";
        long size = Files.size(xlsx);
        return new ExcelExportIndex(
                exportId,
                filename,
                savedAt,
                size,
                fileCount,
                exportedCount,
                skippedCount,
                projectLabel,
                exportKind,
                researchSampleId,
                stringList(doc.get("sourceWorkspaceIds")));
    }

    public synchronized List<ExcelExportIndex> listAll(Path workspaceRoot) {
        List<ExcelExportIndex> out = new ArrayList<>();
        try {
            Path dir = exportsDir(workspaceRoot);
            if (!Files.isDirectory(dir)) {
                return out;
            }
            try (Stream<Path> stream = Files.list(dir)) {
                stream.filter(p -> p.getFileName().toString().endsWith(".meta.json"))
                        .forEach(p -> {
                            try {
                                String name = p.getFileName().toString();
                                String exportId = name.substring(0, name.length() - ".meta.json".length());
                                Path xlsx = xlsxPath(dir, exportId);
                                if (!Files.isRegularFile(xlsx)) {
                                    return;
                                }
                                @SuppressWarnings("unchecked")
                                Map<String, Object> doc = MAPPER.readValue(
                                        Files.readString(p, StandardCharsets.UTF_8), Map.class);
                                out.add(indexFromMeta(xlsx, doc));
                            } catch (Exception e) {
                                logger.warn("Skipping unreadable excel export meta {}: {}", p, e.toString());
                            }
                        });
            }
            out.sort(Comparator.comparingLong(ExcelExportIndex::savedAt).reversed());
        } catch (Exception e) {
            logger.warn("Failed to list excel exports: {}", e.toString());
        }
        return out;
    }

    public synchronized Optional<byte[]> loadXlsx(Path workspaceRoot, String exportId) {
        try {
            Path dir = exportsDir(workspaceRoot);
            Path file = xlsxPath(dir, exportId);
            if (!Files.isRegularFile(file)) {
                return Optional.empty();
            }
            return Optional.of(Files.readAllBytes(file));
        } catch (Exception e) {
            logger.warn("Failed to read excel export {}: {}", exportId, e.toString());
            return Optional.empty();
        }
    }

    public synchronized Optional<String> loadFilename(Path workspaceRoot, String exportId) {
        try {
            Path meta = metaPath(exportsDir(workspaceRoot), exportId);
            if (!Files.isRegularFile(meta)) {
                return Optional.of(exportId + ".xlsx");
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> doc = MAPPER.readValue(
                    Files.readString(meta, StandardCharsets.UTF_8), Map.class);
            return Optional.of(String.valueOf(doc.getOrDefault("filename", exportId + ".xlsx")));
        } catch (Exception e) {
            return Optional.of(exportId + ".xlsx");
        }
    }

    /**
     * Remove all prior Excel exports in a workspace (replace-on-save workflow).
     */
    public synchronized int clearAll(Path workspaceRoot) throws IOException {
        Path dir = workspaceRoot.resolve(EXPORTS_DIR);
        if (!Files.isDirectory(dir)) {
            return 0;
        }
        int removed = 0;
        try (Stream<Path> stream = Files.list(dir)) {
            List<Path> toDelete = stream.filter(p -> {
                String n = p.getFileName().toString();
                return n.endsWith(".xlsx") || n.endsWith(".meta.json");
            }).toList();
            for (Path p : toDelete) {
                Files.deleteIfExists(p);
                removed += 1;
            }
        }
        logger.info("Cleared {} excel export file(s) under {}", removed, dir);
        return removed;
    }

    /**
     * Replace all exports with a single new workbook (fixed export id {@code latest}).
     */
    public synchronized ExcelExportIndex replaceAll(
            Path workspaceRoot,
            byte[] xlsxBytes,
            Map<String, Object> metadata) throws IOException {
        clearAll(workspaceRoot);
        Path dir = exportsDir(workspaceRoot);
        String exportId = "latest";
        String filename = metadata != null && metadata.get("filename") instanceof String f && !f.isBlank()
                ? f
                : "research-export.xlsx";
        long savedAt = metadata != null && metadata.get("savedAt") instanceof Number n
                ? n.longValue()
                : System.currentTimeMillis();
        int fileCount = metadata != null && metadata.get("fileCount") instanceof Number fc
                ? fc.intValue()
                : 0;
        int exportedCount = metadata != null && metadata.get("exportedCount") instanceof Number ec
                ? ec.intValue()
                : 0;
        int skippedCount = metadata != null && metadata.get("skippedCount") instanceof Number sc
                ? sc.intValue()
                : 0;
        String projectLabel = metadata != null && metadata.get("projectLabel") instanceof String pl
                ? pl
                : "";

        Map<String, Object> metaDoc = new LinkedHashMap<>();
        metaDoc.put("exportId", exportId);
        metaDoc.put("filename", filename);
        metaDoc.put("savedAt", savedAt);
        metaDoc.put("fileCount", fileCount);
        metaDoc.put("exportedCount", exportedCount);
        metaDoc.put("skippedCount", skippedCount);
        metaDoc.put("projectLabel", projectLabel);
        metaDoc.put("filePaths", metadata != null ? metadata.getOrDefault("filePaths", List.of()) : List.of());
        metaDoc.put("exportKind", metadata != null ? metadata.getOrDefault("exportKind", "manual") : "manual");
        if (metadata != null) {
            for (String key : List.of(
                    "researchSampleId",
                    "researchSampleSeed",
                    "batchRunAt",
                    "sourceWorkspaceIds",
                    "sourceProjectLabels",
                    "exportVersion",
                    "fullMetrics")) {
                if (metadata.containsKey(key)) {
                    metaDoc.put(key, metadata.get(key));
                }
            }
        }

        Files.write(xlsxPath(dir, exportId), xlsxBytes);
        Files.writeString(metaPath(dir, exportId), MAPPER.writeValueAsString(metaDoc), StandardCharsets.UTF_8);
        logger.info("Replaced excel exports with {} ({} bytes)", exportId, xlsxBytes.length);

        return new ExcelExportIndex(
                exportId,
                filename,
                savedAt,
                xlsxBytes.length,
                fileCount,
                exportedCount,
                skippedCount,
                projectLabel,
                String.valueOf(metaDoc.getOrDefault("exportKind", "manual")),
                metaDoc.get("researchSampleId") != null ? String.valueOf(metaDoc.get("researchSampleId")) : "",
                stringList(metaDoc.get("sourceWorkspaceIds")));
    }
}
