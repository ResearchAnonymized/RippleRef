package ai.refact.server.service;

import ai.refact.api.Assessment;
import ai.refact.api.Plan;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

/**
 * Persists project assessment and refactoring plan under {@code {workspace}/.refactai/}.
 */
@Service
public class WorkspaceAssessmentPersistence {

    private static final Logger logger = LoggerFactory.getLogger(WorkspaceAssessmentPersistence.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public void saveAssessment(Path workspaceRoot, Assessment assessment) {
        if (workspaceRoot == null || assessment == null) {
            return;
        }
        try {
            Path file = ensureDir(workspaceRoot).resolve("assessment.json");
            MAPPER.writerWithDefaultPrettyPrinter().writeValue(file.toFile(), assessment);
        } catch (IOException e) {
            logger.warn("Failed to persist assessment: {}", e.toString());
        }
    }

    public Optional<Assessment> loadAssessment(Path workspaceRoot) {
        return read(workspaceRoot, "assessment.json", Assessment.class);
    }

    public void savePlan(Path workspaceRoot, Plan plan) {
        if (workspaceRoot == null || plan == null) {
            return;
        }
        try {
            Path file = ensureDir(workspaceRoot).resolve("plan.json");
            MAPPER.writerWithDefaultPrettyPrinter().writeValue(file.toFile(), plan);
        } catch (IOException e) {
            logger.warn("Failed to persist plan: {}", e.toString());
        }
    }

    public Optional<Plan> loadPlan(Path workspaceRoot) {
        return read(workspaceRoot, "plan.json", Plan.class);
    }

    private static Path ensureDir(Path workspaceRoot) throws IOException {
        Path dir = workspaceRoot.resolve(".refactai");
        if (!Files.exists(dir)) {
            Files.createDirectories(dir);
        }
        return dir;
    }

    private <T> Optional<T> read(Path workspaceRoot, String name, Class<T> type) {
        try {
            Path file = workspaceRoot.resolve(".refactai").resolve(name);
            if (!Files.isRegularFile(file)) {
                return Optional.empty();
            }
            return Optional.of(MAPPER.readValue(file.toFile(), type));
        } catch (Exception e) {
            logger.debug("Could not load {}: {}", name, e.toString());
            return Optional.empty();
        }
    }
}
