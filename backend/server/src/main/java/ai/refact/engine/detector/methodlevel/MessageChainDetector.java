package ai.refact.engine.detector.methodlevel;

import ai.refact.engine.detector.HierarchicalCodeSmellDetector;
import ai.refact.engine.model.*;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Detects Message Chain code smells.
 * A Message Chain occurs when a client requests an object to perform an action,
 * and that object requests another object, which requests another object, etc.
 */
@Component
public class MessageChainDetector implements HierarchicalCodeSmellDetector {
    
    private static final int MESSAGE_CHAIN_THRESHOLD = 3; // method calls in chain
    private static final int LONG_MESSAGE_CHAIN_THRESHOLD = 5; // method calls in chain
    private static final int VERY_LONG_MESSAGE_CHAIN_THRESHOLD = 7; // method calls in chain
    
    private boolean enabled = true;
    
    @Override
    public CodeSmellCluster getCluster() {
        return CodeSmellCluster.METHOD_LEVEL;
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
    public String getDetectorName() {
        return "Message Chain Detector";
    }
    
    @Override
    public String getDescription() {
        return "Detects long chains of method calls";
    }
    
    @Override
    public int getPriority() {
        return 5;
    }
    
    @Override
    public void setPriority(int priority) {
        // Priority is fixed
    }
    
    @Override
    public List<CodeSmell> detectClassLevelSmells(String content) {
        return new ArrayList<>(); // Not applicable for method-level detector
    }
    
    @Override
    public List<CodeSmell> detectMethodLevelSmells(String content) {
        if (!enabled) return new ArrayList<>();
        
        List<CodeSmell> smells = new ArrayList<>();
        String[] lines = content.split("\n");
        
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            if (line.contains(".") && !line.startsWith("//") && !line.startsWith("*")) {
                int chainLength = detectMessageChain(line);
                if (chainLength >= VERY_LONG_MESSAGE_CHAIN_THRESHOLD) {
                    smells.add(createMessageChainSmell(
                        "Very Long Message Chain",
                        "Message chain with " + chainLength + " calls found at line " + (i + 1),
                        chainLength,
                        SmellSeverity.CRITICAL,
                        "Hide Delegate or Extract Method to break the chain."
                    ));
                } else if (chainLength >= LONG_MESSAGE_CHAIN_THRESHOLD) {
                    smells.add(createMessageChainSmell(
                        "Long Message Chain",
                        "Message chain with " + chainLength + " calls found at line " + (i + 1),
                        chainLength,
                        SmellSeverity.MAJOR,
                        "Consider hiding the delegate or extracting a method."
                    ));
                } else if (chainLength >= MESSAGE_CHAIN_THRESHOLD) {
                    smells.add(createMessageChainSmell(
                        "Message Chain",
                        "Message chain with " + chainLength + " calls found at line " + (i + 1),
                        chainLength,
                        SmellSeverity.MINOR,
                        "Consider reducing the chain length for better maintainability."
                    ));
                }
            }
        }
        
        return smells;
    }
    
    @Override
    public List<CodeSmell> detectDesignLevelSmells(String content) {
        return new ArrayList<>(); // Not applicable for method-level detector
    }
    
    @Override
    public List<CodeSmell> detectCodeLevelSmells(String content) {
        return new ArrayList<>(); // Not applicable for method-level detector
    }
    
    private int detectMessageChain(String line) {
        // Count consecutive method calls (object.method().method().method())
        Pattern chainPattern = Pattern.compile("\\w+\\.\\w+");
        Matcher matcher = chainPattern.matcher(line);
        
        int maxChainLength = 0;
        int currentChainLength = 0;
        
        while (matcher.find()) {
            currentChainLength++;
            maxChainLength = Math.max(maxChainLength, currentChainLength);
        }
        
        return maxChainLength;
    }
    
    private CodeSmell createMessageChainSmell(String title, String description, int chainLength, 
                                             SmellSeverity severity, String suggestion) {
        return new CodeSmell(
            SmellType.MESSAGE_CHAIN,
            SmellCategory.COUPLER,
            severity,
            title,
            description,
            suggestion,
            1, // startLine - Method-level smell
            1, // endLine
            List.of("Hide Delegate", "Extract Method", "Move Method")
        );
    }
}
