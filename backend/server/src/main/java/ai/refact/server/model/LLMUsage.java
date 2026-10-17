package ai.refact.server.model;

import java.time.LocalDateTime;

/**
 * Model for tracking LLM usage and costs
 */
public class LLMUsage {
    
    private String requestId;
    private String model;
    private LocalDateTime timestamp;
    private int inputTokens;
    private int outputTokens;
    private int totalTokens;
    private double cost;
    private boolean success;
    private String error;
    private String requestType;
    
    // Getters and setters
    public String getRequestId() { return requestId; }
    public void setRequestId(String requestId) { this.requestId = requestId; }
    
    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
    
    public LocalDateTime getTimestamp() { return timestamp; }
    public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }
    
    public int getInputTokens() { return inputTokens; }
    public void setInputTokens(int inputTokens) { this.inputTokens = inputTokens; }
    
    public int getOutputTokens() { return outputTokens; }
    public void setOutputTokens(int outputTokens) { this.outputTokens = outputTokens; }
    
    public int getTotalTokens() { return totalTokens; }
    public void setTotalTokens(int totalTokens) { this.totalTokens = totalTokens; }
    
    public double getCost() { return cost; }
    public void setCost(double cost) { this.cost = cost; }
    
    public boolean isSuccess() { return success; }
    public void setSuccess(boolean success) { this.success = success; }
    
    public String getError() { return error; }
    public void setError(String error) { this.error = error; }
    
    public String getRequestType() { return requestType; }
    public void setRequestType(String requestType) { this.requestType = requestType; }
    
    // Helper methods
    public boolean hasError() {
        return error != null && !error.isEmpty();
    }
    
    public double getCostPerToken() {
        return totalTokens > 0 ? cost / totalTokens : 0.0;
    }
}
