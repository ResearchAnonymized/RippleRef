package ai.refact.engine.model;

import lombok.Builder;
import lombok.Data;
import java.util.Date;
import java.util.List;
import java.util.Map;

/**
 * Security assessment model containing comprehensive security analysis results.
 * 
 * Technology Stack:
 * - Lombok for boilerplate code reduction
 * - Builder pattern for immutable object creation
 * - Comprehensive security metrics and compliance data
 */
@Data
@Builder
public class SecurityAssessment {
    
    private String projectId;
    private List<SecurityVulnerability> vulnerabilities;
    private Map<String, Object> metrics;
    private ComplianceReport complianceReport;
    private RemediationPlan remediationPlan;
    private Double overallRiskScore;
    private Date assessmentDate;
    private String assessmentVersion;
    private String engineVersion;
    
    /**
     * Get security grade based on overall risk score.
     */
    public String getSecurityGrade() {
        if (overallRiskScore == null) {
            return "N/A";
        }
        
        if (overallRiskScore >= 8.0) return "F";
        if (overallRiskScore >= 6.0) return "D";
        if (overallRiskScore >= 4.0) return "C";
        if (overallRiskScore >= 2.0) return "B";
        return "A";
    }
    
    /**
     * Get security status based on critical vulnerabilities.
     */
    public String getSecurityStatus() {
        long criticalCount = vulnerabilities.stream()
            .filter(v -> v.getSeverity() == VulnerabilitySeverity.CRITICAL)
            .count();
        
        if (criticalCount > 0) return "CRITICAL";
        
        long highCount = vulnerabilities.stream()
            .filter(v -> v.getSeverity() == VulnerabilitySeverity.HIGH)
            .count();
        
        if (highCount > 5) return "HIGH_RISK";
        if (highCount > 0) return "MEDIUM_RISK";
        
        return "LOW_RISK";
    }
    
    /**
     * Get total vulnerability count.
     */
    public int getTotalVulnerabilities() {
        return vulnerabilities != null ? vulnerabilities.size() : 0;
    }
    
    /**
     * Get critical vulnerability count.
     */
    public long getCriticalVulnerabilities() {
        return vulnerabilities.stream()
            .filter(v -> v.getSeverity() == VulnerabilitySeverity.CRITICAL)
            .count();
    }
    
    /**
     * Get high severity vulnerability count.
     */
    public long getHighVulnerabilities() {
        return vulnerabilities.stream()
            .filter(v -> v.getSeverity() == VulnerabilitySeverity.HIGH)
            .count();
    }
    
    /**
     * Check if project requires immediate attention.
     */
    public boolean requiresImmediateAttention() {
        return getCriticalVulnerabilities() > 0 || 
               getHighVulnerabilities() > 5;
    }
    
    /**
     * Get OWASP Top 10 compliance percentage.
     */
    public double getOwaspCompliancePercentage() {
        if (complianceReport == null || complianceReport.getComplianceScores() == null) {
            return 0.0;
        }
        
        Double score = complianceReport.getComplianceScores().get("OWASP_TOP_10");
        return score != null ? score : 0.0;
    }
    
    /**
     * Get estimated remediation effort in hours.
     */
    public int getEstimatedRemediationEffort() {
        if (remediationPlan == null) {
            return 0;
        }
        
        return remediationPlan.getTotalEffortHours() != null ? 
               remediationPlan.getTotalEffortHours() : 0;
    }
    
    /**
     * Get most critical vulnerability.
     */
    public SecurityVulnerability getMostCriticalVulnerability() {
        return vulnerabilities.stream()
            .max((v1, v2) -> Double.compare(v1.calculateRiskScore(), v2.calculateRiskScore()))
            .orElse(null);
    }
    
    /**
     * Get vulnerabilities by category.
     */
    public Map<VulnerabilityCategory, Long> getVulnerabilitiesByCategory() {
        return vulnerabilities.stream()
            .collect(java.util.stream.Collectors.groupingBy(
                SecurityVulnerability::getCategory,
                java.util.stream.Collectors.counting()
            ));
    }
    
    /**
     * Get vulnerabilities by severity.
     */
    public Map<VulnerabilitySeverity, Long> getVulnerabilitiesBySeverity() {
        return vulnerabilities.stream()
            .collect(java.util.stream.Collectors.groupingBy(
                SecurityVulnerability::getSeverity,
                java.util.stream.Collectors.counting()
            ));
    }
    
    /**
     * Get summary statistics.
     */
    public Map<String, Object> getSummary() {
        return Map.of(
            "totalVulnerabilities", getTotalVulnerabilities(),
            "criticalCount", getCriticalVulnerabilities(),
            "highCount", getHighVulnerabilities(),
            "securityGrade", getSecurityGrade(),
            "securityStatus", getSecurityStatus(),
            "overallRiskScore", overallRiskScore != null ? overallRiskScore : 0.0,
            "owaspCompliance", getOwaspCompliancePercentage(),
            "requiresAttention", requiresImmediateAttention(),
            "estimatedEffort", getEstimatedRemediationEffort()
        );
    }
}
