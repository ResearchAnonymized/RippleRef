package ai.refact.server.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.*;
import java.net.URL;
import java.nio.file.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
public class GitHubCloneService {
    
    private static final String GITHUB_API_BASE = "https://api.github.com/repos/";
    private static final Pattern GITHUB_URL_PATTERN = Pattern.compile(
        "https://github\\.com/([^/]+)/([^/]+?)(?:\\.git)?/?$"
    );
    
    public static class CloneProgress {
        public final String status;
        public final long bytesDownloaded;
        public final long totalBytes;
        public final double speed; // bytes per second
        public final long estimatedTimeRemaining; // seconds
        public final int percentage;
        public final String currentFile;
        public final String error;
        
        public CloneProgress(String status, long bytesDownloaded, long totalBytes, 
                           double speed, long estimatedTimeRemaining, int percentage, 
                           String currentFile, String error) {
            this.status = status;
            this.bytesDownloaded = bytesDownloaded;
            this.totalBytes = totalBytes;
            this.speed = speed;
            this.estimatedTimeRemaining = estimatedTimeRemaining;
            this.percentage = percentage;
            this.currentFile = currentFile;
            this.error = error;
        }
    }
    
    public CompletableFuture<Path> cloneRepository(String repositoryUrl, String workspaceId, 
                                                  SseEmitter emitter) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                // Parse GitHub URL
                Matcher matcher = GITHUB_URL_PATTERN.matcher(repositoryUrl);
                if (!matcher.matches()) {
                    throw new IllegalArgumentException("Invalid GitHub URL: " + repositoryUrl);
                }
                
                String owner = matcher.group(1);
                String repo = matcher.group(2);
                
                // Get repository info from GitHub API
                RepositoryInfo repoInfo = getRepositoryInfo(owner, repo);
                sendProgress(emitter, "Initializing clone...", 0, repoInfo.size, 0, 0, 0, null, null);
                
                // Create workspace directory
                Path workspaceDir = Paths.get(System.getProperty("java.io.tmpdir"), 
                                           "refactai-workspace", workspaceId);
                Files.createDirectories(workspaceDir);
                
                // Clone repository with progress tracking
                return cloneWithProgress(repositoryUrl, workspaceDir, repoInfo, emitter);
                
            } catch (Exception e) {
                log.error("Failed to clone repository: {}", repositoryUrl, e);
                sendProgress(emitter, "Error", 0, 0, 0, 0, 0, null, e.getMessage());
                throw new RuntimeException("Failed to clone repository", e);
            }
        });
    }
    
    private RepositoryInfo getRepositoryInfo(String owner, String repo) throws IOException {
        String apiUrl = GITHUB_API_BASE + owner + "/" + repo;
        
        try (InputStream is = new URL(apiUrl).openStream()) {
            String json = new String(is.readAllBytes());
            
            // Parse JSON to extract size and other info
            long size = extractSize(json);
            String defaultBranch = extractDefaultBranch(json);
            
            return new RepositoryInfo(size, defaultBranch);
        }
    }
    
    private long extractSize(String json) {
        // Simple JSON parsing for size field
        Pattern sizePattern = Pattern.compile("\"size\"\\s*:\\s*(\\d+)");
        Matcher matcher = sizePattern.matcher(json);
        if (matcher.find()) {
            return Long.parseLong(matcher.group(1)) * 1024; // Convert from KB to bytes
        }
        return 50 * 1024 * 1024; // Default 50MB if size not found
    }
    
    private String extractDefaultBranch(String json) {
        Pattern branchPattern = Pattern.compile("\"default_branch\"\\s*:\\s*\"([^\"]+)\"");
        Matcher matcher = branchPattern.matcher(json);
        if (matcher.find()) {
            return matcher.group(1);
        }
        return "main";
    }
    
    private Path cloneWithProgress(String repositoryUrl, Path workspaceDir, 
                                 RepositoryInfo repoInfo, SseEmitter emitter) throws Exception {
        
        AtomicLong bytesDownloaded = new AtomicLong(0);
        long startTime = System.currentTimeMillis();
        
        // Use git clone with progress
        ProcessBuilder pb = new ProcessBuilder("git", "clone", "--progress", repositoryUrl, 
                                            workspaceDir.resolve("repository").toString());
        pb.directory(workspaceDir.toFile());
        
        Process process = pb.start();
        
        // Monitor progress
        CompletableFuture<Void> progressMonitor = CompletableFuture.runAsync(() -> {
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream()))) {
                
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.contains("Receiving objects:")) {
                        // Parse git progress: "Receiving objects: 45% (1234/2745), 1.23 MiB | 2.34 MiB/s"
                        parseGitProgress(line, bytesDownloaded, repoInfo.size, startTime, emitter);
                    } else if (line.contains("Resolving deltas:")) {
                        sendProgress(emitter, "Resolving deltas...", 
                                   bytesDownloaded.get(), repoInfo.size, 0, 0, 95, line, null);
                    } else if (line.contains("Checking out files:")) {
                        sendProgress(emitter, "Checking out files...", 
                                   bytesDownloaded.get(), repoInfo.size, 0, 0, 98, line, null);
                    }
                }
            } catch (IOException e) {
                log.error("Error reading git output", e);
            }
        });
        
        // Wait for git clone to complete
        int exitCode = process.waitFor();
        progressMonitor.cancel(true);
        
        if (exitCode != 0) {
            throw new RuntimeException("Git clone failed with exit code: " + exitCode);
        }
        
        sendProgress(emitter, "Completed", repoInfo.size, repoInfo.size, 0, 0, 100, 
                    "Repository cloned successfully", null);
        
        return workspaceDir.resolve("repository");
    }
    
    private void parseGitProgress(String line, AtomicLong bytesDownloaded, long totalSize, 
                                 long startTime, SseEmitter emitter) {
        try {
            // Extract percentage: "Receiving objects: 45% (1234/2745), 1.23 MiB | 2.34 MiB/s"
            Pattern progressPattern = Pattern.compile(
                "Receiving objects:\\s*(\\d+)%\\s*\\((\\d+)/(\\d+)\\),\\s*([\\d.]+)\\s*(\\w+)\\s*\\|\\s*([\\d.]+)\\s*(\\w+)/s"
            );
            Matcher matcher = progressPattern.matcher(line);
            
            if (matcher.find()) {
                int percentage = Integer.parseInt(matcher.group(1));
                long downloaded = parseSize(matcher.group(4) + " " + matcher.group(5));
                double speed = parseSpeed(matcher.group(6) + " " + matcher.group(7));
                
                bytesDownloaded.set(downloaded);
                
                long currentTime = System.currentTimeMillis();
                long elapsedTime = (currentTime - startTime) / 1000;
                long estimatedTotalTime = (long) (elapsedTime * 100.0 / percentage);
                long remainingTime = Math.max(0, estimatedTotalTime - elapsedTime);
                
                sendProgress(emitter, "Downloading...", downloaded, totalSize, speed, 
                           remainingTime, percentage, "Receiving objects", null);
            }
        } catch (Exception e) {
            log.warn("Failed to parse git progress line: {}", line, e);
        }
    }
    
    private long parseSize(String sizeStr) {
        String[] parts = sizeStr.trim().split("\\s+");
        if (parts.length != 2) return 0;
        
        double value = Double.parseDouble(parts[0]);
        String unit = parts[1].toUpperCase();
        
        switch (unit) {
            case "B": return (long) value;
            case "KB": return (long) (value * 1024);
            case "MB": return (long) (value * 1024 * 1024);
            case "GB": return (long) (value * 1024 * 1024 * 1024);
            default: return (long) value;
        }
    }
    
    private double parseSpeed(String speedStr) {
        String[] parts = speedStr.trim().split("\\s+");
        if (parts.length != 2) return 0;
        
        double value = Double.parseDouble(parts[0]);
        String unit = parts[1].toUpperCase();
        
        switch (unit) {
            case "B/S": return value;
            case "KB/S": return value * 1024;
            case "MB/S": return value * 1024 * 1024;
            case "GB/S": return value * 1024 * 1024 * 1024;
            default: return value;
        }
    }
    
    private void sendProgress(SseEmitter emitter, String status, long bytesDownloaded, 
                            long totalBytes, double speed, long estimatedTimeRemaining, 
                            int percentage, String currentFile, String error) {
        try {
            CloneProgress progress = new CloneProgress(status, bytesDownloaded, totalBytes, 
                                                     speed, estimatedTimeRemaining, percentage, 
                                                     currentFile, error);
            emitter.send(SseEmitter.event()
                .name("progress")
                .data(progress));
        } catch (Exception e) {
            log.error("Failed to send progress update", e);
        }
    }
    
    private static class RepositoryInfo {
        final long size;
        final String defaultBranch;
        
        RepositoryInfo(long size, String defaultBranch) {
            this.size = size;
            this.defaultBranch = defaultBranch;
        }
    }
}
