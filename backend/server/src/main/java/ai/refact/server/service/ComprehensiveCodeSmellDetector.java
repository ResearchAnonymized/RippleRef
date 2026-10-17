package ai.refact.server.service;

import ai.refact.engine.model.CodeSmell;
import ai.refact.engine.model.SmellCategory;
import ai.refact.engine.model.SmellSeverity;
import ai.refact.engine.model.SmellType;
import net.sourceforge.pmd.PMDConfiguration;
import net.sourceforge.pmd.PmdAnalysis;
import net.sourceforge.pmd.lang.LanguageRegistry;
import net.sourceforge.pmd.lang.rule.RulePriority;
import net.sourceforge.pmd.reporting.Report;
import net.sourceforge.pmd.reporting.RuleViolation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Java code smell detection backed by PMD (AST rules). Replaces legacy regex heuristics.
 */
@Service
public class ComprehensiveCodeSmellDetector {

    private static final Logger logger = LoggerFactory.getLogger(ComprehensiveCodeSmellDetector.class);

    /**
     * Bump when PMD version, bundled ruleset, or mapping logic changes (invalidates smell count caches).
     */
    public static final int SMELL_ENGINE_VERSION = 5;

    private static final String RULESET_RESOURCE = "refactai-pmd-ruleset.xml";

    /** When {@code capped=true}, return at most this many findings (deterministic order). */
    private static final int CAPPED_MAX = 60;

    public List<CodeSmell> detectAllCodeSmells(Path filePath) {
        return detectAllCodeSmells(filePath, false);
    }

    public List<CodeSmell> detectAllCodeSmells(Path filePath, boolean capped) {
        if (filePath == null || !Files.isRegularFile(filePath)) {
            return List.of();
        }
        if (!filePath.getFileName().toString().endsWith(".java")) {
            return List.of();
        }
        try {
            List<CodeSmell> smells = runPmd(filePath);
            smells = dedupe(smells);
            if (capped) {
                smells = smells.stream()
                        .sorted(Comparator
                                .comparing((CodeSmell s) -> severityRank(s.getSeverity()))
                                .thenComparingInt(CodeSmell::getStartLine)
                                .thenComparing(s -> s.getTitle() != null ? s.getTitle() : ""))
                        .limit(CAPPED_MAX)
                        .collect(Collectors.toList());
            }
            return smells;
        } catch (Exception e) {
            logger.warn("PMD analysis failed for {}: {}", filePath, e.toString());
            return List.of();
        }
    }

    private static int severityRank(SmellSeverity s) {
        if (s == null) {
            return 99;
        }
        return switch (s) {
            case CRITICAL -> 0;
            case MAJOR -> 1;
            case MINOR -> 2;
            case INFO -> 3;
        };
    }

    private static List<CodeSmell> dedupe(List<CodeSmell> smells) {
        Set<String> seen = new LinkedHashSet<>();
        List<CodeSmell> out = new ArrayList<>();
        for (CodeSmell s : smells) {
            String title = s.getTitle() != null ? s.getTitle() : "";
            String key = title + "|" + s.getStartLine() + "|" + s.getEndLine() + "|" + s.getDescription();
            if (seen.add(key)) {
                out.add(s);
            }
        }
        return out;
    }

    private List<CodeSmell> runPmd(Path filePath) throws Exception {
        PMDConfiguration config = new PMDConfiguration();
        config.setDefaultLanguageVersion(
                LanguageRegistry.PMD.getLanguageVersionById("java", "17"));
        try (PmdAnalysis pmd = PmdAnalysis.create(config)) {
            pmd.addRuleSet(pmd.newRuleSetLoader().loadFromResource(RULESET_RESOURCE));
            pmd.files().addFile(filePath);
            Report report = pmd.performAnalysisAndCollectReport();
            List<CodeSmell> out = new ArrayList<>();
            for (RuleViolation rv : report.getViolations()) {
                out.add(mapViolation(rv));
            }
            if (!report.getProcessingErrors().isEmpty()) {
                logger.debug("PMD processing errors for {}: {}", filePath, report.getProcessingErrors().size());
            }
            return out;
        }
    }

    private CodeSmell mapViolation(RuleViolation rv) {
        String ruleName = rv.getRule().getName();
        int begin = Math.max(1, rv.getBeginLine());
        int end = rv.getEndLine() > 0 ? rv.getEndLine() : begin;
        String msg = rv.getDescription() != null ? rv.getDescription() : "";
        String description = "[" + ruleName + "] " + msg
                + " — PMD Java rules: https://docs.pmd-code.org/pmd-doc-7.10.0/pmd_rules_java.html";

        SmellSeverity severity = mapPriority(rv.getRule().getPriority());
        SmellCategory category = mapCategory(rv, ruleName);
        String pmdRuleSetCategory = extractPmdRuleSetCategory(rv);
        String title = ruleName;
        String rec = "Fix or suppress PMD rule \"" + ruleName + "\" at line " + begin + ".";

        return new CodeSmell(
                SmellType.PMD_RULE_VIOLATION,
                category,
                severity,
                title,
                description,
                rec,
                begin,
                end,
                List.of(rec),
                pmdRuleSetCategory);
    }

    /**
     * Human-readable PMD ruleset category (matches PMD Java rule buckets).
     */
    static String extractPmdRuleSetCategory(RuleViolation rv) {
        String setName = rv.getRule().getRuleSetName();
        if (setName == null || setName.isBlank()) {
            return inferPmdCategoryFromRuleName(rv.getRule().getName());
        }
        String s = setName.toLowerCase(Locale.ROOT);
        if (s.contains("bestpractices") || s.contains("best practices")) {
            return "Best Practices";
        }
        if (s.contains("codestyle") || s.contains("code style")) {
            return "Code Style";
        }
        if (s.contains("documentation")) {
            return "Documentation";
        }
        if (s.contains("design")) {
            return "Design";
        }
        if (s.contains("errorprone") || s.contains("error prone")) {
            return "Error Prone";
        }
        if (s.contains("multithreading")) {
            return "Multithreading";
        }
        if (s.contains("performance")) {
            return "Performance";
        }
        if (s.contains("security")) {
            return "Security";
        }
        if (s.contains("testing") || s.contains("junit")) {
            return "Testing";
        }
        return inferPmdCategoryFromRuleName(rv.getRule().getName());
    }

    private static String inferPmdCategoryFromRuleName(String ruleName) {
        if (ruleName == null || ruleName.isBlank()) {
            return "Other";
        }
        String n = ruleName.toLowerCase(Locale.ROOT);
        if (n.contains("comment") || n.contains("javadoc")) {
            return "Documentation";
        }
        if (n.contains("unused") || n.contains("unnecessary")) {
            return "Best Practices";
        }
        return "Other";
    }

    private static SmellCategory mapCategory(RuleViolation rv, String ruleName) {
        String setName = rv.getRule().getRuleSetName();
        if (setName != null) {
            String s = setName.toLowerCase(Locale.ROOT);
            if (s.contains("security")) {
                return SmellCategory.SECURITY_ISSUE;
            }
            if (s.contains("performance")) {
                return SmellCategory.PERFORMANCE_ISSUE;
            }
            if (s.contains("multithreading") || s.contains("concurrency")) {
                return SmellCategory.CONCURRENCY_ISSUE;
            }
            if (s.contains("testing") || s.contains("junit")) {
                return SmellCategory.TESTING_ISSUE;
            }
            if (s.contains("design")) {
                return SmellCategory.HIERARCHY_ARCHITECTURE;
            }
            if (s.contains("best practices") || s.contains("bestpractices") || s.contains("error prone")
                    || s.contains("errorprone")) {
                return SmellCategory.MAINTAINABILITY_ISSUE;
            }
            if (s.contains("code style") || s.contains("codestyle")) {
                return SmellCategory.MAINTAINABILITY_ISSUE;
            }
        }
        String n = ruleName.toLowerCase(Locale.ROOT);
        if (n.contains("unused") || (n.contains("empty") && n.contains("catch")) || n.contains("unnecessary")) {
            return SmellCategory.DISPENSABLE;
        }
        if (n.contains("coupling") || n.contains("lawofdemeter") || n.contains("couple")) {
            return SmellCategory.COUPLER;
        }
        if (n.contains("cyclomatic") || n.contains("npath") || n.contains("complexity") || n.contains("excessive")) {
            return SmellCategory.BLOATER;
        }
        return SmellCategory.MAINTAINABILITY_ISSUE;
    }

    private static SmellSeverity mapPriority(RulePriority p) {
        if (p == null) {
            return SmellSeverity.MINOR;
        }
        if (p == RulePriority.HIGH) {
            return SmellSeverity.CRITICAL;
        }
        if (p == RulePriority.MEDIUM_HIGH || p == RulePriority.MEDIUM) {
            return SmellSeverity.MAJOR;
        }
        if (p == RulePriority.MEDIUM_LOW) {
            return SmellSeverity.MINOR;
        }
        return SmellSeverity.INFO;
    }
}
