package ai.refact.server.service.rippleref;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Best-effort compile probe in an isolated sandbox (Level 3). Failures are recorded honestly.
 */
@Component
public class RippleRefCompileProbe {

    private static final Logger logger = LoggerFactory.getLogger(RippleRefCompileProbe.class);
    private static final long DEFAULT_TIMEOUT_SEC = 180;

    public static class CompileProbeResult {
        public String status; // skipped | success | failed | timeout | error
        public String buildTool; // maven | gradle | none
        public List<String> errorSnippet = new ArrayList<>();
        public long durationMs;
    }

    public CompileProbeResult probe(Path sandboxRoot) {
        CompileProbeResult result = new CompileProbeResult();
        long start = System.currentTimeMillis();
        try {
            if (Files.exists(sandboxRoot.resolve("pom.xml"))) {
                result.buildTool = "maven";
                return run(sandboxRoot, List.of("mvn", "-q", "-DskipTests", "compile"), result, start);
            }
            if (Files.exists(sandboxRoot.resolve("build.gradle")) || Files.exists(sandboxRoot.resolve("build.gradle.kts"))) {
                result.buildTool = "gradle";
                String gradlew = sandboxRoot.resolve("gradlew").toString();
                if (Files.isExecutable(Path.of(gradlew))) {
                    return run(sandboxRoot, List.of(gradlew, "compileJava", "-q"), result, start);
                }
                return run(sandboxRoot, List.of("gradle", "compileJava", "-q"), result, start);
            }
            result.status = "skipped";
            result.buildTool = "none";
            result.errorSnippet.add("No pom.xml or build.gradle found");
        } catch (Exception e) {
            result.status = "error";
            result.errorSnippet.add(e.getMessage());
        }
        result.durationMs = System.currentTimeMillis() - start;
        return result;
    }

    private CompileProbeResult run(Path cwd, List<String> cmd, CompileProbeResult result, long start) {
        try {
            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.directory(cwd.toFile());
            pb.redirectErrorStream(true);
            Process p = pb.start();
            boolean finished = p.waitFor(DEFAULT_TIMEOUT_SEC, TimeUnit.SECONDS);
            result.durationMs = System.currentTimeMillis() - start;
            if (!finished) {
                p.destroyForcibly();
                result.status = "timeout";
                result.errorSnippet.add("Build exceeded " + DEFAULT_TIMEOUT_SEC + "s");
                return result;
            }
            String output = readLimited(p);
            if (p.exitValue() == 0) {
                result.status = "success";
            } else {
                result.status = "failed";
                result.errorSnippet.add(truncate(output, 2000));
            }
        } catch (Exception e) {
            result.status = "error";
            result.durationMs = System.currentTimeMillis() - start;
            result.errorSnippet.add(e.getMessage());
            logger.debug("Compile probe failed: {}", e.toString());
        }
        return result;
    }

    private static String readLimited(Process p) throws Exception {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null && sb.length() < 4000) {
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
