package ai.refact.engine.detectors;

import ai.refact.api.ProjectContext;
import ai.refact.api.ReasonEvidence;
import ai.refact.api.ReasonCategory;
import ai.refact.api.Severity;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import java.util.Set;
import java.util.Map;
import java.util.List;
import java.util.stream.Collectors;

class LongMethodDetectorTest {
    
    private LongMethodDetector detector;
    private ProjectContext projectContext;
    
    @BeforeEach
    void setUp() {
        detector = new LongMethodDetector();
        Path root = Path.of("/tmp/test-project");
        Path source = root.resolve("src/main/java/Example.java");
        try {
            java.nio.file.Files.createDirectories(source.getParent());
            // Create a sample Java file with a long method (>20 lines)
            StringBuilder sb = new StringBuilder();
            sb.append("public class Example {\n");
            sb.append("  public int calculateTotal(int n) {\n");
            for (int i = 0; i < 25; i++) {
                sb.append("    int x").append(i).append(" = ").append(i).append(";\n");
            }
            sb.append("    return 0;\n");
            sb.append("  }\n");
            sb.append("}\n");
            java.nio.file.Files.writeString(source, sb.toString());
        } catch (Exception ignored) {}
        
        projectContext = new ProjectContext(
            root,
            Set.of(Path.of("src/main/java/Example.java")),
            Set.of(),
            Map.of(),
            null
        );
    }
    
    @Test
    void testDetectorId() {
        assertEquals("design.long-method", detector.id());
    }
    
    @Test
    void testDetectorCategory() {
        assertEquals(ReasonCategory.DESIGN, detector.category());
    }
    
    @Test
    void testIsApplicable() {
        assertTrue(detector.isApplicable(projectContext));
    }
    
    @Test
    void testDetect() {
        List<ReasonEvidence> evidences = detector.detect(projectContext)
            .collect(Collectors.toList());
        
        assertFalse(evidences.isEmpty(), "Should detect at least one long method");
        
        ReasonEvidence evidence = evidences.get(0);
        assertEquals("design.long-method", evidence.detectorId());
        assertEquals(Severity.MAJOR, evidence.severity());
        assertTrue(evidence.summary().contains("calculateTotal"));
        assertTrue(evidence.summary().contains("too long"));
        
        Map<String, Object> metrics = evidence.metrics();
        assertNotNull(metrics.get("lineCount"));
        assertNotNull(metrics.get("maxLines"));
    }
}
