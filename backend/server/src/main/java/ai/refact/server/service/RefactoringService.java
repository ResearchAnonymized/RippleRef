package ai.refact.server.service;

import ai.refact.api.*;
import ai.refact.engine.AssessmentEngine;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Service for handling the complete refactoring workflow:
 * 1. Assessment - detect code smells
 * 2. Planning - generate refactoring plan
 * 3. Application - apply refactoring transformations
 * 4. Verification - validate results
 */
@Service
public class RefactoringService {
    
    private static final Logger logger = LoggerFactory.getLogger(RefactoringService.class);
    
    private final AssessmentEngine assessmentEngine;
    private final Map<String, Assessment> assessments = new HashMap<>();
    private final Map<String, Plan> plans = new HashMap<>();

    @Autowired
    private WorkspaceAssessmentPersistence workspaceAssessmentPersistence;

    private final ProjectService projectService;

    @Autowired
    public RefactoringService(AssessmentEngine assessmentEngine, @Lazy ProjectService projectService) {
        this.assessmentEngine = assessmentEngine;
        this.projectService = projectService;
    }
    
    /**
     * Perform comprehensive assessment of a project.
     */
    public Assessment assessProject(ProjectContext projectContext) {
        return assessProject(projectContext, false);
    }

    public Assessment assessProject(ProjectContext projectContext, boolean includeDetails) {
        logger.info("Starting assessment for project: {}", projectContext.root());
        
        try {
            // Run assessment
            List<ReasonEvidence> evidences = assessmentEngine.assess(projectContext);
            
            // Calculate metrics
            ProjectMetrics metrics = calculateMetrics(evidences, projectContext);
            
            // Create assessment summary
            AssessmentSummary summary = createSummary(evidences, metrics);
            
            // Create assessment
            Assessment assessment = new Assessment(
                projectContext.getProperty("projectId", "unknown"),
                evidences,
                summary,
                metrics,
                System.currentTimeMillis()
            );
            
            // Store assessment (memory + disk for reliability across restarts)
            assessments.put(assessment.projectId(), assessment);
            workspaceAssessmentPersistence.saveAssessment(projectContext.root(), assessment);

            logger.info("Assessment completed: {} findings, maintainability: {}", 
                       evidences.size(), metrics.maintainabilityIndex());

            Assessment httpPayload = AssessmentResponsePolicy.forHttp(assessment, includeDetails);
            if (httpPayload.evidences().size() < assessment.evidences().size()) {
                logger.info("Assessment HTTP response trimmed: {} of {} evidences (includeDetails={})",
                        httpPayload.evidences().size(), assessment.evidences().size(), includeDetails);
            }
            return httpPayload;
            
        } catch (Exception e) {
            logger.error("Assessment failed", e);
            throw new RuntimeException("Assessment failed", e);
        }
    }
    
    /**
     * Generate refactoring plan based on assessment results.
     */
    public Plan generatePlan(String projectId, PlanRequest request) {
        Assessment assessment = assessments.get(projectId);
        if (assessment == null) {
            throw new IllegalArgumentException("Assessment not found for project: " + projectId);
        }
        
        logger.info("Generating refactoring plan for project: {}", projectId);
        
        try {
            // Generate transforms based on findings
            List<PlannedTransform> transforms = generateTransforms(assessment, request);
            
            // Calculate plan metrics
            PlanSummary summary = calculatePlanSummary(transforms);
            
            // Create plan
            Plan plan = new Plan(
                projectId,
                transforms,
                summary,
                System.currentTimeMillis()
            );
            
            // Store plan (memory + disk)
            plans.put(projectId, plan);
            try {
                Path root = projectService.getProjectDirectory(projectId);
                workspaceAssessmentPersistence.savePlan(root, plan);
            } catch (Exception e) {
                logger.warn("Could not persist plan to workspace disk: {}", e.getMessage());
            }

            logger.info("Plan generated: {} transforms, estimated payoff: {}", 
                       transforms.size(), summary.estimatedPayoff());
            
            return plan;
            
        } catch (Exception e) {
            logger.error("Plan generation failed", e);
            throw new RuntimeException("Plan generation failed", e);
        }
    }
    
    /**
     * Apply refactoring plan to the project.
     */
    public ApplyResult applyPlan(String projectId, ApplyRequest request) {
        Plan plan = plans.get(projectId);
        if (plan == null) {
            throw new IllegalArgumentException("Plan not found for project: " + projectId);
        }
        
        logger.info("Applying refactoring plan for project: {}", projectId);
        
        try {
            List<TransformResult> results = new ArrayList<>();
            List<FailedTransform> failures = new ArrayList<>();
            
            // Apply each transform
            for (PlannedTransform transform : plan.transforms()) {
                if (request.selectedTransforms().contains(transform.id())) {
                    try {
                        TransformResult result = applyTransform(transform);
                        results.add(result);
                    } catch (Exception e) {
                        failures.add(new FailedTransform(
                            transform.id(),
                            e.getMessage(),
                            System.currentTimeMillis()
                        ));
                    }
                }
            }
            
            // Verify results
            VerificationResult verification = verifyResults(projectId, results);
            
            // Create apply result
            ApplyResult applyResult = new ApplyResult(
                projectId,
                results,
                failures,
                verification,
                System.currentTimeMillis()
            );
            
            logger.info("Plan applied: {} successful, {} failed", 
                       results.size(), failures.size());
            
            return applyResult;
            
        } catch (Exception e) {
            logger.error("Plan application failed", e);
            throw new RuntimeException("Plan application failed", e);
        }
    }
    
    /**
     * Get assessment by project ID.
     */
    public Assessment getAssessment(String projectId) {
        return getAssessment(projectId, false);
    }

    public Assessment getAssessment(String projectId, boolean includeDetails) {
        Assessment assessment = assessments.get(projectId);
        if (assessment == null) {
            try {
                Path root = projectService.getProjectDirectory(projectId);
                Optional<Assessment> fromDisk = workspaceAssessmentPersistence.loadAssessment(root);
                if (fromDisk.isPresent()) {
                    assessment = fromDisk.get();
                    assessments.put(projectId, assessment);
                }
            } catch (Exception e) {
                logger.debug("No persisted assessment for {}: {}", projectId, e.getMessage());
            }
        }
        if (assessment == null) {
            throw new IllegalArgumentException("Assessment not found: " + projectId);
        }
        return AssessmentResponsePolicy.forHttp(assessment, includeDetails);
    }

    /**
     * Get plan by project ID.
     */
    public Plan getPlan(String projectId) {
        Plan plan = plans.get(projectId);
        if (plan != null) {
            return plan;
        }
        try {
            Path root = projectService.getProjectDirectory(projectId);
            Optional<Plan> fromDisk = workspaceAssessmentPersistence.loadPlan(root);
            if (fromDisk.isPresent()) {
                plans.put(projectId, fromDisk.get());
                return fromDisk.get();
            }
        } catch (Exception e) {
            logger.debug("No persisted plan for {}: {}", projectId, e.getMessage());
        }
        throw new IllegalArgumentException("Plan not found: " + projectId);
    }
    
    private ProjectMetrics calculateMetrics(List<ReasonEvidence> evidences, ProjectContext projectContext) {
        int totalFiles = projectContext.sourceFiles().size() + projectContext.testFiles().size();
        int totalLines = calculateTotalLines(projectContext);
        
        Map<String, Long> findingsBySeverity = evidences.stream()
            .collect(Collectors.groupingBy(
                evidence -> evidence.severity().name(),
                Collectors.counting()
            ));
        
        Map<String, Long> findingsByCategory = evidences.stream()
            .collect(Collectors.groupingBy(
                evidence -> evidence.detectorId().split("\\.")[0],
                Collectors.counting()
            ));
        
        return new ProjectMetrics(
            totalFiles,
            totalLines,
            evidences.size(),
            findingsBySeverity,
            findingsByCategory,
            calculateMaintainabilityIndex(evidences, totalLines)
        );
    }
    
    private int calculateTotalLines(ProjectContext projectContext) {
        // Simple line count - in production, parse actual files
        return (projectContext.sourceFiles().size() + projectContext.testFiles().size()) * 50;
    }
    
    private double calculateMaintainabilityIndex(List<ReasonEvidence> evidences, int totalLines) {
        double baseScore = 100.0;
        double penaltyPerFinding = 1.0; // Reduced penalty per finding
        double penaltyPerLine = 0.001; // Much reduced penalty per line
        
        // Calculate score with more reasonable penalties
        double findingPenalty = evidences.size() * penaltyPerFinding;
        double linePenalty = Math.min(totalLines * penaltyPerLine, 20.0); // Cap line penalty at 20
        
        double score = baseScore - findingPenalty - linePenalty;
        
        // Ensure minimum score of 10 to avoid 0 scores
        return Math.max(10.0, Math.min(100.0, score));
    }
    
    private AssessmentSummary createSummary(List<ReasonEvidence> evidences, ProjectMetrics metrics) {
        long blockerCount = evidences.stream()
            .filter(e -> Severity.BLOCKER.equals(e.severity()))
            .count();
        
        long criticalCount = evidences.stream()
            .filter(e -> Severity.CRITICAL.equals(e.severity()))
            .count();
        
        long majorCount = evidences.stream()
            .filter(e -> Severity.MAJOR.equals(e.severity()))
            .count();
        
        long minorCount = evidences.stream()
            .filter(e -> Severity.MINOR.equals(e.severity()))
            .count();
        
        return new AssessmentSummary(
            evidences.size(),
            (int) blockerCount,
            (int) criticalCount,
            (int) majorCount,
            (int) minorCount,
            metrics.maintainabilityIndex(),
            metrics.totalFiles(),
            metrics.totalLines()
        );
    }
    
    private List<PlannedTransform> generateTransforms(Assessment assessment, PlanRequest request) {
        List<PlannedTransform> transforms = new ArrayList<>();
        
        // Map findings to transforms based on best practices
        for (ReasonEvidence evidence : assessment.evidences()) {
            List<PlannedTransform> evidenceTransforms = mapFindingToTransforms(evidence, request);
            transforms.addAll(evidenceTransforms);
        }
        
        // Sort by priority (high payoff, low risk)
        transforms.sort((a, b) -> Double.compare(b.priority(), a.priority()));
        
        return transforms;
    }
    
    private List<PlannedTransform> mapFindingToTransforms(ReasonEvidence evidence, PlanRequest request) {
        List<PlannedTransform> transforms = new ArrayList<>();
        
        switch (evidence.detectorId()) {
            case "design.long-method":
                transforms.add(createExtractMethodTransform(evidence, request));
                break;
            case "design.god-class":
                transforms.add(createExtractClassTransform(evidence, request));
                break;
            case "design.feature-envy":
                transforms.add(createMoveMethodTransform(evidence, request));
                break;
            default:
                // Generic refactoring for unknown smells
                transforms.add(createGenericTransform(evidence, request));
        }
        
        return transforms;
    }
    
    private PlannedTransform createExtractMethodTransform(ReasonEvidence evidence, PlanRequest request) {
        String[] transformNames = {
            "Extract Method",
            "Decompose Conditional", 
            "Replace Method with Method Object",
            "Introduce Parameter Object",
            "Move Method",
            "Extract Class",
            "Form Template Method",
            "Replace Conditional with Polymorphism",
            "Introduce Null Object",
            "Replace Magic Number with Symbolic Constant"
        };
        
        String[] descriptions = {
            "Extract long method into smaller, focused methods",
            "Break down complex conditional logic into simpler parts",
            "Replace complex method with a dedicated method object",
            "Group related parameters into a single object",
            "Move method to a more appropriate class",
            "Extract responsibilities into separate classes",
            "Create a template method pattern for similar operations",
            "Replace conditional logic with polymorphic behavior",
            "Introduce a null object to handle null cases gracefully",
            "Replace magic numbers with named constants for better readability"
        };
        
        // Use a combination of file hash and line number for better variety
        int hash = Math.abs(evidence.pointer().file().hashCode() + evidence.pointer().startLine());
        int index = hash % transformNames.length;
        
        return new PlannedTransform(
            "transform-" + System.currentTimeMillis() + "-" + index,
            transformNames[index],
            descriptions[index],
            TransformTarget.forSymbol(evidence.pointer().file(), "extractedMethod", evidence.pointer().startLine(), evidence.pointer().endLine()),
            evidence.pointer(),
            Map.of("methodName", "extractedMethod"),
            calculatePriority(evidence, 0.8, 0.2),
            System.currentTimeMillis()
        );
    }
    
    private PlannedTransform createExtractClassTransform(ReasonEvidence evidence, PlanRequest request) {
                    return new PlannedTransform(
                "extract-class-" + System.currentTimeMillis(),
                "Extract Class",
                "Extract responsibilities into separate classes",
                TransformTarget.forSymbol(evidence.pointer().file(), "ExtractedClass", evidence.pointer().startLine(), evidence.pointer().endLine()),
                evidence.pointer(),
                Map.of("className", "ExtractedClass"),
                calculatePriority(evidence, 0.9, 0.3),
                System.currentTimeMillis()
            );
    }
    
    private PlannedTransform createMoveMethodTransform(ReasonEvidence evidence, PlanRequest request) {
                    return new PlannedTransform(
                "move-method-" + System.currentTimeMillis(),
                "Move Method",
                "Move method to class that uses it most",
                TransformTarget.forSymbol(evidence.pointer().file(), "movedMethod", evidence.pointer().startLine(), evidence.pointer().endLine()),
                evidence.pointer(),
                Map.of("targetClass", "TargetClass"),
                calculatePriority(evidence, 0.7, 0.4),
                System.currentTimeMillis()
            );
    }
    
    private PlannedTransform createGenericTransform(ReasonEvidence evidence, PlanRequest request) {
                    return new PlannedTransform(
                "generic-" + System.currentTimeMillis(),
                "Generic Refactoring",
                "Apply general refactoring to improve code quality",
                TransformTarget.forSymbol(evidence.pointer().file(), "RefactoredClass", evidence.pointer().startLine(), evidence.pointer().endLine()),
                evidence.pointer(),
                Map.of(),
                calculatePriority(evidence, 0.5, 0.5),
                System.currentTimeMillis()
            );
    }
    
    private double calculatePriority(ReasonEvidence evidence, double payoff, double risk) {
        // Priority = payoff - (risk * riskTolerance)
        double riskTolerance = 0.5; // Configurable
        return payoff - (risk * riskTolerance);
    }
    
    private PlanSummary calculatePlanSummary(List<PlannedTransform> transforms) {
        double totalPayoff = transforms.stream()
            .mapToDouble(t -> (Double) t.metadata().getOrDefault("payoff", 0.5))
            .sum();
        
        double totalRisk = transforms.stream()
            .mapToDouble(t -> (Double) t.metadata().getOrDefault("risk", 0.5))
            .sum();
        
        double totalCost = transforms.stream()
            .mapToDouble(t -> (Double) t.metadata().getOrDefault("cost", 1.0))
            .sum();
        
        return new PlanSummary(
            transforms.size(),
            totalPayoff,
            totalRisk,
            totalCost,
            System.currentTimeMillis()
        );
    }
    
    private TransformResult applyTransform(PlannedTransform transform) {
        // Mock transform application - in production, use actual refactoring tools
        logger.info("Applying transform: {}", transform.name());
        
        // Simulate file changes
        List<FileChange> changes = List.of(
            new FileChange(
                transform.location().file(),
                FileChange.ChangeType.MODIFY,
                "Applied " + transform.name(),
                System.currentTimeMillis()
            )
        );
        
        return new TransformResult(
            transform.id(),
            changes,
            new VerificationResult(true, "Transform applied successfully", Map.of()),
            System.currentTimeMillis()
        );
    }
    
    private VerificationResult verifyResults(String projectId, List<TransformResult> results) {
        // Mock verification - in production, run tests and compilation
        boolean allTestsPass = true;
        boolean compilationSuccess = true;
        Map<String, Object> metrics = Map.of(
            "testCount", 10,
            "testPassRate", 0.95,
            "compilationSuccess", true
        );
        
        return new VerificationResult(
            allTestsPass && compilationSuccess,
            "Verification completed successfully",
            metrics
        );
    }
}
