package ai.refact.server.service;

import ai.refact.engine.model.CodeSmell;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ComprehensiveCodeSmellDetectorTest {

    @TempDir
    Path tempDir;

    @Test
    void detectsPmdViolationInJavaWithEmptyCatch() throws Exception {
        Path src = tempDir.resolve("Bad.java");
        Files.writeString(src, """
                class Bad {
                  void m() {
                    try {
                      int x = 1;
                    } catch (Exception e) {
                    }
                  }
                }
                """.replace("\n", System.lineSeparator()), StandardCharsets.UTF_8);

        ComprehensiveCodeSmellDetector detector = new ComprehensiveCodeSmellDetector();
        List<CodeSmell> smells = detector.detectAllCodeSmells(src, false);
        assertFalse(smells.isEmpty(), "PMD should report at least one issue (e.g. empty catch)");
        boolean hasEmptyCatch = smells.stream()
                .map(CodeSmell::getTitle)
                .anyMatch(t -> t != null && t.toLowerCase().contains("empty"));
        assertTrue(hasEmptyCatch, "Expected EmptyCatchBlock or similar; got: " + smells);
        smells.stream()
                .filter(s -> s.getPmdRuleSetCategory() != null)
                .findFirst()
                .ifPresent(s -> org.junit.jupiter.api.Assertions.assertFalse(
                        s.getPmdRuleSetCategory().isBlank(),
                        "PMD category should be set"));
    }

    @Test
    void returnsEmptyForNonJava() throws Exception {
        Path txt = tempDir.resolve("x.txt");
        Files.writeString(txt, "hello", StandardCharsets.UTF_8);
        ComprehensiveCodeSmellDetector detector = new ComprehensiveCodeSmellDetector();
        assertTrue(detector.detectAllCodeSmells(txt, false).isEmpty());
    }

    @Test
    void cappedLimitsResults() throws Exception {
        Path src = tempDir.resolve("Verbose.java");
        StringBuilder body = new StringBuilder("class Verbose {\n");
        for (int i = 0; i < 80; i++) {
            body.append("  void m").append(i).append("() { try { } catch (Exception e) { } }\n");
        }
        body.append("}\n");
        Files.writeString(src, body.toString(), StandardCharsets.UTF_8);

        ComprehensiveCodeSmellDetector detector = new ComprehensiveCodeSmellDetector();
        List<CodeSmell> all = detector.detectAllCodeSmells(src, false);
        List<CodeSmell> capped = detector.detectAllCodeSmells(src, true);
        assertTrue(all.size() >= capped.size());
        assertTrue(capped.size() <= 60);
    }
}
