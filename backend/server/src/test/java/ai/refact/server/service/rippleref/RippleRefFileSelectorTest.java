package ai.refact.server.service.rippleref;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class RippleRefFileSelectorTest {

  private final RippleRefFileSelector selector = new RippleRefFileSelector();

  @Test
  void stratifiedSample_respectsTargetCountAndSeed() {
    List<RippleRefModels.EligibleFile> pool = new ArrayList<>();
    for (int i = 0; i < 20; i++) {
      RippleRefModels.EligibleFile ef = new RippleRefModels.EligibleFile();
      ef.filePath = "src/main/java/pkg/Class" + i + ".java";
      ef.fanIn = i % 6;
      ef.fanOut = 1;
      ef.publicApiCount = i % 7;
      ef.smellCount = 5 + i;
      ef.valueScore = i;
      ef.dependencyRiskScore = i * 0.1;
      pool.add(ef);
    }

    List<RippleRefModels.SelectedFile> a = selector.stratifiedSample("ws1", pool, 5, 42);
    List<RippleRefModels.SelectedFile> b = selector.stratifiedSample("ws1", pool, 5, 42);
    assertEquals(5, a.size());
    assertEquals(a.stream().map(s -> s.filePath).toList(), b.stream().map(s -> s.filePath).toList());
    assertTrue(a.stream().allMatch(s -> s.samplingGroup != null && !s.samplingGroup.isBlank()));
  }

  @Test
  void productionClassifier_excludesTestPaths() {
    assertEquals(
        RippleRefProductionClassifier.Classification.TEST,
        RippleRefProductionClassifier.classify("src/test/java/com/example/FooTest.java"));
    assertEquals(
        RippleRefProductionClassifier.Classification.PRODUCTION,
        RippleRefProductionClassifier.classify("src/main/java/com/example/Foo.java"));
    assertEquals(
        RippleRefProductionClassifier.Classification.PRODUCTION,
        RippleRefProductionClassifier.classify(
            "jEdit-master/org/gjt/sp/jedit/Buffer.java"));
    assertEquals(
        RippleRefProductionClassifier.Classification.TEST,
        RippleRefProductionClassifier.classify(
            "jEdit-master/test/org/jedit/io/Native2ASCIIEncodingTest.java"));
    assertEquals(
        RippleRefProductionClassifier.Classification.EXCLUDED,
        RippleRefProductionClassifier.classify(
            "jEdit-master/misc/indentation_problems/03.java"));
  }
}
