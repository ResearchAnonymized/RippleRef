package ai.refact.server.model;

import java.util.List;

public class CodeSmell {
    private String type;
    private String category;
    /** PMD ruleset bucket (Code Style, Best Practices, …) when source is PMD. */
    private String pmdCategory;
    private String severity;
    /** Short label (matches engine / PMD rule name when applicable). */
    private String title;
    private String description;
    private String recommendation;
    private String location;
    private int lineNumber;
    private int startLine;
    private int endLine;
    private double confidence;
    private List<String> suggestions;
    /** Alias for clients expecting this name (dashboard / refactoring UI). */
    private List<String> refactoringSuggestions;
    
    public CodeSmell() {}
    
    public CodeSmell(String type, String severity, String description) {
        this.type = type;
        this.severity = severity;
        this.description = description;
    }
    
    public String getType() {
        return type;
    }
    
    public void setType(String type) {
        this.type = type;
    }
    
    public String getCategory() {
        return category;
    }
    
    public void setCategory(String category) {
        this.category = category;
    }

    public String getPmdCategory() {
        return pmdCategory;
    }

    public void setPmdCategory(String pmdCategory) {
        this.pmdCategory = pmdCategory;
    }
    
    public String getSeverity() {
        return severity;
    }
    
    public void setSeverity(String severity) {
        this.severity = severity;
    }
    
    public String getDescription() {
        return description;
    }
    
    public void setDescription(String description) {
        this.description = description;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getRecommendation() {
        return recommendation;
    }

    /** Alias for dashboards that filter on {@code suggestion}. */
    public String getSuggestion() {
        return recommendation;
    }

    public void setRecommendation(String recommendation) {
        this.recommendation = recommendation;
    }

    public int getStartLine() {
        return startLine;
    }

    public void setStartLine(int startLine) {
        this.startLine = startLine;
    }

    public int getEndLine() {
        return endLine;
    }

    public void setEndLine(int endLine) {
        this.endLine = endLine;
    }

    public List<String> getRefactoringSuggestions() {
        return refactoringSuggestions != null ? refactoringSuggestions : suggestions;
    }

    public void setRefactoringSuggestions(List<String> refactoringSuggestions) {
        this.refactoringSuggestions = refactoringSuggestions;
    }
    
    public String getLocation() {
        return location;
    }
    
    public void setLocation(String location) {
        this.location = location;
    }
    
    public int getLineNumber() {
        return lineNumber;
    }
    
    public void setLineNumber(int lineNumber) {
        this.lineNumber = lineNumber;
    }
    
    public double getConfidence() {
        return confidence;
    }
    
    public void setConfidence(double confidence) {
        this.confidence = confidence;
    }
    
    public List<String> getSuggestions() {
        return suggestions;
    }
    
    public void setSuggestions(List<String> suggestions) {
        this.suggestions = suggestions;
    }

    /**
     * Display name for UI filters (e.g. ImprovedDashboard smell search). Prefers {@link #title}.
     */
    public String getName() {
        if (title != null && !title.isBlank()) {
            return title;
        }
        return type;
    }
}
