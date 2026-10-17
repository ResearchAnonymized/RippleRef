package ai.refact.engine.analysis;

import ai.refact.engine.clustering.CodeSmellClusterer;
import ai.refact.engine.detector.classlevel.GodClassDetector;
import ai.refact.engine.detector.classlevel.FeatureEnvyDetector;
import ai.refact.engine.model.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Comprehensive analysis engine that orchestrates all code smell detectors
 * and provides hierarchical analysis capabilities.
 */
@Service
public class ComprehensiveAnalysisEngine {
    
    @Autowired
    @Qualifier("hierarchicalGodClassDetector")
    private GodClassDetector godClassDetector;
    
    @Autowired
    @Qualifier("hierarchicalFeatureEnvyDetector")
    private FeatureEnvyDetector featureEnvyDetector;
    
    // Method-level detectors
    @Autowired
    @Qualifier("hierarchicalLongMethodDetector")
    private ai.refact.engine.detector.methodlevel.LongMethodDetector longMethodDetector;
    
    @Autowired
    @Qualifier("hierarchicalLongParameterListDetector")
    private ai.refact.engine.detector.methodlevel.LongParameterListDetector longParameterListDetector;
    
    @Autowired
    private ai.refact.engine.detector.methodlevel.MessageChainDetector messageChainDetector;
    
    // Design-level detectors
    @Autowired
    private ai.refact.engine.detector.designlevel.CyclicDependenciesDetector cyclicDependenciesDetector;
    
    @Autowired
    private ai.refact.engine.detector.designlevel.TightCouplingDetector tightCouplingDetector;
    
    @Autowired
    private CodeSmellClusterer clusterer;
    
    /**
     * Perform comprehensive analysis on a file
     * @param filePath the path to the file to analyze
     * @return comprehensive analysis result
     */
    public ComprehensiveAnalysisResult analyzeFile(String filePath) {
        try {
            // Read file content
            Path path = Paths.get(filePath);
            String content = Files.readString(path);
            
            // Perform hierarchical analysis
            List<CodeSmell> allSmells = new ArrayList<>();
            
            // Class-level analysis
            allSmells.addAll(godClassDetector.detectGodClass(content, filePath));
            allSmells.addAll(featureEnvyDetector.detectFeatureEnvy(content, filePath));
            
            // Method-level analysis
            allSmells.addAll(longMethodDetector.detectMethodLevelSmells(content));
            allSmells.addAll(longParameterListDetector.detectMethodLevelSmells(content));
            allSmells.addAll(messageChainDetector.detectMethodLevelSmells(content));
            
            // Design-level analysis
            allSmells.addAll(cyclicDependenciesDetector.detectDesignLevelSmells(content));
            allSmells.addAll(tightCouplingDetector.detectDesignLevelSmells(content));
            
            // Cluster the results
            Map<CodeSmellCluster, List<CodeSmell>> clusteredByType = clusterer.clusterByType(allSmells);
            Map<SmellSeverity, List<CodeSmell>> clusteredBySeverity = clusterer.clusterBySeverity(allSmells);
            Map<SmellImpact, List<CodeSmell>> clusteredByImpact = clusterer.clusterByImpact(allSmells);
            
            // Get statistics
            Map<CodeSmellCluster, CodeSmellClusterer.ClusterStatistics> statistics = 
                clusterer.getClusterStatistics(allSmells);
            
            // Get top problematic areas
            List<CodeSmellClusterer.ProblematicArea> topProblems = 
                clusterer.getTopProblematicAreas(allSmells, 10);
            
            return new ComprehensiveAnalysisResult(
                filePath,
                allSmells,
                clusteredByType,
                clusteredBySeverity,
                clusteredByImpact,
                statistics,
                topProblems
            );
            
        } catch (Exception e) {
            throw new RuntimeException("Failed to analyze file: " + filePath, e);
        }
    }
    
    /**
     * Get analysis summary for a file
     * @param filePath the path to the file
     * @return analysis summary
     */
    public AnalysisSummary getAnalysisSummary(String filePath) {
        ComprehensiveAnalysisResult result = analyzeFile(filePath);
        
        return new AnalysisSummary(
            result.getFilePath(),
            result.getAllSmells().size(),
            result.getClusteredByType().size(),
            result.getStatistics(),
            result.getTopProblems()
        );
    }
    
    /**
     * Comprehensive analysis result containing all analysis data
     */
    public static class ComprehensiveAnalysisResult {
        private final String filePath;
        private final List<CodeSmell> allSmells;
        private final Map<CodeSmellCluster, List<CodeSmell>> clusteredByType;
        private final Map<SmellSeverity, List<CodeSmell>> clusteredBySeverity;
        private final Map<SmellImpact, List<CodeSmell>> clusteredByImpact;
        private final Map<CodeSmellCluster, CodeSmellClusterer.ClusterStatistics> statistics;
        private final List<CodeSmellClusterer.ProblematicArea> topProblems;
        
        public ComprehensiveAnalysisResult(
            String filePath,
            List<CodeSmell> allSmells,
            Map<CodeSmellCluster, List<CodeSmell>> clusteredByType,
            Map<SmellSeverity, List<CodeSmell>> clusteredBySeverity,
            Map<SmellImpact, List<CodeSmell>> clusteredByImpact,
            Map<CodeSmellCluster, CodeSmellClusterer.ClusterStatistics> statistics,
            List<CodeSmellClusterer.ProblematicArea> topProblems) {
            
            this.filePath = filePath;
            this.allSmells = allSmells;
            this.clusteredByType = clusteredByType;
            this.clusteredBySeverity = clusteredBySeverity;
            this.clusteredByImpact = clusteredByImpact;
            this.statistics = statistics;
            this.topProblems = topProblems;
        }
        
        // Getters
        public String getFilePath() { return filePath; }
        public List<CodeSmell> getAllSmells() { return allSmells; }
        public Map<CodeSmellCluster, List<CodeSmell>> getClusteredByType() { return clusteredByType; }
        public Map<SmellSeverity, List<CodeSmell>> getClusteredBySeverity() { return clusteredBySeverity; }
        public Map<SmellImpact, List<CodeSmell>> getClusteredByImpact() { return clusteredByImpact; }
        public Map<CodeSmellCluster, CodeSmellClusterer.ClusterStatistics> getStatistics() { return statistics; }
        public List<CodeSmellClusterer.ProblematicArea> getTopProblems() { return topProblems; }
    }
    
    /**
     * Analysis summary for quick overview
     */
    public static class AnalysisSummary {
        private final String filePath;
        private final int totalSmells;
        private final int clusterCount;
        private final Map<CodeSmellCluster, CodeSmellClusterer.ClusterStatistics> statistics;
        private final List<CodeSmellClusterer.ProblematicArea> topProblems;
        
        public AnalysisSummary(
            String filePath,
            int totalSmells,
            int clusterCount,
            Map<CodeSmellCluster, CodeSmellClusterer.ClusterStatistics> statistics,
            List<CodeSmellClusterer.ProblematicArea> topProblems) {
            
            this.filePath = filePath;
            this.totalSmells = totalSmells;
            this.clusterCount = clusterCount;
            this.statistics = statistics;
            this.topProblems = topProblems;
        }
        
        // Getters
        public String getFilePath() { return filePath; }
        public int getTotalSmells() { return totalSmells; }
        public int getClusterCount() { return clusterCount; }
        public Map<CodeSmellCluster, CodeSmellClusterer.ClusterStatistics> getStatistics() { return statistics; }
        public List<CodeSmellClusterer.ProblematicArea> getTopProblems() { return topProblems; }
    }
}
