package ai.refact.api;

/**
 * Types of build systems.
 */
public enum BuildSystemType {
    MAVEN,
    GRADLE,
    UNKNOWN;
    
    public String getVersion() {
        return "unknown";
    }
    
    public boolean isSupported() {
        return this != UNKNOWN;
    }
}
