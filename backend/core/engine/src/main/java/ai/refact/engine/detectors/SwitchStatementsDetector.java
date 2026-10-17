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
public class SwitchStatementsDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.switch-statements";
    private static final int MIN_CASES = 3; // Minimum cases to be considered complex
    private static final int MAX_CASES_FOR_MINOR = 5; // Cases for minor severity
    private static final int MAX_CASES_FOR_MAJOR = 8; // Cases for major severity
    
    // Pattern to match switch statements
    private static final Pattern SWITCH_PATTERN = Pattern.compile(
        "\\s*switch\\s*\\([^)]+\\)\\s*\\{"
    );
    
    // Pattern to match case statements
    private static final Pattern CASE_PATTERN = Pattern.compile(
        "\\s*case\\s+[^:]+:"
    );
    
    // Pattern to match default case
    private static final Pattern DEFAULT_PATTERN = Pattern.compile(
        "\\s*default\\s*:"
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
            .flatMap(sourceFile -> analyzeFileForSwitchStatements(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForSwitchStatements(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            // Read file content
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            // Find all switch statements
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i);
                Matcher switchMatcher = SWITCH_PATTERN.matcher(line);
                
                if (switchMatcher.find()) {
                    SwitchAnalysis analysis = analyzeSwitchStatement(lines, i);
                    
                    if (analysis.getCaseCount() >= MIN_CASES) {
                        Severity severity = determineSeverity(analysis.getCaseCount());
                        
                        // Find the method containing this switch
                        String methodName = findContainingMethod(lines, i);
                        
                        ReasonEvidence evidence = new ReasonEvidence(
                            DETECTOR_ID,
                            new CodePointer(
                                projectRoot.relativize(sourceFile),
                                className,
                                methodName,
                                i + 1, // 1-based line number
                                findSwitchEndLine(lines, i),
                                1,
                                1
                            ),
                            Map.of(
                                "caseCount", analysis.getCaseCount(),
                                "hasDefault", analysis.hasDefault(),
                                "switchExpression", analysis.getSwitchExpression(),
                                "methodName", methodName
                            ),
                            String.format("Complex switch statement in method '%s': %d cases (consider polymorphism)", 
                                         methodName, analysis.getCaseCount()),
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
    
    private SwitchAnalysis analyzeSwitchStatement(List<String> lines, int switchLine) {
        int caseCount = 0;
        boolean hasDefault = false;
        String switchExpression = extractSwitchExpression(lines.get(switchLine));
        int endLine = findSwitchEndLine(lines, switchLine);
        
        // Count cases within the switch statement
        for (int i = switchLine; i < endLine && i < lines.size(); i++) {
            String line = lines.get(i);
            
            Matcher caseMatcher = CASE_PATTERN.matcher(line);
            if (caseMatcher.find()) {
                caseCount++;
            }
            
            Matcher defaultMatcher = DEFAULT_PATTERN.matcher(line);
            if (defaultMatcher.find()) {
                hasDefault = true;
            }
        }
        
        return new SwitchAnalysis(caseCount, hasDefault, switchExpression);
    }
    
    private String extractSwitchExpression(String switchLine) {
        // Extract the expression inside switch()
        Pattern exprPattern = Pattern.compile("switch\\s*\\(([^)]+)\\)");
        Matcher matcher = exprPattern.matcher(switchLine);
        if (matcher.find()) {
            return matcher.group(1).trim();
        }
        return "unknown";
    }
    
    private String findContainingMethod(List<String> lines, int switchLine) {
        // Look backwards from switch line to find method declaration
        for (int i = switchLine; i >= 0; i--) {
            String line = lines.get(i);
            if (line.contains("public ") || line.contains("private ") || line.contains("protected ")) {
                if (line.contains("(") && line.contains(")")) {
                    // Extract method name
                    Pattern methodPattern = Pattern.compile("\\s*(public|private|protected|static|final|abstract)?\\s+(\\w+\\s+)*\\s*(\\w+)\\s*\\(");
                    Matcher matcher = methodPattern.matcher(line);
                    if (matcher.find()) {
                        return matcher.group(3);
                    }
                }
            }
        }
        return "unknown";
    }
    
    private int findSwitchEndLine(List<String> lines, int switchLine) {
        int braceCount = 0;
        boolean inSwitch = false;
        
        for (int i = switchLine; i < lines.size(); i++) {
            String line = lines.get(i);
            
            for (char c : line.toCharArray()) {
                if (c == '{') {
                    braceCount++;
                    inSwitch = true;
                } else if (c == '}') {
                    braceCount--;
                    if (inSwitch && braceCount == 0) {
                        return i + 1; // 1-based line number
                    }
                }
            }
        }
        
        return Math.min(switchLine + 20, lines.size()); // Fallback
    }
    
    private Severity determineSeverity(int caseCount) {
        if (caseCount >= MAX_CASES_FOR_MAJOR) {
            return Severity.MAJOR;
        } else if (caseCount >= MAX_CASES_FOR_MINOR) {
            return Severity.MINOR;
        } else {
            return Severity.MINOR;
        }
    }
    
    // Helper class to hold analysis results
    private static class SwitchAnalysis {
        private final int caseCount;
        private final boolean hasDefault;
        private final String switchExpression;
        
        public SwitchAnalysis(int caseCount, boolean hasDefault, String switchExpression) {
            this.caseCount = caseCount;
            this.hasDefault = hasDefault;
            this.switchExpression = switchExpression;
        }
        
        public int getCaseCount() { return caseCount; }
        public boolean hasDefault() { return hasDefault; }
        public String getSwitchExpression() { return switchExpression; }
    }
}
