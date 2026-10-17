package ai.refact.engine.model;

/**
 * Enumeration of all possible code smell types that can be detected.
 * Based on Martin Fowler's refactoring principles and common code smells.
 */
public enum SmellType {
    // Bloater smells
    LONG_METHOD("Long Method"),
    LARGE_CLASS("Large Class"),
    LONG_PARAMETER_LIST("Long Parameter List"),
    HIGH_COMPLEXITY("High Cyclomatic Complexity"),
    PRIMITIVE_OBSESSION("Primitive Obsession"),
    DATA_CLUMPS("Data Clumps"),
    
    // Object-Orientation Abuser smells
    SWITCH_STATEMENTS("Switch Statements"),
    TEMPORARY_FIELD("Temporary Field"),
    REFUSED_BEQUEST("Refused Bequest"),
    ALTERNATIVE_CLASSES("Alternative Classes with Different Interfaces"),
    
    // Change Preventer smells
    DIVERGENT_CHANGE("Divergent Change"),
    SHOTGUN_SURGERY("Shotgun Surgery"),
    PARALLEL_INHERITANCE("Parallel Inheritance Hierarchies"),
    
    // Dispensable smells
    DUPLICATE_CODE("Duplicate Code"),
    LAZY_CLASS("Lazy Class"),
    DATA_CLASS("Data Class"),
    DEAD_CODE("Dead Code"),
    SPECULATIVE_GENERALITY("Speculative Generality"),
    EXCESSIVE_COMMENTS("Excessive Comments"),
    
    // Coupler smells
    FEATURE_ENVY("Feature Envy"),
    INAPPROPRIATE_INTIMACY("Inappropriate Intimacy"),
    MESSAGE_CHAINS("Message Chains"),
    MIDDLE_MAN("Middle Man"),
    
    // Encapsulation/Abstraction smells
    MISPLACED_RESPONSIBILITY("Misplaced Responsibility"),
    INCONSISTENT_NAMING("Inconsistent Naming"),
    MISUSE_OF_STATICS("Misuse of Statics"),
    PUBLIC_FIELDS("Public Fields"),
    UNEXPLOITED_POLYMORPHISM("Unexploited Polymorphism"),
    
    // Hierarchy & Architecture smells
    GOD_OBJECT("God Object"),
    CYCLIC_DEPENDENCIES("Cyclic Dependencies"),
    HARD_CODED_DEPENDENCIES("Hard-coded Dependencies"),
    LAYER_VIOLATIONS("Layer Violations"),
    
    // Concurrency & Performance smells
    GLOBAL_MUTABLE_STATE("Global Mutable State"),
    TOO_MUCH_SYNCHRONIZATION("Too Much Synchronization"),
    INEFFICIENT_RESOURCE_USAGE("Inefficient Resource Usage"),
    
    // Testing smells
    FRAGILE_TESTS("Fragile Tests"),
    SLOW_TESTS("Slow Tests"),
    MISSING_COVERAGE("Missing Test Coverage"),
    OBSCURE_TESTS("Obscure Tests"),
    
    // Line-by-line individual code smells
    LONG_STRING("Long String"),
    EMPTY_CATCH_BLOCK("Empty Catch Block"),
    EMPTY_IF_BLOCK("Empty If Block"),
    EMPTY_FOR_BLOCK("Empty For Block"),
    EMPTY_WHILE_BLOCK("Empty While Block"),
    SYSTEM_OUT_PRINT("System.out.print"),
    SYSTEM_ERR_PRINT("System.err.print"),
    PRINT_STACK_TRACE("printStackTrace"),
    HARDCODED_PATH("Hardcoded Path"),
    HARDCODED_URL("Hardcoded URL"),
    TODO_COMMENT("TODO Comment"),
    COMMENTED_CODE("Commented Code"),
    LONG_LINE("Long Line"),
    DEEP_NESTING("Deep Nesting"),
    UNUSED_IMPORT("Unused Import"),
    PUBLIC_FIELD("Public Field"),
    STATIC_FIELD("Static Field"),
    FINAL_FIELD("Final Field"),
    SYNCHRONIZED_METHOD("Synchronized Method"),
    DEPRECATED_ANNOTATION("Deprecated Annotation"),
    SUPPRESS_WARNINGS("SuppressWarnings"),
    OVERRIDE_ANNOTATION("Override Annotation"),
    TEST_ANNOTATION("Test Annotation"),
    LIFECYCLE_ANNOTATION("Lifecycle Annotation"),
    TRY_CATCH_HELL("Try-Catch Hell"),
    NULL_ABUSE("Null Abuse"),
    MESSAGE_CHAIN("Message Chain"),
    TIGHT_COUPLING("Tight Coupling"),

    /** PMD rule finding; see description for concrete rule name (e.g. EmptyCatchBlock). */
    PMD_RULE_VIOLATION("PMD Rule Violation");
    
    private final String displayName;
    
    SmellType(String displayName) {
        this.displayName = displayName;
    }
    
    public String getDisplayName() {
        return displayName;
    }
    
    @Override
    public String toString() {
        return displayName;
    }
}
