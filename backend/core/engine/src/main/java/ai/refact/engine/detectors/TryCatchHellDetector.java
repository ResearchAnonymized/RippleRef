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
public class TryCatchHellDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.try-catch-hell";
    private static final int MAX_NESTED_TRY_CATCH = 2; // Maximum nested try-catch levels
    private static final int MAX_CATCH_BLOCKS = 5; // Maximum catch blocks in one try
    
    // Pattern to match method declarations
    private static final Pattern METHOD_PATTERN = Pattern.compile(
        "\\s*(public|private|protected|static|final|abstract)?\\s+" +
        "([\\w.<>\\[\\]]+)\\s+" + // return type
        "(\\w+)\\s*\\(" // method name
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
        return true; // Always applicable for Java projects
    }
    
    @Override
    public Stream<ReasonEvidence> detect(ProjectContext ctx) {
        if (ctx.sourceFiles().isEmpty()) {
            return Stream.empty();
        }
        
        return ctx.sourceFiles().stream()
            .flatMap(sourceFile -> analyzeFileForTryCatchHell(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForTryCatchHell(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i);
                Matcher matcher = METHOD_PATTERN.matcher(line);
                
                if (matcher.find() && !line.contains("class ") && !line.contains("interface ")) {
                    String methodName = matcher.group(3);
                    int methodEndLine = findMethodEndLine(lines, i);
                    
                    // Analyze try-catch patterns in this method
                    TryCatchAnalysis analysis = analyzeTryCatch(lines, i, methodEndLine);
                    
                    if (analysis.hasTryCatchHell()) {
                        Severity severity = determineSeverity(
                            analysis.getMaxNestingLevel(), 
                            analysis.getMaxCatchBlocks()
                        );
                        
                        ReasonEvidence evidence = new ReasonEvidence(
                            DETECTOR_ID,
                            new CodePointer(
                                projectRoot.relativize(sourceFile),
                                className,
                                methodName,
                                i + 1,
                                methodEndLine,
                                1,
                                1
                            ),
                            Map.of(
                                "maxNestingLevel", analysis.getMaxNestingLevel(),
                                "maxCatchBlocks", analysis.getMaxCatchBlocks(),
                                "totalTryBlocks", analysis.getTotalTryBlocks(),
                                "methodName", methodName
                            ),
                            String.format("Method '%s' has excessive exception handling: %d nested try-catch levels, %d catch blocks", 
                                         methodName, analysis.getMaxNestingLevel(), analysis.getMaxCatchBlocks()),
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
    
    private TryCatchAnalysis analyzeTryCatch(List<String> lines, int methodStartLine, int methodEndLine) {
        int currentNestingLevel = 0;
        int maxNestingLevel = 0;
        int currentCatchCount = 0;
        int maxCatchBlocks = 0;
        int totalTryBlocks = 0;
        boolean inTryBlock = false;
        
        for (int i = methodStartLine; i < methodEndLine && i < lines.size(); i++) {
            String line = lines.get(i).trim();
            
            // Skip comments and empty lines
            if (line.isEmpty() || line.startsWith("//") || 
                line.startsWith("/*") || line.startsWith("*")) {
                continue;
            }
            
            // Check for try block
            if (line.startsWith("try ") || line.startsWith("try{")) {
                currentNestingLevel++;
                maxNestingLevel = Math.max(maxNestingLevel, currentNestingLevel);
                totalTryBlocks++;
                inTryBlock = true;
                currentCatchCount = 0;
            }
            
            // Check for catch block
            if (line.startsWith("catch ") || line.startsWith("catch(")) {
                currentCatchCount++;
                maxCatchBlocks = Math.max(maxCatchBlocks, currentCatchCount);
            }
            
            // Check for closing braces after catch
            if (line.startsWith("}") && inTryBlock) {
                // Check if next line is not a catch
                if (i + 1 < lines.size()) {
                    String nextLine = lines.get(i + 1).trim();
                    if (!nextLine.startsWith("catch")) {
                        currentNestingLevel = Math.max(0, currentNestingLevel - 1);
                        inTryBlock = false;
                    }
                }
            }
        }
        
        return new TryCatchAnalysis(maxNestingLevel, maxCatchBlocks, totalTryBlocks);
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
                        return i + 1;
                    }
                }
            }
        }
        
        return Math.min(methodStartLine + 50, lines.size());
    }
    
    private Severity determineSeverity(int nestingLevel, int catchBlocks) {
        if (nestingLevel >= 4 || catchBlocks >= 8) {
            return Severity.CRITICAL;
        } else if (nestingLevel >= 3 || catchBlocks >= 6) {
            return Severity.MAJOR;
        } else {
            return Severity.MINOR;
        }
    }
    
    // Helper class
    private static class TryCatchAnalysis {
        private final int maxNestingLevel;
        private final int maxCatchBlocks;
        private final int totalTryBlocks;
        
        public TryCatchAnalysis(int maxNestingLevel, int maxCatchBlocks, int totalTryBlocks) {
            this.maxNestingLevel = maxNestingLevel;
            this.maxCatchBlocks = maxCatchBlocks;
            this.totalTryBlocks = totalTryBlocks;
        }
        
        public boolean hasTryCatchHell() {
            return maxNestingLevel > MAX_NESTED_TRY_CATCH || maxCatchBlocks > MAX_CATCH_BLOCKS;
        }
        
        public int getMaxNestingLevel() { return maxNestingLevel; }
        public int getMaxCatchBlocks() { return maxCatchBlocks; }
        public int getTotalTryBlocks() { return totalTryBlocks; }
    }
}
