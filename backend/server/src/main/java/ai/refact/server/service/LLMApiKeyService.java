package ai.refact.server.service;

import ai.refact.server.model.LLMApiKey;
import ai.refact.server.repository.LLMApiKeyRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Service for managing LLM API keys with cost tracking and automatic rotation
 */
@Service
public class LLMApiKeyService {
    
    private static final Logger logger = LoggerFactory.getLogger(LLMApiKeyService.class);
    
    private final LLMApiKeyRepository repository;
    
    @Autowired
    public LLMApiKeyService(LLMApiKeyRepository repository) {
        this.repository = repository;
        initializeDefaultKey();
    }
    
    /**
     * Initialize with a default key if none exists
     */
    private void initializeDefaultKey() {
        if (repository.count() == 0) {
            // Check environment variable
            String envKey = System.getenv("OPENROUTER_API_KEY");
            if (envKey != null && !envKey.isEmpty()) {
                LLMApiKey defaultKey = new LLMApiKey("openrouter", envKey, "Default OpenRouter Key");
                defaultKey.setDescription("Automatically created from environment variable");
                defaultKey.setDefault(true);
                defaultKey.setDailyLimit(10.0);
                defaultKey.setMonthlyLimit(100.0);
                defaultKey.setTotalLimit(1000.0);
                repository.save(defaultKey);
                logger.info("Initialized default API key from environment variable");
            }
        }
    }
    
    /**
     * Add a new API key
     */
    public LLMApiKey addApiKey(String provider, String apiKey, String name, 
                                double dailyLimit, double monthlyLimit, double totalLimit) {
        LLMApiKey newKey = new LLMApiKey(provider, apiKey, name);
        newKey.setDailyLimit(dailyLimit);
        newKey.setMonthlyLimit(monthlyLimit);
        newKey.setTotalLimit(totalLimit);
        
        // Set as default if no other default exists
        Optional<LLMApiKey> defaultKey = repository.findDefault();
        if (defaultKey.isEmpty()) {
            newKey.setDefault(true);
        }
        
        return repository.save(newKey);
    }
    
    /**
     * Update an existing API key
     */
    public Optional<LLMApiKey> updateApiKey(String id, String name, String description,
                                             double dailyLimit, double monthlyLimit, double totalLimit) {
        Optional<LLMApiKey> existing = repository.findById(id);
        if (existing.isPresent()) {
            LLMApiKey key = existing.get();
            if (name != null) key.setName(name);
            if (description != null) key.setDescription(description);
            key.setDailyLimit(dailyLimit);
            key.setMonthlyLimit(monthlyLimit);
            key.setTotalLimit(totalLimit);
            return Optional.of(repository.save(key));
        }
        return Optional.empty();
    }
    
    /**
     * Delete an API key
     */
    public boolean deleteApiKey(String id) {
        Optional<LLMApiKey> key = repository.findById(id);
        if (key.isPresent()) {
            repository.delete(id);
            
            // If it was the default, set another as default
            if (key.get().isDefault()) {
                List<LLMApiKey> active = repository.findActive();
                if (!active.isEmpty()) {
                    LLMApiKey newDefault = active.get(0);
                    newDefault.setDefault(true);
                    repository.save(newDefault);
                }
            }
            return true;
        }
        return false;
    }
    
    /**
     * Set a key as default
     */
    public boolean setDefaultKey(String id) {
        Optional<LLMApiKey> key = repository.findById(id);
        if (key.isPresent()) {
            // Unset all other defaults
            repository.findAll().forEach(k -> k.setDefault(false));
            
            // Set this as default
            LLMApiKey defaultKey = key.get();
            defaultKey.setDefault(true);
            defaultKey.setActive(true);
            repository.save(defaultKey);
            return true;
        }
        return false;
    }
    
    /**
     * Get an active API key with available budget
     */
    public Optional<LLMApiKey> getAvailableKey() {
        // Try to get default key first
        Optional<LLMApiKey> defaultKey = repository.findDefault();
        if (defaultKey.isPresent() && !defaultKey.get().hasReachedAnyLimit()) {
            return defaultKey;
        }
        
        // Otherwise, find any available key
        return repository.findAvailableKey();
    }
    
    /**
     * Get the default API key
     */
    public Optional<LLMApiKey> getDefaultKey() {
        return repository.findDefault();
    }
    
    /**
     * Get all API keys
     */
    public List<LLMApiKey> getAllKeys() {
        return repository.findAll();
    }
    
    /**
     * Get API key by ID
     */
    public Optional<LLMApiKey> getKeyById(String id) {
        return repository.findById(id);
    }
    
    /**
     * Record usage and cost for a key
     */
    public void recordUsage(String keyId, double cost, boolean success) {
        Optional<LLMApiKey> key = repository.findById(keyId);
        if (key.isPresent()) {
            LLMApiKey apiKey = key.get();
            apiKey.addCost(cost);
            apiKey.recordRequest(success);
            repository.save(apiKey);
            
            logger.debug("Recorded usage for key {}: cost=${}, success={}", 
                        apiKey.getName(), cost, success);
            
            // Check if limits reached and rotate if needed
            if (apiKey.hasReachedAnyLimit()) {
                logger.warn("API key {} has reached its limit", apiKey.getName());
                handleLimitReached(apiKey);
            }
        }
    }
    
    /**
     * Handle when a key reaches its limit
     */
    private void handleLimitReached(LLMApiKey exhaustedKey) {
        exhaustedKey.setStatus("LIMIT_REACHED");
        exhaustedKey.setActive(false);
        repository.save(exhaustedKey);
        
        // Try to find another available key
        Optional<LLMApiKey> availableKey = repository.findAvailableKey();
        if (availableKey.isPresent()) {
            // Rotate to the available key
            LLMApiKey newKey = availableKey.get();
            newKey.setDefault(true);
            repository.save(newKey);
            logger.info("Rotated to new API key: {} (was: {})", 
                       newKey.getName(), exhaustedKey.getName());
        } else {
            logger.error("No available API keys! All keys have reached their limits.");
        }
    }
    
    /**
     * Get usage statistics across all keys
     */
    public Map<String, Object> getGlobalStatistics() {
        List<LLMApiKey> allKeys = repository.findAll();
        
        Map<String, Object> stats = new HashMap<>();
        stats.put("totalKeys", allKeys.size());
        stats.put("activeKeys", repository.countActive());
        stats.put("totalCost", allKeys.stream().mapToDouble(LLMApiKey::getTotalCost).sum());
        stats.put("totalRequests", allKeys.stream().mapToInt(LLMApiKey::getTotalRequests).sum());
        stats.put("successfulRequests", allKeys.stream().mapToInt(LLMApiKey::getSuccessfulRequests).sum());
        
        // Daily costs
        double totalDailyCost = allKeys.stream().mapToDouble(LLMApiKey::getCurrentDailyCost).sum();
        double totalDailyLimit = allKeys.stream().mapToDouble(LLMApiKey::getDailyLimit).sum();
        stats.put("dailyCost", totalDailyCost);
        stats.put("dailyLimit", totalDailyLimit);
        stats.put("dailyBudgetUsed", totalDailyLimit > 0 ? (totalDailyCost / totalDailyLimit * 100) : 0);
        
        // Monthly costs
        double totalMonthlyCost = allKeys.stream().mapToDouble(LLMApiKey::getCurrentMonthlyCost).sum();
        double totalMonthlyLimit = allKeys.stream().mapToDouble(LLMApiKey::getMonthlyLimit).sum();
        stats.put("monthlyCost", totalMonthlyCost);
        stats.put("monthlyLimit", totalMonthlyLimit);
        stats.put("monthlyBudgetUsed", totalMonthlyLimit > 0 ? (totalMonthlyCost / totalMonthlyLimit * 100) : 0);
        
        return stats;
    }
    
    /**
     * Reset daily costs (scheduled to run daily at midnight)
     */
    @Scheduled(cron = "0 0 0 * * ?")
    public void resetDailyCosts() {
        logger.info("Resetting daily costs for all API keys");
        List<LLMApiKey> allKeys = repository.findAll();
        allKeys.forEach(key -> {
            key.resetDailyCost();
            repository.save(key);
        });
    }
    
    /**
     * Reset monthly costs (scheduled to run on 1st of each month)
     */
    @Scheduled(cron = "0 0 0 1 * ?")
    public void resetMonthlyCosts() {
        logger.info("Resetting monthly costs for all API keys");
        List<LLMApiKey> allKeys = repository.findAll();
        allKeys.forEach(key -> {
            key.resetMonthlyCost();
            repository.save(key);
        });
    }
    
    /**
     * Check for expired keys (scheduled to run hourly)
     */
    @Scheduled(cron = "0 0 * * * ?")
    public void checkExpiredKeys() {
        List<LLMApiKey> allKeys = repository.findAll();
        LocalDateTime now = LocalDateTime.now();
        
        allKeys.forEach(key -> {
            if (key.getExpiresAt() != null && key.getExpiresAt().isBefore(now)) {
                key.setStatus("EXPIRED");
                key.setActive(false);
                repository.save(key);
                logger.warn("API key {} has expired", key.getName());
            }
        });
    }
    
    /**
     * Activate/deactivate a key
     */
    public boolean toggleKeyStatus(String id, boolean active) {
        Optional<LLMApiKey> key = repository.findById(id);
        if (key.isPresent()) {
            LLMApiKey apiKey = key.get();
            apiKey.setActive(active);
            apiKey.setStatus(active ? "ACTIVE" : "DISABLED");
            repository.save(apiKey);
            return true;
        }
        return false;
    }
    
    /**
     * Test an API key (validate it works)
     */
    public boolean testApiKey(String keyId) {
        // This would actually call the LLM API to test the key
        // For now, just mark it as tested
        Optional<LLMApiKey> key = repository.findById(keyId);
        if (key.isPresent()) {
            LLMApiKey apiKey = key.get();
            apiKey.setLastUsed(LocalDateTime.now());
            repository.save(apiKey);
            return true;
        }
        return false;
    }
}

