package ai.refact.server.service;

import ai.refact.api.BuildSystemType;
import ai.refact.api.ProjectContext;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PmdWorkspaceBootstrapServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void scanWorkspace_persistsCountsForJavaSources() throws Exception {
        Path root = tempDir.resolve("proj");
        Path src = root.resolve("src/Main.java");
        Files.createDirectories(src.getParent());
        Files.writeString(src, "public class Main { void m() { int x = 1; } }\n");

        ProjectContext ctx = new ProjectContext(
                root,
                Set.of(src),
                Set.of(),
                Map.of("projectId", "proj-1"),
                BuildSystemType.MAVEN
        );

        ProjectService projectService = mock(ProjectService.class);
        when(projectService.getProject("proj-1")).thenReturn(ctx);

        PersistedCodeSmellAnalysisService persisted = mock(PersistedCodeSmellAnalysisService.class);
        when(persisted.count(eq(root), eq(src))).thenReturn(3);

        PmdWorkspaceBootstrapService service =
                new PmdWorkspaceBootstrapService(projectService, persisted);

        PmdWorkspaceBootstrapService.PmdScanResult result = service.scanWorkspace("proj-1", null, null);

        assertEquals(1, result.totalJavaSourceFiles());
        assertEquals(1, result.filesScanned());
        assertEquals(3, result.totalSmells());
        assertFalse(result.truncated());
        verify(persisted, times(1)).count(root, src);
    }

    @Test
    void scanWorkspace_truncatesWhenOverMax() throws Exception {
        Path root = tempDir.resolve("big");
        Files.createDirectories(root);
        Set<Path> sources = new java.util.HashSet<>();
        for (int i = 0; i < 5; i++) {
            Path f = root.resolve("src/F" + i + ".java");
            Files.createDirectories(f.getParent());
            Files.writeString(f, "public class F" + i + " {}\n");
            sources.add(f);
        }

        ProjectContext ctx = new ProjectContext(
                root,
                sources,
                Set.of(),
                Map.of("projectId", "big"),
                BuildSystemType.MAVEN
        );

        ProjectService projectService = mock(ProjectService.class);
        when(projectService.getProject("big")).thenReturn(ctx);
        PersistedCodeSmellAnalysisService persisted = mock(PersistedCodeSmellAnalysisService.class);
        when(persisted.count(any(), any())).thenReturn(1);

        PmdWorkspaceBootstrapService service =
                new PmdWorkspaceBootstrapService(projectService, persisted);

        PmdWorkspaceBootstrapService.PmdScanResult result = service.scanWorkspace("big", null, 2);

        assertEquals(5, result.totalJavaSourceFiles());
        assertEquals(2, result.filesScanned());
        assertTrue(result.truncated());
    }

    @Test
    void scanWorkspace_continuesWhenFileScanThrowsStackOverflow() throws Exception {
        Path root = tempDir.resolve("guava-like");
        Files.createDirectories(root);
        Path ok = root.resolve("src/Ok.java");
        Path bad = root.resolve("src/Bad.java");
        Files.createDirectories(ok.getParent());
        Files.writeString(ok, "public class Ok {}\n");
        Files.writeString(bad, "public class Bad {}\n");

        ProjectContext ctx = new ProjectContext(
                root,
                Set.of(ok, bad),
                Set.of(),
                Map.of("projectId", "guava-like"),
                BuildSystemType.MAVEN
        );

        ProjectService projectService = mock(ProjectService.class);
        when(projectService.getProject("guava-like")).thenReturn(ctx);
        PersistedCodeSmellAnalysisService persisted = mock(PersistedCodeSmellAnalysisService.class);
        when(persisted.count(eq(root), eq(ok))).thenReturn(2);
        doThrow(new StackOverflowError("pmd generics")).when(persisted).count(eq(root), eq(bad));

        PmdWorkspaceBootstrapService service =
                new PmdWorkspaceBootstrapService(projectService, persisted);

        PmdWorkspaceBootstrapService.PmdScanResult result = service.scanWorkspace("guava-like", null, null);

        assertEquals(2, result.totalJavaSourceFiles());
        assertEquals(1, result.filesScanned());
        assertEquals(2, result.totalSmells());
    }

    @Test
    void scanWorkspace_findsAllJavaOnDiskNotOnlyMavenSourceSet() throws Exception {
        Path root = tempDir.resolve("checkstyle-like");
        Path mavenOnly = root.resolve("src/main/java/OnlyMaven.java");
        Path extra = root.resolve("src/checkstyle/checks/Extra.java");
        Files.createDirectories(mavenOnly.getParent());
        Files.createDirectories(extra.getParent());
        Files.writeString(mavenOnly, "public class OnlyMaven {}\n");
        Files.writeString(extra, "public class Extra {}\n");

        ProjectContext ctx = new ProjectContext(
                root,
                Set.of(mavenOnly),
                Set.of(),
                Map.of("projectId", "cs"),
                BuildSystemType.MAVEN
        );

        ProjectService projectService = mock(ProjectService.class);
        when(projectService.getProject("cs")).thenReturn(ctx);
        PersistedCodeSmellAnalysisService persisted = mock(PersistedCodeSmellAnalysisService.class);
        when(persisted.count(any(), any())).thenReturn(0);

        PmdWorkspaceBootstrapService service =
                new PmdWorkspaceBootstrapService(projectService, persisted);

        PmdWorkspaceBootstrapService.PmdScanResult result = service.scanWorkspace("cs", null, null);

        assertEquals(2, result.totalJavaSourceFiles());
        assertEquals(2, result.filesScanned());
        verify(persisted, times(1)).count(root, mavenOnly);
        verify(persisted, times(1)).count(root, extra);
    }

    @Test
    void scanWorkspace_honorsOffsetAndMaxFiles() throws Exception {
        Path root = tempDir.resolve("offset");
        Files.createDirectories(root);
        List<Path> files = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            Path f = root.resolve("src/F" + i + ".java");
            Files.createDirectories(f.getParent());
            Files.writeString(f, "public class F" + i + " {}\n");
            files.add(f);
        }

        ProjectContext ctx = new ProjectContext(
                root,
                Set.copyOf(files),
                Set.of(),
                Map.of("projectId", "offset"),
                BuildSystemType.MAVEN
        );

        ProjectService projectService = mock(ProjectService.class);
        when(projectService.getProject("offset")).thenReturn(ctx);
        PersistedCodeSmellAnalysisService persisted = mock(PersistedCodeSmellAnalysisService.class);
        when(persisted.count(any(), any())).thenReturn(1);

        PmdWorkspaceBootstrapService service =
                new PmdWorkspaceBootstrapService(projectService, persisted);

        PmdWorkspaceBootstrapService.PmdScanResult result = service.scanWorkspace("offset", 2, 2);

        assertEquals(5, result.totalJavaSourceFiles());
        assertEquals(2, result.filesScanned());
        assertTrue(result.truncated());
        verify(persisted, times(1)).count(root, files.get(2));
        verify(persisted, times(1)).count(root, files.get(3));
    }

    private static void assertTrue(boolean truncated) {
        org.junit.jupiter.api.Assertions.assertTrue(truncated);
    }
}
