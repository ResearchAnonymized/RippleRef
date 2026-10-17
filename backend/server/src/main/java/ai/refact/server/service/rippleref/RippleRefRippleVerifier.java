package ai.refact.server.service.rippleref;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Compares before/after Java profiles and classifies ripple risk (Low / Medium / High).
 */
@Component
public class RippleRefRippleVerifier {

    private static final int LARGE_DEPENDENCY_DELTA = 5;

    public RippleRefModels.RippleVerificationReport verify(
            RippleRefModels.JavaFileProfile before,
            RippleRefModels.JavaFileProfile after,
            int smellBefore,
            int smellAfter) {

        RippleRefModels.RippleVerificationReport report = new RippleRefModels.RippleVerificationReport();
        report.parseSuccess = after.parseSuccess;
        report.smellCountAfter = smellAfter;
        report.smellReduction = smellBefore - smellAfter;

        List<String> beforeLines = splitLines(before);
        List<String> afterLines = splitLines(after);
        report.linesAdded = diffAdded(beforeLines, afterLines);
        report.linesRemoved = diffRemoved(beforeLines, afterLines);
        int maxLines = Math.max(beforeLines.size(), afterLines.size());
        report.churn = maxLines == 0 ? 0.0 : (report.linesAdded + report.linesRemoved) / (double) maxLines;

        report.publicMethodsRemoved = removedItems(before.publicApis, after.publicApis);
        report.publicSignaturesChanged = changedSignatures(before.publicApis, after.publicApis);
        report.protectedSignaturesChanged = changedSignatures(before.protectedApis, after.protectedApis);
        report.constructorsChanged = changedSignatures(before.constructors, after.constructors);

        report.callerUsedApisRemoved = removedItems(before.callerUsedApis, after.callerUsedApis);
        report.callerUsedApisChanged = changedSignatures(before.callerUsedApis, after.callerUsedApis);

        report.importsAdded = addedItems(before.imports, after.imports);
        report.importsRemoved = removedItems(before.imports, after.imports);
        report.typeDependenciesAdded = addedItems(before.typeDependencies, after.typeDependencies);
        report.typeDependenciesRemoved = removedItems(before.typeDependencies, after.typeDependencies);
        report.fanOutDelta = after.fanOut - before.fanOut;

        report.annotationChanges = symmetricDiff(before.annotations, after.annotations);
        report.inheritanceChanges = symmetricDiff(before.extendsTypes, after.extendsTypes);
        report.interfaceChanges = symmetricDiff(before.implementsTypes, after.implementsTypes);
        report.packageChanged = !safeEquals(before.packageName, after.packageName);

        report.methodsAdded = Math.max(0, after.publicApis.size() + after.protectedApis.size()
                - before.publicApis.size() - before.protectedApis.size());
        report.methodsRemoved = report.publicMethodsRemoved.size();

        report.affectedCallers = new ArrayList<>(before.callerFiles);
        Set<String> packages = new HashSet<>();
        for (String caller : before.callerFiles) {
            int idx = caller.lastIndexOf('/');
            if (idx > 0) {
                packages.add(caller.substring(0, idx));
            }
        }
        report.affectedPackages = new ArrayList<>(packages);

        boolean unchanged = report.publicMethodsRemoved.isEmpty()
                && report.publicSignaturesChanged.isEmpty()
                && report.protectedSignaturesChanged.isEmpty()
                && report.callerUsedApisRemoved.isEmpty()
                && report.callerUsedApisChanged.isEmpty()
                && report.constructorsChanged.isEmpty()
                && report.annotationChanges.isEmpty()
                && report.inheritanceChanges.isEmpty()
                && report.interfaceChanges.isEmpty()
                && !report.packageChanged
                && report.linesAdded == 0
                && report.linesRemoved == 0;
        report.changeStatus = unchanged ? "unchanged" : "changed";
        if (!after.parseSuccess) {
            report.changeStatus = "failed";
        }

        classifyContractRisk(report);
        report.contractRiskLevel = report.riskLevel;
        report.observedRiskLevel = "Low";
        mergeFinalRisk(report);
        return report;
    }

    /** Apply Level-2 observed caller breakage and optional compile probe; updates final risk. */
    public void applyObservedImpact(
            RippleRefModels.RippleVerificationReport report,
            RippleRefCallerImpactAnalyzer.CallerImpactResult impact,
            RippleRefCompileProbe.CompileProbeResult compileResult,
            boolean compileAttempted) {

        if (impact != null) {
            report.verificationLevel = "L2";
            report.callersChecked = impact.callersChecked;
            report.observedBrokenCallerCount = impact.observedBrokenCallerCount;
            report.observedBrokenCallers = new ArrayList<>(impact.observedBrokenCallers);
            report.observedBrokenReferences = new ArrayList<>(impact.observedBrokenReferences);
            if (impact.observedBrokenCallerCount > 0) {
                report.observedRiskLevel = "High";
                if (!report.riskReasons.contains("observed_caller_breakage")) {
                    report.riskReasons.add("observed_caller_breakage:" + impact.observedBrokenCallerCount);
                }
            } else {
                report.observedRiskLevel = "Low";
            }
        }

        if (compileAttempted && compileResult != null) {
            report.verificationLevel = "L3";
            report.compileProbeAttempted = true;
            report.compileProbeStatus = compileResult.status;
            report.compileBuildTool = compileResult.buildTool;
            report.compileErrorSnippet = new ArrayList<>(compileResult.errorSnippet);
            if ("failed".equals(compileResult.status) || "timeout".equals(compileResult.status)) {
                if (!report.riskReasons.contains("compile_probe_failed")) {
                    report.riskReasons.add("compile_probe_failed:" + compileResult.status);
                }
                if (!"High".equals(report.observedRiskLevel)) {
                    report.observedRiskLevel = "Medium";
                }
            }
        }

        mergeFinalRisk(report);
    }

    private void mergeFinalRisk(RippleRefModels.RippleVerificationReport report) {
        String contract = report.contractRiskLevel != null ? report.contractRiskLevel : report.riskLevel;
        String observed = report.observedRiskLevel != null ? report.observedRiskLevel : "Low";
        report.contractRiskLevel = contract;
        if ("High".equals(contract) || "High".equals(observed)) {
            report.riskLevel = "High";
        } else if ("Medium".equals(contract) || "Medium".equals(observed)) {
            report.riskLevel = "Medium";
        } else {
            report.riskLevel = "Low";
        }
    }

    private void classifyContractRisk(RippleRefModels.RippleVerificationReport report) {
        List<String> reasons = new ArrayList<>();

        if (!report.callerUsedApisRemoved.isEmpty() || !report.callerUsedApisChanged.isEmpty()) {
            reasons.add("caller_used_api_affected");
        }
        if (!report.publicSignaturesChanged.isEmpty() || !report.protectedSignaturesChanged.isEmpty()) {
            reasons.add("public_or_protected_signature_changed");
        }
        if (!report.publicMethodsRemoved.isEmpty()) {
            reasons.add("public_api_removed");
        }
        if (!report.constructorsChanged.isEmpty()) {
            reasons.add("constructor_signature_changed");
        }
        if (!report.annotationChanges.isEmpty()) {
            reasons.add("annotation_changed");
        }
        if (!report.inheritanceChanges.isEmpty() || !report.interfaceChanges.isEmpty()) {
            reasons.add("inheritance_or_interface_changed");
        }
        if (report.packageChanged) {
            reasons.add("package_changed");
        }
        int depDelta = report.importsAdded.size() + report.importsRemoved.size()
                + report.typeDependenciesAdded.size() + report.typeDependenciesRemoved.size()
                + Math.abs(report.fanOutDelta);
        if (depDelta >= LARGE_DEPENDENCY_DELTA) {
            reasons.add("large_dependency_delta:" + depDelta);
        }

        if (!reasons.isEmpty()) {
            boolean high = reasons.stream().anyMatch(r ->
                    r.startsWith("caller_used")
                            || r.startsWith("public_or_protected")
                            || r.startsWith("public_api")
                            || r.startsWith("constructor")
                            || r.startsWith("annotation")
                            || r.startsWith("inheritance")
                            || r.startsWith("package")
                            || r.startsWith("large_dependency"));
            report.riskLevel = high ? "High" : "Medium";
            if (high) {
                report.riskReasons = reasons;
                return;
            }
            report.riskReasons = reasons;
            report.riskLevel = "Medium";
            return;
        }

        if (!report.importsAdded.isEmpty() || !report.importsRemoved.isEmpty()
                || report.fanOutDelta != 0 || report.churn > 0) {
            report.riskLevel = "Medium";
            reasons.add("internal_dependency_or_import_change");
            report.riskReasons = reasons;
            return;
        }

        report.riskLevel = "Low";
        report.riskReasons = List.of("no_caller_api_change", "small_dependency_delta");
    }

    private static List<String> splitLines(RippleRefModels.JavaFileProfile profile) {
        // loc only; churn computed externally if raw content available
        return List.of();
    }

    public RippleRefModels.RippleVerificationReport verifyWithContent(
            String beforeContent,
            String afterContent,
            RippleRefModels.JavaFileProfile beforeProfile,
            RippleRefModels.JavaFileProfile afterProfile,
            int smellBefore,
            int smellAfter) {

        RippleRefModels.RippleVerificationReport report = verify(beforeProfile, afterProfile, smellBefore, smellAfter);

        List<String> beforeLines = beforeContent == null ? List.of() : List.of(beforeContent.split("\n", -1));
        List<String> afterLines = afterContent == null ? List.of() : List.of(afterContent.split("\n", -1));
        report.linesAdded = Math.max(0, afterLines.size() - beforeLines.size());
        report.linesRemoved = Math.max(0, beforeLines.size() - afterLines.size());
        int maxLines = Math.max(beforeLines.size(), afterLines.size());
        report.churn = maxLines == 0 ? 0.0 : (report.linesAdded + report.linesRemoved) / (double) maxLines;

        if (beforeContent != null && afterContent != null && beforeContent.equals(afterContent)) {
            report.changeStatus = "unchanged";
        } else if (afterContent != null && !afterProfile.parseSuccess) {
            report.changeStatus = "failed";
        } else {
            report.changeStatus = "changed";
        }
        classifyContractRisk(report);
        report.contractRiskLevel = report.riskLevel;
        report.observedRiskLevel = "Low";
        mergeFinalRisk(report);
        return report;
    }

    private static List<String> removedItems(List<String> before, List<String> after) {
        Set<String> afterSet = new HashSet<>(after);
        List<String> removed = new ArrayList<>();
        for (String b : before) {
            if (!afterSet.contains(b)) {
                removed.add(b);
            }
        }
        return removed;
    }

    private static List<String> addedItems(List<String> before, List<String> after) {
        Set<String> beforeSet = new HashSet<>(before);
        List<String> added = new ArrayList<>();
        for (String a : after) {
            if (!beforeSet.contains(a)) {
                added.add(a);
            }
        }
        return added;
    }

    private static List<String> changedSignatures(List<String> before, List<String> after) {
        // Same method name, different signature
        List<String> changed = new ArrayList<>();
        for (String b : before) {
            String bName = methodKey(b);
            for (String a : after) {
                if (methodKey(a).equals(bName) && !a.equals(b)) {
                    changed.add(b + " -> " + a);
                }
            }
        }
        return changed;
    }

    private static String methodKey(String sig) {
        if (sig == null) {
            return "";
        }
        int paren = sig.indexOf('(');
        if (paren < 0) {
            return sig;
        }
        String head = sig.substring(0, paren).trim();
        int space = head.lastIndexOf(' ');
        return space >= 0 ? head.substring(space + 1) : head;
    }

    private static List<String> symmetricDiff(List<String> a, List<String> b) {
        Set<String> setA = new HashSet<>(a);
        Set<String> setB = new HashSet<>(b);
        List<String> diff = new ArrayList<>();
        for (String x : setA) {
            if (!setB.contains(x)) {
                diff.add("removed:" + x);
            }
        }
        for (String x : setB) {
            if (!setA.contains(x)) {
                diff.add("added:" + x);
            }
        }
        return diff;
    }

    private static int diffAdded(List<String> before, List<String> after) {
        return Math.max(0, after.size() - before.size());
    }

    private static int diffRemoved(List<String> before, List<String> after) {
        return Math.max(0, before.size() - after.size());
    }

    private static boolean safeEquals(String a, String b) {
        if (a == null) {
            return b == null || b.isEmpty();
        }
        return a.equals(b);
    }
}
