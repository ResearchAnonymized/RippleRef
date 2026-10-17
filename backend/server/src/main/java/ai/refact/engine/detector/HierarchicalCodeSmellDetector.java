package ai.refact.engine.detector;

import ai.refact.engine.model.CodeSmell;
import ai.refact.engine.model.CodeSmellCluster;
import java.util.List;

/**
 * Base interface for all code smell detectors.
 * Provides a common contract for hierarchical code smell detection.
 */
public interface HierarchicalCodeSmellDetector {
    
    /**
     * Get the cluster this detector belongs to
     * @return the code smell cluster
     */
    CodeSmellCluster getCluster();
    
    /**
     * Get the name of this detector
     * @return detector name
     */
    String getDetectorName();
    
    /**
     * Get the description of what this detector finds
     * @return detector description
     */
    String getDescription();
    
    /**
     * Check if this detector is enabled
     * @return true if enabled, false otherwise
     */
    boolean isEnabled();
    
    /**
     * Set the enabled state of this detector
     * @param enabled the enabled state
     */
    void setEnabled(boolean enabled);
    
    /**
     * Get the priority of this detector (1-10, 10 being highest)
     * @return priority value
     */
    int getPriority();
    
    /**
     * Set the priority of this detector
     * @param priority priority value (1-10)
     */
    void setPriority(int priority);
    
    /**
     * Detect class-level code smells
     * @param content the file content to analyze
     * @return list of detected code smells
     */
    List<CodeSmell> detectClassLevelSmells(String content);
    
    /**
     * Detect method-level code smells
     * @param content the file content to analyze
     * @return list of detected code smells
     */
    List<CodeSmell> detectMethodLevelSmells(String content);
    
    /**
     * Detect design-level code smells
     * @param content the file content to analyze
     * @return list of detected code smells
     */
    List<CodeSmell> detectDesignLevelSmells(String content);
    
    /**
     * Detect code-level code smells
     * @param content the file content to analyze
     * @return list of detected code smells
     */
    List<CodeSmell> detectCodeLevelSmells(String content);
}
