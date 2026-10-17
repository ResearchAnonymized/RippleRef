package ai.refact.server.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class SavedRefactoringReportServiceTest {

    @TempDir
    Path workspace;

    @Test
    void saveAndLoadRoundTrip() throws Exception {
        SavedRefactoringReportService svc = new SavedRefactoringReportService();
        String json = "{\"version\":1,\"filePath\":\"src/A.java\",\"workspaceId\":\"w1\"}";
        svc.save(workspace, "src/A.java", json);
        assertTrue(svc.exists(workspace, "src/A.java"));
        assertEquals(json, svc.load(workspace, "src/A.java").orElseThrow());
    }

    @Test
    void missingReturnsEmpty() {
        SavedRefactoringReportService svc = new SavedRefactoringReportService();
        assertTrue(svc.load(workspace, "none.java").isEmpty());
    }

    @Test
    void listAllReturnsSavedReports() throws Exception {
        SavedRefactoringReportService svc = new SavedRefactoringReportService();
        String jsonA = "{\"version\":1,\"filePath\":\"src/A.java\",\"workspaceId\":\"w1\",\"savedAt\":1700000000000}";
        String jsonB = "{\"version\":1,\"filePath\":\"src/B.java\",\"workspaceId\":\"w1\",\"savedAt\":1700000001000}";
        svc.save(workspace, "src/A.java", jsonA);
        svc.save(workspace, "src/B.java", jsonB);
        var list = svc.listAll(workspace);
        assertEquals(2, list.size());
        assertTrue(list.stream().anyMatch(r -> r.filePath().equals("src/A.java")));
        assertTrue(list.stream().anyMatch(r -> r.filePath().equals("src/B.java")));
    }
}
