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
public class PrimitiveObsessionDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.primitive-obsession";
    private static final double PRIMITIVE_RATIO_THRESHOLD = 0.7; // 70% primitives is considered excessive
    private static final int MIN_PRIMITIVES = 5; // Minimum primitives to consider
    
    // Pattern to match primitive types
    private static final Pattern PRIMITIVE_PATTERN = Pattern.compile(
        "\\b(int|long|double|float|boolean|char|byte|short)\\s+\\w+"
    );
    
    // Pattern to match object types (simplified)
    private static final Pattern OBJECT_PATTERN = Pattern.compile(
        "\\b(String|Integer|Long|Double|Float|Boolean|Character|Byte|Short|BigDecimal|BigInteger|Date|LocalDate|LocalDateTime|Optional|List|Map|Set|Collection)\\s+\\w+"
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
            .flatMap(sourceFile -> analyzeFileForPrimitiveObsession(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForPrimitiveObsession(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            // Read file content
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            // Analyze the entire file for primitive obsession
            PrimitiveObsessionAnalysis analysis = analyzeFileForPrimitives(lines);
            
            if (analysis.hasPrimitiveObsession()) {
                Severity severity = determineSeverity(analysis.getPrimitiveRatio(), analysis.getPrimitiveCount());
                
                ReasonEvidence evidence = new ReasonEvidence(
                    DETECTOR_ID,
                    new CodePointer(
                        projectRoot.relativize(sourceFile),
                        className,
                        "class",
                        1, // Start from beginning of file
                        Math.min(10, lines.size()), // Highlight first 10 lines
                        1,
                        1
                    ),
                    Map.of(
                        "primitiveCount", analysis.getPrimitiveCount(),
                        "objectCount", analysis.getObjectCount(),
                        "primitiveRatio", analysis.getPrimitiveRatio(),
                        "totalVariables", analysis.getTotalVariables(),
                        "className", className
                    ),
                    String.format("Class '%s' shows primitive obsession: %.1f%% of variables are primitives (%d/%d)", 
                                 className, analysis.getPrimitiveRatio() * 100, 
                                 analysis.getPrimitiveCount(), analysis.getTotalVariables()),
                    severity
                );
                
                evidences.add(evidence);
            }
            
            return evidences.stream();
        } catch (Exception e) {
            return Stream.empty();
        }
    }
    
    private PrimitiveObsessionAnalysis analyzeFileForPrimitives(List<String> lines) {
        int primitiveCount = 0;
        int objectCount = 0;
        
        for (String line : lines) {
            // Skip comments and empty lines
            if (line.trim().startsWith("//") || line.trim().startsWith("/*") || 
                line.trim().startsWith("*") || line.trim().isEmpty()) {
                continue;
            }
            
            // Count primitive declarations
            Matcher primitiveMatcher = PRIMITIVE_PATTERN.matcher(line);
            while (primitiveMatcher.find()) {
                primitiveCount++;
            }
            
            // Count object declarations
            Matcher objectMatcher = OBJECT_PATTERN.matcher(line);
            while (objectMatcher.find()) {
                objectCount++;
            }
        }
        
        int totalVariables = primitiveCount + objectCount;
        double primitiveRatio = totalVariables > 0 ? (double) primitiveCount / totalVariables : 0.0;
        
        return new PrimitiveObsessionAnalysis(primitiveCount, objectCount, totalVariables, primitiveRatio);
    }
    
    private Severity determineSeverity(double primitiveRatio, int primitiveCount) {
        if (primitiveRatio >= 0.9 || primitiveCount >= 15) {
            return Severity.CRITICAL;
        } else if (primitiveRatio >= 0.8 || primitiveCount >= 10) {
            return Severity.MAJOR;
        } else {
            return Severity.MINOR;
        }
    }
    
    // Helper class to hold analysis results
    private static class PrimitiveObsessionAnalysis {
        private final int primitiveCount;
        private final int objectCount;
        private final int totalVariables;
        private final double primitiveRatio;
        
        public PrimitiveObsessionAnalysis(int primitiveCount, int objectCount, int totalVariables, double primitiveRatio) {
            this.primitiveCount = primitiveCount;
            this.objectCount = objectCount;
            this.totalVariables = totalVariables;
            this.primitiveRatio = primitiveRatio;
        }
        
        public boolean hasPrimitiveObsession() {
            return primitiveRatio >= PRIMITIVE_RATIO_THRESHOLD && primitiveCount >= MIN_PRIMITIVES;
        }
        
        public int getPrimitiveCount() { return primitiveCount; }
        public int getObjectCount() { return objectCount; }
        public int getTotalVariables() { return totalVariables; }
        public double getPrimitiveRatio() { return primitiveRatio; }
    }
}
