package ai.refact.api;

import java.util.Map;

/**
 * Context information about refactoring policies and constraints.
 */
public record PolicyContext(
    Map<String, Object> weights,
    Map<String, Object> gates,
    Map<String, Object> detectorSettings,
    Map<String, Object> transformSettings,
    java.util.Set<String> protectedPackages
) {
    
    /**
     * Get a weight value with a default.
     */
    @SuppressWarnings("unchecked")
    public <T> T getWeight(String key, T defaultValue) {
        return (T) weights.getOrDefault(key, defaultValue);
    }
    
    /**
     * Get a gate value with a default.
     */
    @SuppressWarnings("unchecked")
    public <T> T getGate(String key, T defaultValue) {
        return (T) gates.getOrDefault(key, defaultValue);
    }
    
    /**
     * Get detector settings for a specific detector.
     */
    @SuppressWarnings("unchecked")
    public <T> T getDetectorSetting(String detectorId, String key, T defaultValue) {
        Map<String, Object> detectorConfig = (Map<String, Object>) detectorSettings.get(detectorId);
        if (detectorConfig == null) {
            return defaultValue;
        }
        return (T) detectorConfig.getOrDefault(key, defaultValue);
    }
    
    /**
     * Get transform settings for a specific transform.
     */
    @SuppressWarnings("unchecked")
    public <T> T getTransformSetting(String transformId, String key, T defaultValue) {
        Map<String, Object> transformConfig = (Map<String, Object>) transformSettings.get(transformId);
        if (transformConfig == null) {
            return defaultValue;
        }
        return (T) transformConfig.getOrDefault(key, defaultValue);
    }
    
    /**
     * Check if a package is protected.
     */
    public boolean isPackageProtected(String packageName) {
        return protectedPackages.stream()
            .anyMatch(pattern -> matchesPattern(packageName, pattern));
    }
    
    private boolean matchesPattern(String packageName, String pattern) {
        if (pattern.endsWith(".**")) {
            String prefix = pattern.substring(0, pattern.length() - 3);
            return packageName.startsWith(prefix);
        }
        return packageName.equals(pattern);
    }
}
