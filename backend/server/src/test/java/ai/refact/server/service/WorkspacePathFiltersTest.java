package ai.refact.server.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertEquals;

class WorkspacePathFiltersTest {

    @Test
    void excludesRefactaiToolingPaths() {
        assertTrue(WorkspacePathFilters.isExcludedFromFileListing(".refactai/pmd/abc.json"));
        assertTrue(WorkspacePathFilters.isExcludedFromFileListing(".refactai/refactored/src/Foo.java"));
        assertTrue(WorkspacePathFilters.isExcludedFromFileListing(".refactai/file-status.json"));
    }

    @Test
    void includesNormalProjectSources() {
        assertFalse(WorkspacePathFilters.isExcludedFromFileListing("src/main/java/App.java"));
        assertFalse(WorkspacePathFilters.isExcludedFromFileListing("pom.xml"));
    }

    @Test
    void excludesBuildAndVcsPaths() {
        assertTrue(WorkspacePathFilters.isExcludedFromFileListing("target/classes/Foo.class"));
        assertTrue(WorkspacePathFilters.isExcludedFromFileListing("module/target/Foo.java"));
        assertTrue(WorkspacePathFilters.isExcludedFromFileListing(".git/config"));
    }

    @TempDir
    Path tempDir;

    @Test
    void resolveReadableSourcePath_fallsBackToOriginals() throws Exception {
        String rel = "src/Foo.java";
        Path artifact = tempDir.resolve(".refactai/originals/src/Foo.java");
        Files.createDirectories(artifact.getParent());
        Files.writeString(artifact, "class Foo {}\n");

        var resolved = WorkspacePathFilters.resolveReadableSourcePath(tempDir, rel);
        assertTrue(resolved.isPresent());
        assertEquals(artifact.normalize(), resolved.get().normalize());
    }
}
