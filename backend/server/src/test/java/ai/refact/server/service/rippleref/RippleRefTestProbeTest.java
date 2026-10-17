package ai.refact.server.service.rippleref;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class RippleRefTestProbeTest {

    @Test
    void isPassRequiresSuccessAndNoFailures() {
        RippleRefTestProbe.TestProbeResult run = new RippleRefTestProbe.TestProbeResult();
        run.status = "success";
        run.testsFailed = 0;
        assertTrue(RippleRefTestProbe.isPass(run));

        run.testsFailed = 1;
        assertFalse(RippleRefTestProbe.isPass(run));
    }

    @Test
    void mergePairedResultDetectsRegression() {
        RippleRefTestProbe.TestProbeResult merged = new RippleRefTestProbe.TestProbeResult();
        RippleRefTestProbe.TestProbeResult before = new RippleRefTestProbe.TestProbeResult();
        before.status = "success";
        before.attempted = true;
        RippleRefTestProbe.TestProbeResult after = new RippleRefTestProbe.TestProbeResult();
        after.status = "failed";
        after.attempted = true;

        RippleRefTestProbe.mergePairedResult(merged, before, after);

        assertTrue(merged.regression);
        assertFalse(merged.behaviorPreserved);
    }

    @Test
    void resolveMavenRootWalksUpFromTargetFile() throws Exception {
        Path sandbox = Files.createTempDirectory("ripple-sandbox");
        Path module = sandbox.resolve("jhotdraw-develop/jhotdraw-core");
        Files.createDirectories(module.resolve("src/main/java/org/example"));
        Files.writeString(module.resolve("pom.xml"), "<project/>");
        Path target = module.resolve("src/main/java/org/example/TextFigure.java");
        Files.writeString(target, "class TextFigure {}");

        Path mavenRoot = RippleRefTestProbe.resolveMavenRoot(
                sandbox, "jhotdraw-develop/jhotdraw-core/src/main/java/org/example/TextFigure.java");
        assertEquals(module.normalize(), mavenRoot.normalize());
        deleteTree(sandbox);
    }

    @Test
    void discoverModuleTestsFindsTestClasses() throws Exception {
        Path sandbox = Files.createTempDirectory("ripple-mod");
        Path module = sandbox.resolve("mod-a");
        Path testDir = module.resolve("src/test/java/com/example");
        Files.createDirectories(testDir);
        Files.writeString(module.resolve("pom.xml"), "<project/>");
        Files.writeString(testDir.resolve("FooTest.java"), "public class FooTest { }");

        RippleRefWorkspaceSandbox ws = new RippleRefWorkspaceSandbox();
        RippleRefTestProbe probe = new RippleRefTestProbe(ws);
        var plan = probe.discoverTests(
                sandbox,
                module,
                "mod-a/src/main/java/com/example/Bar.java",
                "Bar");
        assertEquals("module", plan.strategy);
        assertTrue(plan.runFullModule);
        assertFalse(plan.testClasses.isEmpty());
        deleteTree(sandbox);
    }

    private static void deleteTree(Path root) throws IOException {
        if (!Files.exists(root)) {
            return;
        }
        try (var walk = Files.walk(root)) {
            walk.sorted((a, b) -> b.compareTo(a)).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException ignored) {
                }
            });
        }
    }
}
