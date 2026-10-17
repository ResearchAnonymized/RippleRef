package ai.refact.server.service;

import ai.refact.api.Assessment;
import ai.refact.api.AssessmentSummary;
import ai.refact.api.CodePointer;
import ai.refact.api.ProjectMetrics;
import ai.refact.api.ReasonEvidence;
import ai.refact.api.Severity;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AssessmentResponsePolicyTest {

    @Test
    void summaryOnlyWhenDetailsDisabled() {
        Assessment full = sampleAssessment(500);
        Assessment http = AssessmentResponsePolicy.forHttp(full, false);
        assertEquals(0, http.evidences().size());
        assertEquals(500, http.summary().totalFindings());
    }

    @Test
    void capsLargeDetailResponses() {
        Assessment full = sampleAssessment(10_000);
        Assessment http = AssessmentResponsePolicy.forHttp(full, true);
        assertEquals(AssessmentResponsePolicy.MAX_EVIDENCES_WITH_DETAILS, http.evidences().size());
        assertEquals(10_000, http.summary().totalFindings());
        assertTrue(http.evidences().stream().anyMatch(e -> e.severity() == Severity.CRITICAL));
    }

    private static Assessment sampleAssessment(int count) {
        List<ReasonEvidence> evidences = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            Severity sev = i % 50 == 0 ? Severity.CRITICAL : Severity.MINOR;
            evidences.add(new ReasonEvidence(
                    "design.long-method",
                    new CodePointer(Path.of("src/Foo.java"), null, null, i, i + 1, 0, 0),
                    Map.of(),
                    "issue " + i,
                    sev));
        }
        AssessmentSummary summary = new AssessmentSummary(
                count, 0, count / 50, count / 4, count / 2, 42.0, 10, 1000);
        ProjectMetrics metrics = new ProjectMetrics(10, 1000, count, Map.of(), Map.of(), 42.0);
        return new Assessment("test", evidences, summary, metrics, System.currentTimeMillis());
    }
}
