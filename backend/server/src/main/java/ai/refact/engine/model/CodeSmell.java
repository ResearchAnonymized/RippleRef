package ai.refact.engine.model;

import java.util.List;

/**
 * Represents a detected code smell with detailed information
 * for analysis and refactoring suggestions.
 */
public class CodeSmell {
    private final SmellType type;
    private final SmellCategory category;
    private final SmellSeverity severity;
    private final String title;
    private final String description;
    private final String recommendation;
    private final int startLine;
    private final int endLine;
    private final List<String> refactoringSuggestions;
    /** PMD ruleset bucket (e.g. Code Style, Best Practices); null for non-PMD smells. */
    private final String pmdRuleSetCategory;

    public CodeSmell(SmellType type, SmellCategory category, SmellSeverity severity,
                     String title, String description, String recommendation,
                     int startLine, int endLine, List<String> refactoringSuggestions) {
        this(type, category, severity, title, description, recommendation,
                startLine, endLine, refactoringSuggestions, null);
    }

    public CodeSmell(SmellType type, SmellCategory category, SmellSeverity severity,
                     String title, String description, String recommendation,
                     int startLine, int endLine, List<String> refactoringSuggestions,
                     String pmdRuleSetCategory) {
        this.type = type;
        this.category = category;
        this.severity = severity;
        this.title = title;
        this.description = description;
        this.recommendation = recommendation;
        this.startLine = startLine;
        this.endLine = endLine;
        this.refactoringSuggestions = refactoringSuggestions;
        this.pmdRuleSetCategory = pmdRuleSetCategory;
    }
    
    // Getters
    public SmellType getType() { return type; }
    public SmellCategory getCategory() { return category; }
    public SmellSeverity getSeverity() { return severity; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public String getRecommendation() { return recommendation; }
    public int getStartLine() { return startLine; }
    public int getEndLine() { return endLine; }
    public List<String> getRefactoringSuggestions() { return refactoringSuggestions; }

    public String getPmdRuleSetCategory() { return pmdRuleSetCategory; }
    
    @Override
    public String toString() {
        return String.format("CodeSmell{type=%s, category=%s, severity=%s, title='%s', lines=%d-%d}",
                           type, category, severity, title, startLine, endLine);
    }
}
