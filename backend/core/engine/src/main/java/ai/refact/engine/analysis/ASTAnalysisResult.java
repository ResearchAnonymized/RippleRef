package ai.refact.engine.analysis;

import java.util.ArrayList;
import java.util.List;

/**
 * Result of AST-based code analysis.
 * Contains detailed information about the analyzed Java file.
 */
public class ASTAnalysisResult {
    
    private String filePath;
    private String fileName;
    private String error;
    private List<ClassDeclaration> classDeclarations = new ArrayList<>();
    private List<MethodDeclaration> methodDeclarations = new ArrayList<>();
    private List<ImportInfo> imports = new ArrayList<>();
    private List<MethodCallInfo> methodCalls = new ArrayList<>();
    private List<ClassInstantiationInfo> classInstantiations = new ArrayList<>();
    private List<FieldInfo> fields = new ArrayList<>();
    
    // Getters and setters
    public String getFilePath() { return filePath; }
    public void setFilePath(String filePath) { this.filePath = filePath; }
    
    public String getFileName() { return fileName; }
    public void setFileName(String fileName) { this.fileName = fileName; }
    
    public String getError() { return error; }
    public void setError(String error) { this.error = error; }
    
    public List<ClassDeclaration> getClassDeclarations() { return classDeclarations; }
    public void setClassDeclarations(List<ClassDeclaration> classDeclarations) { this.classDeclarations = classDeclarations; }
    
    public List<MethodDeclaration> getMethodDeclarations() { return methodDeclarations; }
    public void setMethodDeclarations(List<MethodDeclaration> methodDeclarations) { this.methodDeclarations = methodDeclarations; }
    
    public List<ImportInfo> getImports() { return imports; }
    public void setImports(List<ImportInfo> imports) { this.imports = imports; }
    
    public List<MethodCallInfo> getMethodCalls() { return methodCalls; }
    public void setMethodCalls(List<MethodCallInfo> methodCalls) { this.methodCalls = methodCalls; }
    
    public List<ClassInstantiationInfo> getClassInstantiations() { return classInstantiations; }
    public void setClassInstantiations(List<ClassInstantiationInfo> classInstantiations) { this.classInstantiations = classInstantiations; }
    
    public List<FieldInfo> getFields() { return fields; }
    public void setFields(List<FieldInfo> fields) { this.fields = fields; }
    
    public boolean hasError() {
        return error != null && !error.isEmpty();
    }
    
    public int getTotalClasses() {
        return classDeclarations.size();
    }
    
    public int getTotalMethods() {
        return methodDeclarations.size();
    }
    
    public int getTotalImports() {
        return imports.size();
    }
    
    public int getTotalMethodCalls() {
        return methodCalls.size();
    }
    
    public int getTotalClassInstantiations() {
        return classInstantiations.size();
    }
    
    public int getTotalFields() {
        return fields.size();
    }
}
