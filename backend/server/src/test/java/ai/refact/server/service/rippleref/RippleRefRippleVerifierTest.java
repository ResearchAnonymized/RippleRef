package ai.refact.server.service.rippleref;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class RippleRefRippleVerifierTest {

  private final RippleRefRippleVerifier verifier = new RippleRefRippleVerifier();
  private final RippleRefJavaProfileExtractor extractor = new RippleRefJavaProfileExtractor();

  @Test
  void classifiesLowRiskWhenOnlyInternalChanges() {
    String code = """
        package com.example;
        public class Foo {
          public void bar() { helper(); }
          private void helper() {}
        }
        """;
    RippleRefModels.JavaFileProfile before = extractor.extract("Foo.java", code);
    RippleRefModels.JavaFileProfile after = extractor.extract("Foo.java", code.replace("helper();", "helperInternal();")
        .replace("void helper()", "void helperInternal()"));
    RippleRefModels.RippleVerificationReport report = verifier.verifyWithContent(
        code, code.replace("helper();", "helperInternal();")
            .replace("void helper()", "void helperInternal()"),
        before, after, 3, 2);
    assertEquals("Low", report.riskLevel);
  }

  @Test
  void classifiesHighRiskWhenPublicApiRemoved() {
    RippleRefModels.JavaFileProfile before = new RippleRefModels.JavaFileProfile();
    before.publicApis = List.of("public void bar()");
    before.callerUsedApis = List.of("public void bar()");
    before.callerFiles = List.of("Other.java");

    RippleRefModels.JavaFileProfile after = new RippleRefModels.JavaFileProfile();
    after.publicApis = List.of();

    RippleRefModels.RippleVerificationReport report = verifier.verify(before, after, 5, 4);
    assertEquals("High", report.riskLevel);
    assertFalse(report.publicMethodsRemoved.isEmpty() || report.riskReasons.isEmpty());
  }
}
