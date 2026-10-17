package ai.refact.api;

import java.util.List;

public record TestResults(
    int totalTests,
    int passingTests,
    int failingTests,
    double coverageBefore,
    double coverageAfter,
    List<String> newTests,
    List<String> modifiedTests,
    boolean allExistingTestsPass
) {}
