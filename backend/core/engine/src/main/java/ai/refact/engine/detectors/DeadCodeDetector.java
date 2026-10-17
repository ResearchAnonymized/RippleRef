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
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

@Component
public class DeadCodeDetector implements ReasonDetector {
    
    private static final String DETECTOR_ID = "design.dead-code";
    
    // Pattern to match method declarations
    private static final Pattern METHOD_PATTERN = Pattern.compile(
        "\\s*(public|private|protected|static|final|abstract)?\\s+" +
        "([\\w.<>\\[\\]]+)\\s+" + // return type
        "(\\w+)\\s*\\(" + // method name
        "([^)]*)\\)" // parameters
    );
    
    // Pattern to match method calls
    private static final Pattern METHOD_CALL_PATTERN = Pattern.compile(
        "\\b(\\w+)\\s*\\("
    );
    
    // Pattern to match field declarations
    private static final Pattern FIELD_PATTERN = Pattern.compile(
        "\\s*(public|private|protected|static|final|volatile|transient)?\\s+" +
        "([\\w.<>\\[\\]]+)\\s+" + // type
        "(\\w+)\\s*[;=]" // field name
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
        
        // First pass: collect all methods and fields
        Map<String, MethodInfo> allMethods = new HashMap<>();
        Map<String, FieldInfo> allFields = new HashMap<>();
        Set<String> usedMethods = new HashSet<>();
        Set<String> usedFields = new HashSet<>();
        
        // Collect all methods and fields
        for (java.nio.file.Path sourceFile : ctx.sourceFiles()) {
            try {
                List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
                if (lines.isEmpty()) continue;
                
                String className = sourceFile.getFileName().toString().replace(".java", "");
                
                for (int i = 0; i < lines.size(); i++) {
                    String line = lines.get(i);
                    
                    // Collect methods
                    Matcher methodMatcher = METHOD_PATTERN.matcher(line);
                    if (methodMatcher.find() && !line.contains("class ") && !line.contains("interface ")) {
                        String methodName = methodMatcher.group(3);
                        String visibility = methodMatcher.group(1);
                        
                        // Skip main method and constructors
                        if (methodName.equals("main") || methodName.equals(className)) {
                            continue;
                        }
                        
                        allMethods.put(className + "." + methodName, 
                                      new MethodInfo(className, methodName, visibility, i + 1, sourceFile));
                    }
                    
                    // Collect fields
                    Matcher fieldMatcher = FIELD_PATTERN.matcher(line);
                    if (fieldMatcher.find() && !line.contains("(")) {
                        String fieldName = fieldMatcher.group(3);
                        String visibility = fieldMatcher.group(1);
                        
                        allFields.put(className + "." + fieldName, 
                                     new FieldInfo(className, fieldName, visibility, i + 1, sourceFile));
                    }
                }
            } catch (Exception e) {
                continue;
            }
        }
        
        // Second pass: find method and field usage
        for (java.nio.file.Path sourceFile : ctx.sourceFiles()) {
            try {
                List<String> lines = java.nio.file.Files.readAllLines(sourceFile);
                if (lines.isEmpty()) continue;
                
                for (String line : lines) {
                    // Find method calls
                    Matcher callMatcher = METHOD_CALL_PATTERN.matcher(line);
                    while (callMatcher.find()) {
                        String calledMethod = callMatcher.group(1);
                        
                        // Mark as used
                        for (String fullMethodName : allMethods.keySet()) {
                            if (fullMethodName.endsWith("." + calledMethod)) {
                                usedMethods.add(fullMethodName);
                            }
                        }
                    }
                    
                    // Find field usage
                    for (String fullFieldName : allFields.keySet()) {
                        String fieldName = fullFieldName.split("\\.")[1];
                        if (line.contains(fieldName)) {
                            usedFields.add(fullFieldName);
                        }
                    }
                }
            } catch (Exception e) {
                continue;
            }
        }
        
        // Find unused methods and fields
        List<ReasonEvidence> evidences = new ArrayList<>();
        
        // Report unused private methods
        for (Map.Entry<String, MethodInfo> entry : allMethods.entrySet()) {
            String fullMethodName = entry.getKey();
            MethodInfo methodInfo = entry.getValue();
            
            // Only report private methods as dead code
            if ("private".equals(methodInfo.visibility) && !usedMethods.contains(fullMethodName)) {
                evidences.add(new ReasonEvidence(
                    DETECTOR_ID,
                    new CodePointer(
                        ctx.root().relativize(methodInfo.sourceFile),
                        methodInfo.className,
                        methodInfo.methodName,
                        methodInfo.lineNumber,
                        methodInfo.lineNumber,
                        1,
                        1
                    ),
                    Map.of(
                        "elementType", "method",
                        "elementName", methodInfo.methodName,
                        "className", methodInfo.className
                    ),
                    String.format("Unused private method '%s' in class '%s' (dead code)", 
                                 methodInfo.methodName, methodInfo.className),
                    Severity.MINOR
                ));
            }
        }
        
        // Report unused private fields
        for (Map.Entry<String, FieldInfo> entry : allFields.entrySet()) {
            String fullFieldName = entry.getKey();
            FieldInfo fieldInfo = entry.getValue();
            
            // Only report private fields as dead code
            if ("private".equals(fieldInfo.visibility) && !usedFields.contains(fullFieldName)) {
                evidences.add(new ReasonEvidence(
                    DETECTOR_ID,
                    new CodePointer(
                        ctx.root().relativize(fieldInfo.sourceFile),
                        fieldInfo.className,
                        fieldInfo.fieldName,
                        fieldInfo.lineNumber,
                        fieldInfo.lineNumber,
                        1,
                        1
                    ),
                    Map.of(
                        "elementType", "field",
                        "elementName", fieldInfo.fieldName,
                        "className", fieldInfo.className
                    ),
                    String.format("Unused private field '%s' in class '%s' (dead code)", 
                                 fieldInfo.fieldName, fieldInfo.className),
                    Severity.MINOR
                ));
            }
        }
        
        return evidences.stream();
    }
    
    // Helper classes
    private static class MethodInfo {
        String className;
        String methodName;
        String visibility;
        int lineNumber;
        java.nio.file.Path sourceFile;
        
        MethodInfo(String className, String methodName, String visibility, int lineNumber, java.nio.file.Path sourceFile) {
            this.className = className;
            this.methodName = methodName;
            this.visibility = visibility;
            this.lineNumber = lineNumber;
            this.sourceFile = sourceFile;
        }
    }
    
    private static class FieldInfo {
        String className;
        String fieldName;
        String visibility;
        int lineNumber;
        java.nio.file.Path sourceFile;
        
        FieldInfo(String className, String fieldName, String visibility, int lineNumber, java.nio.file.Path sourceFile) {
            this.className = className;
            this.fieldName = fieldName;
            this.visibility = visibility;
            this.lineNumber = lineNumber;
            this.sourceFile = sourceFile;
        }
    }
}
