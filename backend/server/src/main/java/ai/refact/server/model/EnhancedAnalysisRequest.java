package ai.refact.server.model;

public class EnhancedAnalysisRequest {
    private String workspaceId;
    private String filePath;
    
    public EnhancedAnalysisRequest() {}
    
    public EnhancedAnalysisRequest(String workspaceId, String filePath) {
        this.workspaceId = workspaceId;
        this.filePath = filePath;
    }
    
    public String getWorkspaceId() {
        return workspaceId;
    }
    
    public void setWorkspaceId(String workspaceId) {
        this.workspaceId = workspaceId;
    }
    
    public String getFilePath() {
        return filePath;
    }
    
    public void setFilePath(String filePath) {
        this.filePath = filePath;
    }
}