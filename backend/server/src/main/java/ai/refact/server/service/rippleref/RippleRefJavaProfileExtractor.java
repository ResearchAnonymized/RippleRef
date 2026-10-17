package ai.refact.server.service.rippleref;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Regex-based Java profile extraction (JDT/Spoon-ready interface; no external parser required).
 */
@Component
public class RippleRefJavaProfileExtractor {

    private static final Pattern PACKAGE = Pattern.compile("package\\s+([\\w.]+)\\s*;");
    private static final Pattern CLASS_DECL = Pattern.compile(
            "(?:public\\s+|protected\\s+|private\\s+)?(?:abstract\\s+|final\\s+)?(?:class|interface|enum|record)\\s+(\\w+)");
    private static final Pattern IMPORT = Pattern.compile("import\\s+(?:static\\s+)?([\\w.*]+)\\s*;");
    private static final Pattern EXTENDS = Pattern.compile(
            "(?:class|interface)\\s+\\w+\\s+extends\\s+([\\w.<>,\\s]+?)(?:\\s+implements|\\s*\\{)");
    private static final Pattern IMPLEMENTS = Pattern.compile("implements\\s+([\\w.<>,\\s]+)\\s*\\{");
    private static final Pattern ANNOTATION = Pattern.compile("@([\\w.]+)");
    private static final Pattern PUBLIC_METHOD = Pattern.compile(
            "public\\s+(?:static\\s+)?(?:final\\s+)?(?:synchronized\\s+)?(?:<[^>]+>\\s+)?([\\w.<>\\[\\]]+)\\s+(\\w+)\\s*\\(([^)]*)\\)");
    private static final Pattern PROTECTED_METHOD = Pattern.compile(
            "protected\\s+(?:static\\s+)?(?:final\\s+)?(?:<[^>]+>\\s+)?([\\w.<>\\[\\]]+)\\s+(\\w+)\\s*\\(([^)]*)\\)");
    private static final Pattern PUBLIC_CTOR = Pattern.compile("public\\s+(\\w+)\\s*\\(([^)]*)\\)");
    private static final Pattern PROTECTED_CTOR = Pattern.compile("protected\\s+(\\w+)\\s*\\(([^)]*)\\)");
    private static final Pattern METHOD_CALL = Pattern.compile("\\b([A-Za-z_][\\w]*)\\s*\\.\\s*([A-Za-z_][\\w]*)\\s*\\(");

    public RippleRefModels.JavaFileProfile extract(String filePath, String content) {
        RippleRefModels.JavaFileProfile profile = new RippleRefModels.JavaFileProfile();
        profile.filePath = filePath;
        if (content == null) {
            profile.parseSuccess = false;
            profile.parseError = "empty_content";
            return profile;
        }
        try {
            Matcher pkg = PACKAGE.matcher(content);
            if (pkg.find()) {
                profile.packageName = pkg.group(1);
            } else {
                profile.packageName = "";
            }

            Matcher classMatcher = CLASS_DECL.matcher(content);
            while (classMatcher.find()) {
                profile.declaredClasses.add(classMatcher.group(1));
            }

            Matcher importMatcher = IMPORT.matcher(content);
            while (importMatcher.find()) {
                String imp = importMatcher.group(1);
                if (!imp.endsWith(".*")) {
                    profile.imports.add(imp);
                    profile.typeDependencies.add(imp);
                }
            }

            Matcher ann = ANNOTATION.matcher(content);
            while (ann.find()) {
                profile.annotations.add(ann.group(1));
            }

            Matcher ext = EXTENDS.matcher(content);
            if (ext.find()) {
                for (String t : splitTypes(ext.group(1))) {
                    profile.extendsTypes.add(t);
                }
            }
            Matcher impl = IMPLEMENTS.matcher(content);
            if (impl.find()) {
                for (String t : splitTypes(impl.group(1))) {
                    profile.implementsTypes.add(t);
                }
            }

            for (Matcher m = PUBLIC_METHOD.matcher(content); m.find(); ) {
                profile.publicApis.add(formatMethod("public", m.group(1), m.group(2), m.group(3)));
            }
            for (Matcher m = PROTECTED_METHOD.matcher(content); m.find(); ) {
                profile.protectedApis.add(formatMethod("protected", m.group(1), m.group(2), m.group(3)));
            }
            for (Matcher m = PUBLIC_CTOR.matcher(content); m.find(); ) {
                profile.constructors.add("public " + m.group(1) + "(" + normalizeParams(m.group(2)) + ")");
            }
            for (Matcher m = PROTECTED_CTOR.matcher(content); m.find(); ) {
                profile.constructors.add("protected " + m.group(1) + "(" + normalizeParams(m.group(2)) + ")");
            }

            Set<String> calls = new LinkedHashSet<>();
            for (Matcher m = METHOD_CALL.matcher(content); m.find(); ) {
                calls.add(m.group(1) + "." + m.group(2) + "()");
            }
            profile.methodCalls = new ArrayList<>(calls);
            profile.loc = RippleRefProductionClassifier.countLoc(content);
            profile.parseSuccess = !profile.declaredClasses.isEmpty() || content.contains("class ") || content.contains("interface ");
        } catch (Exception e) {
            profile.parseSuccess = false;
            profile.parseError = e.getMessage();
        }
        return profile;
    }

    public List<String> extractPublicApiSignatures(String content) {
        List<String> sigs = new ArrayList<>();
        if (content == null) {
            return sigs;
        }
        for (Matcher m = PUBLIC_METHOD.matcher(content); m.find(); ) {
            sigs.add(formatMethod("public", m.group(1), m.group(2), m.group(3)));
        }
        return sigs;
    }

    private static List<String> splitTypes(String raw) {
        List<String> out = new ArrayList<>();
        for (String part : raw.split(",")) {
            String t = part.trim().replaceAll("<.*>", "").trim();
            if (!t.isEmpty()) {
                out.add(t);
            }
        }
        return out;
    }

    private static String formatMethod(String visibility, String ret, String name, String params) {
        return visibility + " " + ret + " " + name + "(" + normalizeParams(params) + ")";
    }

    private static String normalizeParams(String params) {
        if (params == null || params.isBlank()) {
            return "";
        }
        List<String> types = new ArrayList<>();
        for (String param : params.split(",")) {
            String p = param.trim();
            if (p.isEmpty()) {
                continue;
            }
            String[] parts = p.split("\\s+");
            List<String> typeParts = new ArrayList<>();
            for (int i = 0; i < parts.length - 1; i++) {
                if (!parts[i].startsWith("@")) {
                    typeParts.add(parts[i]);
                }
            }
            if (!typeParts.isEmpty()) {
                types.add(String.join(" ", typeParts));
            } else if (parts.length == 1) {
                types.add(parts[0]);
            }
        }
        return String.join(", ", types);
    }

    /** Simple name of primary declared class for caller matching. */
    public String primaryClassName(RippleRefModels.JavaFileProfile profile) {
        if (profile.declaredClasses.isEmpty()) {
            String name = profile.filePath;
            int slash = name.lastIndexOf('/');
            int dot = name.lastIndexOf('.');
            if (slash >= 0 && dot > slash) {
                return name.substring(slash + 1, dot);
            }
            return name;
        }
        return profile.declaredClasses.get(0);
    }

    public String methodNameFromApi(String api) {
        if (api == null) {
            return "";
        }
        int paren = api.indexOf('(');
        if (paren < 0) {
            return api;
        }
        String head = api.substring(0, paren).trim();
        int space = head.lastIndexOf(' ');
        return space >= 0 ? head.substring(space + 1) : head;
    }

    public boolean isCallerUsingApi(String callerContent, String className, String methodName) {
        return matchesCallerApi(callerContent, className, methodName, false);
    }

    /** For known downstream callers (L2): also accept instance-style {@code .method(} when class is referenced. */
    public boolean isCallerUsingApiInKnownCaller(String callerContent, String className, String methodName) {
        return matchesCallerApi(callerContent, className, methodName, true);
    }

    private boolean matchesCallerApi(String callerContent, String className, String methodName, boolean knownCaller) {
        if (callerContent == null || className == null || methodName == null || methodName.isBlank()) {
            return false;
        }
        java.util.regex.Pattern direct = java.util.regex.Pattern.compile(
                "\\b" + java.util.regex.Pattern.quote(className) + "\\s*\\.\\s*"
                        + java.util.regex.Pattern.quote(methodName) + "\\s*\\(");
        if (direct.matcher(callerContent).find()) {
            return true;
        }
        if (!knownCaller || !callerContent.contains(className)) {
            return false;
        }
        java.util.regex.Pattern instance = java.util.regex.Pattern.compile(
                "\\." + java.util.regex.Pattern.quote(methodName) + "\\s*\\(");
        return instance.matcher(callerContent).find();
    }
}
