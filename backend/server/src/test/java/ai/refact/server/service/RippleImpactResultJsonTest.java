package ai.refact.server.service;

import ai.refact.server.service.RippleImpactService.DependencyInfo;
import ai.refact.server.service.RippleImpactService.ImpactedFileInfo;
import ai.refact.server.service.RippleImpactService.RippleImpactResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RippleImpactResultJsonTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void successResult_serializes() {
        RippleImpactResult r = new RippleImpactResult(
                "RENAME_METHOD",
                "LOW",
                1,
                1,
                List.of(new ImpactedFileInfo("src/Foo.java", 10, "call", "METHOD_CALL")),
                List.of(new DependencyInfo("src/A.java", "src/B.java", "METHOD_CALL", "m")),
                List.of("rec"),
                false);
        String json = assertDoesNotThrow(() -> mapper.writeValueAsString(r));
        assertTrue(json.contains("RENAME_METHOD"));
    }

    @Test
    void errorResult_serializes() {
        RippleImpactResult r = RippleImpactResult.error("boom");
        String json = assertDoesNotThrow(() -> mapper.writeValueAsString(r));
        assertTrue(json.contains("boom"));
    }
}
