package ai.refact.engine.analysis;

import java.util.List;

/**
 * Represents a method call found in AST analysis.
 */
public class MethodCallInfo {
    private String methodName;
    private String receiver;
    private List<String> arguments;
    private int lineNumber;
    
    // Getters and setters
    public String getMethodName() { return methodName; }
    public void setMethodName(String methodName) { this.methodName = methodName; }
    
    public String getReceiver() { return receiver; }
    public void setReceiver(String receiver) { this.receiver = receiver; }
    
    public List<String> getArguments() { return arguments; }
    public void setArguments(List<String> arguments) { this.arguments = arguments; }
    
    public int getLineNumber() { return lineNumber; }
    public void setLineNumber(int lineNumber) { this.lineNumber = lineNumber; }
    
    public int getArgumentCount() {
        return arguments != null ? arguments.size() : 0;
    }
    
    public boolean isStaticCall() {
        return receiver != null && receiver.contains(".");
    }
    
    public String getFullMethodName() {
        if (receiver != null && !receiver.isEmpty()) {
            return receiver + "." + methodName;
        }
        return methodName;
    }
}
