package ai.refact.server.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class ProjectExcelExportServiceTest {

    @TempDir
    Path workspace;

    @Test
    void saveListAndLoadRoundTrip() throws Exception {
        ProjectExcelExportService svc = new ProjectExcelExportService();
        byte[] xlsx = new byte[] { 0x50, 0x4b, 0x03, 0x04 };
        var index = svc.save(workspace, xlsx, Map.of(
                "filename", "refactai-demo.xlsx",
                "savedAt", 1_700_000_000_000L,
                "fileCount", 3,
                "exportedCount", 2,
                "skippedCount", 1,
                "projectLabel", "demo",
                "filePaths", List.of("src/A.java", "src/B.java")
        ));
        assertNotNull(index.exportId());
        assertEquals("refactai-demo.xlsx", index.filename());
        assertEquals(3, index.fileCount());

        var list = svc.listAll(workspace);
        assertEquals(1, list.size());
        assertEquals(index.exportId(), list.get(0).exportId());

        byte[] loaded = svc.loadXlsx(workspace, index.exportId()).orElseThrow();
        assertArrayEquals(xlsx, loaded);
        assertTrue(Files.exists(workspace.resolve(ProjectExcelExportService.EXPORTS_DIR)
                .resolve(index.exportId() + ".xlsx")));
    }

    @Test
    void missingExportReturnsEmpty() {
        ProjectExcelExportService svc = new ProjectExcelExportService();
        assertTrue(svc.loadXlsx(workspace, "missing").isEmpty());
        assertTrue(svc.listAll(workspace).isEmpty());
    }

    @Test
    void replaceAllClearsOnlyExcelExports_notSavedReports() throws Exception {
        ProjectExcelExportService svc = new ProjectExcelExportService();
        Path savedReports = workspace.resolve(".refactai/saved-reports");
        Files.createDirectories(savedReports);
        Path report = savedReports.resolve("sample.json");
        Files.writeString(report, "{\"version\":1,\"filePath\":\"A.java\"}");

        byte[] first = new byte[] { 1, 2, 3 };
        svc.save(workspace, first, Map.of("filename", "first.xlsx", "fileCount", 1));
        assertEquals(1, svc.listAll(workspace).size());

        byte[] second = new byte[] { 4, 5, 6, 7 };
        var replaced = svc.replaceAll(workspace, second, Map.of(
                "filename", "latest.xlsx",
                "fileCount", 2,
                "exportedCount", 2,
                "skippedCount", 0,
                "projectLabel", "demo"
        ));
        assertEquals("latest", replaced.exportId());
        assertEquals(1, svc.listAll(workspace).size());
        assertArrayEquals(second, svc.loadXlsx(workspace, "latest").orElseThrow());
        assertTrue(Files.exists(report), "saved-reports must not be deleted by replaceAll");
        assertEquals("{\"version\":1,\"filePath\":\"A.java\"}", Files.readString(report));
    }
}
