package ai.refact.server.service;

import ai.refact.api.FileInfo;
import ai.refact.engine.model.CodeSmell;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.Pattern;
import java.util.regex.Matcher;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Optimized ProjectService with parallel processing, lazy loading, and caching
 * for handling large-scale projects (3000+ files) efficiently.
 */
@Service
public class ProjectServiceOptimized {
    
    private static final Logger logger = LoggerFactory.getLogger(ProjectServiceOptimized.class);
    
    // Thread pool for parallel file processing
    private final ExecutorService fileProcessingPool = Executors.newFixedThreadPool(
        Math.max(4, Runtime.getRuntime().availableProcessors())
    );
    
    // Cache for file analysis results (file path -> analysis result)
    private final ConcurrentHashMap<String, CachedFileInfo> fileInfoCache = new ConcurrentHashMap<>();
    
    // Cache for code smell counts (file path -> count)
    private final ConcurrentHashMap<String, Integer> codeSmellCache = new ConcurrentHashMap<>();
    
    // Cache TTL: 1 hour
    private static final long CACHE_TTL_MS = 3600_000;
    
    @Autowired
    private PersistedCodeSmellAnalysisService persistedCodeSmellAnalysisService;
    
    /**
     * Cached file info with timestamp
     */
    private static class CachedFileInfo {
        final FileInfo fileInfo;
        final long timestamp;
        final long fileLastModified;
        
        CachedFileInfo(FileInfo fileInfo, long fileLastModified) {
            this.fileInfo = fileInfo;
            this.timestamp = System.currentTimeMillis();
            this.fileLastModified = fileLastModified;
        }
        
        boolean isExpired(long currentTime) {
            return (currentTime - timestamp) > CACHE_TTL_MS;
        }
        
        boolean isStale(long currentFileModified) {
            return currentFileModified != fileLastModified;
        }
    }
    
    /**
     * Get project files with parallel processing and lazy code smell analysis.
     * Only analyzes code smells for files that are actually displayed.
     */
    public List<FileInfo> getProjectFilesOptimized(String projectId, Path projectRoot, 
                                                   boolean analyzeCodeSmells) throws IOException {
        logger.info("Getting project files for {} (analyzeCodeSmells: {})", projectId, analyzeCodeSmells);
        long startTime = System.currentTimeMillis();
        
        try (Stream<Path> paths = Files.walk(projectRoot)) {
            List<Path> filePaths = paths
                .filter(Files::isRegularFile)
                .filter(path -> !WorkspacePathFilters.isExcludedFromFileListing(projectRoot, path))
                .filter(path -> {
                    try {
                        return !isBinaryFile(path);
                    } catch (IOException e) {
                        logger.warn("Failed to check if file is binary: {}", path, e);
                        return false;
                    }
                })
                .collect(Collectors.toList());
            
            logger.info("Found {} files to process", filePaths.size());
            
            // Process files in parallel
            List<CompletableFuture<FileInfo>> futures = filePaths.stream()
                .map(path -> CompletableFuture.supplyAsync(() -> {
                    try {
                        return createFileInfoOptimized(projectRoot, path, analyzeCodeSmells);
                    } catch (Exception e) {
                        logger.warn("Failed to process file: {}", path, e);
                        return null;
                    }
                }, fileProcessingPool))
                .collect(Collectors.toList());
            
            // Wait for all tasks to complete and collect results
            List<FileInfo> files = futures.stream()
                .map(CompletableFuture::join)
                .filter(Objects::nonNull)
                .collect(Collectors.toList());
            
            long duration = System.currentTimeMillis() - startTime;
            logger.info("Processed {} files in {} ms ({} ms/file average)", 
                       files.size(), duration, files.size() > 0 ? duration / files.size() : 0);
            
            return files;
        }
    }
    
    /**
     * Get project files with pagination support - only loads files for the requested page.
     * This is much faster for large projects as it doesn't load all files into memory.
     */
    public Map<String, Object> getProjectFilesPaginated(String projectId, Path projectRoot,
                                                       int page, int size, String search, String fileType,
                                                       boolean analyzeCodeSmells) throws IOException {
        logger.info("Getting paginated files for {} (page: {}, size: {}, search: {}, fileType: {})", 
                   projectId, page, size, search, fileType);
        long startTime = System.currentTimeMillis();
        
        try (Stream<Path> paths = Files.walk(projectRoot)) {
            // First, collect all file paths (this is fast - just paths, no analysis)
            List<Path> allFilePaths = paths
                .filter(Files::isRegularFile)
                .filter(path -> !WorkspacePathFilters.isExcludedFromFileListing(projectRoot, path))
                .filter(path -> {
                    try {
                        return !isBinaryFile(path);
                    } catch (IOException e) {
                        return false;
                    }
                })
                .collect(Collectors.toList());
            
            logger.info("Found {} file paths", allFilePaths.size());
            
            // Apply filters at path level (before expensive analysis)
            List<Path> filteredPaths = allFilePaths.stream()
                .filter(path -> {
                    String relativePath = projectRoot.relativize(path).toString();
                    String fileName = path.getFileName().toString();
                    
                    // Search filter
                    if (search != null && !search.trim().isEmpty()) {
                        String searchLower = search.toLowerCase();
                        if (!relativePath.toLowerCase().contains(searchLower) && 
                            !fileName.toLowerCase().contains(searchLower)) {
                            return false;
                        }
                    }
                    
                    // File type filter
                    if (fileType != null && !fileType.trim().isEmpty()) {
                        String determinedType = determineFileType(fileName);
                        if (!fileType.equalsIgnoreCase(determinedType)) {
                            return false;
                        }
                    }
                    
                    return true;
                })
                .collect(Collectors.toList());
            
            logger.info("After filtering: {} files", filteredPaths.size());
            
            // Calculate pagination
            int totalFiles = filteredPaths.size();
            int totalPages = (int) Math.ceil((double) totalFiles / size);
            int startIndex = page * size;
            int endIndex = Math.min(startIndex + size, totalFiles);
            
            // Only process files for the current page
            List<Path> pagePaths = filteredPaths.subList(startIndex, endIndex);
            
            logger.info("Processing page {}: files {} to {}", page, startIndex, endIndex - 1);
            
            // Process page files in parallel
            List<CompletableFuture<FileInfo>> futures = pagePaths.stream()
                .map(path -> CompletableFuture.supplyAsync(() -> {
                    try {
                        return createFileInfoOptimized(projectRoot, path, analyzeCodeSmells);
                    } catch (Exception e) {
                        logger.warn("Failed to process file: {}", path, e);
                        return null;
                    }
                }, fileProcessingPool))
                .collect(Collectors.toList());
            
            List<FileInfo> pageFiles = futures.stream()
                .map(CompletableFuture::join)
                .filter(Objects::nonNull)
                .collect(Collectors.toList());
            
            long duration = System.currentTimeMillis() - startTime;
            logger.info("Processed page in {} ms ({} ms/file average)", 
                       duration, pageFiles.size() > 0 ? duration / pageFiles.size() : 0);
            
            // Build response
            Map<String, Object> response = new HashMap<>();
            response.put("files", pageFiles);
            
            Map<String, Object> pagination = new HashMap<>();
            pagination.put("currentPage", page);
            pagination.put("totalPages", totalPages);
            pagination.put("totalFiles", totalFiles);
            pagination.put("pageSize", size);
            pagination.put("hasNext", page < totalPages - 1);
            pagination.put("hasPrevious", page > 0);
            response.put("pagination", pagination);
            
            // Add timing metrics
            Map<String, Object> timing = new HashMap<>();
            timing.put("totalTimeMs", duration);
            timing.put("totalTimeSeconds", duration / 1000.0);
            timing.put("filesProcessed", pageFiles.size());
            timing.put("averageTimePerFileMs", pageFiles.size() > 0 ? duration / pageFiles.size() : 0);
            timing.put("filesPerSecond", pageFiles.size() > 0 ? (1000.0 * pageFiles.size() / duration) : 0);
            response.put("timing", timing);
            
            return response;
        }
    }
    
    /**
     * Create FileInfo with caching and lazy code smell analysis
     */
    private FileInfo createFileInfoOptimized(Path projectRoot, Path filePath, boolean analyzeCodeSmells) throws IOException {
        String relativePath = projectRoot.relativize(filePath).toString();
        String cacheKey = relativePath;
        
        // Check cache first
        long fileLastModified = Files.getLastModifiedTime(filePath).toMillis();
        CachedFileInfo cached = fileInfoCache.get(cacheKey);
        
        if (cached != null && !cached.isExpired(System.currentTimeMillis()) && 
            !cached.isStale(fileLastModified)) {
            // Return cached result (but update code smells if requested)
            if (analyzeCodeSmells && cached.fileInfo.codeSmells() == null) {
                Integer codeSmellsCount = getCodeSmellsCountCached(projectRoot, filePath);
                // Create new FileInfo with code smells
            // Create new FileInfo with updated code smells
            return new FileInfo(
                cached.fileInfo.path(),
                cached.fileInfo.name(),
                cached.fileInfo.relativePath(),
                cached.fileInfo.type(),
                cached.fileInfo.metrics(),
                cached.fileInfo.findings(),
                codeSmellsCount,
                cached.fileInfo.lastModified()
            );
            }
            return cached.fileInfo;
        }
        
        // Cache miss or expired - create new FileInfo
        String fileName = filePath.getFileName().toString();
        String fileType = determineFileType(fileName);
        long size = Files.size(filePath);
        
        // Create metrics (lightweight - no code smell analysis yet)
        FileInfo.FileMetrics metrics = createFileMetricsFast(filePath);
        
        // Only analyze code smells if requested (lazy loading)
        Integer codeSmellsCount = null;
            if (analyzeCodeSmells && fileType.equals("SOURCE") && fileName.endsWith(".java")) {
            codeSmellsCount = getCodeSmellsCountCached(projectRoot, filePath);
        }
        
        FileInfo fileInfo = new FileInfo(
            filePath.toString(),
            fileName,
            relativePath,
            FileInfo.FileType.valueOf(fileType),
            metrics,
            0,
            codeSmellsCount,
            fileLastModified
        );
        
        // Cache the result
        fileInfoCache.put(cacheKey, new CachedFileInfo(fileInfo, fileLastModified));
        
        return fileInfo;
    }
    
    /**
     * Fast file metrics calculation (without expensive operations)
     */
    private FileInfo.FileMetrics createFileMetricsFast(Path filePath) throws IOException {
        try {
            if (isBinaryFile(filePath)) {
                return new FileInfo.FileMetrics(0, 1, 1, 0, 0, 0, 0);
            }
            
            List<String> lines;
            try {
                lines = Files.readAllLines(filePath, StandardCharsets.UTF_8);
            } catch (Exception e) {
                lines = Files.readAllLines(filePath, StandardCharsets.ISO_8859_1);
            }
            
            int totalLines = lines.size();
            int codeLines = (int) lines.stream()
                .map(String::trim)
                .filter(line -> !line.isEmpty() && !line.startsWith("//") && !line.startsWith("/*"))
                .count();
            int commentLines = (int) lines.stream()
                .map(String::trim)
                .filter(line -> line.startsWith("//") || line.startsWith("/*") || line.startsWith("*"))
                .count();
            int blankLines = (int) lines.stream()
                .map(String::trim)
                .filter(String::isEmpty)
                .count();
            
            boolean isJavaFile = filePath.toString().toLowerCase().endsWith(".java");
            String content = String.join("\n", lines);
            
            int cyclomaticComplexity = isJavaFile ? calculateCyclomaticComplexityFast(content) : 1;
            int cognitiveComplexity = cyclomaticComplexity; // Simplified
            int classCount = isJavaFile ? countClassesFast(content) : 0;
            int methodCount = isJavaFile ? countMethodsFast(content) : 0;
            
            return new FileInfo.FileMetrics(
                totalLines,
                cyclomaticComplexity,
                cognitiveComplexity,
                methodCount,
                classCount,
                commentLines,
                blankLines
            );
        } catch (Exception e) {
            logger.warn("Failed to calculate metrics for file: {}", filePath, e);
            return new FileInfo.FileMetrics(0, 1, 1, 0, 0, 0, 0);
        }
    }
    
    /**
     * Get code smells count with caching
     */
    private Integer getCodeSmellsCountCached(Path projectRoot, Path filePath) {
        try {
            long lastModified = Files.getLastModifiedTime(filePath).toMillis();
            String cacheKey = filePath.toAbsolutePath().normalize()
                + "|lm=" + lastModified
                + "|v=" + ComprehensiveCodeSmellDetector.SMELL_ENGINE_VERSION;

            Integer cached = codeSmellCache.get(cacheKey);
            if (cached != null) {
                return cached;
            }

            int count = persistedCodeSmellAnalysisService.count(projectRoot, filePath);
            codeSmellCache.put(cacheKey, count);
            pruneSmellCountCache();
            return count;
        } catch (Exception e) {
            logger.error("Failed to analyze code smells for file: {}", filePath, e);
            return 0;
        }
    }

    /** Prevent unbounded growth when many files are indexed with unique cache keys. */
    private void pruneSmellCountCache() {
        final int maxEntries = 50_000;
        if (codeSmellCache.size() <= maxEntries) {
            return;
        }
        Iterator<String> it = codeSmellCache.keySet().iterator();
        int drop = codeSmellCache.size() - maxEntries + 5_000;
        while (drop-- > 0 && it.hasNext()) {
            it.next();
            it.remove();
        }
    }
    
    /**
     * Fast cyclomatic complexity calculation
     */
    private int calculateCyclomaticComplexityFast(String content) {
        int complexity = 1;
        String[] keywords = {"if", "while", "for", "case", "catch", "&&", "||", "?"};
        for (String keyword : keywords) {
            int count = 0;
            int index = 0;
            while ((index = content.indexOf(keyword, index)) != -1) {
                count++;
                index += keyword.length();
            }
            complexity += count;
        }
        return complexity;
    }
    
    private int countClassesFast(String content) {
        int count = 0;
        String[] lines = content.split("\n");
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.matches(".*\\b(public|private|protected|static|final|abstract)?\\s+class\\s+\\w+.*") ||
                trimmed.matches(".*\\b(public|private|protected|static|final|abstract)?\\s+(interface|enum)\\s+\\w+.*")) {
                count++;
            }
        }
        return count;
    }
    
    private int countMethodsFast(String content) {
        int count = 0;
        Pattern methodPattern = Pattern.compile("\\b(public|private|protected|static|final|abstract|synchronized|native|strictfp)?\\s*(?:<[^>]+>\\s*)?\\s*\\w+\\s+(\\w+)\\s*\\([^)]*\\)\\s*\\{");
        Matcher matcher = methodPattern.matcher(content);
        while (matcher.find()) {
            count++;
        }
        return count;
    }
    
    private String determineFileType(String fileName) {
        if (fileName.contains("test") || fileName.endsWith("Test.java") || fileName.endsWith("Tests.java")) {
            return "TEST";
        } else if (fileName.endsWith(".java")) {
            return "SOURCE";
        } else if (fileName.endsWith(".xml") || fileName.endsWith(".yml") || fileName.endsWith(".yaml") || 
                   fileName.endsWith(".properties") || fileName.endsWith(".json")) {
            return "CONFIG";
        } else {
            return "RESOURCE";
        }
    }
    
    private boolean isBinaryFile(Path path) throws IOException {
        try {
            String contentType = Files.probeContentType(path);
            if (contentType != null && contentType.startsWith("text/")) {
                return false;
            }
            
            // Check first few bytes for binary patterns
            byte[] bytes = Files.readAllBytes(path);
            if (bytes.length == 0) return false;
            
            // Check for null bytes (common in binary files)
            for (int i = 0; i < Math.min(512, bytes.length); i++) {
                if (bytes[i] == 0) {
                    return true;
                }
            }
            
            return false;
        } catch (Exception e) {
            return false;
        }
    }
    
    /**
     * Clear cache (useful for testing or when files change)
     */
    public void clearCache() {
        fileInfoCache.clear();
        codeSmellCache.clear();
        logger.info("Cache cleared");
    }
    
    /**
     * Get cache statistics
     */
    public Map<String, Object> getCacheStats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("fileInfoCacheSize", fileInfoCache.size());
        stats.put("codeSmellCacheSize", codeSmellCache.size());
        return stats;
    }

    /** Clear listing/smell caches after bulk PMD scan so counts stay stable. */
    public void invalidateAllCaches() {
        fileInfoCache.clear();
        codeSmellCache.clear();
        logger.debug("ProjectServiceOptimized caches cleared");
    }
    
    /**
     * Shutdown thread pool (call on application shutdown)
     */
    public void shutdown() {
        fileProcessingPool.shutdown();
        try {
            if (!fileProcessingPool.awaitTermination(60, TimeUnit.SECONDS)) {
                fileProcessingPool.shutdownNow();
            }
        } catch (InterruptedException e) {
            fileProcessingPool.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }
}

