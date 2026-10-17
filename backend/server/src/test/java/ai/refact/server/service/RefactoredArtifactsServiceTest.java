package ai.refact.server.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class RefactoredArtifactsServiceTest {

    @TempDir
    Path workspace;

    private final RefactoredArtifactsService service = new RefactoredArtifactsService();

    @Test
    void saveRefactoredWritesMirrorPathsUnderRefactai() throws Exception {
        String rel = "src/main/java/com/example/Demo.java";
        String original = "class Demo { void a() {} }";
        String refactored = "class Demo { void a() { /* refactored */ } }";

        RefactoredArtifactsService.SavedArtifacts saved =
                service.saveRefactored(workspace, rel, original, refactored);

        assertEquals(RefactoredArtifactsService.REFACTORED_DIR + "/" + rel, saved.refactoredArtifactPath());
        assertEquals(RefactoredArtifactsService.ORIGINALS_DIR + "/" + rel, saved.originalArtifactPath());
        assertTrue(saved.savedAt() > 0);

        Path refFile = workspace.resolve(saved.refactoredArtifactPath());
        Path origFile = workspace.resolve(saved.originalArtifactPath());
        assertTrue(Files.isRegularFile(refFile));
        assertTrue(Files.isRegularFile(origFile));
        assertEquals(refactored, Files.readString(refFile));
        assertEquals(original, Files.readString(origFile));
    }

    @Test
    void saveRejectedAttemptWritesUnderRejectedDir() throws Exception {
        String rel = "src/App.java";
        String original = "class App { int x; }";
        String candidate = "class App { int x; int y; }";

        var saved = service.saveRejectedAttempt(workspace, rel, original, candidate);

        assertEquals(RefactoredArtifactsService.REJECTED_DIR + "/" + rel, saved.refactoredArtifactPath());
        assertEquals(RefactoredArtifactsService.ORIGINALS_DIR + "/" + rel, saved.originalArtifactPath());
        assertEquals(candidate, Files.readString(workspace.resolve(saved.refactoredArtifactPath())));
        assertEquals(original, Files.readString(workspace.resolve(saved.originalArtifactPath())));
    }

    @Test
    void readArtifactByStoredPath() throws Exception {
        String rel = "pkg/Util.java";
        var saved = service.saveRefactored(workspace, rel, "old", "new");
        assertEquals("new", service.readArtifact(workspace, saved.refactoredArtifactPath()));
        assertEquals("old", service.readArtifact(workspace, saved.originalArtifactPath()));
    }

    @Test
    void rejectsPathTraversal() {
        assertThrows(IllegalArgumentException.class, () ->
                service.saveRefactored(workspace, "../escape.java", "a", "b"));
    }

    @Test
    void normalizeStripsLeadingSlashes() {
        assertEquals("src/Foo.java", RefactoredArtifactsService.normalizeRelativePath("/src/Foo.java"));
    }
}
