package ai.refact.server.model;

import java.util.List;
import java.util.Map;

public class RefactoringPlan {
    private String id;
    private String title;
    private String description;
    private String status;
    private List<RefactoringStep> steps;
    private OverallImpact overallImpact;
    private Timeline timeline;
    private Dependencies dependencies;
    
    public RefactoringPlan() {}
    
    public String getId() {
        return id;
    }
    
    public void setId(String id) {
        this.id = id;
    }
    
    public String getTitle() {
        return title;
    }
    
    public void setTitle(String title) {
        this.title = title;
    }
    
    public String getDescription() {
        return description;
    }
    
    public void setDescription(String description) {
        this.description = description;
    }
    
    public String getStatus() {
        return status;
    }
    
    public void setStatus(String status) {
        this.status = status;
    }
    
    public List<RefactoringStep> getSteps() {
        return steps;
    }
    
    public void setSteps(List<RefactoringStep> steps) {
        this.steps = steps;
    }
    
    public OverallImpact getOverallImpact() {
        return overallImpact;
    }
    
    public void setOverallImpact(OverallImpact overallImpact) {
        this.overallImpact = overallImpact;
    }
    
    public Timeline getTimeline() {
        return timeline;
    }
    
    public void setTimeline(Timeline timeline) {
        this.timeline = timeline;
    }
    
    public Dependencies getDependencies() {
        return dependencies;
    }
    
    public void setDependencies(Dependencies dependencies) {
        this.dependencies = dependencies;
    }
    
    public static class OverallImpact {
        private int totalFiles;
        private int totalMethods;
        private int complexityReduction;
        private int maintainabilityImprovement;
        private String performanceImpact;
        
        public OverallImpact() {}
        
        public int getTotalFiles() {
            return totalFiles;
        }
        
        public void setTotalFiles(int totalFiles) {
            this.totalFiles = totalFiles;
        }
        
        public int getTotalMethods() {
            return totalMethods;
        }
        
        public void setTotalMethods(int totalMethods) {
            this.totalMethods = totalMethods;
        }
        
        public int getComplexityReduction() {
            return complexityReduction;
        }
        
        public void setComplexityReduction(int complexityReduction) {
            this.complexityReduction = complexityReduction;
        }
        
        public int getMaintainabilityImprovement() {
            return maintainabilityImprovement;
        }
        
        public void setMaintainabilityImprovement(int maintainabilityImprovement) {
            this.maintainabilityImprovement = maintainabilityImprovement;
        }
        
        public String getPerformanceImpact() {
            return performanceImpact;
        }
        
        public void setPerformanceImpact(String performanceImpact) {
            this.performanceImpact = performanceImpact;
        }
    }
    
    public static class Timeline {
        private String estimatedDuration;
        private String actualDuration;
        private String startTime;
        private String endTime;
        
        public Timeline() {}
        
        public String getEstimatedDuration() {
            return estimatedDuration;
        }
        
        public void setEstimatedDuration(String estimatedDuration) {
            this.estimatedDuration = estimatedDuration;
        }
        
        public String getActualDuration() {
            return actualDuration;
        }
        
        public void setActualDuration(String actualDuration) {
            this.actualDuration = actualDuration;
        }
        
        public String getStartTime() {
            return startTime;
        }
        
        public void setStartTime(String startTime) {
            this.startTime = startTime;
        }
        
        public String getEndTime() {
            return endTime;
        }
        
        public void setEndTime(String endTime) {
            this.endTime = endTime;
        }
    }
    
    public static class Dependencies {
        private List<String> affectedClasses;
        private List<String> affectedPackages;
        private List<String> externalDependencies;
        
        public Dependencies() {}
        
        public List<String> getAffectedClasses() {
            return affectedClasses;
        }
        
        public void setAffectedClasses(List<String> affectedClasses) {
            this.affectedClasses = affectedClasses;
        }
        
        public List<String> getAffectedPackages() {
            return affectedPackages;
        }
        
        public void setAffectedPackages(List<String> affectedPackages) {
            this.affectedPackages = affectedPackages;
        }
        
        public List<String> getExternalDependencies() {
            return externalDependencies;
        }
        
        public void setExternalDependencies(List<String> externalDependencies) {
            this.externalDependencies = externalDependencies;
        }
    }
}
