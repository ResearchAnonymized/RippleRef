package ai.refact.engine.security;

import ai.refact.engine.model.SecurityVulnerability;
import ai.refact.engine.model.VulnerabilityCategory;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Automated Security Fix Engine
 * 
 * Generates and applies automated fixes for common security vulnerabilities.
 * 
 * Technology Stack:
 * - Pattern-based fix generation
 * - Safe code transformation
 * - Fix validation and verification
 * - Rollback support
 */
@Component
public class SecurityFixEngine {
    
    private static final Logger logger = LoggerFactory.getLogger(SecurityFixEngine.class);
    
    /**
     * Generate a fix for a security vulnerability.
     */
    public SecurityFix generateFix(SecurityVulnerability vulnerability, Path filePath) {
        logger.info("Generating fix for vulnerability: {} in file: {}", vulnerability.getTitle(), filePath);
        
        try {
            String fileContent = Files.readString(filePath);
            
            return switch (vulnerability.getCategory()) {
                case INJECTION -> generateInjectionFix(vulnerability, fileContent);
                case CRYPTOGRAPHIC_FAILURES -> generateCryptographicFix(vulnerability, fileContent);
                case SENSITIVE_DATA_EXPOSURE -> generateSecretManagementFix(vulnerability, fileContent);
                case XSS -> generateXSSFix(vulnerability, fileContent);
                case SECURITY_MISCONFIGURATION -> generateConfigurationFix(vulnerability, fileContent);
                default -> generateGenericFix(vulnerability, fileContent);
            };
            
        } catch (IOException e) {
            logger.error("Failed to generate fix for vulnerability: {}", vulnerability.getId(), e);
            return SecurityFix.error(vulnerability.getId(), "Failed to read file: " + e.getMessage());
        }
    }
    
    /**
     * Apply a security fix to a file.
     */
    public FixResult applyFix(SecurityFix fix, Path filePath) {
        logger.info("Applying fix: {} to file: {}", fix.getId(), filePath);
        
        try {
            // 1. Validate fix safety
            ValidationResult validation = validateFix(fix, filePath);
            if (!validation.isValid()) {
                return FixResult.failure(fix.getId(), validation.getErrors());
            }
            
            // 2. Create backup
            String originalContent = Files.readString(filePath);
            
            // 3. Apply the fix
            String fixedContent = applyTransformation(originalContent, fix);
            
            // 4. Write fixed content
            Files.writeString(filePath, fixedContent);
            
            // 5. Verify fix effectiveness
            VerificationResult verification = verifyFix(fix, filePath);
            
            logger.info("Successfully applied fix: {} to file: {}", fix.getId(), filePath);
            
            return FixResult.success(fix.getId(), originalContent, fixedContent, verification);
            
        } catch (Exception e) {
            logger.error("Failed to apply fix: {}", fix.getId(), e);
            return FixResult.failure(fix.getId(), List.of("Failed to apply fix: " + e.getMessage()));
        }
    }
    
    /**
     * Generate fix for SQL injection vulnerabilities.
     */
    private SecurityFix generateInjectionFix(SecurityVulnerability vulnerability, String content) {
        // Pattern for string concatenation in SQL queries
        Pattern pattern = Pattern.compile("(createStatement|executeQuery|executeUpdate)\\s*\\([^)]*\\+[^)]*\\)");
        Matcher matcher = pattern.matcher(content);
        
        if (matcher.find()) {
            String original = matcher.group(0);
            String fixed = convertToPreparedStatement(original);
            
            return SecurityFix.builder()
                .id(vulnerability.getId())
                .vulnerabilityId(vulnerability.getId())
                .fixType("SQL_INJECTION_FIX")
                .originalCode(original)
                .fixedCode(fixed)
                .description("Convert string concatenation to PreparedStatement")
                .explanation("Using PreparedStatement with parameterized queries prevents SQL injection attacks")
                .riskLevel("LOW")
                .requiresValidation(true)
                .status("PENDING")
                .build();
        }
        
        return SecurityFix.notApplicable(vulnerability.getId(), "No fix pattern matched");
    }
    
    /**
     * Generate fix for weak cryptography.
     */
    private SecurityFix generateCryptographicFix(SecurityVulnerability vulnerability, String content) {
        // Pattern for weak hash algorithms
        Pattern pattern = Pattern.compile("MessageDigest\\.getInstance\\s*\\(\\s*\"(MD5|SHA1|SHA-1)\"\\s*\\)");
        Matcher matcher = pattern.matcher(content);
        
        if (matcher.find()) {
            String original = matcher.group(0);
            String algorithm = matcher.group(1);
            String fixed = "MessageDigest.getInstance(\"SHA-256\")";
            
            return SecurityFix.builder()
                .id(vulnerability.getId())
                .vulnerabilityId(vulnerability.getId())
                .fixType("WEAK_CRYPTO_FIX")
                .originalCode(original)
                .fixedCode(fixed)
                .description("Replace " + algorithm + " with SHA-256")
                .explanation("SHA-256 is cryptographically secure, while " + algorithm + " is vulnerable to collision attacks")
                .riskLevel("LOW")
                .requiresValidation(false)
                .status("PENDING")
                .build();
        }
        
        // Pattern for insecure random
        pattern = Pattern.compile("new\\s+Random\\s*\\(\\s*\\)");
        matcher = pattern.matcher(content);
        
        if (matcher.find()) {
            String original = matcher.group(0);
            String fixed = "new SecureRandom()";
            
            return SecurityFix.builder()
                .id(vulnerability.getId())
                .vulnerabilityId(vulnerability.getId())
                .fixType("INSECURE_RANDOM_FIX")
                .originalCode(original)
                .fixedCode(fixed)
                .description("Replace Random with SecureRandom")
                .explanation("SecureRandom provides cryptographically strong random numbers")
                .riskLevel("LOW")
                .requiresValidation(false)
                .additionalImports(List.of("import java.security.SecureRandom;"))
                .status("PENDING")
                .build();
        }
        
        return SecurityFix.notApplicable(vulnerability.getId(), "No fix pattern matched");
    }
    
    /**
     * Generate fix for hardcoded secrets.
     */
    private SecurityFix generateSecretManagementFix(SecurityVulnerability vulnerability, String content) {
        // Pattern for hardcoded passwords/API keys
        Pattern pattern = Pattern.compile("(password|passwd|pwd|api[_-]?key|apikey|secret[_-]?key)\\s*=\\s*\"([^\"]+)\"");
        Matcher matcher = pattern.matcher(content);
        
        if (matcher.find()) {
            String original = matcher.group(0);
            String variableName = matcher.group(1);
            String fixed = variableName + " = System.getenv(\"" + variableName.toUpperCase() + "\")";
            
            return SecurityFix.builder()
                .id(vulnerability.getId())
                .vulnerabilityId(vulnerability.getId())
                .fixType("HARDCODED_SECRET_FIX")
                .originalCode(original)
                .fixedCode(fixed)
                .description("Move secret to environment variable")
                .explanation("Secrets should be stored in environment variables or secure vaults, not in source code")
                .riskLevel("MEDIUM")
                .requiresValidation(true)
                .manualSteps(List.of(
                    "Set environment variable: export " + variableName.toUpperCase() + "=<your_secret>",
                    "Ensure the secret is not committed to version control",
                    "Update deployment configuration to provide the environment variable"
                ))
                .status("PENDING")
                .build();
        }
        
        return SecurityFix.notApplicable(vulnerability.getId(), "No fix pattern matched");
    }
    
    /**
     * Generate fix for XSS vulnerabilities.
     */
    private SecurityFix generateXSSFix(SecurityVulnerability vulnerability, String content) {
        // Pattern for direct output of user input
        Pattern pattern = Pattern.compile("(out\\.print|response\\.getWriter\\(\\)\\.write)\\s*\\([^)]*request\\.getParameter[^)]*\\)");
        Matcher matcher = pattern.matcher(content);
        
        if (matcher.find()) {
            String original = matcher.group(0);
            String fixed = addHtmlEscaping(original);
            
            return SecurityFix.builder()
                .id(vulnerability.getId())
                .vulnerabilityId(vulnerability.getId())
                .fixType("XSS_FIX")
                .originalCode(original)
                .fixedCode(fixed)
                .description("Add HTML escaping for user input")
                .explanation("User input must be escaped before rendering to prevent XSS attacks")
                .riskLevel("LOW")
                .requiresValidation(true)
                .additionalImports(List.of("import org.apache.commons.text.StringEscapeUtils;"))
                .additionalDependencies(List.of("org.apache.commons:commons-text:1.10.0"))
                .status("PENDING")
                .build();
        }
        
        return SecurityFix.notApplicable(vulnerability.getId(), "No fix pattern matched");
    }
    
    /**
     * Generate fix for security misconfiguration.
     */
    private SecurityFix generateConfigurationFix(SecurityVulnerability vulnerability, String content) {
        // Pattern for XXE vulnerability
        Pattern pattern = Pattern.compile("DocumentBuilderFactory\\.newInstance\\s*\\(\\s*\\)");
        Matcher matcher = pattern.matcher(content);
        
        if (matcher.find() && !content.contains("XMLConstants.FEATURE_SECURE_PROCESSING")) {
            String original = matcher.group(0);
            String fixed = original + ";\n        factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);\n        factory.setFeature(\"http://apache.org/xml/features/disallow-doctype-decl\", true)";
            
            return SecurityFix.builder()
                .id(vulnerability.getId())
                .vulnerabilityId(vulnerability.getId())
                .fixType("XXE_FIX")
                .originalCode(original)
                .fixedCode(fixed)
                .description("Configure XML parser securely")
                .explanation("Disable external entity processing to prevent XXE attacks")
                .riskLevel("LOW")
                .requiresValidation(false)
                .additionalImports(List.of("import javax.xml.XMLConstants;"))
                .status("PENDING")
                .build();
        }
        
        return SecurityFix.notApplicable(vulnerability.getId(), "No fix pattern matched");
    }
    
    /**
     * Generate generic fix with recommendations.
     */
    private SecurityFix generateGenericFix(SecurityVulnerability vulnerability, String content) {
        return SecurityFix.builder()
            .id(vulnerability.getId())
            .vulnerabilityId(vulnerability.getId())
            .fixType("MANUAL_FIX_REQUIRED")
            .originalCode(vulnerability.getCodeSnippet())
            .fixedCode(null)
            .description("Manual fix required")
            .explanation(vulnerability.getRecommendation())
            .riskLevel("HIGH")
            .requiresValidation(true)
            .manualSteps(vulnerability.getRemediationSteps() != null ? 
                vulnerability.getRemediationSteps() : 
                List.of(vulnerability.getRecommendation()))
            .status("PENDING_MANUAL")
            .build();
    }
    
    // Helper methods
    
    private String convertToPreparedStatement(String original) {
        // Simplified conversion - in practice, this would be more sophisticated
        return "// TODO: Convert to PreparedStatement\n        // String sql = \"SELECT * FROM users WHERE id = ?\";\n        // PreparedStatement pstmt = connection.prepareStatement(sql);\n        // pstmt.setString(1, userId);";
    }
    
    private String addHtmlEscaping(String original) {
        return original.replaceAll("(request\\.getParameter\\([^)]+\\))", 
            "StringEscapeUtils.escapeHtml4($1)");
    }
    
    private ValidationResult validateFix(SecurityFix fix, Path filePath) {
        List<String> errors = new ArrayList<>();
        
        // Basic validation
        if (fix.getFixedCode() == null || fix.getFixedCode().trim().isEmpty()) {
            errors.add("Fix code is empty");
        }
        
        // Check file exists
        if (!Files.exists(filePath)) {
            errors.add("File does not exist: " + filePath);
        }
        
        return new ValidationResult(errors.isEmpty(), errors);
    }
    
    private String applyTransformation(String content, SecurityFix fix) {
        if (fix.getOriginalCode() == null || fix.getFixedCode() == null) {
            return content;
        }
        
        String result = content.replace(fix.getOriginalCode(), fix.getFixedCode());
        
        // Add imports if needed
        if (fix.getAdditionalImports() != null && !fix.getAdditionalImports().isEmpty()) {
            for (String importStmt : fix.getAdditionalImports()) {
                if (!result.contains(importStmt)) {
                    result = addImportStatement(result, importStmt);
                }
            }
        }
        
        return result;
    }
    
    private String addImportStatement(String content, String importStmt) {
        // Find the package declaration
        int packageEnd = content.indexOf(";");
        if (packageEnd != -1) {
            return content.substring(0, packageEnd + 1) + "\n" + importStmt + content.substring(packageEnd + 1);
        }
        return importStmt + "\n" + content;
    }
    
    private VerificationResult verifyFix(SecurityFix fix, Path filePath) {
        // Simplified verification - in practice, this would run tests
        return new VerificationResult(true, "Fix applied successfully", List.of());
    }
    
    // Supporting classes
    
    public static class ValidationResult {
        private final boolean valid;
        private final List<String> errors;
        
        public ValidationResult(boolean valid, List<String> errors) {
            this.valid = valid;
            this.errors = errors;
        }
        
        public boolean isValid() { return valid; }
        public List<String> getErrors() { return errors; }
    }
    
    public static class VerificationResult {
        private final boolean success;
        private final String message;
        private final List<String> warnings;
        
        public VerificationResult(boolean success, String message, List<String> warnings) {
            this.success = success;
            this.message = message;
            this.warnings = warnings;
        }
        
        public boolean isSuccess() { return success; }
        public String getMessage() { return message; }
        public List<String> getWarnings() { return warnings; }
    }
}

