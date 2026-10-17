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
import java.util.stream.Stream;

@Component
public class EmptyCatchBlockDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.empty-catch-block";
    
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
            .flatMap(sourceFile -> analyzeFileForEmptyCatchBlocks(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForEmptyCatchBlocks(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty()) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i).trim();
                
                // Check for catch block
                if (line.startsWith("catch ") || line.startsWith("catch(")) {
                    int catchStartLine = i;
                    int catchEndLine = findCatchBlockEnd(lines, i);
                    
                    // Check if catch block is empty
                    if (isCatchBlockEmpty(lines, catchStartLine, catchEndLine)) {
                        ReasonEvidence evidence = new ReasonEvidence(
                            DETECTOR_ID,
                            new CodePointer(
                                projectRoot.relativize(sourceFile),
                                className,
                                "catch-block",
                                i + 1, // 1-based line number
                                catchEndLine,
                                1,
                                1
                            ),
                            Map.of(
                                "catchLine", i + 1,
                                "exceptionType", extractExceptionType(line)
                            ),
                            String.format("Empty catch block at line %d - exceptions are silently swallowed", i + 1),
                            Severity.CRITICAL // Empty catch is critical - it swallows exceptions
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
    
    private int findCatchBlockEnd(List<String> lines, int catchStartLine) {
        int braceCount = 0;
        boolean foundOpenBrace = false;
        
        for (int i = catchStartLine; i < lines.size(); i++) {
            String line = lines.get(i);
            
            for (char c : line.toCharArray()) {
                if (c == '{') {
                    braceCount++;
                    foundOpenBrace = true;
                } else if (c == '}') {
                    braceCount--;
                    if (foundOpenBrace && braceCount == 0) {
                        return i + 1; // 1-based line number
                    }
                }
            }
        }
        
        return Math.min(catchStartLine + 10, lines.size());
    }
    
    private boolean isCatchBlockEmpty(List<String> lines, int catchStartLine, int catchEndLine) {
        boolean foundOpenBrace = false;
        
        for (int i = catchStartLine; i < catchEndLine && i < lines.size(); i++) {
            String line = lines.get(i).trim();
            
            // Find the opening brace
            if (!foundOpenBrace && line.contains("{")) {
                foundOpenBrace = true;
                // Check if there's code after the opening brace on the same line
                String afterBrace = line.substring(line.indexOf("{") + 1).trim();
                if (!afterBrace.isEmpty() && !afterBrace.equals("}")) {
                    return false; // Has code
                }
                continue;
            }
            
            if (foundOpenBrace) {
                // Skip empty lines and comments
                if (line.isEmpty() || line.startsWith("//") || 
                    line.startsWith("/*") || line.startsWith("*") || line.equals("}")) {
                    continue;
                }
                
                // Found actual code in catch block
                return false;
            }
        }
        
        return true; // No code found in catch block
    }
    
    private String extractExceptionType(String catchLine) {
        // Extract exception type from catch(Exception e) or catch (Exception e)
        int startParen = catchLine.indexOf("(");
        int endParen = catchLine.indexOf(")");
        
        if (startParen != -1 && endParen != -1) {
            String params = catchLine.substring(startParen + 1, endParen).trim();
            String[] parts = params.split("\\s+");
            if (parts.length > 0) {
                return parts[0]; // Return the exception type
            }
        }
        
        return "Exception";
    }
}
