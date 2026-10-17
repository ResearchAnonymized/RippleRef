package ai.refact.server.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Persists independent multi-LLM research candidates under
 * {@code .refactai/multi-llm/{sampleId}/{filePath}/{provider}/}.
 */
@Service
public class MultiLlmArtifactService {

    private static final Logger logger = LoggerFactory.getLogger(MultiLlmArtifactService.class);
    public static final String MULTI_LLM_DIR = ".refactai/multi-llm";

    private final ObjectMapper objectMapper = new ObjectMapper();

    public record SavedPass(
            String candidatePath,
            String metricsPath,
            String stepsPath,
            String metaPath,
            long savedAt
    ) {}

    public SavedPass savePass(
            Path workspaceRoot,
            String sampleId,
            String filePath,
            String provider,
            String candidateContent,
            Object researchMetrics,
            Object agentSteps,
            int smellsBefore,
            int smellsAfter) throws IOException {
        if (sampleId == null || sampleId.isBlank()) {
            throw new IllegalArgumentException("sampleId is required");
        }
        String rel = RefactoredArtifactsService.normalizeRelativePath(filePath);
        String providerSlug = slugProvider(provider);
        Path base = workspaceRoot.resolve(MULTI_LLM_DIR)
                .resolve(sanitizeSampleId(sampleId))
                .resolve(rel)
                .resolve(providerSlug)
                .normalize();
        if (!base.startsWith(workspaceRoot.resolve(MULTI_LLM_DIR).normalize())) {
            throw new IllegalArgumentException("Invalid artifact path");
        }
        Files.createDirectories(base);

        Path candidateFile = base.resolve("candidate.java");
        Path metricsFile = base.resolve("research-metrics.json");
        Path stepsFile = base.resolve("agent-steps.json");
        Path metaFile = base.resolve("meta.json");

        Files.writeString(candidateFile, candidateContent != null ? candidateContent : "", StandardCharsets.UTF_8);
        writeJson(metricsFile, researchMetrics != null ? researchMetrics : Map.of());
        writeJson(stepsFile, agentSteps != null ? agentSteps : List.of());
        Map<String, Object> meta = new HashMap<>();
        meta.put("sampleId", sampleId);
        meta.put("filePath", rel);
        meta.put("provider", provider);
        meta.put("providerSlug", providerSlug);
        meta.put("smellsBefore", smellsBefore);
        meta.put("smellsAfter", smellsAfter);
        meta.put("smellDelta", smellsBefore - smellsAfter);
        meta.put("savedAt", System.currentTimeMillis());
        writeJson(metaFile, meta);

        String prefix = MULTI_LLM_DIR + "/" + sanitizeSampleId(sampleId) + "/" + rel + "/" + providerSlug;
        long savedAt = System.currentTimeMillis();
        logger.info("Saved multi-LLM artifact {} → {}", rel, prefix);
        return new SavedPass(
                prefix + "/candidate.java",
                prefix + "/research-metrics.json",
                prefix + "/agent-steps.json",
                prefix + "/meta.json",
                savedAt);
    }

    private void writeJson(Path file, Object value) throws IOException {
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(file.toFile(), value);
    }

    static String slugProvider(String provider) {
        if (provider == null || provider.isBlank()) {
            return "unknown";
        }
        String p = provider.trim().toLowerCase();
        if (p.contains("openai")) return "openai";
        if (p.contains("google") || p.contains("gemini")) return "google";
        if (p.contains("anthropic") || p.contains("claude")) return "anthropic";
        return p.replaceAll("[^a-z0-9]+", "-");
    }

    static String sanitizeSampleId(String sampleId) {
        return sampleId.replaceAll("[^a-zA-Z0-9._-]", "_");
    }
}
