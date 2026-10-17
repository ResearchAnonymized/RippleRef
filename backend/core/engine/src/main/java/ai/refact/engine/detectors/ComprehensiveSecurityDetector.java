package ai.refact.engine.detectors;

import ai.refact.api.ProjectContext;
import ai.refact.engine.model.SecurityVulnerability;
import ai.refact.engine.model.VulnerabilityCategory;
import ai.refact.engine.model.VulnerabilitySeverity;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.regex.Matcher;
import java.io.IOException;

/**
 * Comprehensive security vulnerability detector.
 * This detector integrates multiple scanning techniques to identify a wide range of security issues,
 * including OWASP Top 10, CWE, and Java-specific vulnerabilities.
 *
 * Technology Stack:
 * - Java for core logic
 * - Spring Component for dependency injection
 * - Pattern matching for vulnerability detection
 * - Integration with OWASP Top 10 and CWE standards
 */
@Component
public class ComprehensiveSecurityDetector {

    private static final Logger logger = LoggerFactory.getLogger(ComprehensiveSecurityDetector.class);

    // Security patterns
    private static final Pattern SQL_INJECTION = Pattern.compile(
        "(createStatement|executeQuery|executeUpdate)\\s*\\([^)]*\\+[^)]*\\)|" +
        "\"SELECT.*FROM.*WHERE.*\"\\s*\\+|" +
        "String\\s+sql\\s*=\\s*\".*\"\\s*\\+\\s*\\w+"
    );
    
    private static final Pattern HARDCODED_PASSWORD = Pattern.compile(
        "(password|passwd|pwd)\\s*=\\s*\"[^\"]+\"|" +
        "(setPassword|setPasswd)\\s*\\(\\s*\"[^\"]+\"\\s*\\)"
    );
    
    private static final Pattern HARDCODED_API_KEY = Pattern.compile(
        "(api[_-]?key|apikey|api[_-]?secret|access[_-]?key|secret[_-]?key)\\s*=\\s*\"[a-zA-Z0-9]{16,}\""
    );
    
    private static final Pattern WEAK_HASH = Pattern.compile(
        "(MessageDigest\\.getInstance\\s*\\(\\s*\"(MD5|SHA1|SHA-1)\"\\s*\\)|" +
        "DigestUtils\\.(md5|sha1))"
    );
    
    private static final Pattern XSS_VULNERABILITY = Pattern.compile(
        "(response\\.getWriter\\(\\)\\.write|out\\.print)\\s*\\([^)]*request\\.getParameter[^)]*\\)"
    );
    
    private static final Pattern COMMAND_INJECTION = Pattern.compile(
        "Runtime\\.getRuntime\\(\\)\\.exec\\s*\\([^)]*\\+[^)]*\\)|" +
        "ProcessBuilder\\s*\\([^)]*\\+[^)]*\\)"
    );
    
    private static final Pattern PATH_TRAVERSAL = Pattern.compile(
        "new\\s+File\\s*\\([^)]*request\\.getParameter[^)]*\\)|" +
        "Files\\.readAllBytes\\s*\\([^)]*\\+[^)]*\\)"
    );
    
    private static final Pattern INSECURE_RANDOM = Pattern.compile(
        "new\\s+Random\\s*\\(\\)|" +
        "Math\\.random\\s*\\(\\s*\\)"
    );
    
    private static final Pattern XXE_VULNERABILITY = Pattern.compile(
        "DocumentBuilderFactory\\.newInstance\\s*\\(\\s*\\)" +
        "(?!.*setFeature.*XMLConstants\\.FEATURE_SECURE_PROCESSING)"
    );
    
    private static final Pattern SSRF_VULNERABILITY = Pattern.compile(
        "new\\s+URL\\s*\\([^)]*request\\.getParameter[^)]*\\)|" +
        "HttpClient.*\\.execute\\s*\\([^)]*\\+[^)]*\\)"
    );

    /**
     * Detects all security vulnerabilities in a given project context.
     */
    public List<SecurityVulnerability> detectAllVulnerabilities(ProjectContext projectContext) {
        List<SecurityVulnerability> allVulnerabilities = new ArrayList<>();
        logger.info("Starting comprehensive security detection for project: {}", projectContext.root().getFileName());

        // Iterate over all source files in the project
        for (Path sourceFile : projectContext.sourceFiles()) {
            if (isJavaFile(sourceFile)) {
                allVulnerabilities.addAll(detectAllVulnerabilities(sourceFile));
            }
        }

        logger.info("Completed comprehensive security detection. Found {} vulnerabilities.", allVulnerabilities.size());
        return allVulnerabilities;
    }

    /**
     * Detects all security vulnerabilities in a single file.
     */
    public List<SecurityVulnerability> detectAllVulnerabilities(Path filePath) {
        List<SecurityVulnerability> fileVulnerabilities = new ArrayList<>();
        if (!Files.exists(filePath) || !Files.isRegularFile(filePath)) {
            logger.warn("File does not exist or is not a regular file: {}", filePath);
            return fileVulnerabilities;
        }

        logger.debug("Detecting vulnerabilities in file: {}", filePath);

        try {
            String fileContent = Files.readString(filePath);
            String[] lines = fileContent.split("\n");

            // Run various detection techniques
            fileVulnerabilities.addAll(detectInjectionVulnerabilities(filePath, fileContent, lines));
            fileVulnerabilities.addAll(detectCryptographicIssues(filePath, fileContent, lines));
            fileVulnerabilities.addAll(detectHardcodedSecrets(filePath, fileContent, lines));
            fileVulnerabilities.addAll(detectXSSVulnerabilities(filePath, fileContent, lines));
            fileVulnerabilities.addAll(detectSSRFVulnerabilities(filePath, fileContent, lines));
            fileVulnerabilities.addAll(detectConfigurationIssues(filePath, fileContent, lines));

        } catch (IOException e) {
            logger.error("Error reading file {}: {}", filePath, e.getMessage());
        }

        return fileVulnerabilities;
    }

    /**
     * Detect injection vulnerabilities (SQL, Command, etc.)
     */
    private List<SecurityVulnerability> detectInjectionVulnerabilities(Path filePath, String content, String[] lines) {
        List<SecurityVulnerability> vulnerabilities = new ArrayList<>();

        // SQL Injection
        Matcher sqlMatcher = SQL_INJECTION.matcher(content);
        if (sqlMatcher.find()) {
            int lineNumber = getLineNumber(content, sqlMatcher.start());
            vulnerabilities.add(SecurityVulnerability.builder()
                .id(UUID.randomUUID().toString())
                .title("SQL Injection Vulnerability")
                .description("Potential SQL injection detected due to string concatenation in SQL queries")
                .severity(VulnerabilitySeverity.CRITICAL)
                .category(VulnerabilityCategory.INJECTION)
                .filePath(filePath.toString())
                .startLine(lineNumber)
                .endLine(lineNumber)
                .codeSnippet(lines[Math.max(0, lineNumber - 1)])
                .cvssScore(9.8)
                .exploitabilityScore(9.0)
                .impactScore(10.0)
                .recommendation("Use PreparedStatement with parameterized queries instead of string concatenation")
                .estimatedEffortHours(4)
                .fixPriority("IMMEDIATE")
                .cweId("CWE-89")
                .owaspCategory("A03:2021")
                .reviewStatus("PENDING")
                .build());
        }

        // Command Injection
        Matcher cmdMatcher = COMMAND_INJECTION.matcher(content);
        if (cmdMatcher.find()) {
            int lineNumber = getLineNumber(content, cmdMatcher.start());
            vulnerabilities.add(SecurityVulnerability.builder()
                .id(UUID.randomUUID().toString())
                .title("Command Injection Vulnerability")
                .description("Potential command injection through Runtime.exec() or ProcessBuilder with concatenated input")
                .severity(VulnerabilitySeverity.CRITICAL)
                .category(VulnerabilityCategory.INJECTION)
                .filePath(filePath.toString())
                .startLine(lineNumber)
                .endLine(lineNumber)
                .codeSnippet(lines[Math.max(0, lineNumber - 1)])
                .cvssScore(9.0)
                .exploitabilityScore(8.5)
                .impactScore(9.5)
                .recommendation("Validate and sanitize all inputs. Use ProcessBuilder with separate arguments")
                .estimatedEffortHours(6)
                .fixPriority("IMMEDIATE")
                .cweId("CWE-78")
                .owaspCategory("A03:2021")
                .reviewStatus("PENDING")
                .build());
        }

        // Path Traversal
        Matcher pathMatcher = PATH_TRAVERSAL.matcher(content);
        if (pathMatcher.find()) {
            int lineNumber = getLineNumber(content, pathMatcher.start());
            vulnerabilities.add(SecurityVulnerability.builder()
                .id(UUID.randomUUID().toString())
                .title("Path Traversal Vulnerability")
                .description("Potential path traversal attack through file operations with unsanitized input")
                .severity(VulnerabilitySeverity.HIGH)
                .category(VulnerabilityCategory.PATH_TRAVERSAL)
                .filePath(filePath.toString())
                .startLine(lineNumber)
                .endLine(lineNumber)
                .codeSnippet(lines[Math.max(0, lineNumber - 1)])
                .cvssScore(7.5)
                .exploitabilityScore(7.0)
                .impactScore(8.0)
                .recommendation("Validate file paths against a whitelist and use canonical paths")
                .estimatedEffortHours(3)
                .fixPriority("HIGH")
                .cweId("CWE-22")
                .owaspCategory("A01:2021")
                .reviewStatus("PENDING")
                .build());
        }

        return vulnerabilities;
    }

    /**
     * Detect cryptographic issues
     */
    private List<SecurityVulnerability> detectCryptographicIssues(Path filePath, String content, String[] lines) {
        List<SecurityVulnerability> vulnerabilities = new ArrayList<>();

        // Weak hashing algorithms
        Matcher hashMatcher = WEAK_HASH.matcher(content);
        if (hashMatcher.find()) {
            int lineNumber = getLineNumber(content, hashMatcher.start());
            vulnerabilities.add(SecurityVulnerability.builder()
                .id(UUID.randomUUID().toString())
                .title("Weak Cryptographic Hash")
                .description("Use of weak hashing algorithm (MD5, SHA-1) detected")
                .severity(VulnerabilitySeverity.HIGH)
                .category(VulnerabilityCategory.CRYPTOGRAPHIC_FAILURES)
                .filePath(filePath.toString())
                .startLine(lineNumber)
                .endLine(lineNumber)
                .codeSnippet(lines[Math.max(0, lineNumber - 1)])
                .cvssScore(7.4)
                .exploitabilityScore(6.5)
                .impactScore(8.0)
                .recommendation("Use SHA-256 or stronger hashing algorithms (SHA-3, bcrypt for passwords)")
                .estimatedEffortHours(2)
                .fixPriority("HIGH")
                .cweId("CWE-327")
                .owaspCategory("A02:2021")
                .reviewStatus("PENDING")
                .build());
        }

        // Insecure Random
        Matcher randomMatcher = INSECURE_RANDOM.matcher(content);
        if (randomMatcher.find()) {
            int lineNumber = getLineNumber(content, randomMatcher.start());
            vulnerabilities.add(SecurityVulnerability.builder()
                .id(UUID.randomUUID().toString())
                .title("Insecure Random Number Generation")
                .description("Use of non-cryptographic random number generator for security-sensitive operations")
                .severity(VulnerabilitySeverity.MEDIUM)
                .category(VulnerabilityCategory.CRYPTOGRAPHIC_FAILURES)
                .filePath(filePath.toString())
                .startLine(lineNumber)
                .endLine(lineNumber)
                .codeSnippet(lines[Math.max(0, lineNumber - 1)])
                .cvssScore(5.3)
                .exploitabilityScore(5.0)
                .impactScore(5.5)
                .recommendation("Use SecureRandom for cryptographic operations")
                .estimatedEffortHours(1)
                .fixPriority("MEDIUM")
                .cweId("CWE-338")
                .owaspCategory("A02:2021")
                .reviewStatus("PENDING")
                .build());
        }

        return vulnerabilities;
    }

    /**
     * Detect hardcoded secrets
     */
    private List<SecurityVulnerability> detectHardcodedSecrets(Path filePath, String content, String[] lines) {
        List<SecurityVulnerability> vulnerabilities = new ArrayList<>();

        // Hardcoded passwords
        Matcher pwdMatcher = HARDCODED_PASSWORD.matcher(content);
        if (pwdMatcher.find()) {
            int lineNumber = getLineNumber(content, pwdMatcher.start());
            vulnerabilities.add(SecurityVulnerability.builder()
                .id(UUID.randomUUID().toString())
                .title("Hardcoded Password")
                .description("Password hardcoded in source code")
                .severity(VulnerabilitySeverity.CRITICAL)
                .category(VulnerabilityCategory.SENSITIVE_DATA_EXPOSURE)
                .filePath(filePath.toString())
                .startLine(lineNumber)
                .endLine(lineNumber)
                .codeSnippet("[REDACTED - Contains sensitive data]")
                .cvssScore(9.1)
                .exploitabilityScore(8.0)
                .impactScore(9.5)
                .recommendation("Store passwords in environment variables or secure vaults (HashiCorp Vault, AWS Secrets Manager)")
                .estimatedEffortHours(3)
                .fixPriority("IMMEDIATE")
                .cweId("CWE-798")
                .owaspCategory("A07:2021")
                .reviewStatus("PENDING")
                .build());
        }

        // Hardcoded API keys
        Matcher apiMatcher = HARDCODED_API_KEY.matcher(content);
        if (apiMatcher.find()) {
            int lineNumber = getLineNumber(content, apiMatcher.start());
            vulnerabilities.add(SecurityVulnerability.builder()
                .id(UUID.randomUUID().toString())
                .title("Hardcoded API Key")
                .description("API key or secret hardcoded in source code")
                .severity(VulnerabilitySeverity.CRITICAL)
                .category(VulnerabilityCategory.SENSITIVE_DATA_EXPOSURE)
                .filePath(filePath.toString())
                .startLine(lineNumber)
                .endLine(lineNumber)
                .codeSnippet("[REDACTED - Contains sensitive API key]")
                .cvssScore(9.0)
                .exploitabilityScore(8.0)
                .impactScore(9.0)
                .recommendation("Store API keys in environment variables or configuration files excluded from version control")
                .estimatedEffortHours(2)
                .fixPriority("IMMEDIATE")
                .cweId("CWE-798")
                .owaspCategory("A02:2021")
                .reviewStatus("PENDING")
                .build());
        }

        return vulnerabilities;
    }

    /**
     * Detect XSS vulnerabilities
     */
    private List<SecurityVulnerability> detectXSSVulnerabilities(Path filePath, String content, String[] lines) {
        List<SecurityVulnerability> vulnerabilities = new ArrayList<>();

        Matcher xssMatcher = XSS_VULNERABILITY.matcher(content);
        if (xssMatcher.find()) {
            int lineNumber = getLineNumber(content, xssMatcher.start());
            vulnerabilities.add(SecurityVulnerability.builder()
                .id(UUID.randomUUID().toString())
                .title("Cross-Site Scripting (XSS) Vulnerability")
                .description("Potential XSS vulnerability: user input written to response without sanitization")
                .severity(VulnerabilitySeverity.HIGH)
                .category(VulnerabilityCategory.XSS)
                .filePath(filePath.toString())
                .startLine(lineNumber)
                .endLine(lineNumber)
                .codeSnippet(lines[Math.max(0, lineNumber - 1)])
                .cvssScore(7.1)
                .exploitabilityScore(7.0)
                .impactScore(7.5)
                .recommendation("Sanitize user input before output. Use OWASP Java Encoder or similar libraries")
                .estimatedEffortHours(3)
                .fixPriority("HIGH")
                .cweId("CWE-79")
                .owaspCategory("A03:2021")
                .reviewStatus("PENDING")
                .build());
        }

        return vulnerabilities;
    }

    /**
     * Detect SSRF vulnerabilities
     */
    private List<SecurityVulnerability> detectSSRFVulnerabilities(Path filePath, String content, String[] lines) {
        List<SecurityVulnerability> vulnerabilities = new ArrayList<>();

        Matcher ssrfMatcher = SSRF_VULNERABILITY.matcher(content);
        if (ssrfMatcher.find()) {
            int lineNumber = getLineNumber(content, ssrfMatcher.start());
            vulnerabilities.add(SecurityVulnerability.builder()
                .id(UUID.randomUUID().toString())
                .title("Server-Side Request Forgery (SSRF)")
                .description("Potential SSRF vulnerability: URL constructed from user input")
                .severity(VulnerabilitySeverity.HIGH)
                .category(VulnerabilityCategory.SSRF)
                .filePath(filePath.toString())
                .startLine(lineNumber)
                .endLine(lineNumber)
                .codeSnippet(lines[Math.max(0, lineNumber - 1)])
                .cvssScore(8.6)
                .exploitabilityScore(7.5)
                .impactScore(9.0)
                .recommendation("Validate URLs against a whitelist and use DNS resolution validation")
                .estimatedEffortHours(4)
                .fixPriority("HIGH")
                .cweId("CWE-918")
                .owaspCategory("A10:2021")
                .reviewStatus("PENDING")
                .build());
        }

        return vulnerabilities;
    }

    /**
     * Detect configuration issues
     */
    private List<SecurityVulnerability> detectConfigurationIssues(Path filePath, String content, String[] lines) {
        List<SecurityVulnerability> vulnerabilities = new ArrayList<>();

        // XXE vulnerability in XML parsing
        Matcher xxeMatcher = XXE_VULNERABILITY.matcher(content);
        if (xxeMatcher.find()) {
            int lineNumber = getLineNumber(content, xxeMatcher.start());
            vulnerabilities.add(SecurityVulnerability.builder()
                .id(UUID.randomUUID().toString())
                .title("XML External Entity (XXE) Vulnerability")
                .description("XML parser not configured securely, vulnerable to XXE attacks")
                .severity(VulnerabilitySeverity.HIGH)
                .category(VulnerabilityCategory.SECURITY_MISCONFIGURATION)
                .filePath(filePath.toString())
                .startLine(lineNumber)
                .endLine(lineNumber)
                .codeSnippet(lines[Math.max(0, lineNumber - 1)])
                .cvssScore(8.2)
                .exploitabilityScore(7.0)
                .impactScore(8.5)
                .recommendation("Disable external entity processing: factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true)")
                .estimatedEffortHours(2)
                .fixPriority("HIGH")
                .cweId("CWE-611")
                .owaspCategory("A05:2021")
                .reviewStatus("PENDING")
                .build());
        }

        return vulnerabilities;
    }

    private boolean isJavaFile(Path file) {
        return file.toString().endsWith(".java");
    }

    private int getLineNumber(String content, int position) {
        if (content == null || position < 0) return 1;
        
        String beforePosition = content.substring(0, Math.min(position, content.length()));
        int lines = 1;
        for (char c : beforePosition.toCharArray()) {
            if (c == '\n') lines++;
        }
        return lines;
    }
}

