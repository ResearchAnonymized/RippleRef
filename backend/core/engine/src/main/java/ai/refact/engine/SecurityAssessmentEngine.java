package ai.refact.engine;

import ai.refact.engine.detectors.ComprehensiveSecurityDetector;
import ai.refact.engine.model.*;
import ai.refact.api.ProjectContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Collectors;
import java.io.IOException;

/**
 * Security assessment engine that performs comprehensive security analysis of Java projects.
 * 
 * Technology Stack:
 * - Spring Boot for dependency injection
 * - Pattern-based security detection
 * - CVSS v3.1 for vulnerability scoring
 * - OWASP Top 10 2021 compliance checking
 * - Statistical analysis for risk assessment
 */
@Component
public class SecurityAssessmentEngine {
    
    private static final Logger logger = LoggerFactory.getLogger(SecurityAssessmentEngine.class);
    
    private final ComprehensiveSecurityDetector securityDetector;
    
    @Autowired
    public SecurityAssessmentEngine(ComprehensiveSecurityDetector securityDetector) {
        this.securityDetector = securityDetector;
    }
    
    /**
     * Perform comprehensive security assessment of a project.
     * 
     * @param projectContext Project context containing source files
     * @return Security assessment with vulnerabilities, risk scores, and compliance
     */
    public SecurityAssessment assessProject(ProjectContext projectContext) {
        logger.info("Starting security assessment for project: {}", projectContext.root().getFileName());
        
        try {
            // 1. Scan all Java files for vulnerabilities
            List<SecurityVulnerability> vulnerabilities = securityDetector.detectAllVulnerabilities(projectContext);
            
            // 2. Calculate comprehensive metrics
            Map<String, Object> metrics = calculateSecurityMetrics(vulnerabilities, projectContext);
            
            // 3. Generate compliance report
            ComplianceReport compliance = generateComplianceReport(vulnerabilities);
            
            // 4. Create remediation plan
            RemediationPlan remediationPlan = createRemediationPlan(vulnerabilities);
            
            // 5. Calculate overall risk score
            double overallRiskScore = calculateOverallRiskScore(vulnerabilities);
            
            logger.info("Security assessment completed. Found {} vulnerabilities with risk score: {:.2f}", 
                       vulnerabilities.size(), overallRiskScore);
            
            return SecurityAssessment.builder()
                .projectId(projectContext.root().getFileName().toString())
                .vulnerabilities(vulnerabilities)
                .metrics(metrics)
                .complianceReport(compliance)
                .remediationPlan(remediationPlan)
                .overallRiskScore(overallRiskScore)
                .assessmentDate(new Date())
                .assessmentVersion("1.0.0")
                .engineVersion("RefactAI Security Engine v1.0")
                .build();
                
        } catch (Exception e) {
            logger.error("Error during security assessment for project: {}", projectContext.root().getFileName(), e);
            throw new SecurityAssessmentException("Failed to complete security assessment", e);
        }
    }
    
    /**
     * Calculate comprehensive security metrics.
     */
    private Map<String, Object> calculateSecurityMetrics(List<SecurityVulnerability> vulnerabilities, 
                                                        ProjectContext projectContext) {
        Map<String, Object> metrics = new HashMap<>();
        
        // Basic counts
        metrics.put("totalVulnerabilities", vulnerabilities.size());
        metrics.put("criticalCount", countBySeverity(vulnerabilities, VulnerabilitySeverity.CRITICAL));
        metrics.put("highCount", countBySeverity(vulnerabilities, VulnerabilitySeverity.HIGH));
        metrics.put("mediumCount", countBySeverity(vulnerabilities, VulnerabilitySeverity.MEDIUM));
        metrics.put("lowCount", countBySeverity(vulnerabilities, VulnerabilitySeverity.LOW));
        metrics.put("infoCount", countBySeverity(vulnerabilities, VulnerabilitySeverity.INFO));
        
        // Risk scores
        metrics.put("averageRiskScore", calculateAverageRiskScore(vulnerabilities));
        metrics.put("maxRiskScore", calculateMaxRiskScore(vulnerabilities));
        metrics.put("riskDistribution", calculateRiskDistribution(vulnerabilities));
        
        // OWASP Top 10 coverage
        metrics.put("owaspTop10Coverage", calculateOwaspTop10Coverage(vulnerabilities));
        metrics.put("owaspComplianceScore", calculateOwaspComplianceScore(vulnerabilities));
        
        // Vulnerability categories
        metrics.put("categoryDistribution", calculateCategoryDistribution(vulnerabilities));
        metrics.put("mostCommonCategory", findMostCommonCategory(vulnerabilities));
        
        // File-level metrics
        metrics.put("filesWithVulnerabilities", countFilesWithVulnerabilities(vulnerabilities));
        metrics.put("vulnerabilityDensity", calculateVulnerabilityDensity(vulnerabilities, projectContext));
        
        // Time-based metrics
        metrics.put("assessmentTimestamp", System.currentTimeMillis());
        
        return metrics;
    }
    
    /**
     * Generate compliance report based on OWASP Top 10 and other standards.
     */
    private ComplianceReport generateComplianceReport(List<SecurityVulnerability> vulnerabilities) {
        Map<String, Double> complianceScores = new HashMap<>();
        Map<String, Integer> categoryBreakdown = new HashMap<>();
        List<ComplianceReport.ComplianceIssue> issues = new ArrayList<>();
        
        // Count violations by category
        for (SecurityVulnerability vuln : vulnerabilities) {
            if (vuln.getOwaspCategory() != null) {
                categoryBreakdown.merge(vuln.getOwaspCategory(), 1, Integer::sum);
            }
        }
        
        // Calculate compliance scores
        complianceScores.put("OWASP_TOP_10", calculateOwaspComplianceScore(vulnerabilities));
        complianceScores.put("CWE_COVERAGE", calculateCweCompliance(vulnerabilities));
        
        // Create compliance issues
        for (Map.Entry<String, Integer> entry : categoryBreakdown.entrySet()) {
            issues.add(ComplianceReport.ComplianceIssue.builder()
                .standard("OWASP")
                .requirement(entry.getKey())
                .category(entry.getKey())
                .description(String.format("Found %d vulnerabilities in category %s", entry.getValue(), entry.getKey()))
                .status("FAIL")
                .affectedFiles(getAffectedFiles(vulnerabilities, entry.getKey()))
                .recommendations(getRecommendations(entry.getKey()))
                .build());
        }
        
        String complianceLevel = calculateComplianceLevel(complianceScores.get("OWASP_TOP_10"));
        
        return ComplianceReport.builder()
            .reportId(UUID.randomUUID().toString())
            .generatedDate(new Date())
            .complianceScores(complianceScores)
            .issues(issues)
            .categoryBreakdown(categoryBreakdown)
            .overallComplianceLevel(complianceLevel)
            .build();
    }
    
    /**
     * Create prioritized remediation plan.
     */
    private RemediationPlan createRemediationPlan(List<SecurityVulnerability> vulnerabilities) {
        // Sort vulnerabilities by risk score (highest first)
        List<SecurityVulnerability> sortedVulns = vulnerabilities.stream()
            .sorted((v1, v2) -> Double.compare(v2.calculateRiskScore(), v1.calculateRiskScore()))
            .collect(Collectors.toList());
        
        // Create tasks from vulnerabilities
        List<RemediationPlan.RemediationTask> tasks = new ArrayList<>();
        Map<String, Integer> effortByPriority = new HashMap<>();
        Map<String, Integer> effortByCategory = new HashMap<>();
        
        for (SecurityVulnerability vuln : sortedVulns) {
            RemediationPlan.RemediationTask task = RemediationPlan.RemediationTask.builder()
                .taskId(UUID.randomUUID().toString())
                .title("Fix: " + vuln.getTitle())
                .description(vuln.getDescription())
                .priority(vuln.getFixPriority() != null ? vuln.getFixPriority() : determinePriority(vuln))
                .category(vuln.getCategory())
                .vulnerabilityIds(List.of(vuln.getId()))
                .steps(vuln.getRemediationSteps() != null ? vuln.getRemediationSteps() : List.of(vuln.getRecommendation()))
                .estimatedHours(vuln.getEstimatedEffortHours() != null ? vuln.getEstimatedEffortHours() : estimateEffort(vuln))
                .status("PENDING")
                .build();
            
            tasks.add(task);
            
            // Accumulate effort
            String priority = task.getPriority();
            String category = task.getCategory().getDisplayName();
            effortByPriority.merge(priority, task.getEstimatedHours(), Integer::sum);
            effortByCategory.merge(category, task.getEstimatedHours(), Integer::sum);
        }
        
        int totalEffort = tasks.stream().mapToInt(RemediationPlan.RemediationTask::getEstimatedHours).sum();
        String timeline = calculateTimeline(totalEffort);
        
        return RemediationPlan.builder()
            .planId(UUID.randomUUID().toString())
            .createdDate(new Date())
            .totalEffortHours(totalEffort)
            .tasks(tasks)
            .effortByPriority(effortByPriority)
            .effortByCategory(effortByCategory)
            .recommendedTimeline(timeline)
            .build();
    }
    
    /**
     * Calculate overall risk score for the project.
     */
    private double calculateOverallRiskScore(List<SecurityVulnerability> vulnerabilities) {
        if (vulnerabilities.isEmpty()) {
            return 0.0;
        }
        
        // Weighted average based on severity
        double totalWeightedScore = 0.0;
        double totalWeight = 0.0;
        
        for (SecurityVulnerability vuln : vulnerabilities) {
            double riskScore = vuln.calculateRiskScore();
            double weight = getSeverityWeight(vuln.getSeverity());
            
            totalWeightedScore += riskScore * weight;
            totalWeight += weight;
        }
        
        return totalWeight > 0 ? totalWeightedScore / totalWeight : 0.0;
    }
    
    // Helper methods
    private long countBySeverity(List<SecurityVulnerability> vulnerabilities, VulnerabilitySeverity severity) {
        return vulnerabilities.stream()
            .filter(v -> v.getSeverity() == severity)
            .count();
    }
    
    private double calculateAverageRiskScore(List<SecurityVulnerability> vulnerabilities) {
        return vulnerabilities.isEmpty() ? 0.0 : vulnerabilities.stream()
            .mapToDouble(SecurityVulnerability::calculateRiskScore)
            .average()
            .orElse(0.0);
    }
    
    private double calculateMaxRiskScore(List<SecurityVulnerability> vulnerabilities) {
        return vulnerabilities.stream()
            .mapToDouble(SecurityVulnerability::calculateRiskScore)
            .max()
            .orElse(0.0);
    }
    
    private Map<String, Long> calculateRiskDistribution(List<SecurityVulnerability> vulnerabilities) {
        return vulnerabilities.stream()
            .collect(Collectors.groupingBy(
                v -> v.getSeverity().name(),
                Collectors.counting()
            ));
    }
    
    private double calculateOwaspTop10Coverage(List<SecurityVulnerability> vulnerabilities) {
        Set<String> coveredCategories = vulnerabilities.stream()
            .filter(v -> v.getOwaspCategory() != null)
            .map(SecurityVulnerability::getOwaspCategory)
            .collect(Collectors.toSet());
        
        return coveredCategories.size() > 0 ? (double) coveredCategories.size() / 10.0 * 100.0 : 0.0;
    }
    
    private double calculateOwaspComplianceScore(List<SecurityVulnerability> vulnerabilities) {
        long owaspVulns = vulnerabilities.stream()
            .filter(v -> v.getOwaspCategory() != null && v.getCategory().isOwaspTop10())
            .count();
        
        // Start at 100, deduct 5 points per OWASP violation, minimum 0
        return Math.max(0, 100.0 - (owaspVulns * 5.0));
    }
    
    private double calculateCweCompliance(List<SecurityVulnerability> vulnerabilities) {
        Set<String> coveredCwes = vulnerabilities.stream()
            .filter(v -> v.getCweId() != null)
            .map(SecurityVulnerability::getCweId)
            .collect(Collectors.toSet());
        
        // Simplified: return 100 - (number of unique CWEs * 4)
        return Math.max(0, 100.0 - (coveredCwes.size() * 4.0));
    }
    
    private Map<String, Long> calculateCategoryDistribution(List<SecurityVulnerability> vulnerabilities) {
        return vulnerabilities.stream()
            .collect(Collectors.groupingBy(
                v -> v.getCategory().getDisplayName(),
                Collectors.counting()
            ));
    }
    
    private String findMostCommonCategory(List<SecurityVulnerability> vulnerabilities) {
        return calculateCategoryDistribution(vulnerabilities).entrySet().stream()
            .max(Map.Entry.comparingByValue())
            .map(Map.Entry::getKey)
            .orElse("None");
    }
    
    private long countFilesWithVulnerabilities(List<SecurityVulnerability> vulnerabilities) {
        return vulnerabilities.stream()
            .map(SecurityVulnerability::getFilePath)
            .filter(Objects::nonNull)
            .distinct()
            .count();
    }
    
    private double calculateVulnerabilityDensity(List<SecurityVulnerability> vulnerabilities, ProjectContext projectContext) {
        long totalLines = projectContext.sourceFiles().stream()
            .mapToLong(this::countLines)
            .sum();
        
        return totalLines > 0 ? (double) vulnerabilities.size() / totalLines * 1000 : 0.0; // Per 1000 lines
    }
    
    private long countLines(Path file) {
        try {
            return Files.lines(file).count();
        } catch (IOException e) {
            return 0;
        }
    }
    
    private List<String> getAffectedFiles(List<SecurityVulnerability> vulnerabilities, String owaspCategory) {
        return vulnerabilities.stream()
            .filter(v -> owaspCategory.equals(v.getOwaspCategory()))
            .map(SecurityVulnerability::getFilePath)
            .filter(Objects::nonNull)
            .distinct()
            .limit(10)
            .collect(Collectors.toList());
    }
    
    private List<String> getRecommendations(String owaspCategory) {
        return switch (owaspCategory) {
            case "A01:2021" -> List.of("Implement proper access control checks", "Use role-based access control (RBAC)");
            case "A02:2021" -> List.of("Use strong encryption algorithms", "Store secrets securely");
            case "A03:2021" -> List.of("Use parameterized queries", "Validate and sanitize all inputs");
            case "A07:2021" -> List.of("Implement multi-factor authentication", "Use secure session management");
            case "A10:2021" -> List.of("Validate and sanitize URLs", "Use URL whitelisting");
            default -> List.of("Review and fix the identified vulnerabilities");
        };
    }
    
    private String calculateComplianceLevel(double score) {
        if (score >= 90.0) return "COMPLIANT";
        if (score >= 50.0) return "PARTIAL";
        return "NON_COMPLIANT";
    }
    
    private String determinePriority(SecurityVulnerability vuln) {
        return switch (vuln.getSeverity()) {
            case CRITICAL -> "CRITICAL";
            case HIGH -> "HIGH";
            case MEDIUM -> "MEDIUM";
            case LOW -> "LOW";
            case INFO -> "LOW";
        };
    }
    
    private int estimateEffort(SecurityVulnerability vuln) {
        return switch (vuln.getSeverity()) {
            case CRITICAL -> 8;
            case HIGH -> 4;
            case MEDIUM -> 2;
            case LOW -> 1;
            case INFO -> 0;
        };
    }
    
    private double getSeverityWeight(VulnerabilitySeverity severity) {
        return switch (severity) {
            case CRITICAL -> 4.0;
            case HIGH -> 3.0;
            case MEDIUM -> 2.0;
            case LOW -> 1.0;
            case INFO -> 0.5;
        };
    }
    
    private String calculateTimeline(int totalHours) {
        if (totalHours <= 8) return "1 day";
        if (totalHours <= 40) return "1 week";
        if (totalHours <= 160) return "1 month";
        return "2-3 months";
    }
    
    /**
     * Custom exception for security assessment errors.
     */
    public static class SecurityAssessmentException extends RuntimeException {
        public SecurityAssessmentException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}

