package ai.refact.engine.detectors;

import ai.refact.api.CodePointer;
import ai.refact.api.ReasonEvidence;
import ai.refact.api.Severity;
import ai.refact.api.ProjectContext;
import ai.refact.api.ReasonDetector;
import ai.refact.api.ReasonCategory;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

@Component
public class DataClumpsDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.data-clumps";
    private static final int MIN_CLUMP_SIZE = 3; // Minimum parameters to form a clump
    private static final int MIN_OCCURRENCES = 2; // Minimum occurrences to be considered a clump
    
    // Pattern to match method declarations with parameters
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
        
        // Collect all method signatures from all files
        List<MethodSignature> allMethodSignatures = new ArrayList<>();
        
        for (java.nio.file.Path sourceFile : ctx.sourceFiles()) {
            try {
                List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
                if (lines.isEmpty()) continue;
                
                String className = sourceFile.getFileName().toString().replace(".java", "");
                
                for (int i = 0; i < lines.size(); i++) {
                    String line = lines.get(i);
                    Matcher matcher = METHOD_PATTERN.matcher(line);
                    
                    if (matcher.find()) {
                        String methodName = matcher.group(3);
                        String parameters = matcher.group(4);
                        
                        if (parameters != null && !parameters.trim().isEmpty()) {
                            List<String> paramTypes = extractParameterTypes(parameters);
                            if (paramTypes.size() >= MIN_CLUMP_SIZE) {
                                allMethodSignatures.add(new MethodSignature(className, methodName, paramTypes, i + 1, sourceFile));
                            }
                        }
                    }
                }
            } catch (Exception e) {
                // Skip files that can't be read
                continue;
            }
        }
        
        // Find data clumps
        Map<ParameterGroup, List<MethodSignature>> clumps = findDataClumps(allMethodSignatures);
        
        // Create evidence for each clump
        List<ReasonEvidence> evidences = new ArrayList<>();
        for (Map.Entry<ParameterGroup, List<MethodSignature>> entry : clumps.entrySet()) {
            ParameterGroup clump = entry.getKey();
            List<MethodSignature> occurrences = entry.getValue();
            
            if (occurrences.size() >= MIN_OCCURRENCES) {
                // Create evidence for the first occurrence
                MethodSignature firstOccurrence = occurrences.get(0);
                
                Severity severity = determineSeverity(occurrences.size(), clump.getTypes().size());
                
                ReasonEvidence evidence = new ReasonEvidence(
                    DETECTOR_ID,
                    new CodePointer(
                        ctx.root().relativize(firstOccurrence.getSourceFile()),
                        firstOccurrence.getClassName(),
                        firstOccurrence.getMethodName(),
                        firstOccurrence.getLineNumber(),
                        firstOccurrence.getLineNumber(),
                        1,
                        1
                    ),
                    Map.of(
                        "clumpSize", clump.getTypes().size(),
                        "occurrences", occurrences.size(),
                        "parameterTypes", String.join(", ", clump.getTypes()),
                        "affectedMethods", occurrences.size()
                    ),
                    String.format("Data clump detected: %d parameters (%s) appear together in %d methods", 
                                 clump.getTypes().size(), String.join(", ", clump.getTypes()), occurrences.size()),
                    severity
                );
                
                evidences.add(evidence);
            }
        }
        
        return evidences.stream();
    }
    
    private List<String> extractParameterTypes(String parameters) {
        List<String> types = new ArrayList<>();
        
        if (parameters == null || parameters.trim().isEmpty()) {
            return types;
        }
        
        // Remove comments
        String cleanParams = parameters
            .replaceAll("//.*", "")
            .replaceAll("/\\*.*?\\*/", "")
            .trim();
        
        if (cleanParams.isEmpty()) {
            return types;
        }
        
        // Split by commas, but handle generics and arrays
        List<String> paramParts = splitParameters(cleanParams);
        
        for (String param : paramParts) {
            String trimmed = param.trim();
            if (!trimmed.isEmpty()) {
                // Extract type (everything before the last space or before '=')
                String type = extractTypeFromParameter(trimmed);
                if (type != null && !type.isEmpty()) {
                    types.add(type);
                }
            }
        }
        
        return types;
    }
    
    private List<String> splitParameters(String parameters) {
        List<String> parts = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        int depth = 0;
        boolean inString = false;
        boolean inChar = false;
        
        for (char c : parameters.toCharArray()) {
            if (inString && c == '"' && (current.length() == 0 || current.charAt(current.length() - 1) != '\\')) {
                inString = false;
            } else if (!inString && c == '"') {
                inString = true;
            } else if (inChar && c == '\'' && (current.length() == 0 || current.charAt(current.length() - 1) != '\\')) {
                inChar = false;
            } else if (!inChar && c == '\'') {
                inChar = true;
            } else if (!inString && !inChar) {
                if (c == '<' || c == '[' || c == '(') {
                    depth++;
                } else if (c == '>' || c == ']' || c == ')') {
                    depth--;
                } else if (c == ',' && depth == 0) {
                    parts.add(current.toString());
                    current = new StringBuilder();
                    continue;
                }
            }
            current.append(c);
        }
        
        if (current.length() > 0) {
            parts.add(current.toString());
        }
        
        return parts;
    }
    
    private String extractTypeFromParameter(String parameter) {
        // Remove variable name and default values
        String type = parameter.split("\\s+")[0]; // First word is usually the type
        
        // Handle arrays
        if (type.endsWith("[]")) {
            return type;
        }
        
        // Handle generics (simplified)
        if (type.contains("<")) {
            return type;
        }
        
        return type;
    }
    
    private Map<ParameterGroup, List<MethodSignature>> findDataClumps(List<MethodSignature> methodSignatures) {
        Map<ParameterGroup, List<MethodSignature>> clumps = new HashMap<>();
        
        // Group methods by their parameter types
        for (MethodSignature signature : methodSignatures) {
            List<String> types = signature.getParameterTypes();
            
            // Check all possible subsets of size >= MIN_CLUMP_SIZE
            for (int i = 0; i < types.size() - MIN_CLUMP_SIZE + 1; i++) {
                for (int j = i + MIN_CLUMP_SIZE; j <= types.size(); j++) {
                    List<String> subset = types.subList(i, j);
                    ParameterGroup group = new ParameterGroup(subset);
                    
                    clumps.computeIfAbsent(group, k -> new ArrayList<>()).add(signature);
                }
            }
        }
        
        return clumps;
    }
    
    
    private Severity determineSeverity(int occurrences, int clumpSize) {
        if (occurrences >= 5 || clumpSize >= 5) {
            return Severity.CRITICAL;
        } else if (occurrences >= 3 || clumpSize >= 4) {
            return Severity.MAJOR;
        } else {
            return Severity.MINOR;
        }
    }
    
    // Helper classes
    private static class MethodSignature {
        private final String className;
        private final String methodName;
        private final List<String> parameterTypes;
        private final int lineNumber;
        private final java.nio.file.Path sourceFile;
        
        public MethodSignature(String className, String methodName, List<String> parameterTypes, int lineNumber, java.nio.file.Path sourceFile) {
            this.className = className;
            this.methodName = methodName;
            this.parameterTypes = new ArrayList<>(parameterTypes);
            this.lineNumber = lineNumber;
            this.sourceFile = sourceFile;
        }
        
        public String getClassName() { return className; }
        public String getMethodName() { return methodName; }
        public List<String> getParameterTypes() { return parameterTypes; }
        public int getLineNumber() { return lineNumber; }
        public java.nio.file.Path getSourceFile() { return sourceFile; }
    }
    
    private static class ParameterGroup {
        private final List<String> types;
        private final int hashCode;
        
        public ParameterGroup(List<String> types) {
            this.types = new ArrayList<>(types);
            this.hashCode = types.hashCode();
        }
        
        public List<String> getTypes() { return types; }
        
        @Override
        public boolean equals(Object obj) {
            if (this == obj) return true;
            if (obj == null || getClass() != obj.getClass()) return false;
            ParameterGroup that = (ParameterGroup) obj;
            return Objects.equals(types, that.types);
        }
        
        @Override
        public int hashCode() {
            return hashCode;
        }
    }
}
