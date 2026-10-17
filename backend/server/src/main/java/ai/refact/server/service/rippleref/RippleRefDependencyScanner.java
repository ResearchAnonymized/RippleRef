package ai.refact.server.service.rippleref;

import ai.refact.api.ProjectContext;
import ai.refact.server.service.DependencyAnalysisService;
import ai.refact.server.service.WorkspacePathFilters;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Repository-level dependency scan: graph, API index, caller index, per-file profiles.
 */
@Service
public class RippleRefDependencyScanner {

    private final DependencyAnalysisService dependencyAnalysisService;
    private final RippleRefJavaProfileExtractor profileExtractor;

    public RippleRefDependencyScanner(DependencyAnalysisService dependencyAnalysisService,
                                      RippleRefJavaProfileExtractor profileExtractor) {
        this.dependencyAnalysisService = dependencyAnalysisService;
        this.profileExtractor = profileExtractor;
    }

    public RippleRefModels.RepositoryDependencyScan scan(String projectId, ProjectContext context) throws Exception {
        RippleRefModels.RepositoryDependencyScan scan = new RippleRefModels.RepositoryDependencyScan();
        scan.projectId = projectId;
        scan.scannedAt = Instant.now().toString();

        DependencyAnalysisService.ProjectDependencyAnalysis dep =
                dependencyAnalysisService.analyzeProjectDependencies(context);

        Map<String, String> contents = new HashMap<>();
        Map<String, RippleRefModels.JavaFileProfile> profiles = new LinkedHashMap<>();

        for (Path javaFile : context.sourceFiles()) {
            String rel = WorkspacePathFilters.toRelativePath(context.root(), javaFile);
            if (RippleRefProductionClassifier.classify(rel) != RippleRefProductionClassifier.Classification.PRODUCTION) {
                continue;
            }
            String content = RippleRefTextIO.readTextLenient(javaFile);
            contents.put(rel, content);
            RippleRefModels.JavaFileProfile profile = profileExtractor.extract(rel, content);
            profiles.put(rel, profile);
        }

        // Fan-in / fan-out from dependency service
        for (Map.Entry<String, DependencyAnalysisService.FileDependencyAnalysis> e
                : dep.getFileDependencies().entrySet()) {
            String path = e.getKey();
            RippleRefModels.JavaFileProfile p = profiles.get(path);
            if (p == null) {
                continue;
            }
            p.fanOut = e.getValue().getOutgoingDependencies();
            Set<String> reverse = dep.getReverseDependencyGraph().get(path);
            p.fanIn = reverse != null ? reverse.size() : e.getValue().getIncomingDependencies();
            scan.dependencyGraph.put(path, new ArrayList<>(e.getValue().getDependencies()));
            scan.reverseDependencyGraph.put(path, reverse != null ? new ArrayList<>(reverse) : new ArrayList<>());
        }

        // API index: file -> public+protected API signatures
        for (Map.Entry<String, RippleRefModels.JavaFileProfile> e : profiles.entrySet()) {
            List<String> apis = new ArrayList<>();
            apis.addAll(e.getValue().publicApis);
            apis.addAll(e.getValue().protectedApis);
            scan.apiIndex.put(e.getKey(), apis);
        }

        // Caller index: target file -> files that reference its class/methods
        buildCallerIndex(profiles, contents, scan);

        scan.fileProfiles = profiles;
        return scan;
    }

    private void buildCallerIndex(Map<String, RippleRefModels.JavaFileProfile> profiles,
                                  Map<String, String> contents,
                                  RippleRefModels.RepositoryDependencyScan scan) {
        Map<String, String> classToFile = new HashMap<>();
        for (Map.Entry<String, RippleRefModels.JavaFileProfile> e : profiles.entrySet()) {
            String className = profileExtractor.primaryClassName(e.getValue());
            classToFile.put(className, e.getKey());
            if (e.getValue().packageName != null && !e.getValue().packageName.isBlank()) {
                String fq = e.getValue().packageName + "." + className;
                classToFile.put(fq, e.getKey());
                classToFile.put(fq.substring(fq.lastIndexOf('.') + 1), e.getKey());
            }
        }

        for (Map.Entry<String, RippleRefModels.JavaFileProfile> target : profiles.entrySet()) {
            String targetPath = target.getKey();
            RippleRefModels.JavaFileProfile tp = target.getValue();
            String className = profileExtractor.primaryClassName(tp);
            Set<String> callers = new LinkedHashSet<>();
            List<String> callerUsedApis = new ArrayList<>();

            for (Map.Entry<String, String> caller : contents.entrySet()) {
                if (caller.getKey().equals(targetPath)) {
                    continue;
                }
                String callerContent = caller.getValue();
                boolean referencesClass = callerContent.contains(className);
                if (!referencesClass && tp.packageName != null) {
                    referencesClass = callerContent.contains(tp.packageName + "." + className);
                }
                if (!referencesClass) {
                    continue;
                }
                boolean used = false;
                for (String api : tp.publicApis) {
                    String method = profileExtractor.methodNameFromApi(api);
                    if (profileExtractor.isCallerUsingApi(callerContent, className, method)
                            || profileExtractor.isCallerUsingApiInKnownCaller(callerContent, className, method)) {
                        callerUsedApis.add(api);
                        used = true;
                    }
                }
                for (String api : tp.protectedApis) {
                    String method = profileExtractor.methodNameFromApi(api);
                    if (profileExtractor.isCallerUsingApi(callerContent, className, method)
                            || profileExtractor.isCallerUsingApiInKnownCaller(callerContent, className, method)) {
                        callerUsedApis.add(api);
                        used = true;
                    }
                }
                if (used) {
                    callers.add(caller.getKey());
                }
            }

            tp.callerFiles = new ArrayList<>(callers);
            tp.callerUsedApis = new ArrayList<>(new LinkedHashSet<>(callerUsedApis));
            scan.callerIndex.put(targetPath, tp.callerFiles);
        }
    }
}
