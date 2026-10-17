package ai.refact.api;

/**
 * Defines the scope of tests to run.
 */
public enum TestScope {
    /**
     * Run all tests.
     */
    ALL,
    
    /**
     * Run only unit tests.
     */
    UNIT,
    
    /**
     * Run only integration tests.
     */
    INTEGRATION,
    
    /**
     * Run only tests related to changed files.
     */
    AFFECTED,
    
    /**
     * Run tests for specific classes.
     */
    SPECIFIC
}
