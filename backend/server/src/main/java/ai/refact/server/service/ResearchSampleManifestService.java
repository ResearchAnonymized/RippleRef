package ai.refact.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Stream;

/**
 * Persists the research stratified sampling manifest per workspace.
 * File: {workspaceRoot}/.refactai/research-sample-manifest.json
 */
@Service
public class ResearchSampleManifestService {
    private static final Logger logger = LoggerFactory.getLogger(ResearchSampleManifestService.class);
    static final String MANIFEST_FILE = "research-sample-manifest.json";
    static final String ARCHIVE_DIR = "research-samples/archive";

    private final ObjectMapper objectMapper = new ObjectMapper();

    private Path refactaiDir(Path workspaceRoot) throws IOException {
        Path dir = workspaceRoot.resolve(".refactai");
        if (!Files.exists(dir)) {
            Files.createDirectories(dir);
        }
        return dir;
    }

    private Path manifestPath(Path workspaceRoot) throws IOException {
        return refactaiDir(workspaceRoot).resolve(MANIFEST_FILE);
    }

    public synchronized void save(Path workspaceRoot, String jsonBody) throws IOException {
        if (jsonBody == null || jsonBody.isBlank()) {
            throw new IllegalArgumentException("manifest body is required");
        }
        Files.writeString(manifestPath(workspaceRoot), jsonBody, StandardCharsets.UTF_8);
        logger.info("Saved research sample manifest for workspace {}", workspaceRoot);
    }

    /**
     * Optionally archive the current manifest before saving a new sample (Option A new pick).
     */
    public synchronized void saveWithArchive(Path workspaceRoot, String jsonBody, boolean archivePrevious)
            throws IOException {
        if (archivePrevious) {
            archiveCurrent(workspaceRoot);
        }
        save(workspaceRoot, jsonBody);
    }

    public synchronized void archiveCurrent(Path workspaceRoot) throws IOException {
        Path current = manifestPath(workspaceRoot);
        if (!Files.isRegularFile(current)) {
            return;
        }
        Path archiveRoot = refactaiDir(workspaceRoot).resolve(ARCHIVE_DIR);
        Files.createDirectories(archiveRoot);
        String name = System.currentTimeMillis() + "-" + MANIFEST_FILE;
        Path dest = archiveRoot.resolve(name);
        Files.move(current, dest, StandardCopyOption.REPLACE_EXISTING);
        logger.info("Archived research sample manifest → {}", dest);
    }

    public synchronized Optional<String> load(Path workspaceRoot) {
        try {
            Path file = manifestPath(workspaceRoot);
            if (!Files.isRegularFile(file)) {
                return Optional.empty();
            }
            return Optional.of(Files.readString(file, StandardCharsets.UTF_8));
        } catch (Exception e) {
            logger.warn("Failed to read research sample manifest: {}", e.toString());
            return Optional.empty();
        }
    }

    public synchronized boolean exists(Path workspaceRoot) {
        try {
            return Files.isRegularFile(manifestPath(workspaceRoot));
        } catch (IOException e) {
            return false;
        }
    }

    /** Paths from archived manifests only. */
    public synchronized Set<String> excludedPathsFromArchives(Path workspaceRoot) {
        Set<String> paths = new HashSet<>();
        try {
            Path archiveRoot = refactaiDir(workspaceRoot).resolve(ARCHIVE_DIR);
            if (!Files.isDirectory(archiveRoot)) {
                return paths;
            }
            try (Stream<Path> stream = Files.list(archiveRoot)) {
                stream.filter(p -> Files.isRegularFile(p) && p.getFileName().toString().endsWith(".json"))
                        .forEach(p -> collectPathsFromManifest(p, paths));
            }
        } catch (Exception e) {
            logger.warn("Failed to list archived research manifests: {}", e.toString());
        }
        return paths;
    }

    /**
     * All paths to skip when picking a NEW research sample: archived manifests plus the
     * currently active manifest (not yet archived).
     */
    public synchronized Set<String> excludedPathsForNewPick(Path workspaceRoot) {
        Set<String> paths = excludedPathsFromArchives(workspaceRoot);
        load(workspaceRoot).ifPresent(json -> {
            try {
                JsonNode root = objectMapper.readTree(json);
                appendPaths(root.path("result").path("paths"), paths);
                JsonNode picked = root.path("result").path("picked");
                if (picked.isArray()) {
                    for (JsonNode node : picked) {
                        if (node.has("path")) {
                            paths.add(node.get("path").asText());
                        }
                    }
                }
            } catch (Exception e) {
                logger.warn("Failed to parse current research manifest for exclusions: {}", e.toString());
            }
        });
        return paths;
    }

    private void collectPathsFromManifest(Path manifestFile, Set<String> paths) {
        try {
            JsonNode root = objectMapper.readTree(Files.readString(manifestFile, StandardCharsets.UTF_8));
            appendPaths(root.path("result").path("paths"), paths);
            appendPaths(root.path("paths"), paths);
            JsonNode picked = root.path("result").path("picked");
            if (picked.isArray()) {
                for (JsonNode node : picked) {
                    if (node.has("path")) {
                        paths.add(node.get("path").asText());
                    }
                }
            }
        } catch (Exception e) {
            logger.warn("Failed to parse archived manifest {}: {}", manifestFile, e.toString());
        }
    }

    private void appendPaths(JsonNode arr, Set<String> paths) {
        if (arr != null && arr.isArray()) {
            for (JsonNode node : arr) {
                paths.add(node.asText());
            }
        }
    }
}
