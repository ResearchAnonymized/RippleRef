package ai.refact.server.service.rippleref;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Eligibility checks and stratified sampling for RIPPLE-REF file selection.
 */
@Service
public class RippleRefFileSelector {

    public static final int DEFAULT_SEED = 42;
    public static final int DEFAULT_MIN_SMELLS = 1;

    public List<RippleRefModels.EligibleFile> computeEligible(
            RippleRefModels.RepositoryDependencyScan scan,
            Map<String, Integer> smellCounts,
            Map<String, String> fileContents,
            int minSmellCount) {

        List<RippleRefModels.EligibleFile> eligible = new ArrayList<>();
        for (Map.Entry<String, RippleRefModels.JavaFileProfile> e : scan.fileProfiles.entrySet()) {
            String path = e.getKey();
            RippleRefModels.JavaFileProfile p = e.getValue();
            String content = fileContents.get(path);
            int smells = smellCounts.getOrDefault(path, 0);

            if (!p.parseSuccess) {
                continue;
            }
            if (content != null && !RippleRefProductionClassifier.withinTokenBudget(content)) {
                continue;
            }
            if (smells < minSmellCount) {
                continue;
            }
            if (p.fanIn + p.fanOut == 0 && p.publicApis.isEmpty() && p.callerFiles.isEmpty()) {
                continue;
            }
            boolean hasRippleSignal = !p.publicApis.isEmpty()
                    || !p.protectedApis.isEmpty()
                    || !p.callerFiles.isEmpty()
                    || !p.annotations.isEmpty()
                    || !p.extendsTypes.isEmpty()
                    || !p.implementsTypes.isEmpty();
            if (!hasRippleSignal) {
                continue;
            }

            RippleRefModels.EligibleFile ef = new RippleRefModels.EligibleFile();
            ef.filePath = path;
            ef.loc = p.loc;
            ef.smellCount = smells;
            ef.complexity = estimateComplexity(content);
            ef.fanIn = p.fanIn;
            ef.fanOut = p.fanOut;
            ef.publicApiCount = p.publicApis.size();
            ef.callerUsedApiCount = p.callerUsedApis.size();
            ef.downstreamCallerCount = p.callerFiles.size();
            ef.annotationCount = p.annotations.size();
            ef.hasInheritance = !p.extendsTypes.isEmpty();
            ef.hasInterface = !p.implementsTypes.isEmpty();
            ef.withinTokenBudget = content == null || RippleRefProductionClassifier.withinTokenBudget(content);
            ef.parseable = p.parseSuccess;
            ef.valueScore = computeValueScore(ef);
            ef.dependencyRiskScore = computeDependencyRisk(ef);
            eligible.add(ef);
        }
        return eligible;
    }

    public List<RippleRefModels.SelectedFile> stratifiedSample(
            String projectId,
            List<RippleRefModels.EligibleFile> eligible,
            int targetCount,
            int seed) {

        if (eligible.isEmpty() || targetCount <= 0) {
            return List.of();
        }

        Random rng = new Random(seed);
        Map<String, List<RippleRefModels.EligibleFile>> buckets = new LinkedHashMap<>();
        buckets.put("high_fan_in", filterFanIn(eligible, 5, Integer.MAX_VALUE));
        buckets.put("medium_fan_in", filterFanIn(eligible, 2, 4));
        buckets.put("low_fan_in", filterFanIn(eligible, 0, 1));
        buckets.put("high_public_api", eligible.stream()
                .filter(f -> f.publicApiCount >= 5)
                .collect(Collectors.toList()));
        buckets.put("high_smell_high_dep", eligible.stream()
                .filter(f -> f.smellCount >= 10 && (f.fanIn + f.fanOut) >= 3)
                .collect(Collectors.toList()));
        buckets.put("random_eligible", new ArrayList<>(eligible));

        Set<String> pickedPaths = new HashSet<>();
        List<RippleRefModels.SelectedFile> picked = new ArrayList<>();
        List<String> bucketOrder = List.of(
                "high_fan_in", "medium_fan_in", "low_fan_in",
                "high_public_api", "high_smell_high_dep", "random_eligible");

        int perBucket = Math.max(1, targetCount / bucketOrder.size());
        for (String bucket : bucketOrder) {
            List<RippleRefModels.EligibleFile> pool = buckets.getOrDefault(bucket, List.of());
            List<RippleRefModels.EligibleFile> shuffled = new ArrayList<>(pool);
            Collections.shuffle(shuffled, rng);
            int taken = 0;
            for (RippleRefModels.EligibleFile ef : shuffled) {
                if (picked.size() >= targetCount || taken >= perBucket) {
                    break;
                }
                if (pickedPaths.add(ef.filePath)) {
                    RippleRefModels.SelectedFile sf = toSelected(projectId, ef, bucket);
                    picked.add(sf);
                    taken++;
                }
            }
        }

        // Fill remaining from random pool
        if (picked.size() < targetCount) {
            List<RippleRefModels.EligibleFile> remainder = new ArrayList<>(eligible);
            Collections.shuffle(remainder, rng);
            for (RippleRefModels.EligibleFile ef : remainder) {
                if (picked.size() >= targetCount) {
                    break;
                }
                if (pickedPaths.add(ef.filePath)) {
                    picked.add(toSelected(projectId, ef, "random_fill"));
                }
            }
        }

        picked.sort(Comparator.comparing(s -> s.filePath));
        return picked;
    }

    private static RippleRefModels.SelectedFile toSelected(String projectId,
                                                           RippleRefModels.EligibleFile ef,
                                                           String group) {
        RippleRefModels.SelectedFile sf = new RippleRefModels.SelectedFile();
        sf.projectId = projectId;
        sf.filePath = ef.filePath;
        sf.loc = ef.loc;
        sf.smellCount = ef.smellCount;
        sf.complexity = ef.complexity;
        sf.fanIn = ef.fanIn;
        sf.fanOut = ef.fanOut;
        sf.publicApiCount = ef.publicApiCount;
        sf.callerUsedApiCount = ef.callerUsedApiCount;
        sf.downstreamCallerCount = ef.downstreamCallerCount;
        sf.annotationCount = ef.annotationCount;
        sf.hasInheritance = ef.hasInheritance;
        sf.hasInterface = ef.hasInterface;
        sf.valueScore = ef.valueScore;
        sf.dependencyRiskScore = ef.dependencyRiskScore;
        sf.samplingGroup = group;
        sf.selectionReason = "stratified:" + group + ";value=" + String.format("%.2f", ef.valueScore);
        return sf;
    }

    private static List<RippleRefModels.EligibleFile> filterFanIn(List<RippleRefModels.EligibleFile> eligible,
                                                                    int min, int max) {
        return eligible.stream()
                .filter(f -> f.fanIn >= min && f.fanIn <= max)
                .collect(Collectors.toList());
    }

    private static double computeValueScore(RippleRefModels.EligibleFile ef) {
        return ef.smellCount * 0.3
                + ef.fanIn * 0.25
                + ef.fanOut * 0.15
                + ef.publicApiCount * 0.1
                + ef.callerUsedApiCount * 0.15
                + ef.downstreamCallerCount * 0.05;
    }

    private static double computeDependencyRisk(RippleRefModels.EligibleFile ef) {
        return ef.fanIn * 0.4
                + ef.callerUsedApiCount * 0.35
                + ef.publicApiCount * 0.15
                + (ef.hasInheritance ? 0.05 : 0)
                + (ef.hasInterface ? 0.05 : 0);
    }

    private static int estimateComplexity(String content) {
        if (content == null) {
            return 0;
        }
        int score = 0;
        for (String token : new String[]{"if ", "for ", "while ", "switch ", "catch ", "&&", "||", "?"}) {
            int idx = 0;
            while ((idx = content.indexOf(token, idx)) >= 0) {
                score++;
                idx += token.length();
            }
        }
        return score;
    }
}
