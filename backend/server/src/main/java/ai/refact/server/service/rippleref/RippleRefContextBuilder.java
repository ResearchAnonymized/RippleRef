package ai.refact.server.service.rippleref;

import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Builds dependency context packages (JSON + prompt text) for V2 refactoring.
 */
@Component
public class RippleRefContextBuilder {

    public RippleRefModels.DependencyContextPackage build(String projectId,
                                                          RippleRefModels.JavaFileProfile profile) {
        RippleRefModels.DependencyContextPackage ctx = new RippleRefModels.DependencyContextPackage();
        ctx.projectId = projectId;
        ctx.targetFile = profile.filePath;
        ctx.packageName = profile.packageName;
        ctx.publicApis = new ArrayList<>(profile.publicApis);
        ctx.protectedApis = new ArrayList<>(profile.protectedApis);
        ctx.callerUsedApis = new ArrayList<>(profile.callerUsedApis);
        ctx.downstreamCallerFiles = new ArrayList<>(profile.callerFiles);
        ctx.imports = new ArrayList<>(profile.imports);
        ctx.typeDependencies = new ArrayList<>(profile.typeDependencies);
        ctx.annotations = new ArrayList<>(profile.annotations);
        ctx.extendsTypes = new ArrayList<>(profile.extendsTypes);
        ctx.implementsTypes = new ArrayList<>(profile.implementsTypes);
        ctx.fanIn = profile.fanIn;
        ctx.fanOut = profile.fanOut;
        ctx.dependencyConstraints = buildConstraints(profile);
        ctx.contextText = toPromptText(ctx);
        ctx.generatedAt = Instant.now().toString();
        return ctx;
    }

    private List<String> buildConstraints(RippleRefModels.JavaFileProfile profile) {
        List<String> constraints = new ArrayList<>();
        constraints.add("Do not remove or change caller-used public/protected APIs.");
        constraints.add("Do not change public/protected method signatures.");
        constraints.add("Do not change constructor signatures used by other files.");
        constraints.add("Do not remove or alter framework annotations: " + String.join(", ", profile.annotations));
        constraints.add("Do not change package declaration.");
        if (!profile.extendsTypes.isEmpty()) {
            constraints.add("Preserve extends: " + String.join(", ", profile.extendsTypes));
        }
        if (!profile.implementsTypes.isEmpty()) {
            constraints.add("Preserve implements: " + String.join(", ", profile.implementsTypes));
        }
        constraints.add("Downstream callers: " + String.join(", ", profile.callerFiles));
        return constraints;
    }

    public String toPromptText(RippleRefModels.DependencyContextPackage ctx) {
        StringBuilder sb = new StringBuilder();
        sb.append("=== RIPPLE-REF Dependency Context ===\n");
        sb.append("Target file: ").append(ctx.targetFile).append("\n");
        sb.append("Package: ").append(ctx.packageName).append("\n\n");

        sb.append("Public APIs (must preserve):\n");
        for (String api : ctx.publicApis) {
            sb.append("  - ").append(api).append("\n");
        }
        sb.append("\nProtected APIs (must preserve):\n");
        for (String api : ctx.protectedApis) {
            sb.append("  - ").append(api).append("\n");
        }

        sb.append("\nCaller-used APIs (critical — do not break):\n");
        for (String api : ctx.callerUsedApis) {
            sb.append("  - ").append(api).append("\n");
        }

        sb.append("\nDownstream caller files:\n");
        for (String f : ctx.downstreamCallerFiles) {
            sb.append("  - ").append(f).append("\n");
        }

        sb.append("\nImports / type dependencies:\n");
        for (String imp : ctx.imports) {
            sb.append("  - ").append(imp).append("\n");
        }

        sb.append("\nAnnotations (do not remove/change):\n");
        for (String a : ctx.annotations) {
            sb.append("  - @").append(a).append("\n");
        }

        if (!ctx.extendsTypes.isEmpty()) {
            sb.append("\nExtends: ").append(String.join(", ", ctx.extendsTypes)).append("\n");
        }
        if (!ctx.implementsTypes.isEmpty()) {
            sb.append("Implements: ").append(String.join(", ", ctx.implementsTypes)).append("\n");
        }

        sb.append("\nFan-in: ").append(ctx.fanIn).append(" | Fan-out: ").append(ctx.fanOut).append("\n");

        sb.append("\nRipple-safety rules:\n");
        sb.append("ALLOWED: extract private helpers, simplify internal logic, reduce duplication, improve readability.\n");
        sb.append("NOT ALLOWED: remove caller-used APIs; change public/protected signatures; change constructors used elsewhere;\n");
        sb.append("remove/change framework annotations; change package; change extends/implements; introduce unnecessary dependencies.\n");

        sb.append("\nDependency constraints:\n");
        for (String c : ctx.dependencyConstraints) {
            sb.append("  - ").append(c).append("\n");
        }
        return sb.toString();
    }
}
