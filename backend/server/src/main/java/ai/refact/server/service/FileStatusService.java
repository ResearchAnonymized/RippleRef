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
 * Tracks per-file refactoring status within a workspace.
 * Persists to {workspaceRoot}/.refactai/file-status.json.
 */
@Service
public class FileStatusService {
    private static final Logger logger = LoggerFactory.getLogger(FileStatusService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static class FileStatus {
        public String filePath;
        public String status; // pending, refactored, rejected, skipped, error
        public int smellsBefore;
        public int smellsAfter;
        public long lastUpdatedAt;
        public String humanVerdict; // accepted, rejected, pending, null
        public String rejectionReason;
        public String userId;
        public String userName;
        /** PMD / detector analysis timestamp (epoch ms). */
        public Long analyzedAt;
        public int analysisSmellCount;
        /** Last AI refactor attempt (epoch ms). */
        public Long lastRefactorAt;
        public Boolean verifyAccepted;
        public String runId;
        /** Compact JSON snapshot of research metrics for export (optional). */
        public String researchSnapshot;
        /** Workspace-relative path to saved refactored copy under .refactai/refactored/ */
        public String refactoredArtifactPath;
        /** Workspace-relative path to pre-refactor snapshot under .refactai/originals/ */
        public String originalArtifactPath;
        /** When refactored copy was written into the project (epoch ms). */
        public Long savedToProjectAt;
    }

    public static class ProjectProgress {
        /** Java source + test files tracked for refactoring. */
        public int totalFiles;
        public int pending;
        public int refactored;
        public int rejected;
        public int skipped;
        public int error;
        public double progressPercent;
        public List<FileStatus> files;
        public int workspaceFiles;
        public int javaSourceFiles;
        public int javaTestFiles;
        /** Files with at least one PMD analysis recorded. */
        public int analyzed;
    }

    private Path statusFile(Path workspaceRoot) throws IOException {
        Path dir = workspaceRoot.resolve(".refactai");
        if (!Files.exists(dir)) {
            Files.createDirectories(dir);
        }
        Path file = dir.resolve("file-status.json");
        if (!Files.exists(file)) {
            Files.write(file, "{}".getBytes(StandardCharsets.UTF_8));
        }
        return file;
    }

    public synchronized Map<String, FileStatus> readAll(Path workspaceRoot) {
        try {
            Path file = statusFile(workspaceRoot);
            byte[] bytes = Files.readAllBytes(file);
            return MAPPER.readValue(bytes, new TypeReference<Map<String, FileStatus>>() {});
        } catch (Exception e) {
            logger.error("Failed to read file status", e);
            return new LinkedHashMap<>();
        }
    }

    private synchronized void writeAll(Path workspaceRoot, Map<String, FileStatus> map) throws IOException {
        MAPPER.writerWithDefaultPrettyPrinter().writeValue(statusFile(workspaceRoot).toFile(), map);
    }

    /**
     * Record that static smell analysis (PMD) was run for this file. Does not overwrite refactored/rejected status.
     */
    public synchronized void recordAnalysis(Path workspaceRoot, String filePath, int smellCount) {
        if (filePath == null || filePath.isBlank()) {
            return;
        }
        try {
            Map<String, FileStatus> map = readAll(workspaceRoot);
            FileStatus fs = map.getOrDefault(filePath, new FileStatus());
            fs.filePath = filePath;
            fs.analyzedAt = System.currentTimeMillis();
            fs.analysisSmellCount = Math.max(0, smellCount);
            String st = fs.status;
            if (st == null || st.isBlank()) {
                fs.status = "pending";
            }
            fs.lastUpdatedAt = System.currentTimeMillis();
            map.put(filePath, fs);
            writeAll(workspaceRoot, map);
        } catch (Exception e) {
            logger.error("Failed to record analysis for {}", filePath, e);
        }
    }

    public synchronized void updateStatus(Path workspaceRoot, String filePath, String status,
                                          int smellsBefore, int smellsAfter, String rejectionReason) {
        try {
            Map<String, FileStatus> map = readAll(workspaceRoot);
            FileStatus fs = map.getOrDefault(filePath, new FileStatus());
            fs.filePath = filePath;
            fs.status = status;
            fs.smellsBefore = smellsBefore;
            fs.smellsAfter = smellsAfter;
            fs.lastUpdatedAt = System.currentTimeMillis();
            if (status != null && !"pending".equals(status)) {
                fs.lastRefactorAt = System.currentTimeMillis();
            }
            if (rejectionReason != null) {
                fs.rejectionReason = rejectionReason;
            }
            map.put(filePath, fs);
            writeAll(workspaceRoot, map);
        } catch (Exception e) {
            logger.error("Failed to update file status for {}", filePath, e);
        }
    }

    /**
     * Merge optional fields from API/agents without clearing existing analysis data.
     */
    public synchronized void patchStatus(Path workspaceRoot, String filePath, java.util.Map<String, Object> body) {
        if (filePath == null || filePath.isBlank()) {
            return;
        }
        try {
            Map<String, FileStatus> map = readAll(workspaceRoot);
            FileStatus fs = map.getOrDefault(filePath, new FileStatus());
            fs.filePath = filePath;

            if (body.containsKey("status") && body.get("status") != null) {
                String newStatus = String.valueOf(body.get("status"));
                fs.status = newStatus;
                if (!"pending".equals(newStatus)) {
                    fs.lastRefactorAt = System.currentTimeMillis();
                }
            }
            if (body.containsKey("smellsBefore")) {
                fs.smellsBefore = ((Number) body.get("smellsBefore")).intValue();
            }
            if (body.containsKey("smellsAfter")) {
                fs.smellsAfter = ((Number) body.get("smellsAfter")).intValue();
            }
            if (body.containsKey("rejectionReason")) {
                fs.rejectionReason = (String) body.get("rejectionReason");
            }
            if (body.containsKey("userId")) {
                fs.userId = (String) body.get("userId");
            }
            if (body.containsKey("userName")) {
                fs.userName = (String) body.get("userName");
            }
            if (body.containsKey("humanVerdict")) {
                fs.humanVerdict = (String) body.get("humanVerdict");
            }
            if (body.containsKey("verifyAccepted")) {
                Object v = body.get("verifyAccepted");
                if (v instanceof Boolean b) {
                    fs.verifyAccepted = b;
                } else if (v != null) {
                    fs.verifyAccepted = Boolean.parseBoolean(v.toString());
                }
            }
            if (body.containsKey("runId")) {
                fs.runId = String.valueOf(body.get("runId"));
            }
            if (body.containsKey("researchSnapshot")) {
                fs.researchSnapshot = String.valueOf(body.get("researchSnapshot"));
            }
            if (body.containsKey("analysisSmellCount")) {
                fs.analysisSmellCount = ((Number) body.get("analysisSmellCount")).intValue();
                fs.analyzedAt = System.currentTimeMillis();
            }
            if (body.containsKey("refactoredArtifactPath")) {
                fs.refactoredArtifactPath = String.valueOf(body.get("refactoredArtifactPath"));
            }
            if (body.containsKey("originalArtifactPath")) {
                fs.originalArtifactPath = String.valueOf(body.get("originalArtifactPath"));
            }
            if (body.containsKey("savedToProjectAt")) {
                fs.savedToProjectAt = ((Number) body.get("savedToProjectAt")).longValue();
            }

            fs.lastUpdatedAt = System.currentTimeMillis();
            map.put(filePath, fs);
            writeAll(workspaceRoot, map);
        } catch (Exception e) {
            logger.error("Failed to patch file status for {}", filePath, e);
        }
    }

    /**
     * Mark file refactored and store paths to {@code .refactai/refactored/} copies.
     */
    public synchronized void markRejectedSaved(Path workspaceRoot, String filePath,
                                               String rejectedArtifactPath, String originalArtifactPath,
                                               int smellsBefore, int smellsAfter, String rejectionReason) {
        try {
            Map<String, FileStatus> map = readAll(workspaceRoot);
            FileStatus fs = map.getOrDefault(filePath, new FileStatus());
            fs.filePath = filePath;
            fs.status = "rejected";
            fs.smellsBefore = smellsBefore;
            fs.smellsAfter = smellsAfter;
            fs.refactoredArtifactPath = rejectedArtifactPath;
            fs.originalArtifactPath = originalArtifactPath;
            fs.verifyAccepted = false;
            if (rejectionReason != null) {
                fs.rejectionReason = rejectionReason;
            }
            fs.lastRefactorAt = System.currentTimeMillis();
            fs.lastUpdatedAt = fs.lastRefactorAt;
            map.put(filePath, fs);
            writeAll(workspaceRoot, map);
        } catch (Exception e) {
            logger.error("Failed to mark rejected saved for {}", filePath, e);
        }
    }

    public synchronized void markRefactoredSaved(Path workspaceRoot, String filePath,
                                                  String refactoredArtifactPath, String originalArtifactPath,
                                                  int smellsBefore, int smellsAfter) {
        try {
            Map<String, FileStatus> map = readAll(workspaceRoot);
            FileStatus fs = map.getOrDefault(filePath, new FileStatus());
            fs.filePath = filePath;
            fs.status = "refactored";
            fs.smellsBefore = smellsBefore;
            fs.smellsAfter = smellsAfter;
            fs.refactoredArtifactPath = refactoredArtifactPath;
            fs.originalArtifactPath = originalArtifactPath;
            fs.savedToProjectAt = System.currentTimeMillis();
            fs.lastRefactorAt = fs.savedToProjectAt;
            fs.lastUpdatedAt = fs.savedToProjectAt;
            map.put(filePath, fs);
            writeAll(workspaceRoot, map);
        } catch (Exception e) {
            logger.error("Failed to mark refactored saved for {}", filePath, e);
        }
    }

    public synchronized void setHumanVerdict(Path workspaceRoot, String filePath, String verdict) {
        try {
            Map<String, FileStatus> map = readAll(workspaceRoot);
            FileStatus fs = map.get(filePath);
            if (fs != null) {
                fs.humanVerdict = verdict;
                fs.lastUpdatedAt = System.currentTimeMillis();
                writeAll(workspaceRoot, map);
            }
        } catch (Exception e) {
            logger.error("Failed to set human verdict for {}", filePath, e);
        }
    }

  /**
   * Ensure every trackable Java path has a status entry (default pending).
   */
    public synchronized void syncTrackableFiles(Path workspaceRoot, java.util.Collection<java.nio.file.Path> sourceFiles,
                                                java.util.Collection<java.nio.file.Path> testFiles) {
        Map<String, FileStatus> map = readAll(workspaceRoot);
        boolean changed = false;
        for (java.nio.file.Path src : sourceFiles) {
            String rel = workspaceRoot.relativize(src).toString().replace('\\', '/');
            if (!map.containsKey(rel)) {
                updateStatus(workspaceRoot, rel, "pending", 0, 0, null);
                changed = true;
            }
        }
        if (testFiles != null) {
            for (java.nio.file.Path test : testFiles) {
                String rel = workspaceRoot.relativize(test).toString().replace('\\', '/');
                if (!map.containsKey(rel)) {
                    updateStatus(workspaceRoot, rel, "pending", 0, 0, null);
                    changed = true;
                }
            }
        }
        if (changed) {
            logger.debug("Synced trackable file-status entries under {}", workspaceRoot);
        }
    }

    public ProjectProgress getProgress(Path workspaceRoot) {
        return getProgress(workspaceRoot, -1, -1, -1, -1);
    }

    public ProjectProgress getProgress(Path workspaceRoot, int trackableTotal, int workspaceFiles,
                                       int javaSourceFiles, int javaTestFiles) {
        Map<String, FileStatus> map = readAll(workspaceRoot);
        ProjectProgress p = new ProjectProgress();
        p.files = new ArrayList<>(map.values());
        p.workspaceFiles = Math.max(0, workspaceFiles);
        p.javaSourceFiles = Math.max(0, javaSourceFiles);
        p.javaTestFiles = Math.max(0, javaTestFiles);
        int trackable = trackableTotal > 0 ? trackableTotal : (p.javaSourceFiles + p.javaTestFiles);
        if (trackable <= 0) {
            trackable = map.size();
        }
        p.totalFiles = trackable;
        for (FileStatus fs : map.values()) {
            if (fs.analyzedAt != null && fs.analyzedAt > 0) {
                p.analyzed++;
            }
            switch (fs.status != null ? fs.status : "pending") {
                case "refactored": p.refactored++; break;
                case "rejected":   p.rejected++;   break;
                case "skipped":    p.skipped++;     break;
                case "error":      p.error++;       break;
                default:           p.pending++;     break;
            }
        }
        if (p.pending + p.refactored + p.rejected + p.skipped + p.error > p.totalFiles && p.totalFiles > 0) {
            p.totalFiles = p.pending + p.refactored + p.rejected + p.skipped + p.error;
        }
        int processed = p.refactored + p.rejected + p.skipped;
        p.progressPercent = p.totalFiles > 0 ? Math.round(processed * 1000.0 / p.totalFiles) / 10.0 : 0;
        return p;
    }
}
