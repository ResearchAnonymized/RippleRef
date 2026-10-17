package ai.refact.server.service;

import ai.refact.server.config.LLMConfig;
import ai.refact.server.model.LLMRequest;
import ai.refact.server.model.LLMResponse;
import ai.refact.server.model.LLMUsage;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Service for interacting with LLM providers through OpenRouter API.
 * Supports multiple models with fallback chains and cost tracking.
 */
@Service
public class LLMService {
    
    private static final Logger logger = LoggerFactory.getLogger(LLMService.class);
    
    private final LLMConfig llmConfig;
    private final WebClient.Builder webClientBuilder;
    private final ObjectMapper objectMapper;
    private final Map<String, LLMUsage> usageTracker = new ConcurrentHashMap<>();
    private LLMApiKeyService apiKeyService;
    
    // Sensitive patterns for code redaction
    private static final List<Pattern> SENSITIVE_PATTERNS = Arrays.asList(
        Pattern.compile("(?i)(password|passwd|pwd)\\s*[:=]\\s*[\"']?[^\\s\"']+[\"']?", Pattern.CASE_INSENSITIVE),
        Pattern.compile("(?i)(api[_-]?key|apikey)\\s*[:=]\\s*[\"']?[^\\s\"']+[\"']?", Pattern.CASE_INSENSITIVE),
        Pattern.compile("(?i)(secret|token)\\s*[:=]\\s*[\"']?[^\\s\"']+[\"']?", Pattern.CASE_INSENSITIVE),
        Pattern.compile("(?i)(private[_-]?key|privatekey)\\s*[:=]\\s*[\"']?[^\\s\"']+[\"']?", Pattern.CASE_INSENSITIVE)
    );
    
    @Autowired
    public LLMService(LLMConfig llmConfig, ObjectMapper objectMapper) {
        this.llmConfig = llmConfig;
        this.objectMapper = objectMapper;
        
        this.webClientBuilder = WebClient.builder()
            .baseUrl(llmConfig.getOpenRouter().getBaseUrl())
            .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
            .defaultHeader("HTTP-Referer", "https://anonymous.example.org/refine")
            .defaultHeader("X-Title", "REFINE");
        
        logger.info("LLMService initialized with OpenRouter API at: {}", llmConfig.getOpenRouter().getBaseUrl());
    }
    
    /**
     * Set the API key service (circular dependency workaround)
     */
    @Autowired
    public void setApiKeyService(LLMApiKeyService apiKeyService) {
        this.apiKeyService = apiKeyService;
    }
    
    /**
     * Get a WebClient configured with the current API key
     */
    private WebClient getWebClient() {
        String apiKey = null;
        
        // Try to get API key from service first
        if (apiKeyService != null) {
            Optional<ai.refact.server.model.LLMApiKey> key = apiKeyService.getAvailableKey();
            if (key.isPresent()) {
                apiKey = key.get().getApiKey();
                logger.info("Using API key from database: {}", key.get().getName());
            }
        }
        
        // Fallback to config API key
        if (apiKey == null || apiKey.isEmpty()) {
            apiKey = llmConfig.getOpenRouter().getApiKey();
            if (apiKey != null && !apiKey.isEmpty()) {
                logger.info("Using API key from configuration");
            }
        }
        
        if (apiKey == null || apiKey.isEmpty()) {
            logger.warn("No API key available for LLM request");
            return webClientBuilder.build();
        }
        
        logger.info("Using API key: {}...", apiKey.substring(0, Math.min(8, apiKey.length())));
        return webClientBuilder
            .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
            .build();
    }
    
    /**
     * Send a request to the LLM with automatic fallback chain
     */
    public Mono<LLMResponse> sendRequest(LLMRequest request) {
        return sendRequestWithFallback(request, getFallbackChain());
    }
    
    /**
     * Send a request to a specific model
     */
    public Mono<LLMResponse> sendRequest(LLMRequest request, String model) {
        return sendRequestToModel(request, model);
    }
    
    /**
     * Send a request with fallback chain
     */
    private Mono<LLMResponse> sendRequestWithFallback(LLMRequest request, List<String> fallbackChain) {
        if (fallbackChain.isEmpty()) {
            return Mono.error(new RuntimeException("No models available in fallback chain"));
        }
        
        String currentModel = fallbackChain.get(0);
        List<String> remainingModels = fallbackChain.subList(1, fallbackChain.size());
        
        return sendRequestToModel(request, currentModel)
            .onErrorResume(throwable -> {
                logger.warn("Model {} failed, trying next in fallback chain: {}", currentModel, throwable.getMessage());
                if (remainingModels.isEmpty()) {
                    return Mono.error(new RuntimeException("All models in fallback chain failed", throwable));
                }
                return sendRequestWithFallback(request, remainingModels);
            });
    }
    
    /**
     * Send request to a specific model
     */
    private Mono<LLMResponse> sendRequestToModel(LLMRequest request, String model) {
        logger.info("Sending request to model: {}", model);
        
        // Get current API key
        String currentKeyId = null;
        if (apiKeyService != null) {
            Optional<ai.refact.server.model.LLMApiKey> apiKey = apiKeyService.getAvailableKey();
            if (apiKey.isPresent()) {
                currentKeyId = apiKey.get().getId();
            }
        }
        final String keyId = currentKeyId;
        
        // Prepare the request
        Map<String, Object> requestBody = prepareRequestBody(request, model);
        
        // Track usage
        String requestId = UUID.randomUUID().toString();
        LLMUsage usage = new LLMUsage();
        usage.setRequestId(requestId);
        usage.setModel(model);
        usage.setTimestamp(LocalDateTime.now());
        usage.setInputTokens(estimateTokens(request.getMessages()));
        usageTracker.put(requestId, usage);
        
        return getWebClient().post()
            .uri("/chat/completions")
            .bodyValue(requestBody)
            .retrieve()
            .bodyToMono(Map.class)
            .timeout(Duration.ofSeconds(llmConfig.getOpenRouter().getTimeoutSeconds()))
            .map(response -> processResponse(response, usage))
            .doOnSuccess(response -> {
                logger.info("Successfully received response from model: {}", model);
                updateUsageTracking(usage, response);
                
                // Record usage in API key service
                if (apiKeyService != null && keyId != null) {
                    double cost = calculateCost(model, response.getTotalTokens());
                    apiKeyService.recordUsage(keyId, cost, true);
                }
            })
            .doOnError(error -> {
                logger.error("Error calling model {}: {}", model, error.getMessage());
                usage.setError(error.getMessage());
                
                // Record failed request
                if (apiKeyService != null && keyId != null) {
                    apiKeyService.recordUsage(keyId, 0.0, false);
                }
            });
    }
    
    /**
     * Prepare request body for OpenRouter API
     */
    private Map<String, Object> prepareRequestBody(LLMRequest request, String model) {
        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", model);
        requestBody.put("messages", request.getMessages());
        requestBody.put("max_tokens", request.getMaxTokens() != null ? request.getMaxTokens() : 4000);
        requestBody.put("temperature", request.getTemperature() != null ? request.getTemperature() : 0.7);
        requestBody.put("stream", false);
        
        // Add model-specific configuration
        LLMConfig.ModelConfig modelConfig = llmConfig.getModels().getModelConfigs().get(model);
        if (modelConfig != null) {
            if (modelConfig.getMaxTokens() > 0) {
                requestBody.put("max_tokens", Math.min(request.getMaxTokens() != null ? request.getMaxTokens() : 4000, modelConfig.getMaxTokens()));
            }
            if (modelConfig.getTemperature() >= 0) {
                requestBody.put("temperature", modelConfig.getTemperature());
            }
        }
        
        return requestBody;
    }
    
    /**
     * Process the response from OpenRouter API
     */
    private LLMResponse processResponse(Map<String, Object> response, LLMUsage usage) {
        LLMResponse llmResponse = new LLMResponse();
        
        // Extract response content
        List<Map<String, Object>> choices = (List<Map<String, Object>>) response.get("choices");
        if (choices != null && !choices.isEmpty()) {
            Map<String, Object> choice = choices.get(0);
            Map<String, Object> message = (Map<String, Object>) choice.get("message");
            if (message != null) {
                llmResponse.setContent((String) message.get("content"));
            }
        }
        
        // Extract usage information
        Map<String, Object> usageInfo = (Map<String, Object>) response.get("usage");
        if (usageInfo != null) {
            llmResponse.setInputTokens(((Number) usageInfo.get("prompt_tokens")).intValue());
            llmResponse.setOutputTokens(((Number) usageInfo.get("completion_tokens")).intValue());
            llmResponse.setTotalTokens(((Number) usageInfo.get("total_tokens")).intValue());
        }
        
        // Extract model information
        llmResponse.setModel((String) response.get("model"));
        llmResponse.setRequestId(usage.getRequestId());
        llmResponse.setTimestamp(LocalDateTime.now());
        llmResponse.setSuccess(true);
        
        return llmResponse;
    }
    
    /**
     * Update usage tracking with response information
     */
    private void updateUsageTracking(LLMUsage usage, LLMResponse response) {
        usage.setOutputTokens(response.getOutputTokens());
        usage.setTotalTokens(response.getTotalTokens());
        usage.setCost(calculateCost(response.getModel(), response.getTotalTokens()));
        usage.setSuccess(true);
    }
    
    /**
     * Calculate cost based on model and token usage
     */
    private double calculateCost(String model, int totalTokens) {
        LLMConfig.ModelConfig modelConfig = llmConfig.getModels().getModelConfigs().get(model);
        if (modelConfig != null) {
            return totalTokens * modelConfig.getCostPerToken();
        }
        // Default cost estimation
        return totalTokens * 0.0001; // $0.0001 per token
    }
    
    /**
     * Estimate token count for messages (rough approximation)
     */
    private int estimateTokens(List<Map<String, String>> messages) {
        int totalTokens = 0;
        for (Map<String, String> message : messages) {
            String content = message.get("content");
            if (content != null) {
                totalTokens += content.split("\\s+").length * 1.3; // Rough estimation
            }
        }
        return (int) totalTokens;
    }
    
    /**
     * Redact sensitive information from code
     */
    public String redactSensitiveInfo(String code) {
        if (!llmConfig.getSecurity().isEnableCodeRedaction()) {
            return code;
        }
        
        String redactedCode = code;
        for (Pattern pattern : SENSITIVE_PATTERNS) {
            redactedCode = pattern.matcher(redactedCode).replaceAll("$1 = [REDACTED]");
        }
        
        // Additional redaction for custom patterns
        List<String> customPatterns = llmConfig.getSecurity().getSensitivePatterns();
        if (customPatterns != null) {
            for (String customPattern : customPatterns) {
                redactedCode = redactedCode.replaceAll(customPattern, "[REDACTED]");
            }
        }
        
        return redactedCode;
    }
    
    /**
     * Get fallback chain for models
     */
    private List<String> getFallbackChain() {
        List<String> fallbackChain = llmConfig.getModels().getFallbackChain();
        if (fallbackChain == null || fallbackChain.isEmpty()) {
            fallbackChain = Arrays.asList(
                llmConfig.getModels().getPrimaryModel(),
                llmConfig.getModels().getFallbackModel1(),
                llmConfig.getModels().getFallbackModel2()
            );
        }
        return fallbackChain;
    }
    
    /**
     * Get usage statistics
     */
    public Map<String, Object> getUsageStatistics() {
        Map<String, Object> stats = new HashMap<>();
        
        double totalCost = usageTracker.values().stream()
            .filter(LLMUsage::isSuccess)
            .mapToDouble(LLMUsage::getCost)
            .sum();
        
        int totalRequests = usageTracker.size();
        int successfulRequests = (int) usageTracker.values().stream()
            .filter(LLMUsage::isSuccess)
            .count();
        
        stats.put("totalCost", totalCost);
        stats.put("totalRequests", totalRequests);
        stats.put("successfulRequests", successfulRequests);
        stats.put("successRate", totalRequests > 0 ? (double) successfulRequests / totalRequests : 0.0);
        stats.put("averageCostPerRequest", successfulRequests > 0 ? totalCost / successfulRequests : 0.0);
        
        return stats;
    }
    
    /**
     * Check if cost limits are exceeded
     */
    public boolean isCostLimitExceeded() {
        if (!llmConfig.getCost().isEnableCostTracking()) {
            return false;
        }
        
        double dailyCost = getDailyCost();
        double monthlyCost = getMonthlyCost();
        
        return dailyCost > llmConfig.getCost().getDailyLimit() || 
               monthlyCost > llmConfig.getCost().getMonthlyLimit();
    }
    
    /**
     * Get daily cost
     */
    private double getDailyCost() {
        LocalDateTime today = LocalDateTime.now().withHour(0).withMinute(0).withSecond(0);
        return usageTracker.values().stream()
            .filter(usage -> usage.getTimestamp().isAfter(today))
            .filter(LLMUsage::isSuccess)
            .mapToDouble(LLMUsage::getCost)
            .sum();
    }
    
    /**
     * Get monthly cost
     */
    private double getMonthlyCost() {
        LocalDateTime thisMonth = LocalDateTime.now().withDayOfMonth(1).withHour(0).withMinute(0).withSecond(0);
        return usageTracker.values().stream()
            .filter(usage -> usage.getTimestamp().isAfter(thisMonth))
            .filter(LLMUsage::isSuccess)
            .mapToDouble(LLMUsage::getCost)
            .sum();
    }
}
