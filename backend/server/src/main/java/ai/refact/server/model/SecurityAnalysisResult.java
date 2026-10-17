package ai.refact.server.model;

import ai.refact.engine.model.VulnerabilityCategory;
import ai.refact.engine.model.VulnerabilitySeverity;
import lombok.Builder;
import lombok.Data;

import java.util.Date;
import java.util.List;
import java.util.Map;

/**
 * Security analysis result for a workspace.
 */
@Data
@Builder
public class SecurityAnalysisResult {
    private String workspaceId;
    private List<FileSecurityAnalysis> fileAnalyses;
    private Map<VulnerabilityCategory, Integer> categorySummary;
    private Map<VulnerabilitySeverity, Integer> severitySummary;
    private int totalVulnerabilities;
    private long criticalVulnerabilities;
    private long highVulnerabilities;
    private Double overallRiskScore;
    private String securityGrade;
    private String securityStatus;
    private Double owaspCompliance;
    private double securityScore;
    private String overallSecurityStatus;
    private List<String> recommendations;
    private int analyzedFiles;
    private String priorityRecommendation;
    private Date assessmentDate;
}
