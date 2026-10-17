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
public class ExcessiveCommentsDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.excessive-comments";
    private static final double COMMENT_RATIO_THRESHOLD = 0.3; // 30% or more lines are comments
    private static final int MIN_TOTAL_LINES = 20; // Minimum lines to analyze
    
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
            .flatMap(sourceFile -> analyzeFileForExcessiveComments(sourceFile, ctx.root()));
    }
    
    private Stream<ReasonEvidence> analyzeFileForExcessiveComments(java.nio.file.Path sourceFile, java.nio.file.Path projectRoot) {
        try {
            List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
            if (lines.isEmpty() || lines.size() < MIN_TOTAL_LINES) {
                return Stream.empty();
            }
            
            List<ReasonEvidence> evidences = new ArrayList<>();
            String className = sourceFile.getFileName().toString().replace(".java", "");
            
            // Analyze comment density
            CommentAnalysis analysis = analyzeComments(lines);
            
            if (analysis.hasExcessiveComments()) {
                Severity severity = determineSeverity(analysis.getCommentRatio(), analysis.getCommentLines());
                
                ReasonEvidence evidence = new ReasonEvidence(
                    DETECTOR_ID,
                    new CodePointer(
                        projectRoot.relativize(sourceFile),
                        className,
                        "file",
                        1,
                        Math.min(10, lines.size()),
                        1,
                        1
                    ),
                    Map.of(
                        "commentLines", analysis.getCommentLines(),
                        "totalLines", analysis.getTotalLines(),
                        "codeLines", analysis.getCodeLines(),
                        "commentRatio", analysis.getCommentRatio(),
                        "className", className
                    ),
                    String.format("File '%s' has excessive comments: %.1f%% of lines are comments (%d/%d lines)", 
                                 className, analysis.getCommentRatio() * 100, 
                                 analysis.getCommentLines(), analysis.getTotalLines()),
                    severity
                );
                
                evidences.add(evidence);
            }
            
            return evidences.stream();
        } catch (Exception e) {
            return Stream.empty();
        }
    }
    
    private CommentAnalysis analyzeComments(List<String> lines) {
        int commentLines = 0;
        int codeLines = 0;
        int totalLines = lines.size();
        boolean inBlockComment = false;
        
        for (String line : lines) {
            String trimmedLine = line.trim();
            
            // Skip empty lines
            if (trimmedLine.isEmpty()) {
                continue;
            }
            
            // Check for block comment start/end
            if (trimmedLine.startsWith("/*")) {
                inBlockComment = true;
                commentLines++;
                if (trimmedLine.contains("*/")) {
                    inBlockComment = false;
                }
                continue;
            }
            
            if (inBlockComment) {
                commentLines++;
                if (trimmedLine.contains("*/")) {
                    inBlockComment = false;
                }
                continue;
            }
            
            // Check for single-line comments
            if (trimmedLine.startsWith("//")) {
                commentLines++;
                continue;
            }
            
            // It's a code line
            codeLines++;
        }
        
        double commentRatio = totalLines > 0 ? (double) commentLines / totalLines : 0.0;
        
        return new CommentAnalysis(commentLines, codeLines, totalLines, commentRatio);
    }
    
    private Severity determineSeverity(double commentRatio, int commentLines) {
        if (commentRatio >= 0.5 || commentLines >= 100) {
            return Severity.CRITICAL;
        } else if (commentRatio >= 0.4 || commentLines >= 50) {
            return Severity.MAJOR;
        } else {
            return Severity.MINOR;
        }
    }
    
    // Helper class
    private static class CommentAnalysis {
        private final int commentLines;
        private final int codeLines;
        private final int totalLines;
        private final double commentRatio;
        
        public CommentAnalysis(int commentLines, int codeLines, int totalLines, double commentRatio) {
            this.commentLines = commentLines;
            this.codeLines = codeLines;
            this.totalLines = totalLines;
            this.commentRatio = commentRatio;
        }
        
        public boolean hasExcessiveComments() {
            return commentRatio >= COMMENT_RATIO_THRESHOLD;
        }
        
        public int getCommentLines() { return commentLines; }
        public int getCodeLines() { return codeLines; }
        public int getTotalLines() { return totalLines; }
        public double getCommentRatio() { return commentRatio; }
    }
}
