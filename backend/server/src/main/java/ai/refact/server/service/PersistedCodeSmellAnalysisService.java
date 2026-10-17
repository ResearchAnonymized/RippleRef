package ai.refact.server.service;

import ai.refact.engine.model.CodeSmell;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * PMD analysis with in-memory + on-disk cache (per workspace) for reliability across restarts.
 */
@Service
public class PersistedCodeSmellAnalysisService {

    private static final int CAPPED_MAX = 60;

    @Autowired
    private ComprehensiveCodeSmellDetector comprehensiveCodeSmellDetector;

    @Autowired
    private PmdAnalysisPersistence pmdAnalysisPersistence;

    @Autowired
    private FileStatusService fileStatusService;

    /**
     * Analyze smells for a file under a workspace, using disk cache when still valid.
     */
    public List<CodeSmell> analyze(Path workspaceRoot, Path absoluteFile, boolean capped) {
        if (workspaceRoot == null || absoluteFile == null || !Files.isRegularFile(absoluteFile)) {
            return List.of();
        }
        if (!absoluteFile.getFileName().toString().endsWith(".java")) {
            return List.of();
        }

        String relativePath = workspaceRoot.relativize(absoluteFile.normalize()).toString().replace('\\', '/');
        long lastModified;
        try {
            lastModified = Files.getLastModifiedTime(absoluteFile).toMillis();
        } catch (Exception e) {
            return comprehensiveCodeSmellDetector.detectAllCodeSmells(absoluteFile, capped);
        }

        int engineVersion = ComprehensiveCodeSmellDetector.SMELL_ENGINE_VERSION;
        var cached = pmdAnalysisPersistence.load(workspaceRoot, relativePath, lastModified, engineVersion);
        List<CodeSmell> smells;
        if (cached.isPresent()) {
            smells = cached.get();
        } else {
            try {
                smells = comprehensiveCodeSmellDetector.detectAllCodeSmells(absoluteFile, false);
                pmdAnalysisPersistence.save(workspaceRoot, relativePath, lastModified, engineVersion, smells);
            } catch (Throwable t) {
                // PMD type inference can overflow stack on complex generics; treat as zero smells for this file.
                smells = List.of();
            }
        }
        if (!relativePath.startsWith(".refactai/")) {
            try {
                fileStatusService.recordAnalysis(workspaceRoot, relativePath, smells.size());
            } catch (Exception e) {
                // non-fatal
            }
        }
        return applyCap(smells, capped);
    }

    public int count(Path workspaceRoot, Path absoluteFile) {
        return analyze(workspaceRoot, absoluteFile, false).size();
    }

    /** Smell count from on-disk PMD cache only — does not run PMD. */
    public Optional<Integer> cachedCount(Path workspaceRoot, Path absoluteFile) {
        if (workspaceRoot == null || absoluteFile == null || !Files.isRegularFile(absoluteFile)) {
            return Optional.empty();
        }
        if (!absoluteFile.getFileName().toString().endsWith(".java")) {
            return Optional.empty();
        }
        String relativePath = workspaceRoot.relativize(absoluteFile.normalize()).toString().replace('\\', '/');
        long lastModified;
        try {
            lastModified = Files.getLastModifiedTime(absoluteFile).toMillis();
        } catch (Exception e) {
            return Optional.empty();
        }
        return pmdAnalysisPersistence.cachedSmellCount(
                workspaceRoot, relativePath, lastModified, ComprehensiveCodeSmellDetector.SMELL_ENGINE_VERSION);
    }

    private static List<CodeSmell> applyCap(List<CodeSmell> smells, boolean capped) {
        if (!capped || smells.size() <= CAPPED_MAX) {
            return smells;
        }
        return smells.stream()
                .sorted(Comparator
                        .comparing((CodeSmell s) -> s.getSeverity() != null ? s.getSeverity().getPriority() : 99)
                        .thenComparingInt(CodeSmell::getStartLine)
                        .thenComparing(s -> s.getTitle() != null ? s.getTitle() : ""))
                .limit(CAPPED_MAX)
                .collect(Collectors.toList());
    }
}
