package ai.refact.server.service.rippleref;

import ai.refact.api.ProjectContext;
import ai.refact.server.service.ComprehensiveCodeSmellDetector;
import ai.refact.server.service.PmdAnalysisPersistence;
import ai.refact.server.service.ProjectService;
import ai.refact.server.service.WorkspacePathFilters;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class RippleRefStudyService {

    private static final Logger logger = LoggerFactory.getLogger(RippleRefStudyService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper()
            .enable(SerializationFeature.INDENT_OUTPUT);
    private final ConcurrentHashMap<String, Object> studyPersistLocks = new ConcurrentHashMap<>();

    private final ProjectService projectService;
    private final RippleRefDependencyScanner dependencyScanner;
    private final RippleRefFileSelector fileSelector;
    private final RippleRefContextBuilder contextBuilder;
    private final RippleRefJavaProfileExtractor profileExtractor;
    private final RippleRefRippleVerifier rippleVerifier;
    private final RippleRefWorkspaceSandbox workspaceSandbox;
    private final RippleRefCallerImpactAnalyzer callerImpactAnalyzer;
    private final RippleRefCompileProbe compileProbe;
    private final RippleRefBehavioralVerifier behavioralVerifier;
    private final RippleRefTestProbe testProbe;
    private final PmdAnalysisPersistence pmdPersistence;
    private final ComprehensiveCodeSmellDetector smellDetector;
    private final Path studyRunsBase;
    private final String repoRoot;

    public RippleRefStudyService(
            ProjectService projectService,
            RippleRefDependencyScanner dependencyScanner,
            RippleRefFileSelector fileSelector,
            RippleRefContextBuilder contextBuilder,
            RippleRefJavaProfileExtractor profileExtractor,
            RippleRefRippleVerifier rippleVerifier,
            RippleRefWorkspaceSandbox workspaceSandbox,
            RippleRefCallerImpactAnalyzer callerImpactAnalyzer,
            RippleRefCompileProbe compileProbe,
            RippleRefBehavioralVerifier behavioralVerifier,
            RippleRefTestProbe testProbe,
            PmdAnalysisPersistence pmdPersistence,
            ComprehensiveCodeSmellDetector smellDetector,
            @Value("${refactai.workspace.temp-dir:${java.io.tmpdir}/refactai/workspaces}") String workspaceTempDir,
            @Value("${refactai.repo-root:}") String repoRoot) {
        this.projectService = projectService;
        this.dependencyScanner = dependencyScanner;
        this.fileSelector = fileSelector;
        this.contextBuilder = contextBuilder;
        this.profileExtractor = profileExtractor;
        this.rippleVerifier = rippleVerifier;
        this.workspaceSandbox = workspaceSandbox;
        this.callerImpactAnalyzer = callerImpactAnalyzer;
        this.compileProbe = compileProbe;
        this.behavioralVerifier = behavioralVerifier;
        this.testProbe = testProbe;
        this.pmdPersistence = pmdPersistence;
        this.smellDetector = smellDetector;
        this.studyRunsBase = Path.of(workspaceTempDir).resolve("ripple_study_runs");
        this.repoRoot = repoRoot;
    }

    public RippleRefModels.StudyState createStudy(RippleRefModels.StudyConfig config) throws IOException {
        if (config == null) {
            config = new RippleRefModels.StudyConfig();
        }
        if (config.studyId == null || config.studyId.isBlank()) {
            config.studyId = "study_" + DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss").format(Instant.now().atZone(java.time.ZoneOffset.UTC));
        }
        if (config.models == null || config.models.isEmpty()) {
            config.models = defaultModels();
        }
        applyScaleDefaults(config);
        config.createdAt = Instant.now().toEpochMilli();

        Path studyDir = studyRunsBase.resolve(config.studyId);
        Files.createDirectories(studyDir);
        createStudyLayout(studyDir);

        RippleRefModels.StudyState state = new RippleRefModels.StudyState();
        state.config = config;
        state.studyDir = studyDir.toString();
        state.status = "created";

        writeJson(studyDir.resolve("config.json"), config);
        writeJson(studyDir.resolve("study_state.json"), state);
        writeReadme(studyDir, config);
        logger.info("Created RIPPLE-REF study {} at {}", config.studyId, studyDir);
        return state;
    }

    public Optional<RippleRefModels.StudyState> loadStudy(String studyId) {
        try {
            Path studyDir = studyRunsBase.resolve(studyId);
            Path stateFile = studyDir.resolve("study_state.json");
            if (!Files.isRegularFile(stateFile)) {
                return Optional.empty();
            }
            return Optional.of(MAPPER.readValue(stateFile.toFile(), RippleRefModels.StudyState.class));
        } catch (Exception e) {
            logger.warn("Failed to load study {}: {}", studyId, e.toString());
            return Optional.empty();
        }
    }

    /** Read study and reconcile completed/failed lists from results_candidates.csv. */
    public Optional<RippleRefModels.StudyState> loadStudyReconciled(String studyId) throws IOException {
        try {
            return Optional.of(requireStudy(studyId));
        } catch (IllegalArgumentException notFound) {
            if (MA_REF_MASTER_ID.equals(studyId)) {
                try {
                    return Optional.of(ensureMaRefMasterStudy());
                } catch (Exception e) {
                    return Optional.empty();
                }
            }
            return Optional.empty();
        }
    }

    /** Lightweight API payload — omits dependency graphs and eligible-file pools (can be 50MB+). */
    public Map<String, Object> studyStateForApi(RippleRefModels.StudyState state) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("config", state.config);
        out.put("studyDir", state.studyDir);
        out.put("status", state.status);
        out.put("repositoryScans", state.repositoryScans);
        out.put("selectedByRepo", state.selectedByRepo);
        out.put("completedCandidates", state.completedCandidates);
        out.put("failedCandidates", state.failedCandidates);
        return out;
    }

    public List<String> listStudies() throws IOException {
        if (!Files.isDirectory(studyRunsBase)) {
            return List.of();
        }
        try (var stream = Files.list(studyRunsBase)) {
            return stream.filter(Files::isDirectory)
                    .map(p -> p.getFileName().toString())
                    .sorted()
                    .collect(Collectors.toList());
        }
    }

    public RippleRefModels.StudyState scanRepository(String studyId, String workspaceId) throws Exception {
        RippleRefModels.StudyState state = requireStudy(studyId);
        ProjectContext ctx = requireProject(workspaceId);
        Path root = ctx.root();

        RippleRefModels.RepositoryScanResult scan = new RippleRefModels.RepositoryScanResult();
        scan.projectId = workspaceId;
        scan.repositoryName = root.getFileName() != null ? root.getFileName().toString() : workspaceId;
        scan.repositoryPath = root.toString();
        scan.commitHash = resolveCommitHash(root);
        scan.analysisTimestamp = Instant.now().toString();

        List<String> production = new ArrayList<>();
        List<RippleRefModels.ExcludedFile> excluded = new ArrayList<>();
        long prodLoc = 0;

        for (Path file : ctx.sourceFiles()) {
            String rel = WorkspacePathFilters.toRelativePath(root, file);
            RippleRefProductionClassifier.Classification c = RippleRefProductionClassifier.classify(rel);
            if (c == RippleRefProductionClassifier.Classification.PRODUCTION) {
                production.add(rel);
                prodLoc += RippleRefProductionClassifier.countLoc(RippleRefTextIO.readTextLenient(file));
            } else {
                RippleRefModels.ExcludedFile ex = new RippleRefModels.ExcludedFile();
                ex.path = rel;
                ex.reason = RippleRefProductionClassifier.exclusionReason(rel).orElse("excluded");
                excluded.add(ex);
            }
        }

        scan.productionFiles = production;
        scan.excludedFiles = excluded;
        scan.productionFileCount = production.size();
        scan.excludedFileCount = excluded.size();
        scan.javaFileCount = production.size() + excluded.size();
        scan.productionLoc = prodLoc;
        scan.totalLoc = prodLoc;

        state.repositoryScans.put(workspaceId, scan);
        appendCsvRow(studyDir(state), "repositories.csv",
                "project_id,repository_name,repository_path,commit_hash,java_file_count,production_file_count,excluded_file_count,total_loc,production_loc,analysis_timestamp",
                csv(scan.projectId, scan.repositoryName, scan.repositoryPath, scan.commitHash,
                        scan.javaFileCount, scan.productionFileCount, scan.excludedFileCount,
                        scan.totalLoc, scan.productionLoc, scan.analysisTimestamp));

        for (String p : production) {
            appendCsvRow(studyDir(state), "production_java_files.csv",
                    "project_id,file_path",
                    csv(workspaceId, p));
        }
        for (RippleRefModels.ExcludedFile ex : excluded) {
            appendCsvRow(studyDir(state), "excluded_files.csv",
                    "project_id,file_path,reason",
                    csv(workspaceId, ex.path, ex.reason));
        }

        RippleRefModels.RepositoryDependencyScan depScan = dependencyScanner.scan(workspaceId, ctx);
        state.dependencyScans.put(workspaceId, depScan);
        writeJson(studyDir(state).resolve("repository_profiles").resolve(workspaceId + "_dependency_scan.json"), depScan);

        state.status = "scanning";
        persistState(state);
        return state;
    }

    public RippleRefModels.StudyState selectFiles(String studyId, String workspaceIdFilter) throws Exception {
        RippleRefModels.StudyState state = requireStudy(studyId);
        int filesPerRepo = state.config.filesPerRepository;
        int minSmells = state.config.minSmellCount > 0 ? state.config.minSmellCount : RippleRefFileSelector.DEFAULT_MIN_SMELLS;
        int seed = state.config.randomSeed > 0 ? state.config.randomSeed : RippleRefFileSelector.DEFAULT_SEED;

        List<String> workspaceIds = resolveWorkspaceIdsForSelection(state, workspaceIdFilter);
        if (workspaceIds.isEmpty()) {
            throw new IllegalStateException(workspaceIdFilter != null && !workspaceIdFilter.isBlank()
                    ? "Workspace not configured in study: " + workspaceIdFilter
                    : "No scanned repositories — run scan before select-files");
        }

        for (String workspaceId : workspaceIds) {
            RippleRefModels.RepositoryDependencyScan depScan = state.dependencyScans.get(workspaceId);
            if (depScan == null) {
                scanRepository(studyId, workspaceId);
                state = requireStudy(studyId);
                depScan = state.dependencyScans.get(workspaceId);
            }
            ProjectContext ctx = requireProject(workspaceId);
            Map<String, String> contents = loadProductionContents(ctx);
            Map<String, Integer> smellCounts = smellCountsFor(ctx, contents.keySet());

            List<RippleRefModels.EligibleFile> eligible = fileSelector.computeEligible(
                    depScan, smellCounts, contents, minSmells);
            state.eligibleByRepo.put(workspaceId, eligible);

            for (RippleRefModels.EligibleFile ef : eligible) {
                appendCsvRow(studyDir(state), "eligible_files.csv",
                        "project_id,file_path,loc,smell_count,complexity,fan_in,fan_out,public_api_count,caller_used_api_count,downstream_caller_count,annotation_count,value_score,dependency_risk_score",
                        csv(workspaceId, ef.filePath, ef.loc, ef.smellCount, ef.complexity, ef.fanIn, ef.fanOut,
                                ef.publicApiCount, ef.callerUsedApiCount, ef.downstreamCallerCount, ef.annotationCount,
                                ef.valueScore, ef.dependencyRiskScore));
            }

            List<RippleRefModels.SelectedFile> selected = fileSelector.stratifiedSample(
                    workspaceId, eligible, filesPerRepo, seed + workspaceId.hashCode());
            state.selectedByRepo.put(workspaceId, selected);

            for (RippleRefModels.SelectedFile sf : selected) {
                appendCsvRow(studyDir(state), "selected_files.csv",
                        "project_id,file_path,sampling_group,selection_reason,loc,smell_count,fan_in,fan_out,public_api_count,caller_used_api_count,value_score,dependency_risk_score",
                        csv(sf.projectId, sf.filePath, sf.samplingGroup, sf.selectionReason, sf.loc, sf.smellCount,
                                sf.fanIn, sf.fanOut, sf.publicApiCount, sf.callerUsedApiCount, sf.valueScore, sf.dependencyRiskScore));
            }
        }

        state.status = "ready";
        persistState(state);
        return state;
    }

    public RippleRefModels.StudyState buildDependencyContexts(String studyId) throws Exception {
        RippleRefModels.StudyState state = requireStudy(studyId);
        Path ctxDir = studyDir(state).resolve("dependency_contexts");

        for (Map.Entry<String, List<RippleRefModels.SelectedFile>> e : state.selectedByRepo.entrySet()) {
            String workspaceId = e.getKey();
            RippleRefModels.RepositoryDependencyScan dep = state.dependencyScans.get(workspaceId);
            if (dep == null) {
                continue;
            }
            for (RippleRefModels.SelectedFile sf : e.getValue()) {
                RippleRefModels.JavaFileProfile profile = dep.fileProfiles.get(sf.filePath);
                if (profile == null) {
                    continue;
                }
                RippleRefModels.DependencyContextPackage ctx = contextBuilder.build(workspaceId, profile);
                String safeName = workspaceId + "__" + sf.filePath.replace('/', '_');
                writeJson(ctxDir.resolve(safeName + ".json"), ctx);
                Files.writeString(ctxDir.resolve(safeName + ".txt"), ctx.contextText, StandardCharsets.UTF_8);
            }
        }
        persistState(state);
        return state;
    }

    public RippleRefModels.DependencyContextPackage getDependencyContext(String studyId, String workspaceId, String filePath)
            throws Exception {
        RippleRefModels.StudyState state = requireStudy(studyId);
        RippleRefModels.RepositoryDependencyScan dep = state.dependencyScans.get(workspaceId);
        if (dep == null) {
            scanRepository(studyId, workspaceId);
            dep = state.dependencyScans.get(workspaceId);
        }
        RippleRefModels.JavaFileProfile profile = dep.fileProfiles.get(filePath);
        if (profile == null) {
            throw new IllegalArgumentException("No profile for file: " + filePath);
        }
        return contextBuilder.build(workspaceId, profile);
    }

    public RippleRefModels.FileDependencyGraphView getFileDependencyGraph(
            String studyId, String workspaceId, String filePath) throws Exception {
        RippleRefModels.StudyState state = requireStudy(studyId);
        RippleRefModels.RepositoryDependencyScan dep = state.dependencyScans.get(workspaceId);
        if (dep == null) {
            scanRepository(studyId, workspaceId);
            state = requireStudy(studyId);
            dep = state.dependencyScans.get(workspaceId);
        }
        if (dep == null) {
            throw new IllegalArgumentException("No dependency scan for workspace: " + workspaceId);
        }
        RippleRefModels.JavaFileProfile profile = dep.fileProfiles.get(filePath);
        if (profile == null) {
            throw new IllegalArgumentException("No profile for file: " + filePath);
        }

        RippleRefModels.FileDependencyGraphView view = new RippleRefModels.FileDependencyGraphView();
        view.projectId = workspaceId;
        view.filePath = filePath;
        view.packageName = profile.packageName;
        view.fanIn = profile.fanIn;
        view.fanOut = profile.fanOut;
        view.upstreamFiles = new ArrayList<>(dep.dependencyGraph.getOrDefault(filePath, List.of()));
        view.downstreamCallers = new ArrayList<>(profile.callerFiles);
        view.typeDependencies = new ArrayList<>(profile.typeDependencies);
        view.publicApis = new ArrayList<>(profile.publicApis);
        view.protectedApis = new ArrayList<>(profile.protectedApis);
        view.callerUsedApis = new ArrayList<>(profile.callerUsedApis);

        for (String up : view.upstreamFiles) {
            view.edges.add(up + " -> " + filePath);
        }
        for (String down : view.downstreamCallers) {
            view.edges.add(filePath + " -> " + down);
        }
        return view;
    }

    public Map<String, Object> preflight(String studyId, String workspaceIdFilter) throws IOException {
        RippleRefModels.StudyState state = requireStudy(studyId);
        List<String> issues = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        List<String> workspaceIds = resolveWorkspaceIdsForPreflight(state, workspaceIdFilter);
        if (workspaceIds.isEmpty()) {
            issues.add(workspaceIdFilter != null && !workspaceIdFilter.isBlank()
                    ? "Workspace not configured in study: " + workspaceIdFilter
                    : "No repositories configured");
        }
        for (String ws : workspaceIds) {
            if (!state.repositoryScans.containsKey(ws)) {
                issues.add("Repository not scanned: " + ws);
            }
            if (!state.selectedByRepo.containsKey(ws) || state.selectedByRepo.get(ws).isEmpty()) {
                issues.add("No selected files for: " + ws);
            }
            int required = state.config.filesPerRepository;
            int selected = state.selectedByRepo.containsKey(ws) ? state.selectedByRepo.get(ws).size() : 0;
            if (selected > 0 && selected < required) {
                warnings.add("Selected only " + selected + "/" + required + " files for " + ws);
            }
            try {
                requireProject(ws);
            } catch (Exception e) {
                issues.add("Workspace unavailable: " + ws);
            }
        }
        if (state.config.models.isEmpty()) {
            issues.add("No models configured");
        }
        Path studyDir = studyDir(state);
        for (String sub : List.of("prompts", "model_responses", "generated_candidates", "ripple_reports")) {
            if (!Files.isDirectory(studyDir.resolve(sub))) {
                warnings.add("Missing folder (will be created): " + sub);
            }
        }

        int planned = plannedRuns(state, workspaceIdFilter);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("studyId", studyId);
        result.put("workspaceId", workspaceIdFilter);
        result.put("plannedRuns", planned);
        result.put("issues", issues);
        result.put("warnings", warnings);
        result.put("ready", issues.isEmpty());
        return result;
    }

    public String candidateKey(String workspaceId, String filePath, String modelId, String variant) {
        return workspaceId + "|" + filePath + "|" + modelId + "|" + variant;
    }

    public void savePrompt(String studyId, String workspaceId, String filePath, String modelId,
                           String variant, String promptText) throws IOException {
        Path dir = studyDir(requireStudy(studyId)).resolve("prompts");
        String name = safeArtifactName(workspaceId, filePath, modelId, variant) + ".txt";
        Files.writeString(dir.resolve(name), promptText, StandardCharsets.UTF_8);
    }

    public void saveModelResponse(String studyId, String workspaceId, String filePath, String modelId,
                                  String variant, String rawResponse) throws IOException {
        Path dir = studyDir(requireStudy(studyId)).resolve("model_responses");
        String name = safeArtifactName(workspaceId, filePath, modelId, variant) + ".json";
        Files.writeString(dir.resolve(name), rawResponse, StandardCharsets.UTF_8);
    }

    public void saveCandidateCode(String studyId, String workspaceId, String filePath, String modelId,
                                  String variant, String candidateCode) throws IOException {
        RippleRefModels.StudyState state = requireStudy(studyId);
        Path dir = studyDir(state).resolve("generated_candidates");
        String name = safeArtifactName(workspaceId, filePath, modelId, variant) + ".java";
        Files.writeString(dir.resolve(name), candidateCode, StandardCharsets.UTF_8);

        Path origDir = studyDir(state).resolve("original_files");
        ProjectContext ctx = requireProject(workspaceId);
        Path source = WorkspacePathFilters.resolveReadableSourcePath(ctx.root(), filePath).orElse(null);
        if (source != null) {
            Path dest = origDir.resolve(safeArtifactName(workspaceId, filePath, "original", "V0") + ".java");
            if (!Files.exists(dest)) {
                Files.copy(source, dest, StandardCopyOption.REPLACE_EXISTING);
            }
        }
    }

    public RippleRefModels.RippleVerificationReport applyAndVerify(
            String studyId,
            String workspaceId,
            String filePath,
            String modelId,
            String variant,
            String candidateCode,
            Map<String, Object> runMeta) throws Exception {

        RippleRefModels.StudyState state = requireStudy(studyId);
        ProjectContext ctx = requireProject(workspaceId);
        Path root = ctx.root();
        Path source = WorkspacePathFilters.resolveReadableSourcePath(root, filePath)
                .orElseThrow(() -> new IllegalArgumentException("Source not found: " + filePath));

        String baseName = safeArtifactName(workspaceId, filePath, modelId, variant);
        String originalContent;
        if (runMeta != null && Boolean.TRUE.equals(runMeta.get("backfillReplay"))) {
            Path beforeDiff = studyDir(state).resolve("diffs").resolve(baseName + "_before.java");
            if (Files.isRegularFile(beforeDiff)) {
                originalContent = Files.readString(beforeDiff, StandardCharsets.UTF_8);
            } else {
                originalContent = Files.readString(source, StandardCharsets.UTF_8);
            }
        } else if (runMeta != null && runMeta.get("originalCode") instanceof String override
                && !override.isBlank()) {
            originalContent = override;
        } else {
            originalContent = Files.readString(source, StandardCharsets.UTF_8);
        }
        RippleRefModels.RepositoryDependencyScan dep = state.dependencyScans.get(workspaceId);
        if (dep == null) {
            dep = dependencyScanner.scan(workspaceId, ctx);
            state.dependencyScans.put(workspaceId, dep);
        }

        RippleRefModels.JavaFileProfile beforeProfile = dep.fileProfiles.get(filePath);
        if (beforeProfile == null) {
            beforeProfile = profileExtractor.extract(filePath, originalContent);
        }

        int smellBefore = smellCount(ctx, filePath, source);
        RippleRefModels.JavaFileProfile afterProfile = profileExtractor.extract(filePath, candidateCode);
        int smellAfter = candidateCode != null && afterProfile.parseSuccess
                ? smellDetector.detectAllCodeSmells(source.getParent().resolve("_ripple_tmp.java")).size()
                : smellBefore;
        // Write temp for smell detection on candidate
        Path tmpCandidate = studyDir(state).resolve("generated_candidates")
                .resolve(safeArtifactName(workspaceId, filePath, modelId, variant) + "_verify.java");
        Files.writeString(tmpCandidate, candidateCode == null ? "" : candidateCode, StandardCharsets.UTF_8);
        if (candidateCode != null && afterProfile.parseSuccess) {
            smellAfter = smellDetector.detectAllCodeSmells(tmpCandidate).size();
        }

        RippleRefModels.RippleVerificationReport report = rippleVerifier.verifyWithContent(
                originalContent, candidateCode, beforeProfile, afterProfile, smellBefore, smellAfter);

        String key = candidateKey(workspaceId, filePath, modelId, variant);
        boolean runL2 = candidateCode != null && afterProfile.parseSuccess;

        RippleRefModels.BehavioralVerificationResult behavioral = null;
        RippleRefTestProbe.TestProbeResult testResult = null;

        if (candidateCode != null && originalContent != null) {
            behavioral = behavioralVerifier.verify(originalContent, candidateCode, filePath, profileExtractor);
            report.behavioral = behavioral;
            report.verificationLevel = "L4";
            writeJson(studyDir(state).resolve("behavioral_reports").resolve(
                    safeArtifactName(workspaceId, filePath, modelId, variant) + ".json"), behavioral);
        }

        if (runL2) {
            // L2 caller text check: caller files are unchanged — read from live workspace (no full-repo sandbox copy).
            Path callerReadRoot = root;
            RippleRefCallerImpactAnalyzer.CallerImpactResult impact =
                    callerImpactAnalyzer.analyze(beforeProfile, afterProfile, callerReadRoot, profileExtractor);

            boolean compileAttempted = runMeta != null && Boolean.TRUE.equals(runMeta.get("compileProbe"));
            boolean testAttempted = runMeta != null && Boolean.TRUE.equals(runMeta.get("testProbe"));
            Path sandbox = null;
            if (compileAttempted || testAttempted) {
                sandbox = workspaceSandbox.ensureSandbox(root, studyDir(state), key);
                report.sandboxPath = sandbox.toString();
            }

            RippleRefCompileProbe.CompileProbeResult compileResult = null;
            if (compileAttempted && sandbox != null) {
                workspaceSandbox.applyTargetFile(sandbox, filePath, candidateCode);
                compileResult = compileProbe.probe(sandbox);
            }
            rippleVerifier.applyObservedImpact(report, impact, compileResult, compileAttempted);

            if (testAttempted && sandbox != null) {
                testResult = testProbe.probePaired(
                        sandbox, filePath, originalContent, candidateCode, beforeProfile, profileExtractor);
                if (testResult != null && "skipped".equals(testResult.status) && testResult.probeStrategy == null) {
                    testResult.probeStrategy = "none";
                }
                report.tests = toTestVerificationResult(testResult);
                report.verificationLevel = "L5";
                writeJson(studyDir(state).resolve("test_reports").resolve(
                        safeArtifactName(workspaceId, filePath, modelId, variant) + ".json"), report.tests);
                if (runMeta != null && Boolean.TRUE.equals(runMeta.get("backfillReplay"))) {
                    workspaceSandbox.discardSandbox(studyDir(state), key);
                }
            }
        }

        report.adoptionClass = RippleRefBehavioralVerifier.computeAdoptionClass(report, behavioral, testResult);

        Path reportsDir = studyDir(state).resolve("ripple_reports");
        String base = safeArtifactName(workspaceId, filePath, modelId, variant);
        writeJson(reportsDir.resolve(base + ".json"), report);
        writeJson(studyDir(state).resolve("before_profiles").resolve(base + ".json"), beforeProfile);
        writeJson(studyDir(state).resolve("after_profiles").resolve(base + ".json"), afterProfile);

        if (candidateCode != null && originalContent != null) {
            Path diffDir = studyDir(state).resolve("diffs");
            Files.writeString(diffDir.resolve(base + "_before.java"), originalContent, StandardCharsets.UTF_8);
            Files.writeString(diffDir.resolve(base + "_after.java"), candidateCode, StandardCharsets.UTF_8);
        }

        RippleRefModels.CandidateResultRow row = new RippleRefModels.CandidateResultRow();
        row.studyId = studyId;
        row.projectId = workspaceId;
        row.filePath = filePath;
        row.modelId = modelId;
        row.variant = variant;
        row.pairKey = candidateKey(workspaceId, filePath, modelId, variant);
        row.status = candidateCode == null || !afterProfile.parseSuccess ? "failed_parsing" : "completed";
        row.riskLevel = report.riskLevel;
        row.contractRiskLevel = report.contractRiskLevel;
        row.observedRiskLevel = report.observedRiskLevel;
        row.verificationLevel = report.verificationLevel;
        row.callersChecked = report.callersChecked;
        row.observedBrokenCallerCount = report.observedBrokenCallerCount;
        row.compileProbeStatus = report.compileProbeStatus;
        row.behavioralCorrect = behavioral != null && behavioral.behavioralCorrect;
        row.adoptionClass = report.adoptionClass;
        row.testProbeStatus = report.tests != null ? report.tests.status : null;
        row.testProbeBeforeStatus = report.tests != null ? report.tests.beforeStatus : null;
        row.testsPassed = report.tests != null ? report.tests.testsPassed : 0;
        row.testsFailed = report.tests != null ? report.tests.testsFailed : 0;
        row.testsPassedBefore = report.tests != null ? report.tests.beforeTestsPassed : 0;
        row.testsFailedBefore = report.tests != null ? report.tests.beforeTestsFailed : 0;
        row.testRegression = report.tests != null && report.tests.regression;
        row.testProbeStrategy = report.tests != null ? report.tests.probeStrategy : null;
        row.riskReasonsJson = MAPPER.writeValueAsString(report.riskReasons);
        row.smellCountBefore = smellBefore;
        row.smellCountAfter = smellAfter;
        row.fanInBefore = beforeProfile.fanIn;
        row.fanOutBefore = beforeProfile.fanOut;
        row.fanOutAfter = afterProfile.fanOut;
        row.fanOutDelta = report.fanOutDelta;
        row.callerUsedApiCountBefore = beforeProfile.callerUsedApis.size();
        row.publicApiCountBefore = beforeProfile.publicApis.size();
        row.downstreamCallerCountBefore = beforeProfile.callerFiles != null ? beforeProfile.callerFiles.size() : 0;
        row.linesAdded = report.linesAdded;
        row.linesRemoved = report.linesRemoved;
        row.churn = report.churn;
        row.methodsAdded = report.methodsAdded;
        row.methodsRemoved = report.methodsRemoved;
        if (runMeta != null) {
            if (runMeta.get("latencyMs") instanceof Number n) {
                row.latencyMs = n.longValue();
            }
            if (runMeta.get("promptTokens") instanceof Number n) {
                row.promptTokens = n.intValue();
            }
            if (runMeta.get("completionTokens") instanceof Number n) {
                row.completionTokens = n.intValue();
            }
            if (runMeta.get("orchestration") != null) {
                row.orchestration = String.valueOf(runMeta.get("orchestration"));
            }
            if (runMeta.get("graphVersion") != null) {
                row.graphVersion = String.valueOf(runMeta.get("graphVersion"));
            }
            if (runMeta.get("multiLlmAgentMode") != null) {
                row.multiLlmAgentMode = String.valueOf(runMeta.get("multiLlmAgentMode"));
            }
            if (runMeta.get("agentStepCount") instanceof Number n) {
                row.agentStepCount = n.intValue();
            }
            if (runMeta.get("llmPlanStatus") != null) {
                row.llmPlanStatus = String.valueOf(runMeta.get("llmPlanStatus"));
            }
            if (runMeta.get("llmVerifyApproved") instanceof Boolean b) {
                row.llmVerifyApproved = b;
            } else if (runMeta.get("llmVerifyApproved") != null) {
                row.llmVerifyApproved = Boolean.parseBoolean(String.valueOf(runMeta.get("llmVerifyApproved")));
            }
            if (runMeta.get("staticVerifyAccept") instanceof Boolean b) {
                row.staticVerifyAccept = b;
            } else if (runMeta.get("staticVerifyAccept") != null) {
                row.staticVerifyAccept = Boolean.parseBoolean(String.valueOf(runMeta.get("staticVerifyAccept")));
            }
            if (runMeta.get("cohortId") != null) {
                row.cohortId = String.valueOf(runMeta.get("cohortId"));
            }
            if (runMeta.get("error") != null) {
                row.status = "failed_generation";
                row.error = String.valueOf(runMeta.get("error"));
            }
        }
        if (row.orchestration == null || row.orchestration.isBlank()) {
            boolean ma = state.config != null && "multi_agent".equalsIgnoreCase(state.config.orchestration);
            row.orchestration = ma ? "multi_agent" : "single_pass";
        }
        if (row.cohortId == null && state.config != null && state.config.cohortId != null) {
            row.cohortId = state.config.cohortId;
        }
        row.completedAt = Instant.now().toString();

        if (runMeta != null && Boolean.TRUE.equals(runMeta.get("backfillReplay"))) {
            mergeExistingCandidateMetadata(studyDir(state), row);
        }

        appendCandidateCsv(studyDir(state), row);
        writeJson(studyDir(state).resolve("results_candidates.json"), loadAllCandidateRows(studyDir(state)));

        synchronized (studyPersistLock(studyId)) {
            RippleRefModels.StudyState fresh = loadStudy(studyId).orElse(state);
            reconcileCandidateListsFromCsv(fresh);
            fresh.status = "running";
            persistState(fresh);
        }
        clearLiveCandidate(studyId);
        return report;
    }

    /**
     * Record MA candidate outcome when LangGraph finishes without a prior apply-and-verify row.
     * Retries are logged; terminal failures are written to CSV + failedCandidates after maxAttempts.
     * Never overwrites an existing completed CSV row (research integrity).
     */
    public Map<String, Object> recordCandidateOutcome(String studyId, Map<String, Object> body) throws IOException {
        RippleRefModels.StudyState state = requireStudy(studyId);
        String workspaceId = String.valueOf(body.get("workspaceId"));
        String filePath = String.valueOf(body.get("filePath"));
        String modelId = String.valueOf(body.get("modelId"));
        String variant = body.get("variant") != null ? String.valueOf(body.get("variant")) : MA_VARIANT;
        String pairKey = candidateKey(workspaceId, filePath, modelId, variant);
        String status = body.get("status") != null ? String.valueOf(body.get("status")) : "failed_generation";
        int maxAttempts = 3;
        if (body.get("maxAttempts") instanceof Number n) {
            maxAttempts = Math.max(1, n.intValue());
        }

        Path studyDir = studyDir(state);
        appendMaRefAttemptLog(studyDir, pairKey, status, body);

        RippleRefModels.CandidateResultRow existing = loadAllCandidateRows(studyDir).stream()
                .filter(r -> pairKey.equals(r.pairKey))
                .findFirst()
                .orElse(null);
        if (existing != null && "completed".equals(existing.status)) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("pairKey", pairKey);
            out.put("action", "skipped_already_completed");
            out.put("terminal", true);
            return out;
        }

        int attemptCount = countMaRefAttempts(studyDir, pairKey);
        boolean terminalSuccess = "completed".equals(status);
        boolean terminalFailure = status.startsWith("failed") && attemptCount >= maxAttempts;

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("pairKey", pairKey);
        out.put("attemptCount", attemptCount);
        out.put("maxAttempts", maxAttempts);

        if (!terminalSuccess && !terminalFailure) {
            out.put("terminal", false);
            out.put("action", "retry_pending");
            return out;
        }

        RippleRefModels.CandidateResultRow row = existing != null ? existing : new RippleRefModels.CandidateResultRow();
        row.studyId = studyId;
        row.projectId = workspaceId;
        row.filePath = filePath;
        row.modelId = modelId;
        row.variant = variant;
        row.pairKey = pairKey;
        row.status = terminalSuccess ? "completed" : status;
        if (body.get("error") != null) {
            row.error = String.valueOf(body.get("error"));
        }
        if (body.get("latencyMs") instanceof Number n) {
            row.latencyMs = n.longValue();
        }
        if (body.get("promptTokens") instanceof Number n) {
            row.promptTokens = n.intValue();
        }
        if (body.get("completionTokens") instanceof Number n) {
            row.completionTokens = n.intValue();
        }
        if (body.get("orchestration") != null) {
            row.orchestration = String.valueOf(body.get("orchestration"));
        } else if (state.config != null && "multi_agent".equalsIgnoreCase(state.config.orchestration)) {
            row.orchestration = "multi_agent";
        }
        if (body.get("graphVersion") != null) {
            row.graphVersion = String.valueOf(body.get("graphVersion"));
        }
        if (body.get("multiLlmAgentMode") != null) {
            row.multiLlmAgentMode = String.valueOf(body.get("multiLlmAgentMode"));
        }
        if (body.get("agentStepCount") instanceof Number n) {
            row.agentStepCount = n.intValue();
        }
        if (state.config != null && state.config.cohortId != null) {
            row.cohortId = state.config.cohortId;
        }
        row.completedAt = Instant.now().toString();

        appendCandidateCsv(studyDir, row);
        writeJson(studyDir.resolve("results_candidates.json"), loadAllCandidateRows(studyDir));

        synchronized (studyPersistLock(studyId)) {
            RippleRefModels.StudyState fresh = loadStudy(studyId).orElse(state);
            reconcileCandidateListsFromCsv(fresh);
            fresh.status = "running";
            persistState(fresh);
        }
        clearLiveCandidate(studyId);

        out.put("terminal", true);
        out.put("action", terminalSuccess ? "recorded_completed" : "recorded_failed");
        out.put("status", row.status);
        return out;
    }

    private void appendMaRefAttemptLog(Path studyDir, String pairKey, String status, Map<String, Object> body)
            throws IOException {
        Path logDir = studyDir.resolve("logs");
        Files.createDirectories(logDir);
        Path logFile = logDir.resolve("ma_ref_attempts.jsonl");
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("at", Instant.now().toString());
        entry.put("pairKey", pairKey);
        entry.put("status", status);
        if (body.get("error") != null) {
            entry.put("error", String.valueOf(body.get("error")));
        }
        if (body.get("latencyMs") instanceof Number n) {
            entry.put("latencyMs", n.longValue());
        }
        try (BufferedWriter w = Files.newBufferedWriter(logFile, StandardCharsets.UTF_8,
                java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND)) {
            w.write(MAPPER.writeValueAsString(entry));
            w.newLine();
        }
    }

    private int countMaRefAttempts(Path studyDir, String pairKey) throws IOException {
        Path logFile = studyDir.resolve("logs").resolve("ma_ref_attempts.jsonl");
        if (!Files.isRegularFile(logFile)) {
            return 0;
        }
        int count = 0;
        for (String line : Files.readAllLines(logFile, StandardCharsets.UTF_8)) {
            if (line.isBlank()) {
                continue;
            }
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> entry = MAPPER.readValue(line, Map.class);
                if (pairKey.equals(String.valueOf(entry.get("pairKey")))) {
                    count++;
                }
            } catch (Exception ignored) {
                /* skip malformed */
            }
        }
        return count;
    }

    public void setLiveCandidate(
            String studyId,
            String workspaceId,
            String filePath,
            String modelId,
            String variant,
            String phase) throws IOException {
        RippleRefModels.StudyState state = requireStudy(studyId);
        long now = Instant.now().toEpochMilli();
        RippleRefModels.LiveCandidateStatus live = new RippleRefModels.LiveCandidateStatus();
        live.workspaceId = workspaceId;
        live.filePath = filePath;
        live.fileName = fileNameOnly(filePath);
        live.modelId = modelId;
        live.modelDisplayName = modelDisplayName(state, modelId);
        live.variant = variant;
        live.phase = phase != null ? phase : "running";
        live.pairKey = candidateKey(workspaceId, filePath, modelId, variant);
        live.startedAt = now;
        live.updatedAt = now;
        RippleRefModels.RepositoryScanResult scan = state.repositoryScans.get(workspaceId);
        live.repositoryName = scan != null && scan.repositoryName != null ? scan.repositoryName : workspaceId;
        Path liveFile = studyDir(state).resolve("logs").resolve("live_candidate.json");
        Files.createDirectories(liveFile.getParent());
        Path prev = liveFile;
        if (Files.isRegularFile(prev)) {
            try {
                RippleRefModels.LiveCandidateStatus existing =
                        MAPPER.readValue(prev.toFile(), RippleRefModels.LiveCandidateStatus.class);
                if (existing != null
                        && live.pairKey.equals(existing.pairKey)
                        && existing.startedAt > 0) {
                    live.startedAt = existing.startedAt;
                }
            } catch (Exception ignored) {
                /* fresh */
            }
        }
        writeJson(liveFile, live);
    }

    public void clearLiveCandidate(String studyId) throws IOException {
        RippleRefModels.StudyState state = requireStudy(studyId);
        Files.deleteIfExists(studyDir(state).resolve("logs").resolve("live_candidate.json"));
    }

    public Map<String, Object> liveStatus(String studyId) throws IOException {
        RippleRefModels.StudyState state = requireStudy(studyId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("studyId", studyId);
        out.put("studyStatus", state.status);

        RippleRefModels.LiveCandidateStatus live = null;
        Path liveFile = studyDir(state).resolve("logs").resolve("live_candidate.json");
        if (Files.isRegularFile(liveFile)) {
            try {
                live = MAPPER.readValue(liveFile.toFile(), RippleRefModels.LiveCandidateStatus.class);
            } catch (Exception ignored) {
                live = null;
            }
        }
        out.put("liveCandidate", live);

        Map<String, Object> lastCompleted = null;
        String lastKey = null;
        if (!state.completedCandidates.isEmpty()) {
            lastKey = state.completedCandidates.get(state.completedCandidates.size() - 1);
        } else if (!state.failedCandidates.isEmpty()) {
            lastKey = state.failedCandidates.get(state.failedCandidates.size() - 1);
        }
        if (lastKey != null) {
            String[] parts = lastKey.split("\\|", 4);
            if (parts.length == 4) {
                lastCompleted = new LinkedHashMap<>();
                lastCompleted.put("workspaceId", parts[0]);
                lastCompleted.put("filePath", parts[1]);
                lastCompleted.put("fileName", fileNameOnly(parts[1]));
                lastCompleted.put("modelId", parts[2]);
                lastCompleted.put("modelDisplayName", modelDisplayName(state, parts[2]));
                lastCompleted.put("variant", parts[3]);
                lastCompleted.put("pairKey", lastKey);
                RippleRefModels.RepositoryScanResult scan = state.repositoryScans.get(parts[0]);
                lastCompleted.put(
                        "repositoryName",
                        scan != null && scan.repositoryName != null ? scan.repositoryName : parts[0]);
            }
        }
        out.put("lastCompleted", lastCompleted);

        int modelCount = state.config.models != null ? state.config.models.size() : 0;
        int variants = state.config != null && state.config.variantCount > 0 ? state.config.variantCount : 2;
        List<RippleRefModels.FileRunProgress> fileProgress = new ArrayList<>();
        for (Map.Entry<String, List<RippleRefModels.SelectedFile>> e : state.selectedByRepo.entrySet()) {
            String workspaceId = e.getKey();
            String prefix = workspaceId + "|";
            for (RippleRefModels.SelectedFile sf : e.getValue()) {
                String filePrefix = workspaceId + "|" + sf.filePath + "|";
                int done = (int) state.completedCandidates.stream().filter(k -> k.startsWith(filePrefix)).count();
                int fail = (int) state.failedCandidates.stream().filter(k -> k.startsWith(filePrefix)).count();
                RippleRefModels.FileRunProgress fp = new RippleRefModels.FileRunProgress();
                fp.filePath = sf.filePath;
                fp.fileName = fileNameOnly(sf.filePath);
                fp.samplingGroup = sf.samplingGroup;
                fp.planned = modelCount * variants;
                fp.completed = done;
                fp.failed = fail;
                fileProgress.add(fp);
            }
        }
        out.put("fileProgress", fileProgress);
        out.put("completeness", completeness(studyId));
        return out;
    }

    private String modelDisplayName(RippleRefModels.StudyState state, String modelId) {
        if (state.config.models != null) {
            for (RippleRefModels.StudyModelConfig m : state.config.models) {
                if (modelId.equals(m.modelId)) {
                    return m.displayName != null && !m.displayName.isBlank() ? m.displayName : modelId;
                }
            }
        }
        int slash = modelId.lastIndexOf('/');
        return slash >= 0 ? modelId.substring(slash + 1) : modelId;
    }

    private static String fileNameOnly(String filePath) {
        if (filePath == null || filePath.isBlank()) {
            return "";
        }
        int slash = filePath.lastIndexOf('/');
        return slash >= 0 ? filePath.substring(slash + 1) : filePath;
    }

    public RippleRefModels.CompletenessReport completeness(String studyId) throws IOException {
        RippleRefModels.StudyState state = requireStudy(studyId);
        int planned = plannedRuns(state);
        int completed = state.completedCandidates.size();
        int failed = state.failedCandidates.size();
        int failedParsing = (int) state.failedCandidates.stream().filter(k -> true).count();

        RippleRefModels.CompletenessReport report = new RippleRefModels.CompletenessReport();
        report.plannedRuns = planned;
        report.completedRuns = completed;
        report.failedGenerations = failed;
        report.failedParsing = failedParsing;
        report.missingArtifacts = Math.max(0, planned - completed - failed);
        report.completionPercentage = planned == 0 ? 0.0 : (completed * 100.0) / planned;
        if (report.missingArtifacts > 0) {
            report.warnings.add(report.missingArtifacts + " candidates not yet run");
        }

        writeJson(studyDir(state).resolve("completeness_report.json"), report);
        return report;
    }

    public Map<String, Object> candidateResults(String studyId) throws IOException {
        RippleRefModels.StudyState state = requireStudy(studyId);
        List<RippleRefModels.CandidateResultRow> rows = loadAllCandidateRows(studyDir(state));

        Map<String, Integer> byStatus = new LinkedHashMap<>();
        Map<String, Integer> byRisk = new LinkedHashMap<>();
        Map<String, Integer> byAdoption = new LinkedHashMap<>();
        Map<String, Integer> byVariant = new LinkedHashMap<>();
        int behavioralPass = 0;
        int behavioralFail = 0;
        int observedBreakage = 0;
        int pairedUnits = 0;
        int v2SaferThanV1 = 0;

        Map<String, RippleRefModels.CandidateResultRow> byPair = new LinkedHashMap<>();
        for (RippleRefModels.CandidateResultRow row : rows) {
            increment(byStatus, row.status != null ? row.status : "unknown");
            increment(byRisk, row.riskLevel != null ? row.riskLevel : "unknown");
            increment(byAdoption, row.adoptionClass != null ? row.adoptionClass : "unknown");
            increment(byVariant, row.variant != null ? row.variant : "unknown");
            if (row.behavioralCorrect) {
                behavioralPass++;
            } else if ("completed".equals(row.status)) {
                behavioralFail++;
            }
            if (row.observedBrokenCallerCount > 0) {
                observedBreakage++;
            }
            String pairBase = row.projectId + "|" + row.filePath + "|" + row.modelId;
            byPair.put(pairBase + "|" + row.variant, row);
        }

        for (String key : byPair.keySet()) {
            if (!key.endsWith("|V1")) {
                continue;
            }
            String base = key.substring(0, key.length() - 3);
            RippleRefModels.CandidateResultRow v1 = byPair.get(base + "|V1");
            RippleRefModels.CandidateResultRow v2 = byPair.get(base + "|V2");
            if (v1 == null || v2 == null) {
                continue;
            }
            pairedUnits++;
            int v1Score = riskScore(v1);
            int v2Score = riskScore(v2);
            if (v2Score < v1Score) {
                v2SaferThanV1++;
            }
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalRows", rows.size());
        summary.put("byStatus", byStatus);
        summary.put("byRisk", byRisk);
        summary.put("byAdoption", byAdoption);
        summary.put("byVariant", byVariant);
        summary.put("behavioralPass", behavioralPass);
        summary.put("behavioralFail", behavioralFail);
        summary.put("observedCallerBreakage", observedBreakage);
        summary.put("pairedUnits", pairedUnits);
        summary.put("v2SaferThanV1", v2SaferThanV1);
        summary.putAll(verificationCounts(rows));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("studyId", studyId);
        result.put("rows", rows);
        result.put("summary", summary);
        return result;
    }

    public Map<String, Object> verificationSummary(String studyId) throws IOException {
        RippleRefModels.StudyState state = requireStudy(studyId);
        List<RippleRefModels.CandidateResultRow> rows = loadAllCandidateRows(studyDir(state));
        Map<String, Object> out = new LinkedHashMap<>(verificationCounts(rows));
        out.put("studyId", studyId);
        return out;
    }

    private static Map<String, Object> verificationCounts(List<RippleRefModels.CandidateResultRow> rows) {
        int completed = 0;
        int l4Pass = 0;
        int l4Fail = 0;
        int l5Success = 0;
        int l5Fail = 0;
        int l5Skipped = 0;
        int l5Pending = 0;
        int l5Preserved = 0;
        int l5Regression = 0;
        int l5Inconclusive = 0;
        for (RippleRefModels.CandidateResultRow row : rows) {
            if (!"completed".equals(row.status)) {
                continue;
            }
            completed++;
            if (row.behavioralCorrect) {
                l4Pass++;
            } else {
                l4Fail++;
            }
            String tp = row.testProbeStatus != null ? row.testProbeStatus.trim() : "";
            String strategy = row.testProbeStrategy != null ? row.testProbeStrategy.trim() : "";
            if (strategy.isEmpty()) {
                l5Pending++;
                continue;
            }
            if ("none".equals(strategy)) {
                l5Skipped++;
                continue;
            }
            String before = row.testProbeBeforeStatus != null ? row.testProbeBeforeStatus.trim() : "";
            if (row.testRegression) {
                l5Regression++;
                l5Fail++;
                continue;
            }
            if ("success".equals(before) && "success".equals(tp) && row.testsFailed <= 0) {
                l5Preserved++;
                l5Success++;
                continue;
            }
            if (!before.isEmpty() && !"success".equals(before) && !"skipped".equals(before)) {
                l5Inconclusive++;
                continue;
            }
            if ("skipped".equals(tp)) {
                l5Skipped++;
            } else if ("success".equals(tp) && row.testsFailed <= 0 && before.isEmpty()) {
                l5Success++;
            } else if (!tp.isEmpty()) {
                l5Fail++;
            }
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("completedCandidates", completed);
        m.put("l4Pass", l4Pass);
        m.put("l4Fail", l4Fail);
        m.put("l5Success", l5Success);
        m.put("l5Fail", l5Fail);
        m.put("l5Skipped", l5Skipped);
        m.put("l5Pending", l5Pending);
        m.put("l5Preserved", l5Preserved);
        m.put("l5Regression", l5Regression);
        m.put("l5Inconclusive", l5Inconclusive);
        return m;
    }

    private static void increment(Map<String, Integer> map, String key) {
        map.put(key, map.getOrDefault(key, 0) + 1);
    }

    private static int riskScore(RippleRefModels.CandidateResultRow row) {
        if (row == null) {
            return 99;
        }
        int score = 0;
        if ("High".equals(row.riskLevel)) {
            score += 3;
        } else if ("Medium".equals(row.riskLevel)) {
            score += 2;
        } else if ("Low".equals(row.riskLevel)) {
            score += 1;
        }
        score += row.observedBrokenCallerCount * 2;
        if (!row.behavioralCorrect && "completed".equals(row.status)) {
            score += 2;
        }
        if ("failed".equals(row.testProbeStatus) || row.testsFailed > 0) {
            score += 1;
        }
        return score;
    }

    public Path studyDirectory(String studyId) throws IOException {
        return studyDir(requireStudy(studyId));
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> getPipelineStatus(String studyId) throws IOException {
        Map<String, Object> status = loadPipelineStatusRaw(studyId);
        return enrichPipelineStatus(status);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> loadPipelineStatusRaw(String studyId) throws IOException {
        RippleRefModels.StudyState state = requireStudy(studyId);
        Path file = studyDir(state).resolve("pipeline_status.json");
        if (!Files.isRegularFile(file)) {
            return defaultPipelineStatus(studyId);
        }
        try {
            return MAPPER.readValue(file.toFile(), Map.class);
        } catch (Exception e) {
            return defaultPipelineStatus(studyId);
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> enrichPipelineStatus(Map<String, Object> status) {
        Map<String, Object> out = new LinkedHashMap<>(status);
        String wrapperPid = readWrapperPid();
        if (!wrapperPid.isBlank()) {
            out.put("wrapperPid", wrapperPid);
            out.put("wrapperAlive", isProcessAlive(wrapperPid));
        }
        Object sup = out.get("supervisorPid");
        boolean supervisorAlive = sup != null && isProcessAlive(String.valueOf(sup));
        out.put("supervisorAlive", supervisorAlive);
        String l5Pid = readL5PipelinePid();
        if (!l5Pid.isBlank()) {
            out.put("l5PipelinePid", l5Pid);
            out.put("l5PipelineAlive", isProcessAlive(l5Pid));
        } else {
            out.put("l5PipelineAlive", false);
        }
        String state = String.valueOf(out.getOrDefault("state", "idle"));
        boolean l5Alive = Boolean.TRUE.equals(out.get("l5PipelineAlive"));
        if (l5Alive && ("idle".equals(state) || "stopped".equals(state))) {
            out.put("state", "running");
        }
        if (("running".equals(state) || "healing".equals(state))
                && !wrapperPid.isBlank()
                && !isProcessAlive(wrapperPid)
                && !supervisorAlive
                && !l5Alive) {
            out.put("state", "stopped");
            out.put("staleRunning", true);
        }
        return out;
    }

    private String readL5PipelinePid() {
        if (repoRoot == null || repoRoot.isBlank()) {
            return "";
        }
        Path pidFile = Path.of(repoRoot).resolve(".run/ripple-ref-l5-pipeline.pid");
        try {
            if (Files.isRegularFile(pidFile)) {
                return Files.readString(pidFile, StandardCharsets.UTF_8).trim();
            }
        } catch (Exception ignored) {
            /* optional */
        }
        return "";
    }

    private String readWrapperPid() {
        if (repoRoot == null || repoRoot.isBlank()) {
            return "";
        }
        Path pidFile = Path.of(repoRoot).resolve(".run/ma-ref-master-overnight.pid");
        try {
            if (Files.isRegularFile(pidFile)) {
                return Files.readString(pidFile, StandardCharsets.UTF_8).trim();
            }
        } catch (Exception ignored) {
            /* optional */
        }
        return "";
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> updatePipelineStatus(String studyId, Map<String, Object> patch) throws IOException {
        RippleRefModels.StudyState state = requireStudy(studyId);
        Map<String, Object> current = new LinkedHashMap<>(loadPipelineStatusRaw(studyId));
        if (patch.get("issue") instanceof Map<?, ?> issue) {
            appendPipelineEvent(current, "issues", new LinkedHashMap<>((Map<String, Object>) issue));
            patch = new LinkedHashMap<>(patch);
            patch.remove("issue");
        }
        if (patch.get("heal") instanceof Map<?, ?> heal) {
            appendPipelineEvent(current, "healHistory", new LinkedHashMap<>((Map<String, Object>) heal));
            patch = new LinkedHashMap<>(patch);
            patch.remove("heal");
        }
        current.putAll(patch);
        current.put("studyId", studyId);
        current.put("updatedAt", Instant.now().toString());
        writeJson(studyDir(state).resolve("pipeline_status.json"), current);
        return current;
    }

    public Map<String, Object> startMaPipelineDaemon(String studyId) throws IOException {
        if (repoRoot == null || repoRoot.isBlank()) {
            throw new IllegalStateException("refactai.repo-root not configured (set REFACTAI_REPO_ROOT or restart via start_daemon.sh)");
        }
        Path script = Path.of(repoRoot).resolve("scripts/start-ma-ref-overnight-daemon.sh");
        if (!Files.isRegularFile(script)) {
            throw new IllegalStateException("Daemon script not found: " + script);
        }
        Map<String, Object> status = loadPipelineStatusRaw(studyId);
        if ("running".equals(status.get("state")) || "healing".equals(status.get("state"))) {
            Object pid = status.get("supervisorPid");
            if (pid != null && isProcessAlive(String.valueOf(pid))) {
                return Map.of("status", "already_running", "supervisorPid", pid);
            }
        }
        try {
            new ProcessBuilder("bash", script.toString())
                    .directory(Path.of(repoRoot).toFile())
                    .redirectErrorStream(true)
                    .start();
            Thread.sleep(2000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Interrupted starting pipeline", e);
        } catch (IOException e) {
            throw new IOException("Failed to start pipeline daemon: " + e.getMessage(), e);
        }
        Path pidFile = Path.of(repoRoot).resolve(".run/ma-ref-master-overnight.pid");
        String pid = Files.isRegularFile(pidFile) ? Files.readString(pidFile, StandardCharsets.UTF_8).trim() : "";
        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("state", "running");
        patch.put("supervisorPid", pid);
        patch.put("startedAt", Instant.now().toString());
        patch.put("heal", Map.of(
                "at", Instant.now().toString(),
                "action", "start_daemon",
                "result", "ok",
                "detail", "GUI/supervisor start requested"));
        return updatePipelineStatus(studyId, patch);
    }

    public Map<String, Object> stopMaPipelineDaemon(String studyId) throws IOException {
        if (repoRoot == null || repoRoot.isBlank()) {
            throw new IllegalStateException("refactai.repo-root not configured");
        }
        Path pidFile = Path.of(repoRoot).resolve(".run/ma-ref-master-overnight.pid");
        String pid = Files.isRegularFile(pidFile) ? Files.readString(pidFile, StandardCharsets.UTF_8).trim() : "";
        if (!pid.isBlank()) {
            try {
                new ProcessBuilder("kill", pid).start().waitFor();
            } catch (Exception e) {
                logger.warn("Stop pipeline kill {}: {}", pid, e.toString());
            }
            Files.deleteIfExists(pidFile);
        }
        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("state", "stopped");
        patch.put("supervisorPid", "");
        patch.put("heal", Map.of(
                "at", Instant.now().toString(),
                "action", "stop_daemon",
                "result", "ok"));
        return updatePipelineStatus(studyId, patch);
    }

    public Map<String, Object> startL5PipelineDaemon(String studyId) throws IOException {
        if (repoRoot == null || repoRoot.isBlank()) {
            throw new IllegalStateException("refactai.repo-root not configured (set REFACTAI_REPO_ROOT or restart via start_daemon.sh)");
        }
        Path script = Path.of(repoRoot).resolve("scripts/run-ripple-ref-l5-pipeline-until-complete.sh");
        if (!Files.isRegularFile(script)) {
            throw new IllegalStateException("L5 pipeline script not found: " + script);
        }
        String l5Pid = readL5PipelinePid();
        if (!l5Pid.isBlank() && isProcessAlive(l5Pid)) {
            return Map.of("status", "already_running", "l5PipelinePid", l5Pid);
        }
        try {
            new ProcessBuilder("bash", script.toString())
                    .directory(Path.of(repoRoot).toFile())
                    .redirectErrorStream(true)
                    .start();
            Thread.sleep(2000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Interrupted starting L5 pipeline", e);
        } catch (IOException e) {
            throw new IOException("Failed to start L5 pipeline daemon: " + e.getMessage(), e);
        }
        l5Pid = readL5PipelinePid();
        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("state", "running");
        patch.put("phase", "backfill_ma");
        patch.put("l5PipelinePid", l5Pid);
        patch.put("startedAt", Instant.now().toString());
        patch.put("backfillDetail", "L5 v2 paired behavioral tests (MA → B0)");
        patch.put("heal", Map.of(
                "at", Instant.now().toString(),
                "action", "start_l5_pipeline",
                "result", "ok",
                "detail", "Ripple REF L5 pipeline start requested"));
        return updatePipelineStatus(studyId, patch);
    }

    public Map<String, Object> stopL5PipelineDaemon(String studyId) throws IOException {
        if (repoRoot == null || repoRoot.isBlank()) {
            throw new IllegalStateException("refactai.repo-root not configured");
        }
        String l5Pid = readL5PipelinePid();
        if (!l5Pid.isBlank()) {
            try {
                new ProcessBuilder("kill", l5Pid).start().waitFor();
            } catch (Exception e) {
                logger.warn("Stop L5 pipeline kill {}: {}", l5Pid, e.toString());
            }
            Files.deleteIfExists(Path.of(repoRoot).resolve(".run/ripple-ref-l5-pipeline.pid"));
            Files.deleteIfExists(Path.of(repoRoot).resolve(".run/ripple-ref-l5-pipeline-until-complete.lockdir"));
        }
        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("state", "stopped");
        patch.put("l5PipelinePid", "");
        patch.put("heal", Map.of(
                "at", Instant.now().toString(),
                "action", "stop_l5_pipeline",
                "result", "ok"));
        return updatePipelineStatus(studyId, patch);
    }

    public Map<String, Object> triggerMaPipelineHeal(String studyId) throws IOException {
        clearLiveCandidate(studyId);
        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("state", "healing");
        patch.put("heal", Map.of(
                "at", Instant.now().toString(),
                "action", "manual_heal_clear_live",
                "result", "ok"));
        return updatePipelineStatus(studyId, patch);
    }

    private Map<String, Object> defaultPipelineStatus(String studyId) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("studyId", studyId);
        m.put("state", "idle");
        m.put("phase", "idle");
        m.put("issues", new ArrayList<>());
        m.put("healHistory", new ArrayList<>());
        m.put("updatedAt", Instant.now().toString());
        return m;
    }

    @SuppressWarnings("unchecked")
    private void appendPipelineEvent(Map<String, Object> status, String key, Map<String, Object> event) {
        List<Map<String, Object>> list = new ArrayList<>();
        Object raw = status.get(key);
        if (raw instanceof List<?> l) {
            for (Object o : l) {
                if (o instanceof Map<?, ?> m) {
                    list.add(new LinkedHashMap<>((Map<String, Object>) m));
                }
            }
        }
        list.add(0, event);
        if (list.size() > 40) {
            list = new ArrayList<>(list.subList(0, 40));
        }
        status.put(key, list);
    }

    private boolean isProcessAlive(String pid) {
        if (pid == null || pid.isBlank()) {
            return false;
        }
        try {
            Process p = new ProcessBuilder("kill", "-0", pid).start();
            return p.waitFor() == 0;
        } catch (Exception e) {
            return false;
        }
    }

    // --- helpers ---

    private RippleRefModels.StudyState requireStudy(String studyId) throws IOException {
        Optional<RippleRefModels.StudyState> loaded = loadStudy(studyId);
        if (loaded.isPresent()) {
            RippleRefModels.StudyState state = loaded.get();
            if (reconcileCandidateListsFromCsv(state)) {
                persistState(state);
            }
            return state;
        }
        if (MA_REF_MASTER_ID.equals(studyId)) {
            try {
                return ensureMaRefMasterStudy();
            } catch (Exception e) {
                throw new IOException("Failed to bootstrap ma_ref_master: " + e.getMessage(), e);
            }
        }
        throw new IllegalArgumentException("Study not found: " + studyId);
    }

    private ProjectContext requireProject(String workspaceId) {
        ProjectContext ctx = projectService.getProject(workspaceId);
        if (ctx == null) {
            throw new IllegalArgumentException("Workspace not found: " + workspaceId);
        }
        return ctx;
    }

    private Path studyDir(RippleRefModels.StudyState state) {
        return Path.of(state.studyDir);
    }

    private void persistState(RippleRefModels.StudyState state) throws IOException {
        writeJson(studyDir(state).resolve("study_state.json"), state);
    }

    private Object studyPersistLock(String studyId) {
        return studyPersistLocks.computeIfAbsent(studyId, k -> new Object());
    }

    /**
     * CSV is the durable source of truth for finished candidates; study_state.json can lag
     * when concurrent runs overwrite each other's completedCandidates lists.
     */
    boolean reconcileCandidateListsFromCsv(RippleRefModels.StudyState state) throws IOException {
        List<RippleRefModels.CandidateResultRow> rows = loadAllCandidateRows(studyDir(state));
        if (rows.isEmpty()) {
            return false;
        }
        List<String> completed = new ArrayList<>();
        List<String> failed = new ArrayList<>();
        for (RippleRefModels.CandidateResultRow row : rows) {
            if (row.pairKey == null || row.pairKey.isBlank()) {
                continue;
            }
            String status = row.status != null ? row.status : "";
            if ("completed".equals(status)) {
                completed.add(row.pairKey);
            } else if (status.startsWith("failed")) {
                failed.add(row.pairKey);
            }
        }
        if (candidateListsMatch(state.completedCandidates, state.failedCandidates, completed, failed)) {
            return false;
        }
        int prevDone = state.completedCandidates.size();
        int prevFailed = state.failedCandidates.size();
        state.completedCandidates = completed;
        state.failedCandidates = failed;
        logger.info(
                "Reconciled study {} candidate lists from CSV: completed {} -> {}, failed {} -> {}",
                state.config != null ? state.config.studyId : "?",
                prevDone,
                completed.size(),
                prevFailed,
                failed.size());
        return true;
    }

    private static boolean candidateListsMatch(
            List<String> completed,
            List<String> failed,
            List<String> csvCompleted,
            List<String> csvFailed) {
        return completed.size() == csvCompleted.size()
                && failed.size() == csvFailed.size()
                && new HashSet<>(completed).equals(new HashSet<>(csvCompleted))
                && new HashSet<>(failed).equals(new HashSet<>(csvFailed));
    }

    private void createStudyLayout(Path studyDir) throws IOException {
        for (String sub : List.of(
                "repository_profiles", "dependency_contexts", "prompts", "model_responses",
                "generated_candidates", "original_files", "diffs", "before_profiles", "after_profiles",
                "ripple_reports", "behavioral_reports", "test_reports", "isolated_workspaces", "logs",
                "agent_traces", "planner_json", "verifier_json", "cohort")) {
            Files.createDirectories(studyDir.resolve(sub));
        }
    }

    private void applyScaleDefaults(RippleRefModels.StudyConfig config) {
        if ("pilot".equalsIgnoreCase(config.scale)) {
            config.repositoryCount = 3;
            config.filesPerRepository = 5;
        } else if ("full".equalsIgnoreCase(config.scale) || "apsec".equalsIgnoreCase(config.scale)) {
            config.repositoryCount = 15;
            config.filesPerRepository = 10;
        } else if ("extended".equalsIgnoreCase(config.scale)) {
            config.repositoryCount = 15;
            config.filesPerRepository = 15;
        }
        if (config.modelCount <= 0) {
            config.modelCount = config.models.size();
        }
        if ("multi_agent".equalsIgnoreCase(config.orchestration)) {
            config.variantCount = 1;
            if (config.label == null || config.label.isBlank() || "ripple-ref".equals(config.label)) {
                config.label = "ma-ref";
            }
        } else if (config.variantCount <= 0) {
            config.variantCount = 2;
        }
    }

    private List<RippleRefModels.StudyModelConfig> defaultModels() {
        List<RippleRefModels.StudyModelConfig> models = new ArrayList<>();
        models.add(model("google", "gemini", "Gemini 3.1 Pro", "google/gemini-3.1-pro-preview", "openrouter", 2_000_000));
        models.add(model("openai", "gpt", "GPT-5.5", "openai/gpt-5.5", "openrouter", 1_000_000));
        models.add(model("anthropic", "claude", "Claude Opus 4.8", "anthropic/claude-opus-4.8", "openrouter", 1_000_000));
        models.add(model("deepseek", "deepseek", "DeepSeek V4 Pro", "deepseek/deepseek-v4-pro", "openrouter", 1_000_000));
        models.add(model("qwen", "qwen", "Qwen 3.6 Plus", "qwen/qwen3.6-plus", "openrouter", 1_000_000));
        return models;
    }

    private RippleRefModels.StudyModelConfig model(String provider, String family, String display,
                                                   String modelId, String route, long ctx) {
        RippleRefModels.StudyModelConfig m = new RippleRefModels.StudyModelConfig();
        m.provider = provider;
        m.family = family;
        m.displayName = display;
        m.modelId = modelId;
        m.apiRoute = route;
        m.contextWindow = ctx;
        return m;
    }

    private Map<String, String> loadProductionContents(ProjectContext ctx) throws IOException {
        Map<String, String> map = new LinkedHashMap<>();
        for (Path file : ctx.sourceFiles()) {
            String rel = WorkspacePathFilters.toRelativePath(ctx.root(), file);
            if (RippleRefProductionClassifier.classify(rel) == RippleRefProductionClassifier.Classification.PRODUCTION) {
                map.put(rel, RippleRefTextIO.readTextLenient(file));
            }
        }
        return map;
    }

    private Map<String, Integer> smellCountsFor(ProjectContext ctx, java.util.Set<String> paths) throws IOException {
        Map<String, Integer> counts = new LinkedHashMap<>();
        boolean largeRepoFastPath = paths.size() > 400;
        for (String rel : paths) {
            Path file = ctx.root().resolve(rel);
            counts.put(rel, smellCount(ctx, rel, file, largeRepoFastPath));
        }
        return counts;
    }

    private int smellCount(ProjectContext ctx, String rel, Path file) throws IOException {
        return smellCount(ctx, rel, file, false);
    }

    private int smellCount(ProjectContext ctx, String rel, Path file, boolean largeRepoFastPath) throws IOException {
        if (!Files.isRegularFile(file)) {
            return 0;
        }
        long lm = Files.getLastModifiedTime(file).toMillis();
        Optional<Integer> cached = pmdPersistence.cachedSmellCount(
                ctx.root(), rel, lm, ComprehensiveCodeSmellDetector.SMELL_ENGINE_VERSION);
        if (cached.isPresent()) {
            return cached.get();
        }
        if (largeRepoFastPath) {
            // Avoid full PMD on thousands of uncached files during stratified selection (e.g. Guava).
            return 1;
        }
        return smellDetector.detectAllCodeSmells(file, true).size();
    }

    private int plannedRuns(RippleRefModels.StudyState state) {
        return plannedRuns(state, null);
    }

    private int plannedRuns(RippleRefModels.StudyState state, String workspaceIdFilter) {
        int files;
        if (workspaceIdFilter != null && !workspaceIdFilter.isBlank()) {
            files = state.selectedByRepo.getOrDefault(workspaceIdFilter, List.of()).size();
        } else {
            files = state.selectedByRepo.values().stream().mapToInt(List::size).sum();
        }
        int models = state.config.models != null ? state.config.models.size() : 0;
        int variants = state.config != null && state.config.variantCount > 0 ? state.config.variantCount : 2;
        return files * models * variants;
    }

    /** Fixed variant label for multi-agent study candidates. */
    public static final String MA_VARIANT = "MA";
    public static final String MA_REF_MASTER_ID = "ma_ref_master";
    public static final String RIPPLE_REF_MASTER_ID = "ripple_ref_master";

    /**
     * Create ma_ref_master and import cohort from ripple_ref_master when missing (first GUI access).
     */
    public RippleRefModels.StudyState ensureMaRefMasterStudy() throws Exception {
        Optional<RippleRefModels.StudyState> existing = loadStudy(MA_REF_MASTER_ID);
        if (existing.isPresent()) {
            return existing.get();
        }
        if (loadStudy(RIPPLE_REF_MASTER_ID).isEmpty()) {
            throw new IllegalStateException(
                    "Baseline study ripple_ref_master not found — run B0 setup before P-MA");
        }
        RippleRefModels.StudyConfig config = new RippleRefModels.StudyConfig();
        config.studyId = MA_REF_MASTER_ID;
        config.label = "ma-ref";
        config.orchestration = "multi_agent";
        config.scale = "full";
        config.variantCount = 1;
        config.cohortSourceStudyId = RIPPLE_REF_MASTER_ID;
        config.cohortId = RIPPLE_REF_MASTER_ID + "_v1";
        config.randomSeed = 42;
        config.minSmellCount = 1;
        config.filesPerRepository = 10;
        config.models = defaultModels();
        loadStudy(RIPPLE_REF_MASTER_ID).ifPresent(src -> {
            if (src.selectedByRepo != null && !src.selectedByRepo.isEmpty()) {
                config.workspaceIds = new ArrayList<>(src.selectedByRepo.keySet());
            }
        });
        createStudy(config);
        return importCohortFromStudy(MA_REF_MASTER_ID, RIPPLE_REF_MASTER_ID);
    }

    /**
     * Import locked file cohort from a completed baseline study (integrity: no re-sampling).
     */
    public RippleRefModels.StudyState importCohortFromStudy(String studyId, String sourceStudyId) throws Exception {
        RippleRefModels.StudyState state = requireStudy(studyId);
        RippleRefModels.StudyState source = requireStudy(sourceStudyId);

        if (source.selectedByRepo == null || source.selectedByRepo.isEmpty()) {
            throw new IllegalStateException("Source study has no selected files: " + sourceStudyId);
        }

        int fileCount = source.selectedByRepo.values().stream().mapToInt(List::size).sum();
        if (fileCount != 150) {
            throw new IllegalStateException(
                    "Cohort integrity: expected 150 files from " + sourceStudyId + " but found " + fileCount);
        }

        state.selectedByRepo = deepCopySelectedByRepo(source.selectedByRepo);
        state.eligibleByRepo = source.eligibleByRepo != null
                ? new LinkedHashMap<>(source.eligibleByRepo) : new LinkedHashMap<>();
        state.repositoryScans = source.repositoryScans != null
                ? new LinkedHashMap<>(source.repositoryScans) : new LinkedHashMap<>();
        state.dependencyScans = source.dependencyScans != null
                ? new LinkedHashMap<>(source.dependencyScans) : new LinkedHashMap<>();

        if (state.config != null) {
            state.config.cohortSourceStudyId = sourceStudyId;
            if (state.config.cohortId == null || state.config.cohortId.isBlank()) {
                state.config.cohortId = sourceStudyId + "_v1";
            }
            state.config.workspaceIds = new ArrayList<>(state.selectedByRepo.keySet());
            state.config.repositoryCount = state.selectedByRepo.size();
            state.config.filesPerRepository = 10;
        }

        Path cohortDir = studyDir(state).resolve("cohort");
        Files.createDirectories(cohortDir);
        Map<String, Object> manifest = new LinkedHashMap<>();
        manifest.put("cohortId", state.config != null ? state.config.cohortId : sourceStudyId + "_v1");
        manifest.put("sourceStudyId", sourceStudyId);
        manifest.put("importedAt", Instant.now().toString());
        manifest.put("fileCount", fileCount);
        manifest.put("selectedByRepo", state.selectedByRepo);
        writeJson(cohortDir.resolve("cohort_manifest.json"), manifest);

        state.status = "ready";
        persistState(state);
        logger.info("Imported cohort {} files from {} into study {}", fileCount, sourceStudyId, studyId);
        return state;
    }

    /**
     * Import locked 150-file cohort from exported manifest (e.g. .run/shared_cohort/cohort_manifest.json).
     */
    public RippleRefModels.StudyState importCohortFromManifest(String studyId, Map<String, Object> manifest)
            throws Exception {
        RippleRefModels.StudyState state = requireStudy(studyId);
        Object raw = manifest.get("selectedByRepo");
        if (raw == null) {
            throw new IllegalStateException("Manifest missing selectedByRepo");
        }
        Map<String, List<RippleRefModels.SelectedFile>> selectedByRepo = MAPPER.convertValue(
                raw, new TypeReference<Map<String, List<RippleRefModels.SelectedFile>>>() {});

        int fileCount = selectedByRepo.values().stream().mapToInt(List::size).sum();
        if (fileCount != 150) {
            throw new IllegalStateException(
                    "Cohort integrity: expected 150 files in manifest but found " + fileCount);
        }

        state.selectedByRepo = deepCopySelectedByRepo(selectedByRepo);
        if (state.config != null) {
            Object cohortId = manifest.get("cohortId");
            if (cohortId != null) {
                state.config.cohortId = String.valueOf(cohortId);
            }
            Object sourceStudyId = manifest.get("sourceStudyId");
            if (sourceStudyId != null) {
                state.config.cohortSourceStudyId = String.valueOf(sourceStudyId);
            }
            state.config.workspaceIds = new ArrayList<>(state.selectedByRepo.keySet());
            state.config.repositoryCount = state.selectedByRepo.size();
            state.config.filesPerRepository = 10;
        }

        Path cohortDir = studyDir(state).resolve("cohort");
        Files.createDirectories(cohortDir);
        Map<String, Object> outManifest = new LinkedHashMap<>(manifest);
        outManifest.put("importedAt", Instant.now().toString());
        outManifest.put("fileCount", fileCount);
        writeJson(cohortDir.resolve("cohort_manifest.json"), outManifest);

        state.status = "ready";
        persistState(state);
        logger.info("Imported cohort {} files from manifest into study {}", fileCount, studyId);
        return state;
    }

    public Map<String, Object> integrityPreflight(String studyId) throws Exception {
        RippleRefModels.StudyState state = requireStudy(studyId);
        Map<String, Object> out = new LinkedHashMap<>();
        boolean multiAgent = state.config != null && "multi_agent".equalsIgnoreCase(state.config.orchestration);
        out.put("studyId", studyId);
        out.put("orchestration", state.config != null ? state.config.orchestration : "single_pass");
        out.put("multiAgent", multiAgent);

        int files = state.selectedByRepo.values().stream().mapToInt(List::size).sum();
        out.put("cohortFileCount", files);
        out.put("cohortLocked", files == 150);

        if (multiAgent) {
            out.put("expectedVariant", MA_VARIANT);
            out.put("expectedPlannedRuns", plannedRuns(state));
            out.put("cohortSourceStudyId", state.config.cohortSourceStudyId);
            out.put("cohortId", state.config.cohortId);

            List<String> issues = new ArrayList<>();
            if (files != 150) {
                issues.add("cohort_file_count_not_150");
            }
            if (state.config.cohortSourceStudyId == null || state.config.cohortSourceStudyId.isBlank()) {
                issues.add("missing_cohort_source_study");
            }
            if (state.config.variantCount != 1) {
                issues.add("variant_count_must_be_1_for_multi_agent");
            }
            Path manifest = studyDir(state).resolve("cohort").resolve("cohort_manifest.json");
            if (!Files.isRegularFile(manifest)) {
                issues.add("missing_cohort_manifest");
            }
            out.put("integrityOk", issues.isEmpty());
            out.put("integrityIssues", issues);
        } else {
            out.put("integrityOk", true);
            out.put("integrityIssues", List.of());
        }
        return out;
    }

    public void saveAgentSteps(
            String studyId,
            String workspaceId,
            String filePath,
            String modelId,
            String variant,
            Object stepsPayload) throws IOException {
        RippleRefModels.StudyState state = requireStudy(studyId);
        String base = safeArtifactName(workspaceId, filePath, modelId, variant);
        writeJson(studyDir(state).resolve("agent_traces").resolve(base + ".json"), stepsPayload);
    }

    /**
     * Patch MA candidate CSV row after full LangGraph completes (ripple verify runs mid-graph).
     */
    public void patchCandidateMaMeta(String studyId, Map<String, Object> body) throws IOException {
        RippleRefModels.StudyState state = requireStudy(studyId);
        String workspaceId = String.valueOf(body.get("workspaceId"));
        String filePath = String.valueOf(body.get("filePath"));
        String modelId = String.valueOf(body.get("modelId"));
        String variant = body.get("variant") != null ? String.valueOf(body.get("variant")) : MA_VARIANT;
        String pairKey = candidateKey(workspaceId, filePath, modelId, variant);

        List<RippleRefModels.CandidateResultRow> rows = loadAllCandidateRows(studyDir(state));
        RippleRefModels.CandidateResultRow row = rows.stream()
                .filter(r -> pairKey.equals(r.pairKey))
                .findFirst()
                .orElse(null);
        if (row == null) {
            throw new IllegalArgumentException("No candidate row for pairKey: " + pairKey);
        }

        if (body.get("agentStepCount") instanceof Number n) {
            row.agentStepCount = n.intValue();
        }
        if (body.get("llmPlanStatus") != null) {
            row.llmPlanStatus = String.valueOf(body.get("llmPlanStatus"));
        }
        if (body.get("llmVerifyApproved") instanceof Boolean b) {
            row.llmVerifyApproved = b;
        } else if (body.get("llmVerifyApproved") != null) {
            row.llmVerifyApproved = Boolean.parseBoolean(String.valueOf(body.get("llmVerifyApproved")));
        }
        if (body.get("latencyMs") instanceof Number n) {
            row.latencyMs = n.longValue();
        }
        if (body.get("promptTokens") instanceof Number n) {
            row.promptTokens = n.intValue();
        }
        if (body.get("completionTokens") instanceof Number n) {
            row.completionTokens = n.intValue();
        }
        if (body.get("multiLlmAgentMode") != null) {
            row.multiLlmAgentMode = String.valueOf(body.get("multiLlmAgentMode"));
        }

        appendCandidateCsv(studyDir(state), row);
        writeJson(studyDir(state).resolve("results_candidates.json"), loadAllCandidateRows(studyDir(state)));
    }

    public Optional<Object> getAgentSteps(
            String studyId,
            String workspaceId,
            String filePath,
            String modelId,
            String variant) throws IOException {
        RippleRefModels.StudyState state = requireStudy(studyId);
        String base = safeArtifactName(workspaceId, filePath, modelId, variant);
        Path file = studyDir(state).resolve("agent_traces").resolve(base + ".json");
        if (!Files.isRegularFile(file)) {
            return Optional.empty();
        }
        return Optional.of(MAPPER.readValue(file.toFile(), Object.class));
    }

    private Map<String, List<RippleRefModels.SelectedFile>> deepCopySelectedByRepo(
            Map<String, List<RippleRefModels.SelectedFile>> source) {
        Map<String, List<RippleRefModels.SelectedFile>> copy = new LinkedHashMap<>();
        for (Map.Entry<String, List<RippleRefModels.SelectedFile>> e : source.entrySet()) {
            copy.put(e.getKey(), new ArrayList<>(e.getValue()));
        }
        return copy;
    }

    private List<String> resolveWorkspaceIdsForSelection(RippleRefModels.StudyState state, String workspaceIdFilter) {
        if (workspaceIdFilter != null && !workspaceIdFilter.isBlank()) {
            if (!state.config.workspaceIds.contains(workspaceIdFilter)) {
                return List.of();
            }
            return List.of(workspaceIdFilter);
        }
        List<String> ids = new ArrayList<>();
        for (String ws : state.config.workspaceIds) {
            if (state.repositoryScans.containsKey(ws)) {
                ids.add(ws);
            }
        }
        return ids;
    }

    private List<String> resolveWorkspaceIdsForPreflight(RippleRefModels.StudyState state, String workspaceIdFilter) {
        if (workspaceIdFilter != null && !workspaceIdFilter.isBlank()) {
            if (!state.config.workspaceIds.contains(workspaceIdFilter)) {
                return List.of();
            }
            return List.of(workspaceIdFilter);
        }
        if (!state.selectedByRepo.isEmpty()) {
            return new ArrayList<>(state.selectedByRepo.keySet());
        }
        return new ArrayList<>(state.config.workspaceIds);
    }

    private String resolveCommitHash(Path projectDir) {
        try {
            Process p = new ProcessBuilder("git", "-C", projectDir.toString(), "rev-parse", "HEAD")
                    .redirectErrorStream(true)
                    .start();
            String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
            if (p.waitFor() == 0 && !out.isBlank()) {
                return out;
            }
        } catch (Exception e) {
            logger.debug("No git commit for {}: {}", projectDir, e.toString());
        }
        return "unknown";
    }

    private void mergeExistingCandidateMetadata(Path studyDir, RippleRefModels.CandidateResultRow row) {
        if (row.pairKey == null || row.pairKey.isBlank()) {
            return;
        }
        for (RippleRefModels.CandidateResultRow existing : loadAllCandidateRows(studyDir)) {
            if (!row.pairKey.equals(existing.pairKey)) {
                continue;
            }
            if (existing.latencyMs > 0) {
                row.latencyMs = existing.latencyMs;
            }
            if (existing.promptTokens > 0) {
                row.promptTokens = existing.promptTokens;
            }
            if (existing.completionTokens > 0) {
                row.completionTokens = existing.completionTokens;
            }
            if (existing.orchestration != null && !existing.orchestration.isBlank()) {
                row.orchestration = existing.orchestration;
            }
            if (existing.graphVersion != null && !existing.graphVersion.isBlank()) {
                row.graphVersion = existing.graphVersion;
            }
            if (existing.multiLlmAgentMode != null && !existing.multiLlmAgentMode.isBlank()) {
                row.multiLlmAgentMode = existing.multiLlmAgentMode;
            }
            if (existing.agentStepCount > 0) {
                row.agentStepCount = existing.agentStepCount;
            }
            if (existing.llmPlanStatus != null && !existing.llmPlanStatus.isBlank()) {
                row.llmPlanStatus = existing.llmPlanStatus;
            }
            row.llmVerifyApproved = existing.llmVerifyApproved;
            row.staticVerifyAccept = existing.staticVerifyAccept;
            if (existing.cohortId != null && !existing.cohortId.isBlank()) {
                row.cohortId = existing.cohortId;
            }
            if (existing.error != null && !existing.error.isBlank() && row.error == null) {
                row.error = existing.error;
            }
            return;
        }
    }

    private static String safeArtifactName(String workspaceId, String filePath, String modelId, String variant) {
        return (workspaceId + "__" + filePath + "__" + modelId + "__" + variant)
                .replace('/', '_')
                .replace('\\', '_')
                .replace(':', '_')
                .replace('|', '_');
    }

    private void writeJson(Path path, Object value) throws IOException {
        Files.createDirectories(path.getParent());
        MAPPER.writeValue(path.toFile(), value);
    }

    private void writeReadme(Path studyDir, RippleRefModels.StudyConfig config) throws IOException {
        String readme = """
                # RIPPLE-REF Study Run

                Study ID: %s
                Scale: %s
                Created: %s

                ## Research Questions
                - RQ1: Dependency context around selected files
                - RQ2: API/dependency/caller changes after refactoring
                - RQ3: Dependency-aware vs file-only ripple risk
                - RQ4: File/model/edit characteristics linked to high ripple risk

                ## Artifacts
                - results_candidates.csv — one row per candidate (primary output)
                - dependency_contexts/ — JSON + text context packages
                - ripple_reports/ — before/after verification per candidate
                """.formatted(config.studyId, config.scale, Instant.ofEpochMilli(config.createdAt));
        Files.writeString(studyDir.resolve("README.md"), readme, StandardCharsets.UTF_8);
    }

    private void appendCsvRow(Path studyDir, String fileName, String header, String row) throws IOException {
        Path csv = studyDir.resolve(fileName);
        boolean writeHeader = !Files.exists(csv);
        try (BufferedWriter w = Files.newBufferedWriter(csv, StandardCharsets.UTF_8,
                java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND)) {
            if (writeHeader) {
                w.write(header);
                w.newLine();
            }
            w.write(row);
            w.newLine();
        }
    }

    private static RippleRefModels.TestVerificationResult toTestVerificationResult(RippleRefTestProbe.TestProbeResult src) {
        RippleRefModels.TestVerificationResult dst = new RippleRefModels.TestVerificationResult();
        if (src == null) {
            return dst;
        }
        dst.status = src.status;
        dst.attempted = src.attempted;
        dst.targetedTestClasses = new ArrayList<>(src.targetedTestClasses);
        dst.testsDiscovered = src.testsDiscovered;
        dst.testsRun = src.testsRun;
        dst.testsPassed = src.testsPassed;
        dst.testsFailed = src.testsFailed;
        dst.durationMs = src.durationMs;
        dst.errorSnippet = new ArrayList<>(src.errorSnippet);
        dst.notes = src.notes;
        dst.beforeStatus = src.beforeStatus;
        dst.beforeTestsPassed = src.beforeTestsPassed;
        dst.beforeTestsFailed = src.beforeTestsFailed;
        dst.beforeDurationMs = src.beforeDurationMs;
        dst.regression = src.regression;
        dst.behaviorPreserved = src.behaviorPreserved;
        dst.baselineInconclusive = src.baselineInconclusive;
        dst.pairedProbe = src.pairedProbe;
        dst.probeStrategy = src.probeStrategy;
        return dst;
    }

    private static final String CANDIDATE_CSV_HEADER =
            "study_id,project_id,file_path,model_id,variant,pair_key,status,risk_level,contract_risk_level,observed_risk_level,verification_level,callers_checked,observed_broken_caller_count,compile_probe_status,behavioral_correct,adoption_class,test_probe_status,tests_passed,tests_failed,risk_reasons,smell_before,smell_after,fan_in_before,fan_out_before,fan_out_after,fan_out_delta,caller_used_api_count_before,public_api_count_before,latency_ms,prompt_tokens,completion_tokens,error,completed_at,orchestration,graph_version,multi_llm_agent_mode,agent_step_count,llm_plan_status,llm_verify_approved,static_verify_accept,cohort_id,test_probe_before_status,tests_passed_before,tests_failed_before,test_regression,test_probe_strategy,downstream_caller_count_before,lines_added,lines_removed,churn,methods_added,methods_removed";

    private void appendCandidateCsv(Path studyDir, RippleRefModels.CandidateResultRow row) throws IOException {
        List<RippleRefModels.CandidateResultRow> rows = loadAllCandidateRows(studyDir);
        rows.removeIf(r -> row.pairKey != null && row.pairKey.equals(r.pairKey));
        rows.add(row);
        writeCandidateCsv(studyDir, rows);
    }

    private void writeCandidateCsv(Path studyDir, List<RippleRefModels.CandidateResultRow> rows) throws IOException {
        Path csv = studyDir.resolve("results_candidates.csv");
        try (BufferedWriter w = Files.newBufferedWriter(csv, StandardCharsets.UTF_8)) {
            w.write(CANDIDATE_CSV_HEADER);
            w.newLine();
            for (RippleRefModels.CandidateResultRow row : rows) {
                w.write(csv(row.studyId, row.projectId, row.filePath, row.modelId, row.variant, row.pairKey,
                        row.status, row.riskLevel, row.contractRiskLevel, row.observedRiskLevel, row.verificationLevel,
                        row.callersChecked, row.observedBrokenCallerCount, row.compileProbeStatus,
                        row.behavioralCorrect, row.adoptionClass, row.testProbeStatus, row.testsPassed, row.testsFailed,
                        row.riskReasonsJson, row.smellCountBefore, row.smellCountAfter, row.fanInBefore, row.fanOutBefore,
                        row.fanOutAfter, row.fanOutDelta, row.callerUsedApiCountBefore, row.publicApiCountBefore,
                        row.latencyMs, row.promptTokens, row.completionTokens, row.error, row.completedAt,
                        row.orchestration, row.graphVersion, row.multiLlmAgentMode, row.agentStepCount,
                        row.llmPlanStatus, row.llmVerifyApproved, row.staticVerifyAccept, row.cohortId,
                        row.testProbeBeforeStatus, row.testsPassedBefore, row.testsFailedBefore, row.testRegression,
                        row.testProbeStrategy, row.downstreamCallerCountBefore, row.linesAdded, row.linesRemoved,
                        row.churn, row.methodsAdded, row.methodsRemoved));
                w.newLine();
            }
        }
    }

    private List<RippleRefModels.CandidateResultRow> loadAllCandidateRows(Path studyDir) {
        Path csv = studyDir.resolve("results_candidates.csv");
        if (!Files.isRegularFile(csv)) {
            return new ArrayList<>();
        }
        try {
            List<String> lines = Files.readAllLines(csv, StandardCharsets.UTF_8);
            if (lines.size() <= 1) {
                return new ArrayList<>();
            }
            Map<String, RippleRefModels.CandidateResultRow> byKey = new LinkedHashMap<>();
            for (int i = 1; i < lines.size(); i++) {
                String line = lines.get(i).trim();
                if (line.isEmpty()) {
                    continue;
                }
                RippleRefModels.CandidateResultRow row = parseCandidateCsvLine(line);
                if (row.pairKey != null) {
                    byKey.put(row.pairKey, row);
                }
            }
            return new ArrayList<>(byKey.values());
        } catch (IOException e) {
            logger.warn("Failed to load candidate CSV: {}", e.toString());
            return new ArrayList<>();
        }
    }

    private RippleRefModels.CandidateResultRow parseCandidateCsvLine(String line) {
        String[] cols = splitCsvLine(line);
        RippleRefModels.CandidateResultRow row = new RippleRefModels.CandidateResultRow();
        if (cols.length < 6) {
            return row;
        }
        row.studyId = cols[0];
        row.projectId = cols[1];
        row.filePath = cols[2];
        row.modelId = cols[3];
        row.variant = cols[4];
        row.pairKey = cols[5];
        if (cols.length > 6) {
            row.status = cols[6];
        }
        if (cols.length > 7) {
            row.riskLevel = cols[7];
        }
        if (cols.length > 8) {
            row.contractRiskLevel = cols[8];
        }
        if (cols.length > 9) {
            row.observedRiskLevel = cols[9];
        }
        if (cols.length > 10) {
            row.verificationLevel = cols[10];
        }
        if (cols.length > 11) {
            row.callersChecked = parseInt(cols[11]);
        }
        if (cols.length > 12) {
            row.observedBrokenCallerCount = parseInt(cols[12]);
        }
        if (cols.length > 13) {
            row.compileProbeStatus = cols[13];
        }
        boolean extendedBehavioral = cols.length >= 28;
        if (extendedBehavioral) {
            row.behavioralCorrect = parseBoolean(cols[14]);
            row.adoptionClass = cols[15];
            row.testProbeStatus = cols[16];
            row.testsPassed = parseInt(cols[17]);
            row.testsFailed = parseInt(cols[18]);
            row.riskReasonsJson = cols[19];
            row.smellCountBefore = parseInt(cols[20]);
            row.smellCountAfter = parseInt(cols[21]);
            row.fanInBefore = parseInt(cols[22]);
            row.fanOutBefore = parseInt(cols[23]);
            row.fanOutAfter = parseInt(cols[24]);
            row.fanOutDelta = parseInt(cols[25]);
            row.callerUsedApiCountBefore = parseInt(cols[26]);
            row.publicApiCountBefore = parseInt(cols[27]);
            if (cols.length > 28) {
                row.latencyMs = parseLong(cols[28]);
            }
            if (cols.length > 29) {
                row.promptTokens = parseInt(cols[29]);
            }
            if (cols.length > 30) {
                row.completionTokens = parseInt(cols[30]);
            }
            if (cols.length > 31) {
                row.error = cols[31];
            }
            if (cols.length > 32) {
                row.completedAt = cols[32];
            }
            if (cols.length > 33) {
                row.orchestration = cols[33];
            }
            if (cols.length > 34) {
                row.graphVersion = cols[34];
            }
            if (cols.length > 35) {
                row.multiLlmAgentMode = cols[35];
            }
            if (cols.length > 36) {
                row.agentStepCount = parseInt(cols[36]);
            }
            if (cols.length > 37) {
                row.llmPlanStatus = cols[37];
            }
            if (cols.length > 38) {
                row.llmVerifyApproved = parseBoolean(cols[38]);
            }
            if (cols.length > 39) {
                row.staticVerifyAccept = parseBoolean(cols[39]);
            }
            if (cols.length > 40) {
                row.cohortId = cols[40];
            }
            if (cols.length > 41) {
                row.testProbeBeforeStatus = cols[41];
            }
            if (cols.length > 42) {
                row.testsPassedBefore = parseInt(cols[42]);
            }
            if (cols.length > 43) {
                row.testsFailedBefore = parseInt(cols[43]);
            }
            if (cols.length > 44) {
                row.testRegression = parseBoolean(cols[44]);
            }
            if (cols.length > 45) {
                row.testProbeStrategy = cols[45];
            }
            if (cols.length > 46) {
                row.downstreamCallerCountBefore = parseInt(cols[46]);
            }
            if (cols.length > 47) {
                row.linesAdded = parseInt(cols[47]);
            }
            if (cols.length > 48) {
                row.linesRemoved = parseInt(cols[48]);
            }
            if (cols.length > 49) {
                row.churn = parseDouble(cols[49]);
            }
            if (cols.length > 50) {
                row.methodsAdded = parseInt(cols[50]);
            }
            if (cols.length > 51) {
                row.methodsRemoved = parseInt(cols[51]);
            }
            return row;
        }
        if (cols.length > 14) {
            row.riskReasonsJson = cols[14];
        }
        if (cols.length > 15) {
            row.smellCountBefore = parseInt(cols[15]);
        }
        if (cols.length > 16) {
            row.smellCountAfter = parseInt(cols[16]);
        }
        if (cols.length > 17) {
            row.fanInBefore = parseInt(cols[17]);
        }
        if (cols.length > 18) {
            row.fanOutBefore = parseInt(cols[18]);
        }
        if (cols.length > 19) {
            row.fanOutAfter = parseInt(cols[19]);
        }
        if (cols.length > 20) {
            row.fanOutDelta = parseInt(cols[20]);
        }
        if (cols.length > 21) {
            row.callerUsedApiCountBefore = parseInt(cols[21]);
        }
        if (cols.length > 22) {
            row.publicApiCountBefore = parseInt(cols[22]);
        }
        if (cols.length > 23) {
            row.latencyMs = parseLong(cols[23]);
        }
        if (cols.length > 24) {
            row.promptTokens = parseInt(cols[24]);
        }
        if (cols.length > 25) {
            row.completionTokens = parseInt(cols[25]);
        }
        if (cols.length > 26) {
            row.error = cols[26];
        }
        if (cols.length > 27) {
            row.completedAt = cols[27];
        }
        return row;
    }

    private static boolean parseBoolean(String s) {
        if (s == null) {
            return false;
        }
        return "true".equalsIgnoreCase(s.trim()) || "1".equals(s.trim()) || "yes".equalsIgnoreCase(s.trim());
    }

    private static int parseInt(String s) {
        try {
            return s == null || s.isBlank() ? 0 : Integer.parseInt(s.trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static long parseLong(String s) {
        try {
            return s == null || s.isBlank() ? 0L : Long.parseLong(s.trim());
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    private static double parseDouble(String s) {
        try {
            return s == null || s.isBlank() ? 0.0 : Double.parseDouble(s.trim());
        } catch (NumberFormatException e) {
            return 0.0;
        }
    }

    private static String[] splitCsvLine(String line) {
        List<String> cols = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (inQuotes) {
                if (c == '"') {
                    if (i + 1 < line.length() && line.charAt(i + 1) == '"') {
                        cur.append('"');
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    cur.append(c);
                }
            } else if (c == '"') {
                inQuotes = true;
            } else if (c == ',') {
                cols.add(cur.toString());
                cur.setLength(0);
            } else {
                cur.append(c);
            }
        }
        cols.add(cur.toString());
        return cols.toArray(new String[0]);
    }

    private static String csv(Object... values) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < values.length; i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(escapeCsv(values[i]));
        }
        return sb.toString();
    }

    private static String escapeCsv(Object v) {
        if (v == null) {
            return "";
        }
        String s = String.valueOf(v);
        if (s.contains(",") || s.contains("\"") || s.contains("\n")) {
            return "\"" + s.replace("\"", "\"\"") + "\"";
        }
        return s;
    }
}
