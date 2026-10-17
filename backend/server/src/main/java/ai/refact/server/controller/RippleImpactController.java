package ai.refact.server.controller;

import ai.refact.server.service.RippleImpactService;
import ai.refact.server.service.RippleImpactService.RefactoringRequest;
import ai.refact.server.service.RippleImpactService.RippleImpactResult;
import ai.refact.server.service.RippleImpactService.RefactoringResult;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import ai.refact.api.ProjectContext;

/**
 * REST controller for ripple impact analysis and safe refactoring operations.
 * This controller provides endpoints for analyzing and performing refactoring operations
 * with comprehensive impact analysis.
 */
@RestController
@RequestMapping("/api/refactoring")
public class RippleImpactController {
    
    private static final Logger logger = LoggerFactory.getLogger(RippleImpactController.class);
    
    @Autowired
    private RippleImpactService rippleImpactService;
    @Autowired
    private ai.refact.server.service.ProjectService projectService;
    @Autowired
    private ai.refact.server.service.RefactoringHistoryService refactoringHistoryService;
    
    /**
     * Analyzes the ripple impact of a proposed refactoring operation.
     * 
     * @param workspaceId The workspace ID
     * @param request The refactoring request
     * @return RippleImpactResult containing analysis results
     */
    @PostMapping("/workspaces/{id}/analyze-impact")
    public ResponseEntity<RippleImpactResult> analyzeRefactoringImpact(
            @PathVariable String id,
            @RequestBody RefactoringRequest request) {
        try {
            logger.info("Analyzing refactoring impact for workspace: {} operation: {}", id, request.getType());
            
            RippleImpactResult result = rippleImpactService.analyzeRefactoringImpact(id, request);
            
            if (result.isHasError()) {
                return ResponseEntity.badRequest().body(result);
            }
            
            return ResponseEntity.ok(result);
            
        } catch (Exception e) {
            logger.error("Failed to analyze refactoring impact for workspace: {}", id, e);
            return ResponseEntity.badRequest().body(RippleImpactResult.error("Analysis failed: " + e.getMessage()));
        }
    }
    
    /**
     * Performs a safe refactoring operation with impact analysis and rollback capability.
     * 
     * @param workspaceId The workspace ID
     * @param request The refactoring request
     * @return RefactoringResult containing the operation results
     */
    @PostMapping("/workspaces/{id}/perform-refactoring")
    public ResponseEntity<RefactoringResult> performSafeRefactoring(
            @PathVariable String id,
            @RequestBody RefactoringRequest request) {
        try {
            logger.info("Performing safe refactoring for workspace: {} operation: {}", id, request.getType());
            
            RefactoringResult result = rippleImpactService.performSafeRefactoring(id, request);
            
            if (result.isHasError()) {
                return ResponseEntity.badRequest().body(result);
            }
            
            return ResponseEntity.ok(result);
            
        } catch (Exception e) {
            logger.error("Failed to perform safe refactoring for workspace: {}", id, e);
            return ResponseEntity.badRequest().body(RefactoringResult.error("Refactoring failed: " + e.getMessage()));
        }
    }
    
    /**
     * Gets available refactoring operations for a specific file.
     * 
     * @param workspaceId The workspace ID
     * @param filePath The file path
     * @return List of available refactoring operations
     */
    @GetMapping("/workspaces/{id}/available-operations")
    public ResponseEntity<AvailableOperationsResult> getAvailableOperations(
            @PathVariable String id,
            @RequestParam String filePath) {
        try {
            logger.info("Getting available refactoring operations for workspace: {} file: {}", id, filePath);
            
            // This would analyze the file and return available refactoring operations
            AvailableOperationsResult result = new AvailableOperationsResult(
                java.util.Arrays.asList(
                    new RefactoringOperationInfo("EXTRACT_METHOD", "Extract Method", "Extract a method from the current selection"),
                    new RefactoringOperationInfo("RENAME_METHOD", "Rename Method", "Rename the selected method"),
                    new RefactoringOperationInfo("RENAME_CLASS", "Rename Class", "Rename the current class"),
                    new RefactoringOperationInfo("MOVE_METHOD", "Move Method", "Move the selected method to another class"),
                    new RefactoringOperationInfo("EXTRACT_CLASS", "Extract Class", "Extract a new class from the current class")
                )
            );
            
            return ResponseEntity.ok(result);
            
        } catch (Exception e) {
            logger.error("Failed to get available operations for workspace: {} file: {}", id, filePath, e);
            return ResponseEntity.badRequest().body(AvailableOperationsResult.error("Failed to get operations: " + e.getMessage()));
        }
    }
    
    /**
     * Gets the refactoring history for a workspace.
     * 
     * @param workspaceId The workspace ID
     * @return List of refactoring operations performed
     */
    @GetMapping("/workspaces/{id}/history")
    public ResponseEntity<RefactoringHistoryResult> getRefactoringHistory(@PathVariable String id,
                                                                          @RequestParam(required = false) String filePath) {
        try {
            logger.info("Getting refactoring history for workspace: {}", id);
            ProjectContext ctx = projectService.getProject(id);
            if (ctx == null) {
                return ResponseEntity.notFound().build();
            }
            java.util.List<ai.refact.server.service.RefactoringHistoryService.HistoryEntry> all =
                refactoringHistoryService.readAll(ctx.root());
            if (filePath != null && !filePath.isBlank()) {
                all = new java.util.ArrayList<>(all.stream().filter(h -> java.util.Objects.equals(h.filePath, filePath)).toList());
            }
            java.util.List<RefactoringHistoryItem> items = new java.util.ArrayList<>();
            for (ai.refact.server.service.RefactoringHistoryService.HistoryEntry h : all) {
                items.add(new RefactoringHistoryItem(
                    h.id,
                    h.operationType,
                    h.filePath,
                    new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ").format(new java.util.Date(h.timestamp)),
                    h.success
                ));
            }
            RefactoringHistoryResult result = new RefactoringHistoryResult(items);
            return ResponseEntity.ok(result);
            
        } catch (Exception e) {
            logger.error("Failed to get refactoring history for workspace: {}", id, e);
            return ResponseEntity.badRequest().body(RefactoringHistoryResult.error("Failed to get history: " + e.getMessage()));
        }
    }
    
    /**
     * Returns full history entries including contents.
     */
    @GetMapping("/workspaces/{id}/history/full")
    public ResponseEntity<?> getRefactoringHistoryFull(@PathVariable String id,
                                                       @RequestParam(required = false) String filePath) {
        try {
            ProjectContext ctx = projectService.getProject(id);
            if (ctx == null) return ResponseEntity.notFound().build();
            java.util.List<ai.refact.server.service.RefactoringHistoryService.HistoryEntry> all =
                refactoringHistoryService.readAll(ctx.root());
            if (filePath != null && !filePath.isBlank()) {
                all = new java.util.ArrayList<>(all.stream().filter(h -> java.util.Objects.equals(h.filePath, filePath)).toList());
            }
            return ResponseEntity.ok(all);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(java.util.Map.of("error", e.getMessage()));
        }
    }
    
    /**
     * Returns a single history entry by id.
     */
    @GetMapping("/workspaces/{id}/history/entry")
    public ResponseEntity<?> getHistoryEntry(@PathVariable String id, @RequestParam String entryId) {
        try {
            ProjectContext ctx = projectService.getProject(id);
            if (ctx == null) return ResponseEntity.notFound().build();
            var opt = refactoringHistoryService.findById(ctx.root(), entryId);
            return opt.<ResponseEntity<?>>map(ResponseEntity::ok)
                    .orElseGet(() -> ResponseEntity.badRequest().body(java.util.Map.of("error", "Entry not found")));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(java.util.Map.of("error", e.getMessage()));
        }
    }
    
    /**
     * Clears history globally or for a particular file.
     */
    @PostMapping("/workspaces/{id}/history/clear")
    public ResponseEntity<?> clearHistory(@PathVariable String id, @RequestBody(required = false) java.util.Map<String, String> body) {
        try {
            ProjectContext ctx = projectService.getProject(id);
            if (ctx == null) return ResponseEntity.notFound().build();
            String filePath = body != null ? body.get("filePath") : null;
            refactoringHistoryService.clear(ctx.root(), filePath);
            return ResponseEntity.ok(java.util.Map.of("success", true));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(java.util.Map.of("error", e.getMessage()));
        }
    }
    
    /**
     * Rolls back a refactoring operation to a previous state.
     * 
     * @param workspaceId The workspace ID
     * @param backupId The backup ID to rollback to
     * @return RollbackResult containing the rollback status
     */
    @PostMapping("/workspaces/{id}/rollback")
    public ResponseEntity<RollbackResult> rollbackRefactoring(
            @PathVariable String id,
            @RequestParam String entryId) {
        try {
            logger.info("Rolling back refactoring for workspace: {} entry: {}", id, entryId);
            ProjectContext ctx = projectService.getProject(id);
            if (ctx == null) {
                return ResponseEntity.notFound().build();
            }
            java.util.Optional<ai.refact.server.service.RefactoringHistoryService.HistoryEntry> opt =
                refactoringHistoryService.findById(ctx.root(), entryId);
            if (opt.isEmpty()) {
                return ResponseEntity.badRequest().body(RollbackResult.error("Entry not found"));
            }
            var entry = opt.get();
            java.nio.file.Path target = ctx.root().resolve(entry.filePath);
            if (entry.originalContent != null) {
                java.nio.file.Files.write(target, entry.originalContent.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            } else if (entry.backupPath != null) {
                java.nio.file.Path backup = java.nio.file.Paths.get(entry.backupPath);
                if (java.nio.file.Files.exists(backup)) {
                    java.nio.file.Files.copy(backup, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                } else {
                    return ResponseEntity.badRequest().body(RollbackResult.error("Backup file not found"));
                }
            } else {
                return ResponseEntity.badRequest().body(RollbackResult.error("No original content or backup available"));
            }
            return ResponseEntity.ok(new RollbackResult(true, "Rollback applied"));
            
        } catch (Exception e) {
            logger.error("Failed to rollback refactoring for workspace: {} entry: {}", id, entryId, e);
            return ResponseEntity.badRequest().body(RollbackResult.error("Rollback failed: " + e.getMessage()));
        }
    }
    
    // Data transfer objects
    public static class AvailableOperationsResult {
        private final java.util.List<RefactoringOperationInfo> operations;
        private final boolean hasError;
        private final String errorMessage;
        
        public AvailableOperationsResult(java.util.List<RefactoringOperationInfo> operations) {
            this.operations = operations;
            this.hasError = false;
            this.errorMessage = null;
        }
        
        private AvailableOperationsResult(String errorMessage) {
            this.operations = new java.util.ArrayList<>();
            this.hasError = true;
            this.errorMessage = errorMessage;
        }
        
        public static AvailableOperationsResult error(String errorMessage) {
            return new AvailableOperationsResult(errorMessage);
        }
        
        // Getters
        public java.util.List<RefactoringOperationInfo> getOperations() { return operations; }
        public boolean isHasError() { return hasError; }
        public String getErrorMessage() { return errorMessage; }
    }
    
    public static class RefactoringOperationInfo {
        private final String type;
        private final String name;
        private final String description;
        
        public RefactoringOperationInfo(String type, String name, String description) {
            this.type = type;
            this.name = name;
            this.description = description;
        }
        
        // Getters
        public String getType() { return type; }
        public String getName() { return name; }
        public String getDescription() { return description; }
    }
    
    public static class RefactoringHistoryResult {
        private final java.util.List<RefactoringHistoryItem> history;
        private final boolean hasError;
        private final String errorMessage;
        
        public RefactoringHistoryResult(java.util.List<RefactoringHistoryItem> history) {
            this.history = history;
            this.hasError = false;
            this.errorMessage = null;
        }
        
        private RefactoringHistoryResult(String errorMessage) {
            this.history = new java.util.ArrayList<>();
            this.hasError = true;
            this.errorMessage = errorMessage;
        }
        
        public static RefactoringHistoryResult error(String errorMessage) {
            return new RefactoringHistoryResult(errorMessage);
        }
        
        // Getters
        public java.util.List<RefactoringHistoryItem> getHistory() { return history; }
        public boolean isHasError() { return hasError; }
        public String getErrorMessage() { return errorMessage; }
    }
    
    public static class RefactoringHistoryItem {
        private final String id;
        private final String type;
        private final String description;
        private final String timestamp;
        private final boolean success;
        
        public RefactoringHistoryItem(String id, String type, String description, String timestamp, boolean success) {
            this.id = id;
            this.type = type;
            this.description = description;
            this.timestamp = timestamp;
            this.success = success;
        }
        
        // Getters
        public String getId() { return id; }
        public String getType() { return type; }
        public String getDescription() { return description; }
        public String getTimestamp() { return timestamp; }
        public boolean isSuccess() { return success; }
    }
    
    public static class RollbackResult {
        private final boolean success;
        private final String message;
        private final boolean hasError;
        private final String errorMessage;
        
        public RollbackResult(boolean success, String message) {
            this.success = success;
            this.message = message;
            this.hasError = false;
            this.errorMessage = null;
        }
        
        private RollbackResult(String errorMessage) {
            this.success = false;
            this.message = null;
            this.hasError = true;
            this.errorMessage = errorMessage;
        }
        
        public static RollbackResult error(String errorMessage) {
            return new RollbackResult(errorMessage);
        }
        
        // Getters
        public boolean isSuccess() { return success; }
        public String getMessage() { return message; }
        public boolean isHasError() { return hasError; }
        public String getErrorMessage() { return errorMessage; }
    }
}

