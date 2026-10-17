package ai.refact.engine.detectors;

import ai.refact.api.CodePointer;
import ai.refact.api.ReasonEvidence;
import ai.refact.api.Severity;
import ai.refact.api.ProjectContext;
import ai.refact.api.ReasonDetector;
import ai.refact.api.ReasonCategory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

@Component
public class ParallelInheritanceDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.parallel-inheritance";
    private static final int MIN_PARALLEL_HIERARCHIES = 2; // Minimum parallel hierarchies to detect
    
    // Pattern to match class declarations with extends
    private static final Pattern CLASS_EXTENDS_PATTERN = Pattern.compile(
        "\\s*(?:public|private|protected)?\\s*class\\s+(\\w+)\\s+extends\\s+(\\w+)"
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
        
        // First pass: collect all inheritance relationships
        Map<String, String> classToParent = new HashMap<>();
        Map<String, String> classToFile = new HashMap<>();
        
        for (java.nio.file.Path sourceFile : ctx.sourceFiles()) {
            try {
                List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
                if (lines.isEmpty()) continue;
                
                String className = sourceFile.getFileName().toString().replace(".java", "");
                classToFile.put(className, sourceFile.toString());
                
                for (String line : lines) {
                    Matcher matcher = CLASS_EXTENDS_PATTERN.matcher(line);
                    if (matcher.find()) {
                        String childClass = matcher.group(1);
                        String parentClass = matcher.group(2);
                        classToParent.put(childClass, parentClass);
                    }
                }
            } catch (Exception e) {
                continue;
            }
        }
        
        // Second pass: detect parallel inheritance hierarchies
        Map<String, List<String>> hierarchies = buildHierarchies(classToParent);
        List<ReasonEvidence> evidences = new ArrayList<>();
        
        // Look for parallel hierarchies (similar naming patterns)
        for (Map.Entry<String, List<String>> entry1 : hierarchies.entrySet()) {
            String parent1 = entry1.getKey();
            List<String> children1 = entry1.getValue();
            
            for (Map.Entry<String, List<String>> entry2 : hierarchies.entrySet()) {
                String parent2 = entry2.getKey();
                List<String> children2 = entry2.getValue();
                
                // Skip if same hierarchy or too small
                if (parent1.equals(parent2) || children1.size() < 2 || children2.size() < 2) {
                    continue;
                }
                
                // Check if hierarchies are parallel (similar naming patterns)
                if (areParallelHierarchies(parent1, parent2, children1, children2)) {
                    String filePath = classToFile.get(parent1);
                    if (filePath == null) continue;
                    
                    Severity severity = determineSeverity(children1.size(), children2.size());
                    
                    ReasonEvidence evidence = new ReasonEvidence(
                        DETECTOR_ID,
                        new CodePointer(
                            ctx.root().relativize(java.nio.file.Paths.get(filePath)),
                            parent1,
                            "class",
                            1,
                            10,
                            1,
                            1
                        ),
                        Map.of(
                            "parentClass1", parent1,
                            "parentClass2", parent2,
                            "childrenCount1", children1.size(),
                            "childrenCount2", children2.size(),
                            "children1", String.join(", ", children1),
                            "children2", String.join(", ", children2)
                        ),
                        String.format("Parallel inheritance hierarchies detected: '%s' (%d children) mirrors '%s' (%d children)", 
                                     parent1, children1.size(), parent2, children2.size()),
                        severity
                    );
                    
                    evidences.add(evidence);
                    break; // Only report once per hierarchy
                }
            }
        }
        
        return evidences.stream();
    }
    
    private Map<String, List<String>> buildHierarchies(Map<String, String> classToParent) {
        Map<String, List<String>> hierarchies = new HashMap<>();
        
        for (Map.Entry<String, String> entry : classToParent.entrySet()) {
            String child = entry.getKey();
            String parent = entry.getValue();
            
            hierarchies.computeIfAbsent(parent, k -> new ArrayList<>()).add(child);
        }
        
        return hierarchies;
    }
    
    private boolean areParallelHierarchies(String parent1, String parent2, 
                                          List<String> children1, List<String> children2) {
        // Check if parent names are similar (e.g., "Employee" and "EmployeeImpl")
        if (areSimilarNames(parent1, parent2)) {
            return true;
        }
        
        // Check if children have similar naming patterns
        int matchingPairs = 0;
        for (String child1 : children1) {
            for (String child2 : children2) {
                if (areSimilarNames(child1, child2)) {
                    matchingPairs++;
                }
            }
        }
        
        // If at least 50% of children have parallel names, it's likely parallel inheritance
        int minChildren = Math.min(children1.size(), children2.size());
        return matchingPairs >= minChildren * 0.5;
    }
    
    private boolean areSimilarNames(String name1, String name2) {
        // Remove common prefixes/suffixes
        String base1 = removeCommonAffixes(name1);
        String base2 = removeCommonAffixes(name2);
        
        // Check if base names are similar
        return base1.equalsIgnoreCase(base2) || 
               base1.contains(base2) || 
               base2.contains(base1) ||
               calculateSimilarity(base1, base2) > 0.7;
    }
    
    private String removeCommonAffixes(String name) {
        String result = name;
        
        // Remove common prefixes
        String[] prefixes = {"Abstract", "Base", "Default", "Generic"};
        for (String prefix : prefixes) {
            if (result.startsWith(prefix)) {
                result = result.substring(prefix.length());
            }
        }
        
        // Remove common suffixes
        String[] suffixes = {"Impl", "Implementation", "Base", "Abstract", "Concrete"};
        for (String suffix : suffixes) {
            if (result.endsWith(suffix)) {
                result = result.substring(0, result.length() - suffix.length());
            }
        }
        
        return result;
    }
    
    private double calculateSimilarity(String s1, String s2) {
        int maxLen = Math.max(s1.length(), s2.length());
        if (maxLen == 0) return 1.0;
        
        int distance = levenshteinDistance(s1.toLowerCase(), s2.toLowerCase());
        return 1.0 - (double) distance / maxLen;
    }
    
    private int levenshteinDistance(String s1, String s2) {
        int[][] dp = new int[s1.length() + 1][s2.length() + 1];
        
        for (int i = 0; i <= s1.length(); i++) {
            dp[i][0] = i;
        }
        for (int j = 0; j <= s2.length(); j++) {
            dp[0][j] = j;
        }
        
        for (int i = 1; i <= s1.length(); i++) {
            for (int j = 1; j <= s2.length(); j++) {
                int cost = s1.charAt(i - 1) == s2.charAt(j - 1) ? 0 : 1;
                dp[i][j] = Math.min(
                    Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1),
                    dp[i - 1][j - 1] + cost
                );
            }
        }
        
        return dp[s1.length()][s2.length()];
    }
    
    private Severity determineSeverity(int children1Count, int children2Count) {
        int totalChildren = children1Count + children2Count;
        
        if (totalChildren >= 10) {
            return Severity.CRITICAL;
        } else if (totalChildren >= 6) {
            return Severity.MAJOR;
        } else {
            return Severity.MINOR;
        }
    }
}
