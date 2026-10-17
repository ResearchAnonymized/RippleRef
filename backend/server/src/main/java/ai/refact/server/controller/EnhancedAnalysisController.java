package ai.refact.server.controller;

import ai.refact.server.model.EnhancedAnalysisRequest;
import ai.refact.server.model.EnhancedAnalysisResponse;
import ai.refact.server.model.RefactoringPlan;
import ai.refact.server.model.RefactoringStep;
import ai.refact.server.model.DependencyNode;
import ai.refact.server.service.EnhancedAnalysisService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import java.util.HashMap;

@RestController
@RequestMapping("/api/workspace-enhanced-analysis")
@CrossOrigin(originPatterns = {
    "http://localhost:*",
    "http://127.0.0.1:*"
})
public class EnhancedAnalysisController {
    
    private static final Logger logger = LoggerFactory.getLogger(EnhancedAnalysisController.class);
    
    @Autowired
    private EnhancedAnalysisService enhancedAnalysisService;
    
    @Autowired
    private ai.refact.server.service.ProjectService projectService;
    
    @PostMapping("/analyze-file")
    public ResponseEntity<EnhancedAnalysisResponse> analyzeFile(@RequestBody EnhancedAnalysisRequest request) {
        try {
            logger.info("Received enhanced analysis request for file: {}", request.getFilePath());
            
            EnhancedAnalysisResponse response = enhancedAnalysisService.performEnhancedAnalysis(
                request.getWorkspaceId(), 
                request.getFilePath()
            );
            
            logger.info("Enhanced analysis completed successfully");
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            logger.error("Error performing enhanced analysis", e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    /**
     * Analyze ad-hoc content without permanently modifying the workspace.
     * Writes the provided content to a temporary file inside the workspace,
     * runs the normal enhanced analysis, then removes the temp file.
     */
    @PostMapping("/analyze-live")
    public ResponseEntity<EnhancedAnalysisResponse> analyzeLive(@RequestBody Map<String, Object> body) {
        try {
            String workspaceId = (String) body.get("workspaceId");
            String filePath = (String) body.get("filePath");
            String content = (String) body.get("content");
            if (workspaceId == null || filePath == null || content == null) {
                return ResponseEntity.badRequest().build();
            }
            
            var ctx = projectService.getProject(workspaceId);
            if (ctx == null) return ResponseEntity.notFound().build();
            
            // Create temp file under .refactai/live/ with unique name to avoid parallel collisions
            java.nio.file.Path tempDir = ctx.root().resolve(".refactai/live");
            java.nio.file.Files.createDirectories(tempDir);
            String baseName = java.nio.file.Paths.get(filePath).getFileName().toString();
            String uniqueId = System.currentTimeMillis() + "-" + java.util.UUID.randomUUID().toString().substring(0, 8);
            java.nio.file.Path tempFile = tempDir.resolve(uniqueId + "-" + baseName);
            java.nio.file.Files.write(tempFile, content.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            
            // Default: full enumeration (same as on-disk analysis). Pass "capped": true only for a short sample list.
            String relativeTempPath = ctx.root().relativize(tempFile).toString().replace("\\", "/");
            boolean capped = body.containsKey("capped") && Boolean.parseBoolean(body.get("capped").toString());
            EnhancedAnalysisResponse response = enhancedAnalysisService.performEnhancedAnalysis(workspaceId, relativeTempPath, capped);
            
            // Cleanup
            try { java.nio.file.Files.deleteIfExists(tempFile); } catch (Exception ignore) {}
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("Error performing live analysis", e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    @PostMapping("/generate-refactoring-plan")
    public ResponseEntity<RefactoringPlan> generateRefactoringPlan(@RequestBody Map<String, Object> request) {
        try {
            String workspaceId = (String) request.get("workspaceId");
            String filePath = (String) request.get("filePath");
            List<Map<String, Object>> codeSmells = (List<Map<String, Object>>) request.get("codeSmells");
            
            logger.info("Generating refactoring plan for file: {}", filePath);
            
            RefactoringPlan plan = enhancedAnalysisService.generateRefactoringPlan(workspaceId, filePath, codeSmells);
            
            logger.info("Refactoring plan generated successfully with {} steps", plan.getSteps().size());
            return ResponseEntity.ok(plan);
            
        } catch (Exception e) {
            logger.error("Error generating refactoring plan", e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    @PostMapping("/analyze-dependencies")
    public ResponseEntity<List<DependencyNode>> analyzeDependencies(@RequestBody Map<String, Object> request) {
        try {
            String workspaceId = (String) request.get("workspaceId");
            String filePath = (String) request.get("filePath");
            
            logger.info("Analyzing dependencies for file: {}", filePath);
            
            List<DependencyNode> dependencies = enhancedAnalysisService.analyzeDependencies(workspaceId, filePath);
            
            logger.info("Dependency analysis completed with {} nodes", dependencies.size());
            return ResponseEntity.ok(dependencies);
            
        } catch (Exception e) {
            logger.error("Error analyzing dependencies", e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    @PostMapping("/execute-refactoring")
    public ResponseEntity<Map<String, Object>> executeRefactoring(@RequestBody Map<String, Object> request) {
        try {
            String workspaceId = (String) request.get("workspaceId");
            String filePath = (String) request.get("filePath");
            List<Map<String, Object>> steps = (List<Map<String, Object>>) request.get("steps");
            
            logger.info("Executing refactoring for file: {} with {} steps", filePath, steps.size());
            
            Map<String, Object> result = enhancedAnalysisService.executeRefactoring(workspaceId, filePath, steps);
            
            logger.info("Refactoring execution completed successfully");
            return ResponseEntity.ok(result);
            
        } catch (Exception e) {
            logger.error("Error executing refactoring", e);
            return ResponseEntity.internalServerError().build();
        }
    }
}