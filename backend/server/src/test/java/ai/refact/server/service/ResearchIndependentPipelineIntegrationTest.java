package ai.refact.server.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * End-to-end disk workflow for independent multi-LLM research (no HTTP):
 * baseline snapshot → artifact save → archive manifest → excluded paths.
 */
class ResearchIndependentPipelineIntegrationTest {

    @TempDir
    Path workspace;

    @Test
    void baselineSnapshot_multiLlmArtifact_andArchiveRoundTrip() throws Exception {
        String rel = "src/Demo.java";
        Path live = workspace.resolve(rel);
        Files.createDirectories(live.getParent());
        Files.writeString(live, "class Demo { void m() {} }\n");

        PersistedCodeSmellAnalysisService pmd = mock(PersistedCodeSmellAnalysisService.class);
        when(pmd.count(any(), any())).thenReturn(6);
        PmdAnalysisPersistence cache = mock(PmdAnalysisPersistence.class);
        ResearchBaselineService baselineService = new ResearchBaselineService(pmd, cache);
        MultiLlmArtifactService artifactService = new MultiLlmArtifactService();
        ResearchSampleManifestService manifestService = new ResearchSampleManifestService();

        String sampleId = "ws-seed777-" + System.currentTimeMillis();

        ResearchBaselineService.BaselineSnapshot snap =
                baselineService.snapshotForSample(workspace, sampleId, rel);
        assertTrue(snap.created());
        assertEquals(6, snap.smellCount());
        assertEquals(
                Files.readString(live),
                baselineService.readBaselineContent(workspace, sampleId, rel).orElseThrow());

        MultiLlmArtifactService.SavedPass openai = artifactService.savePass(
                workspace, sampleId, rel, "OpenAI",
                "class Demo { void m() { clean(); } }\n",
                java.util.Map.of("comparison", java.util.Map.of("pmd_smell_total", java.util.Map.of("before", 6, "after", 4))),
                java.util.List.of(java.util.Map.of("name", "Refactor", "status", "done")),
                6, 4);
        assertTrue(Files.exists(workspace.resolve(openai.candidatePath())));

        String oldManifest = "{\"result\":{\"paths\":[\"" + rel + "\"],\"picked\":[{\"path\":\"" + rel + "\"}]}}";
        manifestService.save(workspace, oldManifest);
        manifestService.saveWithArchive(
                workspace,
                "{\"result\":{\"paths\":[\"src/Other.java\"],\"picked\":[{\"path\":\"src/Other.java\"}]}}",
                true);

        assertTrue(manifestService.excludedPathsFromArchives(workspace).contains(rel));
        assertTrue(manifestService.load(workspace).orElse("").contains("src/Other.java"));
    }
}
