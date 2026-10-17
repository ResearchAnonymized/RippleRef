package ai.refact.server.service.rippleref;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RippleRefBehavioralVerifierTest {

    private final RippleRefBehavioralVerifier verifier = new RippleRefBehavioralVerifier();
    private final RippleRefJavaProfileExtractor extractor = new RippleRefJavaProfileExtractor();

    @Test
    void passesWhenInternalLogicRefactoredButApiPreserved() {
        String original = """
            package com.example;
            public class Foo {
              public void bar() { helper(); }
              private void helper() { if (true) { System.out.println(1); } }
            }
            """;
        String refactored = original.replace("helper()", "helperInternal()")
                .replace("void helper()", "void helperInternal()");
        var result = verifier.verify(original, refactored, "Foo.java", extractor);
        assertTrue(result.behavioralCorrect);
        assertTrue(result.methodSignaturesPreserved);
    }

    @Test
    void failsWhenPublicMethodRemoved() {
        String original = """
            package com.example;
            public class Foo { public void bar() {} }
            """;
        String refactored = """
            package com.example;
            public class Foo { }
            """;
        var result = verifier.verify(original, refactored, "Foo.java", extractor);
        assertFalse(result.behavioralCorrect);
        assertFalse(result.methodSignaturesPreserved);
    }

    @Test
    void failsWhenFailCallRemoved() {
        String original = """
            package com.example;
            public class Foo { void m() { org.junit.Assert.fail("x"); } }
            """;
        String refactored = """
            package com.example;
            public class Foo { void m() { } }
            """;
        var result = verifier.verify(original, refactored, "Foo.java", extractor);
        assertFalse(result.behavioralCorrect);
        assertFalse(result.criticalMethodCallsPreserved);
    }

    @Test
    void adoptionClassSafeWhenRippleAndBehaviorPassAndTestsPass() {
        RippleRefModels.RippleVerificationReport ripple = new RippleRefModels.RippleVerificationReport();
        ripple.parseSuccess = true;
        ripple.changeStatus = "changed";
        ripple.riskLevel = "Low";
        ripple.observedBrokenCallerCount = 0;

        RippleRefModels.BehavioralVerificationResult behavioral = new RippleRefModels.BehavioralVerificationResult();
        behavioral.behavioralCorrect = true;

        RippleRefTestProbe.TestProbeResult tests = new RippleRefTestProbe.TestProbeResult();
        tests.status = "success";
        tests.attempted = true;
        tests.testsDiscovered = 1;
        tests.pairedProbe = true;
        tests.beforeStatus = "success";
        tests.behaviorPreserved = true;

        assertEquals("safe", RippleRefBehavioralVerifier.computeAdoptionClass(ripple, behavioral, tests));
    }

    @Test
    void adoptionClassFailedWhenPairedRegression() {
        RippleRefModels.RippleVerificationReport ripple = new RippleRefModels.RippleVerificationReport();
        ripple.parseSuccess = true;
        ripple.changeStatus = "changed";
        ripple.riskLevel = "Low";
        ripple.observedBrokenCallerCount = 0;

        RippleRefModels.BehavioralVerificationResult behavioral = new RippleRefModels.BehavioralVerificationResult();
        behavioral.behavioralCorrect = true;

        RippleRefTestProbe.TestProbeResult tests = new RippleRefTestProbe.TestProbeResult();
        tests.attempted = true;
        tests.testsDiscovered = 1;
        tests.pairedProbe = true;
        tests.beforeStatus = "success";
        tests.status = "failed";
        tests.regression = true;

        assertEquals("behavior_ok_tests_failed", RippleRefBehavioralVerifier.computeAdoptionClass(ripple, behavioral, tests));
    }

    @Test
    void adoptionClassInconclusiveWhenBaselineFails() {
        RippleRefModels.RippleVerificationReport ripple = new RippleRefModels.RippleVerificationReport();
        ripple.parseSuccess = true;
        ripple.changeStatus = "changed";
        ripple.riskLevel = "Low";
        ripple.observedBrokenCallerCount = 0;

        RippleRefModels.BehavioralVerificationResult behavioral = new RippleRefModels.BehavioralVerificationResult();
        behavioral.behavioralCorrect = true;

        RippleRefTestProbe.TestProbeResult tests = new RippleRefTestProbe.TestProbeResult();
        tests.attempted = true;
        tests.testsDiscovered = 1;
        tests.pairedProbe = true;
        tests.beforeStatus = "failed";
        tests.status = "success";
        tests.baselineInconclusive = true;

        assertEquals("behavior_ok_tests_inconclusive", RippleRefBehavioralVerifier.computeAdoptionClass(ripple, behavioral, tests));
    }
}
