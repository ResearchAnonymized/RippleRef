package ai.refact.server.controller;

import ai.refact.engine.model.SecurityAssessment;
import ai.refact.server.model.SecurityAnalysisResult;
import ai.refact.server.model.FileSecurityAnalysis;
import ai.refact.server.service.SecurityAnalysisService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashMap;
import java.util.Map;

/**
 * REST API controller for security analysis operations.
 * Provides comprehensive security vulnerability detection and assessment.
 */
// @RestController
// @RequestMapping("/security")
// @CrossOrigin(origins = "http://localhost:4000", allowCredentials = "true")
public class SecurityAnalysisController {
    
    private static final Logger logger = LoggerFactory.getLogger(SecurityAnalysisController.class);
    
    private final SecurityAnalysisService securityAnalysisService;
    
    @Autowired
    public SecurityAnalysisController(SecurityAnalysisService securityAnalysisService) {
        this.securityAnalysisService = securityAnalysisService;
        logger.info("SecurityAnalysisController initialized with comprehensive security analysis");
        System.out.println("SecurityAnalysisController: Service injected successfully: " + (securityAnalysisService != null));
    }
    
    /**
     * Health check endpoint for security service.
     */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> healthCheck() {
        Map<String, Object> health = new HashMap<>();
        health.put("status", "UP");
        health.put("service", "Security Analysis Service");
        health.put("timestamp", System.currentTimeMillis());
        health.put("serviceInjected", securityAnalysisService != null);
        return ResponseEntity.ok(health);
    }
    
    /**
     * Perform comprehensive security analysis on a workspace.
     * Returns legacy format for backward compatibility.
     */
    @PostMapping("/analyze/{workspaceId}")
    public ResponseEntity<SecurityAnalysisResult> analyzeWorkspace(@PathVariable String workspaceId) {
        try {
            logger.info("Starting security analysis for workspace: {}", workspaceId);
            
            SecurityAnalysisResult result = securityAnalysisService.analyzeWorkspace(workspaceId);
            
            logger.info("Security analysis completed for workspace: {}. Found {} vulnerabilities", 
                       workspaceId, result.getTotalVulnerabilities());
            
            return ResponseEntity.ok(result);
            
        } catch (Exception e) {
            logger.error("Failed to analyze workspace security: {}", workspaceId, e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    /**
     * Perform comprehensive security assessment on a workspace.
     * Returns full SecurityAssessment object with all details.
     */
    @PostMapping("/assessment/{workspaceId}")
    public ResponseEntity<SecurityAssessment> performAssessment(@PathVariable String workspaceId) {
        try {
            logger.info("Performing security assessment for workspace: {}", workspaceId);
            
            SecurityAssessment assessment = securityAnalysisService.performSecurityAssessment(workspaceId);
            
            logger.info("Security assessment completed for workspace: {}. Security Grade: {}", 
                       workspaceId, assessment.getSecurityGrade());
            
            return ResponseEntity.ok(assessment);
            
        } catch (Exception e) {
            logger.error("Failed to perform security assessment: {}", workspaceId, e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    /**
     * Analyze a specific file for security vulnerabilities.
     */
    @GetMapping("/analyze/{workspaceId}/file")
    public ResponseEntity<FileSecurityAnalysis> analyzeFile(
            @PathVariable String workspaceId,
            @RequestParam String filePath) {
        try {
            logger.info("Analyzing file for security vulnerabilities: {} in workspace: {}", filePath, workspaceId);
            
            FileSecurityAnalysis analysis = securityAnalysisService.analyzeFile(workspaceId, filePath);
            
            logger.info("File analysis completed: {}. Found {} vulnerabilities", 
                       filePath, analysis.getTotalVulnerabilities());
            
            return ResponseEntity.ok(analysis);
            
        } catch (Exception e) {
            logger.error("Failed to analyze file for security: {} in workspace: {}", filePath, workspaceId, e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    /**
     * Get security summary for a workspace.
     */
    @GetMapping("/summary/{workspaceId}")
    public ResponseEntity<Map<String, Object>> getSecuritySummary(@PathVariable String workspaceId) {
        try {
            logger.info("Getting security summary for workspace: {}", workspaceId);
            
            SecurityAssessment assessment = securityAnalysisService.performSecurityAssessment(workspaceId);
            Map<String, Object> summary = assessment.getSummary();
            
            return ResponseEntity.ok(summary);
            
        } catch (Exception e) {
            logger.error("Failed to get security summary: {}", workspaceId, e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    /**
     * Get compliance report for a workspace.
     */
    @GetMapping("/compliance/{workspaceId}")
    public ResponseEntity<?> getComplianceReport(@PathVariable String workspaceId) {
        try {
            logger.info("Getting compliance report for workspace: {}", workspaceId);
            
            SecurityAssessment assessment = securityAnalysisService.performSecurityAssessment(workspaceId);
            
            if (assessment.getComplianceReport() == null) {
                return ResponseEntity.notFound().build();
            }
            
            return ResponseEntity.ok(assessment.getComplianceReport());
            
        } catch (Exception e) {
            logger.error("Failed to get compliance report: {}", workspaceId, e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    /**
     * Get remediation plan for a workspace.
     */
    @GetMapping("/remediation/{workspaceId}")
    public ResponseEntity<?> getRemediationPlan(@PathVariable String workspaceId) {
        try {
            logger.info("Getting remediation plan for workspace: {}", workspaceId);
            
            SecurityAssessment assessment = securityAnalysisService.performSecurityAssessment(workspaceId);
            
            if (assessment.getRemediationPlan() == null) {
                return ResponseEntity.notFound().build();
            }
            
            return ResponseEntity.ok(assessment.getRemediationPlan());
            
        } catch (Exception e) {
            logger.error("Failed to get remediation plan: {}", workspaceId, e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    /**
     * Get vulnerabilities by severity for a workspace.
     */
    @GetMapping("/vulnerabilities/{workspaceId}/by-severity")
    public ResponseEntity<Map<String, Object>> getVulnerabilitiesBySeverity(@PathVariable String workspaceId) {
        try {
            logger.info("Getting vulnerabilities by severity for workspace: {}", workspaceId);
            
            SecurityAssessment assessment = securityAnalysisService.performSecurityAssessment(workspaceId);
            Map<String, Object> severityData = new HashMap<>();
            
            severityData.put("bySeverity", assessment.getVulnerabilitiesBySeverity());
            severityData.put("byCategory", assessment.getVulnerabilitiesByCategory());
            severityData.put("totalVulnerabilities", assessment.getTotalVulnerabilities());
            severityData.put("securityGrade", assessment.getSecurityGrade());
            
            return ResponseEntity.ok(severityData);
            
        } catch (Exception e) {
            logger.error("Failed to get vulnerabilities by severity: {}", workspaceId, e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    /**
     * Get most critical vulnerability for a workspace.
     */
    @GetMapping("/vulnerabilities/{workspaceId}/most-critical")
    public ResponseEntity<?> getMostCriticalVulnerability(@PathVariable String workspaceId) {
        try {
            logger.info("Getting most critical vulnerability for workspace: {}", workspaceId);
            
            SecurityAssessment assessment = securityAnalysisService.performSecurityAssessment(workspaceId);
            
            if (assessment.getMostCriticalVulnerability() == null) {
                return ResponseEntity.notFound().build();
            }
            
            return ResponseEntity.ok(assessment.getMostCriticalVulnerability());
            
        } catch (Exception e) {
            logger.error("Failed to get most critical vulnerability: {}", workspaceId, e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    /**
     * Check if workspace requires immediate attention.
     */
    @GetMapping("/check/{workspaceId}/requires-attention")
    public ResponseEntity<Map<String, Object>> checkRequiresAttention(@PathVariable String workspaceId) {
        try {
            logger.info("Checking if workspace requires immediate attention: {}", workspaceId);
            
            SecurityAssessment assessment = securityAnalysisService.performSecurityAssessment(workspaceId);
            
            Map<String, Object> response = new HashMap<>();
            response.put("requiresAttention", assessment.requiresImmediateAttention());
            response.put("criticalVulnerabilities", assessment.getCriticalVulnerabilities());
            response.put("highVulnerabilities", assessment.getHighVulnerabilities());
            response.put("securityStatus", assessment.getSecurityStatus());
            response.put("securityGrade", assessment.getSecurityGrade());
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            logger.error("Failed to check workspace attention status: {}", workspaceId, e);
            return ResponseEntity.internalServerError().build();
        }
    }
}

