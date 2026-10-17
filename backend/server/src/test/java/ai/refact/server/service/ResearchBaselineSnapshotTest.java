package ai.refact.server.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ResearchBaselineSnapshotTest {

    @TempDir
    Path workspace;

    @Test
    void snapshotForSample_copiesLiveFileOnce() throws Exception {
        Path live = workspace.resolve("pkg/Bar.java");
        Files.createDirectories(live.getParent());
        Files.writeString(live, "class Bar { void m() {} }\n");

        PersistedCodeSmellAnalysisService pmd = mock(PersistedCodeSmellAnalysisService.class);
        when(pmd.count(any(), any())).thenReturn(4);
        PmdAnalysisPersistence cache = mock(PmdAnalysisPersistence.class);
        ResearchBaselineService service = new ResearchBaselineService(pmd, cache);

        ResearchBaselineService.BaselineSnapshot first =
                service.snapshotForSample(workspace, "sample-a", "pkg/Bar.java");
        assertTrue(first.created());
        assertEquals(4, first.smellCount());
        assertTrue(Files.exists(workspace.resolve(first.baselinePath())));

        Files.writeString(live, "class Bar { void m() { x(); } }\n");
        ResearchBaselineService.BaselineSnapshot second =
                service.snapshotForSample(workspace, "sample-a", "pkg/Bar.java");
        assertFalse(second.created());
        assertEquals("class Bar { void m() {} }\n",
                Files.readString(workspace.resolve(first.baselinePath())));
    }

    @Test
    void readBaselineContent_returnsSnapshot() throws Exception {
        Path live = workspace.resolve("X.java");
        Files.writeString(live, "class X {}\n");

        PersistedCodeSmellAnalysisService pmd = mock(PersistedCodeSmellAnalysisService.class);
        when(pmd.count(any(), any())).thenReturn(1);
        PmdAnalysisPersistence cache = mock(PmdAnalysisPersistence.class);
        ResearchBaselineService service = new ResearchBaselineService(pmd, cache);

        service.snapshotForSample(workspace, "sid-1", "X.java");
        assertEquals("class X {}\n", service.readBaselineContent(workspace, "sid-1", "X.java").orElseThrow());
    }
}
