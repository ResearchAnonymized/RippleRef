package ai.refact.server.model;

import java.util.List;
import java.util.Map;

/**
 * Request model for LLM API calls
 */
public class LLMRequest {
    
    private List<Map<String, String>> messages;
    private Integer maxTokens;
    private Double temperature;
    private String model;
    private String requestType;
    private Map<String, Object> context;
    
    // Getters and setters
    public List<Map<String, String>> getMessages() { return messages; }
    public void setMessages(List<Map<String, String>> messages) { this.messages = messages; }
    
    public Integer getMaxTokens() { return maxTokens; }
    public void setMaxTokens(Integer maxTokens) { this.maxTokens = maxTokens; }
    
    public Double getTemperature() { return temperature; }
    public void setTemperature(Double temperature) { this.temperature = temperature; }
    
    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
    
    public String getRequestType() { return requestType; }
    public void setRequestType(String requestType) { this.requestType = requestType; }
    
    public Map<String, Object> getContext() { return context; }
    public void setContext(Map<String, Object> context) { this.context = context; }
    
    // Helper methods
    public void addMessage(String role, String content) {
        if (messages == null) {
            messages = new java.util.ArrayList<>();
        }
        messages.add(Map.of("role", role, "content", content));
    }
    
    public void addSystemMessage(String content) {
        addMessage("system", content);
    }
    
    public void addUserMessage(String content) {
        addMessage("user", content);
    }
    
    public void addAssistantMessage(String content) {
        addMessage("assistant", content);
    }
}
