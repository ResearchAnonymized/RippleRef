package ai.refact.engine.model;

import lombok.Builder;
import lombok.Data;
import java.util.Date;
import java.util.List;
import java.util.Map;

/**
 * Model representing security compliance report for various standards.
 * 
 * Supports:
 * - OWASP Top 10
 * - CWE Top 25
 * - NIST Cybersecurity Framework
 * - ISO 27001
 * - PCI DSS
 */
@Data
@Builder
public class ComplianceReport {
    
    private String reportId;
    private Date generatedDate;
    private Map<String, Double> complianceScores; // Standard name -> compliance percentage
    private List<ComplianceIssue> issues;
    private Map<String, Integer> categoryBreakdown; // Category -> count of issues
    private String overallComplianceLevel; // COMPLIANT, PARTIAL, NON_COMPLIANT
    
    /**
     * Individual compliance issue.
     */
    @Data
    @Builder
    public static class ComplianceIssue {
        private String standard; // OWASP, CWE, NIST, ISO27001, PCI_DSS
        private String requirement;
        private String category;
        private String description;
        private String status; // PASS, FAIL, PARTIAL
        private List<String> affectedFiles;
        private List<String> recommendations;
    }
    
    /**
     * Get OWASP Top 10 compliance score.
     */
    public Double getOwaspCompliance() {
        return complianceScores != null ? complianceScores.getOrDefault("OWASP_TOP_10", 0.0) : 0.0;
    }
    
    /**
     * Get CWE Top 25 compliance score.
     */
    public Double getCweCompliance() {
        return complianceScores != null ? complianceScores.getOrDefault("CWE_TOP_25", 0.0) : 0.0;
    }
    
    /**
     * Get NIST compliance score.
     */
    public Double getNistCompliance() {
        return complianceScores != null ? complianceScores.getOrDefault("NIST", 0.0) : 0.0;
    }
    
    /**
     * Get overall compliance score (average of all standards).
     */
    public Double getOverallCompliance() {
        if (complianceScores == null || complianceScores.isEmpty()) {
            return 0.0;
        }
        
        return complianceScores.values().stream()
            .mapToDouble(Double::doubleValue)
            .average()
            .orElse(0.0);
    }
    
    /**
     * Get number of failing compliance issues.
     */
    public long getFailingIssuesCount() {
        return issues != null ? issues.stream()
            .filter(issue -> "FAIL".equals(issue.getStatus()))
            .count() : 0;
    }
    
    /**
     * Get compliance level based on overall score.
     */
    public String calculateComplianceLevel() {
        double overall = getOverallCompliance();
        
        if (overall >= 90.0) return "COMPLIANT";
        if (overall >= 50.0) return "PARTIAL";
        return "NON_COMPLIANT";
    }
    
    /**
     * Check if project passes a specific compliance standard.
     */
    public boolean passesStandard(String standard) {
        Double score = complianceScores != null ? complianceScores.get(standard) : null;
        return score != null && score >= 80.0;
    }
    
    /**
     * Get issues for a specific standard.
     */
    public List<ComplianceIssue> getIssuesForStandard(String standard) {
        return issues != null ? issues.stream()
            .filter(issue -> standard.equals(issue.getStandard()))
            .toList() : List.of();
    }
    
    /**
     * Get summary of compliance status.
     */
    public Map<String, Object> getSummary() {
        return Map.of(
            "overallCompliance", getOverallCompliance(),
            "complianceLevel", calculateComplianceLevel(),
            "failingIssues", getFailingIssuesCount(),
            "owaspCompliance", getOwaspCompliance(),
            "cweCompliance", getCweCompliance(),
            "totalIssues", issues != null ? issues.size() : 0
        );
    }
}

