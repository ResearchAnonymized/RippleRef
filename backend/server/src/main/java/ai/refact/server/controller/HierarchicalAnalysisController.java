package ai.refact.server.controller;

import ai.refact.engine.analysis.ComprehensiveAnalysisEngine;
import ai.refact.engine.analysis.ComprehensiveAnalysisEngine.ComprehensiveAnalysisResult;
import ai.refact.engine.analysis.ComprehensiveAnalysisEngine.AnalysisSummary;
import ai.refact.engine.model.CodeSmell;
import ai.refact.engine.model.CodeSmellCluster;
import ai.refact.engine.model.SmellSeverity;
import ai.refact.engine.model.SmellImpact;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * REST controller for hierarchical code smell analysis.
 * Provides comprehensive analysis with clustering and categorization.
 */
@RestController
@RequestMapping("/api/hierarchical-analysis")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class HierarchicalAnalysisController {
    
    @Autowired
    private ComprehensiveAnalysisEngine analysisEngine;
    
    /**
     * Perform comprehensive hierarchical analysis on a file
     * @param request analysis request
     * @return comprehensive analysis result
     */
    @PostMapping("/analyze-file")
    public ResponseEntity<Map<String, Object>> analyzeFile(@RequestBody AnalysisRequest request) {
        try {
            ComprehensiveAnalysisResult result = analysisEngine.analyzeFile(request.getFilePath());
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("filePath", result.getFilePath());
            response.put("totalSmells", result.getAllSmells().size());
            response.put("smells", result.getAllSmells());
            response.put("clusteredByType", result.getClusteredByType());
            response.put("clusteredBySeverity", result.getClusteredBySeverity());
            response.put("clusteredByImpact", result.getClusteredByImpact());
            response.put("statistics", result.getStatistics());
            response.put("topProblems", result.getTopProblems());
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", "Failed to analyze file: " + e.getMessage());
            return ResponseEntity.status(500).body(errorResponse);
        }
    }
    
    /**
     * Get analysis summary for a file
     * @param request analysis request
     * @return analysis summary
     */
    @PostMapping("/summary")
    public ResponseEntity<Map<String, Object>> getAnalysisSummary(@RequestBody AnalysisRequest request) {
        try {
            AnalysisSummary summary = analysisEngine.getAnalysisSummary(request.getFilePath());
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("filePath", summary.getFilePath());
            response.put("totalSmells", summary.getTotalSmells());
            response.put("clusterCount", summary.getClusterCount());
            response.put("statistics", summary.getStatistics());
            response.put("topProblems", summary.getTopProblems());
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", "Failed to get analysis summary: " + e.getMessage());
            return ResponseEntity.status(500).body(errorResponse);
        }
    }
    
    /**
     * Get cluster statistics for a file
     * @param request analysis request
     * @return cluster statistics
     */
    @PostMapping("/cluster-stats")
    public ResponseEntity<Map<String, Object>> getClusterStatistics(@RequestBody AnalysisRequest request) {
        try {
            ComprehensiveAnalysisResult result = analysisEngine.analyzeFile(request.getFilePath());
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("filePath", result.getFilePath());
            response.put("clusterStatistics", result.getStatistics());
            
            // Add cluster breakdown
            Map<String, Object> clusterBreakdown = new HashMap<>();
            for (Map.Entry<CodeSmellCluster, List<CodeSmell>> entry : result.getClusteredByType().entrySet()) {
                clusterBreakdown.put(entry.getKey().toString(), entry.getValue().size());
            }
            response.put("clusterBreakdown", clusterBreakdown);
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", "Failed to get cluster statistics: " + e.getMessage());
            return ResponseEntity.status(500).body(errorResponse);
        }
    }
    
    /**
     * Get severity breakdown for a file
     * @param request analysis request
     * @return severity breakdown
     */
    @PostMapping("/severity-breakdown")
    public ResponseEntity<Map<String, Object>> getSeverityBreakdown(@RequestBody AnalysisRequest request) {
        try {
            ComprehensiveAnalysisResult result = analysisEngine.analyzeFile(request.getFilePath());
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("filePath", result.getFilePath());
            
            // Add severity breakdown
            Map<String, Object> severityBreakdown = new HashMap<>();
            for (Map.Entry<SmellSeverity, List<CodeSmell>> entry : result.getClusteredBySeverity().entrySet()) {
                severityBreakdown.put(entry.getKey().toString(), entry.getValue().size());
            }
            response.put("severityBreakdown", severityBreakdown);
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", "Failed to get severity breakdown: " + e.getMessage());
            return ResponseEntity.status(500).body(errorResponse);
        }
    }
    
    /**
     * Get impact analysis for a file
     * @param request analysis request
     * @return impact analysis
     */
    @PostMapping("/impact-analysis")
    public ResponseEntity<Map<String, Object>> getImpactAnalysis(@RequestBody AnalysisRequest request) {
        try {
            ComprehensiveAnalysisResult result = analysisEngine.analyzeFile(request.getFilePath());
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("filePath", result.getFilePath());
            
            // Add impact breakdown
            Map<String, Object> impactBreakdown = new HashMap<>();
            for (Map.Entry<SmellImpact, List<CodeSmell>> entry : result.getClusteredByImpact().entrySet()) {
                impactBreakdown.put(entry.getKey().toString(), entry.getValue().size());
            }
            response.put("impactBreakdown", impactBreakdown);
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", "Failed to get impact analysis: " + e.getMessage());
            return ResponseEntity.status(500).body(errorResponse);
        }
    }
    
    /**
     * Analysis request model
     */
    public static class AnalysisRequest {
        private String filePath;
        
        public String getFilePath() {
            return filePath;
        }
        
        public void setFilePath(String filePath) {
            this.filePath = filePath;
        }
    }
}
