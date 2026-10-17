package ai.refact.engine.analysis;

import ai.refact.api.ProjectContext;
import ai.refact.api.CodePointer;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;
import java.util.*;
import java.util.stream.Collectors;
import java.util.regex.Pattern;
import java.util.regex.Matcher;
import java.io.IOException;
import java.nio.file.Files;

/**
 * Analyzes the ripple impact of refactoring operations across the entire project.
 * This is crucial for safe refactoring - understanding what will break when we change code.
 */
@Component
public class RippleImpactAnalyzer {
    
    private static final Logger logger = LoggerFactory.getLogger(RippleImpactAnalyzer.class);
    
    // Patterns for detecting dependencies
    private static final Pattern METHOD_CALL_PATTERN = Pattern.compile("\\b(\\w+)\\s*\\(");
    private static final Pattern FIELD_ACCESS_PATTERN = Pattern.compile("\\b(\\w+)\\.(\\w+)");
    private static final Pattern IMPORT_PATTERN = Pattern.compile("import\\s+([\\w.]+);");
    private static final Pattern CLASS_EXTENDS_PATTERN = Pattern.compile("class\\s+\\w+\\s+extends\\s+(\\w+)");
    private static final Pattern CLASS_IMPLEMENTS_PATTERN = Pattern.compile("class\\s+\\w+\\s+implements\\s+([\\w,\\s]+)");
    private static final Pattern INTERFACE_PATTERN = Pattern.compile("interface\\s+(\\w+)");
    
    /**
     * Analyzes the ripple impact of a proposed refactoring operation.
     * 
     * @param projectContext The project context
     * @param refactoringOperation The proposed refactoring operation
     * @return RippleImpactAnalysis containing all affected files and dependencies
     */
    public RippleImpactAnalysis analyzeImpact(ProjectContext projectContext, RefactoringOperation refactoringOperation) {
        logger.info("Analyzing ripple impact for operation: {}", refactoringOperation.getType());
        
        Set<ImpactedFile> impactedFiles = new HashSet<>();
        Set<Dependency> dependencies = new HashSet<>();
        
        // Analyze different types of refactoring operations
        switch (refactoringOperation.getType()) {
            case EXTRACT_METHOD:
                analyzeExtractMethodImpact(projectContext, refactoringOperation, impactedFiles, dependencies);
                break;
            case RENAME_METHOD:
                analyzeRenameMethodImpact(projectContext, refactoringOperation, impactedFiles, dependencies);
                break;
            case RENAME_CLASS:
                analyzeRenameClassImpact(projectContext, refactoringOperation, impactedFiles, dependencies);
                break;
            case MOVE_METHOD:
                analyzeMoveMethodImpact(projectContext, refactoringOperation, impactedFiles, dependencies);
                break;
            case EXTRACT_CLASS:
                analyzeExtractClassImpact(projectContext, refactoringOperation, impactedFiles, dependencies);
                break;
            default:
                logger.warn("Unknown refactoring operation type: {}", refactoringOperation.getType());
        }
        
        return new RippleImpactAnalysis(
            refactoringOperation,
            impactedFiles,
            dependencies,
            calculateRiskLevel(impactedFiles, dependencies)
        );
    }
    
    private void analyzeExtractMethodImpact(ProjectContext projectContext, RefactoringOperation operation, 
                                          Set<ImpactedFile> impactedFiles, Set<Dependency> dependencies) {
        // For extract method, we need to find all callers of the original method
        String methodName = operation.getTargetMethod();
        String className = operation.getTargetClass();
        
        // Find all files that call this method
        for (Path sourceFile : projectContext.sourceFiles()) {
            try {
                List<String> lines = Files.readAllLines(sourceFile);
                for (int i = 0; i < lines.size(); i++) {
                    String line = lines.get(i);
                    
                    // Check for method calls
                    Matcher matcher = METHOD_CALL_PATTERN.matcher(line);
                    while (matcher.find()) {
                        String calledMethod = matcher.group(1);
                        if (calledMethod.equals(methodName)) {
                            // Check if this is a call to our target method
                            if (isMethodCallToTarget(line, className, methodName)) {
                                impactedFiles.add(new ImpactedFile(
                                    sourceFile,
                                    i + 1,
                                    "Method call to extracted method",
                                    ImpactType.METHOD_CALL
                                ));
                                
                                dependencies.add(new Dependency(
                                    sourceFile,
                                    operation.getTargetFile(),
                                    DependencyType.METHOD_CALL,
                                    methodName
                                ));
                            }
                        }
                    }
                }
            } catch (IOException e) {
                logger.warn("Failed to analyze file for extract method impact: {}", sourceFile, e);
            }
        }
    }
    
    private void analyzeRenameMethodImpact(ProjectContext projectContext, RefactoringOperation operation, 
                                         Set<ImpactedFile> impactedFiles, Set<Dependency> dependencies) {
        String oldMethodName = operation.getOldName();
        String newMethodName = operation.getNewName();
        String className = operation.getTargetClass();
        
        // Find all files that call the old method name
        for (Path sourceFile : projectContext.sourceFiles()) {
            try {
                List<String> lines = Files.readAllLines(sourceFile);
                for (int i = 0; i < lines.size(); i++) {
                    String line = lines.get(i);
                    
                    // Check for method calls to the old name
                    if (line.contains(oldMethodName + "(")) {
                        if (isMethodCallToTarget(line, className, oldMethodName)) {
                            impactedFiles.add(new ImpactedFile(
                                sourceFile,
                                i + 1,
                                String.format("Method call to renamed method '%s' -> '%s'", oldMethodName, newMethodName),
                                ImpactType.METHOD_CALL
                            ));
                            
                            dependencies.add(new Dependency(
                                sourceFile,
                                operation.getTargetFile(),
                                DependencyType.METHOD_CALL,
                                oldMethodName
                            ));
                        }
                    }
                }
            } catch (IOException e) {
                logger.warn("Failed to analyze file for rename method impact: {}", sourceFile, e);
            }
        }
    }
    
    private void analyzeRenameClassImpact(ProjectContext projectContext, RefactoringOperation operation, 
                                        Set<ImpactedFile> impactedFiles, Set<Dependency> dependencies) {
        String oldClassName = operation.getOldName();
        String newClassName = operation.getNewName();
        
        // Find all files that import, extend, or use the old class
        for (Path sourceFile : projectContext.sourceFiles()) {
            try {
                List<String> lines = Files.readAllLines(sourceFile);
                for (int i = 0; i < lines.size(); i++) {
                    String line = lines.get(i);
                    
                    // Check for imports
                    if (line.contains("import") && line.contains(oldClassName)) {
                        impactedFiles.add(new ImpactedFile(
                            sourceFile,
                            i + 1,
                            String.format("Import statement for renamed class '%s' -> '%s'", oldClassName, newClassName),
                            ImpactType.IMPORT
                        ));
                    }
                    
                    // Check for class extensions
                    Matcher extendsMatcher = CLASS_EXTENDS_PATTERN.matcher(line);
                    if (extendsMatcher.find() && extendsMatcher.group(1).equals(oldClassName)) {
                        impactedFiles.add(new ImpactedFile(
                            sourceFile,
                            i + 1,
                            String.format("Class extends renamed class '%s' -> '%s'", oldClassName, newClassName),
                            ImpactType.INHERITANCE
                        ));
                    }
                    
                    // Check for interface implementations
                    Matcher implementsMatcher = CLASS_IMPLEMENTS_PATTERN.matcher(line);
                    if (implementsMatcher.find() && implementsMatcher.group(1).contains(oldClassName)) {
                        impactedFiles.add(new ImpactedFile(
                            sourceFile,
                            i + 1,
                            String.format("Class implements renamed interface '%s' -> '%s'", oldClassName, newClassName),
                            ImpactType.IMPLEMENTATION
                        ));
                    }
                    
                    // Check for variable declarations and usage
                    if (line.contains(oldClassName) && !line.trim().startsWith("//")) {
                        impactedFiles.add(new ImpactedFile(
                            sourceFile,
                            i + 1,
                            String.format("Usage of renamed class '%s' -> '%s'", oldClassName, newClassName),
                            ImpactType.TYPE_USAGE
                        ));
                    }
                }
            } catch (IOException e) {
                logger.warn("Failed to analyze file for rename class impact: {}", sourceFile, e);
            }
        }
    }
    
    private void analyzeMoveMethodImpact(ProjectContext projectContext, RefactoringOperation operation, 
                                       Set<ImpactedFile> impactedFiles, Set<Dependency> dependencies) {
        String methodName = operation.getTargetMethod();
        String sourceClass = operation.getSourceClass();
        String targetClass = operation.getTargetClass();
        
        // Find all files that call this method
        for (Path sourceFile : projectContext.sourceFiles()) {
            try {
                List<String> lines = Files.readAllLines(sourceFile);
                for (int i = 0; i < lines.size(); i++) {
                    String line = lines.get(i);
                    
                    // Check for method calls
                    if (line.contains(methodName + "(")) {
                        if (isMethodCallToTarget(line, sourceClass, methodName)) {
                            impactedFiles.add(new ImpactedFile(
                                sourceFile,
                                i + 1,
                                String.format("Method call to moved method '%s' from '%s' to '%s'", 
                                            methodName, sourceClass, targetClass),
                                ImpactType.METHOD_CALL
                            ));
                            
                            dependencies.add(new Dependency(
                                sourceFile,
                                operation.getTargetFile(),
                                DependencyType.METHOD_CALL,
                                methodName
                            ));
                        }
                    }
                }
            } catch (IOException e) {
                logger.warn("Failed to analyze file for move method impact: {}", sourceFile, e);
            }
        }
    }
    
    private void analyzeExtractClassImpact(ProjectContext projectContext, RefactoringOperation operation, 
                                         Set<ImpactedFile> impactedFiles, Set<Dependency> dependencies) {
        String sourceClass = operation.getSourceClass();
        String extractedClass = operation.getExtractedClass();
        
        // Find all files that use the source class
        for (Path sourceFile : projectContext.sourceFiles()) {
            try {
                List<String> lines = Files.readAllLines(sourceFile);
                for (int i = 0; i < lines.size(); i++) {
                    String line = lines.get(i);
                    
                    // Check for usage of the source class
                    if (line.contains(sourceClass) && !line.trim().startsWith("//")) {
                        impactedFiles.add(new ImpactedFile(
                            sourceFile,
                            i + 1,
                            String.format("Usage of class '%s' that will be modified by extracting '%s'", 
                                        sourceClass, extractedClass),
                            ImpactType.TYPE_USAGE
                        ));
                    }
                }
            } catch (IOException e) {
                logger.warn("Failed to analyze file for extract class impact: {}", sourceFile, e);
            }
        }
    }
    
    private boolean isMethodCallToTarget(String line, String className, String methodName) {
        // Simple heuristic - in a real implementation, we'd use proper AST parsing
        return line.contains(methodName + "(") && 
               (line.contains(className + ".") || line.contains("new " + className));
    }
    
    private RiskLevel calculateRiskLevel(Set<ImpactedFile> impactedFiles, Set<Dependency> dependencies) {
        int highRiskCount = 0;
        int mediumRiskCount = 0;
        int lowRiskCount = 0;
        
        for (ImpactedFile file : impactedFiles) {
            switch (file.getImpactType()) {
                case INHERITANCE:
                case IMPLEMENTATION:
                    highRiskCount++;
                    break;
                case METHOD_CALL:
                case TYPE_USAGE:
                    mediumRiskCount++;
                    break;
                case IMPORT:
                    lowRiskCount++;
                    break;
            }
        }
        
        if (highRiskCount > 0) return RiskLevel.HIGH;
        if (mediumRiskCount > 3) return RiskLevel.MEDIUM;
        return RiskLevel.LOW;
    }
    
    // Inner classes for data structures
    public static class RippleImpactAnalysis {
        private final RefactoringOperation operation;
        private final Set<ImpactedFile> impactedFiles;
        private final Set<Dependency> dependencies;
        private final RiskLevel riskLevel;
        
        public RippleImpactAnalysis(RefactoringOperation operation, Set<ImpactedFile> impactedFiles, 
                                  Set<Dependency> dependencies, RiskLevel riskLevel) {
            this.operation = operation;
            this.impactedFiles = impactedFiles;
            this.dependencies = dependencies;
            this.riskLevel = riskLevel;
        }
        
        // Getters
        public RefactoringOperation getOperation() { return operation; }
        public Set<ImpactedFile> getImpactedFiles() { return impactedFiles; }
        public Set<Dependency> getDependencies() { return dependencies; }
        public RiskLevel getRiskLevel() { return riskLevel; }
    }
    
    public static class ImpactedFile {
        private final Path filePath;
        private final int lineNumber;
        private final String description;
        private final ImpactType impactType;
        
        public ImpactedFile(Path filePath, int lineNumber, String description, ImpactType impactType) {
            this.filePath = filePath;
            this.lineNumber = lineNumber;
            this.description = description;
            this.impactType = impactType;
        }
        
        // Getters
        public Path getFilePath() { return filePath; }
        public int getLineNumber() { return lineNumber; }
        public String getDescription() { return description; }
        public ImpactType getImpactType() { return impactType; }
    }
    
    public static class Dependency {
        private final Path sourceFile;
        private final Path targetFile;
        private final DependencyType type;
        private final String element;
        
        public Dependency(Path sourceFile, Path targetFile, DependencyType type, String element) {
            this.sourceFile = sourceFile;
            this.targetFile = targetFile;
            this.type = type;
            this.element = element;
        }
        
        // Getters
        public Path getSourceFile() { return sourceFile; }
        public Path getTargetFile() { return targetFile; }
        public DependencyType getType() { return type; }
        public String getElement() { return element; }
    }
    
    public static class RefactoringOperation {
        private final RefactoringType type;
        private final Path targetFile;
        private final String targetClass;
        private final String targetMethod;
        private final String oldName;
        private final String newName;
        private final String sourceClass;
        private final String extractedClass;
        
        public RefactoringOperation(RefactoringType type, Path targetFile, String targetClass, 
                                  String targetMethod, String oldName, String newName, 
                                  String sourceClass, String extractedClass) {
            this.type = type;
            this.targetFile = targetFile;
            this.targetClass = targetClass;
            this.targetMethod = targetMethod;
            this.oldName = oldName;
            this.newName = newName;
            this.sourceClass = sourceClass;
            this.extractedClass = extractedClass;
        }
        
        // Getters
        public RefactoringType getType() { return type; }
        public Path getTargetFile() { return targetFile; }
        public String getTargetClass() { return targetClass; }
        public String getTargetMethod() { return targetMethod; }
        public String getOldName() { return oldName; }
        public String getNewName() { return newName; }
        public String getSourceClass() { return sourceClass; }
        public String getExtractedClass() { return extractedClass; }
    }
    
    public enum RefactoringType {
        EXTRACT_METHOD, RENAME_METHOD, RENAME_CLASS, MOVE_METHOD, EXTRACT_CLASS
    }
    
    public enum ImpactType {
        METHOD_CALL, IMPORT, INHERITANCE, IMPLEMENTATION, TYPE_USAGE
    }
    
    public enum DependencyType {
        METHOD_CALL, FIELD_ACCESS, INHERITANCE, IMPLEMENTATION, IMPORT
    }
    
    public enum RiskLevel {
        LOW, MEDIUM, HIGH
    }
}
