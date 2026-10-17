package ai.refact.server.service;

import ai.refact.api.Assessment;
import ai.refact.api.ReasonEvidence;
import ai.refact.api.Severity;

import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Limits assessment payloads over HTTP so large projects (e.g. GanttProject) do not
 * fail with broken pipes or client timeouts. Full results remain in memory and on disk.
 */
public final class AssessmentResponsePolicy {

    /** When client requests detail list (still capped for safety). */
    public static final int MAX_EVIDENCES_WITH_DETAILS = 2_500;

    private AssessmentResponsePolicy() {}

    public static Assessment forHttp(Assessment full, boolean includeDetails) {
        if (full == null) {
            return null;
        }
        List<ReasonEvidence> evidences = full.evidences();
        if (evidences == null) {
            return full;
        }
        int max = includeDetails ? MAX_EVIDENCES_WITH_DETAILS : 0;
        if (evidences.size() <= max) {
            return full;
        }
        List<ReasonEvidence> trimmed = max == 0 ? List.of() : prioritize(evidences, max);
        return new Assessment(
                full.projectId(),
                trimmed,
                full.summary(),
                full.metrics(),
                full.timestamp());
    }

    static List<ReasonEvidence> prioritize(List<ReasonEvidence> evidences, int max) {
        return evidences.stream()
                .sorted(Comparator
                        .comparingInt((ReasonEvidence e) -> severityRank(e.severity()))
                        .thenComparing(e -> e.detectorId() != null ? e.detectorId() : "")
                        .thenComparing(e -> e.pointer() != null && e.pointer().file() != null
                                ? e.pointer().file().toString() : ""))
                .limit(max)
                .collect(Collectors.toList());
    }

    private static int severityRank(Severity severity) {
        if (severity == null) {
            return 99;
        }
        return switch (severity) {
            case BLOCKER -> 0;
            case CRITICAL -> 1;
            case MAJOR -> 2;
            case MINOR -> 3;
            case INFO -> 4;
        };
    }
}
