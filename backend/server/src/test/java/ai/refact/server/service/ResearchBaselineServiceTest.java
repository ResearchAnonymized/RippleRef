package ai.refact.server.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class ResearchBaselineServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void findOldestBackup_picksEarliestTimestamp() throws Exception {
        Path live = tempDir.resolve("pkg/Foo.java");
        Files.createDirectories(live.getParent());
        Files.writeString(live, "class Foo {}\n");
        Files.writeString(tempDir.resolve("pkg/Foo.java.backup.3000"), "v3\n");
        Files.writeString(tempDir.resolve("pkg/Foo.java.backup.1000"), "v1\n");
        Files.writeString(tempDir.resolve("pkg/Foo.java.backup.2000"), "v2\n");

        ResearchBaselineService service = new ResearchBaselineService(null, null);
        Path oldest = service.findOldestBackup(live).orElseThrow();
        assertEquals("v1\n", Files.readString(oldest));
    }
}
