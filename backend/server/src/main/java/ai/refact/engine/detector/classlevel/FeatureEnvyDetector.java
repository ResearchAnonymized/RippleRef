package ai.refact.engine.detector.classlevel;

import ai.refact.engine.detector.HierarchicalCodeSmellDetector;
import ai.refact.engine.model.*;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Detects Feature Envy code smells.
 * Feature Envy occurs when a class uses methods or data from another class
 * more than it uses its own methods or data.
 */
@Component("hierarchicalFeatureEnvyDetector")
public class FeatureEnvyDetector implements HierarchicalCodeSmellDetector {
    
    private static final double FEATURE_ENVY_THRESHOLD = 0.6; // 60% of method calls are to other classes
    private static final int MIN_METHOD_CALLS = 5; // Minimum method calls to analyze
    
    private boolean enabled = true;
    private int priority = 7; // High priority
    
    @Override
    public CodeSmellCluster getCluster() {
        return CodeSmellCluster.CLASS_LEVEL;
    }
    
    @Override
    public String getDetectorName() {
        return "Feature Envy Detector";
    }
    
    @Override
    public String getDescription() {
        return "Detects classes that excessively use methods or data from other classes";
    }
    
    @Override
    public boolean isEnabled() {
        return enabled;
    }
    
    @Override
    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }
    
    @Override
    public int getPriority() {
        return 7;
    }
    
    @Override
    public void setPriority(int priority) {
        // Priority is fixed
    }
    
    
    @Override
    public List<CodeSmell> detectClassLevelSmells(String content) {
        return detectFeatureEnvy(content, "");
    }
    
    @Override
    public List<CodeSmell> detectMethodLevelSmells(String content) {
        return new ArrayList<>();
    }
    
    @Override
    public List<CodeSmell> detectDesignLevelSmells(String content) {
        return new ArrayList<>();
    }
    
    @Override
    public List<CodeSmell> detectCodeLevelSmells(String content) {
        return new ArrayList<>();
    }
    
    /**
     * Detect Feature Envy smells in the given content
     * @param content the Java source code content
     * @param filePath the file path
     * @return list of detected code smells
     */
    public List<CodeSmell> detectFeatureEnvy(String content, String filePath) {
        List<CodeSmell> smells = new ArrayList<>();
        
        if (!enabled) {
            return smells;
        }
        
        try {
            // Analyze method calls and field access
            FeatureEnvyAnalysis analysis = analyzeFeatureEnvy(content);
            
            if (analysis.getTotalMethodCalls() >= MIN_METHOD_CALLS) {
                double externalCallRatio = (double) analysis.getExternalMethodCalls() / analysis.getTotalMethodCalls();
                
                if (externalCallRatio > FEATURE_ENVY_THRESHOLD) {
                    smells.add(createFeatureEnvySmell(
                        "Feature Envy: " + analysis.getClassName(),
                        "Class '" + analysis.getClassName() + "' has " + 
                        String.format("%.1f", externalCallRatio * 100) + 
                        "% of method calls to other classes (" + analysis.getExternalMethodCalls() + 
                        " out of " + analysis.getTotalMethodCalls() + " total calls). " +
                        "This suggests the class is more interested in other classes than its own data.",
                        analysis.getExternalMethodCalls(),
                        analysis.getTotalMethodCalls(),
                        SmellSeverity.MAJOR,
                        "Consider moving the method to the class it's most interested in, or " +
                        "restructuring the data so the method can work with its own class's data."
                    ));
                }
            }
            
            // Check for excessive field access to other classes
            if (analysis.getExternalFieldAccess() > analysis.getOwnFieldAccess() * 2) {
                smells.add(createFeatureEnvySmell(
                    "Data Envy: " + analysis.getClassName(),
                    "Class '" + analysis.getClassName() + "' accesses external fields " + 
                    analysis.getExternalFieldAccess() + " times vs " + analysis.getOwnFieldAccess() + 
                    " times for its own fields. This suggests the class is more interested in other classes' data.",
                    analysis.getExternalFieldAccess(),
                    analysis.getOwnFieldAccess(),
                    SmellSeverity.MINOR,
                    "Consider moving the method to the class whose data it's accessing, " +
                    "or restructuring the data relationships."
                ));
            }
            
        } catch (Exception e) {
            // Log error but don't fail the entire analysis
            System.err.println("Error in FeatureEnvyDetector: " + e.getMessage());
        }
        
        return smells;
    }
    
    private CodeSmell createFeatureEnvySmell(String title, String description, int externalCalls, 
                                            int totalCalls, SmellSeverity severity, String suggestion) {
        return new CodeSmell(
            SmellType.FEATURE_ENVY,
            SmellCategory.COUPLER,
            severity,
            title,
            description,
            suggestion,
            1, // startLine - Class-level smell
            1, // endLine
            List.of(suggestion)
        );
    }
    
    private FeatureEnvyAnalysis analyzeFeatureEnvy(String content) {
        String className = extractClassName(content);
        
        // Count method calls
        int totalMethodCalls = countMethodCalls(content);
        int externalMethodCalls = countExternalMethodCalls(content, className);
        
        // Count field access
        int ownFieldAccess = countOwnFieldAccess(content, className);
        int externalFieldAccess = countExternalFieldAccess(content, className);
        
        return new FeatureEnvyAnalysis(
            className, totalMethodCalls, externalMethodCalls, 
            ownFieldAccess, externalFieldAccess
        );
    }
    
    private String extractClassName(String content) {
        Pattern classPattern = Pattern.compile("(?:public\\s+)?class\\s+(\\w+)");
        Matcher matcher = classPattern.matcher(content);
        if (matcher.find()) {
            return matcher.group(1);
        }
        return "Unknown";
    }
    
    private int countMethodCalls(String content) {
        // Count method calls (excluding declarations)
        Pattern methodCallPattern = Pattern.compile("\\w+\\s*\\([^)]*\\)");
        Matcher matcher = methodCallPattern.matcher(content);
        int count = 0;
        while (matcher.find()) {
            String match = matcher.group();
            // Skip method declarations
            if (!match.contains("=") && !match.contains("return") && 
                !match.contains("if") && !match.contains("while") && 
                !match.contains("for") && !match.contains("switch")) {
                count++;
            }
        }
        return count;
    }
    
    private int countExternalMethodCalls(String content, String className) {
        // Count method calls to other classes (simplified detection)
        Pattern externalCallPattern = Pattern.compile("\\w+\\.[\\w]+\\s*\\([^)]*\\)");
        Matcher matcher = externalCallPattern.matcher(content);
        int count = 0;
        while (matcher.find()) {
            String match = matcher.group();
            // Skip calls to 'this' or same class
            if (!match.startsWith("this.") && !match.startsWith(className + ".")) {
                count++;
            }
        }
        return count;
    }
    
    private int countOwnFieldAccess(String content, String className) {
        // Count access to own fields (simplified)
        Pattern ownFieldPattern = Pattern.compile("this\\.\\w+|\\b\\w+\\s*=");
        Matcher matcher = ownFieldPattern.matcher(content);
        int count = 0;
        while (matcher.find()) {
            count++;
        }
        return count;
    }
    
    private int countExternalFieldAccess(String content, String className) {
        // Count access to external fields (simplified)
        Pattern externalFieldPattern = Pattern.compile("\\w+\\.\\w+");
        Matcher matcher = externalFieldPattern.matcher(content);
        int count = 0;
        while (matcher.find()) {
            String match = matcher.group();
            if (!match.startsWith("this.") && !match.startsWith(className + ".")) {
                count++;
            }
        }
        return count;
    }
    
    private static class FeatureEnvyAnalysis {
        private final String className;
        private final int totalMethodCalls;
        private final int externalMethodCalls;
        private final int ownFieldAccess;
        private final int externalFieldAccess;
        
        public FeatureEnvyAnalysis(String className, int totalMethodCalls, int externalMethodCalls,
                                  int ownFieldAccess, int externalFieldAccess) {
            this.className = className;
            this.totalMethodCalls = totalMethodCalls;
            this.externalMethodCalls = externalMethodCalls;
            this.ownFieldAccess = ownFieldAccess;
            this.externalFieldAccess = externalFieldAccess;
        }
        
        public String getClassName() { return className; }
        public int getTotalMethodCalls() { return totalMethodCalls; }
        public int getExternalMethodCalls() { return externalMethodCalls; }
        public int getOwnFieldAccess() { return ownFieldAccess; }
        public int getExternalFieldAccess() { return externalFieldAccess; }
    }
}
