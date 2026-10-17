package ai.refact.server.controller;

import ai.refact.server.service.GitHubCloneService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

@Slf4j
@RestController
@RequestMapping("/api/github")
public class GitHubCloneController {
    
    public GitHubCloneController() {
        System.out.println("GitHubCloneController initialized!");
    }
    
    @GetMapping("/test")
    public ResponseEntity<Map<String, String>> test() {
        System.out.println("GitHub test endpoint called!");
        return ResponseEntity.ok(Map.of("message", "GitHub controller is working!"));
    }
    
    @PostMapping("/clone/{workspaceId}")
    public ResponseEntity<Map<String, String>> initiateClone(
            @PathVariable String workspaceId,
            @RequestBody Map<String, String> request) {
        
        String repositoryUrl = request.get("url");
        if (repositoryUrl == null || repositoryUrl.trim().isEmpty()) {
            return ResponseEntity.badRequest()
                .body(Map.of("error", "Repository URL is required"));
        }
        
        log.info("Initiating clone for workspace {}: {}", workspaceId, repositoryUrl);
        
        return ResponseEntity.ok(Map.of(
            "message", "Clone initiated",
            "workspaceId", workspaceId,
            "repositoryUrl", repositoryUrl
        ));
    }
    
    @GetMapping(value = "/clone/{workspaceId}/progress", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter getCloneProgress(@PathVariable String workspaceId,
                                      @RequestParam String url) {
        
        SseEmitter emitter = new SseEmitter(300000L); // 5 minutes timeout
        
        log.info("Starting progress stream for workspace {}: {}", workspaceId, url);
        
        // For now, just return a simple response
        try {
            emitter.send(SseEmitter.event()
                .name("progress")
                .data(Map.of("status", "Testing", "percentage", 50)));
            emitter.complete();
        } catch (Exception e) {
            emitter.completeWithError(e);
        }
        
        return emitter;
    }
    
    @GetMapping("/clone/{workspaceId}/status")
    public ResponseEntity<Map<String, Object>> getCloneStatus(@PathVariable String workspaceId) {
        // Check if repository exists in workspace
        java.nio.file.Path workspaceDir = java.nio.file.Paths.get(
            System.getProperty("java.io.tmpdir"), 
            "refactai-workspace", 
            workspaceId
        );
        
        java.nio.file.Path repoDir = workspaceDir.resolve("repository");
        boolean exists = java.nio.file.Files.exists(repoDir);
        
        return ResponseEntity.ok(Map.of(
            "workspaceId", workspaceId,
            "cloned", exists,
            "path", exists ? repoDir.toString() : null
        ));
    }
}
