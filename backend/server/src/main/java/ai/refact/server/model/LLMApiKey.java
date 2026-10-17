package ai.refact.server.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.time.LocalDateTime;

/**
 * Entity for storing and managing LLM API keys with cost tracking
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class LLMApiKey {
    
    private String id;
    private String provider; // "openrouter", "openai", "anthropic", etc.
    private String apiKey;
    private String name; // User-friendly name
    private String description;
    private boolean isActive;
    private boolean isDefault;
    
    // Cost tracking
    private double dailyLimit;
    private double monthlyLimit;
    private double totalLimit;
    private double currentDailyCost;
    private double currentMonthlyCost;
    private double totalCost;
    
    // Usage tracking
    private int totalRequests;
    private int successfulRequests;
    private int failedRequests;
    private LocalDateTime lastUsed;
    
    // Metadata
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private String createdBy;
    private LocalDateTime expiresAt;
    
    // Status
    private String status; // "ACTIVE", "EXPIRED", "LIMIT_REACHED", "DISABLED"
    private String lastError;
    
    // Constructors
    public LLMApiKey() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
        this.isActive = true;
        this.isDefault = false;
        this.status = "ACTIVE";
        this.currentDailyCost = 0.0;
        this.currentMonthlyCost = 0.0;
        this.totalCost = 0.0;
        this.totalRequests = 0;
        this.successfulRequests = 0;
        this.failedRequests = 0;
    }
    
    public LLMApiKey(String provider, String apiKey, String name) {
        this();
        this.provider = provider;
        this.apiKey = apiKey;
        this.name = name;
        this.id = generateId();
    }
    
    // Generate unique ID
    private String generateId() {
        return "key-" + System.currentTimeMillis() + "-" + (int)(Math.random() * 10000);
    }
    
    // Check if key has reached limits
    public boolean hasReachedDailyLimit() {
        return dailyLimit > 0 && currentDailyCost >= dailyLimit;
    }
    
    public boolean hasReachedMonthlyLimit() {
        return monthlyLimit > 0 && currentMonthlyCost >= monthlyLimit;
    }
    
    public boolean hasReachedTotalLimit() {
        return totalLimit > 0 && totalCost >= totalLimit;
    }
    
    public boolean hasReachedAnyLimit() {
        return hasReachedDailyLimit() || hasReachedMonthlyLimit() || hasReachedTotalLimit();
    }
    
    // Calculate remaining budget
    public double getRemainingDailyBudget() {
        return dailyLimit > 0 ? Math.max(0, dailyLimit - currentDailyCost) : Double.MAX_VALUE;
    }
    
    public double getRemainingMonthlyBudget() {
        return monthlyLimit > 0 ? Math.max(0, monthlyLimit - currentMonthlyCost) : Double.MAX_VALUE;
    }
    
    public double getRemainingTotalBudget() {
        return totalLimit > 0 ? Math.max(0, totalLimit - totalCost) : Double.MAX_VALUE;
    }
    
    // Update cost
    public void addCost(double cost) {
        this.currentDailyCost += cost;
        this.currentMonthlyCost += cost;
        this.totalCost += cost;
        this.updatedAt = LocalDateTime.now();
        
        // Update status if limits reached
        if (hasReachedAnyLimit()) {
            this.status = "LIMIT_REACHED";
            this.isActive = false;
        }
    }
    
    // Reset daily cost (called daily)
    public void resetDailyCost() {
        this.currentDailyCost = 0.0;
        this.updatedAt = LocalDateTime.now();
        
        // Reactivate if only daily limit was reached
        if ("LIMIT_REACHED".equals(status) && !hasReachedMonthlyLimit() && !hasReachedTotalLimit()) {
            this.status = "ACTIVE";
            this.isActive = true;
        }
    }
    
    // Reset monthly cost (called monthly)
    public void resetMonthlyCost() {
        this.currentMonthlyCost = 0.0;
        this.updatedAt = LocalDateTime.now();
        
        // Reactivate if only monthly limit was reached
        if ("LIMIT_REACHED".equals(status) && !hasReachedDailyLimit() && !hasReachedTotalLimit()) {
            this.status = "ACTIVE";
            this.isActive = true;
        }
    }
    
    // Track request
    public void recordRequest(boolean success) {
        this.totalRequests++;
        if (success) {
            this.successfulRequests++;
        } else {
            this.failedRequests++;
        }
        this.lastUsed = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }
    
    // Get success rate
    public double getSuccessRate() {
        return totalRequests > 0 ? (double) successfulRequests / totalRequests * 100 : 0.0;
    }
    
    // Mask API key for display
    public String getMaskedApiKey() {
        if (apiKey == null || apiKey.length() < 12) {
            return "***";
        }
        return apiKey.substring(0, 8) + "..." + apiKey.substring(apiKey.length() - 4);
    }
    
    // Getters and Setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    
    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }
    
    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }
    
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    
    public boolean isActive() { return isActive; }
    public void setActive(boolean active) { isActive = active; }
    
    public boolean isDefault() { return isDefault; }
    public void setDefault(boolean aDefault) { isDefault = aDefault; }
    
    public double getDailyLimit() { return dailyLimit; }
    public void setDailyLimit(double dailyLimit) { this.dailyLimit = dailyLimit; }
    
    public double getMonthlyLimit() { return monthlyLimit; }
    public void setMonthlyLimit(double monthlyLimit) { this.monthlyLimit = monthlyLimit; }
    
    public double getTotalLimit() { return totalLimit; }
    public void setTotalLimit(double totalLimit) { this.totalLimit = totalLimit; }
    
    public double getCurrentDailyCost() { return currentDailyCost; }
    public void setCurrentDailyCost(double currentDailyCost) { this.currentDailyCost = currentDailyCost; }
    
    public double getCurrentMonthlyCost() { return currentMonthlyCost; }
    public void setCurrentMonthlyCost(double currentMonthlyCost) { this.currentMonthlyCost = currentMonthlyCost; }
    
    public double getTotalCost() { return totalCost; }
    public void setTotalCost(double totalCost) { this.totalCost = totalCost; }
    
    public int getTotalRequests() { return totalRequests; }
    public void setTotalRequests(int totalRequests) { this.totalRequests = totalRequests; }
    
    public int getSuccessfulRequests() { return successfulRequests; }
    public void setSuccessfulRequests(int successfulRequests) { this.successfulRequests = successfulRequests; }
    
    public int getFailedRequests() { return failedRequests; }
    public void setFailedRequests(int failedRequests) { this.failedRequests = failedRequests; }
    
    public LocalDateTime getLastUsed() { return lastUsed; }
    public void setLastUsed(LocalDateTime lastUsed) { this.lastUsed = lastUsed; }
    
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
    
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    
    public LocalDateTime getExpiresAt() { return expiresAt; }
    public void setExpiresAt(LocalDateTime expiresAt) { this.expiresAt = expiresAt; }
    
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    
    public String getLastError() { return lastError; }
    public void setLastError(String lastError) { this.lastError = lastError; }
}

