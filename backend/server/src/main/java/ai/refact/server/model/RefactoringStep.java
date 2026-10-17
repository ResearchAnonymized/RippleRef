package ai.refact.server.model;

import java.util.List;
import java.util.Map;

public class RefactoringStep {
    private String id;
    private String title;
    private String description;
    private String type;
    private String status;
    private String beforeCode;
    private String afterCode;
    private Impact impact;
    private StepDependencies dependencies;
    private Documentation documentation;
    
    public RefactoringStep() {}
    
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
    
    public String getType() {
        return type;
    }
    
    public void setType(String type) {
        this.type = type;
    }
    
    public String getStatus() {
        return status;
    }
    
    public void setStatus(String status) {
        this.status = status;
    }
    
    public String getBeforeCode() {
        return beforeCode;
    }
    
    public void setBeforeCode(String beforeCode) {
        this.beforeCode = beforeCode;
    }
    
    public String getAfterCode() {
        return afterCode;
    }
    
    public void setAfterCode(String afterCode) {
        this.afterCode = afterCode;
    }
    
    public Impact getImpact() {
        return impact;
    }
    
    public void setImpact(Impact impact) {
        this.impact = impact;
    }
    
    public StepDependencies getDependencies() {
        return dependencies;
    }
    
    public void setDependencies(StepDependencies dependencies) {
        this.dependencies = dependencies;
    }
    
    public Documentation getDocumentation() {
        return documentation;
    }
    
    public void setDocumentation(Documentation documentation) {
        this.documentation = documentation;
    }
    
    public static class Impact {
        private int filesAffected;
        private int methodsChanged;
        private int dependenciesModified;
        private String riskLevel;
        
        public Impact() {}
        
        public int getFilesAffected() {
            return filesAffected;
        }
        
        public void setFilesAffected(int filesAffected) {
            this.filesAffected = filesAffected;
        }
        
        public int getMethodsChanged() {
            return methodsChanged;
        }
        
        public void setMethodsChanged(int methodsChanged) {
            this.methodsChanged = methodsChanged;
        }
        
        public int getDependenciesModified() {
            return dependenciesModified;
        }
        
        public void setDependenciesModified(int dependenciesModified) {
            this.dependenciesModified = dependenciesModified;
        }
        
        public String getRiskLevel() {
            return riskLevel;
        }
        
        public void setRiskLevel(String riskLevel) {
            this.riskLevel = riskLevel;
        }
    }
    
    public static class StepDependencies {
        private List<DependencyNode> before;
        private List<DependencyNode> after;
        
        public StepDependencies() {}
        
        public List<DependencyNode> getBefore() {
            return before;
        }
        
        public void setBefore(List<DependencyNode> before) {
            this.before = before;
        }
        
        public List<DependencyNode> getAfter() {
            return after;
        }
        
        public void setAfter(List<DependencyNode> after) {
            this.after = after;
        }
    }
    
    public static class Documentation {
        private String rationale;
        private List<String> benefits;
        private List<String> risks;
        private List<String> alternatives;
        private String testingStrategy;
        
        public Documentation() {}
        
        public String getRationale() {
            return rationale;
        }
        
        public void setRationale(String rationale) {
            this.rationale = rationale;
        }
        
        public List<String> getBenefits() {
            return benefits;
        }
        
        public void setBenefits(List<String> benefits) {
            this.benefits = benefits;
        }
        
        public List<String> getRisks() {
            return risks;
        }
        
        public void setRisks(List<String> risks) {
            this.risks = risks;
        }
        
        public List<String> getAlternatives() {
            return alternatives;
        }
        
        public void setAlternatives(List<String> alternatives) {
            this.alternatives = alternatives;
        }
        
        public String getTestingStrategy() {
            return testingStrategy;
        }
        
        public void setTestingStrategy(String testingStrategy) {
            this.testingStrategy = testingStrategy;
        }
    }
}
