package ai.refact.engine.clustering;

import ai.refact.engine.model.CodeSmell;
import ai.refact.engine.model.CodeSmellCluster;
import ai.refact.engine.model.SmellSeverity;
import ai.refact.engine.model.SmellImpact;

import java.util.*;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * Engine for clustering and categorizing code smells.
 * Provides hierarchical organization and analysis capabilities.
 */
@Component
public class CodeSmellClusterer {
    
    /**
     * Cluster code smells by their type/category
     * @param smells list of code smells to cluster
     * @return map of cluster to list of smells
     */
    public Map<CodeSmellCluster, List<CodeSmell>> clusterByType(List<CodeSmell> smells) {
        return smells.stream()
                .collect(Collectors.groupingBy(smell -> {
                    // Map smell type to cluster based on the smell's characteristics
                    String smellType = smell.getType().toString();
                    
                    if (smellType.contains("Class") || smellType.contains("God") || 
                        smellType.contains("Data Class") || smellType.contains("Feature Envy")) {
                        return CodeSmellCluster.CLASS_LEVEL;
                    } else if (smellType.contains("Method") || smellType.contains("Long Method") ||
                               smellType.contains("Parameter") || smellType.contains("Message Chain")) {
                        return CodeSmellCluster.METHOD_LEVEL;
                    } else if (smellType.contains("Design") || smellType.contains("Architecture") ||
                               smellType.contains("Dependency") || smellType.contains("Coupling")) {
                        return CodeSmellCluster.DESIGN_LEVEL;
                    } else if (smellType.contains("Magic") || smellType.contains("Dead Code") ||
                               smellType.contains("Naming") || smellType.contains("Formatting")) {
                        return CodeSmellCluster.CODE_LEVEL;
                    } else {
                        return CodeSmellCluster.ARCHITECTURAL;
                    }
                }));
    }
    
    /**
     * Cluster code smells by severity
     * @param smells list of code smells to cluster
     * @return map of severity to list of smells
     */
    public Map<SmellSeverity, List<CodeSmell>> clusterBySeverity(List<CodeSmell> smells) {
        return smells.stream()
                .collect(Collectors.groupingBy(CodeSmell::getSeverity));
    }
    
    /**
     * Cluster code smells by impact
     * @param smells list of code smells to cluster
     * @return map of impact to list of smells
     */
    public Map<SmellImpact, List<CodeSmell>> clusterByImpact(List<CodeSmell> smells) {
        return smells.stream()
                .collect(Collectors.groupingBy(smell -> {
                    // Map severity to impact for now - can be enhanced later
                    SmellSeverity severity = smell.getSeverity();
                    switch (severity) {
                        case CRITICAL:
                            return SmellImpact.SECURITY;
                        case MAJOR:
                            return SmellImpact.MAINTAINABILITY;
                        case MINOR:
                            return SmellImpact.READABILITY;
                        default:
                            return SmellImpact.TESTABILITY;
                    }
                }));
    }
    
    /**
     * Get statistics for each cluster
     * @param smells list of code smells to analyze
     * @return map of cluster to statistics
     */
    public Map<CodeSmellCluster, ClusterStatistics> getClusterStatistics(List<CodeSmell> smells) {
        Map<CodeSmellCluster, List<CodeSmell>> clustered = clusterByType(smells);
        
        return clustered.entrySet().stream()
                .collect(Collectors.toMap(
                    Map.Entry::getKey,
                    entry -> new ClusterStatistics(
                        entry.getValue().size(),
                        entry.getValue().stream()
                                .collect(Collectors.groupingBy(CodeSmell::getSeverity))
                                .entrySet().stream()
                                .collect(Collectors.toMap(
                                    Map.Entry::getKey,
                                    e -> e.getValue().size()
                                ))
                    )
                ));
    }
    
    /**
     * Get top problematic areas
     * @param smells list of code smells to analyze
     * @param limit number of top areas to return
     * @return list of top problematic areas
     */
    public List<ProblematicArea> getTopProblematicAreas(List<CodeSmell> smells, int limit) {
        return smells.stream()
                .collect(Collectors.groupingBy(smell -> "Class level")) // Simplified for now
                .entrySet().stream()
                .map(entry -> new ProblematicArea(
                    entry.getKey(),
                    entry.getValue().size(),
                    entry.getValue().stream()
                            .mapToInt(smell -> getSeverityWeight(smell.getSeverity()))
                            .sum()
                ))
                .sorted((a, b) -> Integer.compare(b.getSeverityWeight(), a.getSeverityWeight()))
                .limit(limit)
                .collect(Collectors.toList());
    }
    
    private int getSeverityWeight(SmellSeverity severity) {
        switch (severity) {
            case CRITICAL: return 10;
            case MAJOR: return 5;
            case MINOR: return 2;
            case INFO: return 1;
            default: return 0;
        }
    }
    
    /**
     * Statistics for a code smell cluster
     */
    public static class ClusterStatistics {
        private final int totalSmells;
        private final Map<SmellSeverity, Integer> severityCounts;
        
        public ClusterStatistics(int totalSmells, Map<SmellSeverity, Integer> severityCounts) {
            this.totalSmells = totalSmells;
            this.severityCounts = severityCounts;
        }
        
        public int getTotalSmells() {
            return totalSmells;
        }
        
        public Map<SmellSeverity, Integer> getSeverityCounts() {
            return severityCounts;
        }
    }
    
    /**
     * Represents a problematic area in the codebase
     */
    public static class ProblematicArea {
        private final String location;
        private final int smellCount;
        private final int severityWeight;
        
        public ProblematicArea(String location, int smellCount, int severityWeight) {
            this.location = location;
            this.smellCount = smellCount;
            this.severityWeight = severityWeight;
        }
        
        public String getLocation() {
            return location;
        }
        
        public int getSmellCount() {
            return smellCount;
        }
        
        public int getSeverityWeight() {
            return severityWeight;
        }
    }
}
