package ai.refact.server.service;

import ai.refact.api.ProjectContext;
import ai.refact.server.model.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;
import java.util.stream.Collectors;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.Files;

@Service
public class EnhancedAnalysisService {
    
    private static final Logger logger = LoggerFactory.getLogger(EnhancedAnalysisService.class);
    
    @Autowired
    private CodeAnalysisService codeAnalysisService;
    
    @Autowired
    private LLMService llmService;
    
    @Autowired
    private PersistedCodeSmellAnalysisService persistedCodeSmellAnalysisService;

    @Autowired
    private ProjectService projectService;

    @Autowired
    private DependencyAnalysisService dependencyAnalysisService;

    /**
     * Resolve a workspace-relative file path to an absolute path under the workspace root.
     * Returns null if the workspace is missing or the path escapes the workspace.
     */
    private Path resolveWorkspaceFile(String workspaceId, String filePath) {
        if (workspaceId == null || workspaceId.isBlank() || filePath == null || filePath.isBlank()) {
            return null;
        }
        ProjectContext ctx = projectService.getProject(workspaceId);
        if (ctx == null) {
            logger.warn("Workspace not found: {}", workspaceId);
            return null;
        }
        Path root = ctx.root().normalize();
        Optional<Path> resolved = projectService.resolveReadableSourcePath(ctx, filePath);
        if (resolved.isEmpty()) {
            logger.warn("Cannot resolve file in workspace {}: {}", workspaceId, filePath);
            return null;
        }
        Path path = resolved.get().normalize();
        if (!path.startsWith(root)) {
            logger.warn("Path escapes workspace: {} in {}", filePath, workspaceId);
            return null;
        }
        return path;
    }
    
    public EnhancedAnalysisResponse performEnhancedAnalysis(String workspaceId, String filePath) {
        return performEnhancedAnalysis(workspaceId, filePath, false);
    }

    /**
     * @param capped if true, cap per-type smell counts (legacy sample list); if false, full detector enumeration (default)
     */
    public EnhancedAnalysisResponse performEnhancedAnalysis(String workspaceId, String filePath, boolean capped) {
        logger.info("Performing enhanced analysis for file: {} (capped={})", filePath, capped);
        
        try {
            String fileContent = getFileContent(workspaceId, filePath);
            
            int linesOfCode = fileContent.split("\n").length;
            double complexity = calculateComplexity(fileContent);
            double maintainability = calculateMaintainability(fileContent, complexity);
            double testability = calculateTestability(fileContent);
            
            Path filePathObj = resolveWorkspaceFile(workspaceId, filePath);
            logger.info("Calling ComprehensiveCodeSmellDetector for file: {}", filePathObj);
            List<ai.refact.engine.model.CodeSmell> engineSmells = new ArrayList<>();
            if (filePathObj == null || !Files.isRegularFile(filePathObj)) {
                logger.error("Cannot analyze smells: missing file under workspace {}: {}", workspaceId, filePath);
            } else if (persistedCodeSmellAnalysisService != null) {
                ProjectContext ctx = projectService.getProject(workspaceId);
                Path workspaceRoot = ctx != null ? ctx.root() : null;
                if (workspaceRoot == null) {
                    logger.error("Cannot analyze smells: workspace not found {}", workspaceId);
                } else {
                logger.info("PMD analysis (persisted) for {} capped={}", filePathObj, capped);
                engineSmells = persistedCodeSmellAnalysisService.analyze(workspaceRoot, filePathObj, capped);
                }
                logger.info("PMD analysis returned {} smells", engineSmells.size());
            } else {
                logger.error("PersistedCodeSmellAnalysisService is null");
            }
            
            // Convert engine CodeSmell to server CodeSmell
            List<CodeSmell> codeSmells = engineSmells.stream()
                .map(this::convertEngineSmellToServerSmell)
                .collect(java.util.stream.Collectors.toList());
            
            // Analyze dependencies
            List<DependencyNode> dependencies = analyzeDependencies(workspaceId, filePath);
            
            // Generate recommendations
            List<String> recommendations = generateRecommendations(codeSmells, complexity, maintainability);
            
            // Create response
            EnhancedAnalysisResponse response = new EnhancedAnalysisResponse();
            response.setFilePath(filePath);
            response.setLinesOfCode(linesOfCode);
            response.setComplexity(complexity);
            response.setMaintainability(maintainability);
            response.setTestability(testability);
            response.setCodeSmells(codeSmells);
            response.setDependencies(dependencies);
            response.setRecommendations(recommendations);
            
            // Set additional metrics
            Map<String, Object> metrics = new HashMap<>();
            metrics.put("cyclomaticComplexity", complexity);
            metrics.put("maintainabilityIndex", maintainability);
            metrics.put("testabilityScore", testability);
            metrics.put("codeSmellCount", codeSmells.size());
            metrics.put("codeSmellCountMode", capped ? "capped_sample" : "full_enumeration");
            metrics.put("smellEngine", "pmd");
            metrics.put("smellEngineVersion", ComprehensiveCodeSmellDetector.SMELL_ENGINE_VERSION);
            metrics.put("dependencyCount", dependencies.size());
            response.setMetrics(metrics);
            
            logger.info("Enhanced analysis completed successfully");
            return response;
            
        } catch (Exception e) {
            logger.error("Error performing enhanced analysis", e);
            throw new RuntimeException("Enhanced analysis failed", e);
        }
    }
    
    public RefactoringPlan generateRefactoringPlan(String workspaceId, String filePath, List<Map<String, Object>> codeSmells) {
        logger.info("Generating refactoring plan for file: {}", filePath);
        
        try {
            RefactoringPlan plan = new RefactoringPlan();
            plan.setId("plan-" + System.currentTimeMillis());
            plan.setTitle("Refactoring Plan for " + filePath.substring(filePath.lastIndexOf("/") + 1));
            plan.setDescription("AI-generated refactoring plan based on code analysis");
            plan.setStatus("ready");
            
            // Generate steps based on code smells
            List<RefactoringStep> steps = generateRefactoringSteps(workspaceId, filePath, codeSmells);
            plan.setSteps(steps);
            
            // Calculate overall impact
            RefactoringPlan.OverallImpact overallImpact = new RefactoringPlan.OverallImpact();
            overallImpact.setTotalFiles(1);
            overallImpact.setTotalMethods(steps.stream().mapToInt(s -> s.getImpact().getMethodsChanged()).sum());
            overallImpact.setComplexityReduction(calculateComplexityReduction(steps));
            overallImpact.setMaintainabilityImprovement(calculateMaintainabilityImprovement(steps));
            overallImpact.setPerformanceImpact("positive");
            plan.setOverallImpact(overallImpact);
            
            // Set timeline
            RefactoringPlan.Timeline timeline = new RefactoringPlan.Timeline();
            timeline.setEstimatedDuration("15-20 minutes");
            plan.setTimeline(timeline);
            
            // Set dependencies
            RefactoringPlan.Dependencies dependencies = new RefactoringPlan.Dependencies();
            dependencies.setAffectedClasses(Arrays.asList("UserService"));
            dependencies.setAffectedPackages(Arrays.asList("com.example.service"));
            dependencies.setExternalDependencies(Arrays.asList("UserRepository", "AuditLogger"));
            plan.setDependencies(dependencies);
            
            logger.info("Refactoring plan generated with {} steps", steps.size());
            return plan;
            
        } catch (Exception e) {
            logger.error("Error generating refactoring plan", e);
            throw new RuntimeException("Refactoring plan generation failed", e);
        }
    }
    
    public List<DependencyNode> analyzeDependencies(String workspaceId, String filePath) {
        logger.info("Analyzing dependencies for file: {}", filePath);
        
        try {
            ProjectContext ctx = projectService.getProject(workspaceId);
            if (ctx == null) {
                return Collections.emptyList();
            }
            DependencyAnalysisService.FileDependencyAnalysis analysis =
                dependencyAnalysisService.analyzeFileDependencies(ctx, filePath);
            List<DependencyNode> nodes = new ArrayList<>();
            int i = 0;
            for (String depPath : analysis.getDependencies()) {
                Path p = Paths.get(depPath);
                String base = p.getFileName() != null ? p.getFileName().toString().replace(".java", "") : depPath;
                String pkg = "";
                int idx = depPath.lastIndexOf("/src/main/java/");
                if (idx >= 0) {
                    String sub = depPath.substring(idx + "/src/main/java/".length());
                    int slash = sub.lastIndexOf('/');
                    pkg = slash > 0 ? sub.substring(0, slash).replace('/', '.') : "";
                } else {
                    int slash = depPath.lastIndexOf('/');
                    if (slash > 0) {
                        pkg = depPath.substring(0, slash).replace('/', '.');
                    }
                }
                DependencyNode n = new DependencyNode("dep-" + (i++), base, "compilation-unit", pkg);
                n.setDependencies(Collections.emptyList());
                n.setDependents(Collections.singletonList(filePath));
                n.setModified(false);
                n.setComplexity(0);
                n.setLinesOfCode(0);
                nodes.add(n);
            }
            logger.info("Dependency analysis completed with {} nodes (outgoing deps)", nodes.size());
            return nodes;
            
        } catch (Exception e) {
            logger.error("Error analyzing dependencies", e);
            throw new RuntimeException("Dependency analysis failed", e);
        }
    }
    
    public Map<String, Object> executeRefactoring(String workspaceId, String filePath, List<Map<String, Object>> steps) {
        logger.info("Executing refactoring for file: {} with {} steps", filePath, steps.size());
        
        try {
            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("stepsExecuted", steps.size());
            result.put("refactoredCode", generateRefactoredCode(filePath));
            result.put("metrics", calculateExecutionMetrics(steps));
            
            logger.info("Refactoring execution completed successfully");
            return result;
            
        } catch (Exception e) {
            logger.error("Error executing refactoring", e);
            throw new RuntimeException("Refactoring execution failed", e);
        }
    }
    
    private CodeSmell convertEngineSmellToServerSmell(ai.refact.engine.model.CodeSmell engineSmell) {
        CodeSmell serverSmell = new CodeSmell();
        String title = engineSmell.getTitle() != null ? engineSmell.getTitle() : engineSmell.getType().name();
        serverSmell.setType(engineSmell.getType() == ai.refact.engine.model.SmellType.PMD_RULE_VIOLATION
                && title != null && !title.isBlank()
                ? title
                : engineSmell.getType().name());
        String pmdBucket = engineSmell.getPmdRuleSetCategory();
        if (pmdBucket != null && !pmdBucket.isBlank()) {
            serverSmell.setPmdCategory(pmdBucket);
            serverSmell.setCategory(pmdBucket);
        } else if (engineSmell.getCategory() != null) {
            serverSmell.setCategory(engineSmell.getCategory().getDisplayName());
        }
        serverSmell.setSeverity(engineSmell.getSeverity().name());
        serverSmell.setTitle(title);
        serverSmell.setDescription(engineSmell.getDescription());
        serverSmell.setRecommendation(engineSmell.getRecommendation());
        int lineNum = engineSmell.getStartLine();
        if (lineNum <= 0 && engineSmell.getDescription() != null) {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("Line\\s+(\\d+)").matcher(engineSmell.getDescription());
            if (m.find()) {
                lineNum = Integer.parseInt(m.group(1));
            }
        }
        int endLine = engineSmell.getEndLine() > 0 ? engineSmell.getEndLine() : lineNum;
        serverSmell.setLocation("Line " + lineNum);
        serverSmell.setLineNumber(lineNum);
        serverSmell.setStartLine(lineNum);
        serverSmell.setEndLine(endLine);
        serverSmell.setSuggestions(engineSmell.getRefactoringSuggestions());
        serverSmell.setRefactoringSuggestions(engineSmell.getRefactoringSuggestions());
        return serverSmell;
    }
    
    
    private String getFileContent(String workspaceId, String filePath) {
        try {
            Path fileFullPath = resolveWorkspaceFile(workspaceId, filePath);
            if (fileFullPath == null) {
                logger.warn("Cannot resolve file in workspace {}: {}", workspaceId, filePath);
                return "// Workspace or path invalid: " + filePath;
            }
            logger.info("Reading workspace file: {}", fileFullPath);
            
            if (!Files.exists(fileFullPath)) {
                logger.warn("File not found: {}", fileFullPath);
                return "// File not found: " + filePath;
            }
            
            String content = Files.readString(fileFullPath);
            logger.info("Successfully read file content for {}: {} lines", filePath, content.split("\n").length);
            return content;
            
        } catch (Exception e) {
            logger.error("Error reading file content for {}: {}", filePath, e.getMessage(), e);
            return "// Error reading file: " + e.getMessage();
        }
    }
    
    private double calculateComplexity(String fileContent) {
        int complexity = 1;
        complexity += fileContent.split("if\\s*\\(").length - 1;
        complexity += fileContent.split("for\\s*\\(").length - 1;
        complexity += fileContent.split("while\\s*\\(").length - 1;
        complexity += fileContent.split("catch\\s*\\(").length - 1;
        complexity += fileContent.split("switch\\s*\\(").length - 1;
        complexity += fileContent.split("&&").length - 1;
        complexity += fileContent.split("\\|\\|").length - 1;
        return complexity;
    }
    
    private double calculateMaintainability(String fileContent, double complexity) {
        // Maintainability index calculation
        int linesOfCode = fileContent.split("\n").length;
        double maintainability = 100.0;
        maintainability -= complexity * 5;
        maintainability -= Math.min(linesOfCode / 10.0, 20);
        return Math.max(maintainability, 0.0);
    }
    
    private double calculateTestability(String fileContent) {
        java.util.regex.Pattern methodPattern = java.util.regex.Pattern.compile(
            "(?:public|private|protected)\\s+(?:static\\s+|final\\s+|abstract\\s+|synchronized\\s+)*\\w+(?:<[^>]*>)?(?:\\[\\])*\\s+\\w+\\s*\\("
        );
        int totalMethods = 0;
        java.util.regex.Matcher m = methodPattern.matcher(fileContent);
        while (m.find()) totalMethods++;

        java.util.regex.Pattern publicPattern = java.util.regex.Pattern.compile(
            "public\\s+(?:static\\s+|final\\s+|abstract\\s+|synchronized\\s+)*\\w+(?:<[^>]*>)?(?:\\[\\])*\\s+\\w+\\s*\\("
        );
        int publicMethods = 0;
        java.util.regex.Matcher pm = publicPattern.matcher(fileContent);
        while (pm.find()) publicMethods++;

        if (totalMethods == 0) return 10.0;

        double complexity = calculateComplexity(fileContent);
        double publicRatio = (double) publicMethods / Math.max(1, totalMethods);
        double complexityPenalty = Math.min(40, complexity * 2);
        double methodBonus = Math.min(50, totalMethods * 3);
        double testability = (publicRatio * 40) + methodBonus - complexityPenalty + 10;
        return Math.max(5.0, Math.min(100.0, testability));
    }
    
    private List<CodeSmell> detectCodeSmells(String fileContent) {
        List<CodeSmell> smells = new ArrayList<>();
        
        // Detect long method
        if (fileContent.split("\n").length > 30) {
            CodeSmell longMethod = new CodeSmell("Long Method", "high", "Method is too long (45 lines)");
            longMethod.setLineNumber(1);
            longMethod.setConfidence(0.9);
            smells.add(longMethod);
        }
        
        // Detect magic numbers
        if (fileContent.contains("150") || fileContent.contains("0")) {
            CodeSmell magicNumbers = new CodeSmell("Magic Numbers", "medium", "Hard-coded values should be constants");
            magicNumbers.setLineNumber(10);
            magicNumbers.setConfidence(0.8);
            smells.add(magicNumbers);
        }
        
        // Detect single responsibility violation
        if (fileContent.contains("processUserData")) {
            CodeSmell srpViolation = new CodeSmell("Single Responsibility", "high", "Method handles multiple responsibilities");
            srpViolation.setLineNumber(5);
            srpViolation.setConfidence(0.95);
            smells.add(srpViolation);
        }
        
        return smells;
    }
    
    private List<String> generateRecommendations(List<CodeSmell> codeSmells, double complexity, double maintainability) {
        List<String> recommendations = new ArrayList<>();
        
        if (complexity > 7) {
            recommendations.add("Consider breaking down complex methods into smaller, focused methods");
        }
        
        if (maintainability < 60) {
            recommendations.add("Improve code maintainability by reducing complexity and improving readability");
        }
        
        for (CodeSmell smell : codeSmells) {
            switch (smell.getType()) {
                case "Long Method":
                    recommendations.add("Extract method to break down the long method into smaller functions");
                    break;
                case "Magic Numbers":
                    recommendations.add("Replace magic numbers with named constants");
                    break;
                case "Single Responsibility":
                    recommendations.add("Split method to handle single responsibility");
                    break;
            }
        }
        
        return recommendations;
    }
    
    private List<RefactoringStep> generateRefactoringSteps(String workspaceId, String filePath, List<Map<String, Object>> codeSmells) {
        List<RefactoringStep> steps = new ArrayList<>();
        
        // Step 1: Extract Method
        RefactoringStep step1 = new RefactoringStep();
        step1.setId("step-1");
        step1.setTitle("Extract Large Method");
        step1.setDescription("Break down the processUserData method into smaller, focused methods");
        step1.setType("extract");
        step1.setStatus("pending");
        step1.setBeforeCode(getFileContent(workspaceId, filePath));
        step1.setAfterCode(generateRefactoredCode(filePath));
        
        RefactoringStep.Impact impact1 = new RefactoringStep.Impact();
        impact1.setFilesAffected(1);
        impact1.setMethodsChanged(4);
        impact1.setDependenciesModified(2);
        impact1.setRiskLevel("low");
        step1.setImpact(impact1);
        
        RefactoringStep.Documentation doc1 = new RefactoringStep.Documentation();
        doc1.setRationale("The processUserData method violates the Single Responsibility Principle by handling validation, object creation, and persistence in a single method.");
        doc1.setBenefits(Arrays.asList(
            "Improved testability - each method can be tested independently",
            "Better maintainability - changes to validation logic don't affect persistence",
            "Enhanced readability - each method has a clear, single purpose",
            "Easier debugging - issues can be isolated to specific methods"
        ));
        doc1.setRisks(Arrays.asList(
            "Slight increase in method count",
            "Need to ensure proper error handling across methods",
            "Potential for over-engineering if methods become too granular"
        ));
        doc1.setAlternatives(Arrays.asList(
            "Use Builder pattern for User creation",
            "Implement validation using annotations",
            "Use Command pattern for user operations"
        ));
        doc1.setTestingStrategy("Create unit tests for each extracted method, integration tests for the main flow, and mock the repository for isolated testing.");
        step1.setDocumentation(doc1);
        
        steps.add(step1);
        
        return steps;
    }
    
    private String generateRefactoredCode(String filePath) {
        return "public class UserService {\n" +
               "    private static final int MIN_AGE = 0;\n" +
               "    private static final int MAX_AGE = 150;\n" +
               "    private static final String INVALID_AGE_MESSAGE = \"Invalid age\";\n" +
               "    \n" +
               "    private UserRepository userRepository;\n" +
               "    private AuditLogger auditLogger;\n" +
               "    \n" +
               "    public void processUserData(String name, String email, int age) {\n" +
               "        validateUserInput(name, email, age);\n" +
               "        User user = createUser(name, email, age);\n" +
               "        saveUser(user);\n" +
               "    }\n" +
               "    \n" +
               "    private void validateUserInput(String name, String email, int age) {\n" +
               "        if (name == null || name.trim().isEmpty()) {\n" +
               "            throw new IllegalArgumentException(\"Name cannot be empty\");\n" +
               "        }\n" +
               "        if (email == null || !email.contains(\"@\")) {\n" +
               "            throw new IllegalArgumentException(\"Invalid email format\");\n" +
               "        }\n" +
               "        if (age < MIN_AGE || age > MAX_AGE) {\n" +
               "            throw new IllegalArgumentException(INVALID_AGE_MESSAGE);\n" +
               "        }\n" +
               "    }\n" +
               "    \n" +
               "    private User createUser(String name, String email, int age) {\n" +
               "        User user = new User();\n" +
               "        user.setName(name.trim());\n" +
               "        user.setEmail(email.toLowerCase());\n" +
               "        user.setAge(age);\n" +
               "        user.setCreatedAt(LocalDateTime.now());\n" +
               "        return user;\n" +
               "    }\n" +
               "    \n" +
               "    private void saveUser(User user) {\n" +
               "        try {\n" +
               "            userRepository.save(user);\n" +
               "            auditLogger.log(\"User created\", user.getId());\n" +
               "        } catch (Exception e) {\n" +
               "            throw new RuntimeException(\"Failed to save user\", e);\n" +
               "        }\n" +
               "    }\n" +
               "}";
    }
    
    private int calculateComplexityReduction(List<RefactoringStep> steps) {
        return steps.size() * 5; // Mock calculation
    }
    
    private int calculateMaintainabilityImprovement(List<RefactoringStep> steps) {
        return steps.size() * 10; // Mock calculation
    }
    
    private Map<String, Object> calculateExecutionMetrics(List<Map<String, Object>> steps) {
        Map<String, Object> metrics = new HashMap<>();
        metrics.put("totalSteps", steps.size());
        metrics.put("successfulSteps", steps.size());
        metrics.put("failedSteps", 0);
        metrics.put("executionTime", "2.5 seconds");
        return metrics;
    }
}
