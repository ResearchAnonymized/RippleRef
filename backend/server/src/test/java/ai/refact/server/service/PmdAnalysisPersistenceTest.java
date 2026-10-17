package ai.refact.server.service;

import ai.refact.engine.model.CodeSmell;
import ai.refact.engine.model.SmellCategory;
import ai.refact.engine.model.SmellSeverity;
import ai.refact.engine.model.SmellType;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PmdAnalysisPersistenceTest {

    @TempDir
    Path workspace;

    @Test
    void saveAndLoadRoundTrip() {
        PmdAnalysisPersistence store = new PmdAnalysisPersistence();
        String rel = "src/main/Foo.java";
        long lm = 1_700_000_000_000L;
        int ver = ComprehensiveCodeSmellDetector.SMELL_ENGINE_VERSION;

        CodeSmell smell = new CodeSmell(
                SmellType.PMD_RULE_VIOLATION,
                SmellCategory.MAINTAINABILITY_ISSUE,
                SmellSeverity.MAJOR,
                "EmptyCatchBlock",
                "[EmptyCatchBlock] empty",
                "Fix it",
                10,
                10,
                List.of("Fix it"));

        store.save(workspace, rel, lm, ver, List.of(smell));
        var loaded = store.load(workspace, rel, lm, ver);
        assertTrue(loaded.isPresent());
        assertEquals(1, loaded.get().size());
        assertEquals("EmptyCatchBlock", loaded.get().get(0).getTitle());
    }

    @Test
    void invalidatesOnFileChange() {
        PmdAnalysisPersistence store = new PmdAnalysisPersistence();
        String rel = "Bar.java";
        store.save(workspace, rel, 100L, 4, List.of());
        assertTrue(store.load(workspace, rel, 101L, 4).isEmpty());
    }
}
