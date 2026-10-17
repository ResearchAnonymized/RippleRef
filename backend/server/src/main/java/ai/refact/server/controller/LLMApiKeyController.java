package ai.refact.server.controller;

import ai.refact.server.model.LLMApiKey;
import ai.refact.server.service.LLMApiKeyService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * REST Controller for managing LLM API keys
 */
@RestController
@RequestMapping("/api/llm/keys")
@CrossOrigin(origins = {"http://localhost:4000", "http://localhost:3000"})
public class LLMApiKeyController {
    
    private static final Logger logger = LoggerFactory.getLogger(LLMApiKeyController.class);
    
    private final LLMApiKeyService apiKeyService;
    
    @Autowired
    public LLMApiKeyController(LLMApiKeyService apiKeyService) {
        this.apiKeyService = apiKeyService;
    }
    
    /**
     * Get all API keys (with masked keys)
     */
    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> getAllKeys() {
        try {
            List<LLMApiKey> keys = apiKeyService.getAllKeys();
            List<Map<String, Object>> response = keys.stream()
                .map(this::toSafeMap)
                .collect(Collectors.toList());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("Error getting all keys", e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    /**
     * Get a specific API key by ID (with masked key)
     */
    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getKey(@PathVariable String id) {
        try {
            Optional<LLMApiKey> key = apiKeyService.getKeyById(id);
            if (key.isPresent()) {
                return ResponseEntity.ok(toSafeMap(key.get()));
            }
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            logger.error("Error getting key: {}", id, e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    /**
     * Add a new API key
     */
    @PostMapping
    public ResponseEntity<Map<String, Object>> addKey(@RequestBody Map<String, Object> request) {
        try {
            String provider = (String) request.get("provider");
            String apiKey = (String) request.get("apiKey");
            String name = (String) request.get("name");
            double dailyLimit = getDouble(request, "dailyLimit", 10.0);
            double monthlyLimit = getDouble(request, "monthlyLimit", 100.0);
            double totalLimit = getDouble(request, "totalLimit", 1000.0);
            
            if (provider == null || apiKey == null || name == null) {
                return ResponseEntity.badRequest().build();
            }
            
            LLMApiKey newKey = apiKeyService.addApiKey(provider, apiKey, name, 
                                                       dailyLimit, monthlyLimit, totalLimit);
            logger.info("Added new API key: {} ({})", name, provider);
            return ResponseEntity.ok(toSafeMap(newKey));
            
        } catch (Exception e) {
            logger.error("Error adding API key", e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    /**
     * Update an existing API key
     */
    @PutMapping("/{id}")
    public ResponseEntity<Map<String, Object>> updateKey(
            @PathVariable String id, 
            @RequestBody Map<String, Object> request) {
        try {
            String name = (String) request.get("name");
            String description = (String) request.get("description");
            double dailyLimit = getDouble(request, "dailyLimit", 10.0);
            double monthlyLimit = getDouble(request, "monthlyLimit", 100.0);
            double totalLimit = getDouble(request, "totalLimit", 1000.0);
            
            Optional<LLMApiKey> updated = apiKeyService.updateApiKey(
                id, name, description, dailyLimit, monthlyLimit, totalLimit);
            
            if (updated.isPresent()) {
                logger.info("Updated API key: {}", id);
                return ResponseEntity.ok(toSafeMap(updated.get()));
            }
            return ResponseEntity.notFound().build();
            
        } catch (Exception e) {
            logger.error("Error updating key: {}", id, e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    /**
     * Delete an API key
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> deleteKey(@PathVariable String id) {
        try {
            boolean deleted = apiKeyService.deleteApiKey(id);
            if (deleted) {
                logger.info("Deleted API key: {}", id);
                return ResponseEntity.ok(Map.of("success", true, "message", "Key deleted"));
            }
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            logger.error("Error deleting key: {}", id, e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    /**
     * Set a key as default
     */
    @PostMapping("/{id}/set-default")
    public ResponseEntity<Map<String, Object>> setDefaultKey(@PathVariable String id) {
        try {
            boolean success = apiKeyService.setDefaultKey(id);
            if (success) {
                logger.info("Set key as default: {}", id);
                return ResponseEntity.ok(Map.of("success", true, "message", "Key set as default"));
            }
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            logger.error("Error setting default key: {}", id, e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    /**
     * Toggle key active status
     */
    @PostMapping("/{id}/toggle")
    public ResponseEntity<Map<String, Object>> toggleKey(
            @PathVariable String id,
            @RequestBody Map<String, Object> request) {
        try {
            boolean active = (Boolean) request.getOrDefault("active", true);
            boolean success = apiKeyService.toggleKeyStatus(id, active);
            if (success) {
                logger.info("Toggled key status: {} -> {}", id, active);
                return ResponseEntity.ok(Map.of("success", true, "active", active));
            }
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            logger.error("Error toggling key: {}", id, e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    /**
     * Test an API key
     */
    @PostMapping("/{id}/test")
    public ResponseEntity<Map<String, Object>> testKey(@PathVariable String id) {
        try {
            boolean success = apiKeyService.testApiKey(id);
            if (success) {
                return ResponseEntity.ok(Map.of("success", true, "message", "Key tested successfully"));
            }
            return ResponseEntity.ok(Map.of("success", false, "message", "Key test failed"));
        } catch (Exception e) {
            logger.error("Error testing key: {}", id, e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    /**
     * Get global statistics
     */
    @GetMapping("/statistics")
    public ResponseEntity<Map<String, Object>> getStatistics() {
        try {
            Map<String, Object> stats = apiKeyService.getGlobalStatistics();
            return ResponseEntity.ok(stats);
        } catch (Exception e) {
            logger.error("Error getting statistics", e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    /**
     * Get the default/active key info
     */
    @GetMapping("/active")
    public ResponseEntity<Map<String, Object>> getActiveKey() {
        try {
            Optional<LLMApiKey> key = apiKeyService.getAvailableKey();
            if (key.isPresent()) {
                return ResponseEntity.ok(toSafeMap(key.get()));
            }
            return ResponseEntity.ok(Map.of(
                "available", false, 
                "message", "No active API key available"
            ));
        } catch (Exception e) {
            logger.error("Error getting active key", e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    // Helper methods
    
    private double getDouble(Map<String, Object> map, String key, double defaultValue) {
        Object value = map.get(key);
        if (value instanceof Number) {
            return ((Number) value).doubleValue();
        }
        return defaultValue;
    }
    
    /**
     * Convert LLMApiKey to safe map (with masked API key)
     */
    private Map<String, Object> toSafeMap(LLMApiKey key) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", key.getId());
        map.put("provider", key.getProvider());
        map.put("name", key.getName());
        map.put("description", key.getDescription());
        map.put("maskedApiKey", key.getMaskedApiKey());
        map.put("isActive", key.isActive());
        map.put("isDefault", key.isDefault());
        map.put("status", key.getStatus());
        
        // Cost information
        map.put("dailyLimit", key.getDailyLimit());
        map.put("monthlyLimit", key.getMonthlyLimit());
        map.put("totalLimit", key.getTotalLimit());
        map.put("currentDailyCost", key.getCurrentDailyCost());
        map.put("currentMonthlyCost", key.getCurrentMonthlyCost());
        map.put("totalCost", key.getTotalCost());
        
        // Budget information
        map.put("remainingDailyBudget", key.getRemainingDailyBudget());
        map.put("remainingMonthlyBudget", key.getRemainingMonthlyBudget());
        map.put("remainingTotalBudget", key.getRemainingTotalBudget());
        
        // Usage information
        map.put("totalRequests", key.getTotalRequests());
        map.put("successfulRequests", key.getSuccessfulRequests());
        map.put("failedRequests", key.getFailedRequests());
        map.put("successRate", key.getSuccessRate());
        
        // Metadata
        map.put("createdAt", key.getCreatedAt());
        map.put("updatedAt", key.getUpdatedAt());
        map.put("lastUsed", key.getLastUsed());
        map.put("expiresAt", key.getExpiresAt());
        
        return map;
    }
}

