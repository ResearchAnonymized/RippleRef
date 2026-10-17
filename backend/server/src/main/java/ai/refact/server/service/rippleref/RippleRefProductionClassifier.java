package ai.refact.server.service.rippleref;

import ai.refact.server.service.WorkspacePathFilters;

import java.nio.file.Path;
import java.util.Locale;
import java.util.Optional;

/**
 * Classifies workspace Java paths as production source vs excluded (tests, generated, build, etc.).
 */
public final class RippleRefProductionClassifier {

    private RippleRefProductionClassifier() {}

    public enum Classification {
        PRODUCTION,
        TEST,
        EXCLUDED
    }

    public static Classification classify(String relativePath) {
        if (relativePath == null || relativePath.isBlank()) {
            return Classification.EXCLUDED;
        }
        String rel = relativePath.replace('\\', '/');
        if (!rel.endsWith(".java")) {
            return Classification.EXCLUDED;
        }
        if (WorkspacePathFilters.isExcludedFromFileListing(rel)) {
            return Classification.EXCLUDED;
        }
        String lower = rel.toLowerCase(Locale.ROOT);
        if (isTestPath(lower)) {
            return Classification.TEST;
        }
        if (isGeneratedOrVendor(lower)) {
            return Classification.EXCLUDED;
        }
        if (isProductionPath(lower)) {
            return Classification.PRODUCTION;
        }
        // Default: production if under src/ and not test
        if (lower.contains("/src/") && !lower.contains("/test/")) {
            return Classification.PRODUCTION;
        }
        return Classification.EXCLUDED;
    }

    public static Optional<String> exclusionReason(String relativePath) {
        Classification c = classify(relativePath);
        if (c == Classification.PRODUCTION) {
            return Optional.empty();
        }
        String rel = relativePath.replace('\\', '/').toLowerCase(Locale.ROOT);
        if (!rel.endsWith(".java")) {
            return Optional.of("non_java");
        }
        if (WorkspacePathFilters.isExcludedFromFileListing(relativePath)) {
            return Optional.of("build_or_tooling");
        }
        if (isTestPath(rel)) {
            return Optional.of("test_source");
        }
        if (rel.contains("/generated/") || rel.contains("/gen/")) {
            return Optional.of("generated");
        }
        if (rel.contains("/vendor/") || rel.contains("/third_party/")) {
            return Optional.of("vendor");
        }
        if (isExampleOrSamplePath(rel)) {
            return Optional.of("example_or_sample");
        }
        if (c == Classification.TEST) {
            return Optional.of("test_source");
        }
        return Optional.of("not_production_source");
    }

    private static boolean isProductionPath(String lower) {
        return lower.contains("/src/main/java/")
                || lower.contains("/src/main/kotlin/")
                || lower.matches(".*/src/[^/]+/java/.*")
                || lower.contains("/main/java/")
                || isFlatOrgJavaSource(lower);
    }

    /** Ant/Eclipse layouts: {@code project/org/package/Class.java} without {@code src/main/java}. */
    private static boolean isFlatOrgJavaSource(String lower) {
        if (!lower.contains("/org/")) {
            return false;
        }
        if (lower.contains("/misc/")
                || lower.contains("/build/")
                || lower.contains("/doc/")
                || lower.contains("/docs/")) {
            return false;
        }
        int orgIdx = lower.indexOf("/org/");
        String afterOrg = lower.substring(orgIdx + 5);
        return afterOrg.contains("/") && !afterOrg.startsWith("test/");
    }

    private static boolean isTestPath(String lower) {
        return lower.contains("/src/test/")
                || lower.contains("/test/java/")
                || lower.matches(".*/test/[^/]+/.*")
                || lower.contains("/tests/")
                || lower.endsWith("test.java")
                || lower.endsWith("tests.java")
                || lower.contains("/it/java/")
                || lower.contains("/androidtest/");
    }

    private static boolean isGeneratedOrVendor(String lower) {
        return lower.contains("/generated/")
                || lower.contains("/gen/")
                || lower.contains("/vendor/")
                || lower.contains("/third_party/")
                || isExampleOrSamplePath(lower);
    }

    /** Exclude demo/example trees, but not Java packages like {@code com.example}. */
    private static boolean isExampleOrSamplePath(String lower) {
        if (lower.contains("/examples/") || lower.contains("/samples/")) {
            return true;
        }
        if ((lower.contains("/example/") || lower.contains("/sample/")) && !lower.contains("/java/")) {
            return true;
        }
        return lower.startsWith("examples/") || lower.startsWith("samples/");
    }

    public static int countLoc(String content) {
        if (content == null || content.isEmpty()) {
            return 0;
        }
        return content.split("\n", -1).length;
    }

    public static boolean withinTokenBudget(String content) {
        if (content == null) {
            return false;
        }
        int lines = countLoc(content);
        int estTokens = Math.max(1, content.length() / 4);
        return lines <= 25_000 && estTokens <= 160_000;
    }
}
