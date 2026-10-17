package ai.refact.server.service.rippleref;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class RippleRefCallerImpactAnalyzerTest {

    private final RippleRefJavaProfileExtractor extractor = new RippleRefJavaProfileExtractor();
    private final RippleRefCallerImpactAnalyzer analyzer = new RippleRefCallerImpactAnalyzer();

    @TempDir
    Path sandbox;

    @Test
    void detectsBrokenCallerWhenApiRemovedButCallRemains() throws Exception {
        String targetPath = "src/main/java/com/example/Service.java";
        String callerPath = "src/main/java/com/example/Client.java";

        RippleRefModels.JavaFileProfile before = new RippleRefModels.JavaFileProfile();
        before.filePath = targetPath;
        before.packageName = "com.example";
        before.declaredClasses = List.of("Service");
        before.publicApis = List.of("public void execute()");
        before.callerFiles = List.of(callerPath);
        before.callerUsedApis = List.of("public void execute()");

        RippleRefModels.JavaFileProfile after = new RippleRefModels.JavaFileProfile();
        after.filePath = targetPath;
        after.packageName = "com.example";
        after.declaredClasses = List.of("Service");
        after.publicApis = List.of("public void run()");

        Path target = sandbox.resolve(targetPath);
        Files.createDirectories(target.getParent());
        Files.writeString(target, """
            package com.example;
            public class Service { public void run() {} }
            """);

        Path caller = sandbox.resolve(callerPath);
        Files.createDirectories(caller.getParent());
        Files.writeString(caller, """
            package com.example;
            public class Client {
              void go() { new Service().execute(); }
            }
            """);

        RippleRefCallerImpactAnalyzer.CallerImpactResult result =
                analyzer.analyze(before, after, sandbox, extractor);

        assertEquals(1, result.observedBrokenCallerCount);
        assertTrue(result.observedBrokenCallers.contains(callerPath));
    }

    @Test
    void noBreakageWhenCallerUpdatedToNewApi() throws Exception {
        String targetPath = "src/main/java/com/example/Service.java";
        String callerPath = "src/main/java/com/example/Client.java";

        RippleRefModels.JavaFileProfile before = new RippleRefModels.JavaFileProfile();
        before.filePath = targetPath;
        before.declaredClasses = List.of("Service");
        before.publicApis = List.of("public void execute()");
        before.callerFiles = List.of(callerPath);
        before.callerUsedApis = List.of("public void execute()");

        RippleRefModels.JavaFileProfile after = new RippleRefModels.JavaFileProfile();
        after.declaredClasses = List.of("Service");
        after.publicApis = List.of("public void run()");

        Path caller = sandbox.resolve(callerPath);
        Files.createDirectories(caller.getParent());
        Files.writeString(caller, """
            package com.example;
            public class Client {
              void go() { new Service().run(); }
            }
            """);

        RippleRefCallerImpactAnalyzer.CallerImpactResult result =
                analyzer.analyze(before, after, sandbox, extractor);

        assertEquals(0, result.observedBrokenCallerCount);
    }

    @Test
    void readsCallerFileWithNonUtf8Encoding() throws Exception {
        String targetPath = "src/main/java/com/example/Service.java";
        String callerPath = "src/main/java/com/example/Client.java";

        RippleRefModels.JavaFileProfile before = new RippleRefModels.JavaFileProfile();
        before.filePath = targetPath;
        before.declaredClasses = List.of("Service");
        before.publicApis = List.of("public void execute()");
        before.callerFiles = List.of(callerPath);
        before.callerUsedApis = List.of("public void execute()");

        RippleRefModels.JavaFileProfile after = new RippleRefModels.JavaFileProfile();
        after.declaredClasses = List.of("Service");
        after.publicApis = List.of("public void run()");

        Path caller = sandbox.resolve(callerPath);
        Files.createDirectories(caller.getParent());
        // Latin-1 bytes that are invalid UTF-8 (0xE9 = é in ISO-8859-1)
        byte[] latin1 = ("package com.example;\npublic class Client {\n"
                + "  void go() { new Service().execute(); }\n"
                + "  String s = \"caf\u00E9\";\n"
                + "}\n").getBytes(java.nio.charset.StandardCharsets.ISO_8859_1);
        Files.write(caller, latin1);

        RippleRefCallerImpactAnalyzer.CallerImpactResult result =
                analyzer.analyze(before, after, sandbox, extractor);

        assertEquals(1, result.observedBrokenCallerCount);
        assertEquals(1, result.callersChecked);
    }

    @Test
    void strictCallerMatchingIgnoresUnrelatedClassWithSameMethodName() {
        String caller = """
            package other;
            public class Other {
              void m() { Watchman.failed(); }
            }
            """;
        assertFalse(extractor.isCallerUsingApi(caller, "TestWatchman", "failed"));
        assertTrue(extractor.isCallerUsingApi("x.TestWatchman.failed();", "TestWatchman", "failed"));
    }
}
