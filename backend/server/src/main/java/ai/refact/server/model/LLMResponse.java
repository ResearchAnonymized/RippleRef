package ai.refact.server.model;

import java.time.LocalDateTime;

/**
 * Response model for LLM API calls
 */
public class LLMResponse {
    
    private String content;
    private String model;
    private String requestId;
    private int inputTokens;
    private int outputTokens;
    private int totalTokens;
    private double cost;
    private LocalDateTime timestamp;
    private boolean success;
    private String error;
    
    // Getters and setters
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    
    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
    
    public String getRequestId() { return requestId; }
    public void setRequestId(String requestId) { this.requestId = requestId; }
    
    public int getInputTokens() { return inputTokens; }
    public void setInputTokens(int inputTokens) { this.inputTokens = inputTokens; }
    
    public int getOutputTokens() { return outputTokens; }
    public void setOutputTokens(int outputTokens) { this.outputTokens = outputTokens; }
    
    public int getTotalTokens() { return totalTokens; }
    public void setTotalTokens(int totalTokens) { this.totalTokens = totalTokens; }
    
    public double getCost() { return cost; }
    public void setCost(double cost) { this.cost = cost; }
    
    public LocalDateTime getTimestamp() { return timestamp; }
    public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }
    
    public boolean isSuccess() { return success; }
    public void setSuccess(boolean success) { this.success = success; }
    
    public String getError() { return error; }
    public void setError(String error) { this.error = error; }
    
    // Helper methods
    public boolean hasError() {
        return error != null && !error.isEmpty();
    }
    
    public double getCostPerToken() {
        return totalTokens > 0 ? cost / totalTokens : 0.0;
    }
}
