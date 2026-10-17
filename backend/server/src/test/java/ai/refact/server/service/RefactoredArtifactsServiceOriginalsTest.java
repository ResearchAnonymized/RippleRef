package ai.refact.server.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class RefactoredArtifactsServiceOriginalsTest {

    @TempDir
    Path tempDir;

    @Test
    void saveRefactored_doesNotOverwriteExistingOriginal() throws Exception {
        RefactoredArtifactsService svc = new RefactoredArtifactsService();
        String rel = "src/A.java";
        svc.saveRefactored(tempDir, rel, "true-original", "refactored-v1");
        svc.saveRefactored(tempDir, rel, "wrong-overwrite", "refactored-v2");

        Path original = tempDir.resolve(".refactai/originals/src/A.java");
        assertEquals("true-original", Files.readString(original));
        assertEquals("refactored-v2", Files.readString(tempDir.resolve(".refactai/refactored/src/A.java")));
    }
}
