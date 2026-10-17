package ai.refact.server.model;

import java.util.List;
import java.util.Map;

public class EnhancedAnalysisResponse {
    private String filePath;
    private int linesOfCode;
    private double complexity;
    private double maintainability;
    private double testability;
    private List<CodeSmell> codeSmells;
    private List<DependencyNode> dependencies;
    private Map<String, Object> metrics;
    private List<String> recommendations;
    
    public EnhancedAnalysisResponse() {}
    
    public String getFilePath() {
        return filePath;
    }
    
    public void setFilePath(String filePath) {
        this.filePath = filePath;
    }
    
    public int getLinesOfCode() {
        return linesOfCode;
    }
    
    public void setLinesOfCode(int linesOfCode) {
        this.linesOfCode = linesOfCode;
    }
    
    public double getComplexity() {
        return complexity;
    }
    
    public void setComplexity(double complexity) {
        this.complexity = complexity;
    }
    
    public double getMaintainability() {
        return maintainability;
    }
    
    public void setMaintainability(double maintainability) {
        this.maintainability = maintainability;
    }
    
    public double getTestability() {
        return testability;
    }
    
    public void setTestability(double testability) {
        this.testability = testability;
    }
    
    public List<CodeSmell> getCodeSmells() {
        return codeSmells;
    }
    
    public void setCodeSmells(List<CodeSmell> codeSmells) {
        this.codeSmells = codeSmells;
    }
    
    public List<DependencyNode> getDependencies() {
        return dependencies;
    }
    
    public void setDependencies(List<DependencyNode> dependencies) {
        this.dependencies = dependencies;
    }
    
    public Map<String, Object> getMetrics() {
        return metrics;
    }
    
    public void setMetrics(Map<String, Object> metrics) {
        this.metrics = metrics;
    }
    
    public List<String> getRecommendations() {
        return recommendations;
    }
    
    public void setRecommendations(List<String> recommendations) {
        this.recommendations = recommendations;
    }
}
