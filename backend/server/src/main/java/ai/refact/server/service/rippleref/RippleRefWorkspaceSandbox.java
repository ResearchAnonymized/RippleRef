package ai.refact.server.service.rippleref;

import ai.refact.server.service.WorkspacePathFilters;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.Comparator;
import java.util.Set;
import java.util.stream.Stream;

/**
 * Creates an isolated repository copy for one candidate and applies only the target file patch.
 * Original workspaces are never modified.
 */
@Component
public class RippleRefWorkspaceSandbox {

    private static final Logger logger = LoggerFactory.getLogger(RippleRefWorkspaceSandbox.class);

    private static final Set<String> SKIP_DIR_NAMES = Set.of(
            ".git", ".refactai", "target", "build", "node_modules", ".gradle", ".idea", "out"
    );

    private static final Set<String> SKIP_FILE_SUFFIXES = Set.of(
            ".zip", ".tar", ".tar.gz", ".tgz", ".jar", ".war", ".ear"
    );

    public Path sandboxRoot(Path studyDir, String candidateKey) {
        return studyDir.resolve("isolated_workspaces").resolve(sanitizeKey(candidateKey));
    }

    public Path ensureSandbox(Path projectRoot, Path studyDir, String candidateKey) throws IOException {
        Path dest = sandboxRoot(studyDir, candidateKey);
        if (Files.isDirectory(dest) && Files.list(dest).findAny().isPresent()) {
            return dest;
        }
        Files.createDirectories(dest.getParent());
        copyProjectTree(projectRoot, dest);
        logger.info("Created RIPPLE-REF sandbox at {}", dest);
        return dest;
    }

    /** Remove sandbox after L5 backfill to avoid filling disk (one copy per candidate). */
    public void discardSandbox(Path studyDir, String candidateKey) {
        Path dest = sandboxRoot(studyDir, candidateKey);
        if (!Files.isDirectory(dest)) {
            return;
        }
        try (Stream<Path> walk = Files.walk(dest)) {
            walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException e) {
                    logger.debug("Failed to delete sandbox path {}: {}", p, e.toString());
                }
            });
        } catch (IOException e) {
            logger.debug("Failed to discard sandbox {}: {}", dest, e.toString());
        }
    }

    public void applyTargetFile(Path sandboxRoot, String relativeFilePath, String candidateCode) throws IOException {
        if (candidateCode == null || candidateCode.isBlank()) {
            throw new IllegalArgumentException("candidate code is empty");
        }
        String rel = relativeFilePath.startsWith("/") ? relativeFilePath.substring(1) : relativeFilePath;
        Path target = sandboxRoot.resolve(rel).normalize();
        if (!target.startsWith(sandboxRoot.normalize())) {
            throw new IllegalArgumentException("path escapes sandbox: " + relativeFilePath);
        }
        Files.createDirectories(target.getParent());
        Files.writeString(target, candidateCode, StandardCharsets.UTF_8);
    }

    private void copyProjectTree(Path source, Path dest) throws IOException {
        Files.walkFileTree(source, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                Path rel = source.relativize(dir);
                String relStr = rel.toString().replace('\\', '/');
                if (!relStr.isEmpty()) {
                    String name = dir.getFileName() != null ? dir.getFileName().toString() : "";
                    if (SKIP_DIR_NAMES.contains(name)) {
                        return FileVisitResult.SKIP_SUBTREE;
                    }
                    if (WorkspacePathFilters.isExcludedFromFileListing(relStr)) {
                        return FileVisitResult.SKIP_SUBTREE;
                    }
                }
                Path targetDir = dest.resolve(rel);
                Files.createDirectories(targetDir);
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                String rel = WorkspacePathFilters.toRelativePath(source, file);
                if (WorkspacePathFilters.isExcludedFromFileListing(rel)) {
                    return FileVisitResult.CONTINUE;
                }
                String name = file.getFileName() != null ? file.getFileName().toString() : "";
                for (String suffix : SKIP_FILE_SUFFIXES) {
                    if (name.endsWith(suffix)) {
                        return FileVisitResult.CONTINUE;
                    }
                }
                Path targetFile = dest.resolve(rel);
                Files.createDirectories(targetFile.getParent());
                Files.copy(file, targetFile, StandardCopyOption.REPLACE_EXISTING);
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private static String sanitizeKey(String key) {
        return key.replace('/', '_').replace('\\', '_').replace(':', '_').replace('|', '_');
    }
}
