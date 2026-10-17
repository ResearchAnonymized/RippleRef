package ai.refact.engine.security;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * Model representing a security fix for a vulnerability.
 */
@Data
@Builder
public class SecurityFix {
    private String id;
    private String vulnerabilityId;
    private String fixType;
    private String originalCode;
    private String fixedCode;
    private String description;
    private String explanation;
    private String riskLevel; // LOW, MEDIUM, HIGH
    private boolean requiresValidation;
    private List<String> manualSteps;
    private List<String> additionalImports;
    private List<String> additionalDependencies;
    private String status; // PENDING, APPLIED, VERIFIED, FAILED, PENDING_MANUAL
    private String errorMessage;
    
    /**
     * Create a fix that is not applicable.
     */
    public static SecurityFix notApplicable(String vulnerabilityId, String reason) {
        return SecurityFix.builder()
            .vulnerabilityId(vulnerabilityId)
            .fixType("NOT_APPLICABLE")
            .description(reason)
            .status("NOT_APPLICABLE")
            .build();
    }
    
    /**
     * Create an error fix result.
     */
    public static SecurityFix error(String vulnerabilityId, String errorMessage) {
        return SecurityFix.builder()
            .vulnerabilityId(vulnerabilityId)
            .fixType("ERROR")
            .errorMessage(errorMessage)
            .status("FAILED")
            .build();
    }
}

