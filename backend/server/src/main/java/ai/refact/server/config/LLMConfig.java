package ai.refact.server.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.util.List;
import java.util.Map;

/**
 * Configuration for LLM services and OpenRouter API integration.
 * This configuration supports multiple models with fallback chains.
 */
@Configuration
@ConfigurationProperties(prefix = "refactai.llm")
public class LLMConfig {
    
    private OpenRouter openRouter = new OpenRouter();
    private Models models = new Models();
    private Security security = new Security();
    private Cost cost = new Cost();
    
    // Getters and setters
    public OpenRouter getOpenRouter() { return openRouter; }
    public void setOpenRouter(OpenRouter openRouter) { this.openRouter = openRouter; }
    
    public Models getModels() { return models; }
    public void setModels(Models models) { this.models = models; }
    
    public Security getSecurity() { return security; }
    public void setSecurity(Security security) { this.security = security; }
    
    public Cost getCost() { return cost; }
    public void setCost(Cost cost) { this.cost = cost; }
    
    public static class OpenRouter {
        private String apiKey;
        private String baseUrl = "https://openrouter.ai/api/v1";
        private int timeoutSeconds = 30;
        private int maxRetries = 3;
        private int rateLimitPerMinute = 60;
        
        // Getters and setters
        public String getApiKey() { return apiKey; }
        public void setApiKey(String apiKey) { this.apiKey = apiKey; }
        
        public String getBaseUrl() { return baseUrl; }
        public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
        
        public int getTimeoutSeconds() { return timeoutSeconds; }
        public void setTimeoutSeconds(int timeoutSeconds) { this.timeoutSeconds = timeoutSeconds; }
        
        public int getMaxRetries() { return maxRetries; }
        public void setMaxRetries(int maxRetries) { this.maxRetries = maxRetries; }
        
        public int getRateLimitPerMinute() { return rateLimitPerMinute; }
        public void setRateLimitPerMinute(int rateLimitPerMinute) { this.rateLimitPerMinute = rateLimitPerMinute; }
    }
    
    public static class Models {
        private String primaryModel = "openai/gpt-5.5";
        private String fallbackModel1 = "anthropic/claude-opus-4.8";
        private String fallbackModel2 = "google/gemini-3.1-pro-preview";
        private Map<String, ModelConfig> modelConfigs;
        private List<String> fallbackChain;
        
        // Getters and setters
        public String getPrimaryModel() { return primaryModel; }
        public void setPrimaryModel(String primaryModel) { this.primaryModel = primaryModel; }
        
        public String getFallbackModel1() { return fallbackModel1; }
        public void setFallbackModel1(String fallbackModel1) { this.fallbackModel1 = fallbackModel1; }
        
        public String getFallbackModel2() { return fallbackModel2; }
        public void setFallbackModel2(String fallbackModel2) { this.fallbackModel2 = fallbackModel2; }
        
        public Map<String, ModelConfig> getModelConfigs() { return modelConfigs; }
        public void setModelConfigs(Map<String, ModelConfig> modelConfigs) { this.modelConfigs = modelConfigs; }
        
        public List<String> getFallbackChain() { return fallbackChain; }
        public void setFallbackChain(List<String> fallbackChain) { this.fallbackChain = fallbackChain; }
    }
    
    public static class ModelConfig {
        private double costPerToken;
        private int maxTokens;
        private double temperature;
        private String description;
        private List<String> capabilities;
        
        // Getters and setters
        public double getCostPerToken() { return costPerToken; }
        public void setCostPerToken(double costPerToken) { this.costPerToken = costPerToken; }
        
        public int getMaxTokens() { return maxTokens; }
        public void setMaxTokens(int maxTokens) { this.maxTokens = maxTokens; }
        
        public double getTemperature() { return temperature; }
        public void setTemperature(double temperature) { this.temperature = temperature; }
        
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        
        public List<String> getCapabilities() { return capabilities; }
        public void setCapabilities(List<String> capabilities) { this.capabilities = capabilities; }
    }
    
    public static class Security {
        private boolean enableCodeRedaction = true;
        private List<String> sensitivePatterns;
        private boolean requireUserConsent = true;
        private boolean enableAuditLogging = true;
        private int maxCodeLength = 50000;
        
        // Getters and setters
        public boolean isEnableCodeRedaction() { return enableCodeRedaction; }
        public void setEnableCodeRedaction(boolean enableCodeRedaction) { this.enableCodeRedaction = enableCodeRedaction; }
        
        public List<String> getSensitivePatterns() { return sensitivePatterns; }
        public void setSensitivePatterns(List<String> sensitivePatterns) { this.sensitivePatterns = sensitivePatterns; }
        
        public boolean isRequireUserConsent() { return requireUserConsent; }
        public void setRequireUserConsent(boolean requireUserConsent) { this.requireUserConsent = requireUserConsent; }
        
        public boolean isEnableAuditLogging() { return enableAuditLogging; }
        public void setEnableAuditLogging(boolean enableAuditLogging) { this.enableAuditLogging = enableAuditLogging; }
        
        public int getMaxCodeLength() { return maxCodeLength; }
        public void setMaxCodeLength(int maxCodeLength) { this.maxCodeLength = maxCodeLength; }
    }
    
    public static class Cost {
        private double dailyLimit = 10.0;
        private double monthlyLimit = 100.0;
        private boolean enableCostTracking = true;
        private boolean enableCostWarnings = true;
        private double warningThreshold = 0.8;
        
        // Getters and setters
        public double getDailyLimit() { return dailyLimit; }
        public void setDailyLimit(double dailyLimit) { this.dailyLimit = dailyLimit; }
        
        public double getMonthlyLimit() { return monthlyLimit; }
        public void setMonthlyLimit(double monthlyLimit) { this.monthlyLimit = monthlyLimit; }
        
        public boolean isEnableCostTracking() { return enableCostTracking; }
        public void setEnableCostTracking(boolean enableCostTracking) { this.enableCostTracking = enableCostTracking; }
        
        public boolean isEnableCostWarnings() { return enableCostWarnings; }
        public void setEnableCostWarnings(boolean enableCostWarnings) { this.enableCostWarnings = enableCostWarnings; }
        
        public double getWarningThreshold() { return warningThreshold; }
        public void setWarningThreshold(double warningThreshold) { this.warningThreshold = warningThreshold; }
    }
}
