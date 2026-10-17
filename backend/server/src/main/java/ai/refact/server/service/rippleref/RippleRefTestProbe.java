package ai.refact.server.service.rippleref;

import ai.refact.server.service.WorkspacePathFilters;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Level-5 paired test probe: targeted tests referencing the class, else module-scoped tests.
 */
@Component
public class RippleRefTestProbe {

    private static final Logger logger = LoggerFactory.getLogger(RippleRefTestProbe.class);
    private static final long DEFAULT_TIMEOUT_SEC = Long.getLong("ripple.ref.test.timeout.sec", 900L);
    private static final Pattern CLASS_DECL = Pattern.compile("(?:public\\s+)?class\\s+(\\w+)");

    private final RippleRefWorkspaceSandbox workspaceSandbox;

    public RippleRefTestProbe(RippleRefWorkspaceSandbox workspaceSandbox) {
        this.workspaceSandbox = workspaceSandbox;
    }

    public static class TestProbeResult {
        public String status;
        public boolean attempted;
        public List<String> targetedTestClasses = new ArrayList<>();
        public int testsDiscovered;
        public int testsRun;
        public int testsPassed;
        public int testsFailed;
        public long durationMs;
        public List<String> errorSnippet = new ArrayList<>();
        public String notes;
        /** targeted | module */
        public String probeStrategy;
        public String beforeStatus;
        public int beforeTestsPassed;
        public int beforeTestsFailed;
        public long beforeDurationMs;
        public boolean regression;
        public boolean behaviorPreserved;
        public boolean baselineInconclusive;
        public boolean pairedProbe;
    }

    static class TestDiscoveryPlan {
        List<String> testClasses = new ArrayList<>();
        String strategy; // targeted | module
        boolean runFullModule;
        String notesWhenEmpty;
    }

    public TestProbeResult probe(
            Path sandboxRoot,
            String relativeFilePath,
            RippleRefModels.JavaFileProfile beforeProfile,
            RippleRefJavaProfileExtractor extractor) {

        TestProbeResult result = new TestProbeResult();
        long start = System.currentTimeMillis();
        try {
            if (sandboxRoot == null || beforeProfile == null) {
                return skip(result, "missing_input");
            }
            Path mavenRoot = resolveMavenRoot(sandboxRoot, relativeFilePath);
            if (mavenRoot == null) {
                return skip(result, "no_maven_project");
            }
            String className = extractor.primaryClassName(beforeProfile);
            TestDiscoveryPlan plan = discoverTests(sandboxRoot, mavenRoot, relativeFilePath, className);
            if (plan.testClasses.isEmpty()) {
                return skip(result, plan.notesWhenEmpty != null ? plan.notesWhenEmpty : "no_tests_found");
            }
            result.probeStrategy = plan.strategy;
            result.targetedTestClasses = plan.testClasses;
            result.testsDiscovered = plan.testClasses.size();
            result.attempted = true;
            result.notes = plan.strategy;
            return runTests(mavenRoot, plan, result, start);
        } catch (Exception e) {
            result.status = "error";
            result.errorSnippet.add(e.getMessage());
            result.durationMs = System.currentTimeMillis() - start;
            return result;
        }
    }

    public TestProbeResult probePaired(
            Path sandboxRoot,
            String relativeFilePath,
            String originalContent,
            String candidateContent,
            RippleRefModels.JavaFileProfile beforeProfile,
            RippleRefJavaProfileExtractor extractor) throws IOException {

        TestProbeResult result = new TestProbeResult();
        result.pairedProbe = true;
        long start = System.currentTimeMillis();
        try {
            if (sandboxRoot == null || beforeProfile == null || originalContent == null || candidateContent == null) {
                result.status = "skipped";
                result.beforeStatus = "skipped";
                result.notes = "missing_input";
                return result;
            }
            Path mavenRoot = resolveMavenRoot(sandboxRoot, relativeFilePath);
            if (mavenRoot == null) {
                result.status = "skipped";
                result.beforeStatus = "skipped";
                result.notes = "no_maven_project";
                return result;
            }

            String className = extractor.primaryClassName(beforeProfile);
            TestDiscoveryPlan plan = discoverTests(sandboxRoot, mavenRoot, relativeFilePath, className);
            result.targetedTestClasses = plan.testClasses;
            result.testsDiscovered = plan.testClasses.size();
            if (plan.testClasses.isEmpty()) {
                result.status = "skipped";
                result.beforeStatus = "skipped";
                result.notes = plan.notesWhenEmpty != null ? plan.notesWhenEmpty : "no_tests_found";
                return result;
            }

            result.probeStrategy = plan.strategy;
            result.notes = plan.strategy;
            result.attempted = true;
            workspaceSandbox.applyTargetFile(sandboxRoot, relativeFilePath, originalContent);
            TestProbeResult before = runTests(mavenRoot, plan, new TestProbeResult(), start);

            workspaceSandbox.applyTargetFile(sandboxRoot, relativeFilePath, candidateContent);
            TestProbeResult after = runTests(mavenRoot, plan, new TestProbeResult(), start);

            mergePairedResult(result, before, after);
            return result;
        } catch (Exception e) {
            result.status = "error";
            result.errorSnippet.add(e.getMessage());
            result.durationMs = System.currentTimeMillis() - start;
            return result;
        }
    }

    TestDiscoveryPlan discoverTests(
            Path sandboxRoot,
            Path mavenRoot,
            String relativeFilePath,
            String className) throws IOException {

        TestDiscoveryPlan plan = new TestDiscoveryPlan();
        List<String> targeted = discoverTargetedTests(sandboxRoot, className);
        if (!targeted.isEmpty()) {
            plan.testClasses = targeted;
            plan.strategy = "targeted";
            return plan;
        }
        List<String> moduleTests = discoverModuleTests(mavenRoot);
        if (!moduleTests.isEmpty()) {
            plan.testClasses = moduleTests;
            plan.strategy = "module";
            plan.runFullModule = true;
            return plan;
        }
        plan.notesWhenEmpty = "no_module_tests_found";
        return plan;
    }

    static TestProbeResult skip(TestProbeResult result, String notes) {
        result.status = "skipped";
        result.notes = notes;
        return result;
    }

    static void mergePairedResult(TestProbeResult result, TestProbeResult before, TestProbeResult after) {
        result.beforeStatus = before.status;
        result.beforeTestsPassed = before.testsPassed;
        result.beforeTestsFailed = before.testsFailed;
        result.beforeDurationMs = before.durationMs;
        result.status = after.status;
        result.testsRun = after.testsRun;
        result.testsPassed = after.testsPassed;
        result.testsFailed = after.testsFailed;
        result.durationMs = after.durationMs;
        result.errorSnippet = new ArrayList<>(after.errorSnippet);
        result.regression = isPass(before) && !isPass(after);
        result.behaviorPreserved = isPass(before) && isPass(after);
        result.baselineInconclusive = before.attempted && !isPass(before);
    }

    static boolean isPass(TestProbeResult run) {
        return run != null && "success".equals(run.status) && run.testsFailed <= 0;
    }

    TestProbeResult runTests(Path mavenRoot, TestDiscoveryPlan plan, TestProbeResult result, long start) {
        result.attempted = true;
        result.targetedTestClasses = new ArrayList<>(plan.testClasses);
        List<String> cmd;
        if (plan.runFullModule) {
            cmd = List.of("mvn", "-q", "test");
        } else {
            String testSelector = String.join(",", plan.testClasses);
            cmd = List.of("mvn", "-q", "-Dtest=" + testSelector, "test");
        }
        return run(mavenRoot, cmd, result, start);
    }

    private TestProbeResult run(Path cwd, List<String> cmd, TestProbeResult result, long start) {
        try {
            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.directory(cwd.toFile());
            pb.redirectErrorStream(true);
            Process p = pb.start();
            boolean finished = p.waitFor(DEFAULT_TIMEOUT_SEC, TimeUnit.SECONDS);
            result.durationMs = System.currentTimeMillis() - start;
            String output = readLimited(p);
            parseSurefireSummary(output, result);

            if (!finished) {
                p.destroyForcibly();
                result.status = "timeout";
                result.errorSnippet.add("Test run exceeded " + DEFAULT_TIMEOUT_SEC + "s");
                return result;
            }

            if (p.exitValue() == 0) {
                result.status = "success";
                if (result.testsRun == 0) {
                    result.testsRun = result.targetedTestClasses.size();
                    result.testsPassed = result.targetedTestClasses.size();
                }
            } else {
                result.status = "failed";
                result.errorSnippet.add(truncate(output, 2500));
            }
        } catch (Exception e) {
            result.status = "error";
            result.durationMs = System.currentTimeMillis() - start;
            result.errorSnippet.add(e.getMessage());
            logger.debug("Test probe failed: {}", e.toString());
        }
        return result;
    }

    static Path resolveMavenRoot(Path sandboxRoot, String relativeFilePath) throws IOException {
        if (sandboxRoot == null) {
            return null;
        }
        Path root = sandboxRoot.normalize();
        if (Files.exists(root.resolve("pom.xml"))) {
            return root;
        }
        if (relativeFilePath != null && !relativeFilePath.isBlank()) {
            String rel = relativeFilePath.startsWith("/") ? relativeFilePath.substring(1) : relativeFilePath;
            Path file = root.resolve(rel.replace('\\', '/')).normalize();
            Path dir = file.getParent();
            while (dir != null && (dir.startsWith(root) || dir.equals(root))) {
                if (Files.exists(dir.resolve("pom.xml"))) {
                    return dir;
                }
                if (dir.equals(root)) {
                    break;
                }
                dir = dir.getParent();
            }
        }
        return null;
    }

    List<String> discoverTargetedTests(Path sandboxRoot, String className) throws IOException {
        Set<String> tests = new LinkedHashSet<>();
        for (String pattern : List.of(className + "Test", className + "Tests", "Test" + className)) {
            collectClassNamesFromFilename(sandboxRoot, pattern + ".java", tests);
        }
        if (!tests.isEmpty()) {
            return new ArrayList<>(tests);
        }
        Files.walkFileTree(sandboxRoot, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                if (!isTestSourceFile(sandboxRoot, file)) {
                    return FileVisitResult.CONTINUE;
                }
                String content = Files.readString(file, StandardCharsets.UTF_8);
                if (!mentionsClass(content, className)) {
                    return FileVisitResult.CONTINUE;
                }
                extractClassName(content).ifPresent(tests::add);
                return FileVisitResult.CONTINUE;
            }
        });
        return new ArrayList<>(tests);
    }

    List<String> discoverModuleTests(Path mavenRoot) throws IOException {
        Set<String> tests = new LinkedHashSet<>();
        Path testJava = mavenRoot.resolve("src/test/java");
        if (!Files.isDirectory(testJava)) {
            return List.of();
        }
        Files.walkFileTree(testJava, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                String name = file.getFileName() != null ? file.getFileName().toString() : "";
                if (!name.endsWith(".java")) {
                    return FileVisitResult.CONTINUE;
                }
                extractClassName(Files.readString(file, StandardCharsets.UTF_8)).ifPresent(tests::add);
                return FileVisitResult.CONTINUE;
            }
        });
        return new ArrayList<>(tests);
    }

    private void collectClassNamesFromFilename(Path sandboxRoot, String filename, Set<String> tests) throws IOException {
        Files.walkFileTree(sandboxRoot, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                if (!isTestSourceFile(sandboxRoot, file)) {
                    return FileVisitResult.CONTINUE;
                }
                String name = file.getFileName() != null ? file.getFileName().toString() : "";
                if (!name.equals(filename)) {
                    return FileVisitResult.CONTINUE;
                }
                extractClassName(Files.readString(file, StandardCharsets.UTF_8)).ifPresent(tests::add);
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private static boolean isTestSourceFile(Path sandboxRoot, Path file) {
        String rel = WorkspacePathFilters.toRelativePath(sandboxRoot, file);
        if (!rel.endsWith(".java")) {
            return false;
        }
        return rel.contains("test") || rel.endsWith("Test.java") || rel.endsWith("Tests.java");
    }

    private static boolean mentionsClass(String content, String className) {
        return Pattern.compile("\\b" + Pattern.quote(className) + "\\b").matcher(content).find();
    }

    private static java.util.Optional<String> extractClassName(String content) {
        Matcher m = CLASS_DECL.matcher(content);
        if (m.find()) {
            return java.util.Optional.of(m.group(1));
        }
        return java.util.Optional.empty();
    }

    private static void parseSurefireSummary(String output, TestProbeResult result) {
        Pattern p = Pattern.compile("Tests run:\\s*(\\d+),\\s*Failures:\\s*(\\d+),\\s*Errors:\\s*(\\d+)");
        Matcher m = p.matcher(output);
        int run = 0;
        int fail = 0;
        while (m.find()) {
            run += Integer.parseInt(m.group(1));
            fail += Integer.parseInt(m.group(2)) + Integer.parseInt(m.group(3));
        }
        if (run > 0) {
            result.testsRun = run;
            result.testsFailed = fail;
            result.testsPassed = Math.max(0, run - fail);
        }
    }

    private static String readLimited(Process p) throws Exception {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null && sb.length() < 8000) {
                sb.append(line).append('\n');
            }
        }
        return sb.toString();
    }

    private static String truncate(String s, int max) {
        if (s == null) {
            return "";
        }
        return s.length() <= max ? s : s.substring(0, max) + "...";
    }
}
