package ai.refact.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.nio.file.Path;
import java.util.Map;

/**
 * Represents information about a source file in a project.
 */
public record FileInfo(
    @JsonProperty("path") String path,
    @JsonProperty("name") String name,
    @JsonProperty("relativePath") String relativePath,
    @JsonProperty("type") FileType type,
    @JsonProperty("metrics") FileMetrics metrics,
    @JsonProperty("findings") int findings,
    @JsonProperty("codeSmells") Integer codeSmells,
    @JsonProperty("lastModified") long lastModified
) {
    
    public enum FileType {
        SOURCE, TEST, RESOURCE, CONFIG
    }
    
    public record FileMetrics(
        @JsonProperty("linesOfCode") int linesOfCode,
        @JsonProperty("cyclomaticComplexity") int cyclomaticComplexity,
        @JsonProperty("cognitiveComplexity") int cognitiveComplexity,
        @JsonProperty("methodCount") int methodCount,
        @JsonProperty("classCount") int classCount,
        @JsonProperty("commentLines") int commentLines,
        @JsonProperty("blankLines") int blankLines
    ) {}
    
    public static FileInfo fromPath(Path filePath, Path projectRoot) {
        String fullPath = filePath.toString();
        String relativePath = projectRoot.relativize(filePath).toString();
        String fileName = filePath.getFileName().toString();
        
        FileType type = determineFileType(filePath);
        
        return new FileInfo(
            fullPath,
            fileName,
            relativePath,
            type,
            new FileMetrics(0, 0, 0, 0, 0, 0, 0), // Will be populated later
            0, // Will be populated later
            null, // codeSmells will be populated later
            filePath.toFile().lastModified()
        );
    }
    
    private static FileType determineFileType(Path filePath) {
        String pathStr = filePath.toString().toLowerCase();
        
        if (pathStr.contains("/test/") || pathStr.contains("\\test\\")) {
            return FileType.TEST;
        } else if (pathStr.endsWith(".java")) {
            return FileType.SOURCE;
        } else if (pathStr.endsWith(".xml") || pathStr.endsWith(".properties") || pathStr.endsWith(".yml")) {
            return FileType.CONFIG;
        } else {
            return FileType.RESOURCE;
        }
    }
}
