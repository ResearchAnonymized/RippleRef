package ai.refact.server.service;

import ai.refact.api.ProjectContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Runs PMD smell detection across Java source files in a workspace and persists results
 * so lightweight file listings can show {@code codeSmells} counts for new uploads.
 */
@Service
public class PmdWorkspaceBootstrapService {

    private static final Logger logger = LoggerFactory.getLogger(PmdWorkspaceBootstrapService.class);

    private static final int SCAN_BATCH_SIZE = 64;

    private final ProjectService projectService;
    private final PersistedCodeSmellAnalysisService persistedCodeSmellAnalysisService;
    private final ExecutorService scanPool = Executors.newFixedThreadPool(
            Math.max(2, Math.min(4, Runtime.getRuntime().availableProcessors())));

    public PmdWorkspaceBootstrapService(ProjectService projectService,
                                        PersistedCodeSmellAnalysisService persistedCodeSmellAnalysisService) {
        this.projectService = projectService;
        this.persistedCodeSmellAnalysisService = persistedCodeSmellAnalysisService;
    }

    public record PmdScanResult(
            int totalJavaSourceFiles,
            int filesScanned,
            int totalSmells,
            boolean truncated,
            long durationMs,
            /** Java files visible in workspace listing (walk-based count). */
            int totalJavaInWorkspace
    ) {}

    /** All {@code .java} files under the project root (matches file browser), not only Maven src/main/java. */
    static List<Path> collectJavaFilesForScan(Path root, ProjectContext context) throws IOException {
        Set<Path> paths = new LinkedHashSet<>();
        if (Files.isDirectory(root)) {
            try (Stream<Path> walk = Files.walk(root)) {
                walk.filter(Files::isRegularFile)
                        .filter(p -> p.getFileName().toString().endsWith(".java"))
                        .filter(p -> !WorkspacePathFilters.isExcludedFromFileListing(root, p))
                        .forEach(paths::add);
            }
        }
        if (paths.isEmpty()) {
            for (Path src : context.sourceFiles()) {
                if (Files.isRegularFile(src) && src.getFileName().toString().endsWith(".java")) {
                    paths.add(src.normalize());
                }
            }
            for (Path test : context.testFiles()) {
                if (Files.isRegularFile(test) && test.getFileName().toString().endsWith(".java")) {
                    paths.add(test.normalize());
                }
            }
        }
        List<Path> sorted = new ArrayList<>(paths);
        sorted.sort((a, b) -> root.relativize(a).toString().compareToIgnoreCase(root.relativize(b).toString()));
        return sorted;
    }

    public PmdScanResult scanWorkspace(String projectId, Integer offset, Integer maxFiles) {
        long start = System.currentTimeMillis();
        ProjectContext context = projectService.getProject(projectId);
        Path root = context.root();

        List<Path> javaSources;
        try {
            javaSources = collectJavaFilesForScan(root, context);
        } catch (IOException e) {
            logger.warn("Failed to walk workspace for Java files in {}: {}", projectId, e.toString());
            javaSources = new ArrayList<>();
            for (Path src : context.sourceFiles()) {
                if (Files.isRegularFile(src) && src.getFileName().toString().endsWith(".java")) {
                    javaSources.add(src);
                }
            }
        }

        int startIndex = offset != null && offset > 0 ? Math.min(offset, javaSources.size()) : 0;
        int endIndex = javaSources.size();
        if (maxFiles != null && maxFiles > 0) {
            endIndex = Math.min(startIndex + maxFiles, javaSources.size());
        }
        List<Path> toScan = startIndex >= endIndex
                ? List.of()
                : javaSources.subList(startIndex, endIndex);
        boolean truncated = endIndex < javaSources.size();

        logger.info("PMD workspace scan for {} — files {}–{} of {} Java source file(s)",
                projectId, startIndex + 1, endIndex, javaSources.size());

        AtomicInteger filesScanned = new AtomicInteger();
        AtomicInteger totalSmells = new AtomicInteger();

        for (int batchStart = 0; batchStart < toScan.size(); batchStart += SCAN_BATCH_SIZE) {
            int end = Math.min(batchStart + SCAN_BATCH_SIZE, toScan.size());
            List<Path> batch = toScan.subList(batchStart, end);
            List<CompletableFuture<Void>> futures = batch.stream()
                    .map(path -> CompletableFuture.runAsync(() -> {
                        try {
                            int count = persistedCodeSmellAnalysisService.count(root, path);
                            filesScanned.incrementAndGet();
                            totalSmells.addAndGet(count);
                        } catch (Throwable t) {
                            // PMD can throw StackOverflowError on heavy generics (e.g. Guava); skip file, continue scan.
                            logger.warn("PMD scan failed for {}: {}", path, t.toString());
                        }
                    }, scanPool))
                    .toList();
            CompletableFuture.allOf(futures.toArray(CompletableFuture[]::new)).join();
        }

        long durationMs = System.currentTimeMillis() - start;
        logger.info("PMD workspace scan complete for {} — scanned={}, smells={}, {}ms",
                projectId, filesScanned.get(), totalSmells.get(), durationMs);

        return new PmdScanResult(
                javaSources.size(),
                filesScanned.get(),
                totalSmells.get(),
                truncated,
                durationMs,
                javaSources.size()
        );
    }
}
