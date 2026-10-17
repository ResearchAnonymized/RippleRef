package ai.refact.server.service.rippleref;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RippleRefStudyReconcileTest {

    @TempDir
    Path tempDir;

    @Test
    void reconcileRebuildsCompletedCandidatesFromCsv() throws Exception {
        RippleRefStudyService service = newService(tempDir);

        Path studyDir = tempDir.resolve("ma_ref_master");
        Files.createDirectories(studyDir);
        String header = "study_id,project_id,file_path,model_id,variant,pair_key,status";
        String row1 = "ma_ref_master,ws-a,Foo.java,m1,MA,ws-a|Foo.java|m1|MA,completed";
        String row2 = "ma_ref_master,ws-a,Bar.java,m1,MA,ws-a|Bar.java|m1|MA,failed_generation";
        Files.writeString(
                studyDir.resolve("results_candidates.csv"),
                header + "\n" + row1 + "\n" + row2 + "\n",
                StandardCharsets.UTF_8);

        RippleRefModels.StudyState state = new RippleRefModels.StudyState();
        state.config = new RippleRefModels.StudyConfig();
        state.config.studyId = "ma_ref_master";
        state.studyDir = studyDir.toString();
        state.completedCandidates = new ArrayList<>();

        assertTrue(service.reconcileCandidateListsFromCsv(state));
        assertEquals(List.of("ws-a|Foo.java|m1|MA"), state.completedCandidates);
        assertEquals(List.of("ws-a|Bar.java|m1|MA"), state.failedCandidates);
        assertFalse(service.reconcileCandidateListsFromCsv(state));
    }

    private static RippleRefStudyService newService(Path workspaceTempDir) {
        return new RippleRefStudyService(
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                workspaceTempDir.toString(),
                "");
    }
}
