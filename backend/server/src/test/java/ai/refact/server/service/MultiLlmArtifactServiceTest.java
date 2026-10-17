package ai.refact.server.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class MultiLlmArtifactServiceTest {

    @TempDir
    Path workspace;

    private final MultiLlmArtifactService service = new MultiLlmArtifactService();
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void savePass_writesCandidateMetricsAndMeta() throws Exception {
        Path live = workspace.resolve("src/Foo.java");
        Files.createDirectories(live.getParent());
        Files.writeString(live, "class Foo {}\n");

        MultiLlmArtifactService.SavedPass saved = service.savePass(
                workspace,
                "ws-seed99-123",
                "src/Foo.java",
                "OpenAI",
                "class Foo { int x; }\n",
                Map.of("comparison", Map.of("pmd_smell_total", Map.of("before", 3, "after", 1))),
                List.of(Map.of("name", "Refactor", "status", "done")),
                3,
                1);

        assertTrue(Files.exists(workspace.resolve(saved.candidatePath())));
        assertTrue(Files.exists(workspace.resolve(saved.metricsPath())));
        assertTrue(Files.exists(workspace.resolve(saved.stepsPath())));
        assertTrue(Files.exists(workspace.resolve(saved.metaPath())));

        @SuppressWarnings("unchecked")
        Map<String, Object> meta = mapper.readValue(
                Files.readString(workspace.resolve(saved.metaPath())), Map.class);
        assertEquals("openai", meta.get("providerSlug"));
        assertEquals(3, meta.get("smellsBefore"));
        assertEquals(1, meta.get("smellsAfter"));
        assertEquals(2, meta.get("smellDelta"));
    }

    @Test
    void slugProvider_mapsKnownNames() {
        assertEquals("openai", MultiLlmArtifactService.slugProvider("OpenAI"));
        assertEquals("google", MultiLlmArtifactService.slugProvider("Google Gemini"));
        assertEquals("anthropic", MultiLlmArtifactService.slugProvider("Anthropic Claude"));
    }
}
