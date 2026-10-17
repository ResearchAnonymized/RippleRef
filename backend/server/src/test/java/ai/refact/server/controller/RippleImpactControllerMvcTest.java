package ai.refact.server.controller;

import ai.refact.server.service.ProjectService;
import ai.refact.server.service.RefactoringHistoryService;
import ai.refact.server.service.RippleImpactService;
import ai.refact.server.service.RippleImpactService.RefactoringRequest;
import ai.refact.server.service.RippleImpactService.RippleImpactResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = RippleImpactController.class)
class RippleImpactControllerMvcTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private RippleImpactService rippleImpactService;

    @MockBean
    private ProjectService projectService;

    @MockBean
    private RefactoringHistoryService refactoringHistoryService;

    @Test
    void analyzeImpact_serializesRippleImpactResult() throws Exception {
        RippleImpactResult ok = new RippleImpactResult(
                "RENAME_METHOD",
                "LOW",
                0,
                0,
                List.of(),
                List.of(),
                List.of(),
                false);
        when(rippleImpactService.analyzeRefactoringImpact(eq("ws1"), any(RefactoringRequest.class)))
                .thenReturn(ok);

        RefactoringRequest body = new RefactoringRequest();
        body.setType("RENAME_METHOD");
        body.setFilePath("src/Main.java");

        mockMvc.perform(post("/api/refactoring/workspaces/ws1/analyze-impact")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.operationType").value("RENAME_METHOD"))
                .andExpect(jsonPath("$.hasError").value(false));
    }
}
