package ai.refact.server.repository;

import ai.refact.server.model.LLMApiKey;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Repository;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Repository for managing LLM API keys with file-based persistence
 * (Can be replaced with JPA/database implementation later)
 */
@Repository
public class LLMApiKeyRepository {
    
    private static final Logger logger = LoggerFactory.getLogger(LLMApiKeyRepository.class);
    private static final String DATA_DIR = System.getProperty("user.home") + "/.refactai/data";
    private static final String API_KEYS_FILE = DATA_DIR + "/llm_api_keys.json";
    
    private final ObjectMapper objectMapper;
    private List<LLMApiKey> apiKeys;
    
    public LLMApiKeyRepository() {
        this.objectMapper = new ObjectMapper();
        this.objectMapper.registerModule(new JavaTimeModule());
        this.apiKeys = new ArrayList<>();
        
        // Initialize data directory
        try {
            Files.createDirectories(Paths.get(DATA_DIR));
            loadApiKeys();
        } catch (IOException e) {
            logger.error("Failed to initialize API key repository", e);
        }
    }
    
    /**
     * Load API keys from file
     */
    private void loadApiKeys() {
        File file = new File(API_KEYS_FILE);
        if (file.exists()) {
            try {
                apiKeys = objectMapper.readValue(file, new TypeReference<List<LLMApiKey>>() {});
                logger.info("Loaded {} API keys from storage", apiKeys.size());
            } catch (IOException e) {
                logger.error("Failed to load API keys from file", e);
                apiKeys = new ArrayList<>();
            }
        } else {
            logger.info("No existing API keys file found, starting with empty list");
            apiKeys = new ArrayList<>();
        }
    }
    
    /**
     * Save API keys to file
     */
    private void saveApiKeys() {
        try {
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(new File(API_KEYS_FILE), apiKeys);
            logger.debug("Saved {} API keys to storage", apiKeys.size());
        } catch (IOException e) {
            logger.error("Failed to save API keys to file", e);
        }
    }
    
    /**
     * Save a new API key
     */
    public LLMApiKey save(LLMApiKey apiKey) {
        // Check if key already exists
        Optional<LLMApiKey> existing = findById(apiKey.getId());
        if (existing.isPresent()) {
            // Update existing
            apiKeys.removeIf(k -> k.getId().equals(apiKey.getId()));
        }
        
        // If this is set as default, unset other defaults
        if (apiKey.isDefault()) {
            apiKeys.forEach(k -> k.setDefault(false));
        }
        
        apiKeys.add(apiKey);
        saveApiKeys();
        logger.info("Saved API key: {} ({})", apiKey.getName(), apiKey.getProvider());
        return apiKey;
    }
    
    /**
     * Find API key by ID
     */
    public Optional<LLMApiKey> findById(String id) {
        return apiKeys.stream()
            .filter(k -> k.getId().equals(id))
            .findFirst();
    }
    
    /**
     * Find all API keys
     */
    public List<LLMApiKey> findAll() {
        return new ArrayList<>(apiKeys);
    }
    
    /**
     * Find active API keys
     */
    public List<LLMApiKey> findActive() {
        return apiKeys.stream()
            .filter(LLMApiKey::isActive)
            .collect(Collectors.toList());
    }
    
    /**
     * Find default API key
     */
    public Optional<LLMApiKey> findDefault() {
        return apiKeys.stream()
            .filter(LLMApiKey::isDefault)
            .filter(LLMApiKey::isActive)
            .findFirst();
    }
    
    /**
     * Find API keys by provider
     */
    public List<LLMApiKey> findByProvider(String provider) {
        return apiKeys.stream()
            .filter(k -> k.getProvider().equalsIgnoreCase(provider))
            .collect(Collectors.toList());
    }
    
    /**
     * Find available API key with budget
     */
    public Optional<LLMApiKey> findAvailableKey() {
        return apiKeys.stream()
            .filter(LLMApiKey::isActive)
            .filter(k -> !k.hasReachedAnyLimit())
            .findFirst();
    }
    
    /**
     * Delete API key
     */
    public void delete(String id) {
        apiKeys.removeIf(k -> k.getId().equals(id));
        saveApiKeys();
        logger.info("Deleted API key: {}", id);
    }
    
    /**
     * Update API key
     */
    public LLMApiKey update(LLMApiKey apiKey) {
        return save(apiKey);
    }
    
    /**
     * Count total API keys
     */
    public long count() {
        return apiKeys.size();
    }
    
    /**
     * Count active API keys
     */
    public long countActive() {
        return apiKeys.stream()
            .filter(LLMApiKey::isActive)
            .count();
    }
}

