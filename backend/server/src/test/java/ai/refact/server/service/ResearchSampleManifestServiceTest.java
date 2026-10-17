package ai.refact.server.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class ResearchSampleManifestServiceTest {

    @TempDir
    Path workspace;

    @Test
    void saveAndLoadRoundTrip() throws Exception {
        ResearchSampleManifestService svc = new ResearchSampleManifestService();
        String json = "{\"version\":1,\"eligibleCount\":534,\"pickedCount\":15}";
        svc.save(workspace, json);
        assertTrue(svc.exists(workspace));
        assertEquals(json, svc.load(workspace).orElseThrow());
        assertTrue(Files.exists(workspace.resolve(".refactai").resolve(ResearchSampleManifestService.MANIFEST_FILE)));
    }

    @Test
    void missingReturnsEmpty() {
        ResearchSampleManifestService svc = new ResearchSampleManifestService();
        assertTrue(svc.load(workspace).isEmpty());
        assertFalse(svc.exists(workspace));
    }

    @Test
    void archiveCurrent_movesManifestToArchiveDir() throws Exception {
        ResearchSampleManifestService svc = new ResearchSampleManifestService();
        String json = "{\"result\":{\"paths\":[\"a/A.java\",\"b/B.java\"],\"picked\":[{\"path\":\"a/A.java\"}]}}";
        svc.save(workspace, json);
        svc.archiveCurrent(workspace);
        assertFalse(svc.exists(workspace));
        Path archiveDir = workspace.resolve(".refactai").resolve(ResearchSampleManifestService.ARCHIVE_DIR);
        assertTrue(Files.isDirectory(archiveDir));
        try (var stream = Files.list(archiveDir)) {
            assertTrue(stream.anyMatch(p -> p.getFileName().toString().endsWith("research-sample-manifest.json")));
        }
    }

    @Test
    void excludedPathsFromArchives_collectsPaths() throws Exception {
        ResearchSampleManifestService svc = new ResearchSampleManifestService();
        String json = "{\"result\":{\"paths\":[\"src/Old.java\"],\"picked\":[{\"path\":\"src/Old.java\"}]}}";
        svc.save(workspace, json);
        svc.archiveCurrent(workspace);
        var excluded = svc.excludedPathsFromArchives(workspace);
        assertTrue(excluded.contains("src/Old.java"));
    }

    @Test
    void excludedPathsForNewPick_includesArchivedAndCurrent() throws Exception {
        ResearchSampleManifestService svc = new ResearchSampleManifestService();
        svc.save(workspace, "{\"result\":{\"paths\":[\"archived/Old.java\"]}}");
        svc.archiveCurrent(workspace);
        svc.save(workspace, "{\"result\":{\"paths\":[\"current/New.java\"]}}");
        var excluded = svc.excludedPathsForNewPick(workspace);
        assertTrue(excluded.contains("archived/Old.java"));
        assertTrue(excluded.contains("current/New.java"));
        assertEquals(2, excluded.size());
    }

    @Test
    void saveWithArchive_archivesThenWritesNew() throws Exception {
        ResearchSampleManifestService svc = new ResearchSampleManifestService();
        svc.save(workspace, "{\"result\":{\"paths\":[\"old/One.java\"]}}");
        svc.saveWithArchive(workspace, "{\"result\":{\"paths\":[\"new/Two.java\"]}}", true);
        assertEquals("{\"result\":{\"paths\":[\"new/Two.java\"]}}", svc.load(workspace).orElseThrow());
        assertTrue(svc.excludedPathsFromArchives(workspace).contains("old/One.java"));
    }
}
