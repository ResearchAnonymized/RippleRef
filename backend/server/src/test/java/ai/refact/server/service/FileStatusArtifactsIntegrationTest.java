package ai.refact.server.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Confirms file-status.json records artifact paths after refactor save workflow.
 */
class FileStatusArtifactsIntegrationTest {

    @TempDir
    Path workspace;

    @Test
    void markRefactoredSavedPersistsArtifactPaths() {
        FileStatusService fileStatus = new FileStatusService();
        RefactoredArtifactsService artifacts = new RefactoredArtifactsService();

        String rel = "src/App.java";
        try {
            var saved = artifacts.saveRefactored(workspace, rel, "before", "after");
            fileStatus.markRefactoredSaved(
                    workspace, rel,
                    saved.refactoredArtifactPath(),
                    saved.originalArtifactPath(),
                    5, 2);

            FileStatusService.FileStatus fs = fileStatus.readAll(workspace).get(rel);
            assertNotNull(fs);
            assertEquals("refactored", fs.status);
            assertEquals(5, fs.smellsBefore);
            assertEquals(2, fs.smellsAfter);
            assertEquals(saved.refactoredArtifactPath(), fs.refactoredArtifactPath);
            assertEquals(saved.originalArtifactPath(), fs.originalArtifactPath);
            assertNotNull(fs.savedToProjectAt);
        } catch (Exception e) {
            fail(e);
        }
    }

    @Test
    void patchStatusMergesArtifactFieldsWithoutClearingAnalysis() {
        FileStatusService fileStatus = new FileStatusService();
        fileStatus.recordAnalysis(workspace, "src/X.java", 3);

        fileStatus.patchStatus(workspace, "src/X.java", Map.of(
                "status", "refactored",
                "refactoredArtifactPath", ".refactai/refactored/src/X.java",
                "originalArtifactPath", ".refactai/originals/src/X.java",
                "savedToProjectAt", 1_700_000_000_000L,
                "smellsBefore", 3,
                "smellsAfter", 1
        ));

        FileStatusService.FileStatus fs = fileStatus.readAll(workspace).get("src/X.java");
        assertNotNull(fs);
        assertEquals("refactored", fs.status);
        assertNotNull(fs.analyzedAt);
        assertEquals(3, fs.analysisSmellCount);
        assertEquals(".refactai/refactored/src/X.java", fs.refactoredArtifactPath);
    }

    @Test
    void markRejectedSavedPersistsRejectedArtifactPaths() throws Exception {
        FileStatusService fileStatus = new FileStatusService();
        RefactoredArtifactsService artifacts = new RefactoredArtifactsService();

        String rel = "src/Rej.java";
        var saved = artifacts.saveRejectedAttempt(workspace, rel, "before", "candidate");
        fileStatus.markRejectedSaved(
                workspace, rel,
                saved.refactoredArtifactPath(),
                saved.originalArtifactPath(),
                4, 4,
                "too_similar");

        FileStatusService.FileStatus fs = fileStatus.readAll(workspace).get(rel);
        assertNotNull(fs);
        assertEquals("rejected", fs.status);
        assertEquals("too_similar", fs.rejectionReason);
        assertEquals(saved.refactoredArtifactPath(), fs.refactoredArtifactPath);
        assertFalse(Boolean.TRUE.equals(fs.verifyAccepted));
    }

    @Test
    void progressIncludesRefactoredCount() {
        FileStatusService fileStatus = new FileStatusService();
        fileStatus.updateStatus(workspace, "a/A.java", "refactored", 1, 0, null);
        fileStatus.updateStatus(workspace, "b/B.java", "pending", 0, 0, null);
        fileStatus.recordAnalysis(workspace, "c/C.java", 2);

        FileStatusService.ProjectProgress p = fileStatus.getProgress(workspace);
        assertEquals(1, p.refactored);
        assertTrue(p.analyzed >= 1);
        assertFalse(p.files.isEmpty());
    }
}
