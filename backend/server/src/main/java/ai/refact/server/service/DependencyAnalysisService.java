package ai.refact.server.service;

import ai.refact.api.ProjectContext;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Service for analyzing file dependencies and creating dependency graphs.
 * Provides comprehensive analysis of how files depend on each other.
 */
@Service
public class DependencyAnalysisService {
    
    private static final Logger logger = LoggerFactory.getLogger(DependencyAnalysisService.class);
    
    // Patterns for detecting different types of dependencies
    private static final Pattern IMPORT_PATTERN = Pattern.compile("^\\s*import\\s+([^;]+);", Pattern.MULTILINE);
    private static final Pattern PACKAGE_PATTERN = Pattern.compile("^\\s*package\\s+([^;]+);", Pattern.MULTILINE);
    private static final Pattern CLASS_EXTENDS_PATTERN = Pattern.compile("^\\s*(?:public\\s+)?class\\s+\\w+\\s+extends\\s+(\\w+)", Pattern.MULTILINE);
    private static final Pattern CLASS_IMPLEMENTS_PATTERN = Pattern.compile("^\\s*(?:public\\s+)?class\\s+\\w+\\s+implements\\s+([^{]+)", Pattern.MULTILINE);
    private static final Pattern INTERFACE_EXTENDS_PATTERN = Pattern.compile("^\\s*(?:public\\s+)?interface\\s+\\w+\\s+extends\\s+([^{]+)", Pattern.MULTILINE);
    private static final Pattern ANNOTATION_PATTERN = Pattern.compile("@(\\w+)(?:\\([^)]*\\))?", Pattern.MULTILINE);
    
    /**
     * Analyze dependencies for a specific file
     */
    public FileDependencyAnalysis analyzeFileDependencies(ProjectContext projectContext, String filePath) {
        try {
            Path fullPath = projectContext.root().resolve(filePath);
            if (!Files.exists(fullPath) || !filePath.endsWith(".java")) {
                return new FileDependencyAnalysis(filePath, Collections.emptySet(), Collections.emptySet(), 0, 0);
            }
            
            String content = Files.readString(fullPath);
            return analyzeFileContent(filePath, content, projectContext);
            
        } catch (IOException e) {
            logger.error("Failed to analyze dependencies for file: {}", filePath, e);
            return new FileDependencyAnalysis(filePath, Collections.emptySet(), Collections.emptySet(), 0, 0);
        }
    }
    
    /**
     * Analyze dependencies for all files in the project
     */
    public ProjectDependencyAnalysis analyzeProjectDependencies(ProjectContext projectContext) {
        Map<String, FileDependencyAnalysis> fileDependencies = new HashMap<>();
        Map<String, Set<String>> dependencyGraph = new HashMap<>();
        Map<String, Set<String>> reverseDependencyGraph = new HashMap<>();
        
        // Analyze each Java file
        for (Path javaFile : projectContext.sourceFiles()) {
            String relativePath = projectContext.root().relativize(javaFile).toString();
            FileDependencyAnalysis analysis = analyzeFileDependencies(projectContext, relativePath);
            fileDependencies.put(relativePath, analysis);
            
            // Build dependency graph
            dependencyGraph.put(relativePath, new HashSet<>(analysis.getDependencies()));
            reverseDependencyGraph.put(relativePath, new HashSet<>());
        }
        
        // Build reverse dependency graph
        for (Map.Entry<String, Set<String>> entry : dependencyGraph.entrySet()) {
            String file = entry.getKey();
            for (String dependency : entry.getValue()) {
                reverseDependencyGraph.computeIfAbsent(dependency, k -> new HashSet<>()).add(file);
            }
        }

        // Rebuild per-file analyses with correct incoming (fan-in) counts
        Map<String, FileDependencyAnalysis> enriched = new HashMap<>();
        for (Map.Entry<String, FileDependencyAnalysis> entry : fileDependencies.entrySet()) {
            String path = entry.getKey();
            FileDependencyAnalysis old = entry.getValue();
            Set<String> incoming = reverseDependencyGraph.getOrDefault(path, Collections.emptySet());
            enriched.put(path, new FileDependencyAnalysis(
                    path,
                    old.getDependencies(),
                    new HashSet<>(incoming),
                    old.getOutgoingDependencies(),
                    incoming.size()));
        }
        fileDependencies = enriched;
        
        // Calculate metrics
        DependencyMetrics metrics = calculateDependencyMetrics(dependencyGraph, reverseDependencyGraph);
        
        return new ProjectDependencyAnalysis(fileDependencies, dependencyGraph, reverseDependencyGraph, metrics);
    }
    
    /**
     * Get files that would be affected by changes to a specific file (ripple effect)
     */
    public List<String> getRippleEffectFiles(ProjectContext projectContext, String filePath) {
        ProjectDependencyAnalysis analysis = analyzeProjectDependencies(projectContext);
        Set<String> affectedFiles = new HashSet<>();
        Queue<String> toProcess = new LinkedList<>();
        
        toProcess.add(filePath);
        affectedFiles.add(filePath);
        
        while (!toProcess.isEmpty()) {
            String currentFile = toProcess.poll();
            Set<String> dependents = analysis.getReverseDependencyGraph().getOrDefault(currentFile, Collections.emptySet());
            
            for (String dependent : dependents) {
                if (!affectedFiles.contains(dependent)) {
                    affectedFiles.add(dependent);
                    toProcess.add(dependent);
                }
            }
        }
        
        return new ArrayList<>(affectedFiles);
    }
    
    private FileDependencyAnalysis analyzeFileContent(String filePath, String content, ProjectContext projectContext) {
        Set<String> dependencies = new HashSet<>();
        Set<String> reverseDependencies = new HashSet<>();
        
        // Extract package name
        String packageName = extractPackageName(content);
        
        // Find imports
        Matcher importMatcher = IMPORT_PATTERN.matcher(content);
        while (importMatcher.find()) {
            String importStatement = importMatcher.group(1);
            String resolvedPath = resolveImportToFilePath(importStatement, packageName, projectContext);
            if (resolvedPath != null) {
                dependencies.add(resolvedPath);
            }
        }
        
        // Find class inheritance
        findClassDependencies(content, packageName, projectContext, dependencies);
        
        // Find annotations
        findAnnotationDependencies(content, packageName, projectContext, dependencies);
        
        // Same-package / implicit imports: Type.method( or Type.FIELD — no import line
        findQualifierTypeDependencies(content, filePath, packageName, projectContext, dependencies);
        
        // Calculate coupling metrics
        int outgoingDependencies = dependencies.size();
        int incomingDependencies = 0; // Will be calculated when building reverse graph
        
        return new FileDependencyAnalysis(filePath, dependencies, reverseDependencies, outgoingDependencies, incomingDependencies);
    }
    
    private String extractPackageName(String content) {
        Matcher packageMatcher = PACKAGE_PATTERN.matcher(content);
        return packageMatcher.find() ? packageMatcher.group(1) : "";
    }
    
    private String resolveImportToFilePath(String importStatement, String packageName, ProjectContext projectContext) {
        // Convert import statement to file path
        String filePath = importStatement.replace('.', '/') + ".java";
        
        // Check if file exists in project
        for (Path javaFile : projectContext.sourceFiles()) {
            String relativePath = projectContext.root().relativize(javaFile).toString();
            if (relativePath.endsWith(filePath)) {
                return relativePath;
            }
        }
        
        // For demonstration purposes, include external dependencies too
        // Extract just the class name for external dependencies
        String className = importStatement.substring(importStatement.lastIndexOf('.') + 1);
        return "external/" + className + ".java";
    }
    
    private void findClassDependencies(String content, String packageName, ProjectContext projectContext, Set<String> dependencies) {
        // Find extends dependencies
        Matcher extendsMatcher = CLASS_EXTENDS_PATTERN.matcher(content);
        while (extendsMatcher.find()) {
            String className = extendsMatcher.group(1);
            String resolvedPath = resolveClassNameToFilePath(className, packageName, projectContext);
            if (resolvedPath != null) {
                dependencies.add(resolvedPath);
            }
        }
        
        // Find implements dependencies
        Matcher implementsMatcher = CLASS_IMPLEMENTS_PATTERN.matcher(content);
        while (implementsMatcher.find()) {
            String interfaces = implementsMatcher.group(1);
            for (String interfaceName : interfaces.split(",")) {
                String resolvedPath = resolveClassNameToFilePath(interfaceName.trim(), packageName, projectContext);
                if (resolvedPath != null) {
                    dependencies.add(resolvedPath);
                }
            }
        }
        
        // Find interface extends
        Matcher interfaceExtendsMatcher = INTERFACE_EXTENDS_PATTERN.matcher(content);
        while (interfaceExtendsMatcher.find()) {
            String interfaces = interfaceExtendsMatcher.group(1);
            for (String interfaceName : interfaces.split(",")) {
                String resolvedPath = resolveClassNameToFilePath(interfaceName.trim(), packageName, projectContext);
                if (resolvedPath != null) {
                    dependencies.add(resolvedPath);
                }
            }
        }
    }
    
    private void findAnnotationDependencies(String content, String packageName, ProjectContext projectContext, Set<String> dependencies) {
        Matcher annotationMatcher = ANNOTATION_PATTERN.matcher(content);
        while (annotationMatcher.find()) {
            String annotationName = annotationMatcher.group(1);
            String resolvedPath = resolveClassNameToFilePath(annotationName, packageName, projectContext);
            if (resolvedPath != null) {
                dependencies.add(resolvedPath);
            }
        }
    }
    
    /**
     * Detect references like {@code Helper.add(...)} where {@code Helper} is in the same package and has no import.
     */
    private void findQualifierTypeDependencies(String content, String currentFilePath, String packageName,
                                              ProjectContext projectContext, Set<String> dependencies) {
        Pattern typeQualifier = Pattern.compile("\\b([A-Z][A-Za-z0-9_]*)\\s*\\.");
        Matcher m = typeQualifier.matcher(content);
        while (m.find()) {
            String type = m.group(1);
            String resolved = resolveClassNameToFilePath(type, packageName, projectContext);
            if (resolved != null && !resolved.equals(currentFilePath)) {
                dependencies.add(resolved);
            }
        }
    }
    
    private String resolveClassNameToFilePath(String className, String packageName, ProjectContext projectContext) {
        // Try with current package
        String filePath = packageName.isEmpty() ? className + ".java" : packageName.replace('.', '/') + "/" + className + ".java";
        
        for (Path javaFile : projectContext.sourceFiles()) {
            String relativePath = projectContext.root().relativize(javaFile).toString();
            if (relativePath.endsWith(filePath)) {
                return relativePath;
            }
        }
        
        // Try without package (default package)
        filePath = className + ".java";
        for (Path javaFile : projectContext.sourceFiles()) {
            String relativePath = projectContext.root().relativize(javaFile).toString();
            if (relativePath.endsWith(filePath)) {
                return relativePath;
            }
        }
        
        return null; // External dependency
    }
    
    private DependencyMetrics calculateDependencyMetrics(Map<String, Set<String>> dependencyGraph, Map<String, Set<String>> reverseDependencyGraph) {
        int totalFiles = dependencyGraph.size();
        int totalDependencies = dependencyGraph.values().stream().mapToInt(Set::size).sum();
        double averageDependencies = totalFiles > 0 ? (double) totalDependencies / totalFiles : 0;
        
        // Find most coupled files
        String mostCoupledFile = dependencyGraph.entrySet().stream()
            .max(Map.Entry.comparingByValue((a, b) -> Integer.compare(a.size(), b.size())))
            .map(Map.Entry::getKey)
            .orElse("");
        
        // Find files with most dependents
        String mostDependentFile = reverseDependencyGraph.entrySet().stream()
            .max(Map.Entry.comparingByValue((a, b) -> Integer.compare(a.size(), b.size())))
            .map(Map.Entry::getKey)
            .orElse("");
        
        // Calculate coupling distribution
        Map<Integer, Integer> couplingDistribution = new HashMap<>();
        for (Set<String> deps : dependencyGraph.values()) {
            couplingDistribution.merge(deps.size(), 1, Integer::sum);
        }
        
        return new DependencyMetrics(
            totalFiles,
            totalDependencies,
            averageDependencies,
            mostCoupledFile,
            mostDependentFile,
            couplingDistribution
        );
    }
    
    // Data classes
    public static class FileDependencyAnalysis {
        private final String filePath;
        private final Set<String> dependencies;
        private final Set<String> reverseDependencies;
        private final int outgoingDependencies;
        private final int incomingDependencies;
        
        public FileDependencyAnalysis(String filePath, Set<String> dependencies, Set<String> reverseDependencies, 
                                    int outgoingDependencies, int incomingDependencies) {
            this.filePath = filePath;
            this.dependencies = dependencies;
            this.reverseDependencies = reverseDependencies;
            this.outgoingDependencies = outgoingDependencies;
            this.incomingDependencies = incomingDependencies;
        }
        
        // Getters
        public String getFilePath() { return filePath; }
        public Set<String> getDependencies() { return dependencies; }
        public Set<String> getReverseDependencies() { return reverseDependencies; }
        public int getOutgoingDependencies() { return outgoingDependencies; }
        public int getIncomingDependencies() { return incomingDependencies; }
    }
    
    public static class ProjectDependencyAnalysis {
        private final Map<String, FileDependencyAnalysis> fileDependencies;
        private final Map<String, Set<String>> dependencyGraph;
        private final Map<String, Set<String>> reverseDependencyGraph;
        private final DependencyMetrics metrics;
        
        public ProjectDependencyAnalysis(Map<String, FileDependencyAnalysis> fileDependencies,
                                       Map<String, Set<String>> dependencyGraph,
                                       Map<String, Set<String>> reverseDependencyGraph,
                                       DependencyMetrics metrics) {
            this.fileDependencies = fileDependencies;
            this.dependencyGraph = dependencyGraph;
            this.reverseDependencyGraph = reverseDependencyGraph;
            this.metrics = metrics;
        }
        
        // Getters
        public Map<String, FileDependencyAnalysis> getFileDependencies() { return fileDependencies; }
        public Map<String, Set<String>> getDependencyGraph() { return dependencyGraph; }
        public Map<String, Set<String>> getReverseDependencyGraph() { return reverseDependencyGraph; }
        public DependencyMetrics getMetrics() { return metrics; }
    }
    
    public static class DependencyMetrics {
        private final int totalFiles;
        private final int totalDependencies;
        private final double averageDependencies;
        private final String mostCoupledFile;
        private final String mostDependentFile;
        private final Map<Integer, Integer> couplingDistribution;
        
        public DependencyMetrics(int totalFiles, int totalDependencies, double averageDependencies,
                               String mostCoupledFile, String mostDependentFile,
                               Map<Integer, Integer> couplingDistribution) {
            this.totalFiles = totalFiles;
            this.totalDependencies = totalDependencies;
            this.averageDependencies = averageDependencies;
            this.mostCoupledFile = mostCoupledFile;
            this.mostDependentFile = mostDependentFile;
            this.couplingDistribution = couplingDistribution;
        }
        
        // Getters
        public int getTotalFiles() { return totalFiles; }
        public int getTotalDependencies() { return totalDependencies; }
        public double getAverageDependencies() { return averageDependencies; }
        public String getMostCoupledFile() { return mostCoupledFile; }
        public String getMostDependentFile() { return mostDependentFile; }
        public Map<Integer, Integer> getCouplingDistribution() { return couplingDistribution; }
    }
}
