package ai.refact.server.service.rippleref;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * DTOs for the RIPPLE-REF dependency-aware refactoring study.
 */
public final class RippleRefModels {

    private RippleRefModels() {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class StudyModelConfig {
        public String provider;
        public String family;
        public String displayName;
        public String modelId;
        public String apiRoute;
        public long contextWindow;
        public String promptVersion = "ripple-ref-v1";
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class StudyConfig {
        public String studyId;
        public String label = "ripple-ref";
        /** single_pass (B0) | multi_agent (P-MA) */
        public String orchestration = "single_pass";
        public String scale = "pilot"; // pilot | full | extended | custom
        public int repositoryCount = 3;
        public int filesPerRepository = 5;
        public int modelCount = 5;
        public int variantCount = 2;
        public int randomSeed = 42;
        public int minSmellCount = 1;
        /** Locked cohort source for multi-agent studies (e.g. ripple_ref_master). */
        public String cohortSourceStudyId;
        public String cohortId;
        public List<String> workspaceIds = new ArrayList<>();
        public List<StudyModelConfig> models = new ArrayList<>();
        public long createdAt;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class RepositoryScanResult {
        public String projectId;
        public String repositoryName;
        public String repositoryPath;
        public String commitHash;
        public int javaFileCount;
        public int productionFileCount;
        public int excludedFileCount;
        public long totalLoc;
        public long productionLoc;
        public String analysisTimestamp;
        public List<String> productionFiles = new ArrayList<>();
        public List<ExcludedFile> excludedFiles = new ArrayList<>();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ExcludedFile {
        public String path;
        public String reason;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class JavaFileProfile {
        public String filePath;
        public String packageName;
        public List<String> declaredClasses = new ArrayList<>();
        public List<String> publicApis = new ArrayList<>();
        public List<String> protectedApis = new ArrayList<>();
        public List<String> constructors = new ArrayList<>();
        public List<String> imports = new ArrayList<>();
        public List<String> typeDependencies = new ArrayList<>();
        public List<String> annotations = new ArrayList<>();
        public List<String> extendsTypes = new ArrayList<>();
        public List<String> implementsTypes = new ArrayList<>();
        public List<String> methodCalls = new ArrayList<>();
        public List<String> callerFiles = new ArrayList<>();
        public List<String> callerUsedApis = new ArrayList<>();
        public int fanIn;
        public int fanOut;
        public int loc;
        public boolean parseSuccess = true;
        public String parseError;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class RepositoryDependencyScan {
        public String projectId;
        public String scannedAt;
        public Map<String, JavaFileProfile> fileProfiles = new LinkedHashMap<>();
        public Map<String, List<String>> dependencyGraph = new LinkedHashMap<>();
        public Map<String, List<String>> reverseDependencyGraph = new LinkedHashMap<>();
        public Map<String, List<String>> apiIndex = new LinkedHashMap<>();
        public Map<String, List<String>> callerIndex = new LinkedHashMap<>();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class EligibleFile {
        public String filePath;
        public int loc;
        public int smellCount;
        public int complexity;
        public int fanIn;
        public int fanOut;
        public int publicApiCount;
        public int callerUsedApiCount;
        public int downstreamCallerCount;
        public int annotationCount;
        public boolean hasInheritance;
        public boolean hasInterface;
        public double valueScore;
        public double dependencyRiskScore;
        public String samplingGroup;
        public boolean withinTokenBudget = true;
        public boolean parseable = true;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class SelectedFile extends EligibleFile {
        public String projectId;
        public String selectionReason;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class DependencyContextPackage {
        public String projectId;
        public String targetFile;
        public String packageName;
        public List<String> publicApis = new ArrayList<>();
        public List<String> protectedApis = new ArrayList<>();
        public List<String> callerUsedApis = new ArrayList<>();
        public List<String> downstreamCallerFiles = new ArrayList<>();
        public List<String> imports = new ArrayList<>();
        public List<String> typeDependencies = new ArrayList<>();
        public List<String> annotations = new ArrayList<>();
        public List<String> extendsTypes = new ArrayList<>();
        public List<String> implementsTypes = new ArrayList<>();
        public int fanIn;
        public int fanOut;
        public List<String> dependencyConstraints = new ArrayList<>();
        public String contextText;
        public String generatedAt;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class BehavioralVerificationResult {
        public String status = "completed"; // completed | skipped
        public String notes;
        public boolean behavioralCorrect;
        public boolean methodSignaturesPreserved = true;
        public boolean exceptionHandlingPreserved = true;
        public boolean frameworkContractsPreserved = true;
        public boolean conditionalLogicPreserved = true;
        public boolean criticalMethodCallsPreserved = true;
        public List<String> behavioralWarnings = new ArrayList<>();
        public List<String> behavioralErrors = new ArrayList<>();
        public List<String> behavioralChangeTypes = new ArrayList<>();
        public String adoptionHint;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class TestVerificationResult {
        public String status; // after status: skipped | success | failed | timeout | error
        public boolean attempted;
        public List<String> targetedTestClasses = new ArrayList<>();
        public int testsDiscovered;
        public int testsRun;
        public int testsPassed;
        public int testsFailed;
        public long durationMs;
        public List<String> errorSnippet = new ArrayList<>();
        public String notes;
        public String beforeStatus;
        public int beforeTestsPassed;
        public int beforeTestsFailed;
        public long beforeDurationMs;
        public boolean regression;
        public boolean behaviorPreserved;
        public boolean baselineInconclusive;
        public boolean pairedProbe;
        public String probeStrategy;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class RippleVerificationReport {
        public boolean parseSuccess;
        public String changeStatus; // unchanged | changed | failed
        public int linesAdded;
        public int linesRemoved;
        public double churn;
        public int methodsAdded;
        public int methodsRemoved;
        public int smellCountAfter;
        public int smellReduction;
        public List<String> publicMethodsRemoved = new ArrayList<>();
        public List<String> publicSignaturesChanged = new ArrayList<>();
        public List<String> protectedSignaturesChanged = new ArrayList<>();
        public List<String> constructorsChanged = new ArrayList<>();
        public List<String> callerUsedApisRemoved = new ArrayList<>();
        public List<String> callerUsedApisChanged = new ArrayList<>();
        public List<String> affectedCallers = new ArrayList<>();
        public List<String> affectedPackages = new ArrayList<>();
        public List<String> importsAdded = new ArrayList<>();
        public List<String> importsRemoved = new ArrayList<>();
        public List<String> typeDependenciesAdded = new ArrayList<>();
        public List<String> typeDependenciesRemoved = new ArrayList<>();
        public int fanOutDelta;
        public List<String> annotationChanges = new ArrayList<>();
        public List<String> inheritanceChanges = new ArrayList<>();
        public List<String> interfaceChanges = new ArrayList<>();
        public boolean packageChanged;
        public String riskLevel; // Low | Medium | High (max of contract + observed)
        public String contractRiskLevel; // L1 static profile diff
        public String observedRiskLevel; // L2 caller breakage in sandbox
        public String verificationLevel = "L1"; // L1 | L2 | L3 | L4 | L5
        public List<String> riskReasons = new ArrayList<>();
        public int callersChecked;
        public int observedBrokenCallerCount;
        public List<String> observedBrokenCallers = new ArrayList<>();
        public List<String> observedBrokenReferences = new ArrayList<>();
        public String sandboxPath;
        public boolean compileProbeAttempted;
        public String compileProbeStatus; // skipped | success | failed | timeout | error
        public String compileBuildTool;
        public List<String> compileErrorSnippet = new ArrayList<>();
        public BehavioralVerificationResult behavioral;
        public TestVerificationResult tests;
        public String adoptionClass;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CandidateResultRow {
        public String studyId;
        public String projectId;
        public String filePath;
        public String modelId;
        public String variant; // V1 | V2 | MA
        public String pairKey;
        public String status; // completed | failed_generation | failed_parsing | failed_verification
        public String orchestration; // single_pass | multi_agent
        public String graphVersion;
        public String multiLlmAgentMode;
        public int agentStepCount;
        public String llmPlanStatus;
        public boolean llmVerifyApproved;
        public boolean staticVerifyAccept;
        public String cohortId;
        public String riskLevel;
        public String contractRiskLevel;
        public String observedRiskLevel;
        public String verificationLevel;
        public int callersChecked;
        public int observedBrokenCallerCount;
        public String compileProbeStatus;
        public boolean behavioralCorrect;
        public String adoptionClass;
        public String testProbeStatus;
        public String testProbeBeforeStatus;
        public int testsPassed;
        public int testsFailed;
        public int testsPassedBefore;
        public int testsFailedBefore;
        public boolean testRegression;
        public String testProbeStrategy;
        public String riskReasonsJson;
        public int smellCountBefore;
        public int smellCountAfter;
        public int fanInBefore;
        public int fanOutBefore;
        public int fanOutAfter;
        public int fanOutDelta;
        public int callerUsedApiCountBefore;
        public int publicApiCountBefore;
        public int downstreamCallerCountBefore;
        public int linesAdded;
        public int linesRemoved;
        public double churn;
        public int methodsAdded;
        public int methodsRemoved;
        public long latencyMs;
        public int promptTokens;
        public int completionTokens;
        public String error;
        public String completedAt;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class LiveCandidateStatus {
        public String workspaceId;
        public String repositoryName;
        public String filePath;
        public String fileName;
        public String modelId;
        public String modelDisplayName;
        public String variant;
        public String phase;
        public String pairKey;
        public long startedAt;
        public long updatedAt;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class FileRunProgress {
        public String filePath;
        public String fileName;
        public String samplingGroup;
        public int planned;
        public int completed;
        public int failed;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class StudyState {
        public StudyConfig config;
        public String studyDir;
        public Map<String, RepositoryScanResult> repositoryScans = new LinkedHashMap<>();
        public Map<String, RepositoryDependencyScan> dependencyScans = new LinkedHashMap<>();
        public Map<String, List<EligibleFile>> eligibleByRepo = new LinkedHashMap<>();
        public Map<String, List<SelectedFile>> selectedByRepo = new LinkedHashMap<>();
        public List<String> completedCandidates = new ArrayList<>();
        public List<String> failedCandidates = new ArrayList<>();
        public String status = "created"; // created | scanning | selecting | ready | running | completed
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class FileDependencyGraphView {
        public String projectId;
        public String filePath;
        public String packageName;
        public int fanIn;
        public int fanOut;
        public List<String> upstreamFiles = new ArrayList<>();
        public List<String> downstreamCallers = new ArrayList<>();
        public List<String> typeDependencies = new ArrayList<>();
        public List<String> publicApis = new ArrayList<>();
        public List<String> protectedApis = new ArrayList<>();
        public List<String> callerUsedApis = new ArrayList<>();
        /** Directed edges for visualization: {@code source -> target}. */
        public List<String> edges = new ArrayList<>();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CompletenessReport {
        public int plannedRuns;
        public int completedRuns;
        public int failedGenerations;
        public int failedParsing;
        public int missingArtifacts;
        public double completionPercentage;
        public List<String> warnings = new ArrayList<>();
    }
}
