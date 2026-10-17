package ai.refact.api;

import java.nio.file.Path;
import java.util.List;

/**
 * Result of running tests.
 */
public record TestResult(
    boolean success,
    int totalTests,
    int passedTests,
    int failedTests,
    int skippedTests,
    List<TestFailure> failures,
    List<TestError> errors,
    long testTime,
    double coverage
) {
    
    /**
     * Represents a test failure.
     */
    public record TestFailure(
        String testClass,
        String testMethod,
        String message,
        String stackTrace
    ) {}
    
    /**
     * Represents a test error.
     */
    public record TestError(
        String testClass,
        String testMethod,
        String message,
        String stackTrace
    ) {}
    
    /**
     * Check if all tests passed.
     */
    public boolean allTestsPassed() {
        return success && failedTests == 0 && errors.isEmpty();
    }
    
    /**
     * Get the test success rate.
     */
    public double getSuccessRate() {
        if (totalTests == 0) {
            return 1.0;
        }
        return (double) passedTests / totalTests;
    }
    
    /**
     * Get the number of failing tests.
     */
    public int getFailingTestCount() {
        return failedTests + errors.size();
    }
    
    /**
     * Get all test issues (failures and errors).
     */
    public List<Object> getAllIssues() {
        return java.util.stream.Stream.concat(
            failures.stream().map(f -> (Object) f),
            errors.stream().map(e -> (Object) e)
        ).toList();
    }
}
