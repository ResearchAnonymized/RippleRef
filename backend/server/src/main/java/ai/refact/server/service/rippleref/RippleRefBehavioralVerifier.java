package ai.refact.server.service.rippleref;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Level-4 behavioral verification on the target file (original vs candidate).
 * Heuristic checks aligned with agents/behavioral_correctness_checker.py.
 */
@Component
public class RippleRefBehavioralVerifier {

    private static final Pattern TRY_BLOCK = Pattern.compile("\\btry\\s*\\{");
    private static final Pattern CATCH_BLOCK = Pattern.compile("\\bcatch\\s*\\(");
    private static final Pattern THROWS = Pattern.compile("\\bthrows\\s+\\w+");
    private static final Pattern PRIVATE_HELPER = Pattern.compile("private\\s+\\w+\\s+\\w+\\s*\\([^)]*\\)\\s*\\{");
    private static final Pattern SET_NAME = Pattern.compile("\\.setName\\s*\\(");
    private static final Pattern PUBLIC_CTOR = Pattern.compile("public\\s+\\w+\\s*\\([^)]*\\)\\s*\\{");
    private static final Pattern OVERRIDE = Pattern.compile("@Override");
    private static final Pattern TEST_ANNOTATION = Pattern.compile("@Test\\b");
    private static final Pattern IF_STMT = Pattern.compile("\\bif\\s*\\(");
    private static final Pattern TERNARY = Pattern.compile("\\?[^:]*:");
    private static final Pattern SWITCH_STMT = Pattern.compile("\\bswitch\\s*\\(");
    private static final Pattern FAIL_CALL = Pattern.compile("\\.fail\\s*\\(");
    private static final Pattern ASSERT_CALL = Pattern.compile("assert\\w+\\s*\\(");

    public RippleRefModels.BehavioralVerificationResult verify(
            String original,
            String refactored,
            String filePath,
            RippleRefJavaProfileExtractor profileExtractor) {

        RippleRefModels.BehavioralVerificationResult result = new RippleRefModels.BehavioralVerificationResult();
        if (original == null || refactored == null || refactored.isBlank()) {
            result.status = "skipped";
            result.notes = "missing_candidate";
            return result;
        }

        result.status = "completed";
        checkMethodSignatures(original, refactored, filePath, profileExtractor, result);
        checkExceptionHandling(original, refactored, result);
        checkFrameworkContracts(original, refactored, result);
        checkConditionalLogic(original, refactored, result);
        checkCriticalMethodCalls(original, refactored, result);

        result.behavioralCorrect = result.methodSignaturesPreserved
                && result.exceptionHandlingPreserved
                && result.frameworkContractsPreserved
                && result.conditionalLogicPreserved
                && result.criticalMethodCallsPreserved
                && result.behavioralErrors.isEmpty();

        result.adoptionHint = classifyAdoptionHint(result);
        return result;
    }

    private void checkMethodSignatures(
            String original,
            String refactored,
            String filePath,
            RippleRefJavaProfileExtractor extractor,
            RippleRefModels.BehavioralVerificationResult result) {

        String path = filePath != null ? filePath : "Target.java";
        Set<String> before = new LinkedHashSet<>(extractor.extract(path, original).publicApis);
        Set<String> after = new LinkedHashSet<>(extractor.extract(path, refactored).publicApis);

        for (String removed : before) {
            if (!after.contains(removed)) {
                result.methodSignaturesPreserved = false;
                result.behavioralErrors.add("Public method removed: " + removed);
                result.behavioralChangeTypes.add("method_removed");
            }
        }
        for (String added : after) {
            if (!before.contains(added)) {
                result.behavioralWarnings.add("New public method added: " + added);
                result.behavioralChangeTypes.add("method_added");
            }
        }
    }

    private void checkExceptionHandling(
            String original,
            String refactored,
            RippleRefModels.BehavioralVerificationResult result) {

        int origHandlers = count(TRY_BLOCK, original) + count(CATCH_BLOCK, original) + count(THROWS, original);
        int refHandlers = count(TRY_BLOCK, refactored) + count(CATCH_BLOCK, refactored) + count(THROWS, refactored);
        if (refHandlers >= origHandlers) {
            return;
        }

        int origTry = count(TRY_BLOCK, original);
        int refTry = count(TRY_BLOCK, refactored);
        if (origTry > refTry) {
            result.exceptionHandlingPreserved = false;
            result.behavioralWarnings.add("Try-catch blocks removed: " + (origTry - refTry));
            result.behavioralChangeTypes.add("exception_handling_removed");
        }

        int origCatch = count(CATCH_BLOCK, original);
        int refCatch = count(CATCH_BLOCK, refactored);
        int origHelpers = count(PRIVATE_HELPER, original);
        int refHelpers = count(PRIVATE_HELPER, refactored);
        if (origCatch > refCatch) {
            if (refHelpers <= origHelpers) {
                result.exceptionHandlingPreserved = false;
            }
            result.behavioralWarnings.add("Catch blocks removed: " + (origCatch - refCatch));
            result.behavioralChangeTypes.add("catch_blocks_removed");
        }

        int origThrows = count(THROWS, original);
        int refThrows = count(THROWS, refactored);
        if (origThrows > refThrows) {
            result.exceptionHandlingPreserved = false;
            result.behavioralWarnings.add("Throws declarations removed: " + (origThrows - refThrows));
            result.behavioralChangeTypes.add("throws_removed");
        }

        if (refHelpers > origHelpers && origCatch > refCatch) {
            result.behavioralWarnings.add(
                    "Exception handling may have been moved to helper methods - verify exception propagation");
            result.behavioralChangeTypes.add("exception_handling_moved");
        }
    }

    private void checkFrameworkContracts(
            String original,
            String refactored,
            RippleRefModels.BehavioralVerificationResult result) {

        int origSetName = count(SET_NAME, original);
        int refSetName = count(SET_NAME, refactored);
        if (origSetName > refSetName) {
            result.frameworkContractsPreserved = false;
            result.behavioralErrors.add("setName() calls removed: " + (origSetName - refSetName));
            result.behavioralChangeTypes.add("framework_call_removed");
        }

        int origCtor = count(PUBLIC_CTOR, original);
        int refCtor = count(PUBLIC_CTOR, refactored);
        if (origCtor != refCtor) {
            result.frameworkContractsPreserved = false;
            result.behavioralWarnings.add("Constructor count changed: " + origCtor + " -> " + refCtor);
            result.behavioralChangeTypes.add("constructor_changed");
        }

        int origOverride = count(OVERRIDE, original);
        int refOverride = count(OVERRIDE, refactored);
        if (origOverride > refOverride) {
            result.frameworkContractsPreserved = false;
            result.behavioralWarnings.add("@Override annotations removed: " + (origOverride - refOverride));
            result.behavioralChangeTypes.add("override_annotation_removed");
        }

        int origTest = count(TEST_ANNOTATION, original);
        int refTest = count(TEST_ANNOTATION, refactored);
        if (origTest > refTest) {
            result.frameworkContractsPreserved = false;
            result.behavioralErrors.add("@Test annotations removed: " + (origTest - refTest));
            result.behavioralChangeTypes.add("test_annotation_removed");
        }
    }

    private void checkConditionalLogic(
            String original,
            String refactored,
            RippleRefModels.BehavioralVerificationResult result) {

        compareConditionalCount(IF_STMT, original, refactored, "if", result);
        compareConditionalCount(TERNARY, original, refactored, "ternary", result);
        compareConditionalCount(SWITCH_STMT, original, refactored, "switch", result);
    }

    private void checkCriticalMethodCalls(
            String original,
            String refactored,
            RippleRefModels.BehavioralVerificationResult result) {

        int origFail = count(FAIL_CALL, original);
        int refFail = count(FAIL_CALL, refactored);
        if (origFail > refFail) {
            result.criticalMethodCallsPreserved = false;
            result.behavioralWarnings.add("fail() calls removed: " + (origFail - refFail));
            result.behavioralChangeTypes.add("method_call_removed");
        }

        int origAssert = count(ASSERT_CALL, original);
        int refAssert = count(ASSERT_CALL, refactored);
        if (origAssert > refAssert) {
            result.criticalMethodCallsPreserved = false;
            result.behavioralWarnings.add("Assert calls removed: " + (origAssert - refAssert));
            result.behavioralChangeTypes.add("assert_removed");
        }
    }

    private static void compareConditionalCount(
            Pattern pattern,
            String original,
            String refactored,
            String label,
            RippleRefModels.BehavioralVerificationResult result) {

        int orig = count(pattern, original);
        int ref = count(pattern, refactored);
        if (orig > ref) {
            result.conditionalLogicPreserved = false;
            result.behavioralWarnings.add(label + " constructs removed: " + (orig - ref));
            result.behavioralChangeTypes.add("conditional_removed");
        }
    }

    private static int count(Pattern pattern, String text) {
        int n = 0;
        Matcher m = pattern.matcher(text);
        while (m.find()) {
            n++;
        }
        return n;
    }

    private static String classifyAdoptionHint(RippleRefModels.BehavioralVerificationResult result) {
        if (!result.behavioralCorrect) {
            return "behavior_review_required";
        }
        return "behavior_heuristics_pass";
    }

    /** Merge behavioral + ripple + tests into a single adoption class for CSV. */
    public static String computeAdoptionClass(
            RippleRefModels.RippleVerificationReport ripple,
            RippleRefModels.BehavioralVerificationResult behavioral,
            RippleRefTestProbe.TestProbeResult tests) {

        if (ripple == null || !ripple.parseSuccess || "failed".equals(ripple.changeStatus)) {
            return "rejected";
        }
        boolean rippleHigh = "High".equals(ripple.riskLevel);
        boolean rippleBroken = ripple.observedBrokenCallerCount > 0;
        if (rippleHigh || rippleBroken) {
            return "risky";
        }
        boolean behaviorOk = behavioral != null && behavioral.behavioralCorrect;
        if (!behaviorOk) {
            return "ripple_safe_behavior_uncertain";
        }
        if (tests == null || !tests.attempted) {
            return "ripple_and_behavior_ok_tests_skipped";
        }
        if (tests.testsDiscovered == 0 || "no_targeted_tests_found".equals(tests.notes)) {
            return "ripple_and_behavior_ok_tests_skipped";
        }
        if (tests.pairedProbe) {
            if (tests.baselineInconclusive) {
                return "behavior_ok_tests_inconclusive";
            }
            if (tests.regression) {
                return "behavior_ok_tests_failed";
            }
            if (tests.behaviorPreserved) {
                return "safe";
            }
            return "behavior_ok_tests_failed";
        }
        if ("success".equals(tests.status)) {
            return "safe";
        }
        if ("failed".equals(tests.status) || "timeout".equals(tests.status) || "error".equals(tests.status)) {
            return "behavior_ok_tests_failed";
        }
        return "ripple_and_behavior_ok_tests_skipped";
    }
}
