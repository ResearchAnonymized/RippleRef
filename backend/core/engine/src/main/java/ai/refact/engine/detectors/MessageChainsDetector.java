package ai.refact.engine.detectors;

import ai.refact.api.CodePointer;
import ai.refact.api.ReasonEvidence;
import ai.refact.api.Severity;
import ai.refact.api.ProjectContext;
import ai.refact.api.ReasonDetector;
import ai.refact.api.ReasonCategory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

@Component
public class MessageChainsDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.message-chains";
    private static final int MIN_CHAIN_LENGTH = 3; // Minimum chain length to be considered problematic
    private static final int MAX_CHAIN_LENGTH_FOR_MINOR = 4; // Chain length for minor severity
    private static final int MAX_CHAIN_LENGTH_FOR_MAJOR = 6; // Chain length for major severity
    
    // Pattern to match method call chains (a.b.c.d.e)
    private static final Pattern MESSAGE_CHAIN_PATTERN = Pattern.compile(
        "\\b(\\w+(?:\\.\\w+){2,})\\s*\\("
    );
    
    // Pattern to match method declarations
    private static final Pattern METHOD_PATTERN = Pattern.compile(
        "\\s*(public|private|protected|static|final|abstract)?\\s+" +
        "(\\w+\\s+)*" + // return type
        "(\\w+)\\s*\\(" + // method name
        "([^)]*)\\)" // parameters
    );
    
    @Override
    public String id() {
        return DETECTOR_ID;
    }
    
    @Override
    public ReasonCategory category() {
        return ReasonCategory.DESIGN;
    }
    
    @Override
    public boolean isApplicable(ProjectContext ctx) {
        // This detector is always applicable for Java projects
        return true;
    }
    
    @Override
    public Stream<ReasonEvidence> detect(ProjectContext ctx) {
        // Only analyze if we have source files
        if (ctx.sourceFiles().isEmpty()) {
            return Stream.empty();
        }
        
        // Analyze each Java source file
        return ctx.sourceFiles().stream()
            .flatMap(sourceFile -> analyzeFileForMessageChains(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForMessageChains(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            // Read file content
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            // Find all methods in the class
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i);
                Matcher methodMatcher = METHOD_PATTERN.matcher(line);
                
                if (methodMatcher.find() && !line.contains("class ") && !line.contains("interface ")) {
                    String methodName = methodMatcher.group(3);
                    int methodEndLine = findMethodEndLine(lines, i);
                    
                    // Analyze method for message chains
                    MessageChainAnalysis analysis = analyzeMethodForMessageChains(lines, i, methodEndLine);
                    
                    if (analysis.hasMessageChains()) {
                        Severity severity = determineSeverity(analysis.getMaxChainLength());
                        
                        ReasonEvidence evidence = new ReasonEvidence(
                            DETECTOR_ID,
                            new CodePointer(
                                projectRoot.relativize(sourceFile),
                                className,
                                methodName,
                                i + 1, // 1-based line number
                                methodEndLine,
                                1,
                                1
                            ),
                            Map.of(
                                "maxChainLength", analysis.getMaxChainLength(),
                                "chainCount", analysis.getChainCount(),
                                "longestChain", analysis.getLongestChain(),
                                "methodName", methodName
                            ),
                            String.format("Method '%s' contains message chains: longest chain has %d calls (%s)", 
                                         methodName, analysis.getMaxChainLength(), analysis.getLongestChain()),
                            severity
                        );
                        
                        evidences.add(evidence);
                    }
                }
            }
            
            return evidences.stream();
        } catch (Exception e) {
            return Stream.empty();
        }
    }
    
    private MessageChainAnalysis analyzeMethodForMessageChains(List<String> lines, int methodStartLine, int methodEndLine) {
        int maxChainLength = 0;
        int chainCount = 0;
        String longestChain = "";
        
        // Analyze method body for message chains
        for (int i = methodStartLine; i < methodEndLine && i < lines.size(); i++) {
            String line = lines.get(i);
            
            // Skip comments and empty lines
            if (line.trim().startsWith("//") || line.trim().startsWith("/*") || 
                line.trim().startsWith("*") || line.trim().isEmpty()) {
                continue;
            }
            
            // Find message chains in this line
            Matcher chainMatcher = MESSAGE_CHAIN_PATTERN.matcher(line);
            while (chainMatcher.find()) {
                String chain = chainMatcher.group(1);
                int chainLength = countChainLength(chain);
                
                if (chainLength >= MIN_CHAIN_LENGTH) {
                    chainCount++;
                    if (chainLength > maxChainLength) {
                        maxChainLength = chainLength;
                        longestChain = chain;
                    }
                }
            }
        }
        
        return new MessageChainAnalysis(maxChainLength, chainCount, longestChain);
    }
    
    private int countChainLength(String chain) {
        if (chain == null || chain.isEmpty()) {
            return 0;
        }
        
        // Count dots + 1 (a.b.c has 2 dots, so length is 3)
        int dotCount = 0;
        for (char c : chain.toCharArray()) {
            if (c == '.') {
                dotCount++;
            }
        }
        
        return dotCount + 1;
    }
    
    private int findMethodEndLine(List<String> lines, int methodStartLine) {
        int braceCount = 0;
        boolean inMethod = false;
        
        for (int i = methodStartLine; i < lines.size(); i++) {
            String line = lines.get(i);
            
            for (char c : line.toCharArray()) {
                if (c == '{') {
                    braceCount++;
                    inMethod = true;
                } else if (c == '}') {
                    braceCount--;
                    if (inMethod && braceCount == 0) {
                        return i + 1; // 1-based line number
                    }
                }
            }
        }
        
        return Math.min(methodStartLine + 20, lines.size()); // Fallback
    }
    
    private Severity determineSeverity(int chainLength) {
        if (chainLength >= MAX_CHAIN_LENGTH_FOR_MAJOR) {
            return Severity.MAJOR;
        } else if (chainLength >= MAX_CHAIN_LENGTH_FOR_MINOR) {
            return Severity.MINOR;
        } else {
            return Severity.MINOR;
        }
    }
    
    // Helper class to hold analysis results
    private static class MessageChainAnalysis {
        private final int maxChainLength;
        private final int chainCount;
        private final String longestChain;
        
        public MessageChainAnalysis(int maxChainLength, int chainCount, String longestChain) {
            this.maxChainLength = maxChainLength;
            this.chainCount = chainCount;
            this.longestChain = longestChain;
        }
        
        public boolean hasMessageChains() {
            return maxChainLength >= MIN_CHAIN_LENGTH;
        }
        
        public int getMaxChainLength() { return maxChainLength; }
        public int getChainCount() { return chainCount; }
        public String getLongestChain() { return longestChain; }
    }
}
