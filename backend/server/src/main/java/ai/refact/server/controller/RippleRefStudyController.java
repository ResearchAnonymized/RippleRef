package ai.refact.server.controller;

import ai.refact.server.service.rippleref.RippleRefModels;
import ai.refact.server.service.rippleref.RippleRefStudyService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;

@RestController
@RequestMapping("/api/ripple-ref")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"}, allowCredentials = "true")
public class RippleRefStudyController {

    private final RippleRefStudyService studyService;

    public RippleRefStudyController(RippleRefStudyService studyService) {
        this.studyService = studyService;
    }

    @PostMapping("/studies")
    public ResponseEntity<RippleRefModels.StudyState> createStudy(@RequestBody(required = false) RippleRefModels.StudyConfig config)
            throws Exception {
        return ResponseEntity.ok(studyService.createStudy(config));
    }

    @GetMapping("/studies")
    public ResponseEntity<List<String>> listStudies() throws Exception {
        return ResponseEntity.ok(studyService.listStudies());
    }

    @GetMapping("/studies/{studyId}")
    public ResponseEntity<?> getStudy(
            @PathVariable String studyId,
            @RequestParam(defaultValue = "summary") String view) throws Exception {
        return studyService.loadStudyReconciled(studyId)
                .<ResponseEntity<?>>map(state -> ResponseEntity.ok(
                        "full".equalsIgnoreCase(view) ? state : studyService.studyStateForApi(state)))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/studies/{studyId}/scan/{workspaceId}")
    public ResponseEntity<Map<String, Object>> scanRepository(
            @PathVariable String studyId,
            @PathVariable String workspaceId) throws Exception {
        RippleRefModels.StudyState state = studyService.scanRepository(studyId, workspaceId);
        return ResponseEntity.ok(studyService.studyStateForApi(state));
    }

    @PostMapping("/studies/{studyId}/select-files")
    public ResponseEntity<?> selectFiles(
            @PathVariable String studyId,
            @RequestParam(required = false) String workspaceId) throws Exception {
        RippleRefModels.StudyState state = studyService.selectFiles(studyId, workspaceId);
        if (workspaceId != null && !workspaceId.isBlank()) {
            return ResponseEntity.ok(slimRepoSelection(state, workspaceId));
        }
        return ResponseEntity.ok(state);
    }

    @PostMapping("/studies/{studyId}/build-contexts")
    public ResponseEntity<Map<String, Object>> buildContexts(@PathVariable String studyId) throws Exception {
        RippleRefModels.StudyState state = studyService.buildDependencyContexts(studyId);
        return ResponseEntity.ok(studyService.studyStateForApi(state));
    }

    private Map<String, Object> slimRepoSelection(RippleRefModels.StudyState state, String workspaceId) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (state.config != null) {
            out.put("studyId", state.config.studyId);
        }
        out.put("status", state.status);
        List<RippleRefModels.SelectedFile> selected =
                state.selectedByRepo.getOrDefault(workspaceId, List.of());
        out.put("selectedByRepo", Map.of(workspaceId, selected));
        List<RippleRefModels.EligibleFile> eligible = state.eligibleByRepo.get(workspaceId);
        int eligibleCount = eligible != null ? eligible.size() : 0;
        out.put("eligibleByRepo", Map.of(workspaceId, eligibleCount));
        return out;
    }

    @GetMapping("/studies/{studyId}/dependency-context")
    public ResponseEntity<RippleRefModels.DependencyContextPackage> dependencyContext(
            @PathVariable String studyId,
            @RequestParam String workspaceId,
            @RequestParam String filePath) throws Exception {
        return ResponseEntity.ok(studyService.getDependencyContext(studyId, workspaceId, filePath));
    }

    @GetMapping("/studies/{studyId}/file-dependency-graph")
    public ResponseEntity<RippleRefModels.FileDependencyGraphView> fileDependencyGraph(
            @PathVariable String studyId,
            @RequestParam String workspaceId,
            @RequestParam String filePath) throws Exception {
        return ResponseEntity.ok(studyService.getFileDependencyGraph(studyId, workspaceId, filePath));
    }

    @GetMapping("/studies/{studyId}/preflight")
    public ResponseEntity<Map<String, Object>> preflight(
            @PathVariable String studyId,
            @RequestParam(required = false) String workspaceId) throws Exception {
        return ResponseEntity.ok(studyService.preflight(studyId, workspaceId));
    }

    @PostMapping("/studies/{studyId}/import-cohort")
    public ResponseEntity<Map<String, Object>> importCohort(
            @PathVariable String studyId,
            @RequestBody Map<String, String> body) throws Exception {
        String source = body.get("sourceStudyId");
        if (source == null || source.isBlank()) {
            source = "ripple_ref_master";
        }
        RippleRefModels.StudyState state = studyService.importCohortFromStudy(studyId, source);
        Map<String, Object> out = new LinkedHashMap<>(studyService.studyStateForApi(state));
        out.put("integrity", studyService.integrityPreflight(studyId));
        return ResponseEntity.ok(out);
    }

    /** Import locked cohort from exported manifest JSON (selectedByRepo with 150 files). */
    @PostMapping("/studies/{studyId}/import-cohort-manifest")
    public ResponseEntity<Map<String, Object>> importCohortManifest(
            @PathVariable String studyId,
            @RequestBody Map<String, Object> manifest) throws Exception {
        RippleRefModels.StudyState state = studyService.importCohortFromManifest(studyId, manifest);
        Map<String, Object> out = new LinkedHashMap<>(studyService.studyStateForApi(state));
        out.put("integrity", studyService.integrityPreflight(studyId));
        return ResponseEntity.ok(out);
    }

    @GetMapping("/studies/{studyId}/integrity-preflight")
    public ResponseEntity<Map<String, Object>> integrityPreflight(@PathVariable String studyId) throws Exception {
        return ResponseEntity.ok(studyService.integrityPreflight(studyId));
    }

    @GetMapping("/studies/{studyId}/artifacts/agent-steps")
    public ResponseEntity<Object> getAgentSteps(
            @PathVariable String studyId,
            @RequestParam String workspaceId,
            @RequestParam String filePath,
            @RequestParam String modelId,
            @RequestParam(defaultValue = "MA") String variant) throws Exception {
        return studyService.getAgentSteps(studyId, workspaceId, filePath, modelId, variant)
                .<ResponseEntity<Object>>map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/studies/{studyId}/artifacts/agent-steps")
    public ResponseEntity<Map<String, String>> saveAgentSteps(
            @PathVariable String studyId,
            @RequestBody Map<String, Object> body) throws Exception {
        studyService.saveAgentSteps(
                studyId,
                String.valueOf(body.get("workspaceId")),
                String.valueOf(body.get("filePath")),
                String.valueOf(body.get("modelId")),
                String.valueOf(body.get("variant")),
                body.get("steps"));
        return ResponseEntity.ok(Map.of("status", "saved"));
    }

    @PostMapping("/studies/{studyId}/artifacts/candidate-meta")
    public ResponseEntity<Map<String, String>> patchCandidateMeta(
            @PathVariable String studyId,
            @RequestBody Map<String, Object> body) throws Exception {
        studyService.patchCandidateMaMeta(studyId, body);
        return ResponseEntity.ok(Map.of("status", "patched"));
    }

    @PostMapping("/studies/{studyId}/record-candidate-outcome")
    public ResponseEntity<Map<String, Object>> recordCandidateOutcome(
            @PathVariable String studyId,
            @RequestBody Map<String, Object> body) throws Exception {
        return ResponseEntity.ok(studyService.recordCandidateOutcome(studyId, body));
    }

    @PostMapping("/studies/{studyId}/artifacts/prompt")
    public ResponseEntity<Map<String, String>> savePrompt(
            @PathVariable String studyId,
            @RequestBody Map<String, String> body) throws Exception {
        studyService.savePrompt(studyId, body.get("workspaceId"), body.get("filePath"),
                body.get("modelId"), body.get("variant"), body.get("promptText"));
        return ResponseEntity.ok(Map.of("status", "saved"));
    }

    @PostMapping("/studies/{studyId}/artifacts/response")
    public ResponseEntity<Map<String, String>> saveResponse(
            @PathVariable String studyId,
            @RequestBody Map<String, String> body) throws Exception {
        studyService.saveModelResponse(studyId, body.get("workspaceId"), body.get("filePath"),
                body.get("modelId"), body.get("variant"), body.get("rawResponse"));
        return ResponseEntity.ok(Map.of("status", "saved"));
    }

    @PostMapping("/studies/{studyId}/artifacts/candidate")
    public ResponseEntity<Map<String, String>> saveCandidate(
            @PathVariable String studyId,
            @RequestBody Map<String, String> body) throws Exception {
        studyService.saveCandidateCode(studyId, body.get("workspaceId"), body.get("filePath"),
                body.get("modelId"), body.get("variant"), body.get("candidateCode"));
        return ResponseEntity.ok(Map.of("status", "saved"));
    }

    @PostMapping("/studies/{studyId}/apply-and-verify")
    public ResponseEntity<RippleRefModels.RippleVerificationReport> applyAndVerify(
            @PathVariable String studyId,
            @RequestBody Map<String, Object> body) throws Exception {
        @SuppressWarnings("unchecked")
        Map<String, Object> meta = body.get("runMeta") instanceof Map
                ? (Map<String, Object>) body.get("runMeta") : Map.of();
        RippleRefModels.RippleVerificationReport report = studyService.applyAndVerify(
                studyId,
                String.valueOf(body.get("workspaceId")),
                String.valueOf(body.get("filePath")),
                String.valueOf(body.get("modelId")),
                String.valueOf(body.get("variant")),
                body.get("candidateCode") != null ? String.valueOf(body.get("candidateCode")) : null,
                meta);
        return ResponseEntity.ok(report);
    }

    @PostMapping("/studies/{studyId}/live-candidate")
    public ResponseEntity<Map<String, String>> setLiveCandidate(
            @PathVariable String studyId,
            @RequestBody Map<String, String> body) throws Exception {
        studyService.setLiveCandidate(
                studyId,
                body.get("workspaceId"),
                body.get("filePath"),
                body.get("modelId"),
                body.get("variant"),
                body.get("phase"));
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    @DeleteMapping("/studies/{studyId}/live-candidate")
    public ResponseEntity<Map<String, String>> clearLiveCandidate(@PathVariable String studyId) throws Exception {
        studyService.clearLiveCandidate(studyId);
        return ResponseEntity.ok(Map.of("status", "cleared"));
    }

    @GetMapping("/studies/{studyId}/live-status")
    public ResponseEntity<Map<String, Object>> liveStatus(@PathVariable String studyId) throws Exception {
        return ResponseEntity.ok(studyService.liveStatus(studyId));
    }

    @GetMapping(value = "/studies/{studyId}/live-stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter liveStream(@PathVariable String studyId) {
        SseEmitter emitter = new SseEmitter(0L);
        CompletableFuture.runAsync(() -> {
            try {
                while (true) {
                    Map<String, Object> status = studyService.liveStatus(studyId);
                    emitter.send(SseEmitter.event().name("status").data(status));
                    Thread.sleep(2000);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                emitter.complete();
            } catch (Exception e) {
                try {
                    emitter.completeWithError(e);
                } catch (Exception ignored) {
                    /* client disconnected */
                }
            }
        });
        return emitter;
    }

    @GetMapping("/studies/{studyId}/completeness")
    public ResponseEntity<RippleRefModels.CompletenessReport> completeness(@PathVariable String studyId)
            throws Exception {
        return ResponseEntity.ok(studyService.completeness(studyId));
    }

    @GetMapping("/studies/{studyId}/export-info")
    public ResponseEntity<Map<String, Object>> exportInfo(@PathVariable String studyId) throws Exception {
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("studyId", studyId);
        info.put("studyDir", studyService.studyDirectory(studyId).toString());
        info.put("completeness", studyService.completeness(studyId));
        return ResponseEntity.ok(info);
    }

    @GetMapping("/studies/{studyId}/results")
    public ResponseEntity<Map<String, Object>> candidateResults(@PathVariable String studyId) throws Exception {
        return ResponseEntity.ok(studyService.candidateResults(studyId));
    }

    @GetMapping("/studies/{studyId}/pipeline-status")
    public ResponseEntity<Map<String, Object>> pipelineStatus(@PathVariable String studyId) throws Exception {
        Map<String, Object> status = studyService.getPipelineStatus(studyId);
        status.put("completeness", studyService.completeness(studyId));
        try {
            status.put("live", studyService.liveStatus(studyId));
        } catch (Exception ignored) {
            /* optional */
        }
        try {
            status.put("verificationMa", studyService.verificationSummary("ma_ref_master"));
            status.put("verificationB0", studyService.verificationSummary("ripple_ref_master"));
        } catch (Exception ignored) {
            /* optional */
        }
        return ResponseEntity.ok(status);
    }

    @GetMapping("/studies/{studyId}/verification-summary")
    public ResponseEntity<Map<String, Object>> verificationSummary(@PathVariable String studyId) throws Exception {
        return ResponseEntity.ok(studyService.verificationSummary(studyId));
    }

    @PostMapping("/studies/{studyId}/pipeline-status")
    public ResponseEntity<Map<String, Object>> updatePipelineStatus(
            @PathVariable String studyId,
            @RequestBody Map<String, Object> body) throws Exception {
        return ResponseEntity.ok(studyService.updatePipelineStatus(studyId, body));
    }

    @PostMapping("/studies/{studyId}/pipeline/start")
    public ResponseEntity<Map<String, Object>> startPipeline(@PathVariable String studyId) throws Exception {
        return ResponseEntity.ok(studyService.startMaPipelineDaemon(studyId));
    }

    @PostMapping("/studies/{studyId}/pipeline/stop")
    public ResponseEntity<Map<String, Object>> stopPipeline(@PathVariable String studyId) throws Exception {
        return ResponseEntity.ok(studyService.stopMaPipelineDaemon(studyId));
    }

    @PostMapping("/studies/{studyId}/pipeline/heal")
    public ResponseEntity<Map<String, Object>> healPipeline(@PathVariable String studyId) throws Exception {
        return ResponseEntity.ok(studyService.triggerMaPipelineHeal(studyId));
    }

    @PostMapping("/studies/{studyId}/pipeline/l5/start")
    public ResponseEntity<Map<String, Object>> startL5Pipeline(@PathVariable String studyId) throws Exception {
        return ResponseEntity.ok(studyService.startL5PipelineDaemon(studyId));
    }

    @PostMapping("/studies/{studyId}/pipeline/l5/stop")
    public ResponseEntity<Map<String, Object>> stopL5Pipeline(@PathVariable String studyId) throws Exception {
        return ResponseEntity.ok(studyService.stopL5PipelineDaemon(studyId));
    }
}
