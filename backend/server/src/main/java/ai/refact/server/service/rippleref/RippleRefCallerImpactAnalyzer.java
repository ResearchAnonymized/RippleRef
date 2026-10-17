package ai.refact.server.service.rippleref;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Level-2 ripple verification: after applying candidate in sandbox, check whether
 * downstream caller files still reference APIs that no longer exist on the target.
 */
@Component
public class RippleRefCallerImpactAnalyzer {

    public static class CallerImpactResult {
        public int observedBrokenCallerCount;
        public List<String> observedBrokenCallers = new ArrayList<>();
        public List<String> observedBrokenReferences = new ArrayList<>();
        public int callersChecked;
        public String notes;
    }

    public CallerImpactResult analyze(
            RippleRefModels.JavaFileProfile beforeProfile,
            RippleRefModels.JavaFileProfile afterProfile,
            Path sandboxRoot,
            RippleRefJavaProfileExtractor extractor) throws IOException {

        CallerImpactResult result = new CallerImpactResult();
        if (beforeProfile == null || afterProfile == null || sandboxRoot == null) {
            result.notes = "missing_input";
            return result;
        }

        String className = extractor.primaryClassName(beforeProfile);
        Set<String> afterApiKeys = apiKeys(afterProfile, extractor);

        Set<String> brokenCallers = new LinkedHashSet<>();
        Set<String> brokenRefs = new LinkedHashSet<>();

        for (String callerPath : beforeProfile.callerFiles) {
            Path callerFile = sandboxRoot.resolve(callerPath.startsWith("/") ? callerPath.substring(1) : callerPath);
            if (!Files.isRegularFile(callerFile)) {
                continue;
            }
            result.callersChecked++;
            String callerContent = RippleRefTextIO.readTextLenient(callerFile);
            if (callerContent.isBlank()) {
                continue;
            }

            for (String api : beforeProfile.callerUsedApis) {
                String methodName = extractor.methodNameFromApi(api);
                if (methodName.isBlank()) {
                    continue;
                }
                boolean callerStillCalls = extractor.isCallerUsingApiInKnownCaller(callerContent, className, methodName);
                if (!callerStillCalls) {
                    continue;
                }
                String apiKey = apiKey(api, methodName);
                if (!afterApiKeys.contains(apiKey)) {
                    brokenCallers.add(callerPath);
                    brokenRefs.add(api);
                }
            }
        }

        result.observedBrokenCallers = new ArrayList<>(brokenCallers);
        result.observedBrokenReferences = new ArrayList<>(brokenRefs);
        result.observedBrokenCallerCount = brokenCallers.size();
        if (result.callersChecked == 0) {
            result.notes = "no_callers_checked";
        } else if (result.observedBrokenCallerCount == 0) {
            result.notes = "no_observed_breakage";
        } else {
            result.notes = "observed_caller_breakage";
        }
        return result;
    }

    private static Set<String> apiKeys(RippleRefModels.JavaFileProfile profile, RippleRefJavaProfileExtractor extractor) {
        Set<String> keys = new HashSet<>();
        for (String api : profile.publicApis) {
            keys.add(apiKey(api, extractor.methodNameFromApi(api)));
        }
        for (String api : profile.protectedApis) {
            keys.add(apiKey(api, extractor.methodNameFromApi(api)));
        }
        return keys;
    }

    private static String apiKey(String api, String methodName) {
        if (api != null && !api.isBlank()) {
            return api.trim().toLowerCase(Locale.ROOT);
        }
        return methodName != null ? methodName.toLowerCase(Locale.ROOT) : "";
    }
}
