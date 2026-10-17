package ai.refact.server.service;

import ai.refact.engine.model.CodeSmell;
import ai.refact.engine.model.SmellCategory;
import ai.refact.engine.model.SmellSeverity;
import ai.refact.engine.model.SmellType;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;

/**
 * Durable PMD smell results per workspace file under {@code {workspace}/.refactai/pmd/}.
 * Survives JVM restarts; invalidated when source {@code lastModified} or {@link ComprehensiveCodeSmellDetector#SMELL_ENGINE_VERSION} changes.
 */
@Service
public class PmdAnalysisPersistence {

    private static final Logger logger = LoggerFactory.getLogger(PmdAnalysisPersistence.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class StoredSmell {
        public String type;
        public String category;
        public String pmdRuleSetCategory;
        public String severity;
        public String title;
        public String description;
        public String recommendation;
        public int startLine;
        public int endLine;
        public List<String> refactoringSuggestions;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class StoredFileAnalysis {
        public String relativePath;
        public long fileLastModified;
        public int engineVersion;
        public long analyzedAt;
        public int count;
        public List<StoredSmell> smells;
    }

    public Optional<List<CodeSmell>> load(Path workspaceRoot, String relativePath, long fileLastModified, int engineVersion) {
        try {
            Path file = cacheFile(workspaceRoot, relativePath);
            if (!Files.isRegularFile(file)) {
                return Optional.empty();
            }
            StoredFileAnalysis stored = MAPPER.readValue(file.toFile(), StoredFileAnalysis.class);
            if (stored.engineVersion != engineVersion
                    || stored.fileLastModified != fileLastModified
                    || !relativePath.equals(stored.relativePath)) {
                return Optional.empty();
            }
            return Optional.of(toEngineSmells(stored.smells));
        } catch (Exception e) {
            logger.debug("PMD cache miss for {}: {}", relativePath, e.toString());
            return Optional.empty();
        }
    }

    /**
     * Read persisted smell count without running PMD (for lightweight file listings).
     */
    public Optional<Integer> cachedSmellCount(Path workspaceRoot, String relativePath,
                                              long fileLastModified, int engineVersion) {
        try {
            Path file = cacheFile(workspaceRoot, relativePath);
            if (!Files.isRegularFile(file)) {
                return Optional.empty();
            }
            StoredFileAnalysis stored = MAPPER.readValue(file.toFile(), StoredFileAnalysis.class);
            if (stored.engineVersion != engineVersion
                    || stored.fileLastModified != fileLastModified
                    || !relativePath.equals(stored.relativePath)) {
                return Optional.empty();
            }
            return Optional.of(Math.max(0, stored.count));
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    public void save(Path workspaceRoot, String relativePath, long fileLastModified, int engineVersion, List<CodeSmell> smells) {
        try {
            Path dir = workspaceRoot.resolve(".refactai").resolve("pmd");
            Files.createDirectories(dir);
            StoredFileAnalysis stored = new StoredFileAnalysis();
            stored.relativePath = relativePath;
            stored.fileLastModified = fileLastModified;
            stored.engineVersion = engineVersion;
            stored.analyzedAt = System.currentTimeMillis();
            stored.smells = fromEngineSmells(smells);
            stored.count = stored.smells != null ? stored.smells.size() : 0;
            MAPPER.writerWithDefaultPrettyPrinter().writeValue(cacheFile(workspaceRoot, relativePath).toFile(), stored);
        } catch (IOException e) {
            logger.warn("Failed to persist PMD analysis for {}: {}", relativePath, e.toString());
        }
    }

    public void invalidateWorkspace(Path workspaceRoot) {
        try {
            Path dir = workspaceRoot.resolve(".refactai").resolve("pmd");
            if (Files.isDirectory(dir)) {
                try (var stream = Files.list(dir)) {
                    stream.forEach(p -> {
                        try {
                            Files.deleteIfExists(p);
                        } catch (IOException ignored) {
                        }
                    });
                }
            }
        } catch (IOException e) {
            logger.warn("Failed to invalidate PMD cache: {}", e.toString());
        }
    }

    /** Drop cached PMD results for one workspace-relative path (after baseline restore). */
    public void invalidateFile(Path workspaceRoot, String relativePath) {
        try {
            Files.deleteIfExists(cacheFile(workspaceRoot, relativePath));
        } catch (IOException e) {
            logger.debug("PMD cache invalidate failed for {}: {}", relativePath, e.toString());
        }
    }

    private static Path cacheFile(Path workspaceRoot, String relativePath) throws IOException {
        Path dir = workspaceRoot.resolve(".refactai").resolve("pmd");
        Files.createDirectories(dir);
        return dir.resolve(digest(relativePath) + ".json");
    }

    private static String digest(String relativePath) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(relativePath.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash).substring(0, 32);
        } catch (Exception e) {
            return Integer.toHexString(relativePath.hashCode());
        }
    }

    private static List<StoredSmell> fromEngineSmells(List<CodeSmell> smells) {
        List<StoredSmell> out = new ArrayList<>();
        if (smells == null) {
            return out;
        }
        for (CodeSmell s : smells) {
            StoredSmell st = new StoredSmell();
            st.type = s.getType() != null ? s.getType().name() : null;
            st.category = s.getCategory() != null ? s.getCategory().name() : null;
            st.pmdRuleSetCategory = s.getPmdRuleSetCategory();
            st.severity = s.getSeverity() != null ? s.getSeverity().name() : null;
            st.title = s.getTitle();
            st.description = s.getDescription();
            st.recommendation = s.getRecommendation();
            st.startLine = s.getStartLine();
            st.endLine = s.getEndLine();
            st.refactoringSuggestions = s.getRefactoringSuggestions();
            out.add(st);
        }
        return out;
    }

    private static List<CodeSmell> toEngineSmells(List<StoredSmell> stored) {
        List<CodeSmell> out = new ArrayList<>();
        if (stored == null) {
            return out;
        }
        for (StoredSmell st : stored) {
            SmellType type = parseEnum(SmellType.class, st.type, SmellType.PMD_RULE_VIOLATION);
            SmellCategory category = parseEnum(SmellCategory.class, st.category, SmellCategory.MAINTAINABILITY_ISSUE);
            SmellSeverity severity = parseEnum(SmellSeverity.class, st.severity, SmellSeverity.MINOR);
            out.add(new CodeSmell(
                    type,
                    category,
                    severity,
                    st.title,
                    st.description,
                    st.recommendation,
                    st.startLine,
                    st.endLine,
                    st.refactoringSuggestions != null ? st.refactoringSuggestions : List.of(),
                    st.pmdRuleSetCategory));
        }
        return out;
    }

    private static <E extends Enum<E>> E parseEnum(Class<E> clazz, String name, E fallback) {
        if (name == null || name.isBlank()) {
            return fallback;
        }
        try {
            return Enum.valueOf(clazz, name);
        } catch (IllegalArgumentException e) {
            return fallback;
        }
    }
}
