package ai.refact.server.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class UserResearchArchiveServiceTest {

    @TempDir
    Path tempHome;

    private UserResearchArchiveService svcWithHome(Path home) {
        return new UserResearchArchiveService(home.resolve("users"));
    }

    @Test
    void saveListDownloadDeleteRoundTrip() throws Exception {
        UserResearchArchiveService svc = svcWithHome(tempHome);
        String userId = "user-test";
        byte[] xlsx = new byte[] { 0x50, 0x4b, 0x03, 0x04 };
        byte[] index = "{\"rows\":[]}".getBytes();
        var saved = svc.save(userId, xlsx, index, Map.of(
                "filename", "all-projects.xlsx",
                "fileCount", 10,
                "exportedCount", 9,
                "skippedCount", 1,
                "exportKind", "cross_project",
                "sourceProjectLabels", List.of("JUnit", "Mockito")
        ));
        assertNotNull(saved.exportId());
        assertEquals(10, saved.fileCount());

        var list = svc.listAll(userId);
        assertEquals(1, list.size());
        assertEquals("cross_project", list.get(0).exportKind());

        assertArrayEquals(xlsx, svc.loadXlsx(userId, saved.exportId()).orElseThrow());
        assertArrayEquals(index, svc.loadIndex(userId, saved.exportId()).orElseThrow());

        assertTrue(svc.delete(userId, saved.exportId()));
        assertTrue(svc.listAll(userId).isEmpty());
        assertTrue(svc.loadXlsx(userId, saved.exportId()).isEmpty());
    }
}
