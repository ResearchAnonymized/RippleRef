package ai.refact.server.model;

import java.util.List;

public class DependencyNode {
    private String id;
    private String name;
    private String type;
    private String packageName;
    private List<String> dependencies;
    private List<String> dependents;
    private int complexity;
    private int linesOfCode;
    private boolean isModified;
    private Position position;
    
    public DependencyNode() {}
    
    public DependencyNode(String id, String name, String type, String packageName) {
        this.id = id;
        this.name = name;
        this.type = type;
        this.packageName = packageName;
    }
    
    public String getId() {
        return id;
    }
    
    public void setId(String id) {
        this.id = id;
    }
    
    public String getName() {
        return name;
    }
    
    public void setName(String name) {
        this.name = name;
    }
    
    public String getType() {
        return type;
    }
    
    public void setType(String type) {
        this.type = type;
    }
    
    public String getPackageName() {
        return packageName;
    }
    
    public void setPackageName(String packageName) {
        this.packageName = packageName;
    }
    
    public List<String> getDependencies() {
        return dependencies;
    }
    
    public void setDependencies(List<String> dependencies) {
        this.dependencies = dependencies;
    }
    
    public List<String> getDependents() {
        return dependents;
    }
    
    public void setDependents(List<String> dependents) {
        this.dependents = dependents;
    }
    
    public int getComplexity() {
        return complexity;
    }
    
    public void setComplexity(int complexity) {
        this.complexity = complexity;
    }
    
    public int getLinesOfCode() {
        return linesOfCode;
    }
    
    public void setLinesOfCode(int linesOfCode) {
        this.linesOfCode = linesOfCode;
    }
    
    public boolean isModified() {
        return isModified;
    }
    
    public void setModified(boolean modified) {
        isModified = modified;
    }
    
    public Position getPosition() {
        return position;
    }
    
    public void setPosition(Position position) {
        this.position = position;
    }
    
    public static class Position {
        private double x;
        private double y;
        
        public Position() {}
        
        public Position(double x, double y) {
            this.x = x;
            this.y = y;
        }
        
        public double getX() {
            return x;
        }
        
        public void setX(double x) {
            this.x = x;
        }
        
        public double getY() {
            return y;
        }
        
        public void setY(double y) {
            this.y = y;
        }
    }
}
